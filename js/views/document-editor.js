// Document Editor View
// Unified document editor with live A4 preview, inline Quill editing,
// variable insertion, template save/load, and PDF export.
// Routes: /documents (new), /documents/:templateId (edit existing)

import { pb } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { getAvailableVariables, getSampleVariableMap, buildVariableMap, resolveVariables } from '../lib/variable-resolver.js';
import { generatePdf } from '../lib/pdf-engine.js';

/**
 * Create the unified document editor view.
 * @param {HTMLElement} container
 * @param {Object} [opts]
 * @param {string} [opts.templateId] - Existing template to load
 */
export function createDocumentEditorView(container, opts = {}) {
  container.innerHTML = '';

  const templateId = opts.templateId || null;

  // Parse query params for opportunity/quote context
  const hashParts = window.location.hash.split('?');
  const qp = new URLSearchParams(hashParts[1] || '');
  const opportunityId = qp.get('opportunityId');
  const quoteId = qp.get('quoteId');

  // State
  let docName = 'Untitled Document';
  let blocks = []; // [{content: 'html', order: 0}]
  let pageSettings = { margins: { top: 20, right: 20, bottom: 20, left: 20 }, orientation: 'portrait', headerHtml: '', footerHtml: '' };
  let currentTemplateId = templateId;
  let activeQuillIndex = null; // index of block currently being edited
  let quillInstance = null;
  let opportunity = null;
  let customer = null;
  let quote = null;
  let quoteData = null;
  let variableMap = {};
  let destroyed = false;
  let loadTemplateBackdrop = null;

  // =========================================================================
  // Root layout
  // =========================================================================
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;';

  // -- Header bar --
  const header = document.createElement('header');
  header.style.cssText = 'background:var(--surface);border-bottom:1px solid var(--border);padding:0.5rem 1.5rem;display:flex;align-items:center;gap:12px;flex-shrink:0;';

  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary';
  backBtn.style.cssText = 'padding:6px 10px;';
  backBtn.innerHTML = '&larr;';
  backBtn.addEventListener('click', () => {
    if (opportunityId && quoteId) {
      navigate(`/opportunities/${opportunityId}/quotes/${quoteId}`);
    } else {
      navigate('/dashboard');
    }
  });
  header.appendChild(backBtn);

  const nameInput = document.createElement('input');
  nameInput.style.cssText = 'font-size:1rem;font-weight:600;border:none;background:transparent;color:var(--text-main);outline:none;flex:1;min-width:120px;padding:4px 8px;border-radius:4px;';
  nameInput.placeholder = 'Document name...';
  nameInput.value = docName;
  nameInput.addEventListener('focus', () => { nameInput.style.background = 'var(--bg)'; });
  nameInput.addEventListener('blur', () => { nameInput.style.background = 'transparent'; docName = nameInput.value.trim() || 'Untitled Document'; });
  header.appendChild(nameInput);

  // Toolbar buttons
  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:auto;';

  // Variable dropdown
  const varWrap = document.createElement('div');
  varWrap.style.cssText = 'position:relative;';
  const varBtn = document.createElement('button');
  varBtn.className = 'btn btn-secondary btn-sm';
  varBtn.textContent = 'Insert Variable';
  varBtn.addEventListener('click', () => toggleVarDropdown());
  varWrap.appendChild(varBtn);

  const varDropdown = document.createElement('div');
  varDropdown.style.cssText = 'display:none;position:absolute;right:0;top:100%;margin-top:4px;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);z-index:60;width:280px;max-height:360px;overflow-y:auto;padding:8px;';
  buildVarDropdownContent(varDropdown);
  varWrap.appendChild(varDropdown);
  toolbar.appendChild(varWrap);

  // Load Template
  const loadBtn = document.createElement('button');
  loadBtn.className = 'btn btn-secondary btn-sm';
  loadBtn.textContent = 'Load Template';
  loadBtn.addEventListener('click', openLoadTemplateModal);
  toolbar.appendChild(loadBtn);

  // Save
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-secondary btn-sm';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', handleSave);
  toolbar.appendChild(saveBtn);

  // Export PDF
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-primary btn-sm';
  exportBtn.textContent = 'Export PDF';
  exportBtn.addEventListener('click', handleExport);
  toolbar.appendChild(exportBtn);

  header.appendChild(toolbar);
  root.appendChild(header);

  // -- Context banner (when coming from configurator) --
  const contextBanner = document.createElement('div');
  contextBanner.style.cssText = 'display:none;background:var(--primary-light);padding:8px 1.5rem;font-size:0.8rem;color:var(--primary);border-bottom:1px solid var(--border);';
  root.appendChild(contextBanner);

  // -- Main area: gray background with A4 page --
  const mainArea = document.createElement('div');
  mainArea.style.cssText = 'flex:1;overflow-y:auto;background:var(--bg);';

  const pageWrap = document.createElement('div');
  pageWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:32px 16px;min-height:100%;';

  const page = document.createElement('div');
  page.className = 'doc-editor-page';

  pageWrap.appendChild(page);
  mainArea.appendChild(pageWrap);
  root.appendChild(mainArea);

  container.appendChild(root);

  // Inject styles
  ensureEditorStyles();

  // =========================================================================
  // Variable dropdown
  // =========================================================================
  function buildVarDropdownContent(dd) {
    const groups = getAvailableVariables();
    groups.forEach(group => {
      const groupLabel = document.createElement('div');
      groupLabel.style.cssText = 'font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);padding:6px 8px 2px;';
      groupLabel.textContent = group.group;
      dd.appendChild(groupLabel);

      group.vars.forEach(v => {
        const item = document.createElement('button');
        item.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 8px;border:none;background:transparent;cursor:pointer;border-radius:4px;font-size:0.8rem;transition:background 0.1s;';
        item.addEventListener('mouseenter', () => { item.style.background = 'var(--bg)'; });
        item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });

        const label = document.createElement('span');
        label.textContent = v.label;
        item.appendChild(label);

        const key = document.createElement('span');
        key.style.cssText = 'float:right;color:var(--text-secondary);font-size:0.7rem;font-family:monospace;';
        key.textContent = `{{${v.key}}}`;
        item.appendChild(key);

        item.addEventListener('click', () => {
          insertVariable(v.key);
          varDropdown.style.display = 'none';
        });
        dd.appendChild(item);
      });
    });
  }

  let varDropdownOpen = false;
  function toggleVarDropdown() {
    varDropdownOpen = !varDropdownOpen;
    varDropdown.style.display = varDropdownOpen ? 'block' : 'none';
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (varDropdownOpen && !varWrap.contains(e.target)) {
      varDropdownOpen = false;
      varDropdown.style.display = 'none';
    }
  });

  function insertVariable(key) {
    if (activeQuillIndex !== null && quillInstance) {
      const range = quillInstance.getSelection(true);
      const text = `{{${key}}}`;
      quillInstance.insertText(range.index, text);
      quillInstance.setSelection(range.index + text.length);
    } else {
      showToast('Click on a text block first to insert a variable', 'warning');
    }
  }

  // =========================================================================
  // Render the A4 page with blocks
  // =========================================================================
  function renderPage() {
    page.innerHTML = '';

    const margins = pageSettings.margins || { top: 20, right: 20, bottom: 20, left: 20 };
    page.style.cssText = `
      width:210mm;min-height:297mm;background:white;box-shadow:0 4px 24px rgba(0,0,0,0.12);
      padding:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
      box-sizing:border-box;color:#111827;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
      font-size:11pt;line-height:1.6;position:relative;margin-bottom:32px;
    `;

    // Header HTML
    if (pageSettings.headerHtml) {
      const hdr = document.createElement('div');
      hdr.style.cssText = 'margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;';
      hdr.innerHTML = pageSettings.headerHtml;
      page.appendChild(hdr);
    }

    // Content blocks
    blocks.forEach((block, index) => {
      // "+" button between blocks
      if (index > 0) {
        page.appendChild(createAddButton(index));
      }

      const blockEl = createBlockElement(block, index);
      page.appendChild(blockEl);
    });

    // "+" button at the bottom
    page.appendChild(createAddButton(blocks.length));

    // Footer HTML
    if (pageSettings.footerHtml) {
      const ftr = document.createElement('div');
      ftr.style.cssText = 'margin-top:auto;padding-top:8px;border-top:1px solid #e5e7eb;font-size:9pt;color:#6b7280;';
      ftr.innerHTML = pageSettings.footerHtml;
      page.appendChild(ftr);
    }
  }

  function createAddButton(insertIndex) {
    const wrap = document.createElement('div');
    wrap.className = 'doc-add-btn-wrap';

    const btn = document.createElement('button');
    btn.className = 'doc-add-btn';
    btn.textContent = '+';
    btn.title = 'Add text block';
    btn.addEventListener('click', () => {
      addBlockAt(insertIndex);
    });
    wrap.appendChild(btn);
    return wrap;
  }

  function createBlockElement(block, index) {
    const wrap = document.createElement('div');
    wrap.className = 'doc-block';
    wrap.draggable = true;

    // Drag handlers
    wrap.addEventListener('dragstart', (e) => {
      wrap.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    });
    wrap.addEventListener('dragend', () => {
      wrap.classList.remove('dragging');
    });
    wrap.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      wrap.classList.add('drag-over');
    });
    wrap.addEventListener('dragleave', () => {
      wrap.classList.remove('drag-over');
    });
    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      wrap.classList.remove('drag-over');
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!isNaN(fromIndex) && fromIndex !== index) {
        const moved = blocks.splice(fromIndex, 1)[0];
        blocks.splice(fromIndex < index ? index - 1 : index, 0, moved);
        reorderBlocks();
        closeQuillEditor();
        renderPage();
      }
    });

    // Controls overlay
    const controls = document.createElement('div');
    controls.className = 'doc-block-controls';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'doc-block-handle';
    dragHandle.textContent = '\u2261';
    dragHandle.title = 'Drag to reorder';
    controls.appendChild(dragHandle);

    const editBtn = document.createElement('button');
    editBtn.className = 'doc-block-ctrl-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openQuillEditor(index);
    });
    controls.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'doc-block-ctrl-btn danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      blocks.splice(index, 1);
      reorderBlocks();
      if (activeQuillIndex === index) closeQuillEditor();
      renderPage();
    });
    controls.appendChild(delBtn);

    wrap.appendChild(controls);

    // Content area
    const content = document.createElement('div');
    content.className = 'doc-block-content';
    content.innerHTML = block.content || '<p><br></p>';
    wrap.appendChild(content);

    // Click to edit
    content.addEventListener('click', () => {
      openQuillEditor(index);
    });

    return wrap;
  }

  // =========================================================================
  // Quill inline editing
  // =========================================================================
  function openQuillEditor(index) {
    if (activeQuillIndex === index) return; // already editing this block

    // Close any existing editor first and save its content
    closeQuillEditor();

    activeQuillIndex = index;

    // Re-render to show Quill on the selected block
    renderPage();

    // Find the block element and replace content with Quill
    const blockEls = page.querySelectorAll('.doc-block');
    const blockEl = blockEls[index];
    if (!blockEl) return;

    blockEl.classList.add('editing');
    const contentEl = blockEl.querySelector('.doc-block-content');
    if (!contentEl) return;

    // Clear and create Quill container
    const savedHtml = blocks[index].content || '<p><br></p>';
    contentEl.innerHTML = '';

    const editorEl = document.createElement('div');
    editorEl.style.cssText = 'min-height:60px;';
    contentEl.appendChild(editorEl);

    if (typeof window.Quill === 'undefined') {
      contentEl.innerHTML = '<p style="color:red;">Quill.js not loaded</p>';
      return;
    }

    quillInstance = new window.Quill(editorEl, {
      theme: 'snow',
      placeholder: 'Type your content here...',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ align: [] }],
          ['blockquote'],
          ['link', 'image'],
          ['clean'],
        ],
      },
    });

    quillInstance.root.innerHTML = savedHtml;

    // Auto-save on text change
    quillInstance.on('text-change', () => {
      if (activeQuillIndex !== null && blocks[activeQuillIndex]) {
        blocks[activeQuillIndex].content = quillInstance.root.innerHTML;
      }
    });

    // Focus
    quillInstance.focus();
  }

  function closeQuillEditor() {
    if (quillInstance && activeQuillIndex !== null && blocks[activeQuillIndex]) {
      blocks[activeQuillIndex].content = quillInstance.root.innerHTML;
    }
    quillInstance = null;
    activeQuillIndex = null;
  }

  // =========================================================================
  // Block management
  // =========================================================================
  function addBlockAt(index) {
    closeQuillEditor();
    const newBlock = { content: '<p><br></p>', order: index };
    blocks.splice(index, 0, newBlock);
    reorderBlocks();
    renderPage();
    // Open editor on the new block
    openQuillEditor(index);
  }

  function reorderBlocks() {
    blocks.forEach((b, i) => { b.order = i; });
  }

  // =========================================================================
  // Save template
  // =========================================================================
  async function handleSave() {
    const name = nameInput.value.trim();
    if (!name) {
      showToast('Please enter a document name', 'warning');
      nameInput.focus();
      return;
    }

    closeQuillEditor();

    const data = {
      name,
      description: '',
      containers: blocks.map((b, i) => ({ content: b.content, order: i })),
      page_settings: pageSettings,
    };

    try {
      if (currentTemplateId) {
        await pb.collection('document_templates').update(currentTemplateId, data);
        showToast('Document saved', 'success');
      } else {
        const res = await pb.collection('document_templates').create(data);
        currentTemplateId = res.id;
        showToast('Document created', 'success');
        // Update URL without full reload
        window.location.hash = `#/documents/${res.id}`;
      }
    } catch (err) {
      showToast('Failed to save: ' + (err.message || 'Unknown error'), 'error');
    }
  }

  // =========================================================================
  // Load template modal
  // =========================================================================
  async function openLoadTemplateModal() {
    closeLoadTemplateModal();

    let templates = [];
    try {
      templates = await pb.collection('document_templates').getFullList({ sort: '-updated' });
    } catch (err) {
      showToast('Failed to load templates', 'error');
      return;
    }

    loadTemplateBackdrop = document.createElement('div');
    loadTemplateBackdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;display:flex;align-items:center;justify-content:center;';
    loadTemplateBackdrop.addEventListener('click', (e) => {
      if (e.target === loadTemplateBackdrop) closeLoadTemplateModal();
    });

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'width:90%;max-width:600px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;';
    card.addEventListener('click', (e) => e.stopPropagation());

    // Modal header
    const mHeader = document.createElement('div');
    mHeader.style.cssText = 'padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;';
    const mTitle = document.createElement('h3');
    mTitle.style.margin = '0';
    mTitle.textContent = 'Load Template';
    mHeader.appendChild(mTitle);
    const mClose = document.createElement('button');
    mClose.className = 'btn btn-ghost';
    mClose.innerHTML = '&times;';
    mClose.style.cssText = 'font-size:1.5rem;padding:4px 10px;line-height:1;';
    mClose.addEventListener('click', closeLoadTemplateModal);
    mHeader.appendChild(mClose);
    card.appendChild(mHeader);

    // Template list
    const listWrap = document.createElement('div');
    listWrap.style.cssText = 'flex:1;overflow-y:auto;padding:12px;';

    if (templates.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:32px;text-align:center;color:var(--text-secondary);';
      empty.textContent = 'No saved templates yet.';
      listWrap.appendChild(empty);
    } else {
      templates.forEach(tpl => {
        const item = document.createElement('div');
        item.style.cssText = 'padding:12px 16px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.15s;';
        item.addEventListener('mouseenter', () => { item.style.borderColor = 'var(--primary)'; item.style.background = 'var(--primary-light)'; });
        item.addEventListener('mouseleave', () => { item.style.borderColor = 'var(--border)'; item.style.background = 'transparent'; });

        const name = document.createElement('div');
        name.style.cssText = 'font-weight:600;margin-bottom:2px;';
        name.textContent = tpl.name;
        item.appendChild(name);

        const meta = document.createElement('div');
        meta.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);';
        const containerCount = Array.isArray(tpl.containers) ? tpl.containers.length : 0;
        meta.textContent = `${containerCount} block${containerCount !== 1 ? 's' : ''} · Updated ${new Date(tpl.updated).toLocaleDateString('de-DE')}`;
        item.appendChild(meta);

        if (tpl.description) {
          const desc = document.createElement('div');
          desc.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);margin-top:4px;';
          desc.textContent = tpl.description;
          item.appendChild(desc);
        }

        item.addEventListener('click', () => {
          loadTemplate(tpl);
          closeLoadTemplateModal();
        });

        listWrap.appendChild(item);
      });
    }

    card.appendChild(listWrap);
    loadTemplateBackdrop.appendChild(card);
    document.body.appendChild(loadTemplateBackdrop);
  }

  function closeLoadTemplateModal() {
    if (loadTemplateBackdrop && loadTemplateBackdrop.parentNode) {
      loadTemplateBackdrop.parentNode.removeChild(loadTemplateBackdrop);
    }
    loadTemplateBackdrop = null;
  }

  function loadTemplate(tpl) {
    closeQuillEditor();
    currentTemplateId = tpl.id;
    docName = tpl.name;
    nameInput.value = docName;
    pageSettings = tpl.page_settings || pageSettings;

    // Normalize page_settings field names
    if (pageSettings.header && !pageSettings.headerHtml) pageSettings.headerHtml = pageSettings.header;
    if (pageSettings.footer && !pageSettings.footerHtml) pageSettings.footerHtml = pageSettings.footer;

    const containers = Array.isArray(tpl.containers) ? tpl.containers : [];
    blocks = containers
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((c, i) => ({ content: c.content || '', order: i }));

    renderPage();
    showToast(`Loaded "${tpl.name}"`, 'success');
  }

  // =========================================================================
  // PDF Export
  // =========================================================================
  async function handleExport() {
    closeQuillEditor();

    // Resolve variables in blocks
    const resolvedBlocks = blocks.map(b => {
      let html = b.content || '';
      if (Object.keys(variableMap).length > 0) {
        html = resolveVariables(html, variableMap, quoteData);
      }
      return { html };
    });

    // Also resolve header/footer
    const resolvedPageSettings = {
      margins: pageSettings.margins,
      orientation: pageSettings.orientation,
      headerHtml: pageSettings.headerHtml ? resolveVariables(pageSettings.headerHtml, variableMap, quoteData) : '',
      footerHtml: pageSettings.footerHtml ? resolveVariables(pageSettings.footerHtml, variableMap, quoteData) : '',
    };

    const filename = [
      opportunity?.title || docName || 'Document',
      quote?.name || '',
      new Date().toLocaleDateString('de-DE').replace(/\./g, '-'),
    ].filter(Boolean).join('_') + '.pdf';

    try {
      showToast('Generating PDF...', 'info');
      await generatePdf({
        blocks: resolvedBlocks,
        pageSettings: resolvedPageSettings,
        filename,
      });
      showToast('PDF exported successfully', 'success');
    } catch (err) {
      console.error('PDF generation failed:', err);
      showToast('PDF generation failed: ' + (err.message || 'Unknown'), 'error');
    }
  }

  // =========================================================================
  // Load initial data
  // =========================================================================
  async function loadData() {
    try {
      // Load opportunity/quote context if provided
      if (opportunityId) {
        try {
          opportunity = await pb.collection('opportunities').getOne(opportunityId, { expand: 'customer' });
          if (opportunity.expand?.customer) customer = opportunity.expand.customer;
        } catch (err) {
          console.error('Failed to load opportunity:', err);
        }
      }

      if (quoteId) {
        try {
          quote = await pb.collection('quotes').getOne(quoteId, { expand: 'created_by' });
          quoteData = quote.quote_data || null;
        } catch (err) {
          console.error('Failed to load quote:', err);
        }
      }

      // Build variable map
      const user = pb.authStore.model;
      if (opportunity || customer || quote || quoteData) {
        variableMap = buildVariableMap({ opportunity, customer, quote, quoteData, user });
      } else {
        variableMap = getSampleVariableMap();
      }

      // Show context banner
      if (opportunity || quote) {
        const parts = [];
        if (customer) parts.push(`Customer: ${customer.name}`);
        if (opportunity) parts.push(`Opportunity: ${opportunity.title}`);
        if (quote) parts.push(`Quote: ${quote.name || quote.id?.substring(0, 8)}`);
        contextBanner.textContent = 'Generating document for: ' + parts.join(' · ');
        contextBanner.style.display = 'block';
      }

      // Load existing template if templateId provided
      if (templateId) {
        try {
          const tpl = await pb.collection('document_templates').getOne(templateId);
          loadTemplate(tpl);
          return; // loadTemplate calls renderPage
        } catch (err) {
          console.error('Failed to load template:', err);
          showToast('Failed to load template', 'error');
        }
      }

      renderPage();
    } catch (err) {
      console.error('Failed to load document editor data:', err);
    }
  }

  loadData();

  // =========================================================================
  // Cleanup
  // =========================================================================
  return {
    destroy() {
      destroyed = true;
      closeQuillEditor();
      closeLoadTemplateModal();
      container.innerHTML = '';
    },
  };
}

// ===========================================================================
// Scoped styles
// ===========================================================================
function ensureEditorStyles() {
  if (document.getElementById('doc-editor-styles')) return;
  const style = document.createElement('style');
  style.id = 'doc-editor-styles';
  style.textContent = `
    .doc-editor-page {
      transition: padding 0.2s;
    }

    /* Add block button */
    .doc-add-btn-wrap {
      display: flex;
      justify-content: center;
      padding: 4px 0;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .doc-add-btn-wrap:hover,
    .doc-editor-page .doc-add-btn-wrap:only-child {
      opacity: 1;
    }
    .doc-add-btn {
      background: transparent;
      border: 2px dashed var(--border, #d1d5db);
      color: var(--text-secondary, #6b7280);
      border-radius: 50%;
      width: 28px;
      height: 28px;
      cursor: pointer;
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      line-height: 1;
    }
    .doc-add-btn:hover {
      border-color: var(--primary, #6366f1);
      color: var(--primary, #6366f1);
      background: #6366f110;
    }

    /* Document block */
    .doc-block {
      position: relative;
      border: 1px solid transparent;
      border-radius: 4px;
      transition: border-color 0.15s, box-shadow 0.15s;
      margin-bottom: 4px;
      cursor: pointer;
    }
    .doc-block:hover {
      border-color: #d1d5db;
    }
    .doc-block.editing {
      border-color: var(--primary, #6366f1);
      box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
      cursor: default;
    }
    .doc-block.dragging {
      opacity: 0.4;
    }
    .doc-block.drag-over {
      border-color: var(--primary, #6366f1);
      border-style: dashed;
    }

    /* Block controls */
    .doc-block-controls {
      position: absolute;
      top: -14px;
      right: 4px;
      display: none;
      gap: 4px;
      z-index: 5;
      align-items: center;
    }
    .doc-block:hover .doc-block-controls {
      display: flex;
    }
    .doc-block.editing .doc-block-controls {
      display: flex;
    }
    .doc-block-handle {
      cursor: grab;
      color: #9ca3af;
      font-size: 1.2rem;
      padding: 0 4px;
      user-select: none;
    }
    .doc-block-ctrl-btn {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 1px 8px;
      font-size: 0.65rem;
      cursor: pointer;
      color: var(--primary, #6366f1);
      transition: all 0.1s;
    }
    .doc-block-ctrl-btn:hover {
      background: #f3f4f6;
    }
    .doc-block-ctrl-btn.danger {
      color: var(--danger, #ef4444);
    }

    /* Block content */
    .doc-block-content {
      padding: 4px 8px;
      min-height: 24px;
    }
    .doc-block-content p {
      margin: 0 0 0.5em;
    }

    /* Quill overrides inside the page */
    .doc-block .ql-toolbar {
      border-radius: 4px 4px 0 0;
      background: #f9fafb;
      border-color: #e5e7eb !important;
    }
    .doc-block .ql-container {
      border-color: #e5e7eb !important;
      border-radius: 0 0 4px 4px;
      font-family: inherit;
      font-size: inherit;
    }
    .doc-block .ql-editor {
      min-height: 60px;
      padding: 8px 12px;
    }

    /* Make the "only add button" always visible (empty document) */
    .doc-editor-page > .doc-add-btn-wrap:first-child:last-child {
      opacity: 1;
      padding: 40px 0;
    }
  `;
  document.head.appendChild(style);
}
