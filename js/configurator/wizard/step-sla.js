// Step 2: SLA — Assign SLAs and service margins per item

import { currency } from '../../utils/format.js';
import { pb } from '../../api.js';

export function createStepSla({ wizardState, onStateChange }) {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-direction:column;gap:16px;height:calc(100vh - 280px);min-height:400px;';

  let slas = [];
  let loading = true;
  let globalSlaId = '';
  let globalServiceMargin = 20;

  async function loadSLAs() {
    try {
      slas = await pb.collection('service_level_agreements').getFullList({ sort: 'monthly_percentage' });
    } catch (err) {
      console.error('Failed to load SLAs:', err);
    }
    loading = false;
    render();
  }

  function applyGlobalSla() {
    if (!globalSlaId) return;
    const sla = slas.find(s => s.id === globalSlaId);
    wizardState.lineItems.forEach(item => {
      if (item.itemType === 'servicepack') return;
      item.sla = globalSlaId;
      item.slaName = sla?.name || '';
      item.slaMonthly = sla?.monthly_percentage || 0;
      item.serviceMargin = globalServiceMargin;
    });
    onStateChange();
    render();
  }

  function computeServiceTotals() {
    let hk = 0, vk = 0;
    for (const item of wizardState.lineItems) {
      if (item.itemType === 'servicepack' || !item.sla) continue;
      const sla = slas.find(s => s.id === item.sla);
      if (!sla) continue;
      const hwHk = item.price * item.amount;
      const svcHk = hwHk * (sla.monthly_percentage / 100);
      const svcVk = svcHk * (1 + (item.serviceMargin || 0) / 100);
      hk += svcHk;
      vk += svcVk;
    }
    return { hk, vk };
  }

  function render() {
    el.innerHTML = '';

    if (loading) {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);">Loading SLA data...</div>';
      return;
    }

    const licenseItems = wizardState.lineItems.filter(l => l.itemType !== 'servicepack');

    if (licenseItems.length === 0) {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:0.9rem;">No configuration items. Complete Step 1 first.</div>';
      return;
    }

    // Top bar: Global allocation + Service totals
    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex;gap:16px;flex-shrink:0;';

    // Global Allocation card
    const globalCard = document.createElement('div');
    globalCard.className = 'card';
    globalCard.style.cssText = 'flex:1;padding:16px;display:flex;flex-direction:column;gap:12px;';

    const globalTitle = document.createElement('h4');
    globalTitle.style.cssText = 'margin:0;font-size:0.95rem;color:var(--text-main);';
    globalTitle.textContent = 'Global SLA Allocation';
    globalCard.appendChild(globalTitle);

    const globalControls = document.createElement('div');
    globalControls.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';

    const slaSelect = document.createElement('select');
    slaSelect.style.cssText = 'flex:1;min-width:180px;padding:6px 8px;border:1px solid var(--border);border-radius:4px;font-size:0.85rem;background:var(--surface);color:var(--text-main);';
    slaSelect.innerHTML = '<option value="">Select SLA...</option>' +
      slas.map(s => `<option value="${s.id}">${s.name} (${s.monthly_percentage}%)</option>`).join('');
    slaSelect.value = globalSlaId;
    slaSelect.addEventListener('change', e => { globalSlaId = e.target.value; });
    globalControls.appendChild(slaSelect);

    const marginLabel = document.createElement('label');
    marginLabel.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;';
    marginLabel.textContent = 'Svc Margin %';
    globalControls.appendChild(marginLabel);

    const marginInput = document.createElement('input');
    marginInput.type = 'number';
    marginInput.value = globalServiceMargin;
    marginInput.style.cssText = 'width:60px;text-align:right;padding:6px;border:1px solid var(--border);border-radius:4px;font-size:0.85rem;background:var(--surface);color:var(--text-main);';
    marginInput.addEventListener('change', e => { globalServiceMargin = parseFloat(e.target.value) || 0; });
    globalControls.appendChild(marginInput);

    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn btn-primary btn-sm';
    applyBtn.textContent = 'Apply to All';
    applyBtn.addEventListener('click', applyGlobalSla);
    globalControls.appendChild(applyBtn);
    globalCard.appendChild(globalControls);
    topBar.appendChild(globalCard);

    // Service totals card
    const { hk, vk } = computeServiceTotals();
    const totalsCard = document.createElement('div');
    totalsCard.className = 'card';
    totalsCard.style.cssText = 'width:300px;padding:16px;display:flex;flex-direction:column;gap:8px;';

    const totalsTitle = document.createElement('h4');
    totalsTitle.style.cssText = 'margin:0;font-size:0.95rem;color:var(--text-main);';
    totalsTitle.textContent = 'Monthly Service Total';
    totalsCard.appendChild(totalsTitle);

    const totalsRow = document.createElement('div');
    totalsRow.style.cssText = 'display:flex;gap:12px;flex:1;';

    const mkTotalBox = (label, value, accent) => {
      const box = document.createElement('div');
      box.style.cssText = `flex:1;background:${accent ? 'var(--primary-light)' : 'var(--bg)'};border:1px solid var(--border);border-radius:6px;padding:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;`;
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:0.6rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;color:var(--text-secondary);';
      lbl.textContent = label;
      box.appendChild(lbl);
      const val = document.createElement('span');
      val.style.cssText = `font-size:1.1rem;font-weight:700;color:${accent ? 'var(--primary)' : 'var(--text-main)'};`;
      val.textContent = currency(value);
      box.appendChild(val);
      return box;
    };

    totalsRow.appendChild(mkTotalBox('Svc HK/mo', hk, false));
    totalsRow.appendChild(mkTotalBox('Svc VK/mo', vk, true));
    totalsCard.appendChild(totalsRow);
    topBar.appendChild(totalsCard);
    el.appendChild(topBar);

    // Items table
    const tableCard = document.createElement('div');
    tableCard.style.cssText = 'flex:1;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;display:flex;flex-direction:column;';

    const tableWrap = document.createElement('div');
    tableWrap.style.cssText = 'flex:1;overflow:auto;';

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.85rem;min-width:800px;';

    const thead = document.createElement('thead');
    thead.innerHTML = `<tr style="background:var(--bg);position:sticky;top:0;z-index:1;">
      <th style="padding:8px 12px;text-align:left;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">SKU</th>
      <th style="padding:8px 6px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Qty</th>
      <th style="padding:8px 12px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Init HK</th>
      <th style="padding:8px 12px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Init VK</th>
      <th style="padding:8px 12px;text-align:left;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Assigned SLA</th>
      <th style="padding:8px 6px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">Svc Margin %</th>
      <th style="padding:8px 12px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;color:var(--primary);">Svc HK/mo</th>
      <th style="padding:8px 12px;text-align:right;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);font-weight:600;color:var(--primary);">Svc VK/mo</th>
    </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    licenseItems.forEach(item => {
      const realIdx = wizardState.lineItems.indexOf(item);
      const initHk = item.price * item.amount;
      const initVk = initHk * (1 + (item.margin || 0) / 100);
      const appliedSla = slas.find(s => s.id === item.sla);
      const svcHk = appliedSla ? initHk * (appliedSla.monthly_percentage / 100) : 0;
      const svcVk = appliedSla ? svcHk * (1 + (item.serviceMargin || 0) / 100) : 0;

      const tr = document.createElement('tr');
      tr.style.cssText = 'border-bottom:1px solid var(--border);';
      tr.addEventListener('mouseenter', () => { tr.style.background = 'var(--hover-bg)'; });
      tr.addEventListener('mouseleave', () => { tr.style.background = ''; });

      // SKU
      const tdSku = document.createElement('td');
      tdSku.style.cssText = 'padding:8px 12px;font-weight:500;font-size:0.85rem;';
      tdSku.textContent = item.sku;
      tdSku.title = item.name;
      tr.appendChild(tdSku);

      // Qty
      const tdQty = document.createElement('td');
      tdQty.style.cssText = 'padding:8px 6px;text-align:right;color:var(--text-secondary);';
      tdQty.textContent = item.amount;
      tr.appendChild(tdQty);

      // Init HK
      const tdInitHk = document.createElement('td');
      tdInitHk.style.cssText = 'padding:8px 12px;text-align:right;color:var(--text-secondary);';
      tdInitHk.textContent = currency(initHk);
      tr.appendChild(tdInitHk);

      // Init VK
      const tdInitVk = document.createElement('td');
      tdInitVk.style.cssText = 'padding:8px 12px;text-align:right;color:var(--text-secondary);';
      tdInitVk.textContent = currency(initVk);
      tr.appendChild(tdInitVk);

      // SLA Select
      const tdSla = document.createElement('td');
      tdSla.style.cssText = 'padding:8px 6px;';
      const itemSlaSelect = document.createElement('select');
      itemSlaSelect.style.cssText = 'width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:0.8rem;background:var(--surface);color:var(--text-main);';
      itemSlaSelect.innerHTML = '<option value="">None</option>' +
        slas.map(s => `<option value="${s.id}">${s.name} (${s.monthly_percentage}%)</option>`).join('');
      itemSlaSelect.value = item.sla || '';
      itemSlaSelect.addEventListener('change', e => {
        const sla = slas.find(s => s.id === e.target.value);
        wizardState.lineItems[realIdx].sla = e.target.value;
        wizardState.lineItems[realIdx].slaName = sla?.name || '';
        wizardState.lineItems[realIdx].slaMonthly = sla?.monthly_percentage || 0;
        onStateChange();
        render();
      });
      tdSla.appendChild(itemSlaSelect);
      tr.appendChild(tdSla);

      // Service Margin
      const tdSvcMargin = document.createElement('td');
      tdSvcMargin.style.cssText = 'padding:8px 6px;';
      const svcMarginInput = document.createElement('input');
      svcMarginInput.type = 'number';
      svcMarginInput.step = '0.1';
      svcMarginInput.value = item.serviceMargin || 0;
      svcMarginInput.style.cssText = 'width:60px;text-align:right;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:0.8rem;background:var(--surface);color:var(--text-main);';
      svcMarginInput.addEventListener('change', e => {
        wizardState.lineItems[realIdx].serviceMargin = parseFloat(e.target.value) || 0;
        onStateChange();
        render();
      });
      tdSvcMargin.appendChild(svcMarginInput);
      tr.appendChild(tdSvcMargin);

      // Svc HK
      const tdSvcHk = document.createElement('td');
      tdSvcHk.style.cssText = 'padding:8px 12px;text-align:right;color:var(--primary);font-weight:500;';
      tdSvcHk.textContent = currency(svcHk);
      tr.appendChild(tdSvcHk);

      // Svc VK
      const tdSvcVk = document.createElement('td');
      tdSvcVk.style.cssText = 'padding:8px 12px;text-align:right;color:var(--primary);font-weight:500;';
      tdSvcVk.textContent = currency(svcVk);
      tr.appendChild(tdSvcVk);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    tableCard.appendChild(tableWrap);
    el.appendChild(tableCard);
  }

  loadSLAs();
  return { element: el, refresh: render };
}
