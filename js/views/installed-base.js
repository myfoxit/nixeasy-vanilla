// Installed Base View
// Ported from React InstalledBaseView.tsx (982 lines)
// Two tabs: Installed Base and Sites
// Includes CRUD modals for both, plus a 3-step wizard for importing from a quote

import { pb } from '../api.js';
import { navigate } from '../router.js';
import { createDataTable } from '../components/data-table.js';
import { createSelect } from '../components/select.js';
import { createAsyncSelect } from '../components/async-select.js';
import { showConfirmModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { formatDate } from '../utils/format.js';
import { createRowActions } from '../components/row-actions.js';

const PAGE_SIZE = 15;

/**
 * Create the Installed Base view with two tabs and all CRUD operations.
 *
 * @param {HTMLElement} container - The container to render into.
 * @returns {{ destroy: Function }}
 */
export function createInstalledBaseView(container) {
  container.innerHTML = '';

  // ============================
  // STATE
  // ============================

  let activeTab = 'installed_base'; // 'installed_base' | 'sites'

  // Sites state
  let sites = [];
  let sitesLoading = false;
  let sitesPage = 1;
  let sitesTotalPages = 1;
  let sitesSearch = '';
  let sitesCustomerFilter = '';
  let sitesSortColumn = null;
  let sitesSortDirection = null;

  // Installed Base state
  let installedBase = [];
  let ibLoading = false;
  let ibPage = 1;
  let ibTotalPages = 1;
  let ibSearch = '';
  let ibSortColumn = null;
  let ibSortDirection = null;

  // Cache for lookups
  let slas = [];
  let allSites = [];
  let customers = [];

  // Track active async selects for cleanup
  let activeAsyncSelects = [];

  // ============================
  // ROOT ELEMENT
  // ============================

  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;';

  // ============================
  // TAB BAR
  // ============================

  const tabContainer = document.createElement('div');
  tabContainer.className = 'tab-container';
  tabContainer.style.cssText = 'border-bottom:1px solid var(--border);background:var(--surface);padding:0 2rem;';

  const tabFlex = document.createElement('div');
  tabFlex.className = 'flex gap-4';

  const ibTabBtn = document.createElement('button');
  ibTabBtn.className = 'tab-btn active';
  ibTabBtn.textContent = 'Installed Base';
  ibTabBtn.addEventListener('click', () => switchTab('installed_base'));

  const sitesTabBtn = document.createElement('button');
  sitesTabBtn.className = 'tab-btn';
  sitesTabBtn.textContent = 'Sites';
  sitesTabBtn.addEventListener('click', () => switchTab('sites'));

  tabFlex.appendChild(ibTabBtn);
  tabFlex.appendChild(sitesTabBtn);
  tabContainer.appendChild(tabFlex);
  root.appendChild(tabContainer);

  // ============================
  // CONTENT AREA
  // ============================

  const contentArea = document.createElement('div');
  contentArea.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:auto;';
  root.appendChild(contentArea);

  container.appendChild(root);

  // ============================
  // TAB SWITCHING
  // ============================

  function switchTab(tab) {
    activeTab = tab;
    ibTabBtn.className = `tab-btn ${tab === 'installed_base' ? 'active' : ''}`;
    sitesTabBtn.className = `tab-btn ${tab === 'sites' ? 'active' : ''}`;

    if (tab === 'sites') {
      renderSitesTab();
      loadSites();
    } else {
      renderInstalledBaseTab();
      loadInstalledBase();
    }
  }

  // ============================
  // ASYNC LOADERS FOR SELECTS
  // ============================

  async function loadCustomerOptions(search, page) {
    const filter = search ? `name ~ "${search}"` : '';
    const result = await pb.collection('customers').getList(page, 20, { filter, sort: 'name' });
    return {
      items: result.items.map(c => ({ value: c.id, label: c.name })),
      totalPages: result.totalPages,
    };
  }

  async function loadLicenseOptions(search, page) {
    const filter = search ? `name ~ "${search}" || sku ~ "${search}"` : '';
    const result = await pb.collection('licenses').getList(page, 20, { filter, sort: 'name' });
    return {
      items: result.items.map(l => ({ value: l.id, label: `${l.sku} - ${l.name}` })),
      totalPages: result.totalPages,
    };
  }

  async function loadQuoteOptions(search, page) {
    const filter = search
      ? `opportunity.title ~ "${search}" || opportunity.customer.name ~ "${search}"`
      : '';
    const result = await pb.collection('quotes').getList(page, 20, {
      filter,
      sort: '-created',
      expand: 'opportunity.customer',
    });
    return {
      items: result.items.map(q => {
        const opp = q.expand?.opportunity;
        const customer = opp?.expand?.customer?.name || 'Unknown';
        return {
          value: q.id,
          label: `${opp?.title || 'Untitled'} (${customer}) - ${new Date(q.created).toLocaleDateString()}`,
        };
      }),
      totalPages: result.totalPages,
    };
  }

  // ============================
  // LOAD LOOKUP DATA
  // ============================

  async function loadLookups() {
    try {
      const [slasResult, sitesResult, customersResult] = await Promise.all([
        pb.collection('service_level_agreements').getFullList({ sort: 'name' }),
        pb.collection('installed_site').getFullList({ sort: 'name', expand: 'customer' }),
        pb.collection('customers').getFullList({ sort: 'name' }),
      ]);
      slas = slasResult;
      allSites = sitesResult;
      customers = customersResult;
    } catch (e) {
      console.error('Error loading lookups:', e);
    }
  }

  // ============================
  // SITES TAB
  // ============================

  let sitesDataTable = null;
  let sitesCustomerSelect = null;

  async function loadSites() {
    sitesLoading = true;
    if (sitesDataTable) sitesDataTable.update({ loading: true });

    try {
      let sort = '-created';
      if (sitesSortColumn && sitesSortDirection) {
        sort = sitesSortDirection === 'desc' ? `-${sitesSortColumn}` : sitesSortColumn;
      }

      const filters = [];
      if (sitesSearch) {
        filters.push(`(name ~ "${sitesSearch}" || customer.name ~ "${sitesSearch}")`);
      }
      if (sitesCustomerFilter) {
        filters.push(`customer = "${sitesCustomerFilter}"`);
      }
      const filter = filters.join(' && ');

      const result = await pb.collection('installed_site').getList(sitesPage, PAGE_SIZE, {
        filter,
        sort,
        expand: 'customer',
      });
      sites = result.items;
      sitesTotalPages = result.totalPages;
    } catch (e) {
      console.error('Error loading sites:', e);
    }

    sitesLoading = false;

    if (sitesDataTable) {
      sitesDataTable.update({
        data: sites,
        loading: false,
        page: sitesPage,
        totalPages: sitesTotalPages,
        columns: getSiteColumns(),
        sortColumn: sitesSortColumn,
        sortDirection: sitesSortDirection,
      });
    }
  }

  function getSiteColumns() {
    return [
      {
        header: '#',
        style: { width: '50px' },
        render: (_, index) => {
          const span = document.createElement('span');
          span.className = 'text-secondary text-xs';
          span.textContent = String((sitesPage - 1) * PAGE_SIZE + (index ?? 0) + 1);
          return span;
        },
      },
      {
        header: 'Name',
        sortable: true,
        sortKey: 'name',
        render: (s) => {
          const span = document.createElement('span');
          span.style.fontWeight = '500';
          span.textContent = s.name;
          return span;
        },
      },
      {
        header: 'Customer',
        sortable: true,
        sortKey: 'customer.name',
        render: (s) => s.expand?.customer?.name || '\u2014',
      },
      {
        header: 'Created',
        sortable: true,
        sortKey: 'created',
        render: (s) => {
          const span = document.createElement('span');
          span.className = 'text-secondary text-xs';
          span.textContent = new Date(s.created).toLocaleDateString();
          return span;
        },
      },
      {
        header: 'Actions',
        align: 'right',
        style: { textAlign: 'right' },
        render: (s) => createRowActions({
          onEdit: () => openSiteModal(s),
          more: [
            { label: 'Delete', onClick: () => handleDeleteSite(s), danger: true },
          ],
        }),
      },
    ];
  }

  function renderSitesTab() {
    contentArea.innerHTML = '';

    // Destroy old data table if any
    if (sitesDataTable) {
      sitesDataTable.destroy();
      sitesDataTable = null;
    }

    // Action button
    const addSiteBtn = document.createElement('button');
    addSiteBtn.className = 'btn btn-primary';
    addSiteBtn.textContent = '+ Add Site';
    addSiteBtn.addEventListener('click', () => openSiteModal(null));

    sitesDataTable = createDataTable({
      title: 'Sites',
      subtitle: 'Manage installation sites',
      action: addSiteBtn,
      columns: getSiteColumns(),
      data: sites,
      loading: sitesLoading,
      page: sitesPage,
      totalPages: sitesTotalPages,
      onSearch: (val) => {
        sitesSearch = val;
        sitesPage = 1;
        loadSites();
      },
      onPageChange: (newPage) => {
        sitesPage = newPage;
        loadSites();
      },
      searchPlaceholder: 'Search sites or customers...',
      sortColumn: sitesSortColumn,
      sortDirection: sitesSortDirection,
      onSort: (key, direction) => {
        sitesSortColumn = direction ? key : null;
        sitesSortDirection = direction;
        sitesPage = 1;
        loadSites();
      },
    });

    contentArea.appendChild(sitesDataTable.element);
  }

  // --- Site Modal ---
  function openSiteModal(editingSite) {
    closeAllModals();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.addEventListener('click', () => closeModal(backdrop));

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'width:450px;max-width:90vw;overflow:visible;';
    card.addEventListener('click', (e) => e.stopPropagation());

    // Header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'p-4 border-b';
    modalHeader.style.borderColor = 'var(--border)';
    const headerTitle = document.createElement('h3');
    headerTitle.style.cssText = 'font-size:1.125rem;font-weight:600;';
    headerTitle.textContent = editingSite ? 'Edit Site' : 'Add Site';
    modalHeader.appendChild(headerTitle);
    card.appendChild(modalHeader);

    // Form
    const form = document.createElement('form');

    const formBody = document.createElement('div');
    formBody.className = 'p-4';
    formBody.style.overflow = 'visible';

    // Name field
    const nameGroup = document.createElement('div');
    nameGroup.className = 'form-group';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Site Name *';
    const nameInput = document.createElement('input');
    nameInput.name = 'name';
    nameInput.required = true;
    nameInput.value = editingSite?.name || '';
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    formBody.appendChild(nameGroup);

    // Customer (AsyncSelect)
    const custGroup = document.createElement('div');
    custGroup.className = 'form-group';
    const custLabel = document.createElement('label');
    custLabel.textContent = 'Customer';
    const customerSelect = createAsyncSelect({
      name: 'customer',
      loadOptions: loadCustomerOptions,
      defaultValue: editingSite?.customer || '',
      defaultLabel: editingSite?.expand?.customer?.name || '',
      placeholder: 'Select customer (optional)...',
    });
    activeAsyncSelects.push(customerSelect);
    custGroup.appendChild(custLabel);
    custGroup.appendChild(customerSelect.element);
    formBody.appendChild(custGroup);

    form.appendChild(formBody);

    // Footer
    const formFooter = document.createElement('div');
    formFooter.className = 'p-4 border-t flex justify-end gap-2';
    formFooter.style.borderColor = 'var(--border)';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => closeModal(backdrop));

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Save';

    formFooter.appendChild(cancelBtn);
    formFooter.appendChild(saveBtn);
    form.appendChild(formFooter);

    // Submit handler
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        name: nameInput.value,
        customer: customerSelect.getValue() || null,
      };

      try {
        if (editingSite) {
          await pb.collection('installed_site').update(editingSite.id, data);
          showToast('Site updated successfully', 'success');
        } else {
          await pb.collection('installed_site').create(data);
          showToast('Site created successfully', 'success');
        }
        closeModal(backdrop);
        loadSites();
        // Refresh allSites cache
        pb.collection('installed_site').getFullList({ sort: 'name', expand: 'customer' }).then(r => { allSites = r; });
      } catch (err) {
        console.error('Error saving site:', err);
        showToast('Failed to save site', 'error');
      }
    });

    card.appendChild(form);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
  }

  function handleDeleteSite(site) {
    showConfirmModal({
      title: 'Delete Site',
      message: `Are you sure you want to delete "${site.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await pb.collection('installed_site').delete(site.id);
          showToast(`"${site.name}" deleted successfully`, 'success');
          loadSites();
          pb.collection('installed_site').getFullList({ sort: 'name', expand: 'customer' }).then(r => { allSites = r; });
        } catch (err) {
          console.error('Error deleting site:', err);
          showToast('Failed to delete site', 'error');
        }
      },
    });
  }

  // ============================
  // INSTALLED BASE TAB
  // ============================

  let ibDataTable = null;

  async function loadInstalledBase() {
    ibLoading = true;
    if (ibDataTable) ibDataTable.update({ loading: true });

    try {
      let sort = '-created';
      if (ibSortColumn && ibSortDirection) {
        sort = ibSortDirection === 'desc' ? `-${ibSortColumn}` : ibSortColumn;
      }

      const filter = ibSearch
        ? `customer.name ~ "${ibSearch}" || license.name ~ "${ibSearch}" || license.sku ~ "${ibSearch}"`
        : '';

      const result = await pb.collection('installed_base').getList(ibPage, PAGE_SIZE, {
        filter,
        sort,
        expand: 'customer,license,support,installed_site',
      });
      installedBase = result.items;
      ibTotalPages = result.totalPages;
    } catch (e) {
      console.error('Error loading installed base:', e);
    }

    ibLoading = false;

    if (ibDataTable) {
      ibDataTable.update({
        data: installedBase,
        loading: false,
        page: ibPage,
        totalPages: ibTotalPages,
        columns: getIbColumns(),
        sortColumn: ibSortColumn,
        sortDirection: ibSortDirection,
      });
    }
  }

  /**
   * Get status badge info based on support_start + contract_term.
   * @param {Object} ib
   * @returns {{ text: string, className: string }}
   */
  function getStatusInfo(ib) {
    if (!ib.support_start || !ib.contract_term) {
      return { text: '-', className: '' };
    }
    const start = new Date(ib.support_start);
    const endDate = new Date(start);
    endDate.setMonth(endDate.getMonth() + ib.contract_term);
    const now = new Date();

    if (now > endDate) {
      return { text: 'Expired', className: 'badge-danger' };
    }

    // Expiring soon: within 90 days
    const daysUntilExpiry = (endDate - now) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry <= 90) {
      return { text: 'Expiring Soon', className: 'badge-warning' };
    }

    return { text: 'Active', className: 'badge-success' };
  }

  function getIbColumns() {
    return [
      {
        header: '#',
        style: { width: '40px' },
        render: (_, index) => {
          const span = document.createElement('span');
          span.className = 'text-secondary text-xs';
          span.textContent = String((ibPage - 1) * PAGE_SIZE + (index ?? 0) + 1);
          return span;
        },
      },
      {
        header: 'License',
        sortable: true,
        sortKey: 'license.name',
        render: (ib) => {
          if (ib.expand?.license) {
            return `${ib.expand.license.sku} - ${ib.expand.license.name}`;
          }
          return '-';
        },
      },
      {
        header: 'Customer',
        sortable: true,
        sortKey: 'customer.name',
        render: (ib) => ib.expand?.customer?.name || '-',
      },
      {
        header: 'Site',
        sortable: true,
        sortKey: 'installed_site.name',
        render: (ib) => ib.expand?.installed_site?.name || '-',
      },
      {
        header: 'Qty',
        sortable: true,
        sortKey: 'lic_amount',
        align: 'center',
        style: { width: '60px' },
        render: (ib) => String(ib.lic_amount || 0),
      },
      {
        header: 'SLA',
        sortable: true,
        sortKey: 'support.name',
        render: (ib) => ib.expand?.support?.name || '-',
      },
      {
        header: 'Support Start',
        sortable: true,
        sortKey: 'support_start',
        render: (ib) => {
          const span = document.createElement('span');
          span.className = 'text-xs';
          span.textContent = ib.support_start ? new Date(ib.support_start).toLocaleDateString() : '-';
          return span;
        },
      },
      {
        header: 'Contract Term',
        sortable: true,
        sortKey: 'contract_term',
        align: 'center',
        style: { width: '90px' },
        render: (ib) => ib.contract_term ? `${ib.contract_term} mo` : '-',
      },
      {
        header: 'Status',
        style: { width: '110px' },
        render: (ib) => {
          const status = getStatusInfo(ib);
          if (status.text === '-') return '-';
          const badge = document.createElement('span');
          badge.className = `badge ${status.className}`;
          badge.textContent = status.text;
          return badge;
        },
      },
      {
        header: 'Actions',
        align: 'right',
        style: { textAlign: 'right' },
        render: (ib) => createRowActions({
          onEdit: () => openIbModal(ib),
          more: [
            { label: 'Delete', onClick: () => handleDeleteIb(ib), danger: true },
          ],
        }),
      },
    ];
  }

  function renderInstalledBaseTab() {
    contentArea.innerHTML = '';

    // Destroy old data table if any
    if (ibDataTable) {
      ibDataTable.destroy();
      ibDataTable = null;
    }

    // Action buttons
    const actionBtns = document.createElement('div');
    actionBtns.className = 'flex gap-2';

    // Import from Quote button
    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-secondary';
    const importSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    importSvg.setAttribute('fill', 'none');
    importSvg.setAttribute('viewBox', '0 0 24 24');
    importSvg.setAttribute('stroke-width', '1.5');
    importSvg.setAttribute('stroke', 'currentColor');
    importSvg.style.cssText = 'width:16px;height:16px;margin-right:6px;';
    const importPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    importPath.setAttribute('stroke-linecap', 'round');
    importPath.setAttribute('stroke-linejoin', 'round');
    importPath.setAttribute('d', 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z');
    importSvg.appendChild(importPath);
    importBtn.appendChild(importSvg);
    importBtn.appendChild(document.createTextNode('Import from Quote'));
    importBtn.addEventListener('click', () => openWizardModal());

    // Add Entry button
    const addEntryBtn = document.createElement('button');
    addEntryBtn.className = 'btn btn-primary';
    addEntryBtn.textContent = '+ Add Entry';
    addEntryBtn.addEventListener('click', () => openIbModal(null));

    actionBtns.appendChild(importBtn);
    actionBtns.appendChild(addEntryBtn);

    ibDataTable = createDataTable({
      title: 'Installed Base',
      subtitle: 'Manage installed licenses and support contracts',
      action: actionBtns,
      columns: getIbColumns(),
      data: installedBase,
      loading: ibLoading,
      page: ibPage,
      totalPages: ibTotalPages,
      onSearch: (val) => {
        ibSearch = val;
        ibPage = 1;
        loadInstalledBase();
      },
      onPageChange: (newPage) => {
        ibPage = newPage;
        loadInstalledBase();
      },
      searchPlaceholder: 'Search by customer or license...',
      sortColumn: ibSortColumn,
      sortDirection: ibSortDirection,
      onSort: (key, direction) => {
        ibSortColumn = direction ? key : null;
        ibSortDirection = direction;
        ibPage = 1;
        loadInstalledBase();
      },
    });

    contentArea.appendChild(ibDataTable.element);
  }

  // --- Installed Base CRUD Modal ---
  function openIbModal(editingIb) {
    closeAllModals();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.addEventListener('click', () => closeModal(backdrop));

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'width:550px;max-width:90vw;overflow:visible;';
    card.addEventListener('click', (e) => e.stopPropagation());

    // Header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'p-4 border-b';
    modalHeader.style.borderColor = 'var(--border)';
    const headerTitle = document.createElement('h3');
    headerTitle.style.cssText = 'font-size:1.125rem;font-weight:600;';
    headerTitle.textContent = editingIb ? 'Edit Installed Base' : 'Add Installed Base';
    modalHeader.appendChild(headerTitle);
    card.appendChild(modalHeader);

    // Form
    const form = document.createElement('form');

    const formBody = document.createElement('div');
    formBody.className = 'p-4';
    formBody.style.cssText = 'max-height:60vh;overflow-y:auto;overflow-x:visible;';

    // Customer (AsyncSelect)
    const custGroup = document.createElement('div');
    custGroup.className = 'form-group';
    const custLabel = document.createElement('label');
    custLabel.textContent = 'Customer *';
    const customerSelect = createAsyncSelect({
      name: 'customer',
      loadOptions: loadCustomerOptions,
      defaultValue: editingIb?.customer || '',
      defaultLabel: editingIb?.expand?.customer?.name || '',
      placeholder: 'Select customer...',
      required: true,
    });
    activeAsyncSelects.push(customerSelect);
    custGroup.appendChild(custLabel);
    custGroup.appendChild(customerSelect.element);
    formBody.appendChild(custGroup);

    // License (AsyncSelect)
    const licGroup = document.createElement('div');
    licGroup.className = 'form-group';
    const licLabel = document.createElement('label');
    licLabel.textContent = 'License *';
    const licenseSelect = createAsyncSelect({
      name: 'license',
      loadOptions: loadLicenseOptions,
      defaultValue: editingIb?.license || '',
      defaultLabel: editingIb?.expand?.license ? `${editingIb.expand.license.sku} - ${editingIb.expand.license.name}` : '',
      placeholder: 'Select license...',
      required: true,
    });
    activeAsyncSelects.push(licenseSelect);
    licGroup.appendChild(licLabel);
    licGroup.appendChild(licenseSelect.element);
    formBody.appendChild(licGroup);

    // Row: Amount + Contract Term
    const row1 = document.createElement('div');
    row1.className = 'form-row';

    const amtGroup = document.createElement('div');
    amtGroup.className = 'form-group';
    const amtLabel = document.createElement('label');
    amtLabel.textContent = 'Amount';
    const amtInput = document.createElement('input');
    amtInput.type = 'number';
    amtInput.name = 'lic_amount';
    amtInput.min = '1';
    amtInput.value = String(editingIb?.lic_amount || 1);
    amtGroup.appendChild(amtLabel);
    amtGroup.appendChild(amtInput);

    const termGroup = document.createElement('div');
    termGroup.className = 'form-group';
    const termLabel = document.createElement('label');
    termLabel.textContent = 'Contract Term (months)';
    const termInput = document.createElement('input');
    termInput.type = 'number';
    termInput.name = 'contract_term';
    termInput.min = '1';
    termInput.value = String(editingIb?.contract_term || 12);
    termGroup.appendChild(termLabel);
    termGroup.appendChild(termInput);

    row1.appendChild(amtGroup);
    row1.appendChild(termGroup);
    formBody.appendChild(row1);

    // Installed Site (Select from allSites)
    const siteGroup = document.createElement('div');
    siteGroup.className = 'form-group';
    const siteLabel = document.createElement('label');
    siteLabel.textContent = 'Installed Site';
    const siteOptions = [
      { value: '', label: '-- None --' },
      ...allSites.map(s => ({
        value: s.id,
        label: `${s.name}${s.expand?.customer ? ` (${s.expand.customer.name})` : ''}`,
      })),
    ];
    const siteSelect = createSelect({
      name: 'installed_site',
      options: siteOptions,
      defaultValue: editingIb?.installed_site || '',
      placeholder: 'Select site...',
    });
    siteGroup.appendChild(siteLabel);
    siteGroup.appendChild(siteSelect.element);
    formBody.appendChild(siteGroup);

    // Support Level (Select from slas)
    const slaGroup = document.createElement('div');
    slaGroup.className = 'form-group';
    const slaLabel = document.createElement('label');
    slaLabel.textContent = 'Support Level';
    const slaOptions = [
      { value: '', label: '-- None --' },
      ...slas.map(s => ({ value: s.id, label: s.name })),
    ];
    const slaSelect = createSelect({
      name: 'support',
      options: slaOptions,
      defaultValue: editingIb?.support || '',
      placeholder: 'Select SLA...',
    });
    slaGroup.appendChild(slaLabel);
    slaGroup.appendChild(slaSelect.element);
    formBody.appendChild(slaGroup);

    // Row: Installed On + Support Start
    const row2 = document.createElement('div');
    row2.className = 'form-row';

    const installedOnGroup = document.createElement('div');
    installedOnGroup.className = 'form-group';
    const installedOnLabel = document.createElement('label');
    installedOnLabel.textContent = 'Installed On';
    const installedOnInput = document.createElement('input');
    installedOnInput.type = 'date';
    installedOnInput.name = 'installed_on';
    installedOnInput.value = editingIb?.installed_on?.split('T')[0] || '';
    installedOnGroup.appendChild(installedOnLabel);
    installedOnGroup.appendChild(installedOnInput);

    const supportStartGroup = document.createElement('div');
    supportStartGroup.className = 'form-group';
    const supportStartLabel = document.createElement('label');
    supportStartLabel.textContent = 'Support Start';
    const supportStartInput = document.createElement('input');
    supportStartInput.type = 'date';
    supportStartInput.name = 'support_start';
    supportStartInput.value = editingIb?.support_start?.split('T')[0] || '';
    supportStartGroup.appendChild(supportStartLabel);
    supportStartGroup.appendChild(supportStartInput);

    row2.appendChild(installedOnGroup);
    row2.appendChild(supportStartGroup);
    formBody.appendChild(row2);

    form.appendChild(formBody);

    // Footer
    const formFooter = document.createElement('div');
    formFooter.className = 'p-4 border-t flex justify-end gap-2';
    formFooter.style.borderColor = 'var(--border)';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => closeModal(backdrop));

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Save';

    formFooter.appendChild(cancelBtn);
    formFooter.appendChild(saveBtn);
    form.appendChild(formFooter);

    // Submit handler
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = {
        customer: customerSelect.getValue(),
        license: licenseSelect.getValue(),
        lic_amount: parseFloat(amtInput.value) || 0,
        installed_on: installedOnInput.value || null,
        support: slaSelect.getValue() || null,
        support_start: supportStartInput.value || null,
        contract_term: parseInt(termInput.value) || 0,
        installed_site: siteSelect.getValue() || null,
      };

      try {
        if (editingIb) {
          await pb.collection('installed_base').update(editingIb.id, data);
          showToast('Installed base entry updated successfully', 'success');
        } else {
          await pb.collection('installed_base').create(data);
          showToast('Installed base entry created successfully', 'success');
        }
        closeModal(backdrop);
        loadInstalledBase();
      } catch (err) {
        console.error('Error saving installed base:', err);
        showToast('Failed to save installed base entry', 'error');
      }
    });

    card.appendChild(form);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
  }

  function handleDeleteIb(ib) {
    const name = ib.expand?.license
      ? `${ib.expand.license.sku} - ${ib.expand.license.name}`
      : 'this entry';

    showConfirmModal({
      title: 'Delete Installed Base Entry',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await pb.collection('installed_base').delete(ib.id);
          showToast('Entry deleted successfully', 'success');
          loadInstalledBase();
        } catch (err) {
          console.error('Error deleting installed base:', err);
          showToast('Failed to delete entry', 'error');
        }
      },
    });
  }

  // ============================
  // WIZARD MODAL (Import from Quote)
  // ============================

  function openWizardModal() {
    closeAllModals();

    // Wizard state
    let wizardStep = 1;
    let selectedQuote = null;
    let selectedSite = '';
    let wizardItems = [];
    let wizardLoading = false;
    let showCreateSiteInWizard = false;
    let newSiteName = '';
    let creatingSite = false;
    let wizardInstalledOn = new Date().toISOString().split('T')[0];
    let wizardSupportStart = new Date().toISOString().split('T')[0];

    // Track wizard-specific selects for cleanup
    let wizardSelects = [];

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.addEventListener('click', () => closeModal(backdrop));

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'width:700px;max-width:95vw;overflow:visible;';
    card.addEventListener('click', (e) => e.stopPropagation());

    // Header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'p-4 border-b';
    modalHeader.style.borderColor = 'var(--border)';
    const headerTitle = document.createElement('h3');
    headerTitle.style.cssText = 'font-size:1.125rem;font-weight:600;';
    headerTitle.textContent = 'Import from Quote';
    const headerDesc = document.createElement('p');
    headerDesc.className = 'text-sm text-secondary mt-1';
    headerDesc.textContent = 'Copy license configurations from an existing quote to installed base';
    modalHeader.appendChild(headerTitle);
    modalHeader.appendChild(headerDesc);
    card.appendChild(modalHeader);

    // Steps indicator
    const stepsBar = document.createElement('div');
    stepsBar.className = 'p-4 border-b';
    stepsBar.style.cssText = 'border-color:var(--border);background:var(--bg);';
    card.appendChild(stepsBar);

    // Content area
    const wizardContent = document.createElement('div');
    wizardContent.className = 'p-4';
    wizardContent.style.cssText = 'min-height:300px;max-height:50vh;overflow-y:auto;overflow-x:visible;';
    card.appendChild(wizardContent);

    // Footer
    const wizardFooter = document.createElement('div');
    wizardFooter.className = 'p-4 border-t flex justify-between';
    wizardFooter.style.borderColor = 'var(--border)';
    card.appendChild(wizardFooter);

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    // --- Render steps indicator ---
    function renderStepsIndicator() {
      stepsBar.innerHTML = '';
      const stepsRow = document.createElement('div');
      stepsRow.className = 'flex gap-4 items-center';

      const stepDefs = [
        { num: 1, label: 'Select Quote' },
        { num: 2, label: 'Review & Configure' },
        { num: 3, label: 'Import' },
      ];

      stepDefs.forEach((s, idx) => {
        const stepEl = document.createElement('div');
        stepEl.className = `wizard-step ${wizardStep >= s.num ? 'active' : ''}`;

        const numSpan = document.createElement('span');
        numSpan.className = 'wizard-step-number';
        numSpan.textContent = String(s.num);

        const labelSpan = document.createElement('span');
        labelSpan.className = 'wizard-step-label';
        labelSpan.textContent = s.label;

        stepEl.appendChild(numSpan);
        stepEl.appendChild(labelSpan);
        stepsRow.appendChild(stepEl);

        // Connector between steps (not after last)
        if (idx < stepDefs.length - 1) {
          const connector = document.createElement('div');
          connector.className = 'wizard-step-connector';
          stepsRow.appendChild(connector);
        }
      });

      stepsBar.appendChild(stepsRow);
    }

    // --- Get wizard site options ---
    function getWizardSiteOptions() {
      if (!selectedQuote) return allSites;
      const customerId = selectedQuote.expand?.opportunity?.customer;
      return allSites.filter(s => !s.customer || s.customer === customerId);
    }

    // --- Render wizard content ---
    function renderWizardContent() {
      renderStepsIndicator();
      wizardContent.innerHTML = '';

      // Clean up old selects
      wizardSelects.forEach(s => s.destroy());
      wizardSelects = [];

      if (wizardLoading) {
        const loadingEl = document.createElement('div');
        loadingEl.className = 'text-center p-6';
        const spinner = document.createElement('div');
        spinner.className = 'async-select-spinner';
        spinner.style.margin = '0 auto 1rem';
        const loadText = document.createElement('p');
        loadText.className = 'text-secondary';
        loadText.textContent = 'Loading...';
        loadingEl.appendChild(spinner);
        loadingEl.appendChild(loadText);
        wizardContent.appendChild(loadingEl);
        renderWizardFooter();
        return;
      }

      if (wizardStep === 1) {
        renderStep1();
      } else if (wizardStep === 2) {
        renderStep2();
      } else if (wizardStep === 3) {
        renderStep3();
      }

      renderWizardFooter();
    }

    // --- Step 1: Select Quote ---
    function renderStep1() {
      const formGroup = document.createElement('div');
      formGroup.className = 'form-group';
      const label = document.createElement('label');
      label.textContent = 'Select a Quote to Import From';
      const quoteSelect = createAsyncSelect({
        name: 'quote',
        loadOptions: loadQuoteOptions,
        placeholder: 'Search for quote by opportunity or customer...',
        onChange: (id) => handleWizardQuoteSelect(id),
      });
      wizardSelects.push(quoteSelect);
      activeAsyncSelects.push(quoteSelect);
      formGroup.appendChild(label);
      formGroup.appendChild(quoteSelect.element);
      wizardContent.appendChild(formGroup);

      const hint = document.createElement('p');
      hint.className = 'text-sm text-secondary mt-4';
      hint.textContent = 'Search and select a quote. The wizard will extract all licenses and allow you to configure them before importing.';
      wizardContent.appendChild(hint);
    }

    // --- Step 2: Review & Configure ---
    function renderStep2() {
      // Quote info card
      const infoCard = document.createElement('div');
      infoCard.className = 'mb-4 p-3 card';
      infoCard.style.background = 'var(--bg)';
      const quotePara = document.createElement('p');
      quotePara.className = 'text-sm';
      quotePara.innerHTML = `<strong>Quote:</strong> ${selectedQuote?.expand?.opportunity?.title || 'Unknown'}`;
      const custPara = document.createElement('p');
      custPara.className = 'text-sm';
      custPara.innerHTML = `<strong>Customer:</strong> ${selectedQuote?.expand?.opportunity?.expand?.customer?.name || 'Unknown'}`;
      infoCard.appendChild(quotePara);
      infoCard.appendChild(custPara);
      wizardContent.appendChild(infoCard);

      // Target Site
      const siteGroup = document.createElement('div');
      siteGroup.className = 'form-group';
      const siteLabel = document.createElement('label');
      siteLabel.textContent = 'Target Site *';
      siteGroup.appendChild(siteLabel);

      if (!showCreateSiteInWizard) {
        const siteRow = document.createElement('div');
        siteRow.className = 'flex gap-2';

        const siteSelectWrap = document.createElement('div');
        siteSelectWrap.style.flex = '1';
        const wizardSiteOptions = getWizardSiteOptions().map(s => ({
          value: s.id,
          label: `${s.name}${s.expand?.customer ? ` (${s.expand.customer.name})` : ''}`,
        }));
        const siteSelect = createSelect({
          name: 'target_site',
          options: wizardSiteOptions,
          value: selectedSite,
          onChange: (val) => { selectedSite = val; },
          placeholder: 'Select installation site...',
        });
        wizardSelects.push(siteSelect);
        siteSelectWrap.appendChild(siteSelect.element);

        const createSiteBtn = document.createElement('button');
        createSiteBtn.type = 'button';
        createSiteBtn.className = 'btn btn-secondary';
        createSiteBtn.title = 'Create new site';
        const plusSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        plusSvg.setAttribute('fill', 'none');
        plusSvg.setAttribute('viewBox', '0 0 24 24');
        plusSvg.setAttribute('stroke-width', '1.5');
        plusSvg.setAttribute('stroke', 'currentColor');
        plusSvg.style.cssText = 'width:16px;height:16px;';
        const plusPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        plusPath.setAttribute('stroke-linecap', 'round');
        plusPath.setAttribute('stroke-linejoin', 'round');
        plusPath.setAttribute('d', 'M12 4.5v15m7.5-7.5h-15');
        plusSvg.appendChild(plusPath);
        createSiteBtn.appendChild(plusSvg);
        createSiteBtn.addEventListener('click', () => {
          showCreateSiteInWizard = true;
          renderWizardContent();
        });

        siteRow.appendChild(siteSelectWrap);
        siteRow.appendChild(createSiteBtn);
        siteGroup.appendChild(siteRow);
      } else {
        // Inline create site
        const createCard = document.createElement('div');
        createCard.className = 'card p-3';
        createCard.style.background = 'var(--bg)';

        const createTitle = document.createElement('p');
        createTitle.className = 'text-sm font-medium mb-2';
        createTitle.textContent = 'Create New Site';
        createCard.appendChild(createTitle);

        const createRow = document.createElement('div');
        createRow.className = 'flex gap-2';

        const siteNameInput = document.createElement('input');
        siteNameInput.type = 'text';
        siteNameInput.placeholder = 'Site name...';
        siteNameInput.value = newSiteName;
        siteNameInput.style.flex = '1';
        siteNameInput.addEventListener('input', (e) => { newSiteName = e.target.value; });

        const createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'btn btn-primary btn-sm';
        createBtn.textContent = 'Create';
        createBtn.disabled = !newSiteName.trim() || creatingSite;
        siteNameInput.addEventListener('input', () => {
          createBtn.disabled = !siteNameInput.value.trim() || creatingSite;
        });
        createBtn.addEventListener('click', async () => {
          if (!siteNameInput.value.trim() || !selectedQuote) return;
          creatingSite = true;
          createBtn.disabled = true;
          createBtn.textContent = 'Creating...';

          try {
            const customerId = selectedQuote.expand?.opportunity?.customer;
            const newSite = await pb.collection('installed_site').create({
              name: siteNameInput.value.trim(),
              customer: customerId,
            });
            const updatedSites = await pb.collection('installed_site').getFullList({ sort: 'name', expand: 'customer' });
            allSites = updatedSites;
            selectedSite = newSite.id;
            newSiteName = '';
            showCreateSiteInWizard = false;
            showToast('Site created successfully', 'success');
          } catch (err) {
            console.error('Error creating site:', err);
            showToast('Failed to create site', 'error');
          }
          creatingSite = false;
          renderWizardContent();
        });

        const createCancelBtn = document.createElement('button');
        createCancelBtn.type = 'button';
        createCancelBtn.className = 'btn btn-secondary btn-sm';
        createCancelBtn.textContent = 'Cancel';
        createCancelBtn.addEventListener('click', () => {
          showCreateSiteInWizard = false;
          newSiteName = '';
          renderWizardContent();
        });

        createRow.appendChild(siteNameInput);
        createRow.appendChild(createBtn);
        createRow.appendChild(createCancelBtn);
        createCard.appendChild(createRow);

        const assignHint = document.createElement('p');
        assignHint.className = 'text-xs text-secondary mt-2';
        assignHint.textContent = `Site will be assigned to: ${selectedQuote?.expand?.opportunity?.expand?.customer?.name || 'Unknown'}`;
        createCard.appendChild(assignHint);

        siteGroup.appendChild(createCard);
      }

      wizardContent.appendChild(siteGroup);

      // Date fields
      const dateRow = document.createElement('div');
      dateRow.className = 'form-row';
      dateRow.style.marginTop = '1rem';

      const installedOnGroup = document.createElement('div');
      installedOnGroup.className = 'form-group';
      const installedOnLabel = document.createElement('label');
      installedOnLabel.textContent = 'Installed On';
      const installedOnInput = document.createElement('input');
      installedOnInput.type = 'date';
      installedOnInput.value = wizardInstalledOn;
      installedOnInput.addEventListener('change', (e) => { wizardInstalledOn = e.target.value; });
      installedOnGroup.appendChild(installedOnLabel);
      installedOnGroup.appendChild(installedOnInput);

      const supportStartGroup = document.createElement('div');
      supportStartGroup.className = 'form-group';
      const supportStartLabel = document.createElement('label');
      supportStartLabel.textContent = 'Support Start';
      const supportStartInput = document.createElement('input');
      supportStartInput.type = 'date';
      supportStartInput.value = wizardSupportStart;
      supportStartInput.addEventListener('change', (e) => { wizardSupportStart = e.target.value; });
      supportStartGroup.appendChild(supportStartLabel);
      supportStartGroup.appendChild(supportStartInput);

      dateRow.appendChild(installedOnGroup);
      dateRow.appendChild(supportStartGroup);
      wizardContent.appendChild(dateRow);

      // Licenses table
      const licensesSection = document.createElement('div');
      licensesSection.className = 'mt-4';

      const licensesLabel = document.createElement('label');
      licensesLabel.className = 'font-medium mb-2';
      licensesLabel.style.display = 'block';
      licensesLabel.textContent = 'Licenses to Import';
      licensesSection.appendChild(licensesLabel);

      const licensesCard = document.createElement('div');
      licensesCard.className = 'card';
      licensesCard.style.cssText = 'max-height:250px;overflow-y:auto;';

      const table = document.createElement('table');
      table.style.width = '100%';

      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      const headCells = [
        { text: '', style: 'width:40px' },
        { text: 'License', style: '' },
        { text: 'Amount', style: 'width:80px' },
        { text: 'Support', style: 'width:140px' },
        { text: 'Term', style: 'width:80px' },
      ];
      headCells.forEach(h => {
        const th = document.createElement('th');
        if (h.style) th.style.cssText = h.style;
        th.textContent = h.text;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      wizardItems.forEach((item, idx) => {
        const tr = document.createElement('tr');

        // Checkbox
        const checkTd = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.selected;
        checkbox.style.width = 'auto';
        checkbox.addEventListener('change', (e) => {
          wizardItems[idx].selected = e.target.checked;
        });
        checkTd.appendChild(checkbox);
        tr.appendChild(checkTd);

        // License name
        const nameTd = document.createElement('td');
        nameTd.className = 'text-sm';
        nameTd.textContent = `${item.sku} - ${item.name}`;
        tr.appendChild(nameTd);

        // Amount input
        const amtTd = document.createElement('td');
        const amtInput = document.createElement('input');
        amtInput.type = 'number';
        amtInput.value = String(item.amount);
        amtInput.min = '1';
        amtInput.style.cssText = 'padding:0.25rem 0.5rem;';
        amtInput.addEventListener('input', (e) => {
          wizardItems[idx].amount = parseInt(e.target.value) || 1;
        });
        amtTd.appendChild(amtInput);
        tr.appendChild(amtTd);

        // Support select
        const supportTd = document.createElement('td');
        const supportOptions = [
          { value: '', label: 'None' },
          ...slas.map(s => ({ value: s.id, label: s.name })),
        ];
        const supportSelect = createSelect({
          name: `support_${idx}`,
          options: supportOptions,
          value: item.support,
          onChange: (val) => { wizardItems[idx].support = val; },
          placeholder: 'None',
          compact: true,
        });
        wizardSelects.push(supportSelect);
        supportTd.appendChild(supportSelect.element);
        tr.appendChild(supportTd);

        // Contract term input
        const termTd = document.createElement('td');
        const termInput = document.createElement('input');
        termInput.type = 'number';
        termInput.value = String(item.contract_term);
        termInput.min = '1';
        termInput.style.cssText = 'padding:0.25rem 0.5rem;';
        termInput.addEventListener('input', (e) => {
          wizardItems[idx].contract_term = parseInt(e.target.value) || 12;
        });
        termTd.appendChild(termInput);
        tr.appendChild(termTd);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      licensesCard.appendChild(table);
      licensesSection.appendChild(licensesCard);
      wizardContent.appendChild(licensesSection);
    }

    // --- Step 3: Ready to Import ---
    function renderStep3() {
      const readyEl = document.createElement('div');
      readyEl.className = 'text-center p-6';

      const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      checkSvg.setAttribute('fill', 'none');
      checkSvg.setAttribute('viewBox', '0 0 24 24');
      checkSvg.setAttribute('stroke-width', '1.5');
      checkSvg.setAttribute('stroke', 'var(--success)');
      checkSvg.style.cssText = 'width:48px;height:48px;margin:0 auto 1rem;';
      const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      checkPath.setAttribute('stroke-linecap', 'round');
      checkPath.setAttribute('stroke-linejoin', 'round');
      checkPath.setAttribute('d', 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z');
      checkSvg.appendChild(checkPath);
      readyEl.appendChild(checkSvg);

      const readyTitle = document.createElement('h4');
      readyTitle.style.cssText = 'font-size:1.125rem;font-weight:600;margin-bottom:0.5rem;';
      readyTitle.textContent = 'Ready to Import';
      readyEl.appendChild(readyTitle);

      const readyDesc = document.createElement('p');
      readyDesc.className = 'text-secondary';
      const selectedCount = wizardItems.filter(i => i.selected).length;
      readyDesc.textContent = `${selectedCount} license(s) will be added to the installed base.`;
      readyEl.appendChild(readyDesc);

      wizardContent.appendChild(readyEl);
    }

    // --- Quote selection handler ---
    async function handleWizardQuoteSelect(quoteId) {
      wizardLoading = true;
      renderWizardContent();

      try {
        const quote = await pb.collection('quotes').getOne(quoteId, { expand: 'opportunity.customer' });
        selectedQuote = quote;

        // Extract licenses from quote_data.lineItems
        const quoteData = quote.quote_data;
        if (quoteData?.lineItems) {
          const licenseItems = quoteData.lineItems.filter(item => item.itemType === 'license');
          wizardItems = licenseItems.map(lic => ({
            licenseId: lic.licenseId,
            sku: lic.sku,
            name: lic.name,
            amount: lic.amount || 1,
            selected: true,
            support: lic.sla || '',
            contract_term: 12,
          }));
        }
        wizardStep = 2;
      } catch (e) {
        console.error('Error loading quote:', e);
        showToast('Failed to load quote details', 'error');
      }

      wizardLoading = false;
      renderWizardContent();
    }

    // --- Wizard import handler ---
    async function handleWizardImport() {
      if (!selectedQuote || !selectedSite) return;

      wizardLoading = true;
      renderWizardContent();

      try {
        const customerId = selectedQuote.expand?.opportunity?.customer;

        for (const item of wizardItems.filter(i => i.selected)) {
          await pb.collection('installed_base').create({
            customer: customerId,
            license: item.licenseId,
            lic_amount: item.amount || 1,
            installed_on: wizardInstalledOn || null,
            support: item.support || null,
            support_start: wizardSupportStart || null,
            contract_term: item.contract_term || 12,
            installed_site: selectedSite,
          });
        }

        const count = wizardItems.filter(i => i.selected).length;
        showToast(`Successfully imported ${count} license(s) to installed base`, 'success');
        closeModal(backdrop);
        loadInstalledBase();
      } catch (e) {
        console.error('Error importing from quote:', e);
        showToast('Failed to import from quote', 'error');
        wizardLoading = false;
        renderWizardContent();
      }
    }

    // --- Render wizard footer ---
    function renderWizardFooter() {
      wizardFooter.innerHTML = '';

      // Left: Back/Cancel button
      const backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'btn btn-secondary';
      backBtn.textContent = wizardStep > 1 ? 'Back' : 'Cancel';
      backBtn.addEventListener('click', () => {
        if (wizardStep > 1) {
          wizardStep--;
          renderWizardContent();
        } else {
          closeModal(backdrop);
        }
      });
      wizardFooter.appendChild(backBtn);

      // Right: Continue/Import buttons
      const rightBtns = document.createElement('div');
      rightBtns.className = 'flex gap-2';

      if (wizardStep === 2) {
        const continueBtn = document.createElement('button');
        continueBtn.type = 'button';
        continueBtn.className = 'btn btn-primary';
        continueBtn.textContent = 'Continue';
        const hasSelected = wizardItems.filter(i => i.selected).length > 0;
        continueBtn.disabled = !selectedSite || !hasSelected;
        continueBtn.addEventListener('click', () => {
          wizardStep = 3;
          renderWizardContent();
        });
        rightBtns.appendChild(continueBtn);
      }

      if (wizardStep === 3) {
        const importSubmitBtn = document.createElement('button');
        importSubmitBtn.type = 'button';
        importSubmitBtn.className = 'btn btn-primary';
        importSubmitBtn.textContent = 'Import';
        importSubmitBtn.disabled = wizardLoading;
        importSubmitBtn.addEventListener('click', handleWizardImport);
        rightBtns.appendChild(importSubmitBtn);
      }

      wizardFooter.appendChild(rightBtns);
    }

    // Initial render
    renderWizardContent();
  }

  // ============================
  // MODAL UTILITIES
  // ============================

  function closeModal(backdrop) {
    // Destroy async selects
    activeAsyncSelects.forEach(s => {
      try { s.destroy(); } catch (_) {}
    });
    activeAsyncSelects = [];

    if (backdrop && backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
    }
  }

  function closeAllModals() {
    // Remove any open modal backdrops from the body
    document.querySelectorAll('.modal-backdrop').forEach(el => {
      if (el.parentNode === document.body) {
        el.parentNode.removeChild(el);
      }
    });
    activeAsyncSelects.forEach(s => {
      try { s.destroy(); } catch (_) {}
    });
    activeAsyncSelects = [];
  }

  // ============================
  // INITIALIZATION
  // ============================

  // Load lookups, then render initial tab
  loadLookups().then(() => {
    renderInstalledBaseTab();
    loadInstalledBase();
  });

  // ============================
  // CLEANUP
  // ============================

  function destroy() {
    closeAllModals();
    if (sitesDataTable) sitesDataTable.destroy();
    if (ibDataTable) ibDataTable.destroy();
    container.innerHTML = '';
  }

  return { destroy };
}
