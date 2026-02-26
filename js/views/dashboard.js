// Dashboard View
// Ported from React DashboardView.tsx (314 lines) - full dashboard with stats, value cards,
// recent opportunities table, and status breakdown with progress bars

import { pb } from '../api.js';
import { currency } from '../utils/format.js';
import { navigate } from '../router.js';

// --- Helpers ---

function getStatusColor(status) {
  const colors = {
    'NEW': 'var(--primary)',
    'WON': 'var(--success)',
    'LOST': 'var(--danger)',
    'ON HOLD': 'var(--warning)',
    'QUOTING': 'var(--info, #3b82f6)',
  };
  return colors[status] || 'var(--text-secondary)';
}

function getStatusBg(status) {
  const colors = {
    'NEW': 'rgba(99, 102, 241, 0.1)',
    'WON': 'rgba(34, 197, 94, 0.1)',
    'LOST': 'rgba(239, 68, 68, 0.1)',
    'ON HOLD': 'rgba(234, 179, 8, 0.1)',
    'QUOTING': 'rgba(59, 130, 246, 0.1)',
  };
  return colors[status] || 'var(--bg)';
}

/**
 * Create the dashboard view with summary cards, value cards, recent opportunities,
 * and opportunities-by-status breakdown.
 *
 * @param {HTMLElement} container
 */
export function createDashboardView(container) {
  container.innerHTML = '';

  // Inject keyframe for spinner (idempotent)
  if (!document.getElementById('dashboard-spin-style')) {
    const style = document.createElement('style');
    style.id = 'dashboard-spin-style';
    style.textContent = `
      @keyframes spin { to { transform: rotate(360deg); } }
      .dash-hover-row:hover { background: var(--bg); }
    `;
    document.head.appendChild(style);
  }

  // --- Loading state ---
  const loadingWrap = document.createElement('div');
  loadingWrap.className = 'p-6 flex items-center justify-center';
  loadingWrap.style.minHeight = '50vh';

  const loadingInner = document.createElement('div');
  loadingInner.style.textAlign = 'center';

  const spinner = document.createElement('div');
  spinner.className = 'spinner mb-4';
  spinner.style.cssText = [
    'width:40px', 'height:40px',
    'border:3px solid var(--border)',
    'border-top-color:var(--primary)',
    'border-radius:50%',
    'animation:spin 1s linear infinite',
    'margin:0 auto',
  ].join(';') + ';';

  const loadingText = document.createElement('p');
  loadingText.style.color = 'var(--text-secondary)';
  loadingText.textContent = 'Loading dashboard...';

  loadingInner.appendChild(spinner);
  loadingInner.appendChild(loadingText);
  loadingWrap.appendChild(loadingInner);
  container.appendChild(loadingWrap);

  // --- Fetch data & render ---
  fetchAndRender();

  async function fetchAndRender() {
    let stats;
    try {
      const [customers, opportunities, quotes, licenses] = await Promise.all([
        pb.collection('customers').getList(1, 1),
        pb.collection('opportunities').getFullList({ expand: 'customer' }),
        pb.collection('quotes').getList(1, 1),
        pb.collection('licenses').getList(1, 1),
      ]);

      const statusCounts = {};
      let wonValue = 0;
      let pipelineValue = 0;

      opportunities.forEach((opp) => {
        statusCounts[opp.status] = (statusCounts[opp.status] || 0) + 1;
        const total = (opp.capex || 0) + (opp.opex_monthly || 0) * (opp.contract_term_months || 12);
        if (opp.status === 'WON') {
          wonValue += total;
        } else if (opp.status !== 'LOST') {
          pipelineValue += total;
        }
      });

      const recentOpps = opportunities
        .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
        .slice(0, 5);

      stats = {
        totalCustomers: customers.totalItems,
        totalOpportunities: opportunities.length,
        totalQuotes: quotes.totalItems,
        totalLicenses: licenses.totalItems,
        opportunitiesByStatus: statusCounts,
        recentOpportunities: recentOpps,
        wonValue,
        pipelineValue,
      };
    } catch (e) {
      console.error('Failed to fetch dashboard stats:', e);
      stats = {
        totalCustomers: 0, totalOpportunities: 0, totalQuotes: 0, totalLicenses: 0,
        opportunitiesByStatus: {}, recentOpportunities: [], wonValue: 0, pipelineValue: 0,
      };
    }

    // Remove loading indicator
    container.innerHTML = '';
    renderDashboard(stats);
  }

  function renderDashboard(stats) {
    const root = document.createElement('div');
    root.className = 'p-6';

    // --- Page header ---
    const pageHeader = document.createElement('header');
    pageHeader.className = 'mb-6';
    const h1 = document.createElement('h1');
    h1.style.cssText = 'font-size:1.5rem;font-weight:600;margin-bottom:0.25rem;';
    h1.textContent = 'Dashboard';
    const headerSub = document.createElement('p');
    headerSub.style.cssText = 'color:var(--text-secondary);font-size:0.875rem;';
    headerSub.textContent = "Welcome back! Here's an overview of your business.";
    pageHeader.appendChild(h1);
    pageHeader.appendChild(headerSub);
    root.appendChild(pageHeader);

    // --- Summary Cards ---
    const summaryGrid = document.createElement('div');
    summaryGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;margin-bottom:1.5rem;';

    const summaryCards = [
      {
        label: 'Customers',
        value: stats.totalCustomers,
        bg: 'rgba(99, 102, 241, 0.1)',
        stroke: 'var(--primary)',
        iconPath: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
      },
      {
        label: 'Opportunities',
        value: stats.totalOpportunities,
        bg: 'rgba(34, 197, 94, 0.1)',
        stroke: 'var(--success)',
        iconPath: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
      },
      {
        label: 'Quotes',
        value: stats.totalQuotes,
        bg: 'rgba(59, 130, 246, 0.1)',
        stroke: '#3b82f6',
        iconPath: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
      },
      {
        label: 'Licenses',
        value: stats.totalLicenses,
        bg: 'rgba(168, 85, 247, 0.1)',
        stroke: '#a855f7',
        iconPath: 'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z',
      },
    ];

    summaryCards.forEach((cfg) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.padding = '1.25rem';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:0.75rem;';

      // Icon circle
      const iconWrap = document.createElement('div');
      iconWrap.style.cssText = `width:48px;height:48px;border-radius:12px;background:${cfg.bg};display:flex;align-items:center;justify-content:center;`;

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('stroke-width', '1.5');
      svg.setAttribute('stroke', cfg.stroke);
      svg.style.cssText = 'width:24px;height:24px;';
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('d', cfg.iconPath);
      svg.appendChild(path);
      iconWrap.appendChild(svg);

      // Text
      const textWrap = document.createElement('div');
      const labelEl = document.createElement('p');
      labelEl.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;';
      labelEl.textContent = cfg.label;
      const valueEl = document.createElement('p');
      valueEl.style.cssText = 'font-size:1.5rem;font-weight:600;';
      valueEl.textContent = cfg.value;
      textWrap.appendChild(labelEl);
      textWrap.appendChild(valueEl);

      row.appendChild(iconWrap);
      row.appendChild(textWrap);
      card.appendChild(row);
      summaryGrid.appendChild(card);
    });

    root.appendChild(summaryGrid);

    // --- Value Cards ---
    const valueGrid = document.createElement('div');
    valueGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:1rem;margin-bottom:1.5rem;';

    // Won Revenue
    const wonCard = document.createElement('div');
    wonCard.className = 'card';
    wonCard.style.cssText = 'padding:1.25rem;background:linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.05));';

    const wonLabel = document.createElement('p');
    wonLabel.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;';
    wonLabel.textContent = 'Won Revenue';
    const wonValue = document.createElement('p');
    wonValue.style.cssText = 'font-size:1.75rem;font-weight:700;color:var(--success);';
    wonValue.textContent = currency(stats.wonValue);
    const wonSub = document.createElement('p');
    wonSub.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);margin-top:0.25rem;';
    wonSub.textContent = `${stats.opportunitiesByStatus['WON'] || 0} won opportunities`;
    wonCard.appendChild(wonLabel);
    wonCard.appendChild(wonValue);
    wonCard.appendChild(wonSub);

    // Pipeline Value
    const pipeCard = document.createElement('div');
    pipeCard.className = 'card';
    pipeCard.style.cssText = 'padding:1.25rem;background:linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(99, 102, 241, 0.05));';

    const pipeLabel = document.createElement('p');
    pipeLabel.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;';
    pipeLabel.textContent = 'Pipeline Value';
    const pipeValue = document.createElement('p');
    pipeValue.style.cssText = 'font-size:1.75rem;font-weight:700;color:var(--primary);';
    pipeValue.textContent = currency(stats.pipelineValue);
    const pipeSub = document.createElement('p');
    pipeSub.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);margin-top:0.25rem;';
    const activeCount = stats.totalOpportunities - (stats.opportunitiesByStatus['WON'] || 0) - (stats.opportunitiesByStatus['LOST'] || 0);
    pipeSub.textContent = `${activeCount} active opportunities`;
    pipeCard.appendChild(pipeLabel);
    pipeCard.appendChild(pipeValue);
    pipeCard.appendChild(pipeSub);

    valueGrid.appendChild(wonCard);
    valueGrid.appendChild(pipeCard);
    root.appendChild(valueGrid);

    // --- Bottom grid: Recent Opportunities + Status Breakdown ---
    const bottomGrid = document.createElement('div');
    bottomGrid.style.cssText = 'display:grid;grid-template-columns:2fr 1fr;gap:1.5rem;';

    // --- Recent Opportunities ---
    const recentCard = document.createElement('div');
    recentCard.className = 'card';

    const recentHeader = document.createElement('div');
    recentHeader.style.cssText = 'padding:1rem 1.25rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;';
    const recentTitle = document.createElement('h3');
    recentTitle.style.cssText = 'font-size:0.875rem;font-weight:600;';
    recentTitle.textContent = 'Recent Opportunities';
    const viewAllBtn = document.createElement('button');
    viewAllBtn.className = 'btn btn-ghost btn-sm';
    viewAllBtn.textContent = 'View All';
    viewAllBtn.addEventListener('click', () => navigate('/opportunities'));
    recentHeader.appendChild(recentTitle);
    recentHeader.appendChild(viewAllBtn);
    recentCard.appendChild(recentHeader);

    const recentBody = document.createElement('div');

    if (stats.recentOpportunities.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.style.cssText = 'padding:2rem;text-align:center;color:var(--text-secondary);';
      emptyEl.textContent = 'No opportunities yet';
      recentBody.appendChild(emptyEl);
    } else {
      stats.recentOpportunities.forEach((opp) => {
        const row = document.createElement('div');
        row.className = 'dash-hover-row';
        row.style.cssText = 'padding:0.875rem 1.25rem;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.15s;';
        row.addEventListener('click', () => navigate(`/opportunities/${opp.id}/quotes`));

        // Top row: title + customer | status badge
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.25rem;';

        const leftDiv = document.createElement('div');
        const titleSpan = document.createElement('span');
        titleSpan.style.fontWeight = '500';
        titleSpan.textContent = opp.title || `Opportunity #${opp.opportunity}`;
        const customerSpan = document.createElement('span');
        customerSpan.style.cssText = 'margin-left:0.5rem;font-size:0.75rem;color:var(--text-secondary);';
        customerSpan.textContent = opp.expand?.customer?.name || '';
        leftDiv.appendChild(titleSpan);
        leftDiv.appendChild(customerSpan);

        const badge = document.createElement('span');
        badge.style.cssText = `font-size:0.7rem;font-weight:600;padding:0.25rem 0.5rem;border-radius:9999px;background:${getStatusBg(opp.status)};color:${getStatusColor(opp.status)};`;
        badge.textContent = opp.status;

        topRow.appendChild(leftDiv);
        topRow.appendChild(badge);

        // Bottom row: CAPEX + OPEX
        const bottomRow = document.createElement('div');
        bottomRow.style.cssText = 'display:flex;gap:1rem;font-size:0.75rem;color:var(--text-secondary);';
        const capexSpan = document.createElement('span');
        capexSpan.textContent = `CAPEX: ${currency(opp.capex || 0)}`;
        const opexSpan = document.createElement('span');
        opexSpan.textContent = `OPEX: ${currency(opp.opex_monthly || 0)}/mo`;
        bottomRow.appendChild(capexSpan);
        bottomRow.appendChild(opexSpan);

        row.appendChild(topRow);
        row.appendChild(bottomRow);
        recentBody.appendChild(row);
      });
    }

    recentCard.appendChild(recentBody);
    bottomGrid.appendChild(recentCard);

    // --- Status Breakdown ---
    const statusCard = document.createElement('div');
    statusCard.className = 'card';

    const statusHeader = document.createElement('div');
    statusHeader.style.cssText = 'padding:1rem 1.25rem;border-bottom:1px solid var(--border);';
    const statusTitle = document.createElement('h3');
    statusTitle.style.cssText = 'font-size:0.875rem;font-weight:600;';
    statusTitle.textContent = 'Opportunities by Status';
    statusHeader.appendChild(statusTitle);
    statusCard.appendChild(statusHeader);

    const statusBody = document.createElement('div');
    statusBody.style.cssText = 'padding:1rem 1.25rem;';

    const statusEntries = Object.entries(stats.opportunitiesByStatus);
    if (statusEntries.length === 0) {
      const noData = document.createElement('p');
      noData.style.cssText = 'color:var(--text-secondary);font-size:0.875rem;';
      noData.textContent = 'No data';
      statusBody.appendChild(noData);
    } else {
      statusEntries.forEach(([status, count]) => {
        const itemWrap = document.createElement('div');
        itemWrap.style.marginBottom = '0.75rem';

        const labelRow = document.createElement('div');
        labelRow.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:0.25rem;';
        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = `font-size:0.875rem;color:${getStatusColor(status)};font-weight:500;`;
        nameSpan.textContent = status;
        const countSpan = document.createElement('span');
        countSpan.style.cssText = 'font-size:0.875rem;font-weight:600;';
        countSpan.textContent = count;
        labelRow.appendChild(nameSpan);
        labelRow.appendChild(countSpan);

        // Progress bar
        const barOuter = document.createElement('div');
        barOuter.style.cssText = 'height:6px;background:var(--bg);border-radius:3px;overflow:hidden;';
        const barInner = document.createElement('div');
        const pct = stats.totalOpportunities > 0 ? (count / stats.totalOpportunities) * 100 : 0;
        barInner.style.cssText = `height:100%;width:${pct}%;background:${getStatusColor(status)};border-radius:3px;transition:width 0.3s ease;`;
        barOuter.appendChild(barInner);

        itemWrap.appendChild(labelRow);
        itemWrap.appendChild(barOuter);
        statusBody.appendChild(itemWrap);
      });
    }

    statusCard.appendChild(statusBody);
    bottomGrid.appendChild(statusCard);

    root.appendChild(bottomGrid);
    container.appendChild(root);
  }

  return {
    destroy() {
      container.innerHTML = '';
    },
  };
}
