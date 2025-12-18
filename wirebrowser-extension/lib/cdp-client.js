/**
 * CDP Client Adapter for chrome.debugger API
 * Replaces Puppeteer's CDPSession with chrome.debugger transport
 */

class CDPClient {
  constructor(tabId) {
    this.tabId = tabId;
    this.target = { tabId };
    this.attached = false;
    this.eventListeners = new Map();
    this._onEvent = this._onEvent.bind(this);
    this._onDetach = this._onDetach.bind(this);
  }

  async attach(protocolVersion = "1.3") {
    if (this.attached) return;
    
    return new Promise((resolve, reject) => {
      chrome.debugger.attach(this.target, protocolVersion, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        this.attached = true;
        chrome.debugger.onEvent.addListener(this._onEvent);
        chrome.debugger.onDetach.addListener(this._onDetach);
        resolve();
      });
    });
  }

  async detach() {
    if (!this.attached) return;
    
    return new Promise((resolve) => {
      chrome.debugger.detach(this.target, () => {
        this.attached = false;
        chrome.debugger.onEvent.removeListener(this._onEvent);
        chrome.debugger.onDetach.removeListener(this._onDetach);
        resolve();
      });
    });
  }

  /**
   * Send CDP command - matches Puppeteer's client.send() signature
   */
  async send(method, params = {}) {
    if (!this.attached) {
      throw new Error("Debugger not attached");
    }

    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(this.target, method, params, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Subscribe to CDP events - matches Puppeteer's client.on() signature
   */
  on(eventName, handler) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName).add(handler);
  }

  off(eventName, handler) {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      listeners.delete(handler);
    }
  }

  removeAllListeners(eventName) {
    if (eventName) {
      this.eventListeners.delete(eventName);
    } else {
      this.eventListeners.clear();
    }
  }

  _onEvent(source, method, params) {
    if (source.tabId !== this.tabId) return;
    
    const listeners = this.eventListeners.get(method);
    if (listeners) {
      for (const handler of listeners) {
        try {
          handler(params);
        } catch (e) {
          console.error(`Error in CDP event handler for ${method}:`, e);
        }
      }
    }
  }

  _onDetach(source, reason) {
    if (source.tabId !== this.tabId) return;
    this.attached = false;
    console.log(`Debugger detached from tab ${this.tabId}: ${reason}`);
  }
}

export default CDPClient;
