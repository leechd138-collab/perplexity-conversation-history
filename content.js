// Content script that runs on Perplexity.ai pages
// Captures conversation messages and sends them to the background script
// Also integrates with the memory system for keyword-triggered note-taking

const capturedMessages = [];
let memorySystem = null;

// Initialize memory system
function initializeMemorySystem() {
  // Load memory.js
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('memory.js');
  script.onload = function() {
    memorySystem = window.memorySystem;
    console.log('Memory system initialized');
    setupKeywordListeners();
  };
  document.head.appendChild(script);
}

// Setup keyword listeners for note-taking
function setupKeywordListeners() {
  // Keywords that trigger memory capture (configurable)
  const triggerKeywords = ['@remember', '@note', '@save', '@memory', '#note', '#save'];
  
  // Listen for keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+M to create a quick memory
    if (e.ctrlKey && e.shiftKey && e.key === 'M') {
      e.preventDefault();
      createQuickMemory();
    }
  });
}

// Create a quick memory from selected text
function createQuickMemory() {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText.length === 0) {
    console.log('No text selected for memory');
    return;
  }
  
  if (memorySystem) {
    // Extract keywords from selected text (words starting with @)
    const keywords = selectedText.match(/@\w+/g) || [];
    const cleanedText = selectedText.replace(/@\w+/g, '').trim();
    
    const memoryId = memorySystem.addMemory(cleanedText, keywords, {
      source: 'perplexity-ai',
      selectedText: selectedText
    });
    
    console.log('Memory saved:', memoryId);
  }
}

// Listen for keyword mentions in messages
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList') {
      // Look for message elements
      const messages = document.querySelectorAll('[class*="message"], [class*="chat"]');
      
      messages.forEach((msg) => {
        const text = msg.innerText || msg.textContent;
        if (text && text.length > 0) {
          const msgObj = {
            text: text.trim(),
            timestamp: new Date().toISOString(),
            role: 'user'
          };
          
          if (!capturedMessages.some(m => m.text === msgObj.text)) {
            capturedMessages.push(msgObj);
            
            // Check if message contains memory keywords
            const triggerKeywords = ['@remember', '@note', '@save', '@memory', '#note', '#save'];
            const shouldSaveMemory = triggerKeywords.some(kw => text.toLowerCase().includes(kw));
            
            if (shouldSaveMemory && memorySystem) {
              // Extract keywords from message
              const keywords = text.match(/@\w+|#\w+/g) || [];
              memorySystem.addMemory(text, keywords, {
                source: 'perplexity-ai',
                captured: true
              });
            }
            
            chrome.runtime.sendMessage({
              action: 'saveMessage',
              message: msgObj,
              allMessages: capturedMessages
            });
          }
        }
      });
    }
  });
});

const observerOptions = {
  childList: true,
  subtree: true,
  characterData: true
};

observer.observe(document.body, observerOptions);

// Expose for debugging
window.capturedMessages = capturedMessages;

// Initialize when document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeMemorySystem);
} else {
  initializeMemorySystem();
}
