/**
 * Stream Radio Mode — 숲(SOOP) 어댑터
 * sooplive.com (구 sooplive.co.kr) 라이브 + VOD 어댑터
 */

class SoopAdapter {
  constructor() {
    this.siteName = 'soop';
  }

  static isLivePageUrl(rawUrl = location.href) {
    try {
      const url = new URL(rawUrl, location.origin);
      const hostname = url.hostname.toLowerCase();
      if (hostname !== 'play.sooplive.co.kr' && hostname !== 'play.sooplive.com') {
        return false;
      }

      const segments = url.pathname.split('/').filter(Boolean);
      if (!segments.length || segments.length > 2) {
        return false;
      }

      const [bjId, broadNo = ''] = segments;
      const reservedPaths = new Set([
        'directory',
        'live',
        'login',
        'search',
        'signup',
      ]);

      if (!bjId || reservedPaths.has(bjId)) {
        return false;
      }

      if (!broadNo) {
        return true;
      }

      return /^\d+$/.test(broadNo);
    } catch {
      return false;
    }
  }

  static isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  static getInjectedPlayerState() {
    return window.__srmSoopPageState || null;
  }

  /**
   * 현재 페이지가 라이브 시청 페이지인지 판단
   */
  isLivePage() {
    if (!SoopAdapter.isLivePageUrl(location.href)) {
      return false;
    }

    const offlinePanel = document.querySelector('#notBroadingList');
    if (SoopAdapter.isElementVisible(offlinePanel)) {
      return false;
    }

    return true;
  }

  /**
   * 비디오 요소 찾기
   */
  findVideoElement() {
    if (!this.isLivePage()) return null;

    const mainMedia = this._getMainMediaElement();
    if (Number.isFinite(this._scoreVideoElement(mainMedia))) {
      return mainMedia;
    }

    const selectors = [
      '#player_area .htmlplayer_wrap video',
      '#player_area video',
      '#webplayer_contents #player_area video',
      '#webplayer #player_area video',
      '#webplayer_contents video',
      '#webplayer video',
    ];

    const seen = new Set();
    const candidates = [];

    for (const sel of selectors) {
      const matches = document.querySelectorAll(sel);
      matches.forEach((el) => {
        if (!(el instanceof HTMLVideoElement) || seen.has(el)) return;
        seen.add(el);
        candidates.push(el);
      });
    }

    const scored = candidates
      .map((video) => ({ video, score: this._scoreVideoElement(video) }))
      .filter(({ score }) => Number.isFinite(score))
      .sort((a, b) => b.score - a.score);

    return scored[0]?.video || null;
  }

  getStreamIdentity(video = null) {
    const injectedState = SoopAdapter.getInjectedPlayerState();
    const currentVideo = video instanceof HTMLVideoElement ? video : this._getMainMediaElement();
    const [bjId = '', broadNoFromPath = ''] = location.pathname.split('/').filter(Boolean);
    const broadNo = String(injectedState?.broadNo || broadNoFromPath || '');

    return [
      bjId,
      broadNo,
      injectedState?.mainMediaId || currentVideo?.id || '',
      injectedState?.mainMediaSrc || currentVideo?.currentSrc || currentVideo?.src || '',
      String(currentVideo?.readyState || 0),
    ].join('|');
  }

  /**
   * 플레이어 컨테이너 요소
   */
  getPlayerContainer() {
    if (!this.isLivePage()) return null;

    const selectors = [
      '#player_area',
      '#webplayer_contents',
      '#webplayer',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    const video = this.findVideoElement();
    if (video) {
      let parent = video.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        if (parent.offsetWidth > 300 && parent.offsetHeight > 200) return parent;
        parent = parent.parentElement;
      }
    }
    return null;
  }

  /**
   * 스트리머 정보 추출
   */
  async getStreamerInfo() {
    const info = { name: '', title: '', avatarUrl: '', thumbnailUrl: '', contentType: 'live' };

    try {
      const avatarSelectors = [
        '#bjThumbnail img',
        '.thumbnail_box img',
        '#bjThumbnail .thumb img',
      ];
      for (const sel of avatarSelectors) {
        const el = document.querySelector(sel);
        if (el?.src) {
          info.avatarUrl = el.src;
          break;
        }
      }

      info.thumbnailUrl = document.querySelector('meta[property="og:image"]')?.content?.trim() || '';

      const nicknameEl = document.querySelector(
        '.broadcast_information .nickname'
      ) || document.querySelector('.wrapping_player_bottom .nickname')
        || document.querySelector('.nickname');

      if (nicknameEl?.textContent?.trim()) {
        const fullText = nicknameEl.textContent.trim();
        const separators = [' · ', ' - ', ' | '];
        let separated = false;
        for (const sep of separators) {
          const idx = fullText.indexOf(sep);
          if (idx > 0) {
            info.name = fullText.substring(0, idx).trim();
            info.title = fullText.substring(idx + sep.length).trim();
            separated = true;
            break;
          }
        }
        if (!separated) {
          info.name = fullText;
        }
      }

      if (!info.title) {
        const titleSelectors = [
          '#infoTitle',
          '.broadcast_title #infoTitle',
          '.broadcast_title span',
          '.broadcast_information .column_sub',
        ];
        for (const sel of titleSelectors) {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim()) {
            info.title = el.textContent.trim();
            break;
          }
        }
      }

      if (!info.name) {
        const titleMatch = document.title.match(/^(.+?)\s*[-–]\s*SOOP/);
        if (titleMatch) {
          info.name = titleMatch[1].trim();
        }
      }

      if (!info.name) {
        const [bjId] = location.pathname.split('/').filter(Boolean);
        if (bjId) {
          info.name = decodeURIComponent(bjId);
        }
      }
    } catch (e) {
      console.warn('[StreamRadio] 숲 스트리머 정보 추출 실패:', e);
    }

    return info;
  }

  /**
   * 플레이어 컨트롤바에 라디오 모드 토글 버튼 삽입
   */
  injectToggleButton(onToggle) {
    if (!this.isLivePage()) return;

    document.querySelector('.srm-toggle-btn')?.remove();

    const btn = document.createElement('button');
    btn.className = 'srm-toggle-btn';
    btn.innerHTML = `
      🎧
      <div class="srm-tooltip">라디오 모드 (Alt+R)</div>
    `;
    btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;background:transparent;border:none;color:#fff;font-size:18px;cursor:pointer;border-radius:4px;position:relative;';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onToggle();
    });

    const fullScreenBtn = document.querySelector('.btn_fullScreen_mode');
    if (fullScreenBtn?.parentElement) {
      fullScreenBtn.insertAdjacentElement('beforebegin', btn);
      return;
    }

    const screenModeBtn = document.querySelector('.btn_screen_mode');
    if (screenModeBtn?.parentElement) {
      screenModeBtn.insertAdjacentElement('beforebegin', btn);
      return;
    }

    const liveBtn = document.querySelector('#liveButton');
    if (liveBtn) {
      liveBtn.insertAdjacentElement('afterend', btn);
      return;
    }

    const ctrl = document.querySelector('.player_ctrlBox .ctrl');
    if (ctrl) {
      ctrl.appendChild(btn);
      return;
    }

    const container = document.querySelector('#webplayer') || this.getPlayerContainer();
    if (container) {
      btn.style.cssText = 'position:absolute;bottom:40px;left:150px;z-index:10001;background:rgba(0,0,0,0.6);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;';
      if (!container.style.position) {
        container.style.position = 'relative';
      }
      container.appendChild(btn);
    }
  }

  _scoreVideoElement(video) {
    if (!(video instanceof HTMLVideoElement) || !video.isConnected) {
      return Number.NEGATIVE_INFINITY;
    }

    const style = window.getComputedStyle(video);
    const rect = video.getBoundingClientRect();
    const area = rect.width * rect.height;
    const currentSrc = video.currentSrc || video.src || '';

    if (style.display === 'none' || style.visibility === 'hidden' || video.hidden) {
      return Number.NEGATIVE_INFINITY;
    }

    let score = 0;
    const mainMedia = this._getMainMediaElement();

    if (area > 0) score += Math.min(area / 1000, 2000);
    if (currentSrc) score += 120;
    if (currentSrc.startsWith('blob:')) score += 60;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) score += 40;
    if (!video.paused) score += 80;
    if (mainMedia && video === mainMedia) score += 520;
    if (video.id === 'livePlayer') score += 200;
    if (video.id === 'da_video') score += 160;
    if (video.closest('#player_area')) score += 80;
    if (video.closest('.htmlplayer_wrap')) score += 40;
    if (style.opacity === '0') score -= 20;
    if (video.id === 'pipMedia') score -= 300;
    if (currentSrc.startsWith('data:')) score -= 240;

    return score;
  }

  _getMainMediaElement() {
    const injectedState = SoopAdapter.getInjectedPlayerState();
    if (injectedState?.mainMediaId) {
      const bridgedMedia = document.getElementById(injectedState.mainMediaId);
      if (bridgedMedia instanceof HTMLVideoElement) {
        return bridgedMedia;
      }
    }

    const mainMedia = window.livePlayer?.mainMedia;
    return mainMedia instanceof HTMLVideoElement ? mainMedia : null;
  }
}

class SoopVodAdapter {
  constructor() {
    this.siteName = 'soop';
  }

  static isVodPageUrl(rawUrl = location.href) {
    try {
      const url = new URL(rawUrl, location.origin);
      const hostname = url.hostname.toLowerCase();
      if (hostname !== 'vod.sooplive.co.kr' && hostname !== 'vod.sooplive.com') {
        return false;
      }

      const segments = url.pathname.split('/').filter(Boolean);
      return segments.length === 2 && segments[0] === 'player' && /^\d+$/.test(segments[1]);
    } catch {
      return false;
    }
  }

  isLivePage() {
    return SoopVodAdapter.isVodPageUrl(location.href);
  }

  findVideoElement() {
    if (!this.isLivePage()) return null;

    const candidates = [
      document.querySelector('#video'),
      document.querySelector('#player video#af_video'),
      document.querySelector('#player video'),
      document.querySelector('#videoLayer video'),
      ...document.querySelectorAll('video.af_video'),
      ...document.querySelectorAll('video'),
    ];

    const seen = new Set();
    const scored = candidates
      .filter((video) => {
        if (!(video instanceof HTMLVideoElement) || seen.has(video)) return false;
        seen.add(video);
        return true;
      })
      .map((video) => ({ video, score: this._scoreVideoElement(video) }))
      .filter(({ score }) => Number.isFinite(score))
      .sort((a, b) => b.score - a.score);

    return scored[0]?.video || null;
  }

  getStreamIdentity(video = null) {
    const currentVideo = video instanceof HTMLVideoElement ? video : this.findVideoElement();
    const [, vodId = ''] = location.pathname.split('/').filter(Boolean);

    return [
      'vod',
      vodId,
      currentVideo?.id || '',
      currentVideo?.currentSrc || currentVideo?.src || '',
      String(currentVideo?.readyState || 0),
    ].join('|');
  }

  getPlayerContainer() {
    if (!this.isLivePage()) return null;

    const selectors = [
      '#player',
      '#videoLayer',
      '#player_area',
      '#webplayer',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    return this.findVideoElement()?.parentElement || null;
  }

  async getStreamerInfo() {
    const info = { name: '', title: '', avatarUrl: '', thumbnailUrl: '', contentType: 'vod' };

    try {
      const nicknameEl = document.querySelector('.ictFunc.nickname')
        || document.querySelector('.nickname')
        || document.querySelector('.author');
      if (nicknameEl?.textContent?.trim()) {
        info.name = nicknameEl.textContent.trim();
      }

      info.title = document.querySelector('meta[property="og:title"]')?.content?.trim() || '';
      info.thumbnailUrl = document.querySelector('meta[property="og:image"]')?.content?.trim() || '';

      if (!info.title) {
        const titleSelectors = [
          '#player_area .title',
          '.player_wrap .title',
          '.vod_title',
          '.title',
        ];
        for (const sel of titleSelectors) {
          const el = document.querySelector(sel);
          const text = el?.textContent?.trim();
          if (text) {
            info.title = text;
            break;
          }
        }
      }

      if (!info.avatarUrl) {
        const avatar = nicknameEl?.closest('.column')?.querySelector('img')
          || document.querySelector('.thumb img[alt="프로필이미지"]')
          || document.querySelector('.thumb img');
        if (avatar?.src) {
          info.avatarUrl = avatar.src;
        }
      }

      if (!info.name) {
        const authorMatch = document.title.match(/^(.+?)\s*\|\s*SOOP VOD/);
        if (authorMatch) {
          info.name = authorMatch[1].trim();
        }
      }
    } catch (error) {
      console.warn('[StreamRadio] 숲 VOD 정보 추출 실패:', error);
    }

    return info;
  }

  getStatsSnapshot() {
    const injectedState = SoopAdapter.getInjectedPlayerState() || {};
    const playerController = window.vodCore?.playerController;
    const media = playerController?._media instanceof HTMLMediaElement
      ? playerController._media
      : this.findVideoElement();
    const currentSeconds = this._getVodCurrentTimeSeconds(playerController, media);
    const totalSeconds = this._getVodTotalDurationSeconds(playerController, media);
    const hasDuration = Number.isFinite(totalSeconds) && totalSeconds > 0;
    const remainingSeconds = hasDuration ? Math.max(0, totalSeconds - currentSeconds) : null;

    return {
      primaryIcon: '▶',
      primaryText: hasDuration
        ? `${this._formatDuration(currentSeconds)} / ${this._formatDuration(totalSeconds)}`
        : `${this._formatDuration(currentSeconds)} / --:--`,
      secondaryIcon: '⌛',
      secondaryText: hasDuration
        ? `남은 ${this._formatDuration(remainingSeconds)}`
        : '길이 확인 중',
      stateText: this._getVodPlaybackState(injectedState, playerController, media, hasDuration),
      stateTone: 'vod',
      mediaCurrentSeconds: currentSeconds,
      mediaTotalSeconds: hasDuration ? totalSeconds : 0,
      mediaCurrentText: this._formatDuration(currentSeconds),
      mediaTotalText: hasDuration ? this._formatDuration(totalSeconds) : '--:--',
      progressRatio: hasDuration && totalSeconds > 0 ? currentSeconds / totalSeconds : null,
      thumbnailUrl: document.querySelector('meta[property="og:image"]')?.content?.trim() || '',
    };
  }

  injectToggleButton(onToggle) {
    if (!this.isLivePage()) return;

    document.querySelector('.srm-vod-toggle-item')?.remove();
    document.querySelector('.srm-toggle-btn')?.remove();

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'srm-toggle-btn';
    btn.innerHTML = `
      🎧
      <div class="srm-tooltip">라디오 모드 (Alt+R)</div>
    `;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onToggle();
    });

    if (this._attachToggleButtonToViewControls(btn)) {
      return;
    }

    const container = this.getPlayerContainer();
    if (container) {
      if (!container.style.position) {
        container.style.position = 'relative';
      }
      btn.style.cssText = [
        'position:absolute',
        'top:76px',
        'right:12px',
        'z-index:10001',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'width:42px',
        'height:42px',
        'padding:0',
        'background:rgba(10,10,12,0.76)',
        'border:1px solid rgba(255,255,255,0.22)',
        'border-radius:14px',
        'color:#fff',
        'font-size:18px',
        'cursor:pointer',
        'box-shadow:0 8px 24px rgba(0,0,0,0.28)',
      ].join(';');
      container.appendChild(btn);
    }
  }

  _attachToggleButtonToViewControls(btn) {
    const viewCtrl = document.querySelector('#player .view_ctrl');
    const listItem = document.querySelector('#player .btn_list');
    if (!(viewCtrl instanceof HTMLElement) || !(listItem instanceof HTMLElement) || listItem.parentElement !== viewCtrl) {
      return false;
    }

    const item = document.createElement('li');
    item.className = 'srm-vod-toggle-item';
    item.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'width:44px',
      'height:44px',
      'list-style:none',
      'margin-top:12px',
      'position:relative',
      'overflow:visible',
      'z-index:10001',
    ].join(';');
    item.style.setProperty('transform', 'none', 'important');
    item.style.setProperty('left', '0', 'important');
    item.style.setProperty('right', '0', 'important');

    btn.classList.add('srm-toggle-btn-vod');
    btn.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'width:44px',
      'height:44px',
      'padding:0',
      'background:rgba(10,10,12,0.78)',
      'border:1px solid rgba(255,255,255,0.22)',
      'border-radius:14px',
      'color:#fff',
      'font-size:18px',
      'cursor:pointer',
      'box-shadow:0 10px 24px rgba(0,0,0,0.3)',
    ].join(';');

    item.appendChild(btn);

    if (listItem.nextSibling) {
      viewCtrl.insertBefore(item, listItem.nextSibling);
    } else {
      viewCtrl.appendChild(item);
    }

    return true;
  }

  _scoreVideoElement(video) {
    if (!(video instanceof HTMLVideoElement) || !video.isConnected) {
      return Number.NEGATIVE_INFINITY;
    }

    const style = window.getComputedStyle(video);
    const rect = video.getBoundingClientRect();
    const area = rect.width * rect.height;
    const currentSrc = video.currentSrc || video.src || '';

    if (style.display === 'none' || style.visibility === 'hidden' || video.hidden) {
      return Number.NEGATIVE_INFINITY;
    }

    let score = 0;
    if (area > 0) score += Math.min(area / 1000, 2000);
    if (currentSrc) score += 140;
    if (video.id === 'video') score += 420;
    if (video.id === 'adVideo') score -= 320;
    if (currentSrc.startsWith('data:')) score -= 260;
    if (video.closest('#player')) score += 120;
    if (video.closest('#videoLayer')) score += 80;
    if (!video.paused) score += 60;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) score += 40;

    return score;
  }

  _getVodCurrentTimeSeconds(playerController, media) {
    const injectedState = SoopAdapter.getInjectedPlayerState() || {};
    const candidates = [
      injectedState.vodCurrentTime,
      media instanceof HTMLMediaElement ? media.currentTime : null,
      playerController?._playingTime,
      playerController?._vodPlayingTime,
      playerController?._seekTime,
      playerController?.currentTime,
      playerController?.playTime,
    ];

    for (const value of candidates) {
      if (Number.isFinite(value) && value >= 0) {
        return Math.floor(value);
      }
    }

    return 0;
  }

  _getVodTotalDurationSeconds(playerController, media) {
    const injectedState = SoopAdapter.getInjectedPlayerState() || {};
    const playIdx = typeof playerController?._playIdx === 'number'
      ? playerController._playIdx
      : typeof playerController?.playIdx === 'number'
        ? playerController.playIdx
        : 0;
    const fileItem = playerController?._fileItems?.[playIdx]
      || playerController?._fileItems?.[0]
      || playerController?.fileItems?.[playIdx]
      || playerController?.fileItems?.[0]
      || null;

    const candidates = [
      injectedState.vodDuration,
      media instanceof HTMLMediaElement ? media.duration : null,
      fileItem?.duration,
      window.vodCore?.config?.totalFileDuration,
      playerController?.duration,
      playerController?.totalTime,
    ];

    for (const value of candidates) {
      if (Number.isFinite(value) && value > 0) {
        return Math.floor(value);
      }
    }

    return 0;
  }

  _getVodPlaybackState(injectedState, playerController, media, hasDuration) {
    if (injectedState.vodSeeking || playerController?._isSeeking) {
      return '탐색중';
    }

    const ended = injectedState.vodEnded === true || media?.ended === true;
    const paused = typeof injectedState.vodPaused === 'boolean'
      ? injectedState.vodPaused
      : media instanceof HTMLMediaElement
        ? media.paused
        : true;
    const readyState = Number.isFinite(injectedState.vodReadyState)
      ? injectedState.vodReadyState
      : media instanceof HTMLMediaElement
        ? media.readyState
        : 0;
    const mediaDuration = media instanceof HTMLMediaElement && Number.isFinite(media.duration) ? media.duration : 0;
    const mediaCurrentTime = media instanceof HTMLMediaElement && Number.isFinite(media.currentTime) ? media.currentTime : 0;

    if (ended) {
      return '시청 완료';
    }

    if (media instanceof HTMLMediaElement) {
      if (hasDuration && mediaCurrentTime >= mediaDuration && mediaDuration > 0) {
        return '시청 완료';
      }

      if (!paused) {
        if (readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
          return '버퍼링';
        }
        return '재생중';
      }

      if (readyState >= HTMLMediaElement.HAVE_METADATA || mediaCurrentTime > 0) {
        return '일시정지';
      }
    }

    if (!paused) {
      return readyState < HTMLMediaElement.HAVE_FUTURE_DATA ? '버퍼링' : '재생중';
    }

    if (hasDuration || this._getVodCurrentTimeSeconds(playerController, media) > 0) {
      return '일시정지';
    }

    return '재생 준비';
  }

  _formatDuration(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}

// 어댑터 등록
(() => {
  if (!location.hostname.includes('sooplive.co.kr') && !location.hostname.includes('sooplive.com')) return;

  window.__srmSoopPageState = window.__srmSoopPageState || {
    mainMediaId: null,
    mainMediaSrc: null,
    broadNo: null,
    quality: null,
    playerMode: null,
    vodCurrentTime: null,
    vodDuration: null,
    vodPaused: null,
    vodEnded: null,
    vodReadyState: null,
    vodSeeking: null,
  };

  let adapter = null;
  let lastUrl = location.href;
  let syncQueue = Promise.resolve();
  const scheduleSync = (options = {}) => {
    const currentUrl = location.href;
    const urlChanged = currentUrl !== lastUrl;
    lastUrl = currentUrl;
    if (!urlChanged && options.force !== true) return;
    void queueSync({ urlChanged: true });
  };

  async function syncAdapterState(options = {}) {
    const { urlChanged = false } = options;
    const { enableSoop = true } = await chrome.storage.local.get(['enableSoop']);
    const adapterCtor = SoopAdapter.isLivePageUrl(location.href)
      ? SoopAdapter
      : SoopVodAdapter.isVodPageUrl(location.href)
        ? SoopVodAdapter
        : null;
    const nextAdapter = adapterCtor ? (adapter instanceof adapterCtor ? adapter : new adapterCtor()) : null;
    const isSupportedPage = nextAdapter?.isLivePage?.() || false;

    if (enableSoop && isSupportedPage && nextAdapter) {
      adapter = nextAdapter;

      if (!urlChanged || !window.__radioModeCore?.active) {
        window.__radioModeCore?.setAdapter(adapter);
      }
      return;
    }

    if (adapter) {
      window.__bossMode?.disable();
      chrome.runtime.sendMessage({ action: 'clear-boss-state' }).catch(() => {});
      await window.__radioModeCore?.clearAdapter('soop');
      adapter = null;
    }
  }

  function queueSync(options = {}) {
    syncQueue = syncQueue.then(
      () => syncAdapterState(options),
      () => syncAdapterState(options)
    );
    return syncQueue;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.enableSoop) {
      void queueSync();
    }
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data?.type === 'srm-player-state' && event.data?.state?.site === 'soop') {
      window.__srmSoopPageState = {
        ...window.__srmSoopPageState,
        ...event.data.state,
      };
      return;
    }

    if (event.data?.type === 'srm-url-changed') {
      scheduleSync();
    }
  });

  window.addEventListener('popstate', () => {
    scheduleSync();
  });

  window.addEventListener('pageshow', () => {
    scheduleSync({ force: true });
  });

  window.setInterval(() => {
    scheduleSync();
  }, 2000);

  void queueSync();
})();
