// Async Select component
// Ported from React AsyncSelect.tsx - async search select with pagination

/**
 * Create an async select with search input, debounced loading, and scroll pagination.
 *
 * @param {Object} opts
 * @param {string}   opts.name                - Form field name (hidden input).
 * @param {string}  [opts.value]              - Controlled value.
 * @param {string}  [opts.defaultValue='']    - Initial uncontrolled value.
 * @param {string}  [opts.defaultLabel='']    - Initial label for the default value.
 * @param {string}  [opts.placeholder='-- Select --'] - Placeholder text.
 * @param {boolean} [opts.required]           - Mark hidden input as required.
 * @param {Function}[opts.onChange]            - Called with (value, option) on selection.
 * @param {Function} opts.loadOptions         - Async fn(search, page) => { items, totalPages }.
 * @param {number}  [opts.debounceMs=300]     - Debounce delay for search input.
 * @returns {{ element: HTMLElement, getValue: Function, setValue: Function, destroy: Function }}
 */
export function createAsyncSelect({
  name,
  value,
  defaultValue = '',
  defaultLabel = '',
  placeholder = '-- Select --',
  required = false,
  onChange,
  loadOptions,
  debounceMs = 300,
}) {
  const isControlled = value !== undefined;
  let selectedValue = isControlled ? value : defaultValue;
  let selectedLabel = defaultLabel;
  let isOpen = false;
  let dropdownEl = null;
  let searchInputEl = null;
  let listEl = null;

  let currentOptions = [];
  let currentPage = 1;
  let totalPages = 1;
  let loading = false;
  let currentSearch = '';
  let debounceTimer = null;
  let initialLoadDone = false;

  // --- Container ---
  const container = document.createElement('div');
  container.className = 'custom-select';

  // Hidden input
  const hiddenInput = document.createElement('input');
  hiddenInput.type = 'hidden';
  hiddenInput.name = name;
  hiddenInput.value = selectedValue;
  if (required) hiddenInput.required = true;
  container.appendChild(hiddenInput);

  // --- Trigger button ---
  const triggerBtn = document.createElement('button');
  triggerBtn.type = 'button';
  triggerBtn.className = 'custom-select-trigger';
  triggerBtn.setAttribute('aria-expanded', 'false');

  const triggerLabel = document.createElement('span');
  triggerLabel.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

  const chevronSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevronSvg.setAttribute('class', 'custom-select-icon');
  chevronSvg.setAttribute('viewBox', '0 0 20 20');
  chevronSvg.setAttribute('fill', 'currentColor');
  const chevronPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  chevronPath.setAttribute('fill-rule', 'evenodd');
  chevronPath.setAttribute('d', 'M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z');
  chevronPath.setAttribute('clip-rule', 'evenodd');
  chevronSvg.appendChild(chevronPath);

  triggerBtn.appendChild(triggerLabel);
  triggerBtn.appendChild(chevronSvg);
  container.appendChild(triggerBtn);

  // --- Render trigger label ---
  function renderTriggerLabel() {
    triggerLabel.textContent = selectedLabel || placeholder;
    triggerLabel.className = selectedValue ? '' : 'placeholder';
  }
  renderTriggerLabel();

  // --- Initial label load ---
  // If we have a value but no label, try to resolve it on first load
  if (selectedValue && !selectedLabel) {
    loadOptions('', 1).then((result) => {
      const found = result.items.find((o) => o.value === selectedValue);
      if (found) {
        selectedLabel = found.label;
        renderTriggerLabel();
      }
      initialLoadDone = true;
    }).catch(() => { initialLoadDone = true; });
  } else {
    initialLoadDone = true;
  }

  // --- Fetch options ---
  async function fetchOptions(search, page, append = false) {
    loading = true;
    renderLoadingState();
    try {
      const result = await loadOptions(search, page);
      if (append) {
        currentOptions = [...currentOptions, ...result.items];
      } else {
        currentOptions = result.items;
      }
      totalPages = result.totalPages;
    } catch (e) {
      console.error('AsyncSelect load error:', e);
    }
    loading = false;
    renderOptionsList();
  }

  // --- Open / close dropdown ---
  function openDropdown() {
    if (isOpen) return;
    isOpen = true;
    triggerBtn.setAttribute('aria-expanded', 'true');

    const rect = triggerBtn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = 300;
    const shouldOpenAbove = spaceBelow < dropdownHeight && rect.top > spaceBelow;
    const computedWidth = Math.max(rect.width, 280);

    dropdownEl = document.createElement('div');
    dropdownEl.className = 'async-select-dropdown';
    const posStyle = [
      'position:fixed',
      `left:${rect.left}px`,
      `width:${computedWidth}px`,
      'z-index:9999',
    ];
    if (shouldOpenAbove) {
      posStyle.push(`bottom:${window.innerHeight - rect.top + 4}px`);
    } else {
      posStyle.push(`top:${rect.bottom + 4}px`);
    }
    dropdownEl.style.cssText = posStyle.join(';') + ';';

    // Search area
    const searchWrap = document.createElement('div');
    searchWrap.className = 'async-select-search';

    // Search icon
    const searchSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    searchSvg.setAttribute('class', 'async-select-search-icon');
    searchSvg.setAttribute('viewBox', '0 0 20 20');
    searchSvg.setAttribute('fill', 'currentColor');
    const searchPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    searchPath.setAttribute('fill-rule', 'evenodd');
    searchPath.setAttribute('d', 'M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z');
    searchPath.setAttribute('clip-rule', 'evenodd');
    searchSvg.appendChild(searchPath);

    searchInputEl = document.createElement('input');
    searchInputEl.type = 'text';
    searchInputEl.className = 'async-select-search-input';
    searchInputEl.placeholder = 'Search...';
    searchInputEl.addEventListener('input', handleSearchInput);
    searchInputEl.addEventListener('keydown', (e) => e.stopPropagation());

    // Spinner placeholder
    const spinnerEl = document.createElement('span');
    spinnerEl.className = 'async-select-spinner';
    spinnerEl.style.display = 'none';

    searchWrap.appendChild(searchSvg);
    searchWrap.appendChild(searchInputEl);
    searchWrap.appendChild(spinnerEl);
    dropdownEl.appendChild(searchWrap);

    // Option list
    listEl = document.createElement('ul');
    listEl.className = 'async-select-list';
    listEl.addEventListener('scroll', handleScroll);
    dropdownEl.appendChild(listEl);

    document.body.appendChild(dropdownEl);
    document.addEventListener('mousedown', handleClickOutside);

    // Reset and load
    currentSearch = '';
    currentPage = 1;
    currentOptions = [];
    fetchOptions('', 1);

    // Focus search input after a tick
    setTimeout(() => {
      if (searchInputEl) searchInputEl.focus();
    }, 50);
  }

  function closeDropdown() {
    if (!isOpen) return;
    isOpen = false;
    triggerBtn.setAttribute('aria-expanded', 'false');

    if (dropdownEl && dropdownEl.parentNode) {
      dropdownEl.parentNode.removeChild(dropdownEl);
    }
    dropdownEl = null;
    searchInputEl = null;
    listEl = null;
    document.removeEventListener('mousedown', handleClickOutside);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function handleClickOutside(e) {
    if (container.contains(e.target)) return;
    if (dropdownEl && dropdownEl.contains(e.target)) return;
    closeDropdown();
  }

  // --- Search input handler (debounced) ---
  function handleSearchInput(e) {
    currentSearch = e.target.value;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentPage = 1;
      currentOptions = [];
      fetchOptions(currentSearch, 1);
    }, debounceMs);
  }

  // --- Scroll pagination ---
  function handleScroll() {
    if (!listEl || loading || currentPage >= totalPages) return;
    const { scrollTop, scrollHeight, clientHeight } = listEl;
    if (scrollHeight - scrollTop - clientHeight < 50) {
      currentPage++;
      fetchOptions(currentSearch, currentPage, true);
    }
  }

  // --- Render helpers ---
  function renderLoadingState() {
    if (!dropdownEl) return;
    const spinner = dropdownEl.querySelector('.async-select-spinner');
    if (spinner) spinner.style.display = loading ? '' : 'none';
  }

  function renderOptionsList() {
    if (!listEl) return;
    renderLoadingState();
    listEl.innerHTML = '';

    if (currentOptions.length === 0 && !loading) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'async-select-empty';
      emptyLi.textContent = 'No results found';
      listEl.appendChild(emptyLi);
      return;
    }

    currentOptions.forEach((opt) => {
      const li = document.createElement('li');
      li.className = `custom-select-option${selectedValue === opt.value ? ' selected' : ''}`;
      li.textContent = opt.label;

      // Checkmark for selected
      if (selectedValue === opt.value) {
        const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        checkSvg.setAttribute('class', 'custom-select-check');
        checkSvg.setAttribute('viewBox', '0 0 20 20');
        checkSvg.setAttribute('fill', 'currentColor');
        const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        checkPath.setAttribute('fill-rule', 'evenodd');
        checkPath.setAttribute('d', 'M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z');
        checkPath.setAttribute('clip-rule', 'evenodd');
        checkSvg.appendChild(checkPath);
        li.appendChild(checkSvg);
      }

      li.addEventListener('click', () => handleSelect(opt));
      listEl.appendChild(li);
    });

    // "Loading more..." indicator at the bottom
    if (loading && currentOptions.length > 0) {
      const loadingLi = document.createElement('li');
      loadingLi.className = 'async-select-loading';
      loadingLi.textContent = 'Loading more...';
      listEl.appendChild(loadingLi);
    }
  }

  function handleSelect(opt) {
    if (!isControlled) {
      selectedValue = opt.value;
    }
    selectedLabel = opt.label;
    hiddenInput.value = opt.value;
    renderTriggerLabel();
    closeDropdown();
    if (typeof onChange === 'function') onChange(opt.value, opt);
  }

  // --- Toggle on trigger click ---
  triggerBtn.addEventListener('click', () => {
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  // --- Public API ---
  function getValue() {
    return selectedValue;
  }

  function setValue(v, label) {
    selectedValue = v;
    selectedLabel = label || '';
    hiddenInput.value = v;
    renderTriggerLabel();
  }

  function destroy() {
    closeDropdown();
    if (container.parentNode) container.parentNode.removeChild(container);
  }

  return { element: container, getValue, setValue, destroy };
}
