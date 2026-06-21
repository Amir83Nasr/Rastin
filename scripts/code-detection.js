/* ═══════════════════════════════════════════════════════════════
   Rastin — Code-like Content Detection
   ===============================================================
   Multi-layer system to keep programming identifiers,
   code blocks, CLI commands, and technical names
   from being translated or RTL-adjusted.

   Layer 1 — Structural:   HTML tag + CSS class / data-attribute
                           context on element ancestors
   Layer 2 — Content:      Regex patterns (versions, file paths,
                           CLI flags, URLs, …)
   Layer 3 — Identity:     Known tech proper nouns (pnpm, vite, …)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── Layer 1: Structural signals ──────────────────── */

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

  /* ─── Layer 1: isCodeElement ───────────────────────────
     Check whether a single DOM element carries code-related
     CSS classes or data attributes. */
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

  /* ─── Layer 2 & 3: isCodeLikeText ──────────────────────
     Check whether text content looks like code or a tech
     identifier that should not be translated.              */
  function isCodeLikeText(text) {
    if (!text) return false;
    text = text.trim();
    if (!text || text.length > 80) return false;

    // Early exit: Persian characters → not code-like
    if (/[؀-ۿ]/.test(text)) return false;

    // Natural-language start guard
    if (/^(?:The|This|That|These|Those|We|You|They|It|I|A|An|To)\b/i.test(text)) return false;

    // ── Layer 2: regex patterns ──────────────────────────

    // Version / package scopes: shadcn@latest, @angular/core
    if (/\S+@\S+/.test(text)) return true;

    // Code file extensions (≤40 chars, ≤3 words)
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
    var normalized = text.toLowerCase().replace(/[.\-_/\s]/g, '');
    if (TECH_IDENTIFIERS[normalized]) return true;

    return false;
  }

  /* ─── shouldTranslateNode (factory) ─────────────────────
     Creates a closure around the caller's SKIP_TAGS and
     SKIP_PREFIXES sets so they don't need to be global.

     Usage in content.js:
       var shouldTranslateNode = CodeDetection.createShouldTranslateNode(
         SKIP_TAGS, SKIP_PREFIXES
       );                                                     */
  function shouldTranslateNode(node, SKIP_TAGS, SKIP_PREFIXES) {
    if (!node || !node.parentNode) return false;
    if (SKIP_TAGS.has(node.tagName)) return false;

    var el = node;
    while (el && el !== document.body) {
      // ── Layer 1a — tag-based skip ──────────────────────
      if (el.tagName && SKIP_TAGS.has(el.tagName)) return false;

      if (el.classList && el.classList.length) {
        // ── Layer 1b — skip prefixes ────────────────────
        for (var i = 0; i < SKIP_PREFIXES.length; i++) {
          for (var c = 0; c < el.classList.length; c++) {
            if (el.classList[c].startsWith(SKIP_PREFIXES[i])) return false;
          }
        }

        // ── Layer 1c — code CSS classes ──────────────────
        if (isCodeElement(el)) return false;
      } else {
        if (isCodeElement(el)) return false;
      }

      // ── Layer 1d — data-notranslate ────────────────────
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

  function createShouldTranslateNode(SKIP_TAGS, SKIP_PREFIXES) {
    return function (node) {
      return shouldTranslateNode(node, SKIP_TAGS, SKIP_PREFIXES);
    };
  }

  /* ══════════════════════════════════════════════════════
     Export — works in both window and content-script
     isolated world (sets self.CodeDetection).
  ══════════════════════════════════════════════════════ */
  self.CodeDetection = {
    isCodeElement: isCodeElement,
    isCodeLikeText: isCodeLikeText,
    createShouldTranslateNode: createShouldTranslateNode,
  };
})();
