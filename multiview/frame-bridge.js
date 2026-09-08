'use strict';

// ═══════════════════════════════════════════════════════
//  멀티뷰 프레임 브리지
//  치지직/숲 플레이어는 부모가 쓸 수 있는 볼륨 API가 없어서,
//  멀티뷰 페이지가 chrome.scripting으로 이 스크립트를 플레이어 프레임에 주입하고
//  <video> 요소를 직접 제어한다. 최상위 문서(일반 시청 탭)에서는 아무것도 하지 않는다.
// ═══════════════════════════════════════════════════════

(() => {
  if (window.top === window.self) return;
  // 확장 페이지가 부모면 Referer 가 없다. 일반 웹사이트가 임베드한 프레임(Referer 있음)에는 관여하지 않는다
  if (document.referrer) return;
  if (window.__srmFrameBridge) return;
  window.__srmFrameBridge = true;

  const host = location.hostname;
  let platform = null;
  let id = null;

  if (host.endsWith('chzzk.naver.com')) {
    const m = location.pathname.match(/\/live\/([0-9a-f]{32})/i);
    if (m) { platform = 'chzzk'; id = m[1].toLowerCase(); }
  } else if (/(^|\.)sooplive\.(com|co\.kr)$/.test(host)) {
    const m = location.pathname.match(/^\/([a-z0-9_]{3,12})(?:\/|$)/i);
    if (m && m[1] !== 'player') { platform = 'soop'; id = m[1].toLowerCase(); }
  }
  if (!platform) return;

  const key = `${platform}:${id}`;
  const desired = { volume: null, muted: null };
  let video = null;

  function send(msg) {
    try {
      const p = chrome.runtime.sendMessage({ ...msg, key, platform, id });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* 확장 컨텍스트 무효화 등 */ }
  }

  function state() {
    return {
      type: 'mv-state',
      hasVideo: !!video,
      volume: video ? video.volume : null,
      muted: video ? video.muted : null,
      paused: video ? video.paused : null,
    };
  }

  function applyDesired() {
    if (!video) return;
    if (desired.volume !== null && Math.abs(video.volume - desired.volume) > 0.005) video.volume = desired.volume;
    if (desired.muted !== null && video.muted !== desired.muted) video.muted = desired.muted;
  }

  function onVideoEvent(e) {
    // 플레이어가 초기화 과정에서 볼륨을 되돌리는 경우가 있어 재생 시작 시점에 다시 적용
    if (e.type === 'loadedmetadata' || e.type === 'play') applyDesired();
    send(state());
  }

  function findVideo() {
    let best = null;
    let bestArea = -1;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { best = v; bestArea = area; }
    }
    return best;
  }

  // 치지직 라이브 페이지는 헤더/사이드바/채팅까지 통째로 프레임에 들어오므로
  // 플레이어 루트(가장 바깥 pzp 컨테이너)를 프레임 전체에 고정해 영상만 보이게 한다.
  function fitChzzkPlayer() {
    if (platform !== 'chzzk' || !video) return;
    let root = video.closest('#live_player_layout, .chzzk_player');
    if (!root) {
      for (let e = video.parentElement; e && e !== document.body; e = e.parentElement) {
        if (typeof e.className === 'string' && /(^|\s)pzp(\s|-|_|$)/.test(e.className)) root = e;
      }
    }
    if (!root || root.hasAttribute('data-srm-player')) return;
    root.setAttribute('data-srm-player', '');
    // 조상에 transform/filter/contain 이 있으면 fixed 가 그 조상 기준으로 갇히므로 전부 해제
    for (let e = root.parentElement; e && e !== document.documentElement; e = e.parentElement) e.setAttribute('data-srm-anc', '');
    if (!document.getElementById('srm-fit-style')) {
      const style = document.createElement('style');
      style.id = 'srm-fit-style';
      style.textContent = [
        '[data-srm-player]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;z-index:2147483000!important;background:#000!important;}',
        '[data-srm-anc]{transform:none!important;filter:none!important;backdrop-filter:none!important;perspective:none!important;contain:none!important;will-change:auto!important;}',
        'html,body{overflow:hidden!important;}',
      ].join('\n');
      (document.head || document.documentElement).appendChild(style);
    }
  }

  // 채팅 프레임 등 같은 경로를 쓰는 다른 프레임이 플레이어 자리를 가로채지 않도록
  // <video> 를 잡은 프레임만 자신을 알린다
  function announce() {
    if (video) send({ type: 'mv-frame-ready' });
  }

  function bind(v) {
    if (video === v) return;
    if (video) {
      for (const ev of VIDEO_EVENTS) video.removeEventListener(ev, onVideoEvent);
    }
    video = v;
    for (const ev of VIDEO_EVENTS) v.addEventListener(ev, onVideoEvent);
    applyDesired();
    fitChzzkPlayer();
    announce();
  }

  const VIDEO_EVENTS = ['volumechange', 'play', 'pause', 'playing', 'loadedmetadata'];

  // 광고/프리뷰용 video 를 먼저 잡았다가 본 플레이어가 뜨면 갈아타야 하므로 계속 재탐색하되,
  // 채팅처럼 끊임없이 바뀌는 DOM 에서 과하게 돌지 않도록 500ms 로 묶는다
  let rescanTimer = null;
  const observer = new MutationObserver(() => {
    if (rescanTimer) return;
    rescanTimer = setTimeout(() => {
      rescanTimer = null;
      const v = findVideo();
      if (v && v !== video) bind(v);
    }, 500);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const first = findVideo();
  if (first) bind(first);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'mv-ping') {
      announce();
      return;
    }
    if (msg.type !== 'mv-cmd') return;

    switch (msg.cmd) {
      case 'setVolume':
        desired.volume = Math.min(1, Math.max(0, Number(msg.value) || 0));
        applyDesired();
        break;
      case 'setMuted':
        desired.muted = !!msg.value;
        applyDesired();
        break;
      case 'play':
        if (video) video.play().catch(() => {});
        break;
      case 'pause':
        if (video) video.pause();
        break;
    }
    sendResponse(state());
  });
})();
