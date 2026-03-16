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
app.disable('etag');

// CORS - allow frontend origin
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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

  // SSE headers (OpenAI-compatible format: data: {json}\n\n)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  if (res.socket) res.socket.setNoDelay(true);

  const send = (data) => {
    return new Promise((resolve) => {
      const ok = res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (ok) resolve();
      else res.once('drain', resolve);
    });
  };

  const sendDone = () => {
    return new Promise((resolve) => {
      const ok = res.write('data: [DONE]\n\n');
      if (ok) resolve();
      else res.once('drain', resolve);
    });
  };

  let closed = false;
  req.on('close', () => { closed = true; });

  try {
    const provider = providerId ? await getProvider(providerId) : await getDefaultProvider();
    if (!provider) {
      await send({ type: 'error', error: 'No AI provider configured. Go to AI Settings to add one.' });
      await sendDone();
      res.end();
      return;
    }

    console.log(`Chat request: provider=${provider.name} model=${model || provider.defaultModel} messages=${messages.length}`);

    await runChat({
      messages,
      provider,
      model,
      onToken: async (token) => {
        if (!closed) await send({ choices: [{ delta: { content: token } }] });
      },
      onToolCall: async ({ name, args, result }) => {
        if (!closed) {
          const summary = summarizeToolResult(name, result);
          await send({ tool_call: { name, args, summary, resultCount: Array.isArray(result) ? result.length : undefined } });
        }
      },
    });

    if (!closed) {
      await sendDone();
    }
  } catch (err) {
    console.error('Chat error:', err);
    if (!closed) {
      await send({ type: 'error', error: err.message || 'An error occurred' });
      await sendDone();
    }
  }

  console.log('Chat complete, ending response');
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
