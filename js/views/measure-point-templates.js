// Measure Point Templates View
// Ported from React MeasurePointTemplatesView.tsx - full CRUD with DataTable

import { pb } from '../api.js';
import { createDataTable } from '../components/data-table.js';
import { createSelect } from '../components/select.js';
import { showConfirmModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

const TYPE_OPTIONS = [
  { value: 'APPLICATION', label: 'APPLICATION' },
  { value: 'SYSTEM', label: 'SYSTEM' },
  { value: 'CSM DEF', label: 'CSM DEF' },
];

const PAGE_SIZE = 20;

/**
 * Get the badge CSS class for a template type.
 * @param {string} type
 * @returns {string}
 */
function getTypeBadgeClass(type) {
  switch (type) {
    case 'APPLICATION': return 'badge-success';
    case 'SYSTEM': return 'badge-warning';
    case 'CSM DEF': return 'badge-info';
    default: return '';
  }
}

/**
 * Create the Measure Point Templates view with DataTable, CRUD modal, and delete confirm.
 *
 * @param {HTMLElement} container - The container to render into.
 * @returns {{ destroy: Function }}
 */
export function createMeasurePointTemplatesView(container) {
  container.innerHTML = '';

  // --- State ---
  let templates = [];
  let loading = true;
  let search = '';
  let page = 1;
  let totalPages = 1;
  let sortColumn = null;
  let sortDirection = null;
  let editItem = null; // null = new, object = edit

  // --- Data loading ---
  async function loadData() {
    loading = true;
    dataTable.update({ loading: true });

    try {
      let sort = 'name';
      if (sortColumn && sortDirection) {
        sort = sortDirection === 'desc' ? `-${sortColumn}` : sortColumn;
      }

      const filter = search
        ? `name ~ "${search}" || type ~ "${search}" || check_description ~ "${search}"`
        : '';

      const res = await pb.collection('measurepoint_templates').getList(page, PAGE_SIZE, {
        filter,
        sort,
      });

      templates = res.items;
      totalPages = res.totalPages;
    } catch (e) {
      console.error('Error loading measure point templates:', e);
    }

    loading = false;
    dataTable.update({
      data: templates,
      loading: false,
      page,
      totalPages,
      sortColumn,
      sortDirection,
    });
  }

  // --- Column definitions ---
  function getColumns() {
    return [
      {
        header: '#',
        style: { width: '50px' },
        render: (_, index) => {
          const span = document.createElement('span');
          span.className = 'text-secondary text-xs';
          span.textContent = String((page - 1) * PAGE_SIZE + (index ?? 0) + 1);
          return span;
        },
      },
      {
        header: 'Type',
        sortable: true,
        sortKey: 'type',
        style: { width: '120px' },
        render: (t) => {
          const badge = document.createElement('span');
          badge.className = `badge ${getTypeBadgeClass(t.type)}`;
          badge.textContent = t.type;
          return badge;
        },
      },
      {
        header: 'Name',
        sortable: true,
        sortKey: 'name',
        render: (t) => {
          const span = document.createElement('span');
          span.style.fontWeight = '500';
          span.textContent = t.name;
          return span;
        },
      },
      {
        header: 'Avg Checks',
        sortable: true,
        sortKey: 'average_checks',
        align: 'center',
        style: { width: '100px' },
        render: (t) => {
          const span = document.createElement('span');
          span.className = 'font-mono text-sm';
          span.textContent = String(t.average_checks);
          return span;
        },
      },
      {
        header: 'Min Checks',
        sortable: true,
        sortKey: 'minimum_checks',
        align: 'center',
        style: { width: '100px' },
        render: (t) => {
          const span = document.createElement('span');
          span.className = 'font-mono text-sm';
          span.textContent = String(t.minimum_checks);
          return span;
        },
      },
      {
        header: 'Description',
        render: (t) => {
          const span = document.createElement('span');
          span.className = 'text-secondary text-xs';
          span.style.cssText = 'display:block;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
          span.title = t.check_description || '';
          span.textContent = t.check_description || '-';
          return span;
        },
      },
      {
        header: 'Created',
        sortable: true,
        sortKey: 'created',
        render: (t) => {
          const span = document.createElement('span');
          span.className = 'text-secondary text-xs';
          span.textContent = new Date(t.created).toLocaleDateString();
          return span;
        },
      },
      {
        header: 'Actions',
        style: { textAlign: 'right' },
        align: 'right',
        render: (t) => {
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'display:flex;justify-content:flex-end;gap:0.5rem;';

          const editBtn = document.createElement('button');
          editBtn.className = 'btn btn-secondary btn-sm';
          editBtn.textContent = 'Edit';
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editItem = t;
            openModal();
          });

          const delBtn = document.createElement('button');
          delBtn.className = 'btn btn-ghost btn-sm';
          delBtn.style.color = 'var(--danger)';
          delBtn.textContent = 'Del';
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleDelete(t);
          });

          wrapper.appendChild(editBtn);
          wrapper.appendChild(delBtn);
          return wrapper;
        },
      },
    ];
  }

  // --- Action button ---
  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Template';
  newBtn.addEventListener('click', () => {
    editItem = null;
    openModal();
  });

  // --- Create DataTable ---
  const dataTable = createDataTable({
    title: 'Measure Point Templates',
    subtitle: 'Manage monitoring measure point templates.',
    action: newBtn,
    columns: getColumns(),
    data: [],
    loading: true,
    page: 1,
    totalPages: 1,
    onSearch: (val) => {
      search = val;
      page = 1;
      loadData();
    },
    onPageChange: (newPage) => {
      page = newPage;
      loadData();
    },
    searchPlaceholder: 'Search by name, type, or description...',
    sortColumn: null,
    sortDirection: null,
    onSort: (key, direction) => {
      sortColumn = direction ? key : null;
      sortDirection = direction;
      page = 1;
      // Re-render columns for sort icons + reload data
      dataTable.update({ columns: getColumns(), sortColumn, sortDirection });
      loadData();
    },
  });

  container.appendChild(dataTable.element);

  // --- Modal (New / Edit) ---
  let modalBackdrop = null;
  let typeSelect = null;

  function openModal() {
    closeModal(); // Ensure no double modals

    modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';
    modalBackdrop.addEventListener('click', closeModal);

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'width:100%;max-width:600px;overflow:visible;';
    card.addEventListener('click', (e) => e.stopPropagation());

    // Header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'p-4 border-b';
    const modalTitle = document.createElement('h3');
    modalTitle.textContent = editItem ? 'Edit Measure Point Template' : 'New Measure Point Template';
    modalHeader.appendChild(modalTitle);
    card.appendChild(modalHeader);

    // Form
    const form = document.createElement('form');
    form.className = 'p-6';
    form.style.overflow = 'visible';

    // Name field
    const nameGroup = document.createElement('div');
    nameGroup.className = 'form-group';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name';
    const nameInput = document.createElement('input');
    nameInput.name = 'name';
    nameInput.required = true;
    nameInput.value = editItem?.name || '';
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    form.appendChild(nameGroup);

    // Row: Type, Average Checks, Minimum Checks
    const formRow = document.createElement('div');
    formRow.className = 'form-row';

    // Type select
    const typeGroup = document.createElement('div');
    typeGroup.className = 'form-group';
    const typeLabel = document.createElement('label');
    typeLabel.textContent = 'Type';
    typeSelect = createSelect({
      name: 'type',
      options: TYPE_OPTIONS,
      defaultValue: editItem?.type || 'APPLICATION',
    });
    typeGroup.appendChild(typeLabel);
    typeGroup.appendChild(typeSelect.element);

    // Average Checks
    const avgGroup = document.createElement('div');
    avgGroup.className = 'form-group';
    const avgLabel = document.createElement('label');
    avgLabel.textContent = 'Average Checks';
    const avgInput = document.createElement('input');
    avgInput.name = 'average_checks';
    avgInput.type = 'number';
    avgInput.min = '0';
    avgInput.value = String(editItem?.average_checks || 0);
    avgGroup.appendChild(avgLabel);
    avgGroup.appendChild(avgInput);

    // Minimum Checks
    const minGroup = document.createElement('div');
    minGroup.className = 'form-group';
    const minLabel = document.createElement('label');
    minLabel.textContent = 'Minimum Checks';
    const minInput = document.createElement('input');
    minInput.name = 'minimum_checks';
    minInput.type = 'number';
    minInput.min = '0';
    minInput.value = String(editItem?.minimum_checks || 0);
    minGroup.appendChild(minLabel);
    minGroup.appendChild(minInput);

    formRow.appendChild(typeGroup);
    formRow.appendChild(avgGroup);
    formRow.appendChild(minGroup);
    form.appendChild(formRow);

    // Check Description (textarea)
    const descGroup = document.createElement('div');
    descGroup.className = 'form-group';
    const descLabel = document.createElement('label');
    descLabel.textContent = 'Check Description';
    const descTextarea = document.createElement('textarea');
    descTextarea.name = 'check_description';
    descTextarea.rows = 4;
    descTextarea.style.cssText = 'width:100%;resize:vertical;';
    descTextarea.value = editItem?.check_description || '';
    descGroup.appendChild(descLabel);
    descGroup.appendChild(descTextarea);
    form.appendChild(descGroup);

    // Button row
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
    saveBtn.textContent = 'Save';

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    form.appendChild(btnRow);

    // Submit handler
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = {
        name: nameInput.value,
        type: typeSelect.getValue(),
        average_checks: parseInt(avgInput.value) || 0,
        minimum_checks: parseInt(minInput.value) || 0,
        check_description: descTextarea.value,
      };

      try {
        if (editItem) {
          await pb.collection('measurepoint_templates').update(editItem.id, data);
          showToast('Template updated successfully', 'success');
        } else {
          await pb.collection('measurepoint_templates').create(data);
          showToast('Template created successfully', 'success');
        }
        closeModal();
        loadData();
      } catch (err) {
        console.error('Error saving template:', err);
        showToast('Failed to save template', 'error');
      }
    });

    card.appendChild(form);
    modalBackdrop.appendChild(card);
    document.body.appendChild(modalBackdrop);
  }

  function closeModal() {
    if (typeSelect) {
      typeSelect.destroy();
      typeSelect = null;
    }
    if (modalBackdrop && modalBackdrop.parentNode) {
      modalBackdrop.parentNode.removeChild(modalBackdrop);
    }
    modalBackdrop = null;
  }

  // --- Delete handler ---
  function handleDelete(template) {
    showConfirmModal({
      title: 'Delete Template',
      message: `Are you sure you want to delete "${template.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await pb.collection('measurepoint_templates').delete(template.id);
          showToast(`"${template.name}" deleted successfully`, 'success');
          loadData();
        } catch (err) {
          console.error('Error deleting template:', err);
          showToast('Failed to delete template', 'error');
        }
      },
    });
  }

  // --- Initial load ---
  loadData();

  // --- Cleanup ---
  function destroy() {
    closeModal();
    dataTable.destroy();
  }

  return { destroy };
}
