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

  addLog('Click into the Perplexity input box now...');
  addLog('Scanning in 2 seconds...');
  btn.textContent = 'Waiting 2s...';
  btn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) {
      addLog('ERROR: No active tab found');
      btn.textContent = 'Inject Briefing (2s delay)';
      btn.disabled = false;
      return;
    }
    const tabId = tabs[0].id;
    addLog('Tab: ' + tabs[0].url);

    setTimeout(() => {
      addLog('--- SCANNING ---');

      // Pure diagnostic: dump activeElement + all editables
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          const r = [];

          // What is focused right now?
          const f = document.activeElement;
          r.push('=== FOCUSED ELEMENT ===');
          if (f) {
            r.push('tag: ' + f.tagName);
            r.push('id: ' + (f.id || '(none)'));
            r.push('class: ' + (f.className || '(none)'));
            r.push('role: ' + (f.getAttribute('role') || '(none)'));
            r.push('contentEditable: ' + f.contentEditable);
            r.push('tabIndex: ' + f.tabIndex);
            // dump ALL attributes
            const attrs = [...f.attributes].map(a => a.name + '="' + a.value + '"');
            r.push('attributes: ' + attrs.join(' '));
            // parent chain (3 levels)
            let p = f.parentElement;
            for (let i = 0; i < 3 && p; i++) {
              r.push('parent[' + i + ']: ' + p.tagName + ' class=' + (p.className || '').substring(0, 80) + ' role=' + (p.getAttribute('role') || 'none'));
              p = p.parentElement;
            }
            // outerHTML snippet
            r.push('outerHTML (first 300): ' + f.outerHTML.substring(0, 300));
          } else {
            r.push('(nothing focused)');
          }

          // Also scan for all contenteditable and textbox elements
          r.push('');
          r.push('=== ALL EDITABLE ELEMENTS ===');
          const editables = document.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea');
          editables.forEach((el, i) => {
            const attrs = [...el.attributes].map(a => a.name + '="' + a.value + '"');
            r.push('#' + i + ': ' + el.tagName + ' | ' + attrs.join(' ') + ' | class=' + (el.className || '').substring(0, 60));
          });

          if (editables.length === 0) {
            r.push('(none found)');
          }

          console.log('[NB-DIAG]\n' + r.join('\n'));
          return r;
        },
        args: []
      }).then((results) => {
        if (results && results[0] && results[0].result) {
          results[0].result.forEach(line => addLog(line));
        } else {
          addLog('Script ran but returned no results. Check page console for [NB-DIAG].');
        }
        btn.textContent = 'Inject Briefing (2s delay)';
        btn.disabled = false;
      }).catch(err => {
        addLog('ERROR: ' + err.message);
        btn.textContent = 'Inject Briefing (2s delay)';
        btn.disabled = false;
      });
    }, 2000);
  });
}
