/**
 * Stream Radio Mode — 오버레이 액션 상태 동기화
 */

window._srmActions = {
  _actionObserver: null,
  _actionSyncFrame: 0,
  _pendingActions: new Map(),
  _pendingActionTimers: new Map(),

  _startActionStateSync(overlay) {
    this._stopActionStateSync();
    if (!overlay || !document.body) return;

    this._syncActionState(overlay);

    this._actionObserver = new MutationObserver(() => {
      this._scheduleActionStateSync(overlay);
    });

    this._actionObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-pressed', 'aria-selected'],
    });
  },

  _stopActionStateSync() {
    if (this._actionObserver) {
      this._actionObserver.disconnect();
      this._actionObserver = null;
    }

    if (this._actionSyncFrame) {
      cancelAnimationFrame(this._actionSyncFrame);
      this._actionSyncFrame = 0;
    }

    this._pendingActionTimers.forEach((timerId) => clearTimeout(timerId));
    this._pendingActionTimers.clear();
    this._pendingActions.clear();

    const overlayEl = window.RadioOverlayUI?._overlayEl;
    if (overlayEl) {
      overlayEl.querySelectorAll('.srm-action-btn.srm-pending').forEach((btn) => {
        btn.classList.remove('srm-pending');
        btn.removeAttribute('aria-busy');
      });
    }
  },

  _scheduleActionStateSync(overlay) {
    if (!overlay || this._actionSyncFrame) return;

    this._actionSyncFrame = requestAnimationFrame(() => {
      this._actionSyncFrame = 0;
      this._syncActionState(overlay);
    });
  },

  _syncActionState(overlay) {
    if (!overlay) return;

    const snapshot = this._getActionSnapshot();
    this._updateActionCounts(overlay, snapshot);
    this._updateFavIcon(overlay, snapshot);
    this._resolvePendingActions(snapshot, overlay);
  },

  _triggerAction(action, overlay, trigger) {
    const actionBtn = overlay?.querySelector(`[data-action="${action}"]`);
    if (!actionBtn) return;

    const snapshot = this._getActionSnapshot();
    this._pendingActions.set(action, {
      before: snapshot[action],
      startedAt: Date.now(),
    });

    actionBtn.classList.add('srm-pending');
    actionBtn.setAttribute('aria-busy', 'true');

    const existingTimer = this._pendingActionTimers.get(action);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this._pendingActionTimers.set(action, setTimeout(() => {
      this._pendingActionTimers.delete(action);
      this._clearPendingAction(action, overlay);
      this._syncActionState(overlay);
    }, 3000));

    trigger();
    this._scheduleActionStateSync(overlay);
  },

  _resolvePendingActions(snapshot, overlay) {
    this._pendingActions.forEach((pending, action) => {
      const current = snapshot[action];
      if (!current) return;

      const changed = JSON.stringify(current) !== JSON.stringify(pending.before);
      const expired = Date.now() - pending.startedAt > 3000;
      if (changed || expired) {
        this._clearPendingAction(action, overlay);
      }
    });
  },

  _clearPendingAction(action, overlay) {
    this._pendingActions.delete(action);

    const timerId = this._pendingActionTimers.get(action);
    if (timerId) {
      clearTimeout(timerId);
      this._pendingActionTimers.delete(action);
    }

    const actionBtn = overlay?.querySelector(`[data-action="${action}"]`);
    if (actionBtn) {
      actionBtn.classList.remove('srm-pending');
      actionBtn.removeAttribute('aria-busy');
    }
  },

  _getActionSnapshot() {
    const favBtn = this._findFavoriteButton();
    const likeBtn = this._findLikeButton();

    return {
      favorite: {
        active: Boolean(favBtn?.classList.contains('on')),
        count: favBtn?.querySelector('span')?.textContent?.trim() || '',
      },
      like: {
        active: Boolean(likeBtn && /(on|active|up|selected)/i.test(likeBtn.className)),
        count: likeBtn?.querySelector('span')?.textContent?.trim() || '',
      },
    };
  },

  _findFavoriteButton() {
    return document.querySelector('button#bookMark, button.bookMark');
  },

  _findLikeButton() {
    return document.querySelector('button#like, button.like');
  },

  _updateActionCounts(overlay, snapshot = this._getActionSnapshot()) {
    if (!overlay) return;

    const likeCountEl = overlay.querySelector('#srm-like-count');
    if (likeCountEl) {
      likeCountEl.textContent = snapshot.like?.count || '';
    }

    const favCountEl = overlay.querySelector('#srm-fav-count');
    if (favCountEl) {
      favCountEl.textContent = snapshot.favorite?.count || '';
    }
  },

  _updateFavIcon(overlay, snapshot = this._getActionSnapshot()) {
    if (!overlay) return;

    const iconEl = overlay.querySelector('#srm-fav-icon');
    if (iconEl) {
      const isOn = Boolean(snapshot.favorite?.active);
      iconEl.textContent = isOn ? '⭐' : '☆';
      iconEl.style.fontSize = '16px';
      if (isOn) {
        iconEl.style.color = '#facc15';
      } else {
        iconEl.style.color = 'rgba(255,255,255,0.6)';
      }
    }
  },
};
