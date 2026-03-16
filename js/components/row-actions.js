/**
 * Row Actions — Edit button + ⋮ dots menu for extra actions.
 *
 * Usage:
 *   createRowActions({
 *     onEdit: (e) => { ... },
 *     more: [
 *       { label: 'Duplicate', onClick: (e) => { ... } },
 *       { label: 'Delete', onClick: (e) => { ... }, danger: true },
 *     ]
 *   })
 *
 * Returns an HTMLElement (a flex wrapper).
 */

export function createRowActions({ onEdit, more = [] }) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;justify-content:flex-end;align-items:center;gap:0.5rem;';

  // Edit button (always visible)
  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-secondary btn-sm';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onEdit(e);
  });
  wrap.appendChild(editBtn);

  // Dots menu (only if there are extra actions)
  if (more.length > 0) {
    const dotsWrap = document.createElement('div');
    dotsWrap.style.cssText = 'position:relative;';

    const dotsBtn = document.createElement('button');
    dotsBtn.style.cssText = 'background:transparent;border:none;cursor:pointer;padding:4px 6px;border-radius:4px;color:var(--text-secondary);font-size:1.1rem;line-height:1;transition:background 0.15s;';
    dotsBtn.textContent = '⋮';
    dotsBtn.title = 'More actions';
    dotsBtn.addEventListener('mouseenter', () => { dotsBtn.style.background = 'var(--hover-bg, #f3f4f6)'; });
    dotsBtn.addEventListener('mouseleave', () => { dotsBtn.style.background = 'transparent'; });

    let menuEl = null;
    let isOpen = false;

    function closeMenu() {
      if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
      menuEl = null;
      isOpen = false;
      document.removeEventListener('click', onDocClick, true);
    }

    function onDocClick(e) {
      if (menuEl && !menuEl.contains(e.target) && !dotsBtn.contains(e.target)) {
        closeMenu();
      }
    }

    dotsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isOpen) { closeMenu(); return; }

      menuEl = document.createElement('div');
      menuEl.style.cssText =
        'position:absolute;right:0;top:100%;margin-top:4px;min-width:140px;background:var(--surface);' +
        'border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.1);' +
        'z-index:50;padding:4px;';

      more.forEach(item => {
        const btn = document.createElement('button');
        btn.style.cssText =
          'display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:transparent;' +
          'cursor:pointer;border-radius:6px;font-size:0.82rem;transition:background 0.1s;white-space:nowrap;' +
          (item.danger ? 'color:var(--danger);' : 'color:var(--text-main);');
        btn.textContent = item.label;
        btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--hover-bg, #f3f4f6)'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          closeMenu();
          item.onClick(ev);
        });
        menuEl.appendChild(btn);
      });

      dotsWrap.appendChild(menuEl);
      isOpen = true;
      setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
    });

    dotsWrap.appendChild(dotsBtn);
    wrap.appendChild(dotsWrap);
  }

  return wrap;
}
