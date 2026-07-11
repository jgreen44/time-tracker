interface InvoiceFormData {
  invoiceNumber: string;
  dueDate: string;
  paymentTerms: string;
  yourName: string;
  yourCompany: string;
  yourAddress: string;
  yourEmail: string;
  yourPhone: string;
  clientName: string;
  clientAddress: string;
  notes: string;
  rangeFrom: number | null;
  rangeTo: number | null;
  projectId: number | null;
}

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
  updateEntryRate(entryId: number, hourlyRate: number | null): Promise<void>;
  updateEntryTimes(entryId: number, startedAt: number, endedAt: number | null): Promise<void>;
  listEntriesPage(limit: number, offset: number): Promise<
    {
      id: number;
      project_name: string;
      started_at: number;
      ended_at: number | null;
      note: string | null;
      hourly_rate: number | null;
    }[]
  >;
  countEntries(): Promise<number>;
  createManualEntry(
    projectId: number,
    startedAt: number,
    endedAt: number,
    note: string | null,
    hourlyRate: number | null
  ): Promise<unknown>;
  deleteEntry(entryId: number): Promise<void>;
  getTodaySummary(): Promise<{ project_id: number; project_name: string; total_ms: number }[]>;
  getRecentNotes(limit: number): Promise<string[]>;
  getTimeTotals(): Promise<{ week: number; allTime: number }>;
  getLastExportRange(): Promise<{ range_from: number; range_to: number } | null>;
  exportExcel(params: { rangeFrom: number; rangeTo: number; projectId?: number | null }): Promise<string | null>;
  getEarningsSummary(projectId?: number | null): Promise<{ today: number; week: number; allTime: number }>;
  updateProjectRate(projectId: number, hourlyRate: number | null): Promise<void>;
  openExternal(url: string): Promise<void>;
  getInvoiceSettings(): Promise<{
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
  }>;
  saveInvoiceSettings(settings: {
    your_name?: string;
    your_company?: string;
    your_address?: string;
    your_email?: string;
    your_phone?: string;
    preferred_template_id?: number;
    default_payment_terms?: string;
    last_client_name?: string;
    last_client_address?: string;
    last_due_date?: string;
    last_notes?: string;
    last_project_id?: number | null;
  }): Promise<void>;
  getNextInvoiceNumber(): Promise<string>;
  previewInvoiceTemplate(templateId: number, formData?: Partial<InvoiceFormData>): Promise<void>;
  refreshInvoicePreview(params: InvoiceFormData & { templateId: number }): Promise<void>;
  exportInvoice(params: {
    templateId: number;
    invoiceNumber: string;
    dueDate: string;
    paymentTerms: string;
    clientName: string;
    clientAddress: string;
    notes: string;
    rangeFrom: number;
    rangeTo: number;
    projectId: number | null;
  }): Promise<string | null>;
}

interface Window {
  api: TimeTrackerApi;
}
