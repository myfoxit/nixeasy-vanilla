// PDF Generation Engine
// Uses html2pdf.js (CDN) which wraps jsPDF + html2canvas
// Handles A4 rendering, page breaks, header/footer, and quote table overflow

/**
 * Generate a PDF from resolved HTML content blocks.
 *
 * @param {Object} opts
 * @param {Array<{html: string, id?: string}>} opts.blocks - Ordered content blocks with resolved HTML
 * @param {Object} [opts.pageSettings] - Page configuration
 * @param {string} [opts.filename] - Output filename
 * @returns {Promise<void>}
 */
export async function generatePdf({ blocks, pageSettings = {}, filename = 'document.pdf' }) {
  const {
    margins = { top: 20, right: 20, bottom: 20, left: 20 },
    orientation = 'portrait',
    headerHtml = '',
    footerHtml = '',
  } = pageSettings;

  // Build the full document HTML
  const documentHtml = buildDocumentHtml(blocks, { margins, headerHtml, footerHtml });

  // Create a temporary container for rendering
  const tempContainer = document.createElement('div');
  tempContainer.style.cssText = 'position:absolute;left:-9999px;top:0;';
  tempContainer.innerHTML = documentHtml;
  document.body.appendChild(tempContainer);

  const element = tempContainer.querySelector('.pdf-document');

  try {
    const html2pdf = window.html2pdf;
    if (!html2pdf) {
      throw new Error('html2pdf.js not loaded. Please check CDN script in index.html.');
    }

    const opt = {
      margin: [margins.top, margins.right, margins.bottom, margins.left],
      filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        logging: false,
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation,
      },
      pagebreak: {
        mode: ['avoid-all', 'css', 'legacy'],
        before: '.page-break-before',
        after: '.page-break-after',
        avoid: '.no-break',
      },
    };

    await html2pdf().set(opt).from(element).save();
  } finally {
    document.body.removeChild(tempContainer);
  }
}

/**
 * Create a preview element showing the document as it would appear in PDF.
 *
 * @param {Array<{html: string, id?: string, name?: string}>} blocks
 * @param {Object} pageSettings
 * @returns {HTMLElement}
 */
export function createPdfPreview(blocks, pageSettings = {}) {
  const {
    margins = { top: 20, right: 20, bottom: 20, left: 20 },
    headerHtml = '',
    footerHtml = '',
  } = pageSettings;

  const wrapper = document.createElement('div');
  wrapper.className = 'pdf-preview-wrapper';
  wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px;background:var(--bg);min-height:100%;';

  // Render a single "page" view
  const page = document.createElement('div');
  page.className = 'pdf-page';
  page.style.cssText = `
    width:210mm;min-height:297mm;background:white;box-shadow:0 4px 24px rgba(0,0,0,0.12);
    padding:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
    box-sizing:border-box;color:#111827;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
    font-size:11pt;line-height:1.6;position:relative;
  `;

  // Header
  if (headerHtml) {
    const header = document.createElement('div');
    header.className = 'pdf-page-header';
    header.style.cssText = 'margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;';
    header.innerHTML = headerHtml;
    page.appendChild(header);
  }

  // Content blocks
  blocks.forEach((block, index) => {
    const blockEl = document.createElement('div');
    blockEl.className = 'pdf-content-block no-break';
    blockEl.dataset.blockIndex = index;
    if (block.id) blockEl.dataset.containerId = block.id;
    blockEl.style.cssText = 'margin-bottom:16px;';
    blockEl.innerHTML = block.html;
    page.appendChild(blockEl);
  });

  // Footer
  if (footerHtml) {
    const footer = document.createElement('div');
    footer.className = 'pdf-page-footer';
    footer.style.cssText = 'margin-top:auto;padding-top:8px;border-top:1px solid #e5e7eb;font-size:9pt;color:#6b7280;';
    footer.innerHTML = footerHtml;
    page.appendChild(footer);
  }

  wrapper.appendChild(page);
  return wrapper;
}

/**
 * Build the full HTML document string for PDF generation.
 */
function buildDocumentHtml(blocks, { margins, headerHtml, footerHtml }) {
  const marginStr = `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`;

  let html = `<div class="pdf-document" style="font-family:'Segoe UI',system-ui,-apple-system,sans-serif;font-size:11pt;line-height:1.6;color:#111827;">`;

  if (headerHtml) {
    html += `<div style="margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">${headerHtml}</div>`;
  }

  blocks.forEach(block => {
    html += `<div class="no-break" style="margin-bottom:16px;">${block.html}</div>`;
  });

  if (footerHtml) {
    html += `<div style="margin-top:32px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:9pt;color:#6b7280;">${footerHtml}</div>`;
  }

  html += '</div>';
  return html;
}
