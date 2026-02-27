// Dashboard View — Modern SaaS Dashboard
// Fixed layout with useful KPIs and charts for CPQ business overview

import { pb } from '../api.js';
import { currency } from '../utils/format.js';

export function createDashboardView(container) {
  container.innerHTML = '';
  const charts = [];
  let data = { opportunities: [], quotes: [], installed_base: [] };
  let timeRange = 'all';
  let destroyed = false;

  loadAndRender();

  // ─── Data Loading ─────────────────────────────────────────────

  async function loadData() {
    const [opps, quotes, ib] = await Promise.all([
      pb.collection('opportunities').getFullList({ expand: 'customer' }).catch(() => []),
      pb.collection('quotes').getFullList().catch(() => []),
      pb.collection('installed_base').getFullList({ expand: 'customer,license' }).catch(() => []),
    ]);
    return { opportunities: opps, quotes, installed_base: ib };
  }

  function filterByTime(records, field = 'created') {
    if (timeRange === 'all') return records;
    const days = { '7d': 7, '30d': 30, '90d': 90, '6m': 180, '1y': 365 };
    const d = days[timeRange];
    if (!d) return records;
    const cutoff = Date.now() - d * 86400_000;
    return records.filter(r => new Date(r[field] || 0).getTime() >= cutoff);
  }

  async function loadAndRender() {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:60vh;color:var(--text-secondary);">Loading dashboard…</div>';
    data = await loadData();
    if (!destroyed) render();
  }

  // ─── Helpers ──────────────────────────────────────────────────

  function shortCurrency(v) {
    if (Math.abs(v) >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `€${(v / 1_000).toFixed(0)}k`;
    return `€${Math.round(v)}`;
  }

  function pct(a, b) { return b > 0 ? ((a / b) * 100).toFixed(1) : '0'; }

  function monthKey(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthLabel(key) {
    const [y, m] = key.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    return `${months[parseInt(m) - 1]} ${y.slice(2)}`;
  }

  // ─── Chart Theme ──────────────────────────────────────────────

  const COLORS = {
    primary: '#4f46e5',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#06b6d4',
    purple: '#8b5cf6',
    pink: '#ec4899',
    orange: '#f97316',
    palette: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#14b8a6'],
    status: {
      'NEW': '#4f46e5',
      'CALCULATED': '#3b82f6',
      'QUOTE SEND': '#06b6d4',
      'IN PROGRESS': '#f59e0b',
      'ORDERED': '#8b5cf6',
      'WON': '#10b981',
      'LOST': '#ef4444',
      'ON HOLD': '#9ca3af',
      'STORNO': '#6b7280',
    }
  };

  function chartDefaults() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleFont: { size: 12, weight: '500' },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 8,
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          boxPadding: 4,
        },
      },
    };
  }

  // ─── Destroy ──────────────────────────────────────────────────

  function destroyCharts() {
    charts.forEach(c => { try { c.destroy(); } catch (_) {} });
    charts.length = 0;
  }

  // ─── Render ───────────────────────────────────────────────────

  function render() {
    destroyCharts();
    container.innerHTML = '';

    const opps = filterByTime(data.opportunities);
    const quotes = filterByTime(data.quotes);
    const ib = data.installed_base; // installed base not time-filtered

    // ─── Page ─────────────────────────────────────────────────
    const page = el('div', 'dash-page');

    // Header
    const header = el('div', 'dash-header');
    const headerLeft = el('div');
    headerLeft.innerHTML = `<h1 class="dash-title">Dashboard</h1><p class="dash-subtitle">Business overview</p>`;

    const headerRight = el('div', 'dash-controls');
    const timeBtns = [
      { label: '7D', value: '7d' },
      { label: '30D', value: '30d' },
      { label: '90D', value: '90d' },
      { label: '6M', value: '6m' },
      { label: '1Y', value: '1y' },
      { label: 'All', value: 'all' },
    ];
    const btnGroup = el('div', 'dash-btn-group');
    timeBtns.forEach(t => {
      const btn = el('button', `dash-btn ${timeRange === t.value ? 'active' : ''}`);
      btn.textContent = t.label;
      btn.onclick = () => { timeRange = t.value; render(); };
      btnGroup.appendChild(btn);
    });
    headerRight.appendChild(btnGroup);
    header.appendChild(headerLeft);
    header.appendChild(headerRight);
    page.appendChild(header);

    // ─── KPI Cards ────────────────────────────────────────────
    const kpiRow = el('div', 'dash-kpi-row');

    const totalPipeline = opps.filter(o => !['WON', 'LOST', 'STORNO'].includes(o.status))
      .reduce((s, o) => s + (Number(o.capex) || 0), 0);
    const wonRevenue = opps.filter(o => o.status === 'WON')
      .reduce((s, o) => s + (Number(o.capex) || 0), 0);
    const mrr = opps.filter(o => !['LOST', 'STORNO'].includes(o.status))
      .reduce((s, o) => s + (Number(o.opex_monthly) || 0), 0);
    const wonCount = opps.filter(o => o.status === 'WON').length;
    const lostCount = opps.filter(o => o.status === 'LOST').length;
    const winRate = (wonCount + lostCount) > 0 ? ((wonCount / (wonCount + lostCount)) * 100).toFixed(0) : '—';
    const avgDeal = wonCount > 0 ? wonRevenue / wonCount : 0;

    kpiRow.appendChild(kpiCard('Pipeline Value', shortCurrency(totalPipeline), `${opps.filter(o => !['WON', 'LOST', 'STORNO'].includes(o.status)).length} open deals`, COLORS.primary));
    kpiRow.appendChild(kpiCard('Won Revenue', shortCurrency(wonRevenue), `${wonCount} deals closed`, COLORS.success));
    kpiRow.appendChild(kpiCard('Monthly Recurring', shortCurrency(mrr), 'Active contracts', COLORS.info));
    kpiRow.appendChild(kpiCard('Win Rate', `${winRate}%`, `${wonCount}W / ${lostCount}L`, COLORS.warning));
    kpiRow.appendChild(kpiCard('Avg Deal Size', shortCurrency(avgDeal), `From ${wonCount} won deals`, COLORS.purple));
    kpiRow.appendChild(kpiCard('Total Quotes', quotes.length.toString(), `Across all opportunities`, COLORS.pink));
    page.appendChild(kpiRow);

    // ─── Row 1: Pipeline by Status + Revenue Over Time ──────
    const row1 = el('div', 'dash-row');

    // Pipeline by Status (horizontal bar)
    const statusBox = chartCard('Pipeline by Status', 'span-7');
    const statusGroups = {};
    opps.forEach(o => {
      const s = o.status || 'Unknown';
      if (!statusGroups[s]) statusGroups[s] = { count: 0, capex: 0 };
      statusGroups[s].count++;
      statusGroups[s].capex += Number(o.capex) || 0;
    });
    const statusOrder = ['NEW', 'CALCULATED', 'QUOTE SEND', 'IN PROGRESS', 'ORDERED', 'WON', 'LOST', 'ON HOLD', 'STORNO'];
    const statusKeys = statusOrder.filter(s => statusGroups[s]);
    if (statusKeys.length > 0) {
      const canvas = el('canvas');
      statusBox.body.appendChild(canvas);
      const c = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: statusKeys,
          datasets: [{
            data: statusKeys.map(s => statusGroups[s].capex),
            backgroundColor: statusKeys.map(s => COLORS.status[s] || '#9ca3af'),
            borderRadius: 6,
            maxBarThickness: 36,
          }],
        },
        options: {
          ...chartDefaults(),
          indexAxis: 'y',
          scales: {
            x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => shortCurrency(v), font: { size: 11 } }, border: { display: false } },
            y: { grid: { display: false }, ticks: { font: { size: 11, weight: '500' } }, border: { display: false } },
          },
          plugins: {
            ...chartDefaults().plugins,
            tooltip: {
              ...chartDefaults().plugins.tooltip,
              callbacks: {
                label: ctx => ` ${currency(ctx.parsed.x)} (${statusGroups[statusKeys[ctx.dataIndex]].count} opps)`,
              },
            },
          },
        },
      });
      charts.push(c);
    } else {
      statusBox.body.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px;">No opportunities</p>';
    }
    row1.appendChild(statusBox.el);

    // Revenue Over Time (area chart)
    const revenueBox = chartCard('Revenue Over Time', 'span-5');
    const monthGroups = {};
    opps.forEach(o => {
      const k = monthKey(o.created);
      if (!monthGroups[k]) monthGroups[k] = { capex: 0, opex: 0 };
      monthGroups[k].capex += Number(o.capex) || 0;
      monthGroups[k].opex += Number(o.opex_monthly) || 0;
    });
    const monthKeys = Object.keys(monthGroups).sort();
    if (monthKeys.length > 0) {
      const canvas = el('canvas');
      revenueBox.body.appendChild(canvas);
      const c = new Chart(canvas, {
        type: 'line',
        data: {
          labels: monthKeys.map(k => monthLabel(k)),
          datasets: [
            {
              label: 'CAPEX',
              data: monthKeys.map(k => monthGroups[k].capex),
              borderColor: COLORS.primary,
              backgroundColor: COLORS.primary + '15',
              fill: true,
              tension: 0.35,
              pointRadius: 2,
              pointHoverRadius: 5,
              borderWidth: 2,
            },
            {
              label: 'OPEX (monthly)',
              data: monthKeys.map(k => monthGroups[k].opex),
              borderColor: COLORS.success,
              backgroundColor: COLORS.success + '15',
              fill: true,
              tension: 0.35,
              pointRadius: 2,
              pointHoverRadius: 5,
              borderWidth: 2,
            },
          ],
        },
        options: {
          ...chartDefaults(),
          plugins: {
            ...chartDefaults().plugins,
            legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { size: 11 } } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 } }, border: { display: false } },
            y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => shortCurrency(v), font: { size: 10 } }, border: { display: false }, beginAtZero: true },
          },
        },
      });
      charts.push(c);
    } else {
      revenueBox.body.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px;">No data</p>';
    }
    row1.appendChild(revenueBox.el);
    page.appendChild(row1);

    // ─── Row 2: Win/Loss Donut + Top Customers + Pipeline Funnel ──
    const row2 = el('div', 'dash-row');

    // Win/Loss Donut
    const winBox = chartCard('Win / Loss', 'span-3');
    const wlData = [wonCount, lostCount, opps.length - wonCount - lostCount];
    const wlLabels = ['Won', 'Lost', 'Open'];
    const wlColors = [COLORS.success, COLORS.danger, '#e2e8f0'];
    if (opps.length > 0) {
      const canvas = el('canvas');
      winBox.body.appendChild(canvas);
      const c = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: wlLabels,
          datasets: [{ data: wlData, backgroundColor: wlColors, borderWidth: 0, hoverOffset: 4 }],
        },
        options: {
          ...chartDefaults(),
          cutout: '70%',
          plugins: {
            ...chartDefaults().plugins,
            legend: { display: true, position: 'bottom', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, padding: 12, font: { size: 11 } } },
          },
        },
      });
      charts.push(c);
    }
    row2.appendChild(winBox.el);

    // Top Customers by Revenue
    const custBox = chartCard('Top Customers', 'span-4');
    const custGroups = {};
    opps.forEach(o => {
      const name = o.expand?.customer?.name || 'Unknown';
      if (!custGroups[name]) custGroups[name] = 0;
      custGroups[name] += Number(o.capex) || 0;
    });
    const topCust = Object.entries(custGroups).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (topCust.length > 0) {
      const canvas = el('canvas');
      custBox.body.appendChild(canvas);
      const c = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: topCust.map(([n]) => n.length > 18 ? n.slice(0, 18) + '…' : n),
          datasets: [{
            data: topCust.map(([, v]) => v),
            backgroundColor: COLORS.palette.slice(0, topCust.length),
            borderRadius: 4,
            maxBarThickness: 28,
          }],
        },
        options: {
          ...chartDefaults(),
          indexAxis: 'y',
          scales: {
            x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => shortCurrency(v), font: { size: 10 } }, border: { display: false } },
            y: { grid: { display: false }, ticks: { font: { size: 10 } }, border: { display: false } },
          },
        },
      });
      charts.push(c);
    }
    row2.appendChild(custBox.el);

    // Pipeline Funnel
    const funnelBox = chartCard('Pipeline Funnel', 'span-5');
    const funnelStages = ['NEW', 'CALCULATED', 'QUOTE SEND', 'IN PROGRESS', 'ORDERED', 'WON'];
    const funnelData = funnelStages.filter(s => statusGroups[s]).map(s => ({
      label: s, count: statusGroups[s].count, capex: statusGroups[s].capex, color: COLORS.status[s],
    }));
    if (funnelData.length > 0) {
      const funnelEl = el('div');
      funnelEl.style.cssText = 'display:flex;flex-direction:column;gap:6px;height:100%;justify-content:center;padding:4px 0;';
      const maxC = Math.max(...funnelData.map(f => f.count));
      funnelData.forEach(stage => {
        const row = el('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;';
        const lbl = el('div');
        lbl.style.cssText = 'width:90px;text-align:right;font-size:0.7rem;font-weight:500;color:var(--text-secondary);white-space:nowrap;';
        lbl.textContent = stage.label;
        const barOuter = el('div');
        barOuter.style.cssText = 'flex:1;height:26px;background:var(--border);border-radius:4px;overflow:hidden;position:relative;';
        const barInner = el('div');
        barInner.style.cssText = `width:${Math.max((stage.count / maxC) * 100, 3)}%;height:100%;background:${stage.color};border-radius:4px;transition:width 0.6s ease;`;
        const info = el('span');
        info.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:0.65rem;color:var(--text-secondary);font-weight:500;';
        info.textContent = `${stage.count} · ${shortCurrency(stage.capex)}`;
        barOuter.appendChild(barInner);
        barOuter.appendChild(info);
        row.appendChild(lbl);
        row.appendChild(barOuter);
        funnelEl.appendChild(row);
      });
      funnelBox.body.appendChild(funnelEl);
    }
    row2.appendChild(funnelBox.el);
    page.appendChild(row2);

    // ─── Row 3: CAPEX/OPEX by Module + Expiring Contracts ────
    const row3 = el('div', 'dash-row');

    // Quote Value Distribution (CAPEX distribution across quotes)
    const moduleBox = chartCard('Quote Value Distribution', 'span-5');
    const quoteValues = quotes.map(q => {
      const qd = typeof q.quote_data === 'string' ? JSON.parse(q.quote_data) : q.quote_data;
      return {
        capex: qd?.summary?.hk || 0,
        opex: qd?.summary?.monthly || 0,
        name: q.id,
      };
    }).filter(q => q.capex > 0 || q.opex > 0);

    if (quoteValues.length > 0) {
      const canvas = el('canvas');
      moduleBox.body.appendChild(canvas);
      // Show as scatter: CAPEX vs OPEX
      const c = new Chart(canvas, {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Quotes',
            data: quoteValues.map(q => ({ x: q.capex, y: q.opex })),
            backgroundColor: COLORS.primary + '60',
            borderColor: COLORS.primary,
            borderWidth: 1.5,
            pointRadius: 6,
            pointHoverRadius: 8,
          }],
        },
        options: {
          ...chartDefaults(),
          scales: {
            x: { title: { display: true, text: 'CAPEX (€)', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => shortCurrency(v), font: { size: 10 } }, border: { display: false } },
            y: { title: { display: true, text: 'Monthly (€)', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => shortCurrency(v), font: { size: 10 } }, border: { display: false }, beginAtZero: true },
          },
        },
      });
      charts.push(c);
    }
    row3.appendChild(moduleBox.el);

    // Expiring Contracts
    const expiryBox = chartCard('Expiring Contracts (next 12 months)', 'span-7');
    const expiryGroups = {};
    const now = new Date();
    const limit = new Date(); limit.setMonth(limit.getMonth() + 12);
    ib.forEach(item => {
      if (!item.support_start) return;
      const expiry = new Date(item.support_start);
      expiry.setMonth(expiry.getMonth() + (Number(item.contract_term) || 12));
      if (expiry < now || expiry > limit) return;
      const k = `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, '0')}`;
      if (!expiryGroups[k]) expiryGroups[k] = 0;
      expiryGroups[k]++;
    });
    const expiryKeys = Object.keys(expiryGroups).sort();
    if (expiryKeys.length > 0) {
      const canvas = el('canvas');
      expiryBox.body.appendChild(canvas);
      const c = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: expiryKeys.map(k => monthLabel(k)),
          datasets: [{
            data: expiryKeys.map(k => expiryGroups[k]),
            backgroundColor: expiryKeys.map((_, i) => {
              const r = i / expiryKeys.length;
              return r < 0.3 ? COLORS.danger + 'cc' : r < 0.6 ? COLORS.warning + 'cc' : COLORS.success + 'cc';
            }),
            borderRadius: 6,
            maxBarThickness: 32,
          }],
        },
        options: {
          ...chartDefaults(),
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 } }, border: { display: false } },
            y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { stepSize: 1, font: { size: 10 } }, border: { display: false }, beginAtZero: true },
          },
        },
      });
      charts.push(c);
    } else {
      expiryBox.body.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px;">No expiring contracts</p>';
    }
    row3.appendChild(expiryBox.el);
    page.appendChild(row3);

    // ─── Row 4: Recent Activity ─────────────────────────────
    const row4 = el('div', 'dash-row');
    const activityBox = chartCard('Recent Opportunities', 'span-12');
    activityBox.body.style.height = 'auto';
    activityBox.body.style.maxHeight = '280px';
    activityBox.body.style.overflowY = 'auto';

    const recentOpps = [...opps].sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, 10);
    if (recentOpps.length > 0) {
      const table = el('table', 'dash-activity-table');
      table.innerHTML = `<thead><tr><th>Title</th><th>Customer</th><th>Status</th><th style="text-align:right">CAPEX</th><th style="text-align:right">OPEX/mo</th><th>Created</th></tr></thead>`;
      const tbody = el('tbody');
      recentOpps.forEach(o => {
        const tr = el('tr');
        const statusColor = COLORS.status[o.status] || '#9ca3af';
        tr.innerHTML = `
          <td style="font-weight:500;">${o.title || `#${o.opportunity}`}</td>
          <td style="color:var(--text-secondary)">${o.expand?.customer?.name || '—'}</td>
          <td><span class="dash-status-badge" style="background:${statusColor}15;color:${statusColor};border:1px solid ${statusColor}30;">${o.status}</span></td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;">${currency(Number(o.capex) || 0)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;">${currency(Number(o.opex_monthly) || 0)}</td>
          <td style="color:var(--text-secondary);font-size:0.8rem;">${new Date(o.created).toLocaleDateString('de-DE')}</td>`;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      activityBox.body.appendChild(table);
    }
    row4.appendChild(activityBox.el);
    page.appendChild(row4);

    container.appendChild(page);
  }

  // ─── DOM Helpers ──────────────────────────────────────────────

  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function kpiCard(title, value, subtitle, color) {
    const card = el('div', 'dash-kpi');
    card.innerHTML = `
      <div class="dash-kpi-accent" style="background:${color}"></div>
      <div class="dash-kpi-content">
        <div class="dash-kpi-label">${title}</div>
        <div class="dash-kpi-value">${value}</div>
        <div class="dash-kpi-sub">${subtitle}</div>
      </div>`;
    return card;
  }

  function chartCard(title, spanClass) {
    const card = el('div', `dash-chart-card ${spanClass || ''}`);
    const header = el('div', 'dash-chart-header');
    header.innerHTML = `<h3>${title}</h3>`;
    const body = el('div', 'dash-chart-body');
    card.appendChild(header);
    card.appendChild(body);
    return { el: card, body };
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  return {
    destroy() {
      destroyed = true;
      destroyCharts();
      container.innerHTML = '';
    },
  };
}
