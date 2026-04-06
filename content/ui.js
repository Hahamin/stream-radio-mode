/**
 * Stream Radio Mode — 오버레이 UI 코디네이터
 */

const RadioOverlayUI = {
  _overlayEl: null,
  _callbacks: null,
  _externalUpdate: false,
  _previewCaptureBlocked: false,
  _lastPreviewCaptureAt: 0,
  _lastPreviewFrameUrl: '',
  _previousScrollLock: null,

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

  updateSpeechEQ(state) {
    const overlay = this._overlayEl;
    if (!overlay) return;
    this._applySpeechEQState(overlay, state);
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
    this._lockPageScroll();

    const overlay = document.createElement('div');
    overlay.className = 'srm-overlay';
    if (info?.contentType === 'vod') {
      overlay.classList.add('srm-overlay-vod');
    }
    overlay.dataset.srmPreviewFallback = info.thumbnailUrl || '';
    overlay.innerHTML = this._buildHTML(
      info,
      callbacks?.currentVolume ?? 0.5,
      callbacks?.speechEqState,
    );
    container.appendChild(overlay);
    this._overlayEl = overlay;

    this._bindEvents(overlay, callbacks);
    this._bindMediaPreviewEvents(overlay);
    this._applySpeechEQState(overlay, callbacks?.speechEqState);
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

    this._overlayEl.dataset.srmPreviewFallback = info.thumbnailUrl || '';

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

    this._unlockPageScroll();

    this._previewCaptureBlocked = false;
    this._lastPreviewCaptureAt = 0;
    this._lastPreviewFrameUrl = '';
  },

  _statsTimer: null,

  _startStatsSync(overlay) {
    this._stopStatsSync();
    const update = () => {
      const stats = this._getStatsSnapshot();
      this._applyStatsSnapshot(overlay, stats);
      this._applyMediaPreviewSnapshot(overlay, stats);
    };
    update();
    this._statsTimer = setInterval(update, 500);
  },

  _stopStatsSync() {
    if (this._statsTimer) {
      clearInterval(this._statsTimer);
      this._statsTimer = null;
    }
  },

  _getStatsSnapshot() {
    const adapterStats = window.__radioModeCore?.adapter?.getStatsSnapshot?.();
    if (adapterStats) {
      return adapterStats;
    }

    const viewerEl = document.querySelector('#nAllViewer');
    const timeEl = document.querySelector('#time');
    const stateEl = document.querySelector('#broadState');

    return {
      primaryIcon: '👁',
      primaryText: viewerEl?.textContent?.trim() || '-',
      secondaryIcon: '⏱',
      secondaryText: timeEl?.textContent?.trim() || '--:--:--',
      stateText: stateEl?.textContent?.trim() || '방송중',
      stateTone: 'live',
    };
  },

  _applyStatsSnapshot(overlay, stats) {
    if (!overlay || !stats) return;

    const primaryIconEl = overlay.querySelector('#srm-primary-stat-icon');
    const primaryTextEl = overlay.querySelector('#srm-primary-stat-text');
    const secondaryIconEl = overlay.querySelector('#srm-secondary-stat-icon');
    const secondaryTextEl = overlay.querySelector('#srm-secondary-stat-text');
    const stateEl = overlay.querySelector('#srm-broadcast-state');
    const playbackBtn = overlay.querySelector('[data-action="playback-toggle"]');

    if (primaryIconEl) primaryIconEl.textContent = stats.primaryIcon || '👁';
    if (primaryTextEl) primaryTextEl.textContent = stats.primaryText || '-';
    if (secondaryIconEl) secondaryIconEl.textContent = stats.secondaryIcon || '⏱';
    if (secondaryTextEl) secondaryTextEl.textContent = stats.secondaryText || '--:--:--';

    if (stateEl) {
      stateEl.textContent = stats.stateText || '방송중';
      stateEl.classList.toggle('srm-stat-live', stats.stateTone === 'live');
      stateEl.classList.toggle('srm-stat-vod', stats.stateTone === 'vod');
    }

    if (playbackBtn) {
      const isVod = stats.stateTone === 'vod';
      const isPlaying = ['재생중', '버퍼링', '탐색중'].includes(stats.stateText);
      playbackBtn.classList.toggle('srm-visible', isVod);
      playbackBtn.hidden = !isVod;
      playbackBtn.dataset.playing = String(isPlaying);
      playbackBtn.textContent = isPlaying ? '⏸ 일시정지' : '▶ 재생';
    }
  },

  _applyMediaPreviewSnapshot(overlay, stats) {
    if (!overlay) return;

    const previewEl = overlay.querySelector('#srm-media-preview');
    const previewImageEl = overlay.querySelector('#srm-media-preview-image');
    const currentEl = overlay.querySelector('#srm-media-preview-current');
    const totalEl = overlay.querySelector('#srm-media-preview-total');
    const progressBarEl = overlay.querySelector('#srm-media-preview-progress-bar');
    const statusEl = overlay.querySelector('#srm-media-preview-status');
    if (!previewEl || !previewImageEl || !currentEl || !totalEl || !progressBarEl || !statusEl) {
      return;
    }

    if (stats?.stateTone !== 'vod') {
      previewEl.classList.remove('srm-visible');
      previewEl.classList.remove('srm-hovering');
      previewImageEl.removeAttribute('src');
      previewImageEl.classList.remove('srm-ready');
      currentEl.textContent = '--:--';
      totalEl.textContent = '--:--';
      progressBarEl.style.width = '0%';
      statusEl.textContent = '';
      statusEl.hidden = true;
      previewEl.dataset.totalSeconds = '';
      previewEl.dataset.previewImageUrl = '';
      return;
    }

    const currentText = stats?.mediaCurrentText || '';
    const totalText = stats?.mediaTotalText || '';
    const hasTiming = Boolean(currentText || totalText);
    const fallbackImageUrl = stats?.thumbnailUrl || overlay.dataset.srmPreviewFallback || '';
    const capturedFrameUrl = this._getPreviewFrameUrl();
    const previewImageUrl = capturedFrameUrl || fallbackImageUrl;
    const progressRatio = typeof stats?.progressRatio === 'number'
      ? Math.max(0, Math.min(1, stats.progressRatio))
      : null;
    const totalSeconds = Number.isFinite(stats?.mediaTotalSeconds) ? stats.mediaTotalSeconds : 0;
    const shouldShow = Boolean(previewImageUrl || hasTiming);

    previewEl.classList.toggle('srm-visible', shouldShow);
    previewEl.dataset.totalSeconds = totalSeconds > 0 ? String(totalSeconds) : '';
    previewEl.dataset.previewImageUrl = previewImageUrl || '';

    if (!shouldShow) {
      previewImageEl.removeAttribute('src');
      previewImageEl.classList.remove('srm-ready');
      currentEl.textContent = '--:--';
      totalEl.textContent = '--:--';
      progressBarEl.style.width = '0%';
      statusEl.textContent = '';
      statusEl.hidden = true;
      previewEl.classList.remove('srm-hovering');
      return;
    }

    if (previewImageUrl) {
      previewImageEl.src = previewImageUrl;
      previewImageEl.classList.add('srm-ready');
    } else {
      previewImageEl.removeAttribute('src');
      previewImageEl.classList.remove('srm-ready');
    }

    currentEl.textContent = currentText || '--:--';
    totalEl.textContent = totalText || '--:--';
    progressBarEl.style.width = progressRatio !== null ? `${(progressRatio * 100).toFixed(2)}%` : '0%';
    statusEl.textContent = stats?.stateText || '';
    statusEl.hidden = !Boolean(stats?.stateText);
  },

  _bindMediaPreviewEvents(overlay) {
    const progressEl = overlay.querySelector('.srm-media-preview-progress');
    const hoverEl = overlay.querySelector('#srm-media-preview-hover');
    const hoverTimeEl = overlay.querySelector('#srm-media-preview-hover-time');
    const hoverImageEl = overlay.querySelector('#srm-media-preview-hover-image');
    if (!progressEl || !hoverEl || !hoverTimeEl || !hoverImageEl) {
      return;
    }

    let lastSeekAt = 0;
    let lastSeekRatio = -1;

    const onMove = (event) => {
      const previewEl = overlay.querySelector('#srm-media-preview');
      if (!previewEl?.classList.contains('srm-visible')) {
        return;
      }

      const totalSeconds = Number(previewEl.dataset.totalSeconds || 0);
      const previewImageUrl = previewEl.dataset.previewImageUrl || '';
      const rect = progressEl.getBoundingClientRect();
      if (!rect.width) return;

      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const hoverSeconds = totalSeconds > 0 ? Math.round(totalSeconds * ratio) : 0;
      const bubbleWidth = hoverEl.getBoundingClientRect().width || 148;
      const bubbleHalf = bubbleWidth / 2;
      const bubbleX = Math.max(bubbleHalf, Math.min(rect.width - bubbleHalf, event.clientX - rect.left));

      hoverTimeEl.textContent = this._formatDuration(hoverSeconds);
      hoverEl.style.left = `${bubbleX}px`;
      hoverEl.classList.add('srm-visible');
      previewEl.classList.add('srm-hovering');

      if (previewImageUrl) {
        hoverImageEl.src = previewImageUrl;
        hoverImageEl.classList.add('srm-ready');
      } else {
        hoverImageEl.removeAttribute('src');
        hoverImageEl.classList.remove('srm-ready');
      }
    };

    const onSeek = (event) => {
      const previewEl = overlay.querySelector('#srm-media-preview');
      if (!previewEl?.classList.contains('srm-visible')) {
        return;
      }

      const totalSeconds = Number(previewEl.dataset.totalSeconds || 0);
      const rect = progressEl.getBoundingClientRect();
      if (!rect.width || totalSeconds <= 0) {
        return;
      }

      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const now = Date.now();
      if (Math.abs(ratio - lastSeekRatio) < 0.002 && now - lastSeekAt < 400) {
        return;
      }
      const targetSeconds = Math.round(totalSeconds * ratio);
      const didSeek = this._seekMediaPreviewToSeconds(targetSeconds);
      if (!didSeek) {
        return;
      }

      lastSeekAt = now;
      lastSeekRatio = ratio;

      const currentEl = overlay.querySelector('#srm-media-preview-current');
      const progressBarEl = overlay.querySelector('#srm-media-preview-progress-bar');
      if (currentEl) {
        currentEl.textContent = this._formatDuration(targetSeconds);
      }
      if (progressBarEl) {
        progressBarEl.style.width = `${(ratio * 100).toFixed(2)}%`;
      }

      onMove(event);
      event.preventDefault();
      event.stopPropagation();
    };

    const onLeave = () => {
      const previewEl = overlay.querySelector('#srm-media-preview');
      hoverEl.classList.remove('srm-visible');
      previewEl?.classList.remove('srm-hovering');
    };

    progressEl.addEventListener('mousemove', onMove);
    progressEl.addEventListener('mouseenter', onMove);
    progressEl.addEventListener('pointerdown', onSeek);
    progressEl.addEventListener('click', onSeek);
    progressEl.addEventListener('mouseleave', onLeave);
  },

  _seekMediaPreviewToSeconds(targetSeconds) {
    const safeTarget = Math.max(0, Number(targetSeconds) || 0);
    const video = window.__radioModeCore?._videoRef
      || window.__radioModeCore?.adapter?.findVideoElement?.()
      || null;
    const playerController = window.vodCore?.playerController;
    let didSeek = false;
    let clampedTarget = safeTarget;
    let requestedBridgeSeek = false;

    if (video instanceof HTMLVideoElement && Number.isFinite(video.duration) && video.duration > 0) {
      clampedTarget = Math.min(safeTarget, video.duration);
      try {
        if (typeof video.fastSeek === 'function') {
          video.fastSeek(clampedTarget);
        } else {
          video.currentTime = clampedTarget;
        }
        didSeek = true;
      } catch (_) {
        try {
          video.currentTime = clampedTarget;
          didSeek = true;
        } catch (_) {}
      }
    }

    const fallbackMethods = [
      'setMediaCurrentTime',
      'seekMedia',
      'setSeekTime',
    ];

    for (const method of fallbackMethods) {
      if (typeof playerController?.[method] !== 'function') {
        continue;
      }

      try {
        playerController[method](clampedTarget);
        didSeek = true;
        break;
      } catch (_) {}
    }

    if (playerController && didSeek) {
      for (const key of ['_seekTime', '_seekingTime', '_playingTime', '_vodPlayingTime']) {
        if (typeof playerController[key] === 'number') {
          playerController[key] = clampedTarget;
        }
      }
    }

    try {
      window.postMessage({
        type: 'srm-player-control',
        action: 'seek-vod',
        seconds: clampedTarget,
      }, '*');
      requestedBridgeSeek = true;
    } catch (_) {}

    if (didSeek || requestedBridgeSeek) {
      this._lastPreviewCaptureAt = 0;
      this._lastPreviewFrameUrl = '';
    }

    return didSeek || requestedBridgeSeek;
  },

  _getPreviewFrameUrl() {
    const now = Date.now();
    if (this._previewCaptureBlocked) {
      return this._lastPreviewFrameUrl || '';
    }

    if (this._lastPreviewFrameUrl && now - this._lastPreviewCaptureAt < 5000) {
      return this._lastPreviewFrameUrl;
    }

    const video = window.__radioModeCore?._videoRef
      || window.__radioModeCore?.adapter?.findVideoElement?.()
      || null;

    if (!(video instanceof HTMLVideoElement)) {
      return this._lastPreviewFrameUrl || '';
    }

    if (
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      || !Number.isFinite(video.videoWidth)
      || !Number.isFinite(video.videoHeight)
      || video.videoWidth < 80
      || video.videoHeight < 45
    ) {
      return this._lastPreviewFrameUrl || '';
    }

    try {
      const canvas = document.createElement('canvas');
      const targetWidth = 360;
      const targetHeight = Math.max(202, Math.round(targetWidth * (video.videoHeight / video.videoWidth)));
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return this._lastPreviewFrameUrl || '';
      }

      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      this._lastPreviewFrameUrl = canvas.toDataURL('image/jpeg', 0.76);
      this._lastPreviewCaptureAt = now;
    } catch (_) {
      this._previewCaptureBlocked = true;
    }

    return this._lastPreviewFrameUrl || '';
  },

  _lockPageScroll() {
    if (this._previousScrollLock) return;

    const html = document.documentElement;
    const body = document.body;
    if (!html || !body) return;

    this._previousScrollLock = {
      htmlOverflow: html.style.overflow,
      htmlOverflowY: html.style.overflowY,
      bodyOverflow: body.style.overflow,
      bodyOverflowY: body.style.overflowY,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
    };

    html.style.setProperty('overflow', 'hidden', 'important');
    html.style.setProperty('overflow-y', 'hidden', 'important');
    body.style.setProperty('overflow', 'hidden', 'important');
    body.style.setProperty('overflow-y', 'hidden', 'important');
    body.style.setProperty('overscroll-behavior', 'none', 'important');
  },

  _unlockPageScroll() {
    if (!this._previousScrollLock) return;

    const html = document.documentElement;
    const body = document.body;
    if (html) {
      html.style.overflow = this._previousScrollLock.htmlOverflow || '';
      html.style.overflowY = this._previousScrollLock.htmlOverflowY || '';
    }
    if (body) {
      body.style.overflow = this._previousScrollLock.bodyOverflow || '';
      body.style.overflowY = this._previousScrollLock.bodyOverflowY || '';
      body.style.overscrollBehavior = this._previousScrollLock.bodyOverscrollBehavior || '';
    }

    this._previousScrollLock = null;
  },

  _formatDuration(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  },

  _buildHTML(info, volume, speechEqState = null) {
    const isVod = info?.contentType === 'vod';
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
    const initialPresetLabel = this._escapeHTML(speechEqState?.label || '선명');
    const modeLabel = isVod ? 'VOD RADIO MODE' : 'RADIO MODE';
    const modeIcon = isVod ? '🎞' : '🎧';
    const previewChip = isVod ? '다시보기' : 'LIVE';
    const previewLabel = isVod ? '다시보기 진행 시간' : '현재 재생 시간';
    const mediaPreviewHTML = isVod
      ? `
      <div class="srm-media-preview srm-media-preview-vod" id="srm-media-preview">
        <img class="srm-media-preview-image srm-media-preview-image-hidden" id="srm-media-preview-image" alt="">
        <div class="srm-media-preview-meta srm-media-preview-meta-vod">
          <div class="srm-media-preview-header">
            <div class="srm-media-preview-label-group">
              <span class="srm-media-preview-chip">${previewChip}</span>
              <span class="srm-media-preview-label">${previewLabel}</span>
            </div>
            <span class="srm-media-preview-state" id="srm-media-preview-status"></span>
          </div>
          <div class="srm-media-preview-time-row">
            <div class="srm-media-preview-time">
              <span id="srm-media-preview-current">--:--</span>
              <span class="srm-media-preview-sep">/</span>
              <span id="srm-media-preview-total">--:--</span>
            </div>
          </div>
        </div>
        <div class="srm-media-preview-progress srm-media-preview-progress-vod">
          <div class="srm-media-preview-hover" id="srm-media-preview-hover">
            <img class="srm-media-preview-hover-image" id="srm-media-preview-hover-image" alt="">
            <div class="srm-media-preview-hover-time" id="srm-media-preview-hover-time">--:--</div>
          </div>
          <div class="srm-media-preview-progress-bar" id="srm-media-preview-progress-bar"></div>
        </div>
      </div>`
      : `
      <div class="srm-media-preview" id="srm-media-preview">
        <div class="srm-media-preview-frame">
          <img class="srm-media-preview-image" id="srm-media-preview-image" alt="">
          <div class="srm-media-preview-overlay">
            <span class="srm-media-preview-chip">${previewChip}</span>
            <span class="srm-media-preview-state" id="srm-media-preview-status"></span>
          </div>
        </div>
        <div class="srm-media-preview-meta">
          <div class="srm-media-preview-label">${previewLabel}</div>
          <div class="srm-media-preview-time">
            <span id="srm-media-preview-current">--:--</span>
            <span class="srm-media-preview-sep">/</span>
            <span id="srm-media-preview-total">--:--</span>
          </div>
        </div>
        <div class="srm-media-preview-progress">
          <div class="srm-media-preview-hover" id="srm-media-preview-hover">
            <img class="srm-media-preview-hover-image" id="srm-media-preview-hover-image" alt="">
            <div class="srm-media-preview-hover-time" id="srm-media-preview-hover-time">--:--</div>
          </div>
          <div class="srm-media-preview-progress-bar" id="srm-media-preview-progress-bar"></div>
        </div>
      </div>`;

    return `
      <div class="srm-content">
      <div class="srm-icon">${modeIcon}</div>
      <div class="srm-label">${modeLabel}</div>
      <div class="srm-streamer-info">
        ${avatarHTML}
        <div class="srm-streamer-name">${this._escapeHTML(info.name || '알 수 없음')}</div>
        <div class="srm-stream-title">${this._escapeHTML(info.title || '')}</div>
        <div class="srm-stream-stats">
          <span class="srm-stat-item"><span id="srm-primary-stat-icon">👁</span> <span id="srm-primary-stat-text">-</span></span>
          <span class="srm-stat-sep">·</span>
          <span class="srm-stat-item"><span id="srm-secondary-stat-icon">⏱</span> <span id="srm-secondary-stat-text">--:--:--</span></span>
          <span class="srm-stat-sep">·</span>
          <span class="srm-stat-item srm-stat-live" id="srm-broadcast-state">방송중</span>
        </div>
      </div>
      ${mediaPreviewHTML}
      <div class="srm-actions">
        <button class="srm-action-btn srm-playback-btn" data-action="playback-toggle" title="재생 또는 일시정지" hidden>
          ⏸ 일시정지
        </button>
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
      <div class="srm-audio-tools">
        <button class="srm-audio-tool" data-action="speech-eq-toggle" type="button" aria-pressed="false">
          <span>🎙 대사 EQ</span>
          <span class="srm-audio-tool-value" id="srm-speech-eq-status">OFF</span>
        </button>
        <button class="srm-audio-tool" data-action="speech-eq-preset" type="button">
          <span>프리셋</span>
          <span class="srm-audio-tool-value" id="srm-speech-eq-preset">${initialPresetLabel}</span>
        </button>
      </div>
      <div class="srm-audio-tool-hint" id="srm-speech-eq-hint">대사 중심 EQ 꺼짐</div>
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
    let prevVolume = callbacks?.currentVolume ?? 0.5;

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

    overlay.querySelector('[data-action="playback-toggle"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const state = await callbacks?.onPlaybackToggle?.();
        if (!state?.supported) return;
        const btn = overlay.querySelector('[data-action="playback-toggle"]');
        if (!btn) return;
        btn.hidden = false;
        btn.classList.add('srm-visible');
        btn.dataset.playing = String(Boolean(state.playing));
        btn.textContent = state.playing ? '⏸ 일시정지' : '▶ 재생';
      } catch (_) {}
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

    overlay.querySelector('[data-action="speech-eq-toggle"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const state = await callbacks?.onSpeechEqToggle?.();
        if (state) {
          RadioOverlayUI.updateSpeechEQ(state);
        }
      } catch (_) {}
    });

    overlay.querySelector('[data-action="speech-eq-preset"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const state = await callbacks?.onSpeechEqPresetCycle?.();
        if (state) {
          RadioOverlayUI.updateSpeechEQ(state);
        }
      } catch (_) {}
    });

    overlay.addEventListener('click', (e) => e.stopPropagation());
  },

  _applySpeechEQState(overlay, state) {
    const toggleBtn = overlay.querySelector('[data-action="speech-eq-toggle"]');
    const presetBtn = overlay.querySelector('[data-action="speech-eq-preset"]');
    const statusEl = overlay.querySelector('#srm-speech-eq-status');
    const presetEl = overlay.querySelector('#srm-speech-eq-preset');
    const hintEl = overlay.querySelector('#srm-speech-eq-hint');
    const speechState = state || {
      enabled: false,
      supported: true,
      label: '선명',
      contextState: 'idle',
      activeProcessing: false,
    };

    const supported = speechState.supported !== false;
    const enabled = Boolean(speechState.enabled);
    const activeProcessing = Boolean(speechState.activeProcessing);
    const label = speechState.label || '선명';

    if (toggleBtn) {
      toggleBtn.classList.toggle('srm-audio-tool-active', enabled);
      toggleBtn.classList.toggle('srm-audio-tool-pending', enabled && !activeProcessing);
      toggleBtn.disabled = !supported;
      toggleBtn.setAttribute('aria-pressed', String(enabled));
    }

    if (presetBtn) {
      presetBtn.classList.toggle('srm-audio-tool-active', enabled);
      presetBtn.disabled = !supported;
    }

    if (statusEl) {
      if (!supported) {
        statusEl.textContent = '지원 안 됨';
      } else if (!enabled) {
        statusEl.textContent = 'OFF';
      } else if (activeProcessing) {
        statusEl.textContent = 'ON';
      } else {
        statusEl.textContent = '대기';
      }
    }

    if (presetEl) {
      presetEl.textContent = label;
    }

    if (hintEl) {
      if (!supported) {
        hintEl.textContent = '브라우저가 대사 중심 EQ를 지원하지 않음';
      } else if (!enabled) {
        hintEl.textContent = '대사 중심 EQ 꺼짐';
      } else if (activeProcessing) {
        hintEl.textContent = `대사 중심 EQ · ${label}`;
      } else if (speechState.contextState === 'suspended') {
        hintEl.textContent = `대사 중심 EQ 대기중 · ${label}`;
      } else {
        hintEl.textContent = `대사 중심 EQ 준비중 · ${label}`;
      }
    }
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
