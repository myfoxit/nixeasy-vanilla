// Templates View
// Ported from React TemplatesView.tsx (123 lines) - template list with DataTable,
// search, pagination, new/edit navigation, delete with confirm modal

import { pb } from '../api.js';
import { navigate } from '../router.js';
import { createDataTable } from '../components/data-table.js';
import { showConfirmModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { createRowActions } from '../components/row-actions.js';

/**
 * Create the quote templates list view.
 *
 * @param {HTMLElement} container
 */
export function createTemplatesView(container) {
  container.innerHTML = '';

  // --- State ---
  let templates = [];
  let loading = true;
  let page = 1;
  let totalPages = 1;
  let search = '';
  let destroyed = false;

  // --- Action button ---
  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Template';
  newBtn.addEventListener('click', () => navigate('/templates/new'));

  // --- Columns ---
  function getColumns() {
    return [
      {
        header: '#',
        style: { width: 50, paddingLeft: '1.5rem' },
        cellStyle: { paddingLeft: '1.5rem' },
        render: (_, index) => {
          const span = document.createElement('span');
          span.className = 'text-secondary text-xs';
          span.textContent = (page - 1) * 20 + index + 1;
          return span;
        },
      },
      {
        header: 'Name',
        accessor: 'name',
        style: { paddingLeft: '1.5rem' },
        cellStyle: { paddingLeft: '1.5rem' },
      },
      {
        header: 'Description',
        accessor: 'description',
      },
      {
        header: 'Items',
        style: { width: 80 },
        render: (t) => t.template_data?.lineItems?.length || 0,
      },
      {
        header: 'Created',
        style: { width: 120 },
        render: (t) => new Date(t.created).toLocaleDateString('de-DE'),
      },
      {
        header: 'Actions',
        style: { width: 120, textAlign: 'right' },
        render: (t) => createRowActions({
          onEdit: () => navigate(`/templates/${t.id}`),
          more: [
            { label: 'Delete', onClick: () => handleDelete(t.id, t.name), danger: true },
          ],
        }),
      },
    ];
  }

  // --- DataTable ---
  const dt = createDataTable({
    title: 'Quote Templates',
    subtitle: 'Manage reusable quote configurations',
    action: newBtn,
    columns: getColumns(),
    data: [],
    loading: true,
    page,
    totalPages,
    searchPlaceholder: 'Search templates...',
    onSearch: (val) => {
      search = val;
      page = 1;
      fetchTemplates();
    },
    onPageChange: (p) => {
      page = p;
      fetchTemplates();
    },
    onRowClick: (t) => navigate(`/templates/${t.id}`),
  });

  container.appendChild(dt.element);

  // --- Data loading ---
  async function fetchTemplates() {
    if (destroyed) return;
    loading = true;
    dt.update({ loading: true, columns: getColumns() });

    try {
      const filter = search ? `name ~ "${search}"` : '';
      const result = await pb.collection('quote_templates').getList(page, 20, {
        filter,
        sort: '-created',
      });

      templates = result.items;
      totalPages = result.totalPages;
    } catch (e) {
      console.error(e);
    }

    loading = false;
    if (!destroyed) {
      dt.update({ data: templates, loading: false, page, totalPages, columns: getColumns() });
    }
  }

  // --- Delete ---
  function handleDelete(id, name) {
    showConfirmModal({
      title: 'Delete Template',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await pb.collection('quote_templates').delete(id);
          showToast(`"${name}" deleted successfully`, 'success');
          fetchTemplates();
        } catch (err) {
          showToast('Failed to delete template: ' + (err.message || 'Unknown error'), 'error');
        }
      },
    });
  }

  // Initial load
  fetchTemplates();

  return {
    destroy() {
      destroyed = true;
      dt.destroy();
    },
  };
}
