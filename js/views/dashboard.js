// Dashboard View — Configurable Widget Dashboard
// Renders a 12-column CSS grid of widgets backed by Chart.js.
// Loads widget config from PocketBase `dashboard_widgets` collection,
// falling back to a sensible default dashboard defined in dashboard-config.js.

import { pb } from '../api.js';
import { renderWidget, destroyAllCharts, clearCache } from './dashboard-widgets.js';
import {
  DEFAULT_DASHBOARD,
  TIME_RANGES,
  openWidgetConfigModal,
  createDefaultWidgetConfig,
} from './dashboard-config.js';

/**
 * Create the dashboard view.
 * @param {HTMLElement} container - Mount point provided by the router
 * @returns {{ destroy: Function }}
 */
export function createDashboardView(container) {
  container.innerHTML = '';

  let widgets = [];
  let globalTimeRange = 'all';
  let configModal = null;
  let collectionAvailable = false;
  let destroyed = false;

  // Start loading
  showGlobalLoading();
  loadDashboard();

  // ======================================================================
  // Loading state
  // ======================================================================
  function showGlobalLoading() {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'loading-state';
    wrap.style.minHeight = '50vh';
    wrap.innerHTML = `
      <div style="width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 1s linear infinite;"></div>
      <p>Loading dashboard...</p>`;
    container.appendChild(wrap);
  }

  // ======================================================================
  // Load config from PocketBase (or fall back to defaults)
  // ======================================================================
  async function loadDashboard() {
    try {
      const result = await pb.collection('dashboard_widgets').getFullList({ sort: '+position' });
      // Collection exists — use saved widgets (even if empty = blank dashboard)
      collectionAvailable = true;
      widgets = result.map(r => ({
        id: r.id,
        widget_type: r.widget_type,
        title: r.title,
        data_source: r.data_source,
        config: typeof r.config === 'string' ? JSON.parse(r.config) : (r.config || {}),
        position: typeof r.position === 'string' ? JSON.parse(r.position) : (r.position || { order: 0, colSpan: 6 }),
      }));
    } catch (_) {
      // Collection doesn't exist — fall back to defaults (read-only, not saved)
      collectionAvailable = false;
      widgets = DEFAULT_DASHBOARD.map(w => ({ ...w }));
    }

    if (!destroyed) renderDashboard();
  }

  // ======================================================================
  // Full render
  // ======================================================================
  function renderDashboard() {
    container.innerHTML = '';
    clearCache();
    destroyAllCharts();

    const root = document.createElement('div');
    root.className = 'p-6';

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'dash-header';

    const headerLeft = document.createElement('div');
    const h1 = document.createElement('h1');
    h1.style.cssText = 'font-size:1.5rem;font-weight:600;margin-bottom:0.25rem;';
    h1.textContent = 'Dashboard';
    const sub = document.createElement('p');
    sub.style.cssText = 'color:var(--text-secondary);font-size:0.875rem;';
    sub.textContent = "Welcome back! Here's an overview of your business.";
    headerLeft.appendChild(h1);
    headerLeft.appendChild(sub);

    const headerRight = document.createElement('div');
    headerRight.className = 'flex items-center gap-3';

    // Global time range selector
    const timeSelect = document.createElement('select');
    timeSelect.style.cssText = 'width:auto;min-width:140px;';
    TIME_RANGES.forEach(tr => {
      const o = document.createElement('option');
      o.value = tr.value;
      o.textContent = tr.label;
      if (tr.value === globalTimeRange) o.selected = true;
      timeSelect.appendChild(o);
    });
    timeSelect.addEventListener('change', () => {
      globalTimeRange = timeSelect.value;
      renderDashboard();
    });

    // Add Widget button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary btn-sm';
    addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:0.375rem;"><path d="M12 5v14M5 12h14"/></svg> Add Widget`;
    addBtn.addEventListener('click', () => {
      const newWidget = createDefaultWidgetConfig();
      openConfig(newWidget, true);
    });

    headerRight.appendChild(timeSelect);
    headerRight.appendChild(addBtn);
    header.appendChild(headerLeft);
    header.appendChild(headerRight);
    root.appendChild(header);

    // --- Default config banner ---
    if (!collectionAvailable) {
      const banner = document.createElement('div');
      banner.className = 'dash-banner';
      banner.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
        </svg>
        <span>Create the <code>dashboard_widgets</code> collection in PocketBase to save your dashboard.</span>`;
      root.appendChild(banner);
    }

    if (collectionAvailable && widgets.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center; padding:60px 20px; color:var(--text-secondary);';
      empty.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 12px; opacity:0.4; display:block;">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
        </svg>
        <p style="font-size:1rem; margin-bottom:4px;">Your dashboard is empty</p>
        <p style="font-size:0.85rem;">Click <strong>+ Add Widget</strong> to get started</p>`;
      root.appendChild(empty);
    }

    // --- Widget Grid ---
    const grid = document.createElement('div');
    grid.className = 'dash-grid';
    root.appendChild(grid);

    container.appendChild(root);

    // Render widgets sorted by position.order
    const sorted = [...widgets].sort((a, b) => (a.position?.order ?? 0) - (b.position?.order ?? 0));
    sorted.forEach(w => {
      const { card, gearBtn } = renderWidget(w, grid, globalTimeRange);
      gearBtn.addEventListener('click', () => openConfig(w, false));
    });
  }

  // ======================================================================
  // Widget config modal (add / edit / delete)
  // ======================================================================
  function openConfig(widget, isNew) {
    if (configModal) configModal.destroy();

    configModal = openWidgetConfigModal(widget, {
      onSave: async (draft) => {
        configModal.destroy();
        configModal = null;

        if (isNew) {
          draft.position.order = widgets.length;
          widgets.push(draft);
        } else {
          const idx = widgets.findIndex(w => w.id === widget.id);
          if (idx >= 0) widgets[idx] = draft;
        }

        // Persist to PocketBase if the collection exists
        if (collectionAvailable) {
          try {
            const payload = {
              widget_type: draft.widget_type,
              title: draft.title,
              data_source: draft.data_source,
              config: draft.config,
              position: draft.position,
            };
            if (isNew || draft.id.startsWith('def-') || draft.id.startsWith('new-')) {
              const record = await pb.collection('dashboard_widgets').create(payload);
              draft.id = record.id;
            } else {
              await pb.collection('dashboard_widgets').update(draft.id, payload);
            }
          } catch (e) {
            console.warn('Could not save widget config:', e);
          }
        }

        renderDashboard();
      },

      onDelete: async (w) => {
        configModal.destroy();
        configModal = null;

        widgets = widgets.filter(x => x.id !== w.id);

        if (collectionAvailable && !w.id.startsWith('def-')) {
          try {
            await pb.collection('dashboard_widgets').delete(w.id);
          } catch (e) {
            console.warn('Could not delete widget:', e);
          }
        }

        renderDashboard();
      },

      onCancel: () => {
        configModal.destroy();
        configModal = null;
      },
    });
  }

  // ======================================================================
  // Cleanup
  // ======================================================================
  return {
    destroy() {
      destroyed = true;
      destroyAllCharts();
      if (configModal) {
        configModal.destroy();
        configModal = null;
      }
      container.innerHTML = '';
    },
  };
}
