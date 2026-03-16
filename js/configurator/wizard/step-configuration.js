// Step 1: Configuration — Browse licenses catalog, add items, set quantities & margins

import { currency } from '../../utils/format.js';
import { getMeasurePointTag } from '../../utils/license-calculations.js';
import { showToast } from '../../components/toast.js';

const ITEMS_PER_PAGE = 20;
const DEFAULT_MARGIN = 25;

export function createStepConfiguration({ licenses, servicePacks, hourlyRate, wizardState, onStateChange }) {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;gap:16px;height:calc(100vh - 280px);min-height:400px;';

  let search = '';
  let currentPage = 1;
  let levelFilter = 'ALL'; // ALL, BASE, MODULE, ADDON, DL

  function getFiltered() {
    const q = search.toLowerCase();
    return licenses
      .filter(l => {
        if (levelFilter !== 'ALL' && l.type !== levelFilter) return false;
        return (l.name + l.sku).toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function addItem(license) {
    const items = wizardState.lineItems;
    const existing = items.find(l => l.licenseId === license.id && l.itemType !== 'servicepack');
    if (existing) {
      existing.amount = (existing.amount || 1) + 1;
    } else {
      // Dependency validation
      if (license.depends_on) {
        const hasDep = items.some(l => l.licenseId === license.depends_on);
        if (!hasDep) {
          const depLic = licenses.find(l => l.id === license.depends_on);
          showToast(`Dependency missing: requires ${depLic?.name || license.depends_on}`, 'error');
          return;
        }
      }
      // Addon must have a parent of same product line
      if (license.type === 'ADDON' && license.product) {
        const hasParent = items.some(l => l.product === license.product && (l.type === 'BASE' || l.type === 'MODULE'));
        if (!hasParent) {
          showToast(`Missing parent module/base for product line: ${license.product}`, 'error');
          return;
        }
      }

      const newItem = {
        licenseId: license.id,
        name: license.name,
        sku: license.sku,
        price: license.initial_price || 0,
        amount: 1,
        margin: DEFAULT_MARGIN,
        sla: '',
        slaName: '',
        slaMonthly: 0,
        serviceMargin: 20,
        itemType: 'license',
        containerId: null,
        _order: items.length,
        type: license.type || '',
        product: license.product || '',
      };

      // Flat-tree insertion: place after last item of same product line
      if (license.product) {
        let insertIdx = -1;
        for (let i = items.length - 1; i >= 0; i--) {
          if (items[i].product === license.product && items[i].itemType !== 'servicepack') {
            insertIdx = i;
            break;
          }
        }
        if (insertIdx !== -1) {
          items.splice(insertIdx + 1, 0, newItem);
        } else {
          items.push(newItem);
        }
      } else {
        items.push(newItem);
      }
    }
    onStateChange();
    render();
  }

  function removeItem(idx) {
    wizardState.lineItems.splice(idx, 1);
    onStateChange();
    render();
  }

  function updateItem(idx, field, value) {
    wizardState.lineItems[idx][field] = value;
    onStateChange();
    renderItemsTable();
  }

  function computeTotals() {
    let hk = 0, vk = 0;
    for (const item of wizardState.lineItems) {
      if (item.itemType === 'servicepack') continue;
      const lineHk = item.price * item.amount;
      const lineVk = lineHk * (1 + (item.margin || 0) / 100);
      hk += lineHk;
      vk += lineVk;
    }
    return { hk, vk };
  }

  // DOM refs
  let catalogListEl = null;
  let itemsBodyEl = null;
  let totalsEl = null;

  function renderCatalog() {
    if (!catalogListEl) return;
    catalogListEl.innerHTML = '';

    const filtered = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const scrollArea = document.createElement('div');
    scrollArea.style.cssText = 'flex:1;overflow-y:auto;padding:12px;';

    if (paginated.length === 0) {
      scrollArea.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:0.875rem;">No items found</div>';
    } else {
      paginated.forEach(lic => {
        const tag = getMeasurePointTag(lic.sku);
        const tColor = tag?.color || 'var(--primary)';
        const tBg = tag ? `${tag.color}20` : 'var(--primary-light)';
        const tText = tag?.tag?.toUpperCase() || 'LICENSE';

        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:all 0.15s;margin-bottom:8px;background:var(--surface);';
        item.addEventListener('mouseenter', () => { item.style.borderColor = 'var(--primary)'; item.style.background = 'var(--primary-light)'; });
        item.addEventListener('mouseleave', () => { item.style.borderColor = 'var(--border)'; item.style.background = 'var(--surface)'; });
        item.addEventListener('click', () => addItem(lic));

        const left = document.createElement('div');
        left.style.cssText = 'flex:1;display:flex;flex-direction:column;';
        // Badge row: type badge + product badge
        const badgeRow = document.createElement('div');
        badgeRow.style.cssText = 'display:flex;gap:4px;margin-bottom:2px;';
        // Type badge (BASE/MODULE/ADDON/DL)
        const TYPE_BADGE_COLORS = {
          BASE: { color: '#4f46e5', bg: '#eef2ff' },
          MODULE: { color: '#eab308', bg: '#fefce8' },
          ADDON: { color: '#f97316', bg: '#fff7ed' },
          DL: { color: '#06b6d4', bg: '#ecfeff' },
        };
        const tbc = TYPE_BADGE_COLORS[lic.type] || { color: 'var(--primary)', bg: 'var(--primary-light)' };
        const typeBadge = document.createElement('span');
        typeBadge.style.cssText = `font-size:0.55rem;font-weight:600;padding:1px 5px;border-radius:3px;background:${tbc.bg};color:${tbc.color};text-transform:uppercase;letter-spacing:0.03em;`;
        typeBadge.textContent = lic.type || 'LICENSE';
        badgeRow.appendChild(typeBadge);
        // Product badge (CORE/MONI/AS/DM/LOG/COLLAB)
        if (lic.product) {
          const prodBadge = document.createElement('span');
          prodBadge.style.cssText = 'font-size:0.55rem;font-weight:600;padding:1px 5px;border-radius:3px;background:#f3f4f6;color:#6b7280;text-transform:uppercase;letter-spacing:0.03em;';
          prodBadge.textContent = lic.product;
          badgeRow.appendChild(prodBadge);
        }
        // Measure point tag (if any)
        if (tag) {
          const mpBadge = document.createElement('span');
          mpBadge.style.cssText = `font-size:0.55rem;font-weight:600;padding:1px 5px;border-radius:3px;background:${tBg};color:${tColor};text-transform:uppercase;letter-spacing:0.03em;`;
          mpBadge.textContent = tText;
          badgeRow.appendChild(mpBadge);
        }
        left.appendChild(badgeRow);
        const nameEl = document.createElement('span');
        nameEl.style.cssText = 'font-weight:500;font-size:0.875rem;color:var(--text-main);';
        nameEl.textContent = lic.name;
        left.appendChild(nameEl);
        const skuEl = document.createElement('span');
        skuEl.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);font-family:monospace;';
        skuEl.textContent = lic.sku;
        left.appendChild(skuEl);
        item.appendChild(left);

        const priceEl = document.createElement('span');
        priceEl.style.cssText = 'font-weight:600;font-size:0.85rem;color:var(--text-main);white-space:nowrap;padding-left:8px;';
        priceEl.textContent = currency(lic.initial_price);
        item.appendChild(priceEl);
        scrollArea.appendChild(item);
      });
    }
    catalogListEl.appendChild(scrollArea);

    if (totalPages > 1) {
      const footer = document.createElement('div');
      footer.style.cssText = 'border-top:1px solid var(--border);background:var(--bg);flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;';
      const countEl = document.createElement('span');
      countEl.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);';
      countEl.textContent = `${filtered.length} items`;
      footer.appendChild(countEl);
      const pag = document.createElement('div');
      pag.style.cssText = 'display:flex;align-items:center;gap:8px;';
      const prevBtn = document.createElement('button');
      prevBtn.className = 'btn btn-sm btn-secondary';
      prevBtn.style.cssText = 'padding:4px 10px;font-size:0.75rem;min-width:60px;';
      prevBtn.textContent = 'Prev';
      prevBtn.disabled = currentPage === 1;
      prevBtn.addEventListener('click', () => { currentPage--; renderCatalog(); });
      pag.appendChild(prevBtn);
      const pageEl = document.createElement('span');
      pageEl.style.cssText = 'font-size:0.75rem;color:var(--text-main);min-width:60px;text-align:center;';
      pageEl.textContent = `${currentPage} / ${totalPages}`;
      pag.appendChild(pageEl);
      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn btn-sm btn-secondary';
      nextBtn.style.cssText = 'padding:4px 10px;font-size:0.75rem;min-width:60px;';
      nextBtn.textContent = 'Next';
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.addEventListener('click', () => { currentPage++; renderCatalog(); });
      pag.appendChild(nextBtn);
      footer.appendChild(pag);
      catalogListEl.appendChild(footer);
    }
  }

  function renderItemsTable() {
    if (!itemsBodyEl) return;
    itemsBodyEl.innerHTML = '';

    const licenseItems = wizardState.lineItems.filter(l => l.itemType !== 'servicepack');

    if (licenseItems.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 8;
      emptyCell.style.cssText = 'text-align:center;padding:40px;color:var(--text-secondary);font-size:0.875rem;';
      emptyCell.textContent = 'Click items in the catalog to add them to your quote.';
      emptyRow.appendChild(emptyCell);
      itemsBodyEl.appendChild(emptyRow);
    } else {
      // Determine tree depth: BASE/DL=0, MODULE=1, ADDON=2
      // Also check if current item is last child of its parent for connector line styling
      const getDepth = (item) => {
        if (item.type === 'ADDON') return 2;
        if (item.type === 'MODULE') return 1;
        return 0;
      };

      // Type badge colors
      const TYPE_COLORS = {
        BASE: { color: '#4f46e5', bg: '#eef2ff' },
        MODULE: { color: '#eab308', bg: '#fefce8' },
        ADDON: { color: '#f97316', bg: '#fff7ed' },
        DL: { color: '#06b6d4', bg: '#ecfeff' },
      };

      licenseItems.forEach((item, idx) => {
        const realIdx = wizardState.lineItems.indexOf(item);
        const depth = getDepth(item);
        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom:1px solid var(--border);';
        tr.addEventListener('mouseenter', () => { tr.style.background = 'var(--surface-hover)'; });
        tr.addEventListener('mouseleave', () => { tr.style.background = ''; });

        // Check if next sibling is also indented (for vertical line continuation)
        const nextItem = licenseItems[idx + 1];
        const nextDepth = nextItem ? getDepth(nextItem) : 0;
        const hasChildBelow = nextDepth > 0 && nextItem?.product === item.product;

        // SKU — with indent
        const tdSku = document.createElement('td');
        tdSku.style.cssText = 'padding:8px 12px;font-family:monospace;font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;';
        if (depth > 0) {
          const indent = document.createElement('span');
          indent.style.cssText = `display:inline-block;width:${depth * 20}px;position:relative;`;
          // Tree connector: vertical line + horizontal branch
          const connector = document.createElement('span');
          connector.style.cssText = `position:absolute;left:${(depth - 1) * 20 + 8}px;top:-12px;width:12px;height:20px;border-left:1px solid var(--border);border-bottom:1px solid var(--border);border-bottom-left-radius:4px;`;
          indent.appendChild(connector);
          tdSku.appendChild(indent);
        }
        const skuText = document.createElement('span');
        skuText.textContent = item.sku;
        tdSku.appendChild(skuText);
        tr.appendChild(tdSku);

        // Name — with type badge dot
        const tdName = document.createElement('td');
        tdName.style.cssText = 'padding:8px 12px;font-weight:500;font-size:0.875rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        const tc = TYPE_COLORS[item.type] || TYPE_COLORS.BASE;
        const typeDot = document.createElement('span');
        typeDot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;background:${tc.color};margin-right:6px;vertical-align:middle;flex-shrink:0;`;
        typeDot.title = item.type || 'LICENSE';
        tdName.appendChild(typeDot);
        const nameSpan = document.createElement('span');
        nameSpan.textContent = item.name;
        nameSpan.style.cssText = 'vertical-align:middle;';
        tdName.appendChild(nameSpan);
        tdName.title = item.name;
        tr.appendChild(tdName);

        // Qty
        const tdQty = document.createElement('td');
        tdQty.style.cssText = 'padding:8px 6px;';
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.min = '1';
        qtyInput.value = item.amount;
        qtyInput.style.cssText = 'width:60px;text-align:right;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:0.85rem;background:var(--surface);color:var(--text-main);';
        qtyInput.addEventListener('change', e => updateItem(realIdx, 'amount', Math.max(1, parseInt(e.target.value) || 1)));
        tdQty.appendChild(qtyInput);
        tr.appendChild(tdQty);

        // Unit Price
        const tdPrice = document.createElement('td');
        tdPrice.style.cssText = 'padding:8px 6px;';
        const priceInput = document.createElement('input');
        priceInput.type = 'number';
        priceInput.step = '0.01';
        priceInput.value = item.price;
        priceInput.style.cssText = 'width:90px;text-align:right;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:0.85rem;background:var(--surface);color:var(--text-main);';
        priceInput.addEventListener('change', e => updateItem(realIdx, 'price', parseFloat(e.target.value) || 0));
        tdPrice.appendChild(priceInput);
        tr.appendChild(tdPrice);

        // Margin %
        const tdMargin = document.createElement('td');
        tdMargin.style.cssText = 'padding:8px 6px;';
        const marginInput = document.createElement('input');
        marginInput.type = 'number';
        marginInput.step = '0.1';
        marginInput.value = item.margin;
        marginInput.style.cssText = 'width:60px;text-align:right;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:0.85rem;background:var(--surface);color:var(--text-main);';
        marginInput.addEventListener('change', e => updateItem(realIdx, 'margin', parseFloat(e.target.value) || 0));
        tdMargin.appendChild(marginInput);
        tr.appendChild(tdMargin);

        // Total HK
        const lineHk = item.price * item.amount;
        const tdHk = document.createElement('td');
        tdHk.style.cssText = 'padding:8px 12px;text-align:right;font-size:0.85rem;color:var(--text-secondary);';
        tdHk.textContent = currency(lineHk);
        tr.appendChild(tdHk);

        // Total VK
        const lineVk = lineHk * (1 + (item.margin || 0) / 100);
        const tdVk = document.createElement('td');
        tdVk.style.cssText = 'padding:8px 12px;text-align:right;font-weight:600;font-size:0.85rem;';
        tdVk.textContent = currency(lineVk);
        tr.appendChild(tdVk);

        // Actions
        const tdAct = document.createElement('td');
        tdAct.style.cssText = 'padding:8px 6px;text-align:center;';
        const delBtn = document.createElement('button');
        delBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;border-radius:4px;transition:all 0.15s;';
        delBtn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
        delBtn.addEventListener('mouseenter', () => { delBtn.style.color = '#ef4444'; delBtn.style.background = '#fef2f2'; });
        delBtn.addEventListener('mouseleave', () => { delBtn.style.color = 'var(--text-secondary)'; delBtn.style.background = 'none'; });
        delBtn.addEventListener('click', () => removeItem(realIdx));
        tdAct.appendChild(delBtn);
        tr.appendChild(tdAct);

        itemsBodyEl.appendChild(tr);
      });
    }

    renderTotals();
  }

  function renderTotals() {
    if (!totalsEl) return;
    const { hk, vk } = computeTotals();
    totalsEl.innerHTML = '';

    const card = (label, value, color) => {
      const d = document.createElement('div');
      d.style.cssText = `flex:1;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 16px;display:flex;flex-direction:column;align-items:center;`;
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:0.65rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;color:var(--text-secondary);';
      lbl.textContent = label;
      d.appendChild(lbl);
      const val = document.createElement('span');
      val.style.cssText = `font-size:1.2rem;font-weight:700;color:${color};`;
      val.textContent = currency(value);
      d.appendChild(val);
      return d;
    };

    totalsEl.appendChild(card('Total HK', hk, 'var(--text-main)'));
    totalsEl.appendChild(card('Total VK', vk, 'var(--text-main)'));
    totalsEl.appendChild(card('Margin', vk > 0 ? ((vk - hk) / vk * 100) : 0, 'var(--primary)'));
    // Fix margin display to show %
    totalsEl.lastChild.querySelector('span:last-child').textContent =
      (vk > 0 ? ((vk - hk) / vk * 100).toFixed(1) : '0.0') + '%';
  }

  function render() {
    el.innerHTML = '';

    // Left: Catalog
    const catalogPanel = document.createElement('div');
    catalogPanel.style.cssText = 'width:340px;flex-shrink:0;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;';

    const catalogHeader = document.createElement('div');
    catalogHeader.style.cssText = 'padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0;';
    const catalogTitle = document.createElement('h4');
    catalogTitle.style.cssText = 'margin:0 0 8px 0;font-size:0.95rem;color:var(--text-main);';
    catalogTitle.textContent = 'License Catalog';
    catalogHeader.appendChild(catalogTitle);

    // Level filter tabs
    const filterRow = document.createElement('div');
    filterRow.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;';
    const LEVEL_TABS = [
      { key: 'ALL', label: 'All' },
      { key: 'BASE', label: 'Base' },
      { key: 'MODULE', label: 'Module' },
      { key: 'ADDON', label: 'Add-on' },
      { key: 'DL', label: 'Device' },
    ];
    LEVEL_TABS.forEach(tab => {
      const btn = document.createElement('button');
      const isActive = levelFilter === tab.key;
      btn.style.cssText = `padding:3px 10px;border:1px solid ${isActive ? 'var(--primary)' : 'var(--border)'};border-radius:4px;font-size:0.7rem;font-weight:${isActive ? '600' : '500'};cursor:pointer;transition:all 0.15s;background:${isActive ? 'var(--primary)' : 'var(--surface)'};color:${isActive ? 'white' : 'var(--text-secondary)'};`;
      btn.textContent = tab.label;
      btn.addEventListener('click', () => { levelFilter = tab.key; currentPage = 1; render(); });
      filterRow.appendChild(btn);
    });
    catalogHeader.appendChild(filterRow);

    const searchInput = document.createElement('input');
    searchInput.placeholder = 'Search licenses...';
    searchInput.className = 'text-sm';
    searchInput.style.width = '100%';
    searchInput.value = search;
    searchInput.addEventListener('input', e => { search = e.target.value; currentPage = 1; renderCatalog(); });
    catalogHeader.appendChild(searchInput);
    catalogPanel.appendChild(catalogHeader);

    catalogListEl = document.createElement('div');
    catalogListEl.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;';
    catalogPanel.appendChild(catalogListEl);
    el.appendChild(catalogPanel);

    // Right: Items table + totals
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = 'flex:1;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;';

    // Summary totals bar
    totalsEl = document.createElement('div');
    totalsEl.style.cssText = 'display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0;';
    rightPanel.appendChild(totalsEl);

    // Items header
    const tableHeader = document.createElement('div');
    tableHeader.style.cssText = 'padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0;';
    const headerTitle = document.createElement('h4');
    headerTitle.style.cssText = 'margin:0;font-size:0.95rem;color:var(--text-main);';
    headerTitle.textContent = `Configuration Items (${wizardState.lineItems.filter(l => l.itemType !== 'servicepack').length})`;
    tableHeader.appendChild(headerTitle);
    rightPanel.appendChild(tableHeader);

    // Table
    const tableWrap = document.createElement('div');
    tableWrap.style.cssText = 'flex:1;overflow:auto;';
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.85rem;';

    const thead = document.createElement('thead');
    thead.innerHTML = `<tr style="background:var(--bg);position:sticky;top:0;z-index:1;">
      <th style="padding:8px 12px;text-align:left;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">SKU</th>
      <th style="padding:8px 12px;text-align:left;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Name</th>
      <th style="padding:8px 6px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Qty</th>
      <th style="padding:8px 6px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Unit Price</th>
      <th style="padding:8px 6px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Margin %</th>
      <th style="padding:8px 12px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Total HK</th>
      <th style="padding:8px 12px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Total VK</th>
      <th style="padding:8px 6px;width:40px;"></th>
    </tr>`;
    table.appendChild(thead);

    itemsBodyEl = document.createElement('tbody');
    table.appendChild(itemsBodyEl);
    tableWrap.appendChild(table);
    rightPanel.appendChild(tableWrap);
    el.appendChild(rightPanel);

    renderCatalog();
    renderItemsTable();
  }

  render();
  return { element: el, refresh: render };
}
