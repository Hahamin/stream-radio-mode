/**
 * Stream Radio Mode — 채팅 다크 테마/스타일 주입
 */

window._srmDarkTheme = {
  _srmTransformOverrides: [],

  _neutralizeAncestorTransforms(el) {
    this._restoreAncestorTransforms();
    let parent = el.parentElement;
    while (parent && parent !== document.documentElement) {
      const cs = getComputedStyle(parent);
      if (cs.transform !== 'none' || cs.willChange === 'transform'
          || cs.filter !== 'none' || cs.perspective !== 'none') {
        this._srmTransformOverrides.push({
          el: parent,
          transform: parent.style.transform,
          willChange: parent.style.willChange,
          filter: parent.style.filter,
          perspective: parent.style.perspective,
        });
        parent.style.setProperty('transform', 'none', 'important');
        parent.style.setProperty('will-change', 'auto', 'important');
        parent.style.setProperty('filter', 'none', 'important');
        parent.style.setProperty('perspective', 'none', 'important');
      }
      parent = parent.parentElement;
    }
  },

  _restoreAncestorTransforms() {
    for (const entry of this._srmTransformOverrides) {
      entry.el.style.transform = entry.transform;
      entry.el.style.willChange = entry.willChange;
      entry.el.style.filter = entry.filter;
      entry.el.style.perspective = entry.perspective;
    }
    this._srmTransformOverrides = [];
  },

  _injectDarkOverrideStyle(chatEl) {
    this._removeDarkOverrideStyle();

    const ids = [];
    let parent = chatEl.parentElement;
    while (parent && parent !== document.documentElement) {
      if (parent.id) ids.unshift(`#${parent.id}`);
      parent = parent.parentElement;
    }
    const prefix = ids.length > 0 ? `${ids.join(' ')} ` : '';
    const s = `${prefix}.srm-chat-embedded`;

    const bg = 'var(--srm-bg, #16213e)';
    const bgHeader = 'var(--srm-bg-header, #1a1a2e)';
    const bgHeaderMuted = 'var(--srm-bg-header-muted, #151d30)';
    const text = 'var(--srm-text, #c8d6e5)';
    const borderSoft = 'var(--srm-border-soft, rgba(100, 140, 255, 0.16))';

    const style = document.createElement('style');
    style.id = 'srm-dark-override';
    style.textContent = `
      ${s} { --srm-panel-header-height: 56px; }
      ${s}, ${s} * { color: ${text} !important; border-color: rgba(255,255,255,0.06) !important; }
      ${s} .list_box, ${s} .chatting_box, ${s} .store_box { background: ${bg} !important; }
      ${s} #list_area { background: ${bg} !important; }
      ${s} #list-container, ${s} .list_contents {
        background: ${bg} !important;
        flex: 1 1 auto !important;
        overflow-y: auto !important;
        min-height: 0 !important;
      }
      ${s} .cBox-list, ${s} .catch_list_wrap2, ${s} .recommend_list { background: ${bg} !important; }
      ${s} #bj-list, ${s} #catch-list, ${s} #recommend-list { background: ${bg} !important; }
      ${s} .section_selectTab { background: ${bgHeader} !important; }
      ${s} .chat_title {
        background: ${bgHeader} !important;
        background-color: ${bgHeader} !important;
        background-image: none !important;
        border-radius: 16px 16px 0 0 !important;
        margin: 0 !important;
        min-height: var(--srm-panel-header-height, 56px) !important;
        height: var(--srm-panel-header-height, 56px) !important;
        width: 100% !important;
        flex: 1 1 auto !important;
        padding: 0 16px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        box-sizing: border-box !important;
        overflow: visible !important;
        position: relative !important;
        z-index: 4 !important;
        border: none !important;
        box-shadow: none !important;
      }
      ${s} .area_header {
        background: ${bgHeader} !important;
        background-color: ${bgHeader} !important;
        background-image: none !important;
        margin: 0 !important;
        min-height: var(--srm-panel-header-height, 56px) !important;
        height: var(--srm-panel-header-height, 56px) !important;
        padding: 0 16px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        border-radius: 16px 16px 0 0 !important;
        width: 100% !important;
        box-sizing: border-box !important;
        overflow: visible !important;
        position: relative !important;
        z-index: 4 !important;
        border: none !important;
        box-shadow: none !important;
      }
      ${s} .area_header > .chat_title {
        width: 100% !important;
        flex: 1 1 auto !important;
      }
      ${s} .chat_title > h2,
      ${s} .area_header > h2 {
        margin: 0 !important;
        margin-right: auto !important;
        display: flex !important;
        align-items: center !important;
        flex: 1 1 auto !important;
        min-width: 0 !important;
        min-height: 0 !important;
        max-height: 36px !important;
        height: auto !important;
      }
      ${s} .chat_title > a,
      ${s} .chat_title > button,
      ${s} .chat_title > [class*="tip"],
      ${s} .area_header > a,
      ${s} .area_header > button,
      ${s} .area_header > [class*="tip"] {
        flex: 0 0 auto !important;
      }
      ${s} .chat_title > ul,
      ${s} .area_header > ul {
        margin: 0 0 0 auto !important;
        padding: 0 !important;
        list-style: none !important;
        display: flex !important;
        align-items: center !important;
        justify-content: flex-end !important;
        flex: 0 0 auto !important;
        gap: 10px !important;
        min-height: 100% !important;
        overflow: visible !important;
      }
      ${s} .chat_title > ul > li.viewer,
      ${s} .chat_title > ul > li.set,
      ${s} .chat_title > ul > li.close,
      ${s} .area_header > ul > li.refresh,
      ${s} .area_header > ul > li.close {
        width: 38px !important;
        height: 38px !important;
        flex: 0 0 38px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        align-self: center !important;
        margin: 0 !important;
        padding: 0 !important;
        line-height: 0 !important;
        font-size: 0 !important;
        position: static !important;
        vertical-align: middle !important;
      }
      ${s} .chat_title > ul > li.viewer > a,
      ${s} .chat_title > ul > li.set > a,
      ${s} .chat_title > ul > li.close > a,
      ${s} .area_header > ul > li.refresh > a,
      ${s} .area_header > ul > li.close > a {
        width: 38px !important;
        height: 38px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        align-self: center !important;
        margin: 0 !important;
        padding: 0 !important;
        line-height: 0 !important;
        font-size: 0 !important;
        position: static !important;
        top: auto !important;
        left: auto !important;
        right: auto !important;
        bottom: auto !important;
        transform: none !important;
        vertical-align: middle !important;
        background-position: center center !important;
        background-repeat: no-repeat !important;
        background-size: auto !important;
      }
      ${s} .chat_title > ul > li > a[tip]::after,
      ${s} .area_header > ul > li > a[tip]::after {
        min-width: 0 !important;
        width: auto !important;
        max-width: none !important;
        height: 30px !important;
        line-height: 30px !important;
        padding: 0 12px !important;
        left: 50% !important;
        right: auto !important;
        transform: translateX(-50%) !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        white-space: nowrap !important;
        box-sizing: border-box !important;
        z-index: 8 !important;
      }
      ${s} .chat_title > ul > li > a[tip]::before,
      ${s} .area_header > ul > li > a[tip]::before {
        left: 50% !important;
        right: auto !important;
        transform: translateX(-50%) !important;
        z-index: 8 !important;
      }
      ${s} .chat_title > ul > li,
      ${s} .area_header > ul > li,
      ${s} .chat_title > ul > li > a[tip],
      ${s} .area_header > ul > li > a[tip] {
        overflow: visible !important;
        position: relative !important;
      }
      ${s} .filter_list {
        background: transparent !important;
        border: none !important;
        padding: 12px 16px !important;
      }
      ${s} #chatbox, ${s} .chatbox, ${s} #chatting_area { background: ${bg} !important; }
      ${s} #chatbox, ${s} .chatbox {
        display: flex !important;
        flex-direction: column !important;
        min-height: 0 !important;
      }
      ${s} #chatbox > .area_header {
        min-height: var(--srm-panel-header-height, 56px) !important;
        height: auto !important;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        justify-content: flex-start !important;
        overflow: visible !important;
      }
      ${s} #chatbox > .area_header > .chat_title {
        min-height: var(--srm-panel-header-height, 56px) !important;
        height: var(--srm-panel-header-height, 56px) !important;
        padding: 0 16px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        flex: 0 0 auto !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      ${s} #chatbox > .area_header > .idsearch,
      ${s} #chatbox > .area_header > .chat_topbox {
        width: 100% !important;
        flex: 0 0 auto !important;
      }
      ${s} #chatbox > .area_header > .chat_topbox {
        position: relative !important;
        z-index: 2 !important;
        overflow: hidden !important;
      }
      ${s} #chatbox > .area_header > .chat_topbox .chat_notice,
      ${s} #chatbox > .area_header > .chat_topbox .chat_banner2 {
        position: relative !important;
        min-height: 48px !important;
        box-sizing: border-box !important;
        flex: 0 0 auto !important;
      }
      ${s} .chatting-item-wrap { background: ${bg} !important; }
      ${s} #chat_area, ${s} .chatting-viewer { background: ${bg} !important; }
      ${s} input, ${s} textarea { background: ${bgHeaderMuted} !important; color: #e0e0e0 !important; }
      ${s} a { color: #7ea8f7 !important; }
      ${s} .chat_layer:not(.srm-chat-floating-layer),
      ${s} [class*="chat_layer"]:not(.srm-chat-floating-layer),
      ${s} [class*="setting"]:not(.srm-chat-floating-layer),
      ${s} [class*="list_viewer"]:not(.srm-chat-floating-layer),
      ${s} [class*="list_participant"]:not(.srm-chat-floating-layer),
      ${s} [class*="ice"]:not(.srm-chat-floating-layer) {
        background: ${bgHeaderMuted} !important; color: ${text} !important;
      }
      ${s} .chat_layer:not(.srm-chat-floating-layer) *,
      ${s} [class*="chat_layer"]:not(.srm-chat-floating-layer) *,
      ${s} [class*="setting"]:not(.srm-chat-floating-layer) *,
      ${s} [class*="list_viewer"]:not(.srm-chat-floating-layer) *,
      ${s} [class*="list_participant"]:not(.srm-chat-floating-layer) *,
      ${s} [class*="ice"]:not(.srm-chat-floating-layer) * {
        color: ${text} !important; background-color: transparent !important;
      }
      ${s} .filter_list .swiper-wrapper {
        display: flex !important;
        gap: 6px !important;
        flex-wrap: nowrap !important;
      }
      ${s} .filter_list .swiper-slide {
        width: auto !important;
        flex-shrink: 1 !important;
      }
      ${s} .filter_list .swiper-slide button {
        min-height: 34px !important;
        padding: 0 12px !important;
        border-radius: 999px !important;
        border: 1px solid rgba(100, 150, 220, 0.12) !important;
        background: rgba(20, 32, 58, 0.6) !important;
        color: rgba(180, 200, 230, 0.65) !important;
        font-size: 12.5px !important;
        font-weight: 500 !important;
        white-space: nowrap !important;
        cursor: pointer !important;
        transition: all 0.25s ease !important;
      }
      ${s} .filter_list .swiper-slide button:hover {
        background: rgba(30, 50, 85, 0.7) !important;
        border-color: rgba(100, 150, 220, 0.22) !important;
        color: rgba(210, 225, 245, 0.85) !important;
      }
      ${s} .filter_list .swiper-slide.on button,
      ${s} .filter_list .swiper-slide[aria-selected="true"] button {
        background: rgba(45, 70, 120, 0.65) !important;
        border-color: rgba(100, 150, 220, 0.35) !important;
        color: #e8f0ff !important;
        font-weight: 700 !important;
        box-shadow: 0 0 12px rgba(80, 130, 210, 0.1) !important;
      }
      ${s} .filter_list, ${s} .filter_list *,
      ${s} #filter_list_wrap, ${s} .filter_list .swiper-wrapper,
      ${s} .filter_list .swiper-slide {
        pointer-events: auto !important;
      }
      ${s} .filter_controller, ${s} .filter_controller .prev,
      ${s} .filter_controller .next {
        display: none !important;
      }
      ${s} .list_contents .tit, ${s} .list_contents .info_area .tit,
      ${s} .list_contents .cBox-info .title a { color: #dce6f2 !important; }
      ${s} .list_contents .nick, ${s} .list_contents .cBox-info .nick a { color: rgba(180,200,230,0.7) !important; }
      ${s} .list_contents .view, ${s} .list_contents .date,
      ${s} .list_contents .cBox-info .info { color: rgba(160,180,210,0.5) !important; }
      ${s} .list_contents .thumb img, ${s} .list_contents .story_thumb img,
      ${s} .list_contents .thumbs-box img { border-radius: 8px !important; }
      ${s} .list_contents .tag_wrap {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        overflow: visible !important;
        display: flex !important;
        flex-wrap: wrap !important;
        justify-content: flex-start !important;
        align-items: center !important;
        gap: 4px !important;
      }

      /* tag_wrap 내 모든 자식(a, span) — 통일된 작은 칩 스타일 */
      ${s} .list_contents .tag_wrap > *,
      ${s} .tag_wrap > a,
      ${s} .tag_wrap > span {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-height: 0 !important;
        height: 24px !important;
        line-height: 24px !important;
        padding: 0 8px !important;
        box-sizing: border-box !important;
        vertical-align: middle !important;
        background: rgba(38, 58, 100, 0.80) !important;
        background-color: rgba(38, 58, 100, 0.80) !important;
        color: rgba(165, 200, 240, 0.92) !important;
        border: 1px solid rgba(85, 135, 205, 0.35) !important;
        border-radius: 999px !important;
        box-shadow: none !important;
        font-size: 11px !important;
        font-weight: 500 !important;
        text-decoration: none !important;
        margin: 0 !important;
        transition: background 0.18s, border-color 0.18s, color 0.18s !important;
      }

      /* 4번째 이후 자식 모두 숨기기 — 최대 3개만 표시 */
      ${s} .list_contents .tag_wrap > *:nth-child(n+4),
      ${s} .tag_wrap > a:nth-child(n+4),
      ${s} .tag_wrap > span:nth-child(n+4) {
        display: none !important;
      }

      /* 호버 */
      ${s} .list_contents .tag_wrap > *:hover,
      ${s} .tag_wrap > a:hover {
        background: rgba(55, 90, 150, 0.92) !important;
        background-color: rgba(55, 90, 150, 0.92) !important;
        border-color: rgba(110, 160, 230, 0.55) !important;
        color: #dbeafe !important;
      }
      ${s} .list_contents .cBox-list > ul > li { border-color: rgba(80, 120, 180, 0.08) !important; }
      ${s} #curation-hotissute-list, ${s} .cBox-list { background: ${bg} !important; }
      ${s} .list_contents .list_title { color: rgba(180, 200, 230, 0.6) !important; }

      /* chatting_area max-height 제거 — SOOP이 637px로 제한하는 것 해제 */
      ${s} #chatting_area {
        max-height: none !important;
        flex: 1 !important;
      }

      /* 채팅 패널 상단 경계선 정리 — 겹치는 border/outline 제거 */
      ${s} {
        border: none !important;
        outline: none !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(100, 140, 255, 0.1) !important;
        border-radius: 16px !important;
      }
      ${s} .chatting_box {
        border: none !important;
        outline: none !important;
      }
      ${s} #chatting_area {
        border: none !important;
        outline: none !important;
      }
      ${s} #chatbox {
        border: none !important;
        outline: none !important;
      }
      ${s} .area_header,
      ${s} .chat_title {
        border-top: none !important;
        outline: none !important;
      }

      /* 스크롤바 — 채팅, 리스트, 참여인원 전부 통일 */
      ${s} #userList::-webkit-scrollbar,
      ${s} #chat_area::-webkit-scrollbar,
      ${s} .chatting-item-wrap::-webkit-scrollbar,
      ${s} #list-container::-webkit-scrollbar,
      ${s} .list_contents::-webkit-scrollbar {
        width: 8px !important; display: block !important;
      }
      ${s} #userList::-webkit-scrollbar-track,
      ${s} #chat_area::-webkit-scrollbar-track,
      ${s} .chatting-item-wrap::-webkit-scrollbar-track,
      ${s} #list-container::-webkit-scrollbar-track,
      ${s} .list_contents::-webkit-scrollbar-track {
        background: rgba(255,255,255,0.05) !important;
      }
      ${s} #userList::-webkit-scrollbar-thumb,
      ${s} #chat_area::-webkit-scrollbar-thumb,
      ${s} .chatting-item-wrap::-webkit-scrollbar-thumb,
      ${s} #list-container::-webkit-scrollbar-thumb,
      ${s} .list_contents::-webkit-scrollbar-thumb {
        background: rgba(100, 140, 255, 0.35) !important; border-radius: 4px !important;
      }
      ${s} #userList::-webkit-scrollbar-thumb:hover,
      ${s} #chat_area::-webkit-scrollbar-thumb:hover,
      ${s} .chatting-item-wrap::-webkit-scrollbar-thumb:hover,
      ${s} #list-container::-webkit-scrollbar-thumb:hover,
      ${s} .list_contents::-webkit-scrollbar-thumb:hover {
        background: rgba(100, 140, 255, 0.55) !important;
      }
      ${s} #userList,
      ${s} #chat_area,
      ${s} .chatting-item-wrap,
      ${s} #list-container,
      ${s} .list_contents {
        scrollbar-width: thin !important;
        scrollbar-color: rgba(100, 140, 255, 0.35) transparent !important;
      }

      /* chat_layer 참여인원 more 버튼 — 텍스트만 숨기기 */
      ${s} .chat_layer button.more {
        font-size: 0 !important;
        background: rgba(100, 140, 255, 0.12) !important;
        border: 1px solid rgba(100, 140, 255, 0.2) !important;
        border-radius: 6px !important;
        padding: 6px 16px !important;
        margin: 8px 16px !important;
        cursor: pointer !important;
        flex-shrink: 0 !important;
      }
      ${s} .chat_layer button.more:hover {
        background: rgba(100, 140, 255, 0.25) !important;
      }

      /* chat_layer(참여인원/설정) 헤더 강제 축소 */
      ${s} .chat_layer .area_header { max-height: 50px !important; overflow: hidden !important; flex-shrink: 0 !important; }
      ${s} .chat_layer .area_header h2 { max-height: 36px !important; height: auto !important; min-height: 0 !important; }
    `;
    document.head.appendChild(style);

    // SOOP 스크립트가 .chat_title에 인라인 스타일을 동적으로 주입하는 것을 감시/복원
    this._watchHeaderStyles(chatEl);
  },

  /**
   * .chat_title, .area_header의 인라인 style 변경을 MutationObserver로 감시하여
   * 배경색을 강제로 다크 테마로 유지
   */
  _watchHeaderStyles(chatEl) {
    this._unwatchHeaderStyles();

    const bgHeader = getComputedStyle(document.documentElement)
      .getPropertyValue('--srm-bg-header').trim() || '#1a1a2e';

    const forceBackground = (el) => {
      if (!el) return;
      el.style.setProperty('background', bgHeader, 'important');
      el.style.setProperty('background-color', bgHeader, 'important');
      el.style.setProperty('background-image', 'none', 'important');
    };

    const targets = chatEl.querySelectorAll('.chat_title, .area_header');
    // 즉시 한번 적용
    targets.forEach(forceBackground);

    this._headerObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'style') {
          forceBackground(m.target);
        }
      }
    });

    targets.forEach((el) => {
      this._headerObserver.observe(el, {
        attributes: true,
        attributeFilter: ['style'],
      });
    });
  },

  _unwatchHeaderStyles() {
    if (this._headerObserver) {
      this._headerObserver.disconnect();
      this._headerObserver = null;
    }
  },

  _removeDarkOverrideStyle() {
    this._unwatchHeaderStyles();
    document.getElementById('srm-dark-override')?.remove();
  },
};
