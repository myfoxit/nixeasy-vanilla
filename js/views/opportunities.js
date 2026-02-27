// Opportunities View
// Ported from React Opportunities.tsx (241 lines) - full CRUD with DataTable,
// sorting, search, customer filter badge, modal for new/edit, delete confirmation

import { pb } from '../api.js';
import { navigate } from '../router.js';
import { createDataTable } from '../components/data-table.js';
import { createSelect } from '../components/select.js';
import { createAsyncSelect } from '../components/async-select.js';
import { showConfirmModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { currency } from '../utils/format.js';

const STATUS_OPTIONS = [
  'NEW', 'IN PROGRESS', 'WON', 'LOST', 'STORNO', 'CALCULATED', 'QUOTE SEND',
].map((s) => ({ value: s, label: s }));

/**
 * Create the opportunities list view.
 *
 * @param {HTMLElement} container
 * @param {Object} params - Route params (unused here but kept for consistency).
 *   Supports filterCustomerId, filterCustomerName passed via route state.
 */
export function createOpportunitiesView(container, params = {}) {
  container.innerHTML = '';

  // --- State ---
  let opps = [];
  let loading = true;
  let search = '';
  let page = 1;
  let totalPages = 1;
  let sortColumn = null;
  let sortDirection = null;

  // Customer filter (can come from navigation state, e.g. from Customers view)
  let customerId = params.customerId || params.filterCustomerId || undefined;
  let customerName = params.customerName || params.filterCustomerName || undefined;

  // Track sub-components for cleanup
  let selectInstance = null;
  let asyncSelectInstance = null;
  let modalBackdrop = null;
  let destroyed = false;

  // --- Customer filter badge ---
  const filterBadgeWrap = document.createElement('div');
  filterBadgeWrap.style.cssText = 'margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;';

  function renderFilterBadge() {
    filterBadgeWrap.innerHTML = '';
    if (customerId && customerName) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-success';
      badge.style.cssText = 'display:inline-flex;align-items:center;gap:0.5rem;padding:0.5rem 0.75rem;';
      badge.textContent = `Filtered by: ${customerName}`;

      const closeBtn = document.createElement('button');
      closeBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:0;margin-left:0.25rem;font-size:1rem;line-height:1;';
      closeBtn.title = 'Clear filter';
      closeBtn.textContent = '\u00d7';
      closeBtn.addEventListener('click', () => {
        customerId = undefined;
        customerName = undefined;
        page = 1;
        renderFilterBadge();
        loadData();
      });

      badge.appendChild(closeBtn);
      filterBadgeWrap.appendChild(badge);
    }
  }

  renderFilterBadge();
  container.appendChild(filterBadgeWrap);

  // --- Action button ---
  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Opportunity';
  newBtn.addEventListener('click', () => openModal(null));

  // --- Columns ---
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
        header: 'Opp #',
        sortable: true,
        sortKey: 'opportunity',
        render: (o) => {
          const span = document.createElement('span');
          span.className = 'font-mono text-xs';
          span.textContent = o.opportunity;
          return span;
        },
      },
      {
        header: 'Title',
        sortable: true,
        sortKey: 'title',
        render: (o) => {
          const span = document.createElement('span');
          span.className = 'font-medium';
          span.style.color = 'var(--primary)';
          span.textContent = o.title;
          return span;
        },
      },
      {
        header: 'Customer',
        sortable: true,
        sortKey: 'customer.name',
        render: (o) => o.expand?.customer?.name || '-',
      },
      {
        header: 'Status',
        sortable: true,
        sortKey: 'status',
        render: (o) => {
          const span = document.createElement('span');
          span.className = 'badge';
          if (o.status === 'WON') span.className += ' badge-success';
          else if (o.status === 'LOST') span.className += ' badge-danger';
          span.textContent = o.status;
          return span;
        },
      },
      {
        header: 'Capex',
        sortable: true,
        sortKey: 'capex',
        render: (o) => currency(o.capex),
      },
      {
        header: 'Monthly',
        sortable: true,
        sortKey: 'opex_monthly',
        render: (o) => currency(o.opex_monthly),
      },
      {
        header: 'Created',
        sortable: true,
        sortKey: 'created',
        render: (o) => {
          const span = document.createElement('span');
          span.className = 'text-secondary text-xs';
          span.textContent = new Date(o.created).toLocaleDateString();
          return span;
        },
      },
      {
        header: 'Actions',
        style: { textAlign: 'right' },
        render: (o) => {
          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex;justify-content:flex-end;gap:0.5rem;';

          const editBtn = document.createElement('button');
          editBtn.className = 'btn btn-secondary btn-sm';
          editBtn.textContent = 'Edit';
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openModal(o);
          });

          const delBtn = document.createElement('button');
          delBtn.className = 'btn btn-ghost btn-sm';
          delBtn.style.color = 'var(--danger)';
          delBtn.textContent = 'Del';
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleDelete(o.id, o.title);
          });

          wrap.appendChild(editBtn);
          wrap.appendChild(delBtn);
          return wrap;
        },
      },
    ];
  }

  // --- Create DataTable ---
  const dt = createDataTable({
    title: 'Opportunities',
    subtitle: 'Manage and track your sales opportunities.',
    action: newBtn,
    columns: getColumns(),
    data: [],
    loading: true,
    page,
    totalPages,
    onSearch: (val) => {
      search = val;
      page = 1;
      loadData();
    },
    onPageChange: (p) => {
      page = p;
      loadData();
    },
    onRowClick: (o) => navigate(`/opportunities/${o.id}/quotes`),
    sortColumn,
    sortDirection,
    onSort: (key, dir) => {
      sortColumn = dir ? key : null;
      sortDirection = dir;
      page = 1;
      loadData();
    },
  });

  container.appendChild(dt.element);

  // --- Data loading ---
  async function loadData() {
    if (destroyed) return;
    loading = true;
    dt.update({ loading: true, columns: getColumns() });

    try {
      let sort = '-created';
      if (sortColumn && sortDirection) {
        sort = sortDirection === 'desc' ? `-${sortColumn}` : sortColumn;
      }

      const filters = [];
      if (search) {
        filters.push(`(title ~ "${search}" || opportunity ~ "${search}" || customer.name ~ "${search}")`);
      }
      if (customerId) {
        filters.push(`customer = "${customerId}"`);
      }

      const res = await pb.collection('opportunities').getList(page, 20, {
        filter: filters.join(' && '),
        expand: 'customer',
        sort,
      });

      opps = res.items;
      totalPages = res.totalPages;
    } catch (e) {
      console.error(e);
    }

    loading = false;
    if (!destroyed) {
      dt.update({ data: opps, loading: false, page, totalPages, columns: getColumns(), sortColumn, sortDirection });
    }
  }

  // --- Delete ---
  function handleDelete(id, name) {
    showConfirmModal({
      title: 'Delete Opportunity',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await pb.collection('opportunities').delete(id);
          showToast(`"${name}" deleted successfully`, 'success');
          loadData();
        } catch (err) {
          showToast('Failed to delete opportunity', 'error');
        }
      },
    });
  }

  // --- Load customers for AsyncSelect ---
  async function loadCustomers(searchTerm, pg) {
    const res = await pb.collection('customers').getList(pg, 20, {
      filter: searchTerm ? `name ~ "${searchTerm}" || debitor ~ "${searchTerm}"` : '',
      sort: 'name',
    });
    return {
      items: res.items.map((c) => ({ value: c.id, label: c.name })),
      totalPages: res.totalPages,
    };
  }

  // --- Modal for New / Edit ---
  function openModal(editItem) {
    closeModal();

    modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'width:100%;max-width:500px;overflow:visible;';
    card.addEventListener('click', (e) => e.stopPropagation());

    // Header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'p-4 border-b';
    const h3 = document.createElement('h3');
    h3.textContent = `${editItem ? 'Edit' : 'New'} Opportunity`;
    modalHeader.appendChild(h3);
    card.appendChild(modalHeader);

    // Form
    const form = document.createElement('form');
    form.className = 'p-6';
    form.style.overflow = 'visible';

    // Title
    const titleGroup = document.createElement('div');
    titleGroup.className = 'form-group';
    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Title';
    const titleInput = document.createElement('input');
    titleInput.name = 'title';
    titleInput.required = true;
    if (editItem) titleInput.defaultValue = editItem.title || '';
    titleGroup.appendChild(titleLabel);
    titleGroup.appendChild(titleInput);
    form.appendChild(titleGroup);

    // Number + Status row
    const formRow = document.createElement('div');
    formRow.className = 'form-row';

    const numGroup = document.createElement('div');
    numGroup.className = 'form-group';
    const numLabel = document.createElement('label');
    numLabel.textContent = 'Number';
    const numInput = document.createElement('input');
    numInput.name = 'opportunity';
    if (editItem) numInput.defaultValue = editItem.opportunity || '';
    numGroup.appendChild(numLabel);
    numGroup.appendChild(numInput);
    formRow.appendChild(numGroup);

    const statusGroup = document.createElement('div');
    statusGroup.className = 'form-group';
    const statusLabel = document.createElement('label');
    statusLabel.textContent = 'Status';
    statusGroup.appendChild(statusLabel);

    selectInstance = createSelect({
      name: 'status',
      defaultValue: editItem?.status || 'NEW',
      options: STATUS_OPTIONS,
    });
    statusGroup.appendChild(selectInstance.element);
    formRow.appendChild(statusGroup);
    form.appendChild(formRow);

    // Customer (AsyncSelect)
    const custGroup = document.createElement('div');
    custGroup.className = 'form-group';
    const custLabel = document.createElement('label');
    custLabel.textContent = 'Customer';
    custGroup.appendChild(custLabel);

    asyncSelectInstance = createAsyncSelect({
      name: 'customer',
      defaultValue: editItem?.customer || customerId || '',
      defaultLabel: editItem?.expand?.customer?.name || customerName || '',
      placeholder: '-- Search & Select Customer --',
      loadOptions: loadCustomers,
    });
    custGroup.appendChild(asyncSelectInstance.element);
    form.appendChild(custGroup);

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
      const formData = new FormData(e.currentTarget);
      const data = Object.fromEntries(formData.entries());
      try {
        if (editItem) {
          await pb.collection('opportunities').update(editItem.id, data);
        } else {
          await pb.collection('opportunities').create(data);
        }
        closeModal();
        showToast(editItem ? 'Opportunity updated successfully' : 'Opportunity created successfully', 'success');
        loadData();
      } catch (err) {
        showToast('Failed to save opportunity', 'error');
      }
    });

    card.appendChild(form);
    modalBackdrop.appendChild(card);
    modalBackdrop.addEventListener('click', closeModal);
    document.body.appendChild(modalBackdrop);
  }

  function closeModal() {
    if (selectInstance) { selectInstance.destroy(); selectInstance = null; }
    if (asyncSelectInstance) { asyncSelectInstance.destroy(); asyncSelectInstance = null; }
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
      closeModal();
      dt.destroy();
      if (filterBadgeWrap.parentNode) filterBadgeWrap.parentNode.removeChild(filterBadgeWrap);
    },
  };
}
