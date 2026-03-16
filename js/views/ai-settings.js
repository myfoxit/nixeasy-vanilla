/**
 * AI Settings View - Configure AI providers (OpenAI, Anthropic, Ollama, etc.)
 */

import { showToast } from '../components/toast.js';

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI', needsKey: true, needsUrl: false, defaultUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic Claude', needsKey: true, needsUrl: false, defaultUrl: 'https://api.anthropic.com' },
  { value: 'azure', label: 'Azure OpenAI', needsKey: true, needsUrl: true, defaultUrl: '' },
  { value: 'ollama', label: 'Ollama (Local)', needsKey: false, needsUrl: true, defaultUrl: 'http://localhost:11434' },
  { value: 'llamacpp', label: 'llama.cpp (Local)', needsKey: false, needsUrl: true, defaultUrl: 'http://localhost:8081/v1' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)', needsKey: true, needsUrl: true, defaultUrl: '' },
];

export function createAiSettingsView(container) {
  container.innerHTML = '';

  let providers = [];
  let editingId = null;

  // --- Page wrapper ---
  const page = document.createElement('div');
  page.style.cssText = 'max-width:720px;margin:0 auto;padding:32px 24px;';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom:24px;';
  header.innerHTML = `
    <h1 style="font-size:1.5rem;font-weight:700;color:var(--text-main);margin:0 0 4px 0;">AI Settings</h1>
    <p style="font-size:0.875rem;color:var(--text-secondary);margin:0;">Configure AI providers for the chat assistant.</p>
  `;
  page.appendChild(header);

  // Provider list container
  const listSection = document.createElement('div');
  listSection.id = 'provider-list';
  page.appendChild(listSection);

  // Add provider button
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary btn-sm';
  addBtn.style.marginTop = '16px';
  addBtn.textContent = '+ Add Provider';
  addBtn.addEventListener('click', () => showForm(null));
  page.appendChild(addBtn);

  // Form container (hidden by default)
  const formSection = document.createElement('div');
  formSection.id = 'provider-form';
  formSection.style.display = 'none';
  page.appendChild(formSection);

  container.appendChild(page);

  // --- Load providers ---
  async function load() {
    try {
      const res = await fetch('/ai/providers');
      providers = await res.json();
    } catch {
      providers = [];
    }
    renderList();
  }

  function renderList() {
    listSection.innerHTML = '';

    if (providers.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = `
        text-align:center;padding:48px 24px;background:var(--bg);
        border:1px dashed var(--border);border-radius:12px;color:var(--text-secondary);
      `;
      empty.innerHTML = `
        <div style="font-size:2rem;margin-bottom:8px;">&#129302;</div>
        <div style="font-weight:500;color:var(--text-main);margin-bottom:4px;">No AI providers configured</div>
        <div style="font-size:0.8rem;">Add an API provider to start using the AI assistant.</div>
      `;
      listSection.appendChild(empty);
      return;
    }

    providers.forEach(p => {
      const card = document.createElement('div');
      card.style.cssText = `
        display:flex;align-items:center;gap:12px;padding:14px 16px;
        background:var(--bg);border:1px solid var(--border);border-radius:10px;
        margin-bottom:8px;
      `;

      // Icon
      const icon = document.createElement('div');
      icon.style.cssText = `
        width:36px;height:36px;border-radius:8px;display:flex;align-items:center;
        justify-content:center;font-size:1.1rem;flex-shrink:0;
        background:var(--primary-light);color:var(--primary);font-weight:700;
      `;
      icon.textContent = getProviderIcon(p.type);
      card.appendChild(icon);

      // Info
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      const nameRow = document.createElement('div');
      nameRow.style.cssText = 'font-size:0.875rem;font-weight:600;color:var(--text-main);display:flex;align-items:center;gap:8px;';
      nameRow.textContent = p.name;
      if (p.isDefault) {
        const badge = document.createElement('span');
        badge.style.cssText = 'font-size:0.65rem;padding:1px 6px;border-radius:8px;background:var(--primary);color:#fff;font-weight:500;';
        badge.textContent = 'Default';
        nameRow.appendChild(badge);
      }
      info.appendChild(nameRow);
      const meta = document.createElement('div');
      meta.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);';
      const typeDef = PROVIDER_TYPES.find(t => t.value === p.type);
      meta.textContent = `${typeDef?.label || p.type} · ${p.defaultModel || 'No model set'}`;
      info.appendChild(meta);
      card.appendChild(info);

      // Actions
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:4px;';

      if (!p.isDefault) {
        const defBtn = document.createElement('button');
        defBtn.className = 'btn btn-ghost btn-sm';
        defBtn.textContent = 'Set Default';
        defBtn.style.fontSize = '0.75rem';
        defBtn.addEventListener('click', () => setDefault(p.id));
        actions.appendChild(defBtn);
      }

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-ghost btn-sm';
      editBtn.textContent = 'Edit';
      editBtn.style.fontSize = '0.75rem';
      editBtn.addEventListener('click', () => showForm(p));
      actions.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-ghost btn-sm';
      delBtn.textContent = 'Delete';
      delBtn.style.cssText = 'font-size:0.75rem;color:var(--danger);';
      delBtn.addEventListener('click', () => deleteProvider(p.id));
      actions.appendChild(delBtn);

      card.appendChild(actions);
      listSection.appendChild(card);
    });
  }

  // --- Form ---
  function showForm(provider) {
    editingId = provider?.id || null;
    formSection.style.display = 'block';
    formSection.innerHTML = '';

    const card = document.createElement('div');
    card.style.cssText = `
      margin-top:16px;padding:20px;background:var(--bg);
      border:1px solid var(--border);border-radius:12px;
    `;

    const formTitle = document.createElement('h3');
    formTitle.style.cssText = 'margin:0 0 16px 0;font-size:1rem;font-weight:600;color:var(--text-main);';
    formTitle.textContent = editingId ? 'Edit Provider' : 'Add Provider';
    card.appendChild(formTitle);

    // Type select
    const typeGroup = createField('Provider Type');
    const typeSelect = document.createElement('select');
    typeSelect.className = 'form-select';
    typeSelect.style.cssText = 'width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-main);font-size:0.875rem;';
    PROVIDER_TYPES.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.value;
      opt.textContent = t.label;
      if (provider?.type === t.value) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeGroup.appendChild(typeSelect);
    card.appendChild(typeGroup);

    // Name
    const nameGroup = createField('Display Name');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'e.g. My OpenAI';
    nameInput.value = provider?.name || '';
    styleInput(nameInput);
    nameGroup.appendChild(nameInput);
    card.appendChild(nameGroup);

    // API Key
    const keyGroup = createField('API Key');
    const keyInput = document.createElement('input');
    keyInput.type = 'password';
    keyInput.placeholder = 'sk-...';
    keyInput.value = '';
    styleInput(keyInput);
    keyGroup.appendChild(keyInput);
    card.appendChild(keyGroup);

    // Base URL
    const urlGroup = createField('Base URL');
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'https://api.openai.com/v1';
    urlInput.value = provider?.baseUrl || '';
    styleInput(urlInput);
    urlGroup.appendChild(urlInput);
    card.appendChild(urlGroup);

    // Model
    const modelGroup = createField('Default Model');
    const modelInput = document.createElement('input');
    modelInput.type = 'text';
    modelInput.placeholder = 'gpt-4o';
    modelInput.value = provider?.defaultModel || '';
    styleInput(modelInput);
    modelGroup.appendChild(modelInput);
    card.appendChild(modelGroup);

    // Update visibility based on type
    function updateFields() {
      const typeDef = PROVIDER_TYPES.find(t => t.value === typeSelect.value);
      keyGroup.style.display = typeDef?.needsKey === false ? 'none' : 'block';
      urlGroup.style.display = typeDef?.needsUrl ? 'block' : 'none';
      if (!urlInput.value && typeDef?.defaultUrl) urlInput.value = typeDef.defaultUrl;
      if (!nameInput.value) nameInput.value = typeDef?.label || '';
    }
    typeSelect.addEventListener('change', updateFields);
    updateFields();

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:16px;';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary btn-sm';
    saveBtn.textContent = editingId ? 'Save Changes' : 'Add Provider';
    saveBtn.addEventListener('click', async () => {
      const body = {
        type: typeSelect.value,
        name: nameInput.value || PROVIDER_TYPES.find(t => t.value === typeSelect.value)?.label,
        defaultModel: modelInput.value,
        baseUrl: urlInput.value,
      };
      if (keyInput.value) body.apiKey = keyInput.value;

      try {
        if (editingId) {
          await fetch(`/ai/providers/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          showToast('Provider updated', 'success');
        } else {
          await fetch('/ai/providers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          showToast('Provider added', 'success');
        }
        formSection.style.display = 'none';
        await load();
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
      }
    });

    const testBtn = document.createElement('button');
    testBtn.className = 'btn btn-secondary btn-sm';
    testBtn.textContent = 'Test Connection';
    testBtn.addEventListener('click', async () => {
      testBtn.textContent = 'Testing...';
      testBtn.disabled = true;
      try {
        // Save first if needed, then test by fetching models
        let testId = editingId;
        if (!testId) {
          // Create temporarily
          const body = {
            type: typeSelect.value,
            name: nameInput.value || 'Test',
            defaultModel: modelInput.value,
            baseUrl: urlInput.value,
          };
          if (keyInput.value) body.apiKey = keyInput.value;
          const res = await fetch('/ai/providers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const created = await res.json();
          testId = created.id;
        }
        const res = await fetch(`/ai/models/${testId}`);
        if (res.ok) {
          const models = await res.json();
          showToast(`Connected! Found ${models.length} model${models.length !== 1 ? 's' : ''}.`, 'success');
        } else {
          showToast('Connection failed', 'error');
        }
        if (!editingId && testId) {
          // Clean up test provider
          await fetch(`/ai/providers/${testId}`, { method: 'DELETE' });
        }
      } catch (err) {
        showToast('Connection failed: ' + err.message, 'error');
      }
      testBtn.textContent = 'Test Connection';
      testBtn.disabled = false;
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost btn-sm';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { formSection.style.display = 'none'; });

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(testBtn);
    btnRow.appendChild(cancelBtn);
    card.appendChild(btnRow);

    formSection.appendChild(card);
  }

  async function setDefault(id) {
    try {
      await fetch(`/ai/providers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });
      await load();
      showToast('Default provider updated', 'success');
    } catch (err) {
      showToast('Failed: ' + err.message, 'error');
    }
  }

  async function deleteProvider(id) {
    if (!confirm('Delete this provider?')) return;
    try {
      await fetch(`/ai/providers/${id}`, { method: 'DELETE' });
      await load();
      showToast('Provider deleted', 'success');
    } catch (err) {
      showToast('Failed: ' + err.message, 'error');
    }
  }

  // --- Helpers ---
  function createField(label) {
    const group = document.createElement('div');
    group.style.marginBottom = '12px';
    const lbl = document.createElement('label');
    lbl.style.cssText = 'display:block;font-size:0.8rem;font-weight:500;color:var(--text-secondary);margin-bottom:4px;';
    lbl.textContent = label;
    group.appendChild(lbl);
    return group;
  }

  function styleInput(input) {
    input.style.cssText = 'width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-main);font-size:0.875rem;outline:none;box-sizing:border-box;';
  }

  function getProviderIcon(type) {
    switch (type) {
      case 'openai': return 'O';
      case 'anthropic': return 'A';
      case 'azure': return 'Az';
      case 'ollama': return '🦙';
      case 'llamacpp': return 'L';
      case 'custom': return 'C';
      default: return '?';
    }
  }

  load();

  return { destroy() {} };
}
