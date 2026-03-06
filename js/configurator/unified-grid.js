// unified-grid.js
// Full Excel-like quote grid.
// Uses existing presentation-grid CSS classes throughout.
//
// Changes from v2:
//   • Floating pill dock (pe-floating-bar) instead of sticky bar
//   • Grand total row is light, not black
//   • Only the license NAME is editable — not SKU or type badge
//   • Bigger row height (46px)
//   • Original value tracking: amber dot + "was: X" annotation + ↺ reset
//   • Selection uses existing .selected-row styles (indigo highlight)

import { currency } from '../utils/format.js';
import { getMeasurePointTag } from '../utils/license-calculations.js';
import { showToast } from '../components/toast.js';
import { showConfirmModal } from '../components/modal.js';

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
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>',
};

// Column layout:
// 0=drag 1=check 2=type+sku 3=name 4=sla 5=qty 6=price 7=margin 8=total 9=monthly 10=notes-btn 11=actions
const EDIT_COLS = [3, 5, 6, 7]; // name, qty, price, margin (notes is a modal button now)
const COL_COUNT = 12;

export function createUnifiedGrid({
  licenses = [],
  servicePacks = [],
  isTemplateMode = false,
  hourlyRate = 150,
  onSummaryChange = null,
}) {
  const el = document.createElement('div');
  el.style.cssText = 'position:relative;';

  // ── State ────────────────────────────────────────────────────────
  let _lineItems = [];   // current mutable values
  let _originals = [];   // snapshot at add time (for reset/diff)
  let _items = [];       // display rows

  let selectedRows    = new Set();
  let collapsedGroups = new Set();
  let expandedMerges  = new Set();
  let lastClickedRow  = null;
  let focusedCell     = null;
  let editingCell     = null;
  let editOrigVal     = '';
  let ctxMenu         = null;
  let ctxDismiss      = null;
  let dragId          = null;
  let dropGap         = null;
  let dragIndicator   = null;
  let floatingBar     = null;   // appended to document.body
  let onSelChange     = null;

  let _seq = 0;
  function gid(p = 'r') { return `${p}-${++_seq}-${Math.random().toString(36).slice(2,6)}`; }

  // ── Data helpers ─────────────────────────────────────────────────

  function getLine(item) {
    if (item.lineIdx == null) return null;
    return _lineItems[item.lineIdx] || null;
  }
  function getOrig(item) {
    if (item.lineIdx == null) return null;
    return _originals[item.lineIdx] || null;
  }
  function getMergedLines(item) {
    if (item._mergedIdx?.length) return item._mergedIdx.map(i => _lineItems[i]).filter(Boolean);
    const l = getLine(item); return l ? [l] : [];
  }

  function dName(item) {
    if (item.displayName != null) return item.displayName;
    return getLine(item)?.name || '';
  }
  function dSku(item) {
    const lines = getMergedLines(item);
    if (!lines.length) return '';
    return lines.length === 1 ? (lines[0].sku || '') : lines.map(l => l.sku).filter(Boolean).join(', ');
  }
  function dQty(item) {
    if (item.displayQty != null) return item.displayQty;
    return getMergedLines(item).reduce((s, l) => s + (l.amount || 0), 0);
  }
  function dPrice(item) {
    if (item.displayPrice != null) return item.displayPrice;
    const lines = getMergedLines(item);
    return lines.length ? lines.reduce((s, l) => s + (l.price || 0), 0) / lines.length : 0;
  }
  function dMargin(item) {
    if (item.displayMargin != null) return item.displayMargin;
    return getLine(item)?.margin ?? 0;
  }

  function calcTotal(item) { return dPrice(item) * dQty(item) * (1 + dMargin(item) / 100); }
  function calcMonthly(item) {
    const line = getLine(item);
    if (!line || line.itemType === 'servicepack') return 0;
    const lic = licenses.find(l => l.id === line.licenseId);
    const sla = lic?.expand?.possible_SLAs?.find(s => s.id === line.sla);
    return sla ? calcTotal(item) * (sla.monthly_percentage / 100) : 0;
  }

  // What fields differ from original
  function getChanges(item) {
    const line = getLine(item), orig = getOrig(item);
    if (!line || !orig) return {};
    const changes = {};
    if (item.displayName != null && item.displayName !== orig.name) changes.name = orig.name;
    if (line.amount !== orig.amount) changes.qty = orig.amount;
    if (Math.abs(line.price - orig.price) > 0.001) changes.price = orig.price;
    if (Math.abs(line.margin - orig.margin) > 0.001) changes.margin = orig.margin;
    if (line.sla !== orig.sla) changes.sla = orig.sla;
    return changes;
  }
  function isModified(item) { return Object.keys(getChanges(item)).length > 0; }

  function resetItem(item) {
    const line = getLine(item), orig = getOrig(item);
    if (!line || !orig) return;
    line.amount  = orig.amount;
    line.price   = orig.price;
    line.margin  = orig.margin;
    line.sla     = orig.sla;
    item.displayName   = null;
    item.displayQty    = null;
    item.displayPrice  = null;
    item.displayMargin = null;
    emitSummary(); render();
    showToast('Reset to original', 'success');
  }

  function getMissingDeps(item) {
    const line = getLine(item);
    if (!line || line.itemType === 'servicepack') return [];
    const lic = licenses.find(l => l.id === line.licenseId);
    if (!lic?.depends_on?.length) return [];
    const presentIds = new Set(_lineItems.map(l => l.licenseId));
    return lic.depends_on.filter(id => !presentIds.has(id))
      .map(id => licenses.find(l => l.id === id)).filter(Boolean);
  }

  function vis() { return _items.filter(i => !i.hidden).sort((a, b) => a.order - b.order); }
  function reindex() { [..._items].sort((a,b) => a.order - b.order).forEach((it,i) => { it.order = i; }); }

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
  function emitSel() { if (onSelChange) onSelChange(selectedRows.size); }

  // ── Public API ───────────────────────────────────────────────────

  function addItem(catalogItem) {
    if (catalogItem.type === 'license') {
      const lic = catalogItem.item;
      const slas = lic.expand?.possible_SLAs || [];
      const defaultSla = slas.find(s => s.name.toLowerCase().includes('essential'))?.id || slas[0]?.id || '';

      // Bump qty if already in grid
      const existIdx = _lineItems.findIndex(l => l.licenseId === lic.id && l.itemType !== 'servicepack');
      if (existIdx >= 0) {
        _lineItems[existIdx].amount++;
        reindex(); render(); emitSummary(); return;
      }

      const lineData = {
        licenseId: lic.id, name: lic.name, sku: lic.sku,
        price: lic.initial_price, amount: lic._overrideQty || 1,
        margin: 25, sla: defaultSla, itemType: 'license',
      };
      const lineIdx = _lineItems.length;
      _lineItems.push(lineData);
      _originals.push({ ...lineData }); // snapshot

    } else {
      const sp = catalogItem.item;
      const lineData = {
        licenseId: sp.id, name: sp.package_name, sku: sp.id,
        price: (sp.estimated_hours || 0) * hourlyRate,
        amount: 1, margin: 25, sla: '', itemType: 'servicepack', hours: sp.estimated_hours || 0,
      };
      const lineIdx = _lineItems.length;
      _lineItems.push(lineData);
      _originals.push({ ...lineData });
    }

    // Find the last header group to assign to
    const visItems = vis();
    const lastHeader = [...visItems].filter(i => i.type === 'header').slice(-1)[0];
    const lineIdx = _lineItems.length - 1;

    _items.push({
      id: gid('i'), type: 'item', lineIdx,
      displayName: null, displayQty: null, displayPrice: null, displayMargin: null,
      note: '', hidden: false, order: _items.length,
      groupId: lastHeader?.id || null,
    });
    reindex(); render(); emitSummary();
  }

  function loadItems(lineItems = [], groups = []) {
    _lineItems = lineItems.map(l => ({ ...l }));
    _originals = lineItems.map(l => ({ ...l })); // loaded values = originals
    _items = [];
    groups.forEach((g, i) => {
      _items.push({ id: g.id || gid('h'), type: 'header', displayName: g.name || g.description || 'Group', hidden: false, order: i });
    });
    lineItems.forEach((line, i) => {
      const groupId = line.containerId || line.groupId || null;
      const resolvedGroup = groupId && _items.find(it => it.type === 'header' && it.id === groupId) ? groupId : null;
      _items.push({
        id: gid('i'), type: 'item', lineIdx: i,
        displayName: null, displayQty: null, displayPrice: null, displayMargin: null,
        note: '', hidden: false, order: groups.length + i, groupId: resolvedGroup,
      });
    });
    reindex(); render(); emitSummary();
  }

  function getLineItems() {
    return _lineItems.map((line, idx) => {
      const displayItem = _items.find(it => it.type === 'item' && it.lineIdx === idx && !it.hidden);
      return { ...line, containerId: displayItem?.groupId || null };
    });
  }
  function getGroups() {
    return vis().filter(i => i.type === 'header').map(h => ({ id: h.id, name: h.displayName || 'Group' }));
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

  // ── Commit edits ─────────────────────────────────────────────────

  function commitField(item, field, raw) {
    const line = getLine(item); if (!line) return;
    if (field === 'name') {
      const v = raw.trim();
      item.displayName = (v === '' || v === (getOrig(item)?.name || line.name)) ? null : v;
    } else if (field === 'note') {
      item.note = raw;
    } else if (['qty','price','margin'].includes(field)) {
      // Strip currency symbol and thousands separators before parsing
      const n = parseFloat(raw.replace(/[^0-9.,-]/g, '').replace(',', '.'));
      if (isNaN(n)) return;
      if (field === 'qty')    line.amount = Math.max(0, n);
      if (field === 'price')  line.price  = Math.max(0, n);
      if (field === 'margin') line.margin = n;
    }
    emitSummary();
  }

  // ── SLA dropdown ─────────────────────────────────────────────────

  function openSla(item, trigger) {
    const line = getLine(item); if (!line) return;
    const lic  = licenses.find(l => l.id === line.licenseId);
    const slas = lic?.expand?.possible_SLAs || [];
    if (!slas.length) return;

    document.querySelectorAll('.ug-sla-dd').forEach(d => d.remove());
    const dd = document.createElement('div');
    dd.className = 'ug-sla-dd sla-dropdown';
    const rect = trigger.getBoundingClientRect();
    dd.style.cssText = `position:fixed;top:${rect.bottom+2}px;left:${rect.left}px;z-index:1000;`;

    [{ id: '', name: 'None' }, ...slas].forEach(opt => {
      const row = document.createElement('div');
      row.className = 'sla-dropdown-item' + (opt.id === (line.sla||'') ? ' active' : '');
      row.textContent = opt.name;
      row.addEventListener('click', e => {
        e.stopPropagation();
        const orig = getOrig(item);
        line.sla = opt.id;
        dd.remove(); render(); emitSummary();
      });
      dd.appendChild(row);
    });

    document.body.appendChild(dd);
    const close = e => { if (!dd.contains(e.target) && e.target !== trigger) { dd.remove(); document.removeEventListener('click', close, true); } };
    setTimeout(() => document.addEventListener('click', close, true), 0);
  }

  // ── Context menu ─────────────────────────────────────────────────

  function closeCtx() {
    if (ctxDismiss) { document.removeEventListener('click', ctxDismiss, true); document.removeEventListener('contextmenu', ctxDismiss, true); ctxDismiss = null; }
    ctxMenu?.remove(); ctxMenu = null;
  }

  function showCtx(e, item) {
    e.preventDefault(); closeCtx();
    const visible = vis();
    const idx = visible.findIndex(i => i.id === item.id);
    const items = [];

    if (item.type === 'item') {
      items.push({ icon: ICONS.plus, label: 'Add Group Above', fn: () => addGroupAt(item, 'above') });
      items.push({ icon: ICONS.plus, label: 'Add Group Below', fn: () => addGroupAt(item, 'below') });
      const headers = _items.filter(i => i.type === 'header' && !i.hidden);
      if (headers.length) {
        items.push('sep');
        if (item.groupId) items.push({ icon: ICONS.group, label: 'Remove from Group', fn: () => { delete item.groupId; reindex(); render(); } });
        headers.filter(h => h.id !== item.groupId).forEach(h =>
          items.push({ icon: ICONS.group, label: `Move to "${h.displayName}"`, fn: () => { item.groupId = h.id; reindex(); render(); } }));
      }
      items.push('sep');
      items.push({ icon: ICONS.plus,      label: 'Insert Empty Row Above', fn: () => insertEmpty(item, 'above') });
      items.push({ icon: ICONS.plus,      label: 'Insert Empty Row Below', fn: () => insertEmpty(item, 'below') });
      items.push({ icon: ICONS.duplicate, label: 'Duplicate Row',          fn: () => duplicateItem(item) });
      items.push({ icon: ICONS.trash,     label: 'Delete Row',             fn: () => softDelete(item), danger: true });
      if (isModified(item)) items.push({ icon: ICONS.reset, label: 'Reset to Original', fn: () => resetItem(item) });
      if (idx > 0 && visible[idx-1].type === 'item')              items.push({ icon: ICONS.merge, label: 'Merge with Above', fn: () => mergeTwo(item, visible[idx-1]) });
      if (idx < visible.length-1 && visible[idx+1].type === 'item') items.push({ icon: ICONS.merge, label: 'Merge with Below', fn: () => mergeTwo(item, visible[idx+1]) });
      items.push('sep');
      items.push({ icon: ICONS.moveTop,    label: 'Move to Top',    fn: () => moveEdge(item, 'top') });
      items.push({ icon: ICONS.moveBottom, label: 'Move to Bottom', fn: () => moveEdge(item, 'bottom') });
    } else {
      items.push({ icon: ICONS.plus,      label: 'Insert Empty Row Below', fn: () => insertEmpty(item, 'below') });
      items.push({ icon: ICONS.duplicate, label: 'Duplicate Group',        fn: () => duplicateItem(item) });
      items.push({ icon: ICONS.trash,     label: 'Delete Group',           fn: () => softDelete(item), danger: true });
      items.push('sep');
      items.push({ icon: ICONS.moveTop,    label: 'Move to Top',    fn: () => moveEdge(item, 'top') });
      items.push({ icon: ICONS.moveBottom, label: 'Move to Bottom', fn: () => moveEdge(item, 'bottom') });
    }

    const menu = document.createElement('div'); menu.className = 'pe-context-menu';
    items.forEach(mi => {
      if (mi === 'sep') { const s = document.createElement('div'); s.className = 'pe-context-menu-sep'; menu.appendChild(s); return; }
      const btn = document.createElement('button');
      btn.className = 'pe-context-menu-item' + (mi.danger ? ' pe-ctx-danger' : '');
      btn.innerHTML = mi.icon + `<span>${mi.label}</span>`;
      btn.addEventListener('click', () => { closeCtx(); mi.fn(); });
      menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(e.clientX, window.innerWidth  - r.width  - 8) + 'px';
    menu.style.top  = Math.min(e.clientY, window.innerHeight - r.height - 8) + 'px';
    ctxMenu = menu;
    ctxDismiss = ev => { if (ctxMenu && !ctxMenu.contains(ev.target)) closeCtx(); };
    setTimeout(() => { document.addEventListener('click', ctxDismiss, true); document.addEventListener('contextmenu', ctxDismiss, true); }, 0);
  }

  // ── Item actions ─────────────────────────────────────────────────

  function addGroupAt(item, pos) {
    const visible = vis(), idx = visible.findIndex(i => i.id === item.id);
    const order = pos === 'above'
      ? (idx > 0 ? (visible[idx-1].order + item.order) / 2 : item.order - 0.5)
      : (idx < visible.length-1 ? (item.order + visible[idx+1].order) / 2 : item.order + 0.5);
    const h = { id: gid('h'), type: 'header', displayName: 'New Group', hidden: false, order };
    _items.push(h);
    if (pos === 'above') item.groupId = h.id;
    reindex(); render();
  }

  function insertEmpty(item, pos) {
    const visible = vis(), idx = visible.findIndex(i => i.id === item.id);
    const order = pos === 'above'
      ? (idx > 0 ? (visible[idx-1].order + item.order) / 2 : item.order - 0.5)
      : (idx < visible.length-1 ? (item.order + visible[idx+1].order) / 2 : item.order + 0.5);
    const lineData = { licenseId: null, name: '', sku: '', price: 0, amount: 1, margin: 25, sla: '', itemType: 'license' };
    const lineIdx = _lineItems.length;
    _lineItems.push(lineData); _originals.push({ ...lineData });
    _items.push({ id: gid('i'), type: 'item', lineIdx, displayName: null, displayQty: null, displayPrice: null, displayMargin: null,
      note: '', hidden: false, order, groupId: item.type === 'header' && pos === 'below' ? item.id : (item.groupId || null) });
    reindex(); render();
  }

  function duplicateItem(item) {
    const dup = { ...item, id: gid('i'), order: item.order + 0.5 };
    if (item.type === 'item' && item.lineIdx != null) {
      const newIdx = _lineItems.length;
      _lineItems.push({ ..._lineItems[item.lineIdx] });
      _originals.push({ ..._originals[item.lineIdx] });
      dup.lineIdx = newIdx;
    }
    _items.push(dup); reindex(); render(); emitSummary();
    showToast('Row duplicated', 'success');
  }

  function softDelete(item) {
    if (item.type === 'header') {
      // Remove header and ungroup its children
      _items.forEach(i => { if (i.groupId === item.id) delete i.groupId; });
    }
    _items = _items.filter(i => i.id !== item.id);
    reindex(); emitSummary(); render();
  }

  function mergeTwo(a, b) {
    const [first, second] = [a,b].sort((x,y) => x.order - y.order);
    const mergedIdx = [...new Set([
      ...(first._mergedIdx || (first.lineIdx != null ? [first.lineIdx] : [])),
      ...(second._mergedIdx || (second.lineIdx != null ? [second.lineIdx] : [])),
    ])];
    const tq = dQty(first) + dQty(second) || 1;
    const merged = {
      id: gid('i'), type: 'item', lineIdx: mergedIdx[0], _mergedIdx: mergedIdx,
      displayName: dName(first) + ' + ' + dName(second),
      displayQty: dQty(first) + dQty(second),
      displayPrice: (dPrice(first)*dQty(first) + dPrice(second)*dQty(second)) / tq,
      displayMargin: (dMargin(first) + dMargin(second)) / 2,
      note: [first.note, second.note].filter(Boolean).join('; '),
      hidden: false, order: first.order, groupId: first.groupId || second.groupId || null,
    };
    _items = _items.filter(i => i.id !== first.id && i.id !== second.id);
    _items.push(merged); reindex(); emitSummary(); render();
    showToast('Items merged', 'success');
  }

  function unmergeItem(item) {
    if (!item._mergedIdx?.length) return;
    const newItems = item._mergedIdx.map((li, i) => ({
      id: gid('i'), type: 'item', lineIdx: li, displayName: null, displayQty: null, displayPrice: null, displayMargin: null,
      note: '', hidden: false, order: item.order + i * 0.1, groupId: item.groupId || null,
    }));
    _items = _items.filter(i => i.id !== item.id);
    _items.push(...newItems); expandedMerges.delete(item.id);
    reindex(); emitSummary(); render();
    showToast('Items unmerged', 'success');
  }

  function moveEdge(item, edge) {
    const v = vis();
    item.order = edge === 'top' ? v[0].order - 1 : v[v.length-1].order + 1;
    reindex(); render();
  }

  function moveItem(item, dir) {
    const v = vis(), idx = v.findIndex(i => i.id === item.id);
    const swap = v[idx + dir]; if (!swap) return;
    [item.order, swap.order] = [swap.order, item.order]; render();
  }

  // ── Multi-select ─────────────────────────────────────────────────

  function handleClick(id, e) {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const mod = isMac ? e.metaKey : e.ctrlKey;
    const v = vis();
    if (e.shiftKey && lastClickedRow) {
      const a = v.findIndex(i => i.id === lastClickedRow), b = v.findIndex(i => i.id === id);
      if (a >= 0 && b >= 0) { const [lo,hi] = [Math.min(a,b),Math.max(a,b)]; for (let i=lo;i<=hi;i++) selectedRows.add(v[i].id); }
    } else if (mod) {
      selectedRows.has(id) ? selectedRows.delete(id) : selectedRows.add(id);
    } else {
      selectedRows.clear(); selectedRows.add(id);
    }
    lastClickedRow = id; emitSel(); render();
  }

  function handleCheck(id, checked, shift) {
    if (shift && lastClickedRow) {
      const v = vis(), a = v.findIndex(i => i.id === lastClickedRow), b = v.findIndex(i => i.id === id);
      if (a>=0&&b>=0) { const [lo,hi]=[Math.min(a,b),Math.max(a,b)]; for(let i=lo;i<=hi;i++) selectedRows.add(v[i].id); }
    } else {
      checked ? selectedRows.add(id) : selectedRows.delete(id);
      // If toggling a group header, select/deselect all children
      const clicked = _items.find(i => i.id === id);
      if (clicked?.type === 'header') {
        _items.filter(i => i.groupId === id && !i.hidden)
              .forEach(i => checked ? selectedRows.add(i.id) : selectedRows.delete(i.id));
      }
    }
    lastClickedRow = id; emitSel(); render();
  }

  function mergeSelected() {
    const sel = _items.filter(i => selectedRows.has(i.id) && i.type==='item' && !i.hidden);
    if (sel.length < 2) { showToast('Select at least 2 items to merge', 'warning'); return; }
    const mergedIdx = [...new Set(sel.flatMap(i => i._mergedIdx || (i.lineIdx!=null?[i.lineIdx]:[])))];
    const tq = sel.reduce((s,i)=>s+dQty(i),0)||1;
    const merged = {
      id: gid('i'), type: 'item', lineIdx: mergedIdx[0], _mergedIdx: mergedIdx,
      displayName: sel.map(i=>dName(i)).join(' + '),
      displayQty: sel.reduce((s,i)=>s+dQty(i),0),
      displayPrice: sel.reduce((s,i)=>s+dPrice(i)*dQty(i),0)/tq,
      displayMargin: sel.reduce((s,i)=>s+dMargin(i),0)/sel.length,
      note: sel.map(i=>i.note).filter(Boolean).join('; '),
      hidden: false, order: Math.min(...sel.map(i=>i.order)), groupId: sel[0].groupId||null,
    };
    _items = _items.filter(i=>!selectedRows.has(i.id));
    _items.push(merged); selectedRows.clear(); reindex(); emitSummary(); emitSel(); render();
    showToast(`${sel.length} items merged`, 'success');
  }

  function groupSelected() {
    const sel = _items.filter(i=>selectedRows.has(i.id)&&!i.hidden).sort((a,b)=>a.order-b.order);
    if (sel.length < 2) { showToast('Select at least 2 items to group','warning'); return; }
    const h = { id: gid('h'), type: 'header', displayName: 'New Group', hidden: false, order: sel[0].order-0.5 };
    _items.push(h);
    sel.forEach((item,i) => { item.groupId = h.id; item.order = sel[0].order + i*0.1; });
    selectedRows.clear(); reindex(); emitSel(); render();
  }

  function deleteSelected() {
    const cnt = selectedRows.size; if (!cnt) return;
    [...selectedRows].forEach(id => {
      const it = _items.find(i=>i.id===id);
      if (!it) return;
      if (it.type === 'header') _items.forEach(i => { if (i.groupId===id) delete i.groupId; });
    });
    _items = _items.filter(i => !selectedRows.has(i.id));
    selectedRows.clear(); reindex(); emitSummary(); emitSel(); render();
  }

  // ── Floating bar (portal to body) ────────────────────────────────

  function destroyFloatingBar() { floatingBar?.remove(); floatingBar = null; }

  function renderFloatingBar() {
    destroyFloatingBar();
    const cnt = selectedRows.size; if (!cnt) return;

    floatingBar = document.createElement('div');
    // Light card style — matches app surface, not dark bar
    floatingBar.style.cssText = [
      'position:fixed;bottom:28px;left:50%;transform:translateX(-50%)',
      'display:flex;align-items:center;gap:8px;padding:8px 16px',
      'border-radius:999px',
      'background:var(--surface)',
      'border:1px solid var(--border)',
      'box-shadow:0 4px 24px rgba(0,0,0,0.10),0 1px 4px rgba(0,0,0,0.06)',
      'font-size:0.82rem;font-weight:500;color:var(--text-main)',
      'z-index:200;white-space:nowrap',
      'animation:pe-barIn 0.18s ease-out',
    ].join(';') + ';';

    const lbl = document.createElement('span');
    lbl.style.cssText = 'color:var(--text-secondary);margin-right:2px;font-size:0.78rem;';
    lbl.textContent = `${cnt} row${cnt>1?'s':''} selected`;
    floatingBar.appendChild(lbl);

    const sep = () => { const s=document.createElement('div'); s.style.cssText='width:1px;height:16px;background:var(--border);margin:0 2px;'; floatingBar.appendChild(s); };

    const addBtn = (text, style, fn) => {
      const b = document.createElement('button');
      b.style.cssText = `display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:999px;font-size:0.76rem;font-weight:500;cursor:pointer;transition:all 0.12s;${style}`;
      b.textContent = text;
      b.addEventListener('click', fn);
      floatingBar.appendChild(b);
    };

    if (cnt >= 2) {
      sep();
      addBtn('Merge', 'background:var(--primary);color:#fff;border:1px solid var(--primary);', mergeSelected);
      addBtn('Group', 'background:var(--primary-light);color:var(--primary);border:1px solid var(--primary);', groupSelected);
    }
    sep();
    addBtn('Delete', 'background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.25);', deleteSelected);
    sep();

    const close = document.createElement('button');
    close.style.cssText = 'background:none;border:1px solid var(--border);color:var(--text-secondary);border-radius:999px;padding:3px 8px;cursor:pointer;font-size:0.8rem;';
    close.innerHTML = '&times;';
    close.title = 'Deselect all';
    close.addEventListener('click', () => { selectedRows.clear(); emitSel(); render(); });
    floatingBar.appendChild(close);

    document.body.appendChild(floatingBar);
  }

  // ── Drag & drop ──────────────────────────────────────────────────

  function setupDrag(tbody) {
    tbody.addEventListener('dragstart', e => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      dragId = tr.dataset.id; e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => tr.classList.add('pg-dragging'));
    });

    let dropTargetGroupId = null;

    function clearDropTargetHighlight() {
      tbody.querySelectorAll('.pg-drop-target-group').forEach(r => r.classList.remove('pg-drop-target-group'));
      dropTargetGroupId = null;
    }

    tbody.addEventListener('dragover', e => {
      if (!dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      const trs = [...tbody.querySelectorAll('tr[data-id]:not(.pg-dragging)')];
      if (!trs.length) return;

      // Check if hovering directly over a group header → highlight it as drop target
      const hoveredTr = e.target.closest('tr[data-id]');
      const hoveredItem = hoveredTr ? _items.find(i => i.id === hoveredTr.dataset.id) : null;
      const dragItem = _items.find(i => i.id === dragId);

      if (hoveredItem?.type === 'header' && dragItem?.type !== 'header') {
        // Drop INTO group highlight mode
        clearDropTargetHighlight();
        dragIndicator?.remove(); dragIndicator = null; dropGap = null;
        hoveredTr.classList.add('pg-drop-target-group');
        dropTargetGroupId = hoveredItem.id;
        return;
      } else {
        clearDropTargetHighlight();
      }

      let best = 0, bestD = Infinity;
      trs.forEach((tr, i) => {
        const mid = (tr.getBoundingClientRect().top + tr.getBoundingClientRect().bottom) / 2;
        const d = Math.abs(e.clientY - mid);
        if (d < bestD) { bestD = d; best = e.clientY < mid ? i : i+1; }
      });
      dropGap = best;
      if (!dragIndicator) {
        dragIndicator = document.createElement('tr');
        dragIndicator.innerHTML = `<td colspan="${COL_COUNT}" style="padding:0;height:2px;background:var(--primary);box-shadow:0 0 6px rgba(79,70,229,0.4);"></td>`;
      }
      tbody.insertBefore(dragIndicator, trs[best] || null);
    });

    tbody.addEventListener('dragleave', e => {
      if (!tbody.contains(e.relatedTarget)) {
        dragIndicator?.remove(); dragIndicator = null; dropGap = null;
        clearDropTargetHighlight();
      }
    });

    tbody.addEventListener('drop', e => {
      e.preventDefault();
      dragIndicator?.remove(); dragIndicator = null;
      tbody.querySelectorAll('.pg-dragging').forEach(r => r.classList.remove('pg-dragging'));

      // Drop INTO group
      if (dropTargetGroupId) {
        const dragItem = _items.find(i => i.id === dragId);
        if (dragItem && dragItem.type !== 'header') {
          dragItem.groupId = dropTargetGroupId;
          // Place at end of group's items
          const groupItems = _items.filter(i => i.groupId === dropTargetGroupId);
          dragItem.order = groupItems.reduce((max, i) => Math.max(max, i.order), 0) + 1;
        }
        clearDropTargetHighlight();
        dragId = null; dropGap = null; reindex(); render();
        return;
      }

      if (!dragId || dropGap == null) { dragId = null; return; }

      const ids = [...tbody.querySelectorAll('tr[data-id]')].map(r => r.dataset.id);
      const di = ids.indexOf(dragId);
      if (di === dropGap || di+1 === dropGap) { dragId = null; return; }

      const reordered = ids.filter(id => id !== dragId);
      const insertAt = dropGap > di ? dropGap-1 : dropGap;
      reordered.splice(insertAt, 0, dragId);
      reordered.forEach((id, i) => { const it = _items.find(r => r.id===id); if(it) it.order=i; });
      _items.filter(i => !ids.includes(i.id)).forEach((i, idx) => { i.order = reordered.length + idx; });

      const dragItem = _items.find(i => i.id===dragId);
      if (dragItem && dragItem.type !== 'header') {
        const afterId = reordered[insertAt-1];
        if (afterId) {
          const after = _items.find(i => i.id===afterId);
          dragItem.groupId = after?.type==='header' ? after.id : (after?.groupId||null);
        } else { dragItem.groupId = null; }
      }

      dragId = null; dropGap = null; reindex(); render();
    });

    tbody.addEventListener('dragend', () => {
      dragIndicator?.remove(); dragIndicator = null;
      tbody.querySelectorAll('.pg-dragging').forEach(r => r.classList.remove('pg-dragging'));
      dragId = null; dropGap = null;
    });
  }

  // ── Keyboard nav ─────────────────────────────────────────────────

  function focusCell(row, col) {
    el.querySelector('.pg-cell-focused')?.classList.remove('pg-cell-focused');
    focusedCell = { row, col };
    const cell = el.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (cell) { cell.classList.add('pg-cell-focused'); cell.scrollIntoView({ block:'nearest' }); }
  }
  function enterEdit(row, col) {
    const cell = el.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (!cell || cell.getAttribute('contenteditable') !== 'true') return;
    cell.classList.remove('pg-cell-focused'); cell.classList.add('pg-cell-editing');
    editingCell = { row, col }; editOrigVal = cell.textContent; cell.focus();
    const r = document.createRange(); r.selectNodeContents(cell);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function exitEdit(commit) {
    if (!editingCell) return null;
    const cell = el.querySelector(`[data-row="${editingCell.row}"][data-col="${editingCell.col}"]`);
    if (cell) { cell.classList.remove('pg-cell-editing'); if (!commit) cell.textContent = editOrigVal; cell.blur(); }
    const prev = { ...editingCell }; editingCell = null; return prev;
  }
  function nextEditCol(col, dir) {
    const idx = EDIT_COLS.indexOf(col);
    if (dir>0) return idx < EDIT_COLS.length-1 ? EDIT_COLS[idx+1] : null;
    return idx > 0 ? EDIT_COLS[idx-1] : null;
  }
  function handleKey(e) {
    if (editingCell) return;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();
      if (!focusedCell) { focusCell(0, EDIT_COLS[0]); return; }
      let {row,col} = focusedCell;
      if (e.key==='ArrowUp') row--; if (e.key==='ArrowDown') row++;
      if (e.key==='ArrowLeft') { const p=nextEditCol(col,-1); if(p!=null) col=p; }
      if (e.key==='ArrowRight') { const n=nextEditCol(col,1); if(n!=null) col=n; }
      if (el.querySelector(`[data-row="${row}"][data-col="${col}"]`)) focusCell(row,col);
      return;
    }
    if (e.key==='Enter' && focusedCell) { e.preventDefault(); enterEdit(focusedCell.row, focusedCell.col); return; }
    if (e.key==='Tab' && focusedCell) {
      e.preventDefault();
      const {row,col} = focusedCell;
      const nc = nextEditCol(col, e.shiftKey?-1:1);
      if (nc!=null) focusCell(row,nc);
      else { const nr=e.shiftKey?row-1:row+1; const tc=e.shiftKey?EDIT_COLS[EDIT_COLS.length-1]:EDIT_COLS[0]; if(el.querySelector(`[data-row="${nr}"][data-col="${tc}"]`)) focusCell(nr,tc); }
      return;
    }
    if (e.key==='Escape') { el.querySelector('.pg-cell-focused')?.classList.remove('pg-cell-focused'); focusedCell = null; }
  }

  // ── Cell builders ─────────────────────────────────────────────────

  function makeCell(item, field, value, rowIdx, colIdx) {
    const td = document.createElement('td');
    td.className = 'pg-cell-editable';
    td.setAttribute('contenteditable','true');
    td.setAttribute('data-row', rowIdx);
    td.setAttribute('data-col', colIdx);
    td.textContent = value;

    td.addEventListener('mousedown', e => {
      if (editingCell?.row===rowIdx && editingCell?.col===colIdx) return;
      e.preventDefault(); focusCell(rowIdx, colIdx);
    });
    td.addEventListener('dblclick', () => enterEdit(rowIdx, colIdx));
    td.addEventListener('blur', () => {
      td.classList.remove('pg-cell-editing','pg-cell-focused');
      if (editingCell?.row===rowIdx && editingCell?.col===colIdx) {
        commitField(item, field, td.textContent.trim());
        editingCell = null; render();
      }
    });
    td.addEventListener('keydown', e => {
      if (editingCell?.row!==rowIdx || editingCell?.col!==colIdx) return;
      if (e.key==='Enter') { e.preventDefault(); const p=exitEdit(true); if(p) setTimeout(()=>focusCell(p.row+1,p.col),0); }
      if (e.key==='Escape') { e.preventDefault(); td.textContent=editOrigVal; exitEdit(false); focusCell(rowIdx,colIdx); }
      if (e.key==='Tab') {
        e.preventDefault(); exitEdit(true);
        const nc=nextEditCol(colIdx,e.shiftKey?-1:1);
        if(nc!=null) setTimeout(()=>focusCell(rowIdx,nc),0);
        else setTimeout(()=>focusCell(e.shiftKey?rowIdx-1:rowIdx+1,e.shiftKey?EDIT_COLS[EDIT_COLS.length-1]:EDIT_COLS[0]),0);
      }
    });
    return td;
  }

  // ── Row builders ─────────────────────────────────────────────────

  // Hover tooltip helper — shows original value on hover over a changed cell
  function attachChangeTip(td, label, origVal) {
    td.style.borderBottom = '2px solid #f59e0b';
    td.style.cursor = 'help';
    td.addEventListener('mouseenter', e => {
      document.getElementById('ug-tip')?.remove();
      const tip = document.createElement('div');
      tip.id = 'ug-tip';
      tip.style.cssText = [
        'position:fixed;z-index:9999',
        'background:var(--surface);color:var(--text-main)',
        'font-size:0.72rem;padding:5px 10px;border-radius:6px',
        'border:1px solid var(--border)',
        'box-shadow:0 4px 12px rgba(0,0,0,0.12)',
        'pointer-events:none;white-space:nowrap',
      ].join(';') + ';';
      const dot = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#f59e0b;margin-right:5px;vertical-align:middle;"></span>`;
      tip.innerHTML = `${dot}Original <b>${label}</b>: <span style="color:#92400e;font-weight:600;">${origVal}</span>`;
      document.body.appendChild(tip);
      const rect = td.getBoundingClientRect();
      tip.style.top  = (rect.bottom + 4) + 'px';
      tip.style.left = Math.min(rect.left, window.innerWidth - 260) + 'px';
    });
    td.addEventListener('mouseleave', () => document.getElementById('ug-tip')?.remove());
  }

  function openNotesModal(item) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;animation:pe-fadeIn 0.15s ease-out;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:var(--surface);border-radius:12px;padding:24px;width:500px;max-width:90vw;box-shadow:var(--shadow-lg);border:1px solid var(--border);';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;';
    const title = document.createElement('h3');
    title.style.cssText = 'margin:0;font-size:0.95rem;color:var(--text-main);font-weight:600;';
    title.textContent = `Notes — ${dName(item) || 'Row'}`;
    const closeX = document.createElement('button');
    closeX.className = 'btn btn-ghost btn-sm'; closeX.innerHTML = '&times;'; closeX.style.fontSize = '1.2rem';
    closeX.addEventListener('click', () => overlay.remove());
    header.appendChild(title); header.appendChild(closeX); modal.appendChild(header);

    const ta = document.createElement('textarea');
    ta.value = item.note || '';
    ta.placeholder = 'Add internal notes for this item…';
    ta.style.cssText = 'width:100%;height:160px;resize:vertical;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.875rem;background:var(--bg);color:var(--text-main);box-sizing:border-box;outline:none;font-family:inherit;line-height:1.5;';
    ta.addEventListener('focus', () => ta.style.borderColor = 'var(--primary)');
    ta.addEventListener('blur',  () => ta.style.borderColor = 'var(--border)');
    modal.appendChild(ta);

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;';
    const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn btn-secondary btn-sm'; cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());
    const saveBtn = document.createElement('button'); saveBtn.className = 'btn btn-primary btn-sm'; saveBtn.textContent = 'Save Note';
    saveBtn.addEventListener('click', () => { item.note = ta.value.trim(); overlay.remove(); render(); });
    footer.appendChild(cancelBtn); footer.appendChild(saveBtn); modal.appendChild(footer);

    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    setTimeout(() => ta.focus(), 50);
  }

  function buildHeaderRow(item, sectionItems, rowIdx) {
    const isCollapsed = collapsedGroups.has(item.id);
    const subtotal  = sectionItems.reduce((s,i) => s+calcTotal(i), 0);
    const subMonthly = sectionItems.reduce((s,i) => s+calcMonthly(i), 0);

    const tr = document.createElement('tr');
    tr.className = 'header-row';
    tr.dataset.id = item.id;
    tr.draggable = true;
    if (selectedRows.has(item.id)) tr.classList.add('selected-row');

    // Drag
    const tdDrag = document.createElement('td'); tdDrag.className = 'pg-col-drag';
    tdDrag.innerHTML = `<span class="pg-drag-handle">${ICONS.grip}</span>`; tr.appendChild(tdDrag);

    // Checkbox
    const tdCheck = document.createElement('td'); tdCheck.className = 'pg-cell-check';
    const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=selectedRows.has(item.id);
    cb.addEventListener('click', e => { e.stopPropagation(); handleCheck(item.id, cb.checked, e.shiftKey); });
    tdCheck.appendChild(cb); tr.appendChild(tdCheck);

    // Name spans type+sku, name, sla, qty, price, margin = 6 cols
    const tdName = document.createElement('td'); tdName.colSpan = 6; tdName.className = 'pg-cell-header-name';
    const chev = document.createElement('button');
    chev.style.cssText = 'background:none;border:none;cursor:pointer;padding:0;margin-right:8px;display:inline-flex;align-items:center;color:var(--text-secondary);vertical-align:middle;flex-shrink:0;';
    chev.innerHTML = isCollapsed
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';
    chev.addEventListener('click', e => { e.stopPropagation(); isCollapsed ? collapsedGroups.delete(item.id) : collapsedGroups.add(item.id); render(); });
    tdName.appendChild(chev);

    const nameSpan = document.createElement('span');
    nameSpan.setAttribute('contenteditable','true');
    nameSpan.textContent = item.displayName || 'Group';
    nameSpan.addEventListener('blur', () => { item.displayName = nameSpan.textContent.trim() || 'Group'; });
    nameSpan.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();nameSpan.blur();} if(e.key==='Escape'){nameSpan.textContent=item.displayName||'Group';nameSpan.blur();} });
    tdName.appendChild(nameSpan);

    if (isCollapsed && sectionItems.length > 0) {
      const b = document.createElement('span');
      b.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);font-weight:400;margin-left:8px;';
      b.textContent = `(${sectionItems.length} item${sectionItems.length>1?'s':''})`;
      tdName.appendChild(b);
    }
    tr.appendChild(tdName);

    // Subtotal
    const tdT = document.createElement('td'); tdT.className = 'pg-cell-total';
    if (sectionItems.length) { tdT.textContent = currency(subtotal); tdT.style.fontWeight='600'; }
    tr.appendChild(tdT);

    // Monthly
    const tdM = document.createElement('td'); tdM.className = 'pg-cell-monthly';
    if (subMonthly > 0) { tdM.textContent = currency(subMonthly); tdM.style.fontWeight='600'; }
    tr.appendChild(tdM);

    tr.appendChild(document.createElement('td')); // notes

    // Actions
    const tdA = document.createElement('td'); tdA.className = 'pg-cell-actions'; appendActions(tdA, item); tr.appendChild(tdA);

    return tr;
  }

  function buildItemRow(item, isGrouped, rowIdx) {
    const line   = getLine(item);
    const orig   = getOrig(item);
    const lic    = (line && line.itemType !== 'servicepack') ? licenses.find(l => l.id === line.licenseId) : null;
    const slas   = lic?.expand?.possible_SLAs || [];
    const curSla = slas.find(s => s.id === line?.sla);
    const tag    = (line && line.itemType !== 'servicepack') ? getMeasurePointTag(line.sku) : null;
    const tagColor = tag?.color || (line?.itemType==='servicepack' ? '#f59e0b' : 'var(--primary)');
    const tagBg    = tag ? `${tag.color}20` : (line?.itemType==='servicepack' ? '#fef3c7' : 'var(--primary-light)');
    const tagText  = tag?.tag?.toUpperCase() || (line?.itemType==='servicepack' ? 'SVC' : (lic?.type || 'LIC'));
    const isMerged = !!item._mergedIdx?.length && item._mergedIdx.length > 1;
    const changes  = getChanges(item);
    const modified = Object.keys(changes).length > 0;

    const tr = document.createElement('tr');
    tr.className = 'item-row' + (isGrouped ? ' grouped-item' : '') + (modified ? ' changed-row' : '');
    tr.dataset.id = item.id;
    tr.draggable = true;
    if (selectedRows.has(item.id)) tr.classList.add('selected-row');

    // Drag
    const tdDrag = document.createElement('td'); tdDrag.className = 'pg-col-drag';
    tdDrag.innerHTML = `<span class="pg-drag-handle">${ICONS.grip}</span>`; tr.appendChild(tdDrag);

    // Checkbox + modified dot
    const tdCheck = document.createElement('td'); tdCheck.className = 'pg-cell-check';
    tdCheck.style.cssText = 'vertical-align:middle;';
    const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=selectedRows.has(item.id);
    cb.addEventListener('click', e => { e.stopPropagation(); handleCheck(item.id, cb.checked, e.shiftKey); });
    tdCheck.appendChild(cb);
    if (modified) {
      const dot = document.createElement('span'); dot.className = 'changed-indicator';
      dot.title = 'Row has been modified — hover changed cells to see originals';
      dot.style.cssText = 'display:block;margin:2px auto 0;';
      tdCheck.appendChild(dot);
    }
    tr.appendChild(tdCheck);

    // ── Col 2: Type + SKU combined cell ──────────────────────────
    const tdTypeSku = document.createElement('td');
    tdTypeSku.style.cssText = `padding:0 10px;white-space:nowrap;user-select:none;${isGrouped?'padding-left:28px;':''}`;
    if (isMerged) {
      const mb = document.createElement('span'); mb.className='pg-merged-badge'; mb.style.display='block';
      mb.innerHTML=`<span>${item._mergedIdx?.length||2} merged</span>`;
      tdTypeSku.appendChild(mb);
    } else {
      const badge = document.createElement('div');
      badge.style.cssText = `display:inline-block;font-size:0.52rem;font-weight:700;padding:2px 6px;border-radius:3px;background:${tagBg};color:${tagColor};text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;margin-bottom:3px;`;
      badge.textContent = tagText;
      tdTypeSku.appendChild(badge);
      if (dSku(item)) {
        const sku = document.createElement('div');
        sku.style.cssText = 'font-size:0.65rem;color:var(--text-secondary);font-family:ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;max-width:110px;';
        sku.textContent = dSku(item);
        tdTypeSku.appendChild(sku);
      }
    }
    tr.appendChild(tdTypeSku);

    // ── Col 3: Name (editable) ────────────────────────────────────
    const tdName = document.createElement('td');
    tdName.className = 'pg-cell-editable';
    tdName.setAttribute('data-row', rowIdx);
    tdName.setAttribute('data-col', 3);
    if (isGrouped) tdName.style.cssText = 'padding-left:8px;';

    tdName.setAttribute('contenteditable', 'true');
    tdName.textContent = dName(item);
    if (modified && changes.name != null) attachChangeTip(tdName, 'name', changes.name);
    if (isMerged) {
      const mergeBadge = document.createElement('span'); mergeBadge.className='pg-merged-badge';
      mergeBadge.style.marginLeft='6px';
      mergeBadge.innerHTML=(expandedMerges.has(item.id)?ICONS.chevronDown:ICONS.chevronRight)+`<span>${item._mergedIdx.length} merged</span>`;
      mergeBadge.addEventListener('click', e=>{e.stopPropagation();expandedMerges.has(item.id)?expandedMerges.delete(item.id):expandedMerges.add(item.id);render();});
      tdName.appendChild(mergeBadge);
      const unmergeBtn=document.createElement('button');unmergeBtn.className='pg-unmerge-btn';unmergeBtn.textContent='Unmerge';
      unmergeBtn.addEventListener('click',e=>{e.stopPropagation();unmergeItem(item);});
      tdName.appendChild(unmergeBtn);
    }
    tdName.addEventListener('mousedown', e=>{
      if(editingCell?.row===rowIdx&&editingCell?.col===3) return;
      e.preventDefault();focusCell(rowIdx,3);
    });
    tdName.addEventListener('dblclick',()=>enterEdit(rowIdx,3));
    tdName.addEventListener('blur',()=>{
      tdName.classList.remove('pg-cell-editing','pg-cell-focused');
      if(editingCell?.row===rowIdx&&editingCell?.col===3){
        commitField(item,'name',tdName.textContent.trim());editingCell=null;render();
      }
    });
    tdName.addEventListener('keydown',e=>{
      if(editingCell?.row!==rowIdx||editingCell?.col!==3) return;
      if(e.key==='Enter'){e.preventDefault();const p=exitEdit(true);if(p)setTimeout(()=>focusCell(p.row+1,p.col),0);}
      if(e.key==='Escape'){e.preventDefault();tdName.textContent=dName(item);exitEdit(false);focusCell(rowIdx,3);}
      if(e.key==='Tab'){e.preventDefault();exitEdit(true);const nc=nextEditCol(3,e.shiftKey?-1:1);if(nc!=null)setTimeout(()=>focusCell(rowIdx,nc),0);}
    });
    tr.appendChild(tdName);

    // ── Col 4: SLA ────────────────────────────────────────────────
    const tdSla = document.createElement('td');
    tdSla.style.cssText = 'padding-left:14px;'; // gap
    if (line?.itemType === 'servicepack') {
      const wrap=document.createElement('div');wrap.style.cssText='display:flex;align-items:center;gap:4px;';
      const hInp=document.createElement('input');hInp.type='number';hInp.min='0.5';hInp.step='0.5';hInp.value=line.hours||0;
      hInp.style.cssText='width:52px;padding:3px 6px;font-size:0.8rem;background:var(--surface);color:var(--text-main);border:1px solid var(--border);border-radius:4px;';
      hInp.addEventListener('change',e=>{line.hours=parseFloat(e.target.value)||0;line.price=line.hours*hourlyRate;emitSummary();render();});
      wrap.appendChild(hInp);
      const lbl=document.createElement('span');lbl.style.cssText='font-size:0.7rem;color:var(--text-secondary);';lbl.textContent='hrs';
      wrap.appendChild(lbl);tdSla.appendChild(wrap);
    } else if (slas.length) {
      const slaTag=document.createElement('span');slaTag.className='sla-tag';
      slaTag.style.cssText='cursor:pointer;max-width:none;display:inline-block;'; // no max-width truncation
      slaTag.textContent=curSla?.name||'None';
      if(modified&&changes.sla!=null){
        slaTag.style.cssText+='border-color:#f59e0b;background:#fef3c7;color:#92400e;';
        const origSlaName=slas.find(s=>s.id===_originals[item.lineIdx]?.sla)?.name||'None';
        attachChangeTip(slaTag,'SLA',origSlaName);
      }
      slaTag.addEventListener('click',e=>{e.stopPropagation();openSla(item,slaTag);});
      tdSla.appendChild(slaTag);
    } else {
      tdSla.innerHTML='<span style="font-size:0.8rem;color:var(--text-secondary);">—</span>';
    }
    tr.appendChild(tdSla);

    // ── Col 5: Qty ────────────────────────────────────────────────
    const tdQty=makeCell(item,'qty',String(dQty(item)),rowIdx,5);
    if(modified&&changes.qty!=null) attachChangeTip(tdQty,'qty',String(changes.qty));
    tr.appendChild(tdQty);

    // ── Col 6: Unit Price ─────────────────────────────────────────
    // Display as currency but store raw number for editing
    const tdPrice=makeCell(item,'price',dPrice(item).toFixed(2),rowIdx,6);
    tdPrice.style.textAlign='right';
    // Decorate display with € prefix (shown when not editing)
    tdPrice.dataset.display = currency(dPrice(item));
    tdPrice.dataset.raw     = dPrice(item).toFixed(2);
    tdPrice.textContent     = currency(dPrice(item));
    // On focus show raw, on blur show formatted
    tdPrice.addEventListener('focus', () => { tdPrice.textContent = dPrice(item).toFixed(2); });
    if(modified&&changes.price!=null) attachChangeTip(tdPrice,'price',currency(changes.price));
    tr.appendChild(tdPrice);

    // ── Col 7: Margin % ───────────────────────────────────────────
    const tdMargin=makeCell(item,'margin',dMargin(item).toFixed(1),rowIdx,7);
    if(modified&&changes.margin!=null) attachChangeTip(tdMargin,'margin',changes.margin.toFixed(1)+'%');
    tr.appendChild(tdMargin);

    // ── Col 8: Total ──────────────────────────────────────────────
    const tdT=document.createElement('td');tdT.className='pg-cell-total';tdT.textContent=currency(calcTotal(item));tr.appendChild(tdT);

    // ── Col 9: Monthly ────────────────────────────────────────────
    const tdM=document.createElement('td');tdM.className='pg-cell-monthly';
    const mo=calcMonthly(item);if(mo>0)tdM.textContent=currency(mo);tr.appendChild(tdM);

    // ── Col 10: Notes button ──────────────────────────────────────
    const tdNotes=document.createElement('td');tdNotes.style.cssText='text-align:center;padding:0 4px;';
    const hasNote=!!(item.note&&item.note.trim());
    const notesBtn=document.createElement('button');notesBtn.className='pg-menu-btn';
    notesBtn.title=hasNote?item.note:'Add note';
    notesBtn.style.cssText=`color:${hasNote?'var(--primary)':'var(--text-secondary)'};width:28px;height:28px;`;
    notesBtn.innerHTML=`<svg viewBox="0 0 24 24" fill="${hasNote?'none':'none'}" stroke="currentColor" stroke-width="1.5" style="width:15px;height:15px;${hasNote?'color:var(--primary)':''}">
      <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/>
    </svg>${hasNote?'<span style="position:absolute;top:4px;right:4px;width:6px;height:6px;border-radius:50%;background:var(--primary);"></span>':''}`;
    notesBtn.style.position='relative';
    notesBtn.addEventListener('click',e=>{e.stopPropagation();openNotesModal(item);});
    tdNotes.appendChild(notesBtn);tr.appendChild(tdNotes);

    // ── Col 11: Actions ───────────────────────────────────────────
    const tdA=document.createElement('td');tdA.className='pg-cell-actions';
    appendActions(tdA,item);
    if(modified){
      const resetBtn=document.createElement('button');resetBtn.className='pg-move-btn';resetBtn.innerHTML=ICONS.reset;resetBtn.title='Reset to original';
      resetBtn.style.cssText='color:#f59e0b;width:22px;height:22px;';
      resetBtn.addEventListener('click',e=>{e.stopPropagation();resetItem(item);});
      tdA.insertBefore(resetBtn,tdA.firstChild);
    }
    tr.appendChild(tdA);

    return tr;
  }

  function buildDepRow(item, deps) {
    const tr = document.createElement('tr'); tr.style.cssText='background:#fef9e7;';
    const td = document.createElement('td'); td.colSpan = COL_COUNT; td.style.cssText='padding:4px 16px 8px 44px;';
    const box = document.createElement('div');
    box.style.cssText='display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 10px;background:#fef3c7;border-radius:5px;border:1px solid #fcd34d;';
    const lbl = document.createElement('span'); lbl.style.cssText='font-size:0.7rem;color:#92400e;font-weight:600;'; lbl.textContent='⚠ Requires:';
    box.appendChild(lbl);
    deps.forEach(dep => {
      const btn = document.createElement('button');
      btn.style.cssText='padding:3px 8px;font-size:0.72rem;background:white;border:1px solid #fcd34d;border-radius:4px;cursor:pointer;color:#92400e;font-weight:500;transition:all 0.12s;';
      btn.textContent=`+ ${dep.name}`;
      btn.addEventListener('mouseenter', () => { btn.style.background='#f59e0b'; btn.style.color='white'; btn.style.borderColor='#f59e0b'; });
      btn.addEventListener('mouseleave', () => { btn.style.background='white'; btn.style.color='#92400e'; btn.style.borderColor='#fcd34d'; });
      btn.addEventListener('click', () => addItem({ type:'license', item: dep }));
      box.appendChild(btn);
    });
    td.appendChild(box); tr.appendChild(td); return tr;
  }

  function buildGrandTotal(total, monthly) {
    // Light styling — not the black bar
    const tr = document.createElement('tr'); tr.className='subtotal-row'; tr.style.cssText='border-top:2px solid var(--border);';
    tr.appendChild(document.createElement('td')); tr.appendChild(document.createElement('td'));
    const lbl = document.createElement('td'); lbl.colSpan=6; lbl.style.cssText='text-align:right;font-weight:700;font-size:0.875rem;padding:10px 12px;color:var(--text-main);'; lbl.textContent='Total'; tr.appendChild(lbl);
    const tdT = document.createElement('td'); tdT.className='pg-cell-total'; tdT.style.cssText='font-weight:700;font-size:0.875rem;color:var(--text-main);'; tdT.textContent=currency(total); tr.appendChild(tdT);
    const tdM = document.createElement('td'); tdM.className='pg-cell-monthly'; tdM.style.cssText='font-weight:700;color:var(--primary);'; if(monthly>0) tdM.textContent=currency(monthly); tr.appendChild(tdM);
    tr.appendChild(document.createElement('td')); tr.appendChild(document.createElement('td'));
    return tr;
  }

  function appendActions(container, item) {
    const arrows = document.createElement('span'); arrows.className='pg-arrows';
    const up = document.createElement('button'); up.className='pg-move-btn'; up.innerHTML=ICONS.arrowUp; up.title='Move up';
    up.addEventListener('click', e => { e.stopPropagation(); moveItem(item,-1); }); arrows.appendChild(up);
    const dn = document.createElement('button'); dn.className='pg-move-btn'; dn.innerHTML=ICONS.arrowDown; dn.title='Move down';
    dn.addEventListener('click', e => { e.stopPropagation(); moveItem(item,1); }); arrows.appendChild(dn);
    container.appendChild(arrows);
    const menu = document.createElement('button'); menu.className='pg-menu-btn'; menu.innerHTML='&middot;&middot;&middot;'; menu.title='More actions';
    menu.addEventListener('click', e => { e.stopPropagation(); const r=menu.getBoundingClientRect(); showCtx({preventDefault:()=>{},clientX:r.left,clientY:r.bottom+2},item); });
    container.appendChild(menu);
  }

  // ── Section grouping ──────────────────────────────────────────────

  function getSections(visible) {
    const hmap = new Map();
    visible.filter(i=>i.type==='header').forEach(h => hmap.set(h.id, {header:h, items:[]}));
    visible.filter(i=>i.type==='item').forEach(i => {
      if (i.groupId && hmap.has(i.groupId)) hmap.get(i.groupId).items.push(i);
    });
    const sections = []; let ung = [];
    visible.forEach(item => {
      if (item.type==='header') {
        if (ung.length) { sections.push({header:null,items:ung}); ung=[]; }
        sections.push(hmap.get(item.id));
      } else if (!item.groupId || !hmap.has(item.groupId)) ung.push(item);
    });
    if (ung.length) sections.push({header:null,items:ung});
    return sections;
  }

  // ── Main render ───────────────────────────────────────────────────

  function render() {
    el.innerHTML = '';
    destroyFloatingBar();

    const visible = vis();

    if (!visible.length) {
      el.innerHTML = `<div style="text-align:center;padding:3rem 2rem;color:var(--text-secondary);">
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
    table.setAttribute('tabindex','0');

    // Thead
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const cols = [
      {t:'',          w:'28px'},   // drag
      {t:'',          w:'36px'},   // checkbox
      {t:'Type / No.',w:'120px'},  // type badge + sku
      {t:'Name',      w:''},       // name (editable)
      {t:'SLA',       w:'130px',pl:'14px'}, // wider + left gap
      {t:'Qty',       w:'66px'},
      {t:'Unit Price',w:'105px'},
      {t:'Margin %',  w:'78px'},
      {t:'Total',     w:'110px',r:true},
      {t:'Monthly',   w:'100px',r:true},
      {t:'',          w:'36px'},   // notes button
      {t:'',          w:'80px'},   // actions
    ];
    cols.forEach(c => {
      const th = document.createElement('th');
      if(c.w) th.style.width=c.w; if(c.r) th.style.textAlign='right'; if(c.pl) th.style.paddingLeft=c.pl; th.textContent=c.t;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow); table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const sections = getSections(visible);
    let rowIdx = 0, grandTotal = 0, grandMonthly = 0;

    sections.forEach(section => {
      if (section.header) tbody.appendChild(buildHeaderRow(section.header, section.items, rowIdx++));
      const collapsed = section.header && collapsedGroups.has(section.header.id);
      section.items.forEach(item => {
        if (!collapsed) {
          tbody.appendChild(buildItemRow(item, !!section.header, rowIdx));
          if (item._mergedIdx?.length > 1 && expandedMerges.has(item.id)) {
            item._mergedIdx.forEach(li => {
              const sub = document.createElement('tr'); sub.className='pg-merged-subrow';
              sub.innerHTML=`<td></td><td></td><td></td><td colspan="9" style="padding-left:16px;color:var(--text-secondary);font-size:0.78rem;">${_lineItems[li]?.name||''}</td>`;
              tbody.appendChild(sub);
            });
          }
          const deps = getMissingDeps(item);
          if (deps.length) tbody.appendChild(buildDepRow(item, deps));
        }
        rowIdx++; grandTotal += calcTotal(item); grandMonthly += calcMonthly(item);
      });
    });

    // Grand total (light, not black)
    if (visible.filter(i=>i.type==='item').length > 0) tbody.appendChild(buildGrandTotal(grandTotal, grandMonthly));

    table.appendChild(tbody);

    // Delegation
    tbody.addEventListener('click', e => {
      if (e.target.closest('button,input,[contenteditable="true"],.pg-merged-badge,.pg-unmerge-btn,.sla-tag')) return;
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      handleClick(tr.dataset.id, e);
    });
    tbody.addEventListener('contextmenu', e => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const item = _items.find(i => i.id===tr.dataset.id);
      if (item) showCtx(e, item);
    });
    setupDrag(tbody);
    table.addEventListener('keydown', handleKey);
    el.appendChild(table);

    // Restore focus
    if (focusedCell && !editingCell) el.querySelector(`[data-row="${focusedCell.row}"][data-col="${focusedCell.col}"]`)?.classList.add('pg-cell-focused');

    // Floating pill bar
    renderFloatingBar();
  }

  render();

  return {
    element: el,
    addItem,
    loadItems,
    getLineItems,
    getGroups,
    getSummary,
    setOnSelectionChange(fn) { onSelChange = fn; },
    update(props) {
      if (props.licenses      !== undefined) licenses      = props.licenses;
      if (props.servicePacks  !== undefined) servicePacks  = props.servicePacks;
      if (props.isTemplateMode !== undefined) isTemplateMode = props.isTemplateMode;
      if (props.hourlyRate    !== undefined) hourlyRate    = props.hourlyRate;
      render();
    },
    destroy() { destroyFloatingBar(); closeCtx(); document.querySelectorAll('.ug-sla-dd').forEach(d=>d.remove()); },
  };
}
