/**
 * Tool registry for PocketBase data access.
 * Each tool has a JSON schema (OpenAI function calling format) and an execute function.
 */

const PB_URL = process.env.POCKETBASE_URL || 'http://pocketbase:8090';

async function pbGet(path) {
  const res = await fetch(`${PB_URL}/api/${path}`);
  if (!res.ok) throw new Error(`PocketBase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function pbPost(path, body) {
  const res = await fetch(`${PB_URL}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PocketBase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function pbPatch(path, body) {
  const res = await fetch(`${PB_URL}/api/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PocketBase ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve an opportunity number (e.g. "1000049113") to a PocketBase record ID.
 * If the input is already a valid record ID, returns it as-is.
 */
async function resolveOpportunityId(idOrNumber) {
  try {
    await pbGet(`collections/opportunities/records/${idOrNumber}`);
    return idOrNumber; // It's a valid record ID
  } catch {
    const data = await pbGet(`collections/opportunities/records?filter=opportunity="${idOrNumber}"&perPage=1`);
    if (!data.items?.length) throw new Error(`Opportunity "${idOrNumber}" not found`);
    return data.items[0].id;
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const tools = [
  {
    name: 'list_licenses',
    description: 'List available software licenses/products. Optionally filter by name or SKU.',
    parameters: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'PocketBase filter expression, e.g. name ~ "firewall"' },
      },
    },
    execute: async ({ filter }) => {
      const params = new URLSearchParams({ sort: 'name', perPage: '200' });
      if (filter) params.set('filter', filter);
      const data = await pbGet(`collections/licenses/records?${params}`);
      return data.items.map(l => ({
        id: l.id, sku: l.sku, name: l.name, type: l.type,
        initial_price: l.initial_price,
        description: l.description_en || l.description_de,
      }));
    },
  },
  {
    name: 'list_customers',
    description: 'List or search customers by name or debitor number.',
    parameters: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'PocketBase filter, e.g. name ~ "Acme"' },
      },
    },
    execute: async ({ filter }) => {
      const params = new URLSearchParams({ sort: 'name', perPage: '200' });
      if (filter) params.set('filter', filter);
      const data = await pbGet(`collections/customers/records?${params}`);
      return data.items.map(c => ({ id: c.id, debitor: c.debitor, name: c.name, alias: c.alias }));
    },
  },
  {
    name: 'list_opportunities',
    description: 'List opportunities. Optionally filter by status or search.',
    parameters: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'PocketBase filter expression' },
        status: { type: 'string', description: 'Filter by status value' },
      },
    },
    execute: async ({ filter, status }) => {
      const params = new URLSearchParams({ sort: '-created', perPage: '200', expand: 'customer' });
      const filters = [];
      if (filter) filters.push(filter);
      if (status) filters.push(`status = "${status}"`);
      if (filters.length) params.set('filter', filters.join(' && '));
      const data = await pbGet(`collections/opportunities/records?${params}`);
      return data.items.map(o => ({
        id: o.id, opportunity: o.opportunity, title: o.title, status: o.status,
        capex: o.capex, opex_monthly: o.opex_monthly,
        customer: o.expand?.customer ? { id: o.expand.customer.id, name: o.expand.customer.name } : o.customer,
      }));
    },
  },
  {
    name: 'get_opportunity',
    description: 'Get a single opportunity by record ID or opportunity number, including customer details.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'PocketBase record ID or opportunity number (e.g. "1000063258")' },
      },
      required: ['id'],
    },
    execute: async ({ id }) => {
      const recordId = await resolveOpportunityId(id);
      const o = await pbGet(`collections/opportunities/records/${recordId}?expand=customer`);
      return {
        id: o.id, opportunity: o.opportunity, title: o.title, status: o.status,
        capex: o.capex, opex_monthly: o.opex_monthly, contract_term_months: o.contract_term_months,
        customer: o.expand?.customer ? { id: o.expand.customer.id, name: o.expand.customer.name } : o.customer,
      };
    },
  },
  {
    name: 'list_quotes',
    description: 'List quotes, optionally filtered by opportunity record ID or opportunity number.',
    parameters: {
      type: 'object',
      properties: {
        opportunityId: { type: 'string', description: 'Opportunity record ID or opportunity number (e.g. "1000049113")' },
      },
    },
    execute: async ({ opportunityId }) => {
      const params = new URLSearchParams({ sort: '-created', perPage: '200', expand: 'opportunity,created_by' });
      if (opportunityId) {
        const recordId = await resolveOpportunityId(opportunityId);
        params.set('filter', `opportunity = "${recordId}"`);
      }
      const data = await pbGet(`collections/quotes/records?${params}`);
      return data.items.map(q => {
        const qd = q.quote_data || {};
        return {
          id: q.id, name: qd.name || 'Untitled',
          opportunity: q.expand?.opportunity ? { id: q.expand.opportunity.id, title: q.expand.opportunity.title } : q.opportunity,
          created_by: q.expand?.created_by?.email,
          item_count: (qd.groups || []).reduce((n, g) => n + (g.items || []).length, 0),
          created: q.created, updated: q.updated,
        };
      });
    },
  },
  {
    name: 'get_quote',
    description: 'Get a single quote with full data including all line items, groups, and pricing.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Quote record ID' },
      },
      required: ['id'],
    },
    execute: async ({ id }) => {
      const q = await pbGet(`collections/quotes/records/${id}?expand=opportunity,created_by`);
      return {
        id: q.id, quote_data: q.quote_data,
        opportunity: q.expand?.opportunity ? { id: q.expand.opportunity.id, title: q.expand.opportunity.title } : q.opportunity,
        created_by: q.expand?.created_by?.email,
        created: q.created, updated: q.updated,
      };
    },
  },
  {
    name: 'create_quote',
    description: 'Create a new empty quote for an opportunity.',
    parameters: {
      type: 'object',
      properties: {
        opportunityId: { type: 'string', description: 'Opportunity record ID or opportunity number (e.g. "1000063258")' },
        name: { type: 'string', description: 'Quote name (default: "New Quote")' },
      },
      required: ['opportunityId'],
    },
    execute: async ({ opportunityId, name }) => {
      const recordId = await resolveOpportunityId(opportunityId);
      const quote_data = {
        name: name || 'New Quote',
        groups: [{ name: 'Default', items: [] }],
      };
      const q = await pbPost('collections/quotes/records', { opportunity: recordId, quote_data });
      return { id: q.id, name: quote_data.name, message: 'Quote created successfully' };
    },
  },
  {
    name: 'add_item_to_quote',
    description: 'Add a license/product to a quote. Adds to the first group by default.',
    parameters: {
      type: 'object',
      properties: {
        quoteId: { type: 'string', description: 'Quote record ID' },
        licenseId: { type: 'string', description: 'License record ID to add' },
        amount: { type: 'number', description: 'Quantity (default: 1)' },
        slaId: { type: 'string', description: 'SLA record ID to assign' },
      },
      required: ['quoteId', 'licenseId'],
    },
    execute: async ({ quoteId, licenseId, amount, slaId }) => {
      // Get the license details
      const license = await pbGet(`collections/licenses/records/${licenseId}?expand=possible_SLAs`);
      // Get current quote
      const q = await pbGet(`collections/quotes/records/${quoteId}`);
      const qd = q.quote_data || { name: 'Untitled', groups: [{ name: 'Default', items: [] }] };
      if (!qd.groups || !qd.groups.length) qd.groups = [{ name: 'Default', items: [] }];

      const newItem = {
        license: licenseId, sku: license.sku, name: license.name,
        type: license.type, amount: amount || 1,
        initial_price: license.initial_price,
        price: license.initial_price,
        sla: slaId || null,
      };
      qd.groups[0].items.push(newItem);
      await pbPatch(`collections/quotes/records/${quoteId}`, { quote_data: qd });
      return { message: `Added ${license.name} to quote`, item: newItem };
    },
  },
  {
    name: 'remove_item_from_quote',
    description: 'Remove an item from a quote by its index within the first group.',
    parameters: {
      type: 'object',
      properties: {
        quoteId: { type: 'string', description: 'Quote record ID' },
        itemIndex: { type: 'number', description: 'Zero-based index of the item to remove' },
      },
      required: ['quoteId', 'itemIndex'],
    },
    execute: async ({ quoteId, itemIndex }) => {
      const q = await pbGet(`collections/quotes/records/${quoteId}`);
      const qd = q.quote_data;
      if (!qd?.groups?.[0]?.items?.[itemIndex]) throw new Error('Item not found at index ' + itemIndex);
      const removed = qd.groups[0].items.splice(itemIndex, 1)[0];
      await pbPatch(`collections/quotes/records/${quoteId}`, { quote_data: qd });
      return { message: `Removed ${removed.name} from quote`, removed };
    },
  },
  {
    name: 'update_quote_item',
    description: 'Update properties of a quote line item (amount, SLA, price).',
    parameters: {
      type: 'object',
      properties: {
        quoteId: { type: 'string', description: 'Quote record ID' },
        itemIndex: { type: 'number', description: 'Zero-based index of the item' },
        amount: { type: 'number', description: 'New quantity' },
        slaId: { type: 'string', description: 'New SLA record ID' },
        price: { type: 'number', description: 'Override price' },
      },
      required: ['quoteId', 'itemIndex'],
    },
    execute: async ({ quoteId, itemIndex, amount, slaId, price }) => {
      const q = await pbGet(`collections/quotes/records/${quoteId}`);
      const qd = q.quote_data;
      if (!qd?.groups?.[0]?.items?.[itemIndex]) throw new Error('Item not found at index ' + itemIndex);
      const item = qd.groups[0].items[itemIndex];
      if (amount !== undefined) item.amount = amount;
      if (slaId !== undefined) item.sla = slaId;
      if (price !== undefined) item.price = price;
      await pbPatch(`collections/quotes/records/${quoteId}`, { quote_data: qd });
      return { message: `Updated ${item.name}`, item };
    },
  },
  {
    name: 'list_slas',
    description: 'List all available Service Level Agreements.',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const data = await pbGet('collections/service_level_agreements/records?sort=name&perPage=200');
      return data.items.map(s => ({
        id: s.id, name: s.name, monthly_percentage: s.monthly_percentage,
        availability: s.availability, response: s.response, recovery: s.recovery,
      }));
    },
  },
  {
    name: 'list_service_packs',
    description: 'List all available service packs.',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const data = await pbGet('collections/service_packs/records?sort=package_name&perPage=200');
      return data.items.map(s => ({
        id: s.id, package_name: s.package_name,
        scope: s.scope_en || s.scope_de, estimated_hours: s.estimated_hours,
      }));
    },
  },
  {
    name: 'search_installed_base',
    description: 'Search installed base records, optionally filtered by customer.',
    parameters: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Filter by customer ID' },
      },
    },
    execute: async ({ customerId }) => {
      const params = new URLSearchParams({ sort: '-created', perPage: '200', expand: 'customer,license' });
      if (customerId) params.set('filter', `customer = "${customerId}"`);
      const data = await pbGet(`collections/installed_base/records?${params}`);
      return data.items.map(ib => ({
        id: ib.id,
        customer: ib.expand?.customer ? { id: ib.expand.customer.id, name: ib.expand.customer.name } : ib.customer,
        license: ib.expand?.license ? { id: ib.expand.license.id, name: ib.expand.license.name, sku: ib.expand.license.sku } : ib.license,
        lic_amount: ib.lic_amount, installed_on: ib.installed_on,
        support: ib.support, support_start: ib.support_start, contract_term: ib.contract_term,
      }));
    },
  },
];

/** Get tools as OpenAI function definitions */
export function getToolDefinitions() {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/** Get tools as Anthropic tool definitions */
export function getAnthropicToolDefinitions() {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/** Execute a tool by name */
export async function executeTool(name, args) {
  const tool = tools.find(t => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.execute(args || {});
}
