/**
 * Debugger wrapper - ported from Wirebrowser's src/app/debugger.js
 * Provides high-level debugger operations over CDP
 */

const DEFAULT_VENDOR_PATTERNS = [
  "react", "react-dom", "redux", "vue", "angular", "jquery",
  "moment", "lodash", "immer", "rxjs", "core-js",
  "regenerator-runtime", "polyfill", "babel",
  "webpack", "vite", "rollup", "parcel", "zone.js"
];

class Debugger {
  constructor(client) {
    this.client = client;
    this.isEnabled = false;
    this.events = {};
    this.parsedScripts = new Map();
    this.fileLevelPatterns = new Set();
  }

  on(evName, handler) {
    if (this.isEnabled) {
      throw new Error("Cannot add event handlers while debugger is active");
    }
    this.events[evName] = handler;
  }

  async enable() {
    if (this.isEnabled) return;
    this.isEnabled = true;

    const { paused: onPaused, resumed: onResumed } = this.events;

    if (onPaused) {
      this.client.on("Debugger.paused", onPaused);
    }
    if (onResumed) {
      this.client.on("Debugger.resumed", onResumed);
    }

    this.client.on("Debugger.scriptParsed", (event) => this._onScriptParsed(event));
    await this.client.send("Debugger.enable");
  }

  async disable() {
    this.client.removeAllListeners("Debugger.paused");
    this.client.removeAllListeners("Debugger.scriptParsed");
    this.client.removeAllListeners("Debugger.resumed");
    await this.client.send("Debugger.disable");
    this.isEnabled = false;
  }

  _onScriptParsed(event) {
    this.parsedScripts.set(event.scriptId, event);
    this._maybeBlackbox(event);
    if (this.events.scriptParsed) {
      this.events.scriptParsed(event);
    }
  }

  async _maybeBlackbox(script) {
    const url = script.url;
    if (!url || url.startsWith("eval") || url.startsWith("extensions::")) return;

    const lower = url.toLowerCase();
    const isVendor = DEFAULT_VENDOR_PATTERNS.some(p => lower.includes(p.toLowerCase()));
    
    if (isVendor) {
      const pattern = "^" + this._escapeRegex(url) + "$";
      if (!this.fileLevelPatterns.has(pattern)) {
        this.fileLevelPatterns.add(pattern);
        await this.client.send("Debugger.setBlackboxPatterns", {
          patterns: Array.from(this.fileLevelPatterns)
        });
      }
    }
  }

  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  getParsedScripts() {
    return [...this.parsedScripts.values()];
  }

  getScriptUrl(scriptId) {
    return this.parsedScripts.get(scriptId)?.url;
  }

  async getScriptSource(scriptId) {
    const { scriptSource } = await this.client.send("Debugger.getScriptSource", { scriptId });
    return scriptSource;
  }

  async resume() {
    await this.client.send("Debugger.resume");
  }

  async pause() {
    await this.enable();
    await this.client.send("Debugger.pause");
  }

  async stepInto() {
    await this.client.send("Debugger.stepInto");
  }

  async stepOver() {
    await this.client.send("Debugger.stepOver");
  }

  async stepOut() {
    await this.client.send("Debugger.stepOut");
  }

  async setBreakpoint(scriptId, lineNumber, columnNumber, condition) {
    const { breakpointId } = await this.client.send("Debugger.setBreakpoint", {
      location: { scriptId, lineNumber, columnNumber },
      condition
    });
    return breakpointId;
  }

  async setBreakpointOnFunctionCall(objectId) {
    const { breakpointId } = await this.client.send("Debugger.setBreakpointOnFunctionCall", {
      objectId
    });
    return breakpointId;
  }

  async removeBreakpoint(breakpointId) {
    await this.client.send("Debugger.removeBreakpoint", { breakpointId });
  }

  async setDOMClickBreakpoint(enabled) {
    await this.enable();
    const method = enabled ? "setEventListenerBreakpoint" : "removeEventListenerBreakpoint";
    await this.client.send(`DOMDebugger.${method}`, {
      eventName: "click",
      targetName: "*"
    });
  }

  async evaluateOnCallFrame(frameId, expression) {
    const res = await this.client.send("Debugger.evaluateOnCallFrame", {
      callFrameId: frameId,
      expression,
      returnByValue: false
    });
    return res?.result;
  }
}

export default Debugger;
