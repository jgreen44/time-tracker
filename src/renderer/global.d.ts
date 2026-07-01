interface TimeTrackerApi {
  listProjects(): Promise<{ id: number; name: string; repo_path: string | null; hourly_rate: number | null }[]>;
  addProject(): Promise<{ id: number; name: string; repo_path: string | null; hourly_rate: number | null } | null>;
  getActiveEntry(): Promise<{
    id: number;
    project_id: number;
    started_at: number;
    project_name: string;
    note: string | null;
    hourly_rate: number | null;
  } | null>;
  startEntry(projectId: number, note?: string): Promise<unknown>;
  stopEntry(): Promise<void>;
  updateNote(entryId: number, note: string): Promise<void>;
  getTodaySummary(): Promise<{ project_id: number; project_name: string; total_ms: number }[]>;
  exportExcel(): Promise<string | null>;
  getEarningsSummary(): Promise<{ today: number; week: number; allTime: number }>;
  updateProjectRate(projectId: number, hourlyRate: number | null): Promise<void>;
}

interface Window {
  api: TimeTrackerApi;
}
