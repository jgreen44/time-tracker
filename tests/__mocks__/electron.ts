// Minimal Electron mock so src modules can be imported in a pure Node/Jest
// environment without a running Electron process.

const app = {
  getPath: jest.fn((_name: string) => '/tmp/time-tracker-test'),
  getName: jest.fn(() => 'time-tracker'),
  getVersion: jest.fn(() => '1.0.0'),
  quit: jest.fn(),
  on: jest.fn(),
  requestSingleInstanceLock: jest.fn(() => true),
};

const ipcMain = {
  handle: jest.fn(),
  on: jest.fn(),
  removeHandler: jest.fn(),
};

const dialog = {
  showSaveDialog: jest.fn(),
  showOpenDialog: jest.fn(),
};

const shell = {
  openExternal: jest.fn(),
};

const BrowserWindow = jest.fn().mockImplementation(() => ({
  loadURL: jest.fn(),
  close: jest.fn(),
  isDestroyed: jest.fn(() => false),
  show: jest.fn(),
  once: jest.fn(),
  webContents: {
    once: jest.fn(),
    printToPDF: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  },
}));

const nativeImage = {
  createFromPath: jest.fn(() => ({
    setTemplateImage: jest.fn(),
  })),
};

const Menu = {
  buildFromTemplate: jest.fn(() => ({})),
};

export { app, ipcMain, dialog, shell, BrowserWindow, nativeImage, Menu };
export default { app, ipcMain, dialog, shell, BrowserWindow, nativeImage, Menu };
