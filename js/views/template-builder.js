// Template Builder View
// Compose text containers into document templates with drag-to-reorder
// Route: /document-templates/:id

import { pb } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { getSampleVariableMap, resolveVariables } from '../lib/variable-resolver.js';

const CATEGORY_COLORS = {
  header: '#6366f1',
  body: '#3b82f6',
  pricing: '#f59e0b',
  footer: '#6b7280',
  legal: '#ef4444',
};

/**
 * Create the template builder view.
 * @param {HTMLElement} container
 * @param {{ templateId: string }} params
 */
export function createTemplateBuilderView(container, { templateId }) {
  container.innerHTML = '';

  let template = null;
  let allContainers = [];
  let selectedContainerIds = []; // ordered array of { containerId, order }
  let pageSettings = { margins: { top: 20, right: 20, bottom: 20, left: 20 }, orientation: 'portrait', header: '', footer: '' };
  let destroyed = false;
  let dragIndex = null;

  // Build the layout
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;';

  // Header
  const header = document.createElement('header');
  header.className = 'main-header';
  header.style.cssText = 'background:var(--surface);border-bottom:1px solid var(--border);padding:0.75rem 2rem;display:flex;align-items:center;gap:12px;';

  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary';
  backBtn.style.cssText = 'padding:6px 10px;';
  backBtn.innerHTML = '&larr;';
  backBtn.addEventListener('click', () => navigate('/document-templates'));
  header.appendChild(backBtn);

  const titleInput = document.createElement('input');
  titleInput.style.cssText = 'font-size:1.1rem;font-weight:600;border:none;background:transparent;color:var(--text-main);outline:none;flex:1;padding:4px 8px;border-radius:4px;';
  titleInput.placeholder = 'Template Name';
  titleInput.addEventListener('focus', () => { titleInput.style.background = 'var(--bg)'; });
  titleInput.addEventListener('blur', () => { titleInput.style.background = 'transparent'; });
  header.appendChild(titleInput);

  const headerRight = document.createElement('div');
  headerRight.style.cssText = 'display:flex;gap:8px;margin-left:auto;';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary btn-sm';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', handleSave);
  headerRight.appendChild(saveBtn);

  header.appendChild(headerRight);
  root.appendChild(header);

  // Main body: 3-column layout
  const body = document.createElement('div');
  body.style.cssText = 'flex:1;display:grid;grid-template-columns:280px 1fr 300px;overflow:hidden;';

  // Left sidebar: available containers
  const leftPanel = document.createElement('div');
  leftPanel.style.cssText = 'background:var(--surface);border-right:1px solid var(--border);overflow-y:auto;display:flex;flex-direction:column;';

  const leftTitle = document.createElement('div');
  leftTitle.style.cssText = 'padding:16px;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);border-bottom:1px solid var(--border);';
  leftTitle.textContent = 'Available Text Containers';
  leftPanel.appendChild(leftTitle);

  const leftSearch = document.createElement('input');
  leftSearch.type = 'text';
  leftSearch.placeholder = 'Filter containers...';
  leftSearch.style.cssText = 'margin:12px;font-size:0.8rem;';
  leftSearch.addEventListener('input', () => renderLeftList());
  leftPanel.appendChild(leftSearch);

  const leftList = document.createElement('div');
  leftList.style.cssText = 'flex:1;overflow-y:auto;padding:0 12px 12px;';
  leftPanel.appendChild(leftList);

  body.appendChild(leftPanel);

  // Center: selected containers (reorderable)
  const centerPanel = document.createElement('div');
  centerPanel.style.cssText = 'overflow-y:auto;padding:24px;background:var(--bg);';

  const centerTitle = document.createElement('div');
  centerTitle.style.cssText = 'font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin-bottom:16px;';
  centerTitle.textContent = 'Document Structure';

  const centerList = document.createElement('div');
  centerList.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-height:200px;';

  centerPanel.appendChild(centerTitle);
  centerPanel.appendChild(centerList);
  body.appendChild(centerPanel);

  // Right sidebar: page settings
  const rightPanel = document.createElement('div');
  rightPanel.style.cssText = 'background:var(--surface);border-left:1px solid var(--border);overflow-y:auto;padding:16px;';

  const rightTitle = document.createElement('div');
  rightTitle.style.cssText = 'font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin-bottom:16px;';
  rightTitle.textContent = 'Page Settings';
  rightPanel.appendChild(rightTitle);

  // Orientation
  const orientGroup = createSettingGroup('Orientation');
  const orientSelect = document.createElement('select');
  orientSelect.style.fontSize = '0.85rem';
  ['portrait', 'landscape'].forEach(o => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o.charAt(0).toUpperCase() + o.slice(1);
    orientSelect.appendChild(opt);
  });
  orientSelect.addEventListener('change', () => { pageSettings.orientation = orientSelect.value; });
  orientGroup.appendChild(orientSelect);
  rightPanel.appendChild(orientGroup);

  // Margins
  const marginGroup = createSettingGroup('Margins (mm)');
  const marginGrid = document.createElement('div');
  marginGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
  ['top', 'right', 'bottom', 'left'].forEach(side => {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.className = 'text-xs text-secondary';
    label.textContent = side.charAt(0).toUpperCase() + side.slice(1);
    const input = document.createElement('input');
    input.type = 'number';
    input.value = 20;
    input.min = 0;
    input.max = 50;
    input.style.fontSize = '0.85rem';
    input.addEventListener('change', () => { pageSettings.margins[side] = parseInt(input.value) || 20; });
    wrap.appendChild(label);
    wrap.appendChild(input);
    marginGrid.appendChild(wrap);
  });
  marginGroup.appendChild(marginGrid);
  rightPanel.appendChild(marginGroup);

  // Header text
  const headerGroup = createSettingGroup('Header HTML (optional)');
  const headerTextarea = document.createElement('textarea');
  headerTextarea.rows = 3;
  headerTextarea.style.cssText = 'font-size:0.8rem;width:100%;resize:vertical;';
  headerTextarea.placeholder = '<div style="text-align:right">Company Name</div>';
  headerTextarea.addEventListener('input', () => { pageSettings.header = headerTextarea.value; });
  headerGroup.appendChild(headerTextarea);
  rightPanel.appendChild(headerGroup);

  // Footer text
  const footerGroup = createSettingGroup('Footer HTML (optional)');
  const footerTextarea = document.createElement('textarea');
  footerTextarea.rows = 3;
  footerTextarea.style.cssText = 'font-size:0.8rem;width:100%;resize:vertical;';
  footerTextarea.placeholder = '<div>Page {{page}} | Confidential</div>';
  footerTextarea.addEventListener('input', () => { pageSettings.footer = footerTextarea.value; });
  footerGroup.appendChild(footerTextarea);
  rightPanel.appendChild(footerGroup);

  // Description
  const descGroup = createSettingGroup('Description');
  const descInput = document.createElement('textarea');
  descInput.rows = 2;
  descInput.style.cssText = 'font-size:0.85rem;width:100%;resize:vertical;';
  descInput.placeholder = 'Optional description...';
  descGroup.appendChild(descInput);
  rightPanel.appendChild(descGroup);

  body.appendChild(rightPanel);
  root.appendChild(body);
  container.appendChild(root);

  // =========================================================================
  // Render helpers
  // =========================================================================

  function createSettingGroup(label) {
    const group = document.createElement('div');
    group.style.cssText = 'margin-bottom:16px;';
    const lbl = document.createElement('label');
    lbl.className = 'text-xs text-secondary';
    lbl.style.cssText = 'display:block;margin-bottom:6px;font-weight:500;';
    lbl.textContent = label;
    group.appendChild(lbl);
    return group;
  }

  function renderLeftList() {
    leftList.innerHTML = '';
    const filterText = leftSearch.value.toLowerCase();
    const usedIds = new Set(selectedContainerIds.map(c => c.containerId));

    // Group by category
    const byCategory = {};
    allContainers.forEach(tc => {
      if (filterText && !tc.name.toLowerCase().includes(filterText) && !(tc.category || '').toLowerCase().includes(filterText)) return;
      const cat = tc.category || 'body';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(tc);
    });

    Object.entries(byCategory).forEach(([cat, containers]) => {
      const catLabel = document.createElement('div');
      catLabel.style.cssText = `font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${CATEGORY_COLORS[cat] || '#6b7280'};margin:12px 0 6px;`;
      catLabel.textContent = cat;
      leftList.appendChild(catLabel);

      containers.forEach(tc => {
        const item = document.createElement('div');
        item.style.cssText = `padding:10px 12px;border-radius:8px;border:1px solid var(--border);margin-bottom:6px;cursor:pointer;transition:all 0.15s;background:var(--surface);${usedIds.has(tc.id) ? 'opacity:0.5;' : ''}`;
        item.addEventListener('mouseenter', () => { item.style.borderColor = 'var(--primary)'; item.style.background = 'var(--primary-light)'; });
        item.addEventListener('mouseleave', () => { item.style.borderColor = 'var(--border)'; item.style.background = 'var(--surface)'; });

        const name = document.createElement('div');
        name.style.cssText = 'font-size:0.85rem;font-weight:500;margin-bottom:4px;';
        name.textContent = tc.name;
        item.appendChild(name);

        const preview = document.createElement('div');
        preview.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);line-height:1.3;';
        const text = stripHtml(tc.content || '');
        preview.textContent = text.length > 80 ? text.substring(0, 80) + '...' : text || '(empty)';
        item.appendChild(preview);

        item.addEventListener('click', () => {
          addContainer(tc.id);
        });

        leftList.appendChild(item);
      });
    });

    if (leftList.children.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:20px;text-align:center;color:var(--text-secondary);font-size:0.85rem;';
      empty.textContent = allContainers.length === 0 ? 'No text containers created yet.' : 'No containers match the filter.';
      leftList.appendChild(empty);
    }
  }

  function renderCenterList() {
    centerList.innerHTML = '';

    if (selectedContainerIds.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:40px 20px;text-align:center;color:var(--text-secondary);font-size:0.9rem;border:2px dashed var(--border);border-radius:8px;';
      empty.innerHTML = 'Click containers from the left panel to add them here.';
      centerList.appendChild(empty);
      return;
    }

    selectedContainerIds.forEach((entry, index) => {
      const tc = allContainers.find(c => c.id === entry.containerId);
      if (!tc) return;

      const card = document.createElement('div');
      card.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;transition:border-color 0.15s;';
      card.draggable = true;

      card.addEventListener('dragstart', (e) => {
        dragIndex = index;
        card.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.style.opacity = '1';
        dragIndex = null;
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.style.borderColor = 'var(--primary)';
      });
      card.addEventListener('dragleave', () => {
        card.style.borderColor = 'var(--border)';
      });
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.style.borderColor = 'var(--border)';
        if (dragIndex !== null && dragIndex !== index) {
          const moved = selectedContainerIds.splice(dragIndex, 1)[0];
          selectedContainerIds.splice(index, 0, moved);
          reindex();
          renderCenterList();
          renderLeftList();
        }
      });

      // Card header
      const cardHeader = document.createElement('div');
      cardHeader.style.cssText = `padding:8px 12px;display:flex;align-items:center;gap:8px;background:${CATEGORY_COLORS[tc.category] || '#6b7280'}10;border-bottom:1px solid var(--border);cursor:grab;`;

      const dragHandle = document.createElement('span');
      dragHandle.style.cssText = 'color:var(--text-secondary);font-size:1rem;cursor:grab;';
      dragHandle.textContent = '\u2261';
      cardHeader.appendChild(dragHandle);

      const orderBadge = document.createElement('span');
      orderBadge.style.cssText = 'background:var(--bg);color:var(--text-secondary);font-size:0.7rem;padding:2px 6px;border-radius:4px;font-weight:600;';
      orderBadge.textContent = index + 1;
      cardHeader.appendChild(orderBadge);

      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = 'font-size:0.85rem;font-weight:500;flex:1;';
      nameSpan.textContent = tc.name;
      cardHeader.appendChild(nameSpan);

      const catBadge = document.createElement('span');
      catBadge.style.cssText = `font-size:0.65rem;padding:2px 6px;border-radius:4px;text-transform:uppercase;background:${CATEGORY_COLORS[tc.category] || '#6b7280'}20;color:${CATEGORY_COLORS[tc.category] || '#6b7280'};`;
      catBadge.textContent = tc.category || 'body';
      cardHeader.appendChild(catBadge);

      // Move up/down buttons
      if (index > 0) {
        const upBtn = document.createElement('button');
        upBtn.className = 'btn btn-ghost btn-sm';
        upBtn.style.cssText = 'padding:2px 6px;font-size:0.8rem;';
        upBtn.textContent = '\u25B2';
        upBtn.title = 'Move up';
        upBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tmp = selectedContainerIds[index];
          selectedContainerIds[index] = selectedContainerIds[index - 1];
          selectedContainerIds[index - 1] = tmp;
          reindex();
          renderCenterList();
        });
        cardHeader.appendChild(upBtn);
      }
      if (index < selectedContainerIds.length - 1) {
        const downBtn = document.createElement('button');
        downBtn.className = 'btn btn-ghost btn-sm';
        downBtn.style.cssText = 'padding:2px 6px;font-size:0.8rem;';
        downBtn.textContent = '\u25BC';
        downBtn.title = 'Move down';
        downBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tmp = selectedContainerIds[index];
          selectedContainerIds[index] = selectedContainerIds[index + 1];
          selectedContainerIds[index + 1] = tmp;
          reindex();
          renderCenterList();
        });
        cardHeader.appendChild(downBtn);
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn-ghost btn-sm';
      removeBtn.style.cssText = 'padding:2px 6px;color:var(--danger);';
      removeBtn.textContent = '\u00D7';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedContainerIds.splice(index, 1);
        reindex();
        renderCenterList();
        renderLeftList();
      });
      cardHeader.appendChild(removeBtn);

      card.appendChild(cardHeader);

      // Card body: content preview
      const cardBody = document.createElement('div');
      cardBody.style.cssText = 'padding:12px;font-size:0.8rem;color:var(--text-secondary);line-height:1.5;max-height:120px;overflow:hidden;';
      const sampleMap = getSampleVariableMap();
      cardBody.innerHTML = resolveVariables(tc.content || '<em>(empty)</em>', sampleMap, null);
      card.appendChild(cardBody);

      centerList.appendChild(card);
    });
  }

  function addContainer(containerId) {
    // Allow adding the same container multiple times
    selectedContainerIds.push({ containerId, order: selectedContainerIds.length });
    renderCenterList();
    renderLeftList();
  }

  function reindex() {
    selectedContainerIds.forEach((entry, i) => { entry.order = i; });
  }

  // =========================================================================
  // Save
  // =========================================================================
  async function handleSave() {
    const name = titleInput.value.trim();
    if (!name) { showToast('Template name is required', 'warning'); return; }

    try {
      await pb.collection('document_templates').update(templateId, {
        name,
        description: descInput.value || '',
        containers: selectedContainerIds,
        page_settings: pageSettings,
      });
      showToast('Template saved', 'success');
    } catch (err) {
      showToast('Failed to save: ' + (err.message || 'Unknown'), 'error');
    }
  }

  // =========================================================================
  // Load data
  // =========================================================================
  async function loadData() {
    try {
      const [tpl, containers] = await Promise.all([
        pb.collection('document_templates').getOne(templateId),
        pb.collection('text_containers').getFullList({ sort: 'category,name' }),
      ]);

      template = tpl;
      allContainers = containers;
      selectedContainerIds = Array.isArray(tpl.containers) ? tpl.containers : [];
      pageSettings = tpl.page_settings || pageSettings;

      // Populate fields
      titleInput.value = tpl.name || '';
      descInput.value = tpl.description || '';
      orientSelect.value = pageSettings.orientation || 'portrait';
      headerTextarea.value = pageSettings.header || '';
      footerTextarea.value = pageSettings.footer || '';

      // Populate margin inputs
      const marginInputs = marginGrid.querySelectorAll('input');
      const sides = ['top', 'right', 'bottom', 'left'];
      marginInputs.forEach((inp, i) => {
        inp.value = pageSettings.margins?.[sides[i]] || 20;
      });

      renderLeftList();
      renderCenterList();
    } catch (err) {
      console.error('Failed to load template builder data:', err);
      showToast('Failed to load template', 'error');
    }
  }

  loadData();

  return {
    destroy() {
      destroyed = true;
      container.innerHTML = '';
    },
  };
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}
