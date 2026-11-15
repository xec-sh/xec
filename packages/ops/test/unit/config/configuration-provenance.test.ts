import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises';

import { ConfigurationManager, UntrustedConfigError } from '../../../src/config/configuration-manager.js';

const prefix = 'XEC_PROVENANCE_TEST_';

describe('configuration source provenance', () => {
  let directory: string;
  let originalTrust: string | undefined;
  const manager = (options: Partial<ConstructorParameters<typeof ConfigurationManager>[0]> = {}) =>
    new ConfigurationManager({ projectRoot: directory, globalHomeDir: join(directory, 'global'),
      envPrefix: prefix, secretProvider: { type: 'env' }, ...options });
  const config = (body: string) => writeFile(join(directory, '.xec', 'config.yaml'), 'version: "1.0"\n' + body);

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'xec-config-provenance-'));
    await mkdir(join(directory, '.xec', 'profiles'), { recursive: true });
    originalTrust = process.env['XEC_TRUST_CONFIG'];
    delete process.env['XEC_TRUST_CONFIG'];
  });
  afterEach(async () => {
    for (const key of Object.keys(process.env)) if (key.startsWith(prefix)) delete process.env[key];
    if (originalTrust === undefined) delete process.env['XEC_TRUST_CONFIG'];
    else process.env['XEC_TRUST_CONFIG'] = originalTrust;
    await rm(directory, { recursive: true, force: true });
  });

  it('keeps environment overrides literal through declared references, targets and save/reload', async () => {
    const marker = join(directory, 'executed');
    const payload = '${cmd:touch ' + marker + '}';
    process.env[prefix + 'VARS_VALUE'] = payload;
    process.env[prefix + 'TARGETS_HOSTS_PROBE_HOST'] = payload;
    await config('vars:\n  value: default\n  copied: ${vars.value}\n  twice: ${vars.copied}\ntargets:\n  hosts:\n    probe:\n      host: placeholder.invalid\n');
    const current = manager();
    const loaded = await current.load();
    expect(loaded.vars).toMatchObject({ value: payload, copied: payload, twice: payload });
    expect(loaded.targets?.hosts?.['probe']?.host).toBe(payload);
    expect(existsSync(marker)).toBe(false);
    await current.save();
    delete process.env[prefix + 'VARS_VALUE'];
    delete process.env[prefix + 'TARGETS_HOSTS_PROBE_HOST'];
    const reloaded = await manager().load();
    expect(reloaded.vars).toMatchObject({ value: payload, copied: payload, twice: payload });
    expect(reloaded.targets?.hosts?.['probe']?.host).toBe(payload);
    expect(existsSync(marker)).toBe(false);
  });

  it('tracks a higher-priority authored profile replacing an environment value', async () => {
    process.env[prefix + 'VARS_VALUE'] = '${cmd:touch NEVER_EXECUTE}';
    await config('vars:\n  suffix: chosen\nprofiles:\n  test:\n    vars:\n      value: profile-${vars.suffix}\n');
    expect((await manager({ profile: 'test' }).load()).vars?.['value']).toBe('profile-chosen');
  });

  it('requires the same trust decision for a separate profile file', async () => {
    const marker = join(directory, 'profile-effect');
    await config('tasks:\n  status: node --version\n');
    const file = join(directory, '.xec', 'profiles', 'test.yaml');
    await writeFile(file, 'vars:\n  effect: ${cmd:touch ' + marker + '}\n');
    await expect(manager({ profile: 'test' }).load()).rejects.toBeInstanceOf(UntrustedConfigError);
    expect(existsSync(marker)).toBe(false);
    process.env['XEC_TRUST_CONFIG'] = '1';
    await expect(manager({ profile: 'test', evaluateCommands: false }).load()).rejects.toThrow(/Dry-run.*unknown/);
    expect(existsSync(marker)).toBe(false);
    await manager({ profile: 'test', onUntrustedConfig: () => true }).load();
    expect(existsSync(marker)).toBe(true);
  });

  it.each(['TASKS_PROBE_COMMAND', 'PROFILES_PROBE_VARS_VALUE', 'EXTENSIONS_0_PATH'])('refuses executable config from environment override %s', async key => {
    await config('tasks:\n  status: node --version\n');
    process.env[prefix + key] = 'echo never';
    await expect(manager().load()).rejects.toThrow(/cannot define executable configuration/);
  });
});
