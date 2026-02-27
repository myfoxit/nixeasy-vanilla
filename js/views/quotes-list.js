// Quotes List View
// Ported from React QuotesListView.tsx (505 lines) - full CRUD with DataTable,
// search, sorting, pagination, new quote modal with AsyncSelect for opportunity,
// "or" divider, quick-create opportunity option, delete with confirm modal

import { pb, isSuperUser } from '../api.js';
import { navigate } from '../router.js';
import { createDataTable } from '../components/data-table.js';
import { createAsyncSelect } from '../components/async-select.js';
import { showConfirmModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { currency } from '../utils/format.js';

/**
 * Create the all-quotes list view.
 *
 * @param {HTMLElement} container
 */
export function createQuotesListView(container) {
  container.innerHTML = '';
  const currentUser = pb.authStore.model;

  // --- State ---
  let quotes = [];
  let loading = true;
  let page = 1;
  let totalPages = 1;
  let search = '';
  let sortColumn = null;
  let sortDirection = null;

  // Modal state
  let selectedOpportunity = '';
  let showQuickCreate = false;
  let quickCreateTitle = '';
  let quickCreateCustomer = '';
  let quickCreateOppNumber = '';
  let creating = false;

  // Sub-component references
  let modalBackdrop = null;
  let oppAsyncSelect = null;
  let custAsyncSelect = null;
  let destroyed = false;

  // --- Action button ---
  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Quote';
  newBtn.addEventListener('click', () => openModal());

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
        sortable: true,
        sortKey: 'name',
        style: { width: 180 },
        render: (q) => {
          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex;align-items:center;gap:4px;';

          const nameSpan = document.createElement('span');
          nameSpan.style.cssText = 'font-weight:500;cursor:text;padding:2px 4px;border-radius:4px;border:1px solid transparent;min-width:60px;';
          nameSpan.textContent = q.name || 'Untitled';
          nameSpan.title = 'Click to rename';
          nameSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            const input = document.createElement('input');
            input.type = 'text';
            input.value = q.name || '';
            input.placeholder = 'Quote name…';
            input.style.cssText = 'font-size:inherit;font-weight:500;padding:2px 4px;border:1px solid var(--primary);border-radius:4px;outline:none;width:140px;background:var(--surface);';
            nameSpan.replaceWith(input);
            input.focus();
            input.select();
            const finish = async () => {
              const newName = input.value.trim();
              if (newName && newName !== q.name) {
                try {
                  await pb.collection('quotes').update(q.id, { name: newName });
                  q.name = newName;
                } catch (err) {
                  showToast('Could not rename — add "name" field to quotes collection', 'warning');
                }
              }
              input.replaceWith(nameSpan);
              nameSpan.textContent = q.name || 'Untitled';
            };
            input.addEventListener('blur', finish);
            input.addEventListener('keydown', (ev) => {
              if (ev.key === 'Enter') input.blur();
              if (ev.key === 'Escape') { input.value = q.name || ''; input.blur(); }
            });
          });

          wrap.appendChild(nameSpan);
          return wrap;
        },
      },
      {
        header: 'Opportunity',
        sortable: true,
        sortKey: 'opportunity.title',
        render: (q) => {
          const wrap = document.createElement('div');
          const titleDiv = document.createElement('div');
          titleDiv.style.fontWeight = '500';
          titleDiv.textContent = q.expand?.opportunity?.title || `Opp #${q.expand?.opportunity?.opportunity || 'N/A'}`;
          const custDiv = document.createElement('div');
          custDiv.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);';
          custDiv.textContent = q.expand?.opportunity?.expand?.customer?.name || 'No customer';
          wrap.appendChild(titleDiv);
          wrap.appendChild(custDiv);
          return wrap;
        },
      },
      {
        header: 'Created By',
        sortable: true,
        sortKey: 'created_by.email',
        style: { width: 180 },
        render: (q) => q.expand?.created_by?.email || q.expand?.created_by?.name || 'Unknown',
      },
      {
        header: 'Total (VK)',
        style: { width: 140, textAlign: 'right' },
        cellStyle: { textAlign: 'right', fontWeight: '500' },
        render: (q) => currency(q.quote_data?.summary?.vk || 0),
      },
      {
        header: 'CAPEX',
        style: { width: 120, textAlign: 'right' },
        cellStyle: { textAlign: 'right' },
        render: (q) => currency(q.quote_data?.summary?.capex || 0),
      },
      {
        header: 'OPEX/mo',
        style: { width: 120, textAlign: 'right' },
        cellStyle: { textAlign: 'right' },
        render: (q) => currency(q.quote_data?.summary?.opex_monthly || 0),
      },
      {
        header: 'Updated',
        sortable: true,
        sortKey: 'updated',
        style: { width: 100 },
        render: (q) => new Date(q.updated).toLocaleDateString('de-DE'),
      },
      {
        header: 'Actions',
        style: { width: 170, textAlign: 'right' },
        render: (q) => {
          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex;justify-content:flex-end;gap:0.5rem;';

          const editBtn = document.createElement('button');
          editBtn.className = 'btn btn-secondary btn-sm';
          editBtn.textContent = 'Edit';
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (q.expand?.opportunity?.id) {
              navigate(`/opportunities/${q.expand.opportunity.id}/quotes/${q.id}`);
            }
          });

          const dupBtn = document.createElement('button');
          dupBtn.className = 'btn btn-secondary btn-sm';
          dupBtn.textContent = 'Dup';
          dupBtn.title = 'Duplicate quote';
          dupBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleDuplicate(q);
          });

          const delBtn = document.createElement('button');
          delBtn.className = 'btn btn-ghost btn-sm';
          delBtn.style.color = 'var(--danger)';
          delBtn.textContent = 'Del';
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleDelete(q);
          });

          wrap.appendChild(editBtn);
          wrap.appendChild(dupBtn);
          wrap.appendChild(delBtn);
          return wrap;
        },
      },
    ];
  }

  // --- DataTable ---
  const dt = createDataTable({
    title: 'All Quotes',
    subtitle: 'View and manage quotes across all opportunities',
    action: newBtn,
    columns: getColumns(),
    data: [],
    loading: true,
    page,
    totalPages,
    searchPlaceholder: 'Search by opportunity, customer, or creator...',
    onSearch: (val) => {
      search = val;
      page = 1;
      fetchQuotes();
    },
    onPageChange: (p) => {
      page = p;
      fetchQuotes();
    },
    onRowClick: (q) => {
      if (q.expand?.opportunity?.id) {
        navigate(`/opportunities/${q.expand.opportunity.id}/quotes/${q.id}`);
      }
    },
    sortColumn,
    sortDirection,
    onSort: (key, dir) => {
      sortColumn = dir ? key : null;
      sortDirection = dir;
      page = 1;
      fetchQuotes();
    },
  });

  container.appendChild(dt.element);

  // --- Data loading ---
  async function fetchQuotes() {
    if (destroyed) return;
    loading = true;
    dt.update({ loading: true, columns: getColumns() });

    try {
      let filter = '';
      if (search) {
        filter = `opportunity.title ~ "${search}" || opportunity.customer.name ~ "${search}" || created_by.email ~ "${search}"`;
      }
      let sort = '-updated';
      if (sortColumn && sortDirection) {
        sort = sortDirection === 'desc' ? `-${sortColumn}` : sortColumn;
      }

      const result = await pb.collection('quotes').getList(page, 20, {
        filter,
        sort,
        expand: 'opportunity,opportunity.customer,created_by',
        requestKey: `quotes-list-${page}-${search}-${sortColumn}-${sortDirection}`,
      });

      quotes = result.items;
      totalPages = result.totalPages;
    } catch (e) {
      if (e?.isAbort) return;
      console.error('Failed to fetch quotes:', e);
    }

    loading = false;
    if (!destroyed) {
      dt.update({ data: quotes, loading: false, page, totalPages, columns: getColumns(), sortColumn, sortDirection });
    }
  }

  // --- Delete ---
  function handleDelete(quote) {
    const name = quote.expand?.opportunity?.title || `Quote ${quote.id.slice(0, 8)}`;
    showConfirmModal({
      title: 'Delete Quote',
      message: `Are you sure you want to delete the quote for "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await pb.collection('quotes').delete(quote.id);
          showToast(`"${name}" deleted successfully`, 'success');
          fetchQuotes();
        } catch (err) {
          showToast('Failed to delete quote: ' + (err.message || 'Unknown error'), 'error');
        }
      },
    });
  }

  // --- Duplicate ---
  async function handleDuplicate(quote) {
    try {
      const oppId = quote.opportunity || quote.expand?.opportunity?.id;
      if (!oppId) {
        showToast('Cannot duplicate — no opportunity linked', 'error');
        return;
      }
      const body = {
        opportunity: oppId,
        quote_data: quote.quote_data,
      };
      if (!isSuperUser() && currentUser?.id) body.created_by = currentUser.id;

      // Try with name first, fall back without if field doesn't exist
      const origName = quote.name || 'Untitled';
      body.name = `${origName} (copy)`;

      let dup;
      try {
        dup = await pb.collection('quotes').create(body);
      } catch (err) {
        // If name field doesn't exist, retry without it
        if (err?.response?.data?.name) {
          delete body.name;
          dup = await pb.collection('quotes').create(body);
        } else {
          throw err;
        }
      }

      showToast(`Quote duplicated`, 'success');
      navigate(`/opportunities/${oppId}/quotes/${dup.id}`);
    } catch (err) {
      showToast('Failed to duplicate: ' + (err.message || 'Unknown error'), 'error');
    }
  }

  // --- Load functions for AsyncSelects ---
  async function loadOpportunities(searchTerm, pg) {
    const res = await pb.collection('opportunities').getList(pg, 20, {
      filter: searchTerm ? `title ~ "${searchTerm}" || opportunity ~ "${searchTerm}"` : '',
      sort: '-created',
      expand: 'customer',
      requestKey: null,
    });
    return {
      items: res.items.map((o) => ({
        value: o.id,
        label: `${o.opportunity ? `#${o.opportunity} - ` : ''}${o.title}${o.expand?.customer?.name ? ` (${o.expand.customer.name})` : ''}`,
      })),
      totalPages: res.totalPages,
    };
  }

  async function loadCustomers(searchTerm, pg) {
    const res = await pb.collection('customers').getList(pg, 20, {
      filter: searchTerm ? `name ~ "${searchTerm}" || debitor ~ "${searchTerm}"` : '',
      sort: 'name',
      requestKey: null,
    });
    return {
      items: res.items.map((c) => ({ value: c.id, label: c.name })),
      totalPages: res.totalPages,
    };
  }

  // --- Create Quote ---
  async function handleCreateQuote() {
    if (!selectedOpportunity || creating) return;
    creating = true;
    updateModalButtons();

    try {
      const quote = await pb.collection('quotes').create({
        opportunity: selectedOpportunity,
        name: 'Quote v1',
        quote_data: {
          lineItems: [],
          items: [],
          summary: { ek: 0, vk: 0, capex: 0, opex_monthly: 0, margin: 0 },
        },
      });
      closeModal();
      navigate(`/opportunities/${selectedOpportunity}/quotes/${quote.id}`);
    } catch (e) {
      if (e?.isAbort) return;
      console.error('Failed to create quote:', e);
      let errorMsg = 'Unknown error';
      if (e?.response?.data) {
        const data = e.response.data;
        errorMsg = data.message || '';
        if (data.data) {
          const fieldErrors = Object.entries(data.data)
            .map(([field, err]) => `${field}: ${err?.message || err}`)
            .join(', ');
          if (fieldErrors) errorMsg += ' - ' + fieldErrors;
        }
      } else if (e?.message) {
        errorMsg = e.message;
      }
      showToast('Failed to create quote: ' + errorMsg, 'error');
    } finally {
      creating = false;
      updateModalButtons();
    }
  }

  // --- Quick Create Opportunity ---
  async function handleQuickCreateOpportunity() {
    if (!quickCreateTitle.trim() || !quickCreateCustomer || !quickCreateOppNumber || creating) return;
    creating = true;
    updateModalButtons();

    try {
      const opp = await pb.collection('opportunities').create({
        title: quickCreateTitle,
        customer: quickCreateCustomer,
        status: 'IN PROGRESS',
        capex: 0,
        opex_monthly: 0,
        opportunity: quickCreateOppNumber ? parseInt(quickCreateOppNumber, 10) : 0,
      });

      const quote = await pb.collection('quotes').create({
        opportunity: opp.id,
        name: 'Quote v1',
        quote_data: {
          lineItems: [],
          items: [],
          summary: { ek: 0, vk: 0, capex: 0, opex_monthly: 0, margin: 0 },
        },
      });

      closeModal();
      showToast('Opportunity and quote created successfully', 'success');
      navigate(`/opportunities/${opp.id}/quotes/${quote.id}`);
    } catch (e) {
      if (e?.isAbort) return;
      console.error('Failed to create:', e);
      let errorMsg = 'Unknown error';
      if (e?.response?.data) {
        const data = e.response.data;
        errorMsg = data.message || '';
        if (data.data) {
          const fieldErrors = Object.entries(data.data)
            .map(([field, err]) => `${field}: ${err?.message || err}`)
            .join(', ');
          if (fieldErrors) errorMsg += ' - ' + fieldErrors;
        }
      } else if (e?.message) {
        errorMsg = e.message;
      }
      showToast('Failed to create: ' + errorMsg, 'error');
    } finally {
      creating = false;
      updateModalButtons();
    }
  }

  // Reference to the primary action button inside modal for updating text/disabled
  let modalPrimaryBtn = null;
  let modalBackBtn = null;

  function updateModalButtons() {
    if (!modalPrimaryBtn) return;
    if (showQuickCreate) {
      modalPrimaryBtn.disabled = !quickCreateTitle.trim() || !quickCreateCustomer || !quickCreateOppNumber || creating;
      modalPrimaryBtn.textContent = creating ? 'Creating...' : 'Create & Start Quote';
    } else {
      modalPrimaryBtn.disabled = !selectedOpportunity || creating;
      modalPrimaryBtn.textContent = creating ? 'Creating...' : 'Create Quote';
    }
  }

  // --- Modal ---
  function openModal() {
    closeModal();

    // Reset state
    selectedOpportunity = '';
    showQuickCreate = false;
    quickCreateTitle = '';
    quickCreateCustomer = '';
    quickCreateOppNumber = '';
    creating = false;

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
    h3.textContent = 'New Quote';
    headerDiv.appendChild(h3);
    card.appendChild(headerDiv);

    // Body
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'p-6';
    card.appendChild(bodyDiv);

    modalBackdrop.appendChild(card);
    document.body.appendChild(modalBackdrop);

    // Render the initial (select opportunity) view
    renderModalBody(bodyDiv, h3);
  }

  function renderModalBody(bodyDiv, h3El) {
    bodyDiv.innerHTML = '';
    if (oppAsyncSelect) { oppAsyncSelect.destroy(); oppAsyncSelect = null; }
    if (custAsyncSelect) { custAsyncSelect.destroy(); custAsyncSelect = null; }

    if (!showQuickCreate) {
      // --- Standard: Select Opportunity ---
      h3El.textContent = 'New Quote';

      // Opportunity async select
      const oppGroup = document.createElement('div');
      oppGroup.className = 'form-group';
      oppGroup.style.cssText = 'position:relative;z-index:10;';
      const oppLabel = document.createElement('label');
      oppLabel.textContent = 'Select Opportunity';
      oppGroup.appendChild(oppLabel);

      oppAsyncSelect = createAsyncSelect({
        name: 'opportunity',
        defaultValue: selectedOpportunity,
        placeholder: '-- Search & Select Opportunity --',
        loadOptions: loadOpportunities,
        onChange: (val) => {
          selectedOpportunity = val;
          updateModalButtons();
        },
      });
      oppGroup.appendChild(oppAsyncSelect.element);
      bodyDiv.appendChild(oppGroup);

      // "or" divider
      const divider = document.createElement('div');
      divider.style.cssText = 'margin:1.5rem 0;text-align:center;color:var(--text-secondary);font-size:0.875rem;';
      divider.innerHTML = '&mdash; or &mdash;';
      bodyDiv.appendChild(divider);

      // Quick create button
      const quickBtn = document.createElement('button');
      quickBtn.type = 'button';
      quickBtn.className = 'btn btn-secondary';
      quickBtn.style.width = '100%';
      quickBtn.textContent = '+ Quick Create Opportunity';
      quickBtn.addEventListener('click', () => {
        showQuickCreate = true;
        renderModalBody(bodyDiv, h3El);
      });
      bodyDiv.appendChild(quickBtn);

      // Footer buttons
      const footerDiv = document.createElement('div');
      footerDiv.style.cssText = 'display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border);';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-secondary';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', closeModal);

      modalPrimaryBtn = document.createElement('button');
      modalPrimaryBtn.type = 'button';
      modalPrimaryBtn.className = 'btn btn-primary';
      modalPrimaryBtn.disabled = true;
      modalPrimaryBtn.textContent = 'Create Quote';
      modalPrimaryBtn.addEventListener('click', handleCreateQuote);

      footerDiv.appendChild(cancelBtn);
      footerDiv.appendChild(modalPrimaryBtn);
      bodyDiv.appendChild(footerDiv);
    } else {
      // --- Quick Create Opportunity ---
      h3El.textContent = 'Quick Create Opportunity';

      // Title
      const titleGroup = document.createElement('div');
      titleGroup.className = 'form-group';
      const titleLabel = document.createElement('label');
      titleLabel.textContent = 'Opportunity Title';
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.placeholder = 'Enter opportunity title...';
      titleInput.value = quickCreateTitle;
      titleInput.autofocus = true;
      titleInput.addEventListener('input', (e) => {
        quickCreateTitle = e.target.value;
        updateModalButtons();
      });
      titleGroup.appendChild(titleLabel);
      titleGroup.appendChild(titleInput);
      bodyDiv.appendChild(titleGroup);

      // Opp number
      const numGroup = document.createElement('div');
      numGroup.className = 'form-group';
      const numLabel = document.createElement('label');
      numLabel.innerHTML = 'Opportunity Number <span style="color:var(--danger)">*</span>';
      const numInput = document.createElement('input');
      numInput.type = 'number';
      numInput.placeholder = 'Enter opportunity number...';
      numInput.value = quickCreateOppNumber;
      numInput.required = true;
      numInput.addEventListener('input', (e) => {
        quickCreateOppNumber = e.target.value;
        updateModalButtons();
      });
      numGroup.appendChild(numLabel);
      numGroup.appendChild(numInput);
      bodyDiv.appendChild(numGroup);

      // Customer
      const custGroup = document.createElement('div');
      custGroup.className = 'form-group';
      custGroup.style.cssText = 'position:relative;z-index:10;';
      const custLabel = document.createElement('label');
      custLabel.textContent = 'Customer';
      custGroup.appendChild(custLabel);

      custAsyncSelect = createAsyncSelect({
        name: 'customer',
        defaultValue: quickCreateCustomer,
        placeholder: '-- Search & Select Customer --',
        loadOptions: loadCustomers,
        onChange: (val) => {
          quickCreateCustomer = val;
          updateModalButtons();
        },
      });
      custGroup.appendChild(custAsyncSelect.element);
      bodyDiv.appendChild(custGroup);

      // Info text
      const info = document.createElement('p');
      info.style.cssText = 'margin-top:1rem;font-size:0.875rem;color:var(--text-secondary);';
      info.textContent = 'This will create a new opportunity with status "IN PROGRESS" and immediately create a quote for it.';
      bodyDiv.appendChild(info);

      // Footer buttons
      const footerDiv = document.createElement('div');
      footerDiv.style.cssText = 'display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border);';

      modalBackBtn = document.createElement('button');
      modalBackBtn.type = 'button';
      modalBackBtn.className = 'btn btn-secondary';
      modalBackBtn.textContent = 'Back';
      modalBackBtn.addEventListener('click', () => {
        showQuickCreate = false;
        quickCreateTitle = '';
        quickCreateCustomer = '';
        quickCreateOppNumber = '';
        renderModalBody(bodyDiv, h3El);
      });

      modalPrimaryBtn = document.createElement('button');
      modalPrimaryBtn.type = 'button';
      modalPrimaryBtn.className = 'btn btn-primary';
      modalPrimaryBtn.disabled = true;
      modalPrimaryBtn.textContent = 'Create & Start Quote';
      modalPrimaryBtn.addEventListener('click', handleQuickCreateOpportunity);

      footerDiv.appendChild(modalBackBtn);
      footerDiv.appendChild(modalPrimaryBtn);
      bodyDiv.appendChild(footerDiv);

      // Focus the title input
      setTimeout(() => titleInput.focus(), 50);
    }

    updateModalButtons();
  }

  function closeModal() {
    if (oppAsyncSelect) { oppAsyncSelect.destroy(); oppAsyncSelect = null; }
    if (custAsyncSelect) { custAsyncSelect.destroy(); custAsyncSelect = null; }
    if (modalBackdrop && modalBackdrop.parentNode) {
      modalBackdrop.parentNode.removeChild(modalBackdrop);
    }
    modalBackdrop = null;
    modalPrimaryBtn = null;
    modalBackBtn = null;
  }

  // Initial load
  fetchQuotes();

  return {
    destroy() {
      destroyed = true;
      closeModal();
      dt.destroy();
    },
  };
}
