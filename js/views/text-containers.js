// Text Containers List View
// Standard list view for reusable text blocks (View 2)

import { pb } from '../api.js';
import { createDataTable } from '../components/data-table.js';
import { showConfirmModal } from '../components/modal.js';
import { createRowActions } from '../components/row-actions.js';
import { showToast } from '../components/toast.js';

export function createTextContainersView(container) {
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
  newBtn.textContent = '+ New Container';
  newBtn.addEventListener('click', () => openModal(null));

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
        header: 'Category',
        sortable: true,
        sortKey: 'category',
        render: (d) => {
          const span = document.createElement('span');
          span.className = 'badge';
          span.textContent = d.category || 'General';
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
          onEdit: () => openModal(d),
          more: [
            { label: 'Duplicate', onClick: () => handleDuplicate(d) },
            { label: 'Delete', onClick: () => handleDelete(d.id, d.name), danger: true },
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
    onRowClick: (d) => openModal(d),
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
      console.error(e);
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
          showToast('Failed to delete container', 'error');
        }
      },
    });
  }

  async function handleDuplicate(item) {
    try {
      await pb.collection('text_containers').create({
        name: item.name + ' (Copy)',
        content: item.content || '',
        category: item.category || '',
      });
      showToast('Container duplicated', 'success');
      loadData();
    } catch (err) {
      showToast('Failed to duplicate container', 'error');
    }
  }

  function openModal(editItem) {
    closeModal();

    modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';
    modalBackdrop.addEventListener('click', closeModal);

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'width:100%;max-width:700px;max-height:90vh;display:flex;flex-direction:column;';
    card.addEventListener('click', (e) => e.stopPropagation());

    // Header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'p-4 border-b';
    const h3 = document.createElement('h3');
    h3.textContent = `${editItem ? 'Edit' : 'New'} Text Container`;
    headerDiv.appendChild(h3);
    card.appendChild(headerDiv);

    // Form
    const form = document.createElement('form');
    form.className = 'p-6';
    form.style.cssText = 'overflow-y:auto;flex:1;';

    // Name
    const nameGroup = document.createElement('div');
    nameGroup.className = 'form-group';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name';
    const nameInput = document.createElement('input');
    nameInput.name = 'name';
    nameInput.required = true;
    if (editItem) nameInput.defaultValue = editItem.name || '';
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    form.appendChild(nameGroup);

    // Category
    const catGroup = document.createElement('div');
    catGroup.className = 'form-group';
    const catLabel = document.createElement('label');
    catLabel.textContent = 'Category';
    const catInput = document.createElement('input');
    catInput.name = 'category';
    catInput.placeholder = 'e.g. Legal, Intro, Terms...';
    if (editItem) catInput.defaultValue = editItem.category || '';
    catGroup.appendChild(catLabel);
    catGroup.appendChild(catInput);
    form.appendChild(catGroup);

    // Quill editor for content
    const contentGroup = document.createElement('div');
    contentGroup.className = 'form-group';
    const contentLabel = document.createElement('label');
    contentLabel.textContent = 'Content';
    contentGroup.appendChild(contentLabel);

    const editorWrap = document.createElement('div');
    editorWrap.style.cssText = 'border:1px solid var(--border);border-radius:8px;overflow:hidden;background:white;';
    const editorEl = document.createElement('div');
    editorEl.style.cssText = 'min-height:200px;';
    editorWrap.appendChild(editorEl);
    contentGroup.appendChild(editorWrap);
    form.appendChild(contentGroup);

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

    let quill = null;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const data = Object.fromEntries(formData.entries());
      data.content = quill ? quill.root.innerHTML : '';
      if (data.content === '<p><br></p>') data.content = '';

      try {
        if (editItem) {
          await pb.collection('text_containers').update(editItem.id, data);
        } else {
          await pb.collection('text_containers').create(data);
        }
        closeModal();
        showToast(editItem ? 'Container updated' : 'Container created', 'success');
        loadData();
      } catch (err) {
        showToast('Failed to save container', 'error');
      }
    });

    card.appendChild(form);
    modalBackdrop.appendChild(card);
    document.body.appendChild(modalBackdrop);

    // Init Quill after DOM is in place
    if (typeof window.Quill !== 'undefined') {
      quill = new window.Quill(editorEl, {
        theme: 'snow',
        placeholder: 'Type your reusable text here...',
        modules: {
          toolbar: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['blockquote', 'link'],
            ['clean'],
          ],
        },
      });
      if (editItem && editItem.content) {
        quill.root.innerHTML = editItem.content;
      }
    }
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
