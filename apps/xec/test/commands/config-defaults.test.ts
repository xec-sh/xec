import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Configuration } from '@xec-sh/ops';
import { ConfigValidator, TaskManager, ConfigurationManager } from '@xec-sh/ops';
import { LogsCommand } from '../../src/commands/logs.js';
import { ConfigCommand } from '../../src/commands/config.js';
import { NewCommand, createArtifact } from '../../src/commands/new.js';

let directory: string;
let previous: string;
let exitCode: typeof process.exitCode;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-config-defaults-'));
  previous = process.cwd();
  exitCode = process.exitCode;
  process.chdir(directory);
  vi.stubEnv('XEC_HOME_DIR', path.join(directory, 'home'));
  vi.stubEnv('CI', 'true');
  vi.stubEnv('XEC_NO_INTERACTIVE', 'true');
});
afterEach(async () => {
  process.chdir(previous);
  process.exitCode = exitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});

async function writeConfig(source: string) {
  await fs.mkdir(path.join(directory, '.xec'), { recursive: true });
  const file = path.join(directory, '.xec/config.yaml');
  await fs.writeFile(file, source);
  return file;
}
async function invoke(args: string[]) {
  const output: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { output.push(String(chunk)); return true; });
  await new ConfigCommand().create().exitOverride().parseAsync(['-o', 'json', ...args], { from: 'user' });
  return JSON.parse(output.join(''));
}

describe('configuration editor and scaffold use the execution contract', () => {
  it('new project produces tasks the actual TaskManager can load', async () => {
    const target = path.join(directory, 'generated');
    await createArtifact('project', 'generated', { desc: 'Synthetic project', force: true });
    const config = yaml.load(await fs.readFile(path.join(target, '.xec/config.yaml'), 'utf8')) as Configuration;
    expect((await new ConfigValidator().validate(config)).filter(error => error.rule !== 'warning')).toEqual([]);
    const manager = new TaskManager({ configManager: new ConfigurationManager({ projectRoot: target,
      globalHomeDir: path.join(directory, 'home'), secretProvider: { type: 'env' }, strict: true }) });
    const result = await manager.run('check');
    expect(result.success, result.error?.message).toBe(true);
  });
  it('refuses extension scaffolding through the real parser before creating files', async () => {
    const messages: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...values) => { messages.push(values.join(' ')); });
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    await expect(new NewCommand().create().exitOverride().parseAsync(['extension', 'example', '--force'], { from: 'user' }))
      .rejects.toThrow('exit');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(messages.join('\n')).toContain('Extension loading is not implemented');
    expect(await fs.readdir(directory)).toEqual([]);
    await expect(createArtifact('extension', 'example', { force: true })).rejects.toThrow('xec new command');
    expect(await fs.readdir(directory)).toEqual([]);
  });
  it('refuses an unsupported scaffold preview before any files are created', async () => {
    await expect(createArtifact('project', 'preview', { dryRun: true })).rejects.toThrow('No files were created');
    expect(await fs.readdir(directory)).toEqual([]);
  });
  it('loads a legacy extensions key without executing interpolation or initializing storage', async () => {
    const marker = path.join(directory, 'effect');
    const store = path.join(directory, 'secrets');
    const command = `node -e "require('node:fs').writeFileSync('${marker}', 'effect')"`;
    const original = yaml.dump({ version: '1.0', extensions: [{ source: './plugin' }],
      secrets: { provider: 'local', config: { storageDir: store } }, vars: { command: '${cmd:' + command + '}' } });
    const file = await writeConfig(original);
    for (const strict of [false, true]) {
      const manager = new ConfigurationManager({ projectRoot: directory, globalHomeDir: path.join(directory, 'home'),
        secretProvider: { type: 'local', config: { storageDir: store } }, onUntrustedConfig: () => true, strict });
      await expect(manager.load()).rejects.toThrow('Unsupported configuration');
    }
    expect(await fs.readdir(directory)).toEqual(['.xec']);
    expect(await fs.readFile(file, 'utf8')).toBe(original);
  });
  it('refuses unsupported extension keys in profiles before provider initialization', async () => {
    const store = path.join(directory, 'secret-store');
    for (const separate of [false, true]) {
      await writeConfig(separate ? 'version: "1.0"\n' : 'version: "1.0"\nprofiles:\n  staging:\n    extensions: []\n');
      if (separate) {
        await fs.mkdir(path.join(directory, '.xec/profiles'), { recursive: true });
        await fs.writeFile(path.join(directory, '.xec/profiles/staging.yaml'), 'extensions: []\n');
      }
      const manager = new ConfigurationManager({ projectRoot: directory, globalHomeDir: path.join(directory, 'home'),
        profile: 'staging', secretProvider: { type: 'local', config: { storageDir: store } } });
      await expect(manager.load()).rejects.toThrow('Unsupported configuration');
      expect(await fs.readdir(directory)).toEqual(['.xec']);
    }
  });
  it('generated advanced task and profile run through the actual configuration and executor', async () => {
    await writeConfig('version: "1.0"\n');
    const description = 'Example: literal YAML\nextensions: [not-code]';
    await createArtifact('task', 'inspect', { advanced: true, desc: description });
    await createArtifact('profile', 'staging', { advanced: true, desc: description });
    const manager = new ConfigurationManager({ projectRoot: directory, globalHomeDir: path.join(directory, 'home'),
      profile: 'staging', secretProvider: { type: 'env' }, strict: true });
    const loaded = await manager.load();
    expect(loaded.tasks?.inspect).toMatchObject({ description });
    expect(loaded.profiles?.staging?.description).toBe(description);
    expect(loaded.targets?.local?.env?.NODE_ENV).toBe('staging');
    const result = await new TaskManager({ configManager: manager }).run('inspect', { message: 'literal; $HOME' });
    expect(result.success, result.error?.message).toBe(true);
    expect(JSON.stringify(result)).toContain('literal; $HOME');
  });
  it('does not replace existing tasks or profiles without explicit force', async () => {
    const original = 'version: "1.0"\ntasks:\n  existing: node --version\nprofiles:\n  existing:\n    vars: {value: kept}\n';
    const file = await writeConfig(original);
    for (const type of ['task', 'profile']) {
      await expect(createArtifact(type, 'existing', { desc: 'Replacement' })).rejects.toThrow('Use --force');
      expect(await fs.readFile(file, 'utf8')).toBe(original);
    }
  });
  it('edits only the explicitly selected config and preserves comments and inherited data', async () => {
    const standard = 'version: "1.0"\n# Standard config must survive\n';
    const standardPath = await writeConfig(standard);
    const selected = path.join(directory, 'selected.yml');
    await fs.writeFile(selected, 'version: "1.0"\n# Selected file comment\n');
    const home = path.join(directory, 'home');
    await fs.mkdir(home);
    await fs.writeFile(path.join(home, 'config.yaml'), 'version: "1.0"\nvars:\n  inherited: global-value\ntasks:\n  shared: node --version\n');
    await createArtifact('task', 'created', { config: selected, desc: 'Own record' });
    const updated = await fs.readFile(selected, 'utf8');
    expect(updated).toContain('# Selected file comment');
    expect(updated).toContain('created:');
    expect(updated).not.toContain('global-value');
    expect(updated).not.toContain('shared:');
    await new ConfigCommand().create().exitOverride().parseAsync(['--config', selected, 'set', 'name', 'selected-project'], { from: 'user' });
    expect(await fs.readFile(selected, 'utf8')).toContain('name: selected-project');
    expect(await fs.readFile(standardPath, 'utf8')).toBe(standard);
  });
  it('saves a discovered yml project back to the same source', async () => {
    await fs.mkdir(path.join(directory, '.xec'));
    const file = path.join(directory, '.xec/config.yml');
    await fs.writeFile(file, 'version: "1.0"\n');
    const manager = new ConfigurationManager({ projectRoot: directory, globalHomeDir: path.join(directory, 'home'), secretProvider: { type: 'env' } });
    expect(await manager.getConfigPath()).toBe(file);
    await manager.load();
    manager.set('vars.changed', 'yes');
    await manager.save();
    expect(yaml.load(await fs.readFile(file, 'utf8'))).toMatchObject({ vars: { changed: 'yes' } });
    expect(await fs.readdir(path.join(directory, '.xec'))).toEqual(['config.yml']);
  });
  it('actual logs uses configured tail, while an explicit CLI tail wins', async () => {
    await writeConfig('version: "1.0"\ncommands:\n  logs:\n    tail: 1\n');
    const file = path.join(directory, 'example.log');
    await fs.writeFile(file, 'first\nsecond\nthird\n');
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...values) => { output.push(values.join(' ')); });
    await new LogsCommand().create().exitOverride().parseAsync(['local', file], { from: 'user' });
    expect(output.join('\n')).toContain('third');
    expect(output.join('\n')).not.toContain('second');
    output.length = 0;
    await new LogsCommand().create().exitOverride().parseAsync(['local', file, '--tail', '2'], { from: 'user' });
    expect(output.join('\n')).toContain('second');
    expect(output.join('\n')).not.toContain('first');
  });
  it('doctor previews the candidate it validated and does not write the file', async () => {
    const original = 'name: doctor-preview\n';
    const file = await writeConfig(original);
    const result = await invoke(['doctor', '--defaults', '--dry-run']);
    expect(result.validation.valid).toBe(true);
    expect(result.changed).toBe(true);
    expect(await fs.readFile(file, 'utf8')).toBe(original);
  });
  it('doctor refuses an unknown command option before writing any fixes', async () => {
    const original = 'name: doctor-invalid\ncommands:\n  on:\n    maxConcurent: 2\n';
    const file = await writeConfig(original);
    const result = await invoke(['doctor', '--defaults']);
    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.join('\n')).toMatch(/commands.on.maxConcurent/);
    expect(await fs.readFile(file, 'utf8')).toBe(original);
  });
  it('task validation refuses capabilities the executor does not implement', async () => {
    await writeConfig('version: "1.0"\ntasks:\n  invalid:\n    command: node --version\n    schedule: daily\n');
    const result = await invoke(['tasks', 'validate']);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('Unsupported task capability');
    expect(process.exitCode).toBe(1);
  });
  it('doctor accepts native nested command options and rejects obsolete aliases', async () => {
    await writeConfig('version: "1.0"\ncommands:\n  docker:\n    service:\n      redis:\n        port: "16379"\n');
    expect((await invoke(['validate'])).valid).toBe(true);
    await writeConfig('version: "1.0"\ncommands:\n  cp:\n    recursive: true\n');
    const result = await invoke(['validate']);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('commands.cp');
  });
  it('validate accepts optional metadata and selector-based pods through the owning schema', async () => {
    await writeConfig('version: "1.0"\ntargets:\n  pods:\n    app:\n      selector: app=example\n');
    const result = await invoke(['validate']);
    expect(result).toMatchObject({ valid: true, errors: [] });
  });
});
