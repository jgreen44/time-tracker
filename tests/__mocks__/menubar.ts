// Mock for the 'menubar' package so main.ts can be imported in Jest without
// a real tray / BrowserWindow.

const mockTray = {
  on: jest.fn(),
  popUpContextMenu: jest.fn(),
  setToolTip: jest.fn(),
};

const mockMb = {
  on: jest.fn((event: string, cb: () => void) => {
    // Immediately fire the 'ready' event so main.ts setup code runs inline.
    if (event === 'ready') cb();
  }),
  hideWindow: jest.fn().mockResolvedValue(undefined),
  showWindow: jest.fn(),
  tray: mockTray,
  window: undefined as unknown,
};

export function menubar(_opts: unknown) {
  return mockMb;
}
