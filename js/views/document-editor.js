// Document Editor View — Fluid Notion-style writing surface
// ONE continuous Quill editor on a white A4 page, floating toolbar on selection,
// variable chips as Quill embeds, right sidebar with text containers + page settings.

import { pb } from '../api.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { getAvailableVariables, getSampleVariableMap, buildVariableMap, resolveVariables } from '../lib/variable-resolver.js';
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
    if (isGenerateMode) {
      // In generate mode, insert resolved value directly (or table HTML)
      if (key === 'quote.table') {
        const tableHtml = resolveVariables('{{quote.table}}', variableMap, quoteData);
        quillInstance.clipboard.dangerouslyPasteHTML(range.index, tableHtml);
      } else {
        const resolved = variableMap[key] || `{{${key}}}`;
        quillInstance.insertText(range.index, resolved);
        quillInstance.setSelection(range.index + resolved.length);
      }
    } else {
      quillInstance.insertEmbed(range.index, 'variable', { key, label });
      quillInstance.setSelection(range.index + 1);
    }
  }

  /** Resolve .ql-variable chips in HTML string to real values */
  function resolveChips(html) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    tempDiv.querySelectorAll('.ql-variable').forEach(chip => {
      const key = (chip.getAttribute('data-variable') || '').trim();
      if (key === 'quote.table') {
        const tableHtml = resolveVariables('{{quote.table}}', variableMap, quoteData);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = tableHtml;
        chip.replaceWith(...wrapper.childNodes);
      } else if (variableMap[key]) {
        chip.replaceWith(document.createTextNode(variableMap[key]));
      } else {
        // Try resolving as mustache in case it's a special variable
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
  slashMenu.style.cssText = 'display:none;position:fixed;background:var(--surface,#fff);border:1px solid var(--border,#e5e7eb);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);z-index:70;width:300px;max-height:320px;overflow-y:auto;padding:4px;';
  document.body.appendChild(slashMenu);

  let slashActive = false;
  let slashStartIndex = -1;
  let slashFilter = '';

  function buildSlashItems(filter) {
    slashMenu.innerHTML = '';
    const f = (filter || '').toLowerCase();
    let hasItems = false;

    // Variables section
    const varGroups = getAvailableVariables();
    const flatVars = varGroups.flatMap(g => g.vars.map(v => ({ ...v, group: g.group })));
    const matchedVars = flatVars.filter(v => !f || v.label.toLowerCase().includes(f) || v.key.toLowerCase().includes(f));

    if (matchedVars.length > 0) {
      const heading = document.createElement('div');
      heading.style.cssText = 'font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);padding:6px 8px 2px;';
      heading.textContent = 'Variables';
      slashMenu.appendChild(heading);

      matchedVars.forEach(v => {
        hasItems = true;
        const item = document.createElement('button');
        item.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:6px 10px;border:none;background:transparent;cursor:pointer;border-radius:4px;font-size:0.8rem;color:var(--text-main);';
        const chip = document.createElement('span');
        chip.style.cssText = 'background:#e0e7ff;color:#4338ca;padding:1px 6px;border-radius:10px;font-size:0.7rem;font-weight:500;';
        chip.textContent = '{ x }';
        item.appendChild(chip);
        const label = document.createElement('span');
        label.textContent = v.label;
        item.appendChild(label);
        item.addEventListener('mouseenter', () => { item.style.background = 'var(--bg,#f9fafb)'; });
        item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectSlashItem(() => insertVariable(v.key, v.label));
        });
        slashMenu.appendChild(item);
      });
    }

    // Text containers section
    const matchedContainers = textContainers.filter(c => !f || c.name.toLowerCase().includes(f) || (c.category || '').toLowerCase().includes(f));
    if (matchedContainers.length > 0) {
      const heading = document.createElement('div');
      heading.style.cssText = 'font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);padding:6px 8px 2px;margin-top:4px;';
      heading.textContent = 'Text Containers';
      slashMenu.appendChild(heading);

      matchedContainers.forEach(c => {
        hasItems = true;
        const item = document.createElement('button');
        item.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:6px 10px;border:none;background:transparent;cursor:pointer;border-radius:4px;font-size:0.8rem;color:var(--text-main);';
        const icon = document.createElement('span');
        icon.style.cssText = 'background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:10px;font-size:0.7rem;font-weight:500;';
        icon.textContent = '📄';
        item.appendChild(icon);
        const label = document.createElement('span');
        label.textContent = c.name;
        item.appendChild(label);
        if (c.category) {
          const badge = document.createElement('span');
          badge.style.cssText = 'margin-left:auto;font-size:0.6rem;color:var(--text-secondary);';
          badge.textContent = c.category;
          item.appendChild(badge);
        }
        item.addEventListener('mouseenter', () => { item.style.background = 'var(--bg,#f9fafb)'; });
        item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectSlashItem(() => {
            let html = c.content || '';
            if (isGenerateMode && Object.keys(variableMap).length > 0) {
              html = resolveVariables(html, variableMap, quoteData);
              html = resolveChips(html);
            }
            quillInstance.clipboard.dangerouslyPasteHTML(quillInstance.getSelection(true).index, html);
            showToast(`Inserted "${c.name}"`, 'success');
          });
        });
        slashMenu.appendChild(item);
      });
    }

    if (!hasItems) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px;text-align:center;color:var(--text-secondary);font-size:0.8rem;';
      empty.textContent = f ? 'No results' : 'Type to search...';
      slashMenu.appendChild(empty);
    }
  }

  function selectSlashItem(callback) {
    // Remove the "/" and any typed filter text from the editor
    if (quillInstance && slashStartIndex >= 0) {
      const currentIndex = quillInstance.getSelection(true).index;
      const deleteLen = currentIndex - slashStartIndex;
      quillInstance.deleteText(slashStartIndex, deleteLen);
      quillInstance.setSelection(slashStartIndex);
    }
    closeSlashMenu();
    callback();
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
  }

  function closeSlashMenu() {
    slashMenu.style.display = 'none';
    slashActive = false;
    slashStartIndex = -1;
    slashFilter = '';
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

      // Detect "/" at current position
      if (range.index > 0) {
        const lastChar = quillInstance.getText(range.index - 1, 1);
        if (lastChar === '/') {
          // Check it's at start of line or after whitespace
          const prevChar = range.index > 1 ? quillInstance.getText(range.index - 2, 1) : '\n';
          if (prevChar === '\n' || prevChar === ' ' || prevChar === '\t' || range.index === 1) {
            openSlashMenu();
          }
        }
      }
    });

    // Close slash menu on Escape
    quillInstance.root.addEventListener('keydown', (e) => {
      if (slashActive && e.key === 'Escape') {
        e.preventDefault();
        closeSlashMenu();
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
        const range = quillInstance.getSelection(true);
        let html = c.content || '';
        // In generate mode, resolve variables before inserting
        if (isGenerateMode && Object.keys(variableMap).length > 0) {
          html = resolveVariables(html, variableMap, quoteData);
          html = resolveChips(html);
        }
        quillInstance.clipboard.dangerouslyPasteHTML(range.index, html);
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
              // Resolve {{mustache}} variables
              fullHtml = resolveVariables(fullHtml, variableMap, quoteData);

              // Resolve variable chips (ql-variable spans) with real values
              fullHtml = resolveChips(fullHtml);
            }

            quillInstance.root.innerHTML = fullHtml;
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
  `;
  document.head.appendChild(style);
}
