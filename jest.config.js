/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^electron$':  '<rootDir>/tests/__mocks__/electron.ts',
    '^menubar$':   '<rootDir>/tests/__mocks__/menubar.ts',
    '^exceljs$':   '<rootDir>/tests/__mocks__/exceljs.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
