/* ===================================================
   Rastin — Popup Script
   =================================================== */

document.addEventListener('DOMContentLoaded', function () {
  // ─── Error Logger ──────────────────────────────
  var log = window.RastinErrors
    ? window.RastinErrors.createLogger('popup')
    : { info: function () {}, warn: function () {}, error: function () {} };
  var ERR = window.RastinErrors ? window.RastinErrors.CODE : {};

  // ─── Mount Lucide Icons ─────────────────────────────
  mountIcons();

  // ─── DOM refs ───────────────────────────────────────
  var pageStatusEl = document.getElementById('pageStatus');
  var detectedLangEl = document.getElementById('detectedLang');
  var rtlToggle = document.getElementById('rtlToggle');
  var translateBtn = document.getElementById('translateBtn');
  var autoBannerToggle = document.getElementById('autoBannerToggle');
  var resetBtn = document.getElementById('resetBtn');
  var errorBar = document.getElementById('errorBar');

  // ─── Status icon helper ─────────────────────────────
  function setStatus(iconName, text, color) {
    pageStatusEl.innerHTML = '';
    var icon = createIcon(iconName, 14, 'status-icon');
    if (iconName === 'loader-circle') icon.classList.add('status-spin');
    icon.style.color = color;
    pageStatusEl.appendChild(icon);
    pageStatusEl.appendChild(document.createTextNode(' ' + text));
    pageStatusEl.style.color = color;
  }

  // ─── Error display in popup ─────────────────────────
  function showError(message) {
    if (!errorBar) return;
    errorBar.textContent = message;
    errorBar.style.display = 'flex';
    // Auto-hide after 5 seconds
    clearTimeout(errorBar._hideTimer);
    errorBar._hideTimer = setTimeout(function () {
      errorBar.style.display = 'none';
    }, 5000);
  }

  function hideError() {
    if (!errorBar) return;
    errorBar.style.display = 'none';
    clearTimeout(errorBar._hideTimer);
  }

  // ─── Helpers ────────────────────────────────────────
  function getCurrentTab() {
    return chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      return tabs[0];
    });
  }

  function sendToContent(action, data) {
    data = data || {};
    return getCurrentTab()
      .then(function (tab) {
        if (!tab || !tab.id) throw new Error('No tab found');
        return chrome.tabs.sendMessage(tab.id, Object.assign({ action: action }, data));
      })
      .catch(function (err) {
        if (err.message && err.message.indexOf('Could not establish connection') !== -1) {
          // Content script not loaded — not an error for some pages
          return null;
        }
        log.warn(ERR.MSG_CONNECTION_FAIL || 'MSG_CONNECTION_FAIL', 'sendToContent failed', {
          action: action,
          error: err.message,
        });
        throw err;
      });
  }

  // ─── Refresh Status ─────────────────────────────────
  function refreshStatus() {
    hideError();
    sendToContent('get_status')
      .then(function (status) {
        if (!status) {
          setStatus('check', 'قابل دسترسی نیست', '#ef4444');
          detectedLangEl.textContent = '—';
          rtlToggle.checked = false;
          translateBtn.disabled = true;
          return;
        }

        if (status.translating) {
          setStatus('loader-circle', 'در حال ترجمه...', '#d97706');
        } else if (status.translated) {
          setStatus('check', 'ترجمه شده', '#16a34a');
        } else if (status.rtl) {
          setStatus('text-select', 'RTL فعال', '#2563eb');
        } else {
          setStatus('text-select', 'پیش‌فرض', '#6b7280');
        }

        detectedLangEl.textContent = status.langDetected || '—';
        rtlToggle.checked = !!status.rtl;
        translateBtn.disabled = !!status.translating;
      })
      .catch(function (err) {
        setStatus('check', 'خطا در ارتباط', '#ef4444');
        showError('ارتباط با صفحه برقرار نشد. صفحه را بارگذاری مجدد کنید.');
        log.error(ERR.MSG_CONNECTION_FAIL || 'MSG_CONNECTION_FAIL', 'Status refresh failed', {
          error: err.message,
        });
      });
  }

  // ─── Load Settings ─────────────────────────────────
  function loadSettings() {
    chrome.storage.local.get(['auto_banner'], function (result) {
      autoBannerToggle.checked = result.auto_banner !== false;
    });
  }

  // ─── Event Handlers ────────────────────────────────

  rtlToggle.addEventListener('change', function () {
    hideError();
    var action = rtlToggle.checked ? 'apply_rtl' : 'remove_rtl';
    sendToContent(action)
      .then(function (result) {
        if (result && result.success) {
          log.info(null, 'RTL ' + (rtlToggle.checked ? 'enabled' : 'disabled'));
        }
        refreshStatus();
      })
      .catch(function () {
        rtlToggle.checked = !rtlToggle.checked; // revert toggle
        showError('اعمال تغییر RTL با خطا مواجه شد');
      });
  });

  translateBtn.addEventListener('click', function () {
    translateBtn.disabled = true;
    hideError();

    // Replace button content — keep icon element reference
    translateBtn.innerHTML = '';
    var spinIcon = createIcon('loader-circle', 18);
    spinIcon.classList.add('btn-spin');
    translateBtn.appendChild(spinIcon);
    translateBtn.appendChild(document.createTextNode(' در حال ترجمه...'));

    sendToContent('apply_rtl')
      .then(function () {
        return sendToContent('translate');
      })
      .then(function (result) {
        // Restore button
        translateBtn.innerHTML = '';
        var globeIcon = createIcon('globe', 18);
        translateBtn.appendChild(globeIcon);
        translateBtn.appendChild(document.createTextNode(' ترجمه صفحه به فارسی'));
        refreshStatus();

        if (result && result.success) {
          log.info(null, 'Page translation completed successfully');
        } else {
          showError('ترجمه کامل انجام نشد. برخی متن‌ها ممکن است ترجمه نشده باشند.');
          log.warn(
            ERR.TRANS_EMPTY_RESULT || 'TRANS_EMPTY_RESULT',
            'Translation returned no results',
          );
        }
      })
      .catch(function (err) {
        // Restore button
        translateBtn.innerHTML = '';
        var globeIcon = createIcon('globe', 18);
        translateBtn.appendChild(globeIcon);
        translateBtn.appendChild(document.createTextNode(' ترجمه صفحه به فارسی'));
        translateBtn.disabled = false;

        showError('ترجمه با خطا مواجه شد. اتصال اینترنت خود را بررسی کنید.');
        log.error(ERR.TRANS_API_FAILURE || 'TRANS_API_FAILURE', 'Popup translate failed', {
          error: err.message,
        });
      });
  });

  autoBannerToggle.addEventListener('change', function () {
    chrome.storage.local.set({ auto_banner: autoBannerToggle.checked });
    log.info(null, 'Auto-banner ' + (autoBannerToggle.checked ? 'enabled' : 'disabled'));
  });

  resetBtn.addEventListener('click', function () {
    hideError();
    sendToContent('reset_all')
      .then(function () {
        refreshStatus();
        window.close();
      })
      .catch(function (err) {
        showError('بازگردانی با خطا مواجه شد');
        log.error(ERR.MSG_CONNECTION_FAIL || 'MSG_CONNECTION_FAIL', 'Reset failed', {
          error: err.message,
        });
      });
  });

  // ─── Init ───────────────────────────────────────────
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
