// Dashboard Widget Rendering
// Handles data fetching, caching, aggregation, Chart.js integration,
// and per-widget rendering for all supported widget types.

import { pb } from '../api.js';
import { currency } from '../utils/format.js';
import { COLOR_SCHEMES, STATUS_COLORS } from './dashboard-config.js';

// ==========================================================================
// Data Cache (60-second TTL)
// ==========================================================================
const _cache = {};
const CACHE_TTL = 60_000;

async function cachedFetch(key, fetchFn) {
  const now = Date.now();
  if (_cache[key] && (now - _cache[key].ts) < CACHE_TTL) {
    return _cache[key].data;
  }
  const data = await fetchFn();
  _cache[key] = { data, ts: now };
  return data;
}

export function clearCache() {
  for (const k of Object.keys(_cache)) delete _cache[k];
}

// ==========================================================================
// Data Fetchers
// ==========================================================================
function fetchOpportunities() {
  return cachedFetch('opportunities', async () => {
    try {
      return await pb.collection('opportunities').getFullList({ expand: 'customer' });
    } catch (e) {
      console.warn('Failed to fetch opportunities with expand, trying without:', e.message);
      return await pb.collection('opportunities').getFullList();
    }
  });
}

function fetchQuotes() {
  return cachedFetch('quotes', () =>
    pb.collection('quotes').getFullList()
  );
}

function fetchInstalledBase() {
  return cachedFetch('installed_base', async () => {
    try {
      return await pb.collection('installed_base').getFullList({ expand: 'customer,license' });
    } catch (e) {
      console.warn('Failed to fetch installed_base with expand, trying without:', e.message);
      return await pb.collection('installed_base').getFullList();
    }
  });
}

function fetchLicenses() {
  return cachedFetch('licenses', () =>
    pb.collection('licenses').getFullList()
  );
}

function getDataFetcher(source) {
  const map = {
    opportunities: fetchOpportunities,
    quotes: fetchQuotes,
    installed_base: fetchInstalledBase,
    licenses: fetchLicenses,
  };
  return map[source] || fetchOpportunities;
}

// ==========================================================================
// Filtering
// ==========================================================================
function filterByTimeRange(records, timeRange, dateField = 'created') {
  if (!timeRange || timeRange === 'all') return records;
  const now = Date.now();
  const days = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  const d = days[timeRange];
  if (!d) return records;
  const cutoff = now - d * 86_400_000;
  return records.filter(r => new Date(r[dateField]).getTime() >= cutoff);
}

function applyStatusFilters(records, filters) {
  if (!filters) return records;
  let result = records;
  if (filters.status) {
    const allowed = Array.isArray(filters.status) ? filters.status : [filters.status];
    result = result.filter(r => allowed.includes(r.status));
  }
  if (filters.statusNot) {
    const excluded = Array.isArray(filters.statusNot) ? filters.statusNot : [filters.statusNot];
    result = result.filter(r => !excluded.includes(r.status));
  }
  return result;
}

// ==========================================================================
// Metric Calculation
// ==========================================================================
function calculateMetric(records, metric) {
  switch (metric) {
    case 'count':     return records.length;
    case 'sum_capex': return records.reduce((s, r) => s + (r.capex || 0), 0);
    case 'sum_opex':  return records.reduce((s, r) => s + (r.opex_monthly || 0), 0);
    case 'sum_total': return records.reduce((s, r) =>
      s + (r.capex || 0) + (r.opex_monthly || 0) * (r.contract_term_months || 12), 0);
    case 'avg_capex': {
      if (records.length === 0) return 0;
      return records.reduce((s, r) => s + (r.capex || 0), 0) / records.length;
    }
    default: return records.length;
  }
}

// ==========================================================================
// Grouping
// ==========================================================================
function groupRecords(records, groupBy) {
  const groups = {};
  for (const r of records) {
    let key;
    switch (groupBy) {
      case 'status':
        key = r.status || 'Unknown';
        break;
      case 'customer':
        key = r.expand?.customer?.name || 'Unknown';
        break;
      case 'month': {
        const d = new Date(r.created);
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        break;
      }
      case 'quarter': {
        const d = new Date(r.created);
        key = `${d.getFullYear()} Q${Math.ceil((d.getMonth() + 1) / 3)}`;
        break;
      }
      case 'year':
        key = new Date(r.created).getFullYear().toString();
        break;
      case 'expiry_month': {
        if (!r.support_start || !r.contract_term) continue;
        const expiry = new Date(r.support_start);
        expiry.setMonth(expiry.getMonth() + r.contract_term);
        const now = new Date();
        const limit = new Date(now);
        limit.setMonth(limit.getMonth() + 12);
        if (expiry < now || expiry > limit) continue;
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

// ==========================================================================
// Formatting
// ==========================================================================
function formatMetricValue(value, metric) {
  if (metric === 'count') return value.toLocaleString('de-DE');
  return currency(value);
}

function shortCurrency(value) {
  if (Math.abs(value) >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `€${(value / 1_000).toFixed(0)}k`;
  return currency(value);
}

function monthLabel(key) {
  if (!key.includes('-')) return key;
  const [y, m] = key.split('-');
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('de-DE', {
    month: 'short', year: '2-digit',
  });
}

// ==========================================================================
// Theme-aware chart colors
// ==========================================================================
function chartTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    text:      isDark ? '#94a3b8' : '#6b7280',
    grid:      isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    tooltipBg: isDark ? 'rgba(30,41,59,0.95)' : 'rgba(0,0,0,0.85)',
  };
}

// ==========================================================================
// Chart Instance Tracking
// ==========================================================================
const chartInstances = new Map();

export function destroyAllCharts() {
  chartInstances.forEach(chart => { try { chart.destroy(); } catch (_) {} });
  chartInstances.clear();
}

function destroyChart(widgetId) {
  if (chartInstances.has(widgetId)) {
    try { chartInstances.get(widgetId).destroy(); } catch (_) {}
    chartInstances.delete(widgetId);
  }
}

// ==========================================================================
// Widget Container (shell with header + body)
// ==========================================================================
function createWidgetShell(widget, { onConfigure }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'dash-widget';
  wrapper.dataset.widgetId = widget.id;
  wrapper.style.gridColumn = `span ${widget.position?.colSpan || 6}`;

  // Header
  const header = document.createElement('div');
  header.className = 'dash-widget-header';

  const title = document.createElement('h3');
  title.className = 'dash-widget-title';
  title.textContent = widget.title;

  const actions = document.createElement('div');
  actions.className = 'dash-widget-actions';

  const gearBtn = document.createElement('button');
  gearBtn.className = 'dash-widget-action-btn';
  gearBtn.title = 'Configure';
  gearBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;
  gearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onConfigure?.(widget);
  });
  actions.appendChild(gearBtn);

  header.appendChild(title);
  header.appendChild(actions);

  // Body
  const body = document.createElement('div');
  body.className = 'dash-widget-body';

  // Set appropriate height based on widget type
  const heightMap = { card: 'auto', funnel: 'auto', geo: '350px' };
  body.style.height = heightMap[widget.widget_type] || '260px';
  if (widget.widget_type === 'card') body.style.minHeight = '60px';

  wrapper.appendChild(header);
  wrapper.appendChild(body);

  return { wrapper, body };
}

// ==========================================================================
// Loading & Empty States
// ==========================================================================
function showLoading(el) {
  el.innerHTML = `
    <div class="dash-skeleton">
      <div class="dash-skeleton-bar"></div>
      <div class="dash-skeleton-bar short"></div>
      <div class="dash-skeleton-bar"></div>
    </div>`;
}

function showEmpty(el, message = 'No data available') {
  el.innerHTML = `
    <div class="dash-widget-empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
      </svg>
      <p>${message}</p>
    </div>`;
}

// ==========================================================================
// Prepare data: fetch → filter → group
// ==========================================================================
async function prepareData(widget, globalTimeRange) {
  const fetcher = getDataFetcher(widget.data_source);
  let records = await fetcher();
  const effectiveRange = widget.config.timeRange || globalTimeRange;
  records = filterByTimeRange(records, effectiveRange);
  records = applyStatusFilters(records, widget.config.filters);
  return records;
}

// ==========================================================================
// WIDGET RENDERERS
// ==========================================================================

// --- Card ---
async function renderCard(widget, body, globalTimeRange) {
  showLoading(body);
  try {
    const records = await prepareData(widget, globalTimeRange);
    const value = calculateMetric(records, widget.config.metric);

    body.innerHTML = '';
    body.classList.add('dash-widget-body-card');

    const el = document.createElement('div');
    el.className = 'dash-card-value';
    el.textContent = widget.config.metric === 'count'
      ? value.toLocaleString('de-DE')
      : shortCurrency(value);
    body.appendChild(el);
  } catch (e) {
    console.error('Card widget error:', e);
    showEmpty(body, 'Failed to load data');
  }
}

// --- Line Chart ---
async function renderLineChart(widget, body, globalTimeRange) {
  showLoading(body);
  try {
    const records = await prepareData(widget, globalTimeRange);
    const groups = groupRecords(records, widget.config.groupBy || 'month');
    const sortedKeys = Object.keys(groups).sort();
    const values = sortedKeys.map(k => calculateMetric(groups[k], widget.config.metric));

    const isTimeGrouped = ['month', 'quarter', 'year'].includes(widget.config.groupBy);
    const labels = sortedKeys.map(k => isTimeGrouped ? monthLabel(k) : k);

    if (labels.length === 0) { showEmpty(body, 'No data for this time range'); return; }

    body.innerHTML = '';
    const canvas = document.createElement('canvas');
    body.appendChild(canvas);

    const colors = COLOR_SCHEMES[widget.config.colorScheme] || COLOR_SCHEMES.default;
    const theme = chartTheme();

    destroyChart(widget.id);
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
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleFont: { size: 12 },
            bodyFont: { size: 12 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: ctx => formatMetricValue(ctx.parsed.y, widget.config.metric),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: theme.text },
          },
          y: {
            grid: { color: theme.grid },
            ticks: {
              font: { size: 11 },
              color: theme.text,
              callback: v => widget.config.metric === 'count' ? v : shortCurrency(v),
            },
            beginAtZero: true,
          },
        },
      },
    });
    chartInstances.set(widget.id, chart);
  } catch (e) {
    console.error('Line chart error:', e);
    showEmpty(body, 'Failed to load chart');
  }
}

// --- Bar Chart ---
async function renderBarChart(widget, body, globalTimeRange) {
  showLoading(body);
  try {
    const records = await prepareData(widget, globalTimeRange);
    const groups = groupRecords(records, widget.config.groupBy || 'status');

    let entries = Object.entries(groups).map(([key, recs]) => ({
      label: key,
      value: calculateMetric(recs, widget.config.metric),
    }));

    const timeGroups = ['month', 'quarter', 'year', 'expiry_month'];
    if (timeGroups.includes(widget.config.groupBy)) {
      entries.sort((a, b) => a.label.localeCompare(b.label));
    } else {
      entries.sort((a, b) => b.value - a.value);
    }

    if (widget.config.limit) entries = entries.slice(0, widget.config.limit);
    if (entries.length === 0) { showEmpty(body, 'No data available'); return; }

    const isTimeLabel = ['month', 'expiry_month'].includes(widget.config.groupBy);
    const labels = entries.map(e => isTimeLabel ? monthLabel(e.label) : e.label);
    const values = entries.map(e => e.value);

    body.innerHTML = '';
    const canvas = document.createElement('canvas');
    body.appendChild(canvas);

    const colors = COLOR_SCHEMES[widget.config.colorScheme] || COLOR_SCHEMES.default;
    const isHorizontal = !!widget.config.horizontal;
    const theme = chartTheme();

    // Use status colors when grouping by status
    let bgColors, borderColors;
    if (widget.config.groupBy === 'status') {
      bgColors = entries.map(e => (STATUS_COLORS[e.label] || colors[0]) + 'cc');
      borderColors = entries.map(e => STATUS_COLORS[e.label] || colors[0]);
    } else {
      bgColors = entries.map((_, i) => colors[i % colors.length] + 'cc');
      borderColors = entries.map((_, i) => colors[i % colors.length]);
    }

    destroyChart(widget.id);
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.7,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: isHorizontal ? 'y' : 'x',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: ctx => formatMetricValue(ctx.parsed[isHorizontal ? 'x' : 'y'], widget.config.metric),
            },
          },
        },
        scales: {
          x: {
            grid: { display: isHorizontal, color: theme.grid },
            ticks: {
              font: { size: 11 },
              color: theme.text,
              callback: isHorizontal
                ? (v => widget.config.metric === 'count' ? v : shortCurrency(v))
                : undefined,
            },
            beginAtZero: true,
          },
          y: {
            grid: { display: !isHorizontal, color: theme.grid },
            ticks: {
              font: { size: 11 },
              color: theme.text,
              callback: !isHorizontal
                ? (v => widget.config.metric === 'count' ? v : shortCurrency(v))
                : undefined,
            },
            beginAtZero: true,
          },
        },
      },
    });
    chartInstances.set(widget.id, chart);
  } catch (e) {
    console.error('Bar chart error:', e);
    showEmpty(body, 'Failed to load chart');
  }
}

// --- Pie / Donut ---
async function renderPieDonut(widget, body, globalTimeRange) {
  showLoading(body);
  try {
    const records = await prepareData(widget, globalTimeRange);
    const groups = groupRecords(records, widget.config.groupBy || 'status');

    const entries = Object.entries(groups)
      .map(([key, recs]) => ({ label: key, value: calculateMetric(recs, widget.config.metric) }))
      .sort((a, b) => b.value - a.value);

    if (entries.length === 0) { showEmpty(body, 'No data available'); return; }

    body.innerHTML = '';
    const canvas = document.createElement('canvas');
    body.appendChild(canvas);

    const colors = COLOR_SCHEMES[widget.config.colorScheme] || COLOR_SCHEMES.default;
    const theme = chartTheme();

    // Use status colors when grouping by status
    let bgColors, borderColors;
    if (widget.config.groupBy === 'status') {
      bgColors = entries.map(e => (STATUS_COLORS[e.label] || colors[0]) + 'cc');
      borderColors = entries.map(e => STATUS_COLORS[e.label] || colors[0]);
    } else {
      bgColors = entries.map((_, i) => colors[i % colors.length] + 'cc');
      borderColors = entries.map((_, i) => colors[i % colors.length]);
    }

    destroyChart(widget.id);
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(e => e.label),
        datasets: [{
          data: entries.map(e => e.value),
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: widget.widget_type === 'donut' ? '60%' : '0%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              font: { size: 11 },
              color: theme.text,
              padding: 12,
              usePointStyle: true,
              pointStyleWidth: 8,
            },
          },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                return ` ${ctx.label}: ${formatMetricValue(ctx.parsed, widget.config.metric)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
    chartInstances.set(widget.id, chart);
  } catch (e) {
    console.error('Pie/Donut error:', e);
    showEmpty(body, 'Failed to load chart');
  }
}

// --- Funnel (custom HTML — not a native Chart.js type) ---
async function renderFunnel(widget, body, globalTimeRange) {
  showLoading(body);
  try {
    let records = await fetchOpportunities();
    const effectiveRange = widget.config.timeRange || globalTimeRange;
    records = filterByTimeRange(records, effectiveRange);

    // Pipeline stage order (logical sales flow)
    const stageOrder = [
      'NEW', 'CALCULATED', 'QUOTE SEND', 'ORDERED', 'IN PROGRESS', 'WON',
    ];
    const stageColors = [
      '#4f46e5', '#3b82f6', '#06b6d4', '#8b5cf6', '#f59e0b', '#10b981',
    ];

    const stages = [];
    for (let i = 0; i < stageOrder.length; i++) {
      const stageRecords = records.filter(r => r.status === stageOrder[i]);
      if (stageRecords.length === 0) continue;
      const value = stageRecords.reduce((s, r) => s + (r.capex || 0), 0);
      stages.push({
        label: stageOrder[i],
        count: stageRecords.length,
        value,
        color: stageColors[i],
      });
    }

    if (stages.length === 0) { showEmpty(body, 'No pipeline data'); return; }

    body.innerHTML = '';
    const funnel = document.createElement('div');
    funnel.className = 'dash-funnel';

    const maxCount = Math.max(...stages.map(s => s.count));

    stages.forEach(stage => {
      const row = document.createElement('div');
      row.className = 'dash-funnel-stage';

      const label = document.createElement('div');
      label.className = 'dash-funnel-label';
      label.innerHTML = `
        <span class="dash-funnel-name">${stage.label}</span>
        <span class="dash-funnel-stats">${stage.count} opps &middot; ${shortCurrency(stage.value)}</span>`;

      const barWrap = document.createElement('div');
      barWrap.className = 'dash-funnel-bar-wrap';

      const bar = document.createElement('div');
      bar.className = 'dash-funnel-bar';
      const widthPct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
      bar.style.width = `${Math.max(widthPct, 5)}%`;
      bar.style.backgroundColor = stage.color;

      barWrap.appendChild(bar);
      row.appendChild(label);
      row.appendChild(barWrap);
      funnel.appendChild(row);
    });

    body.appendChild(funnel);
  } catch (e) {
    console.error('Funnel error:', e);
    showEmpty(body, 'Failed to load funnel');
  }
}

// --- Geo Map (placeholder — customers lack a country field) ---
function renderGeo(widget, body) {
  body.innerHTML = `
    <div class="dash-widget-empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/>
        <path d="M2 12h20"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
      <p>Add country codes to customers to enable geo view</p>
    </div>`;
}

// ==========================================================================
// Main renderWidget — dispatches to the correct renderer
// ==========================================================================

/**
 * Render a single widget into the grid container.
 * @param {Object} widget - Widget configuration
 * @param {HTMLElement} gridContainer - The 12-column grid element
 * @param {{ onConfigure: Function, globalTimeRange: string }} opts
 * @returns {HTMLElement} The widget wrapper element
 */
export function renderWidget(widget, gridContainer, { onConfigure, globalTimeRange }) {
  const { wrapper, body } = createWidgetShell(widget, { onConfigure });
  gridContainer.appendChild(wrapper);

  // Dispatch — each renderer is async but we fire-and-forget
  const renderers = {
    card:   renderCard,
    line:   renderLineChart,
    bar:    renderBarChart,
    pie:    renderPieDonut,
    donut:  renderPieDonut,
    funnel: renderFunnel,
    geo:    renderGeo,
  };

  const render = renderers[widget.widget_type];
  if (render) {
    if (widget.widget_type === 'geo') {
      render(widget, body);
    } else {
      render(widget, body, globalTimeRange);
    }
  } else {
    showEmpty(body, `Unknown widget type: ${widget.widget_type}`);
  }

  return wrapper;
}
