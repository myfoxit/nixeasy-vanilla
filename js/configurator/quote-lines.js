// Quote Lines Table component
// Flat list of line items (no container grouping).
// Per-row editing: price, qty, margin, SLA, hours, remove.
// Dependency warnings and installed base reference section preserved.

import { currency } from '../utils/format.js';
import { getMeasurePointTag } from '../utils/license-calculations.js';
import { createSelect } from '../components/select.js';
import { showConfirmModal } from '../components/modal.js';

/**
 * Create the Quote Lines Table (flat list, no groups).
 *
 * @param {Object} props
 * @param {Array}        props.lineItems                   - Array of LineItem objects
 * @param {Array}        props.licenses                    - Available license objects (for SLA lookups)
 * @param {boolean}      props.isTemplateMode              - Whether in template editing mode
 * @param {Function}     props.onUpdateItem                - (idx, field, val) => void
 * @param {Function}     props.onRemoveItem                - (idx) => void
 * @param {Function}     [props.onAddDependency]           - (license) => void
 * @param {Array}        [props.referencedInstalledBase]   - Array of referenced installed base items
 * @param {Function}     [props.onRemoveInstalledBaseReference] - (item) => void
 * @returns {{ element: HTMLElement, update: Function }}
 */
export function createQuoteLinesTable({
  lineItems = [],
  licenses = [],
  isTemplateMode = false,
  onUpdateItem,
  onRemoveItem,
  onAddDependency,
  referencedInstalledBase = [],
  onRemoveInstalledBaseReference
}) {
  const wrapper = document.createElement('div');

  let state = {
    lineItems,
    licenses,
    isTemplateMode,
    onUpdateItem,
    onRemoveItem,
    onAddDependency,
    referencedInstalledBase,
    onRemoveInstalledBaseReference
  };

  // Track select component instances for cleanup
  let selectInstances = [];

  // --- Helpers ---

  function getItemDependencies() {
    const items = state.lineItems || [];
    const licenseIdsInQuote = new Set(
      items.filter(i => i.itemType !== 'servicepack').map(i => i.licenseId)
    );

    return items.map(item => {
      if (item.itemType === 'servicepack') return [];

      const license = state.licenses.find(l => l.id === item.licenseId);
      if (!license?.depends_on || license.depends_on.length === 0) return [];

      return license.depends_on
        .filter(depId => !licenseIdsInQuote.has(depId))
        .map(depId => state.licenses.find(l => l.id === depId))
        .filter(l => l !== undefined);
    });
  }

  // --- Render ---

  function render() {
    // Destroy old select instances
    selectInstances.forEach(s => {
      if (s && typeof s.destroy === 'function') s.destroy();
    });
    selectInstances = [];

    wrapper.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'min-height:400px;overflow:visible;background:var(--surface);';

    // --- Card header ---
    const cardHeader = document.createElement('div');
    cardHeader.className = 'p-4 border-b flex justify-between items-center';
    cardHeader.style.cssText = 'background:var(--bg);border-color:var(--border);';

    const headerTitle = document.createElement('h3');
    headerTitle.style.color = 'var(--text-main)';
    headerTitle.textContent = state.isTemplateMode ? 'Template Lines' : 'Quote Lines';
    cardHeader.appendChild(headerTitle);

    const headerRight = document.createElement('div');
    headerRight.style.cssText = 'display:flex;align-items:center;gap:12px;';

    // Item count
    const countSpan = document.createElement('span');
    countSpan.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);';
    const items = state.lineItems || [];
    countSpan.textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
    headerRight.appendChild(countSpan);

    cardHeader.appendChild(headerRight);
    card.appendChild(cardHeader);

    // --- Card body ---
    const cardBody = document.createElement('div');
    cardBody.style.overflow = 'visible';

    // --- Referenced Installed Base Section ---
    if (state.referencedInstalledBase.length > 0) {
      const refSection = document.createElement('div');
      refSection.style.cssText = 'border-bottom:2px solid var(--border);background:var(--bg);';

      // Reference header
      const refHeader = document.createElement('div');
      refHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:linear-gradient(135deg, rgba(107, 114, 128, 0.1) 0%, rgba(75, 85, 99, 0.1) 100%);border-left:3px solid #6b7280;';

      const refLeft = document.createElement('div');
      refLeft.style.cssText = 'display:flex;align-items:center;gap:12px;';

      const boxSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      boxSvg.setAttribute('fill', 'none');
      boxSvg.setAttribute('viewBox', '0 0 24 24');
      boxSvg.setAttribute('stroke-width', '1.5');
      boxSvg.setAttribute('stroke', '#6b7280');
      boxSvg.style.cssText = 'width:16px;height:16px;';
      const boxPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      boxPath.setAttribute('stroke-linecap', 'round');
      boxPath.setAttribute('stroke-linejoin', 'round');
      boxPath.setAttribute('d', 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z');
      boxSvg.appendChild(boxPath);
      refLeft.appendChild(boxSvg);

      const refTitle = document.createElement('span');
      refTitle.style.cssText = 'font-weight:600;font-size:0.9rem;color:#6b7280;';
      refTitle.textContent = 'Installed Base (Reference Only)';
      refLeft.appendChild(refTitle);

      const refNote = document.createElement('span');
      refNote.style.cssText = 'font-size:0.7rem;color:#9ca3af;font-style:italic;';
      refNote.textContent = "These items are for reference and won't be saved with the quote";
      refLeft.appendChild(refNote);

      refHeader.appendChild(refLeft);

      const refCount = document.createElement('span');
      refCount.style.cssText = 'font-size:0.75rem;color:#6b7280;background:rgba(107, 114, 128, 0.15);padding:2px 8px;border-radius:12px;';
      refCount.textContent = `${state.referencedInstalledBase.length} ${state.referencedInstalledBase.length === 1 ? 'item' : 'items'}`;
      refHeader.appendChild(refCount);
      refSection.appendChild(refHeader);

      // Reference table
      const refTable = document.createElement('table');
      refTable.className = 'w-full';
      refTable.style.opacity = '0.6';

      const refThead = document.createElement('thead');
      const refHeadRow = document.createElement('tr');
      refHeadRow.style.background = 'rgba(107, 114, 128, 0.05)';
      const refCols = [
        { text: 'Item (Installed)', style: 'padding-left:2.5rem;color:#6b7280;' },
        { text: 'Site', style: 'width:140px;color:#6b7280;' },
        { text: 'SLA', style: 'width:100px;color:#6b7280;' },
        { text: 'Qty', style: 'width:100px;color:#6b7280;' },
        { text: 'Expires', style: 'width:100px;color:#6b7280;' },
        { text: '', style: 'width:50px;' }
      ];
      refCols.forEach(col => {
        const th = document.createElement('th');
        th.style.cssText = col.style;
        th.textContent = col.text;
        refHeadRow.appendChild(th);
      });
      refThead.appendChild(refHeadRow);
      refTable.appendChild(refThead);

      const refTbody = document.createElement('tbody');
      state.referencedInstalledBase.forEach(item => {
        const expiryDate = item.support_start && item.contract_term
          ? (() => {
            const start = new Date(item.support_start);
            const expiry = new Date(start);
            expiry.setMonth(expiry.getMonth() + item.contract_term);
            return expiry;
          })()
          : null;
        const isExpired = expiryDate ? expiryDate < new Date() : false;

        const tr = document.createElement('tr');
        tr.style.cssText = `background:${isExpired ? 'rgba(239, 68, 68, 0.08)' : 'rgba(107, 114, 128, 0.03)'};pointer-events:none;`;

        // Item cell
        const tdItem = document.createElement('td');
        tdItem.style.cssText = 'padding-left:2.5rem;pointer-events:auto;';

        const tagSpan = document.createElement('span');
        tagSpan.style.cssText = `font-size:0.55rem;font-weight:600;padding:1px 5px;border-radius:3px;background:${isExpired ? 'rgba(239, 68, 68, 0.15)' : 'rgba(107, 114, 128, 0.15)'};color:${isExpired ? '#dc2626' : '#6b7280'};text-transform:uppercase;`;
        tagSpan.textContent = isExpired ? 'EXPIRED' : 'INSTALLED';
        tdItem.appendChild(tagSpan);

        const nameDiv = document.createElement('div');
        nameDiv.className = 'font-medium text-sm';
        nameDiv.style.color = '#6b7280';
        nameDiv.textContent = item.expand?.license?.name || 'Unknown License';
        tdItem.appendChild(nameDiv);

        const skuDiv = document.createElement('div');
        skuDiv.className = 'text-xs font-mono';
        skuDiv.style.color = '#9ca3af';
        skuDiv.textContent = item.expand?.license?.sku || '-';
        tdItem.appendChild(skuDiv);
        tr.appendChild(tdItem);

        // Site
        const tdSite = document.createElement('td');
        tdSite.style.cssText = 'color:#6b7280;font-size:0.8rem;';
        tdSite.textContent = item.expand?.installed_site?.name || '-';
        tr.appendChild(tdSite);

        // SLA
        const tdSla = document.createElement('td');
        tdSla.style.cssText = 'color:#6b7280;font-size:0.8rem;';
        tdSla.textContent = item.expand?.support?.name || '-';
        tr.appendChild(tdSla);

        // Qty
        const tdQty = document.createElement('td');
        tdQty.style.cssText = 'color:#6b7280;text-align:center;font-weight:600;';
        tdQty.textContent = String(item.lic_amount);
        tr.appendChild(tdQty);

        // Expires
        const tdExpiry = document.createElement('td');
        tdExpiry.style.cssText = `color:${isExpired ? '#dc2626' : '#6b7280'};font-size:0.8rem;`;
        tdExpiry.textContent = expiryDate ? expiryDate.toLocaleDateString('de-DE') : '-';
        tr.appendChild(tdExpiry);

        // Remove button
        const tdRemove = document.createElement('td');
        tdRemove.className = 'text-center';
        tdRemove.style.pointerEvents = 'auto';
        const removeRefBtn = document.createElement('button');
        removeRefBtn.className = 'btn btn-ghost btn-sm';
        removeRefBtn.style.color = '#9ca3af';
        removeRefBtn.title = 'Remove from view';
        removeRefBtn.innerHTML = '&times;';
        removeRefBtn.addEventListener('click', () => {
          if (state.onRemoveInstalledBaseReference) state.onRemoveInstalledBaseReference(item);
        });
        tdRemove.appendChild(removeRefBtn);
        tr.appendChild(tdRemove);

        refTbody.appendChild(tr);
      });
      refTable.appendChild(refTbody);
      refSection.appendChild(refTable);
      cardBody.appendChild(refSection);
    }

    // --- Flat Line Items Table ---
    const itemDependencies = getItemDependencies();

    if (items.length === 0) {
      // Empty state
      const emptyDiv = document.createElement('div');
      emptyDiv.style.cssText = 'text-align:center;padding:3rem;color:var(--text-secondary);';

      const emptySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      emptySvg.setAttribute('fill', 'none');
      emptySvg.setAttribute('viewBox', '0 0 24 24');
      emptySvg.setAttribute('stroke-width', '1.5');
      emptySvg.setAttribute('stroke', 'currentColor');
      emptySvg.style.cssText = 'width:48px;height:48px;margin:0 auto 16px;opacity:0.5;';
      const emptyPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      emptyPath.setAttribute('stroke-linecap', 'round');
      emptyPath.setAttribute('stroke-linejoin', 'round');
      emptyPath.setAttribute('d', 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z');
      emptySvg.appendChild(emptyPath);
      emptyDiv.appendChild(emptySvg);

      const emptyP1 = document.createElement('p');
      emptyP1.style.cssText = 'font-size:0.9rem;margin-bottom:8px;';
      emptyP1.textContent = 'No items added yet';
      emptyDiv.appendChild(emptyP1);

      const emptyP2 = document.createElement('p');
      emptyP2.style.fontSize = '0.8rem';
      emptyP2.textContent = 'Add items from the catalog panel on the left';
      emptyDiv.appendChild(emptyP2);

      cardBody.appendChild(emptyDiv);
    } else {
      const table = document.createElement('table');
      table.className = 'w-full';

      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      const thData = [
        { text: 'Item', style: 'padding-left:1.5rem;' },
        { text: 'SLA', style: 'width:110px;' },
        { text: 'Price', style: 'width:100px;' },
        { text: 'Qty', style: 'width:100px;' },
        { text: 'Margin %', style: 'width:100px;' },
        { text: 'Total', style: 'width:120px;text-align:right;' },
        { text: '', style: 'width:50px;' }
      ];
      thData.forEach(col => {
        const th = document.createElement('th');
        th.style.cssText = col.style;
        th.textContent = col.text;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      items.forEach((item, originalIndex) => {
        const isServicePack = item.itemType === 'servicepack';
        const lic = !isServicePack ? state.licenses.find(l => l.id === item.licenseId) : null;
        const lineTotal = (item.price * item.amount) * (1 + item.margin / 100);
        const slas = lic?.expand?.possible_SLAs;
        const currentSla = slas?.find(s => s.id === item.sla);
        const monthly = currentSla ? lineTotal * (currentSla.monthly_percentage / 100) : 0;
        const tag = !isServicePack ? getMeasurePointTag(item.sku) : null;
        const tagColor = tag?.color || (isServicePack ? '#f59e0b' : 'var(--primary)');
        const tagBg = tag ? `${tag.color}20` : (isServicePack ? '#fef3c7' : 'var(--primary-light)');
        const missingDeps = itemDependencies[originalIndex] || [];

        // Main item row
        const tr = document.createElement('tr');
        if (missingDeps.length > 0) tr.style.background = '#fef9e7';

        // Item cell
        const tdItem = document.createElement('td');
        tdItem.style.paddingLeft = '1.5rem';

        const typeTag = document.createElement('span');
        typeTag.style.cssText = `font-size:0.55rem;font-weight:600;padding:1px 5px;border-radius:3px;background:${tagBg};color:${tagColor};text-transform:uppercase;`;
        typeTag.textContent = tag?.tag.toUpperCase() || (isServicePack ? 'Service' : 'License');
        tdItem.appendChild(typeTag);

        const nameDiv = document.createElement('div');
        nameDiv.className = 'font-medium text-sm';
        nameDiv.textContent = item.name;
        tdItem.appendChild(nameDiv);

        const skuDiv = document.createElement('div');
        skuDiv.className = 'text-xs text-secondary font-mono';
        skuDiv.textContent = item.sku;
        tdItem.appendChild(skuDiv);

        // Missing dependency warning
        if (missingDeps.length > 0) {
          const warnDiv = document.createElement('div');
          warnDiv.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:4px;';

          const warnSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          warnSvg.setAttribute('fill', 'none');
          warnSvg.setAttribute('viewBox', '0 0 24 24');
          warnSvg.setAttribute('stroke-width', '2');
          warnSvg.setAttribute('stroke', '#d97706');
          warnSvg.style.cssText = 'width:14px;height:14px;';
          const warnPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          warnPath.setAttribute('stroke-linecap', 'round');
          warnPath.setAttribute('stroke-linejoin', 'round');
          warnPath.setAttribute('d', 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z');
          warnSvg.appendChild(warnPath);
          warnDiv.appendChild(warnSvg);

          const warnText = document.createElement('span');
          warnText.style.cssText = 'font-size:0.7rem;color:#d97706;font-weight:500;';
          warnText.textContent = 'Missing dependency';
          warnDiv.appendChild(warnText);
          tdItem.appendChild(warnDiv);
        }
        tr.appendChild(tdItem);

        // Service/Hours cell
        const tdService = document.createElement('td');
        if (isServicePack) {
          const hoursDiv = document.createElement('div');
          hoursDiv.style.cssText = 'display:flex;align-items:center;gap:4px;';
          const hoursInput = document.createElement('input');
          hoursInput.type = 'number';
          hoursInput.min = '0.5';
          hoursInput.step = '0.5';
          hoursInput.value = item.hours || 0;
          hoursInput.style.cssText = 'width:60px;padding:0.25rem;font-size:0.75rem;background:var(--surface);color:var(--text-main);border:1px solid var(--border);border-radius:0.375rem;';
          hoursInput.addEventListener('change', (e) => {
            if (state.onUpdateItem) state.onUpdateItem(originalIndex, 'hours', parseFloat(e.target.value) || 0);
          });
          hoursDiv.appendChild(hoursInput);

          const hrsLabel = document.createElement('span');
          hrsLabel.className = 'text-xs text-secondary';
          hrsLabel.textContent = 'hrs';
          hoursDiv.appendChild(hrsLabel);
          tdService.appendChild(hoursDiv);
        } else if (slas && slas.length > 0) {
          // Compact SLA tag with dropdown on click
          const currentSla = slas.find(s => s.id === item.sla);
          const slaTag = document.createElement('span');
          slaTag.className = 'sla-tag';
          slaTag.textContent = currentSla ? currentSla.name : 'None';
          slaTag.title = currentSla ? currentSla.name : 'No SLA selected';
          slaTag.addEventListener('click', (e) => {
            e.stopPropagation();
            // Remove any existing SLA dropdown
            document.querySelectorAll('.sla-dropdown').forEach(d => d.remove());
            const dropdown = document.createElement('div');
            dropdown.className = 'sla-dropdown';
            const rect = slaTag.getBoundingClientRect();
            dropdown.style.cssText = `position:fixed;top:${rect.bottom + 2}px;left:${rect.left}px;z-index:100;`;
            [{ value: '', label: 'None' }, ...slas.map(s => ({ value: s.id, label: s.name }))].forEach(opt => {
              const optEl = document.createElement('div');
              optEl.className = 'sla-dropdown-item' + (opt.value === (item.sla || '') ? ' active' : '');
              optEl.textContent = opt.label;
              optEl.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (state.onUpdateItem) state.onUpdateItem(originalIndex, 'sla', opt.value);
                dropdown.remove();
              });
              dropdown.appendChild(optEl);
            });
            document.body.appendChild(dropdown);
            const closeDropdown = (ev) => {
              if (!dropdown.contains(ev.target) && ev.target !== slaTag) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
              }
            };
            setTimeout(() => document.addEventListener('click', closeDropdown), 0);
          });
          tdService.appendChild(slaTag);
        } else {
          const dash = document.createElement('span');
          dash.className = 'text-xs text-secondary';
          dash.textContent = '-';
          tdService.appendChild(dash);
        }
        tr.appendChild(tdService);

        // Price cell
        const tdPrice = document.createElement('td');
        tdPrice.className = 'text-sm text-secondary';
        tdPrice.textContent = currency(item.price);
        tr.appendChild(tdPrice);

        // Qty cell
        const tdQty = document.createElement('td');
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.min = '1';
        qtyInput.value = item.amount;
        qtyInput.style.cssText = 'width:70px;padding:0.25rem;background:var(--surface);color:var(--text-main);border:1px solid var(--border);border-radius:0.375rem;';
        qtyInput.addEventListener('change', (e) => {
          if (state.onUpdateItem) state.onUpdateItem(originalIndex, 'amount', parseInt(e.target.value) || 0);
        });
        tdQty.appendChild(qtyInput);
        tr.appendChild(tdQty);

        // Margin cell
        const tdMargin = document.createElement('td');
        const marginInput = document.createElement('input');
        marginInput.type = 'number';
        marginInput.step = '0.5';
        marginInput.value = item.margin;
        marginInput.style.cssText = 'width:70px;padding:0.25rem;background:var(--surface);color:var(--text-main);border:1px solid var(--border);border-radius:0.375rem;';
        marginInput.addEventListener('change', (e) => {
          if (state.onUpdateItem) state.onUpdateItem(originalIndex, 'margin', parseFloat(e.target.value) || 0);
        });
        tdMargin.appendChild(marginInput);
        tr.appendChild(tdMargin);

        // Total cell
        const tdTotal = document.createElement('td');
        tdTotal.className = 'text-right font-medium text-sm';
        const totalDiv = document.createElement('div');
        totalDiv.textContent = currency(lineTotal);
        tdTotal.appendChild(totalDiv);
        if (monthly > 0) {
          const monthlyDiv = document.createElement('div');
          monthlyDiv.className = 'text-xs';
          monthlyDiv.style.color = 'var(--primary)';
          monthlyDiv.textContent = `+ ${currency(monthly)} mtl.`;
          tdTotal.appendChild(monthlyDiv);
        }
        tr.appendChild(tdTotal);

        // Remove cell
        const tdRemove = document.createElement('td');
        tdRemove.className = 'text-center';
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-ghost btn-sm text-danger';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', () => {
          showConfirmModal({
            title: 'Remove Item',
            message: `Are you sure you want to remove "${item.name}" from the quote?`,
            confirmText: 'Remove',
            variant: 'warning',
            onConfirm: () => {
              if (state.onRemoveItem) state.onRemoveItem(originalIndex);
            }
          });
        });
        tdRemove.appendChild(removeBtn);
        tr.appendChild(tdRemove);

        tbody.appendChild(tr);

        // --- Dependency row (if missing deps) ---
        if (missingDeps.length > 0) {
          const depTr = document.createElement('tr');
          const depTd = document.createElement('td');
          depTd.colSpan = 7;
          depTd.style.cssText = 'padding:0 1.5rem 12px 1.5rem;background:#fef9e7;';

          const depBox = document.createElement('div');
          depBox.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:8px 12px;background:#fef3c7;border-radius:6px;border:1px solid #fcd34d;';

          const reqLabel = document.createElement('span');
          reqLabel.style.cssText = 'font-size:0.75rem;color:#92400e;font-weight:500;display:flex;align-items:center;';
          reqLabel.textContent = 'Requires:';
          depBox.appendChild(reqLabel);

          missingDeps.forEach(dep => {
            const depBtn = document.createElement('button');
            depBtn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px;font-size:0.75rem;background:white;border:1px solid #fcd34d;border-radius:4px;cursor:pointer;transition:all 0.15s;';
            depBtn.addEventListener('mouseenter', () => {
              depBtn.style.background = '#f59e0b';
              depBtn.style.color = 'white';
              depBtn.style.borderColor = '#f59e0b';
            });
            depBtn.addEventListener('mouseleave', () => {
              depBtn.style.background = 'white';
              depBtn.style.color = 'inherit';
              depBtn.style.borderColor = '#fcd34d';
            });

            const depPlusSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            depPlusSvg.setAttribute('fill', 'none');
            depPlusSvg.setAttribute('viewBox', '0 0 24 24');
            depPlusSvg.setAttribute('stroke-width', '2');
            depPlusSvg.setAttribute('stroke', 'currentColor');
            depPlusSvg.style.cssText = 'width:12px;height:12px;';
            const depPlusPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            depPlusPath.setAttribute('stroke-linecap', 'round');
            depPlusPath.setAttribute('stroke-linejoin', 'round');
            depPlusPath.setAttribute('d', 'M12 4.5v15m7.5-7.5h-15');
            depPlusSvg.appendChild(depPlusPath);
            depBtn.appendChild(depPlusSvg);
            depBtn.appendChild(document.createTextNode(dep.name));

            depBtn.addEventListener('click', () => {
              if (state.onAddDependency) state.onAddDependency(dep);
            });
            depBox.appendChild(depBtn);
          });

          depTd.appendChild(depBox);
          depTr.appendChild(depTd);
          tbody.appendChild(depTr);
        }
      });

      table.appendChild(tbody);
      cardBody.appendChild(table);
    }

    card.appendChild(cardBody);
    wrapper.appendChild(card);
  }

  render();

  /**
   * Update the quote lines table with new props.
   * @param {Object} props
   */
  function update(props) {
    if (props.lineItems !== undefined) state.lineItems = props.lineItems;
    if (props.licenses !== undefined) state.licenses = props.licenses;
    if (props.isTemplateMode !== undefined) state.isTemplateMode = props.isTemplateMode;
    if (props.onUpdateItem !== undefined) state.onUpdateItem = props.onUpdateItem;
    if (props.onRemoveItem !== undefined) state.onRemoveItem = props.onRemoveItem;
    if (props.onAddDependency !== undefined) state.onAddDependency = props.onAddDependency;
    if (props.referencedInstalledBase !== undefined) state.referencedInstalledBase = props.referencedInstalledBase;
    if (props.onRemoveInstalledBaseReference !== undefined) state.onRemoveInstalledBaseReference = props.onRemoveInstalledBaseReference;
    render();
  }

  return { element: wrapper, update };
}
