// NaughtyBits Popup v2.0.0 — Developer Dashboard

document.addEventListener('DOMContentLoaded', loadState);

document.getElementById('refreshBtn').addEventListener('click', loadState);
document.getElementById('checkBtn').addEventListener('click', checkService);
document.getElementById('approveBtn').addEventListener('click', toggleApproval);
document.getElementById('briefingBtn').addEventListener('click', toggleBriefing);
document.getElementById('clearMemosBtn').addEventListener('click', clearMemos);
document.getElementById('injectBtn').addEventListener('click', manualInject);

let currentlyApproved = false;

function loadState() {
  chrome.runtime.sendMessage({ action: 'nb_get_state' }, (response) => {
    if (!response || !response.ok) return;
    renderMemos(response.memos);
    renderProcesses(response.processes, response.running);
    currentlyApproved = response.serviceApproved;
    updateServiceUI(response.serviceConnected, response.serviceApproved);
  });
}

function checkService() {
  const label = document.getElementById('serviceLabel');
  label.textContent = 'Host: connecting...';

  chrome.runtime.sendMessage({ action: 'nb_service_check' }, (response) => {
    if (!response || !response.ok) {
      updateServiceUI(false, currentlyApproved);
      return;
    }
    currentlyApproved = response.approved;
    updateServiceUI(response.connected, response.approved);
  });
}

function updateServiceUI(connected, approved) {
  const dot = document.getElementById('serviceDot');
  const label = document.getElementById('serviceLabel');
  const btn = document.getElementById('approveBtn');
  const hint = document.getElementById('serviceHint');

  if (!approved) {
    dot.className = 'status-dot warning';
    label.textContent = 'Host: not approved';
    hint.textContent = 'Click Approve to allow the extension to execute commands on your machine.';
  } else if (connected) {
    dot.className = 'status-dot online';
    label.textContent = 'Host: connected';
    hint.textContent = 'Native host is running. Process commands are available.';
  } else {
    dot.className = 'status-dot offline';
    label.textContent = 'Host: not connected';
    hint.textContent = 'Run install.bat to register the native host, then click Check.';
  }

  if (approved) {
    btn.textContent = 'Revoke';
    btn.className = 'svc-btn danger';
  } else {
    btn.textContent = 'Approve';
    btn.className = 'svc-btn';
  }
}

function toggleApproval() {
  const action = currentlyApproved ? 'nb_revoke_service' : 'nb_approve_service';
  chrome.runtime.sendMessage({ action }, (response) => {
    if (!response || !response.ok) return;
    currentlyApproved = response.approved;
    updateServiceUI(response.connected || false, response.approved);
  });
}

function renderMemos(memos) {
  const list = document.getElementById('memoList');
  const count = document.getElementById('memoCount');
  count.textContent = memos.length;

  if (memos.length === 0) {
    list.innerHTML = '<div class="empty">No memos yet. The assistant saves them once briefed.</div>';
    return;
  }

  list.innerHTML = memos.map(m => {
    const date = new Date(m.created).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const tags = m.tags.length > 0
      ? `<div class="memo-tags">${m.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>`
      : '';
    const text = m.text.length > 200 ? m.text.substring(0, 200) + '...' : m.text;
    return `
      <div class="memo-item">
        <span class="memo-id">#${m.id}</span>
        <span class="memo-date">${date}</span>
        <button class="del-btn" data-id="${m.id}">delete</button>
        <div class="memo-text">${esc(text)}</div>
        ${tags}
      </div>
    `;
  }).join('');

  list.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      chrome.runtime.sendMessage({ action: 'nb_delmemo', id }, () => loadState());
    });
  });
}

function renderProcesses(processes, running) {
  const list = document.getElementById('procList');
  const count = document.getElementById('procCount');
  count.textContent = `${running.length} active / ${processes.length} total`;

  if (processes.length === 0) {
    list.innerHTML = '<div class="empty">No processes tracked.</div>';
    return;
  }

  const sorted = [...processes].reverse().slice(0, 20);
  list.innerHTML = sorted.map(p => {
    const started = new Date(p.started).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    return `
      <div class="proc-item">
        <span class="proc-status ${p.status}">${p.status}</span>
        <strong>#${p.id}</strong>
        ${p.pid ? `[PID ${p.pid}]` : ''}
        ${esc(p.command)}
        <span class="memo-date">${started}</span>
      </div>
    `;
  }).join('');
}

let briefingVisible = false;
function toggleBriefing() {
  const pre = document.getElementById('briefingPreview');
  if (briefingVisible) {
    pre.style.display = 'none';
    briefingVisible = false;
    return;
  }
  chrome.runtime.sendMessage({ action: 'nb_get_briefing' }, (response) => {
    if (response && response.ok) {
      pre.textContent = response.briefing;
      pre.style.display = 'block';
      briefingVisible = true;
    }
  });
}

function clearMemos() {
  if (!confirm('Delete ALL memos? This cannot be undone.')) return;
  chrome.storage.local.set({ nb_memos: [], nb_nextMemoId: 1 }, () => location.reload());
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function manualInject() {
  const btn = document.getElementById('injectBtn');
  const log = document.getElementById('injectLog');
  log.style.display = 'block';
  log.textContent = '';

  function addLog(msg) {
    log.textContent += msg + '\n';
    log.scrollTop = log.scrollHeight;
  }

  // Check if we have stored results from a previous scan
  // (since the popup closes when you switch tabs)
  chrome.storage.local.get(['nb_diag_log', 'nb_diag_running'], (stored) => {
    if (stored.nb_diag_running) {
      addLog('*** Scan is still running in the background ***');
      addLog('Switch to Perplexity, open/use the chat, then come back here.');
      addLog('Click "Read Results" when ready.');
      btn.textContent = 'Read Results';
      btn.onclick = readDiagResults;
      return;
    }
    if (stored.nb_diag_log && stored.nb_diag_log.length > 0) {
      addLog('*** Previous scan results found ***');
      stored.nb_diag_log.forEach(line => addLog(line));
      addLog('');
      addLog('Click the button again to start a new scan.');
      // Clear old results
      chrome.storage.local.remove(['nb_diag_log']);
      btn.textContent = 'Start New Scan';
      btn.disabled = false;
      return;
    }

    // --- START A NEW SCAN ---
    startDiagScan(btn, addLog);
  });
}

function readDiagResults() {
  const log = document.getElementById('injectLog');
  const btn = document.getElementById('injectBtn');
  log.style.display = 'block';
  log.textContent = '';

  function addLog(msg) {
    log.textContent += msg + '\n';
    log.scrollTop = log.scrollHeight;
  }

  chrome.storage.local.get(['nb_diag_log', 'nb_diag_running'], (stored) => {
    if (stored.nb_diag_running) {
      addLog('Scan is still running... switch to Perplexity and wait, then come back.');
      return;
    }
    if (stored.nb_diag_log && stored.nb_diag_log.length > 0) {
      addLog('=== DIAGNOSTIC RESULTS ===');
      stored.nb_diag_log.forEach(line => addLog(line));
      chrome.storage.local.remove(['nb_diag_log', 'nb_diag_running']);
    } else {
      addLog('No results yet. Make sure you opened a Perplexity chat while the scan was running.');
    }
    btn.textContent = 'Diagnose Input (30s scan)';
    btn.onclick = manualInject;
    btn.disabled = false;
  });
}

function startDiagScan(btn, addLog) {
  addLog('Starting 30-second background scan...');
  addLog('1. This will inject a scanner into the active Perplexity tab');
  addLog('2. Switch to Perplexity and open/click into a chat');
  addLog('3. The scanner runs every 500ms for 30 seconds');
  addLog('4. Come back here and click "Read Results"');
  addLog('');

  btn.textContent = 'Read Results';
  btn.onclick = readDiagResults;

  // Clear old results and mark as running
  chrome.storage.local.set({ nb_diag_log: [], nb_diag_running: true });

  // Find the Perplexity tab
  chrome.tabs.query({ url: 'https://www.perplexity.ai/*' }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      addLog('ERROR: No Perplexity tab found. Open perplexity.ai first.');
      chrome.storage.local.set({ nb_diag_running: false });
      btn.textContent = 'Diagnose Input (30s scan)';
      btn.onclick = manualInject;
      return;
    }

    const tabId = tabs[0].id;
    addLog('Found Perplexity tab: ' + tabs[0].url);
    addLog('Injecting scanner... switch to that tab now!');

    // Inject the persistent scanner into MAIN world
    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        // This runs ON the Perplexity page in MAIN world
        // It scans every 500ms for 30s and stores snapshots
        const scanLog = [];
        let scanCount = 0;
        const MAX_SCANS = 60; // 30 seconds at 500ms intervals
        let lastSnapshot = '';

        function snapshot() {
          const r = [];
          const ts = new Date().toISOString().substring(11, 23);
          r.push(`--- scan #${scanCount} @ ${ts} ---`);

          // Focused element
          const f = document.activeElement;
          if (f) {
            r.push('focused: ' + f.tagName +
              ' id=' + (f.id || '-') +
              ' role=' + (f.getAttribute('role') || '-') +
              ' ce=' + f.contentEditable +
              ' class=' + (f.className || '').substring(0, 80));
            if (f.attributes) {
              const attrs = [...f.attributes].map(a => a.name + '="' + a.value + '"');
              r.push('  attrs: ' + attrs.join(' '));
            }
            // parent chain
            let p = f.parentElement;
            for (let i = 0; i < 4 && p; i++) {
              r.push('  parent[' + i + ']: ' + p.tagName +
                ' class=' + (p.className || '').substring(0, 60) +
                ' role=' + (p.getAttribute('role') || '-') +
                ' id=' + (p.id || '-'));
              p = p.parentElement;
            }
            r.push('  outerHTML[0:500]: ' + f.outerHTML.substring(0, 500));
          } else {
            r.push('focused: (none)');
          }

          // All editable elements
          const editables = document.querySelectorAll(
            '[contenteditable="true"], [contenteditable="plaintext-only"], ' +
            '[role="textbox"], textarea, input[type="text"]'
          );
          r.push('editables found: ' + editables.length);
          editables.forEach((el, i) => {
            const attrs = [...el.attributes].map(a => a.name + '="' + a.value + '"');
            const text = (el.textContent || el.value || '').substring(0, 50);
            r.push('  [' + i + '] ' + el.tagName + ' | ' + attrs.join(' '));
            r.push('       text: "' + text + '"');
            r.push('       visible: ' + (el.offsetParent !== null) +
              ' size: ' + el.offsetWidth + 'x' + el.offsetHeight);
          });

          // Also check for Perplexity-specific patterns
          const prosemirror = document.querySelectorAll('.ProseMirror, .tiptap, [data-lexical-editor], .ql-editor');
          if (prosemirror.length > 0) {
            r.push('editor frameworks detected: ' + prosemirror.length);
            prosemirror.forEach((el, i) => {
              const attrs = [...el.attributes].map(a => a.name + '="' + a.value + '"');
              r.push('  editor[' + i + '] ' + el.tagName + ' | ' + attrs.join(' '));
            });
          }

          // Check for any submit-like buttons
          const submits = document.querySelectorAll(
            'button[aria-label*="Submit"], button[aria-label*="Send"], ' +
            'button[aria-label*="submit"], button[aria-label*="send"], ' +
            'button[type="submit"]'
          );
          r.push('submit buttons: ' + submits.length);
          submits.forEach((el, i) => {
            r.push('  btn[' + i + ']: ' + (el.ariaLabel || el.textContent || '').substring(0, 40) +
              ' disabled=' + el.disabled);
          });

          return r;
        }

        const interval = setInterval(() => {
          scanCount++;
          try {
            const lines = snapshot();
            const snap = lines.join('|');

            // Only log if something changed (to avoid 60 identical entries)
            if (snap !== lastSnapshot) {
              lastSnapshot = snap;
              lines.forEach(l => scanLog.push(l));
              scanLog.push('');
            }
          } catch (e) {
            scanLog.push('scan error: ' + e.message);
          }

          if (scanCount >= MAX_SCANS) {
            clearInterval(interval);
            scanLog.push('=== SCAN COMPLETE (' + scanCount + ' snapshots) ===');

            // Save results to extension storage
            // We have to use window.postMessage to get data back to the extension
            // since we're in MAIN world
            window.postMessage({
              type: 'NB_DIAG_COMPLETE',
              log: scanLog
            }, '*');

            console.log('[NB-DIAG] Scan complete. Results:', scanLog.join('\n'));
          }
        }, 500);

        console.log('[NB-DIAG] Persistent scanner started. ' + MAX_SCANS + ' scans over 30 seconds.');
      },
      args: []
    }).catch(err => {
      addLog('ERROR injecting scanner: ' + err.message);
      chrome.storage.local.set({ nb_diag_running: false });
    });
  });
}
