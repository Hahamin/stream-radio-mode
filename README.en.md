<div align="center">

# Stream Radio Mode

### Listen to SOOP live streams and VODs like radio

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/stream-radio-mode/nomodebfjalibapnnkfmbmempgkgjhpo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

**Hide the video for a while. Keep the audio comfortable.**

Stream Radio Mode is a Chrome extension for [SOOP](https://www.sooplive.com/) live streams and VOD pages. It gives you radio mode, sleep mode, stealth mode, speech EQ, chat/list panels, bandwidth saving, and keyboard shortcuts.

[Install](#install) · [First Use](#first-use) · [Features](#features) · [Shortcuts](#shortcuts) · [한국어](README.md)

</div>

---

## At a Glance

| Feature | What it does | Good for |
|:---|:---|:---|
| Radio Mode | Hides video and keeps audio playing | listening while working or studying |
| Sleep Mode | Stops automatically when a live stream or VOD ends | leaving a stream on before sleep |
| VOD Radio Board | Turns VOD into a time/seek-bar focused audio screen | listening to replays like podcasts |
| Bandwidth Saving | Lowers video quality while radio mode is on | reducing data, heat, and battery use |
| Speech EQ | Makes voices a bit clearer | muddy audio or quiet nighttime listening |
| Chat/List Panels | Keeps chat and recommendation lists usable | following chat without the video |
| Stealth Mode | Disguises the tab title/favicon and switches tabs | quickly reducing screen exposure |
| Minimize Mode | Minimizes the current browser window | leaving audio on with the window out of the way |

---

## Install

### Option 1. Chrome Web Store

1. Open the [Chrome Web Store listing](https://chromewebstore.google.com/detail/stream-radio-mode/nomodebfjalibapnnkfmbmempgkgjhpo).
2. Click **Add to Chrome**.
3. Open a SOOP live stream or VOD.
4. Press `Alt + R` or click the headphone button in the player.

It works on Chromium-based browsers such as Chrome, Edge, Whale, and Brave.

### Option 2. Manual install

Use this if you want to load the release ZIP yourself.

1. Download and extract the [latest ZIP](https://github.com/Hahamin/stream-radio-mode/releases/latest/download/stream-radio-mode.zip).
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted folder.

---

## First Use

### 1. Turn on Radio Mode

1. Open a SOOP live stream or VOD page.
2. Click the headphone button in the player or press `Alt + R`.
3. The video is hidden, but audio keeps playing.
4. Click **Switch to Video Mode** when you want the original view back.

<p align="center">
  <img src="docs/player-button.png" width="600" alt="Radio mode button inside the player">
</p>

### 2. Use the extension popup

Click the extension icon in the browser toolbar.

- **Radio Mode**: toggles radio mode for the current tab.
- **Auto Radio**: automatically enters radio mode when opening a supported SOOP page.
- **Sleep Mode**: stops automatically when a live stream or VOD ends.
- **Stealth Mode**: disguises the tab title/favicon and switches away.
- **Minimize Mode**: minimizes the current browser window.
- **Supported sites**: enables or disables SOOP support.
- **Shortcuts**: enables shortcuts and shows a shortcut guide.

### 3. Control everything from the radio overlay

The radio overlay includes:

- volume slider
- favorite, like, and chat buttons
- speech EQ toggle
- EQ preset cycling
- sleep mode ON/OFF
- stealth mode
- switch back to video mode

<p align="center">
  <img src="docs/radio-mode.png" width="420" alt="Radio mode overlay">
</p>

---

## Features

### Radio Mode

Radio Mode is the main feature. It hides the video surface and leaves an audio-first overlay with stream information and controls.

The overlay shows:

- streamer profile, name, and title
- viewer count
- live duration or VOD playback time
- live/VOD state
- volume, favorite, like, and chat buttons
- speech EQ, preset, sleep mode, and stealth controls

When radio mode turns off, the extension restores video opacity, quality, EQ attachment, chat/list panels, and page scroll lock as cleanly as possible.

### Sleep Mode

Sleep Mode is for leaving a stream or replay on without accidentally continuing forever.

On live streams:

- detects when SOOP moves from live playback toward VOD/replay state
- exits radio mode and stops playback
- keeps the video muted so audio does not leak if the player resumes
- tries to return to the original live URL when SOOP redirects to VOD

On VOD pages:

- detects the end of the replay
- pauses playback
- closes the overlay and restores the video state

You can toggle Sleep Mode in two places:

- the extension popup
- the **Sleep Mode ON/OFF** button inside the radio overlay

### VOD Radio Board

VOD pages use a replay-focused radio overlay.

- current time and total duration
- seek bar
- click-to-seek
- hover preview when a thumbnail/frame is available
- audio-first layout without needing to watch the video continuously

<p align="center">
  <img src="docs/radio-full.png" width="800" alt="Radio mode with chat and list panels">
  <br>
  <em>Radio Mode with chat and list panels</em>
</p>

### Automatic Bandwidth Saving

Radio Mode lowers the actual player quality instead of only hiding the video.

```text
high-quality video  ->  stable low/adaptive quality  ->  audio keeps playing
```

When you return to video mode, the extension attempts to restore the previous live/VOD quality state.

### Speech EQ

Speech EQ is a radio-mode-only audio filter using the Web Audio API. It trims muddy low frequencies and lightly lifts voice clarity.

| Preset | Description |
|:---|:---|
| Clarity | balanced default |
| Bass Cut | stronger low-end cleanup |
| Night | softer long-session listening |

### Chat and List Panels

Radio Mode can still show SOOP chat.

- The **Chat** button opens chat in a dark floating/embedded panel.
- The list panel can appear on the left for SOOP recommendations/lists.
- If you click an internal SOOP stream link from chat/list, radio mode can rebind to the new player.

### Stealth Mode

Stealth Mode reduces what is visible in the browser chrome.

- changes the tab title to look like a document
- changes the favicon to a document-style icon
- switches to another tab when possible
- keeps audio playing

<p align="center">
  <img src="docs/lupin-mode.png" alt="Stealth mode tab disguise">
</p>

### Minimize Mode

Minimizes the current browser window while audio keeps playing.

---

## Shortcuts

Shortcuts only work on supported SOOP live/VOD pages. You can disable shortcuts in the popup.

| Shortcut | Action | Details |
|:---:|:---|:---|
| `Alt + R` | Toggle Radio Mode | enter radio mode or return to video mode |
| `Alt + B` | Toggle Stealth Mode | disguise the tab and switch away |
| `Alt + M` | Minimize Window | minimize the current browser window |
| `Alt + Up` | Volume up | increase volume by 5% |
| `Alt + Down` | Volume down | decrease volume by 5% |
| `Alt + 0` | Mute/restore | mute or restore the previous volume |

---

## Suggested Workflows

### Listening to live streams while working

1. Open a SOOP live stream.
2. Press `Alt + R`.
3. Turn on Speech EQ if voices need more clarity.
4. Turn on Sleep Mode if you want playback to stop when the stream ends.
5. Use `Alt + B` if you want the tab disguised.

### Listening to VOD before sleep

1. Open a SOOP VOD.
2. Press `Alt + R`.
3. Turn on Sleep Mode in the popup or overlay.
4. Seek to the part you want.
5. Playback stops when the VOD ends.

---

## Troubleshooting

**The radio button does not appear.**

- Make sure you are on a SOOP live or VOD page.
- Refresh the page.
- Check that **Supported sites > SOOP** is enabled in the popup.

**Shortcuts do not work.**

- Make sure the SOOP page is the active tab.
- Check that shortcuts are enabled in the popup.
- Another browser or OS shortcut may be using the same key.

**There is no sound.**

- Press `Alt + 0` to check mute/restore.
- Check the radio overlay volume slider.
- Check the SOOP player's own mute state.

**It stopped working after a SOOP update.**

SOOP's real DOM and player APIs can change. Please open a [GitHub issue](https://github.com/Hahamin/stream-radio-mode/issues) with the URL, browser, and exact action that failed.

---

## Development Checks

```powershell
npm test
npm audit --audit-level=low
npm run cws:package
```

Manual/automated smoke coverage:

- headphone button injection on live pages
- radio mode ON/OFF video opacity and quality restore
- VOD time/progress/seek behavior
- Sleep Mode automatic stop for live-ended and VOD-ended states
- popup Sleep Mode toggle and overlay Sleep Mode button sync
- chat/list internal navigation rebind
- stealth title/favicon disguise and restore
- no button overlap or overflow on desktop/mobile widths

Chrome Web Store API automation is documented in [docs/chrome-web-store-api.md](docs/chrome-web-store-api.md).

---

## Contributing

Bug reports, feature requests, and PRs are welcome.

- [Open an issue](https://github.com/Hahamin/stream-radio-mode/issues)
- Fork -> Branch -> PR

---

<div align="center">

**Star this repo if you find it useful.**

MIT License

</div>
