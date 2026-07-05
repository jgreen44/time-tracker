import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

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

const dbPath = path.join(app.getPath('userData'), 'timetracker.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
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
`);

const projectColumns = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
if (!projectColumns.some((c) => c.name === 'hourly_rate')) {
  db.exec('ALTER TABLE projects ADD COLUMN hourly_rate REAL');
}
const entryColumns = db.prepare("PRAGMA table_info(entries)").all() as { name: string }[];
if (!entryColumns.some((c) => c.name === 'hourly_rate')) {
  db.exec('ALTER TABLE entries ADD COLUMN hourly_rate REAL');
}

export function listProjects(): Project[] {
  return db.prepare('SELECT * FROM projects ORDER BY name').all() as Project[];
}

export function addProject(name: string, repoPath: string | null): Project {
  const existing = db.prepare('SELECT * FROM projects WHERE name = ?').get(name) as Project | undefined;
  if (existing) return existing;
  const info = db.prepare('INSERT INTO projects (name, repo_path) VALUES (?, ?)').run(name, repoPath);
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid) as Project;
}

export function updateProjectRate(projectId: number, hourlyRate: number | null): void {
  db.prepare('UPDATE projects SET hourly_rate = ? WHERE id = ?').run(hourlyRate, projectId);
}

export function getActiveEntry(): (Entry & { project_name: string }) | undefined {
  return db
    .prepare(
      `SELECT entries.*, projects.name AS project_name
       FROM entries JOIN projects ON projects.id = entries.project_id
       WHERE entries.ended_at IS NULL
       ORDER BY entries.started_at DESC LIMIT 1`
    )
    .get() as (Entry & { project_name: string }) | undefined;
}

export function startEntry(projectId: number, note?: string): Entry {
  stopActiveEntry();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Project | undefined;
  const info = db
    .prepare('INSERT INTO entries (project_id, started_at, note, hourly_rate) VALUES (?, ?, ?, ?)')
    .run(projectId, Date.now(), note ?? null, project?.hourly_rate ?? null);
  return db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid) as Entry;
}

export function updateEntryNote(entryId: number, note: string): void {
  db.prepare('UPDATE entries SET note = ? WHERE id = ?').run(note || null, entryId);
}

export function updateEntryRate(entryId: number, hourlyRate: number | null): void {
  db.prepare('UPDATE entries SET hourly_rate = ? WHERE id = ?').run(hourlyRate, entryId);
}

export function updateEntryTimes(entryId: number, startedAt: number, endedAt: number | null): void {
  db.prepare('UPDATE entries SET started_at = ?, ended_at = ? WHERE id = ?').run(startedAt, endedAt, entryId);
}

export function createManualEntry(
  projectId: number,
  startedAt: number,
  endedAt: number,
  note: string | null,
  hourlyRate: number | null
): Entry {
  const info = db
    .prepare('INSERT INTO entries (project_id, started_at, ended_at, note, hourly_rate) VALUES (?, ?, ?, ?, ?)')
    .run(projectId, startedAt, endedAt, note || null, hourlyRate);
  return db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid) as Entry;
}

export function deleteEntry(entryId: number): void {
  db.prepare('DELETE FROM entries WHERE id = ?').run(entryId);
}

export function stopActiveEntry(): void {
  const active = getActiveEntry();
  if (!active) return;
  db.prepare('UPDATE entries SET ended_at = ? WHERE id = ?').run(Date.now(), active.id);
}

export function getTodaySummary(): ProjectSummary[] {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since = startOfDay.getTime();
  const now = Date.now();

  const rows = db
    .prepare(
      `SELECT entries.project_id, projects.name AS project_name, entries.started_at, entries.ended_at
       FROM entries JOIN projects ON projects.id = entries.project_id
       WHERE entries.started_at >= ? OR entries.ended_at IS NULL`
    )
    .all(since) as { project_id: number; project_name: string; started_at: number; ended_at: number | null }[];

  const totals = new Map<number, ProjectSummary>();
  for (const row of rows) {
    const end = row.ended_at ?? now;
    const start = Math.max(row.started_at, since);
    if (end <= start) continue;
    const duration = end - start;
    const existing = totals.get(row.project_id);
    if (existing) {
      existing.total_ms += duration;
    } else {
      totals.set(row.project_id, { project_id: row.project_id, project_name: row.project_name, total_ms: duration });
    }
  }
  return Array.from(totals.values()).sort((a, b) => b.total_ms - a.total_ms);
}

export interface EarningsSummary {
  today: number;
  week: number;
  allTime: number;
}

function earningsSince(sinceMs: number | null, projectId: number | null): number {
  const now = Date.now();
  const conditions: string[] = [];
  const params: number[] = [];
  if (sinceMs !== null) {
    conditions.push('(started_at >= ? OR ended_at IS NULL)');
    params.push(sinceMs);
  }
  if (projectId !== null) {
    conditions.push('project_id = ?');
    params.push(projectId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(`SELECT started_at, ended_at, hourly_rate FROM entries ${where}`)
    .all(...params) as {
    started_at: number;
    ended_at: number | null;
    hourly_rate: number | null;
  }[];

  let total = 0;
  for (const row of rows) {
    if (!row.hourly_rate) continue;
    const end = row.ended_at ?? now;
    const start = sinceMs === null ? row.started_at : Math.max(row.started_at, sinceMs);
    if (end <= start) continue;
    const hours = (end - start) / 3600000;
    total += hours * row.hourly_rate;
  }
  return total;
}

export function getEarningsSummary(projectId: number | null = null): EarningsSummary {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  return {
    today: earningsSince(startOfDay.getTime(), projectId),
    week: earningsSince(startOfWeek.getTime(), projectId),
    allTime: earningsSince(null, projectId),
  };
}

export interface EntryWithProject {
  id: number;
  project_name: string;
  started_at: number;
  ended_at: number | null;
  note: string | null;
  hourly_rate: number | null;
}

export function listAllEntries(): EntryWithProject[] {
  return db
    .prepare(
      `SELECT entries.id, projects.name AS project_name, entries.started_at, entries.ended_at, entries.note, entries.hourly_rate
       FROM entries JOIN projects ON projects.id = entries.project_id
       ORDER BY entries.started_at DESC`
    )
    .all() as EntryWithProject[];
}

export function listEntriesInRange(
  fromMs: number,
  toMs: number,
  projectId: number | null = null
): EntryWithProject[] {
  const conditions: string[] = ['entries.started_at >= ? AND entries.started_at <= ?'];
  const params: (number | null)[] = [fromMs, toMs];
  if (projectId !== null) {
    conditions.push('entries.project_id = ?');
    params.push(projectId);
  }
  return db
    .prepare(
      `SELECT entries.id, projects.name AS project_name, entries.started_at, entries.ended_at, entries.note, entries.hourly_rate
       FROM entries JOIN projects ON projects.id = entries.project_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY entries.started_at ASC`
    )
    .all(...params) as EntryWithProject[];
}

export function listEntriesPage(limit: number, offset: number): EntryWithProject[] {
  return db
    .prepare(
      `SELECT entries.id, projects.name AS project_name, entries.started_at, entries.ended_at, entries.note, entries.hourly_rate
       FROM entries JOIN projects ON projects.id = entries.project_id
       ORDER BY entries.started_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as EntryWithProject[];
}

export function countAllEntries(): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM entries').get() as { count: number };
  return row.count;
}

// ── Export history ────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS export_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exported_at INTEGER NOT NULL,
    range_from INTEGER NOT NULL,
    range_to INTEGER NOT NULL,
    file_path TEXT,
    format TEXT NOT NULL DEFAULT 'xlsx'
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

// ── invoice_settings column migrations (existing databases) ──────────────────
const invSettingsCols = db.prepare("PRAGMA table_info(invoice_settings)").all() as { name: string }[];
if (!invSettingsCols.some((c) => c.name === 'preferred_template_id')) {
  db.exec('ALTER TABLE invoice_settings ADD COLUMN preferred_template_id INTEGER NOT NULL DEFAULT 1');
}
if (!invSettingsCols.some((c) => c.name === 'default_payment_terms')) {
  db.exec("ALTER TABLE invoice_settings ADD COLUMN default_payment_terms TEXT NOT NULL DEFAULT 'Net 30'");
}
if (!invSettingsCols.some((c) => c.name === 'last_client_name')) {
  db.exec('ALTER TABLE invoice_settings ADD COLUMN last_client_name TEXT');
}
if (!invSettingsCols.some((c) => c.name === 'last_client_address')) {
  db.exec('ALTER TABLE invoice_settings ADD COLUMN last_client_address TEXT');
}
if (!invSettingsCols.some((c) => c.name === 'last_due_date')) {
  db.exec('ALTER TABLE invoice_settings ADD COLUMN last_due_date TEXT');
}
if (!invSettingsCols.some((c) => c.name === 'last_notes')) {
  db.exec('ALTER TABLE invoice_settings ADD COLUMN last_notes TEXT');
}
if (!invSettingsCols.some((c) => c.name === 'last_project_id')) {
  db.exec('ALTER TABLE invoice_settings ADD COLUMN last_project_id INTEGER');
}

export interface ExportRange {
  range_from: number;
  range_to: number;
}

export function getLastExportRange(): ExportRange | null {
  return (
    (db
      .prepare('SELECT range_from, range_to FROM export_history ORDER BY exported_at DESC LIMIT 1')
      .get() as ExportRange | undefined) ?? null
  );
}

export function saveExportRecord(
  rangeFrom: number,
  rangeTo: number,
  filePath: string,
  format: string
): void {
  db
    .prepare(
      'INSERT INTO export_history (exported_at, range_from, range_to, file_path, format) VALUES (?, ?, ?, ?, ?)'
    )
    .run(Date.now(), rangeFrom, rangeTo, filePath, format);
}

// ── Invoice settings ──────────────────────────────────────────────────────────

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

export function getInvoiceSettings(): InvoiceSettings {
  const row = db.prepare('SELECT * FROM invoice_settings WHERE id = 1').get() as
    | InvoiceSettings
    | undefined;
  return (
    row ?? {
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
    }
  );
}

export function saveInvoiceSettings(settings: Partial<Omit<InvoiceSettings, 'id'>>): void {
  db.prepare(`
    INSERT INTO invoice_settings
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
      last_project_id = excluded.last_project_id
  `).run(
    settings.your_name ?? null,
    settings.your_company ?? null,
    settings.your_address ?? null,
    settings.your_email ?? null,
    settings.your_phone ?? null,
    settings.preferred_template_id ?? 1,
    settings.default_payment_terms ?? 'Net 30',
    settings.last_client_name ?? null,
    settings.last_client_address ?? null,
    settings.last_due_date ?? null,
    settings.last_notes ?? null,
    settings.last_project_id ?? null
  );
}

export function getNextInvoiceNumber(): string {
  const row = db.prepare('SELECT COUNT(*) AS count FROM invoices').get() as { count: number };
  return `INV-${String(row.count + 1).padStart(4, '0')}`;
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

export function saveInvoice(params: InvoiceSaveParams): void {
  db.prepare(`
    INSERT INTO invoices
      (invoice_number, created_at, client_name, client_address, due_date, payment_terms,
       notes, project_id, range_from, range_to, template_id, file_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
    params.filePath || null
  );
}

export function closeDb(): void {
  stopActiveEntry();
  db.close();
}
