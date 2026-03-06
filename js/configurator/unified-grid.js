// unified-grid.js
// Full Excel-like quote grid — presentation-grid as base, extended with:
//   • SLA column (click-to-change dropdown)
//   • Dependency warning sub-rows with quick-add
//   • Self-owned lineItems (no external state split)
//   • addItem / loadItems / getLineItems / getGroups / getSummary API
//
// Columns: drag | ☑ | Name/SKU | SLA | Qty | Unit Price | Margin% | Total | Monthly | Notes | ⋯
// Multi-select, context menu, drag-reorder, merge, group, keyboard nav all preserved.

import { currency } from '../utils/format.js';
import { getMeasurePointTag } from '../utils/license-calculations.js';
import { showToast } from '../components/toast.js';
import { showConfirmModal } from '../components/modal.js';

// ── Icons ──────────────────────────────────────────────────────────
const ICONS = {
  grip:       '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>',
  arrowUp:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5"/></svg>',
  arrowDown:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>',
  plus:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>',
  duplicate:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg>',
  trash:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>',
  merge:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>',
  group:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/></svg>',
  moveTop:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h18m-9 3.75V21m0-12.75l-3 3m3-3l3 3"/></svg>',
  moveBottom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 19.5h18m-9-3.75V3m0 12.75l-3-3m3 3l3-3"/></svg>',
  chevronDown:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>',
};

// Column indices for keyboard navigation
const EDITABLE_COL_INDICES = [2, 5, 6, 7, 10]; // name, qty, price, margin, notes
const COL_TOTAL = 11;

export function createUnifiedGrid({
  licenses = [],
  servicePacks = [],
  isTemplateMode = false,
  hourlyRate = 150,
  onSummaryChange = null,
}) {
  const el = document.createElement('div');
  el.className = 'unified-grid-root';

  // ── Internal state ───────────────────────────────────────────────
  // _lineItems: flat array — source of truth for save/export
  // _items: display items (sorted by .order)
  //   type:'item'   → { id, type, lineIdx, displayName, displayQty, displayPrice,
  //                     displayMargin, note, hidden, order, groupId, _mergedLineIndices }
  //   type:'header' → { id, type, displayName, hidden, order }
  let _lineItems = [];  // [{licenseId, name, sku, price, amount, margin, sla, itemType, hours}]
  let _items     = [];

  let selectedRows    = new Set();
  let collapsedGroups = new Set();
  let expandedMerges  = new Set();
  let lastClickedRow  = null;
  let focusedCell     = null;
  let editingCell     = null;
  let editOriginalVal = '';
  let contextMenuEl   = null;
  let ctxDismissHandler = null;
  let dragItemId      = null;
  let dropGapIdx      = null;
  let dragIndicatorEl = null;
  let onSelChange     = null;

  let _idSeq = 0;
  function genId(p = 'r') { return `${p}-${++_idSeq}-${Math.random().toString(36).slice(2,6)}`; }

  // ── Data helpers ─────────────────────────────────────────────────

  function getLine(idx) { return _lineItems[idx]; }

  function getPrimaryLine(item) {
    if (!item.lineIdx && item.lineIdx !== 0) return null;
    return _lineItems[item.lineIdx];
  }

  function getMergedLines(item) {
    if (item._mergedLineIndices?.length) return item._mergedLineIndices.map(i => _lineItems[i]).filter(Boolean);
    if (item.lineIdx != null) return [_lineItems[item.lineIdx]].filter(Boolean);
    return [];
  }

  function displayName(item) {
    if (item.displayName != null) return item.displayName;
    const line = getPrimaryLine(item);
    return line?.name || '';
  }

  function displaySku(item) {
    const lines = getMergedLines(item);
    if (!lines.length) return '';
    if (lines.length === 1) return lines[0].sku || '';
    return lines.map(l => l.sku).filter(Boolean).join(', ');
  }

  function displayQty(item) {
    if (item.displayQty != null) return item.displayQty;
    return getMergedLines(item).reduce((s, l) => s + (l.amount || 0), 0);
  }

  function displayPrice(item) {
    if (item.displayPrice != null) return item.displayPrice;
    const lines = getMergedLines(item);
    if (!lines.length) return 0;
    return lines.reduce((s, l) => s + (l.price || 0), 0) / lines.length;
  }

  function displayMargin(item) {
    if (item.displayMargin != null) return item.displayMargin;
    const line = getPrimaryLine(item);
    return line?.margin ?? 0;
  }

  function calcTotal(item) {
    return displayPrice(item) * displayQty(item) * (1 + displayMargin(item) / 100);
  }

  function calcMonthly(item) {
    const line = getPrimaryLine(item);
    if (!line || line.itemType === 'servicepack') return 0;
    const lic = licenses.find(l => l.id === line.licenseId);
    const sla = lic?.expand?.possible_SLAs?.find(s => s.id === line.sla);
    return sla ? calcTotal(item) * (sla.monthly_percentage / 100) : 0;
  }

  function getMissingDeps(item) {
    const line = getPrimaryLine(item);
    if (!line || line.itemType === 'servicepack') return [];
    const lic = licenses.find(l => l.id === line.licenseId);
    if (!lic?.depends_on?.length) return [];
    const presentIds = new Set(_lineItems.map(l => l.licenseId));
    return lic.depends_on
      .filter(id => !presentIds.has(id))
      .map(id => licenses.find(l => l.id === id))
      .filter(Boolean);
  }

  function visibleItems() {
    return _items.filter(i => !i.hidden).sort((a, b) => a.order - b.order);
  }

  function reindex() {
    const sorted = [..._items].sort((a, b) => a.order - b.order);
    sorted.forEach((it, i) => { it.order = i; });
  }

  function emitSummary() {
    if (!onSummaryChange) return;
    let hk = 0, vk = 0, monthly = 0;
    _lineItems.forEach(line => {
      if (line.itemType === 'servicepack') {
        const lhk = (line.hours || 0) * hourlyRate * line.amount;
        hk += lhk; vk += lhk * (1 + line.margin / 100);
      } else {
        const lhk = line.price * line.amount;
        const lvk = lhk * (1 + line.margin / 100);
        hk += lhk; vk += lvk;
        const lic = licenses.find(l => l.id === line.licenseId);
        const sla = lic?.expand?.possible_SLAs?.find(s => s.id === line.sla);
        monthly += sla ? lvk * (sla.monthly_percentage / 100) : 0;
      }
    });
    onSummaryChange({ hk, vk, monthly });
  }

  function emitSelChange() { if (onSelChange) onSelChange(selectedRows.size); }

  // ── Public API ───────────────────────────────────────────────────

  function addItem(catalogItem) {
    if (catalogItem.type === 'license') {
      const lic = catalogItem.item;
      const slas = lic.expand?.possible_SLAs || [];
      const defaultSla = slas.find(s => s.name.toLowerCase().includes('essential'))?.id || slas[0]?.id || '';

      // Bump qty if already present (ungrouped or same group as last)
      const existIdx = _lineItems.findIndex(l => l.licenseId === lic.id && l.itemType !== 'servicepack');
      if (existIdx >= 0) {
        _lineItems[existIdx].amount++;
        reindex(); render(); emitSummary(); return;
      }

      const lineIdx = _lineItems.length;
      _lineItems.push({ licenseId: lic.id, name: lic.name, sku: lic.sku, price: lic.initial_price,
        amount: catalogItem.item._overrideQty || 1, margin: 25, sla: defaultSla, itemType: 'license', hours: undefined });

      const headers = visibleItems().filter(i => i.type === 'header');
      const lastHeader = headers[headers.length - 1] || null;

      _items.push({ id: genId('i'), type: 'item', lineIdx, displayName: null, displayQty: null,
        displayPrice: null, displayMargin: null, note: '', hidden: false, order: _items.length,
        groupId: lastHeader?.id || null });

    } else {
      const sp = catalogItem.item;
      const lineIdx = _lineItems.length;
      _lineItems.push({ licenseId: sp.id, name: sp.package_name, sku: sp.id,
        price: (sp.estimated_hours || 0) * hourlyRate, amount: 1, margin: 25,
        sla: '', itemType: 'servicepack', hours: sp.estimated_hours || 0 });

      const headers = visibleItems().filter(i => i.type === 'header');
      const lastHeader = headers[headers.length - 1] || null;

      _items.push({ id: genId('i'), type: 'item', lineIdx, displayName: null, displayQty: null,
        displayPrice: null, displayMargin: null, note: '', hidden: false, order: _items.length,
        groupId: lastHeader?.id || null });
    }
    reindex(); render(); emitSummary();
  }

  function loadItems(lineItems = [], groups = []) {
    _lineItems = lineItems.map(l => ({ ...l }));
    _items = [];
    groups.forEach((g, i) => {
      _items.push({ id: g.id || genId('h'), type: 'header', displayName: g.name || g.description || 'Group',
        hidden: false, order: i });
    });
    lineItems.forEach((line, i) => {
      const groupId = line.containerId || line.groupId || null;
      // Map old containerId to matching header id
      let resolvedGroupId = groupId;
      if (groupId) {
        const matchingHeader = _items.find(it => it.type === 'header' && it.id === groupId);
        if (!matchingHeader) resolvedGroupId = null;
      }
      _items.push({ id: genId('i'), type: 'item', lineIdx: i, displayName: null, displayQty: null,
        displayPrice: null, displayMargin: null, note: '', hidden: false,
        order: groups.length + i, groupId: resolvedGroupId });
    });
    reindex(); render(); emitSummary();
  }

  function getLineItems() {
    // Return lineItems with groupId filled from their display item
    return _lineItems.map((line, idx) => {
      const displayItem = _items.find(it => it.type === 'item' && it.lineIdx === idx && !it.hidden);
      return { ...line, containerId: displayItem?.groupId || null };
    });
  }

  function getGroups() {
    return visibleItems()
      .filter(i => i.type === 'header')
      .map(h => ({ id: h.id, name: h.displayName || 'Group' }));
  }

  function getSummary() {
    let hk = 0, vk = 0, monthly = 0;
    _lineItems.forEach(line => {
      if (line.itemType === 'servicepack') {
        const lhk = (line.hours || 0) * hourlyRate * line.amount;
        hk += lhk; vk += lhk * (1 + line.margin / 100);
      } else {
        const lhk = line.price * line.amount;
        const lvk = lhk * (1 + line.margin / 100);
        hk += lhk; vk += lvk;
        const lic = licenses.find(l => l.id === line.licenseId);
        const sla = lic?.expand?.possible_SLAs?.find(s => s.id === line.sla);
        monthly += sla ? lvk * (sla.monthly_percentage / 100) : 0;
      }
    });
    return { hk, vk, monthly };
  }

  // ── Editing helpers ──────────────────────────────────────────────

  function commitLineField(item, field, rawVal) {
    const line = getPrimaryLine(item);
    if (!line) return;
    if (field === 'displayName') {
      item.displayName = rawVal.trim() || null;
      if (item.displayName === null || item.displayName === line.name) item.displayName = null;
      else item.displayName = rawVal.trim();
    } else if (field === 'note') {
      item.note = rawVal;
    } else if (field === 'displayQty') {
      const n = parseFloat(rawVal);
      if (!isNaN(n)) { line.amount = n; item.displayQty = null; }
    } else if (field === 'displayPrice') {
      const n = parseFloat(rawVal);
      if (!isNaN(n)) { line.price = n; item.displayPrice = null; }
    } else if (field === 'displayMargin') {
      const n = parseFloat(rawVal);
      if (!isNaN(n)) { line.margin = n; item.displayMargin = null; }
    }
    emitSummary();
  }

  function openSlaDropdown(item, triggerEl) {
    const line = getPrimaryLine(item);
    if (!line) return;
    const lic = licenses.find(l => l.id === line.licenseId);
    const slas = lic?.expand?.possible_SLAs || [];
    if (!slas.length) return;

    document.querySelectorAll('.ug-sla-dropdown').forEach(d => d.remove());
    const dropdown = document.createElement('div');
    dropdown.className = 'ug-sla-dropdown';
    const rect = triggerEl.getBoundingClientRect();
    dropdown.style.cssText = [
      `position:fixed;top:${rect.bottom + 2}px;left:${rect.left}px`,
      'z-index:1000;min-width:170px;background:var(--surface)',
      'border:1px solid var(--border);border-radius:6px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.12);overflow:hidden',
    ].join(';') + ';';

    [{ value: '', label: 'None' }, ...slas.map(s => ({ value: s.id, label: s.name }))].forEach(opt => {
      const isActive = opt.value === (line.sla || '');
      const optEl = document.createElement('div');
      optEl.style.cssText = [
        'padding:8px 14px;cursor:pointer;font-size:0.82rem',
        `color:${isActive ? 'var(--primary)' : 'var(--text-main)'}`,
        `font-weight:${isActive ? '600' : '400'}`,
        `background:${isActive ? 'var(--primary-light)' : 'transparent'}`,
      ].join(';') + ';';
      optEl.textContent = opt.label;
      optEl.addEventListener('mouseenter', () => { if (!isActive) optEl.style.background = 'var(--bg)'; });
      optEl.addEventListener('mouseleave', () => { if (!isActive) optEl.style.background = 'transparent'; });
      optEl.addEventListener('click', e => {
        e.stopPropagation();
        line.sla = opt.value;
        dropdown.remove();
        render(); emitSummary();
      });
      dropdown.appendChild(optEl);
    });

    document.body.appendChild(dropdown);
    const close = e => {
      if (!dropdown.contains(e.target) && e.target !== triggerEl) {
        dropdown.remove();
        document.removeEventListener('click', close, true);
      }
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
  }

  // ── Selection ────────────────────────────────────────────────────

  function handleRowClick(itemId, e) {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const mod = isMac ? e.metaKey : e.ctrlKey;
    const vis = visibleItems();

    if (e.shiftKey && lastClickedRow) {
      const a = vis.findIndex(i => i.id === lastClickedRow);
      const b = vis.findIndex(i => i.id === itemId);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = [Math.min(a,b), Math.max(a,b)];
        for (let i = lo; i <= hi; i++) selectedRows.add(vis[i].id);
      }
    } else if (mod) {
      if (selectedRows.has(itemId)) selectedRows.delete(itemId);
      else selectedRows.add(itemId);
    } else {
      selectedRows.clear();
      selectedRows.add(itemId);
    }
    lastClickedRow = itemId;
    emitSelChange(); render();
  }

  function handleCheckbox(itemId, checked, shiftKey) {
    if (shiftKey && lastClickedRow) {
      const vis = visibleItems();
      const a = vis.findIndex(i => i.id === lastClickedRow);
      const b = vis.findIndex(i => i.id === itemId);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = [Math.min(a,b), Math.max(a,b)];
        for (let i = lo; i <= hi; i++) selectedRows.add(vis[i].id);
      }
    } else {
      if (checked) selectedRows.add(itemId); else selectedRows.delete(itemId);
    }
    lastClickedRow = itemId;
    emitSelChange(); render();
  }

  // ── Context menu ─────────────────────────────────────────────────

  function closeCtxMenu() {
    if (ctxDismissHandler) {
      document.removeEventListener('click', ctxDismissHandler, true);
      document.removeEventListener('contextmenu', ctxDismissHandler, true);
      ctxDismissHandler = null;
    }
    contextMenuEl?.remove(); contextMenuEl = null;
  }

  function showContextMenu(e, item) {
    e.preventDefault(); closeCtxMenu();
    const vis = visibleItems();
    const idx = vis.findIndex(i => i.id === item.id);

    const menuItems = [];

    if (item.type === 'item') {
      menuItems.push({ icon: ICONS.plus, label: 'Add Group Above', action: () => addGroupAt(item, 'above') });
      menuItems.push({ icon: ICONS.plus, label: 'Add Group Below', action: () => addGroupAt(item, 'below') });
      const headers = _items.filter(i => i.type === 'header' && !i.hidden);
      if (headers.length) {
        menuItems.push('sep');
        if (item.groupId) menuItems.push({ icon: ICONS.group, label: 'Remove from Group', action: () => { delete item.groupId; reindex(); render(); } });
        headers.filter(h => h.id !== item.groupId).forEach(h => {
          menuItems.push({ icon: ICONS.group, label: `Move to "${h.displayName}"`, action: () => { item.groupId = h.id; reindex(); render(); } });
        });
      }
      menuItems.push('sep');
      menuItems.push({ icon: ICONS.plus, label: 'Insert Empty Row Above', action: () => insertEmptyRow(item, 'above') });
      menuItems.push({ icon: ICONS.plus, label: 'Insert Empty Row Below', action: () => insertEmptyRow(item, 'below') });
      menuItems.push({ icon: ICONS.duplicate, label: 'Duplicate Row', action: () => duplicateItem(item) });
      menuItems.push({ icon: ICONS.trash, label: 'Delete Row', action: () => softDelete(item), danger: true });
      if (idx > 0 && vis[idx-1].type === 'item') menuItems.push({ icon: ICONS.merge, label: 'Merge with Above', action: () => mergeTwo(item, vis[idx-1]) });
      if (idx < vis.length-1 && vis[idx+1].type === 'item') menuItems.push({ icon: ICONS.merge, label: 'Merge with Below', action: () => mergeTwo(item, vis[idx+1]) });
      menuItems.push('sep');
      menuItems.push({ icon: ICONS.moveTop,    label: 'Move to Top',    action: () => moveToEdge(item, 'top') });
      menuItems.push({ icon: ICONS.moveBottom, label: 'Move to Bottom', action: () => moveToEdge(item, 'bottom') });
    } else {
      menuItems.push({ icon: ICONS.plus, label: 'Insert Empty Row Above', action: () => insertEmptyRow(item, 'above') });
      menuItems.push({ icon: ICONS.plus, label: 'Insert Empty Row Below', action: () => insertEmptyRow(item, 'below') });
      menuItems.push({ icon: ICONS.duplicate, label: 'Duplicate Group', action: () => duplicateItem(item) });
      menuItems.push({ icon: ICONS.trash, label: 'Delete Group', action: () => softDelete(item), danger: true });
      menuItems.push('sep');
      menuItems.push({ icon: ICONS.moveTop,    label: 'Move to Top',    action: () => moveToEdge(item, 'top') });
      menuItems.push({ icon: ICONS.moveBottom, label: 'Move to Bottom', action: () => moveToEdge(item, 'bottom') });
    }

    const menu = document.createElement('div');
    menu.className = 'pe-context-menu';
    menuItems.forEach(mi => {
      if (mi === 'sep') {
        const sep = document.createElement('div'); sep.className = 'pe-context-menu-sep';
        menu.appendChild(sep); return;
      }
      const btn = document.createElement('button');
      btn.className = 'pe-context-menu-item' + (mi.danger ? ' pe-ctx-danger' : '');
      btn.innerHTML = mi.icon + `<span>${mi.label}</span>`;
      btn.addEventListener('click', () => { closeCtxMenu(); mi.action(); });
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    let x = e.clientX, y = e.clientY;
    if (x + r.width  > window.innerWidth)  x = window.innerWidth  - r.width  - 8;
    if (y + r.height > window.innerHeight) y = window.innerHeight - r.height - 8;
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    contextMenuEl = menu;

    ctxDismissHandler = ev => {
      if (contextMenuEl && !contextMenuEl.contains(ev.target)) closeCtxMenu();
    };
    setTimeout(() => {
      document.addEventListener('click', ctxDismissHandler, true);
      document.addEventListener('contextmenu', ctxDismissHandler, true);
    }, 0);
  }

  // ── Item actions ─────────────────────────────────────────────────

  function addGroupAt(item, pos) {
    const vis = visibleItems();
    const idx = vis.findIndex(i => i.id === item.id);
    const order = pos === 'above'
      ? (idx > 0 ? (vis[idx-1].order + item.order) / 2 : item.order - 0.5)
      : (idx < vis.length-1 ? (item.order + vis[idx+1].order) / 2 : item.order + 0.5);
    const header = { id: genId('h'), type: 'header', displayName: 'New Group', hidden: false, order };
    _items.push(header);
    if (pos === 'above') item.groupId = header.id;
    reindex(); render();
  }

  function insertEmptyRow(item, pos) {
    const vis = visibleItems();
    const idx = vis.findIndex(i => i.id === item.id);
    const order = pos === 'above'
      ? (idx > 0 ? (vis[idx-1].order + item.order) / 2 : item.order - 0.5)
      : (idx < vis.length-1 ? (item.order + vis[idx+1].order) / 2 : item.order + 0.5);
    const lineIdx = _lineItems.length;
    _lineItems.push({ licenseId: null, name: '', sku: '', price: 0, amount: 1, margin: 25, sla: '', itemType: 'license' });
    _items.push({ id: genId('i'), type: 'item', lineIdx, displayName: null, displayQty: null,
      displayPrice: null, displayMargin: null, note: '', hidden: false, order,
      groupId: item.type === 'header' && pos === 'below' ? item.id : (item.groupId || null) });
    reindex(); render();
  }

  function duplicateItem(item) {
    const dup = { ...item, id: genId('i'), order: item.order + 0.5 };
    if (item.type === 'item' && item.lineIdx != null) {
      const newLineIdx = _lineItems.length;
      _lineItems.push({ ..._lineItems[item.lineIdx] });
      dup.lineIdx = newLineIdx;
    }
    _items.push(dup);
    reindex(); render(); emitSummary();
    showToast('Row duplicated', 'success');
  }

  function softDelete(item) {
    item.hidden = true;
    let ungroupedIds = [];
    if (item.type === 'header') {
      _items.forEach(i => { if (i.groupId === item.id) { ungroupedIds.push(i.id); delete i.groupId; } });
    }
    emitSummary(); render();
    showToast('Deleted. <button onclick="this.closest(\'.toast\')?.dispatchEvent(new CustomEvent(\'undo\'))" style="background:none;border:none;color:var(--primary);text-decoration:underline;cursor:pointer;">Undo</button>', 'info');
    const toasts = document.querySelectorAll('.toast');
    const t = toasts[toasts.length - 1];
    if (t) t.addEventListener('undo', () => {
      item.hidden = false;
      if (item.type === 'header') _items.forEach(i => { if (ungroupedIds.includes(i.id)) i.groupId = item.id; });
      emitSummary(); render();
    }, { once: true });
  }

  function mergeTwo(a, b) {
    const [first, second] = [a, b].sort((x, y) => x.order - y.order);
    const mergedLineIndices = [...new Set([
      ...(first._mergedLineIndices  || (first.lineIdx  != null ? [first.lineIdx]  : [])),
      ...(second._mergedLineIndices || (second.lineIdx != null ? [second.lineIdx] : [])),
    ])];
    const merged = {
      id: genId('i'), type: 'item',
      lineIdx: mergedLineIndices[0],
      _mergedLineIndices: mergedLineIndices,
      displayName: displayName(first) + ' + ' + displayName(second),
      displayQty: displayQty(first) + displayQty(second),
      displayPrice: null, displayMargin: null,
      note: [first.note, second.note].filter(Boolean).join('; '),
      hidden: false, order: first.order, groupId: first.groupId || second.groupId || null,
    };
    const tq = merged.displayQty || 1;
    merged.displayPrice = (displayPrice(first) * displayQty(first) + displayPrice(second) * displayQty(second)) / tq;
    merged.displayMargin = (displayMargin(first) + displayMargin(second)) / 2;
    _items = _items.filter(i => i.id !== first.id && i.id !== second.id);
    _items.push(merged);
    reindex(); emitSummary(); render();
    showToast('Items merged', 'success');
  }

  function unmergeItem(item) {
    if (!item._mergedLineIndices?.length) return;
    const newItems = item._mergedLineIndices.map((li, i) => ({
      id: genId('i'), type: 'item', lineIdx: li,
      displayName: null, displayQty: null, displayPrice: null, displayMargin: null,
      note: '', hidden: false, order: item.order + i * 0.1, groupId: item.groupId || null,
    }));
    _items = _items.filter(i => i.id !== item.id);
    _items.push(...newItems);
    expandedMerges.delete(item.id);
    reindex(); emitSummary(); render();
    showToast('Items unmerged', 'success');
  }

  function moveToEdge(item, edge) {
    const vis = visibleItems();
    item.order = edge === 'top' ? vis[0].order - 1 : vis[vis.length-1].order + 1;
    reindex(); render();
  }

  function moveItem(item, dir) {
    const vis = visibleItems();
    const idx = vis.findIndex(i => i.id === item.id);
    const swap = vis[idx + dir];
    if (!swap) return;
    [item.order, swap.order] = [swap.order, item.order];
    render();
  }

  // ── Multi-select actions (action dock) ───────────────────────────

  function mergeSelected() {
    const selItems = _items.filter(i => selectedRows.has(i.id) && i.type === 'item' && !i.hidden);
    if (selItems.length < 2) { showToast('Select at least 2 items to merge', 'warning'); return; }
    const mergedLineIndices = [...new Set(selItems.flatMap(i => i._mergedLineIndices || (i.lineIdx != null ? [i.lineIdx] : [])))];
    const merged = {
      id: genId('i'), type: 'item',
      lineIdx: mergedLineIndices[0],
      _mergedLineIndices: mergedLineIndices,
      displayName: selItems.map(i => displayName(i)).join(' + '),
      displayQty: selItems.reduce((s, i) => s + displayQty(i), 0),
      displayPrice: null, displayMargin: null,
      note: selItems.map(i => i.note).filter(Boolean).join('; '),
      hidden: false, order: Math.min(...selItems.map(i => i.order)),
      groupId: selItems[0].groupId || null,
    };
    const tq = merged.displayQty || 1;
    merged.displayPrice = selItems.reduce((s, i) => s + displayPrice(i) * displayQty(i), 0) / tq;
    merged.displayMargin = selItems.reduce((s, i) => s + displayMargin(i), 0) / selItems.length;
    _items = _items.filter(i => !selectedRows.has(i.id));
    _items.push(merged);
    selectedRows.clear(); reindex(); emitSummary(); emitSelChange(); render();
    showToast(`${selItems.length} items merged`, 'success');
  }

  function groupSelected() {
    const selItems = _items.filter(i => selectedRows.has(i.id) && !i.hidden).sort((a,b) => a.order - b.order);
    if (selItems.length < 2) { showToast('Select at least 2 items to group', 'warning'); return; }
    const header = { id: genId('h'), type: 'header', displayName: 'New Group', hidden: false, order: selItems[0].order - 0.5 };
    _items.push(header);
    selItems.forEach((item, i) => { item.groupId = header.id; item.order = selItems[0].order + i * 0.1; });
    selectedRows.clear(); reindex(); emitSelChange(); render();
  }

  function deleteSelected() {
    const count = selectedRows.size;
    if (!count) return;
    [...selectedRows].forEach(id => {
      const item = _items.find(i => i.id === id);
      if (item) item.hidden = true;
    });
    selectedRows.clear(); emitSummary(); emitSelChange(); render();
    showToast(`${count} row(s) deleted`, 'info');
  }

  // ── Drag & drop ──────────────────────────────────────────────────

  function setupDrag(tbody) {
    tbody.addEventListener('dragstart', e => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      dragItemId = tr.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => tr.classList.add('ug-dragging'));
    });

    tbody.addEventListener('dragover', e => {
      if (!dragItemId) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      const trs = [...tbody.querySelectorAll('tr[data-id]:not(.ug-dragging)')];
      if (!trs.length) return;
      let best = 0, bestD = Infinity;
      trs.forEach((tr, i) => {
        const rect = tr.getBoundingClientRect();
        const mid = (rect.top + rect.bottom) / 2;
        const d = Math.abs(e.clientY - mid);
        if (d < bestD) { bestD = d; best = e.clientY < mid ? i : i + 1; }
      });
      dropGapIdx = best;
      if (!dragIndicatorEl) {
        dragIndicatorEl = document.createElement('tr');
        dragIndicatorEl.style.cssText = 'height:0;pointer-events:none;';
        dragIndicatorEl.innerHTML = `<td colspan="${COL_TOTAL}" style="padding:0;height:2px;background:var(--primary);"></td>`;
      }
      tbody.insertBefore(dragIndicatorEl, trs[best] || null);
    });

    tbody.addEventListener('dragleave', e => {
      if (!tbody.contains(e.relatedTarget)) { dragIndicatorEl?.remove(); dragIndicatorEl = null; dropGapIdx = null; }
    });

    tbody.addEventListener('drop', e => {
      e.preventDefault();
      dragIndicatorEl?.remove(); dragIndicatorEl = null;
      tbody.querySelectorAll('.ug-dragging').forEach(r => r.classList.remove('ug-dragging'));
      if (!dragItemId || dropGapIdx == null) { dragItemId = null; return; }

      const trs = [...tbody.querySelectorAll('tr[data-id]')];
      const ids = trs.map(r => r.dataset.id);
      const dragVisIdx = ids.indexOf(dragItemId);
      if (dragVisIdx === dropGapIdx || dragVisIdx + 1 === dropGapIdx) { dragItemId = null; return; }

      const reordered = ids.filter(id => id !== dragItemId);
      const insertIdx = dropGapIdx > dragVisIdx ? dropGapIdx - 1 : dropGapIdx;
      reordered.splice(insertIdx, 0, dragItemId);
      reordered.forEach((id, i) => { const it = _items.find(r => r.id === id); if (it) it.order = i; });

      // Update groupId based on position
      const dragItem = _items.find(i => i.id === dragItemId);
      if (dragItem && dragItem.type !== 'header') {
        const afterId = reordered[insertIdx - 1];
        if (afterId) {
          const afterItem = _items.find(i => i.id === afterId);
          dragItem.groupId = afterItem?.type === 'header' ? afterItem.id : (afterItem?.groupId || null);
        } else {
          dragItem.groupId = null;
        }
      }

      dragItemId = null; dropGapIdx = null;
      reindex(); render();
    });

    tbody.addEventListener('dragend', () => {
      dragIndicatorEl?.remove(); dragIndicatorEl = null;
      tbody.querySelectorAll('.ug-dragging').forEach(r => r.classList.remove('ug-dragging'));
      dragItemId = null; dropGapIdx = null;
    });
  }

  // ── Keyboard navigation ──────────────────────────────────────────

  function focusCell(row, col) {
    el.querySelector('.ug-cell-focused')?.classList.remove('ug-cell-focused');
    focusedCell = { row, col };
    const cell = el.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (cell) { cell.classList.add('ug-cell-focused'); cell.scrollIntoView({ block: 'nearest' }); }
  }

  function enterEdit(row, col) {
    const cell = el.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (!cell || cell.getAttribute('contenteditable') !== 'true') return;
    cell.classList.remove('ug-cell-focused'); cell.classList.add('ug-cell-editing');
    editingCell = { row, col }; editOriginalVal = cell.textContent;
    cell.focus();
    const r = document.createRange(); r.selectNodeContents(cell);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  function exitEdit(commit) {
    if (!editingCell) return;
    const cell = el.querySelector(`[data-row="${editingCell.row}"][data-col="${editingCell.col}"]`);
    if (cell) { cell.classList.remove('ug-cell-editing'); if (!commit) cell.textContent = editOriginalVal; cell.blur(); }
    const prev = { ...editingCell }; editingCell = null; return prev;
  }

  function nextEditCol(col, dir) {
    const idx = EDITABLE_COL_INDICES.indexOf(col);
    if (dir > 0) return idx < EDITABLE_COL_INDICES.length - 1 ? EDITABLE_COL_INDICES[idx + 1] : null;
    return idx > 0 ? EDITABLE_COL_INDICES[idx - 1] : null;
  }

  function handleTableKey(e) {
    if (editingCell) return;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();
      if (!focusedCell) { focusCell(0, EDITABLE_COL_INDICES[0]); return; }
      let { row, col } = focusedCell;
      if (e.key === 'ArrowUp') row--;
      if (e.key === 'ArrowDown') row++;
      if (e.key === 'ArrowLeft') { const p = nextEditCol(col, -1); if (p != null) col = p; }
      if (e.key === 'ArrowRight') { const n = nextEditCol(col, 1); if (n != null) col = n; }
      if (el.querySelector(`[data-row="${row}"][data-col="${col}"]`)) focusCell(row, col);
      return;
    }
    if (e.key === 'Enter' && focusedCell) { e.preventDefault(); enterEdit(focusedCell.row, focusedCell.col); return; }
    if (e.key === 'Tab' && focusedCell) {
      e.preventDefault();
      const { row, col } = focusedCell;
      const nc = nextEditCol(col, e.shiftKey ? -1 : 1);
      if (nc != null) focusCell(row, nc);
      else {
        const nr = e.shiftKey ? row - 1 : row + 1;
        const tc = e.shiftKey ? EDITABLE_COL_INDICES[EDITABLE_COL_INDICES.length-1] : EDITABLE_COL_INDICES[0];
        if (el.querySelector(`[data-row="${nr}"][data-col="${tc}"]`)) focusCell(nr, tc);
      }
      return;
    }
    if (e.key === 'Escape') { el.querySelector('.ug-cell-focused')?.classList.remove('ug-cell-focused'); focusedCell = null; }
  }

  // ── Row builders ─────────────────────────────────────────────────

  function makeEditableCell(item, field, value, rowIdx, colIdx, isNumber = false) {
    const td = document.createElement('td');
    td.className = 'ug-cell-editable';
    td.setAttribute('contenteditable', 'true');
    td.setAttribute('data-row', rowIdx);
    td.setAttribute('data-col', colIdx);
    td.textContent = value;

    td.addEventListener('mousedown', e => {
      if (editingCell?.row === rowIdx && editingCell?.col === colIdx) return;
      e.preventDefault(); focusCell(rowIdx, colIdx);
    });
    td.addEventListener('dblclick', () => enterEdit(rowIdx, colIdx));
    td.addEventListener('blur', () => {
      td.classList.remove('ug-cell-editing', 'ug-cell-focused');
      if (editingCell?.row === rowIdx && editingCell?.col === colIdx) {
        commitLineField(item, field, td.textContent.trim());
        editingCell = null;
        render();
      }
    });
    td.addEventListener('keydown', e => {
      if (editingCell?.row !== rowIdx || editingCell?.col !== colIdx) return;
      if (e.key === 'Enter') { e.preventDefault(); const prev = exitEdit(true); if (prev) setTimeout(() => focusCell(prev.row + 1, prev.col), 0); }
      if (e.key === 'Escape') { e.preventDefault(); td.textContent = editOriginalVal; exitEdit(false); focusCell(rowIdx, colIdx); }
      if (e.key === 'Tab') {
        e.preventDefault(); exitEdit(true);
        const nc = nextEditCol(colIdx, e.shiftKey ? -1 : 1);
        if (nc != null) setTimeout(() => focusCell(rowIdx, nc), 0);
        else setTimeout(() => focusCell(e.shiftKey ? rowIdx-1 : rowIdx+1, e.shiftKey ? EDITABLE_COL_INDICES[EDITABLE_COL_INDICES.length-1] : EDITABLE_COL_INDICES[0]), 0);
      }
    });
    return td;
  }

  function buildHeaderRow(item, sectionItems, rowIdx) {
    const isCollapsed = collapsedGroups.has(item.id);
    const subtotal = sectionItems.reduce((s, i) => s + calcTotal(i), 0);
    const subMonthly = sectionItems.reduce((s, i) => s + calcMonthly(i), 0);

    const tr = document.createElement('tr');
    tr.className = 'ug-header-row';
    tr.dataset.id = item.id;
    tr.draggable = true;

    // Drag
    const tdDrag = document.createElement('td');
    tdDrag.className = 'ug-col-drag';
    tdDrag.innerHTML = `<span class="pg-drag-handle">${ICONS.grip}</span>`;
    tr.appendChild(tdDrag);

    // Checkbox
    const tdCheck = document.createElement('td');
    tdCheck.className = 'ug-cell-check';
    const cb = document.createElement('input'); cb.type = 'checkbox';
    cb.checked = selectedRows.has(item.id);
    cb.addEventListener('click', e => { e.stopPropagation(); handleCheckbox(item.id, cb.checked, e.shiftKey); });
    tdCheck.appendChild(cb); tr.appendChild(tdCheck);

    // Name (spans name+sku+SLA+qty+price+margin = 6 cols)
    const tdName = document.createElement('td');
    tdName.colSpan = 6;
    tdName.className = 'ug-cell-header-name';

    const chevron = document.createElement('span');
    chevron.className = 'pg-group-chevron';
    chevron.style.cursor = 'pointer';
    chevron.innerHTML = isCollapsed
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';
    chevron.addEventListener('click', e => {
      e.stopPropagation();
      if (collapsedGroups.has(item.id)) collapsedGroups.delete(item.id);
      else collapsedGroups.add(item.id);
      render();
    });
    tdName.appendChild(chevron);

    const nameSpan = document.createElement('span');
    nameSpan.setAttribute('contenteditable', 'true');
    nameSpan.textContent = item.displayName || 'Group';
    nameSpan.addEventListener('blur', () => { item.displayName = nameSpan.textContent.trim() || 'Group'; });
    nameSpan.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); }
      if (e.key === 'Escape') { nameSpan.textContent = item.displayName || 'Group'; nameSpan.blur(); }
    });
    tdName.appendChild(nameSpan);

    if (isCollapsed && sectionItems.length > 0) {
      const badge = document.createElement('span');
      badge.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);font-weight:400;margin-left:8px;';
      badge.textContent = `(${sectionItems.length} items)`;
      tdName.appendChild(badge);
    }
    tr.appendChild(tdName);

    // Subtotal
    const tdTot = document.createElement('td'); tdTot.className = 'ug-cell-total';
    if (sectionItems.length > 0) { tdTot.textContent = currency(subtotal); tdTot.style.fontWeight = '600'; }
    tr.appendChild(tdTot);

    // Monthly
    const tdMon = document.createElement('td'); tdMon.className = 'ug-cell-monthly';
    if (subMonthly > 0) { tdMon.textContent = currency(subMonthly); tdMon.style.fontWeight = '600'; }
    tr.appendChild(tdMon);

    // Notes (empty)
    tr.appendChild(document.createElement('td'));

    // Actions
    const tdAct = document.createElement('td'); tdAct.className = 'ug-cell-actions';
    appendActionBtns(tdAct, item);
    tr.appendChild(tdAct);

    if (selectedRows.has(item.id)) tr.classList.add('selected-row');
    return tr;
  }

  function buildItemRow(item, isGrouped, rowIdx) {
    const line = getPrimaryLine(item);
    const lic = (line && line.itemType !== 'servicepack') ? licenses.find(l => l.id === line.licenseId) : null;
    const slas = lic?.expand?.possible_SLAs || [];
    const currentSla = slas.find(s => s.id === line?.sla);
    const tag = (line && line.itemType !== 'servicepack') ? getMeasurePointTag(line.sku) : null;
    const tagColor = tag?.color || (line?.itemType === 'servicepack' ? '#f59e0b' : 'var(--primary)');
    const tagBg   = tag ? `${tag.color}20` : (line?.itemType === 'servicepack' ? '#fef3c7' : 'var(--primary-light)');
    const tagText = tag?.tag?.toUpperCase() || (line?.itemType === 'servicepack' ? 'SVC' : (lic?.type || 'LIC'));
    const isMerged = !!item._mergedLineIndices?.length && item._mergedLineIndices.length > 1;
    const total   = calcTotal(item);
    const monthly = calcMonthly(item);

    const tr = document.createElement('tr');
    tr.className = 'ug-item-row' + (isGrouped ? ' grouped-item' : '');
    tr.dataset.id = item.id;
    tr.draggable = true;
    if (selectedRows.has(item.id)) tr.classList.add('selected-row');

    // Drag
    const tdDrag = document.createElement('td');
    tdDrag.className = 'ug-col-drag';
    tdDrag.innerHTML = `<span class="pg-drag-handle">${ICONS.grip}</span>`;
    tr.appendChild(tdDrag);

    // Checkbox
    const tdCheck = document.createElement('td');
    tdCheck.className = 'ug-cell-check';
    const cb = document.createElement('input'); cb.type = 'checkbox';
    cb.checked = selectedRows.has(item.id);
    cb.addEventListener('click', e => { e.stopPropagation(); handleCheckbox(item.id, cb.checked, e.shiftKey); });
    tdCheck.appendChild(cb); tr.appendChild(tdCheck);

    // Name + SKU (col 2)
    const tdName = document.createElement('td');
    tdName.className = 'ug-cell-editable ug-col-name';
    tdName.style.cssText = isGrouped ? 'padding-left:28px;' : '';
    tdName.setAttribute('data-row', rowIdx); tdName.setAttribute('data-col', 2);

    const tagBadge = document.createElement('span');
    tagBadge.style.cssText = `font-size:0.52rem;font-weight:700;padding:1px 5px;border-radius:3px;background:${tagBg};color:${tagColor};text-transform:uppercase;letter-spacing:0.04em;margin-right:6px;vertical-align:middle;`;
    tagBadge.textContent = tagText;
    tdName.appendChild(tagBadge);

    if (isMerged) {
      const nameSpan = document.createElement('span');
      nameSpan.setAttribute('contenteditable', 'true');
      nameSpan.style.cssText = 'font-weight:500;font-size:0.875rem;outline:none;';
      nameSpan.textContent = displayName(item);
      nameSpan.addEventListener('blur', () => { item.displayName = nameSpan.textContent.trim() || null; });
      nameSpan.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); } });
      tdName.appendChild(nameSpan);

      const badge = document.createElement('span');
      badge.className = 'pg-merged-badge';
      const expanded = expandedMerges.has(item.id);
      badge.innerHTML = (expanded ? ICONS.chevronDown : ICONS.chevronRight) + `<span>${item._mergedLineIndices.length} merged</span>`;
      badge.addEventListener('click', e => { e.stopPropagation(); expandedMerges.has(item.id) ? expandedMerges.delete(item.id) : expandedMerges.add(item.id); render(); });
      tdName.appendChild(badge);

      const unmergeBtn = document.createElement('button');
      unmergeBtn.className = 'pg-unmerge-btn';
      unmergeBtn.textContent = 'Unmerge';
      unmergeBtn.addEventListener('click', e => { e.stopPropagation(); unmergeItem(item); });
      tdName.appendChild(unmergeBtn);
    } else {
      tdName.setAttribute('contenteditable', 'true');
      tdName.textContent = ''; // will be set below after badge
      // Re-add badge, then editable content
      tdName.innerHTML = '';
      tdName.appendChild(tagBadge);

      const nameNode = document.createTextNode(displayName(item));
      tdName.appendChild(nameNode);

      // SKU below
      if (displaySku(item)) {
        const skuDiv = document.createElement('div');
        skuDiv.style.cssText = 'font-size:0.68rem;color:var(--text-secondary);font-family:monospace;margin-top:1px;';
        skuDiv.textContent = displaySku(item);
        tdName.appendChild(skuDiv);
      }

      tdName.setAttribute('contenteditable', 'true');
      tdName.addEventListener('mousedown', e => {
        if (editingCell?.row === rowIdx && editingCell?.col === 2) return;
        e.preventDefault(); focusCell(rowIdx, 2);
      });
      tdName.addEventListener('dblclick', () => enterEdit(rowIdx, 2));
      tdName.addEventListener('blur', () => {
        tdName.classList.remove('ug-cell-editing', 'ug-cell-focused');
        if (editingCell?.row === rowIdx && editingCell?.col === 2) {
          // extract text (ignore badge)
          const txt = [...tdName.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim();
          commitLineField(item, 'displayName', txt); editingCell = null; render();
        }
      });
      tdName.addEventListener('keydown', e => {
        if (editingCell?.row !== rowIdx || editingCell?.col !== 2) return;
        if (e.key === 'Enter') { e.preventDefault(); const prev = exitEdit(true); if (prev) setTimeout(() => focusCell(prev.row+1, prev.col), 0); }
        if (e.key === 'Escape') { exitEdit(false); focusCell(rowIdx, 2); }
        if (e.key === 'Tab') { e.preventDefault(); exitEdit(true); const nc = nextEditCol(2, e.shiftKey?-1:1); if (nc) setTimeout(() => focusCell(rowIdx, nc), 0); }
      });
    }
    tr.appendChild(tdName);

    // SLA (col 4 display, not keyboard-nav editable — use click)
    const tdSla = document.createElement('td');
    tdSla.style.cssText = 'padding:6px 10px;';
    if (line?.itemType === 'servicepack') {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
      const hInp = document.createElement('input');
      hInp.type = 'number'; hInp.min = '0.5'; hInp.step = '0.5'; hInp.value = line.hours || 0;
      hInp.style.cssText = 'width:54px;padding:3px 6px;font-size:0.8rem;background:var(--surface);color:var(--text-main);border:1px solid var(--border);border-radius:4px;';
      hInp.addEventListener('change', e => { line.hours = parseFloat(e.target.value) || 0; line.price = line.hours * hourlyRate; emitSummary(); render(); });
      wrap.appendChild(hInp);
      const lbl = document.createElement('span'); lbl.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);'; lbl.textContent = 'hrs';
      wrap.appendChild(lbl); tdSla.appendChild(wrap);
    } else if (slas.length > 0) {
      const slaTag = document.createElement('span');
      slaTag.className = 'sla-tag'; slaTag.style.cursor = 'pointer';
      slaTag.textContent = currentSla?.name || 'None';
      slaTag.title = 'Click to change SLA';
      slaTag.addEventListener('click', e => { e.stopPropagation(); openSlaDropdown(item, slaTag); });
      tdSla.appendChild(slaTag);
    } else {
      tdSla.innerHTML = '<span style="font-size:0.8rem;color:var(--text-secondary);">—</span>';
    }
    tr.appendChild(tdSla);

    // Qty (col 5)
    tr.appendChild(makeEditableCell(item, 'displayQty', String(displayQty(item)), rowIdx, 5));
    // Price (col 6)
    tr.appendChild(makeEditableCell(item, 'displayPrice', displayPrice(item).toFixed(2), rowIdx, 6));
    // Margin (col 7)
    tr.appendChild(makeEditableCell(item, 'displayMargin', displayMargin(item).toFixed(1), rowIdx, 7));

    // Total
    const tdTot = document.createElement('td'); tdTot.className = 'ug-cell-total';
    tdTot.textContent = currency(total); tr.appendChild(tdTot);

    // Monthly
    const tdMon = document.createElement('td'); tdMon.className = 'ug-cell-monthly';
    if (monthly > 0) { tdMon.textContent = currency(monthly); }
    tr.appendChild(tdMon);

    // Notes (col 10)
    tr.appendChild(makeEditableCell(item, 'note', item.note || '', rowIdx, 10));

    // Actions
    const tdAct = document.createElement('td'); tdAct.className = 'ug-cell-actions';
    appendActionBtns(tdAct, item); tr.appendChild(tdAct);

    if (focusedCell && !editingCell) {
      const fc = el.querySelector(`[data-row="${focusedCell.row}"][data-col="${focusedCell.col}"]`);
      if (fc) fc.classList.add('ug-cell-focused');
    }

    return tr;
  }

  function buildDepRow(item, missingDeps) {
    const tr = document.createElement('tr');
    tr.style.cssText = 'background:#fef9e7;';
    const td = document.createElement('td'); td.colSpan = COL_TOTAL;
    td.style.cssText = 'padding:4px 12px 8px 52px;';

    const box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 10px;background:#fef3c7;border-radius:5px;border:1px solid #fcd34d;';

    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:0.7rem;color:#92400e;font-weight:600;';
    lbl.innerHTML = '⚠ Requires:';
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
    td.appendChild(box); tr.appendChild(td); return tr;
  }

  function buildGrandTotalRow(total, monthly) {
    const tr = document.createElement('tr'); tr.className = 'grand-total-row';
    tr.appendChild(document.createElement('td')); // drag
    tr.appendChild(document.createElement('td')); // check
    const lbl = document.createElement('td'); lbl.colSpan = 6;
    lbl.style.cssText = 'text-align:right;font-weight:700;font-size:0.9rem;padding:10px 12px;';
    lbl.textContent = 'Grand Total'; tr.appendChild(lbl);
    const tdTot = document.createElement('td'); tdTot.className = 'ug-cell-total';
    tdTot.style.fontWeight = '700'; tdTot.textContent = currency(total); tr.appendChild(tdTot);
    const tdMon = document.createElement('td'); tdMon.className = 'ug-cell-monthly';
    tdMon.style.fontWeight = '700'; tdMon.textContent = monthly > 0 ? currency(monthly) : ''; tr.appendChild(tdMon);
    tr.appendChild(document.createElement('td')); // notes
    tr.appendChild(document.createElement('td')); // actions
    return tr;
  }

  function appendActionBtns(container, item) {
    const arrows = document.createElement('span');
    arrows.className = 'pg-arrows';
    const up = document.createElement('button'); up.className = 'pg-move-btn'; up.innerHTML = ICONS.arrowUp; up.title = 'Move up';
    up.addEventListener('click', e => { e.stopPropagation(); moveItem(item, -1); });
    const down = document.createElement('button'); down.className = 'pg-move-btn'; down.innerHTML = ICONS.arrowDown; down.title = 'Move down';
    down.addEventListener('click', e => { e.stopPropagation(); moveItem(item, 1); });
    arrows.appendChild(up); arrows.appendChild(down); container.appendChild(arrows);

    const menu = document.createElement('button'); menu.className = 'pg-menu-btn'; menu.innerHTML = '&middot;&middot;&middot;'; menu.title = 'More actions';
    menu.addEventListener('click', e => {
      e.stopPropagation();
      const rect = menu.getBoundingClientRect();
      showContextMenu({ preventDefault: ()=>{}, clientX: rect.left, clientY: rect.bottom + 2 }, item);
    });
    container.appendChild(menu);
  }

  // ── Section helpers ───────────────────────────────────────────────

  function getSections(vis) {
    const headerMap = new Map();
    vis.filter(i => i.type === 'header').forEach(h => headerMap.set(h.id, { header: h, items: [] }));
    vis.filter(i => i.type === 'item').forEach(i => {
      if (i.groupId && headerMap.has(i.groupId)) headerMap.get(i.groupId).items.push(i);
    });
    const sections = [];
    let ungrouped = [];
    vis.forEach(item => {
      if (item.type === 'header') {
        if (ungrouped.length) { sections.push({ header: null, items: ungrouped }); ungrouped = []; }
        sections.push(headerMap.get(item.id));
      } else if (!item.groupId || !headerMap.has(item.groupId)) {
        ungrouped.push(item);
      }
    });
    if (ungrouped.length) sections.push({ header: null, items: ungrouped });
    return sections;
  }

  // ── Action dock ──────────────────────────────────────────────────

  function buildActionDock() {
    const count = selectedRows.size;
    if (!count) return null;

    const dock = document.createElement('div');
    dock.className = 'ug-action-dock';
    dock.style.cssText = [
      'position:sticky;bottom:0;left:0;right:0',
      'background:var(--primary);color:white',
      'display:flex;align-items:center;gap:8px;padding:10px 16px',
      'border-top:2px solid var(--primary)',
      'font-size:0.82rem;font-weight:500;z-index:20',
    ].join(';') + ';';

    const countBadge = document.createElement('span');
    countBadge.style.cssText = 'background:white;color:var(--primary);border-radius:12px;padding:2px 8px;font-weight:700;margin-right:4px;';
    countBadge.textContent = count;
    dock.appendChild(countBadge);
    dock.appendChild(document.createTextNode(`row${count > 1 ? 's' : ''} selected`));

    const sep = () => { const s = document.createElement('span'); s.style.cssText = 'opacity:0.4;margin:0 2px;'; s.textContent = '|'; dock.appendChild(s); };

    const btn = (label, action) => {
      sep();
      const b = document.createElement('button');
      b.style.cssText = 'background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:white;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:0.78rem;font-weight:500;';
      b.addEventListener('mouseenter', () => b.style.background = 'rgba(255,255,255,0.3)');
      b.addEventListener('mouseleave', () => b.style.background = 'rgba(255,255,255,0.2)');
      b.textContent = label;
      b.addEventListener('click', action);
      dock.appendChild(b);
    };

    if (count >= 2) {
      btn('Merge', mergeSelected);
      btn('Group', groupSelected);
    }
    btn('Delete', deleteSelected);

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'margin-left:auto;background:none;border:none;color:white;cursor:pointer;font-size:1.1rem;padding:0 4px;opacity:0.7;';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Deselect all';
    closeBtn.addEventListener('click', () => { selectedRows.clear(); emitSelChange(); render(); });
    dock.appendChild(closeBtn);

    return dock;
  }

  // ── Main render ──────────────────────────────────────────────────

  function render() {
    el.innerHTML = '';

    const vis = visibleItems();
    const hiddenItems = _items.filter(i => i.hidden).sort((a,b) => a.order - b.order);

    if (vis.length === 0 && hiddenItems.length === 0) {
      el.innerHTML = `
        <div style="text-align:center;padding:3rem 2rem;color:var(--text-secondary);">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor"
               style="width:44px;height:44px;margin:0 auto 14px;opacity:0.35;display:block;">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"/>
          </svg>
          <p style="font-size:0.9rem;margin-bottom:6px;font-weight:500;">No items yet</p>
          <p style="font-size:0.8rem;">Click items in the catalog to add them here</p>
        </div>`;
      return;
    }

    const table = document.createElement('table');
    table.className = 'presentation-grid';
    table.setAttribute('tabindex', '0');
    table.style.cssText = 'table-layout:auto;';

    // Thead
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const cols = [
      { text: '', w: '28px' }, { text: '', w: '36px' },
      { text: 'Item',      w: '' },
      { text: 'SLA',       w: '115px' },
      { text: 'Qty',       w: '70px' },
      { text: 'Unit Price',w: '110px' },
      { text: 'Margin %',  w: '85px' },
      { text: 'Total',     w: '120px', right: true },
      { text: 'Monthly',   w: '105px', right: true },
      { text: 'Notes',     w: '140px' },
      { text: '',          w: '88px'  },
    ];
    cols.forEach(c => {
      const th = document.createElement('th');
      if (c.w) th.style.width = c.w;
      if (c.right) th.style.textAlign = 'right';
      th.textContent = c.text;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow); table.appendChild(thead);

    // Tbody
    const tbody = document.createElement('tbody');
    const sections = getSections(vis);
    let rowIdx = 0;
    let grandTotal = 0, grandMonthly = 0;

    sections.forEach(section => {
      if (section.header) {
        tbody.appendChild(buildHeaderRow(section.header, section.items, rowIdx++));
      }
      const collapsed = section.header && collapsedGroups.has(section.header.id);
      section.items.forEach(item => {
        if (!collapsed) {
          const tr = buildItemRow(item, !!section.header, rowIdx);
          tbody.appendChild(tr);
          // Expanded merge sub-rows
          if (item._mergedLineIndices?.length > 1 && expandedMerges.has(item.id)) {
            item._mergedLineIndices.forEach(li => {
              const subTr = document.createElement('tr'); subTr.className = 'pg-merged-subrow';
              subTr.innerHTML = `<td></td><td></td><td colspan="9" style="padding-left:52px;font-size:0.75rem;color:var(--text-secondary);">${_lineItems[li]?.name || ''}</td>`;
              tbody.appendChild(subTr);
            });
          }
          // Dependency warnings
          const deps = getMissingDeps(item);
          if (deps.length) tbody.appendChild(buildDepRow(item, deps));
        }
        rowIdx++;
        grandTotal += calcTotal(item);
        grandMonthly += calcMonthly(item);
      });
    });

    // Hidden rows
    hiddenItems.forEach(item => {
      const tr = document.createElement('tr'); tr.className = 'hidden-row'; tr.dataset.id = item.id;
      tr.appendChild(document.createElement('td')); tr.appendChild(document.createElement('td'));
      const tdN = document.createElement('td'); tdN.textContent = displayName(item); tr.appendChild(tdN);
      const tdS = document.createElement('td'); tr.appendChild(tdS);
      const tdQ = document.createElement('td'); tdQ.textContent = displayQty(item); tr.appendChild(tdQ);
      const tdP = document.createElement('td'); tdP.textContent = currency(displayPrice(item)); tr.appendChild(tdP);
      const tdM = document.createElement('td'); tdM.textContent = displayMargin(item).toFixed(1) + '%'; tr.appendChild(tdM);
      const tdT = document.createElement('td'); tdT.textContent = currency(calcTotal(item)); tr.appendChild(tdT);
      tr.appendChild(document.createElement('td')); tr.appendChild(document.createElement('td'));
      const tdA = document.createElement('td');
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn btn-ghost btn-sm'; restoreBtn.style.cssText = 'font-size:0.7rem;color:var(--primary);';
      restoreBtn.textContent = 'Restore';
      restoreBtn.addEventListener('click', () => { item.hidden = false; emitSummary(); render(); });
      tdA.appendChild(restoreBtn); tr.appendChild(tdA);
      tbody.appendChild(tr);
    });

    // Grand total
    if (vis.filter(i => i.type === 'item').length > 0) {
      tbody.appendChild(buildGrandTotalRow(grandTotal, grandMonthly));
    }

    table.appendChild(tbody);

    // Event delegation
    tbody.addEventListener('click', e => {
      if (e.target.closest('button, input, [contenteditable="true"], .pg-merged-badge, .pg-unmerge-btn, .sla-tag')) return;
      const tr = e.target.closest('tr[data-id]');
      if (!tr || tr.classList.contains('hidden-row')) return;
      handleRowClick(tr.dataset.id, e);
    });
    tbody.addEventListener('contextmenu', e => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr || tr.classList.contains('hidden-row')) return;
      const item = _items.find(i => i.id === tr.dataset.id);
      if (item) showContextMenu(e, item);
    });
    setupDrag(tbody);
    table.addEventListener('keydown', handleTableKey);

    el.appendChild(table);

    // Action dock
    const dock = buildActionDock();
    if (dock) el.appendChild(dock);
  }

  render();

  return {
    element: el,
    addItem,
    loadItems,
    getLineItems,
    getGroups,
    getSummary,
    update(props) {
      if (props.licenses      !== undefined) licenses      = props.licenses;
      if (props.servicePacks  !== undefined) servicePacks  = props.servicePacks;
      if (props.isTemplateMode !== undefined) isTemplateMode = props.isTemplateMode;
      if (props.hourlyRate    !== undefined) hourlyRate    = props.hourlyRate;
      render();
    },
    setOnSelectionChange(fn) { onSelChange = fn; },
  };
}
