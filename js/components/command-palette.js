// Command Palette — Spotlight-style ⌘K / Ctrl+K search
// Searches opportunities, quotes, customers + quick actions
// Fuzzy ranking: exact > starts-with > word-boundary > contains, recency boost

import { pb } from '../api.js';
import { navigate } from '../router.js';
import { currency } from '../utils/format.js';

const ICONS = {
  opp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:16px;height:16px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"/></svg>',
  quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:16px;height:16px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>',
  customer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:16px;height:16px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/></svg>',
  action: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:16px;height:16px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg>',
  nav: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:16px;height:16px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg>',
};

// Status badge colors (indigo monochrome)
const STATUS_COLORS = {
  'NEW': '#4f46e5', 'CALCULATED': '#4338ca', 'QUOTE SEND': '#6366f1',
  'IN PROGRESS': '#818cf8', 'ORDERED': '#a5b4fc', 'WON': '#312e81',
  'LOST': '#c7d2fe', 'ON HOLD': '#e0e7ff', 'STORNO': '#e0e7ff',
};

// ─── Scoring ────────────────────────────────────────────────

function scoreMatch(query, text) {
  if (!text || !query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact match
  if (t === q) return 100;
  // Starts with
  if (t.startsWith(q)) return 80;
  // Word boundary match (e.g. "infra" matches "ÖBB-Infrastruktur")
  const words = t.split(/[\s\-_.,/]+/);
  if (words.some(w => w.startsWith(q))) return 60;
  // Contains
  if (t.includes(q)) return 40;
  // Fuzzy: all chars in order
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  if (qi === q.length) return 20;

  return 0;
}

function recencyBoost(dateStr) {
  if (!dateStr) return 0;
  const age = Date.now() - new Date(dateStr).getTime();
  const days = age / 86400_000;
  if (days < 1) return 15;
  if (days < 7) return 10;
  if (days < 30) return 5;
  return 0;
}

// ─── Data fetching ──────────────────────────────────────────

let cache = { opps: [], quotes: [], customers: [], ts: 0 };
const CACHE_TTL = 30_000; // 30s

async function ensureData() {
  if (cache.ts > 0 && Date.now() - cache.ts < CACHE_TTL) return;
  const [opps, quotes, customers] = await Promise.all([
    pb.collection('opportunities').getFullList({ expand: 'customer', sort: '-updated', requestKey: null }).catch(() => []),
    pb.collection('quotes').getFullList({ expand: 'opportunity,opportunity.customer', sort: '-updated', requestKey: null }).catch(() => []),
    pb.collection('customers').getFullList({ sort: 'name', requestKey: null }).catch(() => []),
  ]);
  cache = { opps, quotes, customers, ts: Date.now() };
}

// ─── Search ─────────────────────────────────────────────────

function searchAll(query) {
  const q = query.trim();
  if (!q) {
    const actions = getQuickActions('');
    return actions.length > 0 ? [{ label: 'Quick Actions', items: actions }] : [];
  }

  const results = [];

  // Opportunities
  cache.opps.forEach(o => {
    const fields = [
      o.title,
      o.expand?.customer?.name,
      o.opportunity?.toString(),
      o.status,
    ].filter(Boolean);
    const best = Math.max(...fields.map(f => scoreMatch(q, f)));
    if (best > 0) {
      results.push({
        type: 'opportunity',
        icon: ICONS.opp,
        title: o.title || `Opportunity #${o.opportunity}`,
        subtitle: [o.expand?.customer?.name, o.status, currency(Number(o.capex) || 0)].filter(Boolean).join(' · '),
        badge: o.status,
        badgeColor: STATUS_COLORS[o.status],
        score: best + recencyBoost(o.updated),
        action: () => navigate(`/opportunities/${o.id}/quotes`),
      });
    }
  });

  // Quotes
  cache.quotes.forEach(q_ => {
    const opp = q_.expand?.opportunity;
    const fields = [
      q_.name,
      opp?.title,
      opp?.expand?.customer?.name,
      q_.id,
    ].filter(Boolean);
    const best = Math.max(...fields.map(f => scoreMatch(q, f)));
    if (best > 0) {
      const vk = q_.quote_data?.summary?.vk;
      results.push({
        type: 'quote',
        icon: ICONS.quote,
        title: q_.name || `Quote ${q_.id.slice(0, 8)}`,
        subtitle: [opp?.title, opp?.expand?.customer?.name, vk ? currency(vk) : null].filter(Boolean).join(' · '),
        score: best + recencyBoost(q_.updated),
        action: () => {
          if (opp?.id) navigate(`/opportunities/${opp.id}/quotes/${q_.id}`);
        },
      });
    }
  });

  // Customers
  cache.customers.forEach(c => {
    const fields = [c.name, c.debitor?.toString()].filter(Boolean);
    const best = Math.max(...fields.map(f => scoreMatch(q, f)));
    if (best > 0) {
      results.push({
        type: 'customer',
        icon: ICONS.customer,
        title: c.name,
        subtitle: c.debitor ? `Debitor ${c.debitor}` : '',
        score: best + recencyBoost(c.updated),
        action: () => navigate('/customers'),
      });
    }
  });

  // Quick actions that match the query
  const actions = getQuickActions(q);

  // Sort by score desc, then by type priority
  results.sort((a, b) => b.score - a.score);

  // Group by type
  const grouped = [];
  const types = ['opportunity', 'quote', 'customer'];
  const labels = { opportunity: 'Opportunities', quote: 'Quotes', customer: 'Customers' };

  types.forEach(type => {
    const items = results.filter(r => r.type === type).slice(0, 5);
    if (items.length > 0) {
      grouped.push({ label: labels[type], items });
    }
  });

  // Prepend actions
  if (actions.length > 0) {
    grouped.unshift({ label: 'Actions', items: actions });
  }

  return grouped;
}

function getQuickActions(query) {
  const actions = [
    { type: 'action', icon: ICONS.action, title: 'New Quote', subtitle: 'Create a new quote', keywords: 'new quote create', action: () => navigate('/allQuotes'), score: 50 },
    { type: 'action', icon: ICONS.action, title: 'New Opportunity', subtitle: 'Create a new opportunity', keywords: 'new opportunity create', action: () => navigate('/opportunities'), score: 50 },
    { type: 'action', icon: ICONS.nav, title: 'Dashboard', subtitle: 'Go to dashboard', keywords: 'dashboard home overview', action: () => navigate('/dashboard'), score: 45 },
    { type: 'action', icon: ICONS.nav, title: 'Opportunities', subtitle: 'View all opportunities', keywords: 'opportunities pipeline deals', action: () => navigate('/opportunities'), score: 40 },
    { type: 'action', icon: ICONS.nav, title: 'Quotes', subtitle: 'View all quotes', keywords: 'quotes list', action: () => navigate('/allQuotes'), score: 40 },
    { type: 'action', icon: ICONS.nav, title: 'Customers', subtitle: 'View all customers', keywords: 'customers accounts', action: () => navigate('/customers'), score: 40 },
    { type: 'action', icon: ICONS.nav, title: 'Installed Base', subtitle: 'View installed base', keywords: 'installed base licenses', action: () => navigate('/installedBase'), score: 35 },
    { type: 'action', icon: ICONS.nav, title: 'Templates', subtitle: 'Quote templates', keywords: 'templates presets', action: () => navigate('/templates'), score: 35 },
  ];

  if (!query) return actions.slice(0, 4); // show top 4 when empty

  const q = query.toLowerCase();
  return actions
    .map(a => ({ ...a, score: Math.max(scoreMatch(q, a.title), scoreMatch(q, a.keywords)) }))
    .filter(a => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

// ─── UI ─────────────────────────────────────────────────────

let overlay = null;
let selectedIndex = 0;
let flatItems = [];

function open() {
  if (overlay) return;

  overlay = document.createElement('div');
  overlay.className = 'cmd-palette-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const card = document.createElement('div');
  card.className = 'cmd-palette';

  // Search input
  const inputWrap = document.createElement('div');
  inputWrap.className = 'cmd-palette-input-wrap';
  const searchIcon = document.createElement('span');
  searchIcon.className = 'cmd-palette-search-icon';
  searchIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
  const input = document.createElement('input');
  input.className = 'cmd-palette-input';
  input.type = 'text';
  input.placeholder = 'Search or type a command…';
  input.spellcheck = false;
  input.autocomplete = 'off';

  const shortcutHint = document.createElement('span');
  shortcutHint.className = 'cmd-palette-hint';
  shortcutHint.textContent = 'ESC';

  inputWrap.appendChild(searchIcon);
  inputWrap.appendChild(input);
  inputWrap.appendChild(shortcutHint);
  card.appendChild(inputWrap);

  // Results container
  const resultsEl = document.createElement('div');
  resultsEl.className = 'cmd-palette-results';
  card.appendChild(resultsEl);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'cmd-palette-footer';
  footer.innerHTML = '<span><kbd>↑↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span><kbd>ESC</kbd> Close</span>';
  card.appendChild(footer);

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Focus
  requestAnimationFrame(() => input.focus());

  // Render immediately with whatever we have (actions always work)
  function doSearch() {
    if (!overlay) return;
    selectedIndex = 0;
    renderResults(resultsEl, searchAll(input.value));
  }

  doSearch();

  // Load data in background, re-render when ready
  ensureData().then(doSearch).catch(err => {
    console.error('Command palette: failed to load data', err);
    doSearch(); // still render actions
  });

  // Debounced search — render immediately, don't block on data
  let debounce = null;
  let dataLoaded = cache.ts > 0;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      doSearch();
      // If data hasn't loaded yet, trigger a load and re-render
      if (!dataLoaded) {
        ensureData().then(() => { dataLoaded = true; doSearch(); }).catch(() => {});
      }
    }, 80);
  });

  // Keyboard navigation
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, flatItems.length - 1);
      updateSelection(resultsEl);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelection(resultsEl);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatItems[selectedIndex];
      if (item?.action) {
        close();
        item.action();
      }
      return;
    }
  });

}

function close() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  selectedIndex = 0;
  flatItems = [];
}

function renderResults(container, groups) {
  container.innerHTML = '';
  flatItems = [];

  if (groups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cmd-palette-empty';
    empty.textContent = 'No results found';
    container.appendChild(empty);
    return;
  }

  groups.forEach(group => {
    const section = document.createElement('div');
    section.className = 'cmd-palette-section';

    const label = document.createElement('div');
    label.className = 'cmd-palette-section-label';
    label.textContent = group.label;
    section.appendChild(label);

    group.items.forEach(item => {
      const idx = flatItems.length;
      flatItems.push(item);

      const row = document.createElement('div');
      row.className = 'cmd-palette-item';
      row.dataset.index = idx;
      if (idx === selectedIndex) row.classList.add('selected');

      row.innerHTML = `
        <div class="cmd-palette-item-icon">${item.icon}</div>
        <div class="cmd-palette-item-text">
          <div class="cmd-palette-item-title">${escapeHtml(item.title)}</div>
          ${item.subtitle ? `<div class="cmd-palette-item-sub">${escapeHtml(item.subtitle)}</div>` : ''}
        </div>
        ${item.badge ? `<span class="cmd-palette-badge" style="background:${item.badgeColor || '#4f46e5'}20;color:${item.badgeColor || '#4f46e5'}">${escapeHtml(item.badge)}</span>` : ''}
      `;

      row.addEventListener('click', () => {
        close();
        item.action();
      });

      row.addEventListener('mouseenter', () => {
        selectedIndex = idx;
        updateSelection(container);
      });

      section.appendChild(row);
    });

    container.appendChild(section);
  });
}

function updateSelection(container) {
  container.querySelectorAll('.cmd-palette-item').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.index) === selectedIndex);
  });
  // Scroll selected into view
  const sel = container.querySelector('.cmd-palette-item.selected');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Global shortcut ────────────────────────────────────────

export function initCommandPalette() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (overlay) close(); else open();
    }
  });
}

export { open as openCommandPalette, close as closeCommandPalette };
