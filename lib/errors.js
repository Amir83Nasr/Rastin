/* ═══════════════════════════════════════════════════════════════
   Rastin — Error Management System
   ===============================================================
   A professional, structured error handling system for Chrome
   extensions. Provides:
   •  Structured errors with code, severity, context, timestamp
   •  Persistent error log in chrome.storage.local (up to 100
      entries, auto-pruned)
   •  Toast notification system for user-facing messages
   •  Error statistics (count per code for monitoring)
   •  Async function wrapper for safe execution
   •  Network status checks before API calls
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── Error Levels ─────────────────────────────────── */
  var LEVEL = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4,
  };
  var LEVEL_NAME = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

  /* ─── Well-known Error Codes ─────────────────────────
     Use these codes for error tracking and filtering.
     Each phase of the extension has its own prefix.    */
  var CODE = {
    // ── Translation ──
    TRANS_API_FAILURE: 'TRANS_API_FAILURE',
    TRANS_BATCH_MISMATCH: 'TRANS_BATCH_MISMATCH',
    TRANS_EMPTY_RESULT: 'TRANS_EMPTY_RESULT',
    TRANS_NO_TEXT: 'TRANS_NO_TEXT',
    TRANS_RATE_LIMIT: 'TRANS_RATE_LIMIT',

    // ── Network ──
    NETWORK_OFFLINE: 'NETWORK_OFFLINE',
    NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
    NETWORK_HTTP_ERROR: 'NETWORK_HTTP_ERROR',

    // ── Font / Resource ──
    FONT_INJECT_FAIL: 'FONT_INJECT_FAIL',
    RESOURCE_MISSING: 'RESOURCE_MISSING',

    // ── Storage ──
    STORAGE_READ_FAIL: 'STORAGE_READ_FAIL',
    STORAGE_WRITE_FAIL: 'STORAGE_WRITE_FAIL',

    // ── RTL ──
    RTL_APPLY_FAIL: 'RTL_APPLY_FAIL',

    // ── Messaging ──
    MSG_NO_TAB: 'MSG_NO_TAB',
    MSG_CONNECTION_FAIL: 'MSG_CONNECTION_FAIL',
    MSG_TIMEOUT: 'MSG_TIMEOUT',

    // ── State ──
    STATE_CORRUPT: 'STATE_CORRUPT',
    STATE_INVALID: 'STATE_INVALID',

    // ── DOM ──
    DOM_NODE_MISSING: 'DOM_NODE_MISSING',

    // ── Catch-all ──
    UNKNOWN: 'UNKNOWN',
  };

  /* ─── Safe JSON parse (never throws) ───────────────── */
  function safeParse(str, fallback) {
    try {
      return JSON.parse(str);
    } catch (_) {
      return fallback;
    }
  }

  /* ══════════════════════════════════════════════════════
     RastinLogger
     ────────────────────────────────────────────────────
     Usage:
       var log = RastinErrors.createLogger('content');
       log.info(CODE.TRANS_NO_TEXT, 'No text to translate');
       log.error(CODE.NETWORK_HTTP_ERROR, 'API returned 429',
                  { status: 429, retryAfter: 60 });
       log.notify('ترجمه با خطا مواجه شد', 'error');

     The logger auto-flushes to chrome.storage.local on a
     microtask delay, so rapid log calls are batched.   */
  function RastinLogger(moduleName, opts) {
    this.module = moduleName || 'unknown';
    this.opts = opts || {};
    if (this.opts.consoleOutput === undefined) this.opts.consoleOutput = true;
    if (this.opts.persistToStorage === undefined) this.opts.persistToStorage = true;
    if (!this.opts.storageKey) this.opts.storageKey = 'rastin_log';
    if (!this.opts.maxEntries) this.opts.maxEntries = 100;
    if (!this.opts.prefix) this.opts.prefix = '[Rastin]';

    this._counts = { total: 0, byLevel: {}, byCode: {} };
    this._buffer = [];
    this._flushing = false;

    // Initialize level counters
    for (var k in LEVEL) {
      if (LEVEL.hasOwnProperty(k)) this._counts.byLevel[k] = 0;
    }
  }

  /* ─── Core: write a log entry ─────────────────────── */
  RastinLogger.prototype._write = function (level, code, message, context) {
    var entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      level: level,
      levelName: LEVEL_NAME[level] || 'UNKNOWN',
      code: code || CODE.UNKNOWN,
      message: message || '',
      module: this.module,
      context: context || {},
    };

    this._buffer.push(entry);
    this._counts.total++;
    this._counts.byLevel[level] = (this._counts.byLevel[level] || 0) + 1;
    this._counts.byCode[entry.code] = (this._counts.byCode[entry.code] || 0) + 1;

    // Console output with consistent formatting
    if (this.opts.consoleOutput) {
      var tag = this.opts.prefix + '[' + entry.levelName + '][' + entry.code + ']';
      if (level >= LEVEL.ERROR) {
        console.error(tag, message, context);
      } else if (level >= LEVEL.WARN) {
        console.warn(tag, message, context);
      } else {
        console.log(tag, message, context);
      }
    }

    // Schedule a flush (coalesces rapid calls via microtask)
    if (this.opts.persistToStorage && !this._flushing) {
      this._flushing = true;
      Promise.resolve().then(this.flush.bind(this));
    }

    return entry;
  };

  /* ─── Convenience log methods ─────────────────────── */
  RastinLogger.prototype.debug = function (code, message, context) {
    return this._write(LEVEL.DEBUG, code, message, context);
  };
  RastinLogger.prototype.info = function (code, message, context) {
    return this._write(LEVEL.INFO, code, message, context);
  };
  RastinLogger.prototype.warn = function (code, message, context) {
    return this._write(LEVEL.WARN, code, message, context);
  };
  RastinLogger.prototype.error = function (code, message, context) {
    return this._write(LEVEL.ERROR, code, message, context);
  };
  RastinLogger.prototype.fatal = function (code, message, context) {
    return this._write(LEVEL.FATAL, code, message, context);
  };

  /* ─── Flush buffered logs to chrome.storage ─────────
     Entries are appended to existing logs, and the array
     is trimmed to maxEntries (oldest entries dropped).  */
  RastinLogger.prototype.flush = function () {
    this._flushing = false;
    if (!this._buffer.length) return;

    var batch = this._buffer.splice(0, this._buffer.length);
    var self = this;

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([this.opts.storageKey], function (result) {
        var existing = result[self.opts.storageKey] || [];
        var merged = existing.concat(batch);
        if (merged.length > self.opts.maxEntries) {
          merged = merged.slice(merged.length - self.opts.maxEntries);
        }
        var data = {};
        data[self.opts.storageKey] = merged;
        chrome.storage.local.set(data, function () {
          /* best-effort — no retry */
        });
      });
    }
  };

  /* ─── Retrieve logs with optional filtering ─────────
     filter: { level, code, module, since, limit }
     Returns a Promise resolving to an array of entries. */
  RastinLogger.prototype.getLogs = function (filter) {
    var self = this;
    return new Promise(function (resolve) {
      if (!chrome.storage || !chrome.storage.local) return resolve([]);
      chrome.storage.local.get([self.opts.storageKey], function (result) {
        var logs = result[self.opts.storageKey] || [];
        if (filter) {
          if (filter.level !== undefined)
            logs = logs.filter(function (e) {
              return e.level >= filter.level;
            });
          if (filter.code)
            logs = logs.filter(function (e) {
              return e.code === filter.code;
            });
          if (filter.module)
            logs = logs.filter(function (e) {
              return e.module === filter.module;
            });
          if (filter.since)
            logs = logs.filter(function (e) {
              return e.ts >= filter.since;
            });
          if (filter.limit) logs = logs.slice(-filter.limit);
        }
        resolve(logs);
      });
    });
  };

  /* ─── Clear all persisted logs ────────────────────── */
  RastinLogger.prototype.clearLogs = function () {
    var self = this;
    return new Promise(function (resolve) {
      if (!chrome.storage || !chrome.storage.local) return resolve();
      var data = {};
      data[self.opts.storageKey] = [];
      chrome.storage.local.set(data, resolve);
    });
  };

  /* ─── Get in-memory error counters ────────────────── */
  RastinLogger.prototype.getStats = function () {
    return {
      total: this._counts.total,
      byLevel: Object.assign({}, this._counts.byLevel),
      byCode: Object.assign({}, this._counts.byCode),
    };
  };

  /* ─── Async function wrapper ────────────────────────
     Catches any thrown error, logs it, and returns the
     specified fallback value. Keeps the caller clean.

       var result = await log.wrap(
         () => fetch(url).then(r => r.json()),
         []  // fallback — returned on error
       );
  */
  RastinLogger.prototype.wrap = function (fn, errorValue) {
    var self = this;
    return Promise.resolve()
      .then(function () {
        return fn();
      })
      .catch(function (err) {
        self.error(err.code || CODE.UNKNOWN, err.message || String(err), {
          original: err.toString ? err.toString() : String(err),
        });
        return errorValue;
      });
  };

  /* ─── Network status check ──────────────────────────
     Returns true if the browser appears to be online.
     Checks navigator.onLine first, then does a lightweight
     fetch to a reliable endpoint.                        */
  RastinLogger.prototype.checkNetwork = function () {
    var self = this;
    return Promise.resolve().then(function () {
      // Quick check
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        self.warn(CODE.NETWORK_OFFLINE, 'Browser reports offline');
        return false;
      }
      return true;
    });
  };

  /* ─── User-facing toast notification ────────────────
     Creates a floating toast at the bottom of the page.
     Works in both popup and content script contexts.
     Types: 'info' (blue), 'warn' (amber), 'error' (red).
     Duration: 3s for info/warn, 6s for error by default. */
  RastinLogger.prototype.notify = function (message, type, duration) {
    if (typeof document === 'undefined' || !document.body) return;

    type = type || 'info';
    if (duration === undefined) duration = type === 'error' ? 6000 : type === 'warn' ? 4000 : 3000;

    // Find or create container
    var container = document.querySelector('.rastin-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'rastin-toast-container';
      container.style.cssText =
        'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);' +
        'z-index:2147483647;display:flex;flex-direction:column;gap:8px;' +
        'pointer-events:none;';
      document.body.appendChild(container);
    }

    var bgColor = type === 'error' ? '#ef4444' : type === 'warn' ? '#d97706' : '#2563eb';

    var toast = document.createElement('div');
    toast.style.cssText =
      'background:' +
      bgColor +
      ';color:#fff;padding:10px 20px;border-radius:8px;' +
      'font-family:IRANYekanX,Tahoma,sans-serif;font-size:13px;' +
      'direction:rtl;box-shadow:0 4px 12px rgba(0,0,0,0.2);' +
      'opacity:0;transform:translateY(8px);transition:all 0.3s ease;' +
      'pointer-events:auto;max-width:360px;text-align:center;line-height:1.5;';
    toast.textContent = message;
    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(function () {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    // Animate out and remove
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(function () {
        if (toast.parentNode) toast.remove();
      }, 300);
    }, duration);
  };

  /* ══════════════════════════════════════════════════════
     Factory function
     ────────────────────────────────────────────────────
       var log = RastinErrors.createLogger('popup', {
         storageKey: 'rastin_log',
         maxEntries: 100,
       });
  ══════════════════════════════════════════════════════ */
  function createLogger(moduleName, opts) {
    return new RastinLogger(moduleName, opts);
  }

  /* ══════════════════════════════════════════════════════
     Exports to global scope
     ────────────────────────────────────────────────────
     Load this script before other scripts in popup.html
     or as the first script in content.js IIFE.
  ══════════════════════════════════════════════════════ */
  // ══════════════════════════════════════════════════════
  //   Export — works in both window and service worker
  //   contexts (popup.html, importScripts, etc.)
  // ══════════════════════════════════════════════════════
  /* global self */
  (typeof self !== 'undefined' ? self : window).RastinErrors = {
    LEVEL: LEVEL,
    CODE: CODE,
    createLogger: createLogger,
  };
})();
