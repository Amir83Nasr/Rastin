<p dir="rtl">

# راستین (Rastin) — مترجم فارسی برای کروم

<img src="icons/icon.svg" width="64" height="64" alt="Rastin logo">

**Rastin** یک افزونه کروم برای ترجمه صفحات وب به فارسی (فارسی) با پشتیبانی کامل از **راست‌چین (RTL)** و فونت **ایران یکان ایکس** است.

> نویسنده: امیرحسین نصراللهی  
> ارتباط: [@Amir83Nasr](https://ble.ir/Amir83Nasr) در پیام‌رسان بله

</p>

---

## ✨ ویژگی‌ها

- **ترجمه کامل صفحه** — ترجمه خودکار صفحات غیرفارسی به فارسی با استفاده از Google Translate API
- **پشتیبانی کامل از RTL** — راست‌چین کردن خودکار صفحات با فونت ایران یکان ایکس
- **ترجمه انتخابی** — انتخاب متن دلخواه و ترجمه آنی (راست‌کلیک → ترجمه)
- **تشخیص هوشمند کد** — محتوای کدنویسی (مثل بلاک‌های کد، نام کتابخانه‌ها، و دستورات CLI) ترجمه نمی‌شوند
- **کش ترجمه** — ترجمه‌های تکراری در حافظه و `chrome.storage.session` ذخیره می‌شن تا دوباره درخواست نشن
- **رندر تدریجی** — محتوای داخل viewport اولویت داره، بقیه صفحه بعداً ترجمه می‌شه
- **بدون نیاز به ریلود صفحه** — برگردوندن متن اصلی بدون نیاز به refresh
- **میانبرهای صفحه کلید**:
  - `Ctrl+Shift+T` — ترجمه صفحه
  - `Ctrl+Shift+R` — فعال/غیرفعال کردن RTL
  - `Ctrl+Shift+F` — باز کردن پنجره افزونه
- **بدون نیاز به API Key** — از Google Translate API رایگان استفاده می‌کنه

---

## 📦 نصب

### از Chrome Web Store

> به زودی...

### نصب دستی (Developer Mode)

1. مرورگر کروم رو باز کن و برو به `chrome://extensions`
2. **Developer Mode** (بالا سمت راست) رو فعال کن
3. دکمه **Load unpacked** رو بزن و پوشه پروژه رو انتخاب کن
4. تمام 🎉

---

## 🚀 نحوه استفاده

1. روی آیکون افزونه (ابزارک) کلیک کن تا پنجره باز بشه
2. دکمه **Translate** رو بزن تا صفحه ترجمه بشه
3. یا از میانبر صفحه کلید `Ctrl+Shift+T` استفاده کن

### تنظیمات صفحه

- **Translate & RTL** — ترجمه + راست‌چین
- **RTL Only** — فقط راست‌چین (بدون ترجمه)
- **Reset** — برگشت به حالت اولیه

---

## 🗂 ساختار پروژه

```
Rastin/
  _locales/
    en/messages.json           # متن‌های انگلیسی
    fa/messages.json           # متن‌های فارسی
  fonts/
    IRANYekanX/                # فونت ایران یکان ایکس (۳ وزن)
      IRANYekanX-Regular.ttf
      IRANYekanX-Medium.ttf
      IRANYekanX-DemiBold.ttf
    Cartograph CF/             # فونت برنامه‌نویسی (اختیاری)
  icons/
    icon.svg                   # لوگو (منبع اصلی)
    icon.png                   # لوگو (png جایگزین)
  lib/
    errors.js                  # سیستم مدیریت خطا
  popup/
    popup.html                 # UI پنجره افزونه
    popup.js                   # منطق پنجره
    popup.css                  # استایل پنجره
    icons.js                   # سیستم آیکون SVG
  scripts/
    content.js                 # اسکریپت اصلی — ترجمه، RTL، بنر
    background.js              # سرویس ورکر — نصب، منوها، میانبرها
    code-detection.js          # تشخیص محتوای کد (۳ لایه)
  styles/
    content.css                # استایل‌های محتوایی (RTL + بنر)
  manifest.json                # نقطه ورود افزونه
```

---

## 🛠 تکنولوژی‌ها

| تکنولوژی                 | توضیح                                    |
| ------------------------ | ---------------------------------------- |
| Manifest V3              | آخرین نسخه API افزونه‌های کروم           |
| Google Translate API     | رایگان، بدون نیاز به کلید (`client=gtx`) |
| Iran Yekan X             | فونت فارسی با ۳ وزن                      |
| Shadow DOM (forthcoming) | پشتیبانی از SPAها                        |

---

## 💻 توسعه

### پیش‌نیازها

- کروم (یا هر مرورگر مبتنی بر Chromium)
- هیچ وابستگی npmای نیاز نیست!

### فرمت‌دهی کد

```bash
npx prettier --write <file>
```

پروژه از **Prettier** با تنظیمات `semi`, `singleQuote`, `trailingComma: all` استفاده می‌کنه.  
هوک pre-commit به طور خودکار فایل‌های stage شده رو فرمت می‌کنه:

```bash
git config core.hooksPath .githooks
```

### تست

1. برو به `chrome://extensions`
2. Developer Mode رو فعال کن
3. Load unpacked → پوشه پروژه رو انتخاب کن
4. بعد از هر تغییر، دکمه 🔄 رو بزن

---

## 🔧 عیب‌یابی رایج

| مشکل                           | راه‌حل                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| آیکون افزونه نمایش داده نمی‌شه | از PNG استفاده کن (SVG در آیکون کروم گاهی کار نمی‌کنه)                                                    |
| فونت فارسی نشون داده نمی‌شه    | فونت از طریق JS تزریق می‌شه (`chrome.runtime.getURL`) — CSS نمی‌تونه از `chrome-extension://` استفاده کنه |
| خطا در importScripts           | از `"type": "module"` در background استفاده نکن — importScripts در ماژول‌ها کار نمی‌کنه                   |

---

## 📝 مجوز

**MIT** — آزاد برای استفاده شخصی و تجاری.

---

## ☕ حمایت

اگه راستین به کارت اومد، خوشحال می‌شم یه قهوه مهمونم کنی:

- **کارت به کارت** — از طریق بخش "Donate" در پنجره افزونه
- **حمایت معنوی** — با ستاره ⭐ زدن روی پروژه تو گیت‌هاب

---

<br>

# Rastin — Farsi Translator for Chrome

**Rastin** (راستین — meaning "honest" in Persian) is a Chrome extension that translates non-Persian web pages to Persian (Farsi) with full **RTL layout support** using the bundled **Iran Yekan X** font.

> **Author:** Amirhossein Nasrollahi ([@Amir83Nasr](https://ble.ir/Amir83Nasr) on Bale messenger)

## Features

- **Full-page translation** — automatically translate non-Persian pages to Persian using Google Translate API
- **RTL support** — automatic right-to-left layout with Iran Yekan X font
- **Select-to-translate** — select text and translate instantly (right-click → Translate)
- **Smart code detection** — code blocks, library names, and CLI commands are left untranslated
- **Translation cache** — repeated texts are cached in-memory and in `chrome.storage.session`
- **Progressive rendering** — visible content is translated first, off-screen content is deferred
- **No-page-reload restore** — revert to original content without refreshing
- **Keyboard shortcuts:** `Ctrl+Shift+T` (translate), `Ctrl+Shift+R` (toggle RTL), `Ctrl+Shift+F` (open popup)
- **No API key needed** — uses the free Google Translate API

## Installation

### From Chrome Web Store

> Coming soon...

### Manual (Developer Mode)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer Mode** (top right)
3. Click **Load unpacked** and select the project folder
4. Done!

## Usage

1. Click the extension icon in the toolbar
2. Click **Translate** to start translating
3. Or use the keyboard shortcut `Ctrl+Shift+T`

### Page Controls

- **Translate & RTL** — translate + right-to-left layout
- **RTL Only** — just enable RTL (no translation)
- **Reset** — restore original content

## Project Structure

```
Rastin/
  _locales/
    en/messages.json           # English i18n strings
    fa/messages.json           # Persian i18n strings
  fonts/
    IRANYekanX/                # Iran Yekan X font (3 weights)
    Cartograph CF/             # Programming font (optional)
  icons/
    icon.svg                   # Logo (source)
    icon.png                   # Logo (PNG fallback)
  lib/
    errors.js                  # Error management system
  popup/
    popup.html                 # Popup UI
    popup.js                   # Popup logic
    popup.css                  # Popup styles
    icons.js                   # SVG icon system
  scripts/
    content.js                 # Content script — translation, RTL, banner
    background.js              # Service worker — install, menus, shortcuts
    code-detection.js          # Code-like content detection (3 layers)
  styles/
    content.css                # Content styles (RTL + banner)
  manifest.json                # Extension entry point
```

## Tech Stack

- **Manifest V3** — latest Chrome extension API
- **Google Translate API** — free, no key (`client=gtx`)
- **Iran Yekan X** — Persian font (Regular, Medium, DemiBold)
- **Prettier** — code formatting

## Development

### Prerequisites

- Chrome / Chromium browser
- No npm dependencies required!

### Code Formatting

```bash
npx prettier --write <file>
```

The project uses **Prettier** with `semi`, `singleQuote`, `trailingComma: all`.  
Git pre-commit hook auto-formats staged files:

```bash
git config core.hooksPath .githooks
```

### Testing Locally

1. Go to `chrome://extensions`
2. Enable Developer Mode
3. Load unpacked → select project root
4. Refresh after code changes via the 🔄 button

## Known Issues

| Issue                       | Fix                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------- |
| SVG as extension icon       | Use PNG fallback — Chrome doesn't reliably render SVG extension icons                   |
| Font not loading in content | Inject font via JS `chrome.runtime.getURL()` — CSS can't use `chrome-extension://` URLs |
| `importScripts` not working | Don't use `"type": "module"` in background service worker                               |

## License

**MIT** — free for personal and commercial use.

## Support

If you find Rastin useful, consider supporting the project:

- **Donate** via the "Donate" section in the extension popup
- **Star** ⭐ the project on GitHub
