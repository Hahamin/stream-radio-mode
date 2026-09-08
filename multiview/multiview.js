'use strict';

// ═══════════════════════════════════════════════════════
//  Stream Radio Mode — 멀티뷰
//  mullive (github.com/jebibot/mullive) 참고 구현
// ═══════════════════════════════════════════════════════

const CHAT_WIDTH = 350;
let permissionsGranted = false;
const PLATFORM_LABEL = { chzzk: '치지직', soop: '숲', twitch: '트위치', youtube: '유튜브' };
const PLATFORM_COLOR = { chzzk: '#00ffa3', soop: '#5e7bff', twitch: '#9146ff', youtube: '#ff4444' };
const LAYOUT_MODES = ['auto', 'horizontal', 'vertical', 'focus'];

const streams = [];
let chatVisible = false;
let chatStreamIdx = 0;
let nextUid = 1;
let layoutMode = 'auto';
let focusedUid = null;

// ── DOM ──
const $ = (id) => document.getElementById(id);
const addStreamBtn = $('addStreamBtn');
const addStreamPanel = $('addStreamPanel');
const addPanelClose = $('addPanelClose');
const streamInput = $('streamInput');
const streamSubmit = $('streamSubmit');
const streamsEl = $('streams');
const mainEl = $('main');
const chatPanel = $('chatPanel');
const chatToggleBtn = $('chatToggleBtn');
const chatHideBtn = $('chatHideBtn');
const chatSelect = $('chatSelect');
const chatFrame = $('chatFrame');
const emptyState = $('emptyState');
const layoutBtn = $('layoutBtn');
const muteAllBtn = $('muteAllBtn');
const browseBtn = $('browseBtn');
const browsePanel = $('browsePanel');
const browseSearch = $('browseSearch');
const browseList = $('browseList');
const browseLoading = $('browseLoading');
const browseEmpty = $('browseEmpty');

// ═══════════════════════════════════════════════════════
//  파싱 — URL / ID → { platform, id }
// ═══════════════════════════════════════════════════════

function parseOne(input) {
  input = input.trim();
  if (!input) return null;

  let m;

  // 치지직 URL
  m = input.match(/chzzk\.naver\.com\/(?:live\/)?([0-9a-f]{32})/i);
  if (m) return { platform: 'chzzk', id: m[1].toLowerCase() };

  // 32자 hex → 치지직
  if (/^[0-9a-f]{32}$/i.test(input))
    return { platform: 'chzzk', id: input.toLowerCase() };

  // 숲 URL (play.sooplive / sooplive)
  m = input.match(/sooplive\.(?:co\.kr|com)\/([a-zA-Z0-9_]+)/i);
  if (m) {
    const id = m[1].toLowerCase();
    if (id !== 'player') return { platform: 'soop', id };
  }

  // 트위치 URL
  m = input.match(/twitch\.tv\/([a-zA-Z0-9_]{4,25})/i);
  if (m) return { platform: 'twitch', id: m[1].toLowerCase() };

  // t: 접두사 → 트위치
  m = input.match(/^t:([a-zA-Z0-9_]{4,25})$/i);
  if (m) return { platform: 'twitch', id: m[1].toLowerCase() };

  // 유튜브 URL (watch, live, youtu.be)
  m = input.match(/youtube\.com\/(?:watch\?v=|live\/)([a-zA-Z0-9_-]{11})/);
  if (m) return { platform: 'youtube', id: m[1] };
  m = input.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (m) return { platform: 'youtube', id: m[1] };

  // y: 접두사 → 유튜브
  m = input.match(/^y:(.+)$/i);
  if (m) return { platform: 'youtube', id: m[1] };

  // s: 접두사 → 숲 (명시적)
  m = input.match(/^s:([a-zA-Z0-9_]{3,12})$/i);
  if (m) return { platform: 'soop', id: m[1].toLowerCase() };

  // 짧은 영문숫자 → 숲 BJ ID (폴백)
  if (/^[a-zA-Z0-9_]{3,12}$/i.test(input))
    return { platform: 'soop', id: input.toLowerCase() };

  return null;
}

function parseInput(raw) {
  raw = raw.trim();

  // mul.live URL → 멀티 스트림
  const mulMatch = raw.match(/mul\.live\/(.+)/);
  if (mulMatch) {
    return mulMatch[1].split('/').filter(Boolean).map(parseOne).filter(Boolean);
  }

  // 여러 줄 또는 쉼표 구분 지원
  const parts = raw.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    return parts.map(parseOne).filter(Boolean);
  }

  const single = parseOne(raw);
  return single ? [single] : [];
}

// ═══════════════════════════════════════════════════════
//  플랫폼별 URL
// ═══════════════════════════════════════════════════════

function playerUrl(s) {
  switch (s.platform) {
    case 'chzzk':   return `https://chzzk.naver.com/live/${s.id}`;
    case 'soop':    return `https://play.sooplive.com/${s.id}/direct?fromApi=1`;
    case 'twitch':  return `https://player.twitch.tv/?channel=${s.id}&parent=${location.hostname}`;
    case 'youtube': return `https://www.youtube.com/embed/${s.id}?autoplay=1&rel=0`;
  }
  return '';
}

function chatUrl(s) {
  switch (s.platform) {
    case 'chzzk':   return `https://chzzk.naver.com/live/${s.id}/chat`;
    case 'soop':    return `https://play.sooplive.com/${s.id}?vtype=chat`;
    case 'twitch':  return `https://www.twitch.tv/embed/${s.id}/chat?darkpopout&parent=${location.hostname}`;
    case 'youtube': return `https://www.youtube.com/live_chat?v=${s.id}&embed_domain=${location.hostname}&dark_theme=1`;
  }
  return '';
}

// ═══════════════════════════════════════════════════════
//  유틸
// ═══════════════════════════════════════════════════════

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ═══════════════════════════════════════════════════════
//  스트림 추가 / 제거
// ═══════════════════════════════════════════════════════

function addStream(desc) {
  if (!desc) return false;

  // 중복 검사
  if (streams.some(s => s.platform === desc.platform && s.id === desc.id)) {
    streamInput.classList.add('shake');
    setTimeout(() => streamInput.classList.remove('shake'), 400);
    return false;
  }

  const uid = nextUid++;
  const s = { uid, platform: desc.platform, id: desc.id, name: desc.id };
  streams.push(s);

  const wrap = document.createElement('div');
  wrap.className = 'stream-wrapper';
  wrap.id = `w-${uid}`;
  wrap.dataset.uid = uid;

  const label = document.createElement('div');
  label.className = 'stream-label';
  label.innerHTML =
    `<span class="pdot" style="background:${PLATFORM_COLOR[s.platform]}"></span>` +
    `<span class="sname" id="n-${uid}">${esc(s.name)}</span>`;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'stream-close';
  closeBtn.title = '스트림 제거';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeStream(uid); });

  const focusBtn = document.createElement('button');
  focusBtn.className = 'stream-focus';
  focusBtn.title = '확대 / 축소';
  focusBtn.textContent = '⛶';
  focusBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFocus(uid); });

  const iframe = document.createElement('iframe');
  iframe.className = 'stream-frame';
  iframe.id = `f-${uid}`;
  iframe.src = playerUrl(s);
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');

  wrap.appendChild(label);
  wrap.appendChild(closeBtn);
  wrap.appendChild(focusBtn);
  wrap.appendChild(iframe);
  streamsEl.appendChild(wrap);

  relayout();
  syncChatSelect();
  syncEmpty();
  syncHash();
  resolveName(s);
  return true;
}

function removeStream(uid) {
  const idx = streams.findIndex(s => s.uid === uid);
  if (idx < 0) return;
  streams.splice(idx, 1);
  const el = document.getElementById(`w-${uid}`);
  if (el) el.remove();

  if (focusedUid === uid) focusedUid = null;
  if (chatStreamIdx >= streams.length) chatStreamIdx = Math.max(0, streams.length - 1);

  relayout();
  syncChatSelect();
  syncChat();
  syncEmpty();
  syncHash();
}

function toggleFocus(uid) {
  if (focusedUid === uid) {
    focusedUid = null;
  } else {
    focusedUid = uid;
  }

  streamsEl.querySelectorAll('.stream-wrapper').forEach(el => {
    const isTarget = Number(el.dataset.uid) === focusedUid;
    el.classList.toggle('focused', isTarget);
    if (!isTarget && focusedUid !== null) {
      el.style.display = 'none';
    } else {
      el.style.display = '';
    }
  });

  if (focusedUid === null) relayout();
}

// ═══════════════════════════════════════════════════════
//  이름 해석
// ═══════════════════════════════════════════════════════

async function resolveName(s) {
  try {
    if (s.platform === 'chzzk') {
      const r = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${s.id}`);
      if (r.ok) {
        const d = await r.json();
        const name = d?.content?.channelName;
        if (name) s.name = name;
      }
    }
    // 숲: PupdateBroadInfo postMessage 로 해결
    // 트위치/유튜브: ID 사용
  } catch {
    // CORS 등 에러 시 ID 유지
  }
  const el = document.getElementById(`n-${s.uid}`);
  if (el) el.textContent = s.name;
  syncChatSelect();
}

// ═══════════════════════════════════════════════════════
//  레이아웃 (mullive 알고리즘 기반)
// ═══════════════════════════════════════════════════════

const BROWSE_WIDTH = 320;

function relayout() {
  const n = streams.length;
  if (!n) return;
  if (focusedUid !== null) return;

  const chatW = chatVisible ? CHAT_WIDTH : 0;
  const browseW = browseVisible ? BROWSE_WIDTH : 0;
  const w = mainEl.clientWidth - chatW - browseW - 8;
  const h = mainEl.clientHeight - 8;
  if (w <= 0 || h <= 0) return;

  let bestW = 0, bestH = 0;

  if (layoutMode === 'horizontal') {
    bestW = Math.floor(w / n);
    bestH = Math.floor((bestW * 9) / 16);
    if (bestH > h) { bestH = h; bestW = Math.floor((bestH * 16) / 9); }
  } else if (layoutMode === 'vertical') {
    bestH = Math.floor(h / n);
    bestW = Math.floor((bestH * 16) / 9);
    if (bestW > w) { bestW = w; bestH = Math.floor((bestW * 9) / 16); }
  } else {
    for (let c = 1; c <= n; c++) {
      const rows = Math.ceil(n / c);
      let mw = Math.floor(w / c);
      let mh = Math.floor(h / rows);
      if ((mw * 9) / 16 < mh) {
        mh = Math.floor((mw * 9) / 16);
      } else {
        mw = Math.floor((mh * 16) / 9);
      }
      if (mw > bestW) { bestW = mw; bestH = mh; }
    }
  }

  streamsEl.querySelectorAll('.stream-wrapper').forEach(el => {
    el.style.width = `${bestW}px`;
    el.style.height = `${bestH}px`;
  });
}

// ═══════════════════════════════════════════════════════
//  채팅 패널
// ═══════════════════════════════════════════════════════

function setChat(visible) {
  chatVisible = visible;
  chatPanel.hidden = !chatVisible;
  chatToggleBtn.classList.toggle('active', chatVisible);
  if (chatVisible && streams.length) {
    if (chatStreamIdx < 0 || chatStreamIdx >= streams.length) chatStreamIdx = 0;
    loadChat();
  } else if (!chatVisible) {
    chatFrame.src = 'about:blank';
  }
  relayout();
}

function loadChat() {
  if (!chatVisible || !streams.length) {
    chatFrame.src = 'about:blank';
    return;
  }
  const s = streams[chatStreamIdx] || streams[0];
  const url = chatUrl(s);
  if (chatFrame.src !== url) chatFrame.src = url;
}

function syncChat() {
  if (chatVisible) loadChat();
}

function syncChatSelect() {
  const prevVal = chatSelect.value;
  chatSelect.innerHTML = '';

  if (!streams.length) {
    const opt = document.createElement('option');
    opt.textContent = '스트림 없음';
    opt.disabled = true;
    chatSelect.appendChild(opt);
    return;
  }

  streams.forEach((s, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${PLATFORM_LABEL[s.platform] || s.platform} — ${s.name}`;
    chatSelect.appendChild(opt);
  });

  if (chatStreamIdx >= 0 && chatStreamIdx < streams.length) {
    chatSelect.value = chatStreamIdx;
  }
}

// ═══════════════════════════════════════════════════════
//  SOOP postMessage 프로토콜 (PonReady / Pload)
// ═══════════════════════════════════════════════════════

window.addEventListener('message', (e) => {
  if (typeof e.data !== 'string') return;

  const s = streams.find(st => {
    const fr = document.getElementById(`f-${st.uid}`);
    return fr && fr.contentWindow === e.source;
  });
  if (!s || s.platform !== 'soop') return;

  // 플레이어 준비 완료 → 설정 전송
  if (e.data === 'PonReady') {
    e.source.postMessage(JSON.stringify({
      id: s.id,
      mutePlay: streams.indexOf(s) > 0, // 첫 번째만 소리
      showChat: false,
      autoPlay: true,
      isAdShow: true,
      showQualityBox: true,
      fromApi: '1',
    }), '*');
    return;
  }

  // 방송 정보 업데이트
  if (e.data.startsWith('PupdateBroadInfo')) {
    try {
      const info = JSON.parse(e.data.slice('PupdateBroadInfo'.length));
      if (info.BJNICK) {
        s.name = info.BJNICK;
        const el = document.getElementById(`n-${s.uid}`);
        if (el) el.textContent = s.name;
        syncChatSelect();
      }
    } catch { /* 파싱 실패 무시 */ }
    return;
  }
});

// ═══════════════════════════════════════════════════════
//  URL 해시 상태 (새로고침 시 복원, 공유 가능)
// ═══════════════════════════════════════════════════════

function syncHash() {
  const parts = streams.map(s => {
    switch (s.platform) {
      case 'twitch':  return `t:${s.id}`;
      case 'youtube': return `y:${s.id}`;
      default:        return s.id; // chzzk (32hex) 또는 soop (짧은 ID)
    }
  });
  history.replaceState(null, '', parts.length ? '#' + parts.join('/') : location.pathname);
}

function loadHash() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return;
  const segments = h.split('/').filter(Boolean);
  segments.forEach(seg => {
    const d = parseOne(seg);
    if (d) addStream(d);
  });
}

// ═══════════════════════════════════════════════════════
//  상태 동기화
// ═══════════════════════════════════════════════════════

function syncEmpty() {
  emptyState.hidden = streams.length > 0;
  streamsEl.style.display = streams.length > 0 ? '' : 'none';
}

// ═══════════════════════════════════════════════════════
//  레이아웃 메뉴
// ═══════════════════════════════════════════════════════

let layoutMenuEl = null;

function toggleLayoutMenu() {
  if (layoutMenuEl) {
    layoutMenuEl.remove();
    layoutMenuEl = null;
    return;
  }

  layoutMenuEl = document.createElement('div');
  layoutMenuEl.id = 'layoutMenu';

  const options = [
    { mode: 'auto',       label: '⊞ 자동 (최적 그리드)',  },
    { mode: 'horizontal', label: '⬌ 가로 한 줄' },
    { mode: 'vertical',   label: '⬍ 세로 한 줄' },
  ];

  options.forEach(({ mode, label }) => {
    const btn = document.createElement('button');
    btn.className = 'layout-opt' + (layoutMode === mode ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      layoutMode = mode;
      focusedUid = null;
      streamsEl.querySelectorAll('.stream-wrapper').forEach(el => {
        el.classList.remove('focused');
        el.style.display = '';
      });
      relayout();
      layoutMenuEl.remove();
      layoutMenuEl = null;
    });
    layoutMenuEl.appendChild(btn);
  });

  document.body.appendChild(layoutMenuEl);

  // 외부 클릭으로 닫기
  setTimeout(() => {
    const closeHandler = (e) => {
      if (layoutMenuEl && !layoutMenuEl.contains(e.target) && e.target !== layoutBtn) {
        layoutMenuEl.remove();
        layoutMenuEl = null;
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 0);
}

// ═══════════════════════════════════════════════════════
//  전체 음소거
// ═══════════════════════════════════════════════════════

let allMuted = false;

function toggleMuteAll() {
  allMuted = !allMuted;
  muteAllBtn.classList.toggle('active', allMuted);
  muteAllBtn.textContent = allMuted ? '🔊 음소거 해제' : '🔇 전체 음소거';

  // iframe 내부 mute는 직접 제어 불가 (cross-origin)
  // 대신 각 iframe에 postMessage로 시도
  streams.forEach(s => {
    const fr = document.getElementById(`f-${s.uid}`);
    if (!fr) return;
    // SOOP: Pmute 메시지 (시도)
    if (s.platform === 'soop') {
      try {
        fr.contentWindow.postMessage(allMuted ? 'Pmute' : 'Punmute', '*');
      } catch { /* cross-origin */ }
    }
  });
}

// ═══════════════════════════════════════════════════════
//  이벤트 바인딩
// ═══════════════════════════════════════════════════════

addStreamBtn.addEventListener('click', () => {
  const show = addStreamPanel.hidden;
  addStreamPanel.hidden = !show;
  if (show) streamInput.focus();
});

addPanelClose.addEventListener('click', () => {
  addStreamPanel.hidden = true;
});

async function handleSubmit() {
  const descs = parseInput(streamInput.value);
  if (!descs.length) {
    streamInput.classList.add('shake');
    setTimeout(() => streamInput.classList.remove('shake'), 400);
    return;
  }

  // 첫 추가 시 iframe 임베딩 권한 요청 (사용자 제스처 컨텍스트)
  if (!permissionsGranted) {
    await requestFramePermissions();
  }

  descs.forEach(d => addStream(d));
  streamInput.value = '';
  streamInput.focus();
}

streamSubmit.addEventListener('click', handleSubmit);
streamInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
});

chatToggleBtn.addEventListener('click', () => setChat(!chatVisible));
chatHideBtn.addEventListener('click', () => setChat(false));
chatSelect.addEventListener('change', () => {
  chatStreamIdx = parseInt(chatSelect.value, 10) || 0;
  loadChat();
});

layoutBtn.addEventListener('click', toggleLayoutMenu);
muteAllBtn.addEventListener('click', toggleMuteAll);

window.addEventListener('resize', () => {
  relayout();
});

// 키보드 단축키
document.addEventListener('keydown', (e) => {
  // Ctrl+Enter: 추가 패널 열기/제출
  if (e.ctrlKey && e.key === 'Enter') {
    if (addStreamPanel.hidden) {
      addStreamPanel.hidden = false;
      streamInput.focus();
    } else if (streamInput.value.trim()) {
      handleSubmit();
    }
    e.preventDefault();
    return;
  }

  // Escape: 포커스 해제 / 패널 닫기
  if (e.key === 'Escape') {
    if (layoutMenuEl) {
      layoutMenuEl.remove();
      layoutMenuEl = null;
    } else if (!addStreamPanel.hidden) {
      addStreamPanel.hidden = true;
    } else if (focusedUid !== null) {
      toggleFocus(focusedUid);
    }
    e.preventDefault();
    return;
  }
});

// ═══════════════════════════════════════════════════════
//  찾아보기 패널 — 라이브 목록 + 검색
// ═══════════════════════════════════════════════════════

let browsePlatform = 'chzzk';
let browseVisible = false;
let browseSearchTimer = null;

function toggleBrowse() {
  browseVisible = !browseVisible;
  browsePanel.hidden = !browseVisible;
  browseBtn.classList.toggle('active', browseVisible);
  if (browseVisible) {
    browseSearch.focus();
    loadBrowse();
  }
  relayout();
}

function formatViewers(n) {
  n = parseInt(n, 10) || 0;
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + '천';
  return String(n);
}

async function loadBrowse() {
  const query = browseSearch.value.trim();
  browseList.innerHTML = '';
  browseEmpty.hidden = true;
  browseLoading.hidden = false;

  try {
    let items = [];
    if (browsePlatform === 'chzzk') {
      items = query ? await searchChzzkLives(query) : await fetchChzzkLives();
    } else {
      items = query ? await searchSoopLives(query) : await fetchSoopLives();
    }

    browseLoading.hidden = true;

    if (!items.length) {
      browseEmpty.hidden = false;
      browseEmpty.textContent = query ? '검색 결과가 없습니다' : '라이브 방송이 없습니다';
      return;
    }

    items.forEach(item => {
      browseList.appendChild(createBrowseCard(item));
    });
  } catch (err) {
    browseLoading.hidden = true;
    browseEmpty.hidden = false;
    browseEmpty.textContent = '로드 실패 — 권한을 허용해주세요';
  }
}

// ── 치지직 API ──

async function fetchChzzkLives() {
  const r = await fetch('https://api.chzzk.naver.com/service/v1/lives?size=30&sortType=POPULAR');
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  return (d?.content?.data || []).map(item => ({
    platform: 'chzzk',
    id: item.channel?.channelId,
    name: item.channel?.channelName || '',
    title: item.liveTitle || '',
    viewers: item.concurrentUserCount || 0,
    thumb: (item.liveImageUrl || '').replace('{type}', '480'),
    avatar: item.channel?.channelImageUrl || '',
    verified: item.channel?.verifiedMark || false,
    category: item.liveCategoryValue || '',
  }));
}

async function searchChzzkLives(keyword) {
  const r = await fetch(`https://api.chzzk.naver.com/service/v1/search/lives?keyword=${encodeURIComponent(keyword)}&size=30`);
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  return (d?.content?.data || []).map(item => ({
    platform: 'chzzk',
    id: item.channel?.channelId,
    name: item.channel?.channelName || '',
    title: item.live?.liveTitle || '',
    viewers: item.live?.concurrentUserCount || 0,
    thumb: (item.live?.liveImageUrl || '').replace('{type}', '480'),
    avatar: item.channel?.channelImageUrl || '',
    verified: item.channel?.verifiedMark || false,
    category: item.live?.liveCategoryValue || '',
  }));
}

// ── 숲 API ──

async function fetchSoopLives() {
  const r = await fetch('https://live.sooplive.co.kr/api/main_broad_list_api.php?selectType=action&szOrder=view_cnt&nPageNo=1&nLimit=30');
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  return (d?.broad || []).map(parseSoopBroad);
}

async function searchSoopLives(keyword) {
  const url = `https://sch.sooplive.co.kr/api.php?m=liveSearch&v=1.0&szSearchType=total&szKeyword=${encodeURIComponent(keyword)}&nPageNo=1&nLimit=30`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  return (d?.REAL_BROAD || []).map(parseSoopBroad);
}

function parseSoopBroad(b) {
  let thumb = b.broad_thumb || '';
  if (thumb.startsWith('//')) thumb = 'https:' + thumb;
  return {
    platform: 'soop',
    id: b.user_id,
    name: b.user_nick || b.user_id,
    title: b.broad_title || '',
    viewers: parseInt(b.total_view_cnt, 10) || 0,
    thumb,
    avatar: '',
    verified: false,
    category: b.category_name || '',
  };
}

// ── 카드 렌더링 ──

function createBrowseCard(item) {
  const card = document.createElement('div');
  card.className = 'browse-card';

  const alreadyAdded = streams.some(s => s.platform === item.platform && s.id === item.id);

  const thumbEl = document.createElement('img');
  thumbEl.className = 'browse-thumb';
  thumbEl.src = item.thumb || '';
  thumbEl.alt = '';
  thumbEl.loading = 'lazy';
  thumbEl.onerror = () => { thumbEl.style.background = '#1a1a2e'; thumbEl.removeAttribute('src'); };

  const info = document.createElement('div');
  info.className = 'browse-info';

  const nameRow = document.createElement('div');
  nameRow.className = 'browse-name';
  nameRow.textContent = item.name;
  if (item.verified) {
    const badge = document.createElement('span');
    badge.className = 'verified';
    badge.textContent = '✓';
    nameRow.appendChild(badge);
  }

  const titleEl = document.createElement('div');
  titleEl.className = 'browse-title';
  titleEl.textContent = item.title;
  titleEl.title = item.title;

  const viewersEl = document.createElement('div');
  viewersEl.className = 'browse-viewers';
  viewersEl.textContent = formatViewers(item.viewers) + '명 시청';
  if (item.category) viewersEl.textContent += ' · ' + item.category;

  info.appendChild(nameRow);
  info.appendChild(titleEl);
  info.appendChild(viewersEl);

  const addBtn = document.createElement('button');
  addBtn.className = 'browse-add-btn' + (alreadyAdded ? ' added' : '');
  addBtn.textContent = alreadyAdded ? '✓' : '+';
  addBtn.title = alreadyAdded ? '이미 추가됨' : '멀티뷰에 추가';

  if (!alreadyAdded) {
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ok = addStream({ platform: item.platform, id: item.id });
      if (ok) {
        addBtn.classList.add('added');
        addBtn.textContent = '✓';
        addBtn.title = '이미 추가됨';
      }
    });
  }

  // 카드 전체 클릭도 추가 동작
  card.addEventListener('click', () => {
    if (addBtn.classList.contains('added')) return;
    const ok = addStream({ platform: item.platform, id: item.id });
    if (ok) {
      addBtn.classList.add('added');
      addBtn.textContent = '✓';
    }
  });

  card.appendChild(thumbEl);
  card.appendChild(info);
  card.appendChild(addBtn);
  return card;
}

// ── 이벤트 바인딩 ──

browseBtn.addEventListener('click', async () => {
  if (!permissionsGranted) await requestFramePermissions();
  toggleBrowse();
});

browsePanel.querySelectorAll('.browse-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    browsePlatform = tab.dataset.platform;
    browsePanel.querySelectorAll('.browse-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    loadBrowse();
  });
});

browseSearch.addEventListener('input', () => {
  clearTimeout(browseSearchTimer);
  browseSearchTimer = setTimeout(loadBrowse, 400);
});

browseSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(browseSearchTimer);
    loadBrowse();
  }
});

// ═══════════════════════════════════════════════════════
//  iframe 임베딩 권한 (declarativeNetRequest)
//  치지직/숲이 X-Frame-Options 등으로 iframe 차단 시 해제
// ═══════════════════════════════════════════════════════

const FRAME_PERMISSIONS = {
  permissions: ['declarativeNetRequest'],
  origins: [
    '*://api.chzzk.naver.com/*',
    '*://chzzk.naver.com/*',
    '*://play.sooplive.com/*',
    '*://play.sooplive.co.kr/*',
    '*://live.sooplive.co.kr/*',
    '*://sch.sooplive.co.kr/*',
  ],
};
const FRAME_RULE_ID = 100;

async function registerFrameRules() {
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    if (existing.some(r => r.id === FRAME_RULE_ID)) return;

    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [{
        id: FRAME_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'X-Frame-Options', operation: 'remove' },
            { header: 'Content-Security-Policy', operation: 'remove' },
          ],
        },
        condition: {
          resourceTypes: ['sub_frame'],
          requestDomains: [
            'chzzk.naver.com',
            'play.sooplive.com',
            'play.sooplive.co.kr',
          ],
        },
      }],
    });
  } catch { /* 권한 없으면 무시 */ }
}

async function checkExistingPermissions() {
  try {
    const has = await chrome.permissions.contains(FRAME_PERMISSIONS);
    if (has) {
      permissionsGranted = true;
      await registerFrameRules();
    }
  } catch { /* file:// 등 비-확장 환경 무시 */ }
}

async function requestFramePermissions() {
  if (permissionsGranted) return true;
  try {
    const granted = await chrome.permissions.request(FRAME_PERMISSIONS);
    if (granted) {
      permissionsGranted = true;
      await registerFrameRules();
    }
    return granted;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//  초기화
// ═══════════════════════════════════════════════════════

checkExistingPermissions();
loadHash();
syncEmpty();
syncChatSelect();

// 해시 없이 열렸을 때 자동으로 추가 패널 표시
if (!streams.length) {
  addStreamPanel.hidden = false;
  setTimeout(() => streamInput.focus(), 100);
}
