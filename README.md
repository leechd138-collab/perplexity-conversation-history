# NaughtyBits — Browser Extension

**v2.0.0** — Autonomous AI companion with persistent memory, process management, and session continuity.

## What is NaughtyBits?

NaughtyBits is a Chrome/Chromium extension that gives your Perplexity AI assistant persistent memory across sessions and the ability to execute commands on your local machine. The assistant can save memos, manage processes, and pick up exactly where it left off — every single time.

When a new Perplexity session starts, NaughtyBits automatically injects a full system briefing into the conversation: the command reference (man page), all saved memos, running processes, and service status. The assistant reads this briefing and resumes work immediately.

## Architecture

```
Perplexity AI  <->  content.js (DOM tailing)  <->  background.js  <->  Native Messaging  <->  naughtybits_host.exe
                   (isolated world)                 (service worker)      (Chrome protocol)     (runs as current user)
```

- **content.js** — Watches the assistant's DOM output for `/naughtybits` commands using a MutationObserver
- **background.js** — Central hub: memo CRUD, process registry, Native Messaging bridge, MAIN world briefing injection
- **popup.html/popup.js** — Developer dashboard: service status, memo viewer, process list, approve/revoke controls
- **Native Messaging Host** — Separate C++ binary ([perplexity-automation-service](https://github.com/leechd138-collab/perplexity-automation-service)) that executes commands as the logged-in OS user

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

1. Open `chrome://extensions/` (or equivalent in your Chromium-based browser)
2. Enable **Developer mode**
3. Click **Load unpacked** and select this directory
4. Note your extension ID — you'll need it for the native host installation

## Native Host Setup

Process commands (`exec`, `spawn`, `kill`, `ps`) require the companion native messaging host. See the [perplexity-automation-service](https://github.com/leechd138-collab/perplexity-automation-service) repo for build and installation instructions.

## Security

- **No HTTP. No ports. No tokens.** Communication between the extension and the host uses Chrome's Native Messaging protocol — a stdin/stdout pipe managed entirely by the browser.
- The native host runs as the currently logged-in OS user. Chrome enforces that only the registered extension ID can communicate with the host.
- Process execution requires explicit user approval via the extension popup (click "Approve").
- Memo storage uses `chrome.storage.local` — stays on the user's machine.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Persistent memo and state storage |
| `activeTab` | Briefing injection into the current Perplexity tab |
| `scripting` | MAIN world script execution for ProseMirror/React interaction |
| `nativeMessaging` | Communication with the local native host |
| `host_permissions: perplexity.ai` | Content script runs only on Perplexity |

## Files

| File | Description |
|---|---|
| `manifest.json` | MV3 extension manifest |
| `background.js` | Service worker — state, Native Messaging bridge, briefing builder |
| `content.js` | DOM tailing observer and command parser |
| `popup.html` | Dashboard UI |
| `popup.js` | Dashboard logic |

## Version History

- **v2.0.0** — Native Messaging architecture, process management via C++ host, simplified dashboard (no ports/credentials), MAIN world briefing injection
- **v1.0.0** — Initial release with memo system and HTTP-based local service

---

*"Pretty soon the only thing you won't remember is what went on before NaughtyBits."*
