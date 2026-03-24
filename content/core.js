/**
 * Stream Radio Mode — 공통 라디오 모드 엔진
 * 사이트별 어댑터(soop.js)와 함께 동작
 */

/* global RadioOverlayUI */

class RadioModeCore {
  constructor() {
    this.active = false;
    this.adapter = null;
    this._videoRef = null; // 숨긴 video 요소의 직접 참조
    this._messageListener = null;
    this._playerReady = Promise.resolve(null);
    this._transition = Promise.resolve();
    this._initialized = false;
    this._autoRadio = false;
    this._lastUrl = location.href;
    this._urlCheckInterval = null;

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

    return this._queueTransition(async () => {
      if (this.active) {
        await this._disableInternal();
      }

      this.adapter = null;
      this._playerReady = Promise.resolve(null);
      this._videoRef = null;
      document.querySelector('.srm-toggle-btn')?.remove();
      this._notifyState();
      this._saveState();
      return this._getStatePayload();
    });
  }

  _init() {
    if (this._initialized) return;
    this._initialized = true;

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

  _prepareAdapter() {
    if (!this.adapter) return;

    document.querySelector('.srm-toggle-btn')?.remove();
    this._playerReady = this._waitForPlayer().catch(() => null);

    // 토글 버튼 삽입
    this._playerReady.then((video) => {
      if (video) {
        this.adapter.injectToggleButton(() => {
          void this.toggle();
        });
      }
    });

    this._autoEnableIfNeeded();
  }

  _autoEnableIfNeeded() {
    if (!this._autoRadio || !this.adapter || this.active) return;

    // 방송 시청 페이지에서만 자동 활성화 (메인/목록 페이지 제외)
    if (typeof this.adapter.isLivePage === 'function' && !this.adapter.isLivePage()) return;

    this._playerReady.then((video) => {
      if (video && this.adapter && !this.active) {
        void this.enable();
      }
    });
  }

  /**
   * 플레이어가 DOM에 로드될 때까지 대기
   */
  _waitForPlayer() {
    return new Promise((resolve, reject) => {
      if (!this.adapter) {
        resolve(null);
        return;
      }

      const video = this.adapter.findVideoElement();
      if (video) {
        resolve(video);
        return;
      }

      const root = document.body || document.documentElement;
      if (!root) {
        reject(new Error('[StreamRadio] DOM 루트 없음'));
        return;
      }

      let settled = false;
      const observer = new MutationObserver(() => {
        if (!this.adapter) return;
        const v = this.adapter.findVideoElement();
        if (v && !settled) {
          settled = true;
          observer.disconnect();
          resolve(v);
        }
      });
      observer.observe(root, { childList: true, subtree: true });

      setTimeout(() => {
        if (!settled) {
          settled = true;
          observer.disconnect();
          reject(new Error('[StreamRadio] 플레이어 없음'));
        }
      }, 30000);
    });
  }

  /**
   * 라디오 모드 활성화
   */
  async enable() {
    return this._queueTransition(async () => {
      if (!this.adapter || this.active) {
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
      if (!this.adapter) {
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

  async _enableInternal() {
    const video = (await this._playerReady) || this.adapter?.findVideoElement();
    if (!this.adapter || !video) return;

    this._videoRef = video;

    // 비디오 렌더링만 숨기고 오디오는 유지한다.
    video.style.opacity = '0';

    // 대역폭 절약은 page context의 livePlayer API만 사용한다.
    window.__bandwidthSaver?.enable();

    const streamerInfo = await this.adapter.getStreamerInfo();
    this._volumeHandler = () => {
      const effectiveVol = video.muted ? 0 : video.volume;
      RadioOverlayUI.updateVolume(effectiveVol);
    };
    video.addEventListener('volumechange', this._volumeHandler);

    const initialVol = video.muted ? 0 : video.volume;
    RadioOverlayUI.show(document.body, streamerInfo, {
      onDisable: () => {
        void this.disable();
      },
      onVolumeChange: (vol) => this._setVolume(vol),
      currentVolume: initialVol,
    });

    this.active = true;
    this._syncToggleButton();
    this._notifyState();
    this._saveState();
    this._startUrlWatch();
  }

  async _disableInternal() {
    window.__bandwidthSaver?.disable();

    const video = this._videoRef || this.adapter?.findVideoElement();
    if (video) {
      if (this._volumeHandler) {
        video.removeEventListener('volumechange', this._volumeHandler);
        this._volumeHandler = null;
      }
      video.style.opacity = '';
    }

    RadioOverlayUI.hide();
    window._srmList?._unbindNavIntercept();

    this.active = false;
    this._videoRef = null;
    this._stopUrlWatch();
    this._syncToggleButton();
    this._notifyState();
    this._saveState();
  }

  _getStatePayload() {
    if (!this.adapter) {
      return { active: null, site: null };
    }

    return { active: this.active, site: this.adapter.siteName };
  }

  _syncToggleButton() {
    const btn = document.querySelector('.srm-toggle-btn');
    if (btn) {
      btn.classList.toggle('srm-active', this.active);
    }
  }

  /**
   * URL 변경 감지 (SPA 네비게이션: 추천방송 클릭 등)
   * URL이 바뀌면 스트리머 정보를 다시 가져와 오버레이 업데이트
   */
  _startUrlWatch() {
    this._stopUrlWatch();
    this._lastUrl = location.href;

    // 1) 폴링 (fallback — 500ms로 단축)
    this._urlCheckInterval = setInterval(() => {
      this._checkUrlChange();
    }, 500);

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
    // 해시만 변경된 경우(#n 등)는 무시 — 리스트 새로고침 등에서 발생
    const stripHash = (url) => url.replace(/#.*$/, '');
    const current = stripHash(location.href);
    const last = stripHash(this._lastUrl);
    if (current !== last) {
      this._lastUrl = location.href;
      this._onUrlChanged();
    } else {
      this._lastUrl = location.href;
    }
  }

  async _onUrlChanged() {
    if (!this.active || !this.adapter) return;
    console.log('[StreamRadio] URL 변경 감지 → 라디오 모드 재시작:', location.href);

    // 1) 모든 옵저버/채팅 즉시 정지
    window._srmChat?._stopChatLayoutObserver();
    window._srmChat?._stopChatScrollController();
    window._srmActions?._stopActionStateSync();
    if (window._srmChat) {
      window._srmChat._chatVisible = false;
      window._srmChat._setChatState(false);
    }

    // 2) 현재 라디오 모드 완전 해제 (오버레이 제거, 대역폭 복원)
    await this._disableInternal();

    // 3) SOOP이 새 방송 데이터를 로드할 때까지 대기
    //    document.title 변경을 감지 (최대 15초)
    const oldTitle = document.title;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (!this.adapter) return;
      if (document.title !== oldTitle) break;
    }
    // title 변경 후 추가 안정화 대기
    await new Promise((r) => setTimeout(r, 1000));
    if (!this.adapter) return;

    // 4) 라디오 모드 재활성화 (새 비디오, 새 스트리머 정보, 새 오버레이)
    await this._enableInternal();
  }

  _setVolume(vol) {
    vol = Math.max(0, Math.min(1, vol));
    const video = this._videoRef || this.adapter?.findVideoElement();

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
    const tooltip = handler?.querySelector('.tooltip span');
    if (range) range.style.width = pct;
    if (handler) handler.style.left = pct;
    if (tooltip) tooltip.textContent = pct;

    // SOOP 음소거 버튼 동기화
    const soundBtn = document.querySelector('#btn_sound');
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
}

window.__radioModeCore = new RadioModeCore();

/**
 * 로컬 키보드 단축키 핸들러
 * SOOP 페이지에서만 동작 (content script 스코프)
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

  document.addEventListener('keydown', (e) => {
    if (!shortcutsEnabled) return;
    if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;

    const key = e.key.toLowerCase();

    if (key === 'r') {
      e.preventDefault();
      window.__radioModeCore?.toggle();
    } else if (key === 'b') {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'toggle-boss' }).catch(() => {});
    } else if (key === 'm') {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'toggle-minimize' }).catch(() => {});
    }
  });
})();
