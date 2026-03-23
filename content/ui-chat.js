/**
 * Stream Radio Mode — 채팅/플로팅 레이어 제어
 */

window._srmChat = {
  _chatVisible: false,
  _chatLayoutObserver: null,
  _chatLayoutFrame: 0,
  _chatResizeHandler: null,
  _chatScrollContainer: null,
  _chatScrollHandler: null,
  _chatScrollLocked: false,
  _chatScrollAnchorEl: null,
  _chatScrollAnchorOffset: 0,
  _chatScrollTop: 0,
  _chatScrollDistanceFromBottom: 0,
  _chatScrollSuppressEvent: false,
  _closeBtnHandler: null,
  _floatingTriggerHandler: null,
  _floatingSyncTimers: [],

  _setChatState(visible) {
    this._chatVisible = Boolean(visible);
    return this._chatVisible;
  },

  _toggleChatState() {
    this._chatVisible = !this._chatVisible;
    return this._chatVisible;
  },

  _setChatShellHidden(chatEl, hidden) {
    if (!chatEl) return;
    chatEl.classList.toggle('srm-chat-shell-hidden', Boolean(hidden));
  },

  _setChatVisible(visible) {
    const chatEl = document.querySelector('.wrapping.side')
      || document.querySelector('#chatting_area');
    if (!chatEl) {
      this._stopChatLayoutObserver();
      this._stopChatScrollController();
      return;
    }

    if (visible) {
      const srmList = window._srmList;
      const srmDarkTheme = window._srmDarkTheme;
      const chattingBox = chatEl.querySelector('section.box.chatting_box')
        || chatEl.querySelector('.chatting_box');

      this._setChatShellHidden(chatEl, false);

      if (srmList) {
        srmList._listVisible = true;
        srmList._triggerSoopListInit(chatEl);
      }

      chattingBox?.style.removeProperty('display');

      chatEl.classList.add('srm-chat-embedded');

      // SOOP이 모든 레벨에 인라인 height를 설정하므로 전부 강제 오버라이드
      chatEl.style.setProperty('height', '100vh', 'important');
      chatEl.style.setProperty('top', '0', 'important');
      if (chattingBox) chattingBox.style.setProperty('height', '100%', 'important');
      const chattingArea = chatEl.querySelector('#chatting_area');
      if (chattingArea) chattingArea.style.setProperty('height', '100%', 'important');
      const chatbox = chatEl.querySelector('#chatbox');
      if (chatbox) chatbox.style.setProperty('height', '100%', 'important');

      srmDarkTheme?._neutralizeAncestorTransforms(chatEl);
      srmDarkTheme?._injectDarkOverrideStyle(chatEl);

      this._interceptCloseBtn(chatEl);
      this._bindFloatingTriggers(chatEl);
      srmList?._setupListPanel(chatEl);
      this._startChatLayoutObserver(chatEl);
      this._syncChatScrollController(chatEl);
      this._scheduleChatLayoutSync(chatEl);
    } else {
      this._stopChatLayoutObserver();
      this._stopChatScrollController();
      this._releaseFloatingLayers(chatEl);
      this._setChatShellHidden(chatEl, false);

      window._srmList?._teardownListPanel(chatEl);
      this._restoreCloseBtn(chatEl);
      this._unbindFloatingTriggers(chatEl);
      const chattingBox = chatEl.querySelector('section.box.chatting_box')
        || chatEl.querySelector('.chatting_box');
      chattingBox?.style.removeProperty('display');
      // 인라인 height 복원
      chatEl.style.removeProperty('height');
      chatEl.style.removeProperty('top');
      const cboxRestore = chatEl.querySelector('section.box.chatting_box') || chatEl.querySelector('.chatting_box');
      if (cboxRestore) cboxRestore.style.removeProperty('height');
      const chattingArea = chatEl.querySelector('#chatting_area');
      if (chattingArea) chattingArea.style.removeProperty('height');
      const chatbox = chatEl.querySelector('#chatbox');
      if (chatbox) chatbox.style.removeProperty('height');

      chatEl.classList.remove('srm-chat-embedded');
      window._srmDarkTheme?._removeDarkOverrideStyle();
      window._srmDarkTheme?._restoreAncestorTransforms();
    }
  },

  _startChatLayoutObserver(chatEl) {
    this._stopChatLayoutObserver();

    this._chatResizeHandler = () => this._scheduleChatLayoutSync(chatEl);
    window.addEventListener('resize', this._chatResizeHandler);

    this._chatLayoutObserver = new MutationObserver(() => {
      // SPA 네비게이션으로 chatEl이 DOM에서 분리되면 즉시 정지
      if (!chatEl.isConnected) {
        this._stopChatLayoutObserver();
        this._stopChatScrollController();
        this._releaseFloatingLayers(chatEl);
        return;
      }
      this._scheduleChatLayoutSync(chatEl);
    });

    this._chatLayoutObserver.observe(chatEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
  },

  _stopChatLayoutObserver() {
    if (this._chatLayoutObserver) {
      this._chatLayoutObserver.disconnect();
      this._chatLayoutObserver = null;
    }

    if (this._chatResizeHandler) {
      window.removeEventListener('resize', this._chatResizeHandler);
      this._chatResizeHandler = null;
    }

    if (this._chatLayoutFrame) {
      cancelAnimationFrame(this._chatLayoutFrame);
      this._chatLayoutFrame = 0;
    }

    this._clearFloatingSyncTimers();
  },

  _scheduleChatLayoutSync(chatEl) {
    if (!chatEl || !this._chatVisible || this._chatLayoutFrame) return;
    // SPA 네비게이션 가드
    if (!chatEl.isConnected) {
      this._stopChatLayoutObserver();
      this._stopChatScrollController();
      return;
    }

    this._chatLayoutFrame = requestAnimationFrame(() => {
      this._chatLayoutFrame = 0;
      // rAF 실행 시점에도 재확인
      if (!chatEl.isConnected) {
        this._stopChatLayoutObserver();
        this._stopChatScrollController();
        return;
      }

      // SOOP이 인라인 height를 덮어쓰면 전체 체인 강제 복원
      if (chatEl.classList.contains('srm-chat-embedded')) {
        chatEl.style.setProperty('height', '100vh', 'important');
        const cbox = chatEl.querySelector('section.box.chatting_box') || chatEl.querySelector('.chatting_box');
        if (cbox) cbox.style.setProperty('height', '100%', 'important');
        const ca = chatEl.querySelector('#chatting_area');
        if (ca) ca.style.setProperty('height', '100%', 'important');
        const cb = chatEl.querySelector('#chatbox');
        if (cb) cb.style.setProperty('height', '100%', 'important');
      }

      this._syncFloatingLayers(chatEl);
      window._srmList?._syncListPanel(chatEl);
    });
  },

  _scheduleFloatingResync(chatEl) {
    if (!chatEl || !this._chatVisible) {
      return;
    }

    this._clearFloatingSyncTimers();
    this._scheduleChatLayoutSync(chatEl);

    [40, 140, 280].forEach((delay) => {
      const timer = window.setTimeout(() => {
        this._floatingSyncTimers = this._floatingSyncTimers.filter((id) => id !== timer);
        this._scheduleChatLayoutSync(chatEl);
      }, delay);
      this._floatingSyncTimers.push(timer);
    });
  },

  _clearFloatingSyncTimers() {
    this._floatingSyncTimers.forEach((timer) => window.clearTimeout(timer));
    this._floatingSyncTimers = [];
  },

  _syncChatScrollController(chatEl) {
    const container = this._findChatScrollContainer(chatEl);
    if (container === this._chatScrollContainer) {
      return;
    }

    this._stopChatScrollController();
    if (!container) {
      return;
    }

    this._chatScrollContainer = container;
    this._chatScrollHandler = () => {
      if (this._chatScrollSuppressEvent) {
        return;
      }
      this._updateChatScrollState(container, true);
    };

    container.addEventListener('scroll', this._chatScrollHandler, { passive: true });
    this._updateChatScrollState(container, true);
  },

  _stopChatScrollController() {
    if (this._chatScrollContainer && this._chatScrollHandler) {
      this._chatScrollContainer.removeEventListener('scroll', this._chatScrollHandler);
    }

    this._chatScrollContainer = null;
    this._chatScrollHandler = null;
    this._chatScrollLocked = false;
    this._chatScrollAnchorEl = null;
    this._chatScrollAnchorOffset = 0;
    this._chatScrollTop = 0;
    this._chatScrollDistanceFromBottom = 0;
    this._chatScrollSuppressEvent = false;
  },

  _findChatScrollContainer(chatEl) {
    if (!chatEl) {
      return null;
    }

    const candidates = [
      chatEl.querySelector('#chat_area'),
      chatEl.querySelector('.chatting-item-wrap > .chatting-viewer'),
      chatEl.querySelector('.chatting-viewer'),
      chatEl.querySelector('.chatting-item-wrap'),
    ].filter(Boolean);

    return candidates.find((el) => {
      const style = window.getComputedStyle(el);
      const scrollable = /(auto|scroll)/i.test(style.overflowY)
        || el.scrollHeight > el.clientHeight + 4
        || el.id === 'chat_area';
      return this._isVisibleLayer(el) && scrollable;
    }) || null;
  },

  _maintainChatScrollPosition() {
    const container = this._chatScrollContainer;
    if (!container || !this._chatVisible) {
      return;
    }

    if (this._chatScrollLocked) {
      let nextScrollTop = this._chatScrollTop;
      const anchorEl = this._chatScrollAnchorEl;

      if (anchorEl && anchorEl.isConnected && container.contains(anchorEl)) {
        const containerRect = container.getBoundingClientRect();
        const currentOffset = anchorEl.getBoundingClientRect().top - containerRect.top;
        nextScrollTop = container.scrollTop + (currentOffset - this._chatScrollAnchorOffset);
      }

      this._setChatScrollTop(container, nextScrollTop);
      this._updateChatScrollState(container, true);
      return;
    }

    this._setChatScrollTop(container, container.scrollHeight);
    this._updateChatScrollState(container, false);
  },

  _updateChatScrollState(container, refreshAnchor = false) {
    if (!container) {
      return;
    }

    const distanceFromBottom = Math.max(
      0,
      container.scrollHeight - container.clientHeight - container.scrollTop
    );
    const locked = distanceFromBottom > 24;

    this._chatScrollTop = container.scrollTop;
    this._chatScrollDistanceFromBottom = distanceFromBottom;
    this._chatScrollLocked = locked;

    if (locked || refreshAnchor) {
      const anchor = this._captureChatScrollAnchor(container);
      if (anchor) {
        this._chatScrollAnchorEl = anchor.element;
        this._chatScrollAnchorOffset = anchor.offset;
      }
    } else {
      this._chatScrollAnchorEl = null;
      this._chatScrollAnchorOffset = 0;
    }
  },

  _captureChatScrollAnchor(container) {
    const children = Array.from(container.children).filter((child) => child.nodeType === Node.ELEMENT_NODE);
    if (!children.length) {
      return null;
    }

    const containerRect = container.getBoundingClientRect();
    const topThreshold = containerRect.top + 8;
    const element = children.find((child) => {
      const rect = child.getBoundingClientRect();
      return rect.height > 0 && rect.bottom > topThreshold;
    }) || children[0];

    return {
      element,
      offset: element.getBoundingClientRect().top - containerRect.top,
    };
  },

  _setChatScrollTop(container, value) {
    if (!container) {
      return;
    }

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const nextScrollTop = Math.min(maxScrollTop, Math.max(0, Math.round(value)));
    if (Math.abs(container.scrollTop - nextScrollTop) < 1) {
      return;
    }

    this._chatScrollSuppressEvent = true;
    container.scrollTop = nextScrollTop;
    requestAnimationFrame(() => {
      this._chatScrollSuppressEvent = false;
    });
  },

  _syncFloatingLayers(chatEl) {
    const panelRect = chatEl.getBoundingClientRect();
    if (!panelRect.width || !panelRect.height) return;

    const layerHost = chatEl.querySelector('#chatting_area') || chatEl;
    const popupSelectors = [
      ':scope > #list_viewer',
      ':scope > .chat_layer',
      ':scope > [class*="chat_layer"]',
      ':scope > [class*="list_participant"]',
      ':scope > [class*="list_viewer"]',
      ':scope > [class*="chatting_management"]',
      ':scope > #iceSetting',
      ':scope > #iceSettingSub',
    ].join(', ');

    let visibleLayers = [];
    try {
      visibleLayers = Array.from(layerHost.querySelectorAll(popupSelectors));
    } catch (_err) {
      visibleLayers = Array.from(layerHost.querySelectorAll(
        '#list_viewer, .chat_layer, [class*="chat_layer"], [class*="list_participant"], [class*="list_viewer"], [class*="chatting_management"], #iceSetting, #iceSettingSub'
      )).filter((layer) => layer.parentElement === layerHost);
    }

    visibleLayers = visibleLayers.filter((layer) => this._isVisibleLayer(layer));

    visibleLayers.forEach((layer) => {
      const rect = layer.getBoundingClientRect();
      const isParticipantLayer = /(list_participant|list_viewer|participant|viewer)/i.test(
        `${layer.className || ''} ${layer.id || ''}`
      );
      const shouldFloat = isParticipantLayer
        || rect.width > panelRect.width - 24
        || rect.right > panelRect.right - 8
        || rect.bottom > panelRect.bottom - 8
        || rect.left < panelRect.left + 8;

      if (shouldFloat) {
        this._positionFloatingLayer(layer, panelRect, rect);
      } else {
        this._resetFloatingLayer(layer);
      }
    });

    Array.from(document.querySelectorAll('.srm-chat-floating-layer')).forEach((layer) => {
      if (!chatEl.contains(layer) || !this._isVisibleLayer(layer)) {
        this._resetFloatingLayer(layer);
      }
    });
  },

  _positionFloatingLayer(layer, panelRect, rect) {
    const margin = 16;
    const headerHeight = 56;
    const isParticipantLayer = /(list_participant|list_viewer|participant|viewer)/i.test(
      `${layer.className || ''} ${layer.id || ''}`
    );
    const maxViewportWidth = Math.max(280, window.innerWidth - (margin * 2));
    const availableLeftWidth = Math.max(280, panelRect.left - (margin * 2));
    const minWidth = isParticipantLayer ? 320 : 280;
    const participantWidth = Math.min(
      Math.max(minWidth, 320),
      maxViewportWidth
    );
    const preferredWidth = isParticipantLayer
      ? participantWidth
      : Math.max(rect.width || layer.scrollWidth || 0, 360);
    const width = isParticipantLayer
      ? participantWidth
      : Math.min(
        preferredWidth,
        Math.min(maxViewportWidth, Math.max(availableLeftWidth, minWidth))
      );
    const viewportLimit = window.innerHeight - (margin * 2);
    const participantHeightLimit = Math.min(
      viewportLimit,
      Math.max(420, Math.round(window.innerHeight * 0.72))
    );
    const preferredHeight = isParticipantLayer
      ? Math.max(
        360,
        Math.min(layer.scrollHeight || 0, participantHeightLimit)
      )
      : Math.max(rect.height || layer.scrollHeight || 0, 240);
    const heightLimit = isParticipantLayer
      ? participantHeightLimit
      : viewportLimit;
    const height = Math.min(preferredHeight, heightLimit);
    const preferredLeft = panelRect.left - width - margin;
    const preferredRight = panelRect.right + margin;
    const fallbackInsideLeft = Math.max(
      margin,
      Math.min(
        panelRect.right - width - 12,
        window.innerWidth - width - margin
      )
    );
    const fallbackRight = Math.max(
      margin,
      Math.min(preferredRight, window.innerWidth - width - margin)
    );
    const left = isParticipantLayer
      ? (
          preferredLeft >= margin
            ? preferredLeft
            : (
                fallbackRight + width <= window.innerWidth - margin
                  ? fallbackRight
                  : fallbackInsideLeft
              )
        )
      : Math.max(
        margin,
        Math.min(preferredLeft, window.innerWidth - width - margin)
      );
    const preferredTop = isParticipantLayer
      ? panelRect.top + headerHeight + 8
      : (rect.top || margin);
    const top = Math.min(
      Math.max(preferredTop, margin),
      Math.max(margin, window.innerHeight - height - margin)
    );

    layer.classList.add('srm-chat-floating-layer');
    layer.style.setProperty('--srm-layer-left', `${Math.round(left)}px`);
    layer.style.setProperty('--srm-layer-top', `${Math.round(top)}px`);
    layer.style.setProperty('--srm-layer-width', `${Math.round(width)}px`);
    layer.style.setProperty('--srm-layer-height', `${Math.round(height)}px`);
    layer.style.setProperty('--srm-layer-max-height', `${Math.round(height)}px`);
  },

  _resetFloatingLayer(layer) {
    layer.classList.remove('srm-chat-floating-layer');
    layer.style.removeProperty('--srm-layer-left');
    layer.style.removeProperty('--srm-layer-top');
    layer.style.removeProperty('--srm-layer-width');
    layer.style.removeProperty('--srm-layer-height');
    layer.style.removeProperty('--srm-layer-max-height');
  },

  _releaseFloatingLayers(chatEl) {
    const floatingLayers = [
      ...chatEl.querySelectorAll('.srm-chat-floating-layer'),
      ...document.querySelectorAll('.srm-chat-floating-layer'),
    ];

    floatingLayers.forEach((layer) => this._resetFloatingLayer(layer));
  },

  _isVisibleLayer(layer) {
    if (!layer) return false;

    const style = window.getComputedStyle(layer);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = layer.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  },

  _bindFloatingTriggers(chatEl) {
    if (!chatEl || this._floatingTriggerHandler) {
      return;
    }

    this._floatingTriggerHandler = (event) => {
      const trigger = event.target?.closest?.(
        '#setbox_viewer > a, #setbox_set > a, #list_viewer .refresh > a, #list_viewer .close > a, #list_viewer > .more'
      );

      if (!trigger || !chatEl.contains(trigger)) {
        return;
      }

      this._scheduleFloatingResync(chatEl);
    };

    chatEl.addEventListener('click', this._floatingTriggerHandler, true);
  },

  _unbindFloatingTriggers(chatEl) {
    if (chatEl && this._floatingTriggerHandler) {
      chatEl.removeEventListener('click', this._floatingTriggerHandler, true);
    }

    this._floatingTriggerHandler = null;
    this._clearFloatingSyncTimers();
  },

  _interceptCloseBtn(chatEl) {
    const closeBtn = chatEl.querySelector('.chat_title a.tip-right')
      || chatEl.querySelector('a[class*="tip-right"]');
    if (!closeBtn) return;

    this._restoreCloseBtn(chatEl);

    this._closeBtnHandler = (e) => {
      e.stopImmediatePropagation();
      e.preventDefault();

      const chatToggle = window.RadioOverlayUI?._overlayEl?.querySelector('[data-action="chat-toggle"]');
      if (chatToggle) chatToggle.style.color = '';
      this._setChatState(false);

      const listDocked = chatEl.classList.contains('srm-list-open')
        && !!chatEl.querySelector('.srm-list-docked[data-srm-list-root="1"]');

      if (listDocked) {
        this._stopChatLayoutObserver();
        this._stopChatScrollController();
        this._releaseFloatingLayers(chatEl);
        const chattingBox = chatEl.querySelector('section.box.chatting_box')
          || chatEl.querySelector('.chatting_box');
        chattingBox?.style.removeProperty('display');
        this._setChatShellHidden(chatEl, true);
        return;
      }

      this._setChatVisible(false);
    };

    closeBtn.addEventListener('click', this._closeBtnHandler, true);
  },

  _restoreCloseBtn(chatEl) {
    if (!this._closeBtnHandler) return;
    const closeBtn = chatEl.querySelector('.chat_title a.tip-right')
      || chatEl.querySelector('a[class*="tip-right"]');
    if (closeBtn) {
      closeBtn.removeEventListener('click', this._closeBtnHandler, true);
    }
    this._closeBtnHandler = null;
  },
};
