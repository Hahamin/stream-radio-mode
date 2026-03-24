/**
 * Stream Radio Mode — 리스트 패널 제어
 */

window._srmList = {
  _listVisible: true,
  _listTabHandler: null,
  _listCloseBtnHandler: null,
  _boundListArea: null,
  _navInterceptHandler: null,
  _filterHandlers: [],
  _listPanelShown: false,

  _triggerSoopListInit(chatEl) {
    if (chatEl.dataset.srmSoopListInit === '1') return;
    chatEl.dataset.srmSoopListInit = '1';

    const tabs = chatEl.querySelectorAll('.section_selectTab button, .section_selectTab a');
    let listTab = null;
    let chatTab = null;
    for (const tab of tabs) {
      const text = tab.textContent.trim();
      if (text.includes('리스트')) listTab = tab;
      if (text.includes('채팅')) chatTab = tab;
    }

    if (listTab) listTab.click();
    if (chatTab) {
      window.setTimeout(() => chatTab.click(), 50);
    }
  },

  _setupListPanel(chatEl) {
    const { listArea, listRoot, listTab } = this._findChatLayoutParts(chatEl);
    if (!listArea && !listRoot) return;

    this._listPanelShown = false;

    if (this._listVisible) {
      this._showListPanel(chatEl);
      window.setTimeout(() => this._showListPanel(chatEl), 300);
      window.setTimeout(() => this._showListPanel(chatEl), 800);
    }

    if (listTab && !this._listTabHandler) {
      this._listTabHandler = () => {
        this._listVisible = true;
        this._listPanelShown = false;
        requestAnimationFrame(() => this._showListPanel(chatEl));
      };
      listTab.addEventListener('click', this._listTabHandler, true);
    }

    // filter_list 내부 필터 탭 (전체/VOD/Catch/추천방송) 핸들러
    this._bindFilterHandlers(chatEl);
  },

  /**
   * filter_list 내부 필터 탭에 이벤트 핸들러 바인딩
   * — 추천방송 등 비기본 필터 클릭 시 패널 sync 일시정지
   * — 전체 필터로 돌아오면 sync 재개
   */
  _bindFilterHandlers(chatEl) {
    this._unbindFilterHandlers();

    const listArea = chatEl.querySelector('#list_area');
    if (!listArea) return;

    const filterItems = listArea.querySelectorAll('.filter_list li[id]');
    for (const item of filterItems) {
      const btn = item.querySelector('button') || item;
      const handler = () => {
        // 어떤 필터든 클릭하면 패널 상태 재설정 → 다음 sync에서 반영
        this._listPanelShown = false;
      };
      btn.addEventListener('click', handler, true);
      this._filterHandlers.push({ el: btn, handler });
    }
  },

  _unbindFilterHandlers() {
    for (const { el, handler } of this._filterHandlers) {
      el.removeEventListener('click', handler, true);
    }
    this._filterHandlers = [];
  },

  _findChatLayoutParts(chatEl) {
    const tabs = Array.from(
      chatEl.querySelectorAll('.section_selectTab button, .section_selectTab a')
    );
    const normalized = (text) => (text || '').replace(/\s+/g, '');
    const listSection = chatEl.querySelector('section.box.list_box') || null;
    const listArea = listSection?.querySelector('#list_area')
      || chatEl.querySelector('#list_area')
      || null;
    const listRoot = listSection
      || listArea?.closest('section.box')
      || listArea
      || null;

    return {
      chatTab: tabs.find((tab) => normalized(tab.textContent).includes('채팅')) || null,
      listTab: tabs.find((tab) => normalized(tab.textContent).includes('리스트')) || null,
      listArea,
      listSection,
      listRoot,
      listBox: listRoot || null,
      listHeader: listRoot?.querySelector('.chat_title, .area_header')
        || listArea?.querySelector('.chat_title, .area_header')
        || chatEl.querySelector('.chat_title, .area_header')
        || null,
      tabBar: chatEl.querySelector('.section_selectTab') || null,
    };
  },

  _showListPanel(chatEl) {
    const { listArea, listRoot } = this._findChatLayoutParts(chatEl);
    const dockTarget = listRoot || listArea;
    if (!dockTarget) return;

    // Guard: DOM 변경이 필요한 경우만 수행 (불필요한 mutation 방지)
    if (!chatEl.classList.contains('srm-list-open')) {
      chatEl.classList.add('srm-list-open');
    }
    if (!dockTarget.classList.contains('srm-list-docked')) {
      dockTarget.classList.add('srm-list-docked');
    }
    if (dockTarget.getAttribute('data-srm-list-root') !== '1') {
      dockTarget.setAttribute('data-srm-list-root', '1');
    }
    // display: flex는 CSS가 처리 (.srm-list-open .srm-list-docked[data-srm-list-root="1"])
    // 인라인 style 설정은 mutation 유발하므로 초기 설정 시에만 사용
    if (!this._listPanelShown) {
      dockTarget.style.setProperty('display', 'flex');
      if (listArea && dockTarget !== listArea) {
        listArea.style.setProperty('display', 'flex');
      }
    }

    this._listPanelShown = true;
    this._bindListCloseButton(listArea || dockTarget, chatEl);
    this._bindNavIntercept();
  },

  /**
   * 페이지 전체에서 네비게이션 링크 클릭 시 모든 옵저버를 즉시 정지
   * — window capture로 SOOP 핸들러보다 먼저 실행
   * — SPA 전환 중 MutationObserver 폭주로 인한 프리즈 방지
   */
  _bindNavIntercept() {
    if (this._navInterceptHandler) return;

    this._navInterceptHandler = (e) => {
      // 라디오 모드가 아니면 무시
      if (!window.__radioModeCore?.active) return;

      const link = e.target.closest?.('a[href]');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      // javascript: 링크나 # 앵커는 무시
      if (href.startsWith('javascript:') || href === '#' || href === '#n') return;
      // 같은 페이지 내 앵커는 무시
      if (href.startsWith('#')) return;

      // 리스트 패널 내부 링크인 경우만 네비게이션 처리
      // (추천방송 카드 클릭 등)
      const listPanel = document.querySelector('.srm-list-docked[data-srm-list-root="1"]');
      const isInsideListPanel = listPanel && listPanel.contains(link);
      const isInsideChatPanel = document.querySelector('.srm-chat-embedded')?.contains(link);

      if (!isInsideListPanel && !isInsideChatPanel) return;

      // 네비게이션 링크 → 모든 옵저버 즉시 정지 (mutation 폭주 방지)
      window._srmChat?._stopChatLayoutObserver();
      window._srmChat?._stopChatScrollController();
      window._srmActions?._stopActionStateSync();
      window._srmDarkTheme?._unwatchHeaderStyles?.();

      this._listPanelShown = false;

      // 패널 숨김은 다음 프레임으로 지연
      // — SOOP의 SPA 핸들러(bubble)가 먼저 클릭을 처리하도록 보장
      requestAnimationFrame(() => {
        const chatEl = document.querySelector('.srm-chat-embedded');
        if (chatEl) {
          const lp = chatEl.querySelector('.srm-list-docked[data-srm-list-root="1"]');
          if (lp) {
            lp.style.setProperty('display', 'none', 'important');
          }
          chatEl.style.setProperty('display', 'none', 'important');
        }
        window._srmDarkTheme?._removeDarkOverrideStyle();
        window._srmDarkTheme?._restoreAncestorTransforms();
      });
    };

    // window capture = 이벤트 전파 최상단 → SOOP 핸들러보다 먼저 실행
    window.addEventListener('click', this._navInterceptHandler, true);
  },

  _unbindNavIntercept() {
    if (this._navInterceptHandler) {
      window.removeEventListener('click', this._navInterceptHandler, true);
    }
    this._navInterceptHandler = null;
  },

  _hideListPanel(chatEl, options = {}) {
    const { restore = false } = options;
    const { listArea, listRoot } = this._findChatLayoutParts(chatEl);
    const dockTarget = listRoot || listArea;

    dockTarget?.classList.remove('srm-list-docked');
    dockTarget?.removeAttribute('data-srm-list-root');
    if (dockTarget && restore) {
      dockTarget.style.removeProperty('display');
    } else if (dockTarget) {
      dockTarget.style.setProperty('display', 'none');
    }
    if (listArea && dockTarget !== listArea && restore) {
      listArea.style.removeProperty('display');
    }
    chatEl?.classList.remove('srm-list-open');
    this._listPanelShown = false;
  },

  _syncListPanel(chatEl) {
    const { listArea, listRoot } = this._findChatLayoutParts(chatEl);
    if (!listArea && !listRoot) return;

    if (!this._listVisible) return;
    if (!window._srmChat?._chatVisible) return;

    // 이미 패널이 표시되어 있으면 매 프레임 재설정 불필요
    if (this._listPanelShown) return;

    this._showListPanel(chatEl);
  },

  _bindListCloseButton(listArea, chatEl) {
    if (!listArea) return;

    if (this._boundListArea && this._boundListArea !== listArea) {
      const oldCloseBtn = this._boundListArea.querySelector('.area_header .close a');
      if (this._listCloseBtnHandler) {
        oldCloseBtn?.removeEventListener('click', this._listCloseBtnHandler, true);
      }
    }

    const closeBtn = listArea.querySelector('.area_header .close a');
    if (!closeBtn) return;

    if (closeBtn && this._listCloseBtnHandler && this._boundListArea === listArea) {
      closeBtn.removeEventListener('click', this._listCloseBtnHandler, true);
    }

    this._listCloseBtnHandler = (e) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      this._listVisible = false;

      if (chatEl?.classList.contains('srm-chat-shell-hidden')) {
        window._srmChat?._setChatVisible(false);
        return;
      }

      this._hideListPanel(chatEl);
    };

    closeBtn?.addEventListener('click', this._listCloseBtnHandler, true);
    this._boundListArea = listArea;
  },

  _unbindListCloseButton() {
    if (!this._boundListArea) return;

    const closeBtn = this._boundListArea.querySelector('.area_header .close a');
    if (this._listCloseBtnHandler) {
      closeBtn?.removeEventListener('click', this._listCloseBtnHandler, true);
    }
    this._boundListArea = null;
    this._listCloseBtnHandler = null;
  },

  _getCurrentListFilter(listArea) {
    return listArea?.querySelector('.filter_list li.on[id], .filter_list li[aria-selected="true"][id]')?.id || 'all';
  },

  _refreshListSwiper(listArea, filterId = this._getCurrentListFilter(listArea)) {
    const swiperEl = listArea?.querySelector('#filter_list_wrap');
    const swiper = swiperEl?.swiper;
    if (!swiper) return;

    const slides = Array.from(listArea.querySelectorAll('.filter_list li[id]'));
    const activeIndex = slides.findIndex((slide) => slide.id === filterId);

    swiper.updateSize?.();
    swiper.updateSlides?.();
    swiper.updateProgress?.();
    swiper.update?.();

    if (activeIndex >= 0) {
      swiper.slideTo?.(activeIndex, 0, false);
    }
  },

  _teardownListPanel(chatEl) {
    this._hideListPanel(chatEl, { restore: true });
    // nav intercept는 여기서 제거하지 않음 — 라디오 모드 종료 시에만 제거
    this._unbindListCloseButton();
    this._unbindFilterHandlers();

    delete chatEl?.dataset?.srmSoopListInit;

    const { listTab } = this._findChatLayoutParts(chatEl);
    if (listTab && this._listTabHandler) {
      listTab.removeEventListener('click', this._listTabHandler, true);
    }

    this._listTabHandler = null;
    this._listPanelShown = false;
  },
};
