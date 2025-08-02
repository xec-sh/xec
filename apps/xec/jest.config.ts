import { join } from 'path';
import { readFileSync } from 'fs';
import { pathsToModuleNameMapper } from 'ts-jest';

const tsConfig = JSON.parse(readFileSync(join(process.cwd(), 'tsconfig.test.json'), 'utf-8'));

export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testEnvironmentOptions: {
    env: {
      NODE_ENV: 'test'
    }
  },
  verbose: true,
  clearMocks: true,
  forceExit: true,
  maxWorkers: 1, // Run tests sequentially to avoid interference
  collectCoverage: false, // Disable for now due to import.meta issues
  coverageDirectory: 'coverage',
  moduleFileExtensions: ['ts', 'js', 'json', 'mjs'],
  testMatch: [
    '<rootDir>/test/**/*.test.ts',
    '<rootDir>/test/**/*.spec.ts',
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/__tests__/**/*.spec.ts'
  ],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.test.json'
    }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    ...pathsToModuleNameMapper(tsConfig.compilerOptions?.paths || {}, { prefix: '<rootDir>/' })
  },
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))'
  ],
  resolver: undefined
};
