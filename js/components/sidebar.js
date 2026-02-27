// Sidebar component
// Ported from React Sidebar.tsx - full sidebar with navigation, theme toggle, user info

import { pb } from '../api.js';
import { navigate, getCurrentPath } from '../router.js';

// ---------------------------------------------------------------------------
// SVG icon markup (matching the React source exactly)
// ---------------------------------------------------------------------------
const ICONS = {
  collapse: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v16.5h16.5V3.75H3.75zM9 3.75v16.5" /></svg>',

  dashboard: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>',

  opportunities: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>',

  quotes: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>',

  customers: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>',

  installedBase: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>',

  measurePoints: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" /></svg>',

  templates: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>',

  moon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>',

  sun: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>',

  logout: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>',
};

// ---------------------------------------------------------------------------
// Navigation structure
// ---------------------------------------------------------------------------
const NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    ],
  },
  {
    title: 'Sales',
    items: [
      { key: 'opportunities', label: 'Opportunities', icon: 'opportunities', route: '/opportunities',
        // Active when viewing opportunities, quotes sub-views, or configurator
        isActive: (path) => path.startsWith('/opportunities') || path.startsWith('/quotes') || path.startsWith('/configurator') },
      { key: 'allQuotes', label: 'Quotes', icon: 'quotes', route: '/allQuotes' },
    ],
  },
  {
    title: 'Management',
    items: [
      { key: 'customers', label: 'Customers', icon: 'customers', route: '/customers' },
      { key: 'installedBase', label: 'Installed Base', icon: 'installedBase', route: '/installedBase' },
      { key: 'measurePointTemplates', label: 'Measure Points', icon: 'measurePoints', route: '/measurePointTemplates' },
      { key: 'templates', label: 'Templates', icon: 'templates', route: '/templates' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Inject sidebar-specific styles (mirrors the SCSS module)
// ---------------------------------------------------------------------------
function ensureSidebarStyles() {
  if (document.getElementById('sidebar-component-styles')) return;
  const style = document.createElement('style');
  style.id = 'sidebar-component-styles';
  style.textContent = `
    .sidebar {
      position: fixed; left: 0; top: 0; bottom: 0;
      width: var(--sidebar-width, 260px);
      background: var(--surface);
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      z-index: 40;
      transition: width 0.2s ease;
    }
    .sidebar.collapsed { width: 68px; }

    /* Header */
    .sidebar-header {
      padding: 1.25rem;
      display: flex; align-items: center; gap: 0.75rem;
      justify-content: space-between;
    }
    .sidebar.collapsed .sidebar-header {
      justify-content: center;
      padding: 1.25rem 0.75rem;
    }
    .sidebar-header-left {
      display: flex; align-items: center; gap: 0.75rem;
      overflow: hidden;
    }
    .sidebar.collapsed .sidebar-header-left { display: none; }
    .sidebar-logo {
      width: 32px; height: 32px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 700; font-size: 14px;
      flex-shrink: 0;
    }
    .sidebar-brand {
      font-weight: 600; white-space: nowrap;
      opacity: 1; transition: opacity 0.2s ease;
    }
    .sidebar.collapsed .sidebar-brand { opacity: 0; width: 0; }

    .sidebar-toggle-btn {
      background: transparent; border: none; border-radius: 6px;
      padding: 6px; cursor: pointer; color: var(--text-secondary);
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s; flex-shrink: 0;
    }
    .sidebar-toggle-btn:hover { background: var(--bg); color: var(--text-main); }
    .sidebar-toggle-btn svg { width: 20px; height: 20px; }

    /* Nav */
    .sidebar-nav {
      flex: 1; padding: 1rem; overflow-y: auto;
      scrollbar-width: none; -ms-overflow-style: none;
    }
    .sidebar-nav::-webkit-scrollbar { display: none; }

    .sidebar-section { margin-bottom: 1.5rem; }
    .sidebar-section-title {
      font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.05em; color: var(--text-secondary);
      padding: 0 0.75rem; margin-bottom: 0.5rem;
      white-space: nowrap; overflow: hidden;
      transition: opacity 0.2s ease, width 0.2s ease;
    }
    .sidebar.collapsed .sidebar-section-title {
      opacity: 0; height: 0; margin: 0; padding: 0;
    }

    .sidebar-item {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.625rem 0.75rem; border-radius: 0.5rem;
      font-size: 0.875rem; font-weight: 500;
      color: var(--text-secondary); cursor: pointer;
      transition: all 0.15s;
      border: none; background: transparent; width: 100%; text-align: left;
      position: relative;
    }
    .sidebar-item:hover { background: var(--surface-hover); color: var(--text-main); }
    .sidebar-item.active { background: var(--primary-light); color: var(--primary); }
    .sidebar-item svg { width: 20px; height: 20px; flex-shrink: 0; }
    .sidebar.collapsed .sidebar-item {
      justify-content: center; padding: 0.625rem; gap: 0;
    }

    .sidebar-item-text {
      white-space: nowrap; overflow: hidden;
      transition: opacity 0.2s ease, width 0.2s ease;
    }
    .sidebar.collapsed .sidebar-item-text {
      opacity: 0; width: 0; position: absolute;
    }

    /* Tooltip (visible only when collapsed) */
    .sidebar-tooltip {
      position: absolute; left: 100%; top: 50%;
      transform: translateY(-50%); margin-left: 12px;
      padding: 6px 10px; background: var(--text-main);
      color: var(--surface); font-size: 0.75rem; font-weight: 500;
      border-radius: 6px; white-space: nowrap;
      opacity: 0; visibility: hidden;
      transition: opacity 0.15s, visibility 0.15s;
      z-index: 50; pointer-events: none;
    }
    .sidebar-tooltip::before {
      content: ''; position: absolute; right: 100%; top: 50%;
      transform: translateY(-50%);
      border: 5px solid transparent;
      border-right-color: var(--text-main);
    }
    .sidebar.collapsed .sidebar-item:hover .sidebar-tooltip,
    .sidebar.collapsed .sidebar-theme-toggle:hover .sidebar-tooltip {
      opacity: 1; visibility: visible;
    }

    /* Footer */
    .sidebar-footer {
      padding: 1rem; border-top: 1px solid var(--border);
      display: flex; flex-direction: column; gap: 0.5rem;
    }
    .sidebar.collapsed .sidebar-footer { padding: 0.75rem; }

    .sidebar-theme-toggle {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.625rem 0.75rem; border-radius: 0.5rem;
      font-size: 0.875rem; font-weight: 500;
      color: var(--text-secondary); cursor: pointer;
      transition: all 0.15s;
      border: none; background: transparent; width: 100%; text-align: left;
      position: relative;
    }
    .sidebar-theme-toggle:hover { background: var(--surface-hover); color: var(--text-main); }
    .sidebar-theme-toggle svg { width: 20px; height: 20px; flex-shrink: 0; }
    .sidebar.collapsed .sidebar-theme-toggle {
      justify-content: center; padding: 0.625rem; gap: 0;
    }
    .sidebar-theme-toggle-text {
      white-space: nowrap; overflow: hidden;
      transition: opacity 0.2s ease, width 0.2s ease;
    }
    .sidebar.collapsed .sidebar-theme-toggle-text {
      opacity: 0; width: 0; position: absolute;
    }

    .sidebar-user {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.5rem; border-radius: 0.5rem;
    }
    .sidebar.collapsed .sidebar-user {
      justify-content: center; padding: 0.25rem; gap: 0;
    }
    .sidebar-avatar {
      width: 36px; height: 36px;
      background: var(--primary-light); border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: var(--primary); font-weight: 600; font-size: 14px;
      flex-shrink: 0;
    }
    .sidebar-user-info {
      flex: 1; min-width: 0;
      transition: opacity 0.2s ease, width 0.2s ease;
    }
    .sidebar.collapsed .sidebar-user-info {
      opacity: 0; width: 0; overflow: hidden;
    }
    .sidebar-user-name {
      font-size: 0.875rem; font-weight: 500;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .sidebar-user-role { font-size: 0.75rem; color: var(--text-secondary); }

    .sidebar-logout-btn {
      transition: opacity 0.2s ease;
    }
    .sidebar.collapsed .sidebar-logout-btn {
      opacity: 0; width: 0; overflow: hidden; padding: 0;
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// createSidebar
// ---------------------------------------------------------------------------

/**
 * Create the application sidebar.
 *
 * @param {Object} opts
 * @param {string}   opts.userEmail         - Current user email.
 * @param {Function} [opts.onCollapsedChange] - Called with (collapsed) boolean.
 * @returns {{ element: HTMLElement, setActiveView: Function, destroy: Function }}
 */
export function createSidebar({ userEmail, onCollapsedChange }) {
  ensureSidebarStyles();

  let collapsed = false;
  let activeView = 'dashboard';
  let theme = document.documentElement.getAttribute('data-theme') || 'light';

  // --- Root aside ---
  const aside = document.createElement('aside');
  aside.className = 'sidebar';

  // -------------------------------------------------------------------------
  // Header
  // -------------------------------------------------------------------------
  const headerDiv = document.createElement('div');
  headerDiv.className = 'sidebar-header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'sidebar-header-left';

  const logo = document.createElement('div');
  logo.className = 'sidebar-logo';
  logo.textContent = 'NE';

  const brand = document.createElement('span');
  brand.className = 'sidebar-brand';
  brand.textContent = 'NixEasy';

  headerLeft.appendChild(logo);
  headerLeft.appendChild(brand);

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'sidebar-toggle-btn';
  toggleBtn.title = 'Collapse';
  toggleBtn.innerHTML = ICONS.collapse;
  toggleBtn.addEventListener('click', () => {
    collapsed = !collapsed;
    aside.classList.toggle('collapsed', collapsed);
    toggleBtn.title = collapsed ? 'Expand' : 'Collapse';
    if (typeof onCollapsedChange === 'function') onCollapsedChange(collapsed);
  });

  headerDiv.appendChild(headerLeft);
  headerDiv.appendChild(toggleBtn);
  aside.appendChild(headerDiv);

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------
  const nav = document.createElement('nav');
  nav.className = 'sidebar-nav';

  // Search trigger (opens command palette)
  const searchBtn = document.createElement('button');
  searchBtn.className = 'sidebar-search-btn';
  searchBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;flex-shrink:0;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><span>Search…</span><kbd>${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'}K</kbd>`;
  searchBtn.addEventListener('click', () => {
    import('./command-palette.js').then(m => m.openCommandPalette());
  });
  nav.appendChild(searchBtn);

  /** Map of view key -> button element for active-state management */
  const navButtons = {};

  NAV_SECTIONS.forEach((section) => {
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'sidebar-section';

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'sidebar-section-title';
    sectionTitle.textContent = section.title;
    sectionDiv.appendChild(sectionTitle);

    section.items.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'sidebar-item';
      btn.innerHTML = ICONS[item.icon] || '';

      const textSpan = document.createElement('span');
      textSpan.className = 'sidebar-item-text';
      textSpan.textContent = item.label;
      btn.appendChild(textSpan);

      const tooltip = document.createElement('span');
      tooltip.className = 'sidebar-tooltip';
      tooltip.textContent = item.label;
      btn.appendChild(tooltip);

      btn.addEventListener('click', () => {
        navigate(item.route);
        setActiveView(item.key);
      });

      navButtons[item.key] = btn;
      sectionDiv.appendChild(btn);
    });

    nav.appendChild(sectionDiv);
  });

  aside.appendChild(nav);

  // -------------------------------------------------------------------------
  // Footer
  // -------------------------------------------------------------------------
  const footer = document.createElement('div');
  footer.className = 'sidebar-footer';

  // Theme toggle
  const themeBtn = document.createElement('button');
  themeBtn.className = 'sidebar-theme-toggle';

  function renderThemeButton() {
    themeBtn.innerHTML = theme === 'light' ? ICONS.moon : ICONS.sun;

    const themeText = document.createElement('span');
    themeText.className = 'sidebar-theme-toggle-text';
    themeText.textContent = theme === 'light' ? 'Dark mode' : 'Light mode';
    themeBtn.appendChild(themeText);

    const themeTooltip = document.createElement('span');
    themeTooltip.className = 'sidebar-tooltip';
    themeTooltip.textContent = theme === 'light' ? 'Dark mode' : 'Light mode';
    themeBtn.appendChild(themeTooltip);

    themeBtn.title = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  }
  renderThemeButton();

  themeBtn.addEventListener('click', () => {
    theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    renderThemeButton();
  });

  footer.appendChild(themeBtn);

  // User info row
  const userRow = document.createElement('div');
  userRow.className = 'sidebar-user';

  const avatar = document.createElement('div');
  avatar.className = 'sidebar-avatar';
  avatar.textContent = userEmail ? userEmail.charAt(0).toUpperCase() : '?';

  const userInfo = document.createElement('div');
  userInfo.className = 'sidebar-user-info';

  const userName = document.createElement('div');
  userName.className = 'sidebar-user-name';
  userName.textContent = userEmail;

  const userRole = document.createElement('div');
  userRole.className = 'sidebar-user-role';
  userRole.textContent = 'User';

  userInfo.appendChild(userName);
  userInfo.appendChild(userRole);

  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'btn btn-ghost btn-icon sidebar-logout-btn';
  logoutBtn.title = 'Logout';
  logoutBtn.innerHTML = ICONS.logout;
  logoutBtn.addEventListener('click', () => {
    pb.authStore.clear();
    window.location.reload();
  });

  userRow.appendChild(avatar);
  userRow.appendChild(userInfo);
  userRow.appendChild(logoutBtn);
  footer.appendChild(userRow);

  aside.appendChild(footer);

  // -------------------------------------------------------------------------
  // OS theme listener
  // -------------------------------------------------------------------------
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  function handleOsThemeChange(e) {
    if (!localStorage.getItem('theme')) {
      theme = e.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      renderThemeButton();
    }
  }
  mediaQuery.addEventListener('change', handleOsThemeChange);

  // -------------------------------------------------------------------------
  // Active-view management
  // -------------------------------------------------------------------------
  function setActiveView(view) {
    activeView = view;
    const currentPath = getCurrentPath();

    Object.entries(navButtons).forEach(([key, btn]) => {
      // Determine active state
      const section = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.key === key);
      let isActive = false;

      if (section && section.isActive) {
        // Custom active-check function (e.g. opportunities includes sub-routes)
        isActive = section.isActive(currentPath);
      } else if (key === view) {
        isActive = true;
      } else if (section) {
        isActive = currentPath.startsWith(section.route);
      }

      btn.classList.toggle('active', isActive);
    });
  }

  // Sync with hash on route change
  function onHashChange() {
    const path = getCurrentPath();
    // Determine which view key matches
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        if (item.isActive) {
          if (item.isActive(path)) {
            setActiveView(item.key);
            return;
          }
        } else if (path === item.route || path.startsWith(item.route + '/')) {
          setActiveView(item.key);
          return;
        }
      }
    }
  }
  window.addEventListener('hashchange', onHashChange);

  // Set initial active view from current hash
  onHashChange();

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------
  function destroy() {
    mediaQuery.removeEventListener('change', handleOsThemeChange);
    window.removeEventListener('hashchange', onHashChange);
    if (aside.parentNode) aside.parentNode.removeChild(aside);
  }

  return { element: aside, setActiveView, destroy };
}
