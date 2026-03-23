/**
 * Stream Radio Mode — Service Worker (Background)
 * 키보드 단축키 처리 + 상태 관리 + 보스 모드
 */

// 보스 모드에서 돌아갈 탭 ID 저장
let bossModeTabId = null;

// 최소화 모드 상태
let minimizedWindowId = null;

// content script / 팝업에서 메시지 수신
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'state-changed' && sender.tab?.id) {
    updateBadge(sender.tab.id, msg.active);
  }

  if (msg.action === 'toggle-boss') {
    const requestedTabId = msg.tabId ?? sender.tab?.id;
    toggleBossMode(requestedTabId)
      .then((active) => sendResponse({ active }))
      .catch(() => sendResponse({ active: false }));
    return true;
  }

  if (msg.action === 'get-boss-state') {
    const requestedTabId = msg.tabId ?? sender.tab?.id;
    sendResponse({ active: requestedTabId === bossModeTabId });
    return false;
  }

  if (msg.action === 'clear-boss-state') {
    const requestedTabId = msg.tabId ?? sender.tab?.id;
    if (requestedTabId === bossModeTabId) {
      bossModeTabId = null;
    }
    sendResponse({ active: false });
    return false;
  }

  if (msg.action === 'toggle-minimize') {
    toggleMinimizeMode()
      .then((minimized) => sendResponse({ minimized }))
      .catch(() => sendResponse({ minimized: false }));
    return true;
  }

  if (msg.action === 'get-minimize-state') {
    sendResponse({ minimized: minimizedWindowId !== null });
    return false;
  }

  return false;
});

/**
 * 현재 탭이 아닌 다른 탭으로 전환
 */
async function switchToOtherTab(currentTabId) {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const otherTab = tabs
      .filter((t) => t.id !== currentTabId && !t.pinned)
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];

    if (otherTab?.id) {
      await chrome.tabs.update(otherTab.id, { active: true });
    }
  } catch {}
}

async function toggleBossMode(tabId) {
  if (!tabId) return false;

  if (bossModeTabId === tabId) {
    await disableBossMode(tabId, false);
    return false;
  }

  if (bossModeTabId !== null && bossModeTabId !== tabId) {
    await disableBossMode(bossModeTabId, false);
  }

  const enabled = await setBossState(tabId, true);
  if (!enabled) {
    bossModeTabId = null;
    return false;
  }

  bossModeTabId = tabId;
  await switchToOtherTab(tabId);
  return true;
}

async function disableBossMode(tabId, activateStreamTab) {
  if (!tabId) return false;

  await setBossState(tabId, false);
  bossModeTabId = null;

  if (activateStreamTab) {
    try {
      await chrome.tabs.update(tabId, { active: true });
    } catch {}
  }

  return true;
}

async function setBossState(tabId, active) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'set-boss-state', active });
    return true;
  } catch {
    if (bossModeTabId === tabId) {
      bossModeTabId = null;
    }
    return false;
  }
}

// 최소화 모드 토글
async function toggleMinimizeMode() {
  try {
    if (minimizedWindowId !== null) {
      // 복원
      try {
        await chrome.windows.update(minimizedWindowId, { state: 'normal' });
      } catch {}
      minimizedWindowId = null;
      return false;
    }

    // 현재 창 최소화
    const currentWindow = await chrome.windows.getCurrent();
    if (currentWindow?.id) {
      await chrome.windows.update(currentWindow.id, { state: 'minimized' });
      minimizedWindowId = currentWindow.id;
      return true;
    }

    return false;
  } catch {
    minimizedWindowId = null;
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

    if (tabId === bossModeTabId) {
      bossModeTabId = null;
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === bossModeTabId) {
    bossModeTabId = null;
  }
});
