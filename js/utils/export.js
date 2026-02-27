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

  let grandTotal = 0;
  let grandMonthly = 0;

  visible.forEach(pItem => {
    if (pItem.type === 'header') {
      rows.push([`--- ${pItem.displayName || 'Section'} ---`, '', '', '', '', '', '', '', '']);
      return;
    }

    const r = resolvePresentationItem(pItem, config.lineItems, licenses);
    grandTotal += r.total;
    grandMonthly += r.monthly;

    rows.push([
      r.name,
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

  // Summary
  rows.push([]);
  rows.push(['', '', '', '', '', '', 'Total (VK):', grandTotal.toFixed(2), '']);
  rows.push(['', '', '', '', '', '', 'Monthly:', grandMonthly.toFixed(2), '']);

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
    ['Quote Export (Presentation)', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['Item Name', 'SKU', 'Unit Price', 'Quantity', 'Margin %', 'SLA %', 'Line Total (VK)', 'Monthly', 'Notes'],
  ];

  const visible = (presentationItems || [])
    .filter(i => !i.hidden)
    .sort((a, b) => a.order - b.order);

  const startRow = 4;
  let dataRowCount = 0;
  const dataRowIndices = []; // Excel row numbers for item rows (for summary formulas)

  visible.forEach(pItem => {
    const excelRow = startRow + dataRowCount;

    if (pItem.type === 'header') {
      wsData.push([`--- ${pItem.displayName || 'Section'} ---`, '', '', '', '', '', '', '', '']);
      dataRowCount++;
      return;
    }

    const r = resolvePresentationItem(pItem, config.lineItems, licenses);
    dataRowIndices.push(excelRow);

    wsData.push([
      r.name,
      r.sku,
      r.price,
      r.qty,
      r.margin,
      r.slaPct,
      { f: `C${excelRow}*D${excelRow}*(1+E${excelRow}/100)` },
      { f: `G${excelRow}*(F${excelRow}/100)` },
      r.note
    ]);
    dataRowCount++;
  });

  const lastDataRow = startRow + dataRowCount - 1;

  // Summary
  wsData.push([]);
  if (dataRowIndices.length > 0) {
    wsData.push(['', '', '', '', '', 'VK Total:', { f: `SUM(G${startRow}:G${lastDataRow})` }, '', '']);
    wsData.push(['', '', '', '', '', 'Monthly Total:', '', { f: `SUM(H${startRow}:H${lastDataRow})` }, '']);
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
