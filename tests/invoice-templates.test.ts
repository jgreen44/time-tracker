/**
 * Unit tests for invoice-templates.ts
 *
 * All template render functions are pure TypeScript with no Electron or Node
 * dependencies, so they can be tested directly in Jest without any mocking.
 */

import {
  invoiceTemplates,
  InvoiceData,
  InvoiceLineItem,
} from '../src/invoice-templates';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const SAMPLE_ITEMS: InvoiceLineItem[] = [
  { project: 'Web Dev', date: '7/1/2026', description: 'Frontend work', hours: 4.5, rate: 150, amount: 675 },
  { project: 'Web Dev', date: '7/3/2026', description: 'API work',      hours: 3.0, rate: 150, amount: 450 },
  { project: 'Design',  date: '7/5/2026', description: 'Mockups',       hours: 5.0, rate: 125, amount: 625 },
];

const SUBTOTAL = SAMPLE_ITEMS.reduce((s, i) => s + i.amount, 0); // 1750

function makeData(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    invoiceNumber: 'INV-0042',
    invoiceDate: '7/5/2026',
    dueDate: 'Aug 4, 2026',
    paymentTerms: 'Net 30',
    yourName: 'Jane Smith',
    yourCompany: 'Smith Consulting LLC',
    yourAddress: '123 Main St\nCity, ST 12345',
    yourEmail: 'jane@smith.dev',
    yourPhone: '(555) 867-5309',
    clientName: 'Acme Corp',
    clientAddress: '456 Client Ave\nNew York, NY 10001',
    notes: 'Thank you for your business!',
    dateRange: 'Jul 1 – Jul 31, 2026',
    projectName: 'Web Dev',
    lineItems: SAMPLE_ITEMS,
    subtotal: SUBTOTAL,
    total: SUBTOTAL,
    openingBalance: 0,
    paymentsApplied: 0,
    ...overrides,
  };
}

// ── Registry ──────────────────────────────────────────────────────────────────

describe('invoiceTemplates registry', () => {
  it('exports exactly 10 templates', () => {
    expect(invoiceTemplates).toHaveLength(10);
  });

  it('has unique IDs from 1 to 10', () => {
    expect(invoiceTemplates.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('every template has a non-empty name and description', () => {
    for (const t of invoiceTemplates) {
      expect(t.name.trim().length).toBeGreaterThan(0);
      expect(t.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('every template has a render function', () => {
    for (const t of invoiceTemplates) {
      expect(typeof t.render).toBe('function');
    }
  });

  it('template names are all unique', () => {
    const names = invoiceTemplates.map((t) => t.name);
    expect(new Set(names).size).toBe(10);
  });
});

// ── Per-template render tests ─────────────────────────────────────────────────

describe.each(invoiceTemplates)('Template $id: $name', (template) => {
  const data = makeData();

  it('renders without throwing', () => {
    expect(() => template.render(data)).not.toThrow();
  });

  it('returns a non-empty string', () => {
    const html = template.render(data);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(100);
  });

  it('produces valid HTML with doctype and closing tags', () => {
    const html = template.render(data);
    expect(html).toMatch(/<!DOCTYPE html>/i);
    expect(html).toMatch(/<html/i);
    expect(html).toMatch(/<\/html>/i);
    expect(html).toMatch(/<head/i);
    expect(html).toMatch(/<\/head>/i);
    expect(html).toMatch(/<body/i);
    expect(html).toMatch(/<\/body>/i);
  });

  it('includes the invoice number', () => {
    expect(template.render(data)).toContain('INV-0042');
  });

  it('includes the client name', () => {
    expect(template.render(data)).toContain('Acme Corp');
  });

  it('includes the total amount', () => {
    expect(template.render(data)).toContain('1750.00');
  });

  it('includes your company name', () => {
    expect(template.render(data)).toContain('Smith Consulting LLC');
  });

  it('includes your name', () => {
    expect(template.render(data)).toContain('Jane Smith');
  });

  it('includes your email', () => {
    expect(template.render(data)).toContain('jane@smith.dev');
  });

  it('includes your phone', () => {
    expect(template.render(data)).toContain('(555) 867-5309');
  });

  it('includes your address', () => {
    expect(template.render(data)).toContain('123 Main St');
  });

  it('HTML-escapes dangerous characters in user data', () => {
    const malicious = makeData({
      clientName: '<script>alert("xss")</script>',
      notes: '<b>bold</b> & "quotes"',
    });
    const html = template.render(malicious);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  it('renders with empty optional fields without crashing', () => {
    const minimal = makeData({
      yourCompany: '',
      yourAddress: '',
      yourEmail: '',
      yourPhone: '',
      clientAddress: '',
      notes: '',
      projectName: '',
    });
    expect(() => template.render(minimal)).not.toThrow();
  });

  it('renders with zero line items', () => {
    const noItems = makeData({ lineItems: [], subtotal: 0, total: 0 });
    expect(() => template.render(noItems)).not.toThrow();
    expect(template.render(noItems)).toContain('0.00');
  });

  it('renders with a single line item', () => {
    const oneItem = makeData({ lineItems: [SAMPLE_ITEMS[0]], subtotal: 675, total: 675 });
    expect(template.render(oneItem)).toContain('675.00');
  });

  it('renders multi-project data without crashing', () => {
    expect(() => template.render(data)).not.toThrow();
    expect(template.render(data)).toContain('1750.00');
  });

  it('different invoice numbers produce different output', () => {
    const html1 = template.render(makeData({ invoiceNumber: 'INV-0001' }));
    const html2 = template.render(makeData({ invoiceNumber: 'INV-9999' }));
    expect(html1).not.toBe(html2);
  });

  it('renders the due date', () => {
    expect(template.render(data)).toContain('Aug 4, 2026');
  });

  it('renders the date range', () => {
    expect(template.render(data)).toContain('Jul 1');
  });
});

// ── HTML escaping helper (tested via render output) ───────────────────────────

describe('HTML escaping in templates', () => {
  const template = invoiceTemplates[0]; // Classic Minimal

  it.each([
    ['& ampersand',        'AT&T',        '&amp;'],
    ['< less-than',        '1 < 2',       '&lt;'],
    ['> greater-than',     '2 > 1',       '&gt;'],
    ['" double-quote',     'Say "Hello"', '&quot;'],
  ])('escapes %s', (_desc, input, expected) => {
    const html = template.render(makeData({ clientName: input }));
    expect(html).toContain(expected);
  });

  it('escapes XSS in yourName', () => {
    const html = template.render(makeData({ yourName: '<img onerror=alert(1)>' }));
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;img');
  });

  it('escapes XSS in yourAddress', () => {
    const html = template.render(makeData({ yourAddress: '<script>evil()</script>' }));
    expect(html).not.toContain('<script>evil');
  });

  it('escapes XSS in notes', () => {
    const html = template.render(makeData({ notes: '"><script>x</script>' }));
    expect(html).not.toContain('<script>x</script>');
  });
});

// ── Newline → <br> conversion in address fields ───────────────────────────────

describe('address line-break handling', () => {
  it('converts newlines to <br> in yourAddress', () => {
    const html = invoiceTemplates[0].render(makeData({ yourAddress: 'Line1\nLine2\nLine3' }));
    expect(html).toContain('<br>');
  });

  it('converts newlines to <br> in clientAddress', () => {
    const html = invoiceTemplates[0].render(makeData({ clientAddress: '456 Ave\nSuite 100' }));
    expect(html).toContain('<br>');
  });
});

// ── Monetary formatting ───────────────────────────────────────────────────────

describe('monetary values in output', () => {
  it('formats subtotal as $N.NN', () => {
    const html = invoiceTemplates[0].render(makeData({ subtotal: 1234.5, total: 1234.5 }));
    expect(html).toContain('1234.50');
  });

  it('formats total independently from subtotal', () => {
    const html = invoiceTemplates[0].render(makeData({ subtotal: 1000, total: 900 }));
    expect(html).toContain('900.00');
  });

  it('handles large amounts', () => {
    const html = invoiceTemplates[0].render(makeData({ subtotal: 99999.99, total: 99999.99 }));
    expect(html).toContain('99999.99');
  });

  it('handles zero total', () => {
    const html = invoiceTemplates[0].render(makeData({ lineItems: [], subtotal: 0, total: 0 }));
    expect(html).toContain('0.00');
  });

  it('per-item amounts are included', () => {
    const html = invoiceTemplates[0].render(makeData());
    expect(html).toContain('675.00'); // first item
    expect(html).toContain('450.00'); // second item
  });

  it('shows a running balance and retainer line when opening credit exists', () => {
    const credited = makeData({
      openingBalance: -350,
      paymentsApplied: 350,
      total: 1400,
      lineItems: [
        { project: '', date: '', description: 'Retainer / payments applied', hours: 0, rate: 0, amount: -350, balance: -350, isAdjustment: true },
        { ...SAMPLE_ITEMS[0], balance: 325 },
        { ...SAMPLE_ITEMS[1], balance: 775 },
        { ...SAMPLE_ITEMS[2], balance: 1400 },
      ],
    });
    const html = invoiceTemplates[0].render(credited);
    expect(html).toContain('Balance');
    expect(html).toContain('Retainer / payments applied');
    expect(html).toContain('-$350.00');
  });

  it.each(invoiceTemplates)('Template $id ($name) renders a retainer credit without throwing', (template) => {
    const credited = makeData({
      openingBalance: -350,
      paymentsApplied: 350,
      total: 1400,
      lineItems: [
        { project: '', date: '', description: 'Retainer / payments applied', hours: 0, rate: 0, amount: -350, balance: -350, isAdjustment: true },
        { ...SAMPLE_ITEMS[0], balance: 325 },
      ],
    });
    expect(() => template.render(credited)).not.toThrow();
    expect(template.render(credited)).toContain('Retainer / payments applied');
  });
});

// ── Contact info completeness ─────────────────────────────────────────────────

describe('contact information in all templates', () => {
  it.each(invoiceTemplates)('Template $id ($name) includes yourEmail', (template) => {
    const html = template.render(makeData());
    expect(html).toContain('jane@smith.dev');
  });

  it.each(invoiceTemplates)('Template $id ($name) includes yourPhone', (template) => {
    const html = template.render(makeData());
    expect(html).toContain('(555) 867-5309');
  });

  it.each(invoiceTemplates)('Template $id ($name) includes yourAddress snippet', (template) => {
    const html = template.render(makeData());
    expect(html).toContain('123 Main St');
  });

  it.each(invoiceTemplates)('Template $id ($name) renders gracefully with no contact info', (template) => {
    const noContact = makeData({ yourEmail: '', yourPhone: '', yourAddress: '' });
    expect(() => template.render(noContact)).not.toThrow();
  });
});
