<div align="center">

# 🎧 Stream Radio Mode

### Listen to SOOP Live Streams Like a Radio

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/stream-radio-mode/nomodebfjalibapnnkfmbmempgkgjhpo)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

**Turn off the video. Keep the audio. Pretend to work.**

A Chrome extension that adds radio mode to [SOOP](https://www.sooplive.com/) (Korea's largest live streaming platform, formerly AfreecaTV).

[한국어](README.md) · [Install from Chrome Web Store](https://chromewebstore.google.com/detail/stream-radio-mode/nomodebfjalibapnnkfmbmempgkgjhpo) · [Installation](#-installation) · [Features](#-features) · [Shortcuts](#%EF%B8%8F-shortcuts)

</div>

---

## ✨ Features

### 🎧 Radio Mode
Turn off video rendering, keep audio playing. Saves GPU/CPU resources.

### 🕶 Stealth Mode ("Lupin Mode")
Disguise the tab as "Google Docs" — changes tab title, favicon, and auto-switches to another tab. **Audio keeps playing.**

### 📉 Auto Bandwidth Saving
Automatically switches to the lowest quality stream in radio mode via SOOP's internal `livePlayer` API. Reduces bandwidth by ~90%.

---

## 🚀 Installation

Install it directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/stream-radio-mode/nomodebfjalibapnnkfmbmempgkgjhpo) if you just want to use it. If you want to test the latest source locally, use the manual installation steps below.

### Chrome Web Store

1. Open the [Stream Radio Mode listing](https://chromewebstore.google.com/detail/stream-radio-mode/nomodebfjalibapnnkfmbmempgkgjhpo)
2. Click **"Add to Chrome"**
3. Visit a [SOOP live stream](https://www.sooplive.com/) and use the extension

### Manual Install

```bash
git clone https://github.com/Hahamin/stream-radio-mode.git
```

Or download the source as a [ZIP archive](https://github.com/Hahamin/stream-radio-mode/archive/refs/heads/main.zip) and extract it.

1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **"Load unpacked"**
4. Select the `stream-radio-mode` folder

After installation, open a [SOOP live stream](https://www.sooplive.com/) and press `Alt + R` to enter Radio Mode.

---

## ⌨️ Shortcuts

| Shortcut | Action |
|:---:|:---|
| `Alt` + `R` | Toggle Radio Mode |
| `Alt` + `B` | Toggle Stealth Mode |
| `Alt` + `M` | Toggle Minimize Mode |

---

## 📜 License

[MIT License](LICENSE)
