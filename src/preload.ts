import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  addProject: () => ipcRenderer.invoke('projects:add'),
  getActiveEntry: () => ipcRenderer.invoke('entries:active'),
  startEntry: (projectId: number, note?: string) => ipcRenderer.invoke('entries:start', projectId, note),
  stopEntry: () => ipcRenderer.invoke('entries:stop'),
  updateNote: (entryId: number, note: string) => ipcRenderer.invoke('entries:updateNote', entryId, note),
  updateEntryRate: (entryId: number, hourlyRate: number | null) =>
    ipcRenderer.invoke('entries:updateRate', entryId, hourlyRate),
  updateEntryTimes: (entryId: number, startedAt: number, endedAt: number | null) =>
    ipcRenderer.invoke('entries:updateTimes', entryId, startedAt, endedAt),
  listEntriesPage: (limit: number, offset: number) => ipcRenderer.invoke('entries:listPage', limit, offset),
  countEntries: () => ipcRenderer.invoke('entries:count'),
  createManualEntry: (projectId: number, startedAt: number, endedAt: number, note: string | null, hourlyRate: number | null) =>
    ipcRenderer.invoke('entries:createManual', projectId, startedAt, endedAt, note, hourlyRate),
  deleteEntry: (entryId: number) => ipcRenderer.invoke('entries:delete', entryId),
  getTodaySummary: () => ipcRenderer.invoke('entries:todaySummary'),
  getRecentNotes: (limit: number) => ipcRenderer.invoke('entries:recentNotes', limit),
  getTimeTotals: () => ipcRenderer.invoke('entries:timeTotals'),
  getLastExportRange: () => ipcRenderer.invoke('entries:getLastExportRange'),
  exportExcel: (params: { rangeFrom: number; rangeTo: number; projectId?: number | null }) =>
    ipcRenderer.invoke('entries:exportExcel', params),
  getEarningsSummary: (projectId: number | null) => ipcRenderer.invoke('entries:earningsSummary', projectId),
  updateProjectRate: (projectId: number, hourlyRate: number | null) =>
    ipcRenderer.invoke('projects:updateRate', projectId, hourlyRate),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  getInvoiceSettings: () => ipcRenderer.invoke('invoice:getSettings'),
  saveInvoiceSettings: (settings: {
    your_name?: string; your_company?: string; your_address?: string;
    your_email?: string; your_phone?: string;
    preferred_template_id?: number; default_payment_terms?: string;
    last_client_name?: string; last_client_address?: string;
    last_due_date?: string; last_notes?: string; last_project_id?: number | null;
  }) => ipcRenderer.invoke('invoice:saveSettings', settings),
  getNextInvoiceNumber: () => ipcRenderer.invoke('invoice:getNextNumber'),
  previewInvoiceTemplate: (templateId: number, formData?: object) => ipcRenderer.invoke('invoice:preview', templateId, formData),
  refreshInvoicePreview: (params: object) => ipcRenderer.invoke('invoice:refreshPreview', params),
  exportInvoice: (params: {
    templateId: number; invoiceNumber: string; dueDate: string;
    paymentTerms: string; clientName: string; clientAddress: string;
    notes: string; rangeFrom: number; rangeTo: number; projectId: number | null;
  }) => ipcRenderer.invoke('invoice:export', params),
  listPayments: (projectId: number) => ipcRenderer.invoke('payments:list', projectId),
  addPayment: (projectId: number, amount: number, receivedAt: number, note: string | null, invoiceId?: number | null) =>
    ipcRenderer.invoke('payments:add', projectId, amount, receivedAt, note, invoiceId),
  deletePayment: (paymentId: number) => ipcRenderer.invoke('payments:delete', paymentId),
  getProjectBillingSummary: (projectId: number) => ipcRenderer.invoke('projects:billingSummary', projectId),
  listExportHistory: () => ipcRenderer.invoke('export-history:list'),
});
