import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  addProject: () => ipcRenderer.invoke('projects:add'),
  getActiveEntry: () => ipcRenderer.invoke('entries:active'),
  startEntry: (projectId: number, note?: string) => ipcRenderer.invoke('entries:start', projectId, note),
  stopEntry: () => ipcRenderer.invoke('entries:stop'),
  updateNote: (entryId: number, note: string) => ipcRenderer.invoke('entries:updateNote', entryId, note),
  getTodaySummary: () => ipcRenderer.invoke('entries:todaySummary'),
  exportExcel: () => ipcRenderer.invoke('entries:exportExcel'),
});
