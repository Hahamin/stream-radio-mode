/** Keep copy/selection helpers out of inputs and rich-text editors. */
(() => {
  if (!/(^|\.)sooplive\.(com|co\.kr)$/.test(location.hostname)) return;

  function isEditing(event) {
    return document.designMode === 'on' || event.composedPath().some(node =>
      node instanceof Element && (
        node.isContentEditable || node.closest('input, textarea, [contenteditable]')
      )
    );
  }

  for (const type of ['copy', 'cut', 'selectstart', 'contextmenu']) {
    document.addEventListener(type, event => {
      if (!isEditing(event)) event.stopImmediatePropagation();
    }, true);
  }

  const style = document.createElement('style');
  style.textContent = ':not(input):not(textarea):not([contenteditable]):not([contenteditable] *) { -webkit-user-select: text !important; user-select: text !important; }';
  function attachStyle() {
    (document.head || document.documentElement).appendChild(style);
  }
  if (document.documentElement) attachStyle();
  else document.addEventListener('DOMContentLoaded', attachStyle, { once: true });
})();
