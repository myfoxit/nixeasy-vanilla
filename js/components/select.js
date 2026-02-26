// Custom Select component
// Ported from React Select.tsx - custom dropdown with portal (fixed position)

/**
 * Create a custom select dropdown with hidden input for form submission.
 *
 * @param {Object} opts
 * @param {string}   opts.name           - Form field name (hidden input).
 * @param {Array<{value:string,label:string}>} opts.options - Available options.
 * @param {string}  [opts.value]         - Controlled value (external state).
 * @param {string}  [opts.defaultValue=''] - Initial uncontrolled value.
 * @param {string}  [opts.placeholder='-- Select --'] - Placeholder text.
 * @param {boolean} [opts.required]      - Mark hidden input as required.
 * @param {Function}[opts.onChange]       - Called with (value) on selection.
 * @param {boolean} [opts.truncateTrigger=false] - Truncate trigger label.
 * @param {boolean} [opts.wrapOptions=false]     - Allow option text to wrap.
 * @param {boolean} [opts.compact=false]         - Smaller sizing variant.
 * @returns {{ element: HTMLElement, getValue: Function, setValue: Function, setOptions: Function, destroy: Function }}
 */
export function createSelect({
  name,
  options = [],
  value,
  defaultValue = '',
  placeholder = '-- Select --',
  required = false,
  onChange,
  truncateTrigger = false,
  wrapOptions = false,
  compact = false,
}) {
  let isOpen = false;
  let currentOptions = [...options];
  const isControlled = value !== undefined;
  let selectedValue = isControlled ? value : defaultValue;
  let dropdownEl = null;

  // --- Container ---
  const container = document.createElement('div');
  container.className = `custom-select${compact ? ' custom-select-compact' : ''}`;
  container.style.position = 'relative';

  // Hidden input for form submission
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
  if (compact) {
    triggerBtn.style.cssText = 'padding:0.25rem 0.5rem;font-size:0.75rem;min-height:auto;';
  }

  const triggerLabel = document.createElement('span');
  triggerLabel.style.cssText =
    'display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  if (compact) triggerLabel.style.maxWidth = '100px';

  const chevronSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevronSvg.setAttribute('class', 'custom-select-icon');
  chevronSvg.setAttribute('viewBox', '0 0 20 20');
  chevronSvg.setAttribute('fill', 'currentColor');
  chevronSvg.setAttribute('aria-hidden', 'true');
  if (compact) {
    chevronSvg.style.width = '14px';
    chevronSvg.style.height = '14px';
  }
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
    const opt = currentOptions.find((o) => o.value === selectedValue);
    triggerLabel.textContent = opt ? opt.label : placeholder;
    triggerLabel.className = opt ? '' : 'placeholder';
  }
  renderTriggerLabel();

  // --- Open / close dropdown (portal) ---
  function openDropdown() {
    if (isOpen) return;
    isOpen = true;
    triggerBtn.setAttribute('aria-expanded', 'true');

    const rect = triggerBtn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = Math.min(currentOptions.length * 40, 200);
    const shouldOpenAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    dropdownEl = document.createElement('ul');
    dropdownEl.className = 'custom-select-dropdown';
    const posStyle = [
      'position:fixed',
      `left:${rect.left}px`,
      `width:${rect.width}px`,
      'min-width:200px',
      'max-height:200px',
      'overflow-y:auto',
      'z-index:9999',
    ];
    if (shouldOpenAbove) {
      posStyle.push(`bottom:${window.innerHeight - rect.top + 4}px`);
    } else {
      posStyle.push(`top:${rect.bottom + 4}px`);
    }
    if (compact) posStyle.push('font-size:0.75rem');
    dropdownEl.style.cssText = posStyle.join(';') + ';';

    // Prevent click-outside detection from firing on the dropdown itself
    dropdownEl.addEventListener('mousedown', (e) => e.stopPropagation());

    // Render options
    currentOptions.forEach((opt) => {
      const li = document.createElement('li');
      li.className = `custom-select-option${selectedValue === opt.value ? ' selected' : ''}`;
      if (wrapOptions) li.style.cssText = 'white-space:normal;word-break:break-word;';
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

      li.addEventListener('click', () => {
        handleSelect(opt.value);
      });
      dropdownEl.appendChild(li);
    });

    document.body.appendChild(dropdownEl);
    document.addEventListener('mousedown', handleClickOutside);
  }

  function closeDropdown() {
    if (!isOpen) return;
    isOpen = false;
    triggerBtn.setAttribute('aria-expanded', 'false');

    if (dropdownEl && dropdownEl.parentNode) {
      dropdownEl.parentNode.removeChild(dropdownEl);
    }
    dropdownEl = null;
    document.removeEventListener('mousedown', handleClickOutside);
  }

  function handleClickOutside(e) {
    if (container.contains(e.target)) return;
    if (dropdownEl && dropdownEl.contains(e.target)) return;
    closeDropdown();
  }

  function handleSelect(val) {
    if (!isControlled) {
      selectedValue = val;
    }
    hiddenInput.value = val;
    renderTriggerLabel();
    closeDropdown();
    if (typeof onChange === 'function') onChange(val);
  }

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

  function setValue(v) {
    selectedValue = v;
    hiddenInput.value = v;
    renderTriggerLabel();
    // If dropdown is open, re-render it
    if (isOpen) {
      closeDropdown();
      openDropdown();
    }
  }

  function setOptions(newOptions) {
    currentOptions = [...newOptions];
    renderTriggerLabel();
    if (isOpen) {
      closeDropdown();
      openDropdown();
    }
  }

  function destroy() {
    closeDropdown();
    if (container.parentNode) container.parentNode.removeChild(container);
  }

  return { element: container, getValue, setValue, setOptions, destroy };
}
