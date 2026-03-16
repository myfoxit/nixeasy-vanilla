/**
 * Changelog Panel
 * Slide-in right panel showing quote history (quote_changelog collection).
 */

import { pb } from '../api.js';

export function createChangelogPanel({ quoteId, onClose }) {
  // ── Overlay ──────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.15);z-index:200;';
  overlay.addEventListener('click', e => { if (e.target === overlay) onClose(); });

  // ── Panel ─────────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;top:0;right:0;bottom:0;width:420px;background:var(--surface);' +
    'border-left:1px solid var(--border);z-index:201;display:flex;flex-direction:column;' +
    'box-shadow:-4px 0 24px rgba(0,0,0,0.08);';

  // ── Header ────────────────────────────────────────────────────────────
  const headerEl = document.createElement('div');
  headerEl.style.cssText =
    'padding:16px 20px;border-bottom:1px solid var(--border);' +
    'display:flex;justify-content:space-between;align-items:center;flex-shrink:0;';

  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-weight:600;font-size:0.95rem;color:var(--text-main);display:flex;align-items:center;gap:8px;';
  titleEl.innerHTML =
    '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;color:var(--primary)">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' +
    'Quote History';
  headerEl.appendChild(titleEl);

  const closeBtn = document.createElement('button');
  closeBtn.style.cssText =
    'border:none;background:transparent;cursor:pointer;padding:4px;border-radius:4px;' +
    'color:var(--text-secondary);display:flex;align-items:center;';
  closeBtn.innerHTML =
    '<svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:18px;height:18px;">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>';
  closeBtn.addEventListener('click', onClose);
  headerEl.appendChild(closeBtn);
  panel.appendChild(headerEl);

  // ── Content ───────────────────────────────────────────────────────────
  const content = document.createElement('div');
  content.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px;';

  const loadingEl = document.createElement('div');
  loadingEl.style.cssText =
    'text-align:center;padding:48px 20px;color:var(--text-secondary);font-size:0.875rem;';
  loadingEl.textContent = 'Loading history…';
  content.appendChild(loadingEl);
  panel.appendChild(content);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // ── Fetch & render ────────────────────────────────────────────────────
  pb.collection('quote_changelog')
    .getFullList({ filter: `quote = "${quoteId}"`, sort: '-created', expand: 'changed_by' })
    .then(entries => {
      content.innerHTML = '';

      if (entries.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.style.cssText =
          'text-align:center;padding:48px 20px;color:var(--text-secondary);font-size:0.875rem;';
        emptyEl.innerHTML =
          '<div style="font-size:2rem;margin-bottom:8px;">📋</div>' +
          '<div style="font-weight:500;">No history yet</div>' +
          '<div style="margin-top:4px;font-size:0.75rem;">Changes appear here each time the quote is saved.</div>';
        content.appendChild(emptyEl);
        return;
      }

      entries.forEach(entry => content.appendChild(buildEntry(entry)));
    })
    .catch(() => {
      content.innerHTML =
        '<div style="text-align:center;padding:48px 20px;color:#ef4444;font-size:0.875rem;">Failed to load history.</div>';
    });

  // ── Entry builder ─────────────────────────────────────────────────────
  function buildEntry(entry) {
    const user      = entry.expand?.changed_by;
    const userName  = user?.name || user?.email || 'System';
    const initials  = userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const timeStr   = relativeTime(entry.created);
    const absTime   = new Date(entry.created).toLocaleString('de-AT');
    const changes   = Array.isArray(entry.changes) ? entry.changes : [];

    const el = document.createElement('div');
    el.style.cssText =
      'margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);';

    // Row: avatar + meta + badge
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;';

    const avatar = document.createElement('div');
    avatar.style.cssText =
      'width:30px;height:30px;border-radius:50%;background:var(--primary);color:#fff;' +
      'font-size:0.65rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    avatar.textContent = initials;
    row.appendChild(avatar);

    const meta = document.createElement('div');
    meta.style.cssText = 'flex:1;min-width:0;';

    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-size:0.82rem;font-weight:600;color:var(--text-main);';
    nameEl.textContent = userName;
    meta.appendChild(nameEl);

    const timeEl = document.createElement('div');
    timeEl.style.cssText = 'font-size:0.72rem;color:var(--text-secondary);';
    timeEl.textContent = timeStr;
    timeEl.title = absTime;
    meta.appendChild(timeEl);
    row.appendChild(meta);

    const badge = document.createElement('span');
    badge.style.cssText =
      'font-size:0.65rem;padding:2px 7px;border-radius:10px;' +
      'background:var(--primary-light);color:var(--primary);font-weight:600;flex-shrink:0;';
    badge.textContent = `${changes.length} change${changes.length !== 1 ? 's' : ''}`;
    row.appendChild(badge);
    el.appendChild(row);

    // Change rows
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:3px;padding-left:40px;';
    changes.forEach(c => list.appendChild(buildChangeRow(c)));
    el.appendChild(list);

    return el;
  }

  function buildChangeRow(c) {
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;align-items:flex-start;gap:6px;font-size:0.78rem;line-height:1.5;';

    const { icon, color, html } = describeChange(c);

    const iconEl = document.createElement('span');
    iconEl.style.cssText = `color:${color};font-weight:700;flex-shrink:0;min-width:12px;`;
    iconEl.textContent = icon;
    row.appendChild(iconEl);

    const textEl = document.createElement('span');
    textEl.style.color = 'var(--text-main)';
    textEl.innerHTML = html;
    row.appendChild(textEl);

    return row;
  }

  // ── Change descriptions ───────────────────────────────────────────────
  function describeChange(c) {
    const skuSpan = c.sku
      ? `<span style="color:var(--text-secondary);font-size:0.72rem;margin-right:2px;">[${esc(c.sku)}]</span>`
      : '';
    const nameB = `<strong>${esc(c.name || '')}</strong>`;
    const old   = `<span style="text-decoration:line-through;color:var(--text-secondary);">${esc(String(c.old ?? ''))}</span>`;
    const neu   = `<strong>${esc(String(c.new ?? ''))}</strong>`;

    switch (c.action) {
      case 'item_added':
        return { icon: '+', color: '#16a34a',
          html: `${skuSpan}${nameB} added` };

      case 'item_removed':
        return { icon: '−', color: '#dc2626',
          html: `${skuSpan}${nameB} removed` };

      case 'name_changed':
        return { icon: '✎', color: '#7c3aed',
          html: `${skuSpan}Renamed ${old} → ${neu}` };

      case 'price_changed':
        return { icon: '€', color: '#b45309',
          html: `${skuSpan}${nameB} price ${fmtOld(c.old)} → ${fmtNew(c.new)}` };

      case 'qty_changed':
        return { icon: '#', color: '#0369a1',
          html: `${skuSpan}${nameB} qty ${old} → ${neu}` };

      case 'margin_changed':
        return { icon: '%', color: '#0369a1',
          html: `${skuSpan}${nameB} margin ` +
            `<span style="text-decoration:line-through;color:var(--text-secondary);">${Number(c.old).toFixed(1)}%</span>` +
            ` → <strong>${Number(c.new).toFixed(1)}%</strong>` };

      case 'group_renamed':
        return { icon: '▤', color: '#7c3aed',
          html: `Group renamed ${old} → ${neu}` };

      default:
        return { icon: '·', color: '#6b7280', html: esc(c.action) };
    }
  }

  function fmtOld(v) {
    const s = fmtEur(v);
    return `<span style="text-decoration:line-through;color:var(--text-secondary);">${s}</span>`;
  }
  function fmtNew(v) {
    return `<strong>${fmtEur(v)}</strong>`;
  }
  function fmtEur(v) {
    if (typeof v !== 'number') return esc(String(v ?? ''));
    return '€\u202f' + v.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function relativeTime(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7)  return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString('de-AT');
  }

  // ── Cleanup ───────────────────────────────────────────────────────────
  function destroy() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  return { destroy };
}
