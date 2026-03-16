// Text Containers View
// CRUD for reusable text blocks with Quill WYSIWYG editor and variable insertion

import { pb } from '../api.js';
import { createDataTable } from '../components/data-table.js';
import { showConfirmModal } from '../components/modal.js';
import { createRowActions } from '../components/row-actions.js';
import { showToast } from '../components/toast.js';
import { getAvailableVariables, getSampleVariableMap, resolveVariables } from '../lib/variable-resolver.js';

const CATEGORIES = ['header', 'body', 'pricing', 'footer', 'legal'];

const CATEGORY_COLORS = {
  header: '#6366f1',
  body: '#3b82f6',
  pricing: '#f59e0b',
  footer: '#6b7280',
  legal: '#ef4444',
};

/**
 * Create the text containers list + editor view.
 * @param {HTMLElement} container
 */
export function createTextContainersView(container) {
  container.innerHTML = '';

  let items = [];
  let loading = true;
  let search = '';
  let page = 1;
  let totalPages = 1;
  let sortColumn = null;
  let sortDirection = null;
  let modalBackdrop = null;
  let destroyed = false;
  let quillInstance = null;

  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Text Container';
  newBtn.addEventListener('click', () => openEditor(null));

  function getColumns() {
    return [
      {
        header: '#',
        style: { width: '50px' },
        render: (_, index) => {
          const span = document.createElement('span');
          span.className = 'text-secondary text-xs';
          span.textContent = (page - 1) * 20 + index + 1;
          return span;
        },
      },
      {
        header: 'Name',
        sortable: true,
        sortKey: 'name',
        render: (item) => {
          const span = document.createElement('span');
          span.className = 'font-medium';
          span.textContent = item.name;
          return span;
        },
      },
      {
        header: 'Category',
        sortable: true,
        sortKey: 'category',
        render: (item) => {
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.style.cssText = `background:${CATEGORY_COLORS[item.category] || '#6b7280'}20;color:${CATEGORY_COLORS[item.category] || '#6b7280'};font-size:0.7rem;padding:2px 8px;border-radius:4px;text-transform:capitalize;`;
          badge.textContent = item.category || '-';
          return badge;
        },
      },
      {
        header: 'Preview',
        render: (item) => {
          const span = document.createElement('span');
          span.className = 'text-secondary text-xs';
          const text = stripHtml(item.content || '');
          span.textContent = text.length > 60 ? text.substring(0, 60) + '...' : text;
          return span;
        },
      },
      {
        header: 'Updated',
        sortable: true,
        sortKey: 'updated',
        render: (item) => {
          const span = document.createElement('span');
          span.className = 'text-secondary text-xs';
          span.textContent = new Date(item.updated).toLocaleDateString('de-DE');
          return span;
        },
      },
      {
        header: 'Actions',
        style: { textAlign: 'right' },
        render: (item) => createRowActions({
          onEdit: () => openEditor(item),
          more: [
            { label: 'Duplicate', onClick: () => duplicateItem(item) },
            { label: 'Delete', onClick: () => handleDelete(item.id, item.name), danger: true },
          ],
        }),
      },
    ];
  }

  const dt = createDataTable({
    title: 'Text Containers',
    subtitle: 'Reusable text blocks for document templates.',
    action: newBtn,
    columns: getColumns(),
    data: [],
    loading: true,
    page,
    totalPages,
    onSearch: (val) => { search = val; page = 1; loadData(); },
    onPageChange: (p) => { page = p; loadData(); },
    onRowClick: (item) => openEditor(item),
    sortColumn,
    sortDirection,
    onSort: (key, dir) => { sortColumn = dir ? key : null; sortDirection = dir; page = 1; loadData(); },
  });

  container.appendChild(dt.element);

  async function loadData() {
    if (destroyed) return;
    loading = true;
    dt.update({ loading: true, columns: getColumns() });

    try {
      let sort = '-updated';
      if (sortColumn && sortDirection) {
        sort = sortDirection === 'desc' ? `-${sortColumn}` : sortColumn;
      }

      const res = await pb.collection('text_containers').getList(page, 20, {
        filter: search ? `name ~ "${search}" || category ~ "${search}"` : '',
        sort,
      });

      items = res.items;
      totalPages = res.totalPages;
    } catch (e) {
      console.error('Failed to load text containers:', e);
    }

    loading = false;
    if (!destroyed) {
      dt.update({ data: items, loading: false, page, totalPages, columns: getColumns(), sortColumn, sortDirection });
    }
  }

  function handleDelete(id, name) {
    showConfirmModal({
      title: 'Delete Text Container',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await pb.collection('text_containers').delete(id);
          showToast(`"${name}" deleted successfully`, 'success');
          loadData();
        } catch (err) {
          showToast('Failed to delete text container', 'error');
        }
      },
    });
  }

  async function duplicateItem(item) {
    try {
      await pb.collection('text_containers').create({
        name: item.name + ' (copy)',
        content: item.content,
        category: item.category,
      });
      showToast('Text container duplicated', 'success');
      loadData();
    } catch (err) {
      showToast('Failed to duplicate', 'error');
    }
  }

  // =========================================================================
  // Editor modal (full-screen overlay with Quill)
  // =========================================================================
  function openEditor(editItem) {
    closeEditor();

    modalBackdrop = document.createElement('div');
    modalBackdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;display:flex;align-items:center;justify-content:center;';

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'width:95%;max-width:1100px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;';
    card.addEventListener('click', (e) => e.stopPropagation());

    // Header
    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = 'padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;';
    const h3 = document.createElement('h3');
    h3.style.margin = '0';
    h3.textContent = editItem ? 'Edit Text Container' : 'New Text Container';
    headerDiv.appendChild(h3);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-ghost';
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = 'font-size:1.5rem;padding:4px 10px;line-height:1;';
    closeBtn.addEventListener('click', closeEditor);
    headerDiv.appendChild(closeBtn);
    card.appendChild(headerDiv);

    // Body - split into editor and preview
    const body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow:auto;display:grid;grid-template-columns:1fr 1fr;';

    // Left: form + editor
    const leftPanel = document.createElement('div');
    leftPanel.style.cssText = 'padding:20px;border-right:1px solid var(--border);display:flex;flex-direction:column;gap:12px;overflow-y:auto;';

    // Name field
    const nameGroup = document.createElement('div');
    nameGroup.className = 'form-group';
    nameGroup.style.marginBottom = '0';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name';
    const nameInput = document.createElement('input');
    nameInput.name = 'name';
    nameInput.required = true;
    if (editItem) nameInput.value = editItem.name || '';
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    leftPanel.appendChild(nameGroup);

    // Category select
    const catGroup = document.createElement('div');
    catGroup.className = 'form-group';
    catGroup.style.marginBottom = '0';
    const catLabel = document.createElement('label');
    catLabel.textContent = 'Category';
    const catSelect = document.createElement('select');
    CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
      if (editItem && editItem.category === cat) opt.selected = true;
      catSelect.appendChild(opt);
    });
    catGroup.appendChild(catLabel);
    catGroup.appendChild(catSelect);
    leftPanel.appendChild(catGroup);

    // Variable insertion toolbar
    const varToolbar = document.createElement('div');
    varToolbar.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
    const varLabel = document.createElement('span');
    varLabel.className = 'text-xs text-secondary';
    varLabel.textContent = 'Insert Variable:';
    varToolbar.appendChild(varLabel);

    const varGroups = getAvailableVariables();
    const varSelect = document.createElement('select');
    varSelect.style.cssText = 'font-size:0.8rem;padding:4px 8px;max-width:220px;';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Select variable...';
    varSelect.appendChild(defaultOpt);
    varGroups.forEach(group => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.group;
      group.vars.forEach(v => {
        const opt = document.createElement('option');
        opt.value = `{{${v.key}}}`;
        opt.textContent = v.label;
        optgroup.appendChild(opt);
      });
      varSelect.appendChild(optgroup);
    });

    const insertBtn = document.createElement('button');
    insertBtn.className = 'btn btn-secondary btn-sm';
    insertBtn.textContent = 'Insert';
    insertBtn.addEventListener('click', () => {
      if (!varSelect.value || !quillInstance) return;
      const range = quillInstance.getSelection(true);
      quillInstance.insertText(range.index, varSelect.value);
      quillInstance.setSelection(range.index + varSelect.value.length);
      varSelect.value = '';
      updatePreview();
    });

    varToolbar.appendChild(varSelect);
    varToolbar.appendChild(insertBtn);
    leftPanel.appendChild(varToolbar);

    // Quill editor container
    const editorWrapper = document.createElement('div');
    editorWrapper.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:300px;';
    const editorEl = document.createElement('div');
    editorEl.id = 'tc-quill-editor';
    editorEl.style.cssText = 'flex:1;';
    editorWrapper.appendChild(editorEl);
    leftPanel.appendChild(editorWrapper);

    body.appendChild(leftPanel);

    // Right: preview
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = 'padding:20px;overflow-y:auto;background:var(--bg);';

    const previewTitle = document.createElement('div');
    previewTitle.style.cssText = 'font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin-bottom:12px;';
    previewTitle.textContent = 'Preview (with sample data)';
    rightPanel.appendChild(previewTitle);

    const previewContent = document.createElement('div');
    previewContent.style.cssText = 'background:white;padding:20px;border-radius:8px;border:1px solid var(--border);color:#111827;font-size:11pt;line-height:1.6;min-height:200px;';
    rightPanel.appendChild(previewContent);

    body.appendChild(rightPanel);
    card.appendChild(body);

    // Footer with save/cancel
    const footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeEditor);
    footer.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) { showToast('Name is required', 'warning'); return; }

      const content = quillInstance ? quillInstance.root.innerHTML : '';
      const category = catSelect.value;

      try {
        if (editItem) {
          await pb.collection('text_containers').update(editItem.id, { name, content, category });
        } else {
          await pb.collection('text_containers').create({ name, content, category });
        }
        closeEditor();
        showToast(editItem ? 'Text container updated' : 'Text container created', 'success');
        loadData();
      } catch (err) {
        showToast('Failed to save: ' + (err.message || 'Unknown error'), 'error');
      }
    });
    footer.appendChild(saveBtn);
    card.appendChild(footer);

    modalBackdrop.appendChild(card);
    document.body.appendChild(modalBackdrop);

    // Initialize Quill
    requestAnimationFrame(() => {
      if (typeof window.Quill === 'undefined') {
        editorEl.innerHTML = '<p style="color:var(--danger);padding:20px;">Quill.js not loaded. Please check CDN script in index.html.</p>';
        return;
      }

      quillInstance = new window.Quill(editorEl, {
        theme: 'snow',
        placeholder: 'Enter content with {{variables}}...',
        modules: {
          toolbar: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ color: [] }, { background: [] }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            [{ align: [] }],
            ['blockquote'],
            ['link', 'image'],
            ['clean'],
          ],
        },
      });

      if (editItem && editItem.content) {
        quillInstance.root.innerHTML = editItem.content;
      }

      quillInstance.on('text-change', () => updatePreview());
      updatePreview();
    });

    function updatePreview() {
      if (!quillInstance) return;
      const html = quillInstance.root.innerHTML;
      const sampleMap = getSampleVariableMap();
      const sampleQuoteData = {
        lineItems: [
          { sku: 'LIC-001', name: 'FortiGate 60F', price: 1200, amount: 2, margin: 25, slaName: 'Premium' },
          { sku: 'LIC-002', name: 'FortiSwitch 124E', price: 450, amount: 5, margin: 25, slaName: 'Standard' },
        ],
        groups: [],
        summary: { hk: 4050, vk: 5062.5, monthly: 168.75 },
      };
      previewContent.innerHTML = resolveVariables(html, sampleMap, sampleQuoteData);
    }

    // Close on backdrop click
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeEditor();
    });

    // Focus name input
    requestAnimationFrame(() => nameInput.focus());
  }

  function closeEditor() {
    if (quillInstance) {
      quillInstance = null;
    }
    if (modalBackdrop && modalBackdrop.parentNode) {
      modalBackdrop.parentNode.removeChild(modalBackdrop);
    }
    modalBackdrop = null;
  }

  // Initial load
  loadData();

  return {
    destroy() {
      destroyed = true;
      closeEditor();
      dt.destroy();
    },
  };
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}
