// Dashboard Widget Rendering
// Fetches data, processes metrics, renders charts via Chart.js

import { pb } from '../api.js';
import { COLOR_SCHEMES, STATUS_COLORS } from './dashboard-config.js';
const dataCache = new Map();
const CACHE_TTL = 60_000;
const chartInstances = new Map();

// ─── Data Fetching ─────────────────────────────────────────────

async function cachedFetch(key, fetcher) {
  const cached = dataCache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;
  const data = await fetcher();
  dataCache.set(key, { data, time: Date.now() });
  return data;
}

async function fetchCollection(name, opts = {}) {
  return cachedFetch(name + JSON.stringify(opts), async () => {
    try {
      return await pb.collection(name).getFullList(opts);
    } catch (e) {
      console.warn(`[dashboard] fetch ${name} failed:`, e.message);
      return [];
    }
  });
}

function getRecords(source) {
  switch (source) {
    case 'opportunities': return fetchCollection('opportunities', { expand: 'customer' });
    case 'quotes': return fetchCollection('quotes');
    case 'installed_base': return fetchCollection('installed_base', { expand: 'customer,license' });
    case 'licenses': return fetchCollection('licenses');
    default: return Promise.resolve([]);
  }
}

// ─── Time Filtering ────────────────────────────────────────────

function filterByTime(records, timeRange) {
  if (!timeRange || timeRange === 'all') return records;
  const now = Date.now();
  const cutoffs = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  const days = cutoffs[timeRange];
  if (!days) return records;
  const cutoff = now - days * 86400_000;
  return records.filter(r => {
    const d = new Date(r.created || r.installed_on || 0);
    return d.getTime() >= cutoff;
  });
}

// ─── Status Filtering ──────────────────────────────────────────

function filterByStatus(records, filters) {
  if (!filters) return records;
  let result = records;
  if (filters.status && filters.status.length > 0) {
    result = result.filter(r => filters.status.includes(r.status));
  }
  if (filters.statusNot && filters.statusNot.length > 0) {
    result = result.filter(r => !filters.statusNot.includes(r.status));
  }
  return result;
}

// ─── Metric Calculation ────────────────────────────────────────

function calcMetric(records, metric) {
  if (!records || records.length === 0) return 0;
  switch (metric) {
    case 'count': return records.length;
    case 'sum_capex': return records.reduce((s, r) => s + (Number(r.capex) || 0), 0);
    case 'sum_opex': return records.reduce((s, r) => s + (Number(r.opex_monthly) || 0), 0);
    case 'sum_total': return records.reduce((s, r) => s + (Number(r.capex) || 0) + (Number(r.opex_monthly) || 0) * (Number(r.contract_term_months) || 12), 0);
    case 'avg_capex': {
      const sum = records.reduce((s, r) => s + (Number(r.capex) || 0), 0);
      return records.length > 0 ? sum / records.length : 0;
    }
    default: return records.length;
  }
}

// ─── Grouping ──────────────────────────────────────────────────

function groupRecords(records, groupBy) {
  const groups = {};
  for (const r of records) {
    let key;
    switch (groupBy) {
      case 'status':
        key = r.status || 'Unknown';
        break;
      case 'customer':
        key = r.expand?.customer?.name || r.customer || 'Unknown';
        break;
      case 'month': {
        const d = new Date(r.created || r.installed_on || 0);
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        break;
      }
      case 'quarter': {
        const d = new Date(r.created || r.installed_on || 0);
        key = `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
        break;
      }
      case 'year': {
        const d = new Date(r.created || r.installed_on || 0);
        key = `${d.getFullYear()}`;
        break;
      }
      case 'expiry_month': {
        const start = r.support_start || r.installed_on;
        const term = Number(r.contract_term) || 12;
        if (!start) { key = 'Unknown'; break; }
        const expiry = new Date(start);
        expiry.setMonth(expiry.getMonth() + term);
        key = `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, '0')}`;
        break;
      }
      default:
        key = 'All';
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }
  return groups;
}

// ─── Helpers ───────────────────────────────────────────────────

function formatLabel(key, groupBy) {
  if (['month', 'expiry_month'].includes(groupBy) && /^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m) - 1]} ${y}`;
  }
  return key;
}

function formatValue(val, metric) {
  if (metric === 'count') return val.toLocaleString('de-DE');
  return val.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function destroyChart(widgetId) {
  const existing = chartInstances.get(widgetId);
  if (existing) {
    existing.destroy();
    chartInstances.delete(widgetId);
  }
}

function getColors(widget, count) {
  const scheme = COLOR_SCHEMES[widget.config?.colorScheme] || COLOR_SCHEMES.default;
  // For status-based grouping, use status colors
  return scheme;
}

function getStatusColors(labels) {
  return labels.map(l => STATUS_COLORS[l] || '#9ca3af');
}

function showLoading(el) {
  el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;opacity:0.3;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 4-6"/></svg></div>';
}

function showError(el, msg) {
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:0.8rem;opacity:0.6;">${msg}</div>`;
}

function showEmpty(el) {
  showError(el, 'No data available');
}

function makeCanvas(body) {
  body.innerHTML = '';
  const canvas = document.createElement('canvas');
  body.appendChild(canvas);
  return canvas;
}

// ─── Prepare Data (fetch + filter) ─────────────────────────────

async function prepareData(widget, globalTimeRange) {
  const records = await getRecords(widget.data_source);
  const timeRange = widget.config?.timeRange === 'all' ? globalTimeRange : (widget.config?.timeRange || globalTimeRange);
  let filtered = filterByTime(records, timeRange);
  filtered = filterByStatus(filtered, widget.config?.filters);
  return filtered;
}

// ─── Renderers ─────────────────────────────────────────────────

// KPI Card
async function renderCard(widget, body) {
  showLoading(body);
  try {
    const records = await prepareData(widget, 'all');
    const value = calcMetric(records, widget.config?.metric || 'count');

    body.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:4px;';

    const num = document.createElement('div');
    num.style.cssText = 'font-size:1.75rem;font-weight:700;color:var(--text-primary);';
    num.textContent = formatValue(value, widget.config?.metric || 'count');

    const label = document.createElement('div');
    label.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;';
    label.textContent = widget.config?.metric === 'count' ? 'Total' : '';

    wrapper.appendChild(num);
    wrapper.appendChild(label);
    body.appendChild(wrapper);
  } catch (e) {
    console.error('[dashboard] card error:', e);
    showError(body, 'Failed to load');
  }
}

// Line Chart
async function renderLine(widget, body, globalTimeRange) {
  showLoading(body);
  try {
    destroyChart(widget.id);
    const records = await prepareData(widget, globalTimeRange);
    const groupBy = widget.config?.groupBy || 'month';
    const groups = groupRecords(records, groupBy);
    const keys = Object.keys(groups).sort();

    if (keys.length === 0) { showEmpty(body); return; }

    const values = keys.map(k => calcMetric(groups[k], widget.config?.metric || 'count'));
    const labels = keys.map(k => formatLabel(k, groupBy));
    const colors = getColors(widget, keys.length);

    const canvas = makeCanvas(body);
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: widget.title,
          data: values,
          borderColor: colors[0],
          backgroundColor: colors[0] + '20',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } },
        },
      },
    });
    chartInstances.set(widget.id, chart);
  } catch (e) {
    console.error('[dashboard] line error:', e);
    showError(body, 'Failed to load chart');
  }
}

// Bar Chart
async function renderBar(widget, body, globalTimeRange) {
  showLoading(body);
  try {
    destroyChart(widget.id);
    const records = await prepareData(widget, globalTimeRange);
    const groupBy = widget.config?.groupBy || 'status';
    const groups = groupRecords(records, groupBy);
    let keys = Object.keys(groups).sort();

    // For customer groupBy, sort by value descending and limit
    const metric = widget.config?.metric || 'count';
    if (groupBy === 'customer') {
      keys.sort((a, b) => calcMetric(groups[b], metric) - calcMetric(groups[a], metric));
      const limit = widget.config?.limit || 20;
      keys = keys.slice(0, limit);
    }

    if (keys.length === 0) { showEmpty(body); return; }

    const values = keys.map(k => calcMetric(groups[k], metric));
    const labels = keys.map(k => formatLabel(k, groupBy));
    const isStatus = groupBy === 'status';
    const colors = isStatus ? getStatusColors(keys) : getColors(widget, keys.length);
    const bgColors = isStatus ? colors : colors.slice(0, keys.length).concat(colors).slice(0, keys.length);

    const canvas = makeCanvas(body);
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: widget.title,
          data: values,
          backgroundColor: bgColors,
          borderRadius: 4,
          maxBarThickness: 40,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: widget.config?.horizontal ? 'y' : 'x',
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } },
        },
      },
    });
    chartInstances.set(widget.id, chart);
  } catch (e) {
    console.error('[dashboard] bar error:', e);
    showError(body, 'Failed to load chart');
  }
}

// Pie / Donut
async function renderPieDonut(widget, body, globalTimeRange) {
  showLoading(body);
  try {
    destroyChart(widget.id);
    const records = await prepareData(widget, globalTimeRange);
    const groupBy = widget.config?.groupBy || 'status';
    const groups = groupRecords(records, groupBy);
    const keys = Object.keys(groups).sort();

    if (keys.length === 0) { showEmpty(body); return; }

    const metric = widget.config?.metric || 'count';
    const values = keys.map(k => calcMetric(groups[k], metric));
    const isStatus = groupBy === 'status';
    const colors = isStatus ? getStatusColors(keys) : getColors(widget, keys.length);
    const bgColors = isStatus ? colors : colors.slice(0, keys.length).concat(colors).slice(0, keys.length);

    const canvas = makeCanvas(body);
    const chart = new Chart(canvas, {
      type: widget.widget_type === 'donut' ? 'doughnut' : 'pie',
      data: {
        labels: keys,
        datasets: [{
          data: values,
          backgroundColor: bgColors,
          borderWidth: 2,
          borderColor: '#fff',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: widget.widget_type === 'donut' ? '55%' : 0,
        plugins: {
          legend: {
            position: 'right',
            labels: { boxWidth: 12, padding: 10, font: { size: 11 } },
          },
        },
      },
    });
    chartInstances.set(widget.id, chart);
  } catch (e) {
    console.error('[dashboard] pie error:', e);
    showError(body, 'Failed to load chart');
  }
}

// Funnel (custom SVG, not Chart.js)
async function renderFunnel(widget, body, globalTimeRange) {
  showLoading(body);
  try {
    const records = await prepareData(widget, globalTimeRange);
    const groups = groupRecords(records, 'status');

    // Ordered stages
    const stages = ['NEW', 'CALCULATED', 'QUOTE SEND', 'IN PROGRESS', 'ORDERED', 'WON'];
    const stageData = stages
      .filter(s => groups[s] && groups[s].length > 0)
      .map(s => ({
        label: s,
        count: groups[s].length,
        value: groups[s].reduce((sum, r) => sum + (Number(r.capex) || 0), 0),
        color: STATUS_COLORS[s] || '#9ca3af',
      }));

    if (stageData.length === 0) { showEmpty(body); return; }

    const maxCount = Math.max(...stageData.map(s => s.count));

    body.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px 0;height:100%;justify-content:center;';

    stageData.forEach(stage => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;';

      const label = document.createElement('div');
      label.style.cssText = 'width:100px;text-align:right;font-size:0.75rem;color:var(--text-secondary);white-space:nowrap;';
      label.textContent = stage.label;

      const barOuter = document.createElement('div');
      barOuter.style.cssText = 'flex:1;height:28px;background:#f3f4f6;border-radius:4px;overflow:hidden;position:relative;';

      const barInner = document.createElement('div');
      const pct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
      barInner.style.cssText = `width:${pct}%;height:100%;background:${stage.color};border-radius:4px;transition:width 0.5s ease;`;

      const info = document.createElement('div');
      info.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:0.7rem;color:var(--text-secondary);';
      info.textContent = `${stage.count} · ${stage.value.toLocaleString('de-DE')} €`;

      barOuter.appendChild(barInner);
      barOuter.appendChild(info);
      row.appendChild(label);
      row.appendChild(barOuter);
      wrapper.appendChild(row);
    });

    body.appendChild(wrapper);
  } catch (e) {
    console.error('[dashboard] funnel error:', e);
    showError(body, 'Failed to load');
  }
}

// ─── Public API ────────────────────────────────────────────────

export function renderWidget(widget, container, globalTimeRange) {
  // Widget card structure
  const card = document.createElement('div');
  card.className = 'dash-widget';
  card.style.gridColumn = `span ${widget.position?.colSpan || 6}`;

  const header = document.createElement('div');
  header.className = 'dash-widget-header';

  const title = document.createElement('h4');
  title.textContent = widget.title || 'Widget';
  header.appendChild(title);

  const gearBtn = document.createElement('button');
  gearBtn.className = 'dash-widget-gear';
  gearBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';
  header.appendChild(gearBtn);

  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'dash-widget-body';
  card.appendChild(body);

  container.appendChild(card);

  // Render content
  const type = widget.widget_type;
  if (type === 'card') renderCard(widget, body);
  else if (type === 'line') renderLine(widget, body, globalTimeRange);
  else if (type === 'bar') renderBar(widget, body, globalTimeRange);
  else if (type === 'pie' || type === 'donut') renderPieDonut(widget, body, globalTimeRange);
  else if (type === 'funnel') renderFunnel(widget, body, globalTimeRange);
  else showError(body, `Unknown type: ${type}`);

  return { card, gearBtn };
}

export function destroyAllCharts() {
  for (const [id, chart] of chartInstances) {
    chart.destroy();
  }
  chartInstances.clear();
}

export function clearCache() {
  dataCache.clear();
}
