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

// ─── Context Menu (right-click) ───────────────────────
if (chrome.contextMenus) {
  try {
    chrome.contextMenus.create({
      id: 'rtl-translate-page',
      title: 'ترجمه صفحه به فارسی',
      contexts: ['page'],
    });

    chrome.contextMenus.create({
      id: 'rtl-toggle-rtl',
      title: 'فعال/غیرفعال کردن RTL',
      contexts: ['page'],
    });

    chrome.contextMenus.onClicked.addListener(function (info, tab) {
      if (!tab || !tab.id) {
        log.warn(ERR.MSG_NO_TAB, 'Context menu clicked but no tab available');
        return;
      }

      if (info.menuItemId === 'rtl-translate-page') {
        tabMsg(tab.id, { action: 'apply_rtl' });
        tabMsg(tab.id, { action: 'translate' });
        log.info(null, 'Context menu: translate page');
      } else if (info.menuItemId === 'rtl-toggle-rtl') {
        tabMsg(tab.id, { action: 'toggle_rtl' });
        log.info(null, 'Context menu: toggle RTL');
      }
    });
  } catch (err) {
    log.error(ERR.UNKNOWN, 'Failed to create context menus', { error: err.message });
  }
}

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
