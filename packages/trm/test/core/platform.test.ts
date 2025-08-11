import { it, vi, expect, describe, beforeEach } from 'vitest';

import { detectPlatform } from '../../src/core/platform';

describe('Platform Detection', () => {
  // Save original globals
  const originalProcess = globalThis.process;
  const originalDeno = (globalThis as any).Deno;
  const originalBun = (globalThis as any).Bun;
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    // Reset all globals to undefined first
    vi.unstubAllGlobals();
    delete (globalThis as any).process;
    delete (globalThis as any).Deno;
    delete (globalThis as any).Bun;
    delete (globalThis as any).window;
  });

  afterEach(() => {
    // Restore original globals after each test
    vi.unstubAllGlobals();
    if (originalProcess) (globalThis as any).process = originalProcess;
    if (originalDeno) (globalThis as any).Deno = originalDeno;
    if (originalBun) (globalThis as any).Bun = originalBun;
    if (originalWindow) (globalThis as any).window = originalWindow;
  });

  describe('Runtime Detection', () => {
    it('should detect Node.js runtime', () => {
      vi.stubGlobal('process', {
        versions: { node: '20.0.0' },
        platform: 'darwin'
      });
      
      const platform = detectPlatform();
      expect(platform.runtime).toBe('node');
    });

    it('should detect Deno runtime', () => {
      vi.stubGlobal('Deno', {
        version: { deno: '1.38.0' },
        build: { os: 'darwin' }
      });
      
      const platform = detectPlatform();
      expect(platform.runtime).toBe('deno');
    });

    it('should detect Bun runtime', () => {
      vi.stubGlobal('Bun', {
        version: '1.0.0'
      });
      vi.stubGlobal('process', {
        platform: 'darwin'
      });
      
      const platform = detectPlatform();
      expect(platform.runtime).toBe('bun');
    });

    it('should return browser for unrecognized runtime', () => {
      // Clear all runtime globals
      vi.stubGlobal('process', undefined);
      vi.stubGlobal('Deno', undefined);
      vi.stubGlobal('Bun', undefined);
      vi.stubGlobal('window', undefined);
      
      const platform = detectPlatform();
      expect(platform.runtime).toBe('browser');
    });

    it('should detect browser runtime when window is present', () => {
      vi.stubGlobal('process', undefined);
      vi.stubGlobal('Deno', undefined);
      vi.stubGlobal('Bun', undefined);
      vi.stubGlobal('window', {});
      
      const platform = detectPlatform();
      expect(platform.runtime).toBe('browser');
    });
  });

  describe('OS Detection', () => {
    it('should detect macOS', () => {
      vi.stubGlobal('process', {
        versions: { node: '20.0.0' },
        platform: 'darwin'
      });
      
      const platform = detectPlatform();
      expect(platform.os).toBe('darwin');
    });

    it('should detect Linux', () => {
      vi.stubGlobal('process', {
        versions: { node: '20.0.0' },
        platform: 'linux'
      });
      
      const platform = detectPlatform();
      expect(platform.os).toBe('linux');
    });

    it('should detect Windows', () => {
      vi.stubGlobal('process', {
        versions: { node: '20.0.0' },
        platform: 'win32'
      });
      
      const platform = detectPlatform();
      expect(platform.os).toBe('windows');
    });

    it('should detect Windows from win32 platform', () => {
      vi.stubGlobal('process', {
        versions: { node: '20.0.0' },
        platform: 'win32'
      });
      
      const platform = detectPlatform();
      expect(platform.os).toBe('windows');
    });

    it('should detect FreeBSD', () => {
      vi.stubGlobal('process', {
        versions: { node: '20.0.0' },
        platform: 'freebsd'
      });
      
      const platform = detectPlatform();
      expect(platform.os).toBe('freebsd');
    });

    it('should return unknown for unrecognized OS', () => {
      vi.stubGlobal('process', {
        versions: { node: '20.0.0' },
        platform: 'some-unknown-os'
      });
      
      const platform = detectPlatform();
      expect(platform.os).toBe('unknown');
    });

    it('should detect OS in Deno', () => {
      vi.stubGlobal('Deno', {
        version: { deno: '1.38.0' },
        build: { os: 'linux' }
      });
      
      const platform = detectPlatform();
      expect(platform.os).toBe('linux');
    });
  });

  describe('Terminal Detection', () => {
    it('should detect terminal from TERM env variable in Node.js', () => {
      vi.stubGlobal('process', {
        versions: { node: '20.0.0' },
        platform: 'darwin',
        env: { TERM: 'xterm-256color' }
      });
      
      const platform = detectPlatform();
      expect(platform.terminal).toBe('xterm-256color');
    });

    it('should detect terminal from TERM env variable in Deno', () => {
      vi.stubGlobal('Deno', {
        version: { deno: '1.38.0' },
        build: { os: 'darwin' },
        env: {
          get: (key: string) => key === 'TERM' ? 'alacritty' : undefined
        }
      });
      
      const platform = detectPlatform();
      expect(platform.terminal).toBe('alacritty');
    });

    it('should detect terminal from TERM env variable in Bun', () => {
      vi.stubGlobal('Bun', {
        version: '1.0.0'
      });
      vi.stubGlobal('process', {
        platform: 'darwin',
        env: { TERM: 'kitty' }
      });
      
      const platform = detectPlatform();
      expect(platform.terminal).toBe('kitty');
    });

    it('should return dumb terminal when TERM is not set', () => {
      vi.stubGlobal('process', {
        versions: { node: '20.0.0' },
        platform: 'darwin',
        env: {}
      });
      
      const platform = detectPlatform();
      expect(platform.terminal).toBe('dumb');
    });

    it('should return dumb terminal when environment is not available', () => {
      vi.stubGlobal('process', {
        versions: { node: '20.0.0' },
        platform: 'darwin'
      });
      
      const platform = detectPlatform();
      expect(platform.terminal).toBe('dumb');
    });
  });

  describe('Platform Priority', () => {
    it('should prioritize Deno over Node.js when both are present', () => {
      vi.stubGlobal('Deno', {
        version: { deno: '1.38.0' },
        build: { os: 'darwin' }
      });
      vi.stubGlobal('process', {
        versions: { node: '20.0.0' },
        platform: 'darwin'
      });
      
      const platform = detectPlatform();
      expect(platform.runtime).toBe('deno');
    });

    it('should prioritize Bun over Node.js when both are present', () => {
      vi.stubGlobal('Bun', {
        version: '1.0.0'
      });
      vi.stubGlobal('process', {
        versions: { node: '20.0.0' },
        platform: 'darwin'
      });
      
      const platform = detectPlatform();
      expect(platform.runtime).toBe('bun');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing version information', () => {
      // Clear other runtime globals
      vi.stubGlobal('Deno', undefined);
      vi.stubGlobal('Bun', undefined);
      vi.stubGlobal('process', {
        platform: 'darwin'
      });
      
      const platform = detectPlatform();
      expect(platform.runtime).toBe('node'); // Still detected as Node.js
    });

    it('should handle partial Deno global', () => {
      vi.stubGlobal('Deno', {});
      
      const platform = detectPlatform();
      // Without version.deno, it won't be detected as Deno
      expect(platform.runtime).toBe('browser');
      expect(platform.os).toBe('unknown');
    });

    it('should handle partial Bun global', () => {
      vi.stubGlobal('Bun', {});
      
      const platform = detectPlatform();
      // Without version, it won't be detected as Bun
      expect(platform.runtime).toBe('browser');
    });

    it('should handle null/undefined values safely', () => {
      vi.stubGlobal('process', {
        versions: { node: '20.0.0' },
        platform: null
      });
      
      const platform = detectPlatform();
      expect(platform.runtime).toBe('node');
      expect(platform.os).toBe('unknown');
    });
  });
});