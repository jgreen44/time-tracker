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

export function closeDb(): void {
  stopActiveEntry();
  db.close();
}
