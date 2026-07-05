import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell } from 'electron';
import { menubar } from 'menubar';
import ExcelJS from 'exceljs';
import * as db from './db';
import type { InvoiceData } from './invoice-templates';
import {
  formatLocalDate,
  formatLocalTime,
  buildInvoiceData,
  buildPreviewHtml,
  findTemplate,
  entriesToLineItems,
  SAMPLE_LINE_ITEMS,
  PREVIEW_SCREEN_CSS,
  InvoiceFormParams,
} from './invoice-utils';

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const trayIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'iconTemplate.png'));
trayIcon.setTemplateImage(true);

const mb = menubar({
  index: `file://${path.join(__dirname, 'renderer', 'index.html')}`,
  icon: trayIcon,
  preloadWindow: true,
  browserWindow: {
    width: 340,
    height: 860,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  },
});

let openPreviewCount = 0;
let currentPreviewWin: BrowserWindow | null = null;

mb.on('ready', () => {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Quit Time Tracker',
      click: () => app.quit(),
    },
  ]);
  mb.tray.on('right-click', () => {
    mb.tray.popUpContextMenu(contextMenu);
  });

  // Intercept hideWindow so the menubar stays open while previews are open
  const origHideWindow = mb.hideWindow.bind(mb);
  (mb as unknown as Record<string, unknown>).hideWindow = () => {
    if (openPreviewCount > 0) return Promise.resolve();
    return origHideWindow();
  };
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
ipcMain.handle('entries:updateRate', (_event, entryId: number, hourlyRate: number | null) =>
  db.updateEntryRate(entryId, hourlyRate)
);
ipcMain.handle('entries:updateTimes', (_event, entryId: number, startedAt: number, endedAt: number | null) =>
  db.updateEntryTimes(entryId, startedAt, endedAt)
);
ipcMain.handle('entries:listPage', (_event, limit: number, offset: number) => db.listEntriesPage(limit, offset));
ipcMain.handle('entries:count', () => db.countAllEntries());
ipcMain.handle(
  'entries:createManual',
  (_event, projectId: number, startedAt: number, endedAt: number, note: string | null, hourlyRate: number | null) =>
    db.createManualEntry(projectId, startedAt, endedAt, note, hourlyRate)
);
ipcMain.handle('entries:delete', (_event, entryId: number) => db.deleteEntry(entryId));
ipcMain.handle('entries:todaySummary', () => db.getTodaySummary());
ipcMain.handle('entries:earningsSummary', (_event, projectId: number | null) => db.getEarningsSummary(projectId));
ipcMain.handle('projects:updateRate', (_event, projectId: number, hourlyRate: number | null) =>
  db.updateProjectRate(projectId, hourlyRate)
);
ipcMain.handle('app:openExternal', (_event, url: string) => {
  if (url === 'https://www.clearedfinal.com') {
    shell.openExternal(url);
  }
});

interface ExcelExportParams {
  rangeFrom: number;
  rangeTo: number;
  projectId?: number | null;
}

ipcMain.handle('entries:getLastExportRange', () => db.getLastExportRange());

ipcMain.handle('entries:exportExcel', async (_event, params: ExcelExportParams) => {
  const result = await dialog.showSaveDialog({
    title: 'Export Time Entries',
    defaultPath: `time-tracker-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  });
  if (result.canceled || !result.filePath) return null;

  const entries = db.listEntriesInRange(params.rangeFrom, params.rangeTo, params.projectId ?? null);
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
    { header: 'Hourly Rate', key: 'hourlyRate', width: 14 },
    { header: 'Earnings', key: 'earnings', width: 14 },
    { header: 'Note', key: 'note', width: 30 },
  ];

  sheet.addRows(
    entries.map((entry) => {
      const durationHours = entry.ended_at ? (entry.ended_at - entry.started_at) / 3600000 : null;
      return {
        project: entry.project_name,
        startDate: formatLocalDate(entry.started_at),
        startTime: formatLocalTime(entry.started_at),
        stopDate: entry.ended_at ? formatLocalDate(entry.ended_at) : '',
        stopTime: entry.ended_at ? formatLocalTime(entry.ended_at) : '',
        durationHours,
        hourlyRate: entry.hourly_rate ?? '',
        earnings: durationHours !== null && entry.hourly_rate ? durationHours * entry.hourly_rate : '',
        note: entry.note ?? '',
      };
    })
  );

  await workbook.xlsx.writeFile(result.filePath);
  db.saveExportRecord(params.rangeFrom, params.rangeTo, result.filePath, 'xlsx');
  return result.filePath;
});

// ── Invoice handlers ──────────────────────────────────────────────────────────

ipcMain.handle('invoice:getSettings', () => db.getInvoiceSettings());

ipcMain.handle('invoice:saveSettings', (_event, settings: Parameters<typeof db.saveInvoiceSettings>[0]) => {
  db.saveInvoiceSettings(settings);
});

ipcMain.handle('invoice:getNextNumber', () => db.getNextInvoiceNumber());

interface InvoiceExportParams {
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
}

// Maps each preview window to the temp file it currently has loaded.
// Using a Map instead of a single variable eliminates the race condition where
// the old window's closed handler deletes the file already owned by the new window.
const previewTmpPaths = new Map<BrowserWindow, string>();

function writeAndLoadPreview(html: string) {
  if (!currentPreviewWin || currentPreviewWin.isDestroyed()) return;
  const newPath = path.join(os.tmpdir(), `tt-preview-${Date.now()}.html`);
  fs.writeFileSync(newPath, html, 'utf8');
  const oldPath = previewTmpPaths.get(currentPreviewWin);
  previewTmpPaths.set(currentPreviewWin, newPath);
  currentPreviewWin.loadURL(`file://${newPath}`);
  // Delete the previous file only after the new one has finished loading.
  if (oldPath) {
    currentPreviewWin.webContents.once('did-finish-load', () => {
      try { fs.unlinkSync(oldPath); } catch { /* ignore */ }
    });
  }
}

type InvoicePreviewData = InvoiceFormParams;

function buildInvoiceDataFromForm(params: InvoicePreviewData): InvoiceData {
  let lineItems = SAMPLE_LINE_ITEMS;
  let dateRange = 'Jul 1 – Jul 31, 2026';

  if (params.rangeFrom && params.rangeTo && params.rangeTo >= params.rangeFrom) {
    const entries = db.listEntriesInRange(params.rangeFrom, params.rangeTo, params.projectId);
    const real = entriesToLineItems(entries);
    if (real.length > 0) lineItems = real;
    dateRange = `${formatLocalDate(params.rangeFrom)} – ${formatLocalDate(params.rangeTo)}`;
  }

  return buildInvoiceData(params, lineItems, dateRange);
}

ipcMain.handle('invoice:refreshPreview', (_event, params: InvoicePreviewData) => {
  if (!currentPreviewWin || currentPreviewWin.isDestroyed()) return;
  const data = buildInvoiceDataFromForm(params);
  writeAndLoadPreview(buildPreviewHtml(params.templateId, data));
});

ipcMain.handle('invoice:preview', async (_event, templateId: number, formData?: Partial<InvoicePreviewData>) => {
  if (currentPreviewWin && !currentPreviewWin.isDestroyed()) {
    currentPreviewWin.close();
  }

  const settings = db.getInvoiceSettings();
  const data = buildInvoiceDataFromForm({
    templateId,
    invoiceNumber: formData?.invoiceNumber || 'INV-0001',
    dueDate: formData?.dueDate || 'Net 30',
    paymentTerms: formData?.paymentTerms || 'Net 30',
    yourName: formData?.yourName ?? settings.your_name ?? '',
    yourCompany: formData?.yourCompany ?? settings.your_company ?? '',
    yourAddress: formData?.yourAddress ?? settings.your_address ?? '',
    yourEmail: formData?.yourEmail ?? settings.your_email ?? '',
    yourPhone: formData?.yourPhone ?? settings.your_phone ?? '',
    clientName: formData?.clientName ?? '',
    clientAddress: formData?.clientAddress ?? '',
    notes: formData?.notes ?? '',
    rangeFrom: formData?.rangeFrom ?? null,
    rangeTo: formData?.rangeTo ?? null,
    projectId: formData?.projectId ?? null,
  });

  const template = findTemplate(templateId);
  const html = buildPreviewHtml(templateId, data);
  const tmpPath = path.join(os.tmpdir(), `tt-preview-${Date.now()}.html`);
  fs.writeFileSync(tmpPath, html, 'utf8');

  const previewWin = new BrowserWindow({
    width: 900,
    height: 1080,
    title: `Preview: ${template.name}`,
    show: false,
    webPreferences: { contextIsolation: true },
  });

  // Register the initial tmp path in the map before setting currentPreviewWin so
  // writeAndLoadPreview (called by refreshPreview) can safely replace it.
  previewTmpPaths.set(previewWin, tmpPath);
  openPreviewCount++;
  currentPreviewWin = previewWin;
  previewWin.once('ready-to-show', () => previewWin.show());
  previewWin.once('closed', () => {
    openPreviewCount--;
    if (currentPreviewWin === previewWin) currentPreviewWin = null;
    const ownPath = previewTmpPaths.get(previewWin);
    previewTmpPaths.delete(previewWin);
    try { if (ownPath) fs.unlinkSync(ownPath); } catch { /* ignore */ }
  });
  previewWin.loadURL(`file://${tmpPath}`);
});

ipcMain.handle('invoice:export', async (_event, params: InvoiceExportParams) => {
  const entries = db.listEntriesInRange(params.rangeFrom, params.rangeTo, params.projectId);
  const settings = db.getInvoiceSettings();

  const lineItems = entriesToLineItems(entries);
  const invoiceData = buildInvoiceData(
    {
      templateId:    params.templateId,
      invoiceNumber: params.invoiceNumber,
      dueDate:       params.dueDate,
      paymentTerms:  params.paymentTerms,
      yourName:      settings.your_name    ?? '',
      yourCompany:   settings.your_company ?? '',
      yourAddress:   settings.your_address ?? '',
      yourEmail:     settings.your_email   ?? '',
      yourPhone:     settings.your_phone   ?? '',
      clientName:    params.clientName,
      clientAddress: params.clientAddress,
      notes:         params.notes,
      rangeFrom:     params.rangeFrom,
      rangeTo:       params.rangeTo,
      projectId:     params.projectId,
    },
    lineItems,
    `${formatLocalDate(params.rangeFrom)} – ${formatLocalDate(params.rangeTo)}`
  );

  const template = findTemplate(params.templateId);
  const html = template.render(invoiceData);

  const tmpHtmlPath = path.join(os.tmpdir(), `tt-invoice-${Date.now()}.html`);
  fs.writeFileSync(tmpHtmlPath, html, 'utf8');

  const pdfWin = new BrowserWindow({
    show: false,
    width: 816,
    height: 1056,
    webPreferences: { contextIsolation: true },
  });

  await new Promise<void>((resolve) => {
    pdfWin.webContents.once('did-finish-load', () => resolve());
    pdfWin.loadURL(`file://${tmpHtmlPath}`);
  });

  const pdfBuffer = await pdfWin.webContents.printToPDF({
    pageSize: 'Letter',
    printBackground: true,
    margins: { marginType: 'default' },
  });

  pdfWin.close();
  fs.unlinkSync(tmpHtmlPath);

  const result = await dialog.showSaveDialog({
    title: 'Save Invoice PDF',
    defaultPath: `invoice-${params.invoiceNumber}-${new Date().toISOString().slice(0, 10)}.pdf`,
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
  });

  if (result.canceled || !result.filePath) return null;

  fs.writeFileSync(result.filePath, pdfBuffer);

  db.saveInvoice({
    invoiceNumber: params.invoiceNumber,
    clientName: params.clientName,
    clientAddress: params.clientAddress,
    dueDate: params.dueDate,
    paymentTerms: params.paymentTerms,
    notes: params.notes,
    projectId: params.projectId,
    rangeFrom: params.rangeFrom,
    rangeTo: params.rangeTo,
    templateId: params.templateId,
    filePath: result.filePath,
  });
  db.saveExportRecord(params.rangeFrom, params.rangeTo, result.filePath, 'pdf');

  return result.filePath;
});

app.on('before-quit', () => {
  db.closeDb();
});
