import type { Command } from '../../src/types/command.js';
import type { ProcessHandle } from '../../src/types/process-handle.js';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { rm, open, mkdtemp, readFile } from 'node:fs/promises';

import { DockerAdapter } from '../../src/adapters/docker/index.js';

const image = process.env['XEC_DOCKER_OWNERSHIP_IMAGE'];
const execute = promisify(execFile);
const docker = async (args: string[]) => (await execute('docker', args, { encoding: 'utf8', timeout: args[0] === 'create' ? 60_000 : 10_000 })).stdout.trim();
// Explicit opt-in: tests never pull images or inspect/mutate application resources.
describe.skipIf(!image)('owned execution against Docker', () => {
  const label = `xec.ownership-test=${randomUUID()}`;
  const ids = new Set<string>();
  let neighbor: string;
  let adapter: DockerAdapter;

  const target = () => ({ type: 'docker' as const, container: `xec-owned-${randomUUID()}`, image: image!, runMode: 'run' as const,
    network: 'none', pull: 'never' as const, resources: { cpus: 0.25, memoryBytes: 32 * 1024 ** 2, pidsLimit: 16 }, labels: { 'xec.ownership-test': label.split('=')[1]! }, autoRemove: false });
  const remember = (handle: ProcessHandle) => {
    expect(handle.resource).toEqual({ type: 'docker-container', id: expect.stringMatching(/^[a-f0-9]{64}$/), operationId: expect.stringMatching(/^[a-f0-9-]{36}$/), daemonId: expect.any(String) });
    ids.add(handle.resource!.id);
  };
  const state = async (id: string) => JSON.parse(await docker(['inspect', '--format', '{{json .State}}', '--', id]));
  beforeAll(async () => {
    expect(await docker(['image', 'inspect', image!, '--format', '{{.Id}}'])).toMatch(/^sha256:[a-f0-9]{64}$/);
    neighbor = await docker(['create', '--pull=never', '--cpus=0.25', '--memory=32m', '--pids-limit=16', '--network=none', '--label', label,
      image!, 'sleep', '600']);
    ids.add(neighbor);
    await docker(['start', '--', neighbor]);
  });
  beforeEach(() => { adapter = new DockerAdapter({ managementTimeout: 8_000 }); });
  afterEach(async () => { await adapter.dispose(); });
  afterAll(async () => {
    // Reconcile an interrupted create response by this invocation's unique label.
    for (const id of (await docker(['ps', '-a', '--no-trunc', '--filter', `label=${label}`, '--format', '{{.ID}}'])).split('\n')) {
      if (/^[a-f0-9]{64}$/.test(id)) ids.add(id);
    }
    // Only immutable IDs with this invocation's unique ownership label qualify.
    for (const id of ids) {
      const current = await docker(['ps', '-a', '--no-trunc', '--filter', `id=${id}`, '--filter', `label=${label}`, '--format', '{{.ID}}']);
      if (current === id) await docker(['rm', '-f', '--', id]);
    }
  });

  it('preserves binary stdout with backpressure and a nonzero remote exit', async () => {
    const bytes: Buffer[] = [];
    const stdout = new Writable({ write(chunk, _encoding, done) { bytes.push(Buffer.from(chunk)); setTimeout(done, 10); } });
    const onSpawn = vi.fn(remember);
    const result = await adapter.execute({ command: 'sh', args: ['-c', "printf '\\000\\377\\001'; exit 7"], shell: false,
      stdout, nothrow: true, timeout: 60_000, onSpawn, adapterOptions: target() });
    expect(result.exitCode).toBe(7);
    expect(Buffer.concat(bytes)).toEqual(Buffer.from([0, 255, 1]));
    expect(onSpawn).toHaveBeenCalledOnce();
    expect(await state(onSpawn.mock.calls[0]![0].resource!.id)).toMatchObject({ Running: false, Pid: 0, ExitCode: 7 });
  });

  it.each([false, true])('records the Docker identity before cleanup after cancelled create (lost reply: %s)', async lostReply => {
    const controller = new AbortController();
    class CancelledCreationDocker extends DockerAdapter {
      protected override async executeDockerCommand(args: string[], options: Partial<Command>, management = false) {
        const result = await super.executeDockerCommand(args, options, management);
        if (args[0] === 'create' && result.exitCode === 0) {
          ids.add(result.stdout.trim());
          controller.abort(new Error('test cancellation after Docker creation'));
          if (lostReply) throw new Error('test lost creation acknowledgement');
        }
        return result;
      }
    }
    adapter = new CancelledCreationDocker({ managementTimeout: 30_000 });
    const directory = await mkdtemp(join(tmpdir(), 'xec-docker-receipt-'));
    const journal = join(directory, 'resource.json');
    const onSpawn = vi.fn(remember);
    try {
      await expect(adapter.execute({ command: 'sh', args: ['-c', 'exit 42'], shell: false,
        signal: controller.signal, timeout: 60_000, onSpawn, adapterOptions: target(),
        onResource: async (resource, signal) => {
          signal.throwIfAborted();
          if (resource.id) expect(await state(resource.id)).toMatchObject({ Running: false, Pid: 0, Status: 'created' });
          const file = await open(journal, 'w', 0o600);
          try { await file.writeFile(JSON.stringify(resource)); await file.sync(); }
          finally { await file.close(); }
        },
      })).rejects.toThrow(lostReply ? 'Container creation was not acknowledged' : 'test cancellation');
      const resource = JSON.parse(await readFile(journal, 'utf8'));
      expect(resource.id).toMatch(/^[a-f0-9]{64}$/);
      expect(onSpawn).not.toHaveBeenCalled();
      await expect(adapter.inspectExecution(resource)).resolves.toEqual({ resource, state: 'absent' });
      expect(await state(neighbor)).toMatchObject({ Running: true });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it.each(['timeout', 'abort', 'handle', 'dispose'] as const)('confirms owned termination after %s while preserving its neighbor', async mode => {
    const controller = new AbortController();
    let handle: ProcessHandle | undefined;
    let ready!: () => void;
    const started = new Promise<void>(resolve => { ready = resolve; });
    const stdout = new Writable({ write(chunk, _encoding, done) { if (chunk.toString().includes('ready')) ready(); done(); } });
    const command = adapter.execute({ command: 'sh', args: ['-c', "trap '' TERM; printf ready; while :; do sleep 1; done"], shell: false,
      stdout, nothrow: true, timeout: 60_000, signal: controller.signal,
      onSpawn: value => { remember(value); handle = value; }, adapterOptions: target() }).then(result => ({ result }), error => ({ error }));
    await Promise.race([started, command.then(outcome => { throw 'error' in outcome ? outcome.error : new Error('Command exited before readiness'); })]);
    if (mode === 'abort') controller.abort(new Error('test cancellation'));
    if (mode === 'handle') handle!.kill('SIGKILL');
    if (mode === 'dispose') await adapter.dispose();
    const outcome = await command;
    if (mode === 'timeout') expect(outcome).toMatchObject({ result: { exitCode: 124 } });
    if (mode === 'abort' || mode === 'dispose') expect(outcome).toHaveProperty('error');
    expect(await state(handle!.resource!.id)).toMatchObject({ Running: false, Pid: 0 });
    expect(await state(neighbor)).toMatchObject({ Running: true });
  });
});
