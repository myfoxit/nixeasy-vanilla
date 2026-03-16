/**
 * Chat orchestration: LLM calls with tool-use loop and streaming.
 * Supports OpenAI-style and Anthropic-style APIs.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { getToolDefinitions, getAnthropicToolDefinitions, executeTool } from './tools.js';

const SYSTEM_PROMPT = `You are the NixEasy CPQ Assistant — a helpful AI embedded in the NixEasy Configure-Price-Quote application.

You have access to the full CPQ database and can help users with:
- **Licenses/Products**: Search and list available software licenses, their SKUs, pricing, and types.
- **Customers**: Look up customer information by name or debitor number.
- **Opportunities**: View sales opportunities, their status, and associated customers.
- **Quotes**: Create, view, and manage quotes. Add or remove line items, adjust quantities, pricing, and SLA levels.
- **SLAs**: List available Service Level Agreements with their terms (availability, response time, recovery time).
- **Service Packs**: Browse available service packages with scope and estimated hours.
- **Installed Base**: Search what's currently deployed at customer sites.

When helping with quotes, be precise with IDs and data. Always confirm destructive actions before proceeding.
Format currency values in Euro (€) with German locale (e.g. €1.234,56).
Keep responses concise and actionable. Use markdown formatting for readability.`;

const MAX_TOOL_ROUNDS = 10;

/**
 * Run a chat completion with tool-use loop.
 * @param {object} opts
 * @param {Array} opts.messages - Chat messages [{role, content}]
 * @param {object} opts.provider - Provider config from providers.js
 * @param {string} [opts.model] - Override model
 * @param {function} opts.onToken - Called with each text token (for streaming)
 * @param {function} opts.onToolCall - Called with {name, args, result} for each tool execution
 */
export async function runChat({ messages, provider, model, onToken, onToolCall }) {
  const useModel = model || provider.defaultModel;

  if (provider.type === 'anthropic') {
    return runAnthropicChat({ messages, provider, model: useModel, onToken, onToolCall });
  }
  return runOpenAIChat({ messages, provider, model: useModel, onToken, onToolCall });
}

// ---------------------------------------------------------------------------
// OpenAI-compatible chat (OpenAI, Azure, Ollama, llama.cpp, custom)
// ---------------------------------------------------------------------------

async function runOpenAIChat({ messages, provider, model, onToken, onToolCall }) {
  const config = { apiKey: provider.apiKey || 'not-needed' };

  if (provider.type === 'azure') {
    config.baseURL = provider.baseUrl;
    config.defaultQuery = { 'api-version': '2024-08-01-preview' };
    config.defaultHeaders = { 'api-key': provider.apiKey };
    config.apiKey = provider.apiKey;
  } else if (provider.type === 'ollama') {
    config.baseURL = `${provider.baseUrl}/v1`;
  } else if (provider.baseUrl) {
    config.baseURL = provider.baseUrl;
  }

  const client = new OpenAI(config);
  const toolDefs = getToolDefinitions();

  // Build messages with system prompt
  const chatMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages,
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let stream;
    try {
      stream = await client.chat.completions.create({
        model,
        messages: chatMessages,
        tools: toolDefs.length ? toolDefs : undefined,
        stream: true,
      });
    } catch (err) {
      const msg = err?.message || err?.error?.message || String(err);
      console.error('OpenAI API error:', msg);
      throw new Error(`LLM API error: ${msg}`);
    }

    let assistantContent = '';
    const toolCalls = [];
    const toolCallBuffers = {};

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        // Text content
        if (delta.content) {
          assistantContent += delta.content;
          onToken?.(delta.content);
        }

        // Tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallBuffers[tc.index]) {
              toolCallBuffers[tc.index] = { id: '', name: '', arguments: '' };
            }
            const buf = toolCallBuffers[tc.index];
            if (tc.id) buf.id = tc.id;
            if (tc.function?.name) buf.name = tc.function.name;
            if (tc.function?.arguments) buf.arguments += tc.function.arguments;
          }
        }
      }
    } catch (streamErr) {
      const msg = streamErr?.message || String(streamErr);
      console.error('OpenAI stream error:', msg);
      throw new Error(`Stream error: ${msg}`);
    }

    console.log(`Round ${round}: content=${assistantContent.length}chars toolCalls=${Object.keys(toolCallBuffers).length}`);

    // Collect finished tool calls
    for (const idx of Object.keys(toolCallBuffers).sort((a, b) => a - b)) {
      toolCalls.push(toolCallBuffers[idx]);
    }

    // If no tool calls, we're done
    if (toolCalls.length === 0) {
      return assistantContent;
    }

    // Add assistant message with tool calls
    chatMessages.push({
      role: 'assistant',
      content: assistantContent || null,
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    // Execute each tool call and add results
    for (const tc of toolCalls) {
      let result;
      try {
        const args = JSON.parse(tc.arguments || '{}');
        result = await executeTool(tc.name, args);
        onToolCall?.({ name: tc.name, args, result });
      } catch (err) {
        result = { error: err.message };
        onToolCall?.({ name: tc.name, args: {}, result });
      }
      chatMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  return 'I reached the maximum number of tool calls. Please try a more specific request.';
}

// ---------------------------------------------------------------------------
// Anthropic Claude chat
// ---------------------------------------------------------------------------

async function runAnthropicChat({ messages, provider, model, onToken, onToolCall }) {
  const client = new Anthropic({ apiKey: provider.apiKey });
  const toolDefs = getAnthropicToolDefinitions();

  // Separate system from user/assistant messages
  const chatMessages = messages.filter(m => m.role !== 'system');

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = await client.messages.stream({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: chatMessages,
      tools: toolDefs.length ? toolDefs : undefined,
    });

    let assistantText = '';
    const contentBlocks = [];
    let currentToolUse = null;
    let toolInputJson = '';

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'text') {
          contentBlocks.push({ type: 'text', text: '' });
        } else if (event.content_block.type === 'tool_use') {
          currentToolUse = { id: event.content_block.id, name: event.content_block.name };
          toolInputJson = '';
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          assistantText += event.delta.text;
          if (contentBlocks.length) contentBlocks[contentBlocks.length - 1].text += event.delta.text;
          onToken?.(event.delta.text);
        } else if (event.delta.type === 'input_json_delta') {
          toolInputJson += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolUse) {
          let parsedInput = {};
          try { parsedInput = JSON.parse(toolInputJson || '{}'); } catch {}
          contentBlocks.push({
            type: 'tool_use',
            id: currentToolUse.id,
            name: currentToolUse.name,
            input: parsedInput,
          });
          currentToolUse = null;
          toolInputJson = '';
        }
      }
    }

    // Check if there are tool uses
    const toolUses = contentBlocks.filter(b => b.type === 'tool_use');
    if (toolUses.length === 0) {
      return assistantText;
    }

    // Add assistant message
    chatMessages.push({ role: 'assistant', content: contentBlocks });

    // Execute tools and build tool result message
    const toolResults = [];
    for (const tu of toolUses) {
      let result;
      try {
        result = await executeTool(tu.name, tu.input);
        onToolCall?.({ name: tu.name, args: tu.input, result });
      } catch (err) {
        result = { error: err.message };
        onToolCall?.({ name: tu.name, args: tu.input, result });
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      });
    }

    chatMessages.push({ role: 'user', content: toolResults });
  }

  return 'I reached the maximum number of tool calls. Please try a more specific request.';
}
