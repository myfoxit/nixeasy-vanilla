// Presentation Grid - Excel-like spreadsheet component
// Contenteditable cells, arrow key navigation, section headers, merge, reorder.
// Pure DOM manipulation for performance.

import { currency } from '../utils/format.js';

/**
 * Create the Presentation Grid.
 *
 * @param {Object} props
 * @param {Array}   props.items              - Array of presentationItem objects
 * @param {Array}   props.lineItems          - Source lineItems for diff detection
 * @param {Array}   props.licenses           - License objects for SLA lookups
 * @param {Function} props.onChange           - (items) => void, called on any edit
 * @returns {{ element: HTMLElement, update: Function, getItems: Function }}
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
  let focusedCell = null; // { row, col }
  let editingCell = null; // { row, col }
  let editOriginalValue = '';

  // Editable column indices (0-based within data cols): displayName=0, qty=2, unitPrice=3, margin=4, notes=7
  const EDITABLE_COLS = [0, 2, 3, 4, 7];
  const COL_COUNT = 8; // displayName, sku, qty, unitPrice, margin, total, monthly, notes

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
    // Find max SLA percentage from source items
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
    // average unit price for merged items
    return sources.reduce((s, i) => s + i.price, 0) / sources.length;
  }

  function getDisplayMargin(pItem) {
    if (pItem.displayMargin != null) return pItem.displayMargin;
    const src = getSourceItem(pItem);
    return src ? src.margin : 0;
  }

  function hasSourceChanged(pItem) {
    if (pItem.type !== 'item' || !pItem.sourceIndices || pItem.sourceIndices.length === 0) return false;
    // Compare with snapshot stored in pItem._sourceSnapshot
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

  // --- Section subtotals ---

  function getSections(visibleItems) {
    const sections = [];
    let currentSection = { header: null, items: [] };

    visibleItems.forEach(item => {
      if (item.type === 'header') {
        if (currentSection.items.length > 0 || currentSection.header) {
          sections.push(currentSection);
        }
        currentSection = { header: item, items: [] };
      } else {
        currentSection.items.push(item);
      }
    });
    if (currentSection.items.length > 0 || currentSection.header) {
      sections.push(currentSection);
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

  // --- Render ---

  function render() {
    el.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'presentation-grid';
    table.setAttribute('tabindex', '0');

    // Header
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const headers = [
      { text: '', cls: 'pg-col-check', style: 'width:40px;' },
      { text: 'Display Name', cls: 'pg-col-name', style: '' },
      { text: 'SKU', cls: 'pg-col-sku', style: 'width:150px;' },
      { text: 'Qty', cls: 'pg-col-qty', style: 'width:70px;' },
      { text: 'Unit Price', cls: 'pg-col-price', style: 'width:100px;' },
      { text: 'Margin %', cls: 'pg-col-margin', style: 'width:85px;' },
      { text: 'Total', cls: 'pg-col-total', style: 'width:110px;' },
      { text: 'Monthly', cls: 'pg-col-monthly', style: 'width:100px;' },
      { text: 'Notes', cls: 'pg-col-notes', style: 'width:150px;' },
      { text: '', cls: 'pg-col-actions', style: 'width:70px;' }
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
    const visibleItems = getVisibleItems();
    const sections = getSections(visibleItems);
    let rowIndex = 0;

    // Also render hidden items at end (for un-delete)
    const hiddenItems = state.items.filter(i => i.hidden).sort((a, b) => a.order - b.order);

    sections.forEach((section) => {
      // Header row
      if (section.header) {
        const hItem = section.header;
        const tr = document.createElement('tr');
        tr.className = 'header-row';
        tr.dataset.itemId = hItem.id;

        // Checkbox cell
        const tdCheck = document.createElement('td');
        tdCheck.className = 'pg-cell-check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selectedRows.has(hItem.id);
        cb.addEventListener('change', () => {
          if (cb.checked) selectedRows.add(hItem.id);
          else selectedRows.delete(hItem.id);
          render();
        });
        tdCheck.appendChild(cb);
        tr.appendChild(tdCheck);

        // Name cell (spans remaining cols)
        const tdName = document.createElement('td');
        tdName.colSpan = 8;
        tdName.className = 'pg-cell-header-name';
        tdName.setAttribute('contenteditable', 'true');
        tdName.textContent = getDisplayName(hItem);
        tdName.addEventListener('blur', () => {
          const newVal = tdName.textContent.trim();
          if (newVal !== getDisplayName(hItem)) {
            hItem.displayName = newVal || 'Section';
            emitChange();
          }
        });
        tdName.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); tdName.blur(); }
          if (e.key === 'Escape') { tdName.textContent = getDisplayName(hItem); tdName.blur(); }
        });
        tr.appendChild(tdName);

        // Actions cell
        const tdAct = document.createElement('td');
        tdAct.className = 'pg-cell-actions';
        appendMoveButtons(tdAct, hItem);
        tr.appendChild(tdAct);

        if (selectedRows.has(hItem.id)) tr.classList.add('selected-row');
        tbody.appendChild(tr);
        rowIndex++;
      }

      // Item rows
      section.items.forEach(pItem => {
        const tr = createItemRow(pItem, rowIndex);
        tbody.appendChild(tr);
        rowIndex++;
      });

      // Subtotal row if section has header and items
      if (section.header && section.items.length > 0) {
        const subTr = document.createElement('tr');
        subTr.className = 'subtotal-row';

        const subEmpty1 = document.createElement('td');
        subTr.appendChild(subEmpty1);
        const subLabel = document.createElement('td');
        subLabel.textContent = 'Subtotal';
        subLabel.style.cssText = 'text-align:right;font-weight:600;font-size:0.8rem;color:var(--text-secondary);';
        subTr.appendChild(subLabel);
        // empty sku
        subTr.appendChild(document.createElement('td'));
        // empty qty
        subTr.appendChild(document.createElement('td'));
        // empty price
        subTr.appendChild(document.createElement('td'));
        // empty margin
        subTr.appendChild(document.createElement('td'));

        const subTotal = document.createElement('td');
        subTotal.className = 'pg-cell-total';
        const sectionTotal = section.items.reduce((s, i) => s + calcTotal(i), 0);
        subTotal.textContent = currency(sectionTotal);
        subTotal.style.fontWeight = '600';
        subTr.appendChild(subTotal);

        const subMonthly = document.createElement('td');
        subMonthly.className = 'pg-cell-monthly';
        const sectionMonthly = section.items.reduce((s, i) => s + calcMonthly(i), 0);
        subMonthly.textContent = sectionMonthly > 0 ? currency(sectionMonthly) : '';
        subTr.appendChild(subMonthly);

        // empty notes + actions
        subTr.appendChild(document.createElement('td'));
        subTr.appendChild(document.createElement('td'));

        tbody.appendChild(subTr);
      }
    });

    // Hidden (soft-deleted) items
    hiddenItems.forEach(pItem => {
      const tr = createHiddenRow(pItem);
      tbody.appendChild(tr);
    });

    // Grand total row
    const allVisible = visibleItems.filter(i => i.type === 'item');
    const grandTr = document.createElement('tr');
    grandTr.className = 'grand-total-row';

    const gtEmpty1 = document.createElement('td');
    grandTr.appendChild(gtEmpty1);
    const gtLabel = document.createElement('td');
    gtLabel.textContent = 'Grand Total';
    gtLabel.style.cssText = 'text-align:right;font-weight:700;font-size:0.9rem;';
    grandTr.appendChild(gtLabel);
    // empty sku, qty, price, margin
    for (let i = 0; i < 4; i++) grandTr.appendChild(document.createElement('td'));

    const gtTotal = document.createElement('td');
    gtTotal.className = 'pg-cell-total';
    gtTotal.style.fontWeight = '700';
    gtTotal.textContent = currency(allVisible.reduce((s, i) => s + calcTotal(i), 0));
    grandTr.appendChild(gtTotal);

    const gtMonthly = document.createElement('td');
    gtMonthly.className = 'pg-cell-monthly';
    gtMonthly.style.fontWeight = '700';
    const totalMonthly = allVisible.reduce((s, i) => s + calcMonthly(i), 0);
    gtMonthly.textContent = totalMonthly > 0 ? currency(totalMonthly) : '';
    grandTr.appendChild(gtMonthly);

    // empty notes + actions
    grandTr.appendChild(document.createElement('td'));
    grandTr.appendChild(document.createElement('td'));
    tbody.appendChild(grandTr);

    table.appendChild(tbody);
    el.appendChild(table);

    // Keyboard navigation on the table
    table.addEventListener('keydown', handleTableKeydown);
  }

  function createItemRow(pItem, rowIndex) {
    const tr = document.createElement('tr');
    tr.className = 'item-row';
    tr.dataset.itemId = pItem.id;
    tr.dataset.rowIndex = rowIndex;

    const changed = hasSourceChanged(pItem);
    if (changed) tr.classList.add('changed-row');
    if (selectedRows.has(pItem.id)) tr.classList.add('selected-row');

    // Checkbox
    const tdCheck = document.createElement('td');
    tdCheck.className = 'pg-cell-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedRows.has(pItem.id);
    cb.addEventListener('change', () => {
      if (cb.checked) selectedRows.add(pItem.id);
      else selectedRows.delete(pItem.id);
      render();
    });
    tdCheck.appendChild(cb);
    if (changed) {
      const dot = document.createElement('span');
      dot.className = 'changed-indicator';
      dot.title = 'Source data changed';
      tdCheck.appendChild(dot);
    }
    tr.appendChild(tdCheck);

    // Display Name (editable)
    const tdName = createEditableCell(pItem, 'displayName', getDisplayName(pItem), rowIndex, 0);
    tr.appendChild(tdName);

    // SKU (read-only)
    const tdSku = document.createElement('td');
    tdSku.className = 'pg-cell-sku';
    tdSku.textContent = getDisplaySku(pItem);
    tr.appendChild(tdSku);

    // Qty (editable number)
    const tdQty = createEditableCell(pItem, 'displayQty', String(getDisplayQty(pItem)), rowIndex, 2, 'number');
    tr.appendChild(tdQty);

    // Unit Price (editable number)
    const tdPrice = createEditableCell(pItem, 'displayPrice', getDisplayPrice(pItem).toFixed(2), rowIndex, 3, 'number');
    tr.appendChild(tdPrice);

    // Margin % (editable number)
    const tdMargin = createEditableCell(pItem, 'displayMargin', getDisplayMargin(pItem).toFixed(1), rowIndex, 4, 'number');
    tr.appendChild(tdMargin);

    // Total (calculated, read-only)
    const tdTotal = document.createElement('td');
    tdTotal.className = 'pg-cell-total';
    tdTotal.textContent = currency(calcTotal(pItem));
    tr.appendChild(tdTotal);

    // Monthly (calculated, read-only)
    const tdMonthly = document.createElement('td');
    tdMonthly.className = 'pg-cell-monthly';
    const monthly = calcMonthly(pItem);
    tdMonthly.textContent = monthly > 0 ? currency(monthly) : '';
    tr.appendChild(tdMonthly);

    // Notes (editable)
    const tdNotes = createEditableCell(pItem, 'note', pItem.note || '', rowIndex, 7);
    tr.appendChild(tdNotes);

    // Actions
    const tdAct = document.createElement('td');
    tdAct.className = 'pg-cell-actions';
    appendMoveButtons(tdAct, pItem);
    tr.appendChild(tdAct);

    return tr;
  }

  function createHiddenRow(pItem) {
    const tr = document.createElement('tr');
    tr.className = 'hidden-row';
    tr.dataset.itemId = pItem.id;

    // Checkbox
    const tdCheck = document.createElement('td');
    tr.appendChild(tdCheck);

    // Name
    const tdName = document.createElement('td');
    tdName.textContent = getDisplayName(pItem);
    tr.appendChild(tdName);

    // SKU
    const tdSku = document.createElement('td');
    tdSku.textContent = getDisplaySku(pItem);
    tr.appendChild(tdSku);

    // Qty
    const tdQty = document.createElement('td');
    tdQty.textContent = getDisplayQty(pItem);
    tr.appendChild(tdQty);

    // Price
    const tdPrice = document.createElement('td');
    tdPrice.textContent = currency(getDisplayPrice(pItem));
    tr.appendChild(tdPrice);

    // Margin
    const tdMargin = document.createElement('td');
    tdMargin.textContent = getDisplayMargin(pItem).toFixed(1) + '%';
    tr.appendChild(tdMargin);

    // Total
    const tdTotal = document.createElement('td');
    tdTotal.textContent = currency(calcTotal(pItem));
    tr.appendChild(tdTotal);

    // Monthly
    const tdMonthly = document.createElement('td');
    tr.appendChild(tdMonthly);

    // Notes
    const tdNotes = document.createElement('td');
    tr.appendChild(tdNotes);

    // Restore button
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

    // For header rows, only displayName is editable
    if (pItem.type === 'header' && field !== 'displayName') {
      td.removeAttribute('contenteditable');
      return td;
    }

    td.addEventListener('focus', () => {
      editingCell = { row: rowIndex, col: colIndex };
      editOriginalValue = td.textContent;
      td.classList.add('editing');
    });

    td.addEventListener('blur', () => {
      td.classList.remove('editing');
      const newVal = td.textContent.trim();
      commitEdit(pItem, field, newVal, type);
      editingCell = null;
    });

    td.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        td.blur();
        // Move down
        const nextRow = el.querySelector(`[data-row="${rowIndex + 1}"][data-col="${colIndex}"]`);
        if (nextRow) nextRow.focus();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        td.textContent = editOriginalValue;
        td.blur();
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        td.blur();
        const nextCol = nextEditableCol(colIndex, e.shiftKey ? -1 : 1);
        if (nextCol != null) {
          const nextCell = el.querySelector(`[data-row="${rowIndex}"][data-col="${nextCol}"]`);
          if (nextCell) nextCell.focus();
        } else {
          // Jump to next/prev row
          const targetRow = e.shiftKey ? rowIndex - 1 : rowIndex + 1;
          const targetCol = e.shiftKey ? EDITABLE_COLS[EDITABLE_COLS.length - 1] : EDITABLE_COLS[0];
          const nextCell = el.querySelector(`[data-row="${targetRow}"][data-col="${targetCol}"]`);
          if (nextCell) nextCell.focus();
        }
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
        pItem[field] = null; // reset to source
      } else {
        // Check if same as source
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
    // Arrow key navigation only when not editing a cell
    if (editingCell) return;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

    e.preventDefault();
    const active = document.activeElement;
    if (!active || !active.dataset.row) return;

    const row = parseInt(active.dataset.row);
    const col = parseInt(active.dataset.col);

    let targetRow = row;
    let targetCol = col;

    if (e.key === 'ArrowUp') targetRow = row - 1;
    if (e.key === 'ArrowDown') targetRow = row + 1;
    if (e.key === 'ArrowLeft') {
      const prev = nextEditableCol(col, -1);
      if (prev != null) targetCol = prev;
    }
    if (e.key === 'ArrowRight') {
      const next = nextEditableCol(col, 1);
      if (next != null) targetCol = next;
    }

    const nextCell = el.querySelector(`[data-row="${targetRow}"][data-col="${targetCol}"]`);
    if (nextCell) nextCell.focus();
  }

  function appendMoveButtons(container, pItem) {
    const upBtn = document.createElement('button');
    upBtn.className = 'btn btn-ghost btn-sm pg-move-btn';
    upBtn.innerHTML = '&#9650;';
    upBtn.title = 'Move up';
    upBtn.addEventListener('click', () => moveItem(pItem, -1));
    container.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.className = 'btn btn-ghost btn-sm pg-move-btn';
    downBtn.innerHTML = '&#9660;';
    downBtn.title = 'Move down';
    downBtn.addEventListener('click', () => moveItem(pItem, 1));
    container.appendChild(downBtn);
  }

  function moveItem(pItem, direction) {
    const visible = getVisibleItems();
    const idx = visible.findIndex(i => i.id === pItem.id);
    if (idx < 0) return;

    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= visible.length) return;

    // Swap order values
    const tmpOrder = visible[idx].order;
    visible[idx].order = visible[swapIdx].order;
    visible[swapIdx].order = tmpOrder;

    emitChange();
    render();
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
    if (selItems.length < 2) return;

    // Combine source indices
    const combinedSourceIndices = [];
    selItems.forEach(i => combinedSourceIndices.push(...(i.sourceIndices || [])));

    // Create merged item
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
      order: Math.min(...selItems.map(i => i.order))
    };

    // Calculate combined price (weighted average unit price)
    const totalValue = selItems.reduce((s, i) => s + getDisplayPrice(i) * getDisplayQty(i), 0);
    const totalQty = merged.displayQty || 1;
    merged.displayPrice = totalValue / totalQty;

    // Average margin
    const avgMargin = selItems.reduce((s, i) => s + getDisplayMargin(i), 0) / selItems.length;
    merged.displayMargin = avgMargin;

    // Remove old items, add merged
    state.items = state.items.filter(i => !selIds.includes(i.id));
    state.items.push(merged);
    selectedRows.clear();
    reindex();
    emitChange();
    render();
  }

  function deleteSelected() {
    selectedRows.forEach(id => {
      const item = state.items.find(i => i.id === id);
      if (item) item.hidden = true;
    });
    selectedRows.clear();
    emitChange();
    render();
  }

  function resetToSource() {
    // Rebuild presentation items from lineItems
    state.items = buildItemsFromSource(state.lineItems);
    selectedRows.clear();
    emitChange();
    render();
  }

  function reindex() {
    // Re-assign integer order values
    const sorted = [...state.items].sort((a, b) => a.order - b.order);
    sorted.forEach((item, i) => { item.order = i; });
  }

  function getItems() {
    return state.items;
  }

  function getSelectedIds() {
    return [...selectedRows];
  }

  function update(props) {
    if (props.items !== undefined) state.items = props.items;
    if (props.lineItems !== undefined) state.lineItems = props.lineItems;
    if (props.licenses !== undefined) state.licenses = props.licenses;
    if (props.onChange !== undefined) state.onChange = props.onChange;
    render();
  }

  render();

  return {
    element: el,
    update,
    getItems,
    getSelectedIds,
    addHeader,
    mergeSelected,
    deleteSelected,
    resetToSource,
    render
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
 * Returns true if any source items changed.
 */
export function detectSourceChanges(presentationItems, lineItems) {
  let hasChanges = false;
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
  return hasChanges;
}
