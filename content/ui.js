/**
 * Stream Radio Mode — 오버레이 UI 코디네이터
 */

const RadioOverlayUI = {
  _overlayEl: null,
  _callbacks: null,
  _externalUpdate: false,

  /** 외부(비디오)에서 볼륨 변경 시 슬라이더 동기화 */
  updateVolume(vol) {
    const overlay = this._overlayEl;
    if (!overlay) return;
    this._externalUpdate = true;
    const pct = Math.round(vol * 100);
    const slider = overlay.querySelector('.srm-volume-slider');
    const valueEl = overlay.querySelector('.srm-volume-value');
    const iconEl = overlay.querySelector('.srm-volume-icon');
    if (slider) slider.value = pct;
    if (valueEl) valueEl.textContent = pct + '%';
    if (iconEl) iconEl.textContent = pct === 0 ? '🔇' : pct < 50 ? '🔉' : '🔊';
    this._externalUpdate = false;
  },

  /**
   * 라디오 모드 오버레이 표시
   * @param {HTMLElement} container - 플레이어 컨테이너
   * @param {object} info - { name, title, avatarUrl }
   * @param {object} callbacks - { onDisable, onVolumeChange, currentVolume }
   */
  show(container, info, callbacks) {
    this.hide();
    this._callbacks = callbacks;
    window._srmChat?._setChatState(false);

    const overlay = document.createElement('div');
    overlay.className = 'srm-overlay';
    overlay.innerHTML = this._buildHTML(info, callbacks?.currentVolume ?? 0.5);
    container.appendChild(overlay);
    this._overlayEl = overlay;

    this._bindEvents(overlay, callbacks);
    this._startVisualizer(overlay);
    this._startStatsSync(overlay);
    window._srmActions?._updateActionCounts(overlay);
    window._srmActions?._updateFavIcon(overlay);
    window._srmActions?._startActionStateSync(overlay);
  },

  /**
   * 스트리머 정보 업데이트 (SPA 네비게이션 시)
   */
  updateInfo(info) {
    if (!this._overlayEl) return;

    const nameEl = this._overlayEl.querySelector('.srm-streamer-name');
    if (nameEl) nameEl.textContent = info.name || '알 수 없음';

    const titleEl = this._overlayEl.querySelector('.srm-stream-title');
    if (titleEl) titleEl.textContent = info.title || '';

    const avatarEl = this._overlayEl.querySelector('.srm-streamer-avatar');
    if (avatarEl && info.avatarUrl) {
      if (avatarEl.tagName === 'IMG') {
        avatarEl.src = info.avatarUrl;
      } else {
        const img = document.createElement('img');
        img.className = 'srm-streamer-avatar';
        img.src = info.avatarUrl;
        img.alt = '';
        avatarEl.replaceWith(img);
      }
    }

    window._srmActions?._updateActionCounts(this._overlayEl);
    window._srmActions?._updateFavIcon(this._overlayEl);
  },

  hide() {
    window._srmChat?._setChatVisible(false);
    window._srmChat?._setChatState(false);
    window._srmActions?._stopActionStateSync();
    window._srmChat?._stopChatScrollController();
    this._stopStatsSync();

    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
    }
  },

  _statsTimer: null,

  _startStatsSync(overlay) {
    this._stopStatsSync();
    const update = () => {
      const viewerEl = document.querySelector('#nAllViewer');
      const timeEl = document.querySelector('#time');
      const stateEl = document.querySelector('#broadState');

      const srmViewer = overlay.querySelector('#srm-viewer-count');
      const srmTime = overlay.querySelector('#srm-broadcast-time');
      const srmState = overlay.querySelector('#srm-broadcast-state');

      if (srmViewer && viewerEl) srmViewer.textContent = viewerEl.textContent.trim();
      if (srmTime && timeEl) srmTime.textContent = timeEl.textContent.trim();
      if (srmState && stateEl) srmState.textContent = stateEl.textContent.trim();
    };
    update();
    this._statsTimer = setInterval(update, 2000);
  },

  _stopStatsSync() {
    if (this._statsTimer) {
      clearInterval(this._statsTimer);
      this._statsTimer = null;
    }
  },

  _buildHTML(info, volume) {
    const avatarHTML = info.avatarUrl
      ? `<img class="srm-streamer-avatar" src="${this._escapeAttr(info.avatarUrl)}" alt="">`
      : `<div class="srm-streamer-avatar srm-no-avatar">${this._getInitial(info.name)}</div>`;

    const vizBars = Array.from({ length: 20 }, (_, i) => {
      const minH = 4 + Math.random() * 6;
      const maxH = 15 + Math.random() * 25;
      const speed = 0.6 + Math.random() * 0.8;
      const delay = Math.random() * -2;
      return `<div class="srm-viz-bar" style="--srm-bar-min:${minH}px;--srm-bar-max:${maxH}px;--srm-bar-speed:${speed}s;animation-delay:${delay}s"></div>`;
    }).join('');

    const volPercent = Math.round(volume * 100);
    const volIcon = volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊';

    return `
      <div class="srm-content">
      <div class="srm-icon">🎧</div>
      <div class="srm-label">RADIO MODE</div>
      <div class="srm-streamer-info">
        ${avatarHTML}
        <div class="srm-streamer-name">${this._escapeHTML(info.name || '알 수 없음')}</div>
        <div class="srm-stream-title">${this._escapeHTML(info.title || '')}</div>
        <div class="srm-stream-stats">
          <span class="srm-stat-item">👁 <span id="srm-viewer-count">-</span></span>
          <span class="srm-stat-sep">·</span>
          <span class="srm-stat-item">⏱ <span id="srm-broadcast-time">--:--:--</span></span>
          <span class="srm-stat-sep">·</span>
          <span class="srm-stat-item srm-stat-live" id="srm-broadcast-state">방송중</span>
        </div>
      </div>
      <div class="srm-actions">
        <button class="srm-action-btn" data-action="favorite" title="즐겨찾기">
          <span id="srm-fav-icon">☆</span> <span class="srm-action-count" id="srm-fav-count"></span>
        </button>
        <button class="srm-action-btn" data-action="like" title="좋아요(UP)">
          👍 <span class="srm-action-count" id="srm-like-count"></span>
        </button>
        <button class="srm-action-btn" data-action="chat-toggle" title="채팅창 토글">
          💬 채팅
        </button>
      </div>
      <div class="srm-visualizer">${vizBars}</div>
      <div class="srm-volume-control">
        <span class="srm-volume-icon" data-action="mute">${volIcon}</span>
        <input type="range" class="srm-volume-slider" min="0" max="100" value="${volPercent}">
        <span class="srm-volume-value">${volPercent}%</span>
      </div>
      <div class="srm-btn-group">
        <button class="srm-switch-btn" data-action="switch-video">
          📺 비디오 모드로 전환
        </button>
        <button class="srm-switch-btn srm-boss-btn" data-action="boss-mode">
          🕶 루팡 모드
        </button>
      </div>
      </div>
    `;
  },

  _bindEvents(overlay, callbacks) {
    overlay.querySelector('[data-action="switch-video"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      callbacks?.onDisable?.();
    });

    const slider = overlay.querySelector('.srm-volume-slider');
    const volValue = overlay.querySelector('.srm-volume-value');
    const volIcon = overlay.querySelector('.srm-volume-icon');
    let prevVolume = callbacks.currentVolume;

    slider?.addEventListener('input', (e) => {
      if (RadioOverlayUI._externalUpdate) return;
      const vol = parseInt(e.target.value, 10) / 100;
      volValue.textContent = `${e.target.value}%`;
      volIcon.textContent = vol === 0 ? '🔇' : vol < 0.5 ? '🔉' : '🔊';
      prevVolume = vol > 0 ? vol : prevVolume;
      callbacks?.onVolumeChange?.(vol);
    });

    volIcon?.addEventListener('click', () => {
      const currentVol = parseInt(slider.value, 10) / 100;
      if (currentVol > 0) {
        prevVolume = currentVol;
        slider.value = '0';
        volValue.textContent = '0%';
        volIcon.textContent = '🔇';
        callbacks?.onVolumeChange?.(0);
      } else {
        const restore = prevVolume || 0.5;
        slider.value = String(Math.round(restore * 100));
        volValue.textContent = `${Math.round(restore * 100)}%`;
        volIcon.textContent = restore < 0.5 ? '🔉' : '🔊';
        callbacks?.onVolumeChange?.(restore);
      }
    });

    overlay.querySelector('[data-action="boss-mode"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: 'toggle-boss' }).catch(() => {});
    });

    overlay.querySelector('[data-action="favorite"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const favBtn = window._srmActions._findFavoriteButton();
      if (favBtn) {
        window._srmActions._triggerAction('favorite', overlay, () => favBtn.click());
      }
    });

    overlay.querySelector('[data-action="like"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const likeBtn = window._srmActions._findLikeButton();
      if (likeBtn) {
        window._srmActions._triggerAction('like', overlay, () => likeBtn.click());
      }
    });

    const chatToggleBtn = overlay.querySelector('[data-action="chat-toggle"]');
    window._srmChat?._setChatState(false);

    chatToggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!window._srmChat) return;

      const isVisible = window._srmChat._toggleChatState();
      if (isVisible) {
        window._srmChat._setChatVisible(true);
        chatToggleBtn.style.color = '#4ade80';
      } else {
        window._srmChat._setChatVisible(false);
        chatToggleBtn.style.color = '';
      }
    });

    overlay.addEventListener('click', (e) => e.stopPropagation());
  },

  _startVisualizer() {
    // CSS 애니메이션 기반
  },

  _escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },

  _escapeAttr(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  _getInitial(name) {
    return (name || '?').charAt(0).toUpperCase();
  },
};

window.RadioOverlayUI = RadioOverlayUI;
