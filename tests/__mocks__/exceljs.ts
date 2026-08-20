// Minimal ExcelJS mock for Jest – keeps IPC handler tests fast and dependency-free.

const mockSheet = {
  columns: [] as unknown[],
  addRows: jest.fn(),
};

const mockWorkbook = {
  creator: '',
  created: new Date(),
  addWorksheet: jest.fn(() => mockSheet),
  xlsx: {
    writeFile: jest.fn().mockResolvedValue(undefined),
  },
};

const ExcelJS = {
  Workbook: jest.fn(() => mockWorkbook),
};

export default ExcelJS;
export { mockWorkbook, mockSheet };
