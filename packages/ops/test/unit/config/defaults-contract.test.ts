import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigValidator } from '../../../src/config/config-validator.js';
import { ConfigurationManager } from '../../../src/config/configuration-manager.js';
import { getDefaultConfig, mergeWithDefaults } from '../../../src/config/defaults.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))); });

describe('one configuration baseline for load, doctor and scaffolding', () => {
  it('the advertised defaults satisfy the actual configuration schema', async () => {
    const errors = await new ConfigValidator().validate(getDefaultConfig());
    expect(errors.filter(error => error.rule !== 'warning')).toEqual([]);
  });
  it('an empty project loads the same baseline without invented command options', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-defaults-contract-'));
    directories.push(dir);
    const manager = new ConfigurationManager({ projectRoot: dir, globalHomeDir: path.join(dir, 'global'),
      envPrefix: 'DEFAULTS_CONTRACT_', evaluateCommands: false, strict: true });
    expect(await manager.load()).toEqual(getDefaultConfig());
    expect(getDefaultConfig().commands).toBeUndefined();
  });
  it('doctor merging preserves literal falsy values and does not mutate its inputs', () => {
    const source = { vars: { enabled: false, count: 0, label: '' } };
    const defaults = { vars: { enabled: true, count: 4, label: 'fallback', retained: 'yes' } };
    const result = mergeWithDefaults(source, defaults);
    expect(result.vars).toEqual({ enabled: false, count: 0, label: '', retained: 'yes' });
    expect(defaults.vars.enabled).toBe(true);
    expect(source.vars).not.toHaveProperty('retained');
  });
  it('doctor merge rejects prototype keys through the same boundary as config loading', () => {
    expect(() => mergeWithDefaults(JSON.parse('{"__proto__":{"injected":true}}'))).toThrow(/Unsafe/);
    expect({}).not.toHaveProperty('injected');
  });
});
