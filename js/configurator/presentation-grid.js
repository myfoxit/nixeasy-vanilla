// Presentation Grid - Premium Excel-like spreadsheet component
// Context menu, drag reorder, arrow key navigation, section headers, merge, multi-select.
// Pure DOM manipulation for performance.

import { currency } from '../utils/format.js';
import { showToast } from '../components/toast.js';

// --- SVG Icons (inline Heroicons) ---

const ICONS = {
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>',
  headerInsert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>',
  duplicate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>',
  merge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>',
  moveTop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h18m-9 3.75V21m0-12.75l-3 3m3-3l3 3"/></svg>',
  moveBottom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 19.5h18m-9-3.75V3m0 12.75l-3-3m3 3l3-3"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>',
  empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>',
};

/**
 * Create the Presentation Grid.
 */
export function createPresentationGrid({ items, lineItems, licenses, onChange }) {
  const el = document.createElement('div');
  el.className = 'presentation-grid-wrapper';

  let state = {
    items: items || [],
    lineItems: lineItems || [],
    licenses: licenses || [],
    onChange
  };

  let selectedRows = new Set();
  let focusedCell = null;   // { row, col }
  let editingCell = null;   // { row, col }
  let editOriginalValue = '';
  let expandedMerges = new Set(); // track expanded merge badges
  let collapsedGroups = new Set(); // track collapsed group headers
  let lastClickedRow = null; // for shift+click range select
  let contextMenu = null;    // current context menu element
  let contextMenuDismissHandler = null; // stored so we can remove it

  // Editable column indices: displayName=0, qty=2, unitPrice=3, margin=4, notes=7
  const EDITABLE_COLS = [0, 2, 3, 4, 7];
  const COL_COUNT = 8;

  // Callbacks for the editor to hook into
  let onSelectionChange = null;

  // --- Helpers ---

  function generateId() {
    return 'p-' + crypto.randomUUID().slice(0, 8);
  }

  function getSourceItem(pItem) {
    if (!pItem.sourceIndices || pItem.sourceIndices.length === 0) return null;
    return state.lineItems[pItem.sourceIndices[0]] || null;
  }

  function getSourceItems(pItem) {
    if (!pItem.sourceIndices || pItem.sourceIndices.length === 0) return [];
    return pItem.sourceIndices.map(i => state.lineItems[i]).filter(Boolean);
  }

  function calcTotal(pItem) {
    const sources = getSourceItems(pItem);
    if (sources.length === 0) return 0;
    const qty = pItem.displayQty != null ? pItem.displayQty : sources.reduce((s, i) => s + i.amount, 0);
    const price = pItem.displayPrice != null ? pItem.displayPrice : sources.reduce((s, i) => s + i.price, 0) / (sources.length || 1);
    const margin = pItem.displayMargin != null ? pItem.displayMargin : sources[0].margin;
    return price * qty * (1 + margin / 100);
  }

  function calcMonthly(pItem) {
    const sources = getSourceItems(pItem);
    if (sources.length === 0) return 0;
    const total = calcTotal(pItem);
    let maxSlaPct = 0;
    sources.forEach(src => {
      if (src.itemType === 'servicepack') return;
      const lic = state.licenses.find(l => l.id === src.licenseId);
      const sla = lic?.expand?.possible_SLAs?.find(s => s.id === src.sla);
      if (sla?.monthly_percentage > maxSlaPct) maxSlaPct = sla.monthly_percentage;
    });
    return maxSlaPct > 0 ? total * (maxSlaPct / 100) : 0;
  }

  function getDisplayName(pItem) {
    if (pItem.displayName != null) return pItem.displayName;
    const src = getSourceItem(pItem);
    return src ? src.name : '';
  }

  function getDisplaySku(pItem) {
    const sources = getSourceItems(pItem);
    if (sources.length === 0) return '';
    if (sources.length === 1) return sources[0].sku || '';
    return sources.map(s => s.sku).filter(Boolean).join(', ');
  }

  function getDisplayQty(pItem) {
    if (pItem.displayQty != null) return pItem.displayQty;
    const sources = getSourceItems(pItem);
    return sources.reduce((s, i) => s + i.amount, 0);
  }

  function getDisplayPrice(pItem) {
    if (pItem.displayPrice != null) return pItem.displayPrice;
    const sources = getSourceItems(pItem);
    if (sources.length === 0) return 0;
    return sources.reduce((s, i) => s + i.price, 0) / sources.length;
  }

  function getDisplayMargin(pItem) {
    if (pItem.displayMargin != null) return pItem.displayMargin;
    const src = getSourceItem(pItem);
    return src ? src.margin : 0;
  }

  function hasSourceChanged(pItem) {
    if (pItem.type !== 'item' || !pItem.sourceIndices || pItem.sourceIndices.length === 0) return false;
    if (!pItem._sourceSnapshot) return false;
    const currentSources = getSourceItems(pItem);
    const snap = pItem._sourceSnapshot;
    if (currentSources.length !== snap.length) return true;
    return currentSources.some((src, i) => {
      const s = snap[i];
      return src.name !== s.name || src.price !== s.price || src.amount !== s.amount || src.margin !== s.margin || src.sla !== s.sla;
    });
  }

  function getVisibleItems() {
    return state.items.filter(i => !i.hidden).sort((a, b) => a.order - b.order);
  }

  function emitChange() {
    if (state.onChange) state.onChange([...state.items]);
  }

  function emitSelectionChange() {
    if (onSelectionChange) onSelectionChange(selectedRows.size);
  }

  // --- Section subtotals ---

  function getSections(visibleItems) {
    // Build sections using explicit groupId on each item.
    // Items with groupId belong to that header; items without are ungrouped.
    const headerMap = new Map(); // headerId → { header, items[] }
    const headers = visibleItems.filter(i => i.type === 'header');
    headers.forEach(h => headerMap.set(h.id, { header: h, items: [] }));

    const ungroupedBefore = []; // items before any header or without groupId
    const sections = [];

    // Assign items to their groups
    visibleItems.forEach(item => {
      if (item.type === 'header') return;
      if (item.groupId && headerMap.has(item.groupId)) {
        headerMap.get(item.groupId).items.push(item);
      } else {
        ungroupedBefore.push(item);
      }
    });

    // Build sections in display order: walk visible items, emit ungrouped runs
    // and group sections at the header's position
    let ungroupedRun = [];
    visibleItems.forEach(item => {
      if (item.type === 'header') {
        // flush any ungrouped run before this header
        if (ungroupedRun.length > 0) {
          sections.push({ header: null, items: ungroupedRun });
          ungroupedRun = [];
        }
        sections.push(headerMap.get(item.id));
      } else if (!item.groupId || !headerMap.has(item.groupId)) {
        ungroupedRun.push(item);
      }
      // grouped items are already in their header's section
    });
    if (ungroupedRun.length > 0) {
      sections.push({ header: null, items: ungroupedRun });
    }

    return sections;
  }

  // --- Navigation ---

  function isEditableCol(col) {
    return EDITABLE_COLS.includes(col);
  }

  function nextEditableCol(col, direction) {
    const idx = EDITABLE_COLS.indexOf(col);
    if (direction > 0) {
      return idx < EDITABLE_COLS.length - 1 ? EDITABLE_COLS[idx + 1] : null;
    } else {
      return idx > 0 ? EDITABLE_COLS[idx - 1] : null;
    }
  }

  function focusCell(row, col) {
    // Remove previous focus
    const prev = el.querySelector('.pg-cell-focused');
    if (prev) prev.classList.remove('pg-cell-focused');

    focusedCell = { row, col };
    editingCell = null;

    const cell = el.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (cell) {
      cell.classList.add('pg-cell-focused');
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function enterEditMode(row, col) {
    const cell = el.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (!cell || cell.getAttribute('contenteditable') !== 'true') return;

    cell.classList.remove('pg-cell-focused');
    cell.classList.add('pg-cell-editing');
    editingCell = { row, col };
    editOriginalValue = cell.textContent;
    cell.focus();

    // Select all text
    const range = document.createRange();
    range.selectNodeContents(cell);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function exitEditMode(confirm) {
    if (!editingCell) return;
    const cell = el.querySelector(`[data-row="${editingCell.row}"][data-col="${editingCell.col}"]`);
    if (cell) {
      cell.classList.remove('pg-cell-editing');
      if (!confirm) {
        cell.textContent = editOriginalValue;
      }
      cell.blur();
    }
    const prevEdit = { ...editingCell };
    editingCell = null;
    return prevEdit;
  }

  // --- Context Menu ---

  function showContextMenu(e, pItem) {
    e.preventDefault();
    closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'pe-context-menu';

    const visible = getVisibleItems();
    const idx = visible.findIndex(i => i.id === pItem.id);

    const menuItems = [];

    if (pItem.type === 'item') {
      menuItems.push({ icon: ICONS.headerInsert, label: 'Insert Header Above', action: () => addHeaderAt(pItem, 'above') });
      menuItems.push({ icon: ICONS.headerInsert, label: 'Insert Header Below', action: () => addHeaderAt(pItem, 'below') });
      menuItems.push({ icon: ICONS.headerInsert, label: 'Insert Empty Row Above', action: () => addEmptyRowAt(pItem, 'above') });
      menuItems.push({ icon: ICONS.headerInsert, label: 'Insert Empty Row Below', action: () => addEmptyRowAt(pItem, 'below') });
      menuItems.push({ icon: ICONS.duplicate, label: 'Duplicate Row', action: () => duplicateItem(pItem) });
      menuItems.push({ icon: ICONS.trash, label: 'Delete Row', action: () => deleteItemWithUndo(pItem), danger: true });

      // Merge with above/below
      if (idx > 0 && visible[idx - 1].type === 'item') {
        menuItems.push({ icon: ICONS.merge, label: 'Merge with Above', action: () => mergeWith(pItem, visible[idx - 1]) });
      }
      if (idx < visible.length - 1 && visible[idx + 1].type === 'item') {
        menuItems.push({ icon: ICONS.merge, label: 'Merge with Below', action: () => mergeWith(pItem, visible[idx + 1]) });
      }

      menuItems.push('sep');
      menuItems.push({ icon: ICONS.moveTop, label: 'Move to Top', action: () => moveToEdge(pItem, 'top') });
      menuItems.push({ icon: ICONS.moveBottom, label: 'Move to Bottom', action: () => moveToEdge(pItem, 'bottom') });
    } else if (pItem.type === 'header') {
      menuItems.push({ icon: ICONS.headerInsert, label: 'Insert Empty Row Above', action: () => addEmptyRowAt(pItem, 'above') });
      menuItems.push({ icon: ICONS.headerInsert, label: 'Insert Empty Row Below', action: () => addEmptyRowAt(pItem, 'below') });
      menuItems.push({ icon: ICONS.duplicate, label: 'Duplicate Header', action: () => duplicateItem(pItem) });
      menuItems.push({ icon: ICONS.trash, label: 'Delete Header', action: () => deleteItemWithUndo(pItem), danger: true });
      menuItems.push('sep');
      menuItems.push({ icon: ICONS.moveTop, label: 'Move to Top', action: () => moveToEdge(pItem, 'top') });
      menuItems.push({ icon: ICONS.moveBottom, label: 'Move to Bottom', action: () => moveToEdge(pItem, 'bottom') });
    }

    menuItems.forEach(item => {
      if (item === 'sep') {
        const sep = document.createElement('div');
        sep.className = 'pe-context-menu-sep';
        menu.appendChild(sep);
        return;
      }
      const btn = document.createElement('button');
      btn.className = 'pe-context-menu-item' + (item.danger ? ' pe-ctx-danger' : '');
      btn.innerHTML = item.icon + '<span>' + item.label + '</span>';
      btn.addEventListener('click', () => {
        closeContextMenu();
        item.action();
      });
      menu.appendChild(btn);
    });

    // Position
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    let x = e.clientX;
    let y = e.clientY;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    contextMenu = menu;

    // Close on outside click — use a stored handler we can explicitly remove
    contextMenuDismissHandler = (evt) => {
      if (contextMenu && !contextMenu.contains(evt.target)) {
        closeContextMenu();
      }
    };
    setTimeout(() => {
      document.addEventListener('click', contextMenuDismissHandler, true);
      document.addEventListener('contextmenu', contextMenuDismissHandler, true);
    }, 0);
  }

  function closeContextMenu() {
    if (contextMenuDismissHandler) {
      document.removeEventListener('click', contextMenuDismissHandler, true);
      document.removeEventListener('contextmenu', contextMenuDismissHandler, true);
      contextMenuDismissHandler = null;
    }
    if (contextMenu) {
      contextMenu.remove();
      contextMenu = null;
    }
  }

  // --- Context Menu Actions ---

  function addHeaderAt(pItem, position) {
    const visible = getVisibleItems();
    const idx = visible.findIndex(i => i.id === pItem.id);
    let order;
    if (position === 'above') {
      order = idx > 0 ? (visible[idx - 1].order + pItem.order) / 2 : pItem.order - 0.5;
    } else {
      order = idx < visible.length - 1 ? (pItem.order + visible[idx + 1].order) / 2 : pItem.order + 0.5;
    }

    const header = {
      id: generateId(),
      sourceIndices: [],
      type: 'header',
      displayName: 'New Section',
      displayPrice: null,
      displayQty: null,
      displayMargin: null,
      note: '',
      hidden: false,
      order
    };
    state.items.push(header);
    reindex();
    emitChange();
    render();
  }

  function addEmptyRowAt(pItem, position) {
    const visible = getVisibleItems();
    const idx = visible.findIndex(i => i.id === pItem.id);
    let order;
    if (position === 'above') {
      order = idx > 0 ? (visible[idx - 1].order + pItem.order) / 2 : pItem.order - 0.5;
    } else {
      order = idx < visible.length - 1 ? (pItem.order + visible[idx + 1].order) / 2 : pItem.order + 0.5;
    }

    const emptyRow = {
      id: generateId(),
      sourceIndices: [],
      type: 'item',
      displayName: '',
      displayPrice: null,
      displayQty: null,
      displayMargin: null,
      note: '',
      hidden: false,
      order,
      groupId: pItem.groupId || null, // inherit group if inside one
    };
    // If inserting below a header, assign to that group
    if (position === 'below' && pItem.type === 'header') {
      emptyRow.groupId = pItem.id;
    }
    state.items.push(emptyRow);
    reindex();
    emitChange();
    render();
  }

  function duplicateItem(pItem) {
    const dup = {
      ...pItem,
      id: generateId(),
      order: pItem.order + 0.5,
      sourceIndices: pItem.sourceIndices ? [...pItem.sourceIndices] : [],
      _sourceSnapshot: pItem._sourceSnapshot ? pItem._sourceSnapshot.map(s => ({ ...s })) : undefined,
      _mergedNames: pItem._mergedNames ? [...pItem._mergedNames] : undefined,
    };
    state.items.push(dup);
    reindex();
    emitChange();
    render();
    showToast('Row duplicated', 'success');
  }

  function deleteItemWithUndo(pItem) {
    pItem.hidden = true;
    // If deleting a header, ungroup its children (save refs for undo)
    let ungroupedIds = [];
    if (pItem.type === 'header') {
      state.items.forEach(i => {
        if (i.groupId === pItem.id) { ungroupedIds.push(i.id); delete i.groupId; }
      });
    }
    emitChange();
    render();
    showToast('Row deleted. <button onclick="this.closest(\'.toast\')?.dispatchEvent(new CustomEvent(\'undo\'))" style="background:none;border:none;color:var(--primary);text-decoration:underline;cursor:pointer;font-size:inherit;">Undo</button>', 'info');

    // Listen for undo on the latest toast
    const toasts = document.querySelectorAll('.toast');
    const latestToast = toasts[toasts.length - 1];
    if (latestToast) {
      latestToast.addEventListener('undo', () => {
        pItem.hidden = false;
        // Re-group children if header was restored
        if (pItem.type === 'header' && ungroupedIds.length) {
          state.items.forEach(i => { if (ungroupedIds.includes(i.id)) i.groupId = pItem.id; });
        }
        emitChange();
        render();
      }, { once: true });
    }
  }

  function mergeWith(pItem, otherItem) {
    const items = [otherItem, pItem].sort((a, b) => a.order - b.order);
    mergeTwoItems(items[0], items[1]);
  }

  function mergeTwoItems(itemA, itemB) {
    const combinedSourceIndices = [...new Set([...(itemA.sourceIndices || []), ...(itemB.sourceIndices || [])])];
    const nameA = getDisplayName(itemA);
    const nameB = getDisplayName(itemB);

    const merged = {
      id: generateId(),
      sourceIndices: combinedSourceIndices,
      type: 'item',
      displayName: nameA + ' + ' + nameB,
      displayQty: getDisplayQty(itemA) + getDisplayQty(itemB),
      displayPrice: null,
      displayMargin: null,
      note: [itemA.note, itemB.note].filter(Boolean).join('; '),
      hidden: false,
      order: Math.min(itemA.order, itemB.order),
      _mergedNames: [nameA, nameB],
    };

    // Weighted average price
    const totalValue = getDisplayPrice(itemA) * getDisplayQty(itemA) + getDisplayPrice(itemB) * getDisplayQty(itemB);
    merged.displayPrice = totalValue / (merged.displayQty || 1);
    merged.displayMargin = (getDisplayMargin(itemA) + getDisplayMargin(itemB)) / 2;

    state.items = state.items.filter(i => i.id !== itemA.id && i.id !== itemB.id);
    state.items.push(merged);
    reindex();
    emitChange();
    render();
    showToast('Items merged', 'success');
  }

  function moveToEdge(pItem, edge) {
    const visible = getVisibleItems();
    if (edge === 'top') {
      pItem.order = visible[0].order - 1;
    } else {
      pItem.order = visible[visible.length - 1].order + 1;
    }
    reindex();
    emitChange();
    render();
  }

  // --- Drag & Drop ---

  let dragItem = null;
  let dropGapIndex = null; // gap index: 0=before first, n=after last visible item
  let dragIndicator = null;

  function handleDragStart(e, pItem) {
    dragItem = pItem;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', pItem.id);
    const row = e.target.closest('tr');
    if (row) {
      requestAnimationFrame(() => row.classList.add('pg-dragging'));
    }
  }

  function getDraggableRows() {
    return Array.from(el.querySelectorAll('tr.item-row[data-item-id], tr.header-row[data-item-id]'));
  }

  function handleTableDragOver(e) {
    if (!dragItem) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rows = getDraggableRows();
    if (rows.length === 0) return;
    const mouseY = e.clientY;

    // Find the closest gap between rows
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i <= rows.length; i++) {
      let gapY;
      if (i === 0) {
        gapY = rows[0].getBoundingClientRect().top;
      } else if (i === rows.length) {
        gapY = rows[rows.length - 1].getBoundingClientRect().bottom;
      } else {
        gapY = (rows[i - 1].getBoundingClientRect().bottom + rows[i].getBoundingClientRect().top) / 2;
      }
      const dist = Math.abs(mouseY - gapY);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    dropGapIndex = bestIdx;
    showDropIndicator(rows, bestIdx);
  }

  function showDropIndicator(rows, gapIndex) {
    if (!dragIndicator) {
      dragIndicator = document.createElement('div');
      dragIndicator.className = 'pg-drop-indicator';
      el.style.position = 'relative';
      el.appendChild(dragIndicator);
    }
    const wrapperRect = el.getBoundingClientRect();
    let y;
    if (gapIndex === 0) {
      y = rows[0].getBoundingClientRect().top - wrapperRect.top;
    } else if (gapIndex >= rows.length) {
      y = rows[rows.length - 1].getBoundingClientRect().bottom - wrapperRect.top;
    } else {
      y = (rows[gapIndex - 1].getBoundingClientRect().bottom + rows[gapIndex].getBoundingClientRect().top) / 2 - wrapperRect.top;
    }
    dragIndicator.style.top = y + 'px';
    dragIndicator.style.display = 'block';
  }

  function hideDropIndicator() {
    if (dragIndicator) {
      dragIndicator.style.display = 'none';
    }
  }

  function handleTableDrop(e) {
    e.preventDefault();
    hideDropIndicator();
    el.querySelectorAll('.pg-dragging').forEach(r => r.classList.remove('pg-dragging'));

    if (!dragItem || dropGapIndex == null) { dragItem = null; return; }

    const visible = getVisibleItems();
    const dragIdx = visible.findIndex(i => i.id === dragItem.id);
    if (dragIdx < 0) { dragItem = null; return; }

    // No-op if dropping in same position
    if (dropGapIndex === dragIdx || dropGapIndex === dragIdx + 1) {
      dragItem = null;
      return;
    }

    // Remove dragged item and reinsert at the gap position
    const reordered = visible.filter(i => i.id !== dragItem.id);
    const insertIdx = dropGapIndex > dragIdx ? dropGapIndex - 1 : dropGapIndex;
    reordered.splice(insertIdx, 0, dragItem);
    reordered.forEach((item, i) => { item.order = i; });

    // Update groupId based on new position: find the nearest header above
    if (dragItem.type !== 'header') {
      let newGroupId = null;
      for (let i = insertIdx - 1; i >= 0; i--) {
        if (reordered[i].type === 'header') {
          // Only assign if the item right before us belongs to this group (or IS the header)
          // Check: is there an unbroken chain of grouped items from the header to here?
          let allGrouped = true;
          for (let j = i + 1; j < insertIdx; j++) {
            if (reordered[j].type !== 'header' && reordered[j].groupId !== reordered[i].id) {
              allGrouped = false;
              break;
            }
          }
          if (allGrouped) newGroupId = reordered[i].id;
          break;
        }
      }
      dragItem.groupId = newGroupId;
    }

    dragItem = null;
    dropGapIndex = null;
    emitChange();
    render();
  }

  function handleDragEnd() {
    hideDropIndicator();
    el.querySelectorAll('.pg-dragging').forEach(r => r.classList.remove('pg-dragging'));
    dragItem = null;
    dropGapIndex = null;
  }

  // --- Selection ---

  function handleRowCheckbox(pItemId, checked, shiftKey) {
    if (shiftKey && lastClickedRow != null) {
      const visible = getVisibleItems();
      const lastIdx = visible.findIndex(i => i.id === lastClickedRow);
      const curIdx = visible.findIndex(i => i.id === pItemId);
      if (lastIdx >= 0 && curIdx >= 0) {
        const [start, end] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
        for (let i = start; i <= end; i++) {
          selectedRows.add(visible[i].id);
        }
      }
    } else {
      if (checked) selectedRows.add(pItemId);
      else selectedRows.delete(pItemId);
    }
    lastClickedRow = pItemId;
    emitSelectionChange();
    render();
  }

  function handleRowClick(pItemId, e) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    if (e.shiftKey && lastClickedRow != null) {
      // Range select
      const visible = getVisibleItems();
      const lastIdx = visible.findIndex(i => i.id === lastClickedRow);
      const curIdx = visible.findIndex(i => i.id === pItemId);
      if (lastIdx >= 0 && curIdx >= 0) {
        const [start, end] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
        for (let i = start; i <= end; i++) {
          selectedRows.add(visible[i].id);
        }
      }
    } else if (modKey) {
      // Toggle single row
      if (selectedRows.has(pItemId)) selectedRows.delete(pItemId);
      else selectedRows.add(pItemId);
    } else {
      // Single select — deselect all others
      selectedRows.clear();
      selectedRows.add(pItemId);
    }
    lastClickedRow = pItemId;
    emitSelectionChange();
    render();
  }

  // --- Render ---

  function render() {
    el.innerHTML = '';
    dragIndicator = null; // cleared by innerHTML = ''

    const visibleItems = getVisibleItems();

    // Empty state
    if (visibleItems.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'pe-empty-state';
      emptyDiv.innerHTML = ICONS.empty + '<h3>No items in your quote yet</h3><p>Go back to the configurator to add items, then return here to customize your export.</p>';
      el.appendChild(emptyDiv);
      return;
    }

    const table = document.createElement('table');
    table.className = 'presentation-grid';
    table.setAttribute('tabindex', '0');

    // Header
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const headers = [
      { text: '', cls: 'pg-col-drag', style: 'width:28px;' },
      { text: '', cls: 'pg-col-check', style: 'width:36px;' },
      { text: 'Display Name', cls: 'pg-col-name', style: '' },
      { text: 'SKU', cls: 'pg-col-sku', style: 'width:130px;' },
      { text: 'Qty', cls: 'pg-col-qty', style: 'width:60px;' },
      { text: 'Unit Price', cls: 'pg-col-price', style: 'width:100px;' },
      { text: 'Margin %', cls: 'pg-col-margin', style: 'width:80px;' },
      { text: 'Total', cls: 'pg-col-total', style: 'width:110px;' },
      { text: 'Monthly', cls: 'pg-col-monthly', style: 'width:95px;' },
      { text: 'Notes', cls: 'pg-col-notes', style: 'width:140px;' },
      { text: '', cls: 'pg-col-actions', style: 'width:88px;' }
    ];
    headers.forEach(h => {
      const th = document.createElement('th');
      th.className = h.cls;
      if (h.style) th.style.cssText = h.style;
      th.textContent = h.text;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    const sections = getSections(visibleItems);
    let rowIndex = 0;
    const hiddenItems = state.items.filter(i => i.hidden).sort((a, b) => a.order - b.order);

    sections.forEach((section) => {
      if (section.header) {
        const tr = createHeaderRow(section.header, section.items, rowIndex);
        tbody.appendChild(tr);
        rowIndex++;
      }

      const isCollapsed = section.header && collapsedGroups.has(section.header.id);

      section.items.forEach(pItem => {
        const tr = createItemRow(pItem, rowIndex);
        if (section.header) {
          tr.classList.add('grouped-item');
          if (isCollapsed) tr.style.display = 'none';
        }
        tbody.appendChild(tr);
        rowIndex++;

        // Expanded merge sub-rows
        if (pItem._mergedNames && pItem._mergedNames.length > 1 && expandedMerges.has(pItem.id)) {
          pItem._mergedNames.forEach(name => {
            const subTr = document.createElement('tr');
            subTr.className = 'pg-merged-subrow';
            subTr.innerHTML = '<td></td><td></td><td colspan="8" style="padding-left:48px;font-size:0.75rem;color:var(--text-secondary);">' +
              escapeHtml(name) + '</td><td></td>';
            tbody.appendChild(subTr);
          });
        }
      });
    });

    // Hidden (soft-deleted) items
    hiddenItems.forEach(pItem => {
      const tr = createHiddenRow(pItem);
      tbody.appendChild(tr);
    });

    // Grand total row
    const allVisibleItems = visibleItems.filter(i => i.type === 'item');
    const grandTr = createGrandTotalRow(allVisibleItems);
    tbody.appendChild(grandTr);

    table.appendChild(tbody);

    el.appendChild(table);

    // --- Event delegation on tbody ---

    // Click: row selection (ignore clicks on buttons, checkboxes, editable cells)
    tbody.addEventListener('click', (e) => {
      // Ignore clicks on interactive elements
      if (e.target.closest('button, input, [contenteditable="true"], .pg-merged-badge, .pg-unmerge-btn')) return;
      const tr = e.target.closest('tr[data-item-id]');
      if (!tr || tr.classList.contains('hidden-row')) return;
      handleRowClick(tr.dataset.itemId, e);
    });

    // Context menu delegation
    tbody.addEventListener('contextmenu', (e) => {
      const tr = e.target.closest('tr[data-item-id]');
      if (!tr || tr.classList.contains('hidden-row')) return;
      const pItem = state.items.find(i => i.id === tr.dataset.itemId);
      if (pItem) showContextMenu(e, pItem);
    });

    // Drag delegation
    tbody.addEventListener('dragstart', (e) => {
      const tr = e.target.closest('tr[data-item-id]');
      if (!tr || tr.classList.contains('hidden-row')) return;
      const pItem = state.items.find(i => i.id === tr.dataset.itemId);
      if (pItem) handleDragStart(e, pItem);
    });
    tbody.addEventListener('dragover', handleTableDragOver);
    tbody.addEventListener('drop', handleTableDrop);
    tbody.addEventListener('dragend', handleDragEnd);

    // Keyboard navigation
    table.addEventListener('keydown', handleTableKeydown);

    // Restore focus if we had one
    if (focusedCell && !editingCell) {
      const cell = el.querySelector(`[data-row="${focusedCell.row}"][data-col="${focusedCell.col}"]`);
      if (cell) cell.classList.add('pg-cell-focused');
    }
  }

  function createHeaderRow(hItem, sectionItems, rowIndex) {
    const tr = document.createElement('tr');
    tr.className = 'header-row';
    tr.dataset.itemId = hItem.id;
    tr.draggable = true;

    // Drag handle
    const tdDrag = document.createElement('td');
    tdDrag.className = 'pg-col-drag';
    const grip = document.createElement('span');
    grip.className = 'pg-drag-handle';
    grip.innerHTML = ICONS.grip;
    tdDrag.appendChild(grip);
    tr.appendChild(tdDrag);

    // Checkbox
    const tdCheck = document.createElement('td');
    tdCheck.className = 'pg-cell-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedRows.has(hItem.id);
    cb.addEventListener('click', (e) => {
      e.stopPropagation();
      handleRowCheckbox(hItem.id, cb.checked, e.shiftKey);
    });
    tdCheck.appendChild(cb);
    tr.appendChild(tdCheck);

    // Name cell — spans name + sku + qty + price + margin (5 cols)
    const tdName = document.createElement('td');
    tdName.colSpan = 5;
    tdName.className = 'pg-cell-header-name';

    // Collapse/expand chevron
    const chevron = document.createElement('span');
    chevron.className = 'pg-group-chevron';
    const isCollapsed = collapsedGroups.has(hItem.id);
    chevron.innerHTML = isCollapsed
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';
    chevron.title = isCollapsed ? 'Expand group' : 'Collapse group';
    chevron.style.cssText = 'cursor:pointer; display:inline-flex; align-items:center; margin-right:8px; color:var(--text-secondary); vertical-align:middle;';
    chevron.addEventListener('click', (e) => {
      e.stopPropagation();
      if (collapsedGroups.has(hItem.id)) {
        collapsedGroups.delete(hItem.id);
      } else {
        collapsedGroups.add(hItem.id);
      }
      render();
    });
    tdName.appendChild(chevron);

    // Editable name span
    const nameSpan = document.createElement('span');
    nameSpan.setAttribute('contenteditable', 'true');
    nameSpan.textContent = getDisplayName(hItem);

    // Item count badge when collapsed
    if (isCollapsed && sectionItems.length > 0) {
      const countBadge = document.createElement('span');
      countBadge.style.cssText = 'font-size:0.7rem; color:var(--text-secondary); font-weight:400; margin-left:8px;';
      countBadge.textContent = `(${sectionItems.length} items)`;
      tdName.appendChild(countBadge);
    }

    nameSpan.addEventListener('blur', () => {
      const newVal = nameSpan.textContent.trim();
      if (newVal !== getDisplayName(hItem)) {
        hItem.displayName = newVal || 'Section';
        emitChange();
      }
    });
    nameSpan.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); }
      if (e.key === 'Escape') { nameSpan.textContent = getDisplayName(hItem); nameSpan.blur(); }
    });
    tdName.appendChild(nameSpan);
    tr.appendChild(tdName);

    // Subtotal in Total column
    const tdTotal = document.createElement('td');
    tdTotal.className = 'pg-cell-total';
    if (sectionItems.length > 0) {
      tdTotal.textContent = currency(sectionItems.reduce((s, i) => s + calcTotal(i), 0));
      tdTotal.style.fontWeight = '600';
    }
    tr.appendChild(tdTotal);

    // Subtotal in Monthly column
    const tdMonthly = document.createElement('td');
    tdMonthly.className = 'pg-cell-monthly';
    if (sectionItems.length > 0) {
      const monthly = sectionItems.reduce((s, i) => s + calcMonthly(i), 0);
      if (monthly > 0) tdMonthly.textContent = currency(monthly);
      tdMonthly.style.fontWeight = '600';
    }
    tr.appendChild(tdMonthly);

    // Notes (empty)
    tr.appendChild(document.createElement('td'));

    // Actions
    const tdAct = document.createElement('td');
    tdAct.className = 'pg-cell-actions';
    appendMoveButtons(tdAct, hItem);
    tr.appendChild(tdAct);

    if (selectedRows.has(hItem.id)) tr.classList.add('selected-row');
    return tr;
  }

  function createItemRow(pItem, rowIndex) {
    const tr = document.createElement('tr');
    tr.className = 'item-row';
    tr.dataset.itemId = pItem.id;
    tr.dataset.rowIndex = rowIndex;
    tr.draggable = true;

    const changed = hasSourceChanged(pItem);
    if (changed) tr.classList.add('changed-row');
    if (selectedRows.has(pItem.id)) tr.classList.add('selected-row');

    // Drag handle
    const tdDrag = document.createElement('td');
    tdDrag.className = 'pg-col-drag';
    const grip = document.createElement('span');
    grip.className = 'pg-drag-handle';
    grip.innerHTML = ICONS.grip;
    tdDrag.appendChild(grip);
    tr.appendChild(tdDrag);

    // Checkbox
    const tdCheck = document.createElement('td');
    tdCheck.className = 'pg-cell-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedRows.has(pItem.id);
    cb.addEventListener('click', (e) => {
      e.stopPropagation();
      handleRowCheckbox(pItem.id, cb.checked, e.shiftKey);
    });
    tdCheck.appendChild(cb);
    if (changed) {
      const dot = document.createElement('span');
      dot.className = 'changed-indicator';
      dot.title = 'Source data changed';
      tdCheck.appendChild(dot);
    }
    tr.appendChild(tdCheck);

    // Display Name (editable) + merge badge
    const isMerged = pItem._mergedNames && pItem._mergedNames.length > 1;

    if (isMerged) {
      // For merged items: don't use contenteditable on the whole cell
      // Instead, use a wrapper with a name span + badge
      const tdName = document.createElement('td');
      tdName.className = 'pg-cell-editable pg-col-0';
      tdName.setAttribute('data-row', rowIndex);
      tdName.setAttribute('data-col', 0);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'pg-merged-name';
      nameSpan.setAttribute('contenteditable', 'true');
      nameSpan.textContent = getDisplayName(pItem);
      nameSpan.addEventListener('blur', () => {
        const newVal = nameSpan.textContent.trim();
        if (newVal !== getDisplayName(pItem)) {
          pItem.displayName = newVal || pItem._mergedNames.join(' + ');
          emitChange();
        }
      });
      nameSpan.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); }
        if (e.key === 'Escape') { nameSpan.textContent = getDisplayName(pItem); nameSpan.blur(); }
      });
      tdName.appendChild(nameSpan);

      // Merge badge
      const badge = document.createElement('span');
      badge.className = 'pg-merged-badge';
      const expanded = expandedMerges.has(pItem.id);
      badge.innerHTML = (expanded ? ICONS.chevronDown : ICONS.chevronRight) +
        '<span>' + pItem._mergedNames.length + ' items merged</span>';
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        if (expandedMerges.has(pItem.id)) expandedMerges.delete(pItem.id);
        else expandedMerges.add(pItem.id);
        render();
      });
      tdName.appendChild(badge);

      // Unmerge button
      const unmerge = document.createElement('button');
      unmerge.className = 'pg-unmerge-btn';
      unmerge.textContent = 'Unmerge';
      unmerge.addEventListener('click', (e) => {
        e.stopPropagation();
        unmergeItem(pItem);
      });
      tdName.appendChild(unmerge);

      tr.appendChild(tdName);
    } else {
      const tdName = createEditableCell(pItem, 'displayName', getDisplayName(pItem), rowIndex, 0);
      tr.appendChild(tdName);
    }

    // SKU
    const tdSku = document.createElement('td');
    tdSku.className = 'pg-cell-sku';
    tdSku.textContent = getDisplaySku(pItem);
    tr.appendChild(tdSku);

    // Qty
    tr.appendChild(createEditableCell(pItem, 'displayQty', String(getDisplayQty(pItem)), rowIndex, 2, 'number'));

    // Unit Price
    tr.appendChild(createEditableCell(pItem, 'displayPrice', getDisplayPrice(pItem).toFixed(2), rowIndex, 3, 'number'));

    // Margin %
    tr.appendChild(createEditableCell(pItem, 'displayMargin', getDisplayMargin(pItem).toFixed(1), rowIndex, 4, 'number'));

    // Total
    const tdTotal = document.createElement('td');
    tdTotal.className = 'pg-cell-total';
    tdTotal.textContent = currency(calcTotal(pItem));
    tr.appendChild(tdTotal);

    // Monthly
    const tdMonthly = document.createElement('td');
    tdMonthly.className = 'pg-cell-monthly';
    const monthly = calcMonthly(pItem);
    tdMonthly.textContent = monthly > 0 ? currency(monthly) : '';
    tr.appendChild(tdMonthly);

    // Notes
    tr.appendChild(createEditableCell(pItem, 'note', pItem.note || '', rowIndex, 7));

    // Actions
    const tdAct = document.createElement('td');
    tdAct.className = 'pg-cell-actions';
    appendMoveButtons(tdAct, pItem);
    tr.appendChild(tdAct);

    return tr;
  }

  function createGrandTotalRow(allVisibleItems) {
    const grandTr = document.createElement('tr');
    grandTr.className = 'grand-total-row';

    grandTr.appendChild(document.createElement('td')); // drag
    grandTr.appendChild(document.createElement('td')); // check
    const gtLabel = document.createElement('td');
    gtLabel.textContent = 'Grand Total';
    gtLabel.style.cssText = 'text-align:right;font-weight:700;font-size:0.9rem;';
    grandTr.appendChild(gtLabel);
    // sku, qty, price, margin
    for (let i = 0; i < 4; i++) grandTr.appendChild(document.createElement('td'));

    const gtTotal = document.createElement('td');
    gtTotal.className = 'pg-cell-total';
    gtTotal.style.fontWeight = '700';
    gtTotal.textContent = currency(allVisibleItems.reduce((s, i) => s + calcTotal(i), 0));
    grandTr.appendChild(gtTotal);

    const gtMonthly = document.createElement('td');
    gtMonthly.className = 'pg-cell-monthly';
    gtMonthly.style.fontWeight = '700';
    const totalMonthly = allVisibleItems.reduce((s, i) => s + calcMonthly(i), 0);
    gtMonthly.textContent = totalMonthly > 0 ? currency(totalMonthly) : '';
    grandTr.appendChild(gtMonthly);

    // notes + actions
    grandTr.appendChild(document.createElement('td'));
    grandTr.appendChild(document.createElement('td'));

    return grandTr;
  }

  function createHiddenRow(pItem) {
    const tr = document.createElement('tr');
    tr.className = 'hidden-row';
    tr.dataset.itemId = pItem.id;

    tr.appendChild(document.createElement('td')); // drag
    tr.appendChild(document.createElement('td')); // check

    const tdName = document.createElement('td');
    tdName.textContent = getDisplayName(pItem);
    tr.appendChild(tdName);

    const tdSku = document.createElement('td');
    tdSku.textContent = getDisplaySku(pItem);
    tr.appendChild(tdSku);

    const tdQty = document.createElement('td');
    tdQty.textContent = getDisplayQty(pItem);
    tr.appendChild(tdQty);

    const tdPrice = document.createElement('td');
    tdPrice.textContent = currency(getDisplayPrice(pItem));
    tr.appendChild(tdPrice);

    const tdMargin = document.createElement('td');
    tdMargin.textContent = getDisplayMargin(pItem).toFixed(1) + '%';
    tr.appendChild(tdMargin);

    const tdTotal = document.createElement('td');
    tdTotal.textContent = currency(calcTotal(pItem));
    tr.appendChild(tdTotal);

    const tdMonthly = document.createElement('td');
    tr.appendChild(tdMonthly);

    tr.appendChild(document.createElement('td')); // notes

    const tdAct = document.createElement('td');
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn btn-ghost btn-sm';
    restoreBtn.title = 'Restore';
    restoreBtn.textContent = 'Undo';
    restoreBtn.style.cssText = 'font-size:0.7rem;color:var(--primary);';
    restoreBtn.addEventListener('click', () => {
      pItem.hidden = false;
      emitChange();
      render();
    });
    tdAct.appendChild(restoreBtn);
    tr.appendChild(tdAct);

    return tr;
  }

  function createEditableCell(pItem, field, displayValue, rowIndex, colIndex, type) {
    const td = document.createElement('td');
    td.className = `pg-cell-editable pg-col-${colIndex}`;
    td.setAttribute('contenteditable', 'true');
    td.setAttribute('data-row', rowIndex);
    td.setAttribute('data-col', colIndex);
    td.textContent = displayValue;

    if (pItem.type === 'header' && field !== 'displayName') {
      td.removeAttribute('contenteditable');
      td.classList.remove('pg-cell-editable');
      return td;
    }

    // Click to focus (enter navigation mode on cell)
    td.addEventListener('mousedown', (e) => {
      if (editingCell && editingCell.row === rowIndex && editingCell.col === colIndex) return;
      // If not already editing this cell, just focus it
      if (!editingCell || editingCell.row !== rowIndex || editingCell.col !== colIndex) {
        e.preventDefault();
        focusCell(rowIndex, colIndex);
      }
    });

    // Double-click to enter edit mode
    td.addEventListener('dblclick', () => {
      enterEditMode(rowIndex, colIndex);
    });

    td.addEventListener('blur', () => {
      td.classList.remove('pg-cell-editing', 'pg-cell-focused');
      if (editingCell && editingCell.row === rowIndex && editingCell.col === colIndex) {
        const newVal = td.textContent.trim();
        commitEdit(pItem, field, newVal, type);
        editingCell = null;
      }
    });

    td.addEventListener('keydown', (e) => {
      if (editingCell && editingCell.row === rowIndex && editingCell.col === colIndex) {
        // In edit mode
        if (e.key === 'Enter') {
          e.preventDefault();
          const prev = exitEditMode(true);
          // Commit happens in blur
          // Move down
          if (prev) {
            setTimeout(() => focusCell(prev.row + 1, prev.col), 0);
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          td.textContent = editOriginalValue;
          exitEditMode(false);
          focusCell(rowIndex, colIndex);
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          exitEditMode(true);
          const nextCol = nextEditableCol(colIndex, e.shiftKey ? -1 : 1);
          if (nextCol != null) {
            setTimeout(() => focusCell(rowIndex, nextCol), 0);
          } else {
            const targetRow = e.shiftKey ? rowIndex - 1 : rowIndex + 1;
            const targetCol = e.shiftKey ? EDITABLE_COLS[EDITABLE_COLS.length - 1] : EDITABLE_COLS[0];
            setTimeout(() => focusCell(targetRow, targetCol), 0);
          }
        }
        return; // Don't process arrow keys in edit mode
      }
    });

    return td;
  }

  function commitEdit(pItem, field, newVal, type) {
    if (field === 'displayName') {
      const src = getSourceItem(pItem);
      if (newVal === '' || (src && newVal === src.name)) {
        pItem.displayName = null;
      } else {
        pItem.displayName = newVal;
      }
    } else if (field === 'note') {
      pItem.note = newVal;
    } else if (type === 'number') {
      const num = parseFloat(newVal);
      if (isNaN(num)) {
        pItem[field] = null;
      } else {
        const src = getSourceItem(pItem);
        if (field === 'displayQty') {
          const srcVal = src ? src.amount : 0;
          pItem.displayQty = num === srcVal ? null : num;
        } else if (field === 'displayPrice') {
          const srcVal = src ? src.price : 0;
          pItem.displayPrice = Math.abs(num - srcVal) < 0.001 ? null : num;
        } else if (field === 'displayMargin') {
          const srcVal = src ? src.margin : 0;
          pItem.displayMargin = Math.abs(num - srcVal) < 0.001 ? null : num;
        }
      }
    }
    emitChange();
    render();
  }

  function handleTableKeydown(e) {
    // If in edit mode, the cell's own keydown handler deals with it
    if (editingCell) return;

    // Arrow keys: navigate
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      if (!focusedCell) {
        focusCell(0, EDITABLE_COLS[0]);
        return;
      }

      let { row, col } = focusedCell;
      if (e.key === 'ArrowUp') row--;
      if (e.key === 'ArrowDown') row++;
      if (e.key === 'ArrowLeft') {
        const prev = nextEditableCol(col, -1);
        if (prev != null) col = prev;
      }
      if (e.key === 'ArrowRight') {
        const next = nextEditableCol(col, 1);
        if (next != null) col = next;
      }

      // Check cell exists
      const nextCell = el.querySelector(`[data-row="${row}"][data-col="${col}"]`);
      if (nextCell) focusCell(row, col);
      return;
    }

    // Enter: start editing focused cell
    if (e.key === 'Enter' && focusedCell) {
      e.preventDefault();
      enterEditMode(focusedCell.row, focusedCell.col);
      return;
    }

    // Tab navigation
    if (e.key === 'Tab' && focusedCell) {
      e.preventDefault();
      const { row, col } = focusedCell;
      const nextCol = nextEditableCol(col, e.shiftKey ? -1 : 1);
      if (nextCol != null) {
        focusCell(row, nextCol);
      } else {
        const targetRow = e.shiftKey ? row - 1 : row + 1;
        const targetCol = e.shiftKey ? EDITABLE_COLS[EDITABLE_COLS.length - 1] : EDITABLE_COLS[0];
        const nextCell = el.querySelector(`[data-row="${targetRow}"][data-col="${targetCol}"]`);
        if (nextCell) focusCell(targetRow, targetCol);
      }
      return;
    }

    // Escape: clear focus
    if (e.key === 'Escape') {
      const prev = el.querySelector('.pg-cell-focused');
      if (prev) prev.classList.remove('pg-cell-focused');
      focusedCell = null;
    }
  }

  function appendMoveButtons(container, pItem) {
    // Arrows wrapper (vertically stacked)
    const arrows = document.createElement('span');
    arrows.className = 'pg-arrows';

    const upBtn = document.createElement('button');
    upBtn.className = 'pg-move-btn';
    upBtn.innerHTML = ICONS.arrowUp;
    upBtn.title = 'Move up';
    upBtn.addEventListener('click', (e) => { e.stopPropagation(); moveItem(pItem, -1); });
    arrows.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.className = 'pg-move-btn';
    downBtn.innerHTML = ICONS.arrowDown;
    downBtn.title = 'Move down';
    downBtn.addEventListener('click', (e) => { e.stopPropagation(); moveItem(pItem, 1); });
    arrows.appendChild(downBtn);
    container.appendChild(arrows);

    // ... menu trigger
    const menuBtn = document.createElement('button');
    menuBtn.className = 'pg-menu-btn';
    menuBtn.innerHTML = '&middot;&middot;&middot;';
    menuBtn.title = 'More actions';
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Simulate right-click at button position
      const rect = menuBtn.getBoundingClientRect();
      const fakeEvent = { preventDefault: () => {}, clientX: rect.left, clientY: rect.bottom + 2 };
      showContextMenu(fakeEvent, pItem);
    });
    container.appendChild(menuBtn);
  }

  function moveItem(pItem, direction) {
    const visible = getVisibleItems();
    const idx = visible.findIndex(i => i.id === pItem.id);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= visible.length) return;
    const tmpOrder = visible[idx].order;
    visible[idx].order = visible[swapIdx].order;
    visible[swapIdx].order = tmpOrder;
    emitChange();
    render();
  }

  // --- Unmerge ---

  function unmergeItem(pItem) {
    if (!pItem._mergedNames || !pItem.sourceIndices || pItem.sourceIndices.length < 2) return;

    // Recreate individual items from source indices
    const baseOrder = pItem.order;
    const newItems = pItem.sourceIndices.map((srcIdx, i) => {
      const src = state.lineItems[srcIdx];
      return {
        id: generateId(),
        sourceIndices: [srcIdx],
        type: 'item',
        displayName: null,
        displayPrice: null,
        displayQty: null,
        displayMargin: null,
        note: '',
        hidden: false,
        order: baseOrder + i * 0.1,
        _sourceSnapshot: src ? [{ name: src.name, price: src.price, amount: src.amount, margin: src.margin, sla: src.sla }] : undefined,
      };
    });

    state.items = state.items.filter(i => i.id !== pItem.id);
    state.items.push(...newItems);
    expandedMerges.delete(pItem.id);
    reindex();
    emitChange();
    render();
    showToast('Items unmerged', 'success');
  }

  // --- Public methods ---

  function addHeader(insertBeforeId) {
    const visible = getVisibleItems();
    let order;
    if (insertBeforeId) {
      const target = visible.find(i => i.id === insertBeforeId);
      order = target ? target.order - 0.5 : state.items.length;
    } else {
      order = state.items.length;
    }

    const header = {
      id: generateId(),
      sourceIndices: [],
      type: 'header',
      displayName: 'New Section',
      displayPrice: null,
      displayQty: null,
      displayMargin: null,
      note: '',
      hidden: false,
      order
    };
    state.items.push(header);
    reindex();
    emitChange();
    render();
  }

  function mergeSelected() {
    const selIds = [...selectedRows];
    const selItems = state.items.filter(i => selIds.includes(i.id) && i.type === 'item' && !i.hidden);
    if (selItems.length < 2) {
      showToast('Select at least 2 items to merge', 'warning');
      return;
    }

    const combinedSourceIndices = [];
    selItems.forEach(i => combinedSourceIndices.push(...(i.sourceIndices || [])));

    const merged = {
      id: generateId(),
      sourceIndices: [...new Set(combinedSourceIndices)],
      type: 'item',
      displayName: selItems.map(i => getDisplayName(i)).join(' + '),
      displayPrice: null,
      displayQty: selItems.reduce((s, i) => s + getDisplayQty(i), 0),
      displayMargin: null,
      note: selItems.map(i => i.note).filter(Boolean).join('; '),
      hidden: false,
      order: Math.min(...selItems.map(i => i.order)),
      _mergedNames: selItems.map(i => getDisplayName(i)),
    };

    const totalValue = selItems.reduce((s, i) => s + getDisplayPrice(i) * getDisplayQty(i), 0);
    const totalQty = merged.displayQty || 1;
    merged.displayPrice = totalValue / totalQty;
    merged.displayMargin = selItems.reduce((s, i) => s + getDisplayMargin(i), 0) / selItems.length;

    state.items = state.items.filter(i => !selIds.includes(i.id));
    state.items.push(merged);
    selectedRows.clear();
    reindex();
    emitChange();
    emitSelectionChange();
    render();
    showToast(selItems.length + ' items merged', 'success');
  }

  function groupSelected() {
    const selIds = [...selectedRows];
    const selItems = state.items
      .filter(i => selIds.includes(i.id) && !i.hidden)
      .sort((a, b) => a.order - b.order);
    if (selItems.length < 2) {
      showToast('Select at least 2 items to group', 'warning');
      return;
    }

    // Inline rename: create header with default name, user can click to rename
    const groupName = 'New Group';

    // Determine the range occupied by selected items
    const firstOrder = selItems[0].order;
    const lastOrder = selItems[selItems.length - 1].order;

    // Find non-selected, non-header items sitting between first and last selected
    const selIdSet = new Set(selIds);
    const trapped = state.items.filter(
      i => !selIdSet.has(i.id) && i.type !== 'header' && !i.hidden &&
           i.order > firstOrder && i.order < lastOrder
    );

    // Insert header above the first selected item
    const header = {
      id: generateId(),
      sourceIndices: [],
      type: 'header',
      displayName: groupName,
      displayPrice: null,
      displayQty: null,
      displayMargin: null,
      note: '',
      hidden: false,
      order: firstOrder - 0.5
    };
    state.items.push(header);

    // Assign selected items to this group and place contiguously after the header
    selItems.forEach((item, idx) => {
      item.groupId = header.id;
      item.order = firstOrder + idx * 0.1;
    });

    // Push trapped non-selected items after the last selected item (they stay ungrouped)
    trapped.forEach((item, idx) => {
      item.order = lastOrder + 1 + idx * 0.1;
    });

    selectedRows.clear();
    reindex();
    emitChange();
    emitSelectionChange();
    render();
    showToast('Items grouped under "' + groupName + '"', 'success');
  }

  function deleteSelected() {
    const count = selectedRows.size;
    if (count === 0) return;

    const deletedIds = [...selectedRows];
    deletedIds.forEach(id => {
      const item = state.items.find(i => i.id === id);
      if (item) item.hidden = true;
    });
    selectedRows.clear();
    emitChange();
    emitSelectionChange();
    render();
    showToast(count + ' row(s) deleted', 'info');
  }

  function duplicateSelected() {
    if (selectedRows.size === 0) return;
    const selId = [...selectedRows][0]; // duplicate first selected
    const pItem = state.items.find(i => i.id === selId);
    if (pItem) duplicateItem(pItem);
  }

  function resetToSource() {
    state.items = buildItemsFromSource(state.lineItems);
    selectedRows.clear();
    expandedMerges.clear();
    emitChange();
    emitSelectionChange();
    render();
  }

  function reindex() {
    const sorted = [...state.items].sort((a, b) => a.order - b.order);
    sorted.forEach((item, i) => { item.order = i; });
  }

  function getItems() {
    return state.items;
  }

  function getSelectedIds() {
    return [...selectedRows];
  }

  function clearSelection() {
    selectedRows.clear();
    lastClickedRow = null;
    emitSelectionChange();
    render();
  }

  function update(props) {
    if (props.items !== undefined) state.items = props.items;
    if (props.lineItems !== undefined) state.lineItems = props.lineItems;
    if (props.licenses !== undefined) state.licenses = props.licenses;
    if (props.onChange !== undefined) state.onChange = props.onChange;
    render();
  }

  function setOnSelectionChange(fn) {
    onSelectionChange = fn;
  }

  // --- Utility ---

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  render();

  return {
    element: el,
    update,
    getItems,
    getSelectedIds,
    addHeader,
    mergeSelected,
    groupSelected,
    deleteSelected,
    duplicateSelected,
    clearSelection,
    resetToSource,
    render,
    setOnSelectionChange,
  };
}

/**
 * Build presentationItems from lineItems (initial creation).
 */
export function buildItemsFromSource(lineItems) {
  return (lineItems || []).map((item, idx) => ({
    id: 'p-' + crypto.randomUUID().slice(0, 8),
    sourceIndices: [idx],
    type: 'item',
    displayName: null,
    displayPrice: null,
    displayQty: null,
    displayMargin: null,
    note: '',
    hidden: false,
    order: idx,
    _sourceSnapshot: [{
      name: item.name,
      price: item.price,
      amount: item.amount,
      margin: item.margin,
      sla: item.sla
    }]
  }));
}

/**
 * Detect changes between current lineItems and saved presentation snapshots.
 * Also adds any lineItems that are not represented in the presentation.
 */
export function detectSourceChanges(presentationItems, lineItems) {
  let hasChanges = false;

  // Check existing items for source changes
  presentationItems.forEach(pItem => {
    if (pItem.type !== 'item' || !pItem.sourceIndices || !pItem._sourceSnapshot) return;
    pItem.sourceIndices.forEach((srcIdx, i) => {
      const src = lineItems[srcIdx];
      const snap = pItem._sourceSnapshot[i];
      if (!src || !snap) { hasChanges = true; return; }
      if (src.name !== snap.name || src.price !== snap.price ||
          src.amount !== snap.amount || src.margin !== snap.margin || src.sla !== snap.sla) {
        hasChanges = true;
      }
    });
  });

  // Find lineItem indices that are not covered by any presentation item
  const coveredIndices = new Set();
  presentationItems.forEach(pItem => {
    if (pItem.sourceIndices) pItem.sourceIndices.forEach(idx => coveredIndices.add(idx));
  });

  const maxOrder = presentationItems.length > 0
    ? Math.max(...presentationItems.map(i => i.order ?? 0))
    : -1;

  (lineItems || []).forEach((li, idx) => {
    if (!coveredIndices.has(idx)) {
      hasChanges = true;
      presentationItems.push({
        id: 'p-' + crypto.randomUUID().slice(0, 8),
        sourceIndices: [idx],
        type: 'item',
        displayName: null,
        displayPrice: null,
        displayQty: null,
        displayMargin: null,
        note: '',
        hidden: false,
        order: maxOrder + 1 + idx,
        _sourceSnapshot: [{
          name: li.name,
          price: li.price,
          amount: li.amount,
          margin: li.margin,
          sla: li.sla
        }]
      });
    }
  });

  return hasChanges;
}
