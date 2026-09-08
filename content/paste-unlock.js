/**
 * Stream Radio Mode — SOOP 채팅 붙여넣기 차단 해제
 * SOOP이 채팅 입력란의 paste 이벤트를 차단하므로,
 * document 캡처 단계에서 먼저 가로채서 클립보드 텍스트를 직접 삽입한다.
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

  document.addEventListener('paste', (e) => {
    const target = findEditableTarget(e.target);
    if (!target) return;

    const text = e.clipboardData?.getData('text/plain');
    if (!text) return;

    e.stopImmediatePropagation();
    e.preventDefault();
    insertText(target, text);
  }, true);
})();
