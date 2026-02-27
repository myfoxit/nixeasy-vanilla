// Presentation Editor - Full-screen overlay for editing presentation layer
// Premium toolbar, keyboard shortcuts, floating action bar for multi-select.

import { showToast } from '../components/toast.js';
import { createPresentationGrid, buildItemsFromSource, detectSourceChanges } from './presentation-grid.js';
import { exportPresentationToCsv, exportPresentationToExcel } from '../utils/export.js';

// --- SVG Icons ---

const ICONS = {
  addHeader: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>',
  merge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"/></svg>',
  csv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>',
  excel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-12.75m0 0A1.125 1.125 0 014.5 4.5h15a1.125 1.125 0 011.125 1.125v12.75m-18.75 0h7.5m0 0v-12.75m0 12.75h9.75m-9.75 0v-12.75m0 0h9.75m0 0v12.75m0-12.75A1.125 1.125 0 0019.5 4.5h-15"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
  group: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z"/></svg>',
  clearSel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
};

/**
 * Create and open the Presentation Editor overlay.
 */
export function createPresentationEditor({
  config,
  licenses,
  presentationItems,
  presentationVersion,
  isTemplateMode,
  templateName,
  quoteId,
  onClose,
  onExport
}) {
  const overlay = document.createElement('div');
  overlay.className = 'presentation-overlay';

  let items;
  let hasSourceWarning = false;

  if (presentationItems && presentationItems.length > 0) {
    items = presentationItems.map(i => ({ ...i }));
    hasSourceWarning = detectSourceChanges(items, config.lineItems);
  } else {
    items = buildItemsFromSource(config.lineItems);
  }

  let gridInstance = null;
  let floatingBar = null;

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? '⌘' : 'Ctrl+';

  function handleItemsChange(newItems) {
    items = newItems;
  }

  function handleClose() {
    if (onClose) onClose(items);
    destroy();
  }

  function handleExport(format) {
    const filename = isTemplateMode
      ? `template_${templateName || 'export'}`
      : `quote_${quoteId || 'new'}`;

    if (format === 'csv') {
      exportPresentationToCsv(items, config, licenses, filename);
    } else if (format === 'xlsx') {
      exportPresentationToExcel(items, config, licenses, filename);
    }

    if (onExport) onExport(format, items);
    showToast(`Exported as ${format.toUpperCase()}`, 'success');
  }

  function handleResetToSource() {
    if (gridInstance) {
      gridInstance.resetToSource();
      items = gridInstance.getItems();
      hasSourceWarning = false;
    }
  }

  function handleSelectionChange(count) {
    updateFloatingBar(count);
  }

  // --- Floating Action Bar ---

  function updateFloatingBar(count) {
    if (floatingBar) {
      floatingBar.remove();
      floatingBar = null;
    }

    if (count < 2) return;

    const bar = document.createElement('div');
    bar.className = 'pe-floating-bar';

    const label = document.createElement('span');
    label.className = 'pe-floating-bar-label';
    label.textContent = count + ' items selected:';
    bar.appendChild(label);

    const groupBtn = createFloatingBtn('Group', ICONS.group, 'pe-fab-primary', () => {
      if (gridInstance) gridInstance.groupSelected();
    });
    bar.appendChild(groupBtn);

    const mergeBtn = createFloatingBtn('Merge', ICONS.merge, '', () => {
      if (gridInstance) gridInstance.mergeSelected();
    });
    bar.appendChild(mergeBtn);

    const deleteBtn = createFloatingBtn('Delete', ICONS.trash, 'pe-fab-danger', () => {
      if (gridInstance) gridInstance.deleteSelected();
    });
    bar.appendChild(deleteBtn);

    const clearBtn = createFloatingBtn('Clear', ICONS.clearSel, '', () => {
      if (gridInstance) gridInstance.clearSelection();
    });
    bar.appendChild(clearBtn);

    overlay.appendChild(bar);
    floatingBar = bar;
  }

  function createFloatingBtn(text, icon, cls, onClick) {
    const btn = document.createElement('button');
    btn.className = 'pe-floating-bar-btn' + (cls ? ' ' + cls : '');
    btn.innerHTML = icon + ' ' + text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // --- Render ---

  function render() {
    overlay.innerHTML = '';

    // --- Toolbar ---
    const toolbar = document.createElement('div');
    toolbar.className = 'presentation-toolbar';

    // Left: title + subtitle + warning
    const toolbarLeft = document.createElement('div');
    toolbarLeft.className = 'pe-toolbar-left';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = 'Presentation Editor';
    titleWrap.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'pe-toolbar-subtitle';
    subtitle.textContent = 'Customize how your quote appears in exports';
    titleWrap.appendChild(subtitle);
    toolbarLeft.appendChild(titleWrap);

    if (hasSourceWarning) {
      const warn = document.createElement('span');
      warn.className = 'pe-toolbar-warning';
      warn.textContent = 'Source data changed';
      toolbarLeft.appendChild(warn);
    }

    toolbar.appendChild(toolbarLeft);

    // Center: action pills
    const toolbarCenter = document.createElement('div');
    toolbarCenter.className = 'pe-toolbar-center';

    toolbarCenter.appendChild(createPillBtn(ICONS.addHeader, 'Add Header', null, () => {
      if (gridInstance) {
        const selIds = gridInstance.getSelectedIds();
        gridInstance.addHeader(selIds.length > 0 ? selIds[0] : null);
      }
    }));

    toolbarCenter.appendChild(createPillBtn(ICONS.merge, 'Merge', modKey + 'M', () => {
      if (gridInstance) gridInstance.mergeSelected();
    }));

    toolbarCenter.appendChild(createPillBtn(ICONS.trash, 'Delete', 'Del', () => {
      if (gridInstance) gridInstance.deleteSelected();
    }, 'pe-pill-danger'));

    toolbarCenter.appendChild(createPillBtn(ICONS.reset, 'Reset', null, handleResetToSource));

    toolbar.appendChild(toolbarCenter);

    // Right: export + close
    const toolbarRight = document.createElement('div');
    toolbarRight.className = 'pe-toolbar-right';

    toolbarRight.appendChild(createPillBtn(ICONS.csv, 'CSV', null, () => handleExport('csv'), 'pe-pill-primary'));
    toolbarRight.appendChild(createPillBtn(ICONS.excel, 'Excel', null, () => handleExport('xlsx'), 'pe-pill-primary'));

    const closeBtn = document.createElement('button');
    closeBtn.className = 'pe-pill-btn pe-pill-ghost';
    closeBtn.innerHTML = ICONS.close + ' Close';
    closeBtn.addEventListener('click', handleClose);
    toolbarRight.appendChild(closeBtn);

    toolbar.appendChild(toolbarRight);
    overlay.appendChild(toolbar);

    // --- Grid ---
    const gridContainer = document.createElement('div');
    gridContainer.className = 'presentation-grid-container';

    gridInstance = createPresentationGrid({
      items,
      lineItems: config.lineItems,
      licenses,
      onChange: handleItemsChange
    });

    gridInstance.setOnSelectionChange(handleSelectionChange);
    gridContainer.appendChild(gridInstance.element);
    overlay.appendChild(gridContainer);
  }

  function createPillBtn(icon, text, shortcut, onClick, extraCls) {
    const btn = document.createElement('button');
    btn.className = 'pe-pill-btn' + (extraCls ? ' ' + extraCls : '');
    let html = icon + '<span>' + text + '</span>';
    if (shortcut) {
      html += '<span class="pe-kbd">' + shortcut + '</span>';
    }
    btn.innerHTML = html;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // --- Keyboard Shortcuts ---

  function handleKeydown(e) {
    // Escape: close (only if not editing)
    if (e.key === 'Escape' && !e.target.getAttribute('contenteditable')) {
      handleClose();
      return;
    }

    const mod = isMac ? e.metaKey : e.ctrlKey;

    // Ctrl/Cmd + G: Group selected
    if (mod && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      if (gridInstance) gridInstance.groupSelected();
      return;
    }

    // Ctrl/Cmd + M: Merge selected
    if (mod && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      if (gridInstance) gridInstance.mergeSelected();
      return;
    }

    // Ctrl/Cmd + D: Duplicate selected
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (gridInstance) gridInstance.duplicateSelected();
      return;
    }

    // Delete key: Delete selected rows
    if (e.key === 'Delete' && !e.target.getAttribute('contenteditable')) {
      e.preventDefault();
      if (gridInstance) gridInstance.deleteSelected();
      return;
    }
  }

  render();

  document.addEventListener('keydown', handleKeydown);

  function destroy() {
    document.removeEventListener('keydown', handleKeydown);
    if (floatingBar) floatingBar.remove();
    overlay.remove();
  }

  return { element: overlay, destroy };
}
