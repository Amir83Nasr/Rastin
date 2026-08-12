/* ===================================================
   Rastin — Background Service Worker
   =================================================== */

// Load shared error management
try {
  importScripts('../lib/errors.js');
} catch (e) {
  console.error('[Rastin] Failed to load errors.js', e);
}

/* global RastinErrors */
var Errs = typeof RastinErrors !== 'undefined' ? RastinErrors : {};
var log = (Errs.createLogger && Errs.createLogger('background')) || {
  info: function () {},
  warn: function () {},
  error: function () {},
  fatal: function () {},
};
var ERR = Errs.CODE || {};

/** Send a message to a tab with lastError logging. */
function tabMsg(tabId, msg) {
  try {
    chrome.tabs.sendMessage(tabId, msg, function () {
      if (chrome.runtime.lastError) {
        log.warn(ERR.MSG_CONNECTION_FAIL, 'sendMessage to tab failed', {
          tabId: tabId,
          action: msg && msg.action,
          error: chrome.runtime.lastError.message,
        });
      }
    });
  } catch (err) {
    log.warn(ERR.MSG_CONNECTION_FAIL, 'sendMessage to tab threw', {
      tabId: tabId,
      action: msg && msg.action,
      error: err.message,
    });
  }
}

// ─── Install ──────────────────────────────────────────
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      auto_banner: true,
      auto_translate: false,
      font_family: 'IRANYekanX',
      rtl_state: {},
      installed_at: new Date().toISOString(),
    });
    log.info(null, 'Extension installed');
  } else if (details.reason === 'update') {
    log.info(null, 'Extension updated from ' + (details.previousVersion || 'unknown'));
  }
});

// ─── Programmatic Injection ──────────────────────────
/**
 * Inject content scripts and CSS into a tab on demand.
 * This handles tabs that were open before extension load/update.
 */
function injectContentScript(tabId) {
  return new Promise(function (resolve) {
    if (!chrome.scripting) {
      log.error(ERR.UNKNOWN, 'chrome.scripting API not available');
      resolve(false);
      return;
    }

    // 1. Insert CSS
    chrome.scripting.insertCSS(
      {
        target: { tabId: tabId },
        files: ['styles/content.css'],
      },
      function () {
        if (chrome.runtime.lastError) {
          log.warn(ERR.UNKNOWN, 'CSS injection failed', {
            error: chrome.runtime.lastError.message,
          });
        }

        // 2. Execute JS (sequentially to ensure dependencies)
        chrome.scripting.executeScript(
          {
            target: { tabId: tabId },
            files: ['lib/errors.js', 'scripts/code-detection.js', 'scripts/content.js'],
          },
          function () {
            if (chrome.runtime.lastError) {
              log.error(ERR.UNKNOWN, 'JS injection failed', {
                error: chrome.runtime.lastError.message,
              });
              resolve(false);
            } else {
              log.info(null, 'Content scripts injected into tab ' + tabId);
              resolve(true);
            }
          },
        );
      },
    );
  });
}

// ─── Message Listener (Popup/Content ↔ Background) ───
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === 'inject_scripts') {
    var tabId = message.tabId || (sender.tab && sender.tab.id);
    if (!tabId) {
      sendResponse({ success: false, error: 'No tabId' });
      return;
    }

    injectContentScript(tabId).then(function (success) {
      sendResponse({ success: success });
    });
    return true; // async
  }
});

// ─── Keyboard Shortcuts ──────────────────────────────
if (chrome.commands) {
  chrome.commands.onCommand.addListener(function (command, tab) {
    if (!tab || !tab.id) {
      log.warn(ERR.MSG_NO_TAB, 'Keyboard shortcut triggered but no tab available', {
        command: command,
      });
      return;
    }

    switch (command) {
      case 'toggle-rtl':
        tabMsg(tab.id, { action: 'toggle_rtl' });
        log.info(null, 'Shortcut: toggle RTL');
        break;
      case 'translate-page':
        tabMsg(tab.id, { action: 'apply_rtl' });
        tabMsg(tab.id, { action: 'translate' });
        log.info(null, 'Shortcut: translate page');
        break;
    }
  });
}

// ─── Unhandled error handler ─────────────────────────
self.addEventListener('unhandledrejection', function (event) {
  event.preventDefault();
  log.error(ERR.UNKNOWN, 'Unhandled promise rejection in background', {
    reason: event.reason ? event.reason.message || String(event.reason) : 'unknown',
  });
});
