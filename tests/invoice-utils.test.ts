/**
 * Unit tests for invoice-utils.ts
 *
 * All functions are pure (no I/O, no Electron), so these tests run in a plain
 * Node/Jest environment with no special setup.
 */

import {
  formatLocalDate,
  formatLocalTime,
  buildInvoiceData,
  buildPreviewHtml,
  findTemplate,
  entriesToLineItems,
  SAMPLE_LINE_ITEMS,
  PREVIEW_SCREEN_CSS,
  InvoiceFormParams,
  RawEntry,
} from '../src/invoice-utils';

// ── Shared fixtures ───────────────────────────────────────────────────────────

function makeParams(overrides: Partial<InvoiceFormParams> = {}): InvoiceFormParams {
  return {
    templateId:    1,
    invoiceNumber: 'INV-0042',
    dueDate:       'Aug 4, 2026',
    paymentTerms:  'Net 30',
    yourName:      'Jane Smith',
    yourCompany:   'Smith LLC',
    yourAddress:   '123 Main St',
    yourEmail:     'jane@smith.dev',
    yourPhone:     '555-1234',
    clientName:    'Acme Corp',
    clientAddress: '456 Client Ave',
    notes:         'Thanks!',
    rangeFrom:     1_700_000_000_000,
    rangeTo:       1_702_592_000_000,
    projectId:     null,
    ...overrides,
  };
}

// ── formatLocalDate ───────────────────────────────────────────────────────────

describe('formatLocalDate', () => {
  it('returns a non-empty string for any timestamp', () => {
    expect(typeof formatLocalDate(Date.now())).toBe('string');
    expect(formatLocalDate(Date.now()).length).toBeGreaterThan(0);
  });

  it('returns the same value as new Date(ms).toLocaleDateString()', () => {
    const ms = 1_700_000_000_000;
    expect(formatLocalDate(ms)).toBe(new Date(ms).toLocaleDateString());
  });

  it('handles epoch (0)', () => {
    expect(() => formatLocalDate(0)).not.toThrow();
  });
});

// ── formatLocalTime ───────────────────────────────────────────────────────────

describe('formatLocalTime', () => {
  it('returns a non-empty string', () => {
    expect(formatLocalTime(Date.now()).length).toBeGreaterThan(0);
  });

  it('matches new Date(ms).toLocaleTimeString()', () => {
    const ms = 1_700_000_000_000;
    expect(formatLocalTime(ms)).toBe(new Date(ms).toLocaleTimeString());
  });
});

// ── entriesToLineItems ────────────────────────────────────────────────────────

describe('entriesToLineItems', () => {
  const T = (offset: number) => 1_700_000_000_000 + offset;

  const entries: RawEntry[] = [
    { project_name: 'Web Dev', started_at: T(0),    ended_at: T(3_600_000),  note: 'feature work', hourly_rate: 100 },
    { project_name: 'Design',  started_at: T(5000),  ended_at: T(7_205_000),  note: 'mockups',       hourly_rate: 125 },
    { project_name: 'Web Dev', started_at: T(10000), ended_at: null,           note: 'in progress',   hourly_rate: 100 },
  ];

  it('filters out entries without ended_at', () => {
    const items = entriesToLineItems(entries);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.description)).not.toContain('in progress');
  });

  it('computes hours correctly (ms → hours)', () => {
    const items = entriesToLineItems(entries);
    // Entry 0: 3,600,000 ms = 1 hour exactly
    expect(items[0].hours).toBeCloseTo(1.0, 5);
  });

  it('computes amount = hours * rate', () => {
    const items = entriesToLineItems(entries);
    expect(items[0].amount).toBeCloseTo(items[0].hours * items[0].rate, 5);
  });

  it('uses 0 as rate when hourly_rate is null', () => {
    const noRate: RawEntry[] = [
      { project_name: 'X', started_at: T(0), ended_at: T(3_600_000), note: null, hourly_rate: null },
    ];
    const items = entriesToLineItems(noRate);
    expect(items[0].rate).toBe(0);
    expect(items[0].amount).toBe(0);
  });

  it('uses empty string for description when note is null', () => {
    const noNote: RawEntry[] = [
      { project_name: 'X', started_at: T(0), ended_at: T(3_600_000), note: null, hourly_rate: 50 },
    ];
    expect(entriesToLineItems(noNote)[0].description).toBe('');
  });

  it('returns empty array for empty input', () => {
    expect(entriesToLineItems([])).toEqual([]);
  });

  it('returns empty array when all entries are running (no ended_at)', () => {
    const running: RawEntry[] = [
      { project_name: 'X', started_at: T(0), ended_at: null, note: null, hourly_rate: 100 },
    ];
    expect(entriesToLineItems(running)).toHaveLength(0);
  });
});

// ── buildInvoiceData ──────────────────────────────────────────────────────────

describe('buildInvoiceData', () => {
  it('passes through all provided fields', () => {
    const params = makeParams();
    const data = buildInvoiceData(params, SAMPLE_LINE_ITEMS, 'Jul – Aug 2026');
    expect(data.invoiceNumber).toBe('INV-0042');
    expect(data.clientName).toBe('Acme Corp');
    expect(data.yourName).toBe('Jane Smith');
    expect(data.dateRange).toBe('Jul – Aug 2026');
  });

  it('uses fallback values when fields are empty strings', () => {
    const data = buildInvoiceData(
      makeParams({ invoiceNumber: '', dueDate: '', yourName: '', clientName: '', yourCompany: '' }),
      SAMPLE_LINE_ITEMS,
      'some range'
    );
    expect(data.invoiceNumber).toBe('INV-0001');
    expect(data.dueDate).toBe('Net 30');
    expect(data.yourName).toBe('Your Name');
    expect(data.clientName).toBe('Acme Corporation');
    expect(data.yourCompany).toBe('Your Company LLC');
  });

  it('computes subtotal as sum of all line item amounts', () => {
    const total = SAMPLE_LINE_ITEMS.reduce((s, i) => s + i.amount, 0);
    const data = buildInvoiceData(makeParams(), SAMPLE_LINE_ITEMS, 'range');
    expect(data.subtotal).toBeCloseTo(total, 2);
    expect(data.total).toBeCloseTo(total, 2);
  });

  it('sets subtotal to 0 for empty line items', () => {
    const data = buildInvoiceData(makeParams(), [], 'range');
    expect(data.subtotal).toBe(0);
    expect(data.total).toBe(0);
  });

  it('sets projectName from first line item when projectId is set', () => {
    const data = buildInvoiceData(makeParams({ projectId: 7 }), SAMPLE_LINE_ITEMS, 'range');
    expect(data.projectName).toBe(SAMPLE_LINE_ITEMS[0].project);
  });

  it('sets projectName to empty string when projectId is null', () => {
    const data = buildInvoiceData(makeParams({ projectId: null }), SAMPLE_LINE_ITEMS, 'range');
    expect(data.projectName).toBe('');
  });

  it('sets projectName to empty when lineItems is empty and projectId set', () => {
    const data = buildInvoiceData(makeParams({ projectId: 7 }), [], 'range');
    expect(data.projectName).toBe('');
  });

  it('invoiceDate is today in locale format', () => {
    const data = buildInvoiceData(makeParams(), SAMPLE_LINE_ITEMS, 'range');
    expect(data.invoiceDate).toBe(new Date().toLocaleDateString());
  });
});

// ── SAMPLE_LINE_ITEMS ─────────────────────────────────────────────────────────

describe('SAMPLE_LINE_ITEMS', () => {
  it('is a non-empty array', () => {
    expect(SAMPLE_LINE_ITEMS.length).toBeGreaterThan(0);
  });

  it('every item has a positive amount', () => {
    for (const item of SAMPLE_LINE_ITEMS) {
      expect(item.amount).toBeGreaterThan(0);
    }
  });

  it('every item has hours * rate ≈ amount', () => {
    for (const item of SAMPLE_LINE_ITEMS) {
      expect(item.hours * item.rate).toBeCloseTo(item.amount, 2);
    }
  });
});

// ── PREVIEW_SCREEN_CSS ────────────────────────────────────────────────────────

describe('PREVIEW_SCREEN_CSS', () => {
  it('is a non-empty string', () => {
    expect(typeof PREVIEW_SCREEN_CSS).toBe('string');
    expect(PREVIEW_SCREEN_CSS.length).toBeGreaterThan(0);
  });

  it('contains @media screen block', () => {
    expect(PREVIEW_SCREEN_CSS).toContain('@media screen');
  });
});

// ── buildPreviewHtml ──────────────────────────────────────────────────────────

describe('buildPreviewHtml', () => {
  const data = buildInvoiceData(makeParams(), SAMPLE_LINE_ITEMS, 'Jul 2026');

  it('injects PREVIEW_SCREEN_CSS into the <head>', () => {
    const html = buildPreviewHtml(1, data);
    expect(html).toContain('@media screen');
  });

  it('does not return empty string', () => {
    const html = buildPreviewHtml(1, data);
    expect(html.length).toBeGreaterThan(500);
  });

  it('falls back to template 1 for an unknown templateId', () => {
    const htmlFallback = buildPreviewHtml(999, data);
    const html1        = buildPreviewHtml(1, data);
    expect(htmlFallback).toBe(html1);
  });

  it('returns different HTML for different template IDs', () => {
    const html1 = buildPreviewHtml(1, data);
    const html5 = buildPreviewHtml(5, data); // Dark Tech
    expect(html1).not.toBe(html5);
  });
});

// ── findTemplate ──────────────────────────────────────────────────────────────

describe('findTemplate', () => {
  it('returns the correct template by id', () => {
    expect(findTemplate(3).id).toBe(3);
    expect(findTemplate(3).name).toBe('Itemized Detail');
  });

  it('falls back to template 1 for unknown id', () => {
    expect(findTemplate(999).id).toBe(1);
  });

  it('works for all ids 1-10', () => {
    for (let id = 1; id <= 10; id++) {
      expect(findTemplate(id).id).toBe(id);
    }
  });
});
