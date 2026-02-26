// Catalog Panel component
// Ported from React CatalogPanel.tsx (177 lines)
// License/service pack catalog with search, pagination, MP Calc modal, and legend.

import { currency } from '../utils/format.js';
import { getMeasurePointTag } from '../utils/license-calculations.js';

const ITEMS_PER_PAGE = 20;

/**
 * Create the catalog panel for browsing and adding licenses/service packs.
 *
 * @param {Object} props
 * @param {Array}    props.licenses             - Available license objects
 * @param {Array}    props.servicePacks          - Available service pack objects
 * @param {number}   props.hourlyRate            - Hourly rate for service pack pricing
 * @param {string|null} props.selectedContainerId - Currently selected container ID
 * @param {Array}    props.containers            - Array of LicenseContainer objects
 * @param {Function} props.onAddItem             - Callback({ type, item }) when catalog item clicked
 * @param {Function} props.onAddMeasurePointLicenses - Callback(distribution, containerId) for MP calculator
 * @param {Function} props.onSelectContainer     - Callback(id) to select a container
 * @returns {{ element: HTMLElement, update: Function }}
 */
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

  let state = {
    licenses,
    servicePacks,
    hourlyRate,
    selectedContainerId,
    containers,
    onAddItem,
    onAddMeasurePointLicenses,
    onSelectContainer
  };

  // Internal UI state
  let search = '';
  let currentPage = 1;

  // --- Helpers ---

  function getFilteredCatalog() {
    const lowerSearch = search.toLowerCase();
    const licenseCatalog = state.licenses
      .filter(l => (l.name + l.sku).toLowerCase().includes(lowerSearch))
      .map(l => ({ type: 'license', item: l }));
    const spCatalog = state.servicePacks
      .filter(sp => sp.package_name.toLowerCase().includes(lowerSearch))
      .map(sp => ({ type: 'servicepack', item: sp }));

    return [...licenseCatalog, ...spCatalog].sort((a, b) => {
      const nameA = a.type === 'license' ? a.item.name : a.item.package_name;
      const nameB = b.type === 'license' ? b.item.name : b.item.package_name;
      return nameA.localeCompare(nameB);
    });
  }

  // --- Render ---

  function render() {
    el.innerHTML = '';

    const filteredCatalog = getFilteredCatalog();
    const totalPages = Math.max(1, Math.ceil(filteredCatalog.length / ITEMS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const paginatedCatalog = filteredCatalog.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
    );

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'p-4 border-b';
    header.style.cssText = 'background:var(--bg);border-color:var(--border);flex-shrink:0;';

    // Title row with MP Calc button
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

    const calcSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    calcSvg.setAttribute('fill', 'none');
    calcSvg.setAttribute('viewBox', '0 0 24 24');
    calcSvg.setAttribute('stroke-width', '1.5');
    calcSvg.setAttribute('stroke', 'currentColor');
    calcSvg.style.cssText = 'width:14px;height:14px;';
    const calcPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    calcPath.setAttribute('stroke-linecap', 'round');
    calcPath.setAttribute('stroke-linejoin', 'round');
    calcPath.setAttribute('d', 'M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z');
    calcSvg.appendChild(calcPath);
    mpCalcBtn.appendChild(calcSvg);

    const calcLabel = document.createElement('span');
    calcLabel.style.fontSize = '0.7rem';
    calcLabel.textContent = 'MP Calc';
    mpCalcBtn.appendChild(calcLabel);

    mpCalcBtn.addEventListener('click', () => openCalculatorModal());
    titleRow.appendChild(mpCalcBtn);
    header.appendChild(titleRow);

    // Search input
    const searchInput = document.createElement('input');
    searchInput.className = 'text-sm';
    searchInput.placeholder = 'Search licenses & services...';
    searchInput.value = search;
    searchInput.style.width = '100%';
    searchInput.addEventListener('input', (e) => {
      search = e.target.value;
      currentPage = 1;
      render();
    });
    header.appendChild(searchInput);

    // Legend
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;';

    // License dot
    const licLegend = document.createElement('span');
    licLegend.style.cssText = 'font-size:0.7rem;display:inline-flex;align-items:center;gap:4px;color:var(--text-secondary);';
    const licDot = document.createElement('span');
    licDot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:var(--primary);';
    licLegend.appendChild(licDot);
    licLegend.appendChild(document.createTextNode('License'));
    legend.appendChild(licLegend);

    // Service Pack dot
    const spLegend = document.createElement('span');
    spLegend.style.cssText = 'font-size:0.7rem;display:inline-flex;align-items:center;gap:4px;color:var(--text-secondary);';
    const spDot = document.createElement('span');
    spDot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#f59e0b;';
    spLegend.appendChild(spDot);
    spLegend.appendChild(document.createTextNode('Service Pack'));
    legend.appendChild(spLegend);

    header.appendChild(legend);
    el.appendChild(header);

    // --- Catalog items scrollable area ---
    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'flex-1';
    scrollWrapper.style.cssText = 'min-height:0;overflow:hidden;display:flex;flex-direction:column;';

    const scrollArea = document.createElement('div');
    scrollArea.style.cssText = 'flex:1;overflow-y:auto;padding:1rem;';

    paginatedCatalog.forEach(catalogItem => {
      const isLicense = catalogItem.type === 'license';
      const name = isLicense ? catalogItem.item.name : catalogItem.item.package_name;
      const sku = isLicense ? catalogItem.item.sku : '';
      const price = isLicense ? catalogItem.item.initial_price : catalogItem.item.estimated_hours * state.hourlyRate;
      const tag = isLicense ? getMeasurePointTag(sku) : null;
      const tagColor = tag?.color || (isLicense ? 'var(--primary)' : '#f59e0b');
      const tagBg = tag ? `${tag.color}20` : (isLicense ? 'var(--primary-light)' : '#fef3c7');
      const tagText = tag?.tag.toUpperCase() || (isLicense ? 'LICENSE' : 'SERVICE');

      const itemEl = document.createElement('div');
      itemEl.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:space-between',
        'padding:10px 12px',
        'border:1px solid var(--border)',
        'border-radius:8px',
        'cursor:pointer',
        'transition:all 0.15s',
        'margin-bottom:8px',
        'background:var(--surface)'
      ].join(';') + ';';

      itemEl.addEventListener('mouseenter', () => {
        itemEl.style.borderColor = 'var(--primary)';
        itemEl.style.background = 'var(--primary-light)';
      });
      itemEl.addEventListener('mouseleave', () => {
        itemEl.style.borderColor = 'var(--border)';
        itemEl.style.background = 'var(--surface)';
      });
      itemEl.addEventListener('click', () => {
        if (state.onAddItem) state.onAddItem(catalogItem);
      });

      // Left: tag, name, sku
      const leftCol = document.createElement('div');
      leftCol.className = 'flex flex-col';
      leftCol.style.flex = '1';

      // Tag row
      const tagRow = document.createElement('div');
      tagRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:2px;';
      const tagBadge = document.createElement('span');
      tagBadge.style.cssText = `font-size:0.55rem;font-weight:600;padding:1px 5px;border-radius:3px;background:${tagBg};color:${tagColor};text-transform:uppercase;letter-spacing:0.03em;`;
      tagBadge.textContent = tagText;
      tagRow.appendChild(tagBadge);
      leftCol.appendChild(tagRow);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'font-medium text-sm';
      nameSpan.textContent = name;
      leftCol.appendChild(nameSpan);

      const skuSpan = document.createElement('span');
      skuSpan.className = 'text-xs text-secondary font-mono';
      skuSpan.textContent = isLicense ? sku : `${catalogItem.item.estimated_hours}h estimated`;
      leftCol.appendChild(skuSpan);

      itemEl.appendChild(leftCol);

      // Right: price
      const priceSpan = document.createElement('span');
      priceSpan.style.cssText = 'font-weight:600;font-size:0.85rem;color:var(--text-main);white-space:nowrap;padding-left:8px;';
      priceSpan.textContent = currency(price);
      itemEl.appendChild(priceSpan);

      scrollArea.appendChild(itemEl);
    });

    // Empty state
    if (paginatedCatalog.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.cssText = 'text-align:center;padding:24px;color:var(--text-secondary);font-size:0.875rem;';
      emptyDiv.textContent = 'No items found';
      scrollArea.appendChild(emptyDiv);
    }

    scrollWrapper.appendChild(scrollArea);
    el.appendChild(scrollWrapper);

    // --- Pagination footer ---
    if (totalPages > 1) {
      const footer = document.createElement('div');
      footer.style.cssText = 'border-top:1px solid var(--border);background:var(--bg);flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;';

      const itemCountSpan = document.createElement('span');
      itemCountSpan.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);';
      itemCountSpan.textContent = `${filteredCatalog.length} items`;
      footer.appendChild(itemCountSpan);

      const pagControls = document.createElement('div');
      pagControls.style.cssText = 'display:flex;align-items:center;gap:8px;';

      // Prev button
      const prevBtn = document.createElement('button');
      prevBtn.className = 'btn btn-sm btn-secondary';
      prevBtn.style.cssText = 'padding:4px 10px;font-size:0.75rem;min-width:60px;display:flex;align-items:center;justify-content:center;';
      prevBtn.textContent = 'Prev';
      prevBtn.disabled = currentPage === 1;
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          render();
        }
      });
      pagControls.appendChild(prevBtn);

      // Page indicator
      const pageSpan = document.createElement('span');
      pageSpan.style.cssText = 'font-size:0.75rem;color:var(--text-main);min-width:60px;text-align:center;';
      pageSpan.textContent = `${currentPage} / ${totalPages}`;
      pagControls.appendChild(pageSpan);

      // Next button
      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn btn-sm btn-secondary';
      nextBtn.style.cssText = 'padding:4px 10px;font-size:0.75rem;min-width:60px;display:flex;align-items:center;justify-content:center;';
      nextBtn.textContent = 'Next';
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
          currentPage++;
          render();
        }
      });
      pagControls.appendChild(nextBtn);

      footer.appendChild(pagControls);
      el.appendChild(footer);
    }
  }

  // --- Measure Point Calculator Modal ---

  function openCalculatorModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'width:90%;max-width:1200px;height:85vh;overflow:hidden;display:flex;flex-direction:column;';
    card.addEventListener('click', (e) => e.stopPropagation());

    // Modal header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'p-4 border-b flex justify-between items-center';
    modalHeader.style.cssText = 'border-color:var(--border);flex-shrink:0;';

    const headerLeft = document.createElement('div');
    const modalTitle = document.createElement('h3');
    modalTitle.style.margin = '0';
    modalTitle.textContent = 'Measure Point Calculator';
    const modalSubtitle = document.createElement('span');
    modalSubtitle.className = 'text-sm text-secondary';
    modalSubtitle.textContent = 'Add devices, calculate measure points, and generate licenses';
    headerLeft.appendChild(modalTitle);
    headerLeft.appendChild(modalSubtitle);
    modalHeader.appendChild(headerLeft);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-ghost';
    closeBtn.addEventListener('click', () => closeModal());

    const closeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    closeSvg.setAttribute('fill', 'none');
    closeSvg.setAttribute('viewBox', '0 0 24 24');
    closeSvg.setAttribute('stroke-width', '1.5');
    closeSvg.setAttribute('stroke', 'currentColor');
    closeSvg.style.cssText = 'width:20px;height:20px;';
    const closePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    closePath.setAttribute('stroke-linecap', 'round');
    closePath.setAttribute('stroke-linejoin', 'round');
    closePath.setAttribute('d', 'M6 18L18 6M6 6l12 12');
    closeSvg.appendChild(closePath);
    closeBtn.appendChild(closeSvg);
    modalHeader.appendChild(closeBtn);

    card.appendChild(modalHeader);

    // Modal body - where the calculator view will be mounted
    const modalBody = document.createElement('div');
    modalBody.style.cssText = 'flex:1;overflow:hidden;padding:16px;';

    // Try to dynamically import and mount the MeasurePointCalculatorView
    // The view may not exist yet in vanilla; provide a fallback.
    let calcCleanup = null;

    (async () => {
      try {
        const { createMeasurePointCalculatorView } = await import('../views/measure-point-calculator.js');
        const calcResult = createMeasurePointCalculatorView(modalBody, {
          embedded: true,
          licenses: state.licenses,
          onApplyLicenses: (distribution) => {
            if (state.onAddMeasurePointLicenses) {
              state.onAddMeasurePointLicenses(distribution, state.selectedContainerId);
            }
            closeModal();
          },
          onClose: () => closeModal()
        });
        if (calcResult && typeof calcResult.destroy === 'function') {
          calcCleanup = calcResult.destroy;
        }
      } catch (err) {
        console.warn('MeasurePointCalculatorView not available:', err);
        modalBody.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);">Measure Point Calculator view is not yet available.</div>';
      }
    })();

    card.appendChild(modalBody);
    backdrop.appendChild(card);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    document.body.appendChild(backdrop);

    function closeModal() {
      if (calcCleanup) calcCleanup();
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }
  }

  render();

  /**
   * Update the catalog panel with new props.
   * @param {Object} props
   */
  function update(props) {
    if (props.licenses !== undefined) state.licenses = props.licenses;
    if (props.servicePacks !== undefined) state.servicePacks = props.servicePacks;
    if (props.hourlyRate !== undefined) state.hourlyRate = props.hourlyRate;
    if (props.selectedContainerId !== undefined) state.selectedContainerId = props.selectedContainerId;
    if (props.containers !== undefined) state.containers = props.containers;
    if (props.onAddItem !== undefined) state.onAddItem = props.onAddItem;
    if (props.onAddMeasurePointLicenses !== undefined) state.onAddMeasurePointLicenses = props.onAddMeasurePointLicenses;
    if (props.onSelectContainer !== undefined) state.onSelectContainer = props.onSelectContainer;
    render();
  }

  return { element: el, update };
}
