// Memory System - Keyword-triggered note-taking for Perplexity AI

class MemorySystem {
  constructor() {
    this.memories = [];
    this.keywords = {};
    this.loadMemories();
  }

  // Load memories from Chrome storage
  loadMemories() {
    chrome.storage.local.get(['memories', 'keywords'], (result) => {
      if (result.memories) {
        this.memories = result.memories;
      }
      if (result.keywords) {
        this.keywords = result.keywords;
      }
    });
  }

  // Save memories to Chrome storage
  saveMemories() {
    chrome.storage.local.set({
      memories: this.memories,
      keywords: this.keywords
    });
  }

  // Add a new memory with optional keywords
  addMemory(content, keywords = [], metadata = {}) {
    const memory = {
      id: Date.now(),
      content: content,
      keywords: keywords,
      timestamp: new Date().toISOString(),
      metadata: metadata
    };

    this.memories.push(memory);

    // Index keywords for quick lookup
    keywords.forEach(keyword => {
      const key = keyword.toLowerCase();
      if (!this.keywords[key]) {
        this.keywords[key] = [];
      }
      this.keywords[key].push(memory.id);
    });

    this.saveMemories();
    return memory.id;
  }

  // Retrieve memories by keyword
  getByKeyword(keyword) {
    const key = keyword.toLowerCase();
    if (!this.keywords[key]) {
      return [];
    }
    const ids = this.keywords[key];
    return this.memories.filter(m => ids.includes(m.id));
  }

  // Retrieve all memories
  getAllMemories() {
    return this.memories.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // Delete memory by ID
  deleteMemory(id) {
    const memory = this.memories.find(m => m.id === id);
    if (memory) {
      // Remove from keywords index
      memory.keywords.forEach(keyword => {
        const key = keyword.toLowerCase();
        this.keywords[key] = this.keywords[key].filter(mid => mid !== id);
        if (this.keywords[key].length === 0) {
          delete this.keywords[key];
        }
      });
      this.memories = this.memories.filter(m => m.id !== id);
      this.saveMemories();
      return true;
    }
    return false;
  }

  // Search memories
  search(query) {
    const lowerQuery = query.toLowerCase();
    return this.memories.filter(m => {
      return m.content.toLowerCase().includes(lowerQuery) ||
             m.keywords.some(k => k.toLowerCase().includes(lowerQuery));
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // Export memories as JSON
  export() {
    return JSON.stringify({
      memories: this.memories,
      keywords: this.keywords,
      exportDate: new Date().toISOString()
    }, null, 2);
  }

  // Import memories from JSON
  import(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      this.memories = data.memories || [];
      this.keywords = data.keywords || {};
      this.saveMemories();
      return true;
    } catch (e) {
      console.error('Error importing memories:', e);
      return false;
    }
  }
}

// Initialize global memory system
const memorySystem = new MemorySystem();

// Expose to other scripts
if (typeof window !== 'undefined') {
  window.memorySystem = memorySystem;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MemorySystem;
}
