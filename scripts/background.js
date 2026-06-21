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

      try {
        if (info.menuItemId === 'rtl-translate-page') {
          chrome.tabs.sendMessage(tab.id, { action: 'apply_rtl' });
          chrome.tabs.sendMessage(tab.id, { action: 'translate' });
          log.info(null, 'Context menu: translate page');
        } else if (info.menuItemId === 'rtl-toggle-rtl') {
          chrome.tabs.sendMessage(tab.id, { action: 'toggle_rtl' });
          log.info(null, 'Context menu: toggle RTL');
        }
      } catch (err) {
        log.error(ERR.MSG_CONNECTION_FAIL, 'Failed to send context menu action to tab', {
          tabId: tab.id,
          menuItemId: info.menuItemId,
          error: err.message,
        });
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

    try {
      switch (command) {
        case 'toggle-rtl':
          chrome.tabs.sendMessage(tab.id, { action: 'toggle_rtl' });
          log.info(null, 'Shortcut: toggle RTL');
          break;
        case 'translate-page':
          chrome.tabs.sendMessage(tab.id, { action: 'apply_rtl' });
          chrome.tabs.sendMessage(tab.id, { action: 'translate' });
          log.info(null, 'Shortcut: translate page');
          break;
      }
    } catch (err) {
      log.error(ERR.MSG_CONNECTION_FAIL, 'Failed to execute keyboard shortcut', {
        command: command,
        tabId: tab.id,
        error: err.message,
      });
    }
  });
}

// ─── Unhandled error handler ─────────────────────────
self.addEventListener('unhandledrejection', function (event) {
  log.error(ERR.UNKNOWN, 'Unhandled promise rejection in background', {
    reason: event.reason ? event.reason.message || String(event.reason) : 'unknown',
  });
});
