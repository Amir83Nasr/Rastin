/* ===================================================
   RTL Translator — Popup Script
   =================================================== */

document.addEventListener('DOMContentLoaded', function () {
  // ─── DOM refs ────────────────────────────────────────
  var pageStatusEl = document.getElementById('pageStatus');
  var detectedLangEl = document.getElementById('detectedLang');
  var rtlToggle = document.getElementById('rtlToggle');
  var translateBtn = document.getElementById('translateBtn');
  var autoBannerToggle = document.getElementById('autoBannerToggle');
  var resetBtn = document.getElementById('resetBtn');

  // ─── Helpers ─────────────────────────────────────────
  function getCurrentTab() {
    return chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      return tabs[0];
    });
  }

  function sendToContent(action, data) {
    data = data || {};
    return getCurrentTab().then(function (tab) {
      if (!tab || !tab.id) throw new Error('No tab found');
      return chrome.tabs.sendMessage(tab.id, Object.assign({ action: action }, data));
    }).catch(function (err) {
      if (err.message && err.message.indexOf('Could not establish connection') !== -1) return null;
      throw err;
    });
  }

  // ─── Refresh Status ──────────────────────────────────
  function refreshStatus() {
    sendToContent('get_status').then(function (status) {
      if (!status) {
        pageStatusEl.textContent = '❌ قابل دسترسی نیست';
        pageStatusEl.style.color = '#ef4444';
        detectedLangEl.textContent = '—';
        rtlToggle.checked = false;
        translateBtn.disabled = true;
        return;
      }

      if (status.translating) {
        pageStatusEl.textContent = '🔄 در حال ترجمه...';
        pageStatusEl.style.color = '#f59e0b';
      } else if (status.translated) {
        pageStatusEl.textContent = '✅ ترجمه شده';
        pageStatusEl.style.color = '#22c55e';
      } else if (status.rtl) {
        pageStatusEl.textContent = '🔵 RTL فعال';
        pageStatusEl.style.color = '#3b82f6';
      } else {
        pageStatusEl.textContent = '⚪ پیش‌فرض';
        pageStatusEl.style.color = '#6b7280';
      }

      detectedLangEl.textContent = status.langDetected || '—';
      rtlToggle.checked = !!status.rtl;
      translateBtn.disabled = !!status.translating;
    });
  }

  // ─── Load Settings ──────────────────────────────────
  function loadSettings() {
    chrome.storage.local.get(['auto_banner'], function (result) {
      autoBannerToggle.checked = result.auto_banner !== false;
    });
  }

  // ─── Event Handlers ─────────────────────────────────

  rtlToggle.addEventListener('change', function () {
    var action = rtlToggle.checked ? 'apply_rtl' : 'remove_rtl';
    sendToContent(action).then(refreshStatus);
  });

  translateBtn.addEventListener('click', function () {
    translateBtn.disabled = true;
    translateBtn.innerHTML = '<span class="icon">🔄</span> در حال ترجمه...';

    sendToContent('apply_rtl').then(function () {
      return sendToContent('translate');
    }).then(function () {
      translateBtn.innerHTML = '<span class="icon">🌐</span> ترجمه صفحه به فارسی';
      refreshStatus();
    });
  });

  autoBannerToggle.addEventListener('change', function () {
    chrome.storage.local.set({ auto_banner: autoBannerToggle.checked });
  });

  resetBtn.addEventListener('click', function () {
    sendToContent('remove_rtl').then(function () {
      return getCurrentTab();
    }).then(function (tab) {
      if (tab && tab.id) chrome.tabs.reload(tab.id);
      window.close();
    });
  });

  // ─── Init ────────────────────────────────────────────
  loadSettings();
  refreshStatus();

  // Poll while translating
  sendToContent('get_status').then(function (s) {
    if (s && s.translating) {
      var interval = setInterval(function () {
        refreshStatus();
        sendToContent('get_status').then(function (latest) {
          if (!latest || !latest.translating) clearInterval(interval);
        });
      }, 2000);
    }
  });
});
