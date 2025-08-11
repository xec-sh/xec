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

// Mock the adapters module
vi.mock('../src/adapters/index.js', () => ({
  getAdapter: () => mockAdapter
}));

describe('Mouse Interactions', () => {
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
    
    // Mark as running to bypass start check
    (tester as any).running = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Mouse Support', () => {
    it('should enable mouse support', async () => {
      await tester.enableMouse();
      
      expect(execSpy).toHaveBeenCalledWith(
        expect.stringContaining('tmux set -t test-session mouse on')
      );
    });

    it('should disable mouse support', async () => {
      await tester.disableMouse();
      
      expect(execSpy).toHaveBeenCalledWith(
        expect.stringContaining('tmux set -t test-session mouse off')
      );
    });
  });

  describe('Click Actions', () => {
    it('should send click at position', async () => {
      await tester.click(10, 5);
      
      // Should enable mouse first
      expect(execSpy).toHaveBeenCalledWith(
        expect.stringContaining('mouse on')
      );
      
      // Should send click event
      expect(execSpy).toHaveBeenCalledWith(
        expect.stringContaining('send-keys')
      );
    });

    it('should double click at position', async () => {
      await tester.doubleClick(10, 5);
      
      // Should send two click events
      const clickCalls = execSpy.mock.calls.filter((call: any[]) => 
        call[0].includes('send-keys')
      );
      
      expect(clickCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('should right click at position', async () => {
      await tester.rightClick(10, 5);
      
      expect(execSpy).toHaveBeenCalledWith(
        expect.stringContaining('send-keys')
      );
    });

    it('should click on text', async () => {
      // Mock screen capture
      execSpy.mockImplementation((cmd: string) => {
        if (cmd.includes('capture-pane')) {
          return Promise.resolve({
            code: 0,
            stdout: 'Line 1\nClick here\nLine 3',
            stderr: ''
          });
        }
        return Promise.resolve({ code: 0, stdout: '', stderr: '' });
      });
      
      await tester.clickText('Click here');
      
      // Should have captured screen and sent click
      expect(execSpy).toHaveBeenCalledWith(
        expect.stringContaining('capture-pane')
      );
      expect(execSpy).toHaveBeenCalledWith(
        expect.stringContaining('send-keys')
      );
    });

    it('should throw error when text not found', async () => {
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
      
      await expect(tester.clickText('Not found')).rejects.toThrow(
        'Text "Not found" not found on screen'
      );
    });
  });

  describe('Drag and Scroll', () => {
    it('should drag from one position to another', async () => {
      await tester.drag({ x: 10, y: 5 }, { x: 20, y: 10 });
      
      // Should send multiple mouse events
      const mouseCalls = execSpy.mock.calls.filter((call: any[]) => 
        call[0].includes('send-keys')
      );
      
      expect(mouseCalls.length).toBeGreaterThanOrEqual(3);
    });

    it('should scroll up', async () => {
      // Mock cursor position
      execSpy.mockImplementation((cmd: string) => {
        if (cmd.includes('cursor_x')) {
          return Promise.resolve({ code: 0, stdout: '10,5', stderr: '' });
        }
        return Promise.resolve({ code: 0, stdout: '', stderr: '' });
      });
      
      await tester.scroll('up', 3);
      
      // Should send scroll events
      const scrollCalls = execSpy.mock.calls.filter((call: any[]) => 
        call[0].includes('send-keys')
      );
      
      expect(scrollCalls.length).toBeGreaterThanOrEqual(3);
    });

    it('should scroll down', async () => {
      // Mock cursor position
      execSpy.mockImplementation((cmd: string) => {
        if (cmd.includes('cursor_x')) {
          return Promise.resolve({ code: 0, stdout: '10,5', stderr: '' });
        }
        return Promise.resolve({ code: 0, stdout: '', stderr: '' });
      });
      
      await tester.scroll('down', 2);
      
      const scrollCalls = execSpy.mock.calls.filter((call: any[]) => 
        call[0].includes('send-keys')
      );
      
      expect(scrollCalls.length).toBeGreaterThanOrEqual(2);
    });
  });
});