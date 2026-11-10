const {
  UTF8_BOM,
  escapeCsvValue,
  formatCsvRow,
  generateCsv,
} = require('./csv.util');

describe('csv.util — RFC-4180 and Formula Injection Protection (FR-018)', () => {
  describe('escapeCsvValue', () => {
    test('handles null, undefined and empty string gracefully', () => {
      expect(escapeCsvValue(null)).toBe('');
      expect(escapeCsvValue(undefined)).toBe('');
      expect(escapeCsvValue('')).toBe('');
    });

    test('preserves plain alphanumeric text as-is', () => {
      expect(escapeCsvValue('TechSummit 2026')).toBe('TechSummit 2026');
      expect(escapeCsvValue('John Doe')).toBe('John Doe');
      expect(escapeCsvValue('user@example.com')).toBe('user@example.com');
    });

    test('quotes fields containing commas', () => {
      expect(escapeCsvValue('Johnson, Jr.')).toBe('"Johnson, Jr."');
      expect(escapeCsvValue('Tech, Cloud, AI')).toBe('"Tech, Cloud, AI"');
    });

    test('escapes and quotes fields containing double quotes', () => {
      expect(escapeCsvValue('He said "Hello"')).toBe('"He said ""Hello"""');
      expect(escapeCsvValue('"VIP" Pass')).toBe('"""VIP"" Pass"');
    });

    test('quotes fields containing newlines or carriage returns', () => {
      expect(escapeCsvValue("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
      expect(escapeCsvValue("Line 1\r\nLine 2")).toBe('"Line 1\r\nLine 2"');
    });

    test('sanitizes formula injection prefixes (=, +, -, @, \\t, \\r)', () => {
      // Direct formula attacks
      expect(escapeCsvValue('=cmd|\' /C calc\'!A0')).toBe('\'=cmd|\' /C calc\'!A0');
      expect(escapeCsvValue('@SUM(A1:A10)')).toBe('\'@SUM(A1:A10)');
      expect(escapeCsvValue('+cmd|calc')).toBe('\'+cmd|calc');
      expect(escapeCsvValue('-2+3+cmd|calc')).toBe('\'-2+3+cmd|calc');
      expect(escapeCsvValue('\tExploit')).toBe('\'\tExploit');
      // Carriage return triggers RFC-4180 quoting
      expect(escapeCsvValue('\rExploit')).toBe('"\'\rExploit"');

      // Formula attack with comma or quote gets sanitized AND quoted
      expect(escapeCsvValue('=SUM(A1, B1)')).toBe('"\'=SUM(A1, B1)"');
    });

    test('preserves legitimate numeric values and negative financial amounts', () => {
      // Pure numbers
      expect(escapeCsvValue(0)).toBe('0');
      expect(escapeCsvValue(499)).toBe('499');
      expect(escapeCsvValue(799.5)).toBe('799.5');
      expect(escapeCsvValue(-150.25)).toBe('-150.25');

      // Pure numeric strings (must NOT be treated as formula injection)
      expect(escapeCsvValue('100')).toBe('100');
      expect(escapeCsvValue('-150.00')).toBe('-150.00');
      expect(escapeCsvValue('+99.99')).toBe('+99.99');
      expect(escapeCsvValue('0.00')).toBe('0.00');
    });

    test('preserves booleans', () => {
      expect(escapeCsvValue(true)).toBe('true');
      expect(escapeCsvValue(false)).toBe('false');
    });
  });

  describe('formatCsvRow', () => {
    test('formats row as comma-separated values ending with CRLF', () => {
      const row = ['TKT-001', 'Alex Johnson', 'VIP Pass', 799.0, true];
      expect(formatCsvRow(row)).toBe('TKT-001,Alex Johnson,VIP Pass,799,true\r\n');
    });

    test('escapes complex fields within the row correctly', () => {
      const row = ['TKT-002', 'Smith, Alice', 'He said "VIP"', '=ALERT(1)', -25.5];
      expect(formatCsvRow(row)).toBe('TKT-002,"Smith, Alice","He said ""VIP""",\'=ALERT(1),-25.5\r\n');
    });

    test('returns empty string for non-array input', () => {
      expect(formatCsvRow(null)).toBe('');
      expect(formatCsvRow(undefined)).toBe('');
    });
  });

  describe('generateCsv', () => {
    test('generates complete CSV document with UTF-8 BOM, headers and data rows', () => {
      const headers = ['Ticket ID', 'Attendee Name', 'Tier', 'Price'];
      const rows = [
        ['TKT-001', 'Alice', 'VIP', 799],
        ['TKT-002', 'Bob, Jr.', 'General', 499],
      ];

      const csv = generateCsv({ headers, rows });
      expect(csv.startsWith(UTF8_BOM)).toBe(true);

      const expected =
        UTF8_BOM +
        'Ticket ID,Attendee Name,Tier,Price\r\n' +
        'TKT-001,Alice,VIP,799\r\n' +
        'TKT-002,"Bob, Jr.",General,499\r\n';

      expect(csv).toBe(expected);
    });

    test('handles empty rows or empty headers gracefully with BOM', () => {
      expect(generateCsv({})).toBe(UTF8_BOM);
      expect(generateCsv({ headers: ['Col A', 'Col B'], rows: [] })).toBe(`${UTF8_BOM}Col A,Col B\r\n`);
      expect(generateCsv({ rows: [['A', 'B']] })).toBe(`${UTF8_BOM}A,B\r\n`);
    });
  });
});
