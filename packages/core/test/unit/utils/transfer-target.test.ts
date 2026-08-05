import { TransferEngine } from '../../../src/utils/transfer.js';
import { ExecutionEngine, createCallableEngine } from '../../../src/index.js';

/**
 * The target-aware half of the transfer engine. `upload`/`download` resolve the
 * remote side from the engine's own target, so `$.ssh(host).transfer.upload(...)`
 * reaches `host` instead of silently copying on the operator's machine (which is
 * what `copy()` with two flat paths does — it reads the environment only from
 * ssh:// / docker:// URLs).
 *
 * The execution boundary is stubbed (the leaf `execute`/`ssh` on the *local*
 * control engine) so the real routing — target resolution, direction dispatch
 * and command construction — is exercised without touching docker/kubectl/SSH.
 */
describe('TransferEngine target-aware upload/download', () => {
  interface Recorder {
    exec: string[];
    ssh: Array<[string, string, string]>;
  }

  function fakeEngine(targetInfo: unknown): { engine: unknown; calls: Recorder } {
    const calls: Recorder = { exec: [], ssh: [] };

    const sshContext = (host: string) =>
      Object.assign(async () => ({ stdout: '', stderr: '', exitCode: 0 }), {
        uploadFile: async (local: string, remote: string) => {
          calls.ssh.push(['uploadFile', local, `${host}:${remote}`]);
        },
        uploadDirectory: async (local: string, remote: string) => {
          calls.ssh.push(['uploadDirectory', local, `${host}:${remote}`]);
        },
        downloadFile: async (remote: string, local: string) => {
          calls.ssh.push(['downloadFile', `${host}:${remote}`, local]);
        }
      });

    const local = {
      execute: async ({ command }: { command: string }) => {
        calls.exec.push(command);
        return { stdout: '', stderr: '', exitCode: 0 };
      },
      ssh: (opts: { host: string }) => sshContext(opts.host)
    };

    // control() returns engine.local(); targetInfo is read from the engine.
    const engine = { targetInfo, local: () => local };
    return { engine, calls };
  }

  it('docker upload builds `docker cp <src> <container>:<dest>` on the local engine', async () => {
    const { engine, calls } = fakeEngine({ type: 'docker', container: 'api' });
    const transfer = new TransferEngine(engine as never);

    const result = await transfer.upload('/local/dist', '/srv/app');

    expect(result.success).toBe(true);
    expect(calls.exec).toContain('docker cp /local/dist api:/srv/app');
  });

  it('docker download builds `docker cp <container>:<src> <dest>`', async () => {
    const { engine, calls } = fakeEngine({ type: 'docker', container: 'api' });
    const transfer = new TransferEngine(engine as never);

    await transfer.download('/srv/app/log.txt', '/local/log.txt');

    expect(calls.exec).toContain('docker cp api:/srv/app/log.txt /local/log.txt');
  });

  it('k8s upload carries namespace, container and context flags', async () => {
    const { engine, calls } = fakeEngine({
      type: 'kubernetes',
      pod: 'web-0',
      namespace: 'prod',
      container: 'app',
      context: 'prod-cluster'
    });
    const transfer = new TransferEngine(engine as never);

    await transfer.upload('/local/x', '/etc/x');

    expect(calls.exec).toContain(
      'kubectl cp /local/x web-0:/etc/x -n prod -c app --context prod-cluster'
    );
  });

  it('k8s download reverses the peer order', async () => {
    const { engine, calls } = fakeEngine({ type: 'kubernetes', pod: 'web-0', namespace: 'prod' });
    const transfer = new TransferEngine(engine as never);

    await transfer.download('/etc/x', '/local/x');

    expect(calls.exec).toContain('kubectl cp web-0:/etc/x /local/x -n prod');
  });

  it('ssh upload routes through SFTP to the engine host, not a local cp', async () => {
    const { engine, calls } = fakeEngine({ type: 'ssh', host: 'web-1', username: 'deploy' });
    const transfer = new TransferEngine(engine as never);

    await transfer.upload('/local/app.tar', '/srv/app.tar');

    expect(calls.ssh).toContainEqual(['uploadFile', '/local/app.tar', 'web-1:/srv/app.tar']);
    expect(calls.exec).toHaveLength(0);
  });

  it('ssh download routes through SFTP from the engine host', async () => {
    const { engine, calls } = fakeEngine({ type: 'ssh', host: 'web-1', username: 'deploy' });
    const transfer = new TransferEngine(engine as never);

    await transfer.download('/srv/app.log', '/local/app.log');

    expect(calls.ssh).toContainEqual(['downloadFile', 'web-1:/srv/app.log', '/local/app.log']);
  });

  it('flat paths stay local even on a target engine (copy is unchanged)', async () => {
    // The defect this feature works around: copy() with two flat paths must NOT
    // start meaning "on the target". It stays a local cp, run on the control
    // engine — never `docker cp`.
    const { engine, calls } = fakeEngine({ type: 'docker', container: 'api' });
    const transfer = new TransferEngine(engine as never);

    await transfer.copy('/local/a', '/local/b');

    expect(calls.exec.some(c => c.startsWith('cp '))).toBe(true);
    expect(calls.exec.some(c => c.includes('docker cp'))).toBe(false);
  });

  it('rejects upload source / download dest that is not local', async () => {
    const { engine } = fakeEngine({ type: 'docker', container: 'api' });
    const transfer = new TransferEngine(engine as never);

    await expect(transfer.upload('ssh://other/x', '/srv/x')).rejects.toThrow(/local source/);
    await expect(transfer.download('/srv/x', 'docker://other:/x')).rejects.toThrow(/local destination/);
  });

  describe('bare $ has no target', () => {
    it('exposes targetInfo undefined and refuses upload/download', async () => {
      const engine = new ExecutionEngine();
      const $ = createCallableEngine(engine);

      expect(engine.targetInfo).toBeUndefined();
      await expect($.transfer.upload('/a', '/b')).rejects.toThrow(/no target|bound to a target/);
      await expect($.transfer.download('/b', '/a')).rejects.toThrow(/no target|bound to a target/);
    });

    it('a docker target engine exposes its descriptor via targetInfo', () => {
      const $ = createCallableEngine(new ExecutionEngine());
      const dockerEngine = $.docker('api') as ExecutionEngine;

      expect(dockerEngine.targetInfo).toEqual(
        expect.objectContaining({ type: 'docker', container: 'api' })
      );
    });
  });
});
