// Measure Point Calculator View
// Ported from React MeasurePointCalculatorView.tsx (544 lines)
// Two-panel layout: template selection (left) + selected devices (right)
// Supports embedded mode (inside configurator modal) and standalone mode

import { pb } from '../api.js';
import { showToast } from '../components/toast.js';
import { MEASURE_POINT_LICENSE_CONFIGS, calculateMeasurePointLicenses } from '../utils/license-calculations.js';

/**
 * Get badge CSS class for a template type.
 * @param {string} type
 * @returns {string}
 */
function getTypeBadgeClass(type) {
  switch (type) {
    case 'APPLICATION': return 'badge-success';
    case 'SYSTEM': return 'badge-warning';
    case 'CSM DEF': return 'badge-info';
    default: return 'badge-neutral';
  }
}

/**
 * Create the Measure Point Calculator view.
 *
 * @param {HTMLElement} container - The container to render into.
 * @param {Object} [opts]
 * @param {boolean} [opts.embedded=false] - Embedded inside configurator modal.
 * @param {Function} [opts.onApplyLicenses] - Called with (distributions[]) in embedded mode.
 * @param {Function} [opts.onApplyMeasurePoints] - Called with (totalPoints) in embedded mode.
 * @param {Function} [opts.onClose] - Called when Cancel is clicked in embedded mode.
 * @param {Array} [opts.licenses=[]] - Available licenses for distribution calculation.
 * @returns {{ destroy: Function, element: HTMLElement }}
 */
export function createMeasurePointCalculatorView(container, {
  embedded = false,
  onApplyLicenses,
  onApplyMeasurePoints,
  onClose,
  licenses = [],
} = {}) {
  container.innerHTML = '';

  // --- State ---
  let templates = [];
  let devices = []; // { id, templateId, templateName, templateType, quantity, checksPerDevice, totalChecks }
  let loading = true;
  let searchTerm = '';
  let selectedType = 'ALL';
  let selectedLicenseTypes = [MEASURE_POINT_LICENSE_CONFIGS[0]?.prefix || 'LIC-CMP-MONI-CHECK-'];
  let manualMeasurePoints = 0;

  // --- Root element ---
  const root = document.createElement('div');
  if (embedded) {
    root.style.cssText = 'height:100%;display:flex;flex-direction:column;background:var(--surface);';
  }

  // --- Standalone header ---
  if (!embedded) {
    const headerEl = document.createElement('header');
    headerEl.className = 'p-6 border-b';
    headerEl.style.cssText = 'background:var(--surface);border-color:var(--border);';

    const headerInner = document.createElement('div');
    headerInner.className = 'flex justify-between items-center';

    const headerLeft = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.style.cssText = 'margin:0;color:var(--text-main);';
    h2.textContent = 'Measure Point Calculator';
    const desc = document.createElement('p');
    desc.className = 'text-sm text-secondary';
    desc.style.marginTop = '4px';
    desc.textContent = 'Add devices and calculate total measure points for licensing';
    headerLeft.appendChild(h2);
    headerLeft.appendChild(desc);

    headerInner.appendChild(headerLeft);
    headerEl.appendChild(headerInner);
    root.appendChild(headerEl);
  }

  // --- Main content wrapper ---
  const contentWrapper = document.createElement('div');
  if (embedded) {
    contentWrapper.className = 'flex-1 flex';
    contentWrapper.style.minHeight = '0';
  } else {
    contentWrapper.className = 'p-6';
  }

  const panelsContainer = document.createElement('div');
  if (embedded) {
    panelsContainer.className = 'flex gap-4 w-full h-full';
  } else {
    panelsContainer.className = 'grid grid-cols-12 gap-6';
  }

  // ============================
  // LEFT PANEL: Template Selection
  // ============================
  const leftPanel = document.createElement('div');
  if (embedded) {
    leftPanel.style.cssText = 'width:35%;display:flex;flex-direction:column;';
  } else {
    leftPanel.className = 'col-span-5';
  }

  const leftCard = document.createElement('div');
  leftCard.className = 'card h-full flex flex-col';
  leftCard.style.height = embedded ? '100%' : 'calc(100vh - 250px)';

  // --- Left card header ---
  const leftHeader = document.createElement('div');
  leftHeader.className = 'p-4 border-b';
  leftHeader.style.cssText = 'border-color:var(--border);flex-shrink:0;';

  const leftTitle = document.createElement('h3');
  leftTitle.style.cssText = 'margin:0 0 12px 0;font-size:0.95rem;color:var(--text-main);';
  leftTitle.textContent = 'Device Templates';
  leftHeader.appendChild(leftTitle);

  // Search input
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search templates...';
  searchInput.className = 'text-sm mb-3';
  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderTemplateList();
  });
  leftHeader.appendChild(searchInput);

  // Type filter buttons container
  const filterBtns = document.createElement('div');
  filterBtns.className = 'flex gap-2 flex-wrap';
  leftHeader.appendChild(filterBtns);
  leftCard.appendChild(leftHeader);

  // --- Custom Measure Points section ---
  const manualSection = document.createElement('div');
  manualSection.className = 'p-4 border-b';
  manualSection.style.cssText = 'border-color:var(--border);flex-shrink:0;background:var(--bg);';

  const manualLabel = document.createElement('label');
  manualLabel.style.cssText = 'display:block;font-size:0.7rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;';
  manualLabel.textContent = 'Custom Measure Points';
  manualSection.appendChild(manualLabel);

  const manualRow = document.createElement('div');
  manualRow.style.cssText = 'display:flex;gap:8px;align-items:center;';

  const manualInput = document.createElement('input');
  manualInput.type = 'number';
  manualInput.min = '0';
  manualInput.placeholder = 'Enter amount...';
  manualInput.style.cssText = 'flex:1;font-size:0.875rem;';
  manualInput.addEventListener('input', (e) => {
    manualMeasurePoints = parseInt(e.target.value) || 0;
    renderDevicesPanel();
    renderSummaryFooter();
  });

  const manualClearBtn = document.createElement('button');
  manualClearBtn.className = 'btn btn-ghost btn-sm';
  manualClearBtn.style.cssText = 'color:var(--danger);padding:4px;display:none;';
  manualClearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:16px;height:16px"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>';
  manualClearBtn.addEventListener('click', () => {
    manualMeasurePoints = 0;
    manualInput.value = '';
    renderDevicesPanel();
    renderSummaryFooter();
  });

  manualRow.appendChild(manualInput);
  manualRow.appendChild(manualClearBtn);
  manualSection.appendChild(manualRow);

  const manualHint = document.createElement('div');
  manualHint.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);margin-top:4px;';
  manualHint.textContent = 'Add measure points without selecting a device template';
  manualSection.appendChild(manualHint);
  leftCard.appendChild(manualSection);

  // --- Template list (scrollable) ---
  const templateList = document.createElement('div');
  templateList.className = 'flex-1';
  templateList.style.cssText = 'overflow-y:auto;padding:0.5rem;';
  leftCard.appendChild(templateList);

  leftPanel.appendChild(leftCard);
  panelsContainer.appendChild(leftPanel);

  // ============================
  // RIGHT PANEL: Selected Devices
  // ============================
  const rightPanel = document.createElement('div');
  if (embedded) {
    rightPanel.style.cssText = 'width:65%;display:flex;flex-direction:column;';
  } else {
    rightPanel.className = 'col-span-7';
  }

  const rightCard = document.createElement('div');
  rightCard.className = 'card h-full flex flex-col';
  rightCard.style.height = embedded ? '100%' : 'calc(100vh - 250px)';

  // --- Right card header ---
  const rightHeader = document.createElement('div');
  rightHeader.className = 'p-4 border-b flex justify-between items-center';
  rightHeader.style.cssText = 'border-color:var(--border);flex-shrink:0;';

  const rightHeaderLeft = document.createElement('div');
  const rightTitle = document.createElement('h3');
  rightTitle.style.cssText = 'margin:0;font-size:0.95rem;color:var(--text-main);';
  rightTitle.textContent = 'Selected Devices';
  const rightSubtitle = document.createElement('span');
  rightSubtitle.className = 'text-xs text-secondary';
  rightHeaderLeft.appendChild(rightTitle);
  rightHeaderLeft.appendChild(rightSubtitle);

  const clearAllBtn = document.createElement('button');
  clearAllBtn.className = 'btn btn-ghost btn-sm';
  clearAllBtn.style.cssText = 'color:var(--danger);display:none;';
  clearAllBtn.textContent = 'Clear All';
  clearAllBtn.addEventListener('click', () => {
    devices = [];
    manualMeasurePoints = 0;
    manualInput.value = '';
    renderDevicesPanel();
    renderSummaryFooter();
  });

  rightHeader.appendChild(rightHeaderLeft);
  rightHeader.appendChild(clearAllBtn);
  rightCard.appendChild(rightHeader);

  // --- Devices table area (scrollable) ---
  const devicesArea = document.createElement('div');
  devicesArea.className = 'flex-1';
  devicesArea.style.overflowY = 'auto';
  rightCard.appendChild(devicesArea);

  // --- Summary footer ---
  const summaryFooter = document.createElement('div');
  summaryFooter.className = 'p-4 border-t';
  summaryFooter.style.cssText = 'border-color:var(--border);background:var(--bg);flex-shrink:0;';
  rightCard.appendChild(summaryFooter);

  rightPanel.appendChild(rightCard);
  panelsContainer.appendChild(rightPanel);
  contentWrapper.appendChild(panelsContainer);
  root.appendChild(contentWrapper);
  container.appendChild(root);

  // ============================
  // RENDER FUNCTIONS
  // ============================

  /** Render the type filter buttons. */
  function renderFilterButtons() {
    filterBtns.innerHTML = '';
    const uniqueTypes = ['ALL', ...new Set(templates.map(t => t.type))];

    uniqueTypes.forEach(type => {
      const btn = document.createElement('button');
      btn.className = `btn btn-sm ${selectedType === type ? 'btn-primary' : 'btn-secondary'}`;
      btn.style.cssText = 'font-size:0.7rem;padding:4px 8px;';
      btn.textContent = type;
      btn.addEventListener('click', () => {
        selectedType = type;
        renderFilterButtons();
        renderTemplateList();
      });
      filterBtns.appendChild(btn);
    });
  }

  /** Filter templates by search + type. */
  function getFilteredTemplates() {
    return templates.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.check_description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = selectedType === 'ALL' || t.type === selectedType;
      return matchesSearch && matchesType;
    });
  }

  /** Render the scrollable template list in the left panel. */
  function renderTemplateList() {
    templateList.innerHTML = '';

    if (loading) {
      const loadMsg = document.createElement('div');
      loadMsg.style.cssText = 'padding:24px;text-align:center;color:var(--text-secondary);';
      loadMsg.textContent = 'Loading templates...';
      templateList.appendChild(loadMsg);
      return;
    }

    const filtered = getFilteredTemplates();

    if (filtered.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'padding:24px;text-align:center;color:var(--text-secondary);';
      emptyMsg.textContent = 'No templates found';
      templateList.appendChild(emptyMsg);
      return;
    }

    filtered.forEach(template => {
      const item = document.createElement('div');
      item.className = 'template-item';
      item.style.cssText = 'padding:10px 12px;margin-bottom:6px;border-radius:8px;border:1px solid var(--border);cursor:pointer;transition:all 0.15s;background:var(--surface);';

      item.addEventListener('mouseenter', () => {
        item.style.background = 'var(--primary-light)';
        item.style.borderColor = 'var(--primary)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'var(--surface)';
        item.style.borderColor = 'var(--border)';
      });

      item.addEventListener('click', () => addDevice(template));

      // Badge row
      const badgeRow = document.createElement('div');
      badgeRow.className = 'flex items-center gap-2 mb-1';
      const badge = document.createElement('span');
      badge.className = `badge ${getTypeBadgeClass(template.type)}`;
      badge.style.cssText = 'font-size:0.6rem;padding:2px 6px;';
      badge.textContent = template.type;
      badgeRow.appendChild(badge);
      item.appendChild(badgeRow);

      // Name
      const nameEl = document.createElement('div');
      nameEl.style.cssText = 'font-weight:500;font-size:0.875rem;color:var(--text-main);';
      nameEl.textContent = template.name;
      item.appendChild(nameEl);

      // Description + points
      const bottomRow = document.createElement('div');
      bottomRow.className = 'flex justify-between items-center mt-1';

      const descEl = document.createElement('span');
      descEl.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);';
      const descText = template.check_description || 'No description';
      descEl.textContent = descText.length > 40 ? descText.substring(0, 40) + '...' : descText;

      const ptsEl = document.createElement('span');
      ptsEl.style.cssText = 'font-size:0.75rem;font-weight:600;color:var(--primary);background:var(--primary-light);padding:2px 8px;border-radius:4px;';
      ptsEl.textContent = `${template.average_checks} pts`;

      bottomRow.appendChild(descEl);
      bottomRow.appendChild(ptsEl);
      item.appendChild(bottomRow);

      templateList.appendChild(item);
    });
  }

  /** Add a device from a template. */
  function addDevice(template) {
    const newDevice = {
      id: `${template.id}-${Date.now()}`,
      templateId: template.id,
      templateName: template.name,
      templateType: template.type,
      quantity: 1,
      checksPerDevice: template.average_checks,
      totalChecks: template.average_checks,
    };
    devices.push(newDevice);
    showToast(`Added ${template.name}`, 'success');
    renderDevicesPanel();
    renderSummaryFooter();
  }

  /** Update a device field. */
  function updateDevice(id, field, value) {
    const device = devices.find(d => d.id === id);
    if (!device) return;
    device[field] = value;
    device.totalChecks = device.quantity * device.checksPerDevice;
    renderDevicesPanel();
    renderSummaryFooter();
  }

  /** Remove a device. */
  function removeDevice(id) {
    devices = devices.filter(d => d.id !== id);
    renderDevicesPanel();
    renderSummaryFooter();
  }

  /** Calculate totals. */
  function getDeviceMeasurePoints() {
    return devices.reduce((sum, d) => sum + d.totalChecks, 0);
  }

  function getTotalMeasurePoints() {
    return getDeviceMeasurePoints() + manualMeasurePoints;
  }

  /** Calculate license distributions. */
  function getCalculatedDistributions() {
    const total = getTotalMeasurePoints();
    if (total <= 0 || licenses.length === 0 || selectedLicenseTypes.length === 0) return [];

    const allDistributions = [];
    selectedLicenseTypes.forEach(licenseType => {
      const distributions = calculateMeasurePointLicenses(total, licenseType, licenses);
      allDistributions.push(...distributions);
    });
    return allDistributions;
  }

  /** Create the X close icon SVG. */
  function createCloseIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke', 'currentColor');
    svg.style.cssText = 'width:16px;height:16px;';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'M6 18L18 6M6 6l12 12');
    svg.appendChild(path);
    return svg;
  }

  /** Render the selected devices panel (right side). */
  function renderDevicesPanel() {
    // Update header subtitle
    rightSubtitle.textContent = `${devices.length} device${devices.length !== 1 ? 's' : ''} added${manualMeasurePoints > 0 ? ' + custom points' : ''}`;

    // Show/hide Clear All button
    clearAllBtn.style.display = (devices.length > 0 || manualMeasurePoints > 0) ? '' : 'none';

    // Show/hide manual clear button
    manualClearBtn.style.display = manualMeasurePoints > 0 ? '' : 'none';

    devicesArea.innerHTML = '';

    if (devices.length === 0 && manualMeasurePoints === 0) {
      // Empty state
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:48px;text-align:center;color:var(--text-secondary);display:flex;flex-direction:column;align-items:center;gap:12px;';

      const emptySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      emptySvg.setAttribute('fill', 'none');
      emptySvg.setAttribute('viewBox', '0 0 24 24');
      emptySvg.setAttribute('stroke-width', '1.5');
      emptySvg.setAttribute('stroke', 'currentColor');
      emptySvg.style.cssText = 'width:48px;height:48px;opacity:0.3;';
      const emptyPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      emptyPath.setAttribute('stroke-linecap', 'round');
      emptyPath.setAttribute('stroke-linejoin', 'round');
      emptyPath.setAttribute('d', 'M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z');
      emptySvg.appendChild(emptyPath);
      empty.appendChild(emptySvg);

      const emptyText = document.createElement('div');
      const emptyTitle = document.createElement('div');
      emptyTitle.style.cssText = 'font-weight:500;margin-bottom:4px;';
      emptyTitle.textContent = 'No devices added yet';
      const emptyHint = document.createElement('div');
      emptyHint.style.fontSize = '0.75rem';
      emptyHint.textContent = 'Click on a template or enter custom measure points';
      emptyText.appendChild(emptyTitle);
      emptyText.appendChild(emptyHint);
      empty.appendChild(emptyText);

      devicesArea.appendChild(empty);
      return;
    }

    // Build table
    const table = document.createElement('table');
    table.style.width = '100%';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const headers = [
      { text: 'Device', style: 'padding-left:16px' },
      { text: 'Qty', style: 'width:80px;text-align:center' },
      { text: 'Checks', style: 'width:100px;text-align:center' },
      { text: 'Total', style: 'width:80px;text-align:right' },
      { text: '', style: 'width:50px' },
    ];
    headers.forEach(h => {
      const th = document.createElement('th');
      th.style.cssText = h.style;
      th.textContent = h.text;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    // Manual measure points row
    if (manualMeasurePoints > 0) {
      const mRow = document.createElement('tr');
      mRow.style.background = 'var(--primary-light)';

      // Device cell
      const mDeviceTd = document.createElement('td');
      mDeviceTd.style.paddingLeft = '16px';
      const mName = document.createElement('div');
      mName.style.cssText = 'font-weight:500;font-size:0.8rem;';
      mName.textContent = 'Custom Measure Points';
      const mBadge = document.createElement('span');
      mBadge.className = 'badge badge-info';
      mBadge.style.cssText = 'font-size:0.55rem;padding:1px 5px;margin-top:2px;';
      mBadge.textContent = 'MANUAL';
      mDeviceTd.appendChild(mName);
      mDeviceTd.appendChild(mBadge);
      mRow.appendChild(mDeviceTd);

      // Qty cell (dash)
      const mQtyTd = document.createElement('td');
      mQtyTd.style.cssText = 'text-align:center;color:var(--text-secondary);';
      mQtyTd.textContent = '\u2014';
      mRow.appendChild(mQtyTd);

      // Checks cell (dash)
      const mChecksTd = document.createElement('td');
      mChecksTd.style.cssText = 'text-align:center;color:var(--text-secondary);';
      mChecksTd.textContent = '\u2014';
      mRow.appendChild(mChecksTd);

      // Total cell
      const mTotalTd = document.createElement('td');
      mTotalTd.style.cssText = 'text-align:right;font-weight:600;color:var(--primary);font-size:0.85rem;';
      mTotalTd.textContent = String(manualMeasurePoints);
      mRow.appendChild(mTotalTd);

      // Remove cell
      const mRemoveTd = document.createElement('td');
      mRemoveTd.style.textAlign = 'center';
      const mRemoveBtn = document.createElement('button');
      mRemoveBtn.className = 'btn btn-ghost btn-sm';
      mRemoveBtn.style.cssText = 'color:var(--danger);padding:4px;';
      mRemoveBtn.appendChild(createCloseIcon());
      mRemoveBtn.addEventListener('click', () => {
        manualMeasurePoints = 0;
        manualInput.value = '';
        renderDevicesPanel();
        renderSummaryFooter();
      });
      mRemoveTd.appendChild(mRemoveBtn);
      mRow.appendChild(mRemoveTd);

      tbody.appendChild(mRow);
    }

    // Device rows
    devices.forEach(device => {
      const tr = document.createElement('tr');

      // Device cell
      const deviceTd = document.createElement('td');
      deviceTd.style.paddingLeft = '16px';
      const dName = document.createElement('div');
      dName.style.cssText = 'font-weight:500;font-size:0.8rem;';
      dName.textContent = device.templateName;
      const dBadge = document.createElement('span');
      dBadge.className = `badge ${getTypeBadgeClass(device.templateType)}`;
      dBadge.style.cssText = 'font-size:0.55rem;padding:1px 5px;margin-top:2px;';
      dBadge.textContent = device.templateType;
      deviceTd.appendChild(dName);
      deviceTd.appendChild(dBadge);
      tr.appendChild(deviceTd);

      // Qty cell
      const qtyTd = document.createElement('td');
      qtyTd.style.textAlign = 'center';
      const qtyInput = document.createElement('input');
      qtyInput.type = 'number';
      qtyInput.min = '1';
      qtyInput.value = String(device.quantity);
      qtyInput.style.cssText = 'width:50px;text-align:center;padding:4px 6px;font-size:0.8rem;';
      qtyInput.addEventListener('input', (e) => {
        updateDevice(device.id, 'quantity', parseInt(e.target.value) || 1);
      });
      qtyTd.appendChild(qtyInput);
      tr.appendChild(qtyTd);

      // Checks cell
      const checksTd = document.createElement('td');
      checksTd.style.textAlign = 'center';
      const checksInput = document.createElement('input');
      checksInput.type = 'number';
      checksInput.min = '1';
      checksInput.value = String(device.checksPerDevice);
      checksInput.style.cssText = 'width:60px;text-align:center;padding:4px 6px;font-size:0.8rem;';
      checksInput.addEventListener('input', (e) => {
        updateDevice(device.id, 'checksPerDevice', parseInt(e.target.value) || 1);
      });
      checksTd.appendChild(checksInput);
      tr.appendChild(checksTd);

      // Total cell
      const totalTd = document.createElement('td');
      totalTd.style.cssText = 'text-align:right;font-weight:600;color:var(--primary);font-size:0.85rem;';
      totalTd.textContent = String(device.totalChecks);
      tr.appendChild(totalTd);

      // Remove cell
      const removeTd = document.createElement('td');
      removeTd.style.textAlign = 'center';
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn-ghost btn-sm';
      removeBtn.style.cssText = 'color:var(--danger);padding:4px;';
      removeBtn.appendChild(createCloseIcon());
      removeBtn.addEventListener('click', () => removeDevice(device.id));
      removeTd.appendChild(removeBtn);
      tr.appendChild(removeTd);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    devicesArea.appendChild(table);
  }

  /** Render the summary footer in the right panel. */
  function renderSummaryFooter() {
    summaryFooter.innerHTML = '';

    const totalPoints = getTotalMeasurePoints();
    const devicePoints = getDeviceMeasurePoints();
    const distributions = getCalculatedDistributions();

    // --- License Type Selection (embedded mode with licenses) ---
    if (embedded && licenses.length > 0 && totalPoints > 0) {
      const licenseSection = document.createElement('div');
      licenseSection.style.marginBottom = '16px';

      // License type tags
      const tagSection = document.createElement('div');
      tagSection.style.marginBottom = '12px';

      const tagLabel = document.createElement('label');
      tagLabel.style.cssText = 'display:block;font-size:0.7rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;';
      tagLabel.textContent = 'License Types (click to select)';
      tagSection.appendChild(tagLabel);

      const tagBtns = document.createElement('div');
      tagBtns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

      MEASURE_POINT_LICENSE_CONFIGS.forEach(c => {
        const isSelected = selectedLicenseTypes.includes(c.prefix);
        const tagBtn = document.createElement('button');
        tagBtn.type = 'button';
        tagBtn.style.cssText = [
          'padding:6px 12px',
          'border-radius:6px',
          `border:2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
          `background:${isSelected ? 'var(--primary-light)' : 'var(--surface)'}`,
          `color:${isSelected ? 'var(--primary)' : 'var(--text-secondary)'}`,
          'cursor:pointer',
          'font-size:0.8rem',
          `font-weight:${isSelected ? '600' : '400'}`,
          'transition:all 0.15s',
          'display:flex',
          'align-items:center',
          'gap:6px',
        ].join(';') + ';';

        if (isSelected) {
          const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          checkSvg.setAttribute('fill', 'none');
          checkSvg.setAttribute('viewBox', '0 0 24 24');
          checkSvg.setAttribute('stroke-width', '2');
          checkSvg.setAttribute('stroke', 'currentColor');
          checkSvg.style.cssText = 'width:14px;height:14px;';
          const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          checkPath.setAttribute('stroke-linecap', 'round');
          checkPath.setAttribute('stroke-linejoin', 'round');
          checkPath.setAttribute('d', 'M4.5 12.75l6 6 9-13.5');
          checkSvg.appendChild(checkPath);
          tagBtn.appendChild(checkSvg);
        }

        const tagText = document.createTextNode(c.displayName);
        tagBtn.appendChild(tagText);

        tagBtn.addEventListener('click', () => {
          toggleLicenseType(c.prefix);
          renderSummaryFooter();
        });

        tagBtns.appendChild(tagBtn);
      });

      tagSection.appendChild(tagBtns);

      const tagHint = document.createElement('div');
      tagHint.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);margin-top:6px;';
      tagHint.textContent = `${selectedLicenseTypes.length} type(s) selected - licenses will be added for each`;
      tagSection.appendChild(tagHint);
      licenseSection.appendChild(tagSection);

      // License Distribution preview
      if (distributions.length > 0) {
        const distBox = document.createElement('div');
        distBox.style.cssText = 'padding:12px;background:var(--surface);border-radius:8px;border:1px solid var(--border);';

        const distTitle = document.createElement('div');
        distTitle.style.cssText = 'font-size:0.7rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;';
        const totalLicenses = distributions.reduce((s, d) => s + d.quantity, 0);
        distTitle.textContent = `License Distribution (${totalLicenses} total)`;
        distBox.appendChild(distTitle);

        distributions.forEach((dist, idx) => {
          const distRow = document.createElement('div');
          distRow.style.cssText = `display:flex;justify-content:space-between;padding:6px 0;${idx < distributions.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}`;

          const distLabel = document.createElement('span');
          distLabel.style.cssText = 'font-size:0.8rem;color:var(--text-main);';
          distLabel.textContent = `${dist.tierName}: ${dist.pointsCovered} pts`;

          const distQty = document.createElement('span');
          distQty.style.cssText = 'font-weight:600;color:var(--primary);';
          distQty.textContent = `\u00d7${dist.quantity}`;

          distRow.appendChild(distLabel);
          distRow.appendChild(distQty);
          distBox.appendChild(distRow);
        });

        licenseSection.appendChild(distBox);
      }

      summaryFooter.appendChild(licenseSection);
    }

    // --- Total row ---
    const totalRow = document.createElement('div');
    totalRow.className = 'flex justify-between items-center';

    const totalLeft = document.createElement('div');

    const totalLabel = document.createElement('div');
    totalLabel.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase;font-weight:600;';
    totalLabel.textContent = 'Total Measure Points';
    totalLeft.appendChild(totalLabel);

    const totalValue = document.createElement('div');
    totalValue.style.cssText = 'font-size:1.75rem;font-weight:700;color:var(--primary);';
    totalValue.textContent = totalPoints.toLocaleString();
    totalLeft.appendChild(totalValue);

    // Breakdown if both device and manual exist
    if (devicePoints > 0 && manualMeasurePoints > 0) {
      const breakdown = document.createElement('div');
      breakdown.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);';
      breakdown.textContent = `(${devicePoints.toLocaleString()} from devices + ${manualMeasurePoints.toLocaleString()} custom)`;
      totalLeft.appendChild(breakdown);
    }

    totalRow.appendChild(totalLeft);

    // --- Action buttons ---
    if (embedded && (onApplyLicenses || onApplyMeasurePoints)) {
      const actionBtns = document.createElement('div');
      actionBtns.className = 'flex gap-2';

      if (onClose) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', onClose);
        actionBtns.appendChild(cancelBtn);
      }

      const applyBtn = document.createElement('button');
      applyBtn.className = 'btn btn-primary';
      applyBtn.disabled = totalPoints === 0 || (onApplyLicenses && distributions.length === 0);

      if (onApplyLicenses && distributions.length > 0) {
        const totalLicenses = distributions.reduce((s, d) => s + d.quantity, 0);
        applyBtn.textContent = `Add ${totalLicenses} License(s)`;
      } else {
        applyBtn.textContent = `Apply ${totalPoints} Points`;
      }

      applyBtn.addEventListener('click', handleApply);
      actionBtns.appendChild(applyBtn);

      totalRow.appendChild(actionBtns);
    }

    if (!embedded) {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-primary';
      copyBtn.textContent = 'Copy Total';
      copyBtn.disabled = totalPoints === 0;
      copyBtn.addEventListener('click', async () => {
        const text = totalPoints.toString();
        if (navigator.clipboard?.writeText) {
          try { await navigator.clipboard.writeText(text); showToast('Measure points copied to clipboard', 'success'); return; } catch {}
        }
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;opacity:0;';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        showToast('Measure points copied to clipboard', 'success');
      });
      totalRow.appendChild(copyBtn);
    }

    summaryFooter.appendChild(totalRow);
  }

  // ============================
  // LOGIC FUNCTIONS
  // ============================

  /** Toggle a license type prefix on or off. */
  function toggleLicenseType(prefix) {
    if (selectedLicenseTypes.includes(prefix)) {
      // Must keep at least one
      if (selectedLicenseTypes.length === 1) return;
      selectedLicenseTypes = selectedLicenseTypes.filter(p => p !== prefix);
    } else {
      selectedLicenseTypes = [...selectedLicenseTypes, prefix];
    }
  }

  /** Handle the Apply button click. */
  function handleApply() {
    const totalPoints = getTotalMeasurePoints();
    const distributions = getCalculatedDistributions();

    if (onApplyLicenses && distributions.length > 0) {
      onApplyLicenses(distributions);
      const totalLicenses = distributions.reduce((s, d) => s + d.quantity, 0);
      showToast(`Applied ${totalLicenses} license(s) for ${totalPoints} measure points across ${selectedLicenseTypes.length} type(s)`, 'success');
    } else if (onApplyMeasurePoints) {
      onApplyMeasurePoints(totalPoints);
      showToast(`Applied ${totalPoints} measure points`, 'success');
    }
  }

  // ============================
  // INITIAL DATA LOAD
  // ============================

  async function loadTemplates() {
    loading = true;
    renderTemplateList();

    try {
      const res = await pb.collection('measurepoint_templates').getFullList({
        sort: 'name',
      });
      templates = res;
    } catch (e) {
      console.error('Error loading measure point templates:', e);
      showToast('Failed to load templates', 'error');
    }

    loading = false;
    renderFilterButtons();
    renderTemplateList();
    renderDevicesPanel();
    renderSummaryFooter();
  }

  loadTemplates();

  // ============================
  // CLEANUP
  // ============================

  function destroy() {
    container.innerHTML = '';
  }

  return { destroy, element: root };
}
