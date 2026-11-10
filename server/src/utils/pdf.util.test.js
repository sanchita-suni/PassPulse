const {
  sanitizePdfText,
  truncateText,
  generatePdfReport,
} = require('./pdf.util');

describe('pdf.util — Standards-Compliant PDF 1.4 Generation (FR-018)', () => {
  describe('sanitizePdfText', () => {
    test('handles null, undefined and empty string', () => {
      expect(sanitizePdfText(null)).toBe('');
      expect(sanitizePdfText(undefined)).toBe('');
      expect(sanitizePdfText('')).toBe('');
    });

    test('replaces Indian Rupee symbol with INR', () => {
      expect(sanitizePdfText('Price: \u20b9499.00')).toBe('Price: INR 499.00');
    });

    test('escapes parentheses and backslashes for PDF string literal', () => {
      expect(sanitizePdfText('Event (Draft)')).toBe('Event \\(Draft\\)');
      expect(sanitizePdfText('Folder\\File')).toBe('Folder\\\\File');
    });

    test('replaces non-printable and extended Unicode characters with space', () => {
      expect(sanitizePdfText('Special 🚀 Rocket')).toBe('Special   Rocket');
    });
  });

  describe('truncateText', () => {
    test('truncates strings longer than maxLen and appends ellipsis', () => {
      expect(truncateText('Short string', 20)).toBe('Short string');
      expect(truncateText('A very long string that should be truncated', 15)).toBe('A very long ...');
      expect(truncateText('Abc', 2)).toBe('Ab');
    });

    test('handles empty or short input', () => {
      expect(truncateText('', 10)).toBe('');
      expect(truncateText(null, 10)).toBe('');
    });
  });

  describe('generatePdfReport — Structure and Conformance', () => {
    test('generates a valid binary PDF buffer starting with %PDF-1.4', () => {
      const pdf = generatePdfReport({
        title: 'PassPulse Test Report',
        subtitle: 'Validation Suite',
        metadata: { Event: 'TechSummit 2026', Venue: 'Auditorium' },
        kpis: [
          { label: 'Total Confirmed', value: '100' },
          { label: 'Turnout', value: '85%' },
        ],
        headers: ['ID', 'Name', 'Tier', 'Status'],
        rows: [['1', 'Alice', 'VIP', 'Checked In']],
      });

      expect(Buffer.isBuffer(pdf)).toBe(true);
      const str = pdf.toString('binary');

      // Verify Header
      expect(str.startsWith('%PDF-1.4\n')).toBe(true);

      // Verify Trailer & EOF
      expect(str.includes('trailer\n')).toBe(true);
      expect(str.includes('/Root 1 0 R')).toBe(true);
      expect(str.includes('startxref\n')).toBe(true);
      expect(str.trim().endsWith('%%EOF')).toBe(true);

      // Verify Catalog and Pages objects
      expect(str).toContain('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>');
      expect(str).toContain('2 0 obj\n<< /Type /Pages');
      expect(str).toContain('/Type /Font /Subtype /Type1 /BaseFont /Helvetica');

      // Verify Cross-Reference Table
      expect(str).toContain('xref\n0 ');
      expect(str).toContain('0000000000 65535 f \n');
    });

    test('verifies exact byte offsets in the xref table', () => {
      const pdf = generatePdfReport({
        title: 'Byte Offset Test',
        headers: ['Col A', 'Col B'],
        rows: [['A1', 'B1']],
      });

      const str = pdf.toString('binary');
      const startXrefIdx = str.lastIndexOf('startxref\n');
      expect(startXrefIdx).toBeGreaterThan(0);

      const startXrefVal = parseInt(str.slice(startXrefIdx + 10, str.indexOf('\n%%EOF')), 10);
      expect(startXrefVal).toBeGreaterThan(0);

      // The xref table should be located exactly at startXrefVal
      const xrefSlice = str.slice(startXrefVal, startXrefVal + 4);
      expect(xrefSlice).toBe('xref');

      // Extract xref line offsets and check that each corresponds to "<id> 0 obj"
      const xrefLines = str.slice(startXrefVal).split('\n');
      const headerLine = xrefLines[1].split(' ');
      const objCount = parseInt(headerLine[1], 10);

      for (let i = 1; i < objCount; i++) {
        const entry = xrefLines[i + 2];
        expect(entry).toHaveLength(19); // 10 digits + space + 5 digits + space + n
        const offset = parseInt(entry.slice(0, 10), 10);
        const targetSlice = str.slice(offset, offset + 15);
        expect(targetSlice).toMatch(new RegExp(`^${i} 0 obj`));
      }
    });

    test('handles multi-page pagination when rows exceed single page limit', () => {
      const rows = [];
      for (let i = 1; i <= 80; i++) {
        rows.push([`TKT-${i}`, `Attendee ${i}`, 'General', 'Checked In']);
      }

      const pdf = generatePdfReport({
        title: 'Multi-Page Test Report',
        metadata: { Total: '80' },
        headers: ['ID', 'Name', 'Tier', 'Status'],
        rows,
      });

      const str = pdf.toString('binary');
      // Count is greater than 1 page
      expect(str).toMatch(/<< \/Type \/Pages \/Kids \[.+\] \/Count [2-9] >>/);
      expect(str).toContain('Page 1 of');
      expect(str).toContain('Page 2 of');
    });

    test('handles empty data rows and secondary tables cleanly', () => {
      const pdf = generatePdfReport({
        title: 'Empty Event Report',
        metadata: { Status: 'Draft' },
        headers: ['ID', 'Name'],
        rows: [],
        secondaryTable: {
          title: 'Tier Summary',
          headers: ['Tier', 'Price', 'Sold'],
          rows: [['Early Bird', 'INR 199', '0']],
          columnRatios: [40, 30, 30],
        },
      });

      const str = pdf.toString('binary');
      expect(str).toContain('Empty Event Report');
      expect(str).toContain('No data records found');
      expect(str).toContain('Tier Summary');
      expect(str).toContain('Early Bird');
    });

    test('handles renderTable with empty headers or custom column ratios', () => {
      const pdf = generatePdfReport({
        title: 'Ratio Test',
        headers: ['A', 'B'],
        rows: [['1', '2']],
        columnRatios: [60, 40],
      });
      expect(Buffer.isBuffer(pdf)).toBe(true);

      const pdfNoHeaders = generatePdfReport({
        title: 'No Headers Test',
        headers: [],
        rows: [],
      });
      expect(Buffer.isBuffer(pdfNoHeaders)).toBe(true);
    });
  });
});
