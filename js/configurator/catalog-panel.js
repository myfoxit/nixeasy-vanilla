// Catalog Panel component
// License/service pack catalog with search, pagination, MP Calc modal, and legend.

import { currency } from '../utils/format.js';
import { getMeasurePointTag } from '../utils/license-calculations.js';

const ITEMS_PER_PAGE = 20;

export function createCatalogPanel({
  licenses = [],
  servicePacks = [],
  hourlyRate = 150,
  selectedContainerId = null,
  containers = [],
  onAddItem,
  onAddMeasurePointLicenses,
  onSelectContainer
}) {
  const el = document.createElement('div');
  el.className = 'col-span-4 card flex flex-col';
  el.style.cssText = 'height:calc(100vh - 200px);background:var(--surface);';

  let state = { licenses, servicePacks, hourlyRate, selectedContainerId, containers,
    onAddItem, onAddMeasurePointLicenses, onSelectContainer };

  let search = '';
  let currentPage = 1;

  // DOM refs that persist across list re-renders
  let searchInputEl = null;
  let listWrapEl    = null;

  // ── Filter ────────────────────────────────────────────────────────────
  function getFiltered() {
    const q = search.toLowerCase();
    const lics = state.licenses
      .filter(l => (l.name + l.sku).toLowerCase().includes(q))
      .map(l => ({ type: 'license', item: l }));
    const sps = state.servicePacks
      .filter(sp => sp.package_name.toLowerCase().includes(q))
      .map(sp => ({ type: 'servicepack', item: sp }));
    return [...lics, ...sps].sort((a, b) => {
      const na = a.type === 'license' ? a.item.name : a.item.package_name;
      const nb = b.type === 'license' ? b.item.name : b.item.package_name;
      return na.localeCompare(nb);
    });
  }

  // ── Header (rendered ONCE — never destroyed) ──────────────────────────
  function buildHeader() {
    const header = document.createElement('div');
    header.className = 'p-4 border-b';
    header.style.cssText = 'background:var(--bg);border-color:var(--border);flex-shrink:0;';

    // Title row
    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';

    const title = document.createElement('h3');
    title.style.cssText = 'margin:0;color:var(--text-main);';
    title.textContent = 'Catalog';
    titleRow.appendChild(title);

    // MP Calc button
    const mpCalcBtn = document.createElement('button');
    mpCalcBtn.className = 'btn btn-sm';
    mpCalcBtn.title = 'Measure Point Calculator';
    mpCalcBtn.style.cssText = 'padding:4px 8px;display:flex;align-items:center;gap:4px;';
    mpCalcBtn.innerHTML =
      '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:14px;height:14px;">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z"/></svg>' +
      '<span style="font-size:0.7rem;">MP Calc</span>';
    mpCalcBtn.addEventListener('click', () => openCalculatorModal());
    titleRow.appendChild(mpCalcBtn);
    header.appendChild(titleRow);

    // Search — the key is that this element is created ONCE and never re-created
    searchInputEl = document.createElement('input');
    searchInputEl.className = 'text-sm';
    searchInputEl.placeholder = 'Search licenses & services...';
    searchInputEl.style.width = '100%';
    searchInputEl.addEventListener('input', e => {
      search = e.target.value;
      currentPage = 1;
      renderList();   // only re-render the list, not the header
    });
    header.appendChild(searchInputEl);

    // Legend
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;';
    legend.innerHTML =
      '<span style="font-size:0.7rem;display:inline-flex;align-items:center;gap:4px;color:var(--text-secondary);">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:var(--primary);display:inline-block;"></span>License</span>' +
      '<span style="font-size:0.7rem;display:inline-flex;align-items:center;gap:4px;color:var(--text-secondary);">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;display:inline-block;"></span>Service Pack</span>';
    header.appendChild(legend);

    return header;
  }

  // ── List (re-rendered on search/page/data change) ─────────────────────
  function renderList() {
    if (!listWrapEl) return;
    listWrapEl.innerHTML = '';

    const filtered     = getFiltered();
    const totalPages   = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const paginated    = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    // Scroll area
    const scrollArea = document.createElement('div');
    scrollArea.style.cssText = 'flex:1;overflow-y:auto;padding:1rem;';

    if (paginated.length === 0) {
      scrollArea.innerHTML =
        '<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:0.875rem;">No items found</div>';
    } else {
      paginated.forEach(catalogItem => {
        const isLic  = catalogItem.type === 'license';
        const name   = isLic ? catalogItem.item.name : catalogItem.item.package_name;
        const sku    = isLic ? catalogItem.item.sku : '';
        const price  = isLic ? catalogItem.item.initial_price : catalogItem.item.estimated_hours * state.hourlyRate;
        const tag    = isLic ? getMeasurePointTag(sku) : null;
        const tColor = tag?.color || (isLic ? 'var(--primary)' : '#f59e0b');
        const tBg    = tag ? `${tag.color}20` : (isLic ? 'var(--primary-light)' : '#fef3c7');
        const tText  = tag?.tag.toUpperCase() || (isLic ? 'LICENSE' : 'SERVICE');

        const item = document.createElement('div');
        item.style.cssText =
          'display:flex;align-items:center;justify-content:space-between;' +
          'padding:10px 12px;border:1px solid var(--border);border-radius:8px;' +
          'cursor:pointer;transition:all 0.15s;margin-bottom:8px;background:var(--surface);';
        item.addEventListener('mouseenter', () => {
          item.style.borderColor = 'var(--primary)';
          item.style.background  = 'var(--primary-light)';
        });
        item.addEventListener('mouseleave', () => {
          item.style.borderColor = 'var(--border)';
          item.style.background  = 'var(--surface)';
        });
        item.addEventListener('click', () => { if (state.onAddItem) state.onAddItem(catalogItem); });

        const left = document.createElement('div');
        left.style.cssText = 'flex:1;display:flex;flex-direction:column;';

        const tagBadge = document.createElement('span');
        tagBadge.style.cssText =
          `font-size:0.55rem;font-weight:600;padding:1px 5px;border-radius:3px;` +
          `background:${tBg};color:${tColor};text-transform:uppercase;letter-spacing:0.03em;` +
          `display:inline-block;margin-bottom:2px;align-self:flex-start;`;
        tagBadge.textContent = tText;
        left.appendChild(tagBadge);

        const nameEl = document.createElement('span');
        nameEl.style.cssText = 'font-weight:500;font-size:0.875rem;color:var(--text-main);';
        nameEl.textContent = name;
        left.appendChild(nameEl);

        const subEl = document.createElement('span');
        subEl.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);font-family:monospace;';
        subEl.textContent = isLic ? sku : `${catalogItem.item.estimated_hours}h estimated`;
        left.appendChild(subEl);

        item.appendChild(left);

        const priceEl = document.createElement('span');
        priceEl.style.cssText =
          'font-weight:600;font-size:0.85rem;color:var(--text-main);white-space:nowrap;padding-left:8px;';
        priceEl.textContent = currency(price);
        item.appendChild(priceEl);

        scrollArea.appendChild(item);
      });
    }

    listWrapEl.appendChild(scrollArea);

    // Pagination
    if (totalPages > 1) {
      const footer = document.createElement('div');
      footer.style.cssText =
        'border-top:1px solid var(--border);background:var(--bg);flex-shrink:0;' +
        'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;';

      const countEl = document.createElement('span');
      countEl.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);';
      countEl.textContent = `${filtered.length} items`;
      footer.appendChild(countEl);

      const pag = document.createElement('div');
      pag.style.cssText = 'display:flex;align-items:center;gap:8px;';

      const prevBtn = document.createElement('button');
      prevBtn.className = 'btn btn-sm btn-secondary';
      prevBtn.style.cssText = 'padding:4px 10px;font-size:0.75rem;min-width:60px;';
      prevBtn.textContent = 'Prev';
      prevBtn.disabled = currentPage === 1;
      prevBtn.addEventListener('click', () => { currentPage--; renderList(); });
      pag.appendChild(prevBtn);

      const pageEl = document.createElement('span');
      pageEl.style.cssText = 'font-size:0.75rem;color:var(--text-main);min-width:60px;text-align:center;';
      pageEl.textContent = `${currentPage} / ${totalPages}`;
      pag.appendChild(pageEl);

      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn btn-sm btn-secondary';
      nextBtn.style.cssText = 'padding:4px 10px;font-size:0.75rem;min-width:60px;';
      nextBtn.textContent = 'Next';
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.addEventListener('click', () => { currentPage++; renderList(); });
      pag.appendChild(nextBtn);

      footer.appendChild(pag);
      listWrapEl.appendChild(footer);
    }
  }

  // ── Initial build ─────────────────────────────────────────────────────
  function init() {
    el.appendChild(buildHeader());

    listWrapEl = document.createElement('div');
    listWrapEl.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;';
    el.appendChild(listWrapEl);

    renderList();
  }

  // ── MP Calculator Modal ───────────────────────────────────────────────
  function openCalculatorModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'width:90%;max-width:1200px;height:85vh;overflow:hidden;display:flex;flex-direction:column;';
    card.addEventListener('click', e => e.stopPropagation());

    const modalHeader = document.createElement('div');
    modalHeader.className = 'p-4 border-b flex justify-between items-center';
    modalHeader.style.cssText = 'border-color:var(--border);flex-shrink:0;';

    const headerLeft = document.createElement('div');
    headerLeft.innerHTML =
      '<h3 style="margin:0;">Measure Point Calculator</h3>' +
      '<span class="text-sm text-secondary">Add devices, calculate measure points, and generate licenses</span>';
    modalHeader.appendChild(headerLeft);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-ghost';
    closeBtn.innerHTML =
      '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>';
    closeBtn.addEventListener('click', () => closeModal());
    modalHeader.appendChild(closeBtn);
    card.appendChild(modalHeader);

    const modalBody = document.createElement('div');
    modalBody.style.cssText = 'flex:1;overflow:hidden;padding:16px;';
    let calcCleanup = null;

    (async () => {
      try {
        const { createMeasurePointCalculatorView } = await import('../views/measure-point-calculator.js');
        const res = createMeasurePointCalculatorView(modalBody, {
          embedded: true,
          licenses: state.licenses,
          onApplyLicenses: distribution => {
            if (state.onAddMeasurePointLicenses)
              state.onAddMeasurePointLicenses(distribution, state.selectedContainerId);
            closeModal();
          },
          onClose: () => closeModal(),
        });
        if (res?.destroy) calcCleanup = res.destroy;
      } catch (err) {
        console.warn('MeasurePointCalculatorView not available:', err);
        modalBody.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);">Measure Point Calculator not yet available.</div>';
      }
    })();

    card.appendChild(modalBody);
    backdrop.appendChild(card);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
    document.body.appendChild(backdrop);

    function closeModal() {
      if (calcCleanup) calcCleanup();
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }
  }

  // ── Update (called from configurator when new data arrives) ───────────
  function update(props) {
    let needsListRefresh = false;
    if (props.licenses      !== undefined) { state.licenses      = props.licenses;      needsListRefresh = true; }
    if (props.servicePacks  !== undefined) { state.servicePacks  = props.servicePacks;  needsListRefresh = true; }
    if (props.hourlyRate    !== undefined) { state.hourlyRate    = props.hourlyRate;     needsListRefresh = true; }
    if (props.selectedContainerId !== undefined) state.selectedContainerId = props.selectedContainerId;
    if (props.containers    !== undefined) state.containers    = props.containers;
    if (props.onAddItem     !== undefined) state.onAddItem     = props.onAddItem;
    if (props.onAddMeasurePointLicenses !== undefined) state.onAddMeasurePointLicenses = props.onAddMeasurePointLicenses;
    if (props.onSelectContainer !== undefined) state.onSelectContainer = props.onSelectContainer;
    if (needsListRefresh) renderList();
  }

  init();
  return { element: el, update };
}
