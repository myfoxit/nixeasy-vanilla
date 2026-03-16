// PDF Generator View
// Generates pre-filled PDFs from quotes/opportunities with live editable preview
// Route: /pdf-generator?opportunityId=xxx&quoteId=xxx

import { pb } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { buildVariableMap, resolveVariables } from '../lib/variable-resolver.js';
import { generatePdf, createPdfPreview } from '../lib/pdf-engine.js';

/**
 * Create the PDF generator view.
 * @param {HTMLElement} container
 */
export function createPdfGeneratorView(container) {
  container.innerHTML = '';

  // Parse query params from hash
  const hashParts = window.location.hash.split('?');
  const params = new URLSearchParams(hashParts[1] || '');
  const opportunityId = params.get('opportunityId');
  const quoteId = params.get('quoteId');

  let templates = [];
  let selectedTemplate = null;
  let opportunity = null;
  let customer = null;
  let quote = null;
  let quoteData = null;
  let variableMap = {};
  let contentBlocks = []; // resolved blocks: { id, name, html, editable }
  let pageSettings = {};
  let step = 'select'; // 'select' | 'preview'
  let destroyed = false;

  // Root
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
  backBtn.addEventListener('click', () => {
    if (step === 'preview') {
      step = 'select';
      renderBody();
    } else if (opportunityId && quoteId) {
      navigate(`/opportunities/${opportunityId}/quotes/${quoteId}`);
    } else {
      navigate('/document-templates');
    }
  });
  header.appendChild(backBtn);

  const titleEl = document.createElement('h2');
  titleEl.style.cssText = 'font-size:1.1rem;margin:0;';
  titleEl.textContent = 'PDF Generator';
  header.appendChild(titleEl);

  const headerRight = document.createElement('div');
  headerRight.style.cssText = 'display:flex;gap:8px;margin-left:auto;';
  header.appendChild(headerRight);

  root.appendChild(header);

  // Body container
  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow-y:auto;';
  root.appendChild(body);

  container.appendChild(root);

  // =========================================================================
  // Render functions
  // =========================================================================

  function renderBody() {
    body.innerHTML = '';
    headerRight.innerHTML = '';

    if (step === 'select') {
      renderTemplateSelector();
    } else {
      renderPreview();
    }
  }

  function renderTemplateSelector() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'max-width:800px;margin:0 auto;padding:32px;';

    // Context info
    if (opportunity || quote) {
      const ctx = document.createElement('div');
      ctx.className = 'card';
      ctx.style.cssText = 'padding:16px;margin-bottom:24px;';

      const ctxTitle = document.createElement('div');
      ctxTitle.style.cssText = 'font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin-bottom:8px;';
      ctxTitle.textContent = 'Generating PDF for';
      ctx.appendChild(ctxTitle);

      const ctxInfo = document.createElement('div');
      ctxInfo.style.cssText = 'display:flex;gap:24px;flex-wrap:wrap;';

      if (customer) {
        ctxInfo.appendChild(createInfoPill('Customer', customer.name));
      }
      if (opportunity) {
        ctxInfo.appendChild(createInfoPill('Opportunity', opportunity.title));
      }
      if (quote) {
        ctxInfo.appendChild(createInfoPill('Quote', quote.name || `#${quote.id?.substring(0, 8)}`));
      }

      ctx.appendChild(ctxInfo);
      wrap.appendChild(ctx);
    }

    // Template selection
    const sectionTitle = document.createElement('h3');
    sectionTitle.style.cssText = 'margin-bottom:16px;font-size:1rem;';
    sectionTitle.textContent = 'Select a Document Template';
    wrap.appendChild(sectionTitle);

    if (templates.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'card';
      empty.style.cssText = 'padding:32px;text-align:center;color:var(--text-secondary);';
      empty.innerHTML = 'No document templates found.<br><a href="#/document-templates" style="color:var(--primary);">Create one first</a>';
      wrap.appendChild(empty);
    } else {
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;';

      templates.forEach(tpl => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'padding:20px;cursor:pointer;transition:all 0.15s;border:2px solid transparent;';
        card.addEventListener('mouseenter', () => { card.style.borderColor = 'var(--primary)'; card.style.transform = 'translateY(-2px)'; });
        card.addEventListener('mouseleave', () => { card.style.borderColor = 'transparent'; card.style.transform = 'none'; });

        const name = document.createElement('div');
        name.style.cssText = 'font-weight:600;margin-bottom:4px;';
        name.textContent = tpl.name;
        card.appendChild(name);

        if (tpl.description) {
          const desc = document.createElement('div');
          desc.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);margin-bottom:8px;';
          desc.textContent = tpl.description;
          card.appendChild(desc);
        }

        const meta = document.createElement('div');
        meta.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);';
        const containers = tpl.containers || [];
        meta.textContent = `${containers.length} container${containers.length !== 1 ? 's' : ''}`;
        card.appendChild(meta);

        card.addEventListener('click', () => selectTemplate(tpl));
        grid.appendChild(card);
      });

      wrap.appendChild(grid);
    }

    body.appendChild(wrap);
  }

  function renderPreview() {
    // Header buttons
    const addBlockBtn = document.createElement('button');
    addBlockBtn.className = 'btn btn-secondary btn-sm';
    addBlockBtn.textContent = '+ Add Text Block';
    addBlockBtn.addEventListener('click', addFreeTextBlock);
    headerRight.appendChild(addBlockBtn);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-primary btn-sm';
    exportBtn.textContent = 'Export PDF';
    exportBtn.addEventListener('click', handleExport);
    headerRight.appendChild(exportBtn);

    // Preview area
    const previewWrap = document.createElement('div');
    previewWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px;background:var(--bg);min-height:100%;';

    // Render page
    const page = document.createElement('div');
    page.className = 'pdf-page';
    const margins = pageSettings.margins || { top: 20, right: 20, bottom: 20, left: 20 };
    page.style.cssText = `
      width:210mm;min-height:297mm;background:white;box-shadow:0 4px 24px rgba(0,0,0,0.12);
      padding:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
      box-sizing:border-box;color:#111827;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
      font-size:11pt;line-height:1.6;position:relative;
    `;

    // Header
    if (pageSettings.header) {
      const hdr = document.createElement('div');
      hdr.style.cssText = 'margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;';
      hdr.innerHTML = pageSettings.header;
      page.appendChild(hdr);
    }

    // Content blocks
    contentBlocks.forEach((block, index) => {
      // Insert "+" button between blocks
      if (index > 0) {
        const addBetween = document.createElement('div');
        addBetween.style.cssText = 'display:flex;justify-content:center;padding:4px 0;';
        const addBtn = document.createElement('button');
        addBtn.style.cssText = 'background:var(--primary-light);border:1px dashed var(--primary);color:var(--primary);border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.15s;';
        addBtn.textContent = '+';
        addBetween.addEventListener('mouseenter', () => { addBtn.style.opacity = '1'; });
        addBetween.addEventListener('mouseleave', () => { addBtn.style.opacity = '0'; });
        addBtn.addEventListener('click', () => insertFreeTextBlockAt(index));
        addBetween.appendChild(addBtn);
        page.appendChild(addBetween);
      }

      const blockWrap = document.createElement('div');
      blockWrap.style.cssText = 'margin-bottom:8px;position:relative;border:1px solid transparent;border-radius:4px;transition:border-color 0.15s;';

      // Hover controls
      const controls = document.createElement('div');
      controls.style.cssText = 'position:absolute;top:-12px;right:0;display:none;gap:4px;z-index:5;';

      const editBtn = document.createElement('button');
      editBtn.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:0.7rem;cursor:pointer;color:var(--primary);';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => toggleEdit(blockWrap, block, index));
      controls.appendChild(editBtn);

      const removeBtn = document.createElement('button');
      removeBtn.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:0.7rem;cursor:pointer;color:var(--danger);';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        contentBlocks.splice(index, 1);
        renderPreview();
      });
      controls.appendChild(removeBtn);

      blockWrap.appendChild(controls);
      blockWrap.addEventListener('mouseenter', () => {
        blockWrap.style.borderColor = 'var(--primary)';
        controls.style.display = 'flex';
      });
      blockWrap.addEventListener('mouseleave', () => {
        blockWrap.style.borderColor = 'transparent';
        controls.style.display = 'none';
      });

      // Content
      const contentEl = document.createElement('div');
      contentEl.style.cssText = 'padding:4px;';
      contentEl.innerHTML = block.html;
      blockWrap.appendChild(contentEl);

      // Block name label
      if (block.name) {
        const label = document.createElement('div');
        label.style.cssText = 'position:absolute;top:-10px;left:8px;background:var(--surface);padding:0 4px;font-size:0.6rem;color:var(--text-secondary);border-radius:2px;display:none;';
        label.textContent = block.name;
        blockWrap.appendChild(label);
        blockWrap.addEventListener('mouseenter', () => { label.style.display = 'block'; });
        blockWrap.addEventListener('mouseleave', () => { label.style.display = 'none'; });
      }

      page.appendChild(blockWrap);
    });

    // Footer
    if (pageSettings.footer) {
      const ftr = document.createElement('div');
      ftr.style.cssText = 'margin-top:auto;padding-top:8px;border-top:1px solid #e5e7eb;font-size:9pt;color:#6b7280;';
      ftr.innerHTML = pageSettings.footer;
      page.appendChild(ftr);
    }

    previewWrap.appendChild(page);
    body.appendChild(previewWrap);
  }

  function toggleEdit(blockWrap, block, index) {
    const contentEl = blockWrap.querySelector('div[style*="padding:4px"]');
    if (!contentEl) return;

    // Check if already in edit mode
    if (contentEl.contentEditable === 'true') {
      // Save changes
      block.html = contentEl.innerHTML;
      contentEl.contentEditable = 'false';
      contentEl.style.outline = 'none';
      contentEl.style.background = 'transparent';
      return;
    }

    // Enter edit mode
    contentEl.contentEditable = 'true';
    contentEl.style.outline = '2px solid var(--primary)';
    contentEl.style.background = '#fefce8';
    contentEl.style.borderRadius = '4px';
    contentEl.focus();

    contentEl.addEventListener('blur', () => {
      block.html = contentEl.innerHTML;
      contentEl.contentEditable = 'false';
      contentEl.style.outline = 'none';
      contentEl.style.background = 'transparent';
    }, { once: true });
  }

  function addFreeTextBlock() {
    contentBlocks.push({
      id: null,
      name: 'Free Text',
      html: '<p>Enter your text here...</p>',
      editable: true,
    });
    renderPreview();
  }

  function insertFreeTextBlockAt(index) {
    contentBlocks.splice(index, 0, {
      id: null,
      name: 'Free Text',
      html: '<p>Enter your text here...</p>',
      editable: true,
    });
    renderPreview();
  }

  function createInfoPill(label, value) {
    const pill = document.createElement('div');
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);display:block;';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.style.cssText = 'font-size:0.9rem;font-weight:500;';
    val.textContent = value;
    pill.appendChild(lbl);
    pill.appendChild(val);
    return pill;
  }

  // =========================================================================
  // Template selection & variable resolution
  // =========================================================================

  async function selectTemplate(tpl) {
    selectedTemplate = tpl;
    pageSettings = tpl.page_settings || {};

    // Resolve all text containers
    const containerEntries = tpl.containers || [];
    const containerIds = containerEntries.map(c => c.containerId);

    let textContainers = [];
    if (containerIds.length > 0) {
      try {
        textContainers = await pb.collection('text_containers').getFullList({
          filter: containerIds.map(id => `id = "${id}"`).join(' || '),
        });
      } catch (err) {
        console.error('Failed to load text containers:', err);
      }
    }

    const tcMap = new Map(textContainers.map(tc => [tc.id, tc]));

    // Build content blocks with resolved variables
    contentBlocks = containerEntries
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(entry => {
        const tc = tcMap.get(entry.containerId);
        if (!tc) return null;
        return {
          id: tc.id,
          name: tc.name,
          html: resolveVariables(tc.content || '', variableMap, quoteData),
          editable: true,
        };
      })
      .filter(Boolean);

    step = 'preview';
    renderBody();
  }

  // =========================================================================
  // PDF Export
  // =========================================================================

  async function handleExport() {
    const filename = [
      opportunity?.title || 'Document',
      quote?.name || '',
      new Date().toLocaleDateString('de-DE').replace(/\./g, '-'),
    ].filter(Boolean).join('_') + '.pdf';

    try {
      showToast('Generating PDF...', 'info');
      await generatePdf({
        blocks: contentBlocks,
        pageSettings,
        filename,
      });
      showToast('PDF exported successfully', 'success');
    } catch (err) {
      console.error('PDF generation failed:', err);
      showToast('PDF generation failed: ' + (err.message || 'Unknown'), 'error');
    }
  }

  // =========================================================================
  // Load data
  // =========================================================================

  async function loadData() {
    try {
      // Load templates
      templates = await pb.collection('document_templates').getFullList({ sort: 'name' });

      // Load opportunity + customer + quote if specified
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
      variableMap = buildVariableMap({ opportunity, customer, quote, quoteData, user });

      renderBody();
    } catch (err) {
      console.error('Failed to load PDF generator data:', err);
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
