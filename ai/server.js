/**
 * AI Service - Express server with SSE streaming chat and provider management.
 */

import express from 'express';
import {
  listProviders, createProvider, updateProvider, deleteProvider,
  getDefaultProvider, getProvider, listModels,
} from './lib/providers.js';
import { runChat } from './lib/chat.js';

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/ai/health', (_req, res) => res.json({ status: 'ok' }));

// ---------------------------------------------------------------------------
// Providers CRUD
// ---------------------------------------------------------------------------
app.get('/ai/providers', async (_req, res) => {
  try {
    res.json(await listProviders());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/ai/providers', async (req, res) => {
  try {
    const provider = await createProvider(req.body);
    res.status(201).json(provider);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/ai/providers/:id', async (req, res) => {
  try {
    const provider = await updateProvider(req.params.id, req.body);
    res.json(provider);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/ai/providers/:id', async (req, res) => {
  try {
    await deleteProvider(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
app.get('/ai/models/:providerId', async (req, res) => {
  try {
    const models = await listModels(req.params.providerId);
    res.json(models);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Chat (SSE streaming)
// ---------------------------------------------------------------------------
app.post('/ai/chat', async (req, res) => {
  const { messages, providerId, model } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let closed = false;
  req.on('close', () => { closed = true; });

  try {
    const provider = providerId ? await getProvider(providerId) : await getDefaultProvider();
    if (!provider) {
      send('error', { error: 'No AI provider configured. Go to AI Settings to add one.' });
      res.write('event: done\ndata: {}\n\n');
      res.end();
      return;
    }

    send('status', { provider: provider.name, model: model || provider.defaultModel });

    const result = await runChat({
      messages,
      provider,
      model,
      onToken: (token) => {
        if (!closed) send('token', { token });
      },
      onToolCall: ({ name, args, result }) => {
        if (!closed) {
          const summary = summarizeToolResult(name, result);
          send('tool', { name, args, summary, resultCount: Array.isArray(result) ? result.length : undefined });
        }
      },
    });

    if (!closed) {
      send('done', { fullText: result });
    }
  } catch (err) {
    console.error('Chat error:', err);
    if (!closed) {
      send('error', { error: err.message || 'An error occurred' });
      send('done', {});
    }
  }

  res.end();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summarizeToolResult(name, result) {
  if (Array.isArray(result)) return `Found ${result.length} result${result.length !== 1 ? 's' : ''}`;
  if (result?.error) return `Error: ${result.error}`;
  if (result?.message) return result.message;
  return 'Done';
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI service listening on port ${PORT}`);
});
