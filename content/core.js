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
    this._sleepModeEnabled = false;
    this._sleepOriginMode = null;
    this._sleepOriginUrl = '';
    this._sleepMonitorInterval = null;
    this._sleepPlayerStateHandler = null;
    this._sleepStopInProgress = false;
    this._lastUrl = location.href;
    this._urlCheckInterval = null;
    this._urlMessageHandler = null;
    this._playerBindToken = 0;
    this._cancelPlayerWait = null;
    this._urlChangeToken = 0;
    // 사용자 의도 플래그: SPA 전환 중 내부적으로 disable돼도 유지되어
    // 연속 네비게이션 후 재활성화 근거가 된다.
    this._radioDesired = false;
    // 바인딩 시점에 캡처한 시그니처 (재바인딩 비교용 — 네비게이션 후 재계산 금지)
    this._videoRefSignature = '';
    this._videoRefContextSignature = '';
    this._playerGuardInterval = null;
    this._sleepMutedPending = false;
    this._lastHealthKey = '';

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

    chrome.storage.local.get(['autoRadio', 'sleepModeEnabled'], (result) => {
      this._autoRadio = Boolean(result.autoRadio);
      this._sleepModeEnabled = Boolean(result.sleepModeEnabled);
      this._autoEnableIfNeeded();
      this._syncSleepModeMonitor();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.autoRadio) {
        this._autoRadio = Boolean(changes.autoRadio.newValue);
        this._autoEnableIfNeeded();
      }
      if (areaName === 'local' && changes.sleepModeEnabled) {
        this._sleepModeEnabled = Boolean(changes.sleepModeEnabled.newValue);
        this._syncSleepModeMonitor();
        RadioOverlayUI.updateSleepMode?.(this._getSleepModeState());
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

  _createPlayerMatchOptions(previousVideo = null, previousSignatures = null) {
    if (!previousVideo || !(previousVideo instanceof HTMLVideoElement)) {
      return null;
    }

    // 저장된 시그니처가 있으면 그것을 사용한다. 네비게이션 이후에 재계산하면
    // 이미 새 스트림 값이 되어 "자기 자신과 비교"가 되는 버그가 있었다.
    return {
      previousVideo,
      previousSignature: previousSignatures?.source
        ?? this._getVideoSourceSignature(previousVideo),
      previousContextSignature: previousSignatures?.context
        ?? this._getPlayerContextSignature(previousVideo),
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
    const { previousVideo = null, previousSignatures = null } = options;
    const matchOptions = this._createPlayerMatchOptions(previousVideo, previousSignatures);

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
    // autoRadio 설정 또는 사용자 의도(_radioDesired: 켜둔 채 네비게이션 중
    // 내부적으로 해제된 상태)가 있으면 플레이어 준비 시 자동 활성화한다.
    const wantsRadio = this._autoRadio || this._radioDesired;
    if (!wantsRadio || !this._isAdapterUsable() || this.active) return;

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
      previousSignatures = null,
      forceRebind = false,
      playerReadyDelayMs = 0,
    } = options;
    const matchOptions = this._createPlayerMatchOptions(previousVideo, previousSignatures);

    if (!this._isAdapterUsable()) return;

    let video = null;
    if (forceRebind) {
      video = await this._refreshPlayerBinding({ previousVideo, previousSignatures });
    } else {
      video = this.adapter?.findVideoElement() || (await this._playerReady);
      if (!this._matchesPlayer(video, matchOptions)) {
        video = await this._refreshPlayerBinding({ previousVideo, previousSignatures });
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

    let volumeHandlerAttached = false;
    let bandwidthEnabled = false;
    let videoHidden = false;
    let speechEqAttached = false;

    const rollbackPartialEnable = async () => {
      if (volumeHandlerAttached && this._volumeHandler) {
        video.removeEventListener('volumechange', this._volumeHandler);
        volumeHandlerAttached = false;
      }

      if (speechEqAttached) {
        await this._detachSpeechEQ();
        speechEqAttached = false;
      }

      if (bandwidthEnabled) {
        window.__bandwidthSaver?.disable();
        bandwidthEnabled = false;
      }

      if (videoHidden) {
        video.style.opacity = '';
        videoHidden = false;
      }

      RadioOverlayUI.hide();
      window._srmList?._unbindNavIntercept();
      this._volumeHandler = null;
      if (this._videoRef === video) {
        this._videoRef = null;
      }
      this.active = false;
      this._stopUrlWatch();
      this._stopPlayerGuard();
      this._clearMediaSession();
      this._syncToggleButton();
    };

    this._videoRef = video;
    this._volumeHandler = () => {
      const effectiveVol = video.muted ? 0 : video.volume;
      RadioOverlayUI.updateVolume(effectiveVol);
    };

    try {
      // 비디오 렌더링만 숨기고 오디오는 유지한다.
      video.style.opacity = '0';
      videoHidden = true;

      // 대역폭 절약은 page context의 플레이어 API만 사용한다.
      window.__bandwidthSaver?.enable();
      bandwidthEnabled = true;

      const streamerInfo = await this.adapter.getStreamerInfo();
      if (!this._matchesPlayer(video, matchOptions)) {
        await rollbackPartialEnable();
        return;
      }

      video.addEventListener('volumechange', this._volumeHandler);
      volumeHandlerAttached = true;

      const initialVol = video.muted ? 0 : video.volume;
      speechEqAttached = true;
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
        sleepModeState: this._getSleepModeState(),
        onSleepModeToggle: () => this._toggleSleepMode(),
      });

      this.active = true;
      this._radioDesired = true;
      this._videoRefSignature = this._getVideoSourceSignature(video);
      this._videoRefContextSignature = this._getPlayerContextSignature(video);
      this._sleepOriginMode = this._isVodPlayerContext() ? 'vod' : 'live';
      this._sleepOriginUrl = location.href;
      this._sleepStopInProgress = false;

      // 수면모드 자동 정지가 남긴 음소거 복원 (사용자가 돌아와 다시 켠 시점)
      if (this._sleepMutedPending) {
        this._sleepMutedPending = false;
        try {
          video.muted = false;
        } catch (_) {}
      }

      this._applyMediaSession(streamerInfo);
      this._syncToggleButton();
      this._notifyState();
      this._saveState();
      this._startUrlWatch();
      this._startPlayerGuard();
      this._syncSleepModeMonitor();
    } catch (error) {
      await rollbackPartialEnable();
      throw error;
    }
  }

  async _disableInternal(options = {}) {
    const { keepDesire = false } = options;

    this._stopSleepModeMonitor();
    this._stopPlayerGuard();
    this._clearMediaSession();
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
    if (!keepDesire) {
      this._radioDesired = false;
    }
    this._videoRef = null;
    this._videoRefSignature = '';
    this._videoRefContextSignature = '';
    this._sleepOriginMode = null;
    this._sleepOriginUrl = '';
    this._sleepStopInProgress = false;
    this._stopUrlWatch();
    this._syncToggleButton();
    this._notifyState();
    this._saveState();

    // 비활성화 시 헬스 경고 해제
    if (this._lastHealthKey) {
      this._lastHealthKey = '';
      chrome.runtime.sendMessage({ action: 'health-report', failures: [] }).catch(() => {});
    }
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

  _isVodUrl(rawUrl = location.href) {
    try {
      const url = new URL(rawUrl, location.origin);
      return url.hostname === 'vod.sooplive.co.kr' || url.hostname === 'vod.sooplive.com';
    } catch (_) {
      return false;
    }
  }

  _syncSleepModeMonitor() {
    if (this._sleepModeEnabled && this.active) {
      this._startSleepModeMonitor();
      return;
    }

    this._stopSleepModeMonitor();
  }

  _getSleepModeState() {
    return {
      enabled: this._sleepModeEnabled,
      active: this.active,
    };
  }

  async _setSleepModeEnabled(enabled) {
    const nextEnabled = Boolean(enabled);
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ sleepModeEnabled: nextEnabled }, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve();
      });
    });

    this._sleepModeEnabled = nextEnabled;
    this._syncSleepModeMonitor();
    const state = this._getSleepModeState();
    RadioOverlayUI.updateSleepMode?.(state);
    return state;
  }

  _toggleSleepMode() {
    return this._setSleepModeEnabled(!this._sleepModeEnabled);
  }

  _startSleepModeMonitor() {
    if (this._sleepMonitorInterval || this._sleepPlayerStateHandler) {
      return;
    }

    this._sleepPlayerStateHandler = (event) => {
      if (event.source !== window || event.data?.type !== 'srm-player-state') return;
      window.setTimeout(() => this._checkSleepModeGuard(), 0);
    };
    window.addEventListener('message', this._sleepPlayerStateHandler);

    this._sleepMonitorInterval = window.setInterval(() => {
      this._checkSleepModeGuard();
    }, 1000);

    window.__bandwidthSaver?._ensureInjected?.();
    this._checkSleepModeGuard();
  }

  _stopSleepModeMonitor() {
    if (this._sleepMonitorInterval) {
      clearInterval(this._sleepMonitorInterval);
      this._sleepMonitorInterval = null;
    }

    if (this._sleepPlayerStateHandler) {
      window.removeEventListener('message', this._sleepPlayerStateHandler);
      this._sleepPlayerStateHandler = null;
    }
  }

  _getSleepModeStopReason() {
    if (!this._sleepModeEnabled || !this.active || this._sleepStopInProgress) {
      return null;
    }

    const originMode = this._sleepOriginMode || (this._isVodPlayerContext() ? 'vod' : 'live');
    const state = window.__srmSoopPageState || {};
    const video = this._getCurrentVideo();

    if (originMode === 'vod') {
      return state.vodEnded === true || video?.ended === true ? 'vod-ended' : null;
    }

    if (this._isVodUrl(location.href) || state.playerMode === 'vod' || video?.ended === true) {
      return 'live-ended';
    }

    return null;
  }

  _checkSleepModeGuard() {
    const reason = this._getSleepModeStopReason();
    if (!reason) return;

    this._sleepStopInProgress = true;
    void this._queueTransition(async () => {
      this._sleepStopInProgress = false;
      const nextReason = this._getSleepModeStopReason();
      if (!nextReason) return;
      await this._enterSleepStopped(nextReason);
    });
  }

  async _pauseCurrentPlaybackForSleep(reason = '') {
    const video = this._getCurrentVideo();
    try {
      if (reason === 'live-ended' && video instanceof HTMLMediaElement) {
        video.muted = true;
        // 다음 라디오 활성화 때 음소거를 복원하기 위한 표식
        this._sleepMutedPending = true;
      }
      video?.pause?.();
    } catch (_) {}

    if (this._isVodPlayerContext()) {
      await this._requestPlayerControl('pause', {}, 900);
    }
  }

  async _enterSleepStopped(reason) {
    if (this._sleepStopInProgress) return;

    this._sleepStopInProgress = true;
    const originUrl = this._sleepOriginUrl;

    try {
      try {
        await this._pauseCurrentPlaybackForSleep(reason);
      } catch (error) {
        console.warn('[StreamRadio] 수면모드 재생 정지 요청 실패', error);
      }

      if (this.active) {
        await this._disableInternal();
      }

      if (reason === 'live-ended' && originUrl && this._isVodUrl(location.href)) {
        window.setTimeout(() => {
          if (this._isVodUrl(location.href)) {
            location.replace(originUrl);
          }
        }, 50);
      }
    } catch (error) {
      console.warn('[StreamRadio] 수면모드 자동 정지 실패', error);
    } finally {
      this._sleepStopInProgress = false;
    }
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

    return {
      active: this.active,
      site: this.adapter.siteName,
      healthFailures: this._collectHealthFailures(),
    };
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
   * 라디오 활성 중 플레이어 요소 감시
   * 사이트가 video 요소를 교체(화질 전환, 광고 종료, 플레이어 복구)해도
   * 숨김/볼륨 핸들러/EQ가 새 요소로 따라가게 한다.
   */
  _startPlayerGuard() {
    this._stopPlayerGuard();
    this._playerGuardInterval = window.setInterval(() => {
      this._playerGuardTick();
    }, 2000);
  }

  _stopPlayerGuard() {
    if (this._playerGuardInterval) {
      clearInterval(this._playerGuardInterval);
      this._playerGuardInterval = null;
    }
  }

  _playerGuardTick() {
    if (!this.active) return;

    const video = this._videoRef;

    // 요소가 살아 있으면 은닉 상태만 재보장 (사이트가 style을 리셋하는 경우)
    if (video instanceof HTMLVideoElement && video.isConnected) {
      if (video.style.opacity !== '0') {
        video.style.opacity = '0';
      }
      this._reportHealth();
      return;
    }

    // 요소가 DOM에서 제거됨 → 새 요소를 찾아 재바인딩
    const replacement = this.adapter?.findVideoElement?.();
    if (replacement instanceof HTMLVideoElement && replacement.isConnected) {
      void this._queueTransition(async () => {
        if (!this.active) return;
        await this._rebindActiveVideo(replacement);
      });
    }
    this._reportHealth();
  }

  async _rebindActiveVideo(newVideo) {
    if (!this.active) return;
    if (!(newVideo instanceof HTMLVideoElement) || !newVideo.isConnected) return;

    const oldVideo = this._videoRef;
    if (oldVideo === newVideo) return;

    console.log('[StreamRadio] 활성 중 플레이어 교체 감지 → 재바인딩');

    if (oldVideo && this._volumeHandler) {
      oldVideo.removeEventListener('volumechange', this._volumeHandler);
    }
    if (oldVideo) {
      oldVideo.style.opacity = '';
    }

    this._videoRef = newVideo;
    this._videoRefSignature = this._getVideoSourceSignature(newVideo);
    this._videoRefContextSignature = this._getPlayerContextSignature(newVideo);
    newVideo.style.opacity = '0';
    if (this._volumeHandler) {
      newVideo.addEventListener('volumechange', this._volumeHandler);
      this._volumeHandler();
    }

    try {
      const state = await this._attachSpeechEQ(newVideo);
      RadioOverlayUI.updateSpeechEQ?.(state);
    } catch (_) {}
  }

  /**
   * Media Session — OS 미디어 키 / 블루투스 이어폰 / Chrome 미디어 허브 연동
   */
  _applyMediaSession(info) {
    try {
      if (!('mediaSession' in navigator) || typeof MediaMetadata !== 'function') return;

      const artworkUrl = info?.avatarUrl || info?.thumbnailUrl || '';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: info?.title || info?.name || 'SOOP 라디오 모드',
        artist: info?.name || 'SOOP',
        artwork: artworkUrl ? [{ src: artworkUrl, sizes: '512x512' }] : [],
      });

      navigator.mediaSession.setActionHandler('play', () => {
        const video = this._getCurrentVideo();
        if (video?.paused || video?.ended) void this._togglePlayback();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        const video = this._getCurrentVideo();
        if (video && !video.paused) void this._togglePlayback();
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        void this.disable();
      });
    } catch (_) {}
  }

  _clearMediaSession() {
    try {
      if (!('mediaSession' in navigator)) return;
      ['play', 'pause', 'stop'].forEach((action) => {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch (_) {}
      });
      navigator.mediaSession.metadata = null;
    } catch (_) {}
  }

  /**
   * 어댑터 헬스체크 — 조용한 파손을 배지/팝업 경고로 드러낸다
   */
  _collectHealthFailures() {
    if (!this.active) return [];

    const failures = [];
    const state = window.__srmSoopPageState || {};

    if (!(this._videoRef instanceof HTMLVideoElement) || !this._videoRef.isConnected) {
      failures.push('video-binding');
    }

    // page-context 브리지가 최근에 신호를 보냈는지 (inject 후 1초 주기 브로드캐스트)
    const updatedAt = Number(state.__updatedAt || 0);
    if (!updatedAt || Date.now() - updatedAt > 8000) {
      failures.push('player-bridge');
    } else if (state.playerMode === 'live' && state.caps && state.caps.hasChangeQuality === false) {
      failures.push('quality-api');
    }

    return failures;
  }

  _reportHealth() {
    const failures = this._collectHealthFailures();
    const key = failures.join(',');
    if (key === this._lastHealthKey) return;
    this._lastHealthKey = key;

    if (failures.length) {
      console.warn('[StreamRadio] 어댑터 헬스체크 실패:', failures);
    }
    chrome.runtime.sendMessage({
      action: 'health-report',
      failures,
    }).catch(() => {});
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
      // active가 아니라 _radioDesired로 판정한다: 연속 네비게이션에서 앞선
      // 전환이 disable까지 하고 중단됐어도 사용자 의도(켜짐)는 유지되므로
      // 마지막 URL 변경 처리자가 재활성화를 이어받는다.
      if (!this._radioDesired || !this.adapter) return;

      const sleepStopReason = this._getSleepModeStopReason();
      if (sleepStopReason === 'live-ended') {
        await this._enterSleepStopped(sleepStopReason);
        return;
      }

      console.log('[StreamRadio] URL 변경 감지 → 라디오 모드 재바인딩:', location.href);

      const previousVideo = this._videoRef;
      const previousSignatures = previousVideo
        ? {
          source: this._videoRefSignature,
          context: this._videoRefContextSignature,
        }
        : null;

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
      //    사용자 의도는 유지 — 다음 라이브 페이지에서 재활성화해야 한다.
      if (this.active) {
        await this._disableInternal({ keepDesire: true });
      }

      // 3) 비라이브 페이지로 이동한 경우 여기서 중단
      if (token !== this._urlChangeToken || !this._isAdapterUsable()) {
        return;
      }

      // 4) 새 플레이어와 새 UI로 재연결
      await this._enableInternal({
        previousVideo,
        previousSignatures,
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
