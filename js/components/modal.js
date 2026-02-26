// Confirm Modal component
// Ported from React ConfirmModal.tsx

const variantStyles = {
  danger:  { color: 'var(--danger)',  bg: '#fef2f2',              icon: '\uD83D\uDDD1\uFE0F' },
  warning: { color: '#f59e0b',        bg: '#fffbeb',              icon: '\u26A0\uFE0F' },
  info:    { color: 'var(--primary)', bg: 'var(--primary-light)', icon: '\u2139\uFE0F' },
};

/**
 * Show a confirmation modal dialog.
 *
 * @param {Object} opts
 * @param {string}   [opts.title='Confirm Action']  - Modal heading.
 * @param {string}    opts.message                   - Body text.
 * @param {string}   [opts.confirmText='Confirm']    - Confirm button label.
 * @param {string}   [opts.cancelText='Cancel']      - Cancel button label.
 * @param {'danger'|'warning'|'info'} [opts.variant='danger'] - Visual style.
 * @param {Function}  opts.onConfirm                 - Called when user confirms.
 * @param {Function} [opts.onCancel]                 - Called when user cancels.
 * @returns {Function} cleanup - Call to programmatically close the modal.
 */
export function showConfirmModal({
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) {
  const style = variantStyles[variant] || variantStyles.danger;

  // --- Backdrop ---
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  // The .modal-backdrop class is expected from the global stylesheet.
  // We set a click handler so clicking the backdrop cancels.
  backdrop.addEventListener('click', handleCancel);

  // --- Card ---
  const card = document.createElement('div');
  card.className = 'card';
  card.style.cssText = 'width:100%;max-width:400px;overflow:hidden;';
  card.addEventListener('click', (e) => e.stopPropagation());

  // --- Inner content ---
  const inner = document.createElement('div');
  inner.style.cssText =
    'padding:1.5rem;display:flex;flex-direction:column;align-items:center;text-align:center;';

  // Icon circle
  const iconCircle = document.createElement('div');
  iconCircle.style.cssText = [
    'width:56px',
    'height:56px',
    'border-radius:50%',
    `background:${style.bg}`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-size:24px',
    'margin-bottom:16px',
  ].join(';') + ';';
  iconCircle.textContent = style.icon;

  // Title
  const heading = document.createElement('h3');
  heading.style.cssText = 'margin-bottom:8px;font-size:1.125rem;';
  heading.textContent = title;

  // Message
  const msg = document.createElement('p');
  msg.style.cssText = 'color:var(--text-secondary);font-size:0.875rem;margin-bottom:24px;';
  msg.textContent = message;

  // Button row
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:12px;width:100%;';

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.style.flex = '1';
  cancelBtn.textContent = cancelText;
  cancelBtn.addEventListener('click', handleCancel);

  // Confirm button
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn';
  confirmBtn.style.cssText = `flex:1;background:${style.color};color:white;border:none;`;
  confirmBtn.textContent = confirmText;
  confirmBtn.addEventListener('click', handleConfirm);

  // --- Assemble ---
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);
  inner.appendChild(iconCircle);
  inner.appendChild(heading);
  inner.appendChild(msg);
  inner.appendChild(btnRow);
  card.appendChild(inner);
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  // --- Handlers ---
  function cleanup() {
    if (backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
    }
  }

  function handleCancel() {
    cleanup();
    if (typeof onCancel === 'function') onCancel();
  }

  function handleConfirm() {
    cleanup();
    if (typeof onConfirm === 'function') onConfirm();
  }

  return cleanup;
}
