// Main application entry point
// Initializes auth, sidebar, router, global data cache, and theme.

import { pb } from './api.js';
import { setState } from './state.js';
import { initRouter, addRoute, navigate } from './router.js';
import { initToasts } from './components/toast.js';
import { createSidebar } from './components/sidebar.js';
import { createLoginView } from './views/login.js';
import { createDashboardView } from './views/dashboard.js';
import { createOpportunitiesView } from './views/opportunities.js';
import { createQuotesListView } from './views/quotes-list.js';
import { createCustomersView } from './views/customers.js';
import { createTemplatesView } from './views/templates.js';
import { createMeasurePointTemplatesView } from './views/measure-point-templates.js';
import { createMeasurePointCalculatorView } from './views/measure-point-calculator.js';
import { createInstalledBaseView } from './views/installed-base.js';
import { createConfiguratorView } from './configurator/configurator.js';
import { initCommandPalette } from './components/command-palette.js';
import { createChatFAB } from './components/chat-panel.js';
import { createAiSettingsView } from './views/ai-settings.js';
import { createTextContainersView } from './views/text-containers.js';
import { createDocumentTemplatesView } from './views/document-templates.js';
import { createTemplateBuilderView } from './views/template-builder.js';
import { createPdfGeneratorView } from './views/pdf-generator.js';

// ---------------------------------------------------------------------------
// Theme initialisation (before first paint)
// ---------------------------------------------------------------------------
(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const appRoot = document.getElementById('app');

function boot() {
  appRoot.innerHTML = '';

  if (!pb.authStore.isValid) {
    showLogin();
    return;
  }

  // Authenticated — load global data then show app shell
  setState('currentUser', pb.authStore.model);
  loadGlobalData().then(() => showAppShell());
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
function showLogin() {
  appRoot.innerHTML = '';
  createLoginView(appRoot, {
    onSuccess: () => {
      setState('currentUser', pb.authStore.model);
      loadGlobalData().then(() => showAppShell());
    },
  });
}

// ---------------------------------------------------------------------------
// Global data cache (licenses + customers)
// ---------------------------------------------------------------------------
async function loadGlobalData() {
  try {
    const [licenses, customers] = await Promise.all([
      pb.collection('licenses').getFullList({ sort: 'name', expand: 'possible_SLAs' }),
      pb.collection('customers').getFullList({ sort: 'name' }),
    ]);
    setState('licenses', licenses);
    setState('customers', customers);
  } catch (err) {
    console.error('Failed to load global data:', err);
  }
}

// ---------------------------------------------------------------------------
// App shell (sidebar + main content area)
// ---------------------------------------------------------------------------
function showAppShell() {
  appRoot.innerHTML = '';

  // Init toast system
  initToasts();

  // Init command palette (⌘K / Ctrl+K)
  initCommandPalette();

  // Wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'flex';
  wrapper.style.minHeight = '100vh';

  // Main content
  const main = document.createElement('main');
  main.className = 'main-content';
  main.id = 'main-content';

  // Sidebar
  const sidebar = createSidebar({
    userEmail: pb.authStore.model?.email || 'User',
    onCollapsedChange: (collapsed) => {
      main.classList.toggle('sidebar-collapsed', collapsed);
    },
  });

  wrapper.appendChild(sidebar.element);
  wrapper.appendChild(main);
  appRoot.appendChild(wrapper);

  // Floating AI chat button
  createChatFAB();

  // --- Register routes ---
  registerRoutes(main);

  // Start router
  initRouter(main);
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

// Temporary storage for cross-route data (e.g. customer filter passed from
// the Customers view to Opportunities)
let _routeState = {};

/** Store data to be read by the next route */
export function setRouteState(data) {
  _routeState = { ..._routeState, ...data };
}
/** Read and clear route state */
export function consumeRouteState() {
  const d = _routeState;
  _routeState = {};
  return d;
}

function registerRoutes(main) {
  // Dashboard
  addRoute('/dashboard', (container) => {
    return createDashboardView(container);
  });

  // Opportunities
  addRoute('/opportunities', (container) => {
    const state = consumeRouteState();
    return createOpportunitiesView(container, state);
  });

  // All Quotes
  addRoute('/allQuotes', (container) => {
    return createQuotesListView(container);
  });

  // Customers
  addRoute('/customers', (container) => {
    return createCustomersView(container);
  });

  // Installed Base
  addRoute('/installedBase', (container) => {
    return createInstalledBaseView(container);
  });

  // Measure Point Templates
  addRoute('/measurePointTemplates', (container) => {
    return createMeasurePointTemplatesView(container);
  });

  // Measure Point Calculator (standalone)
  addRoute('/measurePointCalculator', (container) => {
    return createMeasurePointCalculatorView(container, {});
  });

  // Templates list
  addRoute('/templates', (container) => {
    return createTemplatesView(container);
  });

  // Template configurator
  addRoute('/templates/:templateId', (container, params) => {
    return createConfiguratorView(container, {
      oppId: null,
      quoteId: null,
      templateId: params.templateId,
      onBack: () => navigate('/templates'),
    });
  });

  // Quotes for an opportunity
  addRoute('/opportunities/:oppId/quotes', (container, params) => {
    return createQuotesListView(container, { oppId: params.oppId });
  });

  // New quote in configurator
  addRoute('/opportunities/:oppId/quotes/new', (container, params) => {
    return createConfiguratorView(container, {
      oppId: params.oppId,
      quoteId: null,
      templateId: null,
      onBack: () => navigate(`/opportunities/${params.oppId}/quotes`),
    });
  });

  // Edit existing quote in configurator
  addRoute('/opportunities/:oppId/quotes/:quoteId', (container, params) => {
    return createConfiguratorView(container, {
      oppId: params.oppId,
      quoteId: params.quoteId,
      templateId: null,
      onBack: () => navigate(`/opportunities/${params.oppId}/quotes`),
    });
  });

  // AI Settings
  addRoute('/ai-settings', (container) => {
    return createAiSettingsView(container);
  });

  // Text Containers
  addRoute('/text-containers', (container) => {
    return createTextContainersView(container);
  });

  // Document Templates list
  addRoute('/document-templates', (container) => {
    return createDocumentTemplatesView(container);
  });

  // Document Template Builder
  addRoute('/document-templates/:templateId', (container, params) => {
    return createTemplateBuilderView(container, { templateId: params.templateId });
  });

  // PDF Generator
  addRoute('/pdf-generator', (container) => {
    return createPdfGeneratorView(container);
  });
}

// ---------------------------------------------------------------------------
// Listen for auth invalidation
// ---------------------------------------------------------------------------
pb.authStore.onChange(() => {
  if (!pb.authStore.isValid) {
    showLogin();
  }
});

// Kick things off
boot();
