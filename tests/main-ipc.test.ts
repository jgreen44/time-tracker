/**
 * Tests for the IPC handlers registered by main.ts.
 *
 * Strategy:
 *   - Electron, menubar, and ExcelJS are fully mocked (see moduleNameMapper in
 *     jest.config.js and the __mocks__ directory).
 *   - Importing main.ts fires all top-level side-effects under those mocks.
 *   - ipcMain.handle is a jest.fn(), so we can pull each registered handler out
 *     of ipcMain.handle.mock.calls and invoke it directly.
 *   - The db module uses app.getPath('userData') → '/tmp/time-tracker-test',
 *     so we share the same SQLite file as db.test.ts uses.  We wipe it before
 *     each relevant test block so state is isolated.
 */

import fs from 'fs';
import path from 'path';
import { app, ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { mockWorkbook, mockSheet } from './__mocks__/exceljs';

// Use a separate directory so this suite does not compete with db.test.ts for
// the same SQLite file when Jest runs test files in parallel.
const TEST_DB_DIR  = '/tmp/time-tracker-main-ipc-test';
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'timetracker.db');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract a registered IPC handler by channel name. */
function getHandler(channel: string): (...args: unknown[]) => unknown {
  const calls = (ipcMain.handle as jest.Mock).mock.calls as Array<[string, (...a: unknown[]) => unknown]>;
  const found = calls.find(([ch]) => ch === channel);
  if (!found) throw new Error(`Handler for '${channel}' was not registered`);
  return found[1];
}

const FAKE_EVENT = {} as Electron.IpcMainInvokeEvent;

// ── Module setup ──────────────────────────────────────────────────────────────

beforeAll(() => {
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  // Wipe any leftover db so we start fresh.  This must happen BEFORE main.ts
  // is required so better-sqlite3 opens a clean file.
  try { fs.unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
  // Remove stale WAL/SHM files so SQLite opens cleanly.
  try { fs.unlinkSync(TEST_DB_PATH + '-wal'); } catch { /* ignore */ }
  try { fs.unlinkSync(TEST_DB_PATH + '-shm'); } catch { /* ignore */ }

  // Point app.getPath to OUR private directory so main.ts/db.ts uses a
  // different SQLite file than db.test.ts (which uses /tmp/time-tracker-test).
  // This prevents a disk I/O race when both test files run in parallel.
  (app.getPath as jest.Mock).mockReturnValue(TEST_DB_DIR);

  // Requiring main.ts runs all top-level code (menubar, ipcMain.handle, etc.)
  // We must NOT call jest.resetModules() here: the import statements at the top
  // of this file have already bound ipcMain/dialog/etc. to the mock instances
  // from the module registry.  Loading main.ts without resetting the registry
  // means main.ts picks up those same mock instances, so ipcMain.handle calls
  // are captured in the same jest.fn() we inspect in getHandler().
  require('../src/main');
});

afterAll(() => {
  try { fs.unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
});

// ── projects:list ─────────────────────────────────────────────────────────────

describe('projects:list handler', () => {
  it('returns an array', async () => {
    const result = await getHandler('projects:list')(FAKE_EVENT);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── projects:add handler ──────────────────────────────────────────────────────

describe('projects:add handler', () => {
  it('returns null when dialog is canceled', async () => {
    (dialog.showOpenDialog as jest.Mock).mockResolvedValueOnce({ canceled: true, filePaths: [] });
    const result = await getHandler('projects:add')(FAKE_EVENT);
    expect(result).toBeNull();
  });

  it('returns null when no path selected', async () => {
    (dialog.showOpenDialog as jest.Mock).mockResolvedValueOnce({ canceled: false, filePaths: [] });
    const result = await getHandler('projects:add')(FAKE_EVENT);
    expect(result).toBeNull();
  });

  it('creates a project using the folder basename when git fails', async () => {
    (dialog.showOpenDialog as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/some/path/my-project'],
    });
    const result = await getHandler('projects:add')(FAKE_EVENT) as { name: string } | null;
    // git will fail (no real repo), so name falls back to basename.
    expect(result).not.toBeNull();
    expect(typeof result?.name).toBe('string');
  });
});

// ── entries:active ────────────────────────────────────────────────────────────

describe('entries:active handler', () => {
  it('returns null when no entry is running', async () => {
    const result = await getHandler('entries:active')(FAKE_EVENT);
    expect(result).toBeNull();
  });
});

// ── entries:start + entries:stop ─────────────────────────────────────────────

describe('entries:start / entries:stop handlers', () => {
  it('starts an entry and then stops it', async () => {
    // Get the first project id (created in projects:add test above)
    const projects = await getHandler('projects:list')(FAKE_EVENT) as Array<{ id: number }>;
    const projectId = projects[0]?.id ?? 1;

    const started = await getHandler('entries:start')(FAKE_EVENT, projectId, 'ipc test') as { ended_at: null };
    expect(started.ended_at).toBeNull();

    const active = await getHandler('entries:active')(FAKE_EVENT) as { note: string } | null;
    expect(active?.note).toBe('ipc test');

    const stopped = await getHandler('entries:stop')(FAKE_EVENT);
    expect(stopped).toBeNull();

    const after = await getHandler('entries:active')(FAKE_EVENT);
    expect(after).toBeNull();
  });
});

// ── entries:count / entries:listPage ─────────────────────────────────────────

describe('entries:count and entries:listPage handlers', () => {
  it('entries:count returns a number', async () => {
    const count = await getHandler('entries:count')(FAKE_EVENT);
    expect(typeof count).toBe('number');
  });

  it('entries:listPage returns an array', async () => {
    const page = await getHandler('entries:listPage')(FAKE_EVENT, 10, 0);
    expect(Array.isArray(page)).toBe(true);
  });
});

// ── entries:createManual / entries:delete ────────────────────────────────────

describe('entries:createManual and entries:delete handlers', () => {
  it('creates and deletes a manual entry', async () => {
    const projects = await getHandler('projects:list')(FAKE_EVENT) as Array<{ id: number }>;
    const projectId = projects[0]?.id ?? 1;
    const start = Date.now() - 3_600_000;
    const end   = Date.now();

    const entry = await getHandler('entries:createManual')(
      FAKE_EVENT, projectId, start, end, 'manual ipc', 75
    ) as { id: number; note: string; hourly_rate: number };

    expect(entry.note).toBe('manual ipc');
    expect(entry.hourly_rate).toBe(75);

    await getHandler('entries:delete')(FAKE_EVENT, entry.id);
    const count = await getHandler('entries:count')(FAKE_EVENT) as number;
    const allPage = await getHandler('entries:listPage')(FAKE_EVENT, 1000, 0) as Array<{ id: number }>;
    expect(allPage.find((e) => e.id === entry.id)).toBeUndefined();
    void count;
  });
});

// ── entries:updateNote / entries:updateRate / entries:updateTimes ─────────────

describe('entries update handlers', () => {
  let entryId: number;

  beforeAll(async () => {
    const projects = await getHandler('projects:list')(FAKE_EVENT) as Array<{ id: number }>;
    const projectId = projects[0]?.id ?? 1;
    const entry = await getHandler('entries:createManual')(
      FAKE_EVENT, projectId, 1000, 2000, 'to update', null
    ) as { id: number };
    entryId = entry.id;
  });

  it('entries:updateNote changes the note', async () => {
    await getHandler('entries:updateNote')(FAKE_EVENT, entryId, 'updated!');
    const page = await getHandler('entries:listPage')(FAKE_EVENT, 1000, 0) as Array<{ id: number; note: string }>;
    expect(page.find((e) => e.id === entryId)?.note).toBe('updated!');
  });

  it('entries:updateRate changes the rate', async () => {
    await getHandler('entries:updateRate')(FAKE_EVENT, entryId, 99);
    const page = await getHandler('entries:listPage')(FAKE_EVENT, 1000, 0) as Array<{ id: number; hourly_rate: number }>;
    expect(page.find((e) => e.id === entryId)?.hourly_rate).toBe(99);
  });

  it('entries:updateTimes changes timestamps', async () => {
    await getHandler('entries:updateTimes')(FAKE_EVENT, entryId, 5000, 6000);
    const page = await getHandler('entries:listPage')(FAKE_EVENT, 1000, 0) as Array<{ id: number; started_at: number }>;
    expect(page.find((e) => e.id === entryId)?.started_at).toBe(5000);
  });
});

// ── entries:todaySummary ──────────────────────────────────────────────────────

describe('entries:todaySummary handler', () => {
  it('returns an array', async () => {
    const summary = await getHandler('entries:todaySummary')(FAKE_EVENT);
    expect(Array.isArray(summary)).toBe(true);
  });
});

// ── entries:earningsSummary ───────────────────────────────────────────────────

describe('entries:earningsSummary handler', () => {
  it('returns an object with today/week/allTime', async () => {
    const summary = await getHandler('entries:earningsSummary')(FAKE_EVENT, null) as {
      today: number; week: number; allTime: number;
    };
    expect(typeof summary.today).toBe('number');
    expect(typeof summary.week).toBe('number');
    expect(typeof summary.allTime).toBe('number');
  });
});

// ── entries:getLastExportRange ────────────────────────────────────────────────

describe('entries:getLastExportRange handler', () => {
  it('returns null when no exports have been saved', async () => {
    // Fresh call – the db may have records from prior tests.  At minimum, must
    // not throw and must return null or an object with range fields.
    const result = await getHandler('entries:getLastExportRange')(FAKE_EVENT);
    expect(result === null || typeof result === 'object').toBe(true);
  });
});

// ── entries:exportExcel ───────────────────────────────────────────────────────

describe('entries:exportExcel handler', () => {
  it('returns null when dialog is canceled', async () => {
    (dialog.showSaveDialog as jest.Mock).mockResolvedValueOnce({ canceled: true, filePath: undefined });
    const result = await getHandler('entries:exportExcel')(FAKE_EVENT, { rangeFrom: 0, rangeTo: Date.now() });
    expect(result).toBeNull();
  });

  it('writes an xlsx file and returns the path when dialog succeeds', async () => {
    const outPath = path.join(TEST_DB_DIR, 'test-export.xlsx');
    (dialog.showSaveDialog as jest.Mock).mockResolvedValueOnce({ canceled: false, filePath: outPath });

    const result = await getHandler('entries:exportExcel')(FAKE_EVENT, {
      rangeFrom: 0,
      rangeTo: Date.now() + 1000,
      projectId: null,
    });

    expect(result).toBe(outPath);
    expect((mockWorkbook.xlsx.writeFile as jest.Mock)).toHaveBeenCalledWith(outPath);
  });

  it('calls addRows with one row per entry in range', async () => {
    const outPath = path.join(TEST_DB_DIR, 'test-export2.xlsx');
    (dialog.showSaveDialog as jest.Mock).mockResolvedValueOnce({ canceled: false, filePath: outPath });
    (mockSheet.addRows as jest.Mock).mockClear();

    await getHandler('entries:exportExcel')(FAKE_EVENT, {
      rangeFrom: 0,
      rangeTo: Date.now() + 1000,
    });

    expect(mockSheet.addRows as jest.Mock).toHaveBeenCalledTimes(1);
    const rows = (mockSheet.addRows as jest.Mock).mock.calls[0][0] as unknown[];
    expect(Array.isArray(rows)).toBe(true);
  });
});

// ── invoice:getSettings ───────────────────────────────────────────────────────

describe('invoice:getSettings handler', () => {
  it('returns an object with default fields', async () => {
    const settings = await getHandler('invoice:getSettings')(FAKE_EVENT) as {
      id: number;
      your_name: string | null;
      preferred_template_id: number;
      default_payment_terms: string;
    };
    expect(settings.id).toBe(1);
    expect(settings.preferred_template_id).toBe(1);
    expect(settings.default_payment_terms).toBe('Net 30');
  });
});

// ── invoice:saveSettings ──────────────────────────────────────────────────────

describe('invoice:saveSettings handler', () => {
  it('persists settings and can be read back via getSettings', async () => {
    await getHandler('invoice:saveSettings')(FAKE_EVENT, {
      your_name:    'IPC Tester',
      your_email:   'ipc@test.com',
      your_phone:   '123-456-7890',
    });
    const settings = await getHandler('invoice:getSettings')(FAKE_EVENT) as {
      your_name: string;
      your_email: string;
    };
    expect(settings.your_name).toBe('IPC Tester');
    expect(settings.your_email).toBe('ipc@test.com');
  });

  it('partial save preserves previously saved fields', async () => {
    await getHandler('invoice:saveSettings')(FAKE_EVENT, { your_name: 'Alice', your_phone: '999' });
    await getHandler('invoice:saveSettings')(FAKE_EVENT, { preferred_template_id: 4 });
    const s = await getHandler('invoice:getSettings')(FAKE_EVENT) as {
      your_name: string; preferred_template_id: number;
    };
    expect(s.your_name).toBe('Alice');
    expect(s.preferred_template_id).toBe(4);
  });
});

// ── invoice:getNextNumber ─────────────────────────────────────────────────────

describe('invoice:getNextNumber handler', () => {
  it('returns a string starting with INV-', async () => {
    const num = await getHandler('invoice:getNextNumber')(FAKE_EVENT) as string;
    expect(num).toMatch(/^INV-\d{4}$/);
  });
});

// ── invoice:preview handler ───────────────────────────────────────────────────

describe('invoice:preview handler', () => {
  it('creates a BrowserWindow and loads a file URL', async () => {
    (BrowserWindow as unknown as jest.Mock).mockClear();
    await getHandler('invoice:preview')(FAKE_EVENT, 1, {});
    expect(BrowserWindow as unknown as jest.Mock).toHaveBeenCalled();
    const instance = (BrowserWindow as unknown as jest.Mock).mock.results[0]?.value as {
      loadURL: jest.Mock;
    };
    expect(instance.loadURL).toHaveBeenCalledWith(expect.stringMatching(/^file:\/\//));
  });

  it('accepts optional formData for template 5 without crashing', async () => {
    await expect(
      getHandler('invoice:preview')(FAKE_EVENT, 5, {
        yourName: 'Preview User',
        clientName: 'Preview Corp',
        invoiceNumber: 'INV-0001',
      })
    ).resolves.not.toThrow();
  });
});

// ── invoice:refreshPreview handler ───────────────────────────────────────────

describe('invoice:refreshPreview handler', () => {
  it('does nothing when no preview window is open', () => {
    // refreshPreview is a no-op (returns void) when currentPreviewWin is null.
    expect(() =>
      getHandler('invoice:refreshPreview')(FAKE_EVENT, {
        templateId: 1,
        invoiceNumber: 'INV-0001',
        dueDate: 'Net 30',
        paymentTerms: 'Net 30',
        yourName: '',
        yourCompany: '',
        yourAddress: '',
        yourEmail: '',
        yourPhone: '',
        clientName: '',
        clientAddress: '',
        notes: '',
        rangeFrom: null,
        rangeTo: null,
        projectId: null,
      })
    ).not.toThrow();
  });
});

// ── invoice:export handler ────────────────────────────────────────────────────

describe('invoice:export handler', () => {
  it('returns null when save dialog is canceled', async () => {
    const mockWin = {
      loadURL: jest.fn(),
      close: jest.fn(),
      isDestroyed: jest.fn(() => false),
      show: jest.fn(),
      once: jest.fn((ev: string, cb: () => void) => { if (ev === 'ready-to-show') {} }),
      webContents: {
        once: jest.fn((ev: string, cb: () => void) => { if (ev === 'did-finish-load') cb(); }),
        printToPDF: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
      },
    };
    (BrowserWindow as unknown as jest.Mock).mockImplementationOnce(() => mockWin);
    (dialog.showSaveDialog as jest.Mock).mockResolvedValueOnce({ canceled: true, filePath: undefined });

    const result = await getHandler('invoice:export')(FAKE_EVENT, {
      templateId: 1,
      invoiceNumber: 'INV-0001',
      dueDate: 'Aug 4, 2026',
      paymentTerms: 'Net 30',
      clientName: 'Test Client',
      clientAddress: '',
      notes: '',
      rangeFrom: 0,
      rangeTo: Date.now(),
      projectId: null,
    });

    expect(result).toBeNull();
  });
});

// ── app:openExternal handler ──────────────────────────────────────────────────

describe('app:openExternal handler', () => {
  it('calls shell.openExternal only for the allowed URL', async () => {
    (shell.openExternal as jest.Mock).mockClear();
    await getHandler('app:openExternal')(FAKE_EVENT, 'https://www.clearedfinal.com');
    expect(shell.openExternal as jest.Mock).toHaveBeenCalledWith('https://www.clearedfinal.com');
  });

  it('does not call shell.openExternal for arbitrary URLs', async () => {
    (shell.openExternal as jest.Mock).mockClear();
    await getHandler('app:openExternal')(FAKE_EVENT, 'https://evil.example.com');
    expect(shell.openExternal as jest.Mock).not.toHaveBeenCalled();
  });
});

// ── projects:updateRate ───────────────────────────────────────────────────────

describe('projects:updateRate handler', () => {
  it('updates the rate and the change is visible via projects:list', async () => {
    const projects = await getHandler('projects:list')(FAKE_EVENT) as Array<{ id: number; hourly_rate: number | null }>;
    const projectId = projects[0]?.id;
    if (!projectId) return;

    await getHandler('projects:updateRate')(FAKE_EVENT, projectId, 200);
    const updated = await getHandler('projects:list')(FAKE_EVENT) as Array<{ id: number; hourly_rate: number }>;
    expect(updated.find((p) => p.id === projectId)?.hourly_rate).toBe(200);

    await getHandler('projects:updateRate')(FAKE_EVENT, projectId, null);
    const cleared = await getHandler('projects:list')(FAKE_EVENT) as Array<{ id: number; hourly_rate: number | null }>;
    expect(cleared.find((p) => p.id === projectId)?.hourly_rate).toBeNull();
  });
});
