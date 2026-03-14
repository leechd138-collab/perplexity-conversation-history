# NaughtyBits — Browser Extension

**v3.0.0** — Autonomous AI companion with persistent memory, process management, CDP injection, and session continuity.

---

## ⚠️ IMPORTANT: You MUST Start Your Browser With Remote Debugging Enabled

NaughtyBits v3.0.0 uses Chrome DevTools Protocol (CDP) to inject text into browser tabs. This **only works** if your browser was launched with the `--remote-debugging-port=9222` flag.

**If you skip this step, CDP injection will not work.** The extension popup will show a big red warning if it detects the flag is missing.

### How to launch your browser correctly

Close **ALL** existing browser windows first — the flag only takes effect on the first instance launched.

**Chrome:**
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

**Edge:**
```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222
```

**Comet:**
```
"%LOCALAPPDATA%\Comet\Application\comet.exe" --remote-debugging-port=9222
```

### Premade Shortcuts

The `browser-start-shortcuts/` folder inside this extension's directory contains ready-made `.bat` files for Chrome, Edge, and Comet. Double-click the one for your browser and you're good to go.

> **If your browser is installed on a different drive or a non-default path**, open the `.bat` file in a text editor and update the path before running it.

You can also create a permanent desktop shortcut by copying your browser's shortcut and adding `--remote-debugging-port=9222` to the Target field.

---

## What is NaughtyBits?

NaughtyBits is a Chrome/Chromium extension that gives your Perplexity AI assistant persistent memory across sessions and the ability to execute commands on your local machine. The assistant can save memos, manage processes, and pick up exactly where it left off — every single time.

When a new Perplexity session starts, NaughtyBits automatically injects a full system briefing into the conversation: the command reference (man page), all saved memos, running processes, and service status. The assistant reads this briefing and resumes work immediately.

## Architecture

```
Perplexity AI  <->  content.js (DOM tailing)  <->  background.js  <->  Native Messaging  <->  naughtybits_host.exe
                   (isolated world)                 (service worker)      (Chrome protocol)     (runs as current user)
                                                                                                      |
                                                                                                 CDP (localhost:9222)
                                                                                                      |
                                                                                                 Chrome tab (Runtime.evaluate)
```

- **content.js** — Watches the assistant's DOM output for `/naughtybits` commands using a MutationObserver
- **background.js** — Central hub: memo CRUD, process registry, Native Messaging bridge, CDP availability check, MAIN world briefing injection
- **popup.html/popup.js** — Developer dashboard: CDP status warning, service status, memo viewer, process list, approve/revoke controls
- **Native Messaging Host** — Separate C++ binary ([perplexity-automation-service](https://github.com/leechd138-collab/perplexity-automation-service)) that executes commands as the logged-in OS user and performs CDP injection via WinHTTP + WebSocket

## Command Protocol

Commands are written by the assistant in its response text. The extension's DOM observer picks them up in real time.

### Memo Commands (work without native host)

```
/naughtybits addmemo <text>                — Save a memo for future sessions
/naughtybits addmemo [tag1,tag2] <text>    — Save a memo with tags
/naughtybits delmemo <id>                   — Delete a memo by its numeric ID
/naughtybits listmemos                      — Dump all memos
/naughtybits searchmemos <query>            — Search memos by text or tag
```

### Process Commands (require native host + approval)

```
/naughtybits exec <command>                 — Execute a command and return output
/naughtybits spawn <command>                — Spawn a long-running process
/naughtybits kill <id>                      — Kill a tracked process
/naughtybits ps                             — List all tracked processes
```

## Installation

1. **Start your browser with `--remote-debugging-port=9222`** (see above — this is critical)
2. Open `chrome://extensions/` (or equivalent in your Chromium-based browser)
3. Enable **Developer mode**
4. Click **Load unpacked** and select this directory
5. Note your extension ID — you'll need it for the native host installation
6. Open the extension popup and verify the CDP status shows green

## Native Host Setup

Process commands (`exec`, `spawn`, `kill`, `ps`) and CDP injection require the companion native messaging host. See the [perplexity-automation-service](https://github.com/leechd138-collab/perplexity-automation-service) repo for build and installation instructions.

## Security

- **No HTTP. No ports. No tokens.** Communication between the extension and the host uses Chrome's Native Messaging protocol — a stdin/stdout pipe managed entirely by the browser.
- The native host runs as the currently logged-in OS user. Chrome enforces that only the registered extension ID can communicate with the host.
- CDP access is local-only (localhost:9222) — no remote connections.
- Process execution requires explicit user approval via the extension popup (click "Approve").
- Memo storage uses `chrome.storage.local` — stays on the user's machine.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Persistent memo and state storage |
| `activeTab` | Briefing injection into the current tab |
| `scripting` | MAIN world script execution for ProseMirror/React interaction |
| `nativeMessaging` | Communication with the local native host |
| `host_permissions: <all_urls>` | Content script and injection work on any URL |

## Files

| File | Description |
|---|---|
| `manifest.json` | MV3 extension manifest |
| `background.js` | Service worker — state, Native Messaging bridge, CDP check, briefing builder |
| `content.js` | DOM tailing observer and command parser |
| `popup.html` | Dashboard UI with CDP warning banner |
| `popup.js` | Dashboard logic with CDP status check |
| `browser-start-shortcuts/` | Premade .bat files to launch Chrome, Edge, and Comet with CDP flag |

## Version History

- **v3.0.0** — CDP injection architecture, CDP availability detection with popup warning, browser start shortcuts, `<all_urls>` manifest, updated briefing system
- **v2.0.0** — Native Messaging architecture, process management via C++ host, simplified dashboard (no ports/credentials), MAIN world briefing injection
- **v1.0.0** — Initial release with memo system and HTTP-based local service

---

*"Pretty soon the only thing you won't remember is what went on before NaughtyBits."*
