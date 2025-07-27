import { join } from 'path';
import { readFileSync } from 'fs';
import { pathsToModuleNameMapper } from 'ts-jest';

const tsConfig = JSON.parse(readFileSync(join(process.cwd(), "..", '..', 'tsconfig.json'), 'utf-8'));

export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  forceExit: true,
  verbose: true,
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/test/**/*.test.ts', '<rootDir>/test/**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: '<rootDir>/tsconfig.test.json'
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    ...pathsToModuleNameMapper(tsConfig.compilerOptions?.paths || {}, { prefix: '<rootDir>/' })
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@xec)/)'
  ]
};
