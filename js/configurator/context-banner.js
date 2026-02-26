// Context Banner component
// Ported from React ContextBanner.tsx - shows customer, opportunity, and installed base toggle

/**
 * Create the context banner that displays customer name, opportunity info,
 * and an installed base toggle button with count badge and expired warning.
 *
 * @param {Object} props
 * @param {Object|null}  props.opportunity         - Opportunity record
 * @param {Object|null}  props.customer            - Customer record
 * @param {Array}        props.installedBase        - Array of installed base site groups
 * @param {boolean}      props.showInstalledBase    - Whether installed base panel is visible
 * @param {Function}     props.onToggleInstalledBase - Toggle callback
 * @returns {{ element: HTMLElement, update: Function }}
 */
export function createContextBanner({
  opportunity = null,
  customer = null,
  installedBase = [],
  showInstalledBase = false,
  onToggleInstalledBase
}) {
  const el = document.createElement('div');
  el.style.cssText = [
    'background:var(--surface)',
    'border-bottom:1px solid var(--border)',
    'padding:0.75rem 2rem',
    'display:flex',
    'justify-content:space-between',
    'align-items:center'
  ].join(';') + ';';

  let state = { opportunity, customer, installedBase, showInstalledBase, onToggleInstalledBase };

  function render() {
    el.innerHTML = '';

    // Left side: customer + opportunity
    const leftSide = document.createElement('div');
    leftSide.style.cssText = 'display:flex;align-items:center;gap:2rem;';

    // Customer block
    if (state.customer) {
      const customerBlock = document.createElement('div');
      customerBlock.style.cssText = 'display:flex;align-items:center;gap:0.5rem;';

      // Building icon
      const buildingSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      buildingSvg.setAttribute('fill', 'none');
      buildingSvg.setAttribute('viewBox', '0 0 24 24');
      buildingSvg.setAttribute('stroke-width', '1.5');
      buildingSvg.setAttribute('stroke', 'var(--primary)');
      buildingSvg.style.cssText = 'width:18px;height:18px;';
      const buildingPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      buildingPath.setAttribute('stroke-linecap', 'round');
      buildingPath.setAttribute('stroke-linejoin', 'round');
      buildingPath.setAttribute('d', 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z');
      buildingSvg.appendChild(buildingPath);
      customerBlock.appendChild(buildingSvg);

      const custName = document.createElement('span');
      custName.style.cssText = 'font-weight:600;color:var(--text-main);';
      custName.textContent = state.customer.name;
      customerBlock.appendChild(custName);

      if (state.customer.alias) {
        const alias = document.createElement('span');
        alias.style.cssText = 'color:var(--text-secondary);font-size:0.875rem;';
        alias.textContent = `(${state.customer.alias})`;
        customerBlock.appendChild(alias);
      }

      leftSide.appendChild(customerBlock);
    }

    // Opportunity block
    if (state.opportunity) {
      const oppBlock = document.createElement('div');
      oppBlock.style.cssText = 'display:flex;align-items:center;gap:0.5rem;';

      // Clipboard icon
      const clipSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      clipSvg.setAttribute('fill', 'none');
      clipSvg.setAttribute('viewBox', '0 0 24 24');
      clipSvg.setAttribute('stroke-width', '1.5');
      clipSvg.setAttribute('stroke', 'var(--text-secondary)');
      clipSvg.style.cssText = 'width:16px;height:16px;';
      const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      clipPath.setAttribute('stroke-linecap', 'round');
      clipPath.setAttribute('stroke-linejoin', 'round');
      clipPath.setAttribute('d', 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z');
      clipSvg.appendChild(clipPath);
      oppBlock.appendChild(clipSvg);

      const oppText = document.createElement('span');
      oppText.style.cssText = 'color:var(--text-secondary);font-size:0.875rem;';
      oppText.textContent = `Opp #${state.opportunity.opportunity}: ${state.opportunity.title}`;
      oppBlock.appendChild(oppText);

      // Status badge
      if (state.opportunity.status) {
        const badge = document.createElement('span');
        const badgeClass = state.opportunity.status === 'WON' ? 'success'
          : state.opportunity.status === 'LOST' ? 'danger' : 'neutral';
        badge.className = `badge badge-${badgeClass}`;
        badge.style.fontSize = '0.65rem';
        badge.textContent = state.opportunity.status;
        oppBlock.appendChild(badge);
      }

      leftSide.appendChild(oppBlock);
    }

    el.appendChild(leftSide);

    // Right side: Installed Base toggle button
    const expiredCount = state.installedBase.filter(s => s.isExpired).length;

    if (state.installedBase.length > 0 && state.onToggleInstalledBase) {
      const toggleBtn = document.createElement('button');
      toggleBtn.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:0.5rem',
        'padding:0.4rem 0.75rem',
        'border-radius:0.5rem',
        `border:1px solid ${state.showInstalledBase ? 'var(--primary)' : 'var(--border)'}`,
        `background:${state.showInstalledBase ? 'var(--primary-light)' : 'var(--surface)'}`,
        `color:${state.showInstalledBase ? 'var(--primary)' : 'var(--text-main)'}`,
        'font-size:0.8rem',
        'font-weight:500',
        'cursor:pointer',
        'transition:all 0.15s'
      ].join(';') + ';';

      // Box icon
      const boxSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      boxSvg.setAttribute('fill', 'none');
      boxSvg.setAttribute('viewBox', '0 0 24 24');
      boxSvg.setAttribute('stroke-width', '1.5');
      boxSvg.setAttribute('stroke', 'currentColor');
      boxSvg.style.cssText = 'width:16px;height:16px;';
      const boxPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      boxPath.setAttribute('stroke-linecap', 'round');
      boxPath.setAttribute('stroke-linejoin', 'round');
      boxPath.setAttribute('d', 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z');
      boxSvg.appendChild(boxPath);
      toggleBtn.appendChild(boxSvg);

      // "Installed Base" text
      const labelText = document.createElement('span');
      labelText.textContent = 'Installed Base';
      toggleBtn.appendChild(labelText);

      // Count badge
      const countBadge = document.createElement('span');
      countBadge.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'min-width:20px',
        'height:20px',
        'padding:0 6px',
        'border-radius:10px',
        `background:${expiredCount > 0 ? '#fee2e2' : 'var(--bg)'}`,
        `color:${expiredCount > 0 ? '#dc2626' : 'var(--text-secondary)'}`,
        'font-size:0.7rem',
        'font-weight:600'
      ].join(';') + ';';
      countBadge.textContent = String(state.installedBase.length);
      toggleBtn.appendChild(countBadge);

      // Expired warning badge
      if (expiredCount > 0) {
        const expBadge = document.createElement('span');
        expBadge.style.cssText = [
          'display:inline-flex',
          'align-items:center',
          'gap:2px',
          'padding:2px 6px',
          'border-radius:4px',
          'background:#ef4444',
          'color:white',
          'font-size:0.65rem',
          'font-weight:600'
        ].join(';') + ';';

        const warnSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        warnSvg.setAttribute('fill', 'none');
        warnSvg.setAttribute('viewBox', '0 0 24 24');
        warnSvg.setAttribute('stroke-width', '2');
        warnSvg.setAttribute('stroke', 'currentColor');
        warnSvg.style.cssText = 'width:10px;height:10px;';
        const warnPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        warnPath.setAttribute('stroke-linecap', 'round');
        warnPath.setAttribute('stroke-linejoin', 'round');
        warnPath.setAttribute('d', 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z');
        warnSvg.appendChild(warnPath);
        expBadge.appendChild(warnSvg);

        const expText = document.createTextNode(String(expiredCount));
        expBadge.appendChild(expText);
        toggleBtn.appendChild(expBadge);
      }

      // Chevron icon (rotates when open)
      const chevSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chevSvg.setAttribute('fill', 'none');
      chevSvg.setAttribute('viewBox', '0 0 24 24');
      chevSvg.setAttribute('stroke-width', '2');
      chevSvg.setAttribute('stroke', 'currentColor');
      chevSvg.style.cssText = `width:14px;height:14px;transform:${state.showInstalledBase ? 'rotate(180deg)' : 'rotate(0deg)'};transition:transform 0.15s;`;
      const chevPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      chevPath.setAttribute('stroke-linecap', 'round');
      chevPath.setAttribute('stroke-linejoin', 'round');
      chevPath.setAttribute('d', 'M19.5 8.25l-7.5 7.5-7.5-7.5');
      chevSvg.appendChild(chevPath);
      toggleBtn.appendChild(chevSvg);

      toggleBtn.addEventListener('click', () => {
        if (state.onToggleInstalledBase) state.onToggleInstalledBase();
      });

      el.appendChild(toggleBtn);
    }
  }

  render();

  /**
   * Update the banner with new props.
   * @param {Object} props
   */
  function update(props) {
    if (props.opportunity !== undefined) state.opportunity = props.opportunity;
    if (props.customer !== undefined) state.customer = props.customer;
    if (props.installedBase !== undefined) state.installedBase = props.installedBase;
    if (props.showInstalledBase !== undefined) state.showInstalledBase = props.showInstalledBase;
    if (props.onToggleInstalledBase !== undefined) state.onToggleInstalledBase = props.onToggleInstalledBase;
    render();
  }

  return { element: el, update };
}
