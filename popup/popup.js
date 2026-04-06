/**
 * Stream Radio Mode — 팝업 UI 로직
 */

const $ = (sel) => document.querySelector(sel);

const radioToggle = $('#radioToggle');
const autoRadio = $('#autoRadio');
const bossToggle = $('#bossToggle');
const minimizeToggle = $('#minimizeToggle');
const shortcutsToggle = $('#shortcutsToggle');
const shortcutKeys = $('#shortcutKeys');
const enableSoop = $('#enableSoop');
const statusDot = $('#statusDot');
const statusText = $('#statusText');

function isSoopTab(tab) {
  return Boolean(tab?.url && /:\/\/([^/]+\.)?sooplive\.(co\.kr|com)\//.test(tab.url));
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
    'autoRadio', 'enableSoop', 'shortcutsEnabled'
  ]);

  autoRadio.checked = settings.autoRadio || false;
  enableSoop.checked = settings.enableSoop !== false;
  shortcutsToggle.checked = settings.shortcutsEnabled !== false;
  shortcutKeys.classList.toggle('disabled', !shortcutsToggle.checked);

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
        updateStatus(radioState.active, radioState.site);
        radioToggle.checked = radioState.active;
      } else {
        updateStatus(null, null);
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

function updateStatusDisabled() {
  statusDot.className = 'status-dot';
  statusDot.classList.add('detecting');
  statusText.textContent = '숲 지원이 꺼져 있습니다';
  radioToggle.checked = false;
  bossToggle.checked = false;
  radioToggle.disabled = true;
  bossToggle.disabled = true;
}

function updateStatus(active, site) {
  statusDot.className = 'status-dot';

  if (active === null || active === undefined) {
    statusDot.classList.add('detecting');
    statusText.textContent = '지원 사이트가 아닙니다';
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

enableSoop.addEventListener('change', async () => {
  await chrome.storage.local.set({ enableSoop: enableSoop.checked });
  await init();
});

shortcutsToggle.addEventListener('change', () => {
  chrome.storage.local.set({ shortcutsEnabled: shortcutsToggle.checked });
  shortcutKeys.classList.toggle('disabled', !shortcutsToggle.checked);
});

init();
