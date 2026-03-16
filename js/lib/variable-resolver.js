// Variable resolver for document templates
// Resolves {{mustache}} variables in HTML content against real data

import { currency } from '../utils/format.js';

/**
 * Build a flat variable map from opportunity, quote, customer, and user data.
 */
export function buildVariableMap({ opportunity, customer, quote, quoteData, user }) {
  const now = new Date();
  const map = {};

  // Customer
  if (customer) {
    map['customer.name'] = customer.name || '';
    map['customer.debitor'] = customer.debitor || '';
    map['customer.alias'] = customer.alias || '';
  }

  // Opportunity
  if (opportunity) {
    map['opportunity.title'] = opportunity.title || '';
    map['opportunity.number'] = opportunity.opportunity || '';
    map['opportunity.status'] = opportunity.status || '';
    map['opportunity.capex'] = currency(opportunity.capex);
    map['opportunity.opex_monthly'] = currency(opportunity.opex_monthly);
    map['opportunity.contract_term_months'] = opportunity.contract_term_months || '';
  }

  // Quote
  if (quote) {
    map['quote.name'] = quote.name || '';
    map['quote.date'] = new Date(quote.created).toLocaleDateString('de-DE');
    map['quote.created_by'] = quote.expand?.created_by?.email || user?.email || '';
  }
  if (quoteData) {
    const summary = quoteData.summary || {};
    map['quote.total'] = currency(summary.vk || 0);
    map['quote.monthly_total'] = currency(summary.monthly || 0);
  }

  // Date
  map['date'] = now.toLocaleDateString('de-DE');
  map['date.long'] = now.toLocaleDateString('de-DE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // User
  if (user) {
    map['user.name'] = user.name || user.email || '';
    map['user.email'] = user.email || '';
  }

  return map;
}

/**
 * Resolve all {{variable}} placeholders in HTML content.
 * {{quote.table}} is handled specially — returns a rendered HTML table.
 */
export function resolveVariables(html, variableMap, quoteData) {
  if (!html) return '';

  return html.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const trimmed = key.trim();

    if (trimmed === 'quote.table') {
      return renderQuoteTable(quoteData);
    }

    if (trimmed in variableMap) {
      return variableMap[trimmed];
    }

    // Return the placeholder as-is if not found
    return match;
  });
}

/**
 * Render the quote line items as an HTML table.
 */
function renderQuoteTable(quoteData) {
  if (!quoteData) return '<p><em>No quote data available</em></p>';

  const groups = quoteData.groups || [];
  const lineItems = quoteData.lineItems || [];

  if (lineItems.length === 0) return '<p><em>No line items</em></p>';

  const thStyle = 'padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:0.8rem;font-weight:600;color:#374151;background:#f9fafb;';
  const tdStyle = 'padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:0.8rem;color:#374151;';
  const tdRightStyle = tdStyle + 'text-align:right;';

  let html = '<table style="width:100%;border-collapse:collapse;margin:16px 0;">';
  html += '<thead><tr>';
  html += `<th style="${thStyle}">SKU</th>`;
  html += `<th style="${thStyle}">Name</th>`;
  html += `<th style="${thStyle}text-align:right;">Qty</th>`;
  html += `<th style="${thStyle}text-align:right;">Unit Price</th>`;
  html += `<th style="${thStyle}">SLA</th>`;
  html += `<th style="${thStyle}text-align:right;">Total</th>`;
  html += '</tr></thead><tbody>';

  // Group items by group
  const groupMap = new Map();
  groups.forEach(g => groupMap.set(g.id, g));

  // If groups exist, render by group
  if (groups.length > 0) {
    groups.forEach(group => {
      const groupItems = lineItems.filter(li => li.groupId === group.id);
      if (groupItems.length === 0) return;

      html += `<tr><td colspan="6" style="padding:10px 12px;font-weight:600;background:#f0f0ff;color:#4f46e5;font-size:0.8rem;border-bottom:1px solid #e5e7eb;">${escapeHtml(group.name)}</td></tr>`;

      groupItems.forEach(li => {
        const lineTotal = (li.price || 0) * (li.amount || 1) * (1 + (li.margin || 0) / 100);
        html += '<tr>';
        html += `<td style="${tdStyle}font-family:monospace;">${escapeHtml(li.sku || '-')}</td>`;
        html += `<td style="${tdStyle}">${escapeHtml(li.name || '')}</td>`;
        html += `<td style="${tdRightStyle}">${li.amount || 1}</td>`;
        html += `<td style="${tdRightStyle}">${currency(li.price || 0)}</td>`;
        html += `<td style="${tdStyle}">${escapeHtml(li.slaName || li.sla || '-')}</td>`;
        html += `<td style="${tdRightStyle}">${currency(lineTotal)}</td>`;
        html += '</tr>';
      });
    });

    // Ungrouped items
    const ungrouped = lineItems.filter(li => !li.groupId || !groupMap.has(li.groupId));
    if (ungrouped.length > 0) {
      ungrouped.forEach(li => {
        const lineTotal = (li.price || 0) * (li.amount || 1) * (1 + (li.margin || 0) / 100);
        html += '<tr>';
        html += `<td style="${tdStyle}font-family:monospace;">${escapeHtml(li.sku || '-')}</td>`;
        html += `<td style="${tdStyle}">${escapeHtml(li.name || '')}</td>`;
        html += `<td style="${tdRightStyle}">${li.amount || 1}</td>`;
        html += `<td style="${tdRightStyle}">${currency(li.price || 0)}</td>`;
        html += `<td style="${tdStyle}">${escapeHtml(li.slaName || li.sla || '-')}</td>`;
        html += `<td style="${tdRightStyle}">${currency(lineTotal)}</td>`;
        html += '</tr>';
      });
    }
  } else {
    lineItems.forEach(li => {
      const lineTotal = (li.price || 0) * (li.amount || 1) * (1 + (li.margin || 0) / 100);
      html += '<tr>';
      html += `<td style="${tdStyle}font-family:monospace;">${escapeHtml(li.sku || '-')}</td>`;
      html += `<td style="${tdStyle}">${escapeHtml(li.name || '')}</td>`;
      html += `<td style="${tdRightStyle}">${li.amount || 1}</td>`;
      html += `<td style="${tdRightStyle}">${currency(li.price || 0)}</td>`;
      html += `<td style="${tdStyle}">${escapeHtml(li.slaName || li.sla || '-')}</td>`;
      html += `<td style="${tdRightStyle}">${currency(lineTotal)}</td>`;
      html += '</tr>';
    });
  }

  // Summary row
  const summary = quoteData.summary || {};
  html += `<tr style="border-top:2px solid #e5e7eb;"><td colspan="5" style="${tdStyle}font-weight:600;">Total (VK)</td><td style="${tdRightStyle}font-weight:600;">${currency(summary.vk || 0)}</td></tr>`;
  if (summary.monthly) {
    html += `<tr><td colspan="5" style="${tdStyle}font-weight:600;">Monthly</td><td style="${tdRightStyle}font-weight:600;">${currency(summary.monthly)}</td></tr>`;
  }

  html += '</tbody></table>';
  return html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Get all available variables with descriptions for the variable picker.
 */
export function getAvailableVariables() {
  return [
    { group: 'Customer', vars: [
      { key: 'customer.name', label: 'Customer Name' },
      { key: 'customer.debitor', label: 'Debitor Number' },
      { key: 'customer.alias', label: 'Customer Alias' },
    ]},
    { group: 'Opportunity', vars: [
      { key: 'opportunity.title', label: 'Opportunity Title' },
      { key: 'opportunity.number', label: 'Opportunity Number' },
      { key: 'opportunity.status', label: 'Status' },
      { key: 'opportunity.capex', label: 'CAPEX' },
      { key: 'opportunity.opex_monthly', label: 'OPEX Monthly' },
      { key: 'opportunity.contract_term_months', label: 'Contract Term (Months)' },
    ]},
    { group: 'Quote', vars: [
      { key: 'quote.name', label: 'Quote Name' },
      { key: 'quote.total', label: 'Quote Total (VK)' },
      { key: 'quote.monthly_total', label: 'Monthly Total' },
      { key: 'quote.date', label: 'Quote Date' },
      { key: 'quote.created_by', label: 'Created By' },
      { key: 'quote.table', label: 'Quote Line Items Table' },
    ]},
    { group: 'Date', vars: [
      { key: 'date', label: 'Today (short)' },
      { key: 'date.long', label: 'Today (long)' },
    ]},
    { group: 'User', vars: [
      { key: 'user.name', label: 'User Name' },
      { key: 'user.email', label: 'User Email' },
    ]},
  ];
}

/**
 * Get sample data for preview mode.
 */
export function getSampleVariableMap() {
  return {
    'customer.name': 'Muster GmbH',
    'customer.debitor': '100042',
    'customer.alias': 'Muster',
    'opportunity.title': 'Netzwerk-Modernisierung 2026',
    'opportunity.number': '2026-0042',
    'opportunity.status': 'In Progress',
    'opportunity.capex': '125.000,00 €',
    'opportunity.opex_monthly': '4.500,00 €',
    'opportunity.contract_term_months': '36',
    'quote.name': 'Angebot Q-2026-001',
    'quote.total': '156.250,00 €',
    'quote.monthly_total': '5.625,00 €',
    'quote.date': '16.03.2026',
    'quote.created_by': 'max.mustermann@example.de',
    'date': new Date().toLocaleDateString('de-DE'),
    'date.long': new Date().toLocaleDateString('de-DE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }),
    'user.name': 'Max Mustermann',
    'user.email': 'max.mustermann@example.de',
  };
}
