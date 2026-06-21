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

    var bgColor =
      type === 'error'
        ? '#ef4444'
        : type === 'warn'
          ? '#d97706'
          : type === 'success'
            ? '#101010'
            : '#2563eb';
    var textColor = type === 'success' ? '#f3f4ed' : '#fff';
    var toast = document.createElement('div');
    toast.style.cssText =
      'background:' +
      bgColor +
      ';color:' +
      textColor +
      ';padding:10px 20px;border-radius:8px;' +
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

  // ══════════════════════════════════════════════════
  //   Code-like Content Detection
  //   Multi-layer system to keep programming identifiers,
  //   code blocks, CLI commands, and technical names
  //   from being translated or RTL-adjusted.
  //
  //   Layer 1 — Structural:   HTML tag + CSS class / data-attribute
  //                           context on element ancestors
  //   Layer 2 — Content:      Regex patterns (versions, file paths,
  //                           CLI flags, URLs, …)
  //   Layer 3 — Identity:     Known tech proper nouns (pnpm, vite, …)
  // ══════════════════════════════════════════════════

  /**
   * CSS class substrings strongly associated with code containers.
   * Uses indexOf so partial matches work (e.g. "language-js" → "language-").
   */
  var CODE_CLASS_SIGNALS = [
    'font-mono',
    'language-',
    'codeblock',
    'code-block',
    'code-fence',
    'terminal',
    'syntax',
    'pretty-code',
    'rehype-pretty',
    'hljs',
    'chroma',
    'shiki',
    'prism',
    'highlight',
    'linenumber',
    'line-numbers',
  ];

  /**
   * HTML data-* attributes that mark code containers.
   */
  var CODE_ATTR_SIGNALS = [
    'data-rehype-pretty-code-fragment',
    'data-rehype-pretty-code-title',
    'data-language',
    'data-code',
    'data-code-block',
    'data-terminal',
  ];

  /**
   * Known tech identifiers — proper nouns common on programming
   * documentation pages that must NOT be translated.
   *
   * Only names without a common English meaning are included,
   * OR names that appear as standalone labels on doc sites
   * (single-word text nodes are almost certainly labels, not sentences).
   */
  var TECH_IDENTIFIERS = (function () {
    var set = {};
    var words = [
      // ── JavaScript / TypeScript ecosystem ──────────────
      'react',
      'reactjs',
      'reactnative',
      'reactrouter',
      'reactquery',
      'redux',
      'zustand',
      'pinia',
      'mobx',
      'recoil',
      'jotai',
      'xstate',
      'rxjs',
      'immer',
      'reselect',
      'vue',
      'vuejs',
      'vuex',
      'vuetify',
      'nuxt',
      'nuxtjs',
      'angular',
      'angularjs',
      'angularcli',
      'svelte',
      'sveltejs',
      'sveltekit',
      'solid',
      'solidjs',
      'solidstart',
      'qwik',
      'qwikcity',
      'nextjs',
      'nextauth',
      'remix',
      'remixjs',
      'express',
      'expressjs',
      'jquery',
      'axios',
      'lodash',
      'dayjs',
      'momentjs',
      'chartjs',
      'd3js',
      'threejs',
      'gsap',

      // ── Build tools / bundlers ─────────────────────────
      'vite',
      'vitest',
      'webpack',
      'rollup',
      'esbuild',
      'parcel',
      'turbopack',
      'gulp',
      'grunt',
      'nx',
      'turbo',
      'lerna',
      'babel',
      'swc',

      // ── Runtimes / Platforms ───────────────────────────
      'node',
      'nodejs',
      'deno',
      'bun',

      // ── Testing ────────────────────────────────────────
      'jest',
      'mocha',
      'chai',
      'jasmine',
      'cypress',
      'playwright',
      'puppeteer',
      'storybook',
      'testinglibrary',

      // ── Code quality / formatters ──────────────────────
      'eslint',
      'prettier',
      'jshint',
      'stylelint',
      'husky',
      'lintstaged',
      'commitlint',
      'typescript',
      'javascript',
      'ecmascript',

      // ── Meta / full-stack frameworks ───────────────────
      'astro',
      'blitzjs',
      'redwoodjs',
      'gatsby',
      'eleventy',
      'meteor',
      'sailsjs',
      'adonisjs',
      'strapi',
      'ghost',
      'keystonejs',
      'fastify',
      'hono',
      'trpc',
      'prisma',
      'drizzle',
      'typeorm',
      'sequelize',
      'supabase',
      'firebase',

      // ── CSS / UI frameworks ────────────────────────────
      'tailwind',
      'bootstrap',
      'bulma',
      'tachyons',
      'foundation',
      'materialize',
      'materialui',
      'mantine',
      'chakra',
      'radix',
      'shadcn',
      'shadcnui',
      'headlessui',
      'primereact',
      'antdesign',
      'daisyui',
      'flowbite',
      'semanticui',
      'tanstack',

      // ── PHP ecosystem ──────────────────────────────────
      'laravel',
      'artisan',
      'composer',
      'phpunit',
      'symfony',
      'codeigniter',
      'cakephp',
      'phalcon',
      'slim',
      'wordpress',
      'drupal',
      'joomla',
      'magento',
      'woocommerce',
      'shopify',
      'yii',
      'zend',
      'laminas',

      // ── Python ecosystem ───────────────────────────────
      'django',
      'flask',
      'fastapi',
      'tornado',
      'bottle',
      'pyramid',
      'pytest',
      'celery',
      'sqlalchemy',
      'numpy',
      'pandas',
      'scipy',
      'scikitlearn',
      'tensorflow',
      'pytorch',
      'keras',
      'jupyter',
      'anaconda',
      'poetry',
      'pipenv',
      'uvicorn',
      'gunicorn',

      // ── Ruby ecosystem ─────────────────────────────────
      'rails',
      'rubyonrails',
      'sinatra',
      'rspec',
      'bundler',
      'rubygems',
      'rubocop',

      // ── Java / JVM ─────────────────────────────────────
      'spring',
      'springboot',
      'springframework',
      'hibernate',
      'tomcat',
      'jetty',
      'netty',
      'gradle',
      'maven',
      'kotlin',
      'groovy',
      'scala',
      'intellij',
      'eclipse',
      'netbeans',
      'quarkus',
      'micronaut',
      'helidon',
      'vertx',

      // ── Go ecosystem ───────────────────────────────────
      'golang',
      'gin',
      'echo',
      'fiber',
      'cobra',
      'viper',
      'gorilla',
      'buffalo',

      // ── Rust ecosystem ─────────────────────────────────
      'tokio',
      'actix',
      'rocket',
      'diesel',
      'serde',
      'clap',
      'cargo',
      'tauri',
      'axum',

      // ── .NET / C# ───────────────────────────────────────
      'dotnet',
      'aspnet',
      'blazor',
      'xamarin',
      'maui',
      'entityframework',
      'dapper',
      'nunit',
      'xunit',
      'serilog',
      'automapper',
      'unity',

      // ── Mobile ─────────────────────────────────────────
      'flutter',
      'dart',
      'kotlin',
      'swift',
      'swiftui',
      'androidstudio',
      'xcode',
      'expo',
      'capacitor',
      'cordova',
      'ionic',
      'nativescript',

      // ── Databases ──────────────────────────────────────
      'mysql',
      'postgresql',
      'postgres',
      'psql',
      'mongodb',
      'mongo',
      'mongoose',
      'sqlite',
      'sqlserver',
      'mssql',
      'redis',
      'elasticsearch',
      'opensearch',
      'mariadb',
      'couchdb',
      'cassandra',
      'neo4j',
      'dynamodb',
      'cockroachdb',
      'planetscale',
      'neon',
      'sqlalchemy',
      'sequelize',
      'typeorm',

      // ── DevOps / Cloud / Infrastructure ────────────────
      'docker',
      'kubernetes',
      'k8s',
      'helm',
      'nginx',
      'apache',
      'caddy',
      'traefik',
      'haproxy',
      'terraform',
      'ansible',
      'puppet',
      'chef',
      'vagrant',
      'jenkins',
      'githubactions',
      'gitlabci',
      'circleci',
      'travisci',
      'argocd',
      'fluxcd',
      'prometheus',
      'grafana',
      'datadog',
      'newrelic',
      'sentry',

      // ── Cloud providers ────────────────────────────────
      'aws',
      'azure',
      'gcp',
      'googlecloud',
      'cloudflare',
      'heroku',
      'netlify',
      'vercel',
      'digitalocean',
      'linode',
      'vultr',
      'hetzner',
      'flyio',
      'railway',
      'render',

      // ── Version control ────────────────────────────────
      'git',
      'svn',
      'mercurial',
      'github',
      'gitlab',
      'bitbucket',
      'gitea',
      'gitkraken',
      'sourcetree',

      // ── Editors / IDEs ─────────────────────────────────
      'vscode',
      'vim',
      'neovim',
      'emacs',
      'webstorm',
      'phpstorm',
      'pycharm',
      'goland',
      'rubymine',
      'sublime',
      'atom',
      'helix',

      // ── API / Protocol ─────────────────────────────────
      'graphql',
      'apollo',
      'relay',
      'grpc',
      'protobuf',
      'swagger',
      'openapi',
      'postman',
      'insomnia',
      'socketio',
      'websocket',

      // ── Package managers (OS) ──────────────────────────
      'pnpm',
      'npm',
      'npx',
      'yarn',
      'bun',
      'brew',
      'homebrew',
      'choco',
      'chocolatey',
      'apt',
      'aptget',
      'yum',
      'dnf',
      'pacman',

      // ── CLI tools / Utilities ──────────────────────────
      'curl',
      'wget',
      'jq',
      'ripgrep',
      'zsh',
      'bash',
      'fish',

      // ── Config / build terms ───────────────────────────
      'eslintrc',
      'prettierrc',
      'babelrc',
      'gitignore',
      'npmrc',
      'dockerfile',
      'makefile',
      'tsconfig',
      'webpackconfig',
    ];
    for (var i = 0; i < words.length; i++) set[words[i]] = true;
    return set;
  })();

  /**
   * Check whether a single DOM element carries code-related
   * CSS classes or data attributes (Layer 1 — structural).
   *
   * Returns true if any signal is found on the element itself.
   * @param {Element} el
   * @returns {boolean}
   */
  function isCodeElement(el) {
    if (!el || !el.classList) return false;

    var i, j;

    // CSS class signals
    for (i = 0; i < el.classList.length; i++) {
      var cls = el.classList[i].toLowerCase();
      for (j = 0; j < CODE_CLASS_SIGNALS.length; j++) {
        if (cls.indexOf(CODE_CLASS_SIGNALS[j]) !== -1) return true;
      }
    }

    // Data-attribute signals
    if (el.hasAttribute) {
      for (j = 0; j < CODE_ATTR_SIGNALS.length; j++) {
        if (el.hasAttribute(CODE_ATTR_SIGNALS[j])) return true;
      }
    }

    return false;
  }

  /**
   * Check whether text content looks like code / a technical
   * identifier that should not be translated (Layers 2 & 3).
   *
   * @param {string} text
   * @returns {boolean}  true when the text is code-like
   */
  function isCodeLikeText(text) {
    if (!text) return false;
    text = text.trim();
    if (!text || text.length > 80) return false;

    // Early exit: Persian characters → not code-like
    if (/[؀-ۿ]/.test(text)) return false;

    // Natural-language sentences almost always start with
    // a determiner, pronoun, or article.  If we see one,
    // the text is real content, not a code label.
    if (/^(?:The|This|That|These|Those|We|You|They|It|I|A|An|To)\b/i.test(text)) return false;

    // ── Layer 2: regex patterns ──────────────────────────

    // Version / package scopes: shadcn@latest, @angular/core
    if (/\S+@\S+/.test(text)) return true;

    // Code file extensions: .json, .ts, .jsx, .tsx, .config, …
    // Only match short text (≤40 chars) with ≤3 words to avoid
    // catching sentences that mention a file type in passing.
    if (
      text.length <= 40 &&
      text.split(/\s+/).length <= 3 &&
      /\.(?:json|ts|js|jsx|tsx|css|scss|less|md|mdx|yml|yaml|toml|xml|html|svelte|vue|astro|mjs|cjs|env|config)\b/i.test(
        text,
      )
    )
      return true;

    // CLI flags: -t, --option, --flag=value
    if (/(?:^|\s)-{1,2}[a-zA-Z][\w-]*/.test(text)) return true;

    // URLs
    if (/https?:\/\/[\w.-]+/.test(text)) return true;

    // Semantic version numbers: 1.0.0, v2.3, 1.0.0-beta
    if (/\bv?\d+\.\d+\.\d+(?:-[\w.]+)?\b/.test(text)) return true;

    // ── Layer 3: known tech identifiers ──────────────────
    // Normalize: lowercase + strip programming symbols & spaces
    // (spaces so "React Router" → "reactrouter" matches the set)
    var normalized = text.toLowerCase().replace(/[.\-_/\s]/g, '');
    if (TECH_IDENTIFIERS[normalized]) return true;

    return false;
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
      // ── Layer 1a — tag-based skip ──────────────────────
      // Text nodes inside CODE / PRE / KBD / … must not translate
      if (el.tagName && SKIP_TAGS.has(el.tagName)) return false;

      if (el.classList && el.classList.length) {
        // ── Layer 1b — skip prefixes (existing) ──────────
        for (var i = 0; i < SKIP_PREFIXES.length; i++) {
          for (var c = 0; c < el.classList.length; c++) {
            if (el.classList[c].startsWith(SKIP_PREFIXES[i])) return false;
          }
        }

        // ── Layer 1c — code CSS classes ──────────────────
        if (isCodeElement(el)) return false;
      } else {
        // No classList but might still have data attributes
        if (isCodeElement(el)) return false;
      }

      // ── Layer 1d — data-notranslate (existing) ────────
      if (el.hasAttribute && el.hasAttribute('data-notranslate')) return false;

      el = el.parentElement;
    }

    // ── Layers 2 & 3 — content patterns & identity ─────
    if (node.nodeType === Node.TEXT_NODE) {
      var txt = node.textContent.trim();
      if (txt && isCodeLikeText(txt)) return false;
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

      // ── Phase 2: sequential DOM updates ──────────────────
      // DOM must be updated sequentially to avoid race
      // conditions on shared text nodes.
      var translatedCount = 0;
      for (var ci = 0; ci < chunks.length; ci++) {
        var chunk = chunks[ci];
        var translated = batchResults[ci] || chunk; // fallback to original
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
