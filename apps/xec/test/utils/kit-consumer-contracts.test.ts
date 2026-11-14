import { load } from 'js-yaml';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigurationManager } from '@xec-sh/ops';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';
import { rm, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { text, select, confirm, password, CANCEL_SYMBOL } from '@xec-sh/kit';

import { createArtifact } from '../../src/commands/new.js';
import { ConfigCommand } from '../../src/commands/config.js';
import { inspectProject } from '../../src/commands/inspect.js';
import { InteractiveHelpers } from '../../src/utils/interactive-helpers.js';

const execution = vi.hoisted(() => ({ signal: undefined as AbortSignal | undefined }));
vi.mock('@xec-sh/core', async (actual) => ({
  ...await actual<typeof import('@xec-sh/core')>(),
  getExecutionSignal: () => execution.signal,
}));
vi.mock('@xec-sh/kit', async (actual) => ({
  ...await actual<typeof import('@xec-sh/kit')>(),
  text: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
  password: vi.fn(),
}));

const initial = `# preserve this project comment
version: '1.0'
name: kit-cli-contract
vars:
  EXISTING: kept
targets:
  hosts:
    primary:
      host: primary.example.test
      username: fixture
    duplicate:
      host: duplicate.example.test
      username: fixture
  containers:
    duplicate:
      container: untouched
  defaults:
    ssh:
      port: 2222
tasks:
  first:
    command: echo first
  second:
    command: echo second
`;
const previousExitCode = process.exitCode;
const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
const setTTY = (stream: NodeJS.ReadStream | NodeJS.WriteStream, value: boolean) => {
  Object.defineProperty(stream, 'isTTY', { value, configurable: true });
};
let directory: string;
let previousDirectory: string;
const configFile = () => join(directory, '.xec', 'config.yaml');
const readConfig = async () => load(await readFile(configFile(), 'utf8')) as {
  vars: Record<string, string>;
  targets: { hosts: Record<string, unknown>; containers: Record<string, unknown> };
  tasks: Record<string, unknown>;
};
const runConfig = (...args: string[]) => new ConfigCommand().create().parseAsync(args, { from: 'user' });

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'xec-kit-cli-'));
  await mkdir(join(directory, '.xec'));
  await writeFile(configFile(), initial);
  previousDirectory = process.cwd();
  process.chdir(directory);
  vi.stubEnv('CI', 'false');
  setTTY(process.stdin, true);
  setTTY(process.stdout, true);
  vi.mocked(text).mockReset();
  vi.mocked(select).mockReset();
  vi.mocked(confirm).mockReset();
  vi.mocked(password).mockReset();
  execution.signal = undefined;
  InteractiveHelpers.setupCancelHandlers();
});
afterEach(async () => {
  InteractiveHelpers.endInteractiveMode();
  process.chdir(previousDirectory);
  await rm(directory, { recursive: true, force: true });
  if (stdinTTY) Object.defineProperty(process.stdin, 'isTTY', stdinTTY);
  else Reflect.deleteProperty(process.stdin, 'isTTY');
  if (stdoutTTY) Object.defineProperty(process.stdout, 'isTTY', stdoutTTY);
  else Reflect.deleteProperty(process.stdout, 'isTTY');
  process.exitCode = previousExitCode;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('configuration prompts preserve the whole file on cancellation', () => {
  it.each([
    { args: ['defaults', 'ssh'], texts: [CANCEL_SYMBOL], confirms: [] },
    { args: ['defaults', 'ssh'], texts: ['22'], confirms: [CANCEL_SYMBOL] },
    { args: ['defaults', 'ssh'], texts: ['22', CANCEL_SYMBOL], confirms: [true] },
    { args: ['defaults', 'docker'], texts: [CANCEL_SYMBOL], confirms: [] },
    { args: ['defaults', 'docker'], texts: ['/app', CANCEL_SYMBOL], confirms: [] },
    { args: ['defaults', 'k8s'], texts: [CANCEL_SYMBOL], confirms: [] },
    { args: ['defaults', 'commands'], texts: ['50'], confirms: [CANCEL_SYMBOL] },
  ])('keeps the original file for $args $texts $confirms', async ({ args, texts, confirms }) => {
    for (const value of texts) vi.mocked(text).mockResolvedValueOnce(value as string | typeof CANCEL_SYMBOL);
    for (const value of confirms) vi.mocked(confirm).mockResolvedValueOnce(value as boolean | typeof CANCEL_SYMBOL);
    vi.mocked(select).mockResolvedValueOnce('logs');
    await runConfig(...args);
    expect(await readFile(configFile(), 'utf8')).toBe(initial);
    expect(vi.mocked(text).mock.calls).toHaveLength(texts.length);
    expect(vi.mocked(confirm).mock.calls).toHaveLength(confirms.length);
  });

  it('cancels doctor before defaults or file changes are committed', async () => {
    vi.mocked(text).mockResolvedValueOnce(CANCEL_SYMBOL);
    await runConfig('doctor', '--defaults');
    expect(text).toHaveBeenCalledTimes(1);
    expect(await readFile(configFile(), 'utf8')).toBe(initial);
  });

  it('keeps doctor non-interactive when machine output is requested', async () => {
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const chatter = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runConfig('doctor', '--output', 'json', '--dry-run');
    const result = JSON.parse(output.mock.calls.map(call => String(call[0])).join(''));
    expect(result).toMatchObject({ dryRun: true, validation: { valid: true } });
    expect(chatter).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    expect(await readFile(configFile(), 'utf8')).toBe(initial);
  });

  it('keeps doctor warnings visible without claiming complete health', async () => {
    vi.mocked(text).mockResolvedValueOnce('');
    const written = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const printed = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runConfig('doctor');
    const transcript = [...written.mock.calls, ...printed.mock.calls].map(call => String(call[0])).join('');
    expect(transcript).toContain('Configuration Warnings');
    expect(transcript).not.toContain('Configuration is healthy');
  });

  it('returns one failing validation document in quiet JSON mode', async () => {
    await writeFile(configFile(), 'version: [unfinished');
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const chatter = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runConfig('validate', '--output', 'json', '--quiet');
    const result = JSON.parse(output.mock.calls.map(call => String(call[0])).join(''));
    expect(result).toMatchObject({ valid: false, warnings: [] });
    expect(result.errors).toHaveLength(1);
    expect(chatter).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('stops Docker target creation at a cancelled yes/no choice', async () => {
    vi.mocked(select).mockResolvedValueOnce('docker');
    vi.mocked(text).mockResolvedValueOnce('new-target');
    vi.mocked(confirm).mockResolvedValueOnce(CANCEL_SYMBOL);
    await runConfig('targets', 'add');
    expect(text).toHaveBeenCalledTimes(1);
    expect(await readFile(configFile(), 'utf8')).toBe(initial);
  });

  it('stops SSH target creation at the optional passphrase', async () => {
    vi.mocked(select).mockResolvedValueOnce('ssh').mockResolvedValueOnce('key');
    for (const answer of ['new-target', 'fixture.example.test', '22', 'fixture', '/fixture/key']) {
      vi.mocked(text).mockResolvedValueOnce(answer);
    }
    vi.mocked(password).mockResolvedValueOnce(CANCEL_SYMBOL);
    await runConfig('targets', 'add');
    expect(await readFile(configFile(), 'utf8')).toBe(initial);
  });

  it('stops Kubernetes target creation at the optional container', async () => {
    vi.mocked(select).mockResolvedValueOnce('kubernetes');
    for (const answer of ['new-target', 'pod', 'namespace', CANCEL_SYMBOL]) {
      vi.mocked(text).mockResolvedValueOnce(answer as string | typeof CANCEL_SYMBOL);
    }
    await runConfig('targets', 'add');
    expect(text).toHaveBeenCalledTimes(4);
    expect(await readFile(configFile(), 'utf8')).toBe(initial);
  });

  it('rejects an unattended editor before displaying prompts', async () => {
    setTTY(process.stdin, false);
    await expect(runConfig('defaults', 'ssh')).rejects.toThrow('interactive terminal');
    expect(text).not.toHaveBeenCalled();
    expect(await readFile(configFile(), 'utf8')).toBe(initial);
  });

  it.each(['--quiet', '--output=json'])('rejects prompts with %s', async (option) => {
    await expect(runConfig('targets', 'add', option)).rejects.toThrow('interactive terminal');
    expect(select).not.toHaveBeenCalled();
  });
});

describe('named configuration arguments reach the shared implementation', () => {
  it('writes the supplied variable and preserves an explicit empty string without prompting', async () => {
    setTTY(process.stdin, false);
    await runConfig('vars', 'set', 'NEW_VALUE', 'provided');
    await runConfig('vars', 'set', 'EMPTY', '');
    expect((await readConfig()).vars).toEqual({ EXISTING: 'kept', NEW_VALUE: 'provided', EMPTY: '' });
    expect(text).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('deletes only the explicitly named target after approval', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(true);
    await runConfig('targets', 'delete', 'primary');
    const config = await readConfig();
    expect(config.targets.hosts).not.toHaveProperty('primary');
    expect(config.targets.containers).toHaveProperty('duplicate');
    expect(select).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: "Delete target 'hosts.primary'?" }));
  });

  it('requires an unambiguous explicit target', async () => {
    await expect(runConfig('targets', 'delete', 'duplicate', '--force')).rejects.toThrow('ambiguous');
    expect(await readFile(configFile(), 'utf8')).toBe(initial);
    await runConfig('targets', 'delete', 'containers.duplicate', '--force');
    expect((await readConfig()).targets.hosts).toHaveProperty('duplicate');
    expect((await readConfig()).targets.containers).not.toHaveProperty('duplicate');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('never deletes on cancellation even when the caller named an item', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(CANCEL_SYMBOL);
    await runConfig('tasks', 'delete', 'first');
    expect(await readFile(configFile(), 'utf8')).toBe(initial);
    expect(select).not.toHaveBeenCalled();
  });

  it('requires force for unattended deletion and honors its exact scope', async () => {
    setTTY(process.stdin, false);
    await expect(runConfig('vars', 'delete', 'EXISTING')).rejects.toThrow('interactive terminal');
    await runConfig('tasks', 'delete', 'first', '--force');
    expect((await readConfig()).tasks).toEqual({ second: { command: 'echo second' } });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('imports and exports the supplied file paths', async () => {
    setTTY(process.stdin, false);
    const source = join(directory, 'source.env');
    const destination = join(directory, 'selected.env');
    await writeFile(source, 'FROM_FILE="correct=value"\n');
    await runConfig('vars', 'import', source);
    expect((await readConfig()).vars.FROM_FILE).toBe('correct=value');
    await runConfig('vars', 'export', destination);
    expect(await readFile(destination, 'utf8')).toContain('FROM_FILE="correct=value"');
    expect(text).not.toHaveBeenCalled();
  });

  it('views the named task and refuses a missing task without selecting another', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runConfig('tasks', 'view', 'second');
    expect(select).not.toHaveBeenCalled();
    await expect(runConfig('tasks', 'view', 'missing')).rejects.toThrow('not found');
    output.mockRestore();
  });

  it('honors dry-run for a supplied variable', async () => {
    await runConfig('vars', 'set', 'NEW_VALUE', 'provided', '--dry-run');
    expect(await readFile(configFile(), 'utf8')).toBe(initial);
  });
});

describe('interactive CLI cancellation', () => {
  it('ends the inspector when its category selector is cancelled', async () => {
    vi.mocked(select).mockResolvedValueOnce(CANCEL_SYMBOL);
    await inspectProject();
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('ends the inspector when an item selector is cancelled', async () => {
    vi.mocked(select).mockResolvedValueOnce('tasks').mockResolvedValueOnce(CANCEL_SYMBOL);
    await inspectProject();
    expect(select).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('refuses interactive inspection in machine output mode', async () => {
    await expect(inspectProject(undefined, undefined, { output: 'json' })).rejects.toThrow('Specify a category');
    expect(select).not.toHaveBeenCalled();
  });

  it('uses the canonical resolver for configured targets and its identifiers', async () => {
    const manager = new ConfigurationManager({ projectRoot: directory });
    await manager.load();
    vi.spyOn(InteractiveHelpers, 'getConfigManager').mockResolvedValue(manager);
    vi.mocked(select).mockImplementationOnce(async options => options.options[0]!.value);
    const target = await InteractiveHelpers.selectTarget({ message: 'Host', type: 'ssh' });
    expect(target).toMatchObject({ id: 'hosts.primary', type: 'ssh', name: 'primary' });
    const choices = vi.mocked(select).mock.calls[0]![0].options;
    expect(choices).toHaveLength(2);
  });

  it('unwinds an optional choice and stops subsequent questions', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(CANCEL_SYMBOL);
    await expect(InteractiveHelpers.confirmAction('Optional?', true)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(InteractiveHelpers.inputText('Next')).rejects.toMatchObject({ name: 'AbortError' });
    expect(text).not.toHaveBeenCalled();
  });

  it('retains false as a real choice and forwards the owning cancellation signal', async () => {
    const controller = new AbortController();
    execution.signal = controller.signal;
    InteractiveHelpers.setupCancelHandlers();
    vi.mocked(confirm).mockResolvedValueOnce(false);
    expect(await InteractiveHelpers.confirmAction('Optional?', true)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
    controller.abort();
    await expect(InteractiveHelpers.inputText('Next')).rejects.toMatchObject({ name: 'AbortError' });
    expect(text).not.toHaveBeenCalled();
  });
});


describe('scaffolding cancellation and terminal ownership', () => {
  it('stops before artifact selection when project initialization is cancelled', async () => {
    await rm(join(directory, '.xec'), { recursive: true });
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'existing-project' }));
    vi.mocked(confirm).mockResolvedValueOnce(CANCEL_SYMBOL);
    await createArtifact();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    await expect(readFile(configFile(), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects an unnamed unattended invocation before opening a prompt', async () => {
    setTTY(process.stdin, false);
    await expect(createArtifact()).rejects.toThrow('Specify the artifact type and name');
    expect(confirm).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(await readFile(configFile(), 'utf8')).toBe(initial);
  });
});
