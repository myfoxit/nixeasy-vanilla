// Document Templates View
// List view + Template Builder for composing text containers into documents

import { pb } from '../api.js';
import { navigate } from '../router.js';
import { createDataTable } from '../components/data-table.js';
import { showConfirmModal } from '../components/modal.js';
import { createRowActions } from '../components/row-actions.js';
import { showToast } from '../components/toast.js';

/**
 * Create the document templates list view.
 * @param {HTMLElement} container
 */
export function createDocumentTemplatesView(container) {
  container.innerHTML = '';

  let items = [];
  let loading = true;
  let search = '';
  let page = 1;
  let totalPages = 1;
  let sortColumn = null;
  let sortDirection = null;
  let destroyed = false;
  let modalBackdrop = null;

  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Template';
  newBtn.addEventListener('click', () => openCreateModal());

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
        header: 'Description',
        render: (item) => {
          const span = document.createElement('span');
          span.className = 'text-secondary text-xs';
          span.textContent = item.description || '-';
          return span;
        },
      },
      {
        header: 'Containers',
        render: (item) => {
          const containers = item.containers || [];
          const span = document.createElement('span');
          span.className = 'badge';
          span.textContent = containers.length;
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
          onEdit: () => navigate(`/document-templates/${item.id}`),
          more: [
            { label: 'Duplicate', onClick: () => duplicateTemplate(item) },
            { label: 'Delete', onClick: () => handleDelete(item.id, item.name), danger: true },
          ],
        }),
      },
    ];
  }

  const dt = createDataTable({
    title: 'Document Templates',
    subtitle: 'Compose text containers into reusable document templates.',
    action: newBtn,
    columns: getColumns(),
    data: [],
    loading: true,
    page,
    totalPages,
    onSearch: (val) => { search = val; page = 1; loadData(); },
    onPageChange: (p) => { page = p; loadData(); },
    onRowClick: (item) => navigate(`/document-templates/${item.id}`),
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

      const res = await pb.collection('document_templates').getList(page, 20, {
        filter: search ? `name ~ "${search}"` : '',
        sort,
      });

      items = res.items;
      totalPages = res.totalPages;
    } catch (e) {
      console.error('Failed to load document templates:', e);
    }

    loading = false;
    if (!destroyed) {
      dt.update({ data: items, loading: false, page, totalPages, columns: getColumns(), sortColumn, sortDirection });
    }
  }

  function handleDelete(id, name) {
    showConfirmModal({
      title: 'Delete Document Template',
      message: `Are you sure you want to delete "${name}"?`,
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await pb.collection('document_templates').delete(id);
          showToast(`"${name}" deleted`, 'success');
          loadData();
        } catch (err) {
          showToast('Failed to delete template', 'error');
        }
      },
    });
  }

  async function duplicateTemplate(item) {
    try {
      await pb.collection('document_templates').create({
        name: item.name + ' (copy)',
        description: item.description,
        containers: item.containers,
        page_settings: item.page_settings,
      });
      showToast('Template duplicated', 'success');
      loadData();
    } catch (err) {
      showToast('Failed to duplicate', 'error');
    }
  }

  function openCreateModal() {
    closeModal();
    modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';
    modalBackdrop.addEventListener('click', closeModal);

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'width:100%;max-width:500px;';
    card.addEventListener('click', (e) => e.stopPropagation());

    const headerDiv = document.createElement('div');
    headerDiv.className = 'p-4 border-b';
    const h3 = document.createElement('h3');
    h3.textContent = 'New Document Template';
    headerDiv.appendChild(h3);
    card.appendChild(headerDiv);

    const form = document.createElement('form');
    form.className = 'p-6';

    const nameGroup = document.createElement('div');
    nameGroup.className = 'form-group';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Template Name';
    const nameInput = document.createElement('input');
    nameInput.name = 'name';
    nameInput.required = true;
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    form.appendChild(nameGroup);

    const descGroup = document.createElement('div');
    descGroup.className = 'form-group';
    const descLabel = document.createElement('label');
    descLabel.textContent = 'Description (optional)';
    const descInput = document.createElement('input');
    descInput.name = 'description';
    descGroup.appendChild(descLabel);
    descGroup.appendChild(descInput);
    form.appendChild(descGroup);

    const btnRow = document.createElement('div');
    btnRow.className = 'flex justify-end gap-2 mt-4';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeModal);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Create & Edit';

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    form.appendChild(btnRow);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.currentTarget).entries());
      if (!data.name.trim()) { showToast('Name is required', 'warning'); return; }
      try {
        const res = await pb.collection('document_templates').create({
          name: data.name,
          description: data.description || '',
          containers: [],
          page_settings: { margins: { top: 20, right: 20, bottom: 20, left: 20 }, orientation: 'portrait', header: '', footer: '' },
        });
        closeModal();
        navigate(`/document-templates/${res.id}`);
      } catch (err) {
        showToast('Failed to create template', 'error');
      }
    });

    card.appendChild(form);
    modalBackdrop.appendChild(card);
    document.body.appendChild(modalBackdrop);
    requestAnimationFrame(() => nameInput.focus());
  }

  function closeModal() {
    if (modalBackdrop && modalBackdrop.parentNode) {
      modalBackdrop.parentNode.removeChild(modalBackdrop);
    }
    modalBackdrop = null;
  }

  loadData();

  return {
    destroy() {
      destroyed = true;
      closeModal();
      dt.destroy();
    },
  };
}
