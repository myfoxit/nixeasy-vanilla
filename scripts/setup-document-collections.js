#!/usr/bin/env node
/**
 * Setup script for Document Template Builder collections in PocketBase.
 *
 * Usage:
 *   node scripts/setup-document-collections.js [POCKETBASE_URL] [ADMIN_EMAIL] [ADMIN_PASSWORD]
 *
 * Defaults:
 *   POCKETBASE_URL = http://localhost:8080
 *
 * This script creates two collections:
 *   1. text_containers  — reusable text blocks with WYSIWYG content
 *   2. document_templates — composed document templates referencing text containers
 *
 * You can also create these manually via the PocketBase admin UI (/_/).
 */

const PB_URL = process.argv[2] || 'http://localhost:8080';
const ADMIN_EMAIL = process.argv[3];
const ADMIN_PASSWORD = process.argv[4];

async function main() {
  console.log('=== Document Template Builder — PocketBase Collection Setup ===');
  console.log(`PocketBase URL: ${PB_URL}`);
  console.log('');

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log('No admin credentials provided. Printing collection definitions for manual creation.\n');
    printManualInstructions();
    return;
  }

  // Authenticate as admin
  const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  if (!authRes.ok) {
    // Try superuser auth
    const suRes = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });

    if (!suRes.ok) {
      console.error('Failed to authenticate. Check credentials.');
      process.exit(1);
    }

    var token = (await suRes.json()).token;
  } else {
    var token = (await authRes.json()).token;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': token,
  };

  // Create text_containers collection
  console.log('Creating text_containers collection...');
  try {
    const res = await fetch(`${PB_URL}/api/collections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'text_containers',
        type: 'base',
        schema: [
          {
            name: 'name',
            type: 'text',
            required: true,
            options: { min: 1, max: 255 },
          },
          {
            name: 'content',
            type: 'editor',
            required: false,
            options: {},
          },
          {
            name: 'category',
            type: 'select',
            required: false,
            options: {
              values: ['header', 'body', 'pricing', 'footer', 'legal'],
              maxSelect: 1,
            },
          },
        ],
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
      }),
    });
    if (res.ok) {
      console.log('  ✓ text_containers created');
    } else {
      const err = await res.json();
      console.log('  ✗ Failed:', JSON.stringify(err));
    }
  } catch (err) {
    console.log('  ✗ Error:', err.message);
  }

  // Create document_templates collection
  console.log('Creating document_templates collection...');
  try {
    const res = await fetch(`${PB_URL}/api/collections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'document_templates',
        type: 'base',
        schema: [
          {
            name: 'name',
            type: 'text',
            required: true,
            options: { min: 1, max: 255 },
          },
          {
            name: 'description',
            type: 'text',
            required: false,
            options: { max: 1000 },
          },
          {
            name: 'containers',
            type: 'json',
            required: false,
            options: {},
          },
          {
            name: 'page_settings',
            type: 'json',
            required: false,
            options: {},
          },
        ],
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
      }),
    });
    if (res.ok) {
      console.log('  ✓ document_templates created');
    } else {
      const err = await res.json();
      console.log('  ✗ Failed:', JSON.stringify(err));
    }
  } catch (err) {
    console.log('  ✗ Error:', err.message);
  }

  console.log('\nDone!');
}

function printManualInstructions() {
  console.log(`
=== Manual Collection Setup ===

Go to PocketBase admin UI: ${PB_URL}/_/

1. Create collection: text_containers (Base collection)
   Fields:
   - name       (Text, Required, Max: 255)
   - content    (Editor)
   - category   (Select, Values: header, body, pricing, footer, legal)

   API Rules (all): @request.auth.id != ""

2. Create collection: document_templates (Base collection)
   Fields:
   - name           (Text, Required, Max: 255)
   - description     (Text, Max: 1000)
   - containers      (JSON)
   - page_settings   (JSON)

   API Rules (all): @request.auth.id != ""

=== containers JSON format ===
[
  { "containerId": "<text_container_id>", "order": 0 },
  { "containerId": "<text_container_id>", "order": 1 },
  ...
]

=== page_settings JSON format ===
{
  "margins": { "top": 20, "right": 20, "bottom": 20, "left": 20 },
  "orientation": "portrait",
  "header": "<html>",
  "footer": "<html>"
}
`);
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
