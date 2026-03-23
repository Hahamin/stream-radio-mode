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
          return true;
        }

        // fallback: streamConnector.streamer
        const streamer = lp.streamConnector?.streamer;
        if (streamer && typeof streamer.changeQuality === 'function') {
          console.log('[StreamRadio] SOOP 화질 변경 (streamer): ' + qualityName);
          streamer.changeQuality(qualityName);
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

    } catch (e) {}
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

  function applyQualityWithRetry(qualityName, retries) {
    const remainingRetries = typeof retries === 'number' ? retries : 12;
    if (soopChangeQuality(qualityName, { silent: remainingRetries > 0 })) {
      return;
    }

    if (remainingRetries <= 0) {
      console.warn('[StreamRadio] 화질 제어 가능한 SOOP 플레이어를 찾지 못함');
      return;
    }

    setTimeout(() => {
      applyQualityWithRetry(qualityName, remainingRetries - 1);
    }, 250);
  }

  // ── 메시지 리스너 ──
  window.addEventListener('message', function(e) {
    if (e.source !== window || e.data?.type !== 'srm-bandwidth') return;

    if (e.data.action === 'enable') {
      if (srmBandwidthActive) return;
      srmBandwidthActive = true;

      // SOOP: 현재 화질 저장 후 최저로 변경
      const currentQuality = soopGetCurrentQuality();
      if (currentQuality && !isLowestQuality(currentQuality)) {
        savedQuality = currentQuality;
        console.log('[StreamRadio] 현재 화질 저장:', savedQuality);
      }

      // LOW가 가장 낮은 화질 (VOD일 때는 내부적으로 가장 낮은 level index로 변환)
      applyQualityWithRetry('LOW');
      console.log('[StreamRadio] 대역폭 절약 활성화');

    } else if (e.data.action === 'disable') {
      if (!srmBandwidthActive) return;
      srmBandwidthActive = false;

      // SOOP: 원래 화질로 복원
      if (savedQuality) {
        console.log('[StreamRadio] 화질 복원:', savedQuality);
        applyQualityWithRetry(savedQuality.value);
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
      return result;
    };

    history.replaceState = function(...args) {
      const result = origReplace.apply(this, args);
      window.postMessage({ type: 'srm-url-changed', url: location.href }, '*');
      return result;
    };

    window.addEventListener('popstate', () => {
      window.postMessage({ type: 'srm-url-changed', url: location.href }, '*');
    });
  }

  console.log('[StreamRadio] 대역폭 절약 엔진 로드 (page context)');
})();
