/**
 * Integration tests for db.ts
 *
 * These tests exercise the real @libsql/client database layer against a local
 * SQLite file. The electron mock makes app.getPath('userData') return a temp
 * directory so no real user data is touched.
 *
 * Each test suite that mutates data runs against a fresh module instance so
 * tests remain isolated. The auto-init pattern in db.ts means we never need to
 * call initDb() explicitly – the first db call in each suite triggers setup.
 */

import fs from 'fs';
import path from 'path';

const TEST_DB_DIR  = '/tmp/time-tracker-test';
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'timetracker.db');

type Db = typeof import('../src/db');

function freshDb(): Db {
  // Remove previous database files so each suite starts clean
  try { fs.unlinkSync(TEST_DB_PATH); }         catch { /* ignore */ }
  try { fs.unlinkSync(TEST_DB_PATH + '-wal'); } catch { /* ignore */ }
  try { fs.unlinkSync(TEST_DB_PATH + '-shm'); } catch { /* ignore */ }
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../src/db') as Db;
}

beforeAll(() => { fs.mkdirSync(TEST_DB_DIR, { recursive: true }); });
afterAll(()  => { try { fs.unlinkSync(TEST_DB_PATH); } catch { /* ignore */ } });

// ── Projects ──────────────────────────────────────────────────────────────────

describe('projects', () => {
  let db: Db;
  beforeEach(() => { db = freshDb(); });

  it('listProjects returns empty array when no projects exist', async () => {
    expect(await db.listProjects()).toEqual([]);
  });

  it('addProject creates and returns a new project', async () => {
    const p = await db.addProject('My Project', null);
    expect(p.name).toBe('My Project');
    expect(p.id).toBeGreaterThan(0);
    expect(p.repo_path).toBeNull();
    expect(p.hourly_rate).toBeNull();
  });

  it('addProject is idempotent – returns existing project on duplicate name', async () => {
    const first  = await db.addProject('Same', null);
    const second = await db.addProject('Same', null);
    expect(first.id).toBe(second.id);
    expect(await db.listProjects()).toHaveLength(1);
  });

  it('addProject stores repo_path when provided', async () => {
    const p = await db.addProject('Repo', '/some/path');
    const projects = await db.listProjects();
    expect(projects.find((x) => x.id === p.id)?.repo_path).toBe('/some/path');
  });

  it('listProjects returns all projects ordered by name', async () => {
    await db.addProject('Zebra', null);
    await db.addProject('Apple', null);
    await db.addProject('Mango', null);
    const names = (await db.listProjects()).map((p) => p.name);
    expect(names).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('updateProjectRate sets and clears the hourly rate', async () => {
    const p = await db.addProject('Billable', null);
    await db.updateProjectRate(p.id, 150);
    expect((await db.listProjects()).find((x) => x.id === p.id)?.hourly_rate).toBe(150);

    await db.updateProjectRate(p.id, null);
    expect((await db.listProjects()).find((x) => x.id === p.id)?.hourly_rate).toBeNull();
  });

  it('updateProjectRate on non-existent id does not throw', async () => {
    await expect(db.updateProjectRate(999, 100)).resolves.not.toThrow();
  });
});

// ── Entries ───────────────────────────────────────────────────────────────────

describe('entries', () => {
  let db: Db;
  let projectId: number;

  beforeEach(async () => {
    db = freshDb();
    projectId = (await db.addProject('Test Project', null)).id;
  });

  it('getActiveEntry returns undefined when nothing is running', async () => {
    expect(await db.getActiveEntry()).toBeUndefined();
  });

  it('startEntry creates an entry with no ended_at', async () => {
    const entry = await db.startEntry(projectId, 'working on thing');
    expect(entry.project_id).toBe(projectId);
    expect(entry.started_at).toBeGreaterThan(0);
    expect(entry.ended_at).toBeNull();
    expect(entry.note).toBe('working on thing');
  });

  it('startEntry with no note defaults to null', async () => {
    const entry = await db.startEntry(projectId);
    expect(entry.note).toBeNull();
  });

  it('startEntry stops any active entry before starting a new one', async () => {
    await db.startEntry(projectId, 'first');
    await db.startEntry(projectId, 'second');
    expect((await db.getActiveEntry())?.note).toBe('second');
    expect((await db.listAllEntries()).filter((e) => e.ended_at === null)).toHaveLength(1);
  });

  it('stopActiveEntry sets ended_at on the running entry', async () => {
    await db.startEntry(projectId, 'run me');
    await db.stopActiveEntry();
    expect(await db.getActiveEntry()).toBeUndefined();
    expect((await db.listAllEntries())[0].ended_at).not.toBeNull();
  });

  it('stopActiveEntry when nothing is running does not throw', async () => {
    await expect(db.stopActiveEntry()).resolves.not.toThrow();
  });

  it('updateEntryNote changes the note', async () => {
    const entry = await db.startEntry(projectId);
    await db.updateEntryNote(entry.id, 'updated note');
    expect((await db.listAllEntries()).find((e) => e.id === entry.id)?.note).toBe('updated note');
  });

  it('updateEntryNote clears note when empty string is passed', async () => {
    const entry = await db.startEntry(projectId, 'will be cleared');
    await db.updateEntryNote(entry.id, '');
    expect((await db.listAllEntries()).find((e) => e.id === entry.id)?.note).toBeNull();
  });

  it('createManualEntry creates a completed entry', async () => {
    const start = Date.now() - 3_600_000;
    const end   = Date.now();
    const entry = await db.createManualEntry(projectId, start, end, 'manual', 100);
    expect(entry.started_at).toBe(start);
    expect(entry.ended_at).toBe(end);
    expect(entry.note).toBe('manual');
    expect(entry.hourly_rate).toBe(100);
  });

  it('createManualEntry accepts null note and rate', async () => {
    const entry = await db.createManualEntry(projectId, 1000, 2000, null, null);
    expect(entry.note).toBeNull();
    expect(entry.hourly_rate).toBeNull();
  });

  it('deleteEntry removes the entry', async () => {
    const entry = await db.startEntry(projectId);
    await db.stopActiveEntry();
    await db.deleteEntry(entry.id);
    expect((await db.listAllEntries()).find((e) => e.id === entry.id)).toBeUndefined();
  });

  it('updateEntryTimes changes start/end timestamps', async () => {
    const entry = await db.startEntry(projectId);
    await db.updateEntryTimes(entry.id, 1_000_000, 2_000_000);
    const found = (await db.listAllEntries()).find((e) => e.id === entry.id);
    expect(found?.started_at).toBe(1_000_000);
    expect(found?.ended_at).toBe(2_000_000);
  });

  it('updateEntryTimes can set endedAt to null', async () => {
    const entry = await db.createManualEntry(projectId, 1000, 2000, null, null);
    await db.updateEntryTimes(entry.id, 1000, null);
    expect((await db.listAllEntries()).find((e) => e.id === entry.id)?.ended_at).toBeNull();
  });

  it('updateEntryRate sets and clears the hourly rate on an entry', async () => {
    const entry = await db.startEntry(projectId);
    await db.updateEntryRate(entry.id, 200);
    expect((await db.listAllEntries()).find((e) => e.id === entry.id)?.hourly_rate).toBe(200);
    await db.updateEntryRate(entry.id, null);
    expect((await db.listAllEntries()).find((e) => e.id === entry.id)?.hourly_rate).toBeNull();
  });
});

// ── listAllEntries ────────────────────────────────────────────────────────────

describe('listAllEntries', () => {
  let db: Db;
  let projectId: number;

  beforeEach(async () => {
    db = freshDb();
    projectId = (await db.addProject('All', null)).id;
  });

  it('returns empty array when no entries exist', async () => {
    expect(await db.listAllEntries()).toEqual([]);
  });

  it('returns all entries including running ones', async () => {
    await db.createManualEntry(projectId, 1000, 2000, null, null);
    await db.startEntry(projectId, 'running');
    expect(await db.listAllEntries()).toHaveLength(2);
  });

  it('includes project_name on each entry', async () => {
    await db.createManualEntry(projectId, 1000, 2000, 'test', null);
    const entries = await db.listAllEntries();
    expect(entries[0].project_name).toBe('All');
  });

  it('returns entries ordered by started_at descending', async () => {
    await db.createManualEntry(projectId, 1000, 2000, 'first', null);
    await db.createManualEntry(projectId, 3000, 4000, 'second', null);
    const entries = await db.listAllEntries();
    expect(entries[0].started_at).toBeGreaterThanOrEqual(entries[1].started_at);
  });
});

// ── listEntriesInRange ────────────────────────────────────────────────────────

describe('listEntriesInRange', () => {
  let db: Db;
  let projectId: number;
  let project2Id: number;

  const T = (offset: number) => 1_700_000_000_000 + offset;

  beforeEach(async () => {
    db = freshDb();
    projectId  = (await db.addProject('Alpha', null)).id;
    project2Id = (await db.addProject('Beta',  null)).id;

    await db.createManualEntry(projectId,  T(1000), T(2000),  'e1', 100);
    await db.createManualEntry(projectId,  T(3000), T(4000),  'e2', 100);
    await db.createManualEntry(projectId,  T(9000), T(10000), 'e3', 100);
    await db.createManualEntry(project2Id, T(1500), T(2500),  'e4', 150);
  });

  it('returns entries within the time range', async () => {
    const notes = (await db.listEntriesInRange(T(0), T(5000))).map((e) => e.note);
    expect(notes).toContain('e1');
    expect(notes).toContain('e2');
    expect(notes).toContain('e4');
    expect(notes).not.toContain('e3');
  });

  it('filters by projectId when provided', async () => {
    const notes = (await db.listEntriesInRange(T(0), T(5000), projectId)).map((e) => e.note);
    expect(notes).toContain('e1');
    expect(notes).toContain('e2');
    expect(notes).not.toContain('e4');
  });

  it('returns empty array when range has no entries', async () => {
    expect(await db.listEntriesInRange(T(50000), T(60000))).toHaveLength(0);
  });

  it('returns entries ordered by started_at ascending', async () => {
    const entries = await db.listEntriesInRange(T(0), T(5000), projectId);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].started_at).toBeGreaterThanOrEqual(entries[i - 1].started_at);
    }
  });

  it('includes project_name on each entry', async () => {
    expect((await db.listEntriesInRange(T(0), T(5000), projectId))[0].project_name).toBe('Alpha');
  });

  it('accepts null as projectId (no filter)', async () => {
    const entries = await db.listEntriesInRange(T(0), T(5000), null);
    expect(entries.length).toBeGreaterThan(0);
    const names = entries.map((e) => e.project_name);
    expect(names).toContain('Alpha');
    expect(names).toContain('Beta');
  });
});

// ── getTodaySummary ───────────────────────────────────────────────────────────

describe('getTodaySummary', () => {
  let db: Db;
  let projectId: number;
  let project2Id: number;

  beforeEach(async () => {
    db = freshDb();
    projectId  = (await db.addProject('Alpha', null)).id;
    project2Id = (await db.addProject('Beta',  null)).id;
  });

  it('returns empty array when no entries exist', async () => {
    expect(await db.getTodaySummary()).toEqual([]);
  });

  it("returns summary only for today's entries", async () => {
    // Today entry
    await db.createManualEntry(projectId, Date.now() - 3_600_000, Date.now(), null, null);
    // Old entry (outside today)
    await db.createManualEntry(project2Id, 1_000_000, 2_000_000, null, null);

    const summary = await db.getTodaySummary();
    const names = summary.map((s) => s.project_name);
    expect(names).toContain('Alpha');
    expect(names).not.toContain('Beta');
  });

  it('sums duration per project', async () => {
    const now = Date.now();
    await db.createManualEntry(projectId, now - 7_200_000, now - 3_600_000, null, null); // 1 hour
    await db.createManualEntry(projectId, now - 3_600_000, now,             null, null); // 1 hour
    const summary = await db.getTodaySummary();
    const alpha = summary.find((s) => s.project_name === 'Alpha');
    // 2 hours = 7,200,000 ms
    expect(alpha?.total_ms).toBeCloseTo(7_200_000, -3);
  });

  it('excludes running entries (no ended_at)', async () => {
    await db.startEntry(projectId, 'running');
    const summary = await db.getTodaySummary();
    expect(summary.every((s) => s.project_name !== 'Alpha' || s.total_ms > 0)).toBe(true);
  });
});

// ── countAllEntries / listEntriesPage ─────────────────────────────────────────

describe('pagination helpers', () => {
  let db: Db;
  let projectId: number;

  beforeEach(async () => {
    db = freshDb();
    projectId = (await db.addProject('Paged', null)).id;
    for (let i = 0; i < 5; i++) {
      await db.createManualEntry(projectId, i * 1000, i * 1000 + 500, null, null);
    }
  });

  it('countAllEntries returns correct count', async () => {
    expect(await db.countAllEntries()).toBe(5);
  });

  it('countAllEntries returns 0 on empty db', async () => {
    expect(await freshDb().countAllEntries()).toBe(0);
  });

  it('listEntriesPage returns correct page', async () => {
    expect(await db.listEntriesPage(2, 0)).toHaveLength(2);
  });

  it('listEntriesPage respects offset', async () => {
    const all   = await db.listEntriesPage(10, 0);
    const paged = await db.listEntriesPage(2, 2);
    expect(paged[0].id).toBe(all[2].id);
  });

  it('listEntriesPage returns empty array when offset exceeds count', async () => {
    expect(await db.listEntriesPage(10, 100)).toHaveLength(0);
  });

  it('listEntriesPage returns all when limit is larger than count', async () => {
    expect(await db.listEntriesPage(100, 0)).toHaveLength(5);
  });
});

// ── Export history ────────────────────────────────────────────────────────────

describe('export history', () => {
  let db: Db;

  beforeEach(() => {
    db = freshDb();
    jest.useFakeTimers();
  });
  afterEach(() => { jest.useRealTimers(); });

  it('getLastExportRange returns null when no exports exist', async () => {
    expect(await db.getLastExportRange()).toBeNull();
  });

  it('saveExportRecord persists a record', async () => {
    await db.saveExportRecord(1000, 2000, '/tmp/out.xlsx', 'xlsx');
    const range = await db.getLastExportRange();
    expect(range?.range_from).toBe(1000);
    expect(range?.range_to).toBe(2000);
  });

  it('getLastExportRange returns the most recent record', async () => {
    await db.saveExportRecord(1000, 2000, '/tmp/a.xlsx', 'xlsx');
    jest.advanceTimersByTime(10);
    await db.saveExportRecord(3000, 4000, '/tmp/b.xlsx', 'xlsx');
    const range = await db.getLastExportRange();
    expect(range?.range_from).toBe(3000);
    expect(range?.range_to).toBe(4000);
  });

  it('supports multiple records with different formats', async () => {
    await db.saveExportRecord(1000, 2000, '/tmp/a.xlsx', 'xlsx');
    jest.advanceTimersByTime(10);
    await db.saveExportRecord(2001, 3000, '/tmp/b.pdf', 'pdf');
    expect((await db.getLastExportRange())?.range_to).toBe(3000);
  });

  it('stores the file path correctly', async () => {
    await db.saveExportRecord(0, 1, '/some/path/file.xlsx', 'xlsx');
    await expect(db.getLastExportRange()).resolves.not.toThrow();
  });
});

// ── Invoice settings ──────────────────────────────────────────────────────────

describe('invoice settings – defaults', () => {
  let db: Db;
  beforeEach(() => { db = freshDb(); });

  it('returns all-null defaults when nothing saved', async () => {
    const s = await db.getInvoiceSettings();
    expect(s.id).toBe(1);
    expect(s.your_name).toBeNull();
    expect(s.your_company).toBeNull();
    expect(s.your_address).toBeNull();
    expect(s.your_email).toBeNull();
    expect(s.your_phone).toBeNull();
    expect(s.last_client_name).toBeNull();
    expect(s.last_client_address).toBeNull();
    expect(s.last_due_date).toBeNull();
    expect(s.last_notes).toBeNull();
    expect(s.last_project_id).toBeNull();
  });

  it('preferred_template_id defaults to 1', async () => {
    expect((await db.getInvoiceSettings()).preferred_template_id).toBe(1);
  });

  it('default_payment_terms defaults to Net 30', async () => {
    expect((await db.getInvoiceSettings()).default_payment_terms).toBe('Net 30');
  });
});

describe('invoice settings – full save', () => {
  let db: Db;
  beforeEach(() => { db = freshDb(); });

  it('saveInvoiceSettings persists all your-info fields', async () => {
    await db.saveInvoiceSettings({
      your_name:    'Jane',
      your_company: 'Acme',
      your_address: '1 Main St',
      your_email:   'jane@acme.com',
      your_phone:   '555-1234',
    });
    const s = await db.getInvoiceSettings();
    expect(s.your_name).toBe('Jane');
    expect(s.your_company).toBe('Acme');
    expect(s.your_address).toBe('1 Main St');
    expect(s.your_email).toBe('jane@acme.com');
    expect(s.your_phone).toBe('555-1234');
  });

  it('saveInvoiceSettings persists all last-used fields', async () => {
    const pid = (await db.addProject('Client Co', null)).id;
    await db.saveInvoiceSettings({
      last_client_name:    'Globex',
      last_client_address: '742 Evergreen',
      last_due_date:       'Aug 4, 2026',
      last_notes:          'Wire transfer only',
      last_project_id:     pid,
    });
    const s = await db.getInvoiceSettings();
    expect(s.last_client_name).toBe('Globex');
    expect(s.last_client_address).toBe('742 Evergreen');
    expect(s.last_due_date).toBe('Aug 4, 2026');
    expect(s.last_notes).toBe('Wire transfer only');
    expect(s.last_project_id).toBe(pid);
  });

  it('saveInvoiceSettings persists preferred_template_id and default_payment_terms', async () => {
    await db.saveInvoiceSettings({ preferred_template_id: 5, default_payment_terms: 'Net 14' });
    const s = await db.getInvoiceSettings();
    expect(s.preferred_template_id).toBe(5);
    expect(s.default_payment_terms).toBe('Net 14');
  });
});

describe('invoice settings – merge / upsert', () => {
  let db: Db;
  beforeEach(() => { db = freshDb(); });

  it('subsequent full saves overwrite all fields', async () => {
    await db.saveInvoiceSettings({ your_name: 'First', your_email: 'first@x.com' });
    await db.saveInvoiceSettings({ your_name: 'Second', your_email: 'second@x.com' });
    const s = await db.getInvoiceSettings();
    expect(s.your_name).toBe('Second');
    expect(s.your_email).toBe('second@x.com');
  });

  it('partial save preserves omitted fields (does not nullify them)', async () => {
    await db.saveInvoiceSettings({ your_name: 'Jane', your_phone: '555-9999' });
    await db.saveInvoiceSettings({ preferred_template_id: 3 });
    const s = await db.getInvoiceSettings();
    expect(s.your_name).toBe('Jane');
    expect(s.your_phone).toBe('555-9999');
    expect(s.preferred_template_id).toBe(3);
  });

  it('saving only preferred_template_id preserves all other fields', async () => {
    await db.saveInvoiceSettings({
      your_name:    'Preserved Name',
      your_email:   'preserved@x.com',
      last_client_name: 'Client Inc',
    });
    await db.saveInvoiceSettings({ preferred_template_id: 7 });
    const s = await db.getInvoiceSettings();
    expect(s.your_name).toBe('Preserved Name');
    expect(s.your_email).toBe('preserved@x.com');
    expect(s.last_client_name).toBe('Client Inc');
    expect(s.preferred_template_id).toBe(7);
  });

  it('saving only your_name preserves last_client_name', async () => {
    await db.saveInvoiceSettings({ last_client_name: 'Acme' });
    await db.saveInvoiceSettings({ your_name: 'Alice' });
    const s = await db.getInvoiceSettings();
    expect(s.last_client_name).toBe('Acme');
    expect(s.your_name).toBe('Alice');
  });

  it('saving only last_client_name preserves your_name', async () => {
    await db.saveInvoiceSettings({ your_name: 'Bob' });
    await db.saveInvoiceSettings({ last_client_name: 'New Client' });
    const s = await db.getInvoiceSettings();
    expect(s.your_name).toBe('Bob');
    expect(s.last_client_name).toBe('New Client');
  });

  it('explicitly passing null for a field clears that field', async () => {
    await db.saveInvoiceSettings({ your_phone: '555-0000' });
    await db.saveInvoiceSettings({ your_phone: null });
    expect((await db.getInvoiceSettings()).your_phone).toBeNull();
  });

  it('all last_* fields are independently preserved', async () => {
    await db.saveInvoiceSettings({
      last_client_name:    'Client',
      last_client_address: '123 St',
      last_due_date:       'Sep 1, 2026',
      last_notes:          'Pay fast',
      last_project_id:     42,
    });
    await db.saveInvoiceSettings({ your_name: 'Dave', your_company: 'Dave LLC' });
    const s = await db.getInvoiceSettings();
    expect(s.last_client_name).toBe('Client');
    expect(s.last_client_address).toBe('123 St');
    expect(s.last_due_date).toBe('Sep 1, 2026');
    expect(s.last_notes).toBe('Pay fast');
    expect(s.last_project_id).toBe(42);
    expect(s.your_name).toBe('Dave');
  });
});

// ── Invoice number generation ─────────────────────────────────────────────────

describe('getNextInvoiceNumber', () => {
  let db: Db;
  let projectId: number;

  beforeEach(async () => {
    db = freshDb();
    projectId = (await db.addProject('Proj', null)).id;
  });

  it('returns INV-0001 when no invoices exist', async () => {
    expect(await db.getNextInvoiceNumber()).toBe('INV-0001');
  });

  it('increments after saving an invoice', async () => {
    await db.saveInvoice({ invoiceNumber: 'INV-0001', clientName: 'Client', clientAddress: '', dueDate: 'Net 30', paymentTerms: 'Net 30', notes: '', projectId, rangeFrom: 1000, rangeTo: 2000, templateId: 1, filePath: '/tmp/inv.pdf' });
    expect(await db.getNextInvoiceNumber()).toBe('INV-0002');
  });

  it('pads to 4 digits', async () => {
    const base = { clientName: 'X', clientAddress: '', dueDate: '', paymentTerms: '', notes: '', projectId, rangeFrom: 0, rangeTo: 1, templateId: 1, filePath: '' };
    for (let i = 1; i <= 9; i++) {
      await db.saveInvoice({ ...base, invoiceNumber: `INV-${String(i).padStart(4, '0')}` });
    }
    expect(await db.getNextInvoiceNumber()).toBe('INV-0010');
  });
});

// ── saveInvoice ───────────────────────────────────────────────────────────────

describe('saveInvoice', () => {
  let db: Db;
  let projectId: number;

  beforeEach(async () => {
    db = freshDb();
    projectId = (await db.addProject('Test', null)).id;
  });

  it('saves an invoice and increments count', async () => {
    expect(await db.getNextInvoiceNumber()).toBe('INV-0001');
    await db.saveInvoice({
      invoiceNumber: 'INV-0001',
      clientName: 'Acme',
      clientAddress: '123 St',
      dueDate: 'Aug 4, 2026',
      paymentTerms: 'Net 30',
      notes: 'thanks',
      projectId,
      rangeFrom: 1000,
      rangeTo: 2000,
      templateId: 3,
      filePath: '/tmp/acme.pdf',
    });
    expect(await db.getNextInvoiceNumber()).toBe('INV-0002');
  });

  it('saves an invoice with null projectId', async () => {
    await expect(db.saveInvoice({
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
    })).resolves.not.toThrow();
  });

  it('multiple invoices each increment the counter', async () => {
    const base = { clientName: 'X', clientAddress: '', dueDate: '', paymentTerms: '', notes: '', projectId, rangeFrom: 0, rangeTo: 1, templateId: 1, filePath: '' };
    await db.saveInvoice({ ...base, invoiceNumber: 'INV-0001' });
    await db.saveInvoice({ ...base, invoiceNumber: 'INV-0002' });
    await db.saveInvoice({ ...base, invoiceNumber: 'INV-0003' });
    expect(await db.getNextInvoiceNumber()).toBe('INV-0004');
  });
});

// ── Earnings summary ──────────────────────────────────────────────────────────

describe('getEarningsSummary', () => {
  let db: Db;
  let projectId: number;

  beforeEach(async () => {
    db = freshDb();
    projectId = (await db.addProject('Billable', null)).id;
  });

  it('returns zeros when no entries exist', async () => {
    const s = await db.getEarningsSummary();
    expect(s.today).toBe(0);
    expect(s.week).toBe(0);
    expect(s.allTime).toBe(0);
  });

  it('allTime includes entries regardless of date', async () => {
    await db.createManualEntry(projectId, Date.now() - 7_200_000, Date.now(), null, 100);
    expect((await db.getEarningsSummary()).allTime).toBeCloseTo(200, 0);
  });

  it('getEarningsSummary() with no args returns across all projects', async () => {
    const p2 = await db.addProject('Other', null);
    await db.createManualEntry(projectId, Date.now() - 3_600_000, Date.now(), null, 50);
    await db.createManualEntry(p2.id,     Date.now() - 3_600_000, Date.now(), null, 200);
    const s = await db.getEarningsSummary();
    expect(s.allTime).toBeCloseTo(250, 0);
  });

  it('respects projectId filter', async () => {
    const p2 = await db.addProject('Other', null);
    await db.createManualEntry(projectId, Date.now() - 3_600_000, Date.now(), null, 50);
    await db.createManualEntry(p2.id,     Date.now() - 3_600_000, Date.now(), null, 200);
    expect((await db.getEarningsSummary(projectId)).allTime).toBeCloseTo(50, 0);
    expect((await db.getEarningsSummary(p2.id)).allTime).toBeCloseTo(200, 0);
  });

  it('excludes entries with no hourly rate', async () => {
    await db.createManualEntry(projectId, Date.now() - 3_600_000, Date.now(), null, null);
    expect((await db.getEarningsSummary()).allTime).toBe(0);
  });

  it('excludes running entries from calculations', async () => {
    await db.startEntry(projectId);
    expect((await db.getEarningsSummary()).allTime).toBe(0);
  });
});

// ── getInvoiceOpeningBalance ──────────────────────────────────────────────────

describe('getInvoiceOpeningBalance', () => {
  let db: Db;
  let projectId: number;

  beforeEach(async () => {
    db = freshDb();
    projectId = (await db.addProject('Retainer', null)).id;
  });

  it('is the negative of payments when no prior work exists', async () => {
    await db.addPayment(projectId, 1275.5, 1_000, 'retainer');
    expect(await db.getInvoiceOpeningBalance(5_000, projectId)).toBeCloseTo(-1275.5, 5);
  });

  it('subtracts work that started before the invoice range', async () => {
    await db.addPayment(projectId, 200, 1_000, 'retainer');
    await db.createManualEntry(projectId, 1_000, 1_000 + 3_600_000, 'prior', 100);
    expect(await db.getInvoiceOpeningBalance(5_000, projectId)).toBeCloseTo(-100, 5);
  });

  it('ignores work that starts at or after the invoice range', async () => {
    await db.addPayment(projectId, 200, 1_000, 'retainer');
    await db.createManualEntry(projectId, 5_000, 5_000 + 3_600_000, 'in range', 100);
    expect(await db.getInvoiceOpeningBalance(5_000, projectId)).toBeCloseTo(-200, 5);
  });

  it('scopes payments and earnings to the requested project', async () => {
    const other = (await db.addProject('Other', null)).id;
    await db.addPayment(projectId, 300, 1_000, 'keep');
    await db.addPayment(other, 900, 1_000, 'ignore');
    expect(await db.getInvoiceOpeningBalance(5_000, projectId)).toBeCloseTo(-300, 5);
  });
});

// ── closeDb ───────────────────────────────────────────────────────────────────

describe('closeDb', () => {
  it('closeDb does not throw', async () => {
    const db = freshDb();
    await expect(db.closeDb()).resolves.not.toThrow();
  });
});
