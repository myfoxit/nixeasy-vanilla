// Step 3: Services — Add service packs from catalog

import { currency } from '../../utils/format.js';
import { pb } from '../../api.js';

const DEFAULT_MARGIN = 25;

export function createStepServices({ wizardState, hourlyRate, onStateChange }) {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-direction:column;gap:16px;height:calc(100vh - 280px);min-height:400px;';

  let servicePacks = [];
  let loading = true;
  let search = '';

  async function loadServicePacks() {
    try {
      servicePacks = await pb.collection('service_packs').getFullList({ sort: 'package_name' });
    } catch (err) {
      console.error('Failed to load service packs:', err);
    }
    loading = false;
    render();
  }

  function getServiceItems() {
    return wizardState.lineItems.filter(l => l.itemType === 'servicepack');
  }

  function addServicePack(pack) {
    const items = wizardState.lineItems;
    const existing = items.find(l => l.itemType === 'servicepack' && l.servicePackId === pack.id);
    if (existing) {
      existing.amount = (existing.amount || 1) + 1;
    } else {
      items.push({
        servicePackId: pack.id,
        licenseId: null,
        name: pack.package_name,
        sku: pack.package_name,
        price: 0,
        amount: 1,
        margin: DEFAULT_MARGIN,
        hours: pack.estimated_hours || 0,
        sla: '',
        slaName: '',
        slaMonthly: 0,
        serviceMargin: 0,
        itemType: 'servicepack',
        containerId: null,
        _order: items.length,
      });
    }
    onStateChange();
    render();
  }

  function removeService(idx) {
    wizardState.lineItems.splice(idx, 1);
    onStateChange();
    render();
  }

  function computeServiceTotals() {
    let hk = 0, vk = 0, totalHours = 0;
    for (const item of getServiceItems()) {
      const itemHk = (item.hours || 0) * hourlyRate * item.amount;
      const itemVk = itemHk * (1 + (item.margin || 0) / 100);
      hk += itemHk;
      vk += itemVk;
      totalHours += (item.hours || 0) * item.amount;
    }
    return { hk, vk, totalHours };
  }

  function render() {
    el.innerHTML = '';

    if (loading) {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);">Loading service packs...</div>';
      return;
    }

    // Top bar: totals
    const { hk, vk, totalHours } = computeServiceTotals();
    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex;gap:12px;flex-shrink:0;';

    const mkCard = (label, value, color) => {
      const d = document.createElement('div');
      d.style.cssText = `flex:1;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 16px;display:flex;flex-direction:column;align-items:center;`;
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:0.65rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;color:var(--text-secondary);';
      lbl.textContent = label;
      d.appendChild(lbl);
      const val = document.createElement('span');
      val.style.cssText = `font-size:1.2rem;font-weight:700;color:${color};`;
      val.textContent = value;
      d.appendChild(val);
      return d;
    };

    topBar.appendChild(mkCard('Total Hours', `${totalHours}h`, 'var(--text-main)'));
    topBar.appendChild(mkCard('Total HK', currency(hk), 'var(--text-main)'));
    topBar.appendChild(mkCard('Total VK', currency(vk), 'var(--primary)'));
    el.appendChild(topBar);

    // Main panels
    const mainRow = document.createElement('div');
    mainRow.style.cssText = 'display:flex;gap:16px;flex:1;min-height:0;';

    // Left: Service catalog
    const catalogPanel = document.createElement('div');
    catalogPanel.style.cssText = 'width:340px;flex-shrink:0;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;';

    const catalogHeader = document.createElement('div');
    catalogHeader.style.cssText = 'padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0;';
    const catalogTitle = document.createElement('h4');
    catalogTitle.style.cssText = 'margin:0 0 8px 0;font-size:0.95rem;color:var(--text-main);';
    catalogTitle.textContent = 'Service Catalog';
    catalogHeader.appendChild(catalogTitle);

    const searchInput = document.createElement('input');
    searchInput.placeholder = 'Search service packs...';
    searchInput.className = 'text-sm';
    searchInput.style.width = '100%';
    searchInput.value = search;
    searchInput.addEventListener('input', e => { search = e.target.value; renderCatalogList(); });
    catalogHeader.appendChild(searchInput);
    catalogPanel.appendChild(catalogHeader);

    const catalogList = document.createElement('div');
    catalogList.style.cssText = 'flex:1;overflow-y:auto;padding:12px;';
    catalogPanel.appendChild(catalogList);

    function renderCatalogList() {
      catalogList.innerHTML = '';
      const q = search.toLowerCase();
      const filtered = servicePacks.filter(sp => sp.package_name.toLowerCase().includes(q));

      if (filtered.length === 0) {
        catalogList.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:0.875rem;">No service packs found</div>';
        return;
      }

      filtered.forEach(pack => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;flex-direction:column;padding:10px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:all 0.15s;margin-bottom:8px;background:var(--surface);';
        item.addEventListener('mouseenter', () => { item.style.borderColor = '#f59e0b'; item.style.background = '#fef3c7'; });
        item.addEventListener('mouseleave', () => { item.style.borderColor = 'var(--border)'; item.style.background = 'var(--surface)'; });
        item.addEventListener('click', () => addServicePack(pack));

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

        const badge = document.createElement('span');
        badge.style.cssText = 'font-size:0.55rem;font-weight:600;padding:1px 5px;border-radius:3px;background:#fef3c7;color:#f59e0b;text-transform:uppercase;';
        badge.textContent = 'SERVICE';

        const hoursTag = document.createElement('span');
        hoursTag.style.cssText = 'font-size:0.75rem;font-weight:600;color:#7c3aed;background:#f5f3ff;padding:2px 6px;border-radius:4px;';
        hoursTag.textContent = `${pack.estimated_hours}h`;
        topRow.appendChild(badge);
        topRow.appendChild(hoursTag);
        item.appendChild(topRow);

        const nameEl = document.createElement('span');
        nameEl.style.cssText = 'font-weight:500;font-size:0.875rem;color:var(--text-main);margin-top:4px;';
        nameEl.textContent = pack.package_name;
        item.appendChild(nameEl);

        catalogList.appendChild(item);
      });
    }
    renderCatalogList();
    mainRow.appendChild(catalogPanel);

    // Right: Allocated services
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = 'flex:1;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;';

    const rightHeader = document.createElement('div');
    rightHeader.style.cssText = 'padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0;';
    const rightTitle = document.createElement('h4');
    rightTitle.style.cssText = 'margin:0;font-size:0.95rem;color:var(--text-main);';
    rightTitle.textContent = `Allocated Services (${getServiceItems().length})`;
    rightHeader.appendChild(rightTitle);
    rightPanel.appendChild(rightHeader);

    const tableWrap = document.createElement('div');
    tableWrap.style.cssText = 'flex:1;overflow:auto;';

    const serviceItems = getServiceItems();

    if (serviceItems.length === 0) {
      tableWrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:0.875rem;">Click service packs from the catalog to add them.</div>';
    } else {
      const table = document.createElement('table');
      table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.85rem;';

      const thead = document.createElement('thead');
      thead.innerHTML = `<tr style="background:var(--bg);position:sticky;top:0;z-index:1;">
        <th style="padding:8px 12px;text-align:left;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Service Package</th>
        <th style="padding:8px 6px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Qty</th>
        <th style="padding:8px 6px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Est. Hours</th>
        <th style="padding:8px 6px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Margin %</th>
        <th style="padding:8px 12px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Total HK</th>
        <th style="padding:8px 12px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Total VK</th>
        <th style="padding:8px 6px;width:40px;"></th>
      </tr>`;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      serviceItems.forEach(item => {
        const realIdx = wizardState.lineItems.indexOf(item);
        const itemHk = (item.hours || 0) * hourlyRate * item.amount;
        const itemVk = itemHk * (1 + (item.margin || 0) / 100);

        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom:1px solid var(--border);';
        tr.addEventListener('mouseenter', () => { tr.style.background = 'var(--hover-bg)'; });
        tr.addEventListener('mouseleave', () => { tr.style.background = ''; });

        // Name
        const tdName = document.createElement('td');
        tdName.style.cssText = 'padding:8px 12px;font-weight:500;font-size:0.85rem;';
        tdName.textContent = item.name;
        tr.appendChild(tdName);

        // Qty
        const tdQty = document.createElement('td');
        tdQty.style.cssText = 'padding:8px 6px;';
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.min = '1';
        qtyInput.value = item.amount;
        qtyInput.style.cssText = 'width:60px;text-align:right;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:0.85rem;background:var(--surface);color:var(--text-main);';
        qtyInput.addEventListener('change', e => {
          wizardState.lineItems[realIdx].amount = Math.max(1, parseInt(e.target.value) || 1);
          onStateChange();
          render();
        });
        tdQty.appendChild(qtyInput);
        tr.appendChild(tdQty);

        // Hours
        const tdHours = document.createElement('td');
        tdHours.style.cssText = 'padding:8px 6px;';
        const hoursInput = document.createElement('input');
        hoursInput.type = 'number';
        hoursInput.min = '0.5';
        hoursInput.step = '0.5';
        hoursInput.value = item.hours || 0;
        hoursInput.style.cssText = 'width:70px;text-align:right;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:0.85rem;background:var(--surface);color:var(--text-main);';
        hoursInput.addEventListener('change', e => {
          wizardState.lineItems[realIdx].hours = parseFloat(e.target.value) || 0;
          onStateChange();
          render();
        });
        tdHours.appendChild(hoursInput);
        tr.appendChild(tdHours);

        // Margin
        const tdMargin = document.createElement('td');
        tdMargin.style.cssText = 'padding:8px 6px;';
        const marginInput = document.createElement('input');
        marginInput.type = 'number';
        marginInput.step = '0.1';
        marginInput.value = item.margin;
        marginInput.style.cssText = 'width:60px;text-align:right;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:0.85rem;background:var(--surface);color:var(--text-main);';
        marginInput.addEventListener('change', e => {
          wizardState.lineItems[realIdx].margin = parseFloat(e.target.value) || 0;
          onStateChange();
          render();
        });
        tdMargin.appendChild(marginInput);
        tr.appendChild(tdMargin);

        // Total HK
        const tdHk = document.createElement('td');
        tdHk.style.cssText = 'padding:8px 12px;text-align:right;color:var(--text-secondary);';
        tdHk.textContent = currency(itemHk);
        tr.appendChild(tdHk);

        // Total VK
        const tdVk = document.createElement('td');
        tdVk.style.cssText = 'padding:8px 12px;text-align:right;font-weight:600;';
        tdVk.textContent = currency(itemVk);
        tr.appendChild(tdVk);

        // Remove
        const tdAct = document.createElement('td');
        tdAct.style.cssText = 'padding:8px 6px;text-align:center;';
        const delBtn = document.createElement('button');
        delBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;border-radius:4px;transition:all 0.15s;';
        delBtn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
        delBtn.addEventListener('mouseenter', () => { delBtn.style.color = '#ef4444'; delBtn.style.background = '#fef2f2'; });
        delBtn.addEventListener('mouseleave', () => { delBtn.style.color = 'var(--text-secondary)'; delBtn.style.background = 'none'; });
        delBtn.addEventListener('click', () => removeService(realIdx));
        tdAct.appendChild(delBtn);
        tr.appendChild(tdAct);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
    }

    rightPanel.appendChild(tableWrap);
    mainRow.appendChild(rightPanel);
    el.appendChild(mainRow);
  }

  loadServicePacks();
  return { element: el, refresh: render };
}
