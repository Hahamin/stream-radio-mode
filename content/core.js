/**
 * Stream Radio Mode — 공통 라디오 모드 엔진
 * 사이트별 어댑터(soop.js)와 함께 동작
 */

/* global RadioOverlayUI */

class RadioModeCore {
  constructor() {
    this.active = false;
    this.adapter = null;
    this._videoRef = null;
    this._lastNonZeroVolume = 0.5;
    this._volumeHandler = null;
    this._messageListener = null;
    this._playerReady = Promise.resolve(null);
    this._transition = Promise.resolve();
    this._initialized = false;
    this._autoRadio = false;
    this._lastUrl = location.href;
    this._urlCheckInterval = null;
    this._urlMessageHandler = null;
    this._playerBindToken = 0;
    this._cancelPlayerWait = null;
    this._urlChangeToken = 0;

    this._init();
  }

  /**
   * 사이트별 어댑터 등록
   */
  setAdapter(adapter) {
    if (!adapter) return;
    this.adapter = adapter;
    this._prepareAdapter();
  }

  /**
   * 사이트 어댑터 해제
   */
  clearAdapter(siteName) {
    if (siteName && this.adapter?.siteName !== siteName) {
      return Promise.resolve(this._getStatePayload());
    }

    this._urlChangeToken += 1;

    return this._queueTransition(async () => {
      if (this.active) {
        await this._disableInternal();
      }

      this._cancelPlayerBindingWait();
      this.adapter = null;
      this._playerReady = Promise.resolve(null);
      this._videoRef = null;
      this._volumeHandler = null;
      document.querySelector('.srm-toggle-btn')?.remove();
      this._notifyState();
      this._saveState();
      return this._getStatePayload();
    });
  }

  isShortcutAvailable() {
    return this._isAdapterUsable();
  }

  _init() {
    if (this._initialized) return;
    this._initialized = true;
    void window.__speechEQ?.init?.();

    // 메시지 리스너 (단축키, 팝업에서 토글 요청)
    this._messageListener = (msg, _sender, sendResponse) => {
      if (msg.action === 'toggle-radio') {
        this.toggle()
          .then(sendResponse)
          .catch(() => sendResponse(this._getStatePayload()));
        return true;
      } else if (msg.action === 'get-state') {
        sendResponse(this._getStatePayload());
        return false;
      } else if (msg.action === 'get-speech-eq-state') {
        sendResponse(this._getSpeechEqState());
        return false;
      } else if (msg.action === 'toggle-speech-eq') {
        this._toggleSpeechEQ()
          .then(sendResponse)
          .catch(() => sendResponse(this._getSpeechEqState()));
        return true;
      } else if (msg.action === 'cycle-speech-eq-preset') {
        this._cycleSpeechEQPreset()
          .then(sendResponse)
          .catch(() => sendResponse(this._getSpeechEqState()));
        return true;
      }
      return false;
    };
    chrome.runtime.onMessage.addListener(this._messageListener);

    chrome.storage.local.get(['autoRadio'], (result) => {
      this._autoRadio = Boolean(result.autoRadio);
      this._autoEnableIfNeeded();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.autoRadio) {
        this._autoRadio = Boolean(changes.autoRadio.newValue);
        this._autoEnableIfNeeded();
      }
    });
  }

  _isAdapterUsable() {
    if (!this.adapter) return false;
    if (typeof this.adapter.isLivePage === 'function') {
      return this.adapter.isLivePage();
    }
    return true;
  }

  _cancelPlayerBindingWait() {
    if (this._cancelPlayerWait) {
      this._cancelPlayerWait();
      this._cancelPlayerWait = null;
    }
  }

  _getVideoSourceSignature(video) {
    if (!video || !(video instanceof HTMLVideoElement)) return '';

    return [
      video.currentSrc || '',
      video.src || '',
      video.getAttribute('src') || '',
      String(video.readyState || 0),
    ].join('|');
  }

  _getPlayerContextSignature(video = null) {
    if (!this.adapter) return '';
    if (typeof this.adapter.getStreamIdentity === 'function') {
      return this.adapter.getStreamIdentity(video);
    }
    return this._getVideoSourceSignature(video);
  }

  _createPlayerMatchOptions(previousVideo = null) {
    if (!previousVideo || !(previousVideo instanceof HTMLVideoElement)) {
      return null;
    }

    return {
      previousVideo,
      previousSignature: this._getVideoSourceSignature(previousVideo),
      previousContextSignature: this._getPlayerContextSignature(previousVideo),
    };
  }

  _matchesPlayer(video, matchOptions = null) {
    if (!video || !(video instanceof HTMLVideoElement)) return false;
    if (!video.isConnected) return false;
    if (!this.adapter) return false;

    if (matchOptions?.previousVideo && video === matchOptions.previousVideo) {
      const currentSignature = this._getVideoSourceSignature(video);
      const currentContextSignature = this._getPlayerContextSignature(video);
      const sourceChanged = Boolean(currentSignature && currentSignature !== matchOptions.previousSignature);
      const contextChanged = Boolean(
        currentContextSignature
        && currentContextSignature !== matchOptions.previousContextSignature
      );

      if (!sourceChanged && !contextChanged) {
        return false;
      }
    }

    return this._isAdapterUsable();
  }

  _prepareAdapter() {
    if (!this.adapter) return;

    if (!this._isAdapterUsable()) {
      this._cancelPlayerBindingWait();
      this._playerReady = Promise.resolve(null);
      document.querySelector('.srm-toggle-btn')?.remove();
      this._notifyState();
      return;
    }

    void this._refreshPlayerBinding();
    this._autoEnableIfNeeded();
  }

  _refreshPlayerBinding(options = {}) {
    const { previousVideo = null } = options;
    const matchOptions = this._createPlayerMatchOptions(previousVideo);

    if (!this._isAdapterUsable()) {
      this._cancelPlayerBindingWait();
      this._playerReady = Promise.resolve(null);
      document.querySelector('.srm-toggle-btn')?.remove();
      return this._playerReady;
    }

    document.querySelector('.srm-toggle-btn')?.remove();
    this._cancelPlayerBindingWait();

    const token = ++this._playerBindToken;
    const boundAdapter = this.adapter;
    this._playerReady = this._waitForPlayer({ token, matchOptions }).catch(() => null);

    this._playerReady.then((video) => {
      if (!this._matchesPlayer(video, matchOptions)) return;
      if (token !== this._playerBindToken || this.adapter !== boundAdapter) return;

      boundAdapter.injectToggleButton(() => {
        void this.toggle();
      });
      this._syncToggleButton();
    });

    return this._playerReady;
  }

  _autoEnableIfNeeded() {
    if (!this._autoRadio || !this._isAdapterUsable() || this.active) return;

    this._playerReady.then((video) => {
      if (this._matchesPlayer(video) && this._isAdapterUsable() && !this.active) {
        void this.enable();
      }
    });
  }

  /**
   * 플레이어가 DOM에 로드될 때까지 대기
   */
  _waitForPlayer(options = {}) {
    const { token, matchOptions = null } = options;

    return new Promise((resolve, reject) => {
      if (!this.adapter) {
        resolve(null);
        return;
      }

      const root = document.body || document.documentElement;
      if (!root) {
        reject(new Error('[StreamRadio] DOM 루트 없음'));
        return;
      }

      let settled = false;
      let observer = null;
      let timeoutId = null;
      let pollIntervalId = null;

      const cleanup = () => {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        if (pollIntervalId) {
          clearInterval(pollIntervalId);
          pollIntervalId = null;
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (this._cancelPlayerWait === cancelWait) {
          this._cancelPlayerWait = null;
        }
      };

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };

      const cancelWait = () => {
        finish(reject, new Error('[StreamRadio] 플레이어 대기 취소'));
      };

      const checkForPlayer = () => {
        if (!this.adapter || token !== this._playerBindToken) {
          cancelWait();
          return;
        }

        const video = this.adapter.findVideoElement();
        if (this._matchesPlayer(video, matchOptions)) {
          finish(resolve, video);
        }
      };

      this._cancelPlayerWait = cancelWait;
      checkForPlayer();
      if (settled) return;

      observer = new MutationObserver(checkForPlayer);
      observer.observe(root, { childList: true, subtree: true });
      pollIntervalId = setInterval(checkForPlayer, 250);

      timeoutId = setTimeout(() => {
        finish(reject, new Error('[StreamRadio] 플레이어 없음'));
      }, 30000);
    });
  }

  /**
   * 라디오 모드 활성화
   */
  async enable() {
    return this._queueTransition(async () => {
      if (!this._isAdapterUsable() || this.active) {
        return this._getStatePayload();
      }

      await this._enableInternal();
      return this._getStatePayload();
    });
  }

  /**
   * 라디오 모드 비활성화 (비디오 모드로 복귀)
   */
  async disable() {
    return this._queueTransition(async () => {
      if (!this.active) {
        return this._getStatePayload();
      }

      await this._disableInternal();
      return this._getStatePayload();
    });
  }

  toggle() {
    return this._queueTransition(async () => {
      if (!this._isAdapterUsable()) {
        return this._getStatePayload();
      }

      if (this.active) {
        await this._disableInternal();
      } else {
        await this._enableInternal();
      }

      return this._getStatePayload();
    });
  }

  _queueTransition(task) {
    const run = this._transition.then(task, task);
    this._transition = run.then(() => undefined, () => undefined);
    return run;
  }

  async _enableInternal(options = {}) {
    const {
      previousVideo = null,
      forceRebind = false,
      playerReadyDelayMs = 0,
    } = options;
    const matchOptions = this._createPlayerMatchOptions(previousVideo);

    if (!this._isAdapterUsable()) return;

    let video = null;
    if (forceRebind) {
      video = await this._refreshPlayerBinding({ previousVideo });
    } else {
      video = this.adapter?.findVideoElement() || (await this._playerReady);
      if (!this._matchesPlayer(video, matchOptions)) {
        video = await this._refreshPlayerBinding({ previousVideo });
      }
    }

    if (playerReadyDelayMs > 0) {
      await this._sleep(playerReadyDelayMs);
      const refreshedVideo = this.adapter?.findVideoElement();
      if (this._matchesPlayer(refreshedVideo, matchOptions)) {
        video = refreshedVideo;
      }
    }

    if (!this._matchesPlayer(video, matchOptions)) return;

    const oldVideo = this._videoRef;
    const oldVolumeHandler = this._volumeHandler;
    if (oldVideo && oldVolumeHandler) {
      oldVideo.removeEventListener('volumechange', oldVolumeHandler);
    }

    this._videoRef = video;
    this._volumeHandler = () => {
      const effectiveVol = video.muted ? 0 : video.volume;
      RadioOverlayUI.updateVolume(effectiveVol);
    };

    // 비디오 렌더링만 숨기고 오디오는 유지한다.
    video.style.opacity = '0';

    // 대역폭 절약은 page context의 플레이어 API만 사용한다.
    window.__bandwidthSaver?.enable();

    const streamerInfo = await this.adapter.getStreamerInfo();
    if (!this._matchesPlayer(video, matchOptions)) {
      video.style.opacity = '';
      window.__bandwidthSaver?.disable();
      return;
    }

    video.addEventListener('volumechange', this._volumeHandler);

    const initialVol = video.muted ? 0 : video.volume;
    const speechEqState = await this._attachSpeechEQ(video);
    RadioOverlayUI.show(document.body, streamerInfo, {
      onDisable: () => {
        void this.disable();
      },
      onVolumeChange: (vol) => this._setVolume(vol),
      onPlaybackToggle: () => this._togglePlayback(),
      currentVolume: initialVol,
      speechEqState,
      onSpeechEqToggle: () => this._toggleSpeechEQ(),
      onSpeechEqPresetCycle: () => this._cycleSpeechEQPreset(),
    });

    this.active = true;
    this._syncToggleButton();
    this._notifyState();
    this._saveState();
    this._startUrlWatch();
  }

  async _disableInternal() {
    window.__bandwidthSaver?.disable();
    await this._detachSpeechEQ();

    const video = this._videoRef || this.adapter?.findVideoElement();
    if (video) {
      if (this._volumeHandler) {
        video.removeEventListener('volumechange', this._volumeHandler);
      }
      video.style.opacity = '';
    }

    this._volumeHandler = null;
    RadioOverlayUI.hide();
    window._srmList?._unbindNavIntercept();

    this.active = false;
    this._videoRef = null;
    this._stopUrlWatch();
    this._syncToggleButton();
    this._notifyState();
    this._saveState();
  }

  async _togglePlayback() {
    if (this._isVodPlayerContext()) {
      const bridgedState = await this._requestPlayerControl('toggle-play');
      if (bridgedState?.ok) {
        return {
          supported: true,
          playing: !Boolean(bridgedState.paused),
        };
      }
    }

    const video = this._videoRef || this.adapter?.findVideoElement?.();
    if (!(video instanceof HTMLVideoElement)) {
      return { supported: false, playing: false };
    }

    try {
      if (video.paused || video.ended) {
        await video.play();
      } else {
        video.pause();
      }
    } catch (_) {}

    return {
      supported: true,
      playing: !video.paused && !video.ended,
    };
  }

  _isVodPlayerContext() {
    if (window.__srmSoopPageState?.playerMode === 'vod') {
      return true;
    }

    try {
      if (this.adapter?.getStatsSnapshot?.()?.stateTone === 'vod') {
        return true;
      }
    } catch (_) {}

    return location.hostname === 'vod.sooplive.co.kr' || location.hostname === 'vod.sooplive.com';
  }

  async _requestPlayerControl(action, payload = {}, timeoutMs = 700) {
    await window.__bandwidthSaver?._ensureInjected?.();

    const requestId = `srm-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    return new Promise((resolve) => {
      let settled = false;
      let timeoutId = null;

      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const finish = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const onMessage = (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== 'srm-player-control-result') return;
        if (event.data?.requestId !== requestId || event.data?.action !== action) return;
        finish(event.data);
      };

      window.addEventListener('message', onMessage);
      timeoutId = window.setTimeout(() => finish(null), timeoutMs);

      try {
        window.postMessage({
          type: 'srm-player-control',
          action,
          requestId,
          ...payload,
        }, '*');
      } catch (_) {
        finish(null);
      }
    });
  }

  _getStatePayload() {
    if (!this._isAdapterUsable()) {
      return { active: null, site: null };
    }

    return { active: this.active, site: this.adapter.siteName };
  }

  _getSpeechEqState() {
    return window.__speechEQ?.getState?.() || {
      enabled: false,
      preset: 'clarity',
      label: '선명',
      supported: Boolean(window.AudioContext || window.webkitAudioContext),
      attached: Boolean(this._videoRef),
      activeProcessing: false,
      contextState: 'idle',
    };
  }

  async _attachSpeechEQ(video) {
    if (!window.__speechEQ?.attach) {
      return this._getSpeechEqState();
    }

    return window.__speechEQ.attach(video);
  }

  async _detachSpeechEQ() {
    if (!window.__speechEQ?.detach) {
      return this._getSpeechEqState();
    }

    return window.__speechEQ.detach();
  }

  async _toggleSpeechEQ() {
    const video = this._videoRef || this.adapter?.findVideoElement?.();
    const state = window.__speechEQ?.toggle
      ? await window.__speechEQ.toggle(video)
      : this._getSpeechEqState();
    RadioOverlayUI.updateSpeechEQ?.(state);
    return state;
  }

  async _cycleSpeechEQPreset() {
    const video = this._videoRef || this.adapter?.findVideoElement?.();
    const state = window.__speechEQ?.cyclePreset
      ? await window.__speechEQ.cyclePreset(video)
      : this._getSpeechEqState();
    RadioOverlayUI.updateSpeechEQ?.(state);
    return state;
  }

  _syncToggleButton() {
    const btn = document.querySelector('.srm-toggle-btn');
    if (btn) {
      btn.classList.toggle('srm-active', this.active);
    }
  }

  /**
   * URL 변경 감지 (SPA 네비게이션: 추천방송 클릭 등)
   */
  _startUrlWatch() {
    this._stopUrlWatch();
    this._lastUrl = location.href;

    // 1) 폴링 (fallback)
    this._urlCheckInterval = setInterval(() => {
      this._checkUrlChange();
    }, 1500);

    // 2) page context에서 보내는 pushState/replaceState 감지 메시지 수신
    this._urlMessageHandler = (e) => {
      if (e.source !== window || e.data?.type !== 'srm-url-changed') return;
      this._checkUrlChange();
    };
    window.addEventListener('message', this._urlMessageHandler);

    // inject 스크립트가 아직 로드 안 됐을 수 있으므로 즉시 로드 보장
    window.__bandwidthSaver?._ensureInjected();
  }

  _stopUrlWatch() {
    if (this._urlCheckInterval) {
      clearInterval(this._urlCheckInterval);
      this._urlCheckInterval = null;
    }
    if (this._urlMessageHandler) {
      window.removeEventListener('message', this._urlMessageHandler);
      this._urlMessageHandler = null;
    }
  }

  _checkUrlChange() {
    const stripHash = (url) => url.replace(/#.*$/, '');
    const current = stripHash(location.href);
    const last = stripHash(this._lastUrl);
    const changed = current !== last;
    this._lastUrl = location.href;
    if (changed) {
      const token = ++this._urlChangeToken;
      void this._onUrlChanged(token);
    }
  }

  _onUrlChanged(token) {
    return this._queueTransition(async () => {
      if (token !== this._urlChangeToken) return;
      if (!this.active || !this.adapter) return;

      console.log('[StreamRadio] URL 변경 감지 → 라디오 모드 재바인딩:', location.href);

      const previousVideo = this._videoRef;

      // 1) 모든 옵저버/채팅 즉시 정지
      const chat = window._srmChat;
      if (chat) {
        chat._stopChatLayoutObserver();
        chat._stopChatScrollController();
        chat._chatVisible = false;
        chat._setChatState(false);
      }
      window._srmActions?._stopActionStateSync();

      // 2) 현재 라디오 모드 완전 해제 (오버레이 제거, 대역폭 복원)
      await this._disableInternal();

      // 3) 비라이브 페이지로 이동한 경우 여기서 중단
      if (token !== this._urlChangeToken || !this._isAdapterUsable()) {
        return;
      }

      // 4) 새 플레이어와 새 UI로 재연결
      await this._enableInternal({
        previousVideo,
        forceRebind: true,
        playerReadyDelayMs: 300,
      });
    });
  }

  _getCurrentVideo() {
    return this._videoRef || this.adapter?.findVideoElement?.() || null;
  }

  _getCurrentVolume() {
    const video = this._getCurrentVideo();
    if (!video) return this._lastNonZeroVolume;
    if (video.muted) return 0;
    if (Number.isFinite(video.volume)) {
      return video.volume;
    }
    return this._lastNonZeroVolume;
  }

  _adjustVolume(delta) {
    const current = this._getCurrentVolume();
    const baseVolume = current === 0 && delta > 0 ? this._lastNonZeroVolume : current;
    const nextVolume = Math.round(Math.max(0, Math.min(1, baseVolume + delta)) * 100) / 100;
    this._setVolume(nextVolume);
    return nextVolume;
  }

  _toggleMute() {
    const video = this._getCurrentVideo();
    if (!video) return 0;

    const currentVolume = video.muted ? 0 : video.volume;
    if (currentVolume > 0) {
      this._lastNonZeroVolume = currentVolume;
      this._setVolume(0);
      return 0;
    }

    const restoreVolume = this._lastNonZeroVolume > 0 ? this._lastNonZeroVolume : 0.5;
    this._setVolume(restoreVolume);
    return restoreVolume;
  }

  _setVolume(vol) {
    vol = Math.max(0, Math.min(1, vol));
    const video = this._getCurrentVideo();

    if (vol > 0) {
      this._lastNonZeroVolume = vol;
    }

    if (video) {
      if (vol === 0) {
        video.muted = true;
      } else {
        video.muted = false;
        video.volume = vol;
      }
    }

    // SOOP UI 동기화 — 커스텀 슬라이더
    const pct = Math.round(vol * 100) + '%';
    const range = document.querySelector('.volume_range');
    const handler = document.querySelector('.volume_handler');
    const tooltip = handler?.querySelector('.tooltip span') || document.querySelector('.volume_text');
    if (range) range.style.width = pct;
    if (handler) handler.style.left = pct;
    if (tooltip) tooltip.textContent = pct;

    // SOOP 음소거 버튼 동기화
    const soundBtn = document.querySelector('#btn_sound, .sound');
    if (soundBtn) {
      if (vol === 0) {
        soundBtn.classList.add('mute');
      } else {
        soundBtn.classList.remove('mute');
      }
    }

    // localStorage 동기화
    try {
      localStorage.setItem('volume', String(vol));
      localStorage.setItem('mute', vol === 0 ? 'true' : 'false');
    } catch (_) {}
  }

  _notifyState() {
    chrome.runtime.sendMessage({
      action: 'state-changed',
      active: this.active,
      site: this.adapter?.siteName,
    }).catch(() => {});
  }

  _saveState() {
    chrome.storage.local.set({ radioMode: this.active });
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

window.__radioModeCore = new RadioModeCore();

/**
 * 로컬 키보드 단축키 핸들러
 * SOOP 방송 페이지에서만 동작 (content script 스코프)
 */
(() => {
  let shortcutsEnabled = true;

  chrome.storage.local.get(['shortcutsEnabled'], (result) => {
    shortcutsEnabled = result.shortcutsEnabled !== false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.shortcutsEnabled !== undefined) {
      shortcutsEnabled = changes.shortcutsEnabled.newValue !== false;
    }
  });

  const handleShortcutKeydown = (e) => {
    if (!shortcutsEnabled) return;
    if (!window.__radioModeCore?.isShortcutAvailable()) return;
    if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;

    const key = e.key.toLowerCase();
    const code = e.code;

    if (key === 'r') {
      e.preventDefault();
      window.__radioModeCore?.toggle();
    } else if (key === 'b') {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'toggle-boss' }).catch(() => {});
    } else if (key === 'm') {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'toggle-minimize' }).catch(() => {});
    } else if (key === 'arrowup') {
      e.preventDefault();
      window.__radioModeCore?._adjustVolume(0.05);
    } else if (key === 'arrowdown') {
      e.preventDefault();
      window.__radioModeCore?._adjustVolume(-0.05);
    } else if (key === '0' || code === 'Digit0' || code === 'Numpad0') {
      e.preventDefault();
      window.__radioModeCore?._toggleMute();
    }
  };

  // VOD 플레이어가 keydown 버블링을 중간에 중단해도 단축키를 먼저 잡을 수 있게 캡처 단계에서 수신한다.
  window.addEventListener('keydown', handleShortcutKeydown, true);
})();
