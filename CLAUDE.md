# Rastin — Chrome Extension Project

## Project Overview

Rastin (راستین) is a Chrome extension that translates non-Persian web pages to Persian (Farsi) with RTL layout support using the bundled Iran Yekan X font.

**Author:** امیرحسین نصراللهی (@Amir83Nasr on Bale)

## Tech Stack

- Manifest V3
- Classic service worker (NOT `type: module` — `importScripts` doesn't work in module workers)
- Google Translate API (free, no key needed): `?client=gtx&sl=auto&tl=fa&dt=t&q=`
- Inline SVG icons (custom Lucide-style, 12 paths) — no external icon library
- Iran Yekan X font bundled in `fonts/`

## Project Structure

```
RTL Translator/
  _locales/en/messages.json     # English i18n
  _locales/fa/messages.json     # Persian i18n
  fonts/                        # 3 TTF weights (Regular, Medium, DemiBold)
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
- Usage: `RastinErrors.createLogger('module-name')`

### Content Script (`scripts/content.js`)

- Self-contained IIFE with inline `ContentLogger` class
- Language detection via `html[lang]`, `<meta name="language">`, and Persian char sampling (؀-ۿ range)
- Translation: batch with `|||` separator, dedup via textMap, 15 texts/batch
- Font injection via JavaScript (`chrome.runtime.getURL`) — CSS can't use extension URLs
- Banner UI with translate/RTL-only/dismiss/retry buttons
- Domain state persistence via localStorage + chrome.storage
- Retry logic: up to 2 retries with exponential backoff for translation API calls

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
