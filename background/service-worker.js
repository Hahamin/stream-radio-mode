/**
 * Stream Radio Mode — Service Worker (Background)
 * 상태 관리 + 보스 모드 + 최소화 모드
 */

const BACKGROUND_STATE_KEY = 'srm-background-state';
const backgroundStateStorage = chrome.storage.session || chrome.storage.local;

function getDefaultBackgroundState() {
  return {
    bossMode: {
      tabId: null,
      windowId: null,
    },
    minimizedWindowId: null,
    radioTabId: null,
  };
}

async function getBackgroundState() {
  const stored = await backgroundStateStorage.get(BACKGROUND_STATE_KEY);
  const nextState = {
    ...getDefaultBackgroundState(),
    ...(stored?.[BACKGROUND_STATE_KEY] || {}),
  };

  nextState.bossMode = {
    ...getDefaultBackgroundState().bossMode,
    ...(nextState.bossMode || {}),
  };

  return nextState;
}

async function setBackgroundState(nextState) {
  const normalized = {
    ...getDefaultBackgroundState(),
    ...(nextState || {}),
    bossMode: {
      ...getDefaultBackgroundState().bossMode,
      ...(nextState?.bossMode || {}),
    },
  };

  await backgroundStateStorage.set({
    [BACKGROUND_STATE_KEY]: normalized,
  });

  return normalized;
}

// read-modify-write 직렬화: 동시 patch(예: Alt+B와 Alt+M 동시 입력)가
// 서로의 쓰기를 stale 스냅샷으로 덮어쓰는 경합 방지
let backgroundStateWriteQueue = Promise.resolve();

function patchBackgroundState(patch) {
  const run = backgroundStateWriteQueue.then(async () => {
    const current = await getBackgroundState();
    return setBackgroundState({
      ...current,
      ...(patch || {}),
      bossMode: {
        ...current.bossMode,
        ...(patch?.bossMode || {}),
      },
    });
  });
  backgroundStateWriteQueue = run.then(() => undefined, () => undefined);
  return run;
}

function resolveTabId(msg, sender) {
  return Number.isInteger(msg?.tabId) ? msg.tabId : sender.tab?.id ?? null;
}

function resolveWindowId(msg, sender) {
  return Number.isInteger(msg?.windowId) ? msg.windowId : sender.tab?.windowId ?? null;
}

async function getValidatedBossMode() {
  const state = await getBackgroundState();
  const bossMode = state.bossMode || {};

  if (!bossMode.tabId) {
    return { tabId: null, windowId: null };
  }

  try {
    const tab = await chrome.tabs.get(bossMode.tabId);
    const validated = {
      tabId: tab?.id ?? null,
      windowId: bossMode.windowId ?? tab?.windowId ?? null,
    };

    if (validated.tabId !== bossMode.tabId || validated.windowId !== bossMode.windowId) {
      await patchBackgroundState({ bossMode: validated });
    }

    return validated;
  } catch {
    await patchBackgroundState({
      bossMode: {
        tabId: null,
        windowId: null,
      },
    });
    return { tabId: null, windowId: null };
  }
}

async function getValidatedMinimizedWindowId() {
  const state = await getBackgroundState();
  const { minimizedWindowId } = state;

  if (!minimizedWindowId) {
    return null;
  }

  try {
    const win = await chrome.windows.get(minimizedWindowId);
    if (win?.state === 'minimized') {
      return minimizedWindowId;
    }
  } catch {}

  await patchBackgroundState({ minimizedWindowId: null });
  return null;
}

// content script / 팝업에서 메시지 수신
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'state-changed' && sender.tab?.id) {
    updateBadge(sender.tab.id, msg.active);
    void updateRadioTabId(sender.tab.id, msg.active);
  }

  if (msg.action === 'health-report' && sender.tab?.id) {
    updateHealthBadge(sender.tab.id, msg.failures || []);
  }

  if (msg.action === 'toggle-boss') {
    const requestedTabId = resolveTabId(msg, sender);
    const requestedWindowId = resolveWindowId(msg, sender);
    toggleBossMode(requestedTabId, requestedWindowId)
      .then((active) => sendResponse({ active }))
      .catch(() => sendResponse({ active: false }));
    return true;
  }

  if (msg.action === 'get-boss-state') {
    const requestedTabId = resolveTabId(msg, sender);
    getBossModeState(requestedTabId)
      .then((active) => sendResponse({ active }))
      .catch(() => sendResponse({ active: false }));
    return true;
  }

  if (msg.action === 'clear-boss-state') {
    const requestedTabId = resolveTabId(msg, sender);
    clearBossModeState(requestedTabId)
      .then(() => sendResponse({ active: false }))
      .catch(() => sendResponse({ active: false }));
    return true;
  }

  if (msg.action === 'toggle-minimize') {
    const requestedWindowId = resolveWindowId(msg, sender);
    toggleMinimizeMode(requestedWindowId)
      .then((minimized) => sendResponse({ minimized }))
      .catch(() => sendResponse({ minimized: false }));
    return true;
  }

  if (msg.action === 'get-minimize-state') {
    const requestedWindowId = resolveWindowId(msg, sender);
    getMinimizeModeState(requestedWindowId)
      .then((minimized) => sendResponse({ minimized }))
      .catch(() => sendResponse({ minimized: false }));
    return true;
  }

  return false;
});

/**
 * 현재 탭이 아닌 다른 탭으로 전환
 */
async function switchToOtherTab(currentTabId, windowId) {
  try {
    const query = Number.isInteger(windowId) ? { windowId } : {};
    const tabs = await chrome.tabs.query(query);
    const otherTab = tabs
      .filter((tab) => tab.id !== currentTabId && !tab.pinned)
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0]
      || tabs
        .filter((tab) => tab.id !== currentTabId)
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];

    if (otherTab?.id) {
      await chrome.tabs.update(otherTab.id, { active: true });
    }
  } catch (err) {
    console.debug('[StreamRadio] 탭 전환 실패:', err);
  }
}

async function getBossModeState(tabId) {
  const bossMode = await getValidatedBossMode();
  return Boolean(tabId && bossMode.tabId === tabId);
}

async function toggleBossMode(tabId, windowId) {
  if (!tabId) return false;

  const bossMode = await getValidatedBossMode();

  if (bossMode.tabId === tabId) {
    await disableBossMode(tabId);
    return false;
  }

  if (bossMode.tabId !== null && bossMode.tabId !== tabId) {
    await disableBossMode(bossMode.tabId);
  }

  const enabled = await setBossState(tabId, true);
  if (!enabled) {
    await patchBackgroundState({
      bossMode: {
        tabId: null,
        windowId: null,
      },
    });
    return false;
  }

  await patchBackgroundState({
    bossMode: {
      tabId,
      windowId,
    },
  });

  await switchToOtherTab(tabId, windowId);
  return true;
}

async function clearBossModeState(tabId) {
  const bossMode = await getValidatedBossMode();
  if (tabId && bossMode.tabId !== tabId) {
    return false;
  }

  await patchBackgroundState({
    bossMode: {
      tabId: null,
      windowId: null,
    },
  });
  return true;
}

async function disableBossMode(tabId) {
  if (!tabId) return false;

  await setBossState(tabId, false);
  await clearBossModeState(tabId);
  return true;
}

async function setBossState(tabId, active) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'set-boss-state', active });
    return true;
  } catch {
    const bossMode = await getValidatedBossMode();
    if (bossMode.tabId === tabId) {
      await clearBossModeState(tabId);
    }
    return false;
  }
}

async function getMinimizeModeState(windowId) {
  const minimizedWindowId = await getValidatedMinimizedWindowId();
  if (!windowId) {
    return Boolean(minimizedWindowId);
  }

  return minimizedWindowId === windowId;
}

// 최소화 모드 토글
async function toggleMinimizeMode(windowId) {
  if (!windowId) {
    return false;
  }

  try {
    const minimizedWindowId = await getValidatedMinimizedWindowId();

    if (minimizedWindowId === windowId) {
      try {
        await chrome.windows.update(windowId, { state: 'normal' });
      } catch (err) {
        console.debug('[StreamRadio] 창 복원 실패:', err);
      }
      await patchBackgroundState({ minimizedWindowId: null });
      return false;
    }

    if (minimizedWindowId !== null && minimizedWindowId !== windowId) {
      try {
        await chrome.windows.update(minimizedWindowId, { state: 'normal' });
      } catch (err) {
        console.debug('[StreamRadio] 이전 최소화 창 복원 실패:', err);
      }
      await patchBackgroundState({ minimizedWindowId: null });
    }

    await chrome.windows.update(windowId, { state: 'minimized' });
    await patchBackgroundState({ minimizedWindowId: windowId });
    return true;
  } catch (err) {
    console.debug('[StreamRadio] 최소화 모드 토글 실패:', err);
    await patchBackgroundState({ minimizedWindowId: null });
    return false;
  }
}

// 뱃지 상태 업데이트
function updateBadge(tabId, active) {
  if (active) {
    chrome.action.setBadgeText({ text: 'ON', tabId }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: '#648cff', tabId }).catch(() => {});
  } else {
    chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
  }
}

// 어댑터 헬스 경고 뱃지 — 조용한 파손을 사용자에게 드러낸다
function updateHealthBadge(tabId, failures) {
  if (Array.isArray(failures) && failures.length) {
    chrome.action.setBadgeText({ text: '!', tabId }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: '#ff5147', tabId }).catch(() => {});
  } else {
    // 경고 해제 → 라디오 상태 뱃지 복원은 content의 state-changed가 담당하므로
    // 여기서는 기본(빈) 상태로만 되돌린 뒤 상태 조회로 재동기화한다.
    chrome.tabs.sendMessage(tabId, { action: 'get-state' })
      .then((state) => updateBadge(tabId, Boolean(state?.active)))
      .catch(() => {
        chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
      });
  }
}

// 마지막 라디오 활성 탭 추적 (전역 단축키 라우팅용)
async function updateRadioTabId(tabId, active) {
  try {
    const state = await getBackgroundState();
    if (active) {
      if (state.radioTabId !== tabId) {
        await patchBackgroundState({ radioTabId: tabId });
      }
    } else if (state.radioTabId === tabId) {
      await patchBackgroundState({ radioTabId: null });
    }
  } catch (_) {}
}

// ── 전역 단축키 (chrome.commands) ──
// 탭 포커스와 무관하게 브라우저 어디서나 동작. 루팡/최소화 모드는
// 정의상 다른 탭에 있을 때 쓰므로 전역 라우팅이 필수다.
const RADIO_TAB_URL_PATTERNS = [
  '*://play.sooplive.co.kr/*',
  '*://play.sooplive.com/*',
  '*://vod.sooplive.co.kr/player/*',
  '*://vod.sooplive.com/player/*',
];

async function findRadioTargetTab() {
  let candidates = [];
  try {
    candidates = await chrome.tabs.query({ url: RADIO_TAB_URL_PATTERNS });
  } catch (_) {
    return null;
  }
  if (!candidates.length) return null;

  const activeTab = candidates.find((tab) => tab.active);
  if (activeTab) return activeTab;

  try {
    const state = await getBackgroundState();
    if (state.radioTabId) {
      const radioTab = candidates.find((tab) => tab.id === state.radioTabId);
      if (radioTab) return radioTab;
    }
  } catch (_) {}

  return candidates
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] || null;
}

chrome.commands?.onCommand.addListener((command) => {
  void (async () => {
    const tab = await findRadioTargetTab();
    if (!tab?.id) return;

    if (command === 'toggle-radio') {
      await chrome.tabs.sendMessage(tab.id, { action: 'toggle-radio' }).catch(() => {});
      return;
    }

    if (command === 'toggle-boss') {
      await toggleBossMode(tab.id, tab.windowId ?? null);
      return;
    }

    if (command === 'toggle-minimize') {
      await toggleMinimizeMode(tab.windowId ?? null);
    }
  })();
});

// 탭 업데이트 시 뱃지 초기화
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId });

    void getValidatedBossMode().then((bossMode) => {
      if (tabId === bossMode.tabId) {
        return clearBossModeState(tabId);
      }
      return null;
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void getValidatedBossMode().then((bossMode) => {
    if (tabId === bossMode.tabId) {
      return clearBossModeState(tabId);
    }
    return null;
  });
});

chrome.windows.onRemoved.addListener((windowId) => {
  void getValidatedMinimizedWindowId().then((minimizedWindowId) => {
    if (windowId === minimizedWindowId) {
      return patchBackgroundState({ minimizedWindowId: null });
    }
    return null;
  });
});
