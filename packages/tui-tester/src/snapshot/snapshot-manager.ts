/**
 * Snapshot Manager
 * Manages terminal screen snapshots for testing
 */

import { getAdapter } from '../adapters/index.js';
import { screenDiff, normalizeText, compareScreens } from '../core/utils.js';

import type { RuntimeAdapter } from '../adapters/index.js';
import type { Snapshot, ScreenCapture, AssertionOptions } from '../core/types.js';

export interface SnapshotOptions {
  updateSnapshots?: boolean;
  snapshotDir?: string;
  diffOptions?: AssertionOptions;
  format?: 'json' | 'text' | 'ansi';
}

export class SnapshotManager {
  private adapter: RuntimeAdapter;
  private options: Required<SnapshotOptions>;
  private snapshots: Map<string, Snapshot> = new Map();
  private snapshotCounter: number = 0;
  private snapshotDir: string;

  constructor(snapshotDir?: string | SnapshotOptions) {
    this.adapter = getAdapter();

    // Handle both old and new constructor signatures
    if (typeof snapshotDir === 'string') {
      this.snapshotDir = snapshotDir;
      this.options = {
        updateSnapshots: false,
        snapshotDir,
        diffOptions: {},
        format: 'text'
      };
    } else {
      const options = snapshotDir || {};
      this.snapshotDir = options.snapshotDir ?? './__snapshots__';
      this.options = {
        updateSnapshots: options.updateSnapshots ?? false,
        snapshotDir: this.snapshotDir,
        diffOptions: options.diffOptions ?? {},
        format: options.format ?? 'text'
      };
    }
  }

  /**
   * Configure the snapshot manager
   */
  configure(options: Partial<SnapshotOptions> & {
    stripAnsi?: boolean;
    trim?: boolean;
  }): void {
    if (options.updateSnapshots !== undefined) {
      this.options.updateSnapshots = options.updateSnapshots;
    }
    if (options.snapshotDir !== undefined) {
      this.options.snapshotDir = options.snapshotDir;
      this.snapshotDir = options.snapshotDir;
    }
    if (options.diffOptions !== undefined) {
      this.options.diffOptions = options.diffOptions;
    }
    if (options.format !== undefined) {
      this.options.format = options.format;
    }

    // Add stripAnsi and trim to diffOptions if provided
    if (options.stripAnsi !== undefined && this.options.diffOptions) {
      this.options.diffOptions.ignoreAnsi = options.stripAnsi;
    }
    if (options.trim !== undefined && this.options.diffOptions) {
      this.options.diffOptions.ignoreWhitespace = options.trim;
    }
  }

  /**
   * Create a snapshot from screen capture
   */
  createSnapshot(capture: ScreenCapture, name?: string): Snapshot {
    const snapshotName = name || `snapshot-${++this.snapshotCounter}`;

    const snapshot: Snapshot = {
      id: this.generateSnapshotId(snapshotName),
      name: snapshotName,
      capture,
      metadata: {
        createdAt: Date.now(),
        format: this.options.format
      }
    };

    this.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  /**
   * Match a capture against a snapshot
   */
  async matchSnapshot(
    capture: ScreenCapture,
    snapshotName: string,
    testPath?: string
  ): Promise<{ pass: boolean; message?: string; diff?: string }> {
    const snapshotPath = this.getSnapshotPath(snapshotName, testPath);

    try {
      // Try to load existing snapshot
      const existingSnapshot = await this.loadSnapshot(snapshotPath);

      // Compare captures
      const pass = this.compareCaptures(capture, existingSnapshot.capture);

      if (!pass) {
        const diff = this.generateDiff(capture, existingSnapshot.capture);
        return {
          pass: false,
          message: `Snapshot mismatch for "${snapshotName}"`,
          diff
        };
      }

      return { pass: true };
    } catch (error) {
      // Snapshot doesn't exist
      if (this.options.updateSnapshots) {
        // Create new snapshot
        const snapshot = this.createSnapshot(capture, snapshotName);
        await this.saveSnapshot(snapshot, snapshotPath);

        return {
          pass: true,
          message: `New snapshot created for "${snapshotName}"`
        };
      } else {
        return {
          pass: false,
          message: `Snapshot "${snapshotName}" does not exist. Run with updateSnapshots=true to create it.`
        };
      }
    }
  }

  /**
   * Compare two screen captures
   */
  compareCaptures(actual: ScreenCapture, expected: ScreenCapture): boolean {
    // Compare based on format
    switch (this.options.format) {
      case 'ansi':
        return compareScreens(actual.raw, expected.raw, this.options.diffOptions);

      case 'text':
        return compareScreens(actual.text, expected.text, this.options.diffOptions);

      case 'json':
      default:
        // Compare normalized text for JSON format
        {
          const actualNorm = normalizeText(actual.text, this.options.diffOptions);
          const expectedNorm = normalizeText(expected.text, this.options.diffOptions);
          return actualNorm === expectedNorm;
        }
    }
  }

  /**
   * Generate diff between captures
   */
  generateDiff(actual: ScreenCapture, expected: ScreenCapture): string {
    const actualText = this.options.format === 'ansi' ? actual.raw : actual.text;
    const expectedText = this.options.format === 'ansi' ? expected.raw : expected.text;

    return screenDiff(actualText, expectedText);
  }

  /**
   * Save snapshot to file
   */
  async saveSnapshot(snapshot: Snapshot, path?: string): Promise<void> {
    const snapshotPath = path || this.getSnapshotPath(snapshot.name);

    // Ensure directory exists
    const dir = snapshotPath.substring(0, snapshotPath.lastIndexOf('/'));
    await this.adapter.mkdir(dir, { recursive: true });

    // Prepare snapshot data based on format
    let content: string;

    switch (this.options.format) {
      case 'text':
        content = snapshot.capture.text;
        break;

      case 'ansi':
        content = snapshot.capture.raw;
        break;

      case 'json':
      default:
        content = JSON.stringify(snapshot, null, 2);
        break;
    }

    await this.adapter.writeFile(snapshotPath, content);
  }

  /**
   * Load snapshot from file
   */
  async loadSnapshot(path: string): Promise<Snapshot> {
    const content = await this.adapter.readFile(path);

    let snapshot: Snapshot;

    switch (this.options.format) {
      case 'text':
      case 'ansi':
        // Reconstruct snapshot from text/ansi content
        const lines = content.split('\n');
        snapshot = {
          id: path,
          name: path.substring(path.lastIndexOf('/') + 1),
          capture: {
            raw: this.options.format === 'ansi' ? content : '',
            text: this.options.format === 'text' ? content : '',
            lines,
            timestamp: 0,
            size: { cols: 0, rows: lines.length }
          }
        };
        break;

      case 'json':
      default:
        snapshot = JSON.parse(content);
        break;
    }

    this.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  /**
   * Update existing snapshot
   */
  async updateSnapshot(snapshotName: string, capture: ScreenCapture, testPath?: string): Promise<void> {
    const snapshot = this.createSnapshot(capture, snapshotName);
    const snapshotPath = this.getSnapshotPath(snapshotName, testPath);
    await this.saveSnapshot(snapshot, snapshotPath);
  }

  /**
   * Remove snapshot
   */
  async removeSnapshot(snapshotName: string, testPath?: string): Promise<void> {
    const snapshotPath = this.getSnapshotPath(snapshotName, testPath);

    // Remove from memory
    const snapshot = Array.from(this.snapshots.values())
      .find(s => s.name === snapshotName);

    if (snapshot) {
      this.snapshots.delete(snapshot.id);
    }

    // Remove file if exists
    if (await this.adapter.exists(snapshotPath)) {
      await this.adapter.exec(`rm "${snapshotPath}"`);
    }
  }

  /**
   * List all snapshots
   */
  async listSnapshots(): Promise<string[]> {
    const extension = this.getFileExtension();
    const result = await this.adapter.exec(
      `find "${this.options.snapshotDir}" -name "*${extension}" 2>/dev/null || true`
    );

    return result.stdout
      .split('\n')
      .filter(line => line.trim())
      .map(path => path.substring(path.lastIndexOf('/') + 1));
  }

  /**
   * Clear all snapshots
   */
  async clearSnapshots(): Promise<void> {
    this.snapshots.clear();

    if (await this.adapter.exists(this.options.snapshotDir)) {
      await this.adapter.exec(`rm -rf "${this.options.snapshotDir}"`);
    }
  }

  /**
   * Get snapshot by name
   */
  getSnapshot(name: string): Snapshot | undefined {
    return Array.from(this.snapshots.values())
      .find(s => s.name === name);
  }

  /**
   * Check if snapshot exists
   */
  async snapshotExists(snapshotName: string, testPath?: string): Promise<boolean> {
    const snapshotPath = this.getSnapshotPath(snapshotName, testPath);
    return this.adapter.exists(snapshotPath);
  }

  // Simple API methods for backward compatibility

  /**
   * Save a simple text snapshot
   */
  async save(name: string, content: string): Promise<void> {
    const sanitizedName = this.sanitizeName(name);
    const filePath = `${this.snapshotDir}/${sanitizedName}.snap`;

    // Ensure directory exists
    await this.adapter.mkdir(this.snapshotDir, { recursive: true });
    await this.adapter.writeFile(filePath, content);
  }

  /**
   * Load a simple text snapshot
   */
  async load(name: string): Promise<string | null> {
    try {
      const sanitizedName = this.sanitizeName(name);
      const filePath = `${this.snapshotDir}/${sanitizedName}.snap`;
      return await this.adapter.readFile(filePath);
    } catch (error) {
      return null;
    }
  }

  /**
   * Compare two snapshots
   */
  async compare(name1: string, name2: string): Promise<{
    identical: boolean;
    differences: Array<{ line: number; expected?: string; actual?: string }>;
    error?: string;
  }> {
    const content1 = await this.load(name1);
    const content2 = await this.load(name2);

    if (content1 === null || content2 === null) {
      return {
        identical: false,
        differences: [],
        error: `Snapshot does not exist: ${content1 === null ? name1 : name2}`
      };
    }

    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');
    const differences: Array<{ line: number; expected?: string; actual?: string }> = [];
    const maxLines = Math.max(lines1.length, lines2.length);

    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i];
      const line2 = lines2[i];

      if (line1 !== line2) {
        differences.push({
          line: i + 1,
          expected: line1,
          actual: line2
        });
      }
    }

    return {
      identical: differences.length === 0,
      differences
    };
  }

  /**
   * Compare with options
   */
  async compareWithOptions(name1: string, name2: string, options: {
    ignoreWhitespace?: boolean;
    ignoreAnsi?: boolean;
  }): Promise<{ identical: boolean; match?: boolean; diff?: string }> {
    const content1 = await this.load(name1);
    const content2 = await this.load(name2);

    if (content1 === null || content2 === null) {
      return { identical: false, match: false, diff: `Snapshot does not exist: ${content1 === null ? name1 : name2}` };
    }

    let normalized1 = content1;
    let normalized2 = content2;

    if (options.ignoreWhitespace) {
      normalized1 = normalized1.replace(/\s+/g, ' ').trim();
      normalized2 = normalized2.replace(/\s+/g, ' ').trim();
    }

    if (options.ignoreAnsi) {
      // Remove ANSI escape codes
      const ansiRegex = /\x1b\[[0-9;]*m/g;
      normalized1 = normalized1.replace(ansiRegex, '');
      normalized2 = normalized2.replace(ansiRegex, '');
    }

    const match = normalized1 === normalized2;

    if (!match) {
      const diff = this.createDiff(normalized2, normalized1);
      return { identical: false, match: false, diff };
    }

    return { identical: true, match: true };
  }

  /**
   * Delete a snapshot
   */
  async delete(name: string): Promise<boolean> {
    try {
      const sanitizedName = this.sanitizeName(name);
      const filePath = `${this.snapshotDir}/${sanitizedName}.snap`;

      if (await this.adapter.exists(filePath)) {
        await this.adapter.exec(`rm "${filePath}"`);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete all snapshots
   */
  async deleteAll(): Promise<void> {
    try {
      if (await this.adapter.exists(this.snapshotDir)) {
        await this.adapter.exec(`rm -rf "${this.snapshotDir}"`);
        // Recreate the directory to ensure list() works
        await this.adapter.mkdir(this.snapshotDir, { recursive: true });
      }
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * List all snapshot names
   */
  async list(pattern?: string): Promise<string[]> {
    try {
      // Check if directory exists first
      if (!await this.adapter.exists(this.snapshotDir)) {
        return [];
      }

      const result = await this.adapter.exec(
        `find "${this.snapshotDir}" -name "*.snap" 2>/dev/null || true`
      );

      const files = result.stdout
        .split('\n')
        .filter(line => line.trim() && line.endsWith('.snap'))
        .map(path => {
          const filename = path.substring(path.lastIndexOf('/') + 1);
          return filename.replace('.snap', '');
        });

      if (pattern) {
        const regex = new RegExp(pattern);
        return files.filter(name => regex.test(name));
      }

      return files;
    } catch (error) {
      return [];
    }
  }

  /**
   * List by pattern (alias for list with pattern)
   */
  async listByPattern(pattern: string): Promise<string[]> {
    return this.list(pattern);
  }

  /**
   * Check if update is needed
   */
  async needsUpdate(name: string, content: string): Promise<boolean> {
    const existing = await this.load(name);

    if (existing === null) {
      return true; // Snapshot doesn't exist, needs creation
    }

    return existing !== content;
  }

  /**
   * Save with metadata
   */
  async saveWithMetadata(name: string, content: string, metadata?: any): Promise<void> {
    const data = JSON.stringify({
      content,
      metadata: {
        ...metadata,
        timestamp: Date.now()
      }
    }, null, 2);

    const sanitizedName = this.sanitizeName(name);
    const filePath = `${this.snapshotDir}/${sanitizedName}.snap`;

    await this.adapter.mkdir(this.snapshotDir, { recursive: true });
    await this.adapter.writeFile(filePath, data);
  }

  /**
   * Load with metadata
   */
  async loadWithMetadata(name: string): Promise<{ content: string; metadata?: any } | null> {
    try {
      const sanitizedName = this.sanitizeName(name);
      const filePath = `${this.snapshotDir}/${sanitizedName}.snap`;
      const data = await this.adapter.readFile(filePath);

      try {
        const parsed = JSON.parse(data);
        if (parsed.content !== undefined) {
          return parsed;
        }
        // Plain text snapshot
        return { content: data };
      } catch {
        // Not JSON, treat as plain text
        return { content: data };
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Format snapshot for display
   */
  async format(name: string): Promise<string | null> {
    const content = await this.load(name);
    if (!content) return null;

    const lines = content.split('\n');
    return lines.map((line, i) => `${i + 1}: ${line}`).join('\n');
  }

  /**
   * Format with options
   */
  async formatWithOptions(name: string, options: { lineNumbers?: boolean; colors?: boolean }): Promise<string | null> {
    const content = await this.load(name);
    if (!content) return null;

    const lines = content.split('\n');

    if (options.lineNumbers) {
      return lines.map((line, i) => `${(i + 1).toString().padStart(3, ' ')} | ${line}`).join('\n');
    }

    return content;
  }

  /**
   * Generate unified diff between two snapshots
   */
  async diff(name1: string, name2: string): Promise<string | null> {
    const content1 = await this.load(name1);
    const content2 = await this.load(name2);

    if (!content1 || !content2) {
      return null;
    }

    return this.createDiff(content1, content2);
  }

  /**
   * Sanitize snapshot name
   */
  private sanitizeName(name: string): string {
    // Preserve some uniqueness when sanitizing
    return name
      .replace(/\//g, '_slash_')
      .replace(/\.\./g, '_dot_')
      .replace(/\s+/g, '_space_')
      .replace(/[^a-zA-Z0-9-_]/g, '');
  }

  /**
   * Create a simple diff
   */
  private createDiff(expected: string, actual: string): string {
    const expectedLines = expected.split('\n');
    const actualLines = actual.split('\n');
    const maxLines = Math.max(expectedLines.length, actualLines.length);
    const diff: string[] = [];

    for (let i = 0; i < maxLines; i++) {
      const expectedLine = expectedLines[i];
      const actualLine = actualLines[i];

      if (expectedLine !== actualLine) {
        if (expectedLine !== undefined) {
          diff.push(`-${expectedLine}`);
        }
        if (actualLine !== undefined) {
          diff.push(`+${actualLine}`);
        }
      }
    }

    return diff.join('\n');
  }

  // Private helper methods

  private generateSnapshotId(name: string): string {
    return `${name}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private getSnapshotPath(snapshotName: string, testPath?: string): string {
    const extension = this.getFileExtension();

    if (testPath) {
      // Use test file path to organize snapshots
      const testDir = testPath.substring(0, testPath.lastIndexOf('/'));
      const testFile = testPath.substring(testPath.lastIndexOf('/') + 1);
      const testName = testFile.replace(/\.(test|spec)\.(ts|js)$/, '');

      return `${testDir}/__snapshots__/${testName}.${snapshotName}${extension}`;
    } else {
      return `${this.options.snapshotDir}/${snapshotName}${extension}`;
    }
  }

  private getFileExtension(): string {
    switch (this.options.format) {
      case 'text':
        return '.txt';
      case 'ansi':
        return '.ansi';
      case 'json':
      default:
        return '.json';
    }
  }
}

/**
 * Global snapshot manager instance
 */
let globalSnapshotManager: SnapshotManager | null = null;

/**
 * Get or create global snapshot manager
 */
export function getSnapshotManager(options?: SnapshotOptions): SnapshotManager {
  if (!globalSnapshotManager) {
    globalSnapshotManager = new SnapshotManager(options);
  } else if (options) {
    // If options are provided and manager exists, configure it
    globalSnapshotManager.configure(options);
  }
  return globalSnapshotManager;
}

/**
 * Reset global snapshot manager
 */
export function resetSnapshotManager(): void {
  globalSnapshotManager = null;
}