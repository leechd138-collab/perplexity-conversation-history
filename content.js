// Content script that runs on Perplexity.ai pages
// Captures conversation messages and sends them to the background script

const capturedMessages = [];

// Listen for new messages in the DOM
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
window.capturedMessages = capturedMessages;
