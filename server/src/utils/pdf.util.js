/**
 * PDF Generation Utility (FR-018)
 *
 * Generates standards-compliant, lightweight PDF 1.4 documents in pure Node.js
 * without requiring third-party runtime dependencies.
 *
 * Implements:
 * - Proper PDF 1.4 document structure (Catalog, Pages, Page, Font, Streams, XRef, Trailer).
 * - Exact byte offset calculations and 20-byte cross-reference table entries.
 * - Automatic page breaks and multi-page pagination.
 * - Clean professional layout: Header banners, metadata cards, KPI metrics, and formatted data tables.
 * - String sanitization, parenthesis/backslash escaping, and non-ASCII/Unicode handling.
 */

/**
 * Sanitizes and escapes a string for safe embedding into a PDF Type-1 font text operator `(...) Tj`.
 *
 * @param {any} str - Text to sanitize.
 * @returns {string} Escaped ASCII string.
 */
function sanitizePdfText(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\u20b9/g, 'INR ') // Indian Rupee symbol
    .replace(/[^\x20-\x7E]/gu, ' ') // Map outside printable ASCII to single space per code point
    .replace(/[\(\)\\]/g, '\\$&'); // Escape (, ), \
}

/**
 * Truncates text with an ellipsis if it exceeds maximum character length.
 *
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncateText(str, maxLen = 30) {
  if (!str) return '';
  const s = String(str);
  if (s.length <= maxLen) return s;
  if (maxLen <= 3) return s.slice(0, maxLen);
  return `${s.slice(0, maxLen - 3)}...`;
}

/**
 * Builds a valid PDF 1.4 binary buffer.
 *
 * @param {object} options
 * @param {string} options.title - Document title.
 * @param {string} [options.subtitle] - Subtitle or date range.
 * @param {Record<string, string>} [options.metadata] - Key-value metadata card.
 * @param {Array<{ label: string, value: string }>} [options.kpis] - KPI summary cards.
 * @param {string[]} [options.headers] - Main table headers.
 * @param {Array<Array<any>>} [options.rows] - Main table rows.
 * @param {number[]} [options.columnRatios] - Optional custom relative column widths.
 * @param {object} [options.secondaryTable] - Optional secondary table (e.g. Tier Breakdown).
 * @param {string[]} [options.secondaryTable.headers]
 * @param {Array<Array<any>>} [options.secondaryTable.rows]
 * @param {string} [options.secondaryTable.title]
 * @returns {Buffer} Valid PDF binary buffer.
 */
function generatePdfReport({
  title,
  subtitle = '',
  metadata = {},
  kpis = [],
  headers = [],
  rows = [],
  columnRatios = null,
  secondaryTable = null,
} = {}) {
  const pages = [];
  let currentPageStream = '';
  let currentY = 800;

  function startPage() {
    if (currentPageStream) {
      pages.push(currentPageStream);
    }
    currentPageStream = '';
    currentY = 790;
    // Primary top accent bar (dark navy)
    currentPageStream += '0.12 0.18 0.32 rg\n40 782 515 4 re f\n';
  }

  startPage();

  // Draw Document Title
  currentPageStream += `BT\n/F2 16 Tf\n0.1 0.15 0.25 rg\n40 752 Td\n(${sanitizePdfText(title)}) Tj\nET\n`;
  if (subtitle) {
    currentPageStream += `BT\n/F1 9 Tf\n0.45 0.45 0.5 rg\n40 738 Td\n(${sanitizePdfText(subtitle)}) Tj\nET\n`;
  }

  currentY = 720;

  // Metadata Card
  const metaEntries = Object.entries(metadata);
  if (metaEntries.length > 0) {
    const cardHeight = Math.max(40, Math.ceil(metaEntries.length / 2) * 16 + 10);
    currentPageStream += `0.96 0.97 0.99 rg\n40 ${currentY - cardHeight + 10} 515 ${cardHeight} re f\n`;
    currentPageStream += `0.85 0.88 0.92 RG\n0.5 w\n40 ${currentY - cardHeight + 10} 515 ${cardHeight} re s\n`;

    for (let i = 0; i < metaEntries.length; i++) {
      const [k, v] = metaEntries[i];
      const colX = 50 + (i % 2) * 250;
      const rowY = currentY - Math.floor(i / 2) * 16;
      currentPageStream += `BT\n/F2 8.5 Tf\n0.25 0.25 0.3 rg\n${colX} ${rowY} Td\n(${sanitizePdfText(k)}: ) Tj\n`;
      currentPageStream += `/F1 8.5 Tf\n0.35 0.35 0.4 rg\n(${sanitizePdfText(truncateText(v, 36))}) Tj\nET\n`;
    }
    currentY -= cardHeight + 12;
  }

  // KPI Summary Cards
  if (Array.isArray(kpis) && kpis.length > 0) {
    const cardWidth = Math.floor(515 / kpis.length);
    for (let i = 0; i < kpis.length; i++) {
      const kpi = kpis[i];
      const kx = 40 + i * cardWidth;
      // Card fill & stroke
      currentPageStream += `0.94 0.96 0.99 rg\n${kx + 2} ${currentY - 32} ${cardWidth - 4} 36 re f\n`;
      currentPageStream += `0.82 0.86 0.92 RG\n0.5 w\n${kx + 2} ${currentY - 32} ${cardWidth - 4} 36 re s\n`;
      // KPI Label
      currentPageStream += `BT\n/F1 7.5 Tf\n0.4 0.45 0.55 rg\n${kx + 8} ${currentY - 10} Td\n(${sanitizePdfText(kpi.label)}) Tj\nET\n`;
      // KPI Value
      currentPageStream += `BT\n/F2 12 Tf\n0.08 0.18 0.38 rg\n${kx + 8} ${currentY - 25} Td\n(${sanitizePdfText(kpi.value)}) Tj\nET\n`;
    }
    currentY -= 48;
  }

  // Helper to draw a table
  function renderTable({ tableTitle = '', tblHeaders = [], tblRows = [], ratios = null }) {
    if (!tblHeaders || tblHeaders.length === 0) return;

    if (tableTitle) {
      if (currentY < 100) {
        startPage();
      }
      currentPageStream += `BT\n/F2 11 Tf\n0.15 0.2 0.3 rg\n40 ${currentY} Td\n(${sanitizePdfText(tableTitle)}) Tj\nET\n`;
      currentY -= 14;
    }

    const colCount = tblHeaders.length;
    let colWidths = [];
    if (Array.isArray(ratios) && ratios.length === colCount) {
      const sum = ratios.reduce((a, b) => a + b, 0);
      colWidths = ratios.map((r) => Math.floor((r / sum) * 515));
    } else {
      const uniform = Math.floor(515 / colCount);
      colWidths = new Array(colCount).fill(uniform);
    }

    function drawHeaders() {
      currentPageStream += `0.18 0.24 0.36 rg\n40 ${currentY - 16} 515 18 re f\n`;
      let curX = 45;
      for (let c = 0; c < colCount; c++) {
        currentPageStream += `BT\n/F2 8 Tf\n1 1 1 rg\n${curX} ${currentY - 12} Td\n(${sanitizePdfText(tblHeaders[c])}) Tj\nET\n`;
        curX += colWidths[c];
      }
      currentY -= 20;
    }

    drawHeaders();

    if (tblRows.length === 0) {
      currentPageStream += `BT\n/F1 8.5 Tf\n0.5 0.5 0.5 rg\n50 ${currentY - 12} Td\n(No data records found) Tj\nET\n`;
      currentY -= 22;
      return;
    }

    for (let r = 0; r < tblRows.length; r++) {
      if (currentY < 55) {
        startPage();
        drawHeaders();
      }

      const row = tblRows[r];
      const bg = r % 2 === 0 ? '0.98 0.98 0.99' : '1 1 1';
      currentPageStream += `${bg} rg\n40 ${currentY - 13} 515 15 re f\n`;
      currentPageStream += `0.9 0.92 0.94 RG\n0.5 w\n40 ${currentY - 13} 515 0.5 re s\n`;

      let curX = 45;
      for (let c = 0; c < colCount; c++) {
        const cellText = String(row[c] ?? '');
        const maxChars = Math.max(10, Math.floor(colWidths[c] / 5.5));
        currentPageStream += `BT\n/F1 7.5 Tf\n0.2 0.2 0.2 rg\n${curX} ${currentY - 9} Td\n(${sanitizePdfText(truncateText(cellText, maxChars))}) Tj\nET\n`;
        curX += colWidths[c];
      }
      currentY -= 15;
    }

    currentY -= 15;
  }

  // Draw secondary table if provided (e.g., Tier Breakdown)
  if (secondaryTable) {
    renderTable({
      tableTitle: secondaryTable.title,
      tblHeaders: secondaryTable.headers,
      tblRows: secondaryTable.rows,
      ratios: secondaryTable.columnRatios,
    });
  }

  // Draw main data table
  if (headers && headers.length > 0) {
    renderTable({
      tableTitle: secondaryTable ? 'Detailed Records' : '',
      tblHeaders: headers,
      tblRows: rows,
      ratios: columnRatios,
    });
  }

  // Push final page
  pages.push(currentPageStream);

  // Append page footers to each page
  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i++) {
    const footerText = `PassPulse Reporting Engine  |  Page ${i + 1} of ${totalPages}`;
    pages[i] += `BT\n/F1 7 Tf\n0.6 0.6 0.6 rg\n40 25 Td\n(${sanitizePdfText(footerText)}) Tj\nET\n`;
    pages[i] += `0.85 0.88 0.92 RG\n0.5 w\n40 35 515 0.5 re s\n`;
  }

  // PDF Object Generation
  const pageObjIds = [];
  const streamObjIds = [];
  let nextId = 5;

  for (let i = 0; i < totalPages; i++) {
    pageObjIds.push(nextId++);
    streamObjIds.push(nextId++);
  }

  const objects = [];
  // 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  // 2: Pages
  const kidsStr = pageObjIds.map((id) => `${id} 0 R`).join(' ');
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${totalPages} >>\nendobj\n`);
  // 3: Font F1 (Helvetica)
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  // 4: Font F2 (Helvetica-Bold)
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');

  for (let i = 0; i < totalPages; i++) {
    const pageId = pageObjIds[i];
    const streamId = streamObjIds[i];
    const streamContent = pages[i];
    const streamBuf = Buffer.from(streamContent, 'utf8');

    // Page Object
    objects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents ${streamId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj\n`
    );
    // Content Stream Object
    objects.push(
      `${streamId} 0 obj\n<< /Length ${streamBuf.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`
    );
  }

  const totalObjects = objects.length;
  const header = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  let offset = Buffer.byteLength(header, 'binary');
  const offsets = [];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset);
    offset += Buffer.byteLength(objects[i], 'utf8');
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let i = 0; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(header + objects.join('') + xref + trailer, 'binary');
}

module.exports = {
  sanitizePdfText,
  truncateText,
  generatePdfReport,
};
