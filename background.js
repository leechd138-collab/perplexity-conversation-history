// Service worker that manages conversation history storage
const conversations = {};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveMessage') {
    const conversationId = `conv_${new Date().toISOString()}`;
    
    if (!conversations[conversationId]) {
      conversations[conversationId] = {
        id: conversationId,
        title: 'Conversation',
        messages: [],
        created: new Date().toISOString()
      };
    }
    
    conversations[conversationId].messages = request.allMessages;
    chrome.storage.local.set({ conversations });
    sendResponse({ status: 'saved' });
  } else if (request.action === 'getConversations') {
    chrome.storage.local.get(['conversations'], (result) => {
      sendResponse({ conversations: result.conversations || {} });
    });
  }
});

chrome.storage.local.get(['conversations'], (result) => {
  if (result.conversations) {
    Object.assign(conversations, result.conversations);
  }
});
