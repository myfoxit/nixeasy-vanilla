// Toast notification system
// Ported from React Toast.tsx - global toast notifications with auto-dismiss

let toastContainer = null;

const toastStyles = {
  success: { bg: '#ecfdf5', border: '#10b981', icon: '\u2713' },
  error:   { bg: '#fef2f2', border: '#ef4444', icon: '\u2715' },
  warning: { bg: '#fffbeb', border: '#f59e0b', icon: '\u26A0' },
  info:    { bg: '#eff6ff', border: '#3b82f6', icon: '\u2139' },
};

/**
 * Inject the slideIn keyframe animation into the document (once).
 */
function ensureAnimationStyle() {
  if (document.getElementById('toast-animation-style')) return;
  const style = document.createElement('style');
  style.id = 'toast-animation-style';
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0);    opacity: 1; }
      to   { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Initialize the toast container. Called automatically on first showToast().
 */
export function initToasts() {
  if (toastContainer) return;
  ensureAnimationStyle();

  toastContainer = document.createElement('div');
  toastContainer.style.cssText =
    'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
  document.body.appendChild(toastContainer);
}

/**
 * Remove a single toast element with a fade-out animation.
 * @param {HTMLElement} el
 */
function removeToast(el) {
  if (!el || !el.parentNode) return;
  el.style.animation = 'slideOut 0.2s ease-in forwards';
  el.addEventListener('animationend', () => {
    if (el.parentNode) el.parentNode.removeChild(el);
  });
}

/**
 * Show a toast notification.
 * @param {string} message - The text to display.
 * @param {'success'|'error'|'warning'|'info'} [type='info'] - Toast variant.
 */
export function showToast(message, type = 'info') {
  if (!toastContainer) initToasts();

  const style = toastStyles[type] || toastStyles.info;

  const el = document.createElement('div');
  el.style.cssText = [
    `background:${style.bg}`,
    `border-left:4px solid ${style.border}`,
    'padding:12px 16px',
    'border-radius:8px',
    'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
    'display:flex',
    'align-items:center',
    'gap:12px',
    'min-width:280px',
    'max-width:400px',
    'animation:slideIn 0.3s ease-out',
    'pointer-events:auto',
  ].join(';') + ';';

  // Icon circle
  const icon = document.createElement('span');
  icon.style.cssText = [
    'width:24px',
    'height:24px',
    'border-radius:50%',
    `background:${style.border}`,
    'color:white',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-size:12px',
    'font-weight:bold',
    'flex-shrink:0',
  ].join(';') + ';';
  icon.textContent = style.icon;

  // Message text
  const text = document.createElement('span');
  text.style.cssText = 'flex:1;font-size:0.875rem;color:#1f2937;';
  text.textContent = message;

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.style.cssText =
    'background:none;border:none;cursor:pointer;padding:4px;color:#9ca3af;font-size:18px;line-height:1;';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => removeToast(el));

  el.appendChild(icon);
  el.appendChild(text);
  el.appendChild(closeBtn);
  toastContainer.appendChild(el);

  // Auto-dismiss after 4 seconds
  setTimeout(() => removeToast(el), 4000);
}
