import path from 'path';
import { execFile } from 'child_process';
import { app, dialog, ipcMain } from 'electron';
import { menubar } from 'menubar';
import ExcelJS from 'exceljs';
import * as db from './db';

const mb = menubar({
  index: `file://${path.join(__dirname, 'renderer', 'index.html')}`,
  icon: path.join(__dirname, '..', 'assets', 'iconTemplate.png'),
  preloadWindow: true,
  browserWindow: {
    width: 320,
    height: 420,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  },
});

function deriveProjectName(repoPath: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', ['remote', 'get-url', 'origin'], { cwd: repoPath }, (err, stdout) => {
      if (!err && stdout.trim()) {
        const url = stdout.trim();
        const match = url.match(/([^/\\]+?)(\.git)?$/);
        if (match) {
          resolve(match[1]);
          return;
        }
      }
      resolve(path.basename(repoPath));
    });
  });
}

ipcMain.handle('projects:list', () => db.listProjects());

ipcMain.handle('projects:add', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select a project folder',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const repoPath = result.filePaths[0];
  const name = await deriveProjectName(repoPath);
  return db.addProject(name, repoPath);
});

ipcMain.handle('entries:active', () => db.getActiveEntry() ?? null);
ipcMain.handle('entries:start', (_event, projectId: number, note?: string) => db.startEntry(projectId, note));
ipcMain.handle('entries:stop', () => {
  db.stopActiveEntry();
  return null;
});
ipcMain.handle('entries:updateNote', (_event, entryId: number, note: string) => db.updateEntryNote(entryId, note));
ipcMain.handle('entries:todaySummary', () => db.getTodaySummary());

function formatLocalDate(ms: number): string {
  return new Date(ms).toLocaleDateString();
}

function formatLocalTime(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

ipcMain.handle('entries:exportExcel', async () => {
  const result = await dialog.showSaveDialog({
    title: 'Export Time Entries',
    defaultPath: `time-tracker-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  });
  if (result.canceled || !result.filePath) return null;

  const entries = db.listAllEntries();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Time Tracker';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Entries');
  sheet.columns = [
    { header: 'Project', key: 'project', width: 25 },
    { header: 'Start Date', key: 'startDate', width: 14 },
    { header: 'Start Time', key: 'startTime', width: 14 },
    { header: 'Stop Date', key: 'stopDate', width: 14 },
    { header: 'Stop Time', key: 'stopTime', width: 14 },
    { header: 'Duration (hours)', key: 'durationHours', width: 18 },
    { header: 'Note', key: 'note', width: 30 },
  ];

  sheet.addRows(
    entries.map((entry) => ({
      project: entry.project_name,
      startDate: formatLocalDate(entry.started_at),
      startTime: formatLocalTime(entry.started_at),
      stopDate: entry.ended_at ? formatLocalDate(entry.ended_at) : '',
      stopTime: entry.ended_at ? formatLocalTime(entry.ended_at) : '',
      durationHours: entry.ended_at ? (entry.ended_at - entry.started_at) / 3600000 : null,
      note: entry.note ?? '',
    }))
  );

  await workbook.xlsx.writeFile(result.filePath);
  return result.filePath;
});

app.on('before-quit', () => {
  db.closeDb();
});
