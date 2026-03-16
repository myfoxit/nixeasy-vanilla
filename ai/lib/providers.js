/**
 * Unified provider interface for multiple LLM backends.
 * Supports: OpenAI, Anthropic, Azure OpenAI, Ollama, llama.cpp, Generic OpenAI-compatible
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROVIDERS_FILE = path.join(__dirname, '..', 'data', 'providers.json');

// ---------------------------------------------------------------------------
// Provider storage (JSON file)
// ---------------------------------------------------------------------------

async function readProviders() {
  try {
    const data = await fs.readFile(PROVIDERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeProviders(providers) {
  await fs.mkdir(path.dirname(PROVIDERS_FILE), { recursive: true });
  await fs.writeFile(PROVIDERS_FILE, JSON.stringify(providers, null, 2));
}

export async function listProviders() {
  const providers = await readProviders();
  // Strip API keys from response
  return providers.map(p => ({ ...p, apiKey: p.apiKey ? '••••' + p.apiKey.slice(-4) : undefined }));
}

export async function getProvider(id) {
  const providers = await readProviders();
  return providers.find(p => p.id === id) || null;
}

export async function getDefaultProvider() {
  const providers = await readProviders();
  return providers.find(p => p.isDefault) || providers[0] || null;
}

export async function createProvider(config) {
  const providers = await readProviders();
  const id = 'prov_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const provider = {
    id,
    name: config.name || config.type,
    type: config.type,
    apiKey: config.apiKey || '',
    baseUrl: config.baseUrl || getDefaultBaseUrl(config.type),
    defaultModel: config.defaultModel || getDefaultModel(config.type),
    models: config.models || [config.defaultModel || getDefaultModel(config.type)].filter(Boolean),
    isDefault: providers.length === 0 || !!config.isDefault,
  };
  // If setting as default, unset others
  if (provider.isDefault) {
    providers.forEach(p => (p.isDefault = false));
  }
  providers.push(provider);
  await writeProviders(providers);
  return { ...provider, apiKey: provider.apiKey ? '••••' + provider.apiKey.slice(-4) : undefined };
}

export async function updateProvider(id, updates) {
  const providers = await readProviders();
  const idx = providers.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('Provider not found');
  Object.assign(providers[idx], updates);
  if (updates.isDefault) {
    providers.forEach((p, i) => { if (i !== idx) p.isDefault = false; });
  }
  await writeProviders(providers);
  return { ...providers[idx], apiKey: providers[idx].apiKey ? '••••' + providers[idx].apiKey.slice(-4) : undefined };
}

export async function deleteProvider(id) {
  let providers = await readProviders();
  providers = providers.filter(p => p.id !== id);
  if (providers.length && !providers.some(p => p.isDefault)) {
    providers[0].isDefault = true;
  }
  await writeProviders(providers);
}

// ---------------------------------------------------------------------------
// Provider type defaults
// ---------------------------------------------------------------------------

function getDefaultBaseUrl(type) {
  switch (type) {
    case 'openai': return 'https://api.openai.com/v1';
    case 'anthropic': return 'https://api.anthropic.com';
    case 'azure': return '';
    case 'ollama': return 'http://host.docker.internal:11434';
    case 'llamacpp': return 'http://host.docker.internal:8081/v1';
    case 'custom': return '';
    default: return '';
  }
}

function getDefaultModel(type) {
  switch (type) {
    case 'openai': return 'gpt-4o-mini';
    case 'anthropic': return 'claude-sonnet-4-20250514';
    case 'azure': return 'gpt-4o';
    case 'ollama': return 'llama3.2';
    case 'llamacpp': return 'default';
    case 'custom': return '';
    default: return '';
  }
}

// ---------------------------------------------------------------------------
// List models for a provider
// ---------------------------------------------------------------------------

export async function listModels(providerId) {
  const provider = await getProvider(providerId);
  if (!provider) throw new Error('Provider not found');

  switch (provider.type) {
    case 'openai':
    case 'custom':
    case 'llamacpp': {
      try {
        const headers = {};
        if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;
        const res = await fetch(`${provider.baseUrl}/models`, { headers });
        if (res.ok) {
          const data = await res.json();
          return (data.data || []).map(m => m.id).sort();
        }
      } catch { /* fallback */ }
      return provider.models || [];
    }
    case 'azure':
      return provider.models || [provider.defaultModel];
    case 'anthropic':
      return provider.models?.length ? provider.models : [
        'claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001',
        'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022',
      ];
    case 'ollama': {
      try {
        const res = await fetch(`${provider.baseUrl}/api/tags`);
        if (res.ok) {
          const data = await res.json();
          return (data.models || []).map(m => m.name);
        }
      } catch { /* fallback */ }
      return provider.models || [];
    }
    default:
      return provider.models || [];
  }
}

// ---------------------------------------------------------------------------
// Create SDK client for a provider
// ---------------------------------------------------------------------------

export async function createClient(providerId) {
  const provider = providerId ? await getProvider(providerId) : await getDefaultProvider();
  if (!provider) throw new Error('No provider configured. Please add an AI provider in Settings.');
  return { provider };
}
