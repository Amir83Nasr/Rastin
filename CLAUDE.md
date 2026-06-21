# Rastin — Chrome Extension Project

## Project Overview

Rastin (راستین) is a Chrome extension that translates non-Persian web pages to Persian (Farsi) with RTL layout support using the bundled Iran Yekan X font.

**Author:** امیرحسین نصراللهی (@Amir83Nasr on Bale)

## Tech Stack

- Manifest V3
- Classic service worker (NOT `type: module` — `importScripts` doesn't work in module workers)
- Google Translate API (free, no key needed): `?client=gtx&sl=auto&tl=fa&dt=t&q=`
- Inline SVG icons (custom Lucide-style, 12 paths) — no external icon library
- Iran Yekan X font bundled in `fonts/IRANYekanX/`, Cartograph CF in `fonts/Cartograph CF/`

## Project Structure

```
RTL Translator/
  _locales/en/messages.json     # English i18n
  _locales/fa/messages.json     # Persian i18n
  fonts/IRANYekanX/             # 3 TTF weights (Regular, Medium, DemiBold)
  fonts/Cartograph CF/          # Programming font (CartographCF.otf)
  icons/icon.svg + icon.png     # Logo — SVG is source, PNG is fallback
  lib/
    errors.js                   # Shared error management (IIFE, sets self.RastinErrors)
    icons.js                    # SVG icon system (mountIcons, createIcon)
  popup/popup.html              # Popup UI
  scripts/
    content.js                  # Content script — translation, RTL, banner
    popup.js                    # Popup script — status, controls
    background.js               # Service worker — install, menus, shortcuts
  styles/
    content.css                 # Content styles (RTL + banner)
    popup.css                   # Popup styles (themed)
  .githooks/pre-commit          # Prettier auto-format hook
  manifest.json                 # Extension entry point
  CLAUDE.md                     # This file
```

## Key Architecture Decisions

### Error Management (`lib/errors.js`)

- IIFE that sets `self.RastinErrors` (works in both window and service worker)
- Log levels: DEBUG, INFO, WARN, ERROR, FATAL
- Error codes: `TRANS_API_FAILURE`, `NETWORK_OFFLINE`, `STORAGE_READ_FAIL`, etc.
- Auto-flushes to `chrome.storage.local` via microtask delay
- Toast notification system (inline-styled, no CSS needed)
- Toast types: `error` (red `#ef4444`), `warn` (amber `#d97706`), `success` (dark `#101010` + cream `#f3f4ed`), default `info` (blue `#2563eb`)
- Usage: `RastinErrors.createLogger('module-name')`

### Content Script (`scripts/content.js`)

- Self-contained IIFE with inline `ContentLogger` class
- Language detection via `html[lang]`, `<meta name="language">`, and Persian char sampling (؀-ۿ range)
- Translation: batch with `|||` separator, dedup via textMap, 15 texts/batch
- Font injection via JavaScript (`chrome.runtime.getURL`) — CSS can't use extension URLs
- Banner UI with translate/RTL-only/dismiss/retry buttons
- Domain state persistence via localStorage + chrome.storage
- Retry logic: up to 2 retries with exponential backoff for translation API calls

### Code-like Content Detection (3-layer system)

A multi-layer detection system keeps programming identifiers, code blocks, CLI commands, and tech names from being translated or RTL-adjusted.

**Layer 1 — Structural** (`isCodeElement`):

- Checks each ancestor element up to `<body>` for code-related signals
- HTML tags: `CODE`, `PRE`, `KBD`, `SAMP`, `TT` (in `SKIP_TAGS`)
- CSS class signals: `font-mono`, `language-*`, `terminal`, `codeblock`, `syntax`, `hljs`, `shiki`, `prism`, `rehype-pretty`, …
- Data-attribute signals: `data-rehype-pretty-code-fragment`, `data-language`, `data-code`, `data-terminal`, …
- Skip-prefix classes: `rtl-translator-*`, `fa-*`, `notranslate`, `translate-ignore`
- `data-notranslate` attribute

**Layer 2 — Content Regex** (`isCodeLikeText`):

- Version/pkg scopes: `shadcn@latest`, `@angular/core` → `/\S+@\S+/`
- Code file extensions (≤40 chars, ≤3 words): `.json`, `.ts`, `.js`, `.jsx`, `.md`, `.yml`, …, `.config`
- CLI flags: `-t`, `--option`, `--flag=value`
- URLs: `https://…`
- Semantic versions: `1.0.0`, `v2.3.4-beta`
- Natural-language guard: skips texts starting with determiners/pronouns (`The`, `This`, `I`, `We`, `To`, …)

**Layer 3 — Known Identifiers** (`TECH_IDENTIFIERS`, 137+ entries):
Organized by ecosystem: JS/TS (react, vue, nextjs, zustand, …), PHP (laravel, symfony, …), Python (django, flask, tensorflow, …), Java/JVM (spring, kotlin, gradle, …), Go (golang, gin, …), Rust (cargo, tokio, …), .NET (dotnet, blazor, …), Mobile (flutter, swiftui, …), CSS/UI (tailwind, shadcn, mantine, …), Databases (postgresql, mongodb, redis, prisma, …), DevOps (docker, kubernetes, terraform, …), Cloud (aws, vercel, netlify, …), Editors (vscode, neovim, …), Tools (curl, esbuild, prettier, …), API (graphql, grpc, swagger, …), and more.

- Normalization: lowercase + strip `.-_/` + spaces (so "React Router" → `reactrouter`)
- Duplicates tolerated (Set overwrites), ~140 unique entries

### Background Service Worker (`scripts/background.js`)

- Classic script (NOT module — `importScripts` bugs in module workers)
- Uses `importScripts('../lib/errors.js')` to load error module
- Error module access is guarded: `typeof RastinErrors !== 'undefined'`
- Context menu: right-click → translate or toggle RTL
- Keyboard shortcuts: Ctrl+Shift+R (toggle RTL), Ctrl+Shift+T (translate page), Ctrl+Shift+F (open popup)
- `unhandledrejection` global handler

### Styling

- Theme colors derived from `icons/icon.svg`: bg `#f3f4ed`, dark `#2a2a2a`
- CSS custom properties in popup.css
- Content banner: dark gradient, cream text, slide animation
- Toast notifications: inline-styled, no CSS dependency

## Development Setup

### Code Formatting

- **Formatter:** Prettier (via `npx`, no npm install needed)
- **Config:** `.prettierrc.json` — semi, singleQuote, trailingComma all
- **Ignore:** `.prettierignore` — fonts/, icons/, \_locales/, .githooks/
- **Pre-commit hook:** `.githooks/pre-commit` — auto-formats staged JS/CSS/HTML/JSON/MD files
- Git hooks path: `git config core.hooksPath .githooks`
- **Never auto-commit** — wait for user command

### Testing Locally

1. Go to `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → select the project root
4. Refresh after code changes via the 🔄 button on the extension card

### Building for Distribution

- Package as `.zip` for Chrome Web Store
- No npm/node dependencies — pure extension, no build step

## Common Issues & Fixes

- **SVG as extension icon:** Chrome doesn't reliably render SVG extension icons → use PNG fallback (icon.png)
- **Font in content script:** CSS `@font-face` can't use `chrome-extension://` URLs → inject via JS `chrome.runtime.getURL()`
- **importScripts in module workers:** Don't use `"type": "module"` in background — `importScripts` won't work
- **Extension icon not showing:** Make sure manifest icon paths point to PNG files, not SVG

## Commands

- `npx prettier --write <files>` — format files
- `git commit` (via pre-commit hook) — auto-formats staged files
