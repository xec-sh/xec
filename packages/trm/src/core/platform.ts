/**
 * Platform detection and runtime abstraction
 * Provides unified interface across Node.js, Deno, and Bun
 */

import type { OS, Runtime, Platform } from '../types.js';

/**
 * Detect the current JavaScript runtime
 */
export function detectRuntime(): Runtime {
  // Use globalThis for better test mocking support
  const g = globalThis as any;
  
  // @ts-ignore - Check for Deno first
  if (g.Deno && g.Deno.version?.deno) {
    return 'deno';
  }

  // @ts-ignore - Bun global
  if (g.Bun && g.Bun.version) {
    return 'bun';
  }

  // Check for Node.js
  if (g.process && g.process.versions?.node) {
    return 'node';
  }

  // Check for Node.js without version info (still Node environment)
  if (g.process && g.process.platform) {
    return 'node';
  }

  // Browser environment (for future support)
  if (g.window) {
    return 'browser';
  }

  return 'browser'; // Default fallback assumes browser environment
}

/**
 * Detect the operating system
 */
export function detectOS(): OS {
  let platform: string | undefined;

  const runtime = detectRuntime();

   
  const g = globalThis as any;
  
  switch (runtime) {
    case 'deno':
      // @ts-ignore - Deno global
      platform = g.Deno?.build?.os;
      break;

    case 'bun':
    case 'node':
      platform = g.process?.platform;
      break;

    case 'browser':
      // Try to detect from user agent
      if (typeof navigator !== 'undefined') {
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('win')) platform = 'win32';
        else if (ua.includes('mac')) platform = 'darwin';
        else if (ua.includes('linux')) platform = 'linux';
      }
      break;
  }

  switch (platform) {
    case 'win32':
    case 'windows':
      return 'windows';
    case 'darwin':
      return 'darwin';
    case 'linux':
      return 'linux';
    case 'freebsd':
      return 'freebsd';
    case 'openbsd':
      return 'openbsd';
    case 'sunos':
      return 'sunos';
    case 'aix':
      return 'aix';
    default:
      return 'unknown';
  }
}

/**
 * Get environment variable across runtimes
 */
export function getEnv(key: string): string | undefined {
  const runtime = detectRuntime();

  const g = globalThis as any;
  
  switch (runtime) {
    case 'deno':
      // @ts-ignore - Deno global
      return g.Deno?.env?.get?.(key);

    case 'bun':
    case 'node':
      return g.process?.env?.[key];

    case 'browser':
      return undefined;

    default:
      return undefined;
  }
}

/**
 * Detect if running in Windows Subsystem for Linux
 */
export function isWSL(): boolean {
  if (detectOS() !== 'linux') return false;

  try {
    const runtime = detectRuntime();

    if (runtime === 'node' || runtime === 'bun') {
      const fs = require('fs');
      const osRelease = fs.readFileSync('/proc/sys/kernel/osrelease', 'utf8');
      return osRelease.toLowerCase().includes('microsoft');
    }

    if (runtime === 'deno') {
      const g = globalThis as any;
      // @ts-ignore - Deno global
      const osRelease = g.Deno?.readTextFileSync?.('/proc/sys/kernel/osrelease');
      return osRelease?.toLowerCase().includes('microsoft') || false;
    }
  } catch {
    // If we can't read the file, assume not WSL
  }

  return false;
}

/**
 * Detect if running in an SSH session
 */
export function isSSH(): boolean {
  return !!(getEnv('SSH_CLIENT') || getEnv('SSH_TTY') || getEnv('SSH_CONNECTION'));
}

/**
 * Get terminal type from environment
 */
export function getTerminalType(): string {
  return getEnv('TERM') || 'dumb';
}

/**
 * Get shell from environment
 */
export function getShell(): string | undefined {
  return getEnv('SHELL');
}

/**
 * Create platform information object
 */
export function getPlatform(): Platform {
  return {
    runtime: detectRuntime(),
    os: detectOS(),
    terminal: getTerminalType(),
    shell: getShell(),
    isWSL: isWSL(),
    isSSH: isSSH()
  };
}

/**
 * Alias for getPlatform() for backward compatibility
 */
export const detectPlatform = getPlatform;

/**
 * Check if the current environment supports TTY
 */
export function isTTY(): boolean {
  const runtime = detectRuntime();

  const g = globalThis as any;
  
  switch (runtime) {
    case 'node':
    case 'bun':
      return !!(g.process?.stdout?.isTTY && g.process?.stdin?.isTTY);

    case 'deno':
      // @ts-ignore - Deno global
      return g.Deno?.isatty?.(0) && g.Deno?.isatty?.(1);

    case 'browser':
      return false;

    default:
      return false;
  }
}

/**
 * Get terminal dimensions
 */
export function getTerminalSize(): { rows: number; cols: number } | undefined {
  const runtime = detectRuntime();

   
  const g = globalThis as any;
  
  switch (runtime) {
    case 'node':
    case 'bun':
      if (g.process?.stdout?.rows && g.process?.stdout?.columns) {
        return {
          rows: g.process.stdout.rows,
          cols: g.process.stdout.columns
        };
      }
      break;

    case 'deno':
      try {
        // @ts-ignore - Deno global
        const size = g.Deno?.consoleSize?.();
        if (size) {
          return {
            rows: size.rows,
            cols: size.columns
          };
        }
      } catch {
        // Permission denied or not available
      }
      break;
  }

  // Default fallback
  return { rows: 24, cols: 80 };
}

/**
 * Platform-specific initialization
 */
export async function initPlatform(): Promise<void> {
  const runtime = detectRuntime();
  const g = globalThis as any;

  // eslint-disable-next-line default-case
  switch (runtime) {
    case 'deno':
      // Request permissions if needed
      try {
        // @ts-ignore - Deno global
        await g.Deno?.permissions?.request?.({ name: 'env' });
        // @ts-ignore - Deno global
        await g.Deno?.permissions?.request?.({ name: 'read' });
        // @ts-ignore - Deno global
        await g.Deno?.permissions?.request?.({ name: 'write' });
      } catch {
        // Permissions API not available or denied
      }
      break;

    case 'node':
    case 'bun':
      // Enable SIGWINCH handling for resize events
      if (g.process?.stdout?.isTTY) {
        g.process.stdout.on?.('resize', () => {
          // Resize handling will be done by terminal
        });
      }
      break;
  }
}

/**
 * Get color support level
 */
export function getColorSupport(): number {
  // Force color support if requested
  if (getEnv('FORCE_COLOR') === '1' || getEnv('FORCE_COLOR') === 'true') {
    return 24; // True color
  }

  // No color if requested
  if (getEnv('NO_COLOR')) {
    return 0;
  }

  // Not a TTY
  if (!isTTY()) {
    return 0;
  }

  // Windows specific
  if (detectOS() === 'windows') {
    // Windows 10 build 14931+ supports true color
    const osRelease = getEnv('OS_RELEASE');
    if (osRelease && parseInt(osRelease) >= 14931) {
      return 24;
    }
    // Older Windows supports 16 colors
    return 4;
  }

  // Check COLORTERM for true color
  const colorTerm = getEnv('COLORTERM');
  if (colorTerm === 'truecolor' || colorTerm === '24bit') {
    return 24;
  }

  // Check TERM for color hints
  const term = getTerminalType();

  if (term.includes('256color')) {
    return 8;
  }

  if (term.includes('color')) {
    return 4;
  }

  // Check specific terminal emulators
  const termProgram = getEnv('TERM_PROGRAM');
  if (termProgram) {
    if (termProgram === 'iTerm.app') {
      const version = getEnv('TERM_PROGRAM_VERSION');
      if (version && parseInt(version.split('.')[0], 10) >= 3) {
        return 24; // iTerm 3+ supports true color
      }
      return 8;
    }

    if (termProgram === 'Apple_Terminal') {
      return 8; // Terminal.app supports 256 colors
    }

    if (termProgram === 'vscode') {
      return 24; // VS Code terminal supports true color
    }
  }

  // Default to basic colors
  return 4;
}

/**
 * Cross-platform high-resolution timer
 */
export function hrtime(): bigint {
  const runtime = detectRuntime();

  const g = globalThis as any;
  
  switch (runtime) {
    case 'node':
      return g.process?.hrtime?.bigint?.() || BigInt(Date.now() * 1_000_000);

    case 'bun':
      // @ts-ignore - Bun global
      return g.Bun?.nanoseconds?.() || BigInt(Date.now() * 1_000_000);

    case 'deno':
      return BigInt(Date.now() * 1_000_000);

    default:
      return BigInt(Date.now() * 1_000_000);
  }
}

/**
 * Set interval with cross-platform support
 */
export function setInterval(callback: () => void, ms: number): any {
  const runtime = detectRuntime();

  switch (runtime) {
    case 'deno':
      // Use global setInterval in Deno
      return globalThis.setInterval(callback, ms);

    default:
      // Node.js and Bun use global setInterval
      return globalThis.setInterval(callback, ms);
  }
}

/**
 * Clear interval with cross-platform support
 */
export function clearInterval(id: any): void {
  globalThis.clearInterval(id);
}

/**
 * Set timeout with cross-platform support
 */
export function setTimeout(callback: () => void, ms: number): any {
  return globalThis.setTimeout(callback, ms);
}

/**
 * Clear timeout with cross-platform support
 */
export function clearTimeout(id: any): void {
  globalThis.clearTimeout(id);
}

/**
 * Performance API for high-resolution time
 */
export const performance = globalThis.performance || {
  now: () => {
    const time = hrtime();
    return Number(time / BigInt(1_000_000)); // Convert nanoseconds to milliseconds
  }
};