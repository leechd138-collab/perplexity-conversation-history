// Load and display conversations
document.addEventListener('DOMContentLoaded', loadConversations);

function loadConversations() {
  chrome.runtime.sendMessage(
    { action: 'getConversations' },
    (response) => {
      const listDiv = document.getElementById('conversationList');
      const conversations = response.conversations || {};
      
      if (Object.keys(conversations).length === 0) {
        listDiv.innerHTML = '<p>No conversations yet</p>';
        return;
      }
      
      listDiv.innerHTML = '';
      Object.entries(conversations).forEach(([id, conv]) => {
        const item = document.createElement('div');
        item.className = 'item';
        const date = new Date(conv.created).toLocaleDateString();
        const msgs = conv.messages ? conv.messages.length : 0;
        
        item.innerHTML = `<div>${conv.title} - ${date}</div><div>${msgs} messages</div>`;
        listDiv.appendChild(item);
      });
    }
  );
}

document.getElementById('refreshBtn')?.addEventListener('click', loadConversations);
document.getElementById('clearBtn')?.addEventListener('click', () => {
  chrome.storage.local.set({ conversations: {} }, loadConversations);
});
