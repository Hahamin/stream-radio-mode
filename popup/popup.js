/**
 * Stream Radio Mode — 팝업 UI 로직
 */

const $ = (sel) => document.querySelector(sel);

const radioToggle = $('#radioToggle');
const autoRadio = $('#autoRadio');
const sleepModeToggle = $('#sleepModeToggle');
const bossToggle = $('#bossToggle');
const minimizeToggle = $('#minimizeToggle');
const shortcutsToggle = $('#shortcutsToggle');
const shortcutKeys = $('#shortcutKeys');
const shortcutHelpBtn = $('#shortcutHelpBtn');
const shortcutHelpPanel = $('#shortcutHelpPanel');
const enableSoop = $('#enableSoop');
const statusDot = $('#statusDot');
const statusText = $('#statusText');
const healthWarning = $('#healthWarning');
let shortcutHelpOpen = false;

const HEALTH_MESSAGES = {
  'video-binding': '플레이어 연결 끊김 — 페이지 새로고침을 시도해 보세요',
  'player-bridge': '플레이어 브릿지 무응답 — SOOP 페이지 구조가 바뀌었을 수 있습니다',
  'quality-api': '화질 제어 불가 — SOOP 플레이어 API가 변경된 것 같습니다',
};

function isSoopTab(tab) {
  return Boolean(tab?.url && /:\/\/([^/]+\.)?sooplive\.(co\.kr|com)\//.test(tab.url));
}

function updateHealthWarning(failures) {
  const list = Array.isArray(failures) ? failures : [];
  if (!list.length) {
    healthWarning.hidden = true;
    healthWarning.textContent = '';
    return;
  }

  healthWarning.hidden = false;
  healthWarning.textContent = '⚠ ' + list
    .map((key) => HEALTH_MESSAGES[key] || `어댑터 이상 (${key})`)
    .join(' · ');
}

async function getActiveTabContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return {
    tab: tab || null,
    tabId: tab?.id ?? null,
    windowId: tab?.windowId ?? null,
  };
}

async function init() {
  const settings = await chrome.storage.local.get([
    'autoRadio', 'enableSoop', 'shortcutsEnabled', 'sleepModeEnabled'
  ]);

  autoRadio.checked = settings.autoRadio || false;
  sleepModeToggle.checked = Boolean(settings.sleepModeEnabled);
  enableSoop.checked = settings.enableSoop !== false;
  shortcutsToggle.checked = settings.shortcutsEnabled !== false;
  updateShortcutSection();

  try {
    const { tab, tabId, windowId } = await getActiveTabContext();
    minimizeToggle.checked = false;

    if (windowId !== null) {
      try {
        const minimizeState = await chrome.runtime.sendMessage({
          action: 'get-minimize-state',
          windowId,
        });
        minimizeToggle.checked = Boolean(minimizeState?.minimized);
      } catch {}
    }

    if (tabId) {
      if (isSoopTab(tab) && settings.enableSoop === false) {
        updateStatusDisabled();
        radioToggle.checked = false;
        bossToggle.checked = false;
        return;
      }

      const radioState = await chrome.tabs.sendMessage(tabId, { action: 'get-state' });
      if (radioState) {
        updateStatus(radioState.active, radioState.site, tab);
        updateHealthWarning(radioState.healthFailures);
        radioToggle.checked = radioState.active;
      } else {
        updateStatus(null, null, tab);
      }

      try {
        const bossState = await chrome.runtime.sendMessage({
          action: 'get-boss-state',
          tabId,
          windowId,
        });
        if (bossState) bossToggle.checked = bossState.active;
      } catch {}
    } else {
      updateStatus(null, null);
    }
  } catch {
    updateStatus(null, null);
  }
}

function updateShortcutSection() {
  const enabled = shortcutsToggle.checked;
  shortcutKeys.classList.toggle('disabled', !enabled);
  shortcutHelpBtn.classList.toggle('disabled', !enabled);
  shortcutHelpBtn.textContent = shortcutHelpOpen ? '설명 닫기' : '설명 보기';
  shortcutHelpBtn.setAttribute('aria-expanded', String(shortcutHelpOpen));
  shortcutHelpPanel.hidden = !shortcutHelpOpen;
}

function updateStatusDisabled() {
  statusDot.className = 'status-dot';
  statusDot.classList.add('detecting');
  statusText.textContent = '숲 지원이 꺼져 있습니다';
  radioToggle.checked = false;
  bossToggle.checked = false;
  radioToggle.disabled = true;
  bossToggle.disabled = true;
}

function updateStatus(active, site, tab = null) {
  statusDot.className = 'status-dot';

  if (active === null || active === undefined) {
    statusDot.classList.add('detecting');
    statusText.textContent = isSoopTab(tab)
      ? '방송/VOD 페이지가 아닙니다'
      : '지원 사이트가 아닙니다';
    radioToggle.checked = false;
    bossToggle.checked = false;
    radioToggle.disabled = true;
    bossToggle.disabled = true;
    return;
  }

  radioToggle.disabled = false;
  bossToggle.disabled = false;

  const siteNames = { soop: '숲' };
  const siteName = siteNames[site] || site || '';

  if (active) {
    statusDot.classList.add('active');
    statusText.textContent = `${siteName} 라디오 모드 활성`;
  } else {
    statusDot.classList.add('inactive');
    statusText.textContent = `${siteName} 비디오 모드`;
  }
}

radioToggle.addEventListener('change', async () => {
  try {
    const { tabId } = await getActiveTabContext();
    if (tabId) {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'toggle-radio' });
      if (response) {
        updateStatus(response.active, response.site);
        radioToggle.checked = Boolean(response.active);
      }
    }
  } catch {
    radioToggle.checked = !radioToggle.checked;
  }
});

bossToggle.addEventListener('change', async () => {
  try {
    const { tabId, windowId } = await getActiveTabContext();
    if (tabId) {
      const response = await chrome.runtime.sendMessage({
        action: 'toggle-boss',
        tabId,
        windowId,
      });
      bossToggle.checked = Boolean(response?.active);
    }
  } catch {
    bossToggle.checked = !bossToggle.checked;
  }
});

minimizeToggle.addEventListener('change', async () => {
  try {
    const { windowId } = await getActiveTabContext();
    const response = await chrome.runtime.sendMessage({
      action: 'toggle-minimize',
      windowId,
    });
    minimizeToggle.checked = Boolean(response?.minimized);
  } catch {
    minimizeToggle.checked = !minimizeToggle.checked;
  }
});

autoRadio.addEventListener('change', () => {
  chrome.storage.local.set({ autoRadio: autoRadio.checked });
});

sleepModeToggle.addEventListener('change', () => {
  chrome.storage.local.set({ sleepModeEnabled: sleepModeToggle.checked });
});

enableSoop.addEventListener('change', async () => {
  await chrome.storage.local.set({ enableSoop: enableSoop.checked });
  await init();
});

shortcutsToggle.addEventListener('change', () => {
  chrome.storage.local.set({ shortcutsEnabled: shortcutsToggle.checked });
  updateShortcutSection();
});

shortcutHelpBtn.addEventListener('click', () => {
  shortcutHelpOpen = !shortcutHelpOpen;
  updateShortcutSection();
});

// 팝업이 열려 있는 동안 페이지 쪽 상태 변화(Alt+R, 🎧 버튼 등)를 실시간 반영
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.action !== 'state-changed' && msg?.action !== 'health-report') return;

  void (async () => {
    const { tabId } = await getActiveTabContext();
    if (!tabId || sender.tab?.id !== tabId) return;

    if (msg.action === 'state-changed') {
      updateStatus(msg.active, msg.site, sender.tab);
      radioToggle.checked = Boolean(msg.active);
    } else {
      updateHealthWarning(msg.failures);
    }
  })();
});

// 다른 컨텍스트(단축키, 오버레이)에서 바뀐 설정도 토글에 반영
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.autoRadio) autoRadio.checked = Boolean(changes.autoRadio.newValue);
  if (changes.sleepModeEnabled) sleepModeToggle.checked = Boolean(changes.sleepModeEnabled.newValue);
  if (changes.shortcutsEnabled) {
    shortcutsToggle.checked = changes.shortcutsEnabled.newValue !== false;
    updateShortcutSection();
  }
  if (changes.enableSoop) enableSoop.checked = changes.enableSoop.newValue !== false;
});

init();
