// Configurator View
// Ported from React Configurator.tsx + useConfigurator.ts
// Main configurator view that orchestrates all sub-components.
// Manages all state (line items, containers, summary, templates, installed base)
// and wires up the catalog panel, quote lines table, summary card, context banner,
// and installed base panel.

import { pb, isSuperUser } from '../api.js';
import { navigate } from '../router.js';
import { getState } from '../state.js';
import { showToast } from '../components/toast.js';
import { createPopover } from '../components/popover.js';
import { currency } from '../utils/format.js';
import { exportToJson, exportToCsv, exportToExcel } from '../utils/export.js';
import { createCatalogPanel } from './catalog-panel.js';
import { createQuoteLinesTable } from './quote-lines.js';
import { createSummaryCard } from './summary-card.js';
import { createContextBanner } from './context-banner.js';
import { createInstalledBasePanel } from './installed-base-panel.js';
import { createPresentationEditor } from './presentation-editor.js';
import {
  MEASURE_POINT_LICENSE_CONFIGS,
  calculateLicenseDistribution
} from '../utils/license-calculations.js';

const DEFAULT_MARGIN = 25;

/**
 * Create and mount the Configurator view.
 *
 * @param {HTMLElement} container - DOM element to mount into
 * @param {Object}  opts
 * @param {string|null}  opts.oppId       - Opportunity ID (quote mode)
 * @param {string|null}  opts.quoteId     - Existing quote ID
 * @param {string|null}  [opts.templateId] - Template ID (template mode)
 * @param {Function}     opts.onBack       - Navigate back callback
 * @returns {{ destroy: Function }}
 */
export function createConfiguratorView(container, { oppId, quoteId, templateId, onBack }) {
  container.innerHTML = '';
  const hourlyRate = 150;
  const licenses = getState('licenses') || [];
  const currentUser = pb.authStore.model;
  const isTemplateMode = !!templateId;

  // ======================================================
  // STATE (from useConfigurator.ts)
  // ======================================================
  let config = {
    lineItems: [],
    containers: [],
    summary: { hk: 0, vk: 0, monthly: 0 }
  };
  let qId = quoteId;
  let quoteName = '';
  let templates = [];
  let templateName = '';
  let templateDesc = '';
  let editingTemplateId = templateId || null;
  let opportunity = null;
  let customer = null;
  let servicePacks = [];
  let containers = [];
  let selectedContainerId = null;
  let installedBase = [];
  let installedBaseLoading = false;
  let referencedInstalledBase = [];
  let showInstalledBase = false;
  let presentationItems = null;   // Saved presentation layer (null = never edited)
  let presentationVersion = 0;    // Incremented on presentation save

  // Sub-component instances (populated in render)
  let catalogPanelInstance = null;
  let quoteLinesInstance = null;
  let summaryCardInstance = null;
  let contextBannerInstance = null;
  let installedBasePanelInstance = null;
  let presentationEditorInstance = null;

  // Popover instances for cleanup
  let exportPopoverInstance = null;
  let loadPopoverInstance = null;
  let savePopoverInstance = null;

  // ======================================================
  // HELPER: serialize containers for saving
  // ======================================================
  function serializeContainers() {
    return containers.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt
    }));
  }

  // ======================================================
  // SUMMARY RECALCULATION
  // ======================================================
  function recalcSummary() {
    const lineItems = config.lineItems || [];
    let hk = 0, vk = 0, monthly = 0;

    lineItems.forEach(item => {
      if (item.itemType === 'servicepack') {
        const lineHk = (item.hours || 0) * hourlyRate * item.amount;
        hk += lineHk;
        vk += lineHk * (1 + item.margin / 100);
      } else {
        const lic = licenses.find(l => l.id === item.licenseId);
        const sla = lic?.expand?.possible_SLAs?.find(s => s.id === item.sla);
        const lineHk = item.price * item.amount;
        const lineVk = lineHk * (1 + item.margin / 100);
        hk += lineHk;
        vk += lineVk;
        monthly += sla ? lineVk * (sla.monthly_percentage / 100) : 0;
      }
    });

    config.summary = { hk, vk, monthly };
  }

  // ======================================================
  // CONTAINER MANAGEMENT
  // ======================================================
  function addContainer(name, description) {
    const newContainer = {
      id: crypto.randomUUID(),
      name,
      description,
      createdAt: new Date()
    };
    containers = [...containers, newContainer];
    selectedContainerId = newContainer.id;
    updateSubComponents();
    return newContainer;
  }

  function updateContainer(id, name, description) {
    containers = containers.map(c =>
      c.id === id ? { ...c, name, description } : c
    );
    updateSubComponents();
  }

  function removeContainer(id) {
    config.lineItems = config.lineItems.filter(item => item.containerId !== id);
    const remaining = containers.filter(c => c.id !== id);
    if (selectedContainerId === id) {
      selectedContainerId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    }
    containers = remaining;
    recalcSummary();
    updateSubComponents();
  }

  function selectContainer(id) {
    selectedContainerId = id;
    updateSubComponents();
  }

  // ======================================================
  // LINE ITEM MANAGEMENT
  // ======================================================
  function addItem(catalogItem) {
    if (!selectedContainerId) {
      showToast('Please select a group first', 'warning');
      return;
    }

    if (catalogItem.type === 'license') {
      const lic = catalogItem.item;
      const possibleSLAs = lic.expand?.possible_SLAs || [];
      const defaultSla = possibleSLAs.find(s => s.name.toLowerCase().includes('essential'))?.id
        || possibleSLAs[0]?.id
        || '';

      const existingIndex = config.lineItems.findIndex(
        i => i.licenseId === lic.id && i.itemType !== 'servicepack' && i.containerId === selectedContainerId
      );

      if (existingIndex >= 0) {
        config.lineItems[existingIndex] = {
          ...config.lineItems[existingIndex],
          amount: config.lineItems[existingIndex].amount + 1
        };
      } else {
        config.lineItems = [...config.lineItems, {
          licenseId: lic.id,
          name: lic.name,
          sku: lic.sku,
          price: lic.initial_price,
          amount: 1,
          margin: DEFAULT_MARGIN,
          sla: defaultSla,
          itemType: 'license',
          containerId: selectedContainerId
        }];
      }
    } else {
      const sp = catalogItem.item;
      config.lineItems = [...config.lineItems, {
        licenseId: sp.id,
        name: sp.package_name,
        sku: sp.id,
        price: sp.estimated_hours * hourlyRate,
        amount: 1,
        margin: DEFAULT_MARGIN,
        sla: '',
        hours: sp.estimated_hours,
        itemType: 'servicepack',
        containerId: selectedContainerId
      }];
    }

    recalcSummary();
    updateSubComponents();
  }

  function updateItem(idx, field, val) {
    const newItems = [...config.lineItems];
    if (idx >= 0 && idx < newItems.length) {
      newItems[idx] = { ...newItems[idx], [field]: val };
      if (field === 'hours' && newItems[idx].itemType === 'servicepack') {
        newItems[idx].price = (val || 0) * hourlyRate;
      }
    }
    config.lineItems = newItems;
    recalcSummary();
    updateSubComponents();
  }

  function removeItem(idx) {
    const ni = [...config.lineItems];
    ni.splice(idx, 1);
    config.lineItems = ni;
    recalcSummary();
    updateSubComponents();
  }

  function addMeasurePointLicenses(distribution, containerId) {
    const targetContainerId = containerId || selectedContainerId;
    if (!targetContainerId) {
      showToast('Please select a group first', 'warning');
      return;
    }

    const newItems = [];

    for (const d of distribution) {
      if ('license' in d && d.license) {
        const possibleSLAs = d.license.expand?.possible_SLAs || [];
        const defaultSla = possibleSLAs.find(s => s.name.toLowerCase().includes('essential'))?.id
          || possibleSLAs[0]?.id
          || '';

        newItems.push({
          licenseId: d.license.id,
          name: d.license.name,
          sku: d.license.sku,
          price: d.license.initial_price,
          amount: d.quantity,
          margin: DEFAULT_MARGIN,
          sla: defaultSla,
          itemType: 'license',
          containerId: targetContainerId
        });
      } else if ('licenseId' in d && d.licenseId) {
        const license = licenses.find(l => l.id === d.licenseId);
        if (license) {
          const possibleSLAs = license.expand?.possible_SLAs || [];
          const defaultSla = possibleSLAs.find(s => s.name.toLowerCase().includes('essential'))?.id
            || possibleSLAs[0]?.id
            || '';

          newItems.push({
            licenseId: license.id,
            name: license.name,
            sku: license.sku,
            price: license.initial_price,
            amount: d.quantity,
            margin: DEFAULT_MARGIN,
            sla: defaultSla,
            itemType: 'license',
            containerId: targetContainerId
          });
        }
      }
    }

    config.lineItems = [...config.lineItems, ...newItems];
    recalcSummary();
    updateSubComponents();
  }

  // ======================================================
  // INSTALLED BASE
  // ======================================================
  function toggleInstalledBaseReference(item) {
    const exists = referencedInstalledBase.some(i => i.id === item.id);
    if (exists) {
      referencedInstalledBase = referencedInstalledBase.filter(i => i.id !== item.id);
    } else {
      referencedInstalledBase = [...referencedInstalledBase, item];
    }
    updateSubComponents();
  }

  function toggleSiteReference(siteItems) {
    const siteItemIds = new Set(siteItems.map(i => i.id));
    const allSelected = siteItems.every(item => referencedInstalledBase.some(i => i.id === item.id));

    if (allSelected) {
      referencedInstalledBase = referencedInstalledBase.filter(i => !siteItemIds.has(i.id));
    } else {
      const existingIds = new Set(referencedInstalledBase.map(i => i.id));
      const newItems = siteItems.filter(item => !existingIds.has(item.id));
      referencedInstalledBase = [...referencedInstalledBase, ...newItems];
    }
    updateSubComponents();
  }

  // ======================================================
  // SAVE / LOAD / EXPORT
  // ======================================================
  async function save() {
    if (!oppId) return;
    const configToSave = {
      ...config,
      containers: serializeContainers(),
      presentationItems: presentationItems || null,
      presentationVersion
    };
    const body = { opportunity: oppId, quote_data: configToSave };
    if (!isSuperUser() && currentUser?.id) body.created_by = currentUser.id;

    if (qId) {
      await pb.collection('quotes').update(qId, body);
    } else {
      const res = await pb.collection('quotes').create(body);
      qId = res.id;
    }
  }

  async function saveQuoteName() {
    if (!qId) return;
    try {
      await pb.collection('quotes').update(qId, { name: quoteName });
    } catch (err) {
      // name field might not exist yet — ignore silently
      console.warn('Could not save quote name:', err.message);
    }
  }

  async function saveAsTemplate(name, desc) {
    if (!name.trim()) {
      showToast('Please enter a template name', 'warning');
      return false;
    }
    const configToSave = {
      ...config,
      containers: serializeContainers(),
      presentationItems: presentationItems || null,
      presentationVersion
    };
    const res = await pb.collection('quote_templates').create({
      name,
      description: desc,
      template_data: configToSave
    });
    templates = [res, ...templates];
    return true;
  }

  function loadFromTemplate(template) {
    if (template.template_data) {
      const items = template.template_data.lineItems;
      const templateContainers = template.template_data.containers || [];
      const loadedContainers = templateContainers.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        createdAt: new Date(c.createdAt)
      }));

      config = {
        lineItems: Array.isArray(items) ? items.map(item => ({ ...item })) : [],
        containers: templateContainers,
        summary: { hk: 0, vk: 0, monthly: 0 }
      };
      containers = loadedContainers;
      selectedContainerId = loadedContainers.length > 0 ? loadedContainers[0].id : null;

      // Restore presentation state from template
      if (template.template_data.presentationItems) {
        presentationItems = template.template_data.presentationItems;
        presentationVersion = template.template_data.presentationVersion || 0;
      } else {
        presentationItems = null;
        presentationVersion = 0;
      }

      recalcSummary();
      updateSubComponents();
    }
  }

  async function saveTemplate() {
    if (!templateName.trim()) {
      showToast('Please enter a template name', 'warning');
      return;
    }
    const configToSave = {
      ...config,
      containers: serializeContainers(),
      presentationItems: presentationItems || null,
      presentationVersion
    };
    const body = { name: templateName, description: templateDesc, template_data: configToSave };
    if (editingTemplateId && editingTemplateId !== 'new') {
      await pb.collection('quote_templates').update(editingTemplateId, body);
    } else {
      const res = await pb.collection('quote_templates').create(body);
      editingTemplateId = res.id;
    }
  }

  async function handleExport(format) {
    const configToExport = {
      ...config,
      containers: serializeContainers()
    };
    const filename = isTemplateMode
      ? `template_${templateName || 'export'}`
      : `quote_${qId || 'new'}`;

    if (format === 'json') exportToJson(configToExport, filename);
    else if (format === 'csv') exportToCsv(configToExport, licenses, filename);
    else await exportToExcel(configToExport, licenses, filename);
  }

  // Dependency add handler
  function handleAddDependency(license) {
    if (!selectedContainerId) {
      showToast('Please select a group first', 'warning');
      return;
    }
    addItem({ type: 'license', item: license });
    showToast(`Added dependency: ${license.name}`, 'info');
  }

  // ======================================================
  // PRESENTATION EDITOR
  // ======================================================
  function openPresentationEditor() {
    if (config.lineItems.length === 0) {
      showToast('Add items to the quote before exporting', 'warning');
      return;
    }

    presentationEditorInstance = createPresentationEditor({
      config,
      licenses,
      presentationItems,
      presentationVersion,
      isTemplateMode,
      templateName,
      quoteId: qId,
      onClose: (items) => {
        presentationItems = items;
        presentationVersion++;
        presentationEditorInstance = null;
      },
      onExport: (format, items) => {
        presentationItems = items;
        presentationVersion++;
      }
    });

    document.body.appendChild(presentationEditorInstance.element);
  }

  // ======================================================
  // SUB-COMPONENT UPDATE (called after every state change)
  // ======================================================
  function updateSubComponents() {
    if (catalogPanelInstance) {
      catalogPanelInstance.update({
        licenses,
        servicePacks,
        hourlyRate,
        selectedContainerId,
        containers,
        onAddItem: addItem,
        onAddMeasurePointLicenses: addMeasurePointLicenses,
        onSelectContainer: selectContainer
      });
    }
    if (quoteLinesInstance) {
      quoteLinesInstance.update({
        lineItems: config.lineItems,
        licenses,
        isTemplateMode,
        onUpdateItem: updateItem,
        onRemoveItem: removeItem,
        onAddDependency: handleAddDependency,
        referencedInstalledBase,
        onRemoveInstalledBaseReference: toggleInstalledBaseReference
      });
    }
    if (summaryCardInstance) {
      summaryCardInstance.update(config.summary);
    }
    if (contextBannerInstance) {
      contextBannerInstance.update({
        opportunity,
        customer,
        installedBase,
        showInstalledBase,
        onToggleInstalledBase: () => {
          showInstalledBase = !showInstalledBase;
          renderInstalledBaseSection();
          if (contextBannerInstance) {
            contextBannerInstance.update({ showInstalledBase });
          }
        }
      });
    }
    if (installedBasePanelInstance) {
      installedBasePanelInstance.update({
        installedBase,
        isLoading: installedBaseLoading,
        customerName: customer?.name,
        referencedItems: referencedInstalledBase,
        onToggleItem: toggleInstalledBaseReference,
        onToggleSite: toggleSiteReference
      });
    }
  }

  // ======================================================
  // RENDER - Full layout
  // ======================================================

  // Installed base section container (for show/hide toggling)
  let installedBaseSectionEl = null;

  function renderInstalledBaseSection() {
    if (!installedBaseSectionEl) return;
    installedBaseSectionEl.innerHTML = '';

    if (!isTemplateMode && showInstalledBase) {
      installedBaseSectionEl.style.cssText = 'border-bottom:1px solid var(--border);max-height:40vh;overflow:hidden;background:var(--surface);';

      installedBasePanelInstance = createInstalledBasePanel({
        installedBase,
        isLoading: installedBaseLoading,
        customerName: customer?.name,
        referencedItems: referencedInstalledBase,
        onToggleItem: toggleInstalledBaseReference,
        onToggleSite: toggleSiteReference
      });
      installedBaseSectionEl.appendChild(installedBasePanelInstance.element);
    } else {
      installedBaseSectionEl.style.cssText = '';
      installedBasePanelInstance = null;
    }
  }

  function renderFull() {
    container.innerHTML = '';

    // =============================================
    // STICKY HEADER
    // =============================================
    const header = document.createElement('header');
    header.className = 'main-header';
    header.style.cssText = 'position:sticky;top:0;z-index:30;background:var(--surface);border-bottom:1px solid var(--border);padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center;';

    // Left side: title + subtitle
    const headerLeft = document.createElement('div');
    const titleH2 = document.createElement('h2');
    titleH2.textContent = isTemplateMode ? 'Template Editor' : 'Quote Builder';
    headerLeft.appendChild(titleH2);

    // Editable quote name (non-template mode)
    if (!isTemplateMode) {
      const nameRow = document.createElement('div');
      nameRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:2px;';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = quoteName;
      nameInput.placeholder = 'Quote name…';
      nameInput.style.cssText = 'border:none;border-bottom:1px solid transparent;background:transparent;font-size:0.82rem;color:var(--text-secondary);padding:2px 0;outline:none;min-width:120px;max-width:220px;transition:border-color 0.15s;';
      nameInput.addEventListener('focus', () => { nameInput.style.borderBottomColor = 'var(--primary)'; });
      nameInput.addEventListener('blur', () => {
        nameInput.style.borderBottomColor = 'transparent';
        const newName = nameInput.value.trim();
        if (newName !== quoteName) {
          quoteName = newName;
          saveQuoteName();
        }
      });
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') nameInput.blur();
      });
      nameRow.appendChild(nameInput);

      // Sibling quotes tabs (loaded async)
      const tabsWrap = document.createElement('div');
      tabsWrap.style.cssText = 'display:flex;gap:4px;margin-left:8px;';
      nameRow.appendChild(tabsWrap);

      if (oppId) {
        pb.collection('quotes').getFullList({
          filter: `opportunity = "${oppId}"`,
          sort: '-created',
          requestKey: null,
        }).then(siblings => {
          if (siblings.length <= 1) return;
          siblings.forEach(sq => {
            const tab = document.createElement('button');
            const isCurrent = sq.id === qId;
            tab.style.cssText = `padding:2px 8px;font-size:0.7rem;border-radius:4px;border:1px solid ${isCurrent ? 'var(--primary)' : 'var(--border)'};background:${isCurrent ? 'var(--primary-light)' : 'transparent'};color:${isCurrent ? 'var(--primary)' : 'var(--text-secondary)'};cursor:pointer;font-weight:${isCurrent ? '600' : '400'};white-space:nowrap;`;
            tab.textContent = sq.name || `Quote ${sq.id.slice(0, 6)}`;
            if (!isCurrent) {
              tab.addEventListener('click', () => navigate(`/opportunities/${oppId}/quotes/${sq.id}`));
            }
            tabsWrap.appendChild(tab);
          });
        }).catch(() => {});
      }

      headerLeft.appendChild(nameRow);
    } else {
      const subtitle = document.createElement('p');
      subtitle.className = 'text-sm text-secondary';
      subtitle.textContent = templateName || 'New Template';
      headerLeft.appendChild(subtitle);
    }

    header.appendChild(headerLeft);

    // Right side: buttons
    const headerRight = document.createElement('div');
    headerRight.className = 'flex gap-2';

    // Back button
    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary';
    backBtn.innerHTML = '&larr; Back';
    backBtn.addEventListener('click', () => {
      if (typeof onBack === 'function') onBack();
    });
    headerRight.appendChild(backBtn);

    // --- Export Button (opens Presentation Editor) ---
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-secondary';
    const exportSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    exportSvg.setAttribute('fill', 'none');
    exportSvg.setAttribute('viewBox', '0 0 24 24');
    exportSvg.setAttribute('stroke-width', '1.5');
    exportSvg.setAttribute('stroke', 'currentColor');
    exportSvg.style.cssText = 'width:16px;height:16px;margin-right:6px;';
    const exportPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    exportPath.setAttribute('stroke-linecap', 'round');
    exportPath.setAttribute('stroke-linejoin', 'round');
    exportPath.setAttribute('d', 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3');
    exportSvg.appendChild(exportPath);
    exportBtn.appendChild(exportSvg);
    exportBtn.appendChild(document.createTextNode('Export'));
    exportBtn.addEventListener('click', () => openPresentationEditor());
    headerRight.appendChild(exportBtn);

    // --- Quick Export Popover (direct export without presentation editor) ---
    const quickExportTrigger = document.createElement('button');
    quickExportTrigger.className = 'btn btn-secondary';
    quickExportTrigger.style.cssText = 'padding:6px 8px;font-size:0.75rem;';
    quickExportTrigger.title = 'Quick Export (skip editor)';
    const qeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    qeSvg.setAttribute('fill', 'none');
    qeSvg.setAttribute('viewBox', '0 0 24 24');
    qeSvg.setAttribute('stroke-width', '1.5');
    qeSvg.setAttribute('stroke', 'currentColor');
    qeSvg.style.cssText = 'width:14px;height:14px;';
    const qePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    qePath.setAttribute('stroke-linecap', 'round');
    qePath.setAttribute('stroke-linejoin', 'round');
    qePath.setAttribute('d', 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z');
    qeSvg.appendChild(qePath);
    quickExportTrigger.appendChild(qeSvg);

    exportPopoverInstance = createPopover({
      trigger: quickExportTrigger,
      content: () => buildExportContent(),
      align: 'right',
      width: 260
    });
    headerRight.appendChild(exportPopoverInstance.element);

    // --- Quote-mode buttons ---
    if (!isTemplateMode) {
      // Load Template Popover
      const loadTrigger = document.createElement('button');
      loadTrigger.className = 'btn btn-secondary';
      const loadSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      loadSvg.setAttribute('fill', 'none');
      loadSvg.setAttribute('viewBox', '0 0 24 24');
      loadSvg.setAttribute('stroke-width', '1.5');
      loadSvg.setAttribute('stroke', 'currentColor');
      loadSvg.style.cssText = 'width:16px;height:16px;margin-right:6px;';
      const loadPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      loadPath.setAttribute('stroke-linecap', 'round');
      loadPath.setAttribute('stroke-linejoin', 'round');
      loadPath.setAttribute('d', 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5');
      loadSvg.appendChild(loadPath);
      loadTrigger.appendChild(loadSvg);
      loadTrigger.appendChild(document.createTextNode('Load Template'));

      loadPopoverInstance = createPopover({
        trigger: loadTrigger,
        content: () => buildLoadTemplateContent(),
        align: 'right',
        width: 320
      });
      headerRight.appendChild(loadPopoverInstance.element);

      // Save as Template Popover
      const saveTplTrigger = document.createElement('button');
      saveTplTrigger.className = 'btn btn-secondary';
      const saveTplSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      saveTplSvg.setAttribute('fill', 'none');
      saveTplSvg.setAttribute('viewBox', '0 0 24 24');
      saveTplSvg.setAttribute('stroke-width', '1.5');
      saveTplSvg.setAttribute('stroke', 'currentColor');
      saveTplSvg.style.cssText = 'width:16px;height:16px;margin-right:6px;';
      const saveTplPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      saveTplPath.setAttribute('stroke-linecap', 'round');
      saveTplPath.setAttribute('stroke-linejoin', 'round');
      saveTplPath.setAttribute('d', 'M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z');
      saveTplSvg.appendChild(saveTplPath);
      saveTplTrigger.appendChild(saveTplSvg);
      saveTplTrigger.appendChild(document.createTextNode('Save as Template'));

      savePopoverInstance = createPopover({
        trigger: saveTplTrigger,
        content: () => buildSaveTemplateContent(),
        align: 'right',
        width: 320
      });
      headerRight.appendChild(savePopoverInstance.element);

      // Duplicate Quote button
      if (qId) {
        const dupQuoteBtn = document.createElement('button');
        dupQuoteBtn.className = 'btn btn-secondary';
        dupQuoteBtn.textContent = 'Duplicate';
        dupQuoteBtn.title = 'Save & duplicate this quote';
        dupQuoteBtn.addEventListener('click', async () => {
          try {
            dupQuoteBtn.disabled = true;
            dupQuoteBtn.textContent = 'Duplicating…';
            await save();
            const orig = await pb.collection('quotes').getOne(qId);
            const newName = (orig.name || quoteName || 'Untitled') + ' (copy)';
            const body = {
              opportunity: oppId,
              quote_data: orig.quote_data,
            };
            // Try setting name — field might not exist
            try { body.name = newName; } catch (_) {}
            if (!isSuperUser() && currentUser?.id) body.created_by = currentUser.id;
            const dup = await pb.collection('quotes').create(body);
            showToast(`Duplicated as "${newName}"`, 'success');
            navigate(`/opportunities/${oppId}/quotes/${dup.id}`);
          } catch (err) {
            showToast('Failed to duplicate: ' + (err.message || 'Unknown error'), 'error');
            dupQuoteBtn.disabled = false;
            dupQuoteBtn.textContent = 'Duplicate';
          }
        });
        headerRight.appendChild(dupQuoteBtn);
      }

      // Save Quote button
      const saveQuoteBtn = document.createElement('button');
      saveQuoteBtn.className = 'btn btn-primary';
      saveQuoteBtn.textContent = 'Save Quote';
      saveQuoteBtn.addEventListener('click', async () => {
        try {
          await save();
          showToast('Quote saved successfully', 'success');
        } catch (err) {
          showToast('Failed to save quote: ' + (err.message || 'Unknown error'), 'error');
        }
      });
      headerRight.appendChild(saveQuoteBtn);
    }

    // --- Template-mode save button ---
    if (isTemplateMode) {
      const saveTemplateBtn = document.createElement('button');
      saveTemplateBtn.className = 'btn btn-primary';
      saveTemplateBtn.textContent = 'Save Template';
      saveTemplateBtn.addEventListener('click', async () => {
        try {
          await saveTemplate();
          showToast('Template saved successfully', 'success');
        } catch (err) {
          showToast('Failed to save template: ' + (err.message || 'Unknown error'), 'error');
        }
      });
      headerRight.appendChild(saveTemplateBtn);
    }

    header.appendChild(headerRight);
    container.appendChild(header);

    // =============================================
    // CONTEXT BANNER (quote mode only)
    // =============================================
    if (!isTemplateMode) {
      contextBannerInstance = createContextBanner({
        opportunity,
        customer,
        installedBase,
        showInstalledBase,
        onToggleInstalledBase: () => {
          showInstalledBase = !showInstalledBase;
          renderInstalledBaseSection();
          if (contextBannerInstance) {
            contextBannerInstance.update({ showInstalledBase });
          }
        }
      });
      container.appendChild(contextBannerInstance.element);
    }

    // =============================================
    // INSTALLED BASE PANEL (collapsible)
    // =============================================
    installedBaseSectionEl = document.createElement('div');
    container.appendChild(installedBaseSectionEl);
    renderInstalledBaseSection();

    // =============================================
    // TEMPLATE NAME/DESC INPUTS (template mode)
    // =============================================
    if (isTemplateMode) {
      const tplInputSection = document.createElement('div');
      tplInputSection.className = 'p-6 pb-0';

      const tplCard = document.createElement('div');
      tplCard.className = 'card p-4 mb-0 grid grid-cols-2 gap-4';

      // Name input
      const nameGroup = document.createElement('div');
      const nameLabel = document.createElement('label');
      nameLabel.className = 'text-sm text-secondary mb-1 block';
      nameLabel.textContent = 'Template Name';
      nameGroup.appendChild(nameLabel);

      const nameInput = document.createElement('input');
      nameInput.value = templateName;
      nameInput.addEventListener('input', (e) => {
        templateName = e.target.value;
      });
      nameGroup.appendChild(nameInput);
      tplCard.appendChild(nameGroup);

      // Desc input
      const descGroup = document.createElement('div');
      const descLabel = document.createElement('label');
      descLabel.className = 'text-sm text-secondary mb-1 block';
      descLabel.textContent = 'Description';
      descGroup.appendChild(descLabel);

      const descInput = document.createElement('input');
      descInput.value = templateDesc;
      descInput.addEventListener('input', (e) => {
        templateDesc = e.target.value;
      });
      descGroup.appendChild(descInput);
      tplCard.appendChild(descGroup);

      tplInputSection.appendChild(tplCard);
      container.appendChild(tplInputSection);
    }

    // =============================================
    // 3-COLUMN GRID: Catalog (4) + Quote Lines & Summary (8)
    // =============================================
    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'p-6 h-full';

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-12 gap-6 h-full';
    grid.style.alignItems = 'start';

    // Catalog Panel (col-span-4)
    catalogPanelInstance = createCatalogPanel({
      licenses,
      servicePacks,
      hourlyRate,
      selectedContainerId,
      containers,
      onAddItem: addItem,
      onAddMeasurePointLicenses: addMeasurePointLicenses,
      onSelectContainer: selectContainer
    });
    grid.appendChild(catalogPanelInstance.element);

    // Right column (col-span-8)
    const rightCol = document.createElement('div');
    rightCol.className = 'col-span-8 flex flex-col gap-6';

    // Quote Lines Table (flat list)
    quoteLinesInstance = createQuoteLinesTable({
      lineItems: config.lineItems,
      licenses,
      isTemplateMode,
      onUpdateItem: updateItem,
      onRemoveItem: removeItem,
      onAddDependency: handleAddDependency,
      referencedInstalledBase,
      onRemoveInstalledBaseReference: toggleInstalledBaseReference
    });
    rightCol.appendChild(quoteLinesInstance.element);

    // Summary Card
    summaryCardInstance = createSummaryCard(config.summary);
    rightCol.appendChild(summaryCardInstance.element);

    grid.appendChild(rightCol);
    gridWrapper.appendChild(grid);
    container.appendChild(gridWrapper);
  }

  // ======================================================
  // POPOVER CONTENT BUILDERS
  // ======================================================

  function buildExportContent() {
    const div = document.createElement('div');
    div.style.padding = '8px';

    const heading = document.createElement('div');
    heading.style.cssText = 'padding:6px 8px;font-size:0.7rem;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;';
    heading.textContent = 'Export Format';
    div.appendChild(heading);

    const formats = [
      {
        name: 'JSON', desc: 'Raw data format', format: 'json', color: '#6366f1',
        iconPath: 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5'
      },
      {
        name: 'CSV', desc: 'Spreadsheet compatible', format: 'csv', color: '#22c55e',
        iconPath: 'M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125'
      },
      {
        name: 'Excel (.xlsx)', desc: 'With formulas & formatting', format: 'xlsx', color: '#059669',
        iconPath: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z'
      }
    ];

    formats.forEach(f => {
      const btn = document.createElement('button');
      btn.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border:none;background:transparent;cursor:pointer;border-radius:6px;font-size:0.875rem;text-align:left;transition:background 0.1s;';
      btn.addEventListener('mouseenter', () => { btn.style.background = '#f3f4f6'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
      btn.addEventListener('click', () => {
        handleExport(f.format);
        if (exportPopoverInstance) exportPopoverInstance.close();
        showToast(`Exported as ${f.name}`, 'success');
      });

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('stroke-width', '1.5');
      svg.setAttribute('stroke', 'currentColor');
      svg.style.cssText = `width:20px;height:20px;color:${f.color};`;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('d', f.iconPath);
      svg.appendChild(path);
      btn.appendChild(svg);

      const textDiv = document.createElement('div');
      const nameDiv = document.createElement('div');
      nameDiv.style.fontWeight = '500';
      nameDiv.textContent = f.name;
      const descDiv = document.createElement('div');
      descDiv.style.cssText = 'font-size:0.75rem;color:#6b7280;';
      descDiv.textContent = f.desc;
      textDiv.appendChild(nameDiv);
      textDiv.appendChild(descDiv);
      btn.appendChild(textDiv);

      div.appendChild(btn);
    });

    return div;
  }

  function buildLoadTemplateContent() {
    const div = document.createElement('div');

    // Search header
    const searchHeader = document.createElement('div');
    searchHeader.style.cssText = 'padding:12px;border-bottom:1px solid #f3f4f6;';

    const searchWrap = document.createElement('div');
    searchWrap.style.position = 'relative';

    const searchSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    searchSvg.setAttribute('fill', 'none');
    searchSvg.setAttribute('viewBox', '0 0 24 24');
    searchSvg.setAttribute('stroke-width', '1.5');
    searchSvg.setAttribute('stroke', 'currentColor');
    searchSvg.style.cssText = 'width:16px;height:16px;position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#9ca3af;';
    const searchPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    searchPath.setAttribute('stroke-linecap', 'round');
    searchPath.setAttribute('stroke-linejoin', 'round');
    searchPath.setAttribute('d', 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z');
    searchSvg.appendChild(searchPath);
    searchWrap.appendChild(searchSvg);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search templates...';
    searchInput.style.cssText = 'padding-left:32px;font-size:0.875rem;width:100%;';
    searchWrap.appendChild(searchInput);
    searchHeader.appendChild(searchWrap);
    div.appendChild(searchHeader);

    // Template list
    const listDiv = document.createElement('div');
    listDiv.style.cssText = 'max-height:280px;overflow-y:auto;';

    let currentSearch = '';

    function renderList() {
      listDiv.innerHTML = '';
      const filtered = templates.filter(t =>
        t.name.toLowerCase().includes(currentSearch.toLowerCase())
      );

      if (filtered.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.style.cssText = 'padding:16px;text-align:center;color:#6b7280;font-size:0.875rem;';
        emptyDiv.textContent = currentSearch ? 'No templates found' : 'No templates available';
        listDiv.appendChild(emptyDiv);
        return;
      }

      filtered.forEach(t => {
        const item = document.createElement('div');
        item.style.cssText = 'padding:10px 12px;cursor:pointer;border-bottom:1px solid #f9fafb;transition:background 0.1s;';
        item.addEventListener('mouseenter', () => { item.style.background = '#f9fafb'; });
        item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
        item.addEventListener('click', () => {
          loadFromTemplate(t);
          if (loadPopoverInstance) loadPopoverInstance.close();
          showToast(`Template "${t.name}" loaded`, 'info');
        });

        const nameDiv = document.createElement('div');
        nameDiv.style.cssText = 'font-weight:500;font-size:0.875rem;';
        nameDiv.textContent = t.name;
        item.appendChild(nameDiv);

        if (t.description) {
          const descDiv = document.createElement('div');
          descDiv.style.cssText = 'font-size:0.75rem;color:#6b7280;margin-top:2px;';
          descDiv.textContent = t.description;
          item.appendChild(descDiv);
        }

        const metaDiv = document.createElement('div');
        metaDiv.style.cssText = 'font-size:0.75rem;color:#9ca3af;margin-top:4px;';
        const countSpan = document.createElement('span');
        countSpan.style.cssText = 'display:inline-block;padding:2px 6px;border-radius:4px;background-color:#f3f4f6;color:#4b5563;';
        countSpan.textContent = `${t.template_data?.lineItems?.length || 0} items`;
        metaDiv.appendChild(countSpan);
        item.appendChild(metaDiv);

        listDiv.appendChild(item);
      });
    }

    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      renderList();
    });

    renderList();
    div.appendChild(listDiv);

    // Auto-focus search
    requestAnimationFrame(() => searchInput.focus());

    return div;
  }

  function buildSaveTemplateContent() {
    const div = document.createElement('div');
    div.style.padding = '16px';

    let saveName = '';
    let saveDesc = '';

    // Name field
    const nameGroup = document.createElement('div');
    nameGroup.style.marginBottom = '12px';
    const nameLabel = document.createElement('label');
    nameLabel.style.cssText = 'display:block;font-size:0.7rem;font-weight:500;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;';
    nameLabel.textContent = 'Template Name *';
    nameGroup.appendChild(nameLabel);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'e.g., Standard Office Setup';
    nameInput.style.cssText = 'font-size:0.875rem;width:100%;';
    nameInput.addEventListener('input', (e) => { saveName = e.target.value; });
    nameGroup.appendChild(nameInput);
    div.appendChild(nameGroup);

    // Description field
    const descGroup = document.createElement('div');
    descGroup.style.marginBottom = '16px';
    const descLabel = document.createElement('label');
    descLabel.style.cssText = 'display:block;font-size:0.7rem;font-weight:500;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;';
    descLabel.textContent = 'Description';
    descGroup.appendChild(descLabel);

    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.placeholder = 'Optional description...';
    descInput.style.cssText = 'font-size:0.875rem;width:100%;';
    descInput.addEventListener('input', (e) => { saveDesc = e.target.value; });
    descGroup.appendChild(descInput);
    div.appendChild(descGroup);

    // Button row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.style.flex = '1';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (savePopoverInstance) savePopoverInstance.close();
    });
    btnRow.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.style.flex = '1';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      try {
        const result = await saveAsTemplate(saveName, saveDesc);
        if (result) {
          if (savePopoverInstance) savePopoverInstance.close();
          showToast('Template created successfully', 'success');
        }
      } catch (err) {
        showToast('Failed to create template: ' + (err.message || 'Unknown error'), 'error');
      }
    });
    btnRow.appendChild(saveBtn);
    div.appendChild(btnRow);

    // Auto-focus name input
    requestAnimationFrame(() => nameInput.focus());

    return div;
  }

  // ======================================================
  // DATA LOADING (mirrors useConfigurator useEffects)
  // ======================================================

  async function loadInitialData() {
    // Load service packs
    try {
      const spList = await pb.collection('service_packs').getFullList({ sort: 'package_name' });
      servicePacks = spList;
      updateSubComponents();
    } catch (err) {
      console.error('Failed to load service packs:', err);
    }

    // Load templates
    try {
      const tplList = await pb.collection('quote_templates').getFullList({ sort: '-created' });
      templates = tplList;
    } catch (err) {
      console.error('Failed to load templates:', err);
    }

    // Load opportunity + customer (quote mode)
    if (oppId && !isTemplateMode) {
      try {
        const opp = await pb.collection('opportunities').getOne(oppId, { expand: 'customer' });
        opportunity = opp;
        if (opp.expand?.customer) customer = opp.expand.customer;
        updateSubComponents();
        // After customer is loaded, fetch installed base
        if (customer?.id) {
          loadInstalledBase(customer.id);
        }
      } catch (err) {
        console.error('Failed to load opportunity:', err);
      }
    }

    // Load existing quote
    if (quoteId) {
      try {
        const q = await pb.collection('quotes').getOne(quoteId);
        quoteName = q.name || '';
        if (q.quote_data) {
          const data = q.quote_data;
          const loadedContainers = (data.containers || []).map(c => ({
            id: c.id,
            name: c.name,
            description: c.description,
            createdAt: new Date(c.createdAt)
          }));
          config = {
            lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
            containers: data.containers || [],
            summary: data.summary || { hk: 0, vk: 0, monthly: 0 }
          };
          containers = loadedContainers;
          if (loadedContainers.length > 0) {
            selectedContainerId = loadedContainers[0].id;
          }
          // Restore presentation state
          if (data.presentationItems) {
            presentationItems = data.presentationItems;
            presentationVersion = data.presentationVersion || 0;
          }
          recalcSummary();
          updateSubComponents();
        }
      } catch (err) {
        console.error('Failed to load quote:', err);
      }
    }

    // Load existing template
    if (templateId && templateId !== 'new') {
      try {
        const t = await pb.collection('quote_templates').getOne(templateId);
        if (t.template_data) {
          const data = t.template_data;
          const loadedContainers = (data.containers || []).map(c => ({
            id: c.id,
            name: c.name,
            description: c.description,
            createdAt: new Date(c.createdAt)
          }));
          config = {
            lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
            containers: data.containers || [],
            summary: data.summary || { hk: 0, vk: 0, monthly: 0 }
          };
          containers = loadedContainers;
          if (loadedContainers.length > 0) {
            selectedContainerId = loadedContainers[0].id;
          }
          // Restore presentation state
          if (data.presentationItems) {
            presentationItems = data.presentationItems;
            presentationVersion = data.presentationVersion || 0;
          }
          recalcSummary();
        }
        templateName = t.name || '';
        templateDesc = t.description || '';
        editingTemplateId = t.id;
        updateSubComponents();
      } catch (err) {
        console.error('Failed to load template:', err);
      }
    }
  }

  async function loadInstalledBase(customerId) {
    installedBaseLoading = true;
    updateSubComponents();

    try {
      const items = await pb.collection('installed_base').getFullList({
        filter: `customer = "${customerId}"`,
        expand: 'license,support,installed_site',
        sort: 'installed_site,license.name'
      });

      // Group by installed_site
      const siteMap = new Map();
      items.forEach(item => {
        const siteId = item.installed_site || 'unknown';
        if (!siteMap.has(siteId)) siteMap.set(siteId, []);
        siteMap.get(siteId).push(item);
      });

      // Convert to array with expiry calculations
      const now = new Date();
      const groups = Array.from(siteMap.entries()).map(([siteId, siteItems]) => {
        let earliestExpiry = null;
        let isExpired = false;

        siteItems.forEach(item => {
          if (item.support_start && item.contract_term) {
            const startDate = new Date(item.support_start);
            const expiryDate = new Date(startDate);
            expiryDate.setMonth(expiryDate.getMonth() + item.contract_term);

            if (expiryDate < now) isExpired = true;
            if (!earliestExpiry || expiryDate < earliestExpiry) earliestExpiry = expiryDate;
          }
        });

        const siteName = siteItems[0]?.expand?.installed_site?.name || 'Unknown Site';

        return { siteId, siteName, items: siteItems, isExpired, earliestExpiry };
      });

      // Sort: expired first, then by site name
      groups.sort((a, b) => {
        if (a.isExpired && !b.isExpired) return -1;
        if (!a.isExpired && b.isExpired) return 1;
        return a.siteName.localeCompare(b.siteName);
      });

      installedBase = groups;
    } catch (err) {
      console.error('Failed to load installed base:', err);
    } finally {
      installedBaseLoading = false;
      updateSubComponents();
    }
  }

  // ======================================================
  // INIT
  // ======================================================
  renderFull();
  loadInitialData();

  // ======================================================
  // CLEANUP
  // ======================================================
  function destroy() {
    if (exportPopoverInstance) exportPopoverInstance.destroy();
    if (loadPopoverInstance) loadPopoverInstance.destroy();
    if (savePopoverInstance) savePopoverInstance.destroy();
    if (presentationEditorInstance) presentationEditorInstance.destroy();
    container.innerHTML = '';
  }

  return { destroy };
}
