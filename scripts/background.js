/* ===================================================
   RTL Translator — Background Service Worker
   =================================================== */

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
    console.log('[RTL Translator] نصب شد.');
  }
});

// ─── Context Menu (right-click) ───────────────────────
if (chrome.contextMenus) {
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
    if (!tab || !tab.id) return;

    if (info.menuItemId === 'rtl-translate-page') {
      chrome.tabs.sendMessage(tab.id, { action: 'apply_rtl' });
      chrome.tabs.sendMessage(tab.id, { action: 'translate' });
    } else if (info.menuItemId === 'rtl-toggle-rtl') {
      chrome.tabs.sendMessage(tab.id, { action: 'toggle_rtl' });
    }
  });
}

// ─── Keyboard Shortcuts ──────────────────────────────
if (chrome.commands) {
  chrome.commands.onCommand.addListener(function (command, tab) {
    if (!tab || !tab.id) return;

    switch (command) {
      case 'toggle-rtl':
        chrome.tabs.sendMessage(tab.id, { action: 'toggle_rtl' });
        break;
      case 'translate-page':
        chrome.tabs.sendMessage(tab.id, { action: 'apply_rtl' });
        chrome.tabs.sendMessage(tab.id, { action: 'translate' });
        break;
    }
  });
}
