interface TimeTrackerApi {
  listProjects(): Promise<{ id: number; name: string; repo_path: string | null }[]>;
  addProject(): Promise<{ id: number; name: string; repo_path: string | null } | null>;
  getActiveEntry(): Promise<{ id: number; project_id: number; started_at: number; project_name: string; note: string | null } | null>;
  startEntry(projectId: number, note?: string): Promise<unknown>;
  stopEntry(): Promise<void>;
  updateNote(entryId: number, note: string): Promise<void>;
  getTodaySummary(): Promise<{ project_id: number; project_name: string; total_ms: number }[]>;
  exportExcel(): Promise<string | null>;
}

interface Window {
  api: TimeTrackerApi;
}
