/**
 * Stream Radio Mode — 대역폭 절약 (page context 주입용)
 *
 * SOOP: livePlayer API로 직접 화질 변경
 *
 * SOOP 화질 상수: LOW, NORMAL, HIGH, HIGH_4000, ORIGINAL, AUTO
 */
(function() {
  'use strict';

  let srmBandwidthActive = false;
  let savedQuality = null;
  let qualityTaskToken = 0;
  let liveQualityMonitorInterval = 0;
  let liveQualityMonitorMedia = null;
  let liveQualityMonitorHandlers = null;
  let liveQualityMonitorState = null;
  let playerStateBridgeInterval = 0;
  let lastPlayerStateSignature = '';

  const LIVE_SAFE_RADIO_QUALITY = 'NORMAL';
  const LIVE_EXTRA_SAVER_QUALITY = 'LOW';
  const LIVE_QUALITY_RANKS = {
    LOW: 0,
    NORMAL: 1,
    HIGH_4000: 2,
    HIGH: 3,
    ORIGINAL: 4,
    AUTO: 5,
  };

  function getLivePlayerBridge() {
    const livePlayer = window.livePlayer;
    if (!livePlayer) return null;

    return {
      type: 'live',
      livePlayer,
    };
  }

  function getVodPlayerBridge() {
    const playerController = window.vodCore?.playerController;
    if (!playerController) return null;

    const playIdx = typeof playerController.playIdx === 'number'
      ? playerController.playIdx
      : 0;
    const fileItem = playerController.fileItems?.[playIdx]
      || playerController.fileItems?.[0]
      || null;
    const levels = Array.isArray(fileItem?.levels) ? fileItem.levels : [];

    return {
      type: 'vod',
      playerController,
      levels,
      defaultQualityName: window.vodCore?.config?.default_quality || null,
    };
  }

  function getSoopPlayerBridge() {
    return getLivePlayerBridge() || getVodPlayerBridge();
  }

  function emitPlayerState(force = false) {
    const livePlayer = window.livePlayer;
    const mainMedia = livePlayer?.mainMedia;
    const snapshot = {
      site: 'soop',
      mainMediaId: mainMedia instanceof HTMLVideoElement ? (mainMedia.id || null) : null,
      mainMediaSrc: mainMedia instanceof HTMLVideoElement ? (mainMedia.currentSrc || mainMedia.src || null) : null,
      broadNo: String(window.requestBroadNo || window.nBroadNo || ''),
      quality: localStorage.getItem('quality') || null,
    };

    const signature = JSON.stringify(snapshot);
    if (!force && signature === lastPlayerStateSignature) {
      return;
    }

    lastPlayerStateSignature = signature;
    window.postMessage({ type: 'srm-player-state', state: snapshot }, '*');
  }

  function ensurePlayerStateBridge() {
    if (playerStateBridgeInterval) {
      return;
    }

    emitPlayerState(true);
    playerStateBridgeInterval = window.setInterval(() => {
      emitPlayerState();
    }, 1000);
  }

  function getLowestVodLevelIndex(levels) {
    if (!Array.isArray(levels) || !levels.length) return null;

    const playableLevels = levels
      .map((level, index) => ({ level, index }))
      .filter(({ level }) => level?.name !== 'adaptive');

    if (!playableLevels.length) {
      return levels.length - 1;
    }

    return playableLevels[playableLevels.length - 1].index;
  }

  function getVodLevelIndexByName(levels, qualityName) {
    if (!Array.isArray(levels) || !levels.length) return null;

    if (typeof qualityName === 'number') return qualityName;

    if (qualityName === 'AUTO') {
      return levels.findIndex((level) => level?.name === 'adaptive');
    }

    if (qualityName === 'LOW') {
      return getLowestVodLevelIndex(levels);
    }

    const normalized = String(qualityName || '').toLowerCase();
    const matchedIndex = levels.findIndex((level) => {
      const candidates = [level?.name, level?.label, level?.resolution, level?.bitrate]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return candidates.includes(normalized);
    });

    return matchedIndex >= 0 ? matchedIndex : null;
  }

  function getVodCurrentLevelIndex(playerController, levels, defaultQualityName) {
    if (typeof playerController?.nativeCurrentLevel === 'number') {
      return playerController.nativeCurrentLevel;
    }

    const defaultIndex = getVodLevelIndexByName(levels, defaultQualityName);
    return defaultIndex ?? 0;
  }

  // ── SOOP 화질 변경 (livePlayer / vodCore.playerController) ──
  function soopChangeQuality(qualityName, options) {
    const { silent = false } = options || {};

    try {
      const playerBridge = getSoopPlayerBridge();
      if (!playerBridge) return false;

      if (playerBridge.type === 'live') {
        const lp = playerBridge.livePlayer;

        // 상위 레벨: livePlayer.changeQuality() — 스트림 재연결 포함
        if (typeof lp.changeQuality === 'function') {
          console.log('[StreamRadio] SOOP 화질 변경 (livePlayer): ' + qualityName);
          lp.changeQuality(qualityName);
          setTimeout(() => emitPlayerState(true), 100);
          return true;
        }

        // fallback: streamConnector.streamer
        const streamer = lp.streamConnector?.streamer;
        if (streamer && typeof streamer.changeQuality === 'function') {
          console.log('[StreamRadio] SOOP 화질 변경 (streamer): ' + qualityName);
          streamer.changeQuality(qualityName);
          setTimeout(() => emitPlayerState(true), 100);
          return true;
        }

        if (!silent) {
          console.warn('[StreamRadio] livePlayer changeQuality 메서드 없음');
        }
        return false;
      }

      const { playerController, levels, defaultQualityName } = playerBridge;
      const targetLevelIndex = getVodLevelIndexByName(levels, qualityName);
      if (targetLevelIndex == null || targetLevelIndex < 0) {
        if (!silent) {
          console.warn('[StreamRadio] VOD 화질 인덱스를 찾지 못함:', qualityName);
        }
        return false;
      }

      console.log(`[StreamRadio] SOOP 화질 변경 (vodCore): ${qualityName} -> ${targetLevelIndex}`);

      if (typeof playerController.setNativeCurrentLevel === 'function') {
        playerController.setNativeCurrentLevel(targetLevelIndex);
      }

      if (typeof playerController.changeCurrentLevelMedia === 'function') {
        playerController.changeCurrentLevelMedia(targetLevelIndex);
        return true;
      }

      if (typeof playerController.loadMedia === 'function') {
        const fileItem = playerController.fileItems?.[playerController.playIdx ?? 0]
          || playerController.fileItems?.[0]
          || null;
        const targetLevel = levels[targetLevelIndex] || null;
        if (fileItem && targetLevel?.file) {
          playerController.loadMedia({
            ...fileItem,
            url: targetLevel.file,
          });
          return true;
        }
      }

      if (!silent) {
        console.warn('[StreamRadio] vodCore 화질 변경 메서드 없음');
      }
      return false;
    } catch (e) {
      if (!silent) {
        console.warn('[StreamRadio] SOOP 화질 변경 실패:', e);
      }
      return false;
    }
  }

  // 현재 SOOP 화질 가져오기
  function soopGetCurrentQuality() {
    try {
      const liveBridge = getLivePlayerBridge();
      if (liveBridge) {
        // localStorage에 저장된 quality
        const stored = localStorage.getItem('quality');
        if (stored) {
          return { type: 'live', value: stored };
        }

        // livePlayer에서 직접 가져오기
        const streamer = liveBridge.livePlayer?.streamConnector?.streamer;
        if (streamer?.getQualityNameFromQualityInfo) {
          return {
            type: 'live',
            value: streamer.getQualityNameFromQualityInfo(
              liveBridge.livePlayer?.config?.qualityInfo || {}
            ),
          };
        }
      }

      const vodBridge = getVodPlayerBridge();
      if (vodBridge) {
        return {
          type: 'vod',
          value: getVodCurrentLevelIndex(
            vodBridge.playerController,
            vodBridge.levels,
            vodBridge.defaultQualityName
          ),
          lowestValue: getLowestVodLevelIndex(vodBridge.levels),
        };
      }

    } catch (e) {
      console.debug('[StreamRadio] 현재 화질 조회 실패:', e);
    }
    return null;
  }

  function isLowestQuality(qualityInfo) {
    if (!qualityInfo) return false;

    if (qualityInfo.type === 'live') {
      return qualityInfo.value === 'LOW';
    }

    if (qualityInfo.type === 'vod') {
      return qualityInfo.value === qualityInfo.lowestValue;
    }

    return false;
  }

  function normalizeLiveQualityName(qualityName) {
    const normalized = String(qualityName || '').trim().toUpperCase();

    if (!normalized) return '';
    if (normalized === '360P' || normalized === 'LOW_QUALITY') return 'LOW';
    if (normalized === '540P' || normalized === 'NORMAL_QUALITY') return 'NORMAL';
    if (normalized === '720P' || normalized === 'HIGH_QUALITY_4000') return 'HIGH_4000';
    if (normalized === '1080P' || normalized === 'HIGH_QUALITY_8000') return 'ORIGINAL';

    return normalized;
  }

  function getLiveQualityRank(qualityName) {
    const normalized = normalizeLiveQualityName(qualityName);
    return Object.prototype.hasOwnProperty.call(LIVE_QUALITY_RANKS, normalized)
      ? LIVE_QUALITY_RANKS[normalized]
      : null;
  }

  function shouldPreserveCurrentLiveQuality(currentQuality) {
    const currentRank = getLiveQualityRank(currentQuality);
    const safeRank = getLiveQualityRank(LIVE_SAFE_RADIO_QUALITY);
    return currentRank !== null && safeRank !== null && currentRank <= safeRank;
  }

  function clearLiveQualityMonitor() {
    if (liveQualityMonitorInterval) {
      clearInterval(liveQualityMonitorInterval);
      liveQualityMonitorInterval = 0;
    }

    if (liveQualityMonitorMedia && liveQualityMonitorHandlers) {
      liveQualityMonitorMedia.removeEventListener('waiting', liveQualityMonitorHandlers.onPlaybackStall);
      liveQualityMonitorMedia.removeEventListener('stalled', liveQualityMonitorHandlers.onPlaybackStall);
      liveQualityMonitorMedia.removeEventListener('suspend', liveQualityMonitorHandlers.onPlaybackStall);
    }

    liveQualityMonitorMedia = null;
    liveQualityMonitorHandlers = null;
    liveQualityMonitorState = null;
  }

  function bindLiveQualityMonitorMedia(media, state, taskToken) {
    if (!(media instanceof HTMLMediaElement)) {
      return;
    }

    if (liveQualityMonitorMedia === media && liveQualityMonitorHandlers) {
      return;
    }

    if (liveQualityMonitorMedia && liveQualityMonitorHandlers) {
      liveQualityMonitorMedia.removeEventListener('waiting', liveQualityMonitorHandlers.onPlaybackStall);
      liveQualityMonitorMedia.removeEventListener('stalled', liveQualityMonitorHandlers.onPlaybackStall);
      liveQualityMonitorMedia.removeEventListener('suspend', liveQualityMonitorHandlers.onPlaybackStall);
    }

    liveQualityMonitorMedia = media;
    liveQualityMonitorHandlers = {
      onPlaybackStall() {
        if (taskToken !== qualityTaskToken || !liveQualityMonitorState) {
          return;
        }

        liveQualityMonitorState.lastStallAt = Date.now();
        if (liveQualityMonitorState.currentQuality === LIVE_EXTRA_SAVER_QUALITY) {
          liveQualityMonitorState.currentQuality = LIVE_SAFE_RADIO_QUALITY;
          liveQualityMonitorState.lowRetryAfter = Date.now() + 20000;
          applyQualityWithRetry(LIVE_SAFE_RADIO_QUALITY, 12, taskToken);
          console.log('[StreamRadio] 버퍼링 감지 → 라디오 모드 화질을 540p로 완화');
        }
      },
    };

    media.addEventListener('waiting', liveQualityMonitorHandlers.onPlaybackStall);
    media.addEventListener('stalled', liveQualityMonitorHandlers.onPlaybackStall);
    media.addEventListener('suspend', liveQualityMonitorHandlers.onPlaybackStall);
  }

  function startAdaptiveLiveQuality(currentQuality, taskToken) {
    clearLiveQualityMonitor();

    const currentLiveQuality = normalizeLiveQualityName(currentQuality?.value);
    const preserveCurrent = shouldPreserveCurrentLiveQuality(currentLiveQuality);
    const initialQuality = preserveCurrent ? currentLiveQuality : LIVE_SAFE_RADIO_QUALITY;

    if (initialQuality) {
      applyQualityWithRetry(initialQuality, 12, taskToken);
    }

    if (preserveCurrent || currentLiveQuality === LIVE_EXTRA_SAVER_QUALITY) {
      return;
    }

    liveQualityMonitorState = {
      currentQuality: initialQuality || LIVE_SAFE_RADIO_QUALITY,
      lastStallAt: Date.now(),
      lowRetryAfter: Date.now() + 12000,
    };

    liveQualityMonitorInterval = setInterval(() => {
      if (taskToken !== qualityTaskToken || !srmBandwidthActive || !liveQualityMonitorState) {
        clearLiveQualityMonitor();
        return;
      }

      const liveBridge = getLivePlayerBridge();
      const streamer = liveBridge?.livePlayer?.streamConnector?.streamer;
      const media = liveBridge?.livePlayer?.mainMedia;

      bindLiveQualityMonitorMedia(media, liveQualityMonitorState, taskToken);

      const bufferedMs = streamer?.getMediaBufferedMilliSeconds?.() ?? 0;
      const isBuffering = Boolean(streamer?.isBuffer) || streamer?.bBufferOK === false || bufferedMs < 1200;

      if (liveQualityMonitorState.currentQuality === LIVE_EXTRA_SAVER_QUALITY) {
        if (isBuffering) {
          liveQualityMonitorState.currentQuality = LIVE_SAFE_RADIO_QUALITY;
          liveQualityMonitorState.lastStallAt = Date.now();
          liveQualityMonitorState.lowRetryAfter = Date.now() + 20000;
          applyQualityWithRetry(LIVE_SAFE_RADIO_QUALITY, 12, taskToken);
          console.log('[StreamRadio] 버퍼 부족 → 라디오 모드 화질을 540p로 유지');
        }
        return;
      }

      if (Date.now() < liveQualityMonitorState.lowRetryAfter) {
        return;
      }

      const stallCooldownPassed = Date.now() - liveQualityMonitorState.lastStallAt > 12000;
      if (stallCooldownPassed && bufferedMs > 3500 && !isBuffering) {
        liveQualityMonitorState.currentQuality = LIVE_EXTRA_SAVER_QUALITY;
        applyQualityWithRetry(LIVE_EXTRA_SAVER_QUALITY, 12, taskToken);
        console.log('[StreamRadio] 버퍼 안정적 → 라디오 모드 화질을 360p까지 추가 절감');
      }
    }, 2000);
  }

  function cancelPendingQualityTasks() {
    qualityTaskToken += 1;
    clearLiveQualityMonitor();
  }

  function applyQualityWithRetry(qualityName, retries, taskToken) {
    const remainingRetries = typeof retries === 'number' ? retries : 12;
    const currentTaskToken = typeof taskToken === 'number' ? taskToken : qualityTaskToken;

    if (currentTaskToken !== qualityTaskToken) {
      return;
    }

    if (soopChangeQuality(qualityName, { silent: remainingRetries > 0 })) {
      return;
    }

    if (remainingRetries <= 0) {
      console.warn('[StreamRadio] 화질 제어 가능한 SOOP 플레이어를 찾지 못함');
      return;
    }

    setTimeout(() => {
      applyQualityWithRetry(qualityName, remainingRetries - 1, currentTaskToken);
    }, 250);
  }

  // ── 메시지 리스너 ──
  window.addEventListener('message', function(e) {
    if (e.source !== window || e.data?.type !== 'srm-bandwidth') return;

    if (e.data.action === 'enable') {
      cancelPendingQualityTasks();
      if (srmBandwidthActive) return;
      srmBandwidthActive = true;

      const currentQuality = soopGetCurrentQuality();
      const currentLiveQuality = normalizeLiveQualityName(currentQuality?.value);
      const shouldSaveLiveQuality = currentQuality?.type === 'live'
        && !shouldPreserveCurrentLiveQuality(currentLiveQuality)
        && currentLiveQuality !== LIVE_EXTRA_SAVER_QUALITY;
      const shouldSaveVodQuality = currentQuality?.type === 'vod' && !isLowestQuality(currentQuality);

      if (currentQuality && (shouldSaveLiveQuality || shouldSaveVodQuality)) {
        savedQuality = currentQuality;
        console.log('[StreamRadio] 현재 화질 저장:', savedQuality);
      }

      if (currentQuality?.type === 'live') {
        startAdaptiveLiveQuality(currentQuality, qualityTaskToken);
      } else {
        applyQualityWithRetry('LOW', 12, qualityTaskToken);
      }
      console.log('[StreamRadio] 대역폭 절약 활성화');

    } else if (e.data.action === 'disable') {
      cancelPendingQualityTasks();
      if (!srmBandwidthActive) return;
      srmBandwidthActive = false;

      // SOOP: 원래 화질로 복원
      if (savedQuality) {
        console.log('[StreamRadio] 화질 복원:', savedQuality);
        applyQualityWithRetry(savedQuality.value, 12, qualityTaskToken);
        savedQuality = null;
      }

      console.log('[StreamRadio] 대역폭 절약 비활성화');
    }
  });

  // ── history API 후킹 — SOOP moveBroad의 pushState/replaceState 감지 ──
  if (!window.__srmHistoryPatched) {
    window.__srmHistoryPatched = true;
    const origPush = history.pushState;
    const origReplace = history.replaceState;

    history.pushState = function(...args) {
      const result = origPush.apply(this, args);
      window.postMessage({ type: 'srm-url-changed', url: location.href }, '*');
      emitPlayerState(true);
      return result;
    };

    history.replaceState = function(...args) {
      const result = origReplace.apply(this, args);
      window.postMessage({ type: 'srm-url-changed', url: location.href }, '*');
      emitPlayerState(true);
      return result;
    };

    window.addEventListener('popstate', () => {
      window.postMessage({ type: 'srm-url-changed', url: location.href }, '*');
      emitPlayerState(true);
    });
  }

  ensurePlayerStateBridge();
  console.log('[StreamRadio] 대역폭 절약 엔진 로드 (page context)');
})();
