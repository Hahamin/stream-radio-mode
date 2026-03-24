/**
 * Stream Radio Mode — 숲(SOOP) 어댑터
 * sooplive.co.kr 라이브 스트리밍 전용
 *
 * 실제 DOM 구조 (2026-03 확인):
 *   #webplayer > #webplayer_contents
 *     .skin_object          ← 컨트롤 오버레이
 *     #player_area
 *       .htmlplayer_wrap    ← video 요소 포함
 *     .wrapping_player_bottom
 *       .broadcast_information
 *         #bjThumbnail      ← BJ 프로필 (a.thumb > img)
 *         .nickname         ← BJ 이름
 */

class SoopAdapter {
  constructor() {
    this.siteName = 'soop';
  }

  /**
   * 현재 페이지가 라이브 시청 페이지인지 판단
   */
  isLivePage() {
    const url = location.href;
    return url.includes('play.sooplive.co.kr/')
      && !url.endsWith('/live/all')
      && !url.endsWith('sooplive.co.kr/')
      && !url.includes('/directory/');
  }

  /**
   * 비디오 요소 찾기
   */
  findVideoElement() {
    const selectors = [
      '.htmlplayer_wrap video',
      '#player_area video',
      '#webplayer_contents video',
      '#webplayer video',
      'video',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  /**
   * 플레이어 컨테이너 요소
   */
  getPlayerContainer() {
    // #player_area = 비디오 영역만 (548px)
    // #webplayer_contents는 채팅(.wrapping.side) 포함하여 4000px+로 너무 큼
    const selectors = [
      '#player_area',
      '#webplayer_contents',
      '#webplayer',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // fallback
    const video = this.findVideoElement();
    if (video) {
      let parent = video.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        if (parent.offsetWidth > 300 && parent.offsetHeight > 200) return parent;
        parent = parent.parentElement;
      }
    }
    return null;
  }

  /**
   * 스트리머 정보 추출
   */
  async getStreamerInfo() {
    const info = { name: '', title: '', avatarUrl: '' };

    try {
      // BJ 프로필 이미지 — #bjThumbnail 내부의 img (가장 정확)
      const avatarSelectors = [
        '#bjThumbnail img',
        '.thumbnail_box img',
        '#bjThumbnail .thumb img',
      ];
      for (const sel of avatarSelectors) {
        const el = document.querySelector(sel);
        if (el?.src) {
          info.avatarUrl = el.src;
          break;
        }
      }

      // BJ 이름 + 방송 제목
      // 숲은 "BJ박성진 · 소통x성진 돌싱즈 BGM" 형태로 닉네임 영역에 합쳐져 있을 수 있음
      const nicknameEl = document.querySelector(
        '.broadcast_information .nickname'
      ) || document.querySelector('.wrapping_player_bottom .nickname')
        || document.querySelector('.nickname');

      console.log('[StreamRadio] nickname DOM:', nicknameEl?.textContent?.trim(), '| title:', document.title, '| URL:', location.pathname);
      if (nicknameEl?.textContent?.trim()) {
        const fullText = nicknameEl.textContent.trim();
        // "BJ이름 · 방송제목" 또는 "BJ이름 - 방송제목" 패턴 분리
        const separators = [' · ', ' - ', ' | '];
        let separated = false;
        for (const sep of separators) {
          const idx = fullText.indexOf(sep);
          if (idx > 0) {
            info.name = fullText.substring(0, idx).trim();
            info.title = fullText.substring(idx + sep.length).trim();
            separated = true;
            break;
          }
        }
        if (!separated) {
          // 분리자가 없으면 전체를 이름으로
          info.name = fullText;
        }
      }

      // 방송 제목 — #infoTitle (실제 DOM 확인)
      if (!info.title) {
        const titleSelectors = [
          '#infoTitle',
          '.broadcast_title #infoTitle',
          '.broadcast_title span',
          '.broadcast_information .column_sub',
        ];
        for (const sel of titleSelectors) {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim()) {
            info.title = el.textContent.trim();
            break;
          }
        }
      }

      // fallback: document.title에서 이름 추출 ("스트리머 - SOOP" 형식)
      if (!info.name) {
        const titleMatch = document.title.match(/^(.+?)\s*[-–]\s*SOOP/);
        if (titleMatch) {
          info.name = titleMatch[1].trim();
        }
      }

      // fallback: URL에서 BJ ID
      if (!info.name) {
        const match = location.pathname.match(/\/([^/]+)\/?$/);
        if (match) {
          info.name = decodeURIComponent(match[1]);
        }
      }
    } catch (e) {
      console.warn('[StreamRadio] 숲 스트리머 정보 추출 실패:', e);
    }

    return info;
  }

  /**
   * 플레이어 컨트롤바에 라디오 모드 토글 버튼 삽입
   */
  injectToggleButton(onToggle) {
    document.querySelector('.srm-toggle-btn')?.remove();

    const btn = document.createElement('button');
    btn.className = 'srm-toggle-btn';
    btn.innerHTML = `
      🎧
      <span class="srm-tooltip">라디오 모드 (Alt+R)</span>
    `;
    btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;background:transparent;border:none;color:#fff;font-size:18px;cursor:pointer;border-radius:4px;position:relative;';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onToggle();
    });

    // #liveButton 바로 뒤에 삽입 (.ctrl 내부, LIVE 옆)
    const liveBtn = document.querySelector('#liveButton');
    if (liveBtn) {
      liveBtn.insertAdjacentElement('afterend', btn);
      return;
    }

    // fallback: .ctrl 영역 끝에 삽입
    const ctrl = document.querySelector('.player_ctrlBox .ctrl');
    if (ctrl) {
      ctrl.appendChild(btn);
      return;
    }

    // fallback: #webplayer에 플로팅
    const container = document.querySelector('#webplayer') || this.getPlayerContainer();
    if (container) {
      btn.style.cssText = 'position:absolute;bottom:40px;left:150px;z-index:10001;background:rgba(0,0,0,0.6);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;';
      container.style.position = container.style.position || 'relative';
      container.appendChild(btn);
    }
  }

}

// 어댑터 등록
(() => {
  if (!location.hostname.includes('sooplive.co.kr')) return;

  let adapter = null;

  async function syncAdapterState() {
    const { enableSoop = true } = await chrome.storage.local.get(['enableSoop']);

    if (enableSoop) {
      if (!adapter) {
        adapter = new SoopAdapter();
        window.__radioModeCore?.setAdapter(adapter);
      }
      return;
    }

    if (adapter) {
      window.__bossMode?.disable();
      chrome.runtime.sendMessage({ action: 'clear-boss-state' }).catch(() => {});
      await window.__radioModeCore?.clearAdapter('soop');
      adapter = null;
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.enableSoop) {
      void syncAdapterState();
    }
  });

  void syncAdapterState();
})();
