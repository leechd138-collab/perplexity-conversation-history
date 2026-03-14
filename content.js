// NaughtyBits Content Script
// Runs on perplexity.ai pages in Chrome's ISOLATED world
//
// Responsibilities:
// 1. Tail the assistant's DOM output for /naughtybits commands
// 2. Request briefing injection on load (routed through background -> MAIN world)
// 3. Route parsed commands to the background service worker
//
// IMPORTANT: This script CANNOT directly manipulate ProseMirror/React state
// because it runs in the isolated world. All chat injection goes through
// background.js which uses chrome.scripting.executeScript with world:'MAIN'.

(function () {
  'use strict';

  const PREFIX = '/naughtybits';
  const LOG = (...args) => console.log('[NaughtyBits]', ...args);
  const INJECT_DELAY = 3000;

  // Dedup tracking
  const processedNodes = new WeakSet();
  const executedCommands = new Set();

  // ============================================================
  // COMMAND PARSER
  // ============================================================
  function parseCommand(line) {
    const stripped = line.trim();
    if (!stripped.toLowerCase().startsWith(PREFIX)) return null;

    const rest = stripped.substring(PREFIX.length).trim();
    const parts = rest.split(/\s+/);
    const verb = (parts[0] || '').toLowerCase();

    switch (verb) {
      case 'addmemo': {
        const afterVerb = rest.substring(verb.length).trim();
        let tags = [];
        let text = afterVerb;
        const tagMatch = afterVerb.match(/^\[([^\]]*)\]\s*(.*)/s);
        if (tagMatch) {
          tags = tagMatch[1].split(',').map(t => t.trim()).filter(Boolean);
          text = tagMatch[2];
        }
        return { action: 'nb_addmemo', text, tags };
      }
      case 'delmemo': {
        const id = parseInt(parts[1], 10);
        if (isNaN(id)) return { action: 'nb_error', error: 'delmemo requires a numeric ID' };
        return { action: 'nb_delmemo', id };
      }
      case 'listmemos':
        return { action: 'nb_listmemos' };
      case 'searchmemos': {
        const query = parts.slice(1).join(' ');
        return { action: 'nb_searchmemos', query };
      }
      case 'exec': {
        const command = parts.slice(1).join(' ');
        if (!command) return { action: 'nb_error', error: 'exec requires a command' };
        return { action: 'nb_exec', command };
      }
      case 'spawn': {
        const command = parts.slice(1).join(' ');
        if (!command) return { action: 'nb_error', error: 'spawn requires a command' };
        return { action: 'nb_spawn', command };
      }
      case 'kill': {
        const id = parseInt(parts[1], 10);
        if (isNaN(id)) return { action: 'nb_error', error: 'kill requires a numeric process ID' };
        return { action: 'nb_kill', id };
      }
      case 'ps':
        return { action: 'nb_ps' };
      default:
        return { action: 'nb_unknown', verb, raw: rest };
    }
  }

  // ============================================================
  // COMMAND EXECUTOR
  // ============================================================
  async function executeCommand(cmd) {
    LOG('Executing command:', cmd);
    try {
      const response = await chrome.runtime.sendMessage(cmd);
      LOG('Response:', response);
      return response;
    } catch (err) {
      LOG('Command error:', err);
      return { ok: false, error: err.message };
    }
  }

  // ============================================================
  // DOM TAILING — watch assistant output for /naughtybits commands
  // ============================================================
  function scanNodeForCommands(node) {
    if (!node) return;
    if (processedNodes.has(node)) return;

    const text = node.textContent || node.innerText || '';
    if (!text.includes(PREFIX)) return;

    processedNodes.add(node);

    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.toLowerCase().startsWith(PREFIX)) continue;
      if (executedCommands.has(trimmed)) continue;
      executedCommands.add(trimmed);

      const cmd = parseCommand(trimmed);
      if (!cmd) continue;
      if (cmd.action === 'nb_error' || cmd.action === 'nb_unknown') {
        LOG('Bad command:', trimmed, cmd);
        continue;
      }
      executeCommand(cmd);
    }
  }

  function scanElement(el) {
    if (!el || !el.querySelectorAll) return;
    const nodes = el.querySelectorAll('p, li, code, pre, span, div');
    nodes.forEach(n => scanNodeForCommands(n));
    scanNodeForCommands(el);
  }

  // Main mutation observer — tails ALL new DOM content
  const outputObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scanElement(node);
          } else if (node.nodeType === Node.TEXT_NODE) {
            if ((node.textContent || '').includes(PREFIX)) {
              scanNodeForCommands(node.parentElement || node);
            }
          }
        });
      }
      if (mutation.type === 'characterData') {
        if ((mutation.target.textContent || '').includes(PREFIX)) {
          const parent = mutation.target.parentElement;
          if (parent) {
            processedNodes.delete(parent);
            scanNodeForCommands(parent);
          }
        }
      }
    }
  });

  // ============================================================
  // BRIEFING INJECTION
  // Sends the briefing text to background.js which injects it
  // into the chat via chrome.scripting.executeScript in MAIN world.
  // This is the ONLY way to get ProseMirror/React to see the input.
  // ============================================================
  async function requestBriefingInjection() {
    LOG('Requesting briefing injection via background (MAIN world)...');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'nb_inject_briefing' });
      if (response && response.ok) {
        LOG('Briefing injection initiated by background');
      } else {
        LOG('Briefing injection request failed:', response);
      }
    } catch (err) {
      LOG('Briefing injection request error:', err);
    }
  }

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    LOG('Content script loaded on', window.location.href);

    // Start tailing DOM for commands
    outputObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    LOG('DOM observer started — tailing for /naughtybits commands');

    // ALWAYS inject the briefing — every single session gets the man page + memos
    // No conditions, no "is fresh session" check. Every window, every time.
    setTimeout(() => {
      LOG('Firing briefing injection (unconditional)...');
      requestBriefingInjection();
    }, INJECT_DELAY);

    // SPA navigation detection — re-inject on client-side route changes
    let lastUrl = location.href;
    const navObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        LOG('SPA navigation detected:', lastUrl);
        executedCommands.clear();
        setTimeout(() => requestBriefingInjection(), INJECT_DELAY);
      }
    });
    navObserver.observe(document.body, { subtree: true, childList: true });

    // Initial scan of any existing content
    scanElement(document.body);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
