// Export utilities - ported from React's exportUtils.ts
// For Excel export, XLSX (SheetJS) is loaded globally via CDN.

/**
 * Download a Blob as a file via a temporary anchor element.
 *
 * @param {Blob} blob
 * @param {string} filename
 */
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Export quote config as a JSON file.
 *
 * @param {Object} config - The quote configuration object
 * @param {string} [filename='quote'] - Base filename (without extension)
 */
export const exportToJson = (config, filename = 'quote') => {
  const dataStr = JSON.stringify(config, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  downloadBlob(blob, `${filename}.json`);
};

/**
 * Export quote config as a CSV file (semicolon-delimited, UTF-8 BOM).
 *
 * @param {Object} config - The quote configuration object with lineItems and summary
 * @param {Array} licenses - Array of license objects for SLA lookups
 * @param {string} [filename='quote'] - Base filename (without extension)
 */
export const exportToCsv = (config, licenses, filename = 'quote') => {
  const headers = ['Item Name', 'SKU', 'Unit Price', 'Quantity', 'Margin %', 'SLA', 'Line Total (VK)', 'Monthly'];

  const rows = config.lineItems.map(item => {
    const lic = licenses.find(l => l.id === item.licenseId);
    const sla = lic?.expand?.possible_SLAs?.find(s => s.id === item.sla);
    const slaPct = sla ? sla.monthly_percentage : 0;
    const lineVk = (item.price * item.amount) * (1 + item.margin / 100);
    const monthly = lineVk * (slaPct / 100);

    return [
      item.name,
      item.sku,
      item.price.toFixed(2),
      item.amount,
      item.margin.toFixed(2),
      sla?.name || 'None',
      lineVk.toFixed(2),
      monthly.toFixed(2),
    ];
  });

  // Add summary rows
  rows.push([]);
  rows.push(['', '', '', '', '', 'HK Total:', config.summary.hk.toFixed(2), '']);
  rows.push(['', '', '', '', '', 'VK Total:', config.summary.vk.toFixed(2), '']);
  rows.push(['', '', '', '', '', 'Monthly Total:', '', config.summary.monthly.toFixed(2)]);

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.join(';')),
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${filename}.csv`);
};

/**
 * Export quote config as an Excel (.xlsx) file with formulas.
 * Uses the globally loaded XLSX (SheetJS) from CDN.
 *
 * @param {Object} config - The quote configuration object with lineItems and summary
 * @param {Array} licenses - Array of license objects for SLA lookups
 * @param {string} [filename='quote'] - Base filename (without extension)
 */
export const exportToExcel = (config, licenses, filename = 'quote') => {
  const XLSX = window.XLSX;

  if (!XLSX) {
    console.error('SheetJS (XLSX) is not loaded. Include the CDN script before using exportToExcel.');
    return;
  }

  const wb = XLSX.utils.book_new();

  // Prepare data with formulas
  const wsData = [
    ['Quote Export', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['Item Name', 'SKU', 'Unit Price', 'Quantity', 'Margin %', 'SLA %', 'Line Total (VK)', 'Monthly'],
  ];

  const startRow = 4; // Excel rows are 1-indexed, data starts at row 4

  config.lineItems.forEach((item, idx) => {
    const lic = licenses.find(l => l.id === item.licenseId);
    const sla = lic?.expand?.possible_SLAs?.find(s => s.id === item.sla);
    const slaPct = sla ? sla.monthly_percentage : 0;
    const row = startRow + idx;

    wsData.push([
      item.name,
      item.sku,
      item.price,
      item.amount,
      item.margin,
      slaPct,
      { f: `C${row}*D${row}*(1+E${row}/100)` }, // VK formula
      { f: `G${row}*(F${row}/100)` },             // Monthly formula
    ]);
  });

  const lastDataRow = startRow + config.lineItems.length - 1;

  // Empty row
  wsData.push([]);

  // Summary section
  wsData.push(['', '', '', '', '', 'HK Total:', { f: `SUMPRODUCT(C${startRow}:C${lastDataRow},D${startRow}:D${lastDataRow})` }, '']);
  wsData.push(['', '', '', '', '', 'VK Total:', { f: `SUM(G${startRow}:G${lastDataRow})` }, '']);
  wsData.push(['', '', '', '', '', 'Monthly Total:', '', { f: `SUM(H${startRow}:H${lastDataRow})` }]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 30 }, // Item Name
    { wch: 20 }, // SKU
    { wch: 12 }, // Unit Price
    { wch: 10 }, // Quantity
    { wch: 10 }, // Margin %
    { wch: 10 }, // SLA %
    { wch: 15 }, // Line Total
    { wch: 15 }, // Monthly
  ];

  // Style the header (merge title cell)
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];

  XLSX.utils.book_append_sheet(wb, ws, 'Quote');
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

// =========================================================================
// Presentation Export Functions
// Work from presentationItems instead of raw lineItems
// =========================================================================

/**
 * Helper: resolve presentation item display values for export.
 */
function resolvePresentationItem(pItem, lineItems, licenses) {
  const sources = (pItem.sourceIndices || []).map(i => lineItems[i]).filter(Boolean);

  const name = pItem.displayName != null ? pItem.displayName : (sources[0]?.name || '');
  const sku = sources.length === 1 ? (sources[0]?.sku || '') : sources.map(s => s.sku).filter(Boolean).join(', ');
  const qty = pItem.displayQty != null ? pItem.displayQty : sources.reduce((s, i) => s + i.amount, 0);
  const price = pItem.displayPrice != null ? pItem.displayPrice : (sources.length > 0 ? sources.reduce((s, i) => s + i.price, 0) / sources.length : 0);
  const margin = pItem.displayMargin != null ? pItem.displayMargin : (sources[0]?.margin || 0);
  const total = price * qty * (1 + margin / 100);

  // SLA: find max monthly_percentage from sources
  let slaPct = 0;
  let slaName = 'None';
  sources.forEach(src => {
    if (src.itemType === 'servicepack') return;
    const lic = licenses.find(l => l.id === src.licenseId);
    const sla = lic?.expand?.possible_SLAs?.find(s => s.id === src.sla);
    if (sla && sla.monthly_percentage > slaPct) {
      slaPct = sla.monthly_percentage;
      slaName = sla.name;
    }
  });
  const monthly = slaPct > 0 ? total * (slaPct / 100) : 0;

  return { name, sku, qty, price, margin, total, monthly, slaPct, slaName, note: pItem.note || '' };
}

/**
 * Export presentation items as CSV.
 *
 * @param {Array}  presentationItems - Array of presentationItem objects
 * @param {Object} config            - Config with lineItems
 * @param {Array}  licenses          - License objects
 * @param {string} [filename='quote']
 */
export const exportPresentationToCsv = (presentationItems, config, licenses, filename = 'quote') => {
  const headers = ['Item Name', 'SKU', 'Unit Price', 'Quantity', 'Margin %', 'SLA', 'Line Total (VK)', 'Monthly', 'Notes'];
  const rows = [];

  const visible = (presentationItems || [])
    .filter(i => !i.hidden)
    .sort((a, b) => a.order - b.order);

  // Build sections using groupId
  const headerMap = new Map();
  visible.filter(i => i.type === 'header').forEach(h => headerMap.set(h.id, { header: h, items: [] }));

  const ungrouped = [];
  visible.forEach(item => {
    if (item.type === 'header') return;
    if (item.groupId && headerMap.has(item.groupId)) {
      headerMap.get(item.groupId).items.push(item);
    } else {
      ungrouped.push(item);
    }
  });

  // Build sections in display order
  const sections = [];
  let ungroupedRun = [];
  visible.forEach(item => {
    if (item.type === 'header') {
      if (ungroupedRun.length > 0) { sections.push({ header: null, items: ungroupedRun }); ungroupedRun = []; }
      sections.push(headerMap.get(item.id));
    } else if (!item.groupId || !headerMap.has(item.groupId)) {
      ungroupedRun.push(item);
    }
  });
  if (ungroupedRun.length > 0) sections.push({ header: null, items: ungroupedRun });

  let grandTotal = 0;
  let grandMonthly = 0;

  sections.forEach(section => {
    if (section.header) {
      rows.push([section.header.displayName?.toUpperCase() || 'SECTION', '', '', '', '', '', '', '', '']);
    }

    let sectionTotal = 0;
    let sectionMonthly = 0;

    section.items.forEach(pItem => {
      const r = resolvePresentationItem(pItem, config.lineItems, licenses);
      grandTotal += r.total;
      grandMonthly += r.monthly;
      sectionTotal += r.total;
      sectionMonthly += r.monthly;
      const indent = section.header ? '  ' : '';

      rows.push([
        indent + r.name,
        r.sku,
        r.price.toFixed(2),
        r.qty,
        r.margin.toFixed(2),
        r.slaName,
        r.total.toFixed(2),
        r.monthly.toFixed(2),
        r.note
      ]);
    });

    if (section.header && section.items.length > 0) {
      rows.push(['', '', '', '', '', `Subtotal ${section.header.displayName || ''}:`, sectionTotal.toFixed(2), sectionMonthly.toFixed(2), '']);
      rows.push([]);
    }
  });

  // Grand total
  rows.push([]);
  rows.push(['', '', '', '', '', 'GRAND TOTAL (VK):', grandTotal.toFixed(2), '', '']);
  rows.push(['', '', '', '', '', 'GRAND TOTAL Monthly:', '', grandMonthly.toFixed(2), '']);

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.join(';'))
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${filename}.csv`);
};

/**
 * Export presentation items as Excel (.xlsx).
 *
 * @param {Array}  presentationItems - Array of presentationItem objects
 * @param {Object} config            - Config with lineItems
 * @param {Array}  licenses          - License objects
 * @param {string} [filename='quote']
 */
export const exportPresentationToExcel = (presentationItems, config, licenses, filename = 'quote') => {
  const XLSX = window.XLSX;
  if (!XLSX) {
    console.error('SheetJS (XLSX) is not loaded.');
    return;
  }

  const wb = XLSX.utils.book_new();
  const wsData = [
    ['Quote Export', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['Item Name', 'SKU', 'Unit Price', 'Quantity', 'Margin %', 'SLA %', 'Line Total (VK)', 'Monthly', 'Notes'],
  ];

  const visible = (presentationItems || [])
    .filter(i => !i.hidden)
    .sort((a, b) => a.order - b.order);

  // Build sections using groupId
  const headerMap = new Map();
  visible.filter(i => i.type === 'header').forEach(h => headerMap.set(h.id, { header: h, items: [] }));
  const ungroupedItems = [];
  visible.forEach(item => {
    if (item.type === 'header') return;
    if (item.groupId && headerMap.has(item.groupId)) {
      headerMap.get(item.groupId).items.push(item);
    } else {
      ungroupedItems.push(item);
    }
  });
  const sections = [];
  let ungroupedRun = [];
  visible.forEach(item => {
    if (item.type === 'header') {
      if (ungroupedRun.length > 0) { sections.push({ header: null, items: ungroupedRun }); ungroupedRun = []; }
      sections.push(headerMap.get(item.id));
    } else if (!item.groupId || !headerMap.has(item.groupId)) {
      ungroupedRun.push(item);
    }
  });
  if (ungroupedRun.length > 0) sections.push({ header: null, items: ungroupedRun });

  const startRow = 4;
  let dataRowCount = 0;
  const dataRowIndices = [];

  sections.forEach(section => {
    if (section.header) {
      if (dataRowCount > 0) { wsData.push([]); dataRowCount++; }
      wsData.push([section.header.displayName || 'Section', '', '', '', '', '', '', '', '']);
      dataRowCount++;
    }

    const sectionItemRows = [];
    section.items.forEach(pItem => {
      const r = resolvePresentationItem(pItem, config.lineItems, licenses);
      const curRow = startRow + dataRowCount;
      dataRowIndices.push(curRow);
      sectionItemRows.push(curRow);
      const indent = section.header ? '    ' : '';

      wsData.push([
        indent + r.name,
        r.sku,
        r.price,
        r.qty,
        r.margin,
        r.slaPct,
        { f: `C${curRow}*D${curRow}*(1+E${curRow}/100)` },
        { f: `G${curRow}*(F${curRow}/100)` },
        r.note
      ]);
      dataRowCount++;
    });

    if (section.header && sectionItemRows.length > 0) {
      const excelRow = startRow + dataRowCount;
      const vkFormula = sectionItemRows.map(r => `G${r}`).join('+');
      const moFormula = sectionItemRows.map(r => `H${r}`).join('+');
      wsData.push(['', '', '', '', '', `Subtotal ${section.header.displayName || ''}:`, { f: vkFormula }, { f: moFormula }, '']);
      dataRowCount++;
    }
  });

  // Grand total
  wsData.push([]);
  if (dataRowIndices.length > 0) {
    const vkFormula = dataRowIndices.map(r => `G${r}`).join('+');
    const moFormula = dataRowIndices.map(r => `H${r}`).join('+');
    wsData.push(['', '', '', '', '', 'GRAND TOTAL (VK):', { f: vkFormula }, '', '']);
    wsData.push(['', '', '', '', '', 'Monthly Total:', '', { f: moFormula }, '']);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 35 }, // Item Name
    { wch: 20 }, // SKU
    { wch: 12 }, // Unit Price
    { wch: 10 }, // Quantity
    { wch: 10 }, // Margin %
    { wch: 10 }, // SLA %
    { wch: 15 }, // Line Total
    { wch: 15 }, // Monthly
    { wch: 25 }, // Notes
  ];

  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];

  XLSX.utils.book_append_sheet(wb, ws, 'Quote');
  XLSX.writeFile(wb, `${filename}.xlsx`);
};
