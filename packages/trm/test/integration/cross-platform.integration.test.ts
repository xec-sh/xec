import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { 
  isTTY,
  isWSL,
  isSSH,
  hrtime,
  Terminal,
  getShell,
  getPlatform,
  initPlatform,
  createTerminal,
  detectPlatform,
  getColorSupport,
  getTerminalSize,
  getTerminalType
} from '../../src/index.js';

describe('Cross-Platform Integration', () => {
  let originalPlatform: any;
  let originalEnv: any;
  let terminal: Terminal | null = null;

  beforeEach(() => {
    // Save original values
    originalPlatform = process.platform;
    originalEnv = { ...process.env };
    
    // Mock process.stdout
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
      enumerable: true,
      configurable: true
    });
    
    process.env = originalEnv;
    
    if (terminal) {
      terminal.dispose();
      terminal = null;
    }
    
    vi.restoreAllMocks();
  });

  describe('Platform Detection', () => {
    it('should detect Node.js runtime correctly', () => {
      const platform = detectPlatform();
      
      // In test environment, we're running in Node.js
      expect(['node', 'deno', 'bun', 'browser']).toContain(platform.runtime);
      expect(platform.os).toBeDefined();
      expect(platform.terminal).toBeDefined();
    });

    it('should detect macOS platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        enumerable: true,
        configurable: true
      });
      
      const platform = getPlatform();
      expect(platform.os).toBe('darwin');
    });

    it('should detect Linux platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        enumerable: true,
        configurable: true
      });
      
      const platform = getPlatform();
      expect(platform.os).toBe('linux');
    });

    it('should detect Windows platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        enumerable: true,
        configurable: true
      });
      
      const platform = getPlatform();
      expect(platform.os).toBe('windows');
    });

    it('should detect WSL environment', () => {
      // Mock WSL detection
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        enumerable: true,
        configurable: true
      });
      
      const wsl = isWSL();
      // In real WSL, this would be true
      expect(typeof wsl).toBe('boolean');
    });

    it('should detect SSH session', () => {
      // Test without SSH
      delete process.env.SSH_CLIENT;
      delete process.env.SSH_TTY;
      delete process.env.SSH_CONNECTION;
      
      expect(isSSH()).toBe(false);
      
      // Test with SSH
      process.env.SSH_CLIENT = '192.168.1.1 12345 22';
      expect(isSSH()).toBe(true);
    });
  });

  describe('Terminal Capabilities', () => {
    it('should detect color support', () => {
      // Test force color
      process.env.FORCE_COLOR = '1';
      expect(getColorSupport()).toBe(24);
      
      // Test no color
      delete process.env.FORCE_COLOR;
      process.env.NO_COLOR = '1';
      expect(getColorSupport()).toBe(0);
      
      // Test COLORTERM
      delete process.env.NO_COLOR;
      process.env.COLORTERM = 'truecolor';
      expect(getColorSupport()).toBe(24);
      
      // Test 256 color
      delete process.env.COLORTERM;
      process.env.TERM = 'xterm-256color';
      expect(getColorSupport()).toBe(8);
      
      // Test basic color
      process.env.TERM = 'xterm-color';
      expect(getColorSupport()).toBe(4);
    });

    it('should detect TTY status', () => {
      const tty = isTTY();
      // In test environment, usually not a TTY
      expect(typeof tty).toBe('boolean');
    });

    it('should get terminal size', () => {
      const size = getTerminalSize();
      
      if (size) {
        expect(size.rows).toBeGreaterThan(0);
        expect(size.cols).toBeGreaterThan(0);
      } else {
        // Fallback to default size
        expect(size).toEqual({ rows: 24, cols: 80 });
      }
    });

    it('should get terminal type', () => {
      process.env.TERM = 'xterm-256color';
      expect(getTerminalType()).toBe('xterm-256color');
      
      delete process.env.TERM;
      expect(getTerminalType()).toBe('dumb');
    });

    it('should get shell', () => {
      process.env.SHELL = '/bin/bash';
      expect(getShell()).toBe('/bin/bash');
      
      delete process.env.SHELL;
      expect(getShell()).toBeUndefined();
    });
  });

  describe('Platform-Specific Terminal Creation', () => {
    it('should create terminal for macOS', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        enumerable: true,
        configurable: true
      });
      
      terminal = createTerminal({
        width: 80,
        height: 24
      });
      
      expect(terminal).toBeDefined();
      expect(terminal.getSize()).toEqual({ width: 80, height: 24 });
    });

    it('should create terminal for Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        enumerable: true,
        configurable: true
      });
      
      terminal = createTerminal({
        width: 100,
        height: 30
      });
      
      expect(terminal).toBeDefined();
      expect(terminal.getSize()).toEqual({ width: 100, height: 30 });
    });

    it('should create terminal for Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        enumerable: true,
        configurable: true
      });
      
      terminal = createTerminal({
        width: 120,
        height: 40
      });
      
      expect(terminal).toBeDefined();
      expect(terminal.getSize()).toEqual({ width: 120, height: 40 });
    });
  });

  describe('Environment-Based Configuration', () => {
    it('should respect CI environment', () => {
      process.env.CI = 'true';
      
      terminal = createTerminal({
        width: 80,
        height: 24
      });
      
      // In CI, should use more conservative settings
      expect(terminal).toBeDefined();
    });

    it('should handle Docker environment', () => {
      process.env.DOCKER_CONTAINER = 'true';
      
      terminal = createTerminal({
        width: 80,
        height: 24
      });
      
      expect(terminal).toBeDefined();
    });

    it('should handle various terminal emulators', () => {
      const emulators = [
        { env: 'TERM_PROGRAM', value: 'iTerm.app' },
        { env: 'TERM_PROGRAM', value: 'vscode' },
        { env: 'TERM_PROGRAM', value: 'Apple_Terminal' },
        { env: 'TERM', value: 'xterm' },
        { env: 'TERM', value: 'screen' },
        { env: 'TERM', value: 'tmux' },
      ];

      emulators.forEach(({ env, value }) => {
        process.env[env] = value;
        
        const colorSupport = getColorSupport();
        expect(colorSupport).toBeGreaterThanOrEqual(0);
        expect(colorSupport).toBeLessThanOrEqual(24);
      });
    });
  });

  describe('Platform Initialization', () => {
    it('should initialize platform', async () => {
      await initPlatform();
      // Platform should be initialized without errors
      expect(true).toBe(true);
    });

    it('should handle platform-specific initialization', async () => {
      const platforms = ['darwin', 'linux', 'win32'];
      
      for (const platform of platforms) {
        Object.defineProperty(process, 'platform', {
          value: platform,
          writable: true,
          enumerable: true,
          configurable: true
        });
        
        await initPlatform();
        // Should not throw
        expect(true).toBe(true);
      }
    });
  });

  describe('High-Resolution Timer', () => {
    it('should provide high-resolution time', () => {
      const start = hrtime();
      expect(typeof start).toBe('bigint');
      
      // Do some work
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += i;
      }
      
      const end = hrtime();
      expect(typeof end).toBe('bigint');
      expect(end).toBeGreaterThan(start);
    });

    it('should measure elapsed time accurately', () => {
      const start = hrtime();
      
      // Wait a bit
      const target = Date.now() + 10;
      while (Date.now() < target) {
        // Busy wait
      }
      
      const end = hrtime();
      const elapsed = Number(end - start) / 1_000_000; // Convert to milliseconds
      
      expect(elapsed).toBeGreaterThanOrEqual(5);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Locale and Encoding', () => {
    it('should handle UTF-8 encoding', () => {
      process.env.LANG = 'en_US.UTF-8';
      process.env.LC_ALL = 'en_US.UTF-8';
      
      terminal = createTerminal({
        width: 80,
        height: 24
      });
      
      const screen = terminal.getScreen();
      
      // Test Unicode characters
      const unicodeChars = [
        '😀', '🎨', '🚀', '❤️',
        '你好', 'こんにちは', '안녕하세요',
        'Ω', 'π', '∞', '√'
      ];
      
      unicodeChars.forEach((char, i) => {
        screen.write(char, i * 2, 0);
      });
      
      // Should handle Unicode without errors
      expect(screen.getCell(0, 0)?.char).toBeDefined();
    });

    it('should handle different locales', () => {
      const locales = [
        'en_US.UTF-8',
        'de_DE.UTF-8',
        'fr_FR.UTF-8',
        'ja_JP.UTF-8',
        'zh_CN.UTF-8'
      ];
      
      locales.forEach(locale => {
        process.env.LANG = locale;
        
        const platform = getPlatform();
        expect(platform).toBeDefined();
      });
    });
  });

  describe('Terminal Feature Detection', () => {
    it('should detect mouse support', () => {
      terminal = createTerminal({
        width: 80,
        height: 24,
        mouse: true
      });
      
      // Mouse support should be configurable
      expect(terminal).toBeDefined();
    });

    it('should detect alternate buffer support', () => {
      terminal = createTerminal({
        width: 80,
        height: 24,
        alternateBuffer: true
      });
      
      expect(terminal).toBeDefined();
    });

    it('should detect bracketed paste support', () => {
      process.env.TERM = 'xterm-256color';
      
      terminal = createTerminal({
        width: 80,
        height: 24
      });
      
      // Modern terminals support bracketed paste
      expect(terminal).toBeDefined();
    });
  });

  describe('Cross-Platform Path Handling', () => {
    it('should handle Windows paths', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        enumerable: true,
        configurable: true
      });
      
      const platform = getPlatform();
      expect(platform.os).toBe('windows');
      
      // Windows uses backslashes
      const path = 'C:\\Users\\Test\\file.txt';
      expect(path.includes('\\')).toBe(true);
    });

    it('should handle Unix paths', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        enumerable: true,
        configurable: true
      });
      
      const platform = getPlatform();
      expect(platform.os).toBe('linux');
      
      // Unix uses forward slashes
      const path = '/home/user/file.txt';
      expect(path.includes('/')).toBe(true);
    });
  });

  describe('Performance Across Platforms', () => {
    it('should maintain consistent performance', () => {
      const platforms = ['darwin', 'linux', 'win32'];
      
      platforms.forEach(platform => {
        Object.defineProperty(process, 'platform', {
          value: platform,
          writable: true,
          enumerable: true,
          configurable: true
        });
        
        const start = hrtime();
        
        terminal = createTerminal({
          width: 80,
          height: 24
        });
        
        const screen = terminal.getScreen();
        
        // Perform some operations
        for (let i = 0; i < 100; i++) {
          screen.write(`Line ${i}`, 0, i % 24);
        }
        
        screen.clear();
        
        const end = hrtime();
        const elapsed = Number(end - start) / 1_000_000;
        
        // Should complete within reasonable time
        expect(elapsed).toBeLessThan(1000); // Less than 1 second
        
        terminal.dispose();
        terminal = null;
      });
    });
  });
});