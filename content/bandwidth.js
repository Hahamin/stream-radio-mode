/**
 * Stream Radio Mode — 대역폭 절약 엔진 (content script 측)
 *
 * SOOP: livePlayer API로 직접 화질 변경 (LOW)
 */

const BandwidthSaver = {
  _active: false,
  _ready: null, // inject 스크립트 로드 완료 Promise

  enable() {
    if (this._active) return;
    this._active = true;
    this._dispatch('enable');
  },

  disable() {
    if (!this._active) return;
    this._active = false;
    this._dispatch('disable');
  },

  _dispatch(action) {
    if (this._isPlayerDocument()) {
      this._ensureInjected().then(() => {
        window.postMessage({ type: 'srm-bandwidth', action }, '*');
      });
    }

    this._broadcastToPlayerFrames(action);
  },

  _isPlayerDocument() {
    try {
      const url = new URL(location.href);
      const hostname = url.hostname.toLowerCase();
      const segments = url.pathname.split('/').filter(Boolean);
      const isLivePlayer = hostname === 'play.sooplive.co.kr' || hostname === 'play.sooplive.com';
      const isVodPlayer = (
        hostname === 'vod.sooplive.co.kr'
        || hostname === 'vod.sooplive.com'
      ) && segments[0] === 'player';

      return isLivePlayer || isVodPlayer;
    } catch {
      return false;
    }
  },

  _broadcastToPlayerFrames(action) {
    const playerFrames = document.querySelectorAll('iframe[src*="vod.sooplive.co.kr/player/"], iframe[src*="vod.sooplive.com/player/"]');
    playerFrames.forEach((frame) => {
      try {
        frame.contentWindow?.postMessage({ type: 'srm-bandwidth-bridge', action }, '*');
      } catch (e) {
        console.debug('[StreamRadio] 플레이어 프레임 메시지 전송 실패:', e);
      }
    });
  },

  /**
   * inject 스크립트 로드를 보장하는 Promise 반환
   */
  _ensureInjected() {
    if (this._ready) return this._ready;

    this._ready = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('content/bandwidth-inject.js');
      script.onload = () => {
        script.remove();
        // inject 스크립트의 이벤트 리스너가 등록될 시간 확보
        setTimeout(resolve, 100);
      };
      script.onerror = () => {
        script.remove();
        resolve(); // 에러여도 진행
      };
      (document.head || document.documentElement).appendChild(script);
    });

    return this._ready;
  },
};

window.__bandwidthSaver = BandwidthSaver;
