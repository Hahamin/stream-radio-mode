<div align="center">

# 🎧 Stream Radio Mode

### Listen to SOOP Live Streams Like a Radio

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://github.com/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

**Turn off the video. Keep the audio. Pretend to work.**

A Chrome extension that adds radio mode to [SOOP](https://www.sooplive.co.kr/) (Korea's largest live streaming platform, formerly AfreecaTV).

[한국어](README.md) · [Installation](#-installation) · [Features](#-features) · [Shortcuts](#%EF%B8%8F-shortcuts)

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

```bash
git clone https://github.com/Hahamin/stream-radio-mode.git
```

1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **"Load unpacked"**
4. Select the `stream-radio-mode` folder

---

## ⌨️ Shortcuts

| Shortcut | Action |
|:---:|:---|
| `Alt` + `R` | Toggle Radio Mode |
| `Alt` + `B` | Toggle Stealth Mode |

---

## 📜 License

[MIT License](LICENSE)
