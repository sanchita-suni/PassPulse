/**
 * CSV Generation Utility (FR-018)
 *
 * Implements RFC-4180 standard CSV serialization with:
 * - Proper quote escaping for commas, double quotes, and line breaks.
 * - Spreadsheet Formula Injection (CSV Injection) protection.
 * - Preservation of legitimate numeric values (including negative financial balances).
 */

/**
 * Escapes and sanitizes a single value for CSV output according to RFC-4180.
 *
 * @param {any} val - The raw value to escape.
 * @returns {string} The escaped and spreadsheet-safe string.
 */
function escapeCsvValue(val) {
  if (val === null || val === undefined) {
    return '';
  }

  // Convert pure numbers or booleans directly
  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }

  const str = String(val);

  let sanitized = str;
  // Formula injection protection:
  // If string starts with '=', '+', '-', '@', '\t', '\r', it might be interpreted
  // as a formula by spreadsheet applications (Excel, Google Sheets, LibreOffice).
  // However, pure numeric strings like "-150.00" or "+10" must be preserved as numbers.
  const isPureNumber = !Number.isNaN(Number(str)) && !Number.isNaN(parseFloat(str)) && str.trim() !== '';
  if (!isPureNumber) {
    if (/^[=+\-@\t\r]/.test(str)) {
      sanitized = `'${str}`;
    }
  }

  // RFC-4180: If field contains commas, double quotes, carriage returns, or newlines,
  // enclose it in double quotes and escape internal quotes by doubling them ("").
  if (/[",\r\n]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }

  return sanitized;
}

/**
 * Converts an array of cell values into an RFC-4180 compliant CSV line.
 *
 * @param {Array<any>} row - Array of cell values.
 * @returns {string} Comma-separated escaped row ending with CRLF.
 */
function formatCsvRow(row) {
  if (!Array.isArray(row)) return '';
  return `${row.map(escapeCsvValue).join(',')}\r\n`;
}

const UTF8_BOM = '\uFEFF';

/**
 * Generates a full CSV document from headers and data rows.
 * Prepends a UTF-8 Byte Order Mark (BOM) so spreadsheet tools like Microsoft Excel
 * on Windows automatically detect UTF-8 encoding.
 *
 * @param {object} options
 * @param {string[]} [options.headers] - Column header names.
 * @param {Array<Array<any>>} options.rows - 2D array of data rows.
 * @returns {string} The complete CSV document string with UTF-8 BOM.
 */
function generateCsv({ headers = [], rows = [] } = {}) {
  let output = '';

  if (Array.isArray(headers) && headers.length > 0) {
    output += formatCsvRow(headers);
  }

  if (Array.isArray(rows)) {
    for (const row of rows) {
      output += formatCsvRow(row);
    }
  }

  return `${UTF8_BOM}${output}`;
}

module.exports = {
  UTF8_BOM,
  escapeCsvValue,
  formatCsvRow,
  generateCsv,
};
