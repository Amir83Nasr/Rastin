/* ===================================================
   Rastin — Content Script
   Translation + RTL + Iran Yekan X Font
   =================================================== */

(function () {
  'use strict';

  // ─── Logger ────────────────────────────────────────────
  var ERR = RastinErrors.CODE;
  var log = RastinErrors.createLogger('content');

  // ─── Translation Cache ──────────────────────────────
  // In-memory cache for translated texts.
  // Key: original text, Value: translated text.
  // Persisted to chrome.storage.local per domain for fast re-visits.
  var transCache = Object.create(null);
  var CACHE_KEY_PREFIX = 'rtl_cache_v1_';

  function loadTransCache() {
    try {
      var domain = window.location.hostname.replace(/[^a-z0-9]/g, '_');
      var key = CACHE_KEY_PREFIX + domain;
      var stored = localStorage.getItem(key);
      if (stored) {
        var data = JSON.parse(stored);
        // Expire cache after 24 hours
        if (data.ts && Date.now() - data.ts < 86400000 && data.cache) {
          transCache = data.cache;
          log.info(null, 'Loaded ' + Object.keys(transCache).length + ' cached translations');
        } else {
          localStorage.removeItem(key);
        }
      }
    } catch (e) {
      // Silent — cache is a nice-to-have
    }
  }

  function persistTransCache() {
    try {
      var domain = window.location.hostname.replace(/[^a-z0-9]/g, '_');
      var key = CACHE_KEY_PREFIX + domain;
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), cache: transCache }));
    } catch (e) {
      // Silent — quota exceeded, just don't persist
    }
  }

  // Load cache on init
  loadTransCache();

  // ─── State ───────────────────────────────────────────
  const STATE = {
    translated: false,
    translating: false,
    bannerShown: false,
    langDetected: null,
    langCode: null,
  };

  // ─── Original Text Store ──────────────────────────────
  // Maps TextNode → its pre-translation textContent so we can
  // restore the page without a full reload.
  var _originalTexts = null; // lazy-allocated on first translate

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
  const BATCH_SIZE = 30;
  const BATCH_CONCURRENCY = 3;

  // ─── Code Detection (from module) ────────────────────
  var shouldTranslateNode = CodeDetection.createShouldTranslateNode(SKIP_TAGS, SKIP_PREFIXES);

  // ─── Rate-limit circuit breaker (429 streaks) ──────
  var _rateLimitStreak = 0;
  var RATE_LIMIT_CIRCUIT_MS = 3000;

  // ─── Font Injection (Iran Yekan X + Cartograph CF) ──
  function injectFonts() {
    if (document.getElementById('rtl-translator-fonts')) return;

    try {
      const style = document.createElement('style');
      style.id = 'rtl-translator-fonts';
      style.textContent =
        '@font-face {' +
        "font-family:'IRANYekanX';" +
        "src:url('" +
        chrome.runtime.getURL('fonts/IRANYekanX/IRANYekanX-Regular.ttf') +
        "') format('truetype');" +
        'font-weight:400;font-style:normal;font-display:swap;}' +
        '@font-face {' +
        "font-family:'IRANYekanX';" +
        "src:url('" +
        chrome.runtime.getURL('fonts/IRANYekanX/IRANYekanX-Medium.ttf') +
        "') format('truetype');" +
        'font-weight:500;font-style:normal;font-display:swap;}' +
        '@font-face {' +
        "font-family:'IRANYekanX';" +
        "src:url('" +
        chrome.runtime.getURL('fonts/IRANYekanX/IRANYekanX-DemiBold.ttf') +
        "') format('truetype');" +
        'font-weight:600;font-style:normal;font-display:swap;}' +
        '@font-face {' +
        "font-family:'Cartograph CF';" +
        "src:url('" +
        chrome.runtime.getURL('fonts/Cartograph CF/CartographCF.otf') +
        "') format('opentype');" +
        'font-weight:400;font-style:normal;font-display:swap;}';
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
  // shouldTranslateNode is provided by the CodeDetection module
  // (initialized using SKIP_TAGS / SKIP_PREFIXES above)

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

  /**
   * Determine which unique texts are visible in the viewport.
   * Samples text-node parent elements (up to 200) with a 500px
   * buffer around the viewport.  Used for progressive rendering.
   * @param {Text[]} textNodes
   * @returns {Set<string>|null}  set of visible unique texts,
   *                              or null if too few nodes to bother
   */
  function getVisibleTexts(textNodes) {
    if (!textNodes || textNodes.length < 30) return null;

    var viewportHeight = window.innerHeight;
    var visibleSet = {};
    var seenParents = new WeakSet();
    var samples = 0;
    var MAX_SAMPLES = 200;
    var BUFFER = 500;

    for (var i = 0; i < textNodes.length && samples < MAX_SAMPLES; i++) {
      var n = textNodes[i];
      var parent = n.parentElement;
      if (!parent || seenParents.has(parent)) continue;
      seenParents.add(parent);
      samples++;

      try {
        var rect = parent.getBoundingClientRect();
        if (rect.top < viewportHeight + BUFFER && rect.bottom > -BUFFER) {
          var t = n.textContent.trim();
          if (t) visibleSet[t] = true;
        }
      } catch (_) {
        // detached node — skip silently
      }
    }

    return Object.keys(visibleSet).length > 0 ? visibleSet : null;
  }

  // ─── Translation Engine ──────────────────────────────

  /**
   * Translate a single text string with retry logic.
   * Attempts up to MAX_TRANS_RETRIES times with exponential backoff.
   * Returns the translated text, or the original on failure.
   */
  async function translateText(text) {
    if (!text || !text.trim()) return text;

    // Memory cache hit — skip API entirely
    if (transCache[text]) return transCache[text];

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
            _rateLimitStreak++;
            log.warn(ERR.TRANS_RATE_LIMIT, 'Rate limited by Google Translate', {
              status: 429,
              attempt: attempt,
              streak: _rateLimitStreak,
            });
            // Circuit breaker: after 3+ consecutive 429s, add extra delay
            var circuitDelay = _rateLimitStreak >= 3 ? RATE_LIMIT_CIRCUIT_MS : 0;
            if (attempt < MAX_TRANS_RETRIES) {
              await new Promise(function (r) {
                return setTimeout(r, RETRY_DELAY_MS * attempt * 2 + circuitDelay);
              });
            }
            continue;
          }
          throw new Error('HTTP ' + resp.status);
        }

        // Success — reset rate-limit streak
        _rateLimitStreak = 0;

        var data = await resp.json();
        if (data && data[0]) {
          var result = data[0]
            .map(function (s) {
              return s[0];
            })
            .join('');
          // Store in cache
          transCache[text] = result;
          return result;
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

  /**
   * Translate a batch of texts, with individual caching.
   * Only texts NOT in cache are sent to the API.
   */
  async function translateBatch(texts) {
    var SEP = ' ||| ';
    var results = new Array(texts.length);
    var uncached = [];
    var uncachedIndexes = [];

    // Phase 1: collect cache hits & build uncached list
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      if (transCache[t]) {
        results[i] = transCache[t];
      } else {
        results[i] = null; // placeholder
        uncached.push(t);
        uncachedIndexes.push(i);
      }
    }

    // All cache hits — no API call needed
    if (uncached.length === 0) return results;

    // Phase 2: send only uncached texts to API
    var combined = uncached.join(SEP);
    var translated = await translateText(combined);
    var parts = translated.split(SEP);

    // Error recovery: if split result doesn't match expected count,
    // retry each text individually to isolate problematic entries
    if (parts.length !== uncached.length) {
      log.warn(ERR.TRANS_BATCH_MISMATCH, 'Batch split mismatch, retrying individually', {
        expected: uncached.length,
        got: parts.length,
      });
      for (var r = 0; r < uncached.length; r++) {
        var singleIdx = uncachedIndexes[r];
        var singleOrig = texts[singleIdx];
        var singleResult = await translateText(singleOrig);
        results[singleIdx] = singleResult;
        transCache[singleOrig] = singleResult;
      }
      persistTransCache();
      return results;
    }

    // Phase 3: fill in results & update cache
    for (var j = 0; j < uncached.length; j++) {
      var idx = uncachedIndexes[j];
      var original = texts[idx];
      var translation = parts[j] || original;
      results[idx] = translation;
      // Cache individual result
      transCache[original] = translation;
    }

    // Periodically persist cache (every 20 unique translations)
    persistTransCache();

    return results;
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

      // Progressive rendering: sort visible texts first so the
      // worker pool processes them before off-screen content.
      var visibleTexts = getVisibleTexts(textNodes);
      if (visibleTexts) {
        uniqueTexts.sort(function (a, b) {
          var aVis = visibleTexts[a] ? 0 : 1;
          var bVis = visibleTexts[b] ? 0 : 1;
          return aVis - bVis;
        });
      }

      var chunks = chunkArray(uniqueTexts, BATCH_SIZE);
      var batchResults;

      log.info(
        null,
        'Translating ' +
          uniqueTexts.length +
          ' unique texts in ' +
          chunks.length +
          ' batches (concurrency: ' +
          BATCH_CONCURRENCY +
          ')',
      );

      // ── Phase 1: parallel API calls ──────────────────────
      // Run up to BATCH_CONCURRENCY translateBatch calls in
      // parallel.  Each batch is independent, so no races.
      batchResults = new Array(chunks.length);
      var chunkQueue = chunks.map(function (chunk, idx) {
        return { chunk: chunk, idx: idx };
      });

      async function batchWorker() {
        while (chunkQueue.length) {
          var item = chunkQueue.shift();
          batchResults[item.idx] = await translateBatch(item.chunk);
        }
      }

      var workers = [];
      var workerCount = Math.min(BATCH_CONCURRENCY, chunks.length);
      for (var w = 0; w < workerCount; w++) {
        workers.push(batchWorker());
      }
      await Promise.all(workers);

      // ── Phase 2: batch DOM updates via requestAnimationFrame ──
      // Collect all (node → translation) updates into closures,
      // then apply them inside rAF so the browser batches all
      // style invalidations into one layout pass per frame.
      var translatedCount = 0;
      var domUpdates = [];
      var BATCH_DOM_PER_FRAME = 500;

      for (var ci = 0; ci < chunks.length; ci++) {
        var chunk = chunks[ci];
        var translated = batchResults[ci] || chunk;
        for (var ti = 0; ti < chunk.length; ti++) {
          var original = chunk[ti];
          var translation = translated[ti];
          if (translation && translation !== original) {
            var nodes = textMap[original] || [];
            for (var ni = 0; ni < nodes.length; ni++) {
              (function (n, o, t) {
                // Save original text for restoration (first time only)
                if (!_originalTexts) _originalTexts = new Map();
                if (!_originalTexts.has(n)) {
                  _originalTexts.set(n, n.textContent);
                }
                domUpdates.push(function () {
                  if (n.textContent === o) {
                    n.textContent = t;
                  } else {
                    n.textContent = n.textContent.replace(o, t);
                  }
                });
              })(nodes[ni], original, translation);
            }
            translatedCount++;
          }
        }
      }

      // Apply DOM updates in rAF batches (one frame per batch)
      if (domUpdates.length > 0) {
        for (var start = 0; start < domUpdates.length; start += BATCH_DOM_PER_FRAME) {
          var end = Math.min(start + BATCH_DOM_PER_FRAME, domUpdates.length);
          var frameBatch = domUpdates.slice(start, end);
          await new Promise(function (resolve) {
            requestAnimationFrame(function () {
              for (var i = 0; i < frameBatch.length; i++) frameBatch[i]();
              resolve();
            });
          });
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
  // ─── Code blocks that must stay LTR ────────────────
  var CODE_LTR_TAGS = ['CODE', 'PRE', 'KBD', 'SAMP', 'TT'];

  /**
   * Apply RTL to the page.
   * Also forces LTR direction on code/technical elements
   * so indentation, punctuation, and code comments stay intact.
   * Tracks original dir values via data-rastin-orig-dir for cleanup.
   */
  function applyRTL() {
    try {
      document.documentElement.classList.add('rtl-translator-active');

      // Force LTR on code blocks
      for (var t = 0; t < CODE_LTR_TAGS.length; t++) {
        var els = document.querySelectorAll(CODE_LTR_TAGS[t].toLowerCase());
        for (var e = 0; e < els.length; e++) {
          var el = els[e];
          // Skip if already explicitly LTR or RTL
          var cur = el.getAttribute('dir');
          if (cur === 'ltr' || cur === 'rtl') continue;
          el.setAttribute('data-rastin-dir', cur || '');
          el.setAttribute('dir', 'ltr');
        }
      }
    } catch (err) {
      log.error(ERR.RTL_APPLY_FAIL, 'Failed to apply RTL class', {
        error: err.message,
      });
    }
  }

  function removeRTL() {
    document.documentElement.classList.remove('rtl-translator-active');

    // Restore original dir on code blocks
    var marked = document.querySelectorAll('[data-rastin-dir]');
    for (var i = 0; i < marked.length; i++) {
      var el = marked[i];
      var orig = el.getAttribute('data-rastin-dir');
      if (orig) {
        el.setAttribute('dir', orig);
      } else {
        el.removeAttribute('dir');
      }
      el.removeAttribute('data-rastin-dir');
    }
  }

  function isRTLActive() {
    return document.documentElement.classList.contains('rtl-translator-active');
  }

  // ─── Font Persistence (independent of RTL state) ────
  /**
   * Injects a font-family style that stays active even when RTL
   * is toggled off.  Prevents Persian text from rendering without
   * IRANYekanX (broken ligatures, bad spacing).
   */
  function ensurePersistedFont() {
    if (document.getElementById('rtl-translator-persist-font')) return;
    var s = document.createElement('style');
    s.id = 'rtl-translator-persist-font';
    s.textContent =
      'html.rtl-translator-has-fa body,' +
      'html.rtl-translator-has-fa p,' +
      'html.rtl-translator-has-fa h1,html.rtl-translator-has-fa h2,' +
      'html.rtl-translator-has-fa h3,html.rtl-translator-has-fa h4,' +
      'html.rtl-translator-has-fa h5,html.rtl-translator-has-fa h6,' +
      'html.rtl-translator-has-fa span,html.rtl-translator-has-fa div,' +
      'html.rtl-translator-has-fa li,html.rtl-translator-has-fa a,' +
      'html.rtl-translator-has-fa label,html.rtl-translator-has-fa td,' +
      'html.rtl-translator-has-fa th,html.rtl-translator-has-fa blockquote,' +
      'html.rtl-translator-has-fa figcaption,' +
      'html.rtl-translator-has-fa caption,html.rtl-translator-has-fa cite,' +
      'html.rtl-translator-has-fa summary {' +
      "font-family:'IRANYekanX','Tahoma','Vazirmatn',sans-serif !important;}";
    document.head.appendChild(s);
    document.documentElement.classList.add('rtl-translator-has-fa');
  }

  function removePersistedFont() {
    document.documentElement.classList.remove('rtl-translator-has-fa');
    var s = document.getElementById('rtl-translator-persist-font');
    if (s) s.remove();
  }

  // ─── Remove Translation (no page reload) ────────────
  /**
   * Restore all text nodes to their original pre-translation text.
   * Uses _originalTexts Map — no API calls, no DOM walk, instant.
   * @returns {boolean}  true if any nodes were restored
   */
  function removeTranslation() {
    if (!_originalTexts || _originalTexts.size === 0) return false;

    var count = 0;
    _originalTexts.forEach(function (original, node) {
      try {
        node.textContent = original;
        count++;
      } catch (_) {
        // detached node — skip silently
      }
    });
    _originalTexts.clear();
    STATE.translated = false;
    removePersistedFont();
    log.info(null, 'Restored ' + count + ' text nodes to original language');
    return count > 0;
  }

  /**
   * Full reset: remove translation, remove RTL, persist state.
   * No page reload needed — instant restoration.
   */
  function resetAll() {
    removeTranslation();
    if (isRTLActive()) removeRTL();
    saveState(false);
    log.notify('صفحه به حالت اولیه بازگشت', 'success');
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
          ensurePersistedFont();
          log.notify('صفحه با موفقیت به فارسی ترجمه شد', 'success');
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
                log.notify('صفحه با موفقیت به فارسی ترجمه شد', 'success');
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
      log.notify('حالت RTL فعال شد', 'success');
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
          if (ok) ensurePersistedFont();
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
          hasOriginals: !!(_originalTexts && _originalTexts.size > 0),
        });
        break;

      case 'remove_translation':
        sendResponse({ success: removeTranslation() });
        break;

      case 'reset_all':
        resetAll();
        sendResponse({ success: true });
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
          if (ok) {
            ensurePersistedFont();
            log.info(null, 'Restored translation for domain');
          }
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
