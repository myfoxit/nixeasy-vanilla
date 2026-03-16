// Customers View
// Ported from React Customers.tsx (198 lines) - full CRUD with DataTable,
// sorting, search, pagination, opportunity count per page, modal for new/edit,
// delete with confirm modal, navigate to opportunities on row click with filter

import { pb } from '../api.js';
import { navigate } from '../router.js';
import { setRouteState } from '../app.js';
import { createDataTable } from '../components/data-table.js';
import { showConfirmModal } from '../components/modal.js';
import { createRowActions } from '../components/row-actions.js';
import { showToast } from '../components/toast.js';

/**
 * Create the customers list view.
 *
 * @param {HTMLElement} container
 */
export function createCustomersView(container) {
  container.innerHTML = '';

  // --- State ---
  let customers = [];
  let loading = true;
  let search = '';
  let page = 1;
  let totalPages = 1;
  let sortColumn = null;
  let sortDirection = null;

  let modalBackdrop = null;
  let destroyed = false;

  // --- Action button ---
  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Customer';
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
        header: 'Debitor #',
        sortable: true,
        sortKey: 'debitor',
        render: (c) => {
          const span = document.createElement('span');
          span.className = 'font-mono text-xs';
          span.textContent = c.debitor;
          return span;
        },
      },
      {
        header: 'Name',
        sortable: true,
        sortKey: 'name',
        render: (c) => {
          const span = document.createElement('span');
          span.className = 'font-medium';
          span.textContent = c.name;
          return span;
        },
      },
      {
        header: 'Alias',
        sortable: true,
        sortKey: 'alias',
        render: (c) => {
          const span = document.createElement('span');
          span.className = 'text-secondary';
          span.textContent = c.alias || '-';
          return span;
        },
      },
      {
        header: 'Opportunities',
        render: (c) => {
          const span = document.createElement('span');
          span.className = 'badge';
          if ((c.opportunityCount || 0) > 0) span.className += ' badge-success';
          span.textContent = c.opportunityCount || 0;
          return span;
        },
      },
      {
        header: 'Created',
        sortable: true,
        sortKey: 'created',
        render: (c) => {
          const span = document.createElement('span');
          span.className = 'text-secondary text-xs';
          span.textContent = new Date(c.created).toLocaleDateString();
          return span;
        },
      },
      {
        header: 'Actions',
        style: { textAlign: 'right' },
        render: (c) => createRowActions({
          onEdit: () => openModal(c),
          more: [
            { label: 'Delete', onClick: () => handleDelete(c.id, c.name), danger: true },
          ],
        }),
      },
    ];
  }

  // --- DataTable ---
  const dt = createDataTable({
    title: 'Customers',
    subtitle: 'Manage your customer database.',
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
    onRowClick: (c) => {
      // Navigate to opportunities filtered by this customer
      setRouteState({ customerId: c.id, customerName: c.name });
      navigate('/opportunities');
    },
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
      let sort = 'name';
      if (sortColumn && sortDirection) {
        sort = sortDirection === 'desc' ? `-${sortColumn}` : sortColumn;
      }

      const res = await pb.collection('customers').getList(page, 20, {
        filter: search ? `name ~ "${search}" || debitor ~ "${search}" || alias ~ "${search}"` : '',
        sort,
      });

      // Fetch opportunity counts for all customers on this page
      const customerIds = res.items.map((c) => c.id);
      let opportunityCounts = {};

      if (customerIds.length > 0) {
        try {
          const filterParts = customerIds.map((id) => `customer = "${id}"`);
          const oppRes = await pb.collection('opportunities').getFullList({
            filter: filterParts.join(' || '),
            fields: 'id,customer',
          });

          oppRes.forEach((opp) => {
            if (opp.customer) {
              opportunityCounts[opp.customer] = (opportunityCounts[opp.customer] || 0) + 1;
            }
          });
        } catch (err) {
          console.error('Error fetching opportunities:', err);
        }
      }

      // Merge counts with customers
      customers = res.items.map((customer) => ({
        ...customer,
        opportunityCount: opportunityCounts[customer.id] || 0,
      }));
      totalPages = res.totalPages;
    } catch (e) {
      console.error(e);
    }

    loading = false;
    if (!destroyed) {
      dt.update({ data: customers, loading: false, page, totalPages, columns: getColumns(), sortColumn, sortDirection });
    }
  }

  // --- Delete ---
  function handleDelete(id, name) {
    showConfirmModal({
      title: 'Delete Customer',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await pb.collection('customers').delete(id);
          showToast(`"${name}" deleted successfully`, 'success');
          loadData();
        } catch (err) {
          showToast('Failed to delete customer', 'error');
        }
      },
    });
  }

  // --- Modal for New / Edit ---
  function openModal(editItem) {
    closeModal();

    modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';
    modalBackdrop.addEventListener('click', closeModal);

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'width:100%;max-width:500px;';
    card.addEventListener('click', (e) => e.stopPropagation());

    // Header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'p-4 border-b';
    const h3 = document.createElement('h3');
    h3.textContent = `${editItem ? 'Edit' : 'New'} Customer`;
    headerDiv.appendChild(h3);
    card.appendChild(headerDiv);

    // Form
    const form = document.createElement('form');
    form.className = 'p-6';

    // Customer Name
    const nameGroup = document.createElement('div');
    nameGroup.className = 'form-group';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Customer Name';
    const nameInput = document.createElement('input');
    nameInput.name = 'name';
    nameInput.required = true;
    if (editItem) nameInput.defaultValue = editItem.name || '';
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    form.appendChild(nameGroup);

    // Alias
    const aliasGroup = document.createElement('div');
    aliasGroup.className = 'form-group';
    const aliasLabel = document.createElement('label');
    aliasLabel.textContent = 'Alias';
    const aliasInput = document.createElement('input');
    aliasInput.name = 'alias';
    if (editItem) aliasInput.defaultValue = editItem.alias || '';
    aliasGroup.appendChild(aliasLabel);
    aliasGroup.appendChild(aliasInput);
    form.appendChild(aliasGroup);

    // Debitor Number
    const debGroup = document.createElement('div');
    debGroup.className = 'form-group';
    const debLabel = document.createElement('label');
    debLabel.textContent = 'Debitor Number';
    const debInput = document.createElement('input');
    debInput.name = 'debitor';
    if (editItem) debInput.defaultValue = editItem.debitor || '';
    debGroup.appendChild(debLabel);
    debGroup.appendChild(debInput);
    form.appendChild(debGroup);

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
          await pb.collection('customers').update(editItem.id, data);
        } else {
          await pb.collection('customers').create(data);
        }
        closeModal();
        showToast(editItem ? 'Customer updated successfully' : 'Customer created successfully', 'success');
        loadData();
      } catch (err) {
        showToast('Failed to save customer', 'error');
      }
    });

    card.appendChild(form);
    modalBackdrop.appendChild(card);
    document.body.appendChild(modalBackdrop);
  }

  function closeModal() {
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
    },
  };
}
