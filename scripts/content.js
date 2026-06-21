/* ===================================================
   Rastin — Content Script
   Translation + RTL + Iran Yekan X Font
   =================================================== */

(function () {
  'use strict';

  // ══════════════════════════════════════════════════
  //   Error Management (standalone for content script)
  // ══════════════════════════════════════════════════

  var LOG_LEVEL = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4,
  };
  var LOG_LEVEL_NAME = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

  var ERR = {
    TRANS_API_FAILURE: 'TRANS_API_FAILURE',
    TRANS_BATCH_MISMATCH: 'TRANS_BATCH_MISMATCH',
    TRANS_EMPTY_RESULT: 'TRANS_EMPTY_RESULT',
    TRANS_NO_TEXT: 'TRANS_NO_TEXT',
    TRANS_RATE_LIMIT: 'TRANS_RATE_LIMIT',
    NETWORK_OFFLINE: 'NETWORK_OFFLINE',
    NETWORK_HTTP_ERROR: 'NETWORK_HTTP_ERROR',
    NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
    FONT_INJECT_FAIL: 'FONT_INJECT_FAIL',
    STORAGE_READ_FAIL: 'STORAGE_READ_FAIL',
    STORAGE_WRITE_FAIL: 'STORAGE_WRITE_FAIL',
    MSG_CONNECTION_FAIL: 'MSG_CONNECTION_FAIL',
    STATE_CORRUPT: 'STATE_CORRUPT',
    DOM_NODE_MISSING: 'DOM_NODE_MISSING',
    UNKNOWN: 'UNKNOWN',
  };

  /**
   * Simple structured logger for content script.
   * Writes to console with consistent formatting and
   * provides user-facing toast notifications.
   */
  function ContentLogger(module) {
    this.module = module || 'content';
    this._counts = { total: 0, byLevel: {}, byCode: {} };
    for (var k in LOG_LEVEL) {
      if (LOG_LEVEL.hasOwnProperty(k)) this._counts.byLevel[k] = 0;
    }
  }

  ContentLogger.prototype._write = function (level, code, message, context) {
    this._counts.total++;
    this._counts.byLevel[level] = (this._counts.byLevel[level] || 0) + 1;
    this._counts.byCode[code] = (this._counts.byCode[code] || 0) + 1;

    var tag = '[Rastin][' + LOG_LEVEL_NAME[level] + '][' + code + ']';
    var fn =
      level >= LOG_LEVEL.ERROR
        ? console.error
        : level >= LOG_LEVEL.WARN
          ? console.warn
          : console.log;
    fn(tag, message, context || '');
  };

  ContentLogger.prototype.info = function (code, msg, ctx) {
    this._write(LOG_LEVEL.INFO, code, msg, ctx);
  };
  ContentLogger.prototype.warn = function (code, msg, ctx) {
    this._write(LOG_LEVEL.WARN, code, msg, ctx);
  };
  ContentLogger.prototype.error = function (code, msg, ctx) {
    this._write(LOG_LEVEL.ERROR, code, msg, ctx);
  };

  ContentLogger.prototype.notify = function (message, type, duration) {
    if (typeof document === 'undefined' || !document.body) return;
    type = type || 'info';
    if (duration === undefined) duration = type === 'error' ? 6000 : 4000;

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
      'pointer-events:auto;max-width:360px;text-align:center;' +
      'line-height:1.5;';
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(function () {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(function () {
        if (toast.parentNode) toast.remove();
      }, 300);
    }, duration);
  };

  var log = new ContentLogger('content');

  // ─── State ───────────────────────────────────────────
  const STATE = {
    translated: false,
    translating: false,
    bannerShown: false,
    langDetected: null,
    langCode: null,
  };

  // ─── Constants ───────────────────────────────────────
  const PERSIAN_LANG_CODES = ['fa', 'per', 'fas'];

  // ─── Inline SVG Icons (Lucide-style) ──────────────────
  const ICON_SVG = {
    globe:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
    loader:
      '<svg class="rtl-translator-loading-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    warning:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  };
  const SKIP_TAGS = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'IFRAME',
    'OBJECT',
    'SVG',
    'PATH',
    'CODE',
    'PRE',
    'TEXTAREA',
    'INPUT',
    'SELECT',
    'OPTION',
    'CANVAS',
    'VIDEO',
    'AUDIO',
  ]);
  const SKIP_PREFIXES = ['rtl-translator', 'fa-', 'notranslate', 'translate-ignore'];
  const LANG_NAMES = {
    en: 'English',
    ar: 'العربية',
    de: 'Deutsch',
    fr: 'Français',
    es: 'Español',
    ru: 'Русский',
    zh: '中文',
    ja: '日本語',
    tr: 'Türkçe',
    ur: 'اردو',
    hi: 'हिन्दी',
    pt: 'Português',
    it: 'Italiano',
    nl: 'Nederlands',
    ko: '한국어',
    sv: 'Svenska',
    da: 'Dansk',
    fi: 'Suomi',
    no: 'Norsk',
    pl: 'Polski',
  };
  const MAX_TRANS_RETRIES = 2;
  const RETRY_DELAY_MS = 1000;

  // ─── Font Injection (Iran Yekan X) ───────────────────
  function injectFonts() {
    if (document.getElementById('rtl-translator-fonts')) return;

    try {
      const style = document.createElement('style');
      style.id = 'rtl-translator-fonts';
      style.textContent =
        '@font-face {' +
        "font-family:'IRANYekanX';" +
        "src:url('" +
        chrome.runtime.getURL('fonts/IRANYekanX-Regular.ttf') +
        "') format('truetype');" +
        'font-weight:400;font-style:normal;font-display:swap;}' +
        '@font-face {' +
        "font-family:'IRANYekanX';" +
        "src:url('" +
        chrome.runtime.getURL('fonts/IRANYekanX-Medium.ttf') +
        "') format('truetype');" +
        'font-weight:500;font-style:normal;font-display:swap;}' +
        '@font-face {' +
        "font-family:'IRANYekanX';" +
        "src:url('" +
        chrome.runtime.getURL('fonts/IRANYekanX-DemiBold.ttf') +
        "') format('truetype');" +
        'font-weight:600;font-style:normal;font-display:swap;}';
      document.head.appendChild(style);
    } catch (err) {
      log.error(ERR.FONT_INJECT_FAIL, 'Failed to inject fonts', {
        error: err.message,
      });
    }
  }

  // ─── Language Detection ──────────────────────────────
  function isPersianPage() {
    const htmlLang = (document.documentElement.lang || '').toLowerCase();
    if (
      PERSIAN_LANG_CODES.some(function (c) {
        return htmlLang.includes(c);
      })
    )
      return true;

    var meta = document.querySelector('meta[name="language"]');
    if (meta) {
      var content = (meta.getAttribute('content') || '').toLowerCase();
      if (
        PERSIAN_LANG_CODES.some(function (c) {
          return content.includes(c);
        })
      )
        return true;
    }

    // Sample body text — if >15% Persian chars, consider it Persian
    var textSample = ((document.body && document.body.innerText) || '').slice(0, 2000);
    var faCount = (textSample.match(/[؀-ۿ]/g) || []).length;
    if (textSample.length > 100 && faCount / textSample.length > 0.15) return true;

    return false;
  }

  function getPageLanguage() {
    var lang = document.documentElement.lang || '';
    if (lang) return lang.slice(0, 2).toLowerCase();

    var meta = document.querySelector('meta[name="language"]');
    if (meta) return (meta.getAttribute('content') || '').slice(0, 2).toLowerCase() || null;

    return null;
  }

  // ─── Text Node Filtering ─────────────────────────────
  function shouldTranslateNode(node) {
    if (!node || !node.parentNode) return false;
    if (SKIP_TAGS.has(node.tagName)) return false;

    var el = node;
    while (el && el !== document.body) {
      if (el.classList && el.classList.length) {
        for (var i = 0; i < SKIP_PREFIXES.length; i++) {
          for (var c = 0; c < el.classList.length; c++) {
            if (el.classList[c].startsWith(SKIP_PREFIXES[i])) return false;
          }
        }
      }
      if (el.hasAttribute && el.hasAttribute('data-notranslate')) return false;
      el = el.parentElement;
    }
    return true;
  }

  function isMeaningfulText(text) {
    var t = text.trim();
    if (t.length < 2) return false;

    // Skip if already mostly Persian
    var faCount = (t.match(/[؀-ۿ]/g) || []).length;
    if (faCount / t.length > 0.3) return false;

    // Skip pure numbers/punctuation
    if (/^[\d\s.,!?;:()\-_\/\\"'«»‌]+$/.test(t)) return false;

    return true;
  }

  function collectTextNodes(root) {
    var nodes = [];
    var walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          if (node.nodeType !== Node.TEXT_NODE) return NodeFilter.FILTER_REJECT;
          if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          if (!shouldTranslateNode(node)) return NodeFilter.FILTER_REJECT;
          if (!isMeaningfulText(node.textContent)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      },
      false,
    );

    var node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
    }
    return nodes;
  }

  function chunkArray(arr, size) {
    var chunks = [];
    for (var i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  }

  // ─── Translation Engine ──────────────────────────────

  /**
   * Translate a single text string with retry logic.
   * Attempts up to MAX_TRANS_RETRIES times with exponential backoff.
   * Returns the translated text, or the original on failure.
   */
  async function translateText(text) {
    if (!text || !text.trim()) return text;

    var lastError = null;

    for (var attempt = 1; attempt <= MAX_TRANS_RETRIES; attempt++) {
      try {
        // Check network before fetching
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          log.warn(ERR.NETWORK_OFFLINE, 'Browser reports offline, translation skipped');
          return text;
        }

        var url =
          'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=fa&dt=t&q=' +
          encodeURIComponent(text);
        var resp = await fetch(url);

        if (!resp.ok) {
          if (resp.status === 429) {
            log.warn(ERR.TRANS_RATE_LIMIT, 'Rate limited by Google Translate', {
              status: 429,
              attempt: attempt,
            });
            // Rate limited — wait full backoff before retry
            if (attempt < MAX_TRANS_RETRIES) {
              await new Promise(function (r) {
                return setTimeout(r, RETRY_DELAY_MS * attempt * 2);
              });
            }
            continue;
          }
          throw new Error('HTTP ' + resp.status);
        }

        var data = await resp.json();
        if (data && data[0]) {
          return data[0]
            .map(function (s) {
              return s[0];
            })
            .join('');
        }

        log.warn(ERR.TRANS_EMPTY_RESULT, 'Translation returned empty result', {
          textLength: text.length,
        });
        return text;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_TRANS_RETRIES) {
          var delay = RETRY_DELAY_MS * attempt;
          log.warn(
            ERR.TRANS_API_FAILURE,
            'Translation attempt ' + attempt + ' failed, retrying...',
            {
              delay: delay,
              error: err.message,
            },
          );
          await new Promise(function (r) {
            return setTimeout(r, delay);
          });
        }
      }
    }

    // All retries exhausted
    log.error(
      ERR.TRANS_API_FAILURE,
      'Translation failed after ' + MAX_TRANS_RETRIES + ' attempts',
      {
        error: lastError ? lastError.message : 'Unknown',
      },
    );
    return text;
  }

  async function translateBatch(texts) {
    var SEP = ' ||| ';
    var combined = texts.join(SEP);
    var translated = await translateText(combined);
    var parts = translated.split(SEP);

    if (parts.length !== texts.length) {
      log.warn(ERR.TRANS_BATCH_MISMATCH, 'Batch translation returned wrong part count', {
        expected: texts.length,
        got: parts.length,
      });
      return texts;
    }
    return parts;
  }

  // ─── Translate Page ─────────────────────────────────

  /**
   * Translate all meaningful text nodes on the page.
   * Returns true if any text was translated, false otherwise.
   */
  async function translatePage() {
    if (STATE.translating) {
      log.info(ERR.TRANS_NO_TEXT, 'Translation already in progress, skipping');
      return false;
    }
    STATE.translating = true;

    try {
      var textNodes = collectTextNodes(document.body);
      if (textNodes.length === 0) {
        log.info(ERR.TRANS_NO_TEXT, 'No translatable text found on page');
        STATE.translating = false;
        return false;
      }

      log.info(null, 'Found ' + textNodes.length + ' text nodes to translate');

      // Deduplicate
      var textMap = Object.create(null);
      textNodes.forEach(function (node) {
        var t = node.textContent.trim();
        if (!textMap[t]) textMap[t] = [];
        textMap[t].push(node);
      });

      var uniqueTexts = Object.keys(textMap);
      var chunks = chunkArray(uniqueTexts, 15);
      var translatedCount = 0;

      for (var ci = 0; ci < chunks.length; ci++) {
        var chunk = chunks[ci];
        var translated = await translateBatch(chunk);
        for (var ti = 0; ti < chunk.length; ti++) {
          var original = chunk[ti];
          var translation = translated[ti];
          if (translation && translation !== original) {
            var nodes = textMap[original] || [];
            for (var ni = 0; ni < nodes.length; ni++) {
              nodes[ni].textContent = nodes[ni].textContent.replace(original, translation);
            }
            translatedCount++;
          }
        }
      }

      STATE.translated = translatedCount > 0;

      if (translatedCount > 0) {
        log.info(
          null,
          'Translated ' + translatedCount + ' unique texts across ' + chunks.length + ' batches',
        );
      } else {
        log.info(null, 'No new translations applied (all texts were already Persian)');
      }

      return STATE.translated;
    } catch (err) {
      log.error(ERR.TRANS_API_FAILURE, 'Page translation failed', {
        error: err.message,
        stack: err.stack ? err.stack.slice(0, 200) : undefined,
      });
      STATE.translated = false;
      return false;
    } finally {
      STATE.translating = false;
    }
  }

  // ─── RTL & Font Application ──────────────────────────
  function applyRTL() {
    try {
      document.documentElement.classList.add('rtl-translator-active');
    } catch (err) {
      log.error(ERR.RTL_APPLY_FAIL, 'Failed to apply RTL class', {
        error: err.message,
      });
    }
  }

  function removeRTL() {
    document.documentElement.classList.remove('rtl-translator-active');
  }

  function isRTLActive() {
    return document.documentElement.classList.contains('rtl-translator-active');
  }

  // ─── Banner UI ───────────────────────────────────────
  function createBanner() {
    if (document.querySelector('.rtl-translator-banner')) return;

    var banner = document.createElement('div');
    banner.className = 'rtl-translator-banner';
    banner.innerHTML =
      '<span class="rtl-translator-banner-text">' +
      ICON_SVG.globe +
      ' این صفحه به زبان <strong>' +
      (STATE.langDetected || 'غیر فارسی') +
      '</strong> است. آیا می‌خواهید ترجمه شود؟' +
      '</span>' +
      '<button class="rtl-translator-translate-btn">بله، ترجمه کن</button>' +
      '<button class="rtl-translator-rtl-btn">فقط RTL</button>' +
      '<button class="rtl-translator-dismiss-btn">فعلاً نه</button>' +
      '<button class="rtl-translator-close-btn">' +
      ICON_SVG.close +
      '</button>';

    document.body.prepend(banner);
    void banner.offsetHeight; // force reflow
    banner.classList.add('visible');

    banner
      .querySelector('.rtl-translator-translate-btn')
      .addEventListener('click', async function () {
        applyRTL();

        // Show loading state
        banner.querySelector('.rtl-translator-banner-text').innerHTML =
          ICON_SVG.loader + ' در حال ترجمه...';
        var btns = banner.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) btns[i].disabled = true;

        var ok = await translatePage();

        if (ok) {
          hideBanner(banner);
          saveState(true);
          log.notify('صفحه با موفقیت به فارسی ترجمه شد', 'info');
        } else {
          // Translation failed — show error state in banner
          banner.querySelector('.rtl-translator-banner-text').innerHTML =
            ICON_SVG.warning +
            ' ترجمه با خطا مواجه شد. ' +
            '<button class="rtl-translator-retry-btn" style="background:rgba(243,244,237,0.15);border:1px solid rgba(243,244,237,0.3);color:#f3f4ed;padding:4px 14px;border-radius:5px;cursor:pointer;font-family:inherit;font-size:12px;margin-right:8px;">تلاش مجدد</button>';
          for (var j = 0; j < btns.length; j++) btns[j].disabled = false;

          // Wire up retry button
          var retryBtn = banner.querySelector('.rtl-translator-retry-btn');
          if (retryBtn) {
            retryBtn.addEventListener('click', async function (e) {
              e.stopPropagation();
              retryBtn.disabled = true;
              banner.querySelector('.rtl-translator-banner-text').innerHTML =
                ICON_SVG.loader + ' در حال ترجمه...';
              for (var k = 0; k < btns.length; k++) btns[k].disabled = true;
              var retryOk = await translatePage();
              if (retryOk) {
                hideBanner(banner);
                saveState(true);
                log.notify('صفحه با موفقیت به فارسی ترجمه شد', 'info');
              } else {
                // Still failed — restore error state
                banner.querySelector('.rtl-translator-banner-text').innerHTML =
                  ICON_SVG.warning + ' ترجمه ناموفق. بعداً تلاش کنید.';
                for (var l = 0; l < btns.length; l++) btns[l].disabled = false;
                log.notify('ترجمه ناموفق — اتصال اینترنت خود را بررسی کنید', 'error');
              }
            });
          }
        }
      });

    banner.querySelector('.rtl-translator-rtl-btn').addEventListener('click', function () {
      applyRTL();
      hideBanner(banner);
      saveState(true);
      log.notify('حالت RTL فعال شد', 'info');
    });

    banner.querySelector('.rtl-translator-dismiss-btn').addEventListener('click', function () {
      hideBanner(banner);
      saveState(false);
    });

    banner.querySelector('.rtl-translator-close-btn').addEventListener('click', function () {
      hideBanner(banner);
      saveState(false);
    });

    STATE.bannerShown = true;
  }

  function hideBanner(banner) {
    if (!banner) banner = document.querySelector('.rtl-translator-banner');
    if (!banner) return;
    banner.classList.remove('visible');
    setTimeout(function () {
      banner.remove();
    }, 300);
    STATE.bannerShown = false;
  }

  // ─── Persistence ─────────────────────────────────────
  function saveState(activated) {
    try {
      var domain = window.location.hostname;
      var data = JSON.parse(localStorage.getItem('rtl_translator_state') || '{}');
      data[domain] = {
        active: activated,
        translated: STATE.translated,
        timestamp: Date.now(),
      };
      localStorage.setItem('rtl_translator_state', JSON.stringify(data));

      chrome.storage.local.set({
        rtl_state: data,
        last_domain: domain,
        last_active: activated,
      });
    } catch (e) {
      log.warn(ERR.STORAGE_WRITE_FAIL, 'Failed to persist state', {
        error: e.message,
        domain: window.location.hostname,
      });
    }
  }

  function loadState() {
    try {
      var domain = window.location.hostname;
      var data = JSON.parse(localStorage.getItem('rtl_translator_state') || '{}');
      return data[domain] || null;
    } catch (e) {
      log.warn(ERR.STORAGE_READ_FAIL, 'Failed to load persisted state', {
        error: e.message,
      });
      return null;
    }
  }

  // ─── Message Listener (Popup ↔ Content) ──────────────
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    switch (message.action) {
      case 'translate':
        applyRTL();
        translatePage().then(function (ok) {
          saveState(true);
          sendResponse({ success: ok, translated: STATE.translated });
        });
        return true; // async

      case 'apply_rtl':
        applyRTL();
        saveState(true);
        sendResponse({ success: true, rtl: true });
        break;

      case 'remove_rtl':
        removeRTL();
        saveState(false);
        sendResponse({ success: true, rtl: false });
        break;

      case 'toggle_rtl':
        if (isRTLActive()) {
          removeRTL();
          sendResponse({ success: true, rtl: false });
        } else {
          applyRTL();
          sendResponse({ success: true, rtl: true });
        }
        saveState(isRTLActive());
        break;

      case 'get_status':
        sendResponse({
          translated: STATE.translated,
          translating: STATE.translating,
          rtl: isRTLActive(),
          langDetected: STATE.langDetected,
          langCode: STATE.langCode,
          bannerShown: STATE.bannerShown,
        });
        break;

      case 'hide_banner':
        hideBanner();
        sendResponse({ success: true });
        break;
    }
  });

  // ─── Init ────────────────────────────────────────────
  async function init() {
    injectFonts();

    if (isPersianPage()) {
      STATE.langDetected = 'فارسی';
      STATE.langCode = 'fa';
      applyRTL();
      log.info(null, 'Persian page detected — RTL auto-applied');
      return;
    }

    STATE.langCode = getPageLanguage();
    STATE.langDetected =
      LANG_NAMES[STATE.langCode] || (STATE.langCode ? STATE.langCode.toUpperCase() : 'نامشخص');

    log.info(
      null,
      'Page language detected: ' + STATE.langDetected + ' (' + (STATE.langCode || '?') + ')',
    );

    // Restore previous state for this domain
    var saved = loadState();
    if (saved && saved.active) {
      applyRTL();
      log.info(null, 'Restored previous RTL state for domain');
      if (saved.translated) {
        translatePage().then(function (ok) {
          if (ok) log.info(null, 'Restored translation for domain');
        });
      }
      return;
    }

    // Check auto-banner preference
    chrome.storage.local.get(['auto_banner'], function (result) {
      if (result.auto_banner === false) return;
      setTimeout(function () {
        if (!STATE.bannerShown && !isRTLActive()) createBanner();
      }, 1500);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
