// Presentation Editor - Full-screen overlay for editing presentation layer
// Opens on Export, allows reordering, merging, section headers, notes.

import { showToast } from '../components/toast.js';
import { createPresentationGrid, buildItemsFromSource, detectSourceChanges } from './presentation-grid.js';
import { exportPresentationToCsv, exportPresentationToExcel } from '../utils/export.js';

/**
 * Create and open the Presentation Editor overlay.
 *
 * @param {Object} props
 * @param {Object}   props.config             - Current config with lineItems, summary
 * @param {Array}    props.licenses           - License objects
 * @param {Array}    [props.presentationItems] - Previously saved presentation items
 * @param {number}   [props.presentationVersion] - Version counter for change detection
 * @param {boolean}  props.isTemplateMode     - Template mode flag
 * @param {string}   props.templateName       - Template name for filename
 * @param {string}   props.quoteId            - Quote ID for filename
 * @param {Function} props.onClose            - (presentationItems) => void
 * @param {Function} props.onExport           - (format, presentationItems) => void
 * @returns {{ element: HTMLElement, destroy: Function }}
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

  // If we have saved presentation items, use those; otherwise build from source
  if (presentationItems && presentationItems.length > 0) {
    items = presentationItems.map(i => ({ ...i }));
    // Check for source changes
    hasSourceWarning = detectSourceChanges(items, config.lineItems);
  } else {
    items = buildItemsFromSource(config.lineItems);
  }

  let gridInstance = null;

  function handleItemsChange(newItems) {
    items = newItems;
  }

  function handleClose() {
    if (onClose) onClose(items);
    overlay.remove();
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

  function render() {
    overlay.innerHTML = '';

    // --- Toolbar ---
    const toolbar = document.createElement('div');
    toolbar.className = 'presentation-toolbar';

    // Left: title + warning
    const toolbarLeft = document.createElement('div');
    toolbarLeft.style.cssText = 'display:flex;align-items:center;gap:12px;';

    const title = document.createElement('h2');
    title.style.cssText = 'font-size:1.1rem;font-weight:700;margin:0;';
    title.textContent = 'Presentation Editor';
    toolbarLeft.appendChild(title);

    if (hasSourceWarning) {
      const warn = document.createElement('span');
      warn.style.cssText = 'font-size:0.75rem;padding:3px 8px;border-radius:4px;background:#fef3c7;color:#92400e;font-weight:500;';
      warn.textContent = 'Source data changed since last edit';
      toolbarLeft.appendChild(warn);
    }

    toolbar.appendChild(toolbarLeft);

    // Center: action buttons
    const toolbarCenter = document.createElement('div');
    toolbarCenter.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const addHeaderBtn = createToolbarBtn('Add Header', () => {
      if (gridInstance) {
        const selIds = gridInstance.getSelectedIds();
        gridInstance.addHeader(selIds.length > 0 ? selIds[0] : null);
      }
    });
    toolbarCenter.appendChild(addHeaderBtn);

    const mergeBtn = createToolbarBtn('Merge Selected', () => {
      if (gridInstance) gridInstance.mergeSelected();
    });
    toolbarCenter.appendChild(mergeBtn);

    const deleteBtn = createToolbarBtn('Delete Selected', () => {
      if (gridInstance) gridInstance.deleteSelected();
    }, true);
    toolbarCenter.appendChild(deleteBtn);

    const resetBtn = createToolbarBtn('Reset to Source', handleResetToSource);
    toolbarCenter.appendChild(resetBtn);

    toolbar.appendChild(toolbarCenter);

    // Right: export + close
    const toolbarRight = document.createElement('div');
    toolbarRight.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const exportCsvBtn = createToolbarBtn('Export CSV', () => handleExport('csv'));
    exportCsvBtn.classList.add('btn-primary');
    toolbarRight.appendChild(exportCsvBtn);

    const exportXlsxBtn = createToolbarBtn('Export Excel', () => handleExport('xlsx'));
    exportXlsxBtn.classList.add('btn-primary');
    toolbarRight.appendChild(exportXlsxBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-secondary';
    closeBtn.textContent = 'Close';
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
    gridContainer.appendChild(gridInstance.element);
    overlay.appendChild(gridContainer);
  }

  function createToolbarBtn(text, onClick, danger) {
    const btn = document.createElement('button');
    btn.className = `btn btn-sm ${danger ? 'btn-danger-outline' : 'btn-secondary'}`;
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // Escape key to close
  function handleKeydown(e) {
    if (e.key === 'Escape' && !e.target.getAttribute('contenteditable')) {
      handleClose();
    }
  }

  render();

  document.addEventListener('keydown', handleKeydown);

  function destroy() {
    document.removeEventListener('keydown', handleKeydown);
    overlay.remove();
  }

  return { element: overlay, destroy };
}
