import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { TmuxTester } from '../src/tmux-tester.js';

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

// Create mock snapshot manager
const mockSnapshotManager = {
  load: vi.fn(),
  save: vi.fn()
};

// Mock the adapters module
vi.mock('../src/adapters/index.js', () => ({
  getAdapter: () => mockAdapter
}));

// Mock the snapshot manager module
vi.mock('../src/snapshot/snapshot-manager.js', () => ({
  getSnapshotManager: () => mockSnapshotManager
}));

describe('Screen Methods', () => {
  let tester: TmuxTester;
  let execSpy: any;

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
    
    execSpy = mockAdapter.exec as any;
    
    tester = new TmuxTester({
      command: ['test'],
      sessionName: 'test-session'
    });
    
    // Mark as running
    (tester as any).running = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getScreen with options', () => {
    const screenWithAnsi = '\x1b[31mRed Text\x1b[0m\nNormal Text';
    const screenWithoutAnsi = 'Red Text\nNormal Text';

    beforeEach(() => {
      execSpy.mockImplementation((cmd: string) => {
        if (cmd.includes('capture-pane')) {
          return Promise.resolve({
            code: 0,
            stdout: screenWithAnsi,
            stderr: ''
          });
        }
        return Promise.resolve({ code: 0, stdout: '', stderr: '' });
      });
    });

    it('should return raw screen with ANSI codes by default', async () => {
      const screen = await tester.getScreen();
      
      expect(screen).toContain('\x1b[31m');
      expect(screen).toBe(screenWithAnsi);
    });

    it('should strip ANSI codes when stripAnsi is true', async () => {
      const screen = await tester.getScreen({ stripAnsi: true });
      
      expect(screen).not.toContain('\x1b[31m');
      expect(screen).toBe(screenWithoutAnsi);
    });
  });

  describe('getLines method', () => {
    it('should return screen lines', async () => {
      execSpy.mockImplementation((cmd: string) => {
        if (cmd.includes('capture-pane')) {
          return Promise.resolve({
            code: 0,
            stdout: 'Line 1\nLine 2\nLine 3',
            stderr: ''
          });
        }
        return Promise.resolve({ code: 0, stdout: '', stderr: '' });
      });
      
      const lines = await tester.getLines();
      
      expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should be an alias for getScreenLines', async () => {
      execSpy.mockImplementation((cmd: string) => {
        if (cmd.includes('capture-pane')) {
          return Promise.resolve({
            code: 0,
            stdout: 'Test Line',
            stderr: ''
          });
        }
        return Promise.resolve({ code: 0, stdout: '', stderr: '' });
      });
      
      const lines1 = await tester.getLines();
      const lines2 = await tester.getScreenLines();
      
      expect(lines1).toEqual(lines2);
    });
  });

  describe('assertLine method', () => {
    beforeEach(() => {
      execSpy.mockImplementation((cmd: string) => {
        if (cmd.includes('capture-pane')) {
          return Promise.resolve({
            code: 0,
            stdout: 'First line\nSecond line\nThird line',
            stderr: ''
          });
        }
        return Promise.resolve({ code: 0, stdout: '', stderr: '' });
      });
    });

    it('should assert line contains text', async () => {
      await expect(tester.assertLine(0, 'First')).resolves.not.toThrow();
      await expect(tester.assertLine(1, 'Second')).resolves.not.toThrow();
      await expect(tester.assertLine(2, 'Third')).resolves.not.toThrow();
    });

    it('should throw when line does not contain text', async () => {
      await expect(tester.assertLine(0, 'Wrong')).rejects.toThrow(
        'Line 0 does not contain "Wrong"'
      );
    });

    it('should assert line with predicate function', async () => {
      await expect(
        tester.assertLine(0, line => line.startsWith('First'))
      ).resolves.not.toThrow();
      
      await expect(
        tester.assertLine(0, line => line.length > 5)
      ).resolves.not.toThrow();
    });

    it('should throw when predicate returns false', async () => {
      await expect(
        tester.assertLine(0, line => line.startsWith('Second'))
      ).rejects.toThrow('Line 0 assertion failed');
    });

    it('should throw when line does not exist', async () => {
      await expect(tester.assertLine(10, 'test')).rejects.toThrow(
        'Line 10 does not exist. Screen has 3 lines.'
      );
    });
  });

  describe('snapshot method', () => {
    beforeEach(() => {
      // Reset snapshot manager mocks
      vi.clearAllMocks();
      (mockSnapshotManager.load as any).mockResolvedValue(null);
      (mockSnapshotManager.save as any).mockResolvedValue(undefined);
      
      execSpy.mockImplementation((cmd: string) => {
        if (cmd.includes('capture-pane')) {
          return Promise.resolve({
            code: 0,
            stdout: 'Screen content\nwith ANSI \x1b[31mcodes\x1b[0m',
            stderr: ''
          });
        }
        return Promise.resolve({ code: 0, stdout: '', stderr: '' });
      });
    });

    it('should save new snapshot', async () => {
      (mockSnapshotManager.load as any).mockResolvedValue(null);
      
      await tester.snapshot('test-snapshot');
      
      expect(mockSnapshotManager.save).toHaveBeenCalledWith(
        'test-snapshot',
        expect.stringContaining('Screen content')
      );
    });

    it('should strip ANSI codes when option is set', async () => {
      (mockSnapshotManager.load as any).mockResolvedValue(null);
      
      await tester.snapshot('test-snapshot', { stripAnsi: true });
      
      expect(mockSnapshotManager.save).toHaveBeenCalledWith(
        'test-snapshot',
        expect.not.stringContaining('\x1b[31m')
      );
    });

    it('should trim content when option is set', async () => {
      execSpy.mockImplementation((cmd: string) => {
        if (cmd.includes('capture-pane')) {
          return Promise.resolve({
            code: 0,
            stdout: '  \n  Content  \n  ',
            stderr: ''
          });
        }
        return Promise.resolve({ code: 0, stdout: '', stderr: '' });
      });
      
      (mockSnapshotManager.load as any).mockResolvedValue(null);
      
      await tester.snapshot('test-snapshot', { trim: true });
      
      expect(mockSnapshotManager.save).toHaveBeenCalledWith(
        'test-snapshot',
        'Content'
      );
    });

    it('should compare with existing snapshot', async () => {
      (mockSnapshotManager.load as any).mockResolvedValue('Screen content\nwith ANSI \x1b[31mcodes\x1b[0m');
      
      await expect(tester.snapshot('test-snapshot')).resolves.not.toThrow();
    });

    it('should throw on snapshot mismatch', async () => {
      (mockSnapshotManager.load as any).mockResolvedValue('Different content');
      
      await expect(tester.snapshot('test-snapshot')).rejects.toThrow(
        'Snapshot mismatch for "test-snapshot"'
      );
    });

    it('should use custom compare function', async () => {
      (mockSnapshotManager.load as any).mockResolvedValue('Content v1.0.0');
      
      execSpy.mockImplementation((cmd: string) => {
        if (cmd.includes('capture-pane')) {
          return Promise.resolve({
            code: 0,
            stdout: 'Content v2.0.0',
            stderr: ''
          });
        }
        return Promise.resolve({ code: 0, stdout: '', stderr: '' });
      });
      
      const compare = (expected: string, actual: string) => 
        // Ignore version numbers
         expected.replace(/v\d+\.\d+\.\d+/, '') === 
               actual.replace(/v\d+\.\d+\.\d+/, '')
      ;
      
      await expect(
        tester.snapshot('test-snapshot', { compare })
      ).resolves.not.toThrow();
    });

    it('should update snapshot when option is set', async () => {
      (mockSnapshotManager.load as any).mockResolvedValue('Old content');
      
      await tester.snapshot('test-snapshot', { updateSnapshot: true });
      
      expect(mockSnapshotManager.save).toHaveBeenCalledWith(
        'test-snapshot',
        expect.stringContaining('Screen content')
      );
    });

    it('should use custom content when provided', async () => {
      (mockSnapshotManager.load as any).mockResolvedValue(null);
      
      await tester.snapshot('test-snapshot', { 
        customContent: 'Custom snapshot content' 
      });
      
      expect(mockSnapshotManager.save).toHaveBeenCalledWith(
        'test-snapshot',
        'Custom snapshot content'
      );
    });
  });
});