<div align="center">

# 🎧 Stream Radio Mode

### Listen to SOOP Live Streams Like a Radio

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/stream-radio-mode/nomodebfjalibapnnkfmbmempgkgjhpo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

**Turn off the video. Keep the audio. Pretend to work.**

A Chrome extension that adds radio mode to [SOOP](https://www.sooplive.com/) (Korea's largest live streaming platform).

[Install Now](#-install-30-seconds) · [한국어](README.md)

</div>

---

## 🚀 Install (30 seconds)

### Option 1: Chrome Web Store (Recommended)

1. **[Click here](https://chromewebstore.google.com/detail/stream-radio-mode/nomodebfjalibapnnkfmbmempgkgjhpo)** to open the Chrome Web Store
2. Click **"Add to Chrome"**
3. Done! Open a [SOOP](https://www.sooplive.com/) stream and press `Alt + R`

### Option 2: Manual Install (for developers)

1. [Download ZIP](https://github.com/Hahamin/stream-radio-mode/releases/latest/download/stream-radio-mode.zip) and extract
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **"Load unpacked"** → select the folder

> Works on Chrome, Edge, Whale, Brave, and any Chromium browser.

---

## ✨ Features

### 🎧 Radio Mode — `Alt + R`

Turns off video, keeps audio. Saves **~90% bandwidth** automatically.

- Streamer profile, name, stream title
- Viewer count, stream duration (live sync)
- Volume control, favorite, like buttons
- Chat panel + list panel (dark theme)

### 🕶 Stealth Mode — `Alt + B`

Disguises the tab as **"Google Docs"** — changes title, favicon, and auto-switches to another tab. Audio keeps playing.

### 📉 Auto Bandwidth Saving

Radio mode automatically switches to the lowest quality stream via SOOP's internal API.

```
1080p (~5-8 Mbps)  →  LOW (~0.3 Mbps)  📉 90% saved
```

---

## ⌨️ Shortcuts

| Key | Action |
|:---:|:---|
| `Alt + R` | Toggle Radio Mode |
| `Alt + B` | Toggle Stealth Mode |
| `Alt + M` | Minimize Window |

---

## ❓ FAQ

**Q: Does it actually reduce bandwidth?**
> Yes. It switches the actual stream quality to LOW, not just hiding the video.

**Q: Can I hear audio in stealth mode?**
> Yes! Only the tab title and favicon change. Audio keeps playing.

---

## 🤝 Contributing

Bug reports, feature requests, and PRs are welcome!

- [Open an issue](https://github.com/Hahamin/stream-radio-mode/issues)
- Fork → Branch → PR

---

<div align="center">

**⭐ Star this repo if you find it useful!**

MIT License · Made with 🎧

</div>
