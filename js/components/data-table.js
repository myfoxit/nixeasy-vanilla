// Data Table component
// Ported from React DataTable.tsx - reusable paginated table with search and sorting

/**
 * Create a sort icon SVG element.
 * @param {'asc'|'desc'|null} direction
 * @param {boolean} active
 * @returns {SVGElement}
 */
function createSortIcon(direction, active) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke-width', active ? '2.5' : '2');

  if (!active) {
    // Inactive: both arrows, subtle
    svg.setAttribute('stroke', 'currentColor');
    svg.style.marginLeft = '4px';
    svg.style.opacity = '0.3';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M7 15l5 5 5-5M7 9l5-5 5 5');
    svg.appendChild(path);
  } else {
    // Active: single direction arrow
    svg.setAttribute('stroke', 'var(--primary)');
    svg.style.marginLeft = '4px';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', direction === 'asc' ? 'M7 14l5-5 5 5' : 'M7 10l5 5 5-5');
    svg.appendChild(path);
  }

  return svg;
}

/**
 * Create a full data table component with header, search, sortable columns,
 * loading/empty states, and pagination.
 *
 * @param {Object} opts
 * @param {string}   opts.title          - Page title.
 * @param {string}   opts.subtitle       - Subtitle text.
 * @param {HTMLElement} [opts.action]     - Action element (e.g. a button) for the header.
 * @param {Array<Object>} opts.columns   - Column definitions.
 *   Each column: { header, accessor, render, style, cellStyle, align, sortable, sortKey }
 *   - accessor: string key or function(item) => content
 *   - render: function(item, index) => HTMLElement|string
 * @param {Array}    opts.data           - Row data array. Each item should have an `id` property.
 * @param {boolean}  opts.loading        - Show loading state.
 * @param {number}   opts.page           - Current page number.
 * @param {number}   opts.totalPages     - Total number of pages.
 * @param {Function} opts.onSearch       - Called with (searchTerm).
 * @param {Function} opts.onPageChange   - Called with (newPage).
 * @param {string}  [opts.searchPlaceholder='Search...'] - Search input placeholder.
 * @param {Function}[opts.onRowClick]    - Called with (item) when a row is clicked.
 * @param {string}  [opts.sortColumn]    - Currently sorted column key.
 * @param {'asc'|'desc'|null} [opts.sortDirection] - Current sort direction.
 * @param {Function}[opts.onSort]        - Called with (sortKey, direction).
 * @returns {{ element: HTMLElement, update: Function, destroy: Function }}
 */
export function createDataTable({
  title,
  subtitle,
  action,
  columns,
  data = [],
  loading = false,
  page = 1,
  totalPages = 1,
  onSearch,
  onPageChange,
  searchPlaceholder = 'Search...',
  onRowClick,
  sortColumn = null,
  sortDirection = null,
  onSort,
}) {
  // Store current props for update()
  let props = { title, subtitle, action, columns, data, loading, page, totalPages, onSearch, onPageChange, searchPlaceholder, onRowClick, sortColumn, sortDirection, onSort };

  // --- Root element ---
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;';

  // --- Header ---
  const header = document.createElement('header');
  header.className = 'main-header';
  header.style.cssText = 'background:var(--surface);border-bottom:1px solid var(--border);padding:1.5rem 2rem;display:flex;justify-content:space-between;align-items:center;';

  const headerLeft = document.createElement('div');
  const titleEl = document.createElement('h2');
  titleEl.style.cssText = 'font-size:1.5rem;font-weight:600;margin-bottom:0.25rem;color:var(--text-main);';
  titleEl.textContent = title;
  const subtitleEl = document.createElement('p');
  subtitleEl.className = 'text-sm text-secondary';
  subtitleEl.textContent = subtitle;
  headerLeft.appendChild(titleEl);
  headerLeft.appendChild(subtitleEl);

  const headerRight = document.createElement('div');
  if (action) headerRight.appendChild(action);

  header.appendChild(headerLeft);
  header.appendChild(headerRight);
  root.appendChild(header);

  // --- Body ---
  const body = document.createElement('div');
  body.className = 'p-6';
  body.style.flex = '1';

  const card = document.createElement('div');
  card.className = 'card mb-6';

  // Search bar
  const searchBar = document.createElement('div');
  searchBar.className = 'p-4 border-b';
  searchBar.style.borderColor = 'var(--border)';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = searchPlaceholder;
  searchInput.style.maxWidth = '400px';
  searchInput.addEventListener('input', (e) => {
    if (typeof props.onSearch === 'function') props.onSearch(e.target.value);
  });
  searchBar.appendChild(searchInput);
  card.appendChild(searchBar);

  // Table wrapper (scrollable)
  const tableWrap = document.createElement('div');
  tableWrap.style.overflowX = 'auto';

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;';

  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  table.appendChild(thead);
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  card.appendChild(tableWrap);
  body.appendChild(card);

  // Pagination
  const pagination = document.createElement('div');
  pagination.className = 'flex justify-between items-center';

  const pageInfo = document.createElement('span');
  pageInfo.className = 'text-sm text-secondary';

  const pageButtons = document.createElement('div');
  pageButtons.className = 'flex gap-2';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'btn btn-secondary btn-sm';
  prevBtn.textContent = 'Previous';
  prevBtn.addEventListener('click', () => {
    if (props.page > 1 && typeof props.onPageChange === 'function') {
      props.onPageChange(props.page - 1);
    }
  });

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn-secondary btn-sm';
  nextBtn.textContent = 'Next';
  nextBtn.addEventListener('click', () => {
    if (props.page < props.totalPages && typeof props.onPageChange === 'function') {
      props.onPageChange(props.page + 1);
    }
  });

  pageButtons.appendChild(prevBtn);
  pageButtons.appendChild(nextBtn);
  pagination.appendChild(pageInfo);
  pagination.appendChild(pageButtons);
  body.appendChild(pagination);
  root.appendChild(body);

  // --- Render table content ---
  function renderTable() {
    const { columns, data, loading, page, totalPages, sortColumn, sortDirection, onSort, onRowClick } = props;

    // -- Thead --
    thead.innerHTML = '';
    const headRow = document.createElement('tr');

    columns.forEach((col, i) => {
      const th = document.createElement('th');
      const colKey = col.sortKey || (typeof col.accessor === 'string' ? col.accessor : col.header);

      // Header style
      th.style.textAlign = col.align || 'left';
      th.style.paddingLeft = i === 0 ? '1.5rem' : '1rem';
      th.style.paddingRight = '1rem';
      if (col.sortable) {
        th.style.cursor = 'pointer';
        th.style.userSelect = 'none';
      }
      // Merge in any custom style
      if (col.style) Object.assign(th.style, col.style);

      // Inner span for inline-flex alignment
      const span = document.createElement('span');
      span.style.cssText = 'display:inline-flex;align-items:center;';
      span.textContent = col.header;

      // Sort icon
      if (col.sortable) {
        const isActive = sortColumn === colKey;
        span.appendChild(createSortIcon(sortDirection, isActive));

        th.addEventListener('click', () => {
          if (!onSort) return;
          let newDirection;
          if (sortColumn !== colKey) {
            newDirection = 'asc';
          } else if (sortDirection === 'asc') {
            newDirection = 'desc';
          } else {
            newDirection = null;
          }
          onSort(colKey, newDirection);
        });
      }

      th.appendChild(span);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    // -- Tbody --
    tbody.innerHTML = '';

    if (loading) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = columns.length;
      td.className = 'text-center p-4';
      td.textContent = 'Loading...';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else if (!data || data.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = columns.length;
      td.className = 'text-center p-4';
      td.textContent = 'No data found';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      data.forEach((item, rowIndex) => {
        const tr = document.createElement('tr');
        if (onRowClick) {
          tr.style.cursor = 'pointer';
          tr.addEventListener('click', () => onRowClick(item));
        }

        columns.forEach((col, colIndex) => {
          const td = document.createElement('td');
          td.style.textAlign = col.align || 'left';
          td.style.paddingLeft = colIndex === 0 ? '1.5rem' : '1rem';
          td.style.paddingRight = '1rem';
          if (col.cellStyle) Object.assign(td.style, col.cellStyle);

          const content = getCellContent(item, col, rowIndex);
          if (content instanceof HTMLElement || content instanceof DocumentFragment) {
            td.appendChild(content);
          } else if (content !== null && content !== undefined) {
            td.textContent = String(content);
          }

          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
    }

    // -- Pagination --
    pageInfo.textContent = `Page ${page} of ${totalPages}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
  }

  /**
   * Get cell content from a column definition and data item.
   */
  function getCellContent(item, column, index) {
    if (column.render) {
      return column.render(item, index);
    }
    if (column.accessor) {
      if (typeof column.accessor === 'function') {
        return column.accessor(item);
      }
      return item[column.accessor];
    }
    return null;
  }

  // Initial render
  renderTable();

  // --- Public API ---

  /**
   * Update the table with new props. Only changed props are required.
   * @param {Object} newProps
   */
  function update(newProps) {
    // Merge new props
    props = { ...props, ...newProps };

    // Update header text if changed
    if (newProps.title !== undefined) titleEl.textContent = props.title;
    if (newProps.subtitle !== undefined) subtitleEl.textContent = props.subtitle;

    // Update action button
    if (newProps.action !== undefined) {
      headerRight.innerHTML = '';
      if (props.action) headerRight.appendChild(props.action);
    }

    // Update search placeholder
    if (newProps.searchPlaceholder !== undefined) {
      searchInput.placeholder = props.searchPlaceholder;
    }

    // Re-render the table body, head, and pagination
    renderTable();
  }

  function destroy() {
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  return { element: root, update, destroy };
}
