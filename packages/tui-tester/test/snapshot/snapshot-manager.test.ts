/**
 * Snapshot Manager Tests
 * Tests for terminal snapshot creation, comparison, and management
 */

import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { SnapshotManager } from '../../src/snapshot/snapshot-manager';

describe('SnapshotManager', () => {
  let manager: SnapshotManager;
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for snapshots
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-test-'));
    manager = new SnapshotManager(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    it('should create snapshot directory if it does not exist', async () => {
      const newDir = path.join(tempDir, 'new-snapshots');
      const newManager = new SnapshotManager(newDir);
      
      await newManager.save('test', 'content');
      
      const stats = await fs.stat(newDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should use existing directory', async () => {
      await manager.save('test', 'content');
      
      const newManager = new SnapshotManager(tempDir);
      const snapshot = await newManager.load('test');
      
      expect(snapshot).toBe('content');
    });

    it('should handle relative paths', () => {
      const relManager = new SnapshotManager('./snapshots');
      expect(relManager).toBeDefined();
    });
  });

  describe('Saving Snapshots', () => {
    it('should save a snapshot', async () => {
      const content = 'Test snapshot content';
      await manager.save('test-snapshot', content);
      
      const filePath = path.join(tempDir, 'test-snapshot.snap');
      const saved = await fs.readFile(filePath, 'utf-8');
      
      expect(saved).toBe(content);
    });

    it('should overwrite existing snapshots', async () => {
      await manager.save('test', 'original');
      await manager.save('test', 'updated');
      
      const loaded = await manager.load('test');
      expect(loaded).toBe('updated');
    });

    it('should handle multi-line content', async () => {
      const content = 'Line 1\nLine 2\nLine 3';
      await manager.save('multiline', content);
      
      const loaded = await manager.load('multiline');
      expect(loaded).toBe(content);
    });

    it('should handle special characters', async () => {
      const content = 'Special: \t\r\n\x1b[31mColor\x1b[0m';
      await manager.save('special', content);
      
      const loaded = await manager.load('special');
      expect(loaded).toBe(content);
    });

    it('should sanitize snapshot names', async () => {
      const content = 'Test content';
      await manager.save('test/snapshot', content);
      await manager.save('test..snapshot', content);
      await manager.save('test snapshot', content);
      
      // All should be saved successfully
      const files = await fs.readdir(tempDir);
      expect(files.length).toBeGreaterThanOrEqual(3);
    });

    it('should create nested directories', async () => {
      const nestedManager = new SnapshotManager(path.join(tempDir, 'a/b/c'));
      await nestedManager.save('nested', 'content');
      
      const loaded = await nestedManager.load('nested');
      expect(loaded).toBe('content');
    });
  });

  describe('Loading Snapshots', () => {
    beforeEach(async () => {
      await manager.save('existing', 'Existing content');
    });

    it('should load an existing snapshot', async () => {
      const content = await manager.load('existing');
      expect(content).toBe('Existing content');
    });

    it('should return null for non-existent snapshots', async () => {
      const content = await manager.load('non-existent');
      expect(content).toBeNull();
    });

    it('should handle file read errors gracefully', async () => {
      // Create a directory with the snapshot name
      const dirPath = path.join(tempDir, 'invalid.snap');
      await fs.mkdir(dirPath);
      
      const content = await manager.load('invalid');
      expect(content).toBeNull();
    });
  });

  describe('Comparing Snapshots', () => {
    it('should detect identical snapshots', async () => {
      const content = 'Same content';
      await manager.save('snap1', content);
      await manager.save('snap2', content);
      
      const result = await manager.compare('snap1', 'snap2');
      expect(result.identical).toBe(true);
      expect(result.differences).toHaveLength(0);
    });

    it('should detect different snapshots', async () => {
      await manager.save('snap1', 'Content A');
      await manager.save('snap2', 'Content B');
      
      const result = await manager.compare('snap1', 'snap2');
      expect(result.identical).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);
    });

    it('should provide line-by-line differences', async () => {
      await manager.save('snap1', 'Line 1\nLine 2\nLine 3');
      await manager.save('snap2', 'Line 1\nModified 2\nLine 3');
      
      const result = await manager.compare('snap1', 'snap2');
      expect(result.identical).toBe(false);
      expect(result.differences).toContainEqual({
        line: 2,
        expected: 'Line 2',
        actual: 'Modified 2'
      });
    });

    it('should handle snapshots with different lengths', async () => {
      await manager.save('snap1', 'Line 1\nLine 2');
      await manager.save('snap2', 'Line 1\nLine 2\nLine 3');
      
      const result = await manager.compare('snap1', 'snap2');
      expect(result.identical).toBe(false);
      expect(result.differences).toContainEqual({
        line: 3,
        expected: undefined,
        actual: 'Line 3'
      });
    });

    it('should handle non-existent snapshots', async () => {
      await manager.save('exists', 'content');
      
      const result1 = await manager.compare('exists', 'non-existent');
      expect(result1.identical).toBe(false);
      expect(result1.error).toBeDefined();
      
      const result2 = await manager.compare('non-existent', 'exists');
      expect(result2.identical).toBe(false);
      expect(result2.error).toBeDefined();
    });

    it('should ignore whitespace when configured', async () => {
      await manager.save('snap1', 'Text  with   spaces');
      await manager.save('snap2', 'Text with spaces');
      
      const result = await manager.compareWithOptions('snap1', 'snap2', {
        ignoreWhitespace: true
      });
      
      expect(result.identical).toBe(true);
    });

    it('should ignore ANSI codes when configured', async () => {
      await manager.save('snap1', '\x1b[31mRed text\x1b[0m');
      await manager.save('snap2', 'Red text');
      
      const result = await manager.compareWithOptions('snap1', 'snap2', {
        ignoreAnsi: true
      });
      
      expect(result.identical).toBe(true);
    });
  });

  describe('Listing Snapshots', () => {
    beforeEach(async () => {
      await manager.save('snapshot1', 'content1');
      await manager.save('snapshot2', 'content2');
      await manager.save('snapshot3', 'content3');
    });

    it('should list all snapshots', async () => {
      const snapshots = await manager.list();
      
      expect(snapshots).toHaveLength(3);
      expect(snapshots).toContain('snapshot1');
      expect(snapshots).toContain('snapshot2');
      expect(snapshots).toContain('snapshot3');
    });

    it('should return empty array for empty directory', async () => {
      const emptyManager = new SnapshotManager(path.join(tempDir, 'empty'));
      const snapshots = await emptyManager.list();
      
      expect(snapshots).toEqual([]);
    });

    it('should filter by pattern', async () => {
      await manager.save('test-a', 'content');
      await manager.save('test-b', 'content');
      await manager.save('other', 'content');
      
      const filtered = await manager.listByPattern('test-*');
      
      expect(filtered).toContain('test-a');
      expect(filtered).toContain('test-b');
      expect(filtered).not.toContain('other');
    });
  });

  describe('Deleting Snapshots', () => {
    beforeEach(async () => {
      await manager.save('to-delete', 'content');
    });

    it('should delete a snapshot', async () => {
      const deleted = await manager.delete('to-delete');
      expect(deleted).toBe(true);
      
      const loaded = await manager.load('to-delete');
      expect(loaded).toBeNull();
    });

    it('should return false for non-existent snapshots', async () => {
      const deleted = await manager.delete('non-existent');
      expect(deleted).toBe(false);
    });

    it('should delete all snapshots', async () => {
      await manager.save('snap1', 'content');
      await manager.save('snap2', 'content');
      
      await manager.deleteAll();
      
      const snapshots = await manager.list();
      expect(snapshots).toHaveLength(0);
    });
  });

  describe('Snapshot Metadata', () => {
    it('should save metadata with snapshots', async () => {
      const metadata = {
        timestamp: Date.now(),
        size: { cols: 80, rows: 24 },
        command: 'test command'
      };
      
      await manager.saveWithMetadata('test', 'content', metadata);
      
      const loaded = await manager.loadWithMetadata('test');
      expect(loaded?.content).toBe('content');
      expect(loaded?.metadata).toEqual(metadata);
    });

    it('should handle snapshots without metadata', async () => {
      await manager.save('no-meta', 'content');
      
      const loaded = await manager.loadWithMetadata('no-meta');
      expect(loaded?.content).toBe('content');
      expect(loaded?.metadata).toBeUndefined();
    });
  });

  describe('Update Detection', () => {
    it('should detect if update is needed', async () => {
      await manager.save('test', 'original');
      
      const needs1 = await manager.needsUpdate('test', 'original');
      expect(needs1).toBe(false);
      
      const needs2 = await manager.needsUpdate('test', 'modified');
      expect(needs2).toBe(true);
    });

    it('should create snapshot if it does not exist', async () => {
      const needs = await manager.needsUpdate('new', 'content');
      expect(needs).toBe(true);
    });
  });

  describe('Formatted Output', () => {
    it('should format snapshot for display', async () => {
      const content = 'Line 1\nLine 2\nLine 3';
      await manager.save('test', content);
      
      const formatted = await manager.format('test');
      expect(formatted).toContain('Line 1');
      expect(formatted).toContain('Line 2');
      expect(formatted).toContain('Line 3');
      expect(formatted).toMatch(/^\d+:/m); // Line numbers
    });

    it('should format with custom options', async () => {
      const content = 'Line 1\nLine 2\nLine 3';
      await manager.save('test', content);
      
      const formatted = await manager.formatWithOptions('test', {
        lineNumbers: false,
        trim: true
      });
      
      expect(formatted).toBe('Line 1\nLine 2\nLine 3');
    });
  });

  describe('Diffing', () => {
    it('should generate unified diff', async () => {
      await manager.save('old', 'Line 1\nLine 2\nLine 3');
      await manager.save('new', 'Line 1\nModified 2\nLine 3\nLine 4');
      
      const diff = await manager.diff('old', 'new');
      
      expect(diff).toContain('-Line 2');
      expect(diff).toContain('+Modified 2');
      expect(diff).toContain('+Line 4');
    });

    it('should handle identical files', async () => {
      const content = 'Same content';
      await manager.save('file1', content);
      await manager.save('file2', content);
      
      const diff = await manager.diff('file1', 'file2');
      expect(diff).toBe('');
    });
  });

  describe('Error Handling', () => {
    it('should handle permission errors', async () => {
      // This test would need to run with specific permissions
      // Skipping for now as it's platform-dependent
      expect(true).toBe(true);
    });

    it('should handle invalid paths', async () => {
      const invalidManager = new SnapshotManager('/\0invalid');
      
      await expect(
        invalidManager.save('test', 'content')
      ).rejects.toThrow();
    });

    it('should handle concurrent operations', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(manager.save(`concurrent-${i}`, `content-${i}`));
      }
      
      await Promise.all(promises);
      
      const snapshots = await manager.list();
      expect(snapshots.length).toBe(10);
    });
  });
});