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
  withRunningBalances,
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

  it('is consistent for the same timestamp called twice', () => {
    const ms = 1_720_000_000_000;
    expect(formatLocalDate(ms)).toBe(formatLocalDate(ms));
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

  it('handles epoch (0)', () => {
    expect(() => formatLocalTime(0)).not.toThrow();
  });

  it('returns different strings for different timestamps', () => {
    const a = formatLocalTime(0);
    const b = formatLocalTime(3_600_000); // 1 hour later
    expect(a).not.toBe(b);
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

  it('carries project_name onto each line item', () => {
    const items = entriesToLineItems(entries);
    expect(items[0].project).toBe('Web Dev');
    expect(items[1].project).toBe('Design');
  });

  it('sets date field as a formatted string', () => {
    const items = entriesToLineItems(entries);
    expect(typeof items[0].date).toBe('string');
    expect(items[0].date.length).toBeGreaterThan(0);
  });

  it('handles fractional hours correctly', () => {
    const halfHour: RawEntry[] = [
      { project_name: 'X', started_at: T(0), ended_at: T(1_800_000), note: null, hourly_rate: 100 },
    ];
    const items = entriesToLineItems(halfHour);
    expect(items[0].hours).toBeCloseTo(0.5, 5);
    expect(items[0].amount).toBeCloseTo(50, 5);
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
    expect(data.yourEmail).toBe('jane@smith.dev');
    expect(data.yourPhone).toBe('555-1234');
    expect(data.yourAddress).toBe('123 Main St');
    expect(data.yourCompany).toBe('Smith LLC');
    expect(data.paymentTerms).toBe('Net 30');
    expect(data.clientAddress).toBe('456 Client Ave');
    expect(data.notes).toBe('Thanks!');
    expect(data.dateRange).toBe('Jul – Aug 2026');
  });

  it('leaves fields blank when passed as empty strings', () => {
    const data = buildInvoiceData(
      makeParams({ invoiceNumber: '', dueDate: '', yourName: '', clientName: '', yourCompany: '' }),
      SAMPLE_LINE_ITEMS,
      'some range'
    );
    expect(data.invoiceNumber).toBe('INV-0001');
    expect(data.dueDate).toBe('Net 30');
    expect(data.yourName).toBe('');
    expect(data.clientName).toBe('');
    expect(data.yourCompany).toBe('');
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

  it('preserves notes exactly', () => {
    const data = buildInvoiceData(makeParams({ notes: 'Wire transfer only.\nNet 14.' }), [], 'r');
    expect(data.notes).toBe('Wire transfer only.\nNet 14.');
  });

  it('handles null rangeFrom/rangeTo (preview mode)', () => {
    const data = buildInvoiceData(makeParams({ rangeFrom: null, rangeTo: null }), [], 'r');
    expect(data.subtotal).toBe(0);
  });

  it('applies a retainer as a negative opening line and reduces total due', () => {
    const items = [
      { project: 'A', date: '8/1/2026', description: 'First', hours: 2, rate: 100, amount: 200 },
      { project: 'A', date: '8/2/2026', description: 'Second', hours: 3, rate: 100, amount: 300 },
      { project: 'A', date: '8/3/2026', description: 'Third', hours: 4, rate: 100, amount: 400 },
    ];
    const data = buildInvoiceData(makeParams({ openingBalance: -350 }), items, 'range');
    expect(data.lineItems).toHaveLength(4);
    expect(data.lineItems[0].isAdjustment).toBe(true);
    expect(data.lineItems[0].amount).toBe(-350);
    expect(data.lineItems[0].balance).toBe(-350);
    expect(data.lineItems[1].balance).toBeCloseTo(-150, 5);
    expect(data.lineItems[2].balance).toBeCloseTo(150, 5);
    expect(data.lineItems[3].balance).toBeCloseTo(550, 5);
    expect(data.subtotal).toBeCloseTo(900, 5);
    expect(data.paymentsApplied).toBeCloseTo(350, 5);
    expect(data.total).toBeCloseTo(550, 5);
  });

  it('keeps total due at 0 while work is still covered by retainer', () => {
    const items = [
      { project: 'A', date: '8/1/2026', description: 'Covered', hours: 1, rate: 100, amount: 100 },
    ];
    const data = buildInvoiceData(makeParams({ openingBalance: -250 }), items, 'range');
    expect(data.lineItems[1].balance).toBeCloseTo(-150, 5);
    expect(data.total).toBe(0);
  });

  it('adds prior outstanding to the running balance', () => {
    const items = [
      { project: 'A', date: '8/1/2026', description: 'New', hours: 1, rate: 200, amount: 200 },
    ];
    const data = buildInvoiceData(makeParams({ openingBalance: 75 }), items, 'range');
    expect(data.lineItems[0].description).toBe('Prior outstanding balance');
    expect(data.lineItems[1].balance).toBeCloseTo(275, 5);
    expect(data.total).toBeCloseTo(275, 5);
    expect(data.paymentsApplied).toBe(0);
  });
});

// ── withRunningBalances ───────────────────────────────────────────────────────

describe('withRunningBalances', () => {
  const work = [
    { project: 'A', date: '8/1/2026', description: 'One', hours: 1, rate: 50, amount: 50 },
    { project: 'A', date: '8/2/2026', description: 'Two', hours: 2, rate: 50, amount: 100 },
  ];

  it('leaves items unchanged besides balance when opening is 0', () => {
    const items = withRunningBalances(work, 0);
    expect(items).toHaveLength(2);
    expect(items[0].balance).toBe(50);
    expect(items[1].balance).toBe(150);
    expect(items.every((i) => !i.isAdjustment)).toBe(true);
  });

  it('inserts a retainer row that subsequent work eats through', () => {
    const items = withRunningBalances(work, -80);
    expect(items[0].description).toBe('Retainer / payments applied');
    expect(items[0].balance).toBe(-80);
    expect(items[1].balance).toBe(-30);
    expect(items[2].balance).toBe(70);
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

  it('every item has a non-empty project name', () => {
    for (const item of SAMPLE_LINE_ITEMS) {
      expect(item.project.trim().length).toBeGreaterThan(0);
    }
  });

  it('every item has a non-empty date string', () => {
    for (const item of SAMPLE_LINE_ITEMS) {
      expect(item.date.trim().length).toBeGreaterThan(0);
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

  it('contains box-shadow for preview card appearance', () => {
    expect(PREVIEW_SCREEN_CSS).toContain('box-shadow');
  });

  it('is wrapped in <style> tags', () => {
    expect(PREVIEW_SCREEN_CSS.trim()).toMatch(/^<style>/);
    expect(PREVIEW_SCREEN_CSS.trim()).toMatch(/<\/style>$/);
  });
});

// ── buildPreviewHtml ──────────────────────────────────────────────────────────

describe('buildPreviewHtml', () => {
  const data = buildInvoiceData(makeParams(), SAMPLE_LINE_ITEMS, 'Jul 2026');

  it('injects PREVIEW_SCREEN_CSS into the output', () => {
    expect(buildPreviewHtml(1, data)).toContain('@media screen');
  });

  it('does not return empty string', () => {
    expect(buildPreviewHtml(1, data).length).toBeGreaterThan(500);
  });

  it('falls back to template 1 for an unknown templateId', () => {
    expect(buildPreviewHtml(999, data)).toBe(buildPreviewHtml(1, data));
  });

  it('returns different HTML for different template IDs', () => {
    expect(buildPreviewHtml(1, data)).not.toBe(buildPreviewHtml(5, data));
  });

  it('includes invoice number from data', () => {
    expect(buildPreviewHtml(1, data)).toContain('INV-0042');
  });

  it('includes client name from data', () => {
    expect(buildPreviewHtml(1, data)).toContain('Acme Corp');
  });

  it('generates valid HTML (has DOCTYPE)', () => {
    expect(buildPreviewHtml(1, data)).toMatch(/<!DOCTYPE html>/i);
  });

  it('works for all template IDs 1-10', () => {
    for (let id = 1; id <= 10; id++) {
      expect(() => buildPreviewHtml(id, data)).not.toThrow();
    }
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

  it('falls back to template 1 for id 0', () => {
    expect(findTemplate(0).id).toBe(1);
  });

  it('works for all ids 1-10', () => {
    for (let id = 1; id <= 10; id++) {
      expect(findTemplate(id).id).toBe(id);
    }
  });

  it('returned template has a render function', () => {
    expect(typeof findTemplate(1).render).toBe('function');
  });

  it('returned template has non-empty name and description', () => {
    const t = findTemplate(2);
    expect(t.name.trim().length).toBeGreaterThan(0);
    expect(t.description.trim().length).toBeGreaterThan(0);
  });
});
