// Wizard Configurator View
// Step-by-step wizard alternative to the grid configurator.
// Works with the same quote_data format: { lineItems, groups, summary }

import { pb, isSuperUser } from '../api.js';
import { getState } from '../state.js';
import { showToast } from '../components/toast.js';
import { createStepConfiguration } from './wizard/step-configuration.js';
import { createStepSla } from './wizard/step-sla.js';
import { createStepServices } from './wizard/step-services.js';
import { createStepDesign } from './wizard/step-design.js';
import { createStepSummary } from './wizard/step-summary.js';

const STEPS = [
  { id: 'configuration', label: 'Configuration', num: 1 },
  { id: 'sla',           label: 'SLA',           num: 2 },
  { id: 'services',      label: 'Services',      num: 3 },
  { id: 'design',        label: 'Design',        num: 4 },
  { id: 'summary',       label: 'Summary',       num: 5 },
];

/**
 * Create and mount the Wizard Configurator view.
 *
 * @param {HTMLElement} container - DOM element to mount into
 * @param {Object}  opts
 * @param {string|null}  opts.oppId       - Opportunity ID (quote mode)
 * @param {string|null}  opts.quoteId     - Existing quote ID
 * @param {string|null}  [opts.templateId] - Template ID (template mode)
 * @param {Function}     opts.onBack       - Navigate back callback
 * @param {Function}     opts.onSwitchView - Switch to grid view
 * @returns {{ destroy: Function }}
 */
export function createWizardConfiguratorView(container, { oppId, quoteId, templateId, onBack, onSwitchView }) {
  container.innerHTML = '';
  const hourlyRate = 150;
  const licenses = getState('licenses') || [];
  const currentUser = pb.authStore.model;

  let qId = quoteId;
  let currentStep = 0; // index into STEPS
  let stepInstance = null;

  // Shared mutable state — all steps read/write this
  const wizardState = {
    lineItems: [],
    groups: [],
  };

  let servicePacks = [];

  // ── DOM refs ─────────────────────────────────────────
  let stepNavEl = null;
  let stepContentEl = null;

  // ── Data Loading ─────────────────────────────────────
  async function loadData() {
    try {
      servicePacks = await pb.collection('service_packs').getFullList({ sort: 'package_name' });
    } catch (err) {
      console.error('Failed to load service packs:', err);
    }

    if (qId) {
      try {
        const quote = await pb.collection('quotes').getOne(qId);
        const qd = quote.quote_data || {};
        wizardState.lineItems = Array.isArray(qd.lineItems) ? qd.lineItems : [];
        wizardState.groups = Array.isArray(qd.groups) ? qd.groups : [];
      } catch (err) {
        console.error('Failed to load quote:', err);
        showToast('Failed to load quote', 'error');
      }
    } else if (templateId) {
      try {
        const tpl = await pb.collection('quote_templates').getOne(templateId);
        const td = tpl.template_data || {};
        wizardState.lineItems = Array.isArray(td.lineItems) ? td.lineItems : [];
        wizardState.groups = Array.isArray(td.groups) ? td.groups : [];
      } catch (err) {
        console.error('Failed to load template:', err);
      }
    }

    renderStep();
  }

  // ── Save ─────────────────────────────────────────────
  async function save() {
    if (!oppId) return;
    const summary = computeSummary();
    const body = {
      opportunity: oppId,
      quote_data: { lineItems: wizardState.lineItems, groups: wizardState.groups, summary },
    };
    if (!isSuperUser() && currentUser?.id) body.created_by = currentUser.id;

    try {
      if (qId) {
        await pb.collection('quotes').update(qId, body);
      } else {
        const res = await pb.collection('quotes').create(body);
        qId = res.id;
      }
      showToast('Saved', 'success');
    } catch (err) {
      showToast('Failed to save: ' + (err.message || ''), 'error');
    }
  }

  function computeSummary() {
    let hk = 0, vk = 0, monthly = 0;
    for (const item of wizardState.lineItems) {
      if (item.itemType === 'servicepack') {
        const lhk = (item.hours || 0) * hourlyRate * item.amount;
        hk += lhk;
        vk += lhk * (1 + (item.margin || 0) / 100);
      } else {
        const lhk = item.price * item.amount;
        const lvk = lhk * (1 + (item.margin || 0) / 100);
        hk += lhk;
        vk += lvk;
        if (item.sla && item.slaMonthly) {
          monthly += lvk * (item.slaMonthly / 100);
        }
      }
    }
    return { hk, vk, monthly };
  }

  function onStateChange() {
    // no-op for now — steps call this after mutations
  }

  // ── Step Navigation ──────────────────────────────────
  function goToStep(idx) {
    if (idx < 0 || idx >= STEPS.length) return;
    currentStep = idx;
    renderStepNav();
    renderStep();
  }

  function renderStepNav() {
    if (!stepNavEl) return;
    stepNavEl.innerHTML = '';

    STEPS.forEach((step, idx) => {
      const tab = document.createElement('button');
      const isActive = idx === currentStep;
      const isPast = idx < currentStep;

      tab.style.cssText = `
        display:flex;align-items:center;gap:4px;padding:4px 10px;border:none;
        background:${isActive ? 'var(--primary)' : 'transparent'};
        color:${isActive ? 'white' : isPast ? 'var(--primary)' : 'var(--text-secondary)'};
        font-weight:${isActive ? '600' : '500'};font-size:0.75rem;cursor:pointer;
        border-radius:4px;transition:all 0.15s;white-space:nowrap;
      `;

      const numBadge = document.createElement('span');
      numBadge.style.cssText = `
        display:inline-flex;align-items:center;justify-content:center;
        width:18px;height:18px;border-radius:50%;font-size:0.65rem;font-weight:700;
        background:${isActive ? 'rgba(255,255,255,0.25)' : isPast ? 'var(--primary-light)' : 'var(--bg)'};
        color:${isActive ? 'white' : isPast ? 'var(--primary)' : 'var(--text-secondary)'};
        border:${isPast ? '1px solid var(--primary)' : 'none'};
      `;
      numBadge.textContent = isPast ? '\u2713' : step.num;
      tab.appendChild(numBadge);

      const label = document.createElement('span');
      label.textContent = step.label;
      tab.appendChild(label);

      tab.addEventListener('mouseenter', () => {
        if (!isActive) tab.style.background = 'var(--surface-hover)';
      });
      tab.addEventListener('mouseleave', () => {
        if (!isActive) tab.style.background = 'transparent';
      });
      tab.addEventListener('click', () => goToStep(idx));

      stepNavEl.appendChild(tab);
    });
  }

  function renderStep() {
    if (!stepContentEl) return;
    stepContentEl.innerHTML = '';

    const stepDef = STEPS[currentStep];
    const opts = {
      licenses,
      servicePacks,
      hourlyRate,
      wizardState,
      onStateChange,
      quoteId: qId,
      oppId,
    };

    switch (stepDef.id) {
      case 'configuration':
        stepInstance = createStepConfiguration(opts);
        break;
      case 'sla':
        stepInstance = createStepSla(opts);
        break;
      case 'services':
        stepInstance = createStepServices(opts);
        break;
      case 'design':
        stepInstance = createStepDesign(opts);
        break;
      case 'summary':
        stepInstance = createStepSummary(opts);
        break;
    }

    if (stepInstance) {
      stepContentEl.appendChild(stepInstance.element);
    }

    // Bottom nav buttons
    const navBar = document.createElement('div');
    navBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 0;flex-shrink:0;';

    const leftNav = document.createElement('div');
    if (currentStep > 0) {
      const backBtn = document.createElement('button');
      backBtn.className = 'btn btn-secondary';
      backBtn.innerHTML = '&larr; Back';
      backBtn.addEventListener('click', () => goToStep(currentStep - 1));
      leftNav.appendChild(backBtn);
    }
    navBar.appendChild(leftNav);

    const rightNav = document.createElement('div');
    if (currentStep < STEPS.length - 1) {
      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn btn-primary';
      nextBtn.innerHTML = 'Next &rarr;';
      nextBtn.addEventListener('click', () => goToStep(currentStep + 1));
      rightNav.appendChild(nextBtn);
    }
    navBar.appendChild(rightNav);

    stepContentEl.appendChild(navBar);
  }

  // ── Full Layout ──────────────────────────────────────
  function renderFull() {
    container.innerHTML = '';

    // Header
    const header = document.createElement('header');
    header.className = 'main-header';
    header.style.cssText = 'position:sticky;top:0;z-index:30;background:var(--surface);border-bottom:1px solid var(--border);padding:0.75rem 2rem;';

    // Top row
    const headerTop = document.createElement('div');
    headerTop.style.cssText = 'display:flex;align-items:center;width:100%;';

    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display:flex;align-items:center;gap:12px;';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary';
    backBtn.style.cssText = 'padding:6px 10px;';
    backBtn.innerHTML = '&larr;';
    backBtn.title = 'Back';
    backBtn.addEventListener('click', () => { if (typeof onBack === 'function') onBack(); });
    headerLeft.appendChild(backBtn);

    const titleEl = document.createElement('h2');
    titleEl.style.cssText = 'font-size:1.1rem;margin:0;';
    titleEl.textContent = 'Quote Wizard';
    headerLeft.appendChild(titleEl);

    headerTop.appendChild(headerLeft);

    // Right: view toggle + save + step nav — ALL in one row
    const headerRight = document.createElement('div');
    headerRight.style.cssText = 'display:flex;gap:8px;align-items:center;margin-left:auto;';

    // Save
    if (oppId) {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-primary btn-sm';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', save);
      headerRight.appendChild(saveBtn);
    }

    // Separator between buttons and step nav
    const sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:24px;background:var(--border);margin:0 4px;';
    headerRight.appendChild(sep);

    // Step navigation — inline with buttons
    stepNavEl = document.createElement('div');
    stepNavEl.style.cssText = 'display:flex;gap:2px;align-items:center;';
    headerRight.appendChild(stepNavEl);

    headerTop.appendChild(headerRight);
    header.appendChild(headerTop);

    container.appendChild(header);

    // Step content area
    stepContentEl = document.createElement('div');
    stepContentEl.style.cssText = 'padding:1.5rem 2rem;display:flex;flex-direction:column;';
    container.appendChild(stepContentEl);

    renderStepNav();
  }

  // ── Init ─────────────────────────────────────────────
  renderFull();
  loadData();

  return {
    destroy() {
      container.innerHTML = '';
    },
  };
}
