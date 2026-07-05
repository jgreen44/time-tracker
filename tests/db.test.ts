/**
 * Integration tests for db.ts
 *
 * These tests exercise the real better-sqlite3 database layer.
 * The electron mock makes app.getPath('userData') return a temp directory so
 * no real user data is touched.
 *
 * Each test suite that mutates data runs against a fresh module instance so
 * tests remain isolated.
 */

import fs from 'fs';
import path from 'path';

// The electron mock in tests/__mocks__/electron.ts returns '/tmp/time-tracker-test'
// for app.getPath. Ensure that directory exists before db.ts is imported.
const TEST_DB_DIR = '/tmp/time-tracker-test';
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'timetracker.db');

function freshDb() {
  // Wipe the database file before each isolation block so we start clean.
  try { fs.unlinkSync(TEST_DB_PATH); } catch { /* ignore – file may not exist */ }
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../src/db') as typeof import('../src/db');
}

beforeAll(() => {
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
});

afterAll(() => {
  try { fs.unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
});

// ── Projects ──────────────────────────────────────────────────────────────────

describe('projects', () => {
  let db: ReturnType<typeof freshDb>;

  beforeEach(() => { db = freshDb(); });

  it('listProjects returns empty array when no projects exist', () => {
    expect(db.listProjects()).toEqual([]);
  });

  it('addProject creates and returns a new project', () => {
    const p = db.addProject('My Project', null);
    expect(p.name).toBe('My Project');
    expect(p.id).toBeGreaterThan(0);
    expect(p.repo_path).toBeNull();
    expect(p.hourly_rate).toBeNull();
  });

  it('addProject is idempotent – returns existing project on duplicate name', () => {
    const first  = db.addProject('Same', null);
    const second = db.addProject('Same', null);
    expect(first.id).toBe(second.id);
    expect(db.listProjects()).toHaveLength(1);
  });

  it('listProjects returns all projects ordered by name', () => {
    db.addProject('Zebra', null);
    db.addProject('Apple', null);
    db.addProject('Mango', null);
    const names = db.listProjects().map((p) => p.name);
    expect(names).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('updateProjectRate sets and clears the hourly rate', () => {
    const p = db.addProject('Billable', null);
    db.updateProjectRate(p.id, 150);
    const updated = db.listProjects().find((x) => x.id === p.id);
    expect(updated?.hourly_rate).toBe(150);

    db.updateProjectRate(p.id, null);
    const cleared = db.listProjects().find((x) => x.id === p.id);
    expect(cleared?.hourly_rate).toBeNull();
  });
});

// ── Entries ───────────────────────────────────────────────────────────────────

describe('entries', () => {
  let db: ReturnType<typeof freshDb>;
  let projectId: number;

  beforeEach(() => {
    db = freshDb();
    const p = db.addProject('Test Project', null);
    projectId = p.id;
  });

  it('getActiveEntry returns undefined when nothing is running', () => {
    expect(db.getActiveEntry()).toBeUndefined();
  });

  it('startEntry creates an entry with no ended_at', () => {
    const entry = db.startEntry(projectId, 'working on thing');
    expect(entry.project_id).toBe(projectId);
    expect(entry.started_at).toBeGreaterThan(0);
    expect(entry.ended_at).toBeNull();
    expect(entry.note).toBe('working on thing');
  });

  it('startEntry stops any active entry before starting a new one', () => {
    db.startEntry(projectId, 'first');
    db.startEntry(projectId, 'second');
    const active = db.getActiveEntry();
    expect(active?.note).toBe('second');
    // only one active entry exists
    const all = db.listAllEntries();
    const running = all.filter((e) => e.ended_at === null);
    expect(running).toHaveLength(1);
  });

  it('stopActiveEntry sets ended_at on the running entry', () => {
    db.startEntry(projectId, 'run me');
    db.stopActiveEntry();
    expect(db.getActiveEntry()).toBeUndefined();
    const entries = db.listAllEntries();
    expect(entries[0].ended_at).not.toBeNull();
  });

  it('updateEntryNote changes the note', () => {
    const entry = db.startEntry(projectId);
    db.updateEntryNote(entry.id, 'updated note');
    const all = db.listAllEntries();
    const found = all.find((e) => e.id === entry.id);
    expect(found?.note).toBe('updated note');
  });

  it('updateEntryNote clears note when empty string is passed', () => {
    const entry = db.startEntry(projectId, 'will be cleared');
    db.updateEntryNote(entry.id, '');
    const all = db.listAllEntries();
    const found = all.find((e) => e.id === entry.id);
    expect(found?.note).toBeNull();
  });

  it('createManualEntry creates a completed entry', () => {
    const start = Date.now() - 3600_000;
    const end   = Date.now();
    const entry = db.createManualEntry(projectId, start, end, 'manual', 100);
    expect(entry.started_at).toBe(start);
    expect(entry.ended_at).toBe(end);
    expect(entry.note).toBe('manual');
    expect(entry.hourly_rate).toBe(100);
  });

  it('deleteEntry removes the entry', () => {
    const entry = db.startEntry(projectId);
    db.stopActiveEntry();
    db.deleteEntry(entry.id);
    const all = db.listAllEntries();
    expect(all.find((e) => e.id === entry.id)).toBeUndefined();
  });

  it('updateEntryTimes changes start/end timestamps', () => {
    const entry = db.startEntry(projectId);
    const newStart = 1_000_000;
    const newEnd   = 2_000_000;
    db.updateEntryTimes(entry.id, newStart, newEnd);
    const all = db.listAllEntries();
    const found = all.find((e) => e.id === entry.id);
    expect(found?.started_at).toBe(newStart);
    expect(found?.ended_at).toBe(newEnd);
  });

  it('updateEntryRate sets and clears the hourly rate on an entry', () => {
    const entry = db.startEntry(projectId);
    db.updateEntryRate(entry.id, 200);
    const all = db.listAllEntries();
    expect(all.find((e) => e.id === entry.id)?.hourly_rate).toBe(200);

    db.updateEntryRate(entry.id, null);
    const all2 = db.listAllEntries();
    expect(all2.find((e) => e.id === entry.id)?.hourly_rate).toBeNull();
  });
});

// ── listEntriesInRange ────────────────────────────────────────────────────────

describe('listEntriesInRange', () => {
  let db: ReturnType<typeof freshDb>;
  let projectId: number;
  let project2Id: number;

  const T = (offset: number) => 1_700_000_000_000 + offset;

  beforeEach(() => {
    db = freshDb();
    const p1 = db.addProject('Alpha', null);
    const p2 = db.addProject('Beta', null);
    projectId  = p1.id;
    project2Id = p2.id;

    db.createManualEntry(projectId,  T(1000), T(2000),  'e1', 100); // in range
    db.createManualEntry(projectId,  T(3000), T(4000),  'e2', 100); // in range
    db.createManualEntry(projectId,  T(9000), T(10000), 'e3', 100); // out of range
    db.createManualEntry(project2Id, T(1500), T(2500),  'e4', 150); // in range, different project
  });

  it('returns entries within the time range', () => {
    const entries = db.listEntriesInRange(T(0), T(5000));
    const notes = entries.map((e) => e.note);
    expect(notes).toContain('e1');
    expect(notes).toContain('e2');
    expect(notes).toContain('e4');
    expect(notes).not.toContain('e3');
  });

  it('filters by projectId when provided', () => {
    const entries = db.listEntriesInRange(T(0), T(5000), projectId);
    const notes = entries.map((e) => e.note);
    expect(notes).toContain('e1');
    expect(notes).toContain('e2');
    expect(notes).not.toContain('e4'); // different project
  });

  it('returns empty array when range has no entries', () => {
    const entries = db.listEntriesInRange(T(50000), T(60000));
    expect(entries).toHaveLength(0);
  });

  it('returns entries ordered by started_at ascending', () => {
    const entries = db.listEntriesInRange(T(0), T(5000), projectId);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].started_at).toBeGreaterThanOrEqual(entries[i - 1].started_at);
    }
  });

  it('includes project_name on each entry', () => {
    const entries = db.listEntriesInRange(T(0), T(5000), projectId);
    expect(entries[0].project_name).toBe('Alpha');
  });
});

// ── countAllEntries / listEntriesPage ─────────────────────────────────────────

describe('pagination helpers', () => {
  let db: ReturnType<typeof freshDb>;
  let projectId: number;

  beforeEach(() => {
    db = freshDb();
    const p = db.addProject('Paged', null);
    projectId = p.id;
    for (let i = 0; i < 5; i++) {
      db.createManualEntry(projectId, i * 1000, i * 1000 + 500, null, null);
    }
  });

  it('countAllEntries returns correct count', () => {
    expect(db.countAllEntries()).toBe(5);
  });

  it('listEntriesPage returns correct page', () => {
    const page = db.listEntriesPage(2, 0);
    expect(page).toHaveLength(2);
  });

  it('listEntriesPage respects offset', () => {
    const all   = db.listEntriesPage(10, 0);
    const paged = db.listEntriesPage(2, 2);
    expect(paged[0].id).toBe(all[2].id);
  });
});

// ── Export history ────────────────────────────────────────────────────────────

describe('export history', () => {
  let db: ReturnType<typeof freshDb>;

  beforeEach(() => {
    db = freshDb();
    // Use fake timers so successive saveExportRecord calls get distinct
    // exported_at values even if called in the same real-clock millisecond.
    jest.useFakeTimers();
  });
  afterEach(() => { jest.useRealTimers(); });

  it('getLastExportRange returns null when no exports exist', () => {
    expect(db.getLastExportRange()).toBeNull();
  });

  it('saveExportRecord persists a record', () => {
    db.saveExportRecord(1000, 2000, '/tmp/out.xlsx', 'xlsx');
    const range = db.getLastExportRange();
    expect(range).not.toBeNull();
    expect(range?.range_from).toBe(1000);
    expect(range?.range_to).toBe(2000);
  });

  it('getLastExportRange returns the most recent record', () => {
    db.saveExportRecord(1000, 2000, '/tmp/a.xlsx', 'xlsx');
    jest.advanceTimersByTime(10);
    db.saveExportRecord(3000, 4000, '/tmp/b.xlsx', 'xlsx');
    const range = db.getLastExportRange();
    expect(range?.range_from).toBe(3000);
    expect(range?.range_to).toBe(4000);
  });

  it('supports multiple records with different formats', () => {
    db.saveExportRecord(1000, 2000, '/tmp/a.xlsx', 'xlsx');
    jest.advanceTimersByTime(10);
    db.saveExportRecord(2001, 3000, '/tmp/b.pdf',  'pdf');
    const range = db.getLastExportRange();
    expect(range?.range_to).toBe(3000);
  });
});

// ── Invoice settings ──────────────────────────────────────────────────────────

describe('invoice settings', () => {
  let db: ReturnType<typeof freshDb>;

  beforeEach(() => { db = freshDb(); });

  it('getInvoiceSettings returns all-null defaults when nothing saved', () => {
    const s = db.getInvoiceSettings();
    expect(s.id).toBe(1);
    expect(s.your_name).toBeNull();
    expect(s.your_company).toBeNull();
    expect(s.your_address).toBeNull();
    expect(s.your_email).toBeNull();
    expect(s.your_phone).toBeNull();
  });

  it('saveInvoiceSettings persists all fields', () => {
    db.saveInvoiceSettings({
      your_name: 'Jane',
      your_company: 'Acme',
      your_address: '1 Main St',
      your_email: 'jane@acme.com',
      your_phone: '555-1234',
    });
    const s = db.getInvoiceSettings();
    expect(s.your_name).toBe('Jane');
    expect(s.your_company).toBe('Acme');
    expect(s.your_address).toBe('1 Main St');
    expect(s.your_email).toBe('jane@acme.com');
    expect(s.your_phone).toBe('555-1234');
  });

  it('saveInvoiceSettings updates existing settings (upsert)', () => {
    db.saveInvoiceSettings({ your_name: 'First' });
    db.saveInvoiceSettings({ your_name: 'Updated', your_company: 'New Co' });
    const s = db.getInvoiceSettings();
    expect(s.your_name).toBe('Updated');
    expect(s.your_company).toBe('New Co');
  });

  it('saveInvoiceSettings with partial fields nullifies omitted fields', () => {
    db.saveInvoiceSettings({ your_name: 'Jane', your_phone: '555-9999' });
    db.saveInvoiceSettings({ your_name: 'Jane' }); // phone omitted → null
    const s = db.getInvoiceSettings();
    expect(s.your_phone).toBeNull();
  });
});

// ── Invoice number generation ─────────────────────────────────────────────────

describe('getNextInvoiceNumber', () => {
  let db: ReturnType<typeof freshDb>;
  let projectId: number;

  beforeEach(() => {
    db = freshDb();
    const p = db.addProject('Proj', null);
    projectId = p.id;
  });

  it('returns INV-0001 when no invoices exist', () => {
    expect(db.getNextInvoiceNumber()).toBe('INV-0001');
  });

  it('increments after saving an invoice', () => {
    db.saveInvoice({
      invoiceNumber: 'INV-0001',
      clientName: 'Client',
      clientAddress: '',
      dueDate: 'Net 30',
      paymentTerms: 'Net 30',
      notes: '',
      projectId,
      rangeFrom: 1000,
      rangeTo:  2000,
      templateId: 1,
      filePath: '/tmp/inv.pdf',
    });
    expect(db.getNextInvoiceNumber()).toBe('INV-0002');
  });

  it('pads to 4 digits', () => {
    // Simulate 9 existing invoices
    const base = { clientName: 'X', clientAddress: '', dueDate: '', paymentTerms: '', notes: '', projectId, rangeFrom: 0, rangeTo: 1, templateId: 1, filePath: '' };
    for (let i = 1; i <= 9; i++) {
      db.saveInvoice({ ...base, invoiceNumber: `INV-${String(i).padStart(4, '0')}` });
    }
    expect(db.getNextInvoiceNumber()).toBe('INV-0010');
  });
});

// ── saveInvoice ───────────────────────────────────────────────────────────────

describe('saveInvoice', () => {
  let db: ReturnType<typeof freshDb>;
  let projectId: number;

  beforeEach(() => {
    db = freshDb();
    const p = db.addProject('Test', null);
    projectId = p.id;
  });

  it('saves an invoice and increments count', () => {
    expect(db.getNextInvoiceNumber()).toBe('INV-0001');
    db.saveInvoice({
      invoiceNumber: 'INV-0001',
      clientName: 'Acme',
      clientAddress: '123 St',
      dueDate: 'Aug 4, 2026',
      paymentTerms: 'Net 30',
      notes: 'thanks',
      projectId,
      rangeFrom: 1000,
      rangeTo:  2000,
      templateId: 3,
      filePath: '/tmp/acme.pdf',
    });
    expect(db.getNextInvoiceNumber()).toBe('INV-0002');
  });

  it('saves an invoice with null projectId', () => {
    expect(() => db.saveInvoice({
      invoiceNumber: 'INV-0001',
      clientName: 'Acme',
      clientAddress: '',
      dueDate: '',
      paymentTerms: '',
      notes: '',
      projectId: null,
      rangeFrom: 0,
      rangeTo: 1,
      templateId: 1,
      filePath: '',
    })).not.toThrow();
  });
});

// ── Earnings summary ──────────────────────────────────────────────────────────

describe('getEarningsSummary', () => {
  let db: ReturnType<typeof freshDb>;
  let projectId: number;

  beforeEach(() => {
    db = freshDb();
    const p = db.addProject('Billable', null);
    projectId = p.id;
  });

  it('returns zeros when no entries exist', () => {
    const summary = db.getEarningsSummary();
    expect(summary.today).toBe(0);
    expect(summary.week).toBe(0);
    expect(summary.allTime).toBe(0);
  });

  it('allTime includes entries regardless of date', () => {
    // 2 hours at $100/hr = $200
    const start = Date.now() - 7_200_000;
    const end   = Date.now();
    db.createManualEntry(projectId, start, end, null, 100);
    const summary = db.getEarningsSummary();
    expect(summary.allTime).toBeCloseTo(200, 0);
  });

  it('respects projectId filter', () => {
    const p2 = db.addProject('Other', null);
    db.createManualEntry(projectId, Date.now() - 3600_000, Date.now(), null, 50);
    db.createManualEntry(p2.id,     Date.now() - 3600_000, Date.now(), null, 200);

    const s1 = db.getEarningsSummary(projectId);
    const s2 = db.getEarningsSummary(p2.id);
    expect(s1.allTime).toBeCloseTo(50, 0);
    expect(s2.allTime).toBeCloseTo(200, 0);
  });

  it('excludes entries with no hourly rate', () => {
    db.createManualEntry(projectId, Date.now() - 3600_000, Date.now(), null, null);
    const summary = db.getEarningsSummary();
    expect(summary.allTime).toBe(0);
  });
});
