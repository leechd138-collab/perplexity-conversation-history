# Perplexity Conversation History

A Chrome extension that saves your Perplexity.ai conversations automatically.

## Problem

You lose conversation context every time you close a chat or open a new window.

## Solution

This extension:
- Auto-captures all messages
- Stores them locally
- Shows a popup list of past conversations
- Never loses context

## Installation

1. Clone this repo
2. Open chrome://extensions/
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select this folder

## How to Use

1. Go to Perplexity.ai
2. Have conversations normally
3. Click extension icon to see history
4. Conversations auto-save

## Files

- manifest.json - Config
- content.js - Message capture
- background.js - Data storage
- popup.html - UI
- popup.js - Functionality
- styles.css - Styling

## License

MIT
