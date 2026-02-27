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

  // Monochromatic indigo palette — shades, tints, and opacities of the primary
  const COLORS = {
    primary: '#4f46e5',
    // Shades from dark to light
    indigo900: '#312e81',
    indigo800: '#3730a3',
    indigo700: '#4338ca',
    indigo600: '#4f46e5',
    indigo500: '#6366f1',
    indigo400: '#818cf8',
    indigo300: '#a5b4fc',
    indigo200: '#c7d2fe',
    indigo100: '#e0e7ff',
    indigo50:  '#eef2ff',
    // Semantic — all mapped to indigo range + a couple accent neutrals
    success: '#4f46e5',   // won = strong primary
    danger:  '#a5b4fc',   // lost = light tint (de-emphasized)
    neutral: '#c7d2fe',
    muted:   '#e0e7ff',
    // Palette for multi-series (8 distinct indigo shades)
    palette: ['#312e81', '#3730a3', '#4338ca', '#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#eef2ff'],
    // Pipeline status — graduated indigo shades (dark = early, bright = won, muted = lost/hold)
    status: {
      'NEW':         '#4f46e5',
      'CALCULATED':  '#4338ca',
      'QUOTE SEND':  '#6366f1',
      'IN PROGRESS': '#818cf8',
      'ORDERED':     '#a5b4fc',
      'WON':         '#312e81',
      'LOST':        '#c7d2fe',
      'ON HOLD':     '#e0e7ff',
      'STORNO':      '#e0e7ff',
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

    kpiRow.appendChild(kpiCard('Pipeline Value', shortCurrency(totalPipeline), `${opps.filter(o => !['WON', 'LOST', 'STORNO'].includes(o.status)).length} open deals`, COLORS.indigo600));
    kpiRow.appendChild(kpiCard('Won Revenue', shortCurrency(wonRevenue), `${wonCount} deals closed`, COLORS.indigo700));
    kpiRow.appendChild(kpiCard('Monthly Recurring', shortCurrency(mrr), 'Active contracts', COLORS.indigo500));
    kpiRow.appendChild(kpiCard('Win Rate', `${winRate}%`, `${wonCount}W / ${lostCount}L`, COLORS.indigo800));
    kpiRow.appendChild(kpiCard('Avg Deal Size', shortCurrency(avgDeal), `From ${wonCount} won deals`, COLORS.indigo400));
    kpiRow.appendChild(kpiCard('Total Quotes', quotes.length.toString(), `Across all opportunities`, COLORS.indigo300));
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
            backgroundColor: statusKeys.map(s => COLORS.status[s] || COLORS.indigo200),
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
              borderColor: COLORS.indigo700,
              backgroundColor: COLORS.indigo700 + '18',
              fill: true,
              tension: 0.35,
              pointRadius: 3,
              pointHoverRadius: 6,
              pointBackgroundColor: COLORS.indigo700,
              borderWidth: 2.5,
            },
            {
              label: 'OPEX (monthly)',
              data: monthKeys.map(k => monthGroups[k].opex),
              borderColor: COLORS.indigo400,
              backgroundColor: COLORS.indigo400 + '18',
              fill: true,
              tension: 0.35,
              pointRadius: 3,
              pointHoverRadius: 6,
              pointBackgroundColor: COLORS.indigo400,
              borderWidth: 2,
              borderDash: [5, 3],
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
    const wlColors = [COLORS.indigo900, COLORS.indigo300, COLORS.indigo100];
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
            backgroundColor: topCust.map((_, i) => {
              // Graduated: darkest for #1, lighter for lower ranks
              const shades = [COLORS.indigo900, COLORS.indigo800, COLORS.indigo700, COLORS.indigo600, COLORS.indigo500, COLORS.indigo400, COLORS.indigo300, COLORS.indigo200];
              return shades[i] || COLORS.indigo200;
            }),
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
        lbl.style.cssText = 'width:100px;text-align:right;font-size:0.7rem;font-weight:500;color:var(--text-secondary);white-space:nowrap;';
        lbl.textContent = stage.label;
        const barOuter = el('div');
        barOuter.style.cssText = 'flex:1;height:30px;background:' + COLORS.indigo50 + ';border-radius:6px;overflow:hidden;position:relative;';
        const pctW = Math.max((stage.count / maxC) * 100, 8);
        const barInner = el('div');
        barInner.style.cssText = `width:${pctW}%;height:100%;background:${stage.color};border-radius:6px;transition:width 0.6s ease;display:flex;align-items:center;padding:0 10px;`;
        // Label inside bar
        const barLabel = el('span');
        barLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:#fff;white-space:nowrap;';
        barLabel.textContent = `${stage.count} · ${shortCurrency(stage.capex)}`;
        barInner.appendChild(barLabel);
        barOuter.appendChild(barInner);
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
            backgroundColor: COLORS.indigo500 + '50',
            borderColor: COLORS.indigo600,
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
              // Nearer months = darker indigo (more urgent), further = lighter
              const r = i / Math.max(expiryKeys.length - 1, 1);
              const shades = [COLORS.indigo900, COLORS.indigo800, COLORS.indigo700, COLORS.indigo600, COLORS.indigo500, COLORS.indigo400, COLORS.indigo300];
              return shades[Math.min(Math.floor(r * shades.length), shades.length - 1)];
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
          <td><span class="dash-status-badge" style="background:${statusColor}18;color:${statusColor};border:1px solid ${statusColor}35;">${o.status}</span></td>
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
      <div class="dash-kpi-content">
        <div class="dash-kpi-label">${title}</div>
        <div class="dash-kpi-value" style="color:${color}">${value}</div>
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
