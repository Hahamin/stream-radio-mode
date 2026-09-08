/**
 * Stream Radio Mode — SOOP 클립보드/선택/우클릭 차단 해제
 * SOOP이 차단하는 이벤트들을 document 캡처 단계에서 먼저 가로채 정상 동작시킨다.
 * document_start에 등록되어 SOOP 페이지 스크립트보다 먼저 캡처 핸들러를 확보한다.
 */
(() => {
  if (!location.hostname.includes('sooplive.co.kr') && !location.hostname.includes('sooplive.com')) return;

  const WRAPPER_SEL = '.write_area, #write_area, .input_chat';
  const EDITABLE_SEL = 'textarea, input, [contenteditable]';

  function findEditableTarget(el) {
    if (!el) return null;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el;
    if (el.isContentEditable) return el;

    const wrapper = el.matches?.(WRAPPER_SEL) ? el : el.closest?.(WRAPPER_SEL);
    if (!wrapper) return null;

    return wrapper.querySelector(EDITABLE_SEL) || (wrapper.isContentEditable ? wrapper : null);
  }

  function insertText(target, text) {
    target.focus();

    if (target.isContentEditable) {
      document.execCommand('insertText', false, text);
      target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }));
      return;
    }

    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.value = target.value.slice(0, start) + text + target.value.slice(end);
    target.selectionStart = target.selectionEnd = start + text.length;
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }));
  }

  // 붙여넣기 차단 해제
  document.addEventListener('paste', (e) => {
    const target = findEditableTarget(e.target);
    if (!target) return;

    const text = e.clipboardData?.getData('text/plain');
    if (!text) return;

    e.stopImmediatePropagation();
    e.preventDefault();
    insertText(target, text);
  }, true);

  // 복사/잘라내기 차단 해제
  for (const evt of ['copy', 'cut']) {
    document.addEventListener(evt, (e) => {
      e.stopImmediatePropagation();
    }, true);
  }

  // 텍스트 선택 차단 해제
  document.addEventListener('selectstart', (e) => {
    e.stopImmediatePropagation();
  }, true);

  // 우클릭 메뉴 차단 해제
  document.addEventListener('contextmenu', (e) => {
    e.stopImmediatePropagation();
  }, true);

  // CSS user-select: none 강제 해제
  const style = document.createElement('style');
  style.textContent = '* { -webkit-user-select: text !important; user-select: text !important; }';
  (document.head || document.documentElement).appendChild(style);
})();
