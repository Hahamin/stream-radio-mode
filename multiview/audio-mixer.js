'use strict';

// ═══════════════════════════════════════════════════════
//  오디오 믹서 — 스트림별 볼륨/음소거/솔로, 호버 팔로우, 멀티 라디오
//
//  플랫폼별 제어 경로 (플레이어 소스 분석으로 확인):
//    twitch  : player.twitch.tv postMessage — { eventName: <숫자 enum>, params, namespace }
//    youtube : IFrame API postMessage — enablejsapi=1, JSON 문자열 { event, func, args, id, channel }
//    chzzk/soop : frame-bridge.js (프레임 주입) — <video> 직접 제어, runtime 메시징
//
//  상태 모델: 최종 음소거 = 전체음소거 ∥ 개별음소거 ∥ (솔로 중 & 솔로 아님) ∥ (호버 팔로우 중 & 호버 아님)
//  플레이어가 보고하는 실제 상태를 기준으로 UI를 그리고, 사용자가 플레이어 자체 UI로 바꾼 값은 채택한다.
// ═══════════════════════════════════════════════════════

const Mixer = (() => {
  const CONFIRM_GRACE_MS = 1500;
  const TWITCH_NS = 'twitch-embed-player-proxy';
  const TWITCH_CMD = { Pause: 2, Play: 3, SetMuted: 10, SetVolume: 11 };
  const YT_ORIGIN = 'https://www.youtube.com';
  const STORAGE_KEY = 'mvMixer';
  const MAX_SAVED_VOLUMES = 200;

  const entries = new Map();
  const frameIndex = new Map();
  const listeners = new Set();
  const settings = { hoverFollow: false, radioMode: false, volumes: {} };

  let tabId = null;
  let soloUid = null;
  let hoverUid = null;
  let allMuted = false;
  let userActivated = false;
  let saveTimer = null;
  let panelRows = null;

  const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
  const keyOf = (s) => `${s.platform}:${s.id}`;

  // ═══════════════════════════════════════════════════════
  //  어댑터
  // ═══════════════════════════════════════════════════════

  class BaseAdapter {
    constructor(entry) {
      this.entry = entry;
      this.ready = false;
      this.queue = [];
    }
    enqueue(fn) { if (this.ready) fn(); else this.queue.push(fn); }
    // 플레이어에 실제로 보내는 시점을 기록해야, 준비 전 보고된 초기 상태를 사용자 변경으로 오인하지 않는다
    dispatch(kind, fn, isRetry) {
      this.enqueue(() => {
        this.entry.sentAt[kind] = Date.now();
        if (!isRetry) this.entry.retried[kind] = false;
        fn();
      });
    }
    adopt() {}
    markReady() {
      if (this.ready) return;
      this.ready = true;
      const q = this.queue;
      this.queue = [];
      q.forEach(fn => fn());
    }
    // iframe 을 다시 불러올 때 호출 — 큐를 비우고 준비 상태를 되돌린다
    reset() {
      this.ready = false;
      this.queue = [];
    }
    report(partial) { onAdapterState(this.entry, partial); }
    onMessage() {}
    dispose() {}
  }

  class TwitchAdapter extends BaseAdapter {
    post(eventName, params) {
      const w = this.entry.iframe.contentWindow;
      if (w) w.postMessage({ eventName, params, namespace: TWITCH_NS }, '*');
    }
    setVolume(v, isRetry) { this.dispatch('volume', () => this.post(TWITCH_CMD.SetVolume, v), isRetry); }
    setMuted(b, isRetry) { this.dispatch('muted', () => this.post(TWITCH_CMD.SetMuted, !!b), isRetry); }
    play() { this.enqueue(() => this.post(TWITCH_CMD.Play, undefined)); }
    onMessage(e) {
      if (e.source !== this.entry.iframe.contentWindow) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;

      if (d.namespace === TWITCH_NS && d.eventName === 'UPDATE_STATE' && d.params) {
        this.markReady();
        const p = d.params;
        const partial = {};
        if (typeof p.volume === 'number') partial.volume = p.volume;
        if (typeof p.muted === 'boolean') partial.muted = p.muted;
        if (typeof p.playback === 'string') partial.paused = p.playback !== 'Playing';
        if (typeof p.channelName === 'string' && p.channelName) partial.name = p.channelName;
        this.report(partial);
      } else if (d.namespace === 'twitch-embed') {
        // UPDATE_STATE 이후에도 플레이어 초기화 전엔 명령이 버려지므로 ready 시점에 다시 적용
        if (d.eventName === 'video.ready' || d.eventName === 'ready') { this.markReady(); resend(this.entry); }
        if (d.eventName === 'playbackBlocked') this.report({ blocked: true });
        if (d.eventName === 'playing') this.report({ paused: false, blocked: false });
      }
    }
  }

  class YouTubeAdapter extends BaseAdapter {
    constructor(entry) {
      super(entry);
      this.id = `mv${entry.uid}`;
      this.timer = null;
      // iframe이 아직 about:blank 인 동안 보내면 targetOrigin 불일치 경고만 나므로 load 이후에 시작.
      // 플레이어가 스스로 이동한 경우에도 새 문서와 다시 악수해야 하므로 매 load 마다 건다.
      this.onLoad = () => this.startHandshake();
      entry.iframe.addEventListener('load', this.onLoad);
    }
    send(obj) {
      const w = this.entry.iframe.contentWindow;
      if (w) w.postMessage(JSON.stringify({ ...obj, id: this.id, channel: 'widget' }), YT_ORIGIN);
    }
    reset() {
      super.reset();
      this.startHandshake();
    }
    startHandshake() {
      clearInterval(this.timer);
      this.ready = false;
      const started = Date.now();
      this.send({ event: 'listening' });
      this.timer = setInterval(() => {
        if (Date.now() - started > 60000) { clearInterval(this.timer); return; }
        this.send({ event: 'listening' });
      }, 250);
    }
    command(func, args = []) { this.enqueue(() => this.send({ event: 'command', func, args })); }
    setVolume(v, isRetry) { this.dispatch('volume', () => this.send({ event: 'command', func: 'setVolume', args: [Math.round(v * 100)] }), isRetry); }
    setMuted(b, isRetry) { this.dispatch('muted', () => this.send({ event: 'command', func: b ? 'mute' : 'unMute', args: [] }), isRetry); }
    play() { this.command('playVideo'); }
    onMessage(e) {
      if (e.origin !== YT_ORIGIN || e.source !== this.entry.iframe.contentWindow || typeof e.data !== 'string') return;
      let d;
      try { d = JSON.parse(e.data); } catch { return; }
      if (!d || d.id !== this.id) return;

      if ((d.event === 'infoDelivery' || d.event === 'initialDelivery') && d.info) {
        const partial = {};
        if (typeof d.info.volume === 'number') partial.volume = d.info.volume / 100;
        if (typeof d.info.muted === 'boolean') partial.muted = d.info.muted;
        if (typeof d.info.playerState === 'number') partial.paused = d.info.playerState !== 1;
        const author = d.info.videoData?.author;
        if (typeof author === 'string' && author) partial.name = author;
        this.report(partial);
      }
      // 리로드 뒤에는 initialDelivery 를 놓치고 alreadyInitialized 만 오는 경우가 있다.
      // 어떤 응답이든 도착했다면 통신이 되는 것이므로 준비 완료로 본다.
      if (d.event === 'initialDelivery' || d.event === 'onReady' || d.event === 'alreadyInitialized' || d.event === 'infoDelivery') {
        clearInterval(this.timer);
        this.markReady();
      }
    }
    dispose() {
      clearInterval(this.timer);
      this.entry.iframe.removeEventListener('load', this.onLoad);
    }
  }

  class BridgeAdapter extends BaseAdapter {
    constructor(entry) {
      super(entry);
      this.key = keyOf(entry.stream);
      this.frameId = frameIndex.has(this.key) ? frameIndex.get(this.key) : null;
      if (this.frameId !== null) this.markReady();
      // 프레임에게 "이 임베드의 주인은 멀티뷰"라고 알린다. 브리지는 이 신호를 받은 뒤에만
      // 자신을 등록하고 플레이어를 꽉 채우므로, 일반 웹사이트가 임베드한 플레이어는 건드리지 않는다.
      this.claim = () => {
        const w = entry.iframe.contentWindow;
        if (w) w.postMessage({ __srm: 'mv-owner' }, '*');
      };
      // 플레이어가 스스로 이동(숲 /direct 리다이렉트, 화질 변경 등)하면 새 문서에서 소유권이 초기화되므로
      // 신호는 계속 보낸다. 브리지는 이미 소유 상태면 무시한다.
      this.onLoad = () => {
        this.frameId = null;
        frameIndex.delete(this.key);
        this.ready = false;
        this.claim();
      };
      entry.iframe.addEventListener('load', this.onLoad);
      this.claimTimer = setInterval(this.claim, 2000);
      this.claim();
    }
    attachFrame(frameId) {
      this.frameId = frameId;
      this.markReady();
      resend(this.entry);
    }
    reset() {
      super.reset();
      this.frameId = null;
      frameIndex.delete(this.key);
      this.claim();
    }
    dispose() {
      clearInterval(this.claimTimer);
      this.entry.iframe.removeEventListener('load', this.onLoad);
    }
    async cmd(cmd, value) {
      if (tabId === null || this.frameId === null) return;
      try {
        const st = await chrome.tabs.sendMessage(tabId, { type: 'mv-cmd', cmd, value }, { frameId: this.frameId });
        if (st && st.hasVideo) this.report(pickState(st));
      } catch { /* 프레임이 사라짐 */ }
    }
    setVolume(v, isRetry) { this.dispatch('volume', () => this.cmd('setVolume', v), isRetry); }
    setMuted(b, isRetry) { this.dispatch('muted', () => this.cmd('setMuted', !!b), isRetry); }
    play() { this.enqueue(() => this.cmd('play')); }
    // 플레이어 UI에서 바꾼 값을 채택했을 때 브리지의 desired 도 맞춰야 다음 재생 시 되돌리지 않는다
    adopt(kind, value) { this.enqueue(() => this.cmd(kind === 'volume' ? 'setVolume' : 'setMuted', value)); }
  }

  function pickState(st) {
    const p = {};
    if (typeof st.volume === 'number') p.volume = st.volume;
    if (typeof st.muted === 'boolean') p.muted = st.muted;
    if (typeof st.paused === 'boolean') p.paused = st.paused;
    return p;
  }

  function createAdapter(entry) {
    switch (entry.stream.platform) {
      case 'twitch':  return new TwitchAdapter(entry);
      case 'youtube': return new YouTubeAdapter(entry);
      default:        return new BridgeAdapter(entry);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  상태 모델
  // ═══════════════════════════════════════════════════════

  // 사용자가 이 스트림에 직접 건 음소거가 아니라, 전역 상태 때문에 강제된 음소거인가
  function forcedMute(entry) {
    return allMuted ||
      (soloUid !== null && soloUid !== entry.uid) ||
      (settings.hoverFollow && hoverUid !== null && hoverUid !== entry.uid);
  }

  function effective(entry) {
    return { volume: entry.base, muted: forcedMute(entry) || entry.muted };
  }

  function apply(uid) {
    const e = entries.get(uid);
    if (!e) return;
    const eff = effective(e);
    // sentAt 은 어댑터가 실제로 보낼 때 찍힌다. 0 은 '아직 전송 전' 표시
    if (e.sent.volume === null || Math.abs(e.sent.volume - eff.volume) > 0.001) {
      e.sent.volume = eff.volume;
      e.sentAt.volume = 0;
      e.adapter.setVolume(eff.volume);
    }
    if (e.sent.muted !== eff.muted) {
      e.sent.muted = eff.muted;
      e.sentAt.muted = 0;
      e.adapter.setMuted(eff.muted);
    }
    notify(uid);
  }

  function applyAll() {
    for (const uid of entries.keys()) apply(uid);
    notify(null);
  }

  function resend(entry) {
    entry.sent = { volume: null, muted: null };
    entry.sentAt = { volume: 0, muted: 0 };
    apply(entry.uid);
  }

  function onAdapterState(entry, partial) {
    const now = Date.now();
    let reapply = false;

    if (typeof partial.volume === 'number') {
      entry.actual.volume = partial.volume;
      const target = entry.sent.volume;
      if (target !== null && Math.abs(partial.volume - target) > 0.01) {
        if (!entry.sentAt.volume) {
          // 아직 전송 전 — 플레이어의 초기 상태 보고일 뿐
        } else if (now - entry.sentAt.volume < CONFIRM_GRACE_MS) {
          if (!entry.retried.volume) { entry.retried.volume = true; entry.adapter.setVolume(target, true); }
        } else {
          // 플레이어 자체 UI에서 바꾼 값 → 채택
          entry.base = partial.volume;
          entry.sent.volume = partial.volume;
          entry.adapter.adopt('volume', partial.volume);
          persistVolume(entry);
        }
      }
    }

    if (typeof partial.muted === 'boolean') {
      entry.actual.muted = partial.muted;
      const target = entry.sent.muted;
      if (target !== null && partial.muted !== target) {
        if (!entry.sentAt.muted) {
          // 전송 전 초기 상태
        } else if (now - entry.sentAt.muted < CONFIRM_GRACE_MS) {
          if (!entry.retried.muted) { entry.retried.muted = true; entry.adapter.setMuted(target, true); }
        } else if (partial.muted && !target) {
          // 소리 켜기를 요청했지만 계속 음소거 → 자동재생 정책에 막힌 상태
          if (userActivated) { entry.muted = true; entry.sent.muted = true; entry.adapter.adopt('muted', true); }
          else entry.blocked = true;
        } else if (forcedMute(entry)) {
          // 전체 음소거·솔로·호버 팔로우로 강제된 음소거인데 플레이어가 계속 소리를 냄.
          // 여기서 채택하면 apply() 가 다시 음소거를 걸어 진동이 생기므로 한 번만 재시도한다.
          if (!entry.retried.muted) { entry.retried.muted = true; entry.adapter.setMuted(true, true); }
        } else {
          entry.muted = false;
          entry.sent.muted = false;
          entry.adapter.adopt('muted', false);
          reapply = true;
        }
      } else if (!partial.muted) {
        entry.blocked = false;
      }
    }

    if (typeof partial.paused === 'boolean') entry.actual.paused = partial.paused;
    if (typeof partial.blocked === 'boolean') entry.blocked = partial.blocked;
    if (typeof partial.name === 'string' && partial.name !== entry.stream.name && typeof setStreamName === 'function') {
      setStreamName(entry.stream, partial.name);
    }

    if (reapply) apply(entry.uid);
    else notify(entry.uid);
  }

  // ═══════════════════════════════════════════════════════
  //  저장
  // ═══════════════════════════════════════════════════════

  async function loadSettings() {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      const saved = data?.[STORAGE_KEY];
      if (saved && typeof saved === 'object') {
        settings.hoverFollow = !!saved.hoverFollow;
        settings.radioMode = !!saved.radioMode;
        settings.volumes = saved.volumes && typeof saved.volumes === 'object' ? saved.volumes : {};
      }
    } catch { /* 비-확장 환경 */ }
  }

  function save() {
    try { chrome.storage.local.set({ [STORAGE_KEY]: settings }); } catch { /* 비-확장 환경 */ }
  }

  // 볼륨 드래그는 이벤트가 많아 디바운스, 토글 설정은 탭을 바로 닫아도 남도록 즉시 저장
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
  }

  function persistVolume(entry) {
    const keys = Object.keys(settings.volumes);
    if (keys.length >= MAX_SAVED_VOLUMES) delete settings.volumes[keys[0]];
    settings.volumes[keyOf(entry.stream)] = Math.round(entry.base * 100) / 100;
    scheduleSave();
  }

  // ═══════════════════════════════════════════════════════
  //  타일 UI
  // ═══════════════════════════════════════════════════════

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function buildControls(entry, prefix) {
    const bar = el('div', prefix);
    const mute = el('button', 'ta-btn ta-mute', '🔊');
    mute.title = '음소거';
    const vol = document.createElement('input');
    vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.step = '1';
    vol.className = 'ta-vol';
    vol.title = '볼륨';
    const solo = el('button', 'ta-btn ta-solo', 'S');
    solo.title = '솔로 — 이 스트림만 소리';
    const status = el('span', 'ta-status');

    mute.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(entry.uid); });
    solo.addEventListener('click', (e) => { e.stopPropagation(); toggleSolo(entry.uid); });
    vol.addEventListener('input', (e) => { e.stopPropagation(); setVolume(entry.uid, vol.value / 100); });
    for (const ev of ['pointerdown', 'click', 'dblclick']) bar.addEventListener(ev, (e) => e.stopPropagation());

    bar.append(mute, vol, solo, status);
    return { bar, mute, vol, solo, status };
  }

  function syncControls(entry, c) {
    const eff = effective(entry);
    const actualMuted = entry.actual.muted;
    const shownMuted = actualMuted === null ? eff.muted : actualMuted;
    c.mute.textContent = shownMuted ? '🔇' : (entry.base < 0.5 ? '🔉' : '🔊');
    c.mute.classList.toggle('on', entry.muted);
    c.solo.classList.toggle('on', soloUid === entry.uid);
    if (document.activeElement !== c.vol) c.vol.value = String(Math.round(entry.base * 100));
    c.vol.disabled = entry.actual.volume === null;

    let statusText = '';
    let statusTitle = '';
    if (entry.blocked) { statusText = '⚠'; statusTitle = '브라우저 자동재생 정책으로 음소거됨 — 타일을 클릭하면 소리를 켭니다'; }
    else if (entry.actual.volume === null) { statusText = '…'; statusTitle = '플레이어 연결 대기 중'; }
    else if (eff.muted && !entry.muted && !allMuted) { statusText = '·'; statusTitle = soloUid !== null ? '다른 스트림 솔로 중' : '호버 팔로우로 음소거'; }
    c.status.textContent = statusText;
    c.status.title = statusTitle;
  }

  function buildTile(entry, wrapper) {
    const c = buildControls(entry, 'tile-audio');
    const badge = el('div', 'tile-muted-badge', '🔇');
    const blocked = el('div', 'tile-blocked', '🔇 소리 꺼짐 — 클릭해서 켜기');
    blocked.hidden = true;
    blocked.addEventListener('click', (e) => {
      e.stopPropagation();
      userActivated = true;
      entry.blocked = false;
      entry.muted = false;
      resend(entry);
      entry.adapter.play();
    });

    const cover = el('div', 'stream-cover');
    const inner = el('div', 'cover-inner');
    const dot = el('span', 'pdot');
    dot.style.background = PLATFORM_COLOR[entry.stream.platform] || '#888';
    const name = el('span', 'cover-name', entry.stream.name);
    const icon = el('span', 'cover-icon', '🎧');
    inner.append(dot, name, icon);
    if (entry.stream.platform === 'twitch') {
      inner.appendChild(el('span', 'cover-note', '트위치는 화면을 가리면 재생이 멈춰 작은 미리보기를 유지합니다'));
    }
    cover.appendChild(inner);
    cover.addEventListener('click', () => toggleSolo(entry.uid));

    wrapper.append(cover, badge, blocked, c.bar);
    entry.tile = { ...c, badge, blocked, cover, name, wrapper };
    syncTile(entry);
  }

  function syncTile(entry) {
    const t = entry.tile;
    if (!t) return;
    syncControls(entry, t);
    const eff = effective(entry);
    const shownMuted = entry.actual.muted === null ? eff.muted : entry.actual.muted;
    t.badge.hidden = !shownMuted;
    t.blocked.hidden = !entry.blocked;
    t.name.textContent = entry.stream.name;
    t.wrapper.classList.toggle('solo', soloUid === entry.uid);
    t.wrapper.classList.toggle('dimmed', eff.muted);
  }

  // ═══════════════════════════════════════════════════════
  //  믹서 패널
  // ═══════════════════════════════════════════════════════

  function renderPanel(container) {
    panelRows = container;
    rebuildPanel();
  }

  function rebuildPanel() {
    if (!panelRows) return;
    panelRows.innerHTML = '';
    let idx = 0;
    for (const entry of entries.values()) {
      idx++;
      const row = el('div', 'mixer-row');
      const num = el('span', 'mr-num', idx <= 9 ? String(idx) : '');
      num.title = idx <= 9 ? `${idx} 키로 솔로` : '';
      const dot = el('span', 'pdot');
      dot.style.background = PLATFORM_COLOR[entry.stream.platform] || '#888';
      const name = el('span', 'mr-name', entry.stream.name);
      const c = buildControls(entry, 'mr-controls');
      const pct = el('span', 'mr-pct');
      row.append(num, dot, name, c.bar, pct);
      panelRows.appendChild(row);
      entry.row = { ...c, name, pct };
      syncRow(entry);
    }
    if (!idx) panelRows.appendChild(el('div', 'mixer-empty', '스트림을 추가하면 여기서 소리를 섞을 수 있습니다'));
  }

  function syncRow(entry) {
    const r = entry.row;
    if (!r) return;
    syncControls(entry, r);
    r.name.textContent = entry.stream.name;
    r.pct.textContent = `${Math.round(entry.base * 100)}%`;
  }

  // ═══════════════════════════════════════════════════════
  //  알림
  // ═══════════════════════════════════════════════════════

  function notify(uid) {
    if (uid === null) {
      for (const e of entries.values()) { syncTile(e); syncRow(e); }
    } else {
      const e = entries.get(uid);
      if (e) { syncTile(e); syncRow(e); }
    }
    listeners.forEach(fn => { try { fn(uid); } catch { /* UI 콜백 오류 무시 */ } });
  }

  // ═══════════════════════════════════════════════════════
  //  공개 API
  // ═══════════════════════════════════════════════════════

  async function init() {
    await loadSettings();
    document.body.classList.toggle('radio-mode', settings.radioMode);

    try {
      const tab = await chrome.tabs.getCurrent();
      tabId = tab?.id ?? null;
    } catch { tabId = null; }

    window.addEventListener('message', (e) => {
      for (const entry of entries.values()) entry.adapter.onMessage(e);
    });

    try {
      chrome.runtime.onMessage.addListener((msg, sender) => {
        if (!msg || typeof msg !== 'object' || !sender.tab || sender.tab.id !== tabId) return;
        if (typeof msg.key !== 'string') return;

        if (msg.type === 'mv-frame-ready') {
          frameIndex.set(msg.key, sender.frameId);
          for (const entry of entries.values()) {
            if (entry.adapter instanceof BridgeAdapter && entry.adapter.key === msg.key) entry.adapter.attachFrame(sender.frameId);
          }
        } else if (msg.type === 'mv-state') {
          for (const entry of entries.values()) {
            if (entry.adapter instanceof BridgeAdapter && entry.adapter.key === msg.key && msg.hasVideo) entry.adapter.report(pickState(msg));
          }
        }
      });
    } catch { /* 비-확장 환경 */ }

    // 타일 밖(툴바·패널·타일 사이 틈)으로 포인터가 나오면 호버 해제
    document.addEventListener('pointerover', (e) => {
      const t = e.target;
      if (!(t instanceof Element) || !t.closest('.stream-wrapper')) clearHover();
    }, true);

    // 커서가 이미 타일 위에 있는 채로 탭이 복귀하면 가장자리 밴드를 지나지 않아 진입을 놓친다.
    // 플레이어를 클릭하면 그 iframe 이 포커스를 가져가므로 이를 진입 신호로 쓴다.
    window.addEventListener('blur', () => {
      const el = document.activeElement;
      if (!el || el.tagName !== 'IFRAME') return;
      for (const e of entries.values()) {
        if (e.iframe === el) { hoverTile(e.uid); return; }
      }
    });

    document.addEventListener('pointerdown', () => {
      if (userActivated) return;
      userActivated = true;
      // 첫 사용자 제스처 이후에는 자동재생 정책이 풀리므로 막혀 있던 스트림의 소리를 다시 시도
      for (const entry of entries.values()) {
        if (entry.blocked) { entry.blocked = false; resend(entry); }
      }
    }, true);

    pingFrames();
  }

  function pingFrames() {
    if (tabId === null) return;
    try {
      const p = chrome.tabs.sendMessage(tabId, { type: 'mv-ping' });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* 수신자 없음 */ }
  }

  function attach(stream, iframe, wrapper) {
    const key = keyOf(stream);
    const savedVol = settings.volumes[key];
    const entry = {
      uid: stream.uid,
      stream,
      iframe,
      base: typeof savedVol === 'number' ? clamp01(savedVol) : 1,
      muted: false,
      blocked: false,
      actual: { volume: null, muted: null, paused: null },
      sent: { volume: null, muted: null },
      sentAt: { volume: 0, muted: 0 },
      retried: { volume: false, muted: false },
      adapter: null,
      tile: null,
      row: null,
      sensor: null,
    };
    entry.adapter = createAdapter(entry);
    entries.set(stream.uid, entry);

    // 크로스오리진 iframe 위에서는 부모 문서가 마우스 이벤트를 받지 못하고 :hover 도 매치되지 않는다.
    // 타일 가장자리에만 투명 밴드를 두면 마우스가 들어올 때 반드시 지나므로 진입을 감지할 수 있고,
    // 가운데는 비어 있어 플레이어 클릭을 절대 막지 않는다.
    // 이탈은 문서의 다른 곳에서 pointerover 가 오는 것으로 감지한다 (init 참고).
    // 트위치는 밴드가 가림으로 잡혀 정지하므로 컨트롤 띠 진입으로만 감지한다.
    if (stream.platform !== 'twitch') {
      const sensor = el('div', 'hover-sensor');
      for (const side of ['t', 'r', 'b', 'l']) {
        const band = el('div', `hs-band hs-${side}`);
        band.addEventListener('pointerenter', () => hoverTile(stream.uid));
        sensor.appendChild(band);
      }
      wrapper.appendChild(sensor);
      entry.sensor = sensor;
    }
    wrapper.addEventListener('pointerenter', () => hoverTile(stream.uid));

    buildTile(entry, wrapper);
    rebuildPanel();
    apply(stream.uid);
    return entry;
  }

  function detach(uid) {
    const e = entries.get(uid);
    if (!e) return;
    e.adapter.dispose();
    entries.delete(uid);
    frameIndex.delete(keyOf(e.stream));
    if (soloUid === uid) soloUid = null;
    if (hoverUid === uid) hoverUid = null;
    rebuildPanel();
    applyAll();
  }

  function initialMuted(uid) {
    const e = entries.get(uid);
    return e ? effective(e).muted : false;
  }

  function updateName(uid) {
    const e = entries.get(uid);
    if (e) { syncTile(e); syncRow(e); }
  }

  function setVolume(uid, v) {
    const e = entries.get(uid);
    if (!e) return;
    e.base = clamp01(v);
    if (e.base > 0 && e.muted) e.muted = false;
    persistVolume(e);
    apply(uid);
  }

  function setMuted(uid, b) {
    const e = entries.get(uid);
    if (!e) return;
    e.muted = !!b;
    apply(uid);
  }

  function toggleMute(uid) {
    const e = entries.get(uid);
    if (e) setMuted(uid, !e.muted);
  }

  function setSolo(uid) {
    soloUid = uid !== null && entries.has(uid) ? uid : null;
    applyAll();
  }

  function toggleSolo(uid) { setSolo(soloUid === uid ? null : uid); }

  function soloByIndex(index) {
    const list = [...entries.keys()];
    if (index < 0 || index >= list.length) return;
    toggleSolo(list[index]);
  }

  function setHover(uid) {
    hoverUid = uid;
    if (settings.hoverFollow) applyAll();
  }

  function hoverTile(uid) {
    if (hoverUid === uid) return;
    for (const e of entries.values()) {
      if (e.tile) e.tile.wrapper.classList.toggle('hovered', e.uid === uid);
    }
    setHover(uid);
  }

  function clearHover() {
    if (hoverUid === null) return;
    for (const e of entries.values()) {
      if (e.tile) e.tile.wrapper.classList.remove('hovered');
    }
    setHover(null);
  }

  function setMuteAll(b) {
    allMuted = !!b;
    applyAll();
  }

  function toggleMuteAll() { setMuteAll(!allMuted); }

  function setHoverFollow(b) {
    settings.hoverFollow = !!b;
    save();
    applyAll();
  }

  // 트위치는 가려지거나 숨겨졌다 나타나면 정지한 채 스스로 재개하지 않으므로 레이아웃 전환 뒤 찔러준다.
  // 보고된 paused 값이 아직 낡았을 수 있어 조건 없이 보낸다 (재생 중에 play 는 무해)
  function resumeTwitch() {
    setTimeout(() => {
      for (const e of entries.values()) {
        if (e.stream.platform === 'twitch') e.adapter.play();
      }
    }, 800);
  }

  function setRadioMode(b) {
    settings.radioMode = !!b;
    document.body.classList.toggle('radio-mode', settings.radioMode);
    save();
    notify(null);
    resumeTwitch();
  }

  // 권한을 뒤늦게 받은 경우 등 iframe 을 처음부터 다시 불러오고 원하는 상태를 재적용한다
  function reloadAll() {
    for (const e of entries.values()) {
      e.adapter.reset();
      e.actual = { volume: null, muted: null, paused: null };
      e.iframe.src = e.iframe.src;
      resend(e);
    }
  }

  function state() {
    return { allMuted, soloUid, hoverUid, hoverFollow: settings.hoverFollow, radioMode: settings.radioMode, count: entries.size };
  }

  function onChange(fn) { listeners.add(fn); }

  function debug() {
    return [...entries.values()].map(e => ({
      uid: e.uid, platform: e.stream.platform, id: e.stream.id, name: e.stream.name,
      base: e.base, muted: e.muted, blocked: e.blocked, ready: e.adapter.ready,
      frameId: e.adapter.frameId ?? null,
      actual: { ...e.actual }, sent: { ...e.sent }, effective: effective(e),
    }));
  }

  return {
    init, attach, detach, initialMuted, updateName, renderPanel,
    setVolume, setMuted, toggleMute, setSolo, toggleSolo, soloByIndex, setHover,
    setMuteAll, toggleMuteAll, setHoverFollow, setRadioMode, resumeTwitch, reloadAll,
    state, onChange, pingFrames, debug,
  };
})();
