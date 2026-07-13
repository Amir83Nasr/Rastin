# Contributing to Rastin (راستین)

Thanks for considering contributing! Rastin translates non-Persian web pages to Farsi with RTL support. Below are guidelines to keep things consistent.

## Code Style

- **Formatter:** Prettier via `npx` (no install needed). Config in `.prettierrc.json`.
- Run before committing: `npx prettier --write <files>`
- The pre-commit hook (`.githooks/pre-commit`) formats staged JS/CSS/HTML/JSON/MD files automatically. Set it up:

  ```bash
  git config core.hooksPath .githooks
  ```

## Project Structure

```
Rastin/
  _locales/en/messages.json     # English i18n
  _locales/fa/messages.json     # Persian i18n
  fonts/IRANYekanX/             # 3 TTF weights (Regular, Medium, DemiBold)
  fonts/Cartograph CF/          # Programming font (CartographCF.otf)
  icons/                        # SVG source + PNG fallback
  lib/                          # Shared modules (IIFE pattern)
  popup/                        # Popup UI — html, js, css, icons
  scripts/                      # Content script, background worker, code detection
  styles/                       # Content CSS
  manifest.json                 # Extension entry point
```

## Architecture Notes

- **IIFE pattern everywhere** — no ES modules. The background worker is a classic script (`"type": "module"` breaks `importScripts`).
- **Error module** (`lib/errors.js`) is loaded via `importScripts` in the service worker and sets `self.RastinErrors`. Always guard access with `typeof RastinErrors !== 'undefined'`.
- **Translation cache** uses `chrome.storage.session` (MV3 in-memory, shared across tabs, no manual expiry).
- **Code detection** is a 3-layer system in `scripts/code-detection.js`. When adding a new tech name, add it to `TECH_IDENTIFIERS`. When adding a new code container signal, add to Layer 1 (`isCodeElement`).
- **Content script** is self-contained (its own `ContentLogger` class). Keep it that way — no shared dependencies with the popup.

## Adding a New Tech Identifier

Open `scripts/code-detection.js`, find `TECH_IDENTIFIERS`, add the new entry (lowercase). The normalization strips `.-_/` and spaces, so write the canonical form:

```js
'myframework',
```

## Icons

- SVG is the source (`icons/icon.svg`). PNG is the Chrome fallback — manifest icon paths point to PNG.
- Theme colors: bg `#f3f4ed`, dark `#2a2a2a`.

## Testing

1. Go to `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → project root
4. Refresh via 🔄 after code changes

## Pull Requests

- Keep changes focused. One PR = one concern.
- Test the extension loads and translate/RTL work on a real page.
- Format with Prettier before opening.
- Don't auto-commit — wait for review.

## Questions

Open an issue or reach out to @Amir83Nasr on Bale.
