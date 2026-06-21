/* ===================================================
   Rastin — Content Script
   Translation + RTL + Iran Yekan X Font
   =================================================== */

(function () {
  'use strict';

  // ─── Logger ────────────────────────────────────────────
  var ERR = RastinErrors.CODE;
  var log = RastinErrors.createLogger('content');

  /** Check extension context is still valid (not reloaded/updated). */
  function isExtensionValid() {
    try {
      return !!chrome.runtime.id;
    } catch (_) {
      return false;
    }
  }

  // ─── Translation Cache ──────────────────────────────
  // In-memory cache for translated texts.
  // Key: original text, Value: translated text.
  // Persisted to chrome.storage.session (MV3 in-memory, shared across
  // all tabs of this extension — no manual expiry needed).
  var transCache = Object.create(null);
  var SESSION_CACHE_KEY = 'rtl_trans_cache';
  var LOCAL_CACHE_KEY = 'rtl_trans_cache_v2';
  var MAX_CACHE_ENTRIES = 1000;

  /** Load cache from chrome.storage.session, falling back to localStorage. */
  function sessionLoadCache() {
    return new Promise(function (resolve) {
      if (!isExtensionValid()) {
        resolve();
        return;
      }
      chrome.storage.session.get([SESSION_CACHE_KEY], function (result) {
        try {
          var stored = result[SESSION_CACHE_KEY];
          if (stored) {
            transCache = stored;
            log.info(
              null,
              'Loaded ' + Object.keys(transCache).length + ' cached translations (session)',
            );
          }
        } catch (_) {
          /* best-effort */
        }

        // Fall back to localStorage if session storage was empty
        if (Object.keys(transCache).length === 0) {
          try {
            var local = localStorage.getItem(LOCAL_CACHE_KEY);
            if (local) {
              var parsed = JSON.parse(local);
              if (parsed && typeof parsed === 'object') {
                transCache = parsed;
                log.info(
                  null,
                  'Loaded ' +
                    Object.keys(transCache).length +
                    ' cached translations (localStorage)',
                );
              }
            }
          } catch (_) {
            /* best-effort */
          }
        }

        resolve();
      });
    });
  }

  /**
   * Trim the in-memory cache if it exceeds MAX_CACHE_ENTRIES.
   * Keeps the most-recently-added entries (insertion order on string keys).
   */
  function trimCache() {
    var keys = Object.keys(transCache);
    if (keys.length > MAX_CACHE_ENTRIES) {
      var trimmed = Object.create(null);
      var start = keys.length - Math.floor(MAX_CACHE_ENTRIES / 2);
      for (var ki = start; ki < keys.length; ki++) {
        trimmed[keys[ki]] = transCache[keys[ki]];
      }
      transCache = trimmed;
      log.info(null, 'Trimmed cache to ' + Math.floor(MAX_CACHE_ENTRIES / 2) + ' entries');
    }
  }

  /** Debounced persist (2s debounce, or immediate if >50 entries). */
  var _cachePersistTimer = null;
  function sessionPersistCache() {
    if (_cachePersistTimer) clearTimeout(_cachePersistTimer);
    var cacheSize = Object.keys(transCache).length;
    if (cacheSize > 50) {
      flushCacheToStorage();
    } else {
      _cachePersistTimer = setTimeout(flushCacheToStorage, 2000);
    }
  }

  function flushCacheToStorage() {
    _cachePersistTimer = null;
    if (!isExtensionValid()) return;

    // 1. Persist to chrome.storage.session (shared across tabs)
    var data = {};
    data[SESSION_CACHE_KEY] = transCache;
    chrome.storage.session.set(data, function () {
      /* best-effort */
    });

    // 2. Persist to localStorage (cross-session — survives browser restart)
    try {
      trimCache();
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(transCache));
    } catch (_) {
      /* localStorage may be full — silently ignore */
    }
  }

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
  const BATCH_CONCURRENCY = 5;

  // ─── Code Detection (from module) ────────────────────
  var shouldTranslateNode = CodeDetection.createShouldTranslateNode(SKIP_TAGS, SKIP_PREFIXES);

  // ─── Rate-limit circuit breaker (429 streaks) ──────
  var _rateLimitStreak = 0;
  var RATE_LIMIT_CIRCUIT_MS = 3000;

  // ─── Adaptive concurrency tracking ─────────────────
  var _avgLatency = 0;
  var _latencySamples = 0;
  var ADAPTIVE_MIN_CONCURRENCY = 2;
  var ADAPTIVE_MAX_CONCURRENCY = 10;

  function getAdaptiveConcurrency() {
    if (_latencySamples < 3) return BATCH_CONCURRENCY;
    if (_avgLatency < 500) return ADAPTIVE_MAX_CONCURRENCY;
    if (_avgLatency > 2000) return ADAPTIVE_MIN_CONCURRENCY;
    var ratio = (2000 - _avgLatency) / 1500;
    return Math.round(
      ADAPTIVE_MIN_CONCURRENCY + ratio * (ADAPTIVE_MAX_CONCURRENCY - ADAPTIVE_MIN_CONCURRENCY),
    );
  }

  function trackLatency(ms) {
    if (ms > 10000) return;
    _avgLatency = (_avgLatency * _latencySamples + ms) / (_latencySamples + 1);
    _latencySamples++;
  }

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

      // Preconnect to Google Translate API — shaves ~100-300ms
      // off the first translation request by doing DNS + TCP + TLS
      // handshake early.
      var preconnect = document.createElement('link');
      preconnect.rel = 'preconnect';
      preconnect.href = 'https://translate.googleapis.com';
      document.head.appendChild(preconnect);
    } catch (err) {
      log.error(ERR.FONT_INJECT_FAIL, 'Failed to inject fonts', {
        error: err.message,
      });
    }
  }

  // ─── Connection Warm-up ─────────────────────────────
  /**
   * Send a tiny warm-up request to the Google Translate API so the
   * TCP+TLS handshake completes before the first real translation
   * request.  Best-effort — failures are silently ignored.
   */
  function warmupConnection() {
    if (!isExtensionValid()) return;
    fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=fa&dt=t&q=.', {
      keepalive: true,
    }).catch(function () {
      /* best-effort — failure is harmless */
    });
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
    var seenShadows = new WeakSet();

    function walkTree(nodeRoot) {
      var walker = document.createTreeWalker(
        nodeRoot,
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

      // Discover open shadow roots in the same pass
      var elWalker = document.createTreeWalker(nodeRoot, NodeFilter.SHOW_ELEMENT, null, false);
      var el;
      while ((el = elWalker.nextNode())) {
        if (el.shadowRoot && !seenShadows.has(el.shadowRoot)) {
          seenShadows.add(el.shadowRoot);
          walkTree(el.shadowRoot);
        }
      }
    }

    walkTree(root);
    return nodes;
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

        var apiStartTime = Date.now();
        var url =
          'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=fa&dt=t&q=' +
          encodeURIComponent(text);
        var resp = await fetch(url, { keepalive: true });

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
        trackLatency(Date.now() - apiStartTime);

        var data = await resp.json();
        if (data && data[0]) {
          var result = data[0]
            .map(function (s) {
              return s[0];
            })
            .join('');
          // Store in cache
          transCache[text] = result;

          // Extract detected source language from API response
          // data[2] is the detected language code (e.g. "en", "de", "ar")
          if (data[2] && data[2] !== STATE.langCode) {
            STATE.langCode = data[2];
            STATE.langDetected = LANG_NAMES[data[2]] || data[2].toUpperCase();
            log.info(null, 'Source language detected: ' + STATE.langDetected);
          }

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
   * Translate multiple texts in a single API call using the `|||` separator.
   * ~95% fewer HTTP requests compared to one-at-a-time translation.
   *
   * Checks cache for each text individually; only uncached texts are sent.
   * On batch-split mismatch (API returns wrong count), falls back to
   * individual translateText() calls for that batch.
   *
   * @param {string[]} texts  Array of original texts (up to BATCH_SIZE)
   * @returns {Promise<string[]>}  Translated texts in the same order
   */
  async function translateBatch(texts) {
    if (!texts || texts.length === 0) return [];
    if (texts.length === 1) return [await translateText(texts[0])];

    // Phase 1: separate cache hits from uncached
    var results = new Array(texts.length);
    var uncached = [];
    var uncachedIdx = [];

    for (var ti = 0; ti < texts.length; ti++) {
      if (transCache[texts[ti]]) {
        results[ti] = transCache[texts[ti]];
      } else {
        uncached.push(texts[ti]);
        uncachedIdx.push(ti);
      }
    }

    if (uncached.length === 0) return results;
    if (uncached.length === 1) {
      results[uncachedIdx[0]] = await translateText(uncached[0]);
      return results;
    }

    // Phase 2: batch-translate uncached texts
    var lastError = null;

    for (var attempt = 1; attempt <= MAX_TRANS_RETRIES; attempt++) {
      try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          log.warn(ERR.NETWORK_OFFLINE, 'Browser reports offline, batch skipped');
          // Fall back to individual (will return originals after retries)
          for (var ui = 0; ui < uncached.length; ui++) {
            results[uncachedIdx[ui]] = await translateText(uncached[ui]);
          }
          return results;
        }

        var apiStartTime = Date.now();
        // Join uncached texts with ||| separator — the Google Translate API
        // supports batched queries this way.  Each text is individually
        // encoded so the ||| delimiter stays un-encoded.
        var encodedParts = uncached.map(function (t) {
          return encodeURIComponent(t);
        });
        var qParam = encodedParts.join('|||');
        var url =
          'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=fa&dt=t&q=' +
          qParam;
        var resp = await fetch(url, { keepalive: true });

        if (!resp.ok) {
          if (resp.status === 429) {
            _rateLimitStreak++;
            log.warn(ERR.TRANS_RATE_LIMIT, 'Rate limited on batch translate', {
              status: 429,
              attempt: attempt,
              streak: _rateLimitStreak,
            });
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
        trackLatency(Date.now() - apiStartTime);

        var data = await resp.json();
        if (data && data[0]) {
          // data[0] is an array of [translation, original, ...] tuples
          var batchResults = data[0].map(function (s) {
            return s[0];
          });

          // Check for split mismatch — API may return wrong count
          if (batchResults.length !== uncached.length) {
            log.warn(
              ERR.TRANS_EMPTY_RESULT,
              'Batch split mismatch: expected ' +
                uncached.length +
                ', got ' +
                batchResults.length +
                ' — falling back to individual translation',
            );
            for (var fallbackIdx = 0; fallbackIdx < uncached.length; fallbackIdx++) {
              results[uncachedIdx[fallbackIdx]] = await translateText(uncached[fallbackIdx]);
            }
            return results;
          }

          // Merge batch results with cache
          for (var ri = 0; ri < uncached.length; ri++) {
            var translated = batchResults[ri];
            transCache[uncached[ri]] = translated;
            results[uncachedIdx[ri]] = translated;
          }

          // Extract detected source language from API response (data[2])
          if (data[2] && data[2] !== STATE.langCode) {
            STATE.langCode = data[2];
            STATE.langDetected = LANG_NAMES[data[2]] || data[2].toUpperCase();
            log.info(null, 'Source language detected: ' + STATE.langDetected);
          }

          return results;
        }

        log.warn(ERR.TRANS_EMPTY_RESULT, 'Batch translation returned empty result', {
          batchSize: uncached.length,
        });
        // Fall back to individual calls
        for (var emptyIdx = 0; emptyIdx < uncached.length; emptyIdx++) {
          results[uncachedIdx[emptyIdx]] = await translateText(uncached[emptyIdx]);
        }
        return results;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_TRANS_RETRIES) {
          var delay = RETRY_DELAY_MS * attempt;
          log.warn(
            ERR.TRANS_API_FAILURE,
            'Batch translation attempt ' + attempt + ' failed, retrying...',
            {
              batchSize: uncached.length,
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

    // All retries exhausted — fall back to individual calls
    log.warn(
      ERR.TRANS_API_FAILURE,
      'Batch translation failed after ' +
        MAX_TRANS_RETRIES +
        ' attempts, falling back to individual',
      { batchSize: uncached.length, error: lastError ? lastError.message : 'Unknown' },
    );
    for (var exIdx = 0; exIdx < uncached.length; exIdx++) {
      results[uncachedIdx[exIdx]] = await translateText(uncached[exIdx]);
    }
    return results;
  }

  // ─── DOM Update Helper (rAF-batched) ──────────────────
  /**
   * Build DOM-update closures from chunk results and apply
   * them via requestAnimationFrame (500 updates per frame).
   * @returns {number}  count of unique texts that changed
   */
  // ─── (Streaming pipeline handles all DOM updates inline via rAF) ──

  // ─── (No auto-MutationObserver — translation only on user command) ──

  // ─── Site-specific Translation Root ──────────────────
  /**
   * On site-specific pages (e.g. GitHub), only translate the main
   * content area (README preview) instead of the entire page.
   * Falls back to document.body for all other sites.
   *
   * @returns {Element}  The root element to collect text nodes from.
   */
  function getTranslationRoot() {
    var host = window.location.hostname;

    // GitHub: only translate the README preview (markdown body)
    if (host === 'github.com' || host.endsWith('.github.com')) {
      var readme =
        document.querySelector('article.markdown-body') ||
        document.querySelector('.repository-content article.markdown-body') ||
        document.querySelector('#readme');
      if (readme) {
        log.info(null, 'GitHub README detected — scoping translation to README area');
        return readme;
      }
    }

    // YouTube: on watch pages, scope to #primary (player + title + description + comments)
    if (host === 'www.youtube.com' && window.location.pathname.startsWith('/watch')) {
      var primary = document.querySelector('#primary');
      if (primary) {
        log.info(null, 'YouTube watch page detected — scoping translation to primary content');
        return primary;
      }
    }

    // All other sites: translate the whole page
    return document.body;
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
    showTranslationProgress();

    try {
      // Determine translation root — on GitHub this is the README area only
      var transRoot = getTranslationRoot();
      if (!transRoot) {
        log.info(ERR.TRANS_NO_TEXT, 'No translatable root element found');
        STATE.translating = false;
        hideTranslationProgress();
        return false;
      }

      // Short-circuit: no meaningful text on page
      var bodyText = ((transRoot && transRoot.innerText) || '').trim();
      if (bodyText.length < 10) {
        log.info(ERR.TRANS_NO_TEXT, 'Page body has no meaningful text, skipping');
        STATE.translating = false;
        hideTranslationProgress();
        return false;
      }

      var textNodes = collectTextNodes(transRoot);
      if (textNodes.length === 0) {
        log.info(ERR.TRANS_NO_TEXT, 'No translatable text found on page');
        STATE.translating = false;
        hideTranslationProgress();
        return false;
      }

      log.info(null, 'Found ' + textNodes.length + ' text nodes to translate');

      // Deduplicate with Map for O(1) access
      var textMap = new Map();
      textNodes.forEach(function (node) {
        var t = node.textContent.trim();
        if (!textMap.has(t)) textMap.set(t, []);
        textMap.get(t).push(node);
      });

      var uniqueTexts = Array.from(textMap.keys());

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

      // ── Streaming pipeline: single shared queue + rAF DOM flush ──
      var translatedCount = 0;
      var concurrency = getAdaptiveConcurrency();
      var DOM_BUDGET_MS = 8;
      var domBatchSize = 100;

      var workQueue = uniqueTexts.map(function (t) {
        return t;
      });
      var domQueue = [];
      var domScheduled = false;
      var domFlushResolve = null;

      log.info(
        null,
        'Translating ' + uniqueTexts.length + ' unique texts (concurrency: ' + concurrency + ')',
      );

      function scheduleDOMFlush() {
        if (domScheduled) return;
        domScheduled = true;
        requestAnimationFrame(function () {
          domScheduled = false;
          var startTime = performance.now();
          var batch = domQueue.splice(0, domBatchSize);
          var count = 0;

          for (var di = 0; di < batch.length; di++) {
            var dItem = batch[di];
            var dNodes = textMap.get(dItem.original) || [];
            for (var dni = 0; dni < dNodes.length; dni++) {
              (function (n, o, t) {
                if (!_originalTexts) _originalTexts = new Map();
                if (!_originalTexts.has(n)) {
                  _originalTexts.set(n, n.textContent);
                }
                n.textContent = n.textContent === o ? t : n.textContent.replace(o, t);
              })(dNodes[dni], dItem.original, dItem.translated);
            }
            count++;
          }
          translatedCount += count;

          // Adjust batch size based on frame budget
          var elapsed = performance.now() - startTime;
          if (elapsed > DOM_BUDGET_MS && domBatchSize > 10) {
            domBatchSize = Math.max(10, Math.floor(domBatchSize * 0.8));
          } else if (elapsed < DOM_BUDGET_MS / 2 && domBatchSize < 1000) {
            domBatchSize = Math.min(1000, Math.floor(domBatchSize * 1.2));
          }

          if (domQueue.length > 0) scheduleDOMFlush();
          if (domFlushResolve && domQueue.length === 0 && workQueue.length === 0) {
            domFlushResolve();
            domFlushResolve = null;
          }
        });
      }

      async function streamWorker() {
        while (workQueue.length > 0) {
          // Pull a batch of texts (up to BATCH_SIZE) for a single API call
          var chunk = workQueue.splice(0, BATCH_SIZE);
          if (chunk.length === 0) break;

          var translatedBatch = await translateBatch(chunk);

          for (var bi = 0; bi < chunk.length; bi++) {
            var item = chunk[bi];
            var translated = translatedBatch[bi];
            if (translated !== item) {
              // Visible content: update DOM immediately — no rAF wait
              // so the user sees translated text as fast as the API responds.
              if (visibleTexts && visibleTexts[item]) {
                var visNodes = textMap.get(item) || [];
                for (var vi = 0; vi < visNodes.length; vi++) {
                  (function (n, o, t) {
                    if (!_originalTexts) _originalTexts = new Map();
                    if (!_originalTexts.has(n)) {
                      _originalTexts.set(n, n.textContent);
                    }
                    n.textContent = n.textContent === o ? t : n.textContent.replace(o, t);
                  })(visNodes[vi], item, translated);
                }
                translatedCount++;
              } else {
                // Off-screen content: queue for rAF-batched flush
                domQueue.push({ original: item, translated: translated });
                scheduleDOMFlush();
              }
            }
          }
        }
      }

      var poolSize = Math.min(concurrency, uniqueTexts.length);
      var workers = [];
      for (var w = 0; w < poolSize; w++) workers.push(streamWorker());
      await Promise.all(workers);

      // Wait for final DOM flush
      if (domQueue.length > 0) {
        await new Promise(function (resolve) {
          domFlushResolve = resolve;
        });
      }

      sessionPersistCache();

      STATE.translated = translatedCount > 0;

      if (translatedCount > 0) {
        log.info(null, 'Translated ' + translatedCount + ' unique texts across all chunks');
        // Close the banner after successful translation — whether triggered
        // from the banner itself, the popup, or a keyboard shortcut.
        hideBanner();
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
      hideTranslationProgress();
    }
  }

  // ─── RTL & Font Application ──────────────────────────
  // ─── Code blocks that must stay LTR ────────────────
  var CODE_LTR_TAGS = ['CODE', 'PRE', 'KBD', 'SAMP', 'TT'];

  /**
   * Apply RTL to the page (or to a scoped container on site-specific pages
   * like GitHub README — keeping site chrome/navigation LTR).
   *
   * Also forces LTR direction on code/technical elements
   * so indentation, punctuation, and code comments stay intact.
   * Tracks original dir values via data-rastin-dir for cleanup.
   */
  function applyRTL() {
    try {
      var root = getTranslationRoot();
      var isScoped = root !== document.body;

      if (isScoped) {
        // Scoped RTL — only affect the content container (e.g. GitHub README)
        root.setAttribute('dir', 'rtl');
        root.setAttribute('data-rastin-rtl', '');
      } else {
        // Full-page RTL
        document.documentElement.classList.add('rtl-translator-active');
      }

      // Force LTR on code blocks (scoped or full-page)
      var codeSelector = CODE_LTR_TAGS.map(function (t) {
        return t.toLowerCase();
      }).join(',');
      var codeEls = isScoped
        ? root.querySelectorAll(codeSelector)
        : document.querySelectorAll(codeSelector);
      for (var ci = 0; ci < codeEls.length; ci++) {
        var el = codeEls[ci];
        // Skip if already explicitly LTR or RTL
        var cur = el.getAttribute('dir');
        if (cur === 'ltr' || cur === 'rtl') continue;
        el.setAttribute('data-rastin-dir', cur || '');
        el.setAttribute('dir', 'ltr');
      }
    } catch (err) {
      log.error(ERR.RTL_APPLY_FAIL, 'Failed to apply RTL class', {
        error: err.message,
      });
    }
  }

  function removeRTL() {
    // Check for scoped RTL first
    var scoped = document.querySelector('[data-rastin-rtl]');
    if (scoped) {
      scoped.removeAttribute('dir');
      scoped.removeAttribute('data-rastin-rtl');
    } else {
      document.documentElement.classList.remove('rtl-translator-active');
    }

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
    return (
      document.documentElement.classList.contains('rtl-translator-active') ||
      !!document.querySelector('[data-rastin-rtl]')
    );
  }

  // ─── Font Persistence (independent of RTL state) ────
  /**
   * Injects a font-family style that stays active even when RTL
   * is toggled off.  Prevents Persian text from rendering without
   * IRANYekanX (broken ligatures, bad spacing).
   */
  function ensurePersistedFont() {
    // Scoped site (e.g., GitHub README) — font stays via [data-rastin-has-fa] CSS
    var scoped = document.querySelector('[data-rastin-rtl]');
    if (scoped) {
      scoped.setAttribute('data-rastin-has-fa', '');
      return;
    }

    // Full-page font persistence
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
    // Scoped site cleanup
    var scopedFa = document.querySelector('[data-rastin-has-fa]');
    if (scopedFa) {
      scopedFa.removeAttribute('data-rastin-has-fa');
    }

    // Full-page cleanup
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

        // Close banner immediately so the user sees the page right away.
        // Translation runs in the background.
        hideBanner(banner);

        var ok = await translatePage();

        if (ok) {
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

  // ─── Translation Progress Indicator ─────────────────
  var _progressEl = null;

  function showTranslationProgress() {
    if (_progressEl) return;
    _progressEl = document.createElement('div');
    _progressEl.className = 'rastin-progress';
    _progressEl.innerHTML =
      '<svg class="rtl-translator-loading-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> در حال ترجمه...';
    document.body.appendChild(_progressEl);
    void _progressEl.offsetHeight; // force reflow
    _progressEl.classList.add('visible');
  }

  function hideTranslationProgress() {
    if (!_progressEl) return;
    _progressEl.classList.remove('visible');
    setTimeout(function () {
      if (_progressEl) {
        _progressEl.remove();
        _progressEl = null;
      }
    }, 300);
  }

  // ─── Select-to-Translate ───────────────────────────
  var _selTooltip = null;

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  function createSelectionTooltip(rect) {
    removeSelectionTooltip();

    var tooltip = document.createElement('div');
    tooltip.className = 'rastin-sel-tooltip';
    tooltip.dir = 'rtl';
    tooltip.innerHTML =
      '<div class="rastin-sel-tooltip-body">' +
      '<button class="rastin-sel-translate-btn">' +
      ICON_SVG.globe +
      ' ترجمه' +
      '</button>' +
      '</div>';

    var top = rect.bottom + window.scrollY + 6;
    var left = rect.left + window.scrollX;
    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';

    // Edge-of-screen: right side
    if (left + 120 > window.innerWidth - 10) {
      tooltip.style.left = 'auto';
      tooltip.style.right = '10px';
    }

    // Edge-of-screen: bottom (place above selection)
    if (rect.bottom + 50 > window.innerHeight) {
      tooltip.style.top = rect.top + window.scrollY - 10 + 'px';
      tooltip.style.transform = 'translateY(-100%)';
    }

    document.body.appendChild(tooltip);
    _selTooltip = tooltip;

    tooltip.querySelector('.rastin-sel-translate-btn').addEventListener('click', function () {
      handleSelectionTranslate();
    });

    return tooltip;
  }

  function removeSelectionTooltip() {
    if (_selTooltip) {
      _selTooltip.remove();
      _selTooltip = null;
    }
  }

  function getTranslatableSelection() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

    var text = sel.toString().trim();
    if (!text || text.length < 2 || text.length > 5000) return null;

    // Check code context
    var range = sel.getRangeAt(0);
    var startNode = range.startContainer;
    if (!shouldTranslateNode(startNode)) return null;

    // Check: not already Persian
    var faCount = (text.match(/[؀-ۿ]/g) || []).length;
    if (faCount / text.length > 0.3) return null;

    // Skip pure numbers/punctuation
    var t = text;
    if (/^[\d\s.,!?;:()\-_\/\\"'«»‌]+$/.test(t)) return null;

    return { text: text, range: range };
  }

  function onSelectionMouseUp(e) {
    if (_selTooltip && _selTooltip.contains(e.target)) return;

    setTimeout(function () {
      var selData = getTranslatableSelection();
      if (!selData) {
        removeSelectionTooltip();
        return;
      }

      var rect = selData.range.getBoundingClientRect();
      if (!rect || rect.width === 0) {
        removeSelectionTooltip();
        return;
      }

      createSelectionTooltip(rect);
    }, 10);
  }

  /**
   * Async: translate selected text and show result in tooltip.
   * Exposed globally so background.js can trigger it via message.
   * @returns {Promise<string|null>}  translated text or null
   */
  async function handleSelectionTranslate() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      removeSelectionTooltip();
      return null;
    }

    var text = sel.toString().trim();
    if (!text) {
      removeSelectionTooltip();
      return null;
    }

    // Show loading
    if (_selTooltip) {
      var body = _selTooltip.querySelector('.rastin-sel-tooltip-body');
      if (body) {
        body.innerHTML =
          '<span class="rastin-sel-loading">' + ICON_SVG.loader + '  در حال ترجمه...</span>';
      }
    }

    try {
      var translated = await translateText(text);

      if (!_selTooltip) return null; // dismissed mid-translate

      // Show result in tooltip
      var resultBody = _selTooltip.querySelector('.rastin-sel-tooltip-body');
      if (resultBody) {
        resultBody.innerHTML =
          '<div class="rastin-sel-result">' +
          '<div class="rastin-sel-translated-text">' +
          escapeHtml(translated) +
          '</div>' +
          '<div class="rastin-sel-original-text">' +
          escapeHtml(text) +
          '</div>' +
          '</div>' +
          '<button class="rastin-sel-close-btn">' +
          ICON_SVG.close +
          '</button>';
      }

      var closeBtn = _selTooltip.querySelector('.rastin-sel-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          removeSelectionTooltip();
        });
      }

      sessionPersistCache();
      return translated;
    } catch (err) {
      log.warn(ERR.TRANS_API_FAILURE, 'Selection translation failed', { error: err.message });
      if (_selTooltip) {
        var errBody = _selTooltip.querySelector('.rastin-sel-tooltip-body');
        if (errBody) {
          errBody.innerHTML = '<span class="rastin-sel-error">ترجمه ناموفق. مجدد تلاش کنید.</span>';
        }
      }
      return null;
    }
  }

  // ─── Global event listeners for select-to-translate ────
  document.addEventListener('mouseup', onSelectionMouseUp);
  window.addEventListener('scroll', removeSelectionTooltip, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') removeSelectionTooltip();
  });
  document.addEventListener('mousedown', function (e) {
    if (_selTooltip && !_selTooltip.contains(e.target)) {
      removeSelectionTooltip();
    }
  });

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

      if (isExtensionValid()) {
        chrome.storage.local.set({
          rtl_state: data,
          last_domain: domain,
          last_active: activated,
        });
      }
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
    try {
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

        case 'translate_selection':
          handleSelectionTranslate().then(function (result) {
            sendResponse({ success: result !== null });
          });
          return true; // async
      }
    } catch (err) {
      log.error(ERR.UNKNOWN, 'Message handler error', {
        action: message && message.action,
        error: err.message,
      });
      try {
        sendResponse({ success: false, error: err.message });
      } catch (_) {
        /* sendResponse may already be async-disconnected */
      }
    }
  });

  // ─── Init ────────────────────────────────────────────
  async function init() {
    // Load fonts and translation cache in parallel
    await Promise.all([
      new Promise(function (resolve) {
        injectFonts();
        resolve();
      }),
      sessionLoadCache(),
    ]);

    if (isPersianPage()) {
      STATE.langDetected = 'فارسی';
      STATE.langCode = 'fa';
      log.info(null, 'Persian page detected — no auto-translate needed');
      return;
    }

    // Warm up the TCP+TLS connection to Google Translate so the
    // first API call has near-zero connection-setup latency.
    warmupConnection();

    STATE.langCode = getPageLanguage();
    STATE.langDetected =
      LANG_NAMES[STATE.langCode] || (STATE.langCode ? STATE.langCode.toUpperCase() : 'نامشخص');

    log.info(
      null,
      'Page language detected: ' + STATE.langDetected + ' (' + (STATE.langCode || '?') + ')',
    );

    // Restore previous RTL state for this domain (no auto-translate)
    var saved = loadState();
    if (saved && saved.active) {
      applyRTL();
      log.info(null, 'Restored previous RTL state for domain');
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
    document.addEventListener('DOMContentLoaded', function () {
      init().catch(function (err) {
        log.error(ERR.UNKNOWN, 'Init failed (DOMContentLoaded)', { error: err.message });
      });
    });
  } else {
    init().catch(function (err) {
      log.error(ERR.UNKNOWN, 'Init failed', { error: err.message });
    });
  }
})();
