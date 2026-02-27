// Dashboard Widget Configuration
// Default dashboard configs, option definitions, and widget config modal

// --- Color Schemes ---
export const COLOR_SCHEMES = {
  default: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'],
  blue:    ['#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'],
  green:   ['#14532d', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac'],
  purple:  ['#581c87', '#6b21a8', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd'],
  warm:    ['#7c2d12', '#c2410c', '#ea580c', '#f97316', '#fb923c', '#fdba74'],
};

// --- Status Colors (consistent across the app) ---
export const STATUS_COLORS = {
  'NEW':         '#4f46e5',
  'CALCULATED':  '#3b82f6',
  'QUOTE SEND':  '#06b6d4',
  'ORDERED':     '#8b5cf6',
  'IN PROGRESS': '#f59e0b',
  'WON':         '#10b981',
  'LOST':        '#ef4444',
  'ON HOLD':     '#9ca3af',
  'STORNO':      '#6b7280',
};

// --- Dropdown Option Arrays ---
export const WIDGET_TYPES = [
  { value: 'card',   label: 'KPI Card' },
  { value: 'line',   label: 'Line Chart' },
  { value: 'bar',    label: 'Bar Chart' },
  { value: 'pie',    label: 'Pie Chart' },
  { value: 'donut',  label: 'Donut Chart' },
  { value: 'funnel', label: 'Funnel' },
  { value: 'geo',    label: 'Geo Map' },
];

export const DATA_SOURCES = [
  { value: 'opportunities',  label: 'Opportunities' },
  { value: 'quotes',         label: 'Quotes' },
  { value: 'installed_base', label: 'Installed Base' },
  { value: 'licenses',       label: 'Licenses' },
];

export const METRICS = [
  { value: 'count',     label: 'Count' },
  { value: 'sum_capex', label: 'Sum of CAPEX' },
  { value: 'sum_opex',  label: 'Sum of OPEX (monthly)' },
  { value: 'sum_total', label: 'Sum of Total Value' },
  { value: 'avg_capex', label: 'Average CAPEX' },
];

export const GROUP_BY_OPTIONS = [
  { value: 'none',         label: 'None' },
  { value: 'status',       label: 'Status' },
  { value: 'customer',     label: 'Customer' },
  { value: 'month',        label: 'Month' },
  { value: 'quarter',      label: 'Quarter' },
  { value: 'year',         label: 'Year' },
  { value: 'expiry_month', label: 'Expiry Month (Installed Base)' },
];

export const TIME_RANGES = [
  { value: 'all', label: 'All Time' },
  { value: '7d',  label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: '1y',  label: 'Last Year' },
];

export const SIZE_OPTIONS = [
  { value: 3,  label: 'Small (3 col)' },
  { value: 4,  label: 'Medium (4 col)' },
  { value: 6,  label: 'Half (6 col)' },
  { value: 8,  label: 'Large (8 col)' },
  { value: 12, label: 'Full Width (12 col)' },
];

// --- Default Dashboard Widgets ---
export const DEFAULT_DASHBOARD = [
  // Row 1: KPI Cards (3 col each)
  {
    id: 'def-1',
    widget_type: 'card',
    title: 'Total Pipeline Value',
    data_source: 'opportunities',
    config: {
      metric: 'sum_capex',
      groupBy: 'none',
      timeRange: 'all',
      filters: { statusNot: ['WON', 'LOST', 'STORNO'] },
      colorScheme: 'default',
    },
    position: { order: 0, colSpan: 3 },
  },
  {
    id: 'def-2',
    widget_type: 'card',
    title: 'Won Revenue',
    data_source: 'opportunities',
    config: {
      metric: 'sum_capex',
      groupBy: 'none',
      timeRange: 'all',
      filters: { status: ['WON'] },
      colorScheme: 'default',
    },
    position: { order: 1, colSpan: 3 },
  },
  {
    id: 'def-3',
    widget_type: 'card',
    title: 'Monthly Recurring',
    data_source: 'opportunities',
    config: {
      metric: 'sum_opex',
      groupBy: 'none',
      timeRange: 'all',
      filters: { statusNot: ['LOST', 'STORNO'] },
      colorScheme: 'default',
    },
    position: { order: 2, colSpan: 3 },
  },
  {
    id: 'def-4',
    widget_type: 'card',
    title: 'Total Quotes',
    data_source: 'quotes',
    config: {
      metric: 'count',
      groupBy: 'none',
      timeRange: 'all',
      colorScheme: 'default',
    },
    position: { order: 3, colSpan: 3 },
  },

  // Row 2: Charts (6 col each)
  {
    id: 'def-5',
    widget_type: 'line',
    title: 'Revenue Over Time',
    data_source: 'opportunities',
    config: {
      metric: 'sum_capex',
      groupBy: 'month',
      timeRange: 'all',
      colorScheme: 'default',
    },
    position: { order: 4, colSpan: 6 },
  },
  {
    id: 'def-6',
    widget_type: 'donut',
    title: 'Opportunities by Status',
    data_source: 'opportunities',
    config: {
      metric: 'count',
      groupBy: 'status',
      timeRange: 'all',
      colorScheme: 'default',
    },
    position: { order: 5, colSpan: 6 },
  },

  // Row 3: Charts (6 col each)
  {
    id: 'def-7',
    widget_type: 'bar',
    title: 'Top 10 Customers by Revenue',
    data_source: 'opportunities',
    config: {
      metric: 'sum_capex',
      groupBy: 'customer',
      timeRange: 'all',
      limit: 10,
      horizontal: true,
      colorScheme: 'default',
    },
    position: { order: 6, colSpan: 6 },
  },
  {
    id: 'def-8',
    widget_type: 'bar',
    title: 'Expiring Contracts',
    data_source: 'installed_base',
    config: {
      metric: 'count',
      groupBy: 'expiry_month',
      timeRange: 'all',
      colorScheme: 'warm',
    },
    position: { order: 7, colSpan: 6 },
  },

  // Row 4: Funnel (12 col)
  {
    id: 'def-9',
    widget_type: 'funnel',
    title: 'Pipeline Funnel',
    data_source: 'opportunities',
    config: {
      metric: 'count',
      groupBy: 'none',
      timeRange: 'all',
      colorScheme: 'default',
    },
    position: { order: 8, colSpan: 12 },
  },
];

/**
 * Create a new blank widget config with sensible defaults.
 */
export function createDefaultWidgetConfig() {
  return {
    id: 'new-' + Date.now(),
    widget_type: 'bar',
    title: 'New Widget',
    data_source: 'opportunities',
    config: {
      metric: 'count',
      groupBy: 'status',
      timeRange: 'all',
      filters: {},
      colorScheme: 'default',
    },
    position: { order: 999, colSpan: 6 },
  };
}

/**
 * Opens a configuration modal for a widget.
 * @param {Object} widget - Current widget config
 * @param {{ onSave: Function, onDelete: Function, onCancel: Function }} callbacks
 * @returns {{ destroy: Function }}
 */
export function openWidgetConfigModal(widget, { onSave, onDelete, onCancel }) {
  const draft = JSON.parse(JSON.stringify(widget));

  // --- Backdrop ---
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) onCancel?.();
  });

  // --- Modal card ---
  const modal = document.createElement('div');
  modal.className = 'card';
  modal.style.cssText = 'width:520px;max-width:95vw;max-height:85vh;overflow-y:auto;padding:0;';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'padding:1.25rem 1.5rem;border-bottom:1px solid var(--border);';
  const headerTitle = document.createElement('h3');
  headerTitle.style.cssText = 'font-size:1rem;font-weight:600;';
  headerTitle.textContent = widget.id?.startsWith('new-') ? 'Add Widget' : 'Configure Widget';
  header.appendChild(headerTitle);
  modal.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.style.cssText = 'padding:1.5rem;display:flex;flex-direction:column;gap:1.25rem;';

  function formGroup(labelText, inputEl) {
    const group = document.createElement('div');
    const label = document.createElement('label');
    label.style.cssText = 'display:block;font-size:0.875rem;font-weight:500;margin-bottom:0.375rem;';
    label.textContent = labelText;
    group.appendChild(label);
    group.appendChild(inputEl);
    return group;
  }

  function makeSelect(options, currentValue, onChange) {
    const sel = document.createElement('select');
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (String(opt.value) === String(currentValue)) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  // Title
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = draft.title;
  titleInput.placeholder = 'Widget title';
  titleInput.addEventListener('input', () => { draft.title = titleInput.value; });
  body.appendChild(formGroup('Title', titleInput));

  // Two-column row for type + source
  const row1 = document.createElement('div');
  row1.className = 'form-row';
  row1.appendChild(formGroup('Chart Type', makeSelect(WIDGET_TYPES, draft.widget_type, (v) => {
    draft.widget_type = v;
  })));
  row1.appendChild(formGroup('Data Source', makeSelect(DATA_SOURCES, draft.data_source, (v) => {
    draft.data_source = v;
  })));
  body.appendChild(row1);

  // Two-column row for metric + group by
  const row2 = document.createElement('div');
  row2.className = 'form-row';
  row2.appendChild(formGroup('Metric', makeSelect(METRICS, draft.config.metric, (v) => {
    draft.config.metric = v;
  })));
  row2.appendChild(formGroup('Group By', makeSelect(GROUP_BY_OPTIONS, draft.config.groupBy, (v) => {
    draft.config.groupBy = v;
  })));
  body.appendChild(row2);

  // Two-column row for time range + size
  const row3 = document.createElement('div');
  row3.className = 'form-row';
  row3.appendChild(formGroup('Time Range', makeSelect(TIME_RANGES, draft.config.timeRange || 'all', (v) => {
    draft.config.timeRange = v;
  })));
  row3.appendChild(formGroup('Size', makeSelect(SIZE_OPTIONS, draft.position.colSpan, (v) => {
    draft.position.colSpan = parseInt(v, 10);
  })));
  body.appendChild(row3);

  // Color scheme
  const colorOptions = Object.keys(COLOR_SCHEMES).map(k => ({
    value: k,
    label: k.charAt(0).toUpperCase() + k.slice(1),
  }));
  body.appendChild(formGroup('Color Scheme', makeSelect(colorOptions, draft.config.colorScheme || 'default', (v) => {
    draft.config.colorScheme = v;
  })));

  modal.appendChild(body);

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = 'padding:1rem 1.5rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;';

  const leftDiv = document.createElement('div');
  if (!widget.id?.startsWith('new-')) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger btn-sm';
    deleteBtn.textContent = 'Delete Widget';
    deleteBtn.addEventListener('click', () => onDelete?.(widget));
    leftDiv.appendChild(deleteBtn);
  }
  footer.appendChild(leftDiv);

  const rightDiv = document.createElement('div');
  rightDiv.style.cssText = 'display:flex;gap:0.5rem;';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary btn-sm';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => onCancel?.());
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary btn-sm';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => onSave?.(draft));
  rightDiv.appendChild(cancelBtn);
  rightDiv.appendChild(saveBtn);
  footer.appendChild(rightDiv);

  modal.appendChild(footer);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // Focus title input
  requestAnimationFrame(() => titleInput.focus());

  return {
    destroy() {
      backdrop.remove();
    },
  };
}
