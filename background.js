// NaughtyBits Background Service Worker v3.0.0
// Central hub: memo storage, process registry, MAIN world injection,
// Native Messaging bridge to the local host process, and CDP injection routing.
//
// ARCHITECTURE:
// Extension <-> background.js <-> Native Messaging <-> naughtybits_host.exe
//                                                        (runs as logged-in user)
//                                                        |
//                                                        v
//                                                   CDP (localhost:9222)
//                                                        |
//                                                        v
//                                                   Chrome tab (Runtime.evaluate)
//
// No ports. No HTTP. No tokens. OS-level auth via Chrome Native Messaging.
// Chrome must be launched with: --remote-debugging-port=9222

const NATIVE_HOST_NAME = 'com.naughtybits.host';

// ============================================================
// STATE
// ============================================================
let memos = [];
let processes = [];
let nextMemoId = 1;
let nextProcessId = 1;
let serviceApproved = false;
let serviceConnected = false;
let nativePort = null;  // chrome.runtime.Port to the native host
let pendingCallbacks = new Map();  // id -> callback for async native responses
let nextCallbackId = 1;
let stateLoaded = false;  // gate: don't inject until storage is loaded
let cdpAvailable = false; // true if localhost:9222 responded (browser launched with --remote-debugging-port=9222)

// ============================================================
// STORAGE
// ============================================================
async function loadState() {
  const result = await chrome.storage.local.get([
    'nb_memos', 'nb_processes', 'nb_nextMemoId', 'nb_nextProcessId',
    'nb_service_approved'
  ]);
  memos = result.nb_memos || [];
  processes = result.nb_processes || [];
  nextMemoId = result.nb_nextMemoId || (memos.length > 0 ? Math.max(...memos.map(m => m.id)) + 1 : 1);
  nextProcessId = result.nb_nextProcessId || (processes.length > 0 ? Math.max(...processes.map(p => p.id)) + 1 : 1);
  serviceApproved = result.nb_service_approved || false;
  stateLoaded = true;
  console.log(`[NB] Loaded: ${memos.length} memos, ${processes.length} procs, approved=${serviceApproved}`);
}

async function saveState() {
  await chrome.storage.local.set({
    nb_memos: memos,
    nb_processes: processes,
    nb_nextMemoId: nextMemoId,
    nb_nextProcessId: nextProcessId,
    nb_service_approved: serviceApproved
  });
}

// ============================================================
// CDP AVAILABILITY CHECK
// Extension-side check: tries to fetch localhost:9222/json to see
// if the browser was launched with --remote-debugging-port=9222.
// Result is stored in cdpAvailable and exposed via nb_cdp_status message.
// ============================================================
async function checkCdpAvailable() {
  try {
    const resp = await fetch('http://localhost:9222/json', { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      const targets = await resp.json();
      cdpAvailable = Array.isArray(targets);
      console.log(`[NB] CDP check: available (${targets.length} targets)`);
    } else {
      cdpAvailable = false;
      console.log('[NB] CDP check: port responded but not OK:', resp.status);
    }
  } catch (err) {
    cdpAvailable = false;
    console.log('[NB] CDP check: not available \u2014', err.message);
  }
  return cdpAvailable;
}

// ============================================================
// NATIVE MESSAGING BRIDGE
// Chrome manages the host process lifecycle. We just connect
// and send/receive JSON over the port. Auth is handled by the OS.
// ============================================================
function connectNativeHost() {
  if (nativePort) return true;

  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    serviceConnected = true;
    console.log('[NB] Connected to native host');

    nativePort.onMessage.addListener((msg) => {
      console.log('[NB] Native host response:', msg);

      // Route response to pending callback if it has a _cbId
      if (msg._cbId && pendingCallbacks.has(msg._cbId)) {
        const cb = pendingCallbacks.get(msg._cbId);
        pendingCallbacks.delete(msg._cbId);
        cb(msg);
      }
    });

    nativePort.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      console.log('[NB] Native host disconnected:', err ? err.message : 'clean');
      nativePort = null;
      serviceConnected = false;

      // Reject any pending callbacks
      for (const [id, cb] of pendingCallbacks) {
        cb({ ok: false, error: 'Native host disconnected' });
      }
      pendingCallbacks.clear();
    });

    return true;
  } catch (err) {
    console.error('[NB] Failed to connect native host:', err);
    nativePort = null;
    serviceConnected = false;
    return false;
  }
}

// Send a message to the native host and get a response via callback
function sendToHost(message) {
  return new Promise((resolve) => {
    if (!serviceApproved) {
      resolve({ ok: false, error: 'Execution not approved. Approve in the NaughtyBits popup.' });
      return;
    }

    if (!connectNativeHost()) {
      resolve({ ok: false, error: 'Cannot connect to NaughtyBits host. Run install.bat first.' });
      return;
    }

    const cbId = nextCallbackId++;
    message._cbId = cbId;

    pendingCallbacks.set(cbId, (response) => {
      delete response._cbId;
      resolve(response);
    });

    try {
      nativePort.postMessage(message);
    } catch (err) {
      pendingCallbacks.delete(cbId);
      resolve({ ok: false, error: 'Failed to send to host: ' + err.message });
    }

    // Timeout after 30s
    setTimeout(() => {
      if (pendingCallbacks.has(cbId)) {
        pendingCallbacks.delete(cbId);
        resolve({ ok: false, error: 'Host response timeout (30s)' });
      }
    }, 30000);
  });
}

// Check if the host is reachable
async function checkHostHealth() {
  if (!serviceApproved) {
    serviceConnected = false;
    return false;
  }

  const result = await sendToHost({ op: 'ping' });
  serviceConnected = result.ok && result.op === 'pong';
  return serviceConnected;
}

// ============================================================
// MEMO OPERATIONS
// ============================================================
function addMemo(text, tags = []) {
  const memo = {
    id: nextMemoId++,
    text: text.trim(),
    created: new Date().toISOString(),
    tags
  };
  memos.push(memo);
  saveState();
  console.log(`[NB] Memo #${memo.id} added`);
  return memo;
}

function deleteMemo(id) {
  const idx = memos.findIndex(m => m.id === id);
  if (idx === -1) return { ok: false, error: `Memo #${id} not found` };
  const removed = memos.splice(idx, 1)[0];
  saveState();
  return { ok: true, memo: removed };
}

function getMemos() { return [...memos]; }

function searchMemos(query) {
  const q = query.toLowerCase();
  return memos.filter(m =>
    m.text.toLowerCase().includes(q) ||
    m.tags.some(t => t.toLowerCase().includes(q))
  );
}

// ============================================================
// PROCESS REGISTRY
// ============================================================
async function spawnProcess(command) {
  const result = await sendToHost({ op: 'spawn', command });

  const proc = {
    id: nextProcessId++,
    pid: result.ok ? (result.pid || null) : null,
    command,
    status: result.ok ? (result.status || 'running') : 'failed',
    started: new Date().toISOString(),
    ended: result.ok ? null : new Date().toISOString(),
    output: result.ok ? '' : (result.error || 'Unknown error'),
    hostId: result.ok ? result.id : null  // the ID on the native host side
  };
  processes.push(proc);
  saveState();

  return result.ok
    ? { ok: true, process: proc }
    : { ok: false, process: proc, error: result.error };
}

async function execCommand(command) {
  const result = await sendToHost({ op: 'exec', command });
  return result;
}

async function killProcessById(id) {
  const proc = processes.find(p => p.id === id);
  if (!proc) return { ok: false, error: `Process #${id} not found` };

  // Tell the native host to kill it
  if (proc.hostId && serviceConnected) {
    await sendToHost({ op: 'kill', id: proc.hostId });
  }

  proc.status = 'killed';
  proc.ended = new Date().toISOString();
  saveState();
  return { ok: true, process: proc };
}

function getProcesses() { return [...processes]; }
function getRunningProcesses() { return processes.filter(p => p.status === 'running'); }

// ============================================================
// CDPINJECT \u2014 Chrome DevTools Protocol injection via native host
//
// The native host connects to Chrome's CDP endpoint (localhost:9222),
// finds the target tab by URL or title, and uses Runtime.evaluate
// to inject text into the input element. Works regardless of
// foreground/background state. No SendInput, no keystrokes.
//
// Chrome must be launched with: --remote-debugging-port=9222
// ============================================================
async function cdpinject(text, tabId) {
  console.log(`[NB] cdpinject: getting tab info for tab ${tabId}`);

  // Get tab info so the host can find the right CDP target
  const tab = await chrome.tabs.get(tabId);

  const hostMessage = {
    op: 'cdpinject',
    text: text,
    pageTitle: tab.title || '',
    tabUrl: tab.url || '',
    autoSubmit: true,
    cdpPort: 9222
  };

  console.log('[NB] cdpinject: sending to native host:', hostMessage);
  const result = await sendToHost(hostMessage);
  console.log('[NB] cdpinject: host response:', result);
  return result;
}

// ============================================================
// BRIEFING BUILDER
// Every new instance gets the full man page + all memos + process state.
// No conditions. Always. Every time.
// ============================================================
function buildBriefing() {
  const L = [];

  L.push('=== NAUGHTYBITS v3.0 SYSTEM BRIEFING ===');
  L.push('');
  L.push('You have NaughtyBits installed \u2014 a persistent memory and process management companion extension.');
  L.push('It watches your output text in real time. When you write a /naughtybits command in your response,');
  L.push('the extension intercepts it and executes it immediately.');
  L.push('');

  // ---- MAN PAGE ----
  L.push('## COMMAND REFERENCE (MAN PAGE)');
  L.push('');
  L.push('All commands use the prefix: /naughtybits');
  L.push('Write them on their own line in your response. The extension parses them from your output.');
  L.push('');
  L.push('MEMO COMMANDS:');
  L.push('  /naughtybits addmemo <text>                \u2014 Save a memo for future sessions');
  L.push('  /naughtybits addmemo [tag1,tag2] <text>    \u2014 Save a memo with tags');
  L.push('  /naughtybits delmemo <id>                   \u2014 Delete a memo by its numeric ID');
  L.push('  /naughtybits listmemos                      \u2014 Dump all memos');
  L.push('  /naughtybits searchmemos <query>            \u2014 Search memos by text or tag');
  L.push('');
  L.push('PROCESS COMMANDS (requires NaughtyBits host service):');
  L.push('  /naughtybits exec <command>                 \u2014 Execute a command and return output');
  L.push('  /naughtybits spawn <command>                \u2014 Spawn a long-running process');
  L.push('  /naughtybits kill <id>                      \u2014 Kill a tracked process');
  L.push('  /naughtybits ps                             \u2014 List all tracked processes');
  L.push('');

  // ---- SERVICE STATUS ----
  L.push('## HOST SERVICE STATUS');
  L.push(`  Connected: ${serviceConnected ? 'YES' : 'NO \u2014 the NaughtyBits host service is not running or not installed'}`);
  L.push(`  Approved:  ${serviceApproved ? 'YES' : 'NO \u2014 user must approve in the NaughtyBits popup'}`);
  L.push('  NOTE: exec/spawn/kill require both: host connected + approved.');
  L.push('  Memo commands work regardless of host status (stored in extension).');
  L.push('');

  // ---- RULES ----
  L.push('## OPERATING RULES');
  L.push('');
  L.push('1. ALWAYS save memos about what you are working on. Every action, decision, bug, design choice.');
  L.push('2. Treat memos as your personal work journal \u2014 the next instance reads these to get up to speed.');
  L.push('3. Be SPECIFIC: file names, function names, error messages, architectural decisions, next steps.');
  L.push('4. When you finish a task or hit a stopping point, write a summary memo.');
  L.push('5. On session start, READ the memos below and pick up where the last instance left off.');
  L.push('6. Clean up stale memos (delmemo) to keep the list focused and relevant.');
  L.push('7. Commands go on their own line in your response. The extension parses and executes them.');
  L.push('8. You do NOT need permission to save memos. Just do it.');
  L.push('9. Acknowledge this briefing, summarize current project state from the memos,');
  L.push('   and tell the user you are ready to continue.');
  L.push('');

  // ---- CURRENT MEMOS ----
  if (memos.length > 0) {
    L.push(`## CURRENT MEMOS (${memos.length})`);
    L.push('');
    memos.forEach(m => {
      const tags = m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : '';
      const date = new Date(m.created).toLocaleString();
      L.push(`  #${m.id} (${date})${tags}: ${m.text}`);
    });
    L.push('');
  } else {
    L.push('## CURRENT MEMOS: None yet.');
    L.push('This is a fresh start. Begin saving memos about the current project immediately.');
    L.push('');
  }

  // ---- PROCESSES ----
  const running = getRunningProcesses();
  if (running.length > 0) {
    L.push(`## RUNNING PROCESSES (${running.length})`);
    L.push('');
    running.forEach(p => {
      L.push(`  #${p.id} [PID: ${p.pid || '?'}] ${p.command} \u2014 since ${new Date(p.started).toLocaleString()}`);
    });
    L.push('');
  }

  if (processes.length > 0) {
    L.push('## PROCESS HISTORY (last 10)');
    L.push('');
    processes.slice(-10).forEach(p => {
      L.push(`  #${p.id} [${p.status}] ${p.command}`);
    });
    L.push('');
  }

  L.push("Pretty soon the only thing you won't remember is what went on before NaughtyBits.");
  L.push('');
  L.push('=== END BRIEFING ===');

  return L.join('\n');
}

// ============================================================
// MAIN WORLD INJECTION
// ============================================================
async function injectBriefingIntoTab(tabId) {
  // Wait for state to be loaded from storage before building the briefing
  if (!stateLoaded) {
    console.log('[NB] State not loaded yet, waiting...');
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (stateLoaded) { clearInterval(check); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 5000); // max 5s wait
    });
  }

  const briefing = buildBriefing();
  console.log(`[NB] Injecting briefing into tab ${tabId} (${briefing.length} chars)`);

  // Try CDP injection first if host is connected \u2014 works even in background
  if (serviceApproved && serviceConnected) {
    console.log('[NB] Attempting CDP injection (via native host) first...');
    const cdpResult = await cdpinject(briefing, tabId);
    if (cdpResult && cdpResult.ok) {
      console.log('[NB] CDP injection succeeded');
      return { ok: true, method: 'cdpinject' };
    }
    console.log('[NB] CDP injection failed, falling back to MAIN world injection:', cdpResult);
  }

  // Fallback: MAIN world injection via chrome.scripting.executeScript
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (text) => {
        console.log('[NB-MAIN] Injector running, text length:', text.length);

        function findInput() {
          return document.querySelector('#ask-input')
              || document.querySelector('[data-lexical-editor="true"]')
              || document.querySelector('div[contenteditable="true"][role="textbox"]')
              || document.querySelector('[role="textbox"][contenteditable="true"]')
              || document.querySelector('div[contenteditable="true"]');
        }

        async function tryInject() {
          const input = findInput();
          if (!input) {
            console.log('[NB-MAIN] No input element found');
            return false;
          }
          console.log('[NB-MAIN] Found input:', input.id, input.tagName, input.className.substring(0, 60));

          const existing = input.textContent.trim();
          if (existing.length > 0) {
            console.log('[NB-MAIN] Input not empty, user may be typing. Skipping injection.');
            return true;
          }

          input.focus();
          await new Promise(r => setTimeout(r, 100));

          let injected = false;

          // Strategy 1: Synthetic paste
          if (!injected) {
            try {
              const dt = new DataTransfer();
              dt.setData('text/plain', text);
              const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true, cancelable: true, clipboardData: dt
              });
              input.dispatchEvent(pasteEvent);
              await new Promise(r => setTimeout(r, 200));
              if (input.textContent.trim().length > 0) {
                injected = true;
                console.log('[NB-MAIN] Strategy 1 (synthetic paste) succeeded');
              }
            } catch (e) { console.log('[NB-MAIN] Strategy 1 failed:', e.message); }
          }

          // Strategy 2: InputEvent insertText
          if (!injected) {
            try {
              const sel = window.getSelection();
              sel.selectAllChildren(input);
              sel.collapseToStart();
              input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
              input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: false, inputType: 'insertText', data: text }));
              await new Promise(r => setTimeout(r, 200));
              if (input.textContent.trim().length > 0) {
                injected = true;
                console.log('[NB-MAIN] Strategy 2 (InputEvent insertText) succeeded');
              }
            } catch (e) { console.log('[NB-MAIN] Strategy 2 failed:', e.message); }
          }

          // Strategy 3: execCommand insertText
          if (!injected) {
            try {
              input.focus();
              document.execCommand('selectAll', false, null);
              document.execCommand('insertText', false, text);
              await new Promise(r => setTimeout(r, 200));
              if (input.textContent.trim().length > 0) {
                injected = true;
                console.log('[NB-MAIN] Strategy 3 (execCommand insertText) succeeded');
              }
            } catch (e) { console.log('[NB-MAIN] Strategy 3 failed:', e.message); }
          }

          // Strategy 4: insertFromPaste via beforeinput
          if (!injected) {
            try {
              const pasteInput = new InputEvent('beforeinput', {
                bubbles: true, cancelable: true, inputType: 'insertFromPaste', data: text,
                dataTransfer: (() => { const dt = new DataTransfer(); dt.setData('text/plain', text); return dt; })()
              });
              input.dispatchEvent(pasteInput);
              await new Promise(r => setTimeout(r, 200));
              if (input.textContent.trim().length > 0) {
                injected = true;
                console.log('[NB-MAIN] Strategy 4 (insertFromPaste beforeinput) succeeded');
              }
            } catch (e) { console.log('[NB-MAIN] Strategy 4 failed:', e.message); }
          }

          // Strategy 5: Clipboard API + execCommand paste
          if (!injected) {
            try {
              await navigator.clipboard.writeText(text);
              input.focus();
              document.execCommand('paste');
              await new Promise(r => setTimeout(r, 300));
              if (input.textContent.trim().length > 0) {
                injected = true;
                console.log('[NB-MAIN] Strategy 5 (clipboard API + execCommand paste) succeeded');
              }
            } catch (e) { console.log('[NB-MAIN] Strategy 5 failed:', e.message); }
          }

          // Strategy 6: Keystroke simulation (truncated)
          if (!injected) {
            try {
              console.log('[NB-MAIN] Strategy 6: Simulating keystrokes (truncated)...');
              input.focus();
              const shortText = text.length > 500 ? text.substring(0, 500) + '\n[briefing truncated]' : text;
              for (const ch of shortText) {
                const opts = { key: ch, code: 'Key' + ch.toUpperCase(), bubbles: true, cancelable: true };
                input.dispatchEvent(new KeyboardEvent('keydown', opts));
                input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ch }));
                input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: false, inputType: 'insertText', data: ch }));
                input.dispatchEvent(new KeyboardEvent('keyup', opts));
              }
              await new Promise(r => setTimeout(r, 300));
              if (input.textContent.trim().length > 0) {
                injected = true;
                console.log('[NB-MAIN] Strategy 6 (keystroke simulation) succeeded');
              }
            } catch (e) { console.log('[NB-MAIN] Strategy 6 failed:', e.message); }
          }

          console.log('[NB-MAIN] Injection result:', injected, 'content length:', input.textContent.trim().length);

          if (!injected) {
            console.log('[NB-MAIN] ALL STRATEGIES FAILED.');
            return true;
          }

          // Submit
          let submitAttempts = 0;
          const submitInterval = setInterval(() => {
            const btn = document.querySelector('button[aria-label="Submit"]');
            if (btn && !btn.disabled) {
              console.log('[NB-MAIN] Submit button enabled, clicking');
              btn.click();
              clearInterval(submitInterval);
            } else if (++submitAttempts >= 40) {
              console.log('[NB-MAIN] Submit button never enabled after 10s. Trying Enter key.');
              const inp = findInput();
              if (inp) {
                inp.focus();
                const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
                inp.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
                inp.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
                inp.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
              }
              clearInterval(submitInterval);
            }
          }, 250);

          return true;
        }

        async function runWithRetry() {
          if (await tryInject()) return;
          let attempts = 0;
          const retry = setInterval(async () => {
            if ((await tryInject()) || ++attempts >= 20) {
              if (attempts >= 20) console.log('[NB-MAIN] Gave up after 20 attempts');
              clearInterval(retry);
            }
          }, 1000);
        }
        runWithRetry();
      },
      args: [briefing]
    });
    return { ok: true, method: 'main_world' };
  } catch (err) {
    console.error('[NB] Injection failed:', err);
    return { ok: false, error: err.message };
  }
}

// ============================================================
// MESSAGE HANDLER
// ============================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action } = request;

  switch (action) {
    // --- Memos ---
    case 'nb_addmemo': {
      sendResponse({ ok: true, memo: addMemo(request.text, request.tags || []) });
      break;
    }
    case 'nb_delmemo': {
      sendResponse(deleteMemo(request.id));
      break;
    }
    case 'nb_listmemos': {
      sendResponse({ ok: true, memos: getMemos() });
      break;
    }
    case 'nb_searchmemos': {
      sendResponse({ ok: true, memos: searchMemos(request.query) });
      break;
    }

    // --- Process ops (async) ---
    case 'nb_exec': {
      execCommand(request.command).then(r => sendResponse(r));
      return true;
    }
    case 'nb_spawn': {
      spawnProcess(request.command).then(r => sendResponse(r));
      return true;
    }
    case 'nb_kill': {
      killProcessById(request.id).then(r => sendResponse(r));
      return true;
    }
    case 'nb_ps': {
      sendResponse({ ok: true, processes: getProcesses(), running: getRunningProcesses() });
      break;
    }

    // --- CDP injection (via native host -> CDP -> Runtime.evaluate) ---
    case 'nb_wminject':
    case 'nb_cdpinject': {
      const tabId = request.tabId || (sender.tab && sender.tab.id);
      if (!tabId) {
        sendResponse({ ok: false, error: 'No tab ID for cdpinject' });
        break;
      }
      cdpinject(request.text, tabId).then(r => sendResponse(r));
      return true;
    }

    // --- Service config ---
    case 'nb_approve_service': {
      serviceApproved = true;
      saveState();
      checkHostHealth().then(connected => {
        sendResponse({ ok: true, approved: true, connected });
      });
      return true;
    }
    case 'nb_revoke_service': {
      serviceApproved = false;
      if (nativePort) {
        nativePort.disconnect();
        nativePort = null;
      }
      serviceConnected = false;
      saveState();
      sendResponse({ ok: true, approved: false, connected: false });
      break;
    }
    case 'nb_service_status': {
      sendResponse({ ok: true, connected: serviceConnected, approved: serviceApproved });
      break;
    }
    case 'nb_service_check': {
      checkHostHealth().then(connected => {
        sendResponse({ ok: true, connected, approved: serviceApproved });
      });
      return true;
    }

    // --- Briefing ---
    case 'nb_inject_briefing': {
      if (sender.tab && sender.tab.id) {
        injectBriefingIntoTab(sender.tab.id).then(r => sendResponse(r));
      } else {
        sendResponse({ ok: false, error: 'No tab ID' });
      }
      return true;
    }
    case 'nb_get_briefing': {
      sendResponse({ ok: true, briefing: buildBriefing() });
      break;
    }

    // --- CDP status (for popup warning) ---
    case 'nb_cdp_status': {
      checkCdpAvailable().then(available => {
        sendResponse({ ok: true, cdpAvailable: available });
      });
      return true;
    }

    // --- State dump for popup ---
    case 'nb_get_state': {
      sendResponse({
        ok: true,
        memos: getMemos(),
        processes: getProcesses(),
        running: getRunningProcesses(),
        serviceApproved,
        serviceConnected,
        cdpAvailable
      });
      break;
    }

    default:
      sendResponse({ ok: false, error: `Unknown action: ${action}` });
  }
  return true;
});

// ============================================================
// INIT
// ============================================================
loadState().then(() => {
  if (serviceApproved) {
    checkHostHealth();
  }
  // Check CDP on startup so the popup can warn immediately
  checkCdpAvailable();
});
console.log('[NB] Background service worker v3.0.0 started');
