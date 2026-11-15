import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { executeDirectCommand } from '../../../src/utils/direct-execution.js';
import { ConfigurationManager } from '../../../src/config/configuration-manager.js';

// A local executable must never invoke discovery, command providers, Docker or
// Kubernetes. Refusing config loading makes that boundary explicit before effects.
beforeEach(() => { vi.spyOn(ConfigurationManager.prototype, 'load').mockRejectedValue(new Error('Unexpected configuration discovery')); });
afterEach(() => { vi.restoreAllMocks(); });

describe('direct local argv', () => {
  it('preserves literal argv and exact output without shell evaluation', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(value => { stdout.push(String(value)); return true; });
    vi.spyOn(process.stderr, 'write').mockImplementation(value => { stderr.push(String(value)); return true; });
    const args = ['space value', '', '$(echo injected)', '`echo injected`', '; echo injected', "single'quote", 'double"quote', 'back\\slash', 'line\nbreak', '-v', '--help'];
    await executeDirectCommand([process.execPath, '-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)));process.stderr.write("warning\\n\\n")', '--', ...args]);
    expect(stdout.join('')).toBe(JSON.stringify(args));
    expect(stderr.join('')).toBe('warning\n\n');
    expect(ConfigurationManager.prototype.load).not.toHaveBeenCalled();
  });

  it('rejects native command failure with captured status and both streams', async () => {
    await expect(executeDirectCommand([process.execPath, '-e', 'process.stdout.write("out");process.stderr.write("err");process.exitCode=7']))
      .rejects.toMatchObject({ exitCode: 7, stdout: 'out', stderr: 'err' });
    expect(ConfigurationManager.prototype.load).not.toHaveBeenCalled();
  });

  it('does not discover a replacement for a missing executable', async () => {
    await expect(executeDirectCommand(['xec-test-command-that-does-not-exist-47ce']))
      .rejects.not.toThrow('Unexpected configuration discovery');
    expect(ConfigurationManager.prototype.load).not.toHaveBeenCalled();
  });

  it('rejects an empty executable before effects', async () => {
    await expect(executeDirectCommand([])).rejects.toThrow('No command specified');
    await expect(executeDirectCommand(['', 'argument'])).rejects.toThrow('No command specified');
    expect(ConfigurationManager.prototype.load).not.toHaveBeenCalled();
  });
});
