// Document Templates List View
// Standard list view for document templates (View 1)

import { pb } from '../api.js';
import { navigate } from '../router.js';
import { createDataTable } from '../components/data-table.js';
import { showConfirmModal } from '../components/modal.js';
import { createRowActions } from '../components/row-actions.js';
import { showToast } from '../components/toast.js';

export function createDocumentListView(container) {
  container.innerHTML = '';

  let documents = [];
  let loading = true;
  let search = '';
  let page = 1;
  let totalPages = 1;
  let sortColumn = null;
  let sortDirection = null;
  let destroyed = false;

  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Document';
  newBtn.addEventListener('click', () => navigate('/documents/new'));

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
        render: (d) => {
          const span = document.createElement('span');
          span.className = 'font-medium';
          span.textContent = d.name;
          return span;
        },
      },
      {
        header: 'Description',
        render: (d) => {
          const span = document.createElement('span');
          span.className = 'text-secondary';
          span.textContent = d.description || '-';
          return span;
        },
      },
      {
        header: 'Updated',
        sortable: true,
        sortKey: 'updated',
        render: (d) => {
          const span = document.createElement('span');
          span.className = 'text-secondary text-xs';
          span.textContent = new Date(d.updated).toLocaleDateString('de-DE');
          return span;
        },
      },
      {
        header: 'Actions',
        style: { textAlign: 'right' },
        render: (d) => createRowActions({
          onEdit: () => navigate(`/documents/${d.id}`),
          more: [
            { label: 'Duplicate', onClick: () => handleDuplicate(d) },
            { label: 'Delete', onClick: () => handleDelete(d.id, d.name), danger: true },
          ],
        }),
      },
    ];
  }

  const dt = createDataTable({
    title: 'Documents',
    subtitle: 'Manage your document templates.',
    action: newBtn,
    columns: getColumns(),
    data: [],
    loading: true,
    page,
    totalPages,
    onSearch: (val) => { search = val; page = 1; loadData(); },
    onPageChange: (p) => { page = p; loadData(); },
    onRowClick: (d) => navigate(`/documents/${d.id}`),
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
        filter: search ? `name ~ "${search}" || description ~ "${search}"` : '',
        sort,
      });

      documents = res.items;
      totalPages = res.totalPages;
    } catch (e) {
      console.error(e);
    }

    loading = false;
    if (!destroyed) {
      dt.update({ data: documents, loading: false, page, totalPages, columns: getColumns(), sortColumn, sortDirection });
    }
  }

  function handleDelete(id, name) {
    showConfirmModal({
      title: 'Delete Document',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await pb.collection('document_templates').delete(id);
          showToast(`"${name}" deleted successfully`, 'success');
          loadData();
        } catch (err) {
          showToast('Failed to delete document', 'error');
        }
      },
    });
  }

  async function handleDuplicate(doc) {
    try {
      await pb.collection('document_templates').create({
        name: doc.name + ' (Copy)',
        description: doc.description || '',
        containers: doc.containers || [],
        page_settings: doc.page_settings || {},
      });
      showToast('Document duplicated', 'success');
      loadData();
    } catch (err) {
      showToast('Failed to duplicate document', 'error');
    }
  }

  loadData();

  return {
    destroy() {
      destroyed = true;
      dt.destroy();
    },
  };
}
