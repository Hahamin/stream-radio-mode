/**
 * Stream Radio Mode — 루팡 모드 (탭 위장)
 * Alt+B 또는 라디오 오버레이 버튼으로 토글
 *
 * 활성화 시:
 *   1. 탭 제목 → "Google Docs - 업무 보고서.docx"
 *   2. 파비콘 → Google Docs 아이콘
 *   3. 오디오는 그대로 유지 (들으면서 일하는 게 목적)
 *   4. 다른 탭으로 자동 전환
 *
 * 비활성화 시:
 *   원래 제목/파비콘 복원
 */

class BossMode {
  constructor() {
    this.active = false;
    this._original = null;
    this._titleObserver = null;

    // Google Docs 위장 설정
    this.disguise = {
      title: 'Google Docs - 업무 보고서.docx',
      faviconSvg: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="6" y="2" width="20" height="28" rx="2" fill="#4285f4"/><rect x="10" y="8" width="12" height="2" rx="1" fill="#fff"/><rect x="10" y="13" width="12" height="2" rx="1" fill="#fff"/><rect x="10" y="18" width="8" height="2" rx="1" fill="#fff"/></svg>`)}`,
    };

    this._initListener();
  }

  _initListener() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.action === 'set-boss-state') {
        if (msg.active) {
          this.enable();
        } else {
          this.disable();
        }
        sendResponse({ active: this.active });
        return false;
      } else if (msg.action === 'get-boss-state') {
        sendResponse({ active: this.active });
        return false;
      }
      return false;
    });
  }

  toggle() {
    if (this.active) {
      this.disable();
    } else {
      this.enable();
    }
  }

  enable() {
    if (this.active) return;

    this.active = true;

    // 원래 상태 저장
    this._original = {
      title: document.title,
      favicons: this._getCurrentFavicons(),
    };

    // 1) 탭 제목 위장
    document.title = this.disguise.title;

    // 2) 파비콘 위장
    this._setDisguiseFavicon();

    // 3) 타이틀 변경 감지 차단 (사이트가 title을 동적으로 바꾸는 것 방지)
    this._titleObserver = new MutationObserver(() => {
      if (this.active && document.title !== this.disguise.title) {
        document.title = this.disguise.title;
      }
    });
    this._titleObserver.observe(
      document.querySelector('title') || document.head,
      { childList: true, characterData: true, subtree: true }
    );
  }

  disable() {
    if (!this.active) return;

    this.active = false;

    // 타이틀 감시 중단
    if (this._titleObserver) {
      this._titleObserver.disconnect();
      this._titleObserver = null;
    }

    // 원래 상태 복원
    if (this._original) {
      document.title = this._original.title;
      this._restoreFavicons(this._original.favicons);
      this._original = null;
    }
  }

  _getCurrentFavicons() {
    return Array.from(document.querySelectorAll('link[rel*="icon"]')).map((link) => ({
      rel: link.getAttribute('rel') || 'icon',
      href: link.getAttribute('href') || '',
      type: link.getAttribute('type') || '',
      sizes: link.getAttribute('sizes') || '',
    }));
  }

  _clearFavicons() {
    document.querySelectorAll('link[rel*="icon"]').forEach((el) => el.remove());
  }

  _setDisguiseFavicon() {
    this._clearFavicons();

    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = this.disguise.faviconSvg;
    document.head.appendChild(link);
  }

  _restoreFavicons(favicons = []) {
    this._clearFavicons();

    favicons
      .filter((favicon) => favicon.href)
      .forEach((favicon) => {
        const link = document.createElement('link');
        link.rel = favicon.rel || 'icon';
        link.href = favicon.href;
        if (favicon.type) link.type = favicon.type;
        if (favicon.sizes) link.setAttribute('sizes', favicon.sizes);
        document.head.appendChild(link);
      });
  }
}

window.__bossMode = new BossMode();
