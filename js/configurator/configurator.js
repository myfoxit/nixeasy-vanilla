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
import { createUnifiedGrid } from './unified-grid.js';
import { createSummaryCard } from './summary-card.js';
import { createContextBanner } from './context-banner.js';
import { createInstalledBasePanel } from './installed-base-panel.js';
import { createChangelogPanel } from './changelog-panel.js';
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
  // STATE
  // ======================================================
  let qId = quoteId;
  let quoteName = '';
  let templates = [];
  let templateName = '';
  let templateDesc = '';
  let editingTemplateId = templateId || null;
  let opportunity = null;
  let customer = null;
  let servicePacks = [];
  let installedBase = [];
  let installedBaseLoading = false;
  let showInstalledBase = false;

  // Sub-component instances
  let catalogPanelInstance = null;
  let unifiedGridInstance = null;   // ← replaces quoteLinesInstance + presentationGrid
  let summaryCardInstance = null;
  let contextBannerInstance = null;
  let installedBasePanelInstance = null;

  // Popover instances for cleanup
  let exportPopoverInstance = null;
  let loadPopoverInstance = null;
  let savePopoverInstance = null;

  // Changelog
  // Snapshot = { lineItems: [...], groups: [...] }
  let _savedSnapshot = { lineItems: [], groups: [] };
  let _slas = [];            // for SLA name resolution in diffs
  let changelogPanelInstance = null;

  /** Snapshot current grid state */
  function takeSnapshot() {
    const lineItems = unifiedGridInstance ? unifiedGridInstance.getLineItems() : [];
    const groups    = unifiedGridInstance ? unifiedGridInstance.getGroups()    : [];
    return {
      lineItems: lineItems.map(l => ({ ...l })),
      groups:    groups.map(g => ({ ...g })),
    };
  }

  /** Unique key for a line item */
  function lineKey(l) {
    return l.licenseId
      ? 'lic:' + l.licenseId
      : l.servicePackId
        ? 'sp:' + l.servicePackId
        : 'n:' + (l.name || '');
  }

  /** Compute what changed between two full snapshots */
  function diffSnapshots(before, after) {
    const changes = [];
    const bLines = before.lineItems || [];
    const aLines = after.lineItems  || [];
    const bMap   = new Map(bLines.map(l => [lineKey(l), l]));
    const aMap   = new Map(aLines.map(l => [lineKey(l), l]));

    // Removed items
    for (const [k, l] of bMap) {
      if (!aMap.has(k))
        changes.push({ action: 'item_removed', sku: l.sku || '', name: l.name || '' });
    }
    // Added items
    for (const [k, l] of aMap) {
      if (!bMap.has(k))
        changes.push({ action: 'item_added', sku: l.sku || '', name: l.name || '' });
    }
    // Field-level changes on existing items
    for (const [k, al] of aMap) {
      const bl = bMap.get(k);
      if (!bl) continue;

      if (al.name !== bl.name)
        changes.push({ action: 'name_changed', sku: al.sku || '', name: bl.name, old: bl.name, new: al.name });

      if (Math.abs((al.price || 0) - (bl.price || 0)) > 0.001)
        changes.push({ action: 'price_changed', sku: al.sku || '', name: al.name, old: bl.price, new: al.price });

      if ((al.amount || 1) !== (bl.amount || 1))
        changes.push({ action: 'qty_changed', sku: al.sku || '', name: al.name, old: bl.amount, new: al.amount });

      if (al.sla !== bl.sla) {
        const oldName = _slas.find(s => s.id === bl.sla)?.name || bl.sla || 'None';
        const newName = _slas.find(s => s.id === al.sla)?.name || al.sla || 'None';
        changes.push({ action: 'sla_changed', sku: al.sku || '', name: al.name, old: oldName, new: newName });
      }
    }

    // Group name changes
    const bGrps = new Map((before.groups || []).map(g => [g.id, g]));
    const aGrps = new Map((after.groups  || []).map(g => [g.id, g]));
    for (const [id, ag] of aGrps) {
      const bg = bGrps.get(id);
      if (bg && ag.name !== bg.name)
        changes.push({ action: 'group_renamed', old: bg.name, new: ag.name });
    }

    return changes;
  }

  // ======================================================
  // HELPERS — delegate to unifiedGridInstance
  // ======================================================

  function addItem(catalogItem) {
    if (unifiedGridInstance) unifiedGridInstance.addItem(catalogItem);
  }

  function addMeasurePointLicenses(distribution) {
    if (!unifiedGridInstance) return;
    distribution.forEach(d => {
      const lic = d.license || licenses.find(l => l.id === d.licenseId);
      if (lic) unifiedGridInstance.addItem({ type: 'license', item: { ...lic, _overrideQty: d.quantity } });
    });
  }

  function onSummaryChange(summary) {
    if (summaryCardInstance) summaryCardInstance.update(summary);
  }

  // ======================================================
  // SAVE / LOAD / EXPORT
  // ======================================================
  async function save() {
    if (!oppId) return;
    const lineItems = unifiedGridInstance ? unifiedGridInstance.getLineItems() : [];
    const groups    = unifiedGridInstance ? unifiedGridInstance.getGroups()    : [];
    const summary   = unifiedGridInstance ? unifiedGridInstance.getSummary()   : { hk: 0, vk: 0, monthly: 0 };
    const configToSave = { lineItems, groups, summary };
    const body = { opportunity: oppId, quote_data: configToSave };
    if (!isSuperUser() && currentUser?.id) body.created_by = currentUser.id;

    const isUpdate = !!qId;   // true = update, false = first create

    if (qId) {
      await pb.collection('quotes').update(qId, body);
    } else {
      const res = await pb.collection('quotes').create(body);
      qId = res.id;
    }

    // Write changelog (only for updates, not initial creation)
    const currentSnapshot = { lineItems, groups };
    if (isUpdate) {
      const changes = diffSnapshots(_savedSnapshot, currentSnapshot);
      if (changes.length > 0) {
        try {
          const clBody = { quote: qId, changes };
          if (!isSuperUser() && currentUser?.id) clBody.changed_by = currentUser.id;
          await pb.collection('quote_changelog').create(clBody);
        } catch (err) {
          console.error('Changelog write failed:', err.message, err);
        }
      }
    }

    // Update snapshot so next save diffs against current state
    _savedSnapshot = {
      lineItems: lineItems.map(l => ({ ...l })),
      groups:    groups.map(g => ({ ...g })),
    };
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
    const lineItems = unifiedGridInstance ? unifiedGridInstance.getLineItems() : [];
    const groups    = unifiedGridInstance ? unifiedGridInstance.getGroups()    : [];
    const res = await pb.collection('quote_templates').create({
      name, description: desc,
      template_data: { lineItems, groups }
    });
    templates = [res, ...templates];
    return true;
  }

  function loadFromTemplate(template) {
    if (!template.template_data || !unifiedGridInstance) return;
    const items  = Array.isArray(template.template_data.lineItems) ? template.template_data.lineItems : [];
    // support both old "containers" format and new "groups"
    const groups = template.template_data.groups || template.template_data.containers || [];
    unifiedGridInstance.loadItems(items, groups);
  }

  async function saveTemplate() {
    if (!templateName.trim()) {
      showToast('Please enter a template name', 'warning');
      return;
    }
    const lineItems = unifiedGridInstance ? unifiedGridInstance.getLineItems() : [];
    const groups    = unifiedGridInstance ? unifiedGridInstance.getGroups()    : [];
    const body = { name: templateName, description: templateDesc, template_data: { lineItems, groups } };
    if (editingTemplateId && editingTemplateId !== 'new') {
      await pb.collection('quote_templates').update(editingTemplateId, body);
    } else {
      const res = await pb.collection('quote_templates').create(body);
      editingTemplateId = res.id;
    }
  }

  async function handleExport(format) {
    const lineItems = unifiedGridInstance ? unifiedGridInstance.getLineItems() : [];
    const groups    = unifiedGridInstance ? unifiedGridInstance.getGroups()    : [];
    const configToExport = { lineItems, containers: groups, summary: unifiedGridInstance?.getSummary() || {} };
    const filename = isTemplateMode
      ? `template_${templateName || 'export'}`
      : `quote_${qId || 'new'}`;

    if (format === 'json') exportToJson(configToExport, filename);
    else if (format === 'csv') exportToCsv(configToExport, licenses, filename);
    else await exportToExcel(configToExport, licenses, filename);
  }

  // ======================================================
  // SUB-COMPONENT UPDATE (context banner + installed base)
  // ======================================================
  function updateSubComponents() {
    if (contextBannerInstance) {
      contextBannerInstance.update({
        opportunity, customer, installedBase, showInstalledBase,
        onToggleInstalledBase: () => {
          showInstalledBase = !showInstalledBase;
          renderInstalledBaseSection();
          if (contextBannerInstance) contextBannerInstance.update({ showInstalledBase });
        }
      });
    }
    if (installedBasePanelInstance) {
      installedBasePanelInstance.update({
        installedBase,
        isLoading: installedBaseLoading,
        customerName: customer?.name,
        referencedItems: [],
        onToggleItem: () => {},
        onToggleSite: () => {},
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
        referencedItems: [],
        onToggleItem: () => {},
        onToggleSite: () => {},
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
    // STICKY HEADER WITH WIZARD STEPS
    // =============================================
    const header = document.createElement('header');
    header.className = 'main-header';
    header.style.cssText = 'position:sticky;top:0;z-index:30;background:var(--surface);border-bottom:1px solid var(--border);padding:0.75rem 2rem;';

    // Top row: back + title + name + actions
    const headerTop = document.createElement('div');
    headerTop.style.cssText = 'display:flex;align-items:center;width:100%;';

    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display:flex;align-items:center;gap:12px;';

    // Back button
    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary';
    backBtn.style.cssText = 'padding:6px 10px;';
    backBtn.innerHTML = '&larr;';
    backBtn.title = 'Back';
    backBtn.addEventListener('click', () => {
      if (typeof onBack === 'function') onBack();
    });
    headerLeft.appendChild(backBtn);

    const titleEl = document.createElement('h2');
    titleEl.style.cssText = 'font-size:1.1rem;margin:0;';
    titleEl.textContent = isTemplateMode ? 'Template Editor' : 'Quote Builder';
    headerLeft.appendChild(titleEl);

    // Quote name input and sibling tabs removed — not needed

    headerTop.appendChild(headerLeft);

    // Actions (pushed to the right via margin-left:auto)
    const headerRight = document.createElement('div');
    headerRight.style.cssText = 'display:flex;gap:8px;align-items:center;margin-left:auto;';

    if (!isTemplateMode) {
      // Export (normal secondary button)
      const exportTrigger = document.createElement('button');
      exportTrigger.className = 'btn btn-secondary btn-sm';
      exportTrigger.textContent = 'Export';
      exportPopoverInstance = createPopover({ trigger: exportTrigger, content: () => buildExportContent(), align: 'right', width: 280 });
      headerRight.appendChild(exportPopoverInstance.element);

      // Save (visible button)
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-primary btn-sm';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', async () => {
        try { await save(); showToast('Saved', 'success'); } catch (err) { showToast('Failed to save', 'error'); }
      });
      headerRight.appendChild(saveBtn);

      // Hidden anchors for Load/Save Template popovers (opened from more menu)
      const loadAnchor = document.createElement('span');
      loadAnchor.style.cssText = 'position:relative;display:inline-block;width:0;overflow:visible;';
      loadPopoverInstance = createPopover({ trigger: loadAnchor, content: () => buildLoadTemplateContent(), align: 'right', width: 320 });
      headerRight.appendChild(loadPopoverInstance.element);

      const saveAnchor = document.createElement('span');
      saveAnchor.style.cssText = 'position:relative;display:inline-block;width:0;overflow:visible;';
      savePopoverInstance = createPopover({ trigger: saveAnchor, content: () => buildSaveTemplateContent(), align: 'right', width: 320 });
      headerRight.appendChild(savePopoverInstance.element);

      // More menu (ghost button: "More ⋮") — contains Load Template, Save as Template, Duplicate, History
      const moreTrigger = document.createElement('button');
      moreTrigger.className = 'btn btn-sm';
      moreTrigger.style.cssText = 'background:transparent;border:none;cursor:pointer;color:var(--text-secondary);transition:background 0.15s;font-weight:500;gap:4px;';
      moreTrigger.innerHTML = 'More <span style="font-size:1.1rem;line-height:1;">⋮</span>';
      moreTrigger.title = 'More actions';
      moreTrigger.addEventListener('mouseenter', () => { moreTrigger.style.background = 'var(--hover-bg, #f3f4f6)'; });
      moreTrigger.addEventListener('mouseleave', () => { moreTrigger.style.background = 'transparent'; });

      const morePopover = createPopover({
        trigger: moreTrigger,
        content: () => {
          const menu = document.createElement('div');
          menu.style.padding = '4px';

          const menuItem = (label, icon, onClick) => {
            const btn = document.createElement('button');
            btn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:transparent;cursor:pointer;border-radius:6px;font-size:0.85rem;text-align:left;color:var(--text-main);transition:background 0.1s;white-space:nowrap;';
            btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--hover-bg, #f3f4f6)'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
            btn.innerHTML = icon + ' ' + label;
            btn.addEventListener('click', () => { morePopover.close(); onClick(); });
            return btn;
          };

          // Load Template
          menu.appendChild(menuItem(
            'Load Template',
            '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:16px;height:16px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>',
            () => { loadPopoverInstance.open(); }
          ));

          // Save as Template
          menu.appendChild(menuItem(
            'Save as Template',
            '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:16px;height:16px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"/></svg>',
            () => { savePopoverInstance.open(); }
          ));

          // Duplicate (only if quote exists)
          if (qId) {
            menu.appendChild(menuItem(
              'Duplicate',
              '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:16px;height:16px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg>',
              async () => {
                try {
                  await save();
                  const orig = await pb.collection('quotes').getOne(qId);
                  const newName = (orig.name || quoteName || 'Untitled') + ' (copy)';
                  const body = { opportunity: oppId, quote_data: orig.quote_data };
                  try { body.name = newName; } catch (_) {}
                  if (!isSuperUser() && currentUser?.id) body.created_by = currentUser.id;
                  const dup = await pb.collection('quotes').create(body);
                  showToast(`Duplicated as "${newName}"`, 'success');
                  navigate(`/opportunities/${oppId}/quotes/${dup.id}`);
                } catch (err) {
                  showToast('Failed: ' + (err.message || 'Unknown'), 'error');
                }
              }
            ));
          }

          // History
          menu.appendChild(menuItem(
            'History',
            '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:16px;height:16px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
            () => {
              if (!qId) { showToast('Save the quote first to view history', 'info'); return; }
              if (changelogPanelInstance) {
                changelogPanelInstance.destroy();
                changelogPanelInstance = null;
                return;
              }
              changelogPanelInstance = createChangelogPanel({
                quoteId: qId,
                onClose: () => { changelogPanelInstance?.destroy(); changelogPanelInstance = null; },
              });
            }
          ));

          return menu;
        },
        align: 'right',
        width: 200
      });
      headerRight.appendChild(morePopover.element);
    } else {
      const saveTplBtn = document.createElement('button');
      saveTplBtn.className = 'btn btn-primary btn-sm';
      saveTplBtn.textContent = 'Save Template';
      saveTplBtn.addEventListener('click', async () => {
        try { await saveTemplate(); showToast('Template saved', 'success'); } catch (err) { showToast('Failed', 'error'); }
      });
      headerRight.appendChild(saveTplBtn);
    }

    headerTop.appendChild(headerRight);
    header.appendChild(headerTop);

    container.appendChild(header);

    // =============================================
    // CONTEXT BANNER (quote mode only)
    // =============================================
    if (!isTemplateMode) {
      contextBannerInstance = createContextBanner({
        opportunity, customer, installedBase, showInstalledBase,
        onToggleInstalledBase: () => {
          showInstalledBase = !showInstalledBase;
          renderInstalledBaseSection();
          if (contextBannerInstance) contextBannerInstance.update({ showInstalledBase });
        }
      });
      container.appendChild(contextBannerInstance.element);
    }

    // =============================================
    // INSTALLED BASE COLLAPSIBLE SECTION
    // =============================================
    installedBaseSectionEl = document.createElement('div');
    container.appendChild(installedBaseSectionEl);
    renderInstalledBaseSection();

    // =============================================
    // TEMPLATE INPUTS (template mode only)
    // =============================================
    if (isTemplateMode) {
      const tplSection = document.createElement('div');
      tplSection.className = 'p-6 pb-0';
      const tplCard = document.createElement('div');
      tplCard.className = 'card p-4 mb-0 grid grid-cols-2 gap-4';
      const nameGroup = document.createElement('div');
      const nameLabel = document.createElement('label');
      nameLabel.className = 'text-sm text-secondary mb-1 block';
      nameLabel.textContent = 'Template Name';
      nameGroup.appendChild(nameLabel);
      const nameInp = document.createElement('input');
      nameInp.value = templateName;
      nameInp.addEventListener('input', e => { templateName = e.target.value; });
      nameGroup.appendChild(nameInp);
      tplCard.appendChild(nameGroup);
      const descGroup = document.createElement('div');
      const descLabel = document.createElement('label');
      descLabel.className = 'text-sm text-secondary mb-1 block';
      descLabel.textContent = 'Description';
      descGroup.appendChild(descLabel);
      const descInp = document.createElement('input');
      descInp.value = templateDesc;
      descInp.addEventListener('input', e => { templateDesc = e.target.value; });
      descGroup.appendChild(descInp);
      tplCard.appendChild(descGroup);
      tplSection.appendChild(tplCard);
      container.appendChild(tplSection);
    }

    // =============================================
    // MAIN GRID: Catalog (left) + Unified grid (right)
    // =============================================
    const mainWrap = document.createElement('div');
    mainWrap.className = 'p-6';

    const gridRow = document.createElement('div');
    gridRow.className = 'grid grid-cols-12 gap-6';
    gridRow.style.alignItems = 'start';

    // Left: catalog panel (col-span-4)
    catalogPanelInstance = createCatalogPanel({
      licenses, servicePacks, hourlyRate,
      selectedContainerId: null, containers: [],
      onAddItem: addItem,
      onAddMeasurePointLicenses: addMeasurePointLicenses,
      onSelectContainer: () => {},
    });
    gridRow.appendChild(catalogPanelInstance.element);

    // Right: unified grid + summary card (col-span-8)
    const rightCol = document.createElement('div');
    rightCol.className = 'col-span-8 flex flex-col gap-6';

    unifiedGridInstance = createUnifiedGrid({
      licenses,
      servicePacks,
      isTemplateMode,
      hourlyRate,
      onSummaryChange,   // defined above: updates summaryCard + triggerAutoSave
    });
    rightCol.appendChild(unifiedGridInstance.element);

    summaryCardInstance = createSummaryCard({ hk: 0, vk: 0, monthly: 0 });
    rightCol.appendChild(summaryCardInstance.element);

    gridRow.appendChild(rightCol);
    mainWrap.appendChild(gridRow);
    container.appendChild(mainWrap);
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
    // Load SLAs (needed for changelog diff SLA name resolution)
    try {
      _slas = await pb.collection('service_level_agreements').getFullList({ sort: 'name' });
    } catch (err) {
      console.warn('Failed to load SLAs for changelog:', err.message);
    }

    // Load service packs
    try {
      const spList = await pb.collection('service_packs').getFullList({ sort: 'package_name' });
      servicePacks = spList;
      if (catalogPanelInstance) catalogPanelInstance.update({ servicePacks });
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
        if (q.quote_data && unifiedGridInstance) {
          const data = q.quote_data;
          const items  = Array.isArray(data.lineItems) ? data.lineItems : [];
          const groups = data.groups || data.containers || [];
          unifiedGridInstance.loadItems(items, groups);
          // Snapshot what we loaded so the first save diffs against it
          _savedSnapshot = {
            lineItems: items.map(l => ({ ...l })),
            groups:    groups.map(g => ({ ...g })),
          };
        }
      } catch (err) {
        console.error('Failed to load quote:', err);
      }
    }

    // Load existing template
    if (templateId && templateId !== 'new') {
      try {
        const t = await pb.collection('quote_templates').getOne(templateId);
        if (t.template_data && unifiedGridInstance) {
          const data = t.template_data;
          const items  = Array.isArray(data.lineItems) ? data.lineItems : [];
          const groups = data.groups || data.containers || [];
          unifiedGridInstance.loadItems(items, groups);
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
    if (changelogPanelInstance) changelogPanelInstance.destroy();
    if (unifiedGridInstance?.destroy) unifiedGridInstance.destroy();
    container.innerHTML = '';
  }

  return { destroy };
}
