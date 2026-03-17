// Step 5: Summary — Final review with totals, copy table, export

import { currency } from '../../utils/format.js';
import { exportToJson, exportToCsv, exportToExcel } from '../../utils/export.js';
import { showToast } from '../../components/toast.js';
import { pb } from '../../api.js';

export function createStepSummary({ wizardState, hourlyRate, quoteId }) {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-direction:column;gap:16px;height:calc(100vh - 280px);min-height:400px;';

  let slas = [];
  let loading = true;

  async function loadSLAs() {
    try {
      slas = await pb.collection('service_level_agreements').getFullList();
    } catch (err) {
      console.error(err);
    }
    loading = false;
    render();
  }

  function computeTotals() {
    let hk = 0, vk = 0, monthly = 0;
    for (const item of wizardState.lineItems) {
      if (item.itemType === 'servicepack') {
        const itemHk = (item.hours || 0) * hourlyRate * item.amount;
        const itemVk = itemHk * (1 + (item.margin || 0) / 100);
        hk += itemHk;
        vk += itemVk;
      } else {
        const lineHk = item.price * item.amount;
        const lineVk = lineHk * (1 + (item.margin || 0) / 100);
        hk += lineHk;
        vk += lineVk;

        if (item.sla) {
          const sla = slas.find(s => s.id === item.sla);
          if (sla) {
            const svcHk = lineHk * (sla.monthly_percentage / 100);
            const svcVk = svcHk * (1 + (item.serviceMargin || 0) / 100);
            monthly += svcVk;
          }
        }
      }
    }
    return { hk, vk, monthly };
  }

  function generateTsv(headers, rows, keys) {
    const headerRow = headers.join('\t');
    const dataRows = rows.map(r => keys.map(k => r[k]).join('\t'));
    return [headerRow, ...dataRows].join('\n');
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch {}
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }

  async function copyTable(headers, rows, keys) {
    const tsv = generateTsv(headers, rows, keys);
    await copyToClipboard(tsv);
    showToast('Table copied to clipboard', 'success');
  }

  function render() {
    el.innerHTML = '';

    if (loading) {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);">Loading summary...</div>';
      return;
    }

    const { hk, vk, monthly } = computeTotals();

    // Header bar with totals + export actions
    const headerBar = document.createElement('div');
    headerBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 16px;flex-shrink:0;';

    const titleArea = document.createElement('div');
    const title = document.createElement('h4');
    title.style.cssText = 'margin:0;font-size:0.95rem;color:var(--text-main);';
    title.textContent = 'Final Summary & Export';
    titleArea.appendChild(title);
    const desc = document.createElement('p');
    desc.style.cssText = 'margin:2px 0 0;font-size:0.75rem;color:var(--text-secondary);';
    desc.textContent = 'Review all configured items and export.';
    titleArea.appendChild(desc);
    headerBar.appendChild(titleArea);

    // Totals + Export buttons
    const rightArea = document.createElement('div');
    rightArea.style.cssText = 'display:flex;align-items:center;gap:16px;';

    // Grand totals
    const totalsBox = document.createElement('div');
    totalsBox.style.cssText = 'display:flex;gap:16px;background:var(--bg);padding:8px 16px;border-radius:6px;border:1px solid var(--border);';
    const mkTotal = (label, value, color) => {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;flex-direction:column;text-align:right;';
      d.innerHTML = `<span style="font-size:0.6rem;text-transform:uppercase;font-weight:600;color:var(--text-secondary);">${label}</span>
        <span style="font-size:1rem;font-weight:700;color:${color};">${currency(value)}</span>`;
      return d;
    };
    totalsBox.appendChild(mkTotal('Total HK', hk, 'var(--text-main)'));
    const sep = document.createElement('div');
    sep.style.cssText = 'border-left:1px solid var(--border);';
    totalsBox.appendChild(sep);
    totalsBox.appendChild(mkTotal('Total VK', vk, 'var(--text-main)'));
    const sep2 = document.createElement('div');
    sep2.style.cssText = 'border-left:1px solid var(--border);';
    totalsBox.appendChild(sep2);
    totalsBox.appendChild(mkTotal('Monthly', monthly, 'var(--primary)'));
    rightArea.appendChild(totalsBox);

    // Export buttons
    const exportJson = document.createElement('button');
    exportJson.className = 'btn btn-sm btn-secondary';
    exportJson.textContent = 'Export JSON';
    exportJson.addEventListener('click', () => {
      const data = { lineItems: wizardState.lineItems, groups: wizardState.groups, summary: { hk, vk, monthly } };
      exportToJson(data, `quote_${quoteId || 'new'}`);
      showToast('Exported as JSON', 'success');
    });
    rightArea.appendChild(exportJson);

    headerBar.appendChild(rightArea);
    el.appendChild(headerBar);

    // Main panels: Technical BOM + Designed Quote
    const mainRow = document.createElement('div');
    mainRow.style.cssText = 'display:flex;gap:16px;flex:1;min-height:0;';

    // Left: Technical BOM
    const leftPanel = document.createElement('div');
    leftPanel.style.cssText = 'flex:1;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;';

    const leftHeader = document.createElement('div');
    leftHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0;';
    const leftTitle = document.createElement('h4');
    leftTitle.style.cssText = 'margin:0;font-size:0.9rem;color:var(--text-main);';
    leftTitle.textContent = 'Technical BoM (Internal)';
    leftHeader.appendChild(leftTitle);

    const copyBomBtn = document.createElement('button');
    copyBomBtn.className = 'btn btn-sm btn-secondary';
    copyBomBtn.textContent = 'Copy Table';
    copyBomBtn.addEventListener('click', () => {
      const headers = ['Type', 'SKU', 'Qty', 'SLA', 'Init HK', 'Init VK', 'Mo HK', 'Mo VK'];
      const keys = ['type', 'sku', 'qty', 'sla', 'initHk', 'initVk', 'moHk', 'moVk'];
      const rows = wizardState.lineItems.map(item => {
        const isLic = item.itemType !== 'servicepack';
        const lineHk = isLic ? item.price * item.amount : (item.hours || 0) * hourlyRate * item.amount;
        const lineVk = lineHk * (1 + (item.margin || 0) / 100);
        let moHk = 0, moVk = 0, slaName = 'N/A';
        if (isLic && item.sla) {
          const sla = slas.find(s => s.id === item.sla);
          if (sla) {
            slaName = sla.name;
            moHk = lineHk * (sla.monthly_percentage / 100);
            moVk = moHk * (1 + (item.serviceMargin || 0) / 100);
          }
        }
        return {
          type: isLic ? 'License' : 'Service',
          sku: item.sku || item.name,
          qty: item.amount,
          sla: slaName,
          initHk: lineHk.toFixed(2),
          initVk: lineVk.toFixed(2),
          moHk: moHk.toFixed(2),
          moVk: moVk.toFixed(2),
        };
      });
      copyTable(headers, rows, keys);
    });
    leftHeader.appendChild(copyBomBtn);
    leftPanel.appendChild(leftHeader);

    const leftScroll = document.createElement('div');
    leftScroll.style.cssText = 'flex:1;overflow:auto;';

    const bomTable = document.createElement('table');
    bomTable.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.8rem;white-space:nowrap;';
    bomTable.innerHTML = `<thead><tr style="background:var(--bg);position:sticky;top:0;z-index:1;">
      <th style="padding:6px 10px;text-align:left;font-size:0.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Type</th>
      <th style="padding:6px 10px;text-align:left;font-size:0.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">SKU/Service</th>
      <th style="padding:6px 10px;text-align:right;font-size:0.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Qty</th>
      <th style="padding:6px 10px;text-align:left;font-size:0.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">SLA</th>
      <th style="padding:6px 10px;text-align:right;font-size:0.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Init HK</th>
      <th style="padding:6px 10px;text-align:right;font-size:0.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Init VK</th>
      <th style="padding:6px 10px;text-align:right;font-size:0.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;color:var(--primary);">Mo HK</th>
      <th style="padding:6px 10px;text-align:right;font-size:0.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;color:var(--primary);">Mo VK</th>
    </tr></thead>`;

    const bomBody = document.createElement('tbody');
    if (wizardState.lineItems.length === 0) {
      bomBody.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--text-secondary);">No items configured.</td></tr>';
    } else {
      wizardState.lineItems.forEach(item => {
        const isLic = item.itemType !== 'servicepack';
        const lineHk = isLic ? item.price * item.amount : (item.hours || 0) * hourlyRate * item.amount;
        const lineVk = lineHk * (1 + (item.margin || 0) / 100);
        let moHk = 0, moVk = 0, slaName = isLic ? 'None' : 'N/A';
        if (isLic && item.sla) {
          const sla = slas.find(s => s.id === item.sla);
          if (sla) {
            slaName = sla.name;
            moHk = lineHk * (sla.monthly_percentage / 100);
            moVk = moHk * (1 + (item.serviceMargin || 0) / 100);
          }
        }

        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom:1px solid var(--border);';
        tr.addEventListener('mouseenter', () => { tr.style.background = 'var(--hover-bg)'; });
        tr.addEventListener('mouseleave', () => { tr.style.background = ''; });
        tr.innerHTML = `
          <td style="padding:6px 10px;">${isLic ? 'License' : 'Service'}</td>
          <td style="padding:6px 10px;font-weight:500;">${item.sku || item.name}</td>
          <td style="padding:6px 10px;text-align:right;">${item.amount}</td>
          <td style="padding:6px 10px;font-size:0.75rem;">${slaName}</td>
          <td style="padding:6px 10px;text-align:right;">${currency(lineHk)}</td>
          <td style="padding:6px 10px;text-align:right;">${currency(lineVk)}</td>
          <td style="padding:6px 10px;text-align:right;color:var(--primary);">${currency(moHk)}</td>
          <td style="padding:6px 10px;text-align:right;color:var(--primary);">${currency(moVk)}</td>
        `;
        bomBody.appendChild(tr);
      });
    }
    bomTable.appendChild(bomBody);
    leftScroll.appendChild(bomTable);
    leftPanel.appendChild(leftScroll);

    // BOM totals footer
    let totalMoHk = 0, totalMoVk = 0;
    wizardState.lineItems.forEach(item => {
      if (item.itemType !== 'servicepack' && item.sla) {
        const sla = slas.find(s => s.id === item.sla);
        if (sla) {
          const lineHk = item.price * item.amount;
          totalMoHk += lineHk * (sla.monthly_percentage / 100);
          totalMoVk += lineHk * (sla.monthly_percentage / 100) * (1 + (item.serviceMargin || 0) / 100);
        }
      }
    });

    const leftFooter = document.createElement('div');
    leftFooter.style.cssText = 'display:flex;gap:8px;padding:10px 16px;border-top:1px solid var(--border);background:var(--bg);flex-shrink:0;';
    leftFooter.innerHTML = `
      <div style="flex:1;background:var(--surface);padding:8px;border-radius:6px;border:1px solid var(--border);text-align:right;">
        <div style="font-size:0.6rem;text-transform:uppercase;font-weight:600;color:var(--text-secondary);">Total Init HK</div>
        <div style="font-weight:700;color:var(--text-main);">${currency(hk)}</div>
      </div>
      <div style="flex:1;background:var(--primary-light);padding:8px;border-radius:6px;border:1px solid var(--border);text-align:right;">
        <div style="font-size:0.6rem;text-transform:uppercase;font-weight:600;color:var(--primary);">Total Monthly VK</div>
        <div style="font-weight:700;color:var(--primary);">${currency(totalMoVk)}</div>
      </div>`;
    leftPanel.appendChild(leftFooter);
    mainRow.appendChild(leftPanel);

    // Right: Designed Quote
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = 'flex:1;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;';

    const rightHeader = document.createElement('div');
    rightHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0;';
    const rightTitle = document.createElement('h4');
    rightTitle.style.cssText = 'margin:0;font-size:0.9rem;color:var(--text-main);';
    rightTitle.textContent = 'Designed Quote (Customer)';
    rightHeader.appendChild(rightTitle);

    const copyQuoteBtn = document.createElement('button');
    copyQuoteBtn.className = 'btn btn-sm btn-secondary';
    copyQuoteBtn.textContent = 'Copy Table';
    copyQuoteBtn.addEventListener('click', () => {
      const headers = ['Group', 'Qty', 'Description', 'VK'];
      const keys = ['group', 'qty', 'description', 'vk'];
      const rows = [];
      for (const g of wizardState.groups) {
        for (const line of (g.lines || [])) {
          let lineVk = 0;
          for (const item of (line.items || [])) {
            lineVk += item.unitPrice * item.qty * (1 + (item.margin || 0) / 100);
          }
          rows.push({
            group: g.name,
            qty: line.amount || 1,
            description: line.text || 'Unnamed',
            vk: lineVk.toFixed(2),
          });
        }
      }
      copyTable(headers, rows, keys);
    });
    rightHeader.appendChild(copyQuoteBtn);
    rightPanel.appendChild(rightHeader);

    const rightScroll = document.createElement('div');
    rightScroll.style.cssText = 'flex:1;overflow:auto;';

    const quoteTable = document.createElement('table');
    quoteTable.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.8rem;white-space:nowrap;';
    quoteTable.innerHTML = `<thead><tr style="background:var(--bg);position:sticky;top:0;z-index:1;">
      <th style="padding:6px 10px;text-align:right;font-size:0.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;width:60px;">Qty</th>
      <th style="padding:6px 10px;text-align:left;font-size:0.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Description</th>
      <th style="padding:6px 10px;text-align:right;font-size:0.65rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">VK Total</th>
    </tr></thead>`;

    const quoteBody = document.createElement('tbody');
    const groups = wizardState.groups;

    if (groups.length === 0) {
      quoteBody.innerHTML = '<tr><td colspan="3" style="padding:24px;text-align:center;color:var(--text-secondary);">No quote groups designed. Complete Step 4.</td></tr>';
    } else {
      groups.forEach(g => {
        // Group header row
        let groupVk = 0;
        for (const line of (g.lines || [])) {
          for (const item of (line.items || [])) {
            groupVk += item.unitPrice * item.qty * (1 + (item.margin || 0) / 100);
          }
        }

        const headerTr = document.createElement('tr');
        headerTr.style.cssText = 'background:var(--bg);border-top:1px solid var(--border);';
        headerTr.innerHTML = `<td colspan="3" style="padding:8px 10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:700;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-main);">${g.name}</span>
            <span style="font-size:0.75rem;font-weight:500;color:var(--text-secondary);">Group VK: ${currency(groupVk)}</span>
          </div>
        </td>`;
        quoteBody.appendChild(headerTr);

        (g.lines || []).forEach(line => {
          let lineVk = 0;
          for (const item of (line.items || [])) {
            lineVk += item.unitPrice * item.qty * (1 + (item.margin || 0) / 100);
          }

          const tr = document.createElement('tr');
          tr.style.cssText = 'border-bottom:1px solid var(--border);';
          tr.addEventListener('mouseenter', () => { tr.style.background = 'var(--hover-bg)'; });
          tr.addEventListener('mouseleave', () => { tr.style.background = ''; });
          tr.innerHTML = `
            <td style="padding:6px 10px;text-align:right;font-weight:500;">${line.amount || 1}</td>
            <td style="padding:6px 10px;font-weight:500;">${line.text || 'Unnamed Item'}</td>
            <td style="padding:6px 10px;text-align:right;font-weight:600;">${currency(lineVk)}</td>
          `;
          quoteBody.appendChild(tr);
        });
      });
    }
    quoteTable.appendChild(quoteBody);
    rightScroll.appendChild(quoteTable);
    rightPanel.appendChild(rightScroll);

    // Quote totals footer
    let quoteVkTotal = 0;
    groups.forEach(g => {
      (g.lines || []).forEach(line => {
        (line.items || []).forEach(item => {
          quoteVkTotal += item.unitPrice * item.qty * (1 + (item.margin || 0) / 100);
        });
      });
    });

    const rightFooter = document.createElement('div');
    rightFooter.style.cssText = 'display:flex;gap:8px;padding:10px 16px;border-top:1px solid var(--border);background:var(--bg);flex-shrink:0;';
    rightFooter.innerHTML = `
      <div style="flex:1;background:var(--surface);padding:8px;border-radius:6px;border:1px solid var(--border);text-align:right;">
        <div style="font-size:0.6rem;text-transform:uppercase;font-weight:600;color:var(--text-secondary);">Total Quote VK</div>
        <div style="font-weight:700;color:var(--text-main);">${currency(quoteVkTotal)}</div>
      </div>
      <div style="flex:1;background:var(--primary-light);padding:8px;border-radius:6px;border:1px solid var(--border);text-align:right;">
        <div style="font-size:0.6rem;text-transform:uppercase;font-weight:600;color:var(--primary);">Total Monthly</div>
        <div style="font-weight:700;color:var(--primary);">${currency(monthly)}</div>
      </div>`;
    rightPanel.appendChild(rightFooter);
    mainRow.appendChild(rightPanel);
    el.appendChild(mainRow);
  }

  loadSLAs();
  return { element: el, refresh: render };
}
