// unified-grid.js
// Merged quote-lines + presentation grid.
// Catalog on the left feeds directly into this grid.
// Supports: groups (collapsible), SLA dropdown, dependency warnings, quick-add, inline editing.

import { currency } from '../utils/format.js';
import { getMeasurePointTag } from '../utils/license-calculations.js';
import { showToast } from '../components/toast.js';
import { showConfirmModal } from '../components/modal.js';

const GRIP_ICON = `<svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor" style="opacity:0.35;">
  <circle cx="4" cy="4" r="1.5"/><circle cx="8" cy="4" r="1.5"/>
  <circle cx="4" cy="10" r="1.5"/><circle cx="8" cy="10" r="1.5"/>
  <circle cx="4" cy="16" r="1.5"/><circle cx="8" cy="16" r="1.5"/>
</svg>`;

/**
 * Create the unified quote grid (configurator + presentation merged).
 *
 * @param {Object} opts
 * @param {Array}   opts.licenses
 * @param {Array}   opts.servicePacks
 * @param {boolean} opts.isTemplateMode
 * @param {number}  opts.hourlyRate
 * @param {Function} opts.onSummaryChange  - called with {hk, vk, monthly} after every change
 * @returns {{ element, addItem, getLineItems, getGroups, getSummary, loadItems, update }}
 */
export function createUnifiedGrid({
  licenses = [],
  servicePacks = [],
  isTemplateMode = false,
  hourlyRate = 150,
  onSummaryChange = null,
}) {
  const el = document.createElement('div');
  el.className = 'card';
  el.style.cssText = 'background:var(--surface);overflow:hidden;min-height:400px;';

  // ── Internal state ──────────────────────────────────────────────
  // rows: sorted by .order
  // type === 'group'  → { id, type, name, order }
  // type === 'item'   → { id, type, licenseId, name, sku, price, amount, margin, sla, itemType, hours, groupId, order }
  let rows = [];
  let collapsedGroups = new Set();

  // Drag state
  let dragId = null;
  let dropGap = null; // index into sorted visible rows

  let _idSeq = 0;
  function genId(prefix) { return `${prefix}-${++_idSeq}-${Math.random().toString(36).slice(2, 6)}`; }

  // ── Helpers ─────────────────────────────────────────────────────

  function sorted() {
    return [...rows].sort((a, b) => a.order - b.order);
  }

  function itemRows() {
    return rows.filter(r => r.type === 'item');
  }

  function groupRows() {
    return rows.filter(r => r.type === 'group');
  }

  function reindex() {
    sorted().forEach((r, i) => { r.order = i; });
  }

  function calcTotal(row) {
    if (row.itemType === 'servicepack') {
      return (row.hours || 0) * hourlyRate * row.amount * (1 + row.margin / 100);
    }
    return row.price * row.amount * (1 + row.margin / 100);
  }

  function calcMonthly(row) {
    if (row.itemType === 'servicepack') return 0;
    const lic = licenses.find(l => l.id === row.licenseId);
    const sla = lic?.expand?.possible_SLAs?.find(s => s.id === row.sla);
    return sla ? calcTotal(row) * (sla.monthly_percentage / 100) : 0;
  }

  function getMissingDeps(row) {
    if (row.itemType === 'servicepack' || !row.licenseId) return [];
    const lic = licenses.find(l => l.id === row.licenseId);
    if (!lic?.depends_on?.length) return [];
    const presentIds = new Set(itemRows().map(r => r.licenseId));
    return lic.depends_on
      .filter(id => !presentIds.has(id))
      .map(id => licenses.find(l => l.id === id))
      .filter(Boolean);
  }

  function notifySummary() {
    if (onSummaryChange) onSummaryChange(getSummary());
  }

  // ── Public API ───────────────────────────────────────────────────

  function addItem(catalogItem) {
    // Auto-create a Default group if none exist
    if (groupRows().length === 0) {
      const grp = { id: genId('grp'), type: 'group', name: 'Default', order: 0 };
      rows.push(grp);
      reindex();
    }

    const lastGroup = sorted().filter(r => r.type === 'group').slice(-1)[0];

    if (catalogItem.type === 'license') {
      const lic = catalogItem.item;
      const slas = lic.expand?.possible_SLAs || [];
      const defaultSla = slas.find(s => s.name.toLowerCase().includes('essential'))?.id || slas[0]?.id || '';

      // Increment qty if already in same group
      const existing = rows.find(r =>
        r.type === 'item' && r.licenseId === lic.id && r.groupId === lastGroup?.id
      );
      if (existing) {
        existing.amount++;
        reindex();
        render();
        notifySummary();
        return;
      }

      rows.push({
        id: genId('item'), type: 'item',
        licenseId: lic.id, name: lic.name, sku: lic.sku,
        price: lic.initial_price, amount: 1, margin: 25,
        sla: defaultSla, itemType: 'license', hours: undefined,
        groupId: lastGroup?.id || null, order: rows.length,
      });

    } else {
      const sp = catalogItem.item;
      rows.push({
        id: genId('item'), type: 'item',
        licenseId: sp.id, name: sp.package_name, sku: sp.id,
        price: (sp.estimated_hours || 0) * hourlyRate, amount: 1, margin: 25,
        sla: '', itemType: 'servicepack', hours: sp.estimated_hours || 0,
        groupId: lastGroup?.id || null, order: rows.length,
      });
    }

    reindex();
    render();
    notifySummary();
  }

  function removeItem(id) {
    rows = rows.filter(r => r.id !== id);
    reindex();
    render();
    notifySummary();
  }

  function updateField(id, field, val) {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    row[field] = val;
    if (field === 'hours' && row.itemType === 'servicepack') {
      row.price = (val || 0) * hourlyRate;
    }
    render();
    notifySummary();
  }

  function addGroup(name = 'New Group') {
    const grp = { id: genId('grp'), type: 'group', name, order: rows.length };
    rows.push(grp);
    reindex();
    render();
    return grp.id;
  }

  function removeGroup(id) {
    rows.forEach(r => { if (r.type === 'item' && r.groupId === id) r.groupId = null; });
    rows = rows.filter(r => !(r.type === 'group' && r.id === id));
    reindex();
    render();
    notifySummary();
  }

  function addEmptyRowAfter(afterId) {
    const after = rows.find(r => r.id === afterId);
    const emptyRow = {
      id: genId('item'), type: 'item',
      licenseId: null, name: '', sku: '',
      price: 0, amount: 1, margin: 25,
      sla: '', itemType: 'license', hours: undefined,
      groupId: after?.groupId || null,
      order: (after?.order || 0) + 0.5,
    };
    const idx = rows.findIndex(r => r.id === afterId);
    if (idx >= 0) rows.splice(idx + 1, 0, emptyRow);
    else rows.push(emptyRow);
    reindex();
    render();
  }

  function loadItems(lineItems = [], groups = []) {
    rows = [];
    groups.forEach((g, i) => {
      rows.push({ id: g.id, type: 'group', name: g.name, order: i });
    });
    lineItems.forEach((item, i) => {
      rows.push({
        id: genId('item'), type: 'item',
        licenseId: item.licenseId, name: item.name, sku: item.sku,
        price: item.price, amount: item.amount, margin: item.margin,
        sla: item.sla || '', itemType: item.itemType || 'license',
        hours: item.hours,
        groupId: item.containerId || item.groupId || null,
        order: groups.length + i,
      });
    });
    reindex();
    render();
    notifySummary();
  }

  function getLineItems() {
    return itemRows().map(r => ({
      licenseId: r.licenseId,
      name: r.name,
      sku: r.sku,
      price: r.price,
      amount: r.amount,
      margin: r.margin,
      sla: r.sla,
      itemType: r.itemType,
      hours: r.hours,
      containerId: r.groupId,
    }));
  }

  function getGroups() {
    return groupRows().map(r => ({ id: r.id, name: r.name }));
  }

  function getSummary() {
    let hk = 0, vk = 0, monthly = 0;
    itemRows().forEach(row => {
      if (row.itemType === 'servicepack') {
        const lineHk = (row.hours || 0) * hourlyRate * row.amount;
        hk += lineHk;
        vk += lineHk * (1 + row.margin / 100);
      } else {
        const lineHk = row.price * row.amount;
        const lineVk = lineHk * (1 + row.margin / 100);
        hk += lineHk;
        vk += lineVk;
        monthly += calcMonthly(row);
      }
    });
    return { hk, vk, monthly };
  }

  // ── SLA dropdown ─────────────────────────────────────────────────

  function openSlaDropdown(row, triggerEl) {
    document.querySelectorAll('.sla-dropdown').forEach(d => d.remove());

    const lic = licenses.find(l => l.id === row.licenseId);
    const slas = lic?.expand?.possible_SLAs || [];

    const dropdown = document.createElement('div');
    dropdown.className = 'sla-dropdown';
    const rect = triggerEl.getBoundingClientRect();
    dropdown.style.cssText = [
      `position:fixed;top:${rect.bottom + 2}px;left:${rect.left}px`,
      'z-index:1000;min-width:170px',
      'background:var(--surface);border:1px solid var(--border)',
      'border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.12);overflow:hidden',
    ].join(';') + ';';

    [{ value: '', label: 'None' }, ...slas.map(s => ({ value: s.id, label: s.name }))].forEach(opt => {
      const optEl = document.createElement('div');
      const isActive = opt.value === (row.sla || '');
      optEl.style.cssText = [
        'padding:8px 14px;cursor:pointer;font-size:0.82rem',
        `color:${isActive ? 'var(--primary)' : 'var(--text-main)'}`,
        `font-weight:${isActive ? '600' : '400'}`,
        `background:${isActive ? 'var(--primary-light)' : 'transparent'}`,
      ].join(';') + ';';
      optEl.textContent = opt.label;
      optEl.addEventListener('mouseenter', () => { if (!isActive) optEl.style.background = 'var(--bg)'; });
      optEl.addEventListener('mouseleave', () => { if (!isActive) optEl.style.background = 'transparent'; });
      optEl.addEventListener('click', (e) => {
        e.stopPropagation();
        updateField(row.id, 'sla', opt.value);
        dropdown.remove();
      });
      dropdown.appendChild(optEl);
    });

    document.body.appendChild(dropdown);

    const close = (e) => {
      if (!dropdown.contains(e.target) && e.target !== triggerEl) {
        dropdown.remove();
        document.removeEventListener('click', close, true);
      }
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
  }

  // ── Row builders ─────────────────────────────────────────────────

  function buildGroupRow(grp, allSorted) {
    const groupItems = allSorted.filter(r => r.type === 'item' && r.groupId === grp.id);
    const isCollapsed = collapsedGroups.has(grp.id);
    const subtotal = groupItems.reduce((s, r) => s + calcTotal(r), 0);
    const subMonthly = groupItems.reduce((s, r) => s + calcMonthly(r), 0);

    const tr = document.createElement('tr');
    tr.className = 'ug-group-row';
    tr.dataset.rowId = grp.id;
    tr.draggable = true;
    tr.style.cssText = 'background:var(--bg);border-top:2px solid var(--border);user-select:none;';

    // Drag
    const tdDrag = document.createElement('td');
    tdDrag.style.cssText = 'padding:8px 4px;cursor:grab;text-align:center;color:var(--text-secondary);';
    tdDrag.innerHTML = GRIP_ICON;
    tr.appendChild(tdDrag);

    // Name (spans item+SLA+qty+price+margin = 5 cols)
    const tdName = document.createElement('td');
    tdName.colSpan = 5;
    tdName.style.cssText = 'padding:6px 10px;';

    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;align-items:center;gap:6px;';

    // Chevron
    const chev = document.createElement('button');
    chev.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px;color:var(--text-secondary);display:flex;align-items:center;flex-shrink:0;';
    chev.innerHTML = isCollapsed
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';
    chev.addEventListener('click', (e) => {
      e.stopPropagation();
      if (collapsedGroups.has(grp.id)) collapsedGroups.delete(grp.id);
      else collapsedGroups.add(grp.id);
      render();
    });
    row1.appendChild(chev);

    // Editable group name
    const nameInp = document.createElement('input');
    nameInp.type = 'text';
    nameInp.value = grp.name;
    nameInp.style.cssText = 'border:none;background:transparent;font-weight:600;font-size:0.85rem;color:var(--text-main);outline:none;flex:1;min-width:60px;';
    nameInp.addEventListener('click', e => e.stopPropagation());
    nameInp.addEventListener('change', (e) => { grp.name = e.target.value.trim() || 'Group'; });
    row1.appendChild(nameInp);

    if (isCollapsed && groupItems.length > 0) {
      const badge = document.createElement('span');
      badge.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);font-weight:400;';
      badge.textContent = `(${groupItems.length} item${groupItems.length === 1 ? '' : 's'})`;
      row1.appendChild(badge);
    }

    // "Add row" button
    const addRowBtn = document.createElement('button');
    addRowBtn.className = 'btn btn-ghost btn-sm';
    addRowBtn.style.cssText = 'font-size:0.68rem;padding:2px 6px;color:var(--text-secondary);margin-left:4px;';
    addRowBtn.textContent = '+ row';
    addRowBtn.title = 'Insert empty row in this group';
    addRowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Insert empty row as last item in group
      const lastInGroup = allSorted.filter(r => r.type === 'item' && r.groupId === grp.id).slice(-1)[0];
      const emptyRow = {
        id: genId('item'), type: 'item',
        licenseId: null, name: '', sku: '',
        price: 0, amount: 1, margin: 25,
        sla: '', itemType: 'license', hours: undefined,
        groupId: grp.id,
        order: lastInGroup ? lastInGroup.order + 0.5 : grp.order + 0.5,
      };
      rows.push(emptyRow);
      reindex();
      render();
    });
    row1.appendChild(addRowBtn);

    tdName.appendChild(row1);
    tr.appendChild(tdName);

    // Subtotal
    const tdTotal = document.createElement('td');
    tdTotal.style.cssText = 'padding:8px 12px;text-align:right;font-weight:600;font-size:0.85rem;color:var(--text-main);white-space:nowrap;';
    tdTotal.textContent = groupItems.length > 0 ? currency(subtotal) : '';
    tr.appendChild(tdTotal);

    // Monthly
    const tdMonthly = document.createElement('td');
    tdMonthly.style.cssText = 'padding:8px 12px;text-align:right;font-size:0.8rem;color:var(--primary);white-space:nowrap;';
    tdMonthly.textContent = subMonthly > 0 ? currency(subMonthly) : '';
    tr.appendChild(tdMonthly);

    // Remove group
    const tdAct = document.createElement('td');
    tdAct.style.cssText = 'padding:8px;text-align:center;';
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost btn-sm';
    delBtn.style.cssText = 'color:var(--text-secondary);font-size:1rem;padding:0 6px;';
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Remove group (items stay)';
    delBtn.addEventListener('click', () => {
      if (groupItems.length > 0) {
        showConfirmModal({
          title: 'Remove Group',
          message: `Remove group "${grp.name}"? The ${groupItems.length} item(s) inside will become ungrouped.`,
          confirmText: 'Remove',
          variant: 'warning',
          onConfirm: () => removeGroup(grp.id),
        });
      } else {
        removeGroup(grp.id);
      }
    });
    tdAct.appendChild(delBtn);
    tr.appendChild(tdAct);

    return tr;
  }

  function buildItemRow(row, isGrouped) {
    const lic = (row.itemType !== 'servicepack' && row.licenseId)
      ? licenses.find(l => l.id === row.licenseId) : null;
    const slas = lic?.expand?.possible_SLAs || [];
    const currentSla = slas.find(s => s.id === row.sla);

    const tag = row.itemType !== 'servicepack' ? getMeasurePointTag(row.sku) : null;
    const tagColor = tag?.color || (row.itemType === 'servicepack' ? '#f59e0b' : 'var(--primary)');
    const tagBg   = tag ? `${tag.color}20` : (row.itemType === 'servicepack' ? '#fef3c7' : 'var(--primary-light)');
    const tagText = tag?.tag?.toUpperCase() || (row.itemType === 'servicepack' ? 'SERVICE' : (lic?.type || 'LIC'));

    const total   = calcTotal(row);
    const monthly = calcMonthly(row);

    const tr = document.createElement('tr');
    tr.className = 'ug-item-row';
    tr.dataset.rowId = row.id;
    tr.draggable = true;
    tr.style.cssText = `border-top:1px solid var(--border);${isGrouped ? '' : ''}`;

    // Drag handle
    const tdDrag = document.createElement('td');
    tdDrag.style.cssText = `padding:6px 4px;cursor:grab;text-align:center;${isGrouped ? 'padding-left:20px;' : ''}`;
    tdDrag.innerHTML = GRIP_ICON;
    tr.appendChild(tdDrag);

    // Item: tag badge + editable name + sku
    const tdItem = document.createElement('td');
    tdItem.style.cssText = `padding:6px 10px;${isGrouped ? 'padding-left:28px;' : ''}`;

    const badge = document.createElement('span');
    badge.style.cssText = `font-size:0.52rem;font-weight:700;padding:1px 5px;border-radius:3px;background:${tagBg};color:${tagColor};text-transform:uppercase;letter-spacing:0.04em;margin-right:6px;vertical-align:middle;`;
    badge.textContent = tagText;
    tdItem.appendChild(badge);

    // Editable name (contenteditable for smooth UX)
    const nameSpan = document.createElement('span');
    nameSpan.contentEditable = 'true';
    nameSpan.style.cssText = 'font-weight:500;font-size:0.875rem;color:var(--text-main);outline:none;';
    nameSpan.textContent = row.name;
    nameSpan.addEventListener('blur', () => {
      const v = nameSpan.textContent.trim();
      if (v !== row.name) { row.name = v; notifySummary(); }
    });
    nameSpan.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); } });
    tdItem.appendChild(nameSpan);

    if (row.sku) {
      const sku = document.createElement('div');
      sku.style.cssText = 'font-size:0.68rem;color:var(--text-secondary);font-family:monospace;margin-top:1px;';
      sku.textContent = row.sku;
      tdItem.appendChild(sku);
    }
    tr.appendChild(tdItem);

    // SLA / Hours
    const tdSla = document.createElement('td');
    tdSla.style.cssText = 'padding:6px 10px;';

    if (row.itemType === 'servicepack') {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
      const hInp = document.createElement('input');
      hInp.type = 'number'; hInp.min = '0.5'; hInp.step = '0.5';
      hInp.value = row.hours || 0;
      hInp.style.cssText = 'width:54px;padding:3px 6px;font-size:0.8rem;background:var(--surface);color:var(--text-main);border:1px solid var(--border);border-radius:4px;';
      hInp.addEventListener('change', e => updateField(row.id, 'hours', parseFloat(e.target.value) || 0));
      wrap.appendChild(hInp);
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);';
      lbl.textContent = 'hrs';
      wrap.appendChild(lbl);
      tdSla.appendChild(wrap);
    } else if (slas.length > 0) {
      const slaTag = document.createElement('span');
      slaTag.className = 'sla-tag';
      slaTag.style.cssText = 'cursor:pointer;';
      slaTag.textContent = currentSla?.name || 'None';
      slaTag.title = 'Click to change SLA';
      slaTag.addEventListener('click', e => { e.stopPropagation(); openSlaDropdown(row, slaTag); });
      tdSla.appendChild(slaTag);
    } else {
      const dash = document.createElement('span');
      dash.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);';
      dash.textContent = '—';
      tdSla.appendChild(dash);
    }
    tr.appendChild(tdSla);

    // Qty
    const tdQty = document.createElement('td');
    tdQty.style.cssText = 'padding:6px 10px;';
    const qInp = document.createElement('input');
    qInp.type = 'number'; qInp.min = '1';
    qInp.value = row.amount;
    qInp.style.cssText = 'width:62px;padding:3px 6px;font-size:0.8rem;background:var(--surface);color:var(--text-main);border:1px solid var(--border);border-radius:4px;';
    qInp.addEventListener('change', e => updateField(row.id, 'amount', parseInt(e.target.value) || 1));
    tdQty.appendChild(qInp);
    tr.appendChild(tdQty);

    // Unit Price
    const tdPrice = document.createElement('td');
    tdPrice.style.cssText = 'padding:6px 10px;';
    const pInp = document.createElement('input');
    pInp.type = 'number'; pInp.min = '0'; pInp.step = '0.01';
    pInp.value = row.price.toFixed(2);
    pInp.style.cssText = 'width:88px;padding:3px 6px;font-size:0.8rem;background:var(--surface);color:var(--text-main);border:1px solid var(--border);border-radius:4px;';
    pInp.addEventListener('change', e => updateField(row.id, 'price', parseFloat(e.target.value) || 0));
    tdPrice.appendChild(pInp);
    tr.appendChild(tdPrice);

    // Margin
    const tdMargin = document.createElement('td');
    tdMargin.style.cssText = 'padding:6px 10px;';
    const mInp = document.createElement('input');
    mInp.type = 'number'; mInp.step = '0.5';
    mInp.value = row.margin;
    mInp.style.cssText = 'width:62px;padding:3px 6px;font-size:0.8rem;background:var(--surface);color:var(--text-main);border:1px solid var(--border);border-radius:4px;';
    mInp.addEventListener('change', e => updateField(row.id, 'margin', parseFloat(e.target.value) || 0));
    tdMargin.appendChild(mInp);
    tr.appendChild(tdMargin);

    // Total
    const tdTotal = document.createElement('td');
    tdTotal.style.cssText = 'padding:6px 12px;text-align:right;font-weight:500;font-size:0.875rem;color:var(--text-main);white-space:nowrap;';
    tdTotal.textContent = currency(total);
    tr.appendChild(tdTotal);

    // Monthly
    const tdMonthly = document.createElement('td');
    tdMonthly.style.cssText = 'padding:6px 12px;text-align:right;font-size:0.78rem;white-space:nowrap;';
    if (monthly > 0) { tdMonthly.style.color = 'var(--primary)'; tdMonthly.textContent = currency(monthly); }
    tr.appendChild(tdMonthly);

    // Actions
    const tdAct = document.createElement('td');
    tdAct.style.cssText = 'padding:6px 8px;text-align:center;white-space:nowrap;';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost btn-sm';
    delBtn.innerHTML = '&times;';
    delBtn.style.cssText = 'font-size:1.1rem;line-height:1;padding:0 6px;color:var(--text-secondary);';
    delBtn.title = 'Remove row';
    delBtn.addEventListener('click', () => {
      showConfirmModal({
        title: 'Remove Item',
        message: `Remove "${row.name || 'this item'}" from the quote?`,
        confirmText: 'Remove', variant: 'warning',
        onConfirm: () => removeItem(row.id),
      });
    });
    tdAct.appendChild(delBtn);
    tr.appendChild(tdAct);

    return tr;
  }

  function buildDepRow(row, missingDeps) {
    const tr = document.createElement('tr');
    tr.style.cssText = 'background:#fef9e7;';

    const td = document.createElement('td');
    td.colSpan = 9;
    td.style.cssText = 'padding:4px 12px 8px 44px;';

    const box = document.createElement('div');
    box.style.cssText = [
      'display:flex;flex-wrap:wrap;gap:6px;align-items:center',
      'padding:6px 10px;background:#fef3c7',
      'border-radius:5px;border:1px solid #fcd34d',
    ].join(';') + ';';

    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:0.7rem;color:#92400e;font-weight:600;';
    lbl.textContent = '⚠ Requires:';
    box.appendChild(lbl);

    missingDeps.forEach(dep => {
      const btn = document.createElement('button');
      btn.style.cssText = 'padding:3px 8px;font-size:0.72rem;background:white;border:1px solid #fcd34d;border-radius:4px;cursor:pointer;color:#92400e;font-weight:500;transition:all 0.12s;';
      btn.textContent = `+ ${dep.name}`;
      btn.addEventListener('mouseenter', () => { btn.style.background = '#f59e0b'; btn.style.color = 'white'; btn.style.borderColor = '#f59e0b'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'white'; btn.style.color = '#92400e'; btn.style.borderColor = '#fcd34d'; });
      btn.addEventListener('click', () => addItem({ type: 'license', item: dep }));
      box.appendChild(btn);
    });

    td.appendChild(box);
    tr.appendChild(td);
    return tr;
  }

  function buildGrandTotalRow(total, monthly) {
    const tr = document.createElement('tr');
    tr.style.cssText = 'border-top:2px solid var(--border);background:var(--bg);';

    tr.appendChild(document.createElement('td')); // drag

    const tdLabel = document.createElement('td');
    tdLabel.colSpan = 5;
    tdLabel.style.cssText = 'padding:10px 12px;font-weight:700;font-size:0.9rem;text-align:right;color:var(--text-main);';
    tdLabel.textContent = 'Grand Total';
    tr.appendChild(tdLabel);

    const tdTotal = document.createElement('td');
    tdTotal.style.cssText = 'padding:10px 12px;text-align:right;font-weight:700;font-size:0.9rem;color:var(--text-main);white-space:nowrap;';
    tdTotal.textContent = currency(total);
    tr.appendChild(tdTotal);

    const tdMonthly = document.createElement('td');
    tdMonthly.style.cssText = 'padding:10px 12px;text-align:right;font-size:0.85rem;color:var(--primary);font-weight:700;white-space:nowrap;';
    tdMonthly.textContent = monthly > 0 ? currency(monthly) : '';
    tr.appendChild(tdMonthly);

    tr.appendChild(document.createElement('td')); // actions
    return tr;
  }

  // ── Drag & drop ──────────────────────────────────────────────────

  function setupDrag(tbody) {
    let indicator = null;

    tbody.addEventListener('dragstart', e => {
      const tr = e.target.closest('tr[data-row-id]');
      if (!tr) return;
      dragId = tr.dataset.rowId;
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => tr.classList.add('ug-dragging'));
    });

    tbody.addEventListener('dragover', e => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const trs = [...tbody.querySelectorAll('tr[data-row-id]:not(.ug-dragging)')];
      if (!trs.length) return;

      let bestIdx = 0, bestDist = Infinity;
      trs.forEach((tr, i) => {
        const rect = tr.getBoundingClientRect();
        const mid = (rect.top + rect.bottom) / 2;
        const dist = Math.abs(e.clientY - mid);
        if (dist < bestDist) { bestDist = dist; bestIdx = e.clientY < mid ? i : i + 1; }
      });
      dropGap = bestIdx;

      // Move or create indicator
      if (!indicator) {
        indicator = document.createElement('tr');
        indicator.style.cssText = 'height:0;';
        indicator.innerHTML = `<td colspan="9" style="padding:0;height:2px;background:var(--primary);border-radius:2px;"></td>`;
      }
      const insertBefore = trs[bestIdx] || null;
      tbody.insertBefore(indicator, insertBefore);
    });

    tbody.addEventListener('dragleave', e => {
      if (!tbody.contains(e.relatedTarget)) {
        indicator?.remove();
        indicator = null;
        dropGap = null;
      }
    });

    tbody.addEventListener('drop', e => {
      e.preventDefault();
      indicator?.remove();
      indicator = null;
      tbody.querySelectorAll('.ug-dragging').forEach(r => r.classList.remove('ug-dragging'));

      if (!dragId || dropGap == null) { dragId = null; return; }

      const allSorted = sorted();
      const dragRow = rows.find(r => r.id === dragId);
      if (!dragRow) { dragId = null; return; }

      const visibleIds = [...tbody.querySelectorAll('tr[data-row-id]')].map(r => r.dataset.rowId);
      const dragVisIdx = visibleIds.indexOf(dragId);
      if (dragVisIdx === dropGap || dragVisIdx + 1 === dropGap) { dragId = null; return; }

      // Reorder: move dragRow to gap position
      const reordered = visibleIds.filter(id => id !== dragId);
      const insertIdx = dropGap > dragVisIdx ? dropGap - 1 : dropGap;
      reordered.splice(insertIdx, 0, dragId);

      // Apply new order to rows
      reordered.forEach((id, i) => {
        const r = rows.find(row => row.id === id);
        if (r) r.order = i;
      });
      // Rows not in visibleIds (e.g., items inside collapsed groups) keep their relative order
      rows.filter(r => !visibleIds.includes(r.id)).forEach((r, i) => {
        r.order = reordered.length + i;
      });

      // If a non-group row is dropped right after a group header, assign it to that group
      if (dragRow.type === 'item') {
        const insertedAfterIdx = insertIdx - 1;
        const afterId = reordered[insertedAfterIdx];
        if (afterId) {
          const afterRow = rows.find(r => r.id === afterId);
          if (afterRow?.type === 'group') {
            dragRow.groupId = afterRow.id;
          } else if (afterRow?.type === 'item') {
            dragRow.groupId = afterRow.groupId || null;
          }
        } else {
          dragRow.groupId = null;
        }
      }

      dragId = null;
      dropGap = null;
      reindex();
      render();
      notifySummary();
    });

    tbody.addEventListener('dragend', () => {
      indicator?.remove();
      indicator = null;
      tbody.querySelectorAll('.ug-dragging').forEach(r => r.classList.remove('ug-dragging'));
      dragId = null;
      dropGap = null;
    });
  }

  // ── Render ───────────────────────────────────────────────────────

  function render() {
    el.innerHTML = '';

    // Card header
    const cardHeader = document.createElement('div');
    cardHeader.style.cssText = 'padding:10px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:var(--bg);';

    const title = document.createElement('h3');
    title.style.cssText = 'margin:0;font-size:0.95rem;color:var(--text-main);';
    title.textContent = isTemplateMode ? 'Template Lines' : 'Quote Lines';
    cardHeader.appendChild(title);

    const headerRight = document.createElement('div');
    headerRight.style.cssText = 'display:flex;gap:8px;align-items:center;';

    const cnt = itemRows().length;
    const cntSpan = document.createElement('span');
    cntSpan.style.cssText = 'font-size:0.73rem;color:var(--text-secondary);';
    cntSpan.textContent = `${cnt} ${cnt === 1 ? 'item' : 'items'}`;
    headerRight.appendChild(cntSpan);

    const addGrpBtn = document.createElement('button');
    addGrpBtn.className = 'btn btn-secondary btn-sm';
    addGrpBtn.textContent = '+ Group';
    addGrpBtn.addEventListener('click', () => addGroup());
    headerRight.appendChild(addGrpBtn);

    cardHeader.appendChild(headerRight);
    el.appendChild(cardHeader);

    // Empty state
    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:3rem 2rem;color:var(--text-secondary);';
      empty.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor"
             style="width:44px;height:44px;margin:0 auto 14px;opacity:0.35;display:block;">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"/>
        </svg>
        <p style="font-size:0.9rem;margin-bottom:6px;font-weight:500;">No items yet</p>
        <p style="font-size:0.8rem;">Click items in the catalog to add them, or use <strong>+ Group</strong> to organise.</p>`;
      el.appendChild(empty);
      return;
    }

    // Table
    const tableWrap = document.createElement('div');
    tableWrap.style.cssText = 'overflow-x:auto;';

    const table = document.createElement('table');
    table.className = 'w-full';
    table.style.cssText = 'border-collapse:collapse;table-layout:auto;';

    // thead
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const cols = [
      { text: '',          w: '28px' },
      { text: 'Item',      w: '' },
      { text: 'SLA',       w: '115px' },
      { text: 'Qty',       w: '80px' },
      { text: 'Unit Price',w: '110px' },
      { text: 'Margin %',  w: '90px' },
      { text: 'Total',     w: '120px', right: true },
      { text: 'Monthly',   w: '105px', right: true },
      { text: '',          w: '44px' },
    ];
    cols.forEach(c => {
      const th = document.createElement('th');
      th.style.cssText = `${c.w ? 'width:' + c.w + ';' : ''}${c.right ? 'text-align:right;' : ''}`;
      th.textContent = c.text;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const allSorted = sorted();
    let grandTotal = 0, grandMonthly = 0;

    allSorted.forEach(row => {
      if (row.type === 'group') {
        tbody.appendChild(buildGroupRow(row, allSorted));
      } else if (row.type === 'item') {
        const collapsed = row.groupId && collapsedGroups.has(row.groupId);
        if (!collapsed) {
          tbody.appendChild(buildItemRow(row, !!row.groupId));
          const deps = getMissingDeps(row);
          if (deps.length > 0) tbody.appendChild(buildDepRow(row, deps));
        }
        grandTotal += calcTotal(row);
        grandMonthly += calcMonthly(row);
      }
    });

    if (itemRows().length > 0) {
      tbody.appendChild(buildGrandTotalRow(grandTotal, grandMonthly));
    }

    table.appendChild(tbody);
    setupDrag(tbody);
    tableWrap.appendChild(table);
    el.appendChild(tableWrap);
  }

  render();

  return {
    element: el,
    addItem,
    removeItem,
    getLineItems,
    getGroups,
    getSummary,
    loadItems,
    update(props) {
      if (props.licenses      !== undefined) licenses      = props.licenses;
      if (props.servicePacks  !== undefined) servicePacks  = props.servicePacks;
      if (props.isTemplateMode !== undefined) isTemplateMode = props.isTemplateMode;
      if (props.hourlyRate    !== undefined) hourlyRate    = props.hourlyRate;
      render();
    },
  };
}
