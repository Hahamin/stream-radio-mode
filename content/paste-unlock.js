/**
 * Stream Radio Mode — SOOP 채팅 붙여넣기 차단 해제
 * 생방송 채팅 입력란에서만 클립보드 텍스트를 직접 삽입한다.
 * 게시글 편집기 등 다른 입력란은 사이트의 기본 붙여넣기 처리를 유지한다.
 * document_start에 등록되어 SOOP 페이지 스크립트보다 먼저 캡처 핸들러를 확보한다.
 */
(() => {
  if (!['play.sooplive.co.kr', 'play.sooplive.com'].includes(location.hostname)) return;

  const WRAPPER_SEL = '.write_area, #write_area, .input_chat';
  const EDITABLE_SEL = 'textarea, input, [contenteditable]';

  function findEditableTarget(el) {
    if (!(el instanceof Element)) return null;
    const wrapper = el.closest(WRAPPER_SEL);
    if (!wrapper) return null;

    const target = el.matches(EDITABLE_SEL) || el.isContentEditable
      ? el
      : wrapper.querySelector(EDITABLE_SEL);
    if (!target || target.closest('[contenteditable="false"]')) return null;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      if (target.disabled || target.readOnly) return null;
      if (target instanceof HTMLInputElement && !['text', 'search'].includes(target.type)) return null;
      return target;
    }
    return target.isContentEditable ? target : null;
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
