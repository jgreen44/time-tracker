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
  exportExcel: () => ipcRenderer.invoke('entries:exportExcel'),
  getEarningsSummary: (projectId: number | null) => ipcRenderer.invoke('entries:earningsSummary', projectId),
  updateProjectRate: (projectId: number, hourlyRate: number | null) =>
    ipcRenderer.invoke('projects:updateRate', projectId, hourlyRate),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
});
