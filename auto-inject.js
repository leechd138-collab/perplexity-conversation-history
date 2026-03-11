// Auto-inject instructions and context when new Perplexity window opens

(function() {
  'use strict';

  // Configuration
  const AUTO_INJECT_ENABLED = true;
  const INJECT_DELAY = 2000; // Wait 2 seconds after page load
  
  // Check if this is a new/fresh Perplexity session
  function isNewSession() {
    // Check if there's no conversation history in the DOM
    const messages = document.querySelectorAll('[class*="message"], [class*="chat"]');
    return messages.length === 0 || messages.length < 3;
  }

  // Get the most recent context from storage
  async function getRecentContext() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['conversations', 'memories'], (result) => {
        const conversations = result.conversations || [];
        const memories = result.memories || [];
        
        // Get last conversation
        const lastConversation = conversations.length > 0 
          ? conversations[conversations.length - 1] 
          : null;
        
        // Get recent memories
        const recentMemories = memories.slice(-5);
        
        resolve({ lastConversation, recentMemories });
      });
    });
  }

  // Build the auto-inject message
  function buildInjectMessage(context) {
    let message = `Continue from where we left off without asking additional questions.\n\n`;
    
    // Add instructions on how to use the extension
    message += `**Available Commands:**\n`;
    message += `- Use @remember, @note, @save, @memory, #note, or #save to save important info\n`;
    message += `- Press Ctrl+Shift+M to save selected text as a memory\n`;
    message += `- All conversations are automatically saved for context preservation\n\n`;
    
    // Add recent context if available
    if (context.lastConversation && context.lastConversation.messages) {
      message += `**Recent Context:**\n`;
      const recentMessages = context.lastConversation.messages.slice(-3);
      recentMessages.forEach(msg => {
        const preview = msg.text.substring(0, 150);
        message += `- ${preview}${msg.text.length > 150 ? '...' : ''}\n`;
      });
      message += `\n`;
    }
    
    // Add recent memories
    if (context.recentMemories && context.recentMemories.length > 0) {
      message += `**Recent Memories:**\n`;
      context.recentMemories.forEach(mem => {
        message += `- ${mem.content.substring(0, 100)}${mem.content.length > 100 ? '...' : ''}\n`;
        if (mem.keywords && mem.keywords.length > 0) {
          message += `  Keywords: ${mem.keywords.join(', ')}\n`;
        }
      });
    }
    
    return message;
  }

  // Find and fill the input textarea
  function findAndFillInput(message) {
    // Common selectors for Perplexity's input field
    const selectors = [
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="follow"]',
      'textarea',
      '[contenteditable="true"]',
      'input[type="text"]'
    ];
    
    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input) {
        // Fill the input
        if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
          input.value = message;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (input.contentEditable === 'true') {
          input.textContent = message;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Trigger any React/Vue state updates
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        ).set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, message);
        }
        
        return input;
      }
    }
    return null;
  }

  // Find and click the submit button
  function findAndClickSubmit() {
    const selectors = [
      'button[type="submit"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="Submit"]',
      'button:has(svg[class*="send"])',
      '[role="button"]:has(svg)'
    ];
    
    for (const selector of selectors) {
      try {
        const button = document.querySelector(selector);
        if (button && !button.disabled) {
          button.click();
          return true;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    // Fallback: try Enter key
    const input = document.querySelector('textarea');
    if (input) {
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      input.dispatchEvent(enterEvent);
      return true;
    }
    
    return false;
  }

  // Main auto-inject function
  async function autoInject() {
    if (!AUTO_INJECT_ENABLED) return;
    
    console.log('[Auto-Inject] Checking if should inject...');
    
    // Check if this is a new session
    if (!isNewSession()) {
      console.log('[Auto-Inject] Not a new session, skipping');
      return;
    }
    
    // Get context
    const context = await getRecentContext();
    
    // Build message
    const message = buildInjectMessage(context);
    
    console.log('[Auto-Inject] Injecting message:', message);
    
    // Wait a bit for the page to fully load
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Find and fill input
    const input = findAndFillInput(message);
    if (!input) {
      console.log('[Auto-Inject] Could not find input field');
      return;
    }
    
    // Wait a bit more
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Submit
    const submitted = findAndClickSubmit();
    if (submitted) {
      console.log('[Auto-Inject] Successfully injected and submitted!');
    } else {
      console.log('[Auto-Inject] Filled input but could not submit');
    }
  }

  // Run after page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(autoInject, INJECT_DELAY);
    });
  } else {
    setTimeout(autoInject, INJECT_DELAY);
  }
  
  // Also listen for dynamic page changes (SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(autoInject, INJECT_DELAY);
    }
  }).observe(document.body, { subtree: true, childList: true });
  
  console.log('[Auto-Inject] Script loaded and monitoring');
})();
