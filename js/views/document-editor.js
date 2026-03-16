// Document Editor View — Fluid Notion-style writing surface
// ONE continuous Quill editor on a white A4 page, floating toolbar on selection,
// variable chips as Quill embeds, right sidebar with text containers + page settings.

import { pb } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { getAvailableVariables, getSampleVariableMap, buildVariableMap, resolveVariables, renderQuoteTable } from '../lib/variable-resolver.js';
import { generatePdf } from '../lib/pdf-engine.js';

// ---------------------------------------------------------------------------
// Register Variable Blot (once)
// ---------------------------------------------------------------------------
let blotRegistered = false;
function ensureVariableBlot() {
  if (blotRegistered || typeof window.Quill === 'undefined') return;
  const Embed = window.Quill.import('blots/embed');

  class VariableBlot extends Embed {
    static create(data) {
      const node = super.create();
      node.setAttribute('data-variable', data.key);
      node.setAttribute('contenteditable', 'false');
      node.textContent = data.label || data.key;
      return node;
    }
    static value(node) {
      return {
        key: node.getAttribute('data-variable'),
        label: node.textContent,
      };
    }
  }
  VariableBlot.blotName = 'variable';
  VariableBlot.tagName = 'span';
  VariableBlot.className = 'ql-variable';

  window.Quill.register(VariableBlot);

  // QuoteTableBlot — BlockEmbed for the quote line items table
  const BlockEmbed = window.Quill.import('blots/block/embed');

  class QuoteTableBlot extends BlockEmbed {
    static create(data) {
      const node = super.create();
      node.setAttribute('contenteditable', 'false');
      node.setAttribute('data-quote-table', 'true');
      if (data.mode === 'placeholder') {
        node.innerHTML = '<div class="qt-placeholder"><span class="qt-placeholder-icon">&#9638;</span> Quote Line Items Table <span class="qt-placeholder-hint">(resolved on export)</span></div>';
      } else {
        node.innerHTML = data.html || '';
      }
      return node;
    }
    static value(node) {
      return { html: node.innerHTML, mode: node.querySelector('.qt-placeholder') ? 'placeholder' : 'rendered' };
    }
  }
  QuoteTableBlot.blotName = 'quotetable';
  QuoteTableBlot.tagName = 'DIV';
  QuoteTableBlot.className = 'quote-table-embed';

  window.Quill.register(QuoteTableBlot);
  blotRegistered = true;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function createDocumentEditorView(container, opts = {}) {
  container.innerHTML = '';
  ensureEditorStyles();
  ensureVariableBlot();

  const templateId = opts.templateId || null;

  // Parse query params
  const hashParts = window.location.hash.split('?');
  const qp = new URLSearchParams(hashParts[1] || '');
  const opportunityId = qp.get('opportunityId');
  const quoteId = qp.get('quoteId');

  // Generate mode = opened from configurator with quote data (not template editing)
  const isGenerateMode = !!(opportunityId && quoteId);

  // State
  let docName = 'Untitled Document';
  let pageSettings = { margins: { top: 20, right: 20, bottom: 20, left: 20 }, orientation: 'portrait', headerHtml: '', footerHtml: '' };
  let currentTemplateId = templateId;
  let quillInstance = null;
  let opportunity = null;
  let customer = null;
  let quote = null;
  let quoteData = null;
  let variableMap = {};
  let destroyed = false;
  let textContainers = [];
  let containerSearch = '';

  // =========================================================================
  // Root layout
  // =========================================================================
  const root = document.createElement('div');
  root.className = 'fluid-editor-root';

  // -- Header --
  const header = document.createElement('header');
  header.className = 'fluid-editor-header';

  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary';
  backBtn.style.cssText = 'padding:6px 10px;';
  backBtn.innerHTML = '&larr;';
  backBtn.addEventListener('click', () => {
    if (isGenerateMode && opportunityId && quoteId) {
      navigate(`/opportunities/${opportunityId}/quotes/${quoteId}`);
    } else {
      navigate('/documents');
    }
  });
  header.appendChild(backBtn);

  const nameInput = document.createElement('input');
  nameInput.className = 'fluid-editor-name';
  nameInput.placeholder = 'Document name...';
  nameInput.value = docName;
  nameInput.addEventListener('blur', () => { docName = nameInput.value.trim() || 'Untitled Document'; });
  if (isGenerateMode) nameInput.readOnly = true;
  header.appendChild(nameInput);

  const headerActions = document.createElement('div');
  headerActions.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:auto;';

  if (!isGenerateMode) {
    // TEMPLATE EDITOR MODE: Insert Variable button
    const headerVarWrap = document.createElement('div');
    headerVarWrap.style.cssText = 'position:relative;';
    const headerVarBtn = document.createElement('button');
    headerVarBtn.className = 'btn btn-secondary btn-sm';
    headerVarBtn.innerHTML = '&#123; x &#125; Insert Variable';
    headerVarBtn.addEventListener('click', () => {
      if (headerVarDropdown.style.display === 'none') {
        headerVarDropdown.innerHTML = '';
        const groups = getAvailableVariables();
        groups.forEach(group => {
          const groupLabel = document.createElement('div');
          groupLabel.style.cssText = 'font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);padding:6px 8px 2px;';
          groupLabel.textContent = group.group;
          headerVarDropdown.appendChild(groupLabel);
          group.vars.forEach(v => {
            const item = document.createElement('button');
            item.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 8px;border:none;background:transparent;cursor:pointer;border-radius:4px;font-size:0.8rem;color:var(--text-main);';
            item.textContent = v.label;
            item.title = `{{${v.key}}}`;
            item.addEventListener('mouseenter', () => { item.style.background = 'var(--bg)'; });
            item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
            item.addEventListener('click', () => {
              insertVariable(v.key, v.label);
              headerVarDropdown.style.display = 'none';
            });
            headerVarDropdown.appendChild(item);
          });
        });
        headerVarDropdown.style.display = 'block';
      } else {
        headerVarDropdown.style.display = 'none';
      }
    });
    headerVarWrap.appendChild(headerVarBtn);

    const headerVarDropdown = document.createElement('div');
    headerVarDropdown.style.cssText = 'display:none;position:absolute;right:0;top:100%;margin-top:4px;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);z-index:60;width:280px;max-height:360px;overflow-y:auto;padding:8px;';
    headerVarWrap.appendChild(headerVarDropdown);
    headerActions.appendChild(headerVarWrap);

    document.addEventListener('click', (e) => {
      if (!headerVarWrap.contains(e.target)) headerVarDropdown.style.display = 'none';
    });

    // Save button (template mode only)
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-secondary btn-sm';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', handleSave);
    headerActions.appendChild(saveBtn);
  }

  // Export PDF button (both modes, but primary in generate mode)
  const exportBtn = document.createElement('button');
  exportBtn.className = isGenerateMode ? 'btn btn-primary' : 'btn btn-primary btn-sm';
  exportBtn.textContent = isGenerateMode ? '📄 Export PDF' : 'Export PDF';
  exportBtn.addEventListener('click', handleExport);
  headerActions.appendChild(exportBtn);

  header.appendChild(headerActions);
  root.appendChild(header);

  // -- Context banner --
  const contextBanner = document.createElement('div');
  contextBanner.className = 'fluid-editor-context';
  contextBanner.style.display = 'none';
  root.appendChild(contextBanner);

  // -- Body: editor + sidebar --
  const body = document.createElement('div');
  body.className = 'fluid-editor-body';

  // =========================================================================
  // LEFT: A4 writing surface
  // =========================================================================
  const editorPane = document.createElement('div');
  editorPane.className = 'fluid-editor-pane';

  const pageWrap = document.createElement('div');
  pageWrap.className = 'fluid-page-wrap';

  const a4Page = document.createElement('div');
  a4Page.className = 'fluid-a4-page';

  // The single Quill editor container
  const quillContainer = document.createElement('div');
  quillContainer.className = 'fluid-quill-container';
  a4Page.appendChild(quillContainer);

  pageWrap.appendChild(a4Page);
  editorPane.appendChild(pageWrap);
  body.appendChild(editorPane);

  // =========================================================================
  // Floating toolbar (appears on text selection)
  // =========================================================================
  const floatingToolbar = document.createElement('div');
  floatingToolbar.className = 'fluid-floating-toolbar';
  floatingToolbar.innerHTML = `
    <button data-action="bold" title="Bold"><b>B</b></button>
    <button data-action="italic" title="Italic"><i>I</i></button>
    <button data-action="underline" title="Underline"><u>U</u></button>
    <span class="fluid-tb-sep"></span>
    <button data-action="header-1" title="Heading 1">H1</button>
    <button data-action="header-2" title="Heading 2">H2</button>
    <button data-action="header-3" title="Heading 3">H3</button>
    <span class="fluid-tb-sep"></span>
    <button data-action="blockquote" title="Quote">"</button>
    <button data-action="list-ordered" title="Ordered List">1.</button>
    <button data-action="list-bullet" title="Bullet List">&bull;</button>
    <button data-action="link" title="Link">&#128279;</button>
    <span class="fluid-tb-sep"></span>
    <button data-action="insert-variable" title="Insert Variable" class="fluid-tb-var-btn">{ x }</button>
    <button data-action="page-break" title="Page Break">&#9473;</button>
  `;
  document.body.appendChild(floatingToolbar);

  // Variable dropdown (attached to floating toolbar)
  const varDropdown = document.createElement('div');
  varDropdown.className = 'fluid-var-dropdown';
  varDropdown.style.display = 'none';
  buildVarDropdownContent(varDropdown);
  document.body.appendChild(varDropdown);

  // Toolbar action handler
  floatingToolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !quillInstance) return;
    const action = btn.dataset.action;
    const range = quillInstance.getSelection();
    if (!range && action !== 'insert-variable') return;

    switch (action) {
      case 'bold': quillInstance.format('bold', !quillInstance.getFormat().bold); break;
      case 'italic': quillInstance.format('italic', !quillInstance.getFormat().italic); break;
      case 'underline': quillInstance.format('underline', !quillInstance.getFormat().underline); break;
      case 'header-1': quillInstance.format('header', quillInstance.getFormat().header === 1 ? false : 1); break;
      case 'header-2': quillInstance.format('header', quillInstance.getFormat().header === 2 ? false : 2); break;
      case 'header-3': quillInstance.format('header', quillInstance.getFormat().header === 3 ? false : 3); break;
      case 'blockquote': quillInstance.format('blockquote', !quillInstance.getFormat().blockquote); break;
      case 'list-ordered': quillInstance.format('list', quillInstance.getFormat().list === 'ordered' ? false : 'ordered'); break;
      case 'list-bullet': quillInstance.format('list', quillInstance.getFormat().list === 'bullet' ? false : 'bullet'); break;
      case 'link': {
        const existing = quillInstance.getFormat().link;
        if (existing) {
          quillInstance.format('link', false);
        } else {
          const url = prompt('Enter URL:');
          if (url) quillInstance.format('link', url);
        }
        break;
      }
      case 'insert-variable': toggleVarDropdown(); break;
      case 'page-break': {
        if (range) {
          quillInstance.insertText(range.index, '\n');
          quillInstance.insertEmbed(range.index + 1, 'divider', true);
          quillInstance.setSelection(range.index + 2);
        }
        break;
      }
    }
  });

  function toggleVarDropdown() {
    const isOpen = varDropdown.style.display !== 'none';
    if (isOpen) {
      varDropdown.style.display = 'none';
    } else {
      // Position near the insert-variable button
      const btnRect = floatingToolbar.querySelector('.fluid-tb-var-btn').getBoundingClientRect();
      varDropdown.style.left = btnRect.left + 'px';
      varDropdown.style.top = (btnRect.bottom + 4) + 'px';
      varDropdown.style.display = 'block';
    }
  }

  function buildVarDropdownContent(dd) {
    const groups = getAvailableVariables();
    groups.forEach(group => {
      const groupLabel = document.createElement('div');
      groupLabel.className = 'fluid-var-group';
      groupLabel.textContent = group.group;
      dd.appendChild(groupLabel);

      group.vars.forEach(v => {
        const item = document.createElement('button');
        item.className = 'fluid-var-item';
        const label = document.createElement('span');
        label.textContent = v.label;
        item.appendChild(label);
        const key = document.createElement('span');
        key.className = 'fluid-var-key';
        key.textContent = v.key;
        item.appendChild(key);

        item.addEventListener('click', () => {
          insertVariable(v.key, v.label);
          varDropdown.style.display = 'none';
        });
        dd.appendChild(item);
      });
    });
  }

  function insertVariable(key, label) {
    if (!quillInstance) return;
    const range = quillInstance.getSelection(true);
    if (key === 'quote.table') {
      if (isGenerateMode) {
        // Render as div-based grid inside a QuoteTableBlot
        const divHtml = renderQuoteTable(quoteData, 'div');
        quillInstance.insertEmbed(range.index, 'quotetable', { html: divHtml, mode: 'rendered' });
      } else {
        // Template mode: placeholder block
        quillInstance.insertEmbed(range.index, 'quotetable', { mode: 'placeholder' });
      }
      quillInstance.setSelection(range.index + 1);
    } else if (isGenerateMode) {
      const resolved = variableMap[key] || `{{${key}}}`;
      quillInstance.insertText(range.index, resolved);
      quillInstance.setSelection(range.index + resolved.length);
    } else {
      quillInstance.insertEmbed(range.index, 'variable', { key, label });
      quillInstance.setSelection(range.index + 1);
    }
  }

  /** Insert HTML at cursor using clipboard.convert + updateContents (more reliable than dangerouslyPasteHTML) */
  function insertHtmlAtCursor(html) {
    if (!quillInstance) return;
    quillInstance.focus();
    const range = quillInstance.getSelection(true);
    if (!range) {
      console.warn('insertHtmlAtCursor: no selection');
      return;
    }
    try {
      const Delta = window.Quill.import('delta');
      const delta = quillInstance.clipboard.convert(html);
      quillInstance.updateContents(
        new Delta().retain(range.index).concat(delta),
        'user'
      );
      quillInstance.setSelection(range.index + delta.length());
    } catch (err) {
      console.error('insertHtmlAtCursor failed:', err);
      // Fallback
      quillInstance.clipboard.dangerouslyPasteHTML(range.index, html, 'user');
    }
  }

  /** Resolve .ql-variable chips and .quote-table-embed blots in HTML string to real values */
  function resolveChips(html) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Resolve QuoteTableBlot embeds → proper HTML table for PDF
    tempDiv.querySelectorAll('.quote-table-embed').forEach(embed => {
      const tableHtml = renderQuoteTable(quoteData, 'html');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = tableHtml;
      embed.replaceWith(...wrapper.childNodes);
    });

    // Resolve variable chips
    tempDiv.querySelectorAll('.ql-variable').forEach(chip => {
      const key = (chip.getAttribute('data-variable') || '').trim();
      if (key === 'quote.table') {
        const tableHtml = renderQuoteTable(quoteData, 'html');
        const wrapper = document.createElement('div');
        wrapper.innerHTML = tableHtml;
        chip.replaceWith(...wrapper.childNodes);
      } else if (variableMap[key]) {
        chip.replaceWith(document.createTextNode(variableMap[key]));
      } else {
        const resolved = resolveVariables(`{{${key}}}`, variableMap, quoteData);
        if (resolved !== `{{${key}}}`) {
          const wrapper = document.createElement('div');
          wrapper.innerHTML = resolved;
          chip.replaceWith(...wrapper.childNodes);
        } else {
          chip.replaceWith(document.createTextNode(chip.textContent));
        }
      }
    });
    return tempDiv.innerHTML;
  }

  // =========================================================================
  // Slash command menu (/ to insert variables and text containers)
  // =========================================================================
  const slashMenu = document.createElement('div');
  slashMenu.className = 'slash-menu';
  document.body.appendChild(slashMenu);

  let slashActive = false;
  let slashStartIndex = -1;
  let slashFilter = '';
  let slashHighlightIndex = 0;
  let slashItemCallbacks = [];

  function buildSlashItems(filter) {
    slashMenu.innerHTML = '';
    const f = (filter || '').toLowerCase();
    slashItemCallbacks = [];
    slashHighlightIndex = 0;

    // Header
    const header = document.createElement('div');
    header.className = 'slash-header';
    header.textContent = 'Insert...';
    slashMenu.appendChild(header);

    // Search hint
    const searchHint = document.createElement('div');
    searchHint.className = 'slash-search-hint';
    if (f) {
      searchHint.innerHTML = `<span class="slash-search-icon">&#128269;</span> <span>${escapeHtmlInline(f)}</span>`;
    } else {
      searchHint.innerHTML = '<span class="slash-search-icon">&#128269;</span> <span style="color:var(--text-secondary,#9ca3af);">Type to filter...</span>';
    }
    slashMenu.appendChild(searchHint);

    // Items container
    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'slash-items';

    // --- Quote Table (special item) ---
    if (!f || 'quote table'.includes(f) || 'quote.table'.includes(f) || 'line items'.includes(f)) {
      const idx = slashItemCallbacks.length;
      const item = document.createElement('button');
      item.className = 'slash-item slash-item-special';
      item.setAttribute('data-slash-idx', idx);
      item.innerHTML = '<span class="slash-icon slash-icon-table">&#9638;</span><div class="slash-item-text"><span class="slash-item-label">Quote Line Items Table</span><span class="slash-item-desc">Insert the full quote table</span></div>';
      item.addEventListener('mouseenter', () => { slashHighlightIndex = idx; updateSlashHighlight(); });
      item.addEventListener('mousedown', (e) => { e.preventDefault(); selectSlashItem(idx); });
      itemsWrap.appendChild(item);
      slashItemCallbacks.push(() => insertVariable('quote.table', 'Quote Line Items Table'));
    }

    // --- Variables ---
    const varGroups = getAvailableVariables();
    const flatVars = varGroups.flatMap(g => g.vars.filter(v => v.key !== 'quote.table').map(v => ({ ...v, group: g.group })));
    const matchedVars = flatVars.filter(v => !f || v.label.toLowerCase().includes(f) || v.key.toLowerCase().includes(f));

    if (matchedVars.length > 0) {
      const heading = document.createElement('div');
      heading.className = 'slash-section-heading';
      heading.textContent = 'Variables';
      itemsWrap.appendChild(heading);

      matchedVars.forEach(v => {
        const idx = slashItemCallbacks.length;
        const item = document.createElement('button');
        item.className = 'slash-item';
        item.setAttribute('data-slash-idx', idx);
        item.innerHTML = `<span class="slash-icon slash-icon-var">{x}</span><div class="slash-item-text"><span class="slash-item-label">${escapeHtmlInline(v.label)}</span><span class="slash-item-desc">${escapeHtmlInline(v.key)}</span></div>`;
        item.addEventListener('mouseenter', () => { slashHighlightIndex = idx; updateSlashHighlight(); });
        item.addEventListener('mousedown', (e) => { e.preventDefault(); selectSlashItem(idx); });
        itemsWrap.appendChild(item);
        slashItemCallbacks.push(() => insertVariable(v.key, v.label));
      });
    }

    // --- Text Containers ---
    const matchedContainers = textContainers.filter(c => !f || c.name.toLowerCase().includes(f) || (c.category || '').toLowerCase().includes(f));
    if (matchedContainers.length > 0) {
      const heading = document.createElement('div');
      heading.className = 'slash-section-heading';
      heading.textContent = 'Text Containers';
      itemsWrap.appendChild(heading);

      matchedContainers.forEach(c => {
        const idx = slashItemCallbacks.length;
        const item = document.createElement('button');
        item.className = 'slash-item';
        item.setAttribute('data-slash-idx', idx);
        let badgeHtml = c.category ? `<span class="slash-item-badge">${escapeHtmlInline(c.category)}</span>` : '';
        item.innerHTML = `<span class="slash-icon slash-icon-doc">&#128196;</span><div class="slash-item-text"><span class="slash-item-label">${escapeHtmlInline(c.name)}</span>${badgeHtml}</div>`;
        item.addEventListener('mouseenter', () => { slashHighlightIndex = idx; updateSlashHighlight(); });
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectSlashItem(idx);
        });
        itemsWrap.appendChild(item);
        slashItemCallbacks.push(() => {
          let html = c.content || '';
          if (isGenerateMode && Object.keys(variableMap).length > 0) {
            html = resolveVariables(html, variableMap, quoteData);
            html = resolveChips(html);
          }
          insertHtmlAtCursor(html);
          showToast(`Inserted "${c.name}"`, 'success');
        });
      });
    }

    if (slashItemCallbacks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'slash-empty';
      empty.textContent = 'No results';
      itemsWrap.appendChild(empty);
    }

    slashMenu.appendChild(itemsWrap);
    updateSlashHighlight();
  }

  function updateSlashHighlight() {
    slashMenu.querySelectorAll('.slash-item').forEach(el => el.classList.remove('slash-item-active'));
    const active = slashMenu.querySelector(`[data-slash-idx="${slashHighlightIndex}"]`);
    if (active) {
      active.classList.add('slash-item-active');
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function selectSlashItem(indexOrCallback) {
    const callback = typeof indexOrCallback === 'function' ? indexOrCallback : slashItemCallbacks[indexOrCallback];
    // Remove the "/" and any typed filter text from the editor
    if (quillInstance && slashStartIndex >= 0) {
      const currentIndex = quillInstance.getSelection(true)?.index ?? slashStartIndex;
      const deleteLen = currentIndex - slashStartIndex;
      if (deleteLen > 0) {
        quillInstance.deleteText(slashStartIndex, deleteLen);
        quillInstance.setSelection(slashStartIndex);
      }
    }
    closeSlashMenu();
    if (callback) callback();
  }

  function openSlashMenu() {
    if (!quillInstance) return;
    const range = quillInstance.getSelection();
    if (!range) return;
    slashStartIndex = range.index;
    slashActive = true;
    slashFilter = '';
    buildSlashItems('');

    // Position below cursor
    const bounds = quillInstance.getBounds(range.index);
    const editorRect = quillInstance.root.closest('.fluid-a4-page').getBoundingClientRect();
    slashMenu.style.left = (editorRect.left + bounds.left) + 'px';
    slashMenu.style.top = (editorRect.top + bounds.top + bounds.height + 4) + 'px';
    slashMenu.style.display = 'block';
    // Trigger fade-in
    requestAnimationFrame(() => slashMenu.classList.add('slash-menu-visible'));
  }

  function closeSlashMenu() {
    slashMenu.classList.remove('slash-menu-visible');
    slashMenu.style.display = 'none';
    slashActive = false;
    slashStartIndex = -1;
    slashFilter = '';
    slashHighlightIndex = 0;
    slashItemCallbacks = [];
  }

  /** Inline HTML escape for slash menu items */
  function escapeHtmlInline(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Show/hide floating toolbar based on selection
  function updateFloatingToolbar() {
    if (!quillInstance) return;
    const range = quillInstance.getSelection();
    if (!range || range.length === 0) {
      floatingToolbar.classList.remove('visible');
      varDropdown.style.display = 'none';
      return;
    }

    const bounds = quillInstance.getBounds(range.index, range.length);
    const editorRect = quillInstance.root.closest('.fluid-a4-page').getBoundingClientRect();

    floatingToolbar.style.left = (editorRect.left + bounds.left + bounds.width / 2) + 'px';
    floatingToolbar.style.top = (editorRect.top + bounds.top - 50) + 'px';
    floatingToolbar.classList.add('visible');
  }

  // Close var dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!varDropdown.contains(e.target) && !floatingToolbar.contains(e.target)) {
      varDropdown.style.display = 'none';
    }
  });

  // =========================================================================
  // RIGHT: Sidebar
  // =========================================================================
  const sidebar = document.createElement('div');
  sidebar.className = 'fluid-editor-sidebar';

  // Tab headers
  const tabBar = document.createElement('div');
  tabBar.className = 'fluid-sidebar-tabs';
  const tabContainers = document.createElement('button');
  tabContainers.className = 'fluid-sidebar-tab active';
  tabContainers.textContent = 'Text Containers';
  const tabSettings = document.createElement('button');
  tabSettings.className = 'fluid-sidebar-tab';
  tabSettings.textContent = 'Page Settings';
  tabBar.appendChild(tabContainers);
  tabBar.appendChild(tabSettings);
  sidebar.appendChild(tabBar);

  const tabContent = document.createElement('div');
  tabContent.className = 'fluid-sidebar-content';
  sidebar.appendChild(tabContent);

  // -- Text Containers panel --
  const containersPanel = document.createElement('div');
  containersPanel.className = 'fluid-containers-panel';

  const containerHeader = document.createElement('div');
  containerHeader.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;';
  const containerSearchInput = document.createElement('input');
  containerSearchInput.placeholder = 'Search containers...';
  containerSearchInput.style.cssText = 'flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text-main);font-size:0.8rem;';
  containerSearchInput.addEventListener('input', (e) => { containerSearch = e.target.value; renderContainersList(); });
  containerHeader.appendChild(containerSearchInput);

  const addContainerBtn = document.createElement('button');
  addContainerBtn.className = 'btn btn-primary btn-sm';
  addContainerBtn.textContent = '+';
  addContainerBtn.title = 'New container';
  addContainerBtn.addEventListener('click', openNewContainerModal);
  containerHeader.appendChild(addContainerBtn);
  containersPanel.appendChild(containerHeader);

  const containersList = document.createElement('div');
  containersList.className = 'fluid-containers-list';
  containersPanel.appendChild(containersList);

  // -- Page Settings panel --
  const settingsPanel = document.createElement('div');
  settingsPanel.className = 'fluid-settings-panel';
  settingsPanel.style.display = 'none';
  buildSettingsPanel(settingsPanel);

  tabContent.appendChild(containersPanel);
  tabContent.appendChild(settingsPanel);

  // Tab switching
  tabContainers.addEventListener('click', () => {
    tabContainers.classList.add('active');
    tabSettings.classList.remove('active');
    containersPanel.style.display = '';
    settingsPanel.style.display = 'none';
  });
  tabSettings.addEventListener('click', () => {
    tabSettings.classList.add('active');
    tabContainers.classList.remove('active');
    settingsPanel.style.display = '';
    containersPanel.style.display = 'none';
  });

  body.appendChild(sidebar);
  root.appendChild(body);
  container.appendChild(root);

  // =========================================================================
  // Initialize Quill
  // =========================================================================
  function initQuill() {
    if (typeof window.Quill === 'undefined') {
      quillContainer.innerHTML = '<p style="color:red;padding:20px;">Quill.js not loaded</p>';
      return;
    }

    quillInstance = new window.Quill(quillContainer, {
      theme: null, // no theme — we use floating toolbar
      placeholder: 'Start writing your document...',
      modules: {
        toolbar: false, // disable built-in toolbar
        keyboard: {
          bindings: {
            // Ctrl+Shift+Enter for page break
            pageBreak: {
              key: 13,
              shiftKey: true,
              ctrlKey: true,
              handler(range) {
                this.quill.insertText(range.index, '\n');
                this.quill.insertEmbed(range.index + 1, 'divider', true);
                this.quill.setSelection(range.index + 2);
              }
            }
          }
        }
      },
    });

    quillInstance.on('selection-change', (range) => {
      updateFloatingToolbar();
      // Close slash menu if cursor moves away
      if (slashActive && range && range.index < slashStartIndex) {
        closeSlashMenu();
      }
    });

    quillInstance.on('text-change', (delta, oldDelta, source) => {
      floatingToolbar.classList.remove('visible');

      if (source !== 'user') return;

      // Check for "/" typed
      const range = quillInstance.getSelection();
      if (!range) return;

      if (slashActive) {
        // Update filter based on text after "/"
        const text = quillInstance.getText(slashStartIndex, range.index - slashStartIndex);
        if (text.includes('\n') || text.includes(' ')) {
          closeSlashMenu();
        } else {
          // Remove leading "/" from filter
          slashFilter = text.startsWith('/') ? text.slice(1) : text;
          buildSlashItems(slashFilter);
        }
        return;
      }

      // Detect "/" at current position — works at any cursor position
      if (range.index > 0) {
        const lastChar = quillInstance.getText(range.index - 1, 1);
        if (lastChar === '/') {
          openSlashMenu();
        }
      }
    });

    // Slash menu keyboard navigation
    quillInstance.root.addEventListener('keydown', (e) => {
      if (!slashActive) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeSlashMenu();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (slashItemCallbacks.length > 0) {
          slashHighlightIndex = (slashHighlightIndex + 1) % slashItemCallbacks.length;
          updateSlashHighlight();
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (slashItemCallbacks.length > 0) {
          slashHighlightIndex = (slashHighlightIndex - 1 + slashItemCallbacks.length) % slashItemCallbacks.length;
          updateSlashHighlight();
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (slashItemCallbacks.length > 0) {
          selectSlashItem(slashHighlightIndex);
        }
        return;
      }
    });
  }

  // =========================================================================
  // Page settings builder
  // =========================================================================
  function buildSettingsPanel(panel) {
    panel.innerHTML = '';

    const title = document.createElement('h4');
    title.style.cssText = 'margin:0 0 16px;font-size:0.85rem;';
    title.textContent = 'Page Settings';
    panel.appendChild(title);

    // Margins
    const marginLabel = document.createElement('label');
    marginLabel.className = 'fluid-settings-label';
    marginLabel.textContent = 'Margins (mm)';
    panel.appendChild(marginLabel);

    const marginGrid = document.createElement('div');
    marginGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;';
    ['top', 'right', 'bottom', 'left'].forEach(side => {
      const wrap = document.createElement('div');
      const lbl = document.createElement('label');
      lbl.style.cssText = 'font-size:0.7rem;color:var(--text-secondary);text-transform:capitalize;';
      lbl.textContent = side;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.min = '0';
      inp.max = '50';
      inp.value = pageSettings.margins[side];
      inp.style.cssText = 'width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text-main);font-size:0.8rem;';
      inp.addEventListener('change', () => {
        pageSettings.margins[side] = parseInt(inp.value) || 0;
        applyPageSettings();
      });
      wrap.appendChild(lbl);
      wrap.appendChild(inp);
      marginGrid.appendChild(wrap);
    });
    panel.appendChild(marginGrid);

    // Orientation
    const oriLabel = document.createElement('label');
    oriLabel.className = 'fluid-settings-label';
    oriLabel.textContent = 'Orientation';
    panel.appendChild(oriLabel);

    const oriSelect = document.createElement('select');
    oriSelect.style.cssText = 'width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text-main);font-size:0.8rem;margin-bottom:16px;';
    ['portrait', 'landscape'].forEach(o => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o.charAt(0).toUpperCase() + o.slice(1);
      if (pageSettings.orientation === o) opt.selected = true;
      oriSelect.appendChild(opt);
    });
    oriSelect.addEventListener('change', () => {
      pageSettings.orientation = oriSelect.value;
      applyPageSettings();
    });
    panel.appendChild(oriSelect);

    // Header HTML
    const headerLabel = document.createElement('label');
    headerLabel.className = 'fluid-settings-label';
    headerLabel.textContent = 'Header HTML';
    panel.appendChild(headerLabel);
    const headerArea = document.createElement('textarea');
    headerArea.style.cssText = 'width:100%;min-height:80px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text-main);font-size:0.8rem;font-family:monospace;margin-bottom:16px;resize:vertical;';
    headerArea.value = pageSettings.headerHtml || '';
    headerArea.addEventListener('input', () => { pageSettings.headerHtml = headerArea.value; });
    panel.appendChild(headerArea);

    // Footer HTML
    const footerLabel = document.createElement('label');
    footerLabel.className = 'fluid-settings-label';
    footerLabel.textContent = 'Footer HTML';
    panel.appendChild(footerLabel);
    const footerArea = document.createElement('textarea');
    footerArea.style.cssText = 'width:100%;min-height:80px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text-main);font-size:0.8rem;font-family:monospace;margin-bottom:16px;resize:vertical;';
    footerArea.value = pageSettings.footerHtml || '';
    footerArea.addEventListener('input', () => { pageSettings.footerHtml = footerArea.value; });
    panel.appendChild(footerArea);
  }

  function applyPageSettings() {
    const m = pageSettings.margins;
    a4Page.style.padding = `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`;
    if (pageSettings.orientation === 'landscape') {
      a4Page.style.width = '297mm';
      a4Page.style.minHeight = '210mm';
    } else {
      a4Page.style.width = '210mm';
      a4Page.style.minHeight = '297mm';
    }
  }

  // =========================================================================
  // Text containers sidebar
  // =========================================================================
  function renderContainersList() {
    containersList.innerHTML = '';

    const filtered = textContainers.filter(c => {
      if (!containerSearch) return true;
      const q = containerSearch.toLowerCase();
      return (c.name || '').toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:24px;text-align:center;color:var(--text-secondary);font-size:0.8rem;';
      empty.textContent = textContainers.length === 0 ? 'No text containers yet.' : 'No matches.';
      containersList.appendChild(empty);
      return;
    }

    filtered.forEach(c => {
      const item = document.createElement('div');
      item.className = 'fluid-container-item';

      const top = document.createElement('div');
      top.style.cssText = 'display:flex;align-items:center;gap:8px;';
      const name = document.createElement('span');
      name.className = 'fluid-container-name';
      name.textContent = c.name;
      top.appendChild(name);
      if (c.category) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.style.cssText = 'font-size:0.65rem;';
        badge.textContent = c.category;
        top.appendChild(badge);
      }
      item.appendChild(top);

      // Preview snippet
      if (c.content) {
        const preview = document.createElement('div');
        preview.className = 'fluid-container-preview';
        const tmp = document.createElement('div');
        tmp.innerHTML = c.content;
        preview.textContent = (tmp.textContent || '').substring(0, 100);
        if ((tmp.textContent || '').length > 100) preview.textContent += '...';
        item.appendChild(preview);
      }

      item.addEventListener('click', () => {
        if (!quillInstance) return;
        let html = c.content || '';
        // In generate mode, resolve variables before inserting
        if (isGenerateMode && Object.keys(variableMap).length > 0) {
          html = resolveVariables(html, variableMap, quoteData);
          html = resolveChips(html);
        }
        insertHtmlAtCursor(html);
        showToast(`Inserted "${c.name}"`, 'success');
      });

      containersList.appendChild(item);
    });
  }

  async function loadTextContainers() {
    try {
      textContainers = await pb.collection('text_containers').getFullList({ sort: 'name' });
    } catch (err) {
      console.error('Failed to load text containers:', err);
    }
    renderContainersList();
  }

  function openNewContainerModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.addEventListener('click', () => backdrop.remove());

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'width:100%;max-width:500px;';
    card.addEventListener('click', (e) => e.stopPropagation());

    const hd = document.createElement('div');
    hd.className = 'p-4 border-b';
    hd.innerHTML = '<h3>New Text Container</h3>';
    card.appendChild(hd);

    const form = document.createElement('form');
    form.className = 'p-6';

    const ng = document.createElement('div');
    ng.className = 'form-group';
    ng.innerHTML = '<label>Name</label>';
    const ni = document.createElement('input');
    ni.name = 'name';
    ni.required = true;
    ng.appendChild(ni);
    form.appendChild(ng);

    const cg = document.createElement('div');
    cg.className = 'form-group';
    cg.innerHTML = '<label>Category</label>';
    const ci = document.createElement('input');
    ci.name = 'category';
    ci.placeholder = 'e.g. Legal, Intro...';
    cg.appendChild(ci);
    form.appendChild(cg);

    const br = document.createElement('div');
    br.className = 'flex justify-end gap-2 mt-4';
    const cancelB = document.createElement('button');
    cancelB.type = 'button';
    cancelB.className = 'btn btn-secondary';
    cancelB.textContent = 'Cancel';
    cancelB.addEventListener('click', () => backdrop.remove());
    const saveB = document.createElement('button');
    saveB.type = 'submit';
    saveB.className = 'btn btn-primary';
    saveB.textContent = 'Create';
    br.appendChild(cancelB);
    br.appendChild(saveB);
    form.appendChild(br);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      data.content = '';
      try {
        await pb.collection('text_containers').create(data);
        backdrop.remove();
        showToast('Container created', 'success');
        loadTextContainers();
      } catch (err) {
        showToast('Failed to create container', 'error');
      }
    });

    card.appendChild(form);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
  }

  // =========================================================================
  // Save
  // =========================================================================
  async function handleSave() {
    const name = nameInput.value.trim();
    if (!name) {
      showToast('Please enter a document name', 'warning');
      nameInput.focus();
      return;
    }

    const html = quillInstance ? quillInstance.root.innerHTML : '';

    const data = {
      name,
      description: '',
      containers: [{ content: html, order: 0 }],
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
        window.location.hash = `#/documents/${res.id}`;
      }
    } catch (err) {
      showToast('Failed to save: ' + (err.message || 'Unknown error'), 'error');
    }
  }

  // =========================================================================
  // PDF Export
  // =========================================================================
  async function handleExport() {
    if (!quillInstance) return;

    // Clone the editor HTML and resolve variables
    let html = quillInstance.root.innerHTML;

    // Replace variable chips with resolved values
    html = resolveChips(html);

    // Resolve any remaining {{mustache}} variables
    if (Object.keys(variableMap).length > 0) {
      html = resolveVariables(html, variableMap, quoteData);
    }

    const resolvedBlocks = [{ html }];

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
      await generatePdf({ blocks: resolvedBlocks, pageSettings: resolvedPageSettings, filename });
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
      // Load opportunity/quote context
      if (opportunityId) {
        try {
          opportunity = await pb.collection('opportunities').getOne(opportunityId, { expand: 'customer' });
          if (opportunity.expand?.customer) customer = opportunity.expand.customer;
        } catch (err) { console.error('Failed to load opportunity:', err); }
      }

      if (quoteId) {
        try {
          quote = await pb.collection('quotes').getOne(quoteId, { expand: 'created_by' });
          quoteData = quote.quote_data || null;
        } catch (err) { console.error('Failed to load quote:', err); }
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
        contextBanner.textContent = (isGenerateMode ? '📄 Generating document for: ' : 'Context: ') + parts.join(' \u00B7 ');
        contextBanner.style.display = 'block';
      }

      // Load existing template
      if (templateId) {
        try {
          const tpl = await pb.collection('document_templates').getOne(templateId);
          docName = tpl.name;
          nameInput.value = docName;
          pageSettings = tpl.page_settings || pageSettings;
          if (pageSettings.header && !pageSettings.headerHtml) pageSettings.headerHtml = pageSettings.header;
          if (pageSettings.footer && !pageSettings.footerHtml) pageSettings.footerHtml = pageSettings.footer;

          applyPageSettings();
          buildSettingsPanel(settingsPanel);

          // Load content into Quill
          const containers = Array.isArray(tpl.containers) ? tpl.containers : [];
          if (containers.length > 0 && quillInstance) {
            let fullHtml = containers
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map(c => c.content || '')
              .join('');

            // GENERATE MODE: resolve variables directly in the HTML before loading
            if (isGenerateMode && Object.keys(variableMap).length > 0) {
              // Handle {{quote.table}} — replace with placeholder, then insert blot after loading
              const hasQuoteTable = fullHtml.includes('{{quote.table}}') ||
                fullHtml.includes('data-variable="quote.table"');

              // Remove {{quote.table}} placeholder (will be inserted as blot)
              fullHtml = fullHtml.replace(/\{\{quote\.table\}\}/g, '');

              // Resolve remaining {{mustache}} variables
              fullHtml = resolveVariables(fullHtml, variableMap, quoteData);

              // Resolve variable chips (ql-variable spans) with real values
              // but preserve quote.table chips for blot insertion
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = fullHtml;
              tempDiv.querySelectorAll('.ql-variable').forEach(chip => {
                const key = (chip.getAttribute('data-variable') || '').trim();
                if (key === 'quote.table') {
                  chip.remove(); // Will insert blot after
                }
              });
              fullHtml = tempDiv.innerHTML;
              fullHtml = resolveChips(fullHtml);

              quillInstance.root.innerHTML = fullHtml;

              // Insert QuoteTableBlot at end if template had quote.table
              if (hasQuoteTable) {
                const len = quillInstance.getLength();
                const divHtml = renderQuoteTable(quoteData, 'div');
                quillInstance.insertEmbed(len - 1, 'quotetable', { html: divHtml, mode: 'rendered' });
              }
            } else {
              quillInstance.root.innerHTML = fullHtml;
            }
          }
        } catch (err) {
          console.error('Failed to load template:', err);
          showToast('Failed to load template', 'error');
        }
      }
    } catch (err) {
      console.error('Failed to load document editor data:', err);
    }
  }

  // =========================================================================
  // Init
  // =========================================================================
  initQuill();
  applyPageSettings();
  loadData();
  loadTextContainers();

  // =========================================================================
  // Cleanup
  // =========================================================================
  return {
    destroy() {
      destroyed = true;
      if (floatingToolbar.parentNode) floatingToolbar.parentNode.removeChild(floatingToolbar);
      if (varDropdown.parentNode) varDropdown.parentNode.removeChild(varDropdown);
      if (slashMenu.parentNode) slashMenu.parentNode.removeChild(slashMenu);
      container.innerHTML = '';
    },
  };
}

// ===========================================================================
// Scoped styles
// ===========================================================================
function ensureEditorStyles() {
  if (document.getElementById('fluid-editor-styles')) return;
  const style = document.createElement('style');
  style.id = 'fluid-editor-styles';
  style.textContent = `
    .fluid-editor-root {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    /* Header */
    .fluid-editor-header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0.5rem 1.5rem;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .fluid-editor-name {
      font-size: 1rem;
      font-weight: 600;
      border: none;
      background: transparent;
      color: var(--text-main);
      outline: none;
      flex: 1;
      min-width: 120px;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .fluid-editor-name:focus {
      background: var(--bg);
    }

    /* Context banner */
    .fluid-editor-context {
      background: var(--primary-light);
      padding: 8px 1.5rem;
      font-size: 0.8rem;
      color: var(--primary);
      border-bottom: 1px solid var(--border);
    }

    /* Body: editor + sidebar */
    .fluid-editor-body {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    /* Editor pane */
    .fluid-editor-pane {
      flex: 1;
      overflow-y: auto;
      background: #e5e7eb;
    }
    [data-theme="dark"] .fluid-editor-pane {
      background: #1a1a2e;
    }

    /* Page wrap */
    .fluid-page-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 16px;
      min-height: 100%;
    }

    /* A4 page */
    .fluid-a4-page {
      width: 210mm;
      min-height: 297mm;
      background: white;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12);
      padding: 20mm;
      box-sizing: border-box;
      color: #111827;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      position: relative;
      margin-bottom: 32px;
    }
    /* A4 page stays WHITE in dark mode */
    [data-theme="dark"] .fluid-a4-page {
      background: white;
      color: #111827;
    }

    /* Quill container fills the page */
    .fluid-quill-container {
      min-height: calc(297mm - 40mm);
    }
    .fluid-quill-container .ql-editor {
      padding: 0;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      min-height: calc(297mm - 40mm);
    }
    .fluid-quill-container .ql-editor.ql-blank::before {
      font-style: italic;
      color: #9ca3af;
      left: 0;
    }
    /* Remove Quill default border */
    .fluid-quill-container .ql-container {
      border: none !important;
      font-family: inherit;
      font-size: inherit;
    }

    /* Variable chips */
    .ql-variable {
      background: #e0e7ff;
      color: #4338ca;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.85em;
      font-weight: 500;
      cursor: default;
      user-select: none;
      display: inline-block;
      margin: 0 2px;
    }

    /* Floating toolbar */
    .fluid-floating-toolbar {
      position: fixed;
      z-index: 1000;
      background: #1f2937;
      border-radius: 8px;
      padding: 4px;
      display: flex;
      align-items: center;
      gap: 2px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
      transform: translateX(-50%) translateY(-4px);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s, transform 0.15s;
    }
    .fluid-floating-toolbar.visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(-50%) translateY(0);
    }
    .fluid-floating-toolbar button {
      background: transparent;
      border: none;
      color: #e5e7eb;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 600;
      line-height: 1;
      transition: background 0.1s;
      white-space: nowrap;
    }
    .fluid-floating-toolbar button:hover {
      background: #374151;
      color: white;
    }
    .fluid-tb-sep {
      width: 1px;
      height: 16px;
      background: #4b5563;
      margin: 0 2px;
    }
    .fluid-tb-var-btn {
      color: #a5b4fc !important;
      font-family: monospace !important;
    }

    /* Variable dropdown (floating) */
    .fluid-var-dropdown {
      position: fixed;
      z-index: 1001;
      background: var(--surface, white);
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      width: 260px;
      max-height: 320px;
      overflow-y: auto;
      padding: 8px;
    }
    .fluid-var-group {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary, #6b7280);
      padding: 6px 8px 2px;
    }
    .fluid-var-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      text-align: left;
      padding: 6px 8px;
      border: none;
      background: transparent;
      cursor: pointer;
      border-radius: 4px;
      font-size: 0.8rem;
      transition: background 0.1s;
      color: var(--text-main, #111827);
    }
    .fluid-var-item:hover {
      background: var(--bg, #f3f4f6);
    }
    .fluid-var-key {
      color: var(--text-secondary, #6b7280);
      font-size: 0.65rem;
      font-family: monospace;
    }

    /* Sidebar */
    .fluid-editor-sidebar {
      width: 320px;
      flex-shrink: 0;
      background: var(--surface);
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .fluid-sidebar-tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .fluid-sidebar-tab {
      flex: 1;
      padding: 10px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      border-bottom: 2px solid transparent;
    }
    .fluid-sidebar-tab:hover {
      color: var(--text-main);
    }
    .fluid-sidebar-tab.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
    }
    .fluid-sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    /* Containers list */
    .fluid-containers-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .fluid-container-item {
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .fluid-container-item:hover {
      border-color: var(--primary);
      background: var(--primary-light);
    }
    .fluid-container-name {
      font-weight: 500;
      font-size: 0.85rem;
    }
    .fluid-container-preview {
      font-size: 0.72rem;
      color: var(--text-secondary);
      margin-top: 4px;
      line-height: 1.4;
    }

    /* Settings panel */
    .fluid-settings-label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }
    .fluid-settings-panel {
      display: flex;
      flex-direction: column;
    }

    /* ===== Quote Table Embed (div-based grid) ===== */
    .quote-table-embed {
      margin: 16px 0;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      font-size: 0.8rem;
      color: #374151;
      user-select: none;
    }
    .quote-table-embed .qt-header,
    .quote-table-embed .qt-row,
    .quote-table-embed .qt-footer {
      display: grid;
      grid-template-columns: 120px 1fr 60px 100px 100px 100px;
      align-items: center;
    }
    .quote-table-embed .qt-header {
      background: #f9fafb;
      border-bottom: 2px solid #e5e7eb;
      font-weight: 600;
      font-size: 0.75rem;
      color: #374151;
    }
    .quote-table-embed .qt-cell {
      padding: 8px 12px;
    }
    .quote-table-embed .qt-right {
      text-align: right;
    }
    .quote-table-embed .qt-mono {
      font-family: monospace;
    }
    .quote-table-embed .qt-row {
      border-bottom: 1px solid #f3f4f6;
    }
    .quote-table-embed .qt-row:hover {
      background: #f9fafb;
    }
    .quote-table-embed .qt-group-header {
      padding: 10px 12px;
      font-weight: 600;
      background: #f0f0ff;
      color: #4f46e5;
      font-size: 0.78rem;
      border-bottom: 1px solid #e5e7eb;
    }
    .quote-table-embed .qt-footer {
      border-top: 2px solid #e5e7eb;
      font-weight: 600;
      background: #f9fafb;
    }
    .quote-table-embed .qt-span {
      grid-column: 1 / 6;
    }

    /* Quote table placeholder (template mode) */
    .qt-placeholder {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px 24px;
      background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
      border: 2px dashed #a5b4fc;
      border-radius: 8px;
      color: #4338ca;
      font-weight: 600;
      font-size: 0.9rem;
    }
    .qt-placeholder-icon {
      font-size: 1.3rem;
    }
    .qt-placeholder-hint {
      font-weight: 400;
      font-size: 0.75rem;
      color: #6366f1;
      margin-left: auto;
    }

    /* ===== Slash Command Menu ===== */
    .slash-menu {
      display: none;
      position: fixed;
      background: var(--surface, #fff);
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
      z-index: 70;
      width: 320px;
      max-height: 400px;
      overflow: hidden;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 0.15s ease, transform 0.15s ease;
    }
    .slash-menu.slash-menu-visible {
      opacity: 1;
      transform: translateY(0);
    }
    .slash-header {
      padding: 10px 14px 6px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-secondary, #6b7280);
    }
    .slash-search-hint {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 14px 8px;
      font-size: 0.8rem;
      color: var(--text-main, #111827);
      border-bottom: 1px solid var(--border, #e5e7eb);
    }
    .slash-search-icon {
      font-size: 0.75rem;
      opacity: 0.5;
    }
    .slash-items {
      max-height: 320px;
      overflow-y: auto;
      padding: 4px;
    }
    .slash-section-heading {
      font-size: 0.63rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary, #6b7280);
      padding: 8px 10px 3px;
      margin-top: 2px;
    }
    .slash-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      text-align: left;
      padding: 7px 10px;
      border: none;
      background: transparent;
      cursor: pointer;
      border-radius: 6px;
      font-size: 0.8rem;
      color: var(--text-main, #111827);
      transition: background 0.1s;
    }
    .slash-item:hover,
    .slash-item.slash-item-active {
      background: var(--bg, #f3f4f6);
    }
    .slash-item-special {
      background: linear-gradient(135deg, #eef2ff 0%, #dbeafe 100%);
      border: 1px solid #c7d2fe;
      margin: 4px 0;
    }
    .slash-item-special:hover,
    .slash-item-special.slash-item-active {
      background: linear-gradient(135deg, #e0e7ff 0%, #bfdbfe 100%);
    }
    .slash-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 600;
      flex-shrink: 0;
    }
    .slash-icon-var {
      background: #e0e7ff;
      color: #4338ca;
      font-family: monospace;
    }
    .slash-icon-doc {
      background: #fef3c7;
      color: #92400e;
      font-size: 0.85rem;
    }
    .slash-icon-table {
      background: #dbeafe;
      color: #1d4ed8;
      font-size: 1rem;
    }
    .slash-item-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
      flex: 1;
    }
    .slash-item-label {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .slash-item-desc {
      font-size: 0.65rem;
      color: var(--text-secondary, #6b7280);
      font-family: monospace;
    }
    .slash-item-badge {
      font-size: 0.6rem;
      color: var(--text-secondary, #6b7280);
      background: var(--bg, #f3f4f6);
      padding: 1px 6px;
      border-radius: 8px;
    }
    .slash-empty {
      padding: 16px;
      text-align: center;
      color: var(--text-secondary, #9ca3af);
      font-size: 0.8rem;
    }
  `;
  document.head.appendChild(style);
}
