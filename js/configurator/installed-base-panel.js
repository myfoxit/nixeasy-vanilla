// Installed Base Panel component
// Ported from React InstalledBasePanel.tsx (353 lines)
// Collapsible panel showing installed base grouped by site with filtering, search,
// tri-state site checkboxes, and item-level selection.

import { formatDateObj } from '../utils/format.js';

/**
 * Get expiry status for an installed base item.
 * @param {string} supportStart - ISO date string for support start
 * @param {number} contractTerm - Contract term in months
 * @returns {{ status: 'expired'|'expiring-soon'|'active', expiryDate: Date }}
 */
function getExpiryStatus(supportStart, contractTerm) {
  const start = new Date(supportStart);
  const expiry = new Date(start);
  expiry.setMonth(expiry.getMonth() + contractTerm);

  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  if (expiry < now) return { status: 'expired', expiryDate: expiry };
  if (expiry < thirtyDaysFromNow) return { status: 'expiring-soon', expiryDate: expiry };
  return { status: 'active', expiryDate: expiry };
}

/**
 * Create the Installed Base Panel.
 *
 * @param {Object} props
 * @param {Array}   props.installedBase   - Array of InstalledSiteGroup objects
 * @param {boolean} props.isLoading       - Whether data is still loading
 * @param {string}  [props.customerName]  - Customer name for display
 * @param {Array}   [props.referencedItems] - Array of referenced installed base items
 * @param {Function} [props.onToggleItem] - Toggle a single item reference
 * @param {Function} [props.onToggleSite] - Toggle all items in a site
 * @returns {{ element: HTMLElement, update: Function }}
 */
export function createInstalledBasePanel({
  installedBase = [],
  isLoading = false,
  customerName,
  referencedItems = [],
  onToggleItem,
  onToggleSite
}) {
  const el = document.createElement('div');
  el.style.cssText = 'height:100%;display:flex;flex-direction:column;overflow:hidden;';

  let state = {
    installedBase,
    isLoading,
    customerName,
    referencedItems,
    onToggleItem,
    onToggleSite
  };

  // Internal UI state
  let expandedSites = new Set();
  let filter = 'all'; // 'all' | 'expired' | 'active'
  let searchTerm = '';

  // --- Helper functions ---

  function isItemReferenced(itemId) {
    return state.referencedItems.some(i => i.id === itemId);
  }

  function isSiteFullySelected(siteItems) {
    return siteItems.length > 0 && siteItems.every(item => isItemReferenced(item.id));
  }

  function isSitePartiallySelected(siteItems) {
    const selectedCount = siteItems.filter(item => isItemReferenced(item.id)).length;
    return selectedCount > 0 && selectedCount < siteItems.length;
  }

  function getFilteredSites() {
    return state.installedBase.filter(site => {
      // Filter by status
      if (filter === 'expired' && !site.isExpired) return false;
      if (filter === 'active' && site.isExpired) return false;

      // Filter by search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const siteMatch = site.siteName.toLowerCase().includes(term);
        const itemMatch = site.items.some(item =>
          item.expand?.license?.name?.toLowerCase().includes(term) ||
          item.expand?.license?.sku?.toLowerCase().includes(term)
        );
        return siteMatch || itemMatch;
      }

      return true;
    });
  }

  function getStats() {
    const totalSites = state.installedBase.length;
    const expiredSites = state.installedBase.filter(s => s.isExpired).length;
    const totalLicenses = state.installedBase.reduce((sum, s) => sum + s.items.length, 0);
    return { totalSites, expiredSites, totalLicenses };
  }

  // --- Render ---

  function render() {
    el.innerHTML = '';

    // Loading state
    if (state.isLoading) {
      const loadingDiv = document.createElement('div');
      loadingDiv.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;padding:2rem;color:var(--text-secondary);';
      const spinner = document.createElement('div');
      spinner.style.cssText = 'width:20px;height:20px;border:2px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.6s linear infinite;';
      // Inject spin animation if needed
      if (!document.getElementById('spin-animation-style')) {
        const style = document.createElement('style');
        style.id = 'spin-animation-style';
        style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
      }
      const loadingText = document.createElement('span');
      loadingText.textContent = 'Loading installed base...';
      loadingDiv.appendChild(spinner);
      loadingDiv.appendChild(loadingText);
      el.appendChild(loadingDiv);
      return;
    }

    // Empty state
    if (state.installedBase.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;color:var(--text-secondary);gap:8px;';

      const emptySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      emptySvg.setAttribute('fill', 'none');
      emptySvg.setAttribute('viewBox', '0 0 24 24');
      emptySvg.setAttribute('stroke-width', '1.5');
      emptySvg.setAttribute('stroke', 'currentColor');
      emptySvg.style.cssText = 'width:32px;height:32px;opacity:0.5;';
      const emptyPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      emptyPath.setAttribute('stroke-linecap', 'round');
      emptyPath.setAttribute('stroke-linejoin', 'round');
      emptyPath.setAttribute('d', 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z');
      emptySvg.appendChild(emptyPath);
      emptyDiv.appendChild(emptySvg);

      const emptyText = document.createElement('span');
      emptyText.textContent = 'No installed base found for this customer';
      emptyDiv.appendChild(emptyText);
      el.appendChild(emptyDiv);
      return;
    }

    const stats = getStats();
    const filteredSites = getFilteredSites();

    // --- Header with stats and filters ---
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0;';

    // Stats
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--text-secondary);';

    const statSites = document.createElement('span');
    statSites.innerHTML = `<strong>${stats.totalSites}</strong> Sites`;
    statsDiv.appendChild(statSites);

    const dot1 = document.createElement('span');
    dot1.style.cssText = 'color:var(--border);';
    dot1.textContent = '\u2022';
    statsDiv.appendChild(dot1);

    const statLicenses = document.createElement('span');
    statLicenses.innerHTML = `<strong>${stats.totalLicenses}</strong> Licenses`;
    statsDiv.appendChild(statLicenses);

    if (stats.expiredSites > 0) {
      const dot2 = document.createElement('span');
      dot2.style.cssText = 'color:var(--border);';
      dot2.textContent = '\u2022';
      statsDiv.appendChild(dot2);

      const statExpired = document.createElement('span');
      statExpired.style.color = '#dc2626';
      statExpired.innerHTML = `<strong>${stats.expiredSites}</strong> Expired`;
      statsDiv.appendChild(statExpired);
    }

    header.appendChild(statsDiv);

    // Controls: filter tabs + search
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;align-items:center;gap:12px;';

    // Filter tabs
    const filterTabs = document.createElement('div');
    filterTabs.style.cssText = 'display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;';

    const tabData = [
      { key: 'all', label: 'All' },
      { key: 'expired', label: 'Expired' },
      { key: 'active', label: 'Active' }
    ];

    tabData.forEach(tab => {
      const tabBtn = document.createElement('button');
      const isActive = filter === tab.key;
      tabBtn.style.cssText = [
        'padding:4px 12px',
        'font-size:0.7rem',
        'border:none',
        'cursor:pointer',
        `background:${isActive ? 'var(--primary)' : 'transparent'}`,
        `color:${isActive ? 'white' : 'var(--text-secondary)'}`,
        'font-weight:500',
        'transition:all 0.15s'
      ].join(';') + ';';
      tabBtn.textContent = tab.label;
      tabBtn.addEventListener('click', () => {
        filter = tab.key;
        render();
      });
      filterTabs.appendChild(tabBtn);
    });

    controls.appendChild(filterTabs);

    // Search box
    const searchBox = document.createElement('div');
    searchBox.style.cssText = 'position:relative;';

    const searchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    searchIcon.setAttribute('fill', 'none');
    searchIcon.setAttribute('viewBox', '0 0 24 24');
    searchIcon.setAttribute('stroke-width', '1.5');
    searchIcon.setAttribute('stroke', 'currentColor');
    searchIcon.style.cssText = 'width:14px;height:14px;position:absolute;left:8px;top:50%;transform:translateY(-50%);color:#9ca3af;';
    const searchPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    searchPath.setAttribute('stroke-linecap', 'round');
    searchPath.setAttribute('stroke-linejoin', 'round');
    searchPath.setAttribute('d', 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z');
    searchIcon.appendChild(searchPath);
    searchBox.appendChild(searchIcon);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search sites or licenses...';
    searchInput.value = searchTerm;
    searchInput.style.cssText = 'padding:4px 8px 4px 28px;font-size:0.75rem;border:1px solid var(--border);border-radius:4px;width:180px;background:var(--surface);color:var(--text-main);';
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value;
      render();
    });
    searchBox.appendChild(searchInput);

    controls.appendChild(searchBox);
    header.appendChild(controls);
    el.appendChild(header);

    // --- Sites list ---
    const sitesList = document.createElement('div');
    sitesList.style.cssText = 'flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;';

    if (filteredSites.length === 0) {
      const noResults = document.createElement('div');
      noResults.style.cssText = 'text-align:center;padding:2rem;color:var(--text-secondary);font-size:0.85rem;';
      noResults.textContent = 'No sites match your filter';
      sitesList.appendChild(noResults);
    } else {
      filteredSites.forEach(site => {
        const isExpanded = expandedSites.has(site.siteId);
        const isFullySelected = isSiteFullySelected(site.items);
        const isPartially = isSitePartiallySelected(site.items);

        const siteCard = document.createElement('div');
        siteCard.style.cssText = [
          'border:1px solid var(--border)',
          'border-radius:8px',
          'overflow:hidden',
          site.isExpired ? 'border-left:3px solid #ef4444' : '',
          isFullySelected ? 'border-color:var(--primary);background:var(--primary-light)' : ''
        ].join(';') + ';';

        // --- Site header ---
        const siteHeader = document.createElement('div');
        siteHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;cursor:pointer;gap:10px;';
        siteHeader.addEventListener('click', () => {
          if (expandedSites.has(site.siteId)) {
            expandedSites.delete(site.siteId);
          } else {
            expandedSites.add(site.siteId);
          }
          render();
        });

        const siteInfo = document.createElement('div');
        siteInfo.style.cssText = 'display:flex;align-items:center;gap:10px;flex:1;min-width:0;';

        // Site selection checkbox (tri-state)
        const siteCheckbox = document.createElement('input');
        siteCheckbox.type = 'checkbox';
        siteCheckbox.checked = isFullySelected;
        siteCheckbox.indeterminate = isPartially;
        siteCheckbox.style.cssText = 'cursor:pointer;width:16px;height:16px;flex-shrink:0;';
        siteCheckbox.title = isFullySelected ? 'Deselect all licenses' : 'Select all licenses';
        siteCheckbox.addEventListener('change', (e) => {
          e.stopPropagation();
          if (state.onToggleSite) state.onToggleSite(site.items);
        });
        siteCheckbox.addEventListener('click', (e) => e.stopPropagation());
        siteInfo.appendChild(siteCheckbox);

        // Expand arrow
        const expandBtn = document.createElement('button');
        expandBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;color:var(--text-secondary);flex-shrink:0;';
        const expandSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        expandSvg.setAttribute('fill', 'none');
        expandSvg.setAttribute('viewBox', '0 0 24 24');
        expandSvg.setAttribute('stroke-width', '2');
        expandSvg.setAttribute('stroke', 'currentColor');
        expandSvg.style.cssText = `width:14px;height:14px;transform:${isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'};transition:transform 0.15s;`;
        const expandPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        expandPath.setAttribute('stroke-linecap', 'round');
        expandPath.setAttribute('stroke-linejoin', 'round');
        expandPath.setAttribute('d', 'M8.25 4.5l7.5 7.5-7.5 7.5');
        expandSvg.appendChild(expandPath);
        expandBtn.appendChild(expandSvg);
        siteInfo.appendChild(expandBtn);

        // Building icon
        const buildingIcon = document.createElement('div');
        buildingIcon.style.cssText = 'flex-shrink:0;color:var(--text-secondary);';
        const buildSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        buildSvg.setAttribute('fill', 'none');
        buildSvg.setAttribute('viewBox', '0 0 24 24');
        buildSvg.setAttribute('stroke-width', '1.5');
        buildSvg.setAttribute('stroke', 'currentColor');
        buildSvg.style.cssText = 'width:16px;height:16px;';
        const buildPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        buildPath.setAttribute('stroke-linecap', 'round');
        buildPath.setAttribute('stroke-linejoin', 'round');
        buildPath.setAttribute('d', 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z');
        buildSvg.appendChild(buildPath);
        buildingIcon.appendChild(buildSvg);
        siteInfo.appendChild(buildingIcon);

        // Site name and meta
        const siteTextBlock = document.createElement('div');
        siteTextBlock.style.cssText = 'min-width:0;';

        const siteNameDiv = document.createElement('div');
        siteNameDiv.style.cssText = 'font-weight:600;font-size:0.85rem;color:var(--text-main);display:flex;align-items:center;';
        siteNameDiv.textContent = site.siteName;

        // Selection status
        if (isFullySelected || isPartially) {
          const selBadge = document.createElement('span');
          selBadge.style.cssText = [
            'margin-left:8px',
            'font-size:0.65rem',
            'padding:2px 6px',
            'border-radius:4px',
            `background:${isFullySelected ? 'var(--primary)' : 'var(--primary-light)'}`,
            `color:${isFullySelected ? 'white' : 'var(--primary)'}`,
            'font-weight:500'
          ].join(';') + ';';
          if (isFullySelected) {
            selBadge.textContent = 'All selected';
          } else {
            const selCount = site.items.filter(i => isItemReferenced(i.id)).length;
            selBadge.textContent = `${selCount}/${site.items.length} selected`;
          }
          siteNameDiv.appendChild(selBadge);
        }

        siteTextBlock.appendChild(siteNameDiv);

        const siteMeta = document.createElement('div');
        siteMeta.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);display:flex;align-items:center;gap:8px;margin-top:2px;';
        const licCount = document.createElement('span');
        licCount.textContent = `${site.items.length} license${site.items.length !== 1 ? 's' : ''}`;
        siteMeta.appendChild(licCount);

        if (site.earliestExpiry) {
          const expirySpan = document.createElement('span');
          expirySpan.style.cssText = site.isExpired ? 'color:#dc2626;font-weight:500;' : '';
          expirySpan.textContent = `${site.isExpired ? 'Expired' : 'Expires'}: ${formatDateObj(site.earliestExpiry)}`;
          siteMeta.appendChild(expirySpan);
        }

        siteTextBlock.appendChild(siteMeta);
        siteInfo.appendChild(siteTextBlock);
        siteHeader.appendChild(siteInfo);

        // Expired badge (right side)
        if (site.isExpired) {
          const expiredBadge = document.createElement('div');
          expiredBadge.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;background:#fee2e2;color:#dc2626;font-size:0.65rem;font-weight:700;flex-shrink:0;';

          const warnSvg2 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          warnSvg2.setAttribute('fill', 'none');
          warnSvg2.setAttribute('viewBox', '0 0 24 24');
          warnSvg2.setAttribute('stroke-width', '2');
          warnSvg2.setAttribute('stroke', 'currentColor');
          warnSvg2.style.cssText = 'width:12px;height:12px;';
          const warnPath2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          warnPath2.setAttribute('stroke-linecap', 'round');
          warnPath2.setAttribute('stroke-linejoin', 'round');
          warnPath2.setAttribute('d', 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z');
          warnSvg2.appendChild(warnPath2);
          expiredBadge.appendChild(warnSvg2);
          expiredBadge.appendChild(document.createTextNode('EXPIRED'));

          siteHeader.appendChild(expiredBadge);
        }

        siteCard.appendChild(siteHeader);

        // --- Expanded items table ---
        if (isExpanded) {
          const itemsDiv = document.createElement('div');
          itemsDiv.style.cssText = 'border-top:1px solid var(--border);';

          const table = document.createElement('table');
          table.className = 'w-full';
          table.style.cssText = 'font-size:0.8rem;';

          // thead
          const thead = document.createElement('thead');
          const headRow = document.createElement('tr');
          headRow.style.cssText = 'background:var(--bg);';
          const thData = [
            { text: '', width: '40px' },
            { text: 'License', width: '' },
            { text: 'Qty', width: '60px' },
            { text: 'SLA', width: '100px' },
            { text: 'Expires', width: '100px' },
            { text: 'Status', width: '80px' }
          ];
          thData.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col.text;
            th.style.cssText = `padding:6px 8px;text-align:left;font-size:0.7rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;${col.width ? 'width:' + col.width + ';' : ''}`;
            headRow.appendChild(th);
          });
          thead.appendChild(headRow);
          table.appendChild(thead);

          // tbody
          const tbody = document.createElement('tbody');
          site.items.forEach(item => {
            const expiryInfo = item.support_start && item.contract_term
              ? getExpiryStatus(item.support_start, item.contract_term)
              : null;
            const isReferenced = isItemReferenced(item.id);

            const tr = document.createElement('tr');
            tr.style.cssText = [
              'border-top:1px solid var(--border)',
              expiryInfo?.status === 'expired' ? 'background:rgba(239, 68, 68, 0.05)' : '',
              isReferenced ? 'background:var(--primary-light)' : '',
              state.onToggleItem ? 'cursor:pointer' : 'cursor:default'
            ].join(';') + ';';

            tr.addEventListener('click', () => {
              if (state.onToggleItem) state.onToggleItem(item);
            });

            // Checkbox cell
            const tdCheck = document.createElement('td');
            tdCheck.style.cssText = 'text-align:center;padding:6px 8px;';
            const itemCheckbox = document.createElement('input');
            itemCheckbox.type = 'checkbox';
            itemCheckbox.checked = isReferenced;
            itemCheckbox.style.cursor = 'pointer';
            itemCheckbox.addEventListener('change', () => {
              if (state.onToggleItem) state.onToggleItem(item);
            });
            itemCheckbox.addEventListener('click', (e) => e.stopPropagation());
            tdCheck.appendChild(itemCheckbox);
            tr.appendChild(tdCheck);

            // License name + SKU
            const tdLic = document.createElement('td');
            tdLic.style.cssText = 'padding:6px 8px;';
            const licName = document.createElement('div');
            licName.style.cssText = 'font-weight:500;font-size:0.8rem;color:var(--text-main);';
            licName.textContent = item.expand?.license?.name || 'Unknown';
            const licSku = document.createElement('div');
            licSku.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);font-family:monospace;';
            licSku.textContent = item.expand?.license?.sku || '-';
            tdLic.appendChild(licName);
            tdLic.appendChild(licSku);
            tr.appendChild(tdLic);

            // Qty
            const tdQty = document.createElement('td');
            tdQty.style.cssText = 'padding:6px 8px;text-align:center;font-weight:600;';
            tdQty.textContent = String(item.lic_amount);
            tr.appendChild(tdQty);

            // SLA
            const tdSla = document.createElement('td');
            tdSla.style.cssText = 'padding:6px 8px;';
            tdSla.textContent = item.expand?.support?.name || '-';
            tr.appendChild(tdSla);

            // Expires
            const tdExpiry = document.createElement('td');
            tdExpiry.style.cssText = 'padding:6px 8px;';
            tdExpiry.textContent = expiryInfo ? formatDateObj(expiryInfo.expiryDate) : '-';
            tr.appendChild(tdExpiry);

            // Status badge
            const tdStatus = document.createElement('td');
            tdStatus.style.cssText = 'padding:6px 8px;';
            if (expiryInfo) {
              const statusBadge = document.createElement('span');
              let statusStyle = '';
              let statusText = '';
              if (expiryInfo.status === 'expired') {
                statusStyle = 'background:#fee2e2;color:#dc2626;';
                statusText = 'Expired';
              } else if (expiryInfo.status === 'expiring-soon') {
                statusStyle = 'background:#fef3c7;color:#d97706;';
                statusText = 'Soon';
              } else {
                statusStyle = 'background:#dcfce7;color:#16a34a;';
                statusText = 'Active';
              }
              statusBadge.style.cssText = `${statusStyle}font-size:0.65rem;font-weight:600;padding:2px 8px;border-radius:10px;display:inline-block;`;
              statusBadge.textContent = statusText;
              tdStatus.appendChild(statusBadge);
            }
            tr.appendChild(tdStatus);

            tbody.appendChild(tr);
          });

          table.appendChild(tbody);
          itemsDiv.appendChild(table);
          siteCard.appendChild(itemsDiv);
        }

        sitesList.appendChild(siteCard);
      });
    }

    el.appendChild(sitesList);
  }

  render();

  /**
   * Update the panel with new props.
   * @param {Object} props
   */
  function update(props) {
    if (props.installedBase !== undefined) state.installedBase = props.installedBase;
    if (props.isLoading !== undefined) state.isLoading = props.isLoading;
    if (props.customerName !== undefined) state.customerName = props.customerName;
    if (props.referencedItems !== undefined) state.referencedItems = props.referencedItems;
    if (props.onToggleItem !== undefined) state.onToggleItem = props.onToggleItem;
    if (props.onToggleSite !== undefined) state.onToggleSite = props.onToggleSite;
    render();
  }

  return { element: el, update };
}
