/**
 * Stream Radio Mode — 플레이어 프레임 브리지
 *
 * vod.sooplive.co.kr/player/* 프레임 안에서 page-context 스크립트를 주입하고
 * 부모 문서가 보내는 대역폭 절약 메시지를 실제 플레이어 컨텍스트로 전달한다.
 */

(function() {
  'use strict';

  const BandwidthFrameBridge = {
    _ready: null,

    dispatch(action) {
      this._ensureInjected().then(() => {
        window.postMessage({ type: 'srm-bandwidth', action }, '*');
      });
    },

    _ensureInjected() {
      if (this._ready) return this._ready;

      this._ready = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('content/bandwidth-inject.js');
        script.onload = () => {
          script.remove();
          setTimeout(resolve, 100);
        };
        script.onerror = () => {
          script.remove();
          resolve();
        };
        (document.head || document.documentElement).appendChild(script);
      });

      return this._ready;
    },
  };

  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'srm-bandwidth-bridge') return;
    if (e.data.action !== 'enable' && e.data.action !== 'disable') return;

    BandwidthFrameBridge.dispatch(e.data.action);
  });
})();
