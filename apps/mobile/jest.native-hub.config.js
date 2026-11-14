const base = require('./jest.config');
module.exports = {
  ...base,
  testEnvironment: 'node',
  setupFilesAfterEnv: [],
  testMatch: ['<rootDir>/__integration__/**/*.test.ts'],
  testTimeout: 30000,
  forceExit: true,
  collectCoverageFrom: [],
};
