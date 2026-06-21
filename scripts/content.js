/* ===================================================
   RTL Translator — Content Script
   Translation + RTL + Iran Yekan X Font
   =================================================== */

(function () {
  'use strict';

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
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT',
    'SVG', 'PATH', 'CODE', 'PRE', 'TEXTAREA', 'INPUT',
    'SELECT', 'OPTION', 'CANVAS', 'VIDEO', 'AUDIO',
  ]);
  const SKIP_PREFIXES = [
    'rtl-translator', 'fa-', 'notranslate', 'translate-ignore',
  ];
  const LANG_NAMES = {
    en: 'English', ar: 'العربية', de: 'Deutsch', fr: 'Français',
    es: 'Español', ru: 'Русский', zh: '中文', ja: '日本語',
    tr: 'Türkçe', ur: 'اردو', hi: 'हिन्दी', pt: 'Português',
    it: 'Italiano', nl: 'Nederlands', ko: '한국어', sv: 'Svenska',
    da: 'Dansk', fi: 'Suomi', no: 'Norsk', pl: 'Polski',
  };

  // ─── Font Injection (Iran Yekan X) ───────────────────
  function injectFonts() {
    if (document.getElementById('rtl-translator-fonts')) return;

    const style = document.createElement('style');
    style.id = 'rtl-translator-fonts';
    style.textContent = `
      @font-face {
        font-family: 'IRANYekanX';
        src: url('${chrome.runtime.getURL('fonts/IRANYekanX-Regular.ttf')}') format('truetype');
        font-weight: 400; font-style: normal; font-display: swap;
      }
      @font-face {
        font-family: 'IRANYekanX';
        src: url('${chrome.runtime.getURL('fonts/IRANYekanX-Medium.ttf')}') format('truetype');
        font-weight: 500; font-style: normal; font-display: swap;
      }
      @font-face {
        font-family: 'IRANYekanX';
        src: url('${chrome.runtime.getURL('fonts/IRANYekanX-DemiBold.ttf')}') format('truetype');
        font-weight: 600; font-style: normal; font-display: swap;
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Language Detection ──────────────────────────────
  function isPersianPage() {
    const htmlLang = (document.documentElement.lang || '').toLowerCase();
    if (PERSIAN_LANG_CODES.some(function (c) { return htmlLang.includes(c); })) return true;

    var meta = document.querySelector('meta[name="language"]');
    if (meta) {
      var content = (meta.getAttribute('content') || '').toLowerCase();
      if (PERSIAN_LANG_CODES.some(function (c) { return content.includes(c); })) return true;
    }

    // Sample body text — if >15% Persian chars, consider it Persian
    var textSample = (document.body && document.body.innerText || '').slice(0, 2000);
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
      false
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
  async function translateText(text) {
    if (!text || !text.trim()) return text;

    try {
      var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=fa&dt=t&q=' +
                encodeURIComponent(text);
      var resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      if (data && data[0]) {
        return data[0].map(function (s) { return s[0]; }).join('');
      }
      return text;
    } catch (err) {
      console.warn('[RTL Translator] Translation error:', err);
      return text;
    }
  }

  async function translateBatch(texts) {
    var SEP = ' ||| ';
    var combined = texts.join(SEP);
    var translated = await translateText(combined);
    var parts = translated.split(SEP);
    if (parts.length !== texts.length) return texts;
    return parts;
  }

  // ─── Translate Page ─────────────────────────────────
  async function translatePage() {
    if (STATE.translating) return;
    STATE.translating = true;

    try {
      var textNodes = collectTextNodes(document.body);
      if (textNodes.length === 0) {
        STATE.translating = false;
        return;
      }

      // Deduplicate
      var textMap = Object.create(null);
      textNodes.forEach(function (node) {
        var t = node.textContent.trim();
        if (!textMap[t]) textMap[t] = [];
        textMap[t].push(node);
      });

      var uniqueTexts = Object.keys(textMap);
      var chunks = chunkArray(uniqueTexts, 15);

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
          }
        }
      }

      STATE.translated = true;
    } catch (err) {
      console.error('[RTL Translator] Translation failed:', err);
    } finally {
      STATE.translating = false;
    }
  }

  // ─── RTL & Font Application ──────────────────────────
  function applyRTL() {
    document.documentElement.classList.add('rtl-translator-active');
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
        '🌐 این صفحه به زبان <strong>' + (STATE.langDetected || 'غیر فارسی') + '</strong> است. آیا می‌خواهید ترجمه شود؟' +
      '</span>' +
      '<button class="rtl-translator-translate-btn">بله، ترجمه کن</button>' +
      '<button class="rtl-translator-rtl-btn">فقط RTL</button>' +
      '<button class="rtl-translator-dismiss-btn">فعلاً نه</button>' +
      '<button class="rtl-translator-close-btn">&times;</button>';

    document.body.prepend(banner);
    void banner.offsetHeight; // force reflow
    banner.classList.add('visible');

    banner.querySelector('.rtl-translator-translate-btn').addEventListener('click', async function () {
      applyRTL();
      banner.querySelector('.rtl-translator-banner-text').innerHTML =
        '🔄 در حال ترجمه... <span class="rtl-translator-loading"></span>';
      var btns = banner.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
      await translatePage();
      hideBanner(banner);
      saveState(true);
    });

    banner.querySelector('.rtl-translator-rtl-btn').addEventListener('click', function () {
      applyRTL();
      hideBanner(banner);
      saveState(true);
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
    setTimeout(function () { banner.remove(); }, 300);
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
    } catch (e) { /* localStorage may be restricted */ }
  }

  function loadState() {
    try {
      var domain = window.location.hostname;
      var data = JSON.parse(localStorage.getItem('rtl_translator_state') || '{}');
      return data[domain] || null;
    } catch (e) { return null; }
  }

  // ─── Message Listener (Popup ↔ Content) ──────────────
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    switch (message.action) {
      case 'translate':
        applyRTL();
        translatePage().then(function () {
          saveState(true);
          sendResponse({ success: true, translated: STATE.translated });
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
      return;
    }

    STATE.langCode = getPageLanguage();
    STATE.langDetected = LANG_NAMES[STATE.langCode] ||
                         (STATE.langCode ? STATE.langCode.toUpperCase() : 'نامشخص');

    // Restore previous state for this domain
    var saved = loadState();
    if (saved && saved.active) {
      applyRTL();
      if (saved.translated) translatePage();
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
