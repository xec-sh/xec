import { it, vi, expect, describe, beforeEach } from 'vitest';

import { SnapshotManager } from '../src/snapshot/snapshot-manager.js';

import type { RuntimeAdapter } from '../src/adapters/index.js';

// Create mock adapter
const mockAdapter: RuntimeAdapter = {
  exec: vi.fn(),
  commandExists: vi.fn(),
  tryExec: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  exists: vi.fn()
};

// Mock the adapters module
vi.mock('../src/adapters/index.js', () => ({
  getAdapter: () => mockAdapter
}));

describe('SnapshotManager configure method', () => {
  let manager: SnapshotManager;

  beforeEach(() => {
    // Reset mock implementation
    vi.clearAllMocks();
    (mockAdapter.exec as any).mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    (mockAdapter.commandExists as any).mockResolvedValue(true);
    (mockAdapter.tryExec as any).mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    (mockAdapter.mkdir as any).mockResolvedValue(undefined);
    (mockAdapter.writeFile as any).mockResolvedValue(undefined);
    (mockAdapter.readFile as any).mockResolvedValue('');
    (mockAdapter.exists as any).mockResolvedValue(false);
    
    manager = new SnapshotManager();
  });

  it('should configure updateSnapshots option', () => {
    expect((manager as any).options.updateSnapshots).toBe(false);
    
    manager.configure({ updateSnapshots: true });
    
    expect((manager as any).options.updateSnapshots).toBe(true);
  });

  it('should configure snapshotDir option', () => {
    expect((manager as any).options.snapshotDir).toBe('./__snapshots__');
    expect((manager as any).snapshotDir).toBe('./__snapshots__');
    
    manager.configure({ snapshotDir: './test-snapshots' });
    
    expect((manager as any).options.snapshotDir).toBe('./test-snapshots');
    expect((manager as any).snapshotDir).toBe('./test-snapshots');
  });

  it('should configure format option', () => {
    expect((manager as any).options.format).toBe('text');
    
    manager.configure({ format: 'json' });
    
    expect((manager as any).options.format).toBe('json');
  });

  it('should configure diffOptions', () => {
    manager.configure({ 
      diffOptions: { 
        ignoreCase: true,
        ignoreWhitespace: true 
      } 
    });
    
    expect((manager as any).options.diffOptions).toEqual({
      ignoreCase: true,
      ignoreWhitespace: true
    });
  });

  it('should configure stripAnsi as ignoreAnsi in diffOptions', () => {
    manager.configure({ stripAnsi: true });
    
    expect((manager as any).options.diffOptions.ignoreAnsi).toBe(true);
  });

  it('should configure trim as ignoreWhitespace in diffOptions', () => {
    manager.configure({ trim: true });
    
    expect((manager as any).options.diffOptions.ignoreWhitespace).toBe(true);
  });

  it('should handle partial configuration updates', () => {
    manager.configure({ updateSnapshots: true });
    manager.configure({ snapshotDir: './custom' });
    manager.configure({ format: 'ansi' });
    
    const options = (manager as any).options;
    
    expect(options.updateSnapshots).toBe(true);
    expect(options.snapshotDir).toBe('./custom');
    expect(options.format).toBe('ansi');
  });

  it('should not override unspecified options', () => {
    manager.configure({ 
      updateSnapshots: true,
      snapshotDir: './test',
      format: 'json'
    });
    
    manager.configure({ updateSnapshots: false });
    
    const options = (manager as any).options;
    
    expect(options.updateSnapshots).toBe(false);
    expect(options.snapshotDir).toBe('./test');
    expect(options.format).toBe('json');
  });

  it('should handle both stripAnsi and trim together', () => {
    manager.configure({ 
      stripAnsi: true,
      trim: true 
    });
    
    const diffOptions = (manager as any).options.diffOptions;
    
    expect(diffOptions.ignoreAnsi).toBe(true);
    expect(diffOptions.ignoreWhitespace).toBe(true);
  });

  it('should be chainable for multiple configurations', () => {
    // Create initial manager
    const manager1 = new SnapshotManager({ 
      snapshotDir: './initial' 
    });
    
    // Configure multiple times
    manager1.configure({ updateSnapshots: true });
    manager1.configure({ format: 'ansi' });
    manager1.configure({ stripAnsi: true });
    
    const options = (manager1 as any).options;
    
    expect(options.snapshotDir).toBe('./initial');
    expect(options.updateSnapshots).toBe(true);
    expect(options.format).toBe('ansi');
    expect(options.diffOptions.ignoreAnsi).toBe(true);
  });
});