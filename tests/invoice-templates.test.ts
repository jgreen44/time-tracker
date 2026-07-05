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

// ── Shared fixtures ──────────────────────────────────────────────────────────

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
    ...overrides,
  };
}

// ── Registry ─────────────────────────────────────────────────────────────────

describe('invoiceTemplates registry', () => {
  it('exports exactly 10 templates', () => {
    expect(invoiceTemplates).toHaveLength(10);
  });

  it('has unique IDs from 1 to 10', () => {
    const ids = invoiceTemplates.map((t) => t.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
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
    const html = template.render(data);
    expect(html).toContain('INV-0042');
  });

  it('includes the client name', () => {
    const html = template.render(data);
    expect(html).toContain('Acme Corp');
  });

  it('includes the total amount', () => {
    const html = template.render(data);
    // $1750.00
    expect(html).toContain('1750.00');
  });

  it('includes your company name', () => {
    const html = template.render(data);
    expect(html).toContain('Smith Consulting LLC');
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
    const html = template.render(noItems);
    expect(html).toContain('0.00');
  });

  it('renders with a single line item', () => {
    const oneItem = makeData({
      lineItems: [SAMPLE_ITEMS[0]],
      subtotal: 675,
      total: 675,
    });
    const html = template.render(oneItem);
    expect(html).toContain('675.00');
  });

  it('renders multi-project data', () => {
    const html = template.render(data);
    // Ensure no crash with mixed projects; totals should appear
    expect(html).toContain('1750.00');
  });
});

// ── HTML escaping helper (tested via render output) ───────────────────────────

describe('HTML escaping in templates', () => {
  const template = invoiceTemplates[0]; // Classic Minimal

  it.each([
    ['& ampersand', 'AT&T', '&amp;'],
    ['< less-than', '1 < 2', '&lt;'],
    ['> greater-than', '2 > 1', '&gt;'],
    ['" double-quote in company', 'Say "Hello"', '&quot;'],
  ])('escapes %s', (_desc, input, expected) => {
    const html = template.render(makeData({ clientName: input }));
    expect(html).toContain(expected);
  });
});

// ── Newline → <br> conversion in address fields ───────────────────────────────

describe('address line-break handling', () => {
  it('converts newlines to <br> in yourAddress', () => {
    const html = invoiceTemplates[0].render(
      makeData({ yourAddress: 'Line1\nLine2\nLine3' })
    );
    expect(html).toContain('<br>');
  });

  it('converts newlines to <br> in clientAddress', () => {
    const html = invoiceTemplates[0].render(
      makeData({ clientAddress: '456 Ave\nSuite 100' })
    );
    expect(html).toContain('<br>');
  });
});

// ── Totals calculation reflected in output ───────────────────────────────────

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
});
