/**
 * Stream Radio Mode — 리스트 패널 제어
 */

window._srmList = {
  _listVisible: true,
  _listTabHandler: null,
  _listCloseBtnHandler: null,
  _listRefreshBtnHandler: null,
  _boundListArea: null,

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

    if (this._listVisible) {
      this._showListPanel(chatEl);
      window.setTimeout(() => this._showListPanel(chatEl), 300);
      window.setTimeout(() => this._showListPanel(chatEl), 800);
    }

    if (listTab && !this._listTabHandler) {
      this._listTabHandler = () => {
        this._listVisible = true;
        requestAnimationFrame(() => this._showListPanel(chatEl));
      };
      listTab.addEventListener('click', this._listTabHandler, true);
    }
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

    chatEl.classList.add('srm-list-open');
    dockTarget.classList.add('srm-list-docked');
    dockTarget.setAttribute('data-srm-list-root', '1');
    dockTarget.style.setProperty('display', 'flex');
    if (listArea && dockTarget !== listArea) {
      listArea.style.setProperty('display', 'flex');
    }
    this._bindListCloseButton(listArea || dockTarget, chatEl);
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
  },

  _syncListPanel(chatEl) {
    const { listArea, listRoot } = this._findChatLayoutParts(chatEl);
    if (!listArea && !listRoot) return;

    if (window._srmChat?._chatVisible && this._listVisible) {
      this._showListPanel(chatEl);
    }
  },

  _bindListCloseButton(listArea, chatEl) {
    if (!listArea) return;

    if (this._boundListArea && this._boundListArea !== listArea) {
      const oldCloseBtn = this._boundListArea.querySelector('.area_header .close a');
      const oldRefreshBtn = this._boundListArea.querySelector('.area_header .refresh a');
      if (this._listCloseBtnHandler) {
        oldCloseBtn?.removeEventListener('click', this._listCloseBtnHandler, true);
      }
      if (this._listRefreshBtnHandler) {
        oldRefreshBtn?.removeEventListener('click', this._listRefreshBtnHandler, true);
      }
    }

    const closeBtn = listArea.querySelector('.area_header .close a');
    const refreshBtn = listArea.querySelector('.area_header .refresh a');
    if (!closeBtn && !refreshBtn) return;

    if (closeBtn && this._listCloseBtnHandler && this._boundListArea === listArea) {
      closeBtn.removeEventListener('click', this._listCloseBtnHandler, true);
    }
    if (refreshBtn && this._listRefreshBtnHandler && this._boundListArea === listArea) {
      refreshBtn.removeEventListener('click', this._listRefreshBtnHandler, true);
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

    this._listRefreshBtnHandler = (e) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      this._listVisible = true;
      this._triggerSoopListInit(chatEl);
      this._showListPanel(chatEl);
      window.setTimeout(() => this._showListPanel(chatEl), 120);
      window.setTimeout(() => this._showListPanel(chatEl), 360);
      window.setTimeout(() => this._showListPanel(chatEl), 820);
    };

    closeBtn?.addEventListener('click', this._listCloseBtnHandler, true);
    refreshBtn?.addEventListener('click', this._listRefreshBtnHandler, true);
    this._boundListArea = listArea;
  },

  _unbindListCloseButton() {
    if (!this._boundListArea) return;

    const closeBtn = this._boundListArea.querySelector('.area_header .close a');
    const refreshBtn = this._boundListArea.querySelector('.area_header .refresh a');
    if (this._listCloseBtnHandler) {
      closeBtn?.removeEventListener('click', this._listCloseBtnHandler, true);
    }
    if (this._listRefreshBtnHandler) {
      refreshBtn?.removeEventListener('click', this._listRefreshBtnHandler, true);
    }
    this._boundListArea = null;
    this._listCloseBtnHandler = null;
    this._listRefreshBtnHandler = null;
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
    this._unbindListCloseButton();

    delete chatEl?.dataset?.srmSoopListInit;

    const { listTab } = this._findChatLayoutParts(chatEl);
    if (listTab && this._listTabHandler) {
      listTab.removeEventListener('click', this._listTabHandler, true);
    }

    this._listTabHandler = null;
  },
};
