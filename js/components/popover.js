// Popover component
// Ported from React Popover.tsx

/**
 * Inject fadeIn keyframe if not already present.
 */
function ensureFadeInStyle() {
  if (document.getElementById('popover-fade-style')) return;
  const s = document.createElement('style');
  s.id = 'popover-fade-style';
  s.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(s);
}

/**
 * Create a popover (dropdown) anchored to a trigger element.
 *
 * @param {Object} opts
 * @param {HTMLElement}  opts.trigger  - The trigger element (e.g. a button).
 * @param {HTMLElement|Function} opts.content - Dropdown content element, or a
 *   function that returns one (called lazily when opened).
 * @param {'left'|'right'} [opts.align='right'] - Horizontal alignment.
 * @param {number} [opts.width=320] - Width in pixels.
 * @returns {{ element: HTMLElement, open: Function, close: Function, destroy: Function }}
 */
export function createPopover({ trigger, content, align = 'right', width = 320 }) {
  ensureFadeInStyle();

  let isOpen = false;
  let dropdownEl = null;

  // Wrapper with relative positioning
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;display:inline-block;';

  // Append the trigger
  wrapper.appendChild(trigger);

  // --- Toggle on trigger click ---
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen) {
      close();
    } else {
      open();
    }
  });

  // --- Click-outside handler ---
  function handleClickOutside(e) {
    if (wrapper.contains(e.target)) return;
    close();
  }

  function open() {
    if (isOpen) return;
    isOpen = true;

    // Resolve content (may be a factory function)
    const contentEl = typeof content === 'function' ? content() : content;

    dropdownEl = document.createElement('div');
    dropdownEl.style.cssText = [
      'position:absolute',
      'top:calc(100% + 8px)',
      align === 'right' ? 'right:0' : 'left:0',
      `width:${width}px`,
      'background-color:var(--surface, white)',
      'border-radius:8px',
      'box-shadow:0 10px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
      'overflow:hidden',
      'z-index:100',
      'animation:fadeIn 0.15s ease-out',
    ].join(';') + ';';

    dropdownEl.appendChild(contentEl);
    wrapper.appendChild(dropdownEl);

    document.addEventListener('mousedown', handleClickOutside);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;

    if (dropdownEl && dropdownEl.parentNode) {
      dropdownEl.parentNode.removeChild(dropdownEl);
    }
    dropdownEl = null;

    document.removeEventListener('mousedown', handleClickOutside);
  }

  function destroy() {
    close();
    // Remove event listeners that were added to trigger
    // (In practice the trigger is removed from DOM with the wrapper.)
  }

  return { element: wrapper, open, close, destroy };
}
