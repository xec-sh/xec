/**
 * Vitest Integration
 * Custom matchers and utilities for Vitest testing framework
 */

import { expect } from 'vitest';

import { normalizeText } from '../core/utils.js';
import { SnapshotManager } from '../snapshot/snapshot-manager.js';

import type { ScreenCapture } from '../core/types.js';

declare module 'vitest' {
  interface Assertion<T = any> {
    toMatchTerminalSnapshot(name?: string): Promise<void>;
    toContainText(text: string): void;
    toMatchPattern(pattern: RegExp): void;
    toHaveSize(cols: number, rows: number): void;
  }
  
  interface AsymmetricMatchersContaining {
    terminalSnapshot(name?: string): any;
    containingText(text: string): any;
  }
}

/**
 * Setup Vitest matchers for terminal testing
 */
export function setupVitestMatchers(snapshotManager?: SnapshotManager) {
  const manager = snapshotManager || new SnapshotManager({
    updateSnapshots: process.env.UPDATE_SNAPSHOTS === 'true',
    snapshotDir: './__snapshots__'
  });

  // Add custom matchers
  expect.extend({
    /**
     * Match terminal snapshot
     */
    async toMatchTerminalSnapshot(
      received: ScreenCapture,
      name?: string
    ) {
      const testPath = (this as any).testPath;
      const testName = (this as any).currentTestName;
      const snapshotName = name || testName || 'terminal-snapshot';
      
      const result = await manager.matchSnapshot(received, snapshotName, testPath);
      
      return {
        pass: result.pass,
        message: () => result.message || result.diff || 'Snapshot comparison failed',
        actual: received.text,
        expected: result.pass ? received.text : undefined
      };
    },

    /**
     * Check if capture contains text
     */
    toContainText(received: ScreenCapture, text: string) {
      const normalized = normalizeText(received.text, { ignoreCase: false });
      const searchText = normalizeText(text, { ignoreCase: false });
      const pass = normalized.includes(searchText);
      
      return {
        pass,
        message: () => 
          pass 
            ? `Expected screen not to contain "${text}"`
            : `Expected screen to contain "${text}"\n\nScreen content:\n${received.text}`
      };
    },

    /**
     * Match pattern in screen content
     */
    toMatchPattern(received: ScreenCapture, pattern: RegExp) {
      const pass = pattern.test(received.text);
      
      return {
        pass,
        message: () =>
          pass
            ? `Expected screen not to match pattern ${pattern}`
            : `Expected screen to match pattern ${pattern}\n\nScreen content:\n${received.text}`
      };
    },

    /**
     * Check screen size
     */
    toHaveSize(received: ScreenCapture, cols: number, rows: number) {
      const pass = received.size.cols === cols && received.size.rows === rows;
      
      return {
        pass,
        message: () =>
          pass
            ? `Expected screen not to have size ${cols}x${rows}`
            : `Expected screen to have size ${cols}x${rows}, but got ${received.size.cols}x${received.size.rows}`
      };
    }
  });

  return manager;
}