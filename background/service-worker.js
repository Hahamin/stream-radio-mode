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

async function patchBackgroundState(patch) {
  const current = await getBackgroundState();
  return setBackgroundState({
    ...current,
    ...(patch || {}),
    bossMode: {
      ...current.bossMode,
      ...(patch?.bossMode || {}),
    },
  });
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
    chrome.action.setBadgeText({ text: 'ON', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#648cff', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

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
