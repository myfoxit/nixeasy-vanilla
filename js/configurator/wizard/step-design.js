// Step 4: Design — Group and organize line items into groups

import { currency } from '../../utils/format.js';

function uid() {
  try { return uid(); } catch { return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
}

export function createStepDesign({ wizardState, onStateChange, hourlyRate }) {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-direction:column;gap:16px;height:calc(100vh - 280px);min-height:400px;';

  // Ensure groups array exists
  if (!Array.isArray(wizardState.groups)) wizardState.groups = [];

  let selectedLineId = null;

  function getGroups() {
    return wizardState.groups;
  }

  // All line items as source items with available qty tracking
  function getSourceItems() {
    const items = [];
    const hr = hourlyRate || 150;
    for (const li of wizardState.lineItems) {
      const id = li.licenseId ? `lic_${li.licenseId}` : `sp_${li.servicePackId}`;
      // Services use hours * hourlyRate, licenses use price
      const unitPrice = li.itemType === 'servicepack'
        ? (li.hours || 0) * hr
        : (li.price || 0);
      items.push({
        id,
        name: li.name || li.sku,
        totalQty: li.amount,
        unitPrice,
        margin: li.margin || 0,
        itemType: li.itemType,
      });
    }
    return items;
  }

  function getMappedQtys() {
    const qtys = {};
    for (const g of getGroups()) {
      for (const line of (g.lines || [])) {
        for (const item of (line.items || [])) {
          qtys[item.id] = (qtys[item.id] || 0) + item.qty;
        }
      }
    }
    return qtys;
  }

  function getAvailableItems() {
    const source = getSourceItems();
    const mapped = getMappedQtys();
    return source.map(s => ({
      ...s,
      availableQty: s.totalQty - (mapped[s.id] || 0),
    })).filter(s => s.availableQty > 0);
  }

  function addGroup() {
    try {
      wizardState.groups.push({
        id: uid(),
        name: 'New Group',
        lines: [],
      });
      onStateChange();
      render();
    } catch (err) {
      console.error('addGroup failed:', err);
    }
  }

  function removeGroup(idx) {
    wizardState.groups.splice(idx, 1);
    selectedLineId = null;
    onStateChange();
    render();
  }

  function addLineItem(groupIdx) {
    try {
      const newLine = { id: uid(), text: '', amount: 1, items: [] };
      if (!wizardState.groups[groupIdx]) { console.error('addLineItem: invalid groupIdx', groupIdx); return; }
      wizardState.groups[groupIdx].lines.push(newLine);
      selectedLineId = newLine.id;
      onStateChange();
      render();
    } catch (err) {
      console.error('addLineItem failed:', err);
    }
  }

  function removeLineItem(groupIdx, lineIdx) {
    const lineId = wizardState.groups[groupIdx].lines[lineIdx].id;
    wizardState.groups[groupIdx].lines.splice(lineIdx, 1);
    if (selectedLineId === lineId) selectedLineId = null;
    onStateChange();
    render();
  }

  function allocate(sourceItem, shiftKey) {
    if (!selectedLineId) {
      console.warn('allocate: no line selected');
      return;
    }
    const qtyToAllocate = shiftKey ? 1 : sourceItem.availableQty;
    if (qtyToAllocate <= 0) return;

    for (const g of wizardState.groups) {
      const line = g.lines.find(l => l.id === selectedLineId);
      if (line) {
        const existing = line.items.find(i => i.id === sourceItem.id);
        if (existing) {
          existing.qty += qtyToAllocate;
        } else {
          line.items.push({
            id: sourceItem.id,
            name: sourceItem.name,
            qty: qtyToAllocate,
            unitPrice: sourceItem.unitPrice,
            margin: sourceItem.margin,
          });
        }
        onStateChange();
        render();
        return;
      }
    }
  }

  function deallocate(groupIdx, lineIdx, itemIdx, shiftKey) {
    const line = wizardState.groups[groupIdx].lines[lineIdx];
    if (shiftKey && line.items[itemIdx].qty > 1) {
      line.items[itemIdx].qty -= 1;
    } else {
      line.items.splice(itemIdx, 1);
    }
    onStateChange();
    render();
  }

  function computeDesignTotals() {
    let hk = 0, vk = 0;
    for (const g of getGroups()) {
      for (const line of (g.lines || [])) {
        for (const item of (line.items || [])) {
          const itemHk = item.unitPrice * item.qty;
          const itemVk = itemHk * (1 + (item.margin || 0) / 100);
          hk += itemHk;
          vk += itemVk;
        }
      }
    }
    return { hk, vk };
  }

  function render() {
    console.log('[step-design] render() called, groups:', wizardState.groups.length, 'el in DOM:', !!el.parentNode);
    el.innerHTML = '';

    // Header bar
    const headerBar = document.createElement('div');
    headerBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 16px;flex-shrink:0;';

    const headerLeft = document.createElement('div');
    const headerTitle = document.createElement('h4');
    headerTitle.style.cssText = 'margin:0;font-size:0.95rem;color:var(--text-main);';
    headerTitle.textContent = 'Quote Design Layout';
    headerLeft.appendChild(headerTitle);
    const headerDesc = document.createElement('p');
    headerDesc.style.cssText = 'margin:2px 0 0;font-size:0.75rem;color:var(--text-secondary);';
    headerDesc.textContent = 'Organize configuration items into customer-facing groups and line items.';
    headerLeft.appendChild(headerDesc);
    headerBar.appendChild(headerLeft);

    const headerRight = document.createElement('div');
    headerRight.style.cssText = 'display:flex;align-items:center;gap:16px;';

    // Totals
    const { hk, vk } = computeDesignTotals();
    const totalsBox = document.createElement('div');
    totalsBox.style.cssText = 'display:flex;gap:12px;background:var(--bg);padding:6px 12px;border-radius:6px;border:1px solid var(--border);';
    totalsBox.innerHTML = `
      <div style="display:flex;flex-direction:column;text-align:right;">
        <span style="font-size:0.6rem;text-transform:uppercase;font-weight:600;color:var(--text-secondary);">Total HK</span>
        <span style="font-size:1rem;font-weight:700;color:var(--text-main);">${currency(hk)}</span>
      </div>
      <div style="border-left:1px solid var(--border);padding-left:12px;display:flex;flex-direction:column;text-align:right;">
        <span style="font-size:0.6rem;text-transform:uppercase;font-weight:600;color:var(--text-secondary);">Total VK</span>
        <span style="font-size:1rem;font-weight:700;color:var(--primary);">${currency(vk)}</span>
      </div>`;
    headerRight.appendChild(totalsBox);

    const addGroupBtn = document.createElement('button');
    addGroupBtn.className = 'btn btn-primary btn-sm';
    addGroupBtn.textContent = '+ Create Group';
    addGroupBtn.addEventListener('click', addGroup);
    headerRight.appendChild(addGroupBtn);
    headerBar.appendChild(headerRight);
    el.appendChild(headerBar);

    // Main panels
    const mainRow = document.createElement('div');
    mainRow.style.cssText = 'display:flex;gap:16px;flex:1;min-height:0;';

    // Left: Unallocated items
    const leftPanel = document.createElement('div');
    leftPanel.style.cssText = 'width:340px;flex-shrink:0;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;';

    const leftHeader = document.createElement('div');
    leftHeader.style.cssText = 'padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0;';
    const leftTitle = document.createElement('h4');
    leftTitle.style.cssText = 'margin:0;font-size:0.95rem;color:var(--text-main);';
    leftTitle.textContent = 'Unallocated Items';
    leftHeader.appendChild(leftTitle);
    const leftHint = document.createElement('span');
    leftHint.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);';
    leftHint.textContent = 'Click: Add All | Shift+Click: Add 1';
    leftHeader.appendChild(leftHint);
    leftPanel.appendChild(leftHeader);

    const leftScroll = document.createElement('div');
    leftScroll.style.cssText = 'flex:1;overflow-y:auto;padding:8px;';

    const available = getAvailableItems();
    if (available.length === 0) {
      leftScroll.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:0.85rem;text-align:center;padding:16px;">All items have been allocated to the design.</div>';
    } else {
      available.forEach(item => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:6px;cursor:pointer;transition:all 0.15s;margin-bottom:4px;border:1px solid transparent;';
        row.addEventListener('mouseenter', () => { row.style.background = 'var(--primary-light)'; row.style.borderColor = 'var(--primary)'; });
        row.addEventListener('mouseleave', () => { row.style.background = ''; row.style.borderColor = 'transparent'; });
        row.addEventListener('click', e => allocate(item, e.shiftKey));

        const nameEl = document.createElement('span');
        nameEl.style.cssText = 'font-size:0.85rem;font-weight:500;color:var(--text-main);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        nameEl.textContent = item.name;
        nameEl.title = item.name;
        row.appendChild(nameEl);

        const qtyBadge = document.createElement('span');
        qtyBadge.style.cssText = 'font-size:0.8rem;font-weight:600;color:var(--primary);background:var(--primary-light);padding:2px 8px;border-radius:4px;margin-left:8px;';
        qtyBadge.textContent = item.availableQty;
        row.appendChild(qtyBadge);

        leftScroll.appendChild(row);
      });
    }
    leftPanel.appendChild(leftScroll);
    mainRow.appendChild(leftPanel);

    // Right: Design groups
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow-y:auto;gap:16px;padding:4px;';

    const groups = getGroups();
    if (groups.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:0.9rem;background:var(--surface);border:1px solid var(--border);border-radius:8px;';
      empty.textContent = 'Create a group to start designing the quote structure.';
      rightPanel.appendChild(empty);
    } else {
      groups.forEach((group, gIdx) => {
        const groupEl = document.createElement('div');
        groupEl.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;';

        // Group header
        const groupHeader = document.createElement('div');
        groupHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:var(--bg);border-bottom:1px solid var(--border);';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = group.name;
        nameInput.style.cssText = 'font-weight:600;font-size:0.95rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:4px 2px;color:var(--text-main);width:200px;';
        nameInput.addEventListener('focus', () => { nameInput.style.borderBottomColor = 'var(--primary)'; });
        nameInput.addEventListener('blur', () => { nameInput.style.borderBottomColor = 'transparent'; });
        nameInput.addEventListener('input', e => {
          wizardState.groups[gIdx].name = e.target.value;
          onStateChange();
        });
        groupHeader.appendChild(nameInput);

        const groupActions = document.createElement('div');
        groupActions.style.cssText = 'display:flex;align-items:center;gap:8px;';

        // Group totals
        let groupHk = 0, groupVk = 0;
        for (const line of (group.lines || [])) {
          for (const item of (line.items || [])) {
            groupHk += item.unitPrice * item.qty;
            groupVk += item.unitPrice * item.qty * (1 + (item.margin || 0) / 100);
          }
        }
        const groupTotals = document.createElement('span');
        groupTotals.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);background:var(--surface);padding:4px 8px;border-radius:4px;border:1px solid var(--border);';
        groupTotals.textContent = `HK: ${currency(groupHk)} | VK: ${currency(groupVk)}`;
        groupActions.appendChild(groupTotals);

        const addLineBtn = document.createElement('button');
        addLineBtn.className = 'btn btn-sm btn-secondary';
        addLineBtn.textContent = '+ Add Line';
        addLineBtn.addEventListener('click', () => addLineItem(gIdx));
        groupActions.appendChild(addLineBtn);

        const removeGroupBtn = document.createElement('button');
        removeGroupBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:1.2rem;padding:2px 6px;border-radius:4px;transition:color 0.15s;';
        removeGroupBtn.textContent = '\u00d7';
        removeGroupBtn.title = 'Remove Group';
        removeGroupBtn.addEventListener('mouseenter', () => { removeGroupBtn.style.color = '#ef4444'; });
        removeGroupBtn.addEventListener('mouseleave', () => { removeGroupBtn.style.color = 'var(--text-secondary)'; });
        removeGroupBtn.addEventListener('click', () => removeGroup(gIdx));
        groupActions.appendChild(removeGroupBtn);

        groupHeader.appendChild(groupActions);
        groupEl.appendChild(groupHeader);

        // Lines
        const linesContainer = document.createElement('div');
        linesContainer.style.cssText = 'padding:12px;';

        if ((group.lines || []).length === 0) {
          const emptyLine = document.createElement('p');
          emptyLine.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);font-style:italic;margin:0;';
          emptyLine.textContent = 'No line items in this group yet.';
          linesContainer.appendChild(emptyLine);
        }

        (group.lines || []).forEach((line, lIdx) => {
          const lineEl = document.createElement('div');
          const isSelected = selectedLineId === line.id;
          lineEl.style.cssText = `border:1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'};border-radius:6px;margin-bottom:8px;transition:all 0.15s;${isSelected ? 'box-shadow:0 0 0 1px var(--primary);background:var(--primary-light);' : ''}`;
          lineEl.addEventListener('click', () => { selectedLineId = line.id; render(); });

          // Line header
          const lineHeader = document.createElement('div');
          lineHeader.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg);border-bottom:1px solid var(--border);border-radius:6px 6px 0 0;';

          const lineQtyInput = document.createElement('input');
          lineQtyInput.type = 'number';
          lineQtyInput.min = '1';
          lineQtyInput.value = line.amount || 1;
          lineQtyInput.style.cssText = 'width:50px;text-align:center;padding:4px;border:1px solid var(--border);border-radius:4px;font-size:0.8rem;background:var(--surface);color:var(--text-main);';
          lineQtyInput.addEventListener('click', e => e.stopPropagation());
          lineQtyInput.addEventListener('change', e => {
            wizardState.groups[gIdx].lines[lIdx].amount = Math.max(1, parseInt(e.target.value) || 1);
            onStateChange();
            render();
          });
          lineHeader.appendChild(lineQtyInput);

          const lineTextInput = document.createElement('input');
          lineTextInput.type = 'text';
          lineTextInput.value = line.text || '';
          lineTextInput.placeholder = 'Line Item Description';
          lineTextInput.style.cssText = 'flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:0.85rem;font-weight:500;background:var(--surface);color:var(--text-main);';
          lineTextInput.addEventListener('click', e => e.stopPropagation());
          lineTextInput.addEventListener('input', e => {
            wizardState.groups[gIdx].lines[lIdx].text = e.target.value;
            onStateChange();
          });
          lineHeader.appendChild(lineTextInput);

          // Line total
          let lineHk = 0, lineVk = 0;
          for (const item of (line.items || [])) {
            lineHk += item.unitPrice * item.qty;
            lineVk += item.unitPrice * item.qty * (1 + (item.margin || 0) / 100);
          }
          const lineTotalEl = document.createElement('span');
          lineTotalEl.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);white-space:nowrap;';
          lineTotalEl.textContent = `${currency(lineVk)}`;
          lineHeader.appendChild(lineTotalEl);

          const removeLineBtn = document.createElement('button');
          removeLineBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--text-secondary);padding:2px;border-radius:4px;transition:color 0.15s;';
          removeLineBtn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
          removeLineBtn.addEventListener('mouseenter', () => { removeLineBtn.style.color = '#ef4444'; });
          removeLineBtn.addEventListener('mouseleave', () => { removeLineBtn.style.color = 'var(--text-secondary)'; });
          removeLineBtn.addEventListener('click', e => { e.stopPropagation(); removeLineItem(gIdx, lIdx); });
          lineHeader.appendChild(removeLineBtn);
          lineEl.appendChild(lineHeader);

          // Allocated items
          const itemsArea = document.createElement('div');
          itemsArea.style.cssText = 'padding:6px 10px;';

          if ((line.items || []).length === 0) {
            const hint = document.createElement('p');
            hint.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);font-style:italic;margin:4px 0;padding-left:16px;';
            hint.textContent = 'Select this line, then click unallocated items to map them here.';
            itemsArea.appendChild(hint);
          }

          (line.items || []).forEach((item, iIdx) => {
            const itemRow = document.createElement('div');
            itemRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 8px;margin-left:16px;border-left:2px solid var(--border);padding-left:10px;border-radius:0;cursor:pointer;transition:all 0.15s;';
            itemRow.title = 'Click to remove. Shift+Click to remove 1.';
            itemRow.addEventListener('mouseenter', () => { itemRow.style.background = '#fef2f2'; itemRow.style.borderLeftColor = '#ef4444'; });
            itemRow.addEventListener('mouseleave', () => { itemRow.style.background = ''; itemRow.style.borderLeftColor = 'var(--border)'; });
            itemRow.addEventListener('click', e => { e.stopPropagation(); deallocate(gIdx, lIdx, iIdx, e.shiftKey); });

            const itemName = document.createElement('span');
            itemName.style.cssText = 'font-size:0.8rem;color:var(--text-main);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            itemName.textContent = item.name;
            itemRow.appendChild(itemName);

            const itemQty = document.createElement('span');
            itemQty.style.cssText = 'font-size:0.8rem;font-weight:500;color:var(--text-secondary);margin-left:8px;';
            itemQty.textContent = `x${item.qty}`;
            itemRow.appendChild(itemQty);

            const itemTotal = document.createElement('span');
            itemTotal.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);margin-left:12px;';
            itemTotal.textContent = currency(item.unitPrice * item.qty * (1 + (item.margin || 0) / 100));
            itemRow.appendChild(itemTotal);

            itemsArea.appendChild(itemRow);
          });

          lineEl.appendChild(itemsArea);
          linesContainer.appendChild(lineEl);
        });

        groupEl.appendChild(linesContainer);
        rightPanel.appendChild(groupEl);
      });
    }

    mainRow.appendChild(rightPanel);
    el.appendChild(mainRow);
  }

  render();
  return { element: el, refresh: render };
}
