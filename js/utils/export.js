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
