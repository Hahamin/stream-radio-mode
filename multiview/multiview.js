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
const mixerBtn = $('mixerBtn');
const radioBtn = $('radioBtn');
const mixerPanel = $('mixerPanel');
const mixerRows = $('mixerRows');
const mixHover = $('mixHover');
const mixSoloOff = $('mixSoloOff');
const mixClose = $('mixClose');
const permBanner = $('permBanner');
const permGrantBtn = $('permGrantBtn');
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

  // 숲 URL (play.sooplive / sooplive) — 맨몸 ID 분기와 길이 규칙을 맞춰야 해시 복원 시 사라지지 않는다
  m = input.match(/sooplive\.(?:co\.kr|com)\/([a-zA-Z0-9_]{3,12})(?:[/?#]|$)/i);
  if (m) {
    const id = m[1].toLowerCase();
    if (id !== 'player') return { platform: 'soop', id };
  }

  // 트위치 URL
  m = input.match(/twitch\.tv\/([a-zA-Z0-9_]{3,25})/i);
  if (m) return { platform: 'twitch', id: m[1].toLowerCase() };

  // t: 접두사 → 트위치
  m = input.match(/^t:([a-zA-Z0-9_]{3,25})$/i);
  if (m) return { platform: 'twitch', id: m[1].toLowerCase() };

  // 유튜브 URL (watch, live, youtu.be)
  m = input.match(/youtube\.com\/(?:watch\?v=|live\/)([a-zA-Z0-9_-]{11})/);
  if (m) return { platform: 'youtube', id: m[1] };
  m = input.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (m) return { platform: 'youtube', id: m[1] };

  // 유튜브 채널 URL (@handle / channel/UC… / c/name) → 현재 라이브 영상 ID는 추가 시 해석
  m = input.match(/youtube\.com\/(@[a-zA-Z0-9_.-]{3,30}|channel\/UC[a-zA-Z0-9_-]{22}|c\/[a-zA-Z0-9_-]+)(?:\/live)?\/?(?:[?#].*)?$/i);
  if (m) return { platform: 'youtube', channel: m[1] };
  m = input.match(/^y:(@[a-zA-Z0-9_.-]{3,30})$/i);
  if (m) return { platform: 'youtube', channel: m[1] };

  // y: 접두사 → 유튜브 영상 ID
  m = input.match(/^y:([a-zA-Z0-9_-]{11})$/i);
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
    case 'youtube': return `https://www.youtube.com/embed/${s.id}?autoplay=1&rel=0&enablejsapi=1`;
  }
  return '';
}

function chatUrl(s) {
  switch (s.platform) {
    case 'chzzk':   return `https://chzzk.naver.com/live/${s.id}/chat`;
    case 'soop':    return `https://play.sooplive.com/${s.id}?vtype=chat`;
    case 'twitch':  return `https://www.twitch.tv/embed/${s.id}/chat?darkpopout&parent=${location.hostname}`;
    case 'youtube': return `https://www.youtube.com/live_chat?v=${s.id}&embed_domain=github.com&dark_theme=1`;
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
  if (!desc || !desc.id) return false;

  // 중복 검사
  if (streams.some(s => s.platform === desc.platform && s.id === desc.id)) {
    streamInput.classList.add('shake');
    setTimeout(() => streamInput.classList.remove('shake'), 400);
    return false;
  }

  // 포커스 중엔 새 타일이 레이아웃되지 않으므로 포커스를 먼저 푼다
  if (focusedUid !== null) toggleFocus(focusedUid);

  const uid = nextUid++;
  const s = { uid, platform: desc.platform, id: desc.id, name: desc.id };
  streams.push(s);

  const wrap = document.createElement('div');
  wrap.className = 'stream-wrapper';
  wrap.id = `w-${uid}`;
  wrap.dataset.uid = uid;
  wrap.dataset.platform = s.platform;

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
  Mixer.attach(s, iframe, wrap);

  relayout();
  syncChatSelect();
  syncEmpty();
  syncHash();
  syncPermBanner();
  resolveName(s);
  return true;
}

function removeStream(uid) {
  const idx = streams.findIndex(s => s.uid === uid);
  if (idx < 0) return;
  streams.splice(idx, 1);
  Mixer.detach(uid);
  const el = document.getElementById(`w-${uid}`);
  if (el) el.remove();

  if (focusedUid === uid) {
    focusedUid = null;
    streamsEl.querySelectorAll('.stream-wrapper').forEach(w => { w.classList.remove('focused'); w.style.display = ''; });
    Mixer.resumeTwitch();
  }
  if (chatStreamIdx >= streams.length) chatStreamIdx = Math.max(0, streams.length - 1);

  relayout();
  syncChatSelect();
  syncChat();
  syncEmpty();
  syncHash();
  syncPermBanner();
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

  if (focusedUid === null) {
    relayout();
    Mixer.resumeTwitch();
  }
}

// ═══════════════════════════════════════════════════════
//  이름 해석
// ═══════════════════════════════════════════════════════

function setStreamName(s, name) {
  if (!name || s.name === name) return;
  s.name = name;
  const el = document.getElementById(`n-${s.uid}`);
  if (el) el.textContent = name;
  Mixer.updateName(s.uid);
  syncChatSelect();
}

async function resolveName(s) {
  try {
    if (s.platform === 'chzzk') {
      const r = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${s.id}`);
      if (r.ok) {
        const d = await r.json();
        setStreamName(s, d?.content?.channelName);
      }
    }
    // 숲: PupdateBroadInfo postMessage 로 해결
    // 트위치/유튜브: ID 사용
  } catch {
    // CORS 등 에러 시 ID 유지
  }
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
  Mixer.resumeTwitch();
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

// 숲 플레이어는 { cmd, ... } 객체를 주고받는다. 플레이어 쪽 핸들러가 this[cmd]() 로 분기하므로
// 부모가 호출할 수 있는 명령은 Pload / Pplay / Ppause / PtoggleChat / PsetDarkMode 뿐이다.
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object' || typeof d.cmd !== 'string') return;

  const s = streams.find(st => {
    const fr = document.getElementById(`f-${st.uid}`);
    return fr && fr.contentWindow === e.source;
  });
  if (!s || s.platform !== 'soop') return;

  switch (d.cmd) {
    case 'PonReady':
      e.source.postMessage({
        cmd: 'Pload',
        id: s.id,
        mutePlay: Mixer.initialMuted(s.uid),
        showChat: false,
        autoPlay: true,
        isAdShow: true,
        showQualityBox: true,
        fromApi: '1',
      }, e.origin);
      break;
    case 'PupdateBroadInfo':
      setStreamName(s, d.data?.nick);
      break;
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
    if (!d) return;
    if (d.channel) {
      resolveYoutubeLive(d.channel).then(id => { if (id) addStream({ platform: 'youtube', id }); });
    } else {
      addStream(d);
    }
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
let layoutMenuCloser = null;

function closeLayoutMenu() {
  if (!layoutMenuEl) return;
  layoutMenuEl.remove();
  layoutMenuEl = null;
  if (layoutMenuCloser) {
    document.removeEventListener('click', layoutMenuCloser);
    layoutMenuCloser = null;
  }
  // 메뉴가 우상단 트위치 타일을 덮고 있었을 수 있다
  Mixer.resumeTwitch();
}

function toggleLayoutMenu() {
  if (layoutMenuEl) {
    closeLayoutMenu();
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
      closeLayoutMenu();
    });
    layoutMenuEl.appendChild(btn);
  });

  document.body.appendChild(layoutMenuEl);

  // 외부 클릭으로 닫기
  setTimeout(() => {
    if (!layoutMenuEl) return;
    layoutMenuCloser = (e) => {
      if (layoutMenuEl && !layoutMenuEl.contains(e.target) && e.target !== layoutBtn) closeLayoutMenu();
    };
    document.addEventListener('click', layoutMenuCloser);
  }, 0);
}

// ═══════════════════════════════════════════════════════
//  오디오 믹서 연동 (툴바 / 패널)
// ═══════════════════════════════════════════════════════

let mixerVisible = false;

function setMixerPanel(visible) {
  mixerVisible = visible;
  mixerPanel.hidden = !visible;
  mixerBtn.classList.toggle('active', visible);
  relayout();
  Mixer.resumeTwitch();
}

function syncMixerToolbar() {
  const st = Mixer.state();
  muteAllBtn.classList.toggle('active', st.allMuted);
  muteAllBtn.textContent = st.allMuted ? '🔊 음소거 해제' : '🔇 전체 음소거';
  radioBtn.classList.toggle('active', st.radioMode);
  mixHover.checked = st.hoverFollow;
  mixSoloOff.disabled = st.soloUid === null;
}

function isTypingTarget(t) {
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
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

function shakeInput() {
  streamInput.classList.add('shake');
  setTimeout(() => streamInput.classList.remove('shake'), 400);
}

// 채널 페이지의 /live 는 현재 라이브 영상으로 리다이렉트되고 canonical 링크에 영상 ID가 담긴다
async function resolveYoutubeLive(channel) {
  try {
    const r = await fetch(`https://www.youtube.com/${channel}/live`);
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

let submitting = false;

async function handleSubmit() {
  if (submitting) return;
  const descs = parseInput(streamInput.value);
  if (!descs.length) { shakeInput(); return; }

  submitting = true;
  streamSubmit.disabled = true;
  try {
    // 첫 추가 시 iframe 임베딩 권한 요청 (사용자 제스처 컨텍스트)
    if (!permissionsGranted) {
      await requestFramePermissions();
    }
    for (const d of descs) {
      if (d.platform === 'youtube' && d.channel) {
        const id = await resolveYoutubeLive(d.channel);
        if (!id) { shakeInput(); continue; }
        addStream({ platform: 'youtube', id });
      } else {
        addStream(d);
      }
    }
    streamInput.value = '';
  } finally {
    submitting = false;
    streamSubmit.disabled = false;
    streamInput.focus();
  }
}

streamSubmit.addEventListener('click', handleSubmit);
streamInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); handleSubmit(); }
});

chatToggleBtn.addEventListener('click', () => setChat(!chatVisible));
chatHideBtn.addEventListener('click', () => setChat(false));
chatSelect.addEventListener('change', () => {
  chatStreamIdx = parseInt(chatSelect.value, 10) || 0;
  loadChat();
});

layoutBtn.addEventListener('click', toggleLayoutMenu);
muteAllBtn.addEventListener('click', () => Mixer.toggleMuteAll());
radioBtn.addEventListener('click', () => Mixer.setRadioMode(!Mixer.state().radioMode));
mixerBtn.addEventListener('click', () => setMixerPanel(!mixerVisible));
mixClose.addEventListener('click', () => setMixerPanel(false));
mixSoloOff.addEventListener('click', () => Mixer.setSolo(null));
mixHover.addEventListener('change', () => Mixer.setHoverFollow(mixHover.checked));
Mixer.onChange(syncMixerToolbar);

window.addEventListener('resize', () => {
  relayout();
});

// 키보드 단축키
document.addEventListener('keydown', (e) => {
  // 믹서 단축키 (입력 중이 아닐 때, 수정키 없이). 한글 IME 상태에서도 동작하도록 e.code 로 판별
  if (!isTypingTarget(e.target) && !e.ctrlKey && !e.altKey && !e.metaKey && !e.isComposing) {
    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if (digit) {
      const n = Number(digit[1]);
      if (n === 0) Mixer.setSolo(null); else Mixer.soloByIndex(n - 1);
      e.preventDefault();
      return;
    }
    switch (e.code) {
      case 'KeyM': Mixer.toggleMuteAll(); e.preventDefault(); return;
      case 'KeyR': Mixer.setRadioMode(!Mixer.state().radioMode); e.preventDefault(); return;
      case 'KeyH': Mixer.setHoverFollow(!Mixer.state().hoverFollow); e.preventDefault(); return;
      case 'KeyX': setMixerPanel(!mixerVisible); e.preventDefault(); return;
    }
  }

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
      closeLayoutMenu();
    } else if (!addStreamPanel.hidden) {
      addStreamPanel.hidden = true;
    } else if (mixerVisible) {
      setMixerPanel(false);
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
  Mixer.resumeTwitch();
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
  if (e.key === 'Enter' && !e.isComposing) {
    clearTimeout(browseSearchTimer);
    loadBrowse();
  }
});

// ═══════════════════════════════════════════════════════
//  iframe 임베딩 권한 (declarativeNetRequest)
//  치지직/숲이 X-Frame-Options 등으로 iframe 차단 시 해제
// ═══════════════════════════════════════════════════════

const FRAME_PERMISSIONS = {
  permissions: ['declarativeNetRequest', 'scripting'],
  origins: [
    '*://api.chzzk.naver.com/*',
    '*://chzzk.naver.com/*',
    '*://play.sooplive.com/*',
    '*://play.sooplive.co.kr/*',
    '*://live.sooplive.co.kr/*',
    '*://sch.sooplive.co.kr/*',
    '*://player.twitch.tv/*',
    '*://www.twitch.tv/*',
    '*://www.youtube.com/*',
  ],
};
const LEGACY_DYNAMIC_RULE_IDS = [100, 101];
let sessionRuleIds = [];

// 트위치는 parent 파라미터로 frame-ancestors https://<host> 를 내려보내는데
// 확장 페이지 origin은 chrome-extension:// 이라 스킴이 달라 항상 차단되므로 헤더를 제거한다.
// 유튜브는 Referer 없는 임베드를 오류 153, 자기 도메인 Referer는 152로 거부하는데
// chrome-extension:// 페이지는 Referer를 아예 보내지 않으므로 이 확장의 공식 페이지를 Referer로 넣는다.
// 규칙은 이 탭에만 적용되는 세션 규칙으로 등록해 다른 사이트의 임베드에는 영향을 주지 않는다.
function frameRules(base, tabId) {
  return [{
    id: base + 1,
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
      tabIds: [tabId],
      requestDomains: [
        'chzzk.naver.com',
        'play.sooplive.com',
        'play.sooplive.co.kr',
        'player.twitch.tv',
        'www.twitch.tv',
      ],
    },
  }, {
    id: base + 2,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'Referer', operation: 'set', value: 'https://github.com/Hahamin/stream-radio-mode' }],
    },
    condition: {
      resourceTypes: ['sub_frame'],
      tabIds: [tabId],
      requestDomains: ['www.youtube.com'],
    },
  }];
}

async function registerFrameRules() {
  if (!chrome.declarativeNetRequest) return;
  try {
    // 이전 버전이 남긴 전역 동적 규칙 정리
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: LEGACY_DYNAMIC_RULE_IDS });

    const tab = await chrome.tabs.getCurrent();
    if (!tab?.id) return;

    // 규칙 ID는 탭 ID와 무관하게 비어 있는 작은 번호를 쓴다 (탭 ID는 32비트 범위를 넘을 수 있음).
    // 멀티뷰 탭이 둘 이상이면 같은 번호를 동시에 고를 수 있으므로, 충돌하면 다음 번호로 다시 시도한다.
    for (let attempt = 0; attempt < 20; attempt++) {
      const openTabs = new Set((await chrome.tabs.query({})).map(t => t.id));
      const existing = await chrome.declarativeNetRequest.getSessionRules();
      // 이 탭의 것이거나 이미 닫힌 탭의 것만 정리 대상 (tabIds 가 없는 규칙은 건드리지 않는다)
      const stale = existing
        .filter(r => {
          const ids = r.condition.tabIds;
          return Array.isArray(ids) && ids.length > 0 && ids.every(id => id === tab.id || !openTabs.has(id));
        })
        .map(r => r.id);
      const used = new Set(existing.filter(r => !stale.includes(r.id)).map(r => r.id));
      let base = 100 + attempt * 10;
      while (used.has(base + 1) || used.has(base + 2)) base += 10;

      try {
        await chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: stale,
          addRules: frameRules(base, tab.id),
        });
        sessionRuleIds = [base + 1, base + 2];
        return;
      } catch (err) {
        // 다른 탭이 같은 번호를 먼저 차지한 경우 → 다음 번호로
        if (attempt === 19) throw err;
      }
    }
  } catch (err) {
    console.warn('[multiview] 프레임 규칙 등록 실패:', err);
  }
}

// bfcache 로 들어갈 때(persisted)는 규칙을 살려둬야 뒤로가기로 돌아왔을 때 임베드가 계속 동작한다
window.addEventListener('pagehide', (e) => {
  if (!e.persisted && sessionRuleIds.length && chrome.declarativeNetRequest) {
    chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: sessionRuleIds }).catch(() => {});
    sessionRuleIds = [];
  }
});

window.addEventListener('pageshow', (e) => {
  if (e.persisted && permissionsGranted) registerFrameRules();
});

// 치지직/숲 플레이어 프레임에 오디오 브리지 주입 (볼륨 제어용)
const FRAME_BRIDGE_SCRIPT = {
  id: 'mv-frame-bridge',
  js: ['multiview/frame-bridge.js'],
  matches: ['*://chzzk.naver.com/*', '*://play.sooplive.com/*', '*://play.sooplive.co.kr/*'],
  allFrames: true,
  runAt: 'document_idle',
  persistAcrossSessions: true,
};

async function registerFrameBridge() {
  if (!chrome.scripting?.registerContentScripts) return;
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [FRAME_BRIDGE_SCRIPT.id] });
    if (existing.length) await chrome.scripting.updateContentScripts([FRAME_BRIDGE_SCRIPT]);
    else await chrome.scripting.registerContentScripts([FRAME_BRIDGE_SCRIPT]);
  } catch (err) {
    console.warn('[multiview] 프레임 브리지 등록 실패:', err);
  }
}

async function enableFrameFeatures() {
  permissionsGranted = true;
  await Promise.all([registerFrameRules(), registerFrameBridge()]);
  Mixer.pingFrames();
  syncPermBanner();
}

// 권한 없이 해시로 열린 스트림은 임베드가 차단된 채 떠 있으므로 허용 버튼을 보여준다
function syncPermBanner() {
  permBanner.hidden = permissionsGranted || !streams.length;
}

async function checkExistingPermissions() {
  try {
    const has = await chrome.permissions.contains(FRAME_PERMISSIONS);
    if (has) await enableFrameFeatures();
  } catch { /* file:// 등 비-확장 환경 무시 */ }
}

async function requestFramePermissions() {
  if (permissionsGranted) return true;
  try {
    const granted = await chrome.permissions.request(FRAME_PERMISSIONS);
    if (granted) {
      await enableFrameFeatures();
      // 권한 전에 만들어진 iframe 은 헤더 규칙/브리지 없이 로드됐으므로 다시 불러온다
      if (streams.length) Mixer.reloadAll();
    }
    return granted;
  } catch {
    return false;
  }
}

permGrantBtn.addEventListener('click', requestFramePermissions);

// ═══════════════════════════════════════════════════════
//  초기화
// ═══════════════════════════════════════════════════════

(async () => {
  // 브리지 등록이 iframe 로드보다 먼저 끝나야 치지직/숲 프레임에 주입된다
  await Mixer.init();
  Mixer.renderPanel(mixerRows);
  await checkExistingPermissions();
  syncMixerToolbar();
  loadHash();
  syncEmpty();
  syncChatSelect();

  // 해시 없이 열렸을 때 자동으로 추가 패널 표시
  if (!streams.length) {
    addStreamPanel.hidden = false;
    setTimeout(() => streamInput.focus(), 100);
  }
})();
