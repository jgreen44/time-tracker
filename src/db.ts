import { createClient, type Client } from '@libsql/client';
import path from 'path';
import { app } from 'electron';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Project {
  id: number;
  name: string;
  repo_path: string | null;
  hourly_rate: number | null;
}

export interface Entry {
  id: number;
  project_id: number;
  started_at: number;
  ended_at: number | null;
  note: string | null;
  hourly_rate: number | null;
}

export interface ProjectSummary {
  project_id: number;
  project_name: string;
  total_ms: number;
}

export interface EarningsSummary {
  today: number;
  week: number;
  allTime: number;
}

export interface TimeTotals {
  week: number;
  allTime: number;
}

export interface EntryWithProject {
  id: number;
  project_name: string;
  started_at: number;
  ended_at: number | null;
  note: string | null;
  hourly_rate: number | null;
}

export interface ExportRange {
  range_from: number;
  range_to: number;
}

export interface ExportHistoryRecord {
  id: number;
  exported_at: number;
  range_from: number;
  range_to: number;
  file_path: string | null;
  format: string;
  project_id: number | null;
  project_name: string | null;
  invoice_number: string | null;
}

export interface InvoiceSettings {
  id: number;
  your_name: string | null;
  your_company: string | null;
  your_address: string | null;
  your_email: string | null;
  your_phone: string | null;
  preferred_template_id: number;
  default_payment_terms: string;
  last_client_name: string | null;
  last_client_address: string | null;
  last_due_date: string | null;
  last_notes: string | null;
  last_project_id: number | null;
}

export interface InvoiceSaveParams {
  invoiceNumber: string;
  clientName: string;
  clientAddress: string;
  dueDate: string;
  paymentTerms: string;
  notes: string;
  projectId: number | null;
  rangeFrom: number;
  rangeTo: number;
  templateId: number;
  filePath: string;
}

export interface Payment {
  id: number;
  project_id: number;
  amount: number;
  received_at: number;
  note: string | null;
  invoice_id: number | null;
}

export interface BillingSummary {
  totalEarned: number;
  totalPaid: number;
  outstanding: number;
}

// ── Row helpers ───────────────────────────────────────────────────────────────
// libsql returns INTEGER columns as bigint in some versions; these helpers
// safely coerce to number regardless.

function n(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  return (v as number) ?? 0;
}

function nOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return n(v);
}

type RawRow = Record<string, unknown>;

function rowToProject(r: RawRow): Project {
  return {
    id: n(r.id),
    name: r.name as string,
    repo_path: (r.repo_path as string | null) ?? null,
    hourly_rate: nOrNull(r.hourly_rate),
  };
}

function rowToEntry(r: RawRow): Entry {
  return {
    id: n(r.id),
    project_id: n(r.project_id),
    started_at: n(r.started_at),
    ended_at: nOrNull(r.ended_at),
    note: (r.note as string | null) ?? null,
    hourly_rate: nOrNull(r.hourly_rate),
  };
}

function rowToEntryWithProject(r: RawRow): EntryWithProject {
  return {
    id: n(r.id),
    project_name: r.project_name as string,
    started_at: n(r.started_at),
    ended_at: nOrNull(r.ended_at),
    note: (r.note as string | null) ?? null,
    hourly_rate: nOrNull(r.hourly_rate),
  };
}

function rowToPayment(r: RawRow): Payment {
  return {
    id: n(r.id),
    project_id: n(r.project_id),
    amount: n(r.amount),
    received_at: n(r.received_at),
    note: (r.note as string | null) ?? null,
    invoice_id: nOrNull(r.invoice_id),
  };
}

function rowToInvoiceSettings(r: RawRow): InvoiceSettings {
  return {
    id: n(r.id),
    your_name: (r.your_name as string | null) ?? null,
    your_company: (r.your_company as string | null) ?? null,
    your_address: (r.your_address as string | null) ?? null,
    your_email: (r.your_email as string | null) ?? null,
    your_phone: (r.your_phone as string | null) ?? null,
    preferred_template_id: n(r.preferred_template_id),
    default_payment_terms: (r.default_payment_terms as string) ?? 'Net 30',
    last_client_name: (r.last_client_name as string | null) ?? null,
    last_client_address: (r.last_client_address as string | null) ?? null,
    last_due_date: (r.last_due_date as string | null) ?? null,
    last_notes: (r.last_notes as string | null) ?? null,
    last_project_id: nOrNull(r.last_project_id),
  };
}

// ── Client lifecycle ──────────────────────────────────────────────────────────

let _client: Client | null = null;
let _ready: Promise<void> | null = null;

function getClient(): Client {
  if (!_client) {
    const dbPath = path.join(app.getPath('userData'), 'timetracker.db');
    const hasTurso = !!process.env.TURSO_DATABASE_URL;
    _client = createClient(
      hasTurso
        ? {
            url: `file:${dbPath}`,
            syncUrl: process.env.TURSO_DATABASE_URL!,
            authToken: process.env.TURSO_AUTH_TOKEN ?? '',
            syncInterval: 60,
            offline: true,
          }
        : { url: `file:${dbPath}` }
    );
  }
  return _client;
}

/** Ensure a column exists on `table`; add it if missing (idempotent). */
async function ensureColumn(c: Client, table: string, col: string, definition: string): Promise<void> {
  const res = await c.execute(`PRAGMA table_info(${table})`);
  const exists = (res.rows as RawRow[]).some((r) => r.name === col);
  if (!exists) {
    try {
      await c.execute(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    } catch { /* already added by a concurrent setup call – safe to ignore */ }
  }
}

/** Apply all schema migrations for databases created before new columns existed. */
async function runMigrations(c: Client): Promise<void> {
  await ensureColumn(c, 'projects',         'hourly_rate',            'hourly_rate REAL');
  await ensureColumn(c, 'entries',          'hourly_rate',            'hourly_rate REAL');
  await ensureColumn(c, 'export_history',   'project_id',             'project_id INTEGER');
  await ensureColumn(c, 'invoice_settings', 'preferred_template_id',  'preferred_template_id INTEGER NOT NULL DEFAULT 1');
  await ensureColumn(c, 'invoice_settings', 'default_payment_terms',  "default_payment_terms TEXT NOT NULL DEFAULT 'Net 30'");
  await ensureColumn(c, 'invoice_settings', 'last_client_name',       'last_client_name TEXT');
  await ensureColumn(c, 'invoice_settings', 'last_client_address',    'last_client_address TEXT');
  await ensureColumn(c, 'invoice_settings', 'last_due_date',          'last_due_date TEXT');
  await ensureColumn(c, 'invoice_settings', 'last_notes',             'last_notes TEXT');
  await ensureColumn(c, 'invoice_settings', 'last_project_id',        'last_project_id INTEGER');
}

async function setup(): Promise<void> {
  const c = getClient();

  // Create all tables in one batch
  await c.executeMultiple(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      repo_path TEXT,
      hourly_rate REAL
    );
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      note TEXT,
      hourly_rate REAL
    );
    CREATE TABLE IF NOT EXISTS export_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exported_at INTEGER NOT NULL,
      range_from INTEGER NOT NULL,
      range_to INTEGER NOT NULL,
      file_path TEXT,
      format TEXT NOT NULL DEFAULT 'xlsx'
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      amount REAL NOT NULL,
      received_at INTEGER NOT NULL,
      note TEXT,
      invoice_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS invoice_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      your_name TEXT,
      your_company TEXT,
      your_address TEXT,
      your_email TEXT,
      your_phone TEXT,
      preferred_template_id INTEGER NOT NULL DEFAULT 1,
      default_payment_terms TEXT NOT NULL DEFAULT 'Net 30',
      last_client_name TEXT,
      last_client_address TEXT,
      last_due_date TEXT,
      last_notes TEXT,
      last_project_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      client_name TEXT,
      client_address TEXT,
      due_date TEXT,
      payment_terms TEXT,
      notes TEXT,
      project_id INTEGER,
      range_from INTEGER NOT NULL,
      range_to INTEGER NOT NULL,
      template_id INTEGER NOT NULL DEFAULT 1,
      file_path TEXT
    );
  `);

  await runMigrations(c);
}

async function ensureReady(): Promise<Client> {
  if (!_ready) _ready = setup();
  await _ready;
  return getClient();
}

/** Called from main.ts once at startup. Triggers setup + initial cloud sync. */
export async function initDb(): Promise<void> {
  const c = await ensureReady();
  // sync() is a no-op for local-only clients; safe to call always
  await c.sync?.().catch(() => {});
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  const c = await ensureReady();
  const res = await c.execute('SELECT * FROM projects ORDER BY name');
  return (res.rows as RawRow[]).map(rowToProject);
}

export async function addProject(name: string, repoPath: string | null): Promise<Project> {
  const c = await ensureReady();
  const existing = await c.execute({ sql: 'SELECT * FROM projects WHERE name = ?', args: [name] });
  if (existing.rows.length > 0) return rowToProject(existing.rows[0] as RawRow);

  const info = await c.execute({
    sql: 'INSERT INTO projects (name, repo_path) VALUES (?, ?)',
    args: [name, repoPath],
  });
  const row = await c.execute({
    sql: 'SELECT * FROM projects WHERE id = ?',
    args: [Number(info.lastInsertRowid)],
  });
  return rowToProject(row.rows[0] as RawRow);
}

export async function updateProjectRate(projectId: number, hourlyRate: number | null): Promise<void> {
  const c = await ensureReady();
  await c.execute({ sql: 'UPDATE projects SET hourly_rate = ? WHERE id = ?', args: [hourlyRate, projectId] });
}

// ── Entries ───────────────────────────────────────────────────────────────────

export async function getActiveEntry(): Promise<(Entry & { project_name: string }) | undefined> {
  const c = await ensureReady();
  const res = await c.execute(
    `SELECT entries.*, projects.name AS project_name
     FROM entries JOIN projects ON projects.id = entries.project_id
     WHERE entries.ended_at IS NULL
     ORDER BY entries.started_at DESC LIMIT 1`
  );
  if (res.rows.length === 0) return undefined;
  const r = res.rows[0] as RawRow;
  return { ...rowToEntry(r), project_name: r.project_name as string };
}

export async function startEntry(projectId: number, note?: string): Promise<Entry> {
  const c = await ensureReady();
  await stopActiveEntry();
  const projRes = await c.execute({ sql: 'SELECT * FROM projects WHERE id = ?', args: [projectId] });
  const project = projRes.rows.length > 0 ? rowToProject(projRes.rows[0] as RawRow) : undefined;
  const info = await c.execute({
    sql: 'INSERT INTO entries (project_id, started_at, note, hourly_rate) VALUES (?, ?, ?, ?)',
    args: [projectId, Date.now(), note ?? null, project?.hourly_rate ?? null],
  });
  const row = await c.execute({
    sql: 'SELECT * FROM entries WHERE id = ?',
    args: [Number(info.lastInsertRowid)],
  });
  return rowToEntry(row.rows[0] as RawRow);
}

export async function updateEntryNote(entryId: number, note: string): Promise<void> {
  const c = await ensureReady();
  await c.execute({ sql: 'UPDATE entries SET note = ? WHERE id = ?', args: [note || null, entryId] });
}

export async function updateEntryRate(entryId: number, hourlyRate: number | null): Promise<void> {
  const c = await ensureReady();
  await c.execute({ sql: 'UPDATE entries SET hourly_rate = ? WHERE id = ?', args: [hourlyRate, entryId] });
}

export async function updateEntryTimes(
  entryId: number,
  startedAt: number,
  endedAt: number | null
): Promise<void> {
  const c = await ensureReady();
  await c.execute({
    sql: 'UPDATE entries SET started_at = ?, ended_at = ? WHERE id = ?',
    args: [startedAt, endedAt, entryId],
  });
}

export async function createManualEntry(
  projectId: number,
  startedAt: number,
  endedAt: number,
  note: string | null,
  hourlyRate: number | null
): Promise<Entry> {
  const c = await ensureReady();
  const info = await c.execute({
    sql: 'INSERT INTO entries (project_id, started_at, ended_at, note, hourly_rate) VALUES (?, ?, ?, ?, ?)',
    args: [projectId, startedAt, endedAt, note || null, hourlyRate],
  });
  const row = await c.execute({
    sql: 'SELECT * FROM entries WHERE id = ?',
    args: [Number(info.lastInsertRowid)],
  });
  return rowToEntry(row.rows[0] as RawRow);
}

export async function deleteEntry(entryId: number): Promise<void> {
  const c = await ensureReady();
  await c.execute({ sql: 'DELETE FROM entries WHERE id = ?', args: [entryId] });
}

export async function stopActiveEntry(): Promise<void> {
  const active = await getActiveEntry();
  if (!active) return;
  const c = await ensureReady();
  await c.execute({ sql: 'UPDATE entries SET ended_at = ? WHERE id = ?', args: [Date.now(), active.id] });
}

// ── Summaries ─────────────────────────────────────────────────────────────────

export async function getTodaySummary(): Promise<ProjectSummary[]> {
  const c = await ensureReady();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since = startOfDay.getTime();
  const now = Date.now();

  const res = await c.execute({
    sql: `SELECT entries.project_id, projects.name AS project_name, entries.started_at, entries.ended_at
          FROM entries JOIN projects ON projects.id = entries.project_id
          WHERE entries.started_at >= ? OR entries.ended_at IS NULL`,
    args: [since],
  });

  const totals = new Map<number, ProjectSummary>();
  for (const r of res.rows as RawRow[]) {
    const projectId = n(r.project_id);
    const projectName = r.project_name as string;
    const startedAt = n(r.started_at);
    const endedAt = nOrNull(r.ended_at);

    const end = endedAt ?? now;
    const start = Math.max(startedAt, since);
    if (end <= start) continue;
    const duration = end - start;
    const existing = totals.get(projectId);
    if (existing) {
      existing.total_ms += duration;
    } else {
      totals.set(projectId, { project_id: projectId, project_name: projectName, total_ms: duration });
    }
  }
  return Array.from(totals.values()).sort((a, b) => b.total_ms - a.total_ms);
}

async function earningsSince(sinceMs: number | null, projectId: number | null): Promise<number> {
  const c = await ensureReady();
  const now = Date.now();
  const conditions: string[] = [];
  const args: (number | null)[] = [];
  if (sinceMs !== null) {
    conditions.push('(started_at >= ? OR ended_at IS NULL)');
    args.push(sinceMs);
  }
  if (projectId !== null) {
    conditions.push('project_id = ?');
    args.push(projectId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const res = await c.execute({
    sql: `SELECT started_at, ended_at, hourly_rate FROM entries ${where}`,
    args,
  });

  let total = 0;
  for (const r of res.rows as RawRow[]) {
    const rate = nOrNull(r.hourly_rate);
    if (!rate) continue;
    const endedAt = nOrNull(r.ended_at);
    const startedAt = n(r.started_at);
    const end = endedAt ?? now;
    const start = sinceMs === null ? startedAt : Math.max(startedAt, sinceMs);
    if (end <= start) continue;
    total += ((end - start) / 3600000) * rate;
  }
  return total;
}

async function durationSince(sinceMs: number | null): Promise<number> {
  const c = await ensureReady();
  const now = Date.now();
  const sql = sinceMs !== null
    ? 'SELECT started_at, ended_at FROM entries WHERE (started_at >= ? OR ended_at IS NULL)'
    : 'SELECT started_at, ended_at FROM entries';
  const args = sinceMs !== null ? [sinceMs] : [];
  const res = await c.execute({ sql, args });

  let total = 0;
  for (const r of res.rows as RawRow[]) {
    const startedAt = n(r.started_at);
    const endedAt = nOrNull(r.ended_at);
    const end = endedAt ?? now;
    const start = sinceMs === null ? startedAt : Math.max(startedAt, sinceMs);
    if (end <= start) continue;
    total += end - start;
  }
  return total;
}

export async function getTimeTotals(): Promise<TimeTotals> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const [week, allTime] = await Promise.all([
    durationSince(startOfWeek.getTime()),
    durationSince(null),
  ]);
  return { week, allTime };
}

export async function getEarningsSummary(projectId: number | null = null): Promise<EarningsSummary> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const [today, week, allTime] = await Promise.all([
    earningsSince(startOfDay.getTime(), projectId),
    earningsSince(startOfWeek.getTime(), projectId),
    earningsSince(null, projectId),
  ]);
  return { today, week, allTime };
}

// ── Entry lists ───────────────────────────────────────────────────────────────

export async function listAllEntries(): Promise<EntryWithProject[]> {
  const c = await ensureReady();
  const res = await c.execute(
    `SELECT entries.id, projects.name AS project_name, entries.started_at, entries.ended_at, entries.note, entries.hourly_rate
     FROM entries JOIN projects ON projects.id = entries.project_id
     ORDER BY entries.started_at DESC`
  );
  return (res.rows as RawRow[]).map(rowToEntryWithProject);
}

export async function listEntriesInRange(
  fromMs: number,
  toMs: number,
  projectId: number | null = null
): Promise<EntryWithProject[]> {
  const c = await ensureReady();
  const conditions = ['entries.started_at >= ? AND entries.started_at <= ?'];
  const args: (number | null)[] = [fromMs, toMs];
  if (projectId !== null) {
    conditions.push('entries.project_id = ?');
    args.push(projectId);
  }
  const res = await c.execute({
    sql: `SELECT entries.id, projects.name AS project_name, entries.started_at, entries.ended_at, entries.note, entries.hourly_rate
          FROM entries JOIN projects ON projects.id = entries.project_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY entries.started_at ASC`,
    args,
  });
  return (res.rows as RawRow[]).map(rowToEntryWithProject);
}

export async function listEntriesPage(limit: number, offset: number): Promise<EntryWithProject[]> {
  const c = await ensureReady();
  const res = await c.execute({
    sql: `SELECT entries.id, projects.name AS project_name, entries.started_at, entries.ended_at, entries.note, entries.hourly_rate
          FROM entries JOIN projects ON projects.id = entries.project_id
          ORDER BY entries.started_at DESC
          LIMIT ? OFFSET ?`,
    args: [limit, offset],
  });
  return (res.rows as RawRow[]).map(rowToEntryWithProject);
}

export async function countAllEntries(): Promise<number> {
  const c = await ensureReady();
  const res = await c.execute('SELECT COUNT(*) AS count FROM entries');
  return n((res.rows[0] as RawRow).count);
}

// ── Export history ────────────────────────────────────────────────────────────

export async function getLastExportRange(): Promise<ExportRange | null> {
  const c = await ensureReady();
  const res = await c.execute(
    'SELECT range_from, range_to FROM export_history ORDER BY exported_at DESC LIMIT 1'
  );
  if (res.rows.length === 0) return null;
  const r = res.rows[0] as RawRow;
  return { range_from: n(r.range_from), range_to: n(r.range_to) };
}

export async function saveExportRecord(
  rangeFrom: number,
  rangeTo: number,
  filePath: string,
  format: string,
  projectId?: number | null
): Promise<void> {
  const c = await ensureReady();
  await c.execute({
    sql: 'INSERT INTO export_history (exported_at, range_from, range_to, file_path, format, project_id) VALUES (?, ?, ?, ?, ?, ?)',
    args: [Date.now(), rangeFrom, rangeTo, filePath, format, projectId ?? null],
  });
}

export async function listExportHistory(): Promise<ExportHistoryRecord[]> {
  const c = await ensureReady();

  const xlsxRes = await c.execute(
    `SELECT eh.id, eh.exported_at, eh.range_from, eh.range_to, eh.file_path,
            'xlsx' AS format, eh.project_id, p.name AS project_name, NULL AS invoice_number
     FROM export_history eh
     LEFT JOIN projects p ON p.id = eh.project_id
     WHERE eh.format = 'xlsx' OR eh.format IS NULL`
  );

  const pdfRes = await c.execute(
    `SELECT i.id, i.created_at AS exported_at, i.range_from, i.range_to, i.file_path,
            'pdf' AS format, i.project_id, p.name AS project_name, i.invoice_number
     FROM invoices i
     LEFT JOIN projects p ON p.id = i.project_id`
  );

  const toRecord = (r: RawRow): ExportHistoryRecord => ({
    id: n(r.id),
    exported_at: n(r.exported_at),
    range_from: n(r.range_from),
    range_to: n(r.range_to),
    file_path: (r.file_path as string | null) ?? null,
    format: r.format as string,
    project_id: nOrNull(r.project_id),
    project_name: (r.project_name as string | null) ?? null,
    invoice_number: (r.invoice_number as string | null) ?? null,
  });

  return [
    ...(xlsxRes.rows as RawRow[]).map(toRecord),
    ...(pdfRes.rows as RawRow[]).map(toRecord),
  ].sort((a, b) => b.exported_at - a.exported_at);
}

// ── Invoice settings ──────────────────────────────────────────────────────────

export async function getInvoiceSettings(): Promise<InvoiceSettings> {
  const c = await ensureReady();
  const res = await c.execute('SELECT * FROM invoice_settings WHERE id = 1');
  if (res.rows.length > 0) return rowToInvoiceSettings(res.rows[0] as RawRow);
  return {
    id: 1,
    your_name: null,
    your_company: null,
    your_address: null,
    your_email: null,
    your_phone: null,
    preferred_template_id: 1,
    default_payment_terms: 'Net 30',
    last_client_name: null,
    last_client_address: null,
    last_due_date: null,
    last_notes: null,
    last_project_id: null,
  };
}

export async function saveInvoiceSettings(settings: Partial<Omit<InvoiceSettings, 'id'>>): Promise<void> {
  const current = await getInvoiceSettings();
  const merged: Omit<InvoiceSettings, 'id'> = {
    your_name:             'your_name'             in settings ? (settings.your_name             ?? null) : current.your_name,
    your_company:          'your_company'          in settings ? (settings.your_company          ?? null) : current.your_company,
    your_address:          'your_address'          in settings ? (settings.your_address          ?? null) : current.your_address,
    your_email:            'your_email'            in settings ? (settings.your_email            ?? null) : current.your_email,
    your_phone:            'your_phone'            in settings ? (settings.your_phone            ?? null) : current.your_phone,
    preferred_template_id: 'preferred_template_id' in settings ? (settings.preferred_template_id ?? 1)    : current.preferred_template_id,
    default_payment_terms: 'default_payment_terms' in settings ? (settings.default_payment_terms ?? 'Net 30') : current.default_payment_terms,
    last_client_name:      'last_client_name'      in settings ? (settings.last_client_name      ?? null) : current.last_client_name,
    last_client_address:   'last_client_address'   in settings ? (settings.last_client_address   ?? null) : current.last_client_address,
    last_due_date:         'last_due_date'         in settings ? (settings.last_due_date         ?? null) : current.last_due_date,
    last_notes:            'last_notes'            in settings ? (settings.last_notes            ?? null) : current.last_notes,
    last_project_id:       'last_project_id'       in settings ? (settings.last_project_id       ?? null) : current.last_project_id,
  };

  const c = await ensureReady();
  await c.execute({
    sql: `INSERT INTO invoice_settings
            (id, your_name, your_company, your_address, your_email, your_phone,
             preferred_template_id, default_payment_terms,
             last_client_name, last_client_address, last_due_date, last_notes, last_project_id)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            your_name = excluded.your_name,
            your_company = excluded.your_company,
            your_address = excluded.your_address,
            your_email = excluded.your_email,
            your_phone = excluded.your_phone,
            preferred_template_id = excluded.preferred_template_id,
            default_payment_terms = excluded.default_payment_terms,
            last_client_name = excluded.last_client_name,
            last_client_address = excluded.last_client_address,
            last_due_date = excluded.last_due_date,
            last_notes = excluded.last_notes,
            last_project_id = excluded.last_project_id`,
    args: [
      merged.your_name,
      merged.your_company,
      merged.your_address,
      merged.your_email,
      merged.your_phone,
      merged.preferred_template_id,
      merged.default_payment_terms,
      merged.last_client_name,
      merged.last_client_address,
      merged.last_due_date,
      merged.last_notes,
      merged.last_project_id,
    ],
  });
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function getNextInvoiceNumber(): Promise<string> {
  const c = await ensureReady();
  const res = await c.execute('SELECT COUNT(*) AS count FROM invoices');
  const count = n((res.rows[0] as RawRow).count);
  return `INV-${String(count + 1).padStart(4, '0')}`;
}

export async function saveInvoice(params: InvoiceSaveParams): Promise<void> {
  const c = await ensureReady();
  await c.execute({
    sql: `INSERT INTO invoices
            (invoice_number, created_at, client_name, client_address, due_date, payment_terms,
             notes, project_id, range_from, range_to, template_id, file_path)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      params.invoiceNumber,
      Date.now(),
      params.clientName || null,
      params.clientAddress || null,
      params.dueDate || null,
      params.paymentTerms || null,
      params.notes || null,
      params.projectId,
      params.rangeFrom,
      params.rangeTo,
      params.templateId,
      params.filePath || null,
    ],
  });
}

// ── Payments ──────────────────────────────────────────────────────────────────

export async function addPayment(
  projectId: number,
  amount: number,
  receivedAt: number,
  note: string | null,
  invoiceId?: number | null
): Promise<Payment> {
  const c = await ensureReady();
  const info = await c.execute({
    sql: 'INSERT INTO payments (project_id, amount, received_at, note, invoice_id) VALUES (?, ?, ?, ?, ?)',
    args: [projectId, amount, receivedAt, note || null, invoiceId ?? null],
  });
  const row = await c.execute({
    sql: 'SELECT * FROM payments WHERE id = ?',
    args: [Number(info.lastInsertRowid)],
  });
  return rowToPayment(row.rows[0] as RawRow);
}

export async function deletePayment(paymentId: number): Promise<void> {
  const c = await ensureReady();
  await c.execute({ sql: 'DELETE FROM payments WHERE id = ?', args: [paymentId] });
}

export async function listPayments(projectId: number): Promise<Payment[]> {
  const c = await ensureReady();
  const res = await c.execute({
    sql: 'SELECT * FROM payments WHERE project_id = ? ORDER BY received_at DESC',
    args: [projectId],
  });
  return (res.rows as RawRow[]).map(rowToPayment);
}

export async function getProjectBillingSummary(projectId: number): Promise<BillingSummary> {
  const c = await ensureReady();
  const entryRes = await c.execute({
    sql: 'SELECT started_at, ended_at, hourly_rate FROM entries WHERE project_id = ? AND ended_at IS NOT NULL AND hourly_rate IS NOT NULL',
    args: [projectId],
  });

  let totalEarned = 0;
  for (const r of entryRes.rows as RawRow[]) {
    const started = n(r.started_at);
    const ended = n(r.ended_at);
    const rate = n(r.hourly_rate);
    totalEarned += ((ended - started) / 3600000) * rate;
  }

  const paidRes = await c.execute({
    sql: 'SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE project_id = ?',
    args: [projectId],
  });
  const totalPaid = n((paidRes.rows[0] as RawRow).total);

  return { totalEarned, totalPaid, outstanding: totalEarned - totalPaid };
}

/**
 * Position at the start of an invoice period: earned before `rangeFrom` minus
 * all recorded payments. Negative means unused retainer/credit.
 */
export async function getInvoiceOpeningBalance(
  rangeFrom: number,
  projectId: number | null = null
): Promise<number> {
  const c = await ensureReady();

  const earnedClauses = ['ended_at IS NOT NULL', 'hourly_rate IS NOT NULL', 'started_at < ?'];
  const earnedArgs: number[] = [rangeFrom];
  if (projectId !== null) {
    earnedClauses.push('project_id = ?');
    earnedArgs.push(projectId);
  }

  const entryRes = await c.execute({
    sql: `SELECT started_at, ended_at, hourly_rate FROM entries WHERE ${earnedClauses.join(' AND ')}`,
    args: earnedArgs,
  });

  let earnedBefore = 0;
  for (const r of entryRes.rows as RawRow[]) {
    const started = n(r.started_at);
    const ended = n(r.ended_at);
    const rate = n(r.hourly_rate);
    earnedBefore += ((ended - started) / 3600000) * rate;
  }

  const paidSql = projectId !== null
    ? 'SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE project_id = ?'
    : 'SELECT COALESCE(SUM(amount), 0) AS total FROM payments';
  const paidRes = await c.execute({
    sql: paidSql,
    args: projectId !== null ? [projectId] : [],
  });
  const totalPaid = n((paidRes.rows[0] as RawRow).total);

  return earnedBefore - totalPaid;
}

// ── Misc ──────────────────────────────────────────────────────────────────────

export async function getRecentNotes(limit: number): Promise<string[]> {
  const c = await ensureReady();
  const res = await c.execute({
    sql: `SELECT note, MAX(started_at) AS last_used
          FROM entries
          WHERE note IS NOT NULL AND note != ''
          GROUP BY note
          ORDER BY last_used DESC
          LIMIT ?`,
    args: [limit],
  });
  return (res.rows as RawRow[]).map((r) => r.note as string);
}

export async function closeDb(): Promise<void> {
  await stopActiveEntry();
  if (_client) {
    _client.close();
    _client = null;
    _ready = null;
  }
}
