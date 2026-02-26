// Quote Lines Table component
// Ported from React QuoteLinesTable.tsx (589 lines)
// Grouped quote lines table with container groups, dependency warnings,
// editable container names, and installed base reference section.

import { currency } from '../utils/format.js';
import { getMeasurePointTag } from '../utils/license-calculations.js';
import { createSelect } from '../components/select.js';
import { showConfirmModal } from '../components/modal.js';

/**
 * Create the Quote Lines Table.
 *
 * @param {Object} props
 * @param {Array}        props.lineItems                   - Array of LineItem objects
 * @param {Array}        props.licenses                    - Available license objects (for SLA lookups)
 * @param {Array}        props.containers                  - Array of LicenseContainer objects
 * @param {string|null}  props.selectedContainerId         - Currently selected container ID
 * @param {boolean}      props.isTemplateMode              - Whether in template editing mode
 * @param {Function}     props.onUpdateItem                - (idx, field, val) => void
 * @param {Function}     props.onRemoveItem                - (idx) => void
 * @param {Function}     [props.onAddDependency]           - (license) => void
 * @param {Function}     props.onSelectContainer           - (id|null) => void
 * @param {Function}     props.onUpdateContainer           - (id, name, desc?) => void
 * @param {Function}     props.onRemoveContainer           - (id) => void
 * @param {Function}     props.onAddContainer              - (name, desc?) => void
 * @param {Array}        [props.referencedInstalledBase]   - Array of referenced installed base items
 * @param {Function}     [props.onRemoveInstalledBaseReference] - (item) => void
 * @returns {{ element: HTMLElement, update: Function }}
 */
export function createQuoteLinesTable({
  lineItems = [],
  licenses = [],
  containers = [],
  selectedContainerId = null,
  isTemplateMode = false,
  onUpdateItem,
  onRemoveItem,
  onAddDependency,
  onSelectContainer,
  onUpdateContainer,
  onRemoveContainer,
  onAddContainer,
  referencedInstalledBase = [],
  onRemoveInstalledBaseReference
}) {
  const wrapper = document.createElement('div');

  let state = {
    lineItems,
    licenses,
    containers,
    selectedContainerId,
    isTemplateMode,
    onUpdateItem,
    onRemoveItem,
    onAddDependency,
    onSelectContainer,
    onUpdateContainer,
    onRemoveContainer,
    onAddContainer,
    referencedInstalledBase,
    onRemoveInstalledBaseReference
  };

  // Internal UI state
  let collapsedContainers = new Set();
  let editingContainerId = null;
  let editingContainerName = '';
  let showAddGroup = false;
  let newGroupName = '';

  // Track select component instances for cleanup
  let selectInstances = [];

  // --- Helpers ---

  function getGroupedItems() {
    const items = state.lineItems || [];
    const groups = new Map();

    // Initialize groups for all containers
    state.containers.forEach(c => {
      groups.set(c.id, { container: c, items: [] });
    });

    // Assign items to groups
    items.forEach((item, idx) => {
      const containerId = item.containerId || 'uncategorized';
      if (!groups.has(containerId)) {
        groups.set(containerId, { container: undefined, items: [] });
      }
      groups.get(containerId).items.push({ item, originalIndex: idx });
    });

    return groups;
  }

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

  function getContainerTotal(containerItems) {
    return containerItems.reduce((sum, { item }) => {
      return sum + (item.price * item.amount) * (1 + item.margin / 100);
    }, 0);
  }

  // --- Create Group handler ---

  function handleCreateGroup() {
    if (newGroupName.trim()) {
      if (state.onAddContainer) state.onAddContainer(newGroupName.trim());
      newGroupName = '';
      showAddGroup = false;
      render();
    }
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

    // Group/item count
    const countSpan = document.createElement('span');
    countSpan.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);';
    const items = state.lineItems || [];
    countSpan.textContent = `${state.containers.length} ${state.containers.length === 1 ? 'group' : 'groups'} \u2022 ${items.length} ${items.length === 1 ? 'item' : 'items'}`;
    headerRight.appendChild(countSpan);

    // Add Group button or inline form
    if (showAddGroup) {
      const addForm = document.createElement('div');
      addForm.style.cssText = 'display:flex;gap:6px;';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = 'Group name...';
      nameInput.value = newGroupName;
      nameInput.style.cssText = 'width:150px;font-size:0.8rem;padding:4px 8px;';
      nameInput.addEventListener('input', (e) => {
        newGroupName = e.target.value;
      });
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleCreateGroup();
        if (e.key === 'Escape') { showAddGroup = false; newGroupName = ''; render(); }
      });
      addForm.appendChild(nameInput);

      const createBtn = document.createElement('button');
      createBtn.className = 'btn btn-sm btn-primary';
      createBtn.textContent = 'Create';
      createBtn.disabled = !newGroupName.trim();
      createBtn.addEventListener('click', handleCreateGroup);
      addForm.appendChild(createBtn);

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-sm btn-secondary';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => { showAddGroup = false; newGroupName = ''; render(); });
      addForm.appendChild(cancelBtn);

      headerRight.appendChild(addForm);

      // Auto-focus after render
      requestAnimationFrame(() => nameInput.focus());
    } else {
      const addGroupBtn = document.createElement('button');
      addGroupBtn.className = 'btn btn-sm btn-primary';
      addGroupBtn.style.cssText = 'display:flex;align-items:center;gap:4px;';

      const plusSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      plusSvg.setAttribute('fill', 'none');
      plusSvg.setAttribute('viewBox', '0 0 24 24');
      plusSvg.setAttribute('stroke-width', '2');
      plusSvg.setAttribute('stroke', 'currentColor');
      plusSvg.style.cssText = 'width:14px;height:14px;';
      const plusPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      plusPath.setAttribute('stroke-linecap', 'round');
      plusPath.setAttribute('stroke-linejoin', 'round');
      plusPath.setAttribute('d', 'M12 4.5v15m7.5-7.5h-15');
      plusSvg.appendChild(plusPath);
      addGroupBtn.appendChild(plusSvg);
      addGroupBtn.appendChild(document.createTextNode('Add Group'));

      addGroupBtn.addEventListener('click', () => {
        showAddGroup = true;
        render();
      });
      headerRight.appendChild(addGroupBtn);
    }

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

    // --- Container Groups ---
    const groupedItems = getGroupedItems();
    const itemDependencies = getItemDependencies();

    if (state.containers.length === 0) {
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
      emptyP1.textContent = 'No license groups created yet';
      emptyDiv.appendChild(emptyP1);

      const emptyP2 = document.createElement('p');
      emptyP2.style.fontSize = '0.8rem';
      emptyP2.textContent = 'Create a group in the catalog panel to start adding licenses';
      emptyDiv.appendChild(emptyP2);

      cardBody.appendChild(emptyDiv);
    } else {
      groupedItems.forEach(({ container, items: containerItems }, containerId) => {
        if (!container) return;

        const isCollapsed = collapsedContainers.has(containerId);
        const isSelected = state.selectedContainerId === containerId;
        const containerTotal = getContainerTotal(containerItems);
        const isEditing = editingContainerId === containerId;

        const containerDiv = document.createElement('div');
        containerDiv.style.borderBottom = '1px solid var(--border)';

        // --- Container Header ---
        const containerHeader = document.createElement('div');
        containerHeader.style.cssText = [
          'display:flex',
          'align-items:center',
          'justify-content:space-between',
          'padding:12px 16px',
          `background:${isSelected ? 'var(--primary-light)' : 'var(--bg)'}`,
          'cursor:pointer',
          `border-left:3px solid ${isSelected ? 'var(--primary)' : 'transparent'}`,
          'transition:all 0.15s'
        ].join(';') + ';';

        containerHeader.addEventListener('click', () => {
          if (state.onSelectContainer) state.onSelectContainer(containerId);
        });

        // Left side: chevron, folder icon, name, item count
        const headerLeft = document.createElement('div');
        headerLeft.style.cssText = 'display:flex;align-items:center;gap:12px;';

        // Collapse/expand chevron
        const chevronBtn = document.createElement('button');
        chevronBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;color:var(--text-secondary);';
        const chevronSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        chevronSvg.setAttribute('fill', 'none');
        chevronSvg.setAttribute('viewBox', '0 0 24 24');
        chevronSvg.setAttribute('stroke-width', '2');
        chevronSvg.setAttribute('stroke', 'currentColor');
        chevronSvg.style.cssText = `width:16px;height:16px;transform:${isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'};transition:transform 0.15s;`;
        const chevronPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        chevronPath.setAttribute('stroke-linecap', 'round');
        chevronPath.setAttribute('stroke-linejoin', 'round');
        chevronPath.setAttribute('d', 'M19.5 8.25l-7.5 7.5-7.5-7.5');
        chevronSvg.appendChild(chevronPath);
        chevronBtn.appendChild(chevronSvg);
        chevronBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (collapsedContainers.has(containerId)) {
            collapsedContainers.delete(containerId);
          } else {
            collapsedContainers.add(containerId);
          }
          render();
        });
        headerLeft.appendChild(chevronBtn);

        // Name block
        const nameBlock = document.createElement('div');
        nameBlock.style.cssText = 'display:flex;align-items:center;gap:8px;';

        // Folder icon
        const folderSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        folderSvg.setAttribute('fill', 'none');
        folderSvg.setAttribute('viewBox', '0 0 24 24');
        folderSvg.setAttribute('stroke-width', '1.5');
        folderSvg.setAttribute('stroke', isSelected ? 'var(--primary)' : 'var(--text-secondary)');
        folderSvg.style.cssText = 'width:16px;height:16px;';
        const folderPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        folderPath.setAttribute('stroke-linecap', 'round');
        folderPath.setAttribute('stroke-linejoin', 'round');
        folderPath.setAttribute('d', 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z');
        folderSvg.appendChild(folderPath);
        nameBlock.appendChild(folderSvg);

        // Container name (editable or static)
        if (isEditing) {
          const nameInput = document.createElement('input');
          nameInput.type = 'text';
          nameInput.value = editingContainerName;
          nameInput.style.cssText = 'font-size:0.9rem;font-weight:600;padding:2px 6px;width:150px;';
          nameInput.addEventListener('input', (e) => {
            editingContainerName = e.target.value;
          });
          nameInput.addEventListener('blur', () => {
            if (editingContainerId && editingContainerName.trim()) {
              if (state.onUpdateContainer) state.onUpdateContainer(editingContainerId, editingContainerName.trim());
            }
            editingContainerId = null;
            editingContainerName = '';
            render();
          });
          nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              if (editingContainerId && editingContainerName.trim()) {
                if (state.onUpdateContainer) state.onUpdateContainer(editingContainerId, editingContainerName.trim());
              }
              editingContainerId = null;
              editingContainerName = '';
              render();
            }
            if (e.key === 'Escape') {
              editingContainerId = null;
              editingContainerName = '';
              render();
            }
          });
          nameInput.addEventListener('click', (e) => e.stopPropagation());
          nameBlock.appendChild(nameInput);
          // Auto-focus after DOM insertion
          requestAnimationFrame(() => nameInput.focus());
        } else {
          const nameSpan = document.createElement('span');
          nameSpan.style.cssText = `font-weight:600;font-size:0.9rem;color:${isSelected ? 'var(--primary)' : 'var(--text-main)'};`;
          nameSpan.textContent = container.name;
          nameBlock.appendChild(nameSpan);
        }

        // Item count badge
        const countBadge = document.createElement('span');
        countBadge.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);background:var(--surface);padding:2px 8px;border-radius:12px;';
        countBadge.textContent = `${containerItems.length} ${containerItems.length === 1 ? 'item' : 'items'}`;
        nameBlock.appendChild(countBadge);

        headerLeft.appendChild(nameBlock);
        containerHeader.appendChild(headerLeft);

        // Right side: total, SELECTED badge, edit/delete buttons
        const headerRight = document.createElement('div');
        headerRight.style.cssText = 'display:flex;align-items:center;gap:8px;';

        const totalSpan = document.createElement('span');
        totalSpan.style.cssText = 'font-weight:600;font-size:0.9rem;color:var(--text-main);';
        totalSpan.textContent = currency(containerTotal);
        headerRight.appendChild(totalSpan);

        if (isSelected) {
          const selBadge = document.createElement('span');
          selBadge.style.cssText = 'font-size:0.65rem;background:var(--primary);color:white;padding:2px 6px;border-radius:4px;font-weight:500;';
          selBadge.textContent = 'SELECTED';
          headerRight.appendChild(selBadge);
        }

        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-ghost btn-sm';
        editBtn.style.padding = '4px';
        editBtn.title = 'Edit group';
        const editSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        editSvg.setAttribute('fill', 'none');
        editSvg.setAttribute('viewBox', '0 0 24 24');
        editSvg.setAttribute('stroke-width', '1.5');
        editSvg.setAttribute('stroke', 'currentColor');
        editSvg.style.cssText = 'width:14px;height:14px;';
        const editPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        editPath.setAttribute('stroke-linecap', 'round');
        editPath.setAttribute('stroke-linejoin', 'round');
        editPath.setAttribute('d', 'M16.862 4.487l1.687-1.688a1.5 1.5 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125');
        editSvg.appendChild(editPath);
        editBtn.appendChild(editSvg);
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          editingContainerId = container.id;
          editingContainerName = container.name;
          render();
        });
        headerRight.appendChild(editBtn);

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-ghost btn-sm text-danger';
        deleteBtn.style.padding = '4px';
        deleteBtn.title = 'Remove group';
        const delSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        delSvg.setAttribute('fill', 'none');
        delSvg.setAttribute('viewBox', '0 0 24 24');
        delSvg.setAttribute('stroke-width', '1.5');
        delSvg.setAttribute('stroke', 'currentColor');
        delSvg.style.cssText = 'width:14px;height:14px;';
        const delPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        delPath.setAttribute('stroke-linecap', 'round');
        delPath.setAttribute('stroke-linejoin', 'round');
        delPath.setAttribute('d', 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0');
        delSvg.appendChild(delPath);
        deleteBtn.appendChild(delSvg);
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showConfirmModal({
            title: 'Remove Group',
            message: `Are you sure you want to remove the group "${container.name}"? All items in this group will also be removed.`,
            confirmText: 'Remove Group',
            variant: 'warning',
            onConfirm: () => {
              if (state.onRemoveContainer) state.onRemoveContainer(container.id);
            }
          });
        });
        headerRight.appendChild(deleteBtn);

        containerHeader.appendChild(headerRight);
        containerDiv.appendChild(containerHeader);

        // --- Container Items Table ---
        if (!isCollapsed && containerItems.length > 0) {
          const table = document.createElement('table');
          table.className = 'w-full';

          const thead = document.createElement('thead');
          const headRow = document.createElement('tr');
          const thData = [
            { text: 'Item', style: 'padding-left:2.5rem;' },
            { text: 'Service / Hours', style: 'width:140px;' },
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

          containerItems.forEach(({ item, originalIndex }) => {
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
            tdItem.style.paddingLeft = '2.5rem';

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
              const slaSelect = createSelect({
                name: `sla-${originalIndex}`,
                value: item.sla || '',
                options: [
                  { value: '', label: 'None' },
                  ...slas.map(s => ({ value: s.id, label: s.name }))
                ],
                onChange: (val) => {
                  if (state.onUpdateItem) state.onUpdateItem(originalIndex, 'sla', val);
                },
                truncateTrigger: true,
                wrapOptions: true
              });
              selectInstances.push(slaSelect);
              tdService.appendChild(slaSelect.element);
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
              depTd.style.cssText = 'padding:0 2.5rem 12px 2.5rem;background:#fef9e7;';

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
          containerDiv.appendChild(table);
        }

        // Empty container message
        if (!isCollapsed && containerItems.length === 0) {
          const emptyMsg = document.createElement('div');
          emptyMsg.style.cssText = 'padding:16px 24px;color:var(--text-secondary);font-size:0.8rem;font-style:italic;';
          emptyMsg.textContent = 'No items in this group. Add items from the catalog.';
          containerDiv.appendChild(emptyMsg);
        }

        cardBody.appendChild(containerDiv);
      });
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
    if (props.containers !== undefined) state.containers = props.containers;
    if (props.selectedContainerId !== undefined) state.selectedContainerId = props.selectedContainerId;
    if (props.isTemplateMode !== undefined) state.isTemplateMode = props.isTemplateMode;
    if (props.onUpdateItem !== undefined) state.onUpdateItem = props.onUpdateItem;
    if (props.onRemoveItem !== undefined) state.onRemoveItem = props.onRemoveItem;
    if (props.onAddDependency !== undefined) state.onAddDependency = props.onAddDependency;
    if (props.onSelectContainer !== undefined) state.onSelectContainer = props.onSelectContainer;
    if (props.onUpdateContainer !== undefined) state.onUpdateContainer = props.onUpdateContainer;
    if (props.onRemoveContainer !== undefined) state.onRemoveContainer = props.onRemoveContainer;
    if (props.onAddContainer !== undefined) state.onAddContainer = props.onAddContainer;
    if (props.referencedInstalledBase !== undefined) state.referencedInstalledBase = props.referencedInstalledBase;
    if (props.onRemoveInstalledBaseReference !== undefined) state.onRemoveInstalledBaseReference = props.onRemoveInstalledBaseReference;
    render();
  }

  return { element: wrapper, update };
}
