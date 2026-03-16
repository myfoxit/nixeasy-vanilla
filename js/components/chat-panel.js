/**
 * Chat Panel - Slide-in panel for AI chat assistant.
 * Streams responses via SSE, renders tool calls as collapsible chips.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let panelOpen = false;
let panelEl = null;
let messages = []; // {role, content, toolCalls?[]}
let currentProvider = null;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
function ensureChatStyles() {
  if (document.getElementById('chat-panel-styles')) return;
  const style = document.createElement('style');
  style.id = 'chat-panel-styles';
  style.textContent = `
    .chat-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 190;
      width: 52px; height: 52px; border-radius: 50%;
      background: var(--primary); color: #fff; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: var(--shadow-lg); transition: transform 0.15s, background 0.15s;
    }
    .chat-fab:hover { background: var(--primary-hover); transform: scale(1.05); }
    .chat-fab svg { width: 24px; height: 24px; }

    .chat-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.15); z-index: 200;
      opacity: 0; transition: opacity 0.2s;
    }
    .chat-overlay.visible { opacity: 1; }

    .chat-panel {
      position: fixed; top: 0; right: -440px; bottom: 0; width: 440px;
      background: var(--surface); border-left: 1px solid var(--border);
      z-index: 201; display: flex; flex-direction: column;
      box-shadow: -4px 0 24px rgba(0,0,0,0.08);
      transition: right 0.25s ease;
    }
    .chat-panel.open { right: 0; }

    @media (max-width: 500px) {
      .chat-panel { width: 100%; right: -100%; }
    }

    .chat-header {
      padding: 14px 20px; border-bottom: 1px solid var(--border);
      display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
    }
    .chat-header-title {
      font-weight: 600; font-size: 0.95rem; color: var(--text-main);
      display: flex; align-items: center; gap: 8px;
    }
    .chat-header-sub { font-size: 0.7rem; color: var(--text-secondary); margin-top: 2px; }
    .chat-close-btn {
      border: none; background: transparent; cursor: pointer; padding: 4px;
      border-radius: 4px; color: var(--text-secondary); display: flex; align-items: center;
    }
    .chat-close-btn:hover { color: var(--text-main); background: var(--surface-hover); }

    .chat-messages {
      flex: 1; overflow-y: auto; padding: 16px 20px;
      display: flex; flex-direction: column; gap: 12px;
      scrollbar-width: thin;
    }

    .chat-bubble {
      max-width: 85%; padding: 10px 14px; border-radius: 12px;
      font-size: 0.875rem; line-height: 1.55; word-wrap: break-word;
    }
    .chat-bubble.user {
      align-self: flex-end; background: var(--primary); color: #fff;
      border-bottom-right-radius: 4px;
    }
    .chat-bubble.assistant {
      align-self: flex-start; background: var(--bg); color: var(--text-main);
      border: 1px solid var(--border); border-bottom-left-radius: 4px;
    }
    .chat-bubble.assistant p { margin: 0 0 8px 0; }
    .chat-bubble.assistant p:last-child { margin-bottom: 0; }
    .chat-bubble.assistant strong { font-weight: 600; }
    .chat-bubble.assistant code {
      background: var(--surface-hover); padding: 1px 5px; border-radius: 3px;
      font-size: 0.8rem; font-family: monospace;
    }
    .chat-bubble.assistant ul, .chat-bubble.assistant ol {
      margin: 4px 0; padding-left: 20px;
    }
    .chat-bubble.assistant li { margin: 2px 0; }

    .chat-bubble.error {
      align-self: center; background: #fef2f2; color: #dc2626;
      border: 1px solid #fecaca; font-size: 0.8rem;
    }
    [data-theme="dark"] .chat-bubble.error {
      background: rgba(220,38,38,0.1); border-color: rgba(220,38,38,0.3);
    }

    .chat-tool-chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 4px 10px; border-radius: 6px; font-size: 0.75rem;
      background: var(--primary-light); color: var(--primary);
      margin: 4px 0; cursor: pointer; border: none; font-weight: 500;
    }
    .chat-tool-chip:hover { filter: brightness(0.95); }
    .chat-tool-detail {
      font-size: 0.72rem; color: var(--text-secondary); padding: 4px 8px;
      background: var(--surface-hover); border-radius: 4px; margin-top: 2px;
      white-space: pre-wrap; max-height: 120px; overflow-y: auto;
      display: none;
    }
    .chat-tool-detail.open { display: block; }

    .chat-typing {
      align-self: flex-start; display: flex; gap: 4px; padding: 12px 16px;
    }
    .chat-typing span {
      width: 6px; height: 6px; border-radius: 50%; background: var(--text-secondary);
      animation: chatBounce 1.2s infinite;
    }
    .chat-typing span:nth-child(2) { animation-delay: 0.15s; }
    .chat-typing span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes chatBounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-4px); }
    }

    .chat-input-area {
      padding: 12px 16px; border-top: 1px solid var(--border); flex-shrink: 0;
      display: flex; gap: 8px; align-items: flex-end;
    }
    .chat-input {
      flex: 1; border: 1px solid var(--border); border-radius: 8px;
      padding: 10px 12px; font-size: 0.875rem; resize: none;
      background: var(--bg); color: var(--text-main);
      font-family: inherit; min-height: 20px; max-height: 120px;
      outline: none; transition: border-color 0.15s;
    }
    .chat-input:focus { border-color: var(--primary); }
    .chat-input::placeholder { color: var(--text-secondary); }
    .chat-send-btn {
      width: 38px; height: 38px; border-radius: 8px; border: none;
      background: var(--primary); color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background 0.15s;
    }
    .chat-send-btn:hover { background: var(--primary-hover); }
    .chat-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .chat-send-btn svg { width: 18px; height: 18px; }

    .chat-empty {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; color: var(--text-secondary); gap: 8px;
      padding: 40px;
    }
    .chat-empty-icon { font-size: 2.5rem; opacity: 0.5; }
    .chat-empty-text { font-size: 0.875rem; text-align: center; line-height: 1.5; }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Markdown-lite renderer
// ---------------------------------------------------------------------------
function renderMarkdown(text) {
  let html = escHtml(text);
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
  // Paragraphs (double newline)
  html = html.replace(/\n\n/g, '</p><p>');
  // Single newlines inside paragraphs
  html = html.replace(/\n/g, '<br>');
  return '<p>' + html + '</p>';
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Chat FAB (floating action button)
// ---------------------------------------------------------------------------
export function createChatFAB() {
  ensureChatStyles();
  const btn = document.createElement('button');
  btn.className = 'chat-fab';
  btn.title = 'AI Chat Assistant';
  btn.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/>
  </svg>`;
  btn.addEventListener('click', () => openChatPanel());
  document.body.appendChild(btn);
  return btn;
}

// ---------------------------------------------------------------------------
// Chat Panel
// ---------------------------------------------------------------------------

function openChatPanel() {
  if (panelOpen) return;
  panelOpen = true;

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'chat-overlay';
  overlay.addEventListener('click', () => closeChatPanel());
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  // Panel
  const panel = document.createElement('div');
  panel.className = 'chat-panel';
  panelEl = panel;

  // Header
  const header = document.createElement('div');
  header.className = 'chat-header';

  const titleWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'chat-header-title';
  title.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;color:var(--primary)">
    <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"/>
  </svg>AI Assistant`;
  titleWrap.appendChild(title);
  const sub = document.createElement('div');
  sub.className = 'chat-header-sub';
  sub.textContent = 'Ask me about quotes, licenses, or customers';
  titleWrap.appendChild(sub);
  header.appendChild(titleWrap);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'chat-close-btn';
  closeBtn.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:18px;height:18px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`;
  closeBtn.addEventListener('click', closeChatPanel);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Messages area
  const messagesDiv = document.createElement('div');
  messagesDiv.className = 'chat-messages';
  messagesDiv.id = 'chat-messages';
  panel.appendChild(messagesDiv);

  // Render existing messages or empty state
  renderMessages(messagesDiv);

  // Input area
  const inputArea = document.createElement('div');
  inputArea.className = 'chat-input-area';

  const input = document.createElement('textarea');
  input.className = 'chat-input';
  input.placeholder = 'Type a message...';
  input.rows = 1;
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  });

  const sendBtn = document.createElement('button');
  sendBtn.className = 'chat-send-btn';
  sendBtn.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>`;
  sendBtn.addEventListener('click', () => sendMessage(input));

  inputArea.appendChild(input);
  inputArea.appendChild(sendBtn);
  panel.appendChild(inputArea);

  document.body.appendChild(panel);
  requestAnimationFrame(() => {
    panel.classList.add('open');
    input.focus();
  });

  // Escape key
  panel._escHandler = (e) => { if (e.key === 'Escape') closeChatPanel(); };
  document.addEventListener('keydown', panel._escHandler);
}

function closeChatPanel() {
  if (!panelOpen) return;
  panelOpen = false;

  const panel = document.querySelector('.chat-panel');
  const overlay = document.querySelector('.chat-overlay');

  if (panel) {
    panel.classList.remove('open');
    if (panel._escHandler) document.removeEventListener('keydown', panel._escHandler);
    setTimeout(() => panel.remove(), 250);
  }
  if (overlay) {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
  }
  panelEl = null;
}

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

function renderMessages(container) {
  container.innerHTML = '';

  if (messages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.innerHTML = `
      <div class="chat-empty-icon">&#10024;</div>
      <div class="chat-empty-text">
        <strong>NixEasy AI Assistant</strong><br>
        Ask me to find licenses, look up customers, create quotes, or analyze your data.
      </div>`;
    container.appendChild(empty);
    return;
  }

  messages.forEach(msg => {
    if (msg.role === 'user') {
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble user';
      bubble.textContent = msg.content;
      container.appendChild(bubble);
    } else if (msg.role === 'assistant') {
      // Tool calls
      if (msg.toolCalls?.length) {
        msg.toolCalls.forEach(tc => {
          const wrap = document.createElement('div');
          wrap.style.alignSelf = 'flex-start';

          const chip = document.createElement('button');
          chip.className = 'chat-tool-chip';
          const icon = getToolIcon(tc.name);
          chip.textContent = `${icon} ${tc.summary || tc.name}`;

          const detail = document.createElement('div');
          detail.className = 'chat-tool-detail';
          detail.textContent = JSON.stringify(tc.args, null, 2);

          chip.addEventListener('click', () => detail.classList.toggle('open'));

          wrap.appendChild(chip);
          wrap.appendChild(detail);
          container.appendChild(wrap);
        });
      }
      // Text content
      if (msg.content) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble assistant';
        bubble.innerHTML = renderMarkdown(msg.content);
        container.appendChild(bubble);
      }
    } else if (msg.role === 'error') {
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble error';
      bubble.textContent = msg.content;
      container.appendChild(bubble);
    }
  });

  container.scrollTop = container.scrollHeight;
}

function getToolIcon(name) {
  if (name.startsWith('list_') || name.startsWith('search_')) return '\uD83D\uDD0D';
  if (name.startsWith('get_')) return '\uD83D\uDCC4';
  if (name.startsWith('create_') || name.startsWith('add_')) return '\u2795';
  if (name.startsWith('remove_')) return '\u2796';
  if (name.startsWith('update_')) return '\u270F\uFE0F';
  return '\u2699\uFE0F';
}

// ---------------------------------------------------------------------------
// Send message & stream response
// ---------------------------------------------------------------------------

let streaming = false;

async function sendMessage(input) {
  const text = input.value.trim();
  if (!text || streaming) return;

  input.value = '';
  input.style.height = 'auto';

  // Add user message
  messages.push({ role: 'user', content: text });

  const container = document.getElementById('chat-messages');
  if (!container) return;
  renderMessages(container);

  // Show typing indicator
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-typing';
  typingEl.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(typingEl);
  container.scrollTop = container.scrollHeight;

  streaming = true;
  const sendBtn = panelEl?.querySelector('.chat-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  // Prepare API messages (only role + content for the LLM)
  const apiMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
    role: m.role, content: m.content || '',
  }));

  // Create assistant message placeholder
  const assistantMsg = { role: 'assistant', content: '', toolCalls: [] };

  try {
    const res = await fetch('/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMessages }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    // Parse SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let bubbleEl = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let eventType = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));

          if (eventType === 'status') {
            currentProvider = data;
          } else if (eventType === 'token') {
            // Remove typing indicator on first token
            if (typingEl.parentNode) typingEl.remove();

            assistantMsg.content += data.token;

            // Create or update bubble
            if (!bubbleEl) {
              bubbleEl = document.createElement('div');
              bubbleEl.className = 'chat-bubble assistant';
              container.appendChild(bubbleEl);
            }
            bubbleEl.innerHTML = renderMarkdown(assistantMsg.content);
            container.scrollTop = container.scrollHeight;
          } else if (eventType === 'tool') {
            if (typingEl.parentNode) typingEl.remove();

            assistantMsg.toolCalls.push({
              name: data.name,
              args: data.args,
              summary: `${getToolIcon(data.name)} ${formatToolName(data.name)}${data.resultCount !== undefined ? ` (${data.resultCount})` : ''}`,
            });

            // Render tool chip
            const wrap = document.createElement('div');
            wrap.style.alignSelf = 'flex-start';
            const chip = document.createElement('button');
            chip.className = 'chat-tool-chip';
            chip.textContent = assistantMsg.toolCalls[assistantMsg.toolCalls.length - 1].summary;
            const detail = document.createElement('div');
            detail.className = 'chat-tool-detail';
            detail.textContent = JSON.stringify(data.args, null, 2);
            chip.addEventListener('click', () => detail.classList.toggle('open'));
            wrap.appendChild(chip);
            wrap.appendChild(detail);
            container.appendChild(wrap);
            container.scrollTop = container.scrollHeight;
          } else if (eventType === 'error') {
            if (typingEl.parentNode) typingEl.remove();
            messages.push({ role: 'error', content: data.error });
            const errBubble = document.createElement('div');
            errBubble.className = 'chat-bubble error';
            errBubble.textContent = data.error;
            container.appendChild(errBubble);
          } else if (eventType === 'done') {
            // done
          }
          eventType = '';
        }
      }
    }

    if (typingEl.parentNode) typingEl.remove();
    if (assistantMsg.content || assistantMsg.toolCalls.length) {
      messages.push(assistantMsg);
    }

  } catch (err) {
    if (typingEl.parentNode) typingEl.remove();
    messages.push({ role: 'error', content: `Failed to connect: ${err.message}` });
    renderMessages(container);
  }

  streaming = false;
  if (sendBtn) sendBtn.disabled = false;
  container.scrollTop = container.scrollHeight;
}

function formatToolName(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
