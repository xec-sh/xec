import type { ExecutionEngine } from '../../../src/core/execution-engine.js';

import { it, vi, expect, describe } from 'vitest';

import { DockerAdapter } from '../../../src/adapters/docker/index.js';
import { DockerContainer } from '../../../src/adapters/docker/docker-api.js';

const success = { stdout: '', stderr: '', exitCode: 0, signal: null };

function fixture() {
  const adapter = new DockerAdapter({ managementTimeout: 2500 });
  const execute = vi.spyOn(adapter as any, 'executeDockerCommand').mockResolvedValue(success);
  return { adapter, execute };
}

describe('Docker graceful-stop contract', () => {
  it.each([0, 5, 120, 600])('honours %s seconds and reserves time to receive Docker acknowledgement', async (seconds) => {
    const { adapter, execute } = fixture();
    await adapter.stopContainer('owned', seconds);
    expect(execute).toHaveBeenCalledExactlyOnceWith(['stop', '--timeout', String(seconds), '--', 'owned'],
      expect.objectContaining({ timeout: seconds * 1000 + 2500 }));
  });

  it('preserves the configured Docker default when no grace interval is supplied', async () => {
    const { adapter, execute } = fixture();
    await adapter.stopContainer('owned');
    expect(execute).toHaveBeenCalledExactlyOnceWith(['stop', '--', 'owned'], expect.objectContaining({ timeout: 2500 }));
  });

  it('preserves an explicitly disabled management deadline', async () => {
    const adapter = new DockerAdapter({ managementTimeout: 0 });
    const execute = vi.spyOn(adapter as any, 'executeDockerCommand').mockResolvedValue(success);
    await adapter.stopContainer('owned', 120);
    expect(execute).toHaveBeenCalledExactlyOnceWith(['stop', '--timeout', '120', '--', 'owned'],
      expect.objectContaining({ timeout: 0 }));
  });

  it.each([-1, 601, 1.5, NaN, Infinity])('rejects invalid grace interval %s before executing anything', async (seconds) => {
    const { adapter, execute } = fixture();
    await expect(adapter.stopContainer('owned', seconds)).rejects.toThrow('Stop timeout');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(['--all', '', 'one two', 'one\ntwo'])('rejects invalid container reference %j before execution', async (container) => {
    const { adapter, execute } = fixture();
    await expect(adapter.stopContainer(container, 5)).rejects.toThrow('Invalid container');
    expect(execute).not.toHaveBeenCalled();
  });

  it('preserves a failed or unconfirmed stop as an error', async () => {
    const { adapter, execute } = fixture();
    execute.mockResolvedValueOnce({ ...success, exitCode: 1, stderr: 'permission denied' });
    await expect(adapter.stopContainer('owned', 5)).rejects.toThrow('permission denied');
    execute.mockRejectedValueOnce(new Error('transport timed out'));
    await expect(adapter.stopContainer('owned', 5)).rejects.toThrow('transport timed out');
  });

  it('forwards DockerContainer.stop grace and updates its state only after success', async () => {
    const { adapter, execute } = fixture();
    vi.spyOn(adapter, 'runContainer').mockResolvedValue();
    const container = new DockerContainer({} as ExecutionEngine, adapter, { name: 'owned', image: 'fixture' });
    await container.start();
    execute.mockRejectedValueOnce(new Error('transport timed out'));
    await expect(container.stop(5)).rejects.toThrow('transport timed out');
    expect(container.started).toBe(true);
    await container.stop(5);
    expect(container.started).toBe(false);
    expect(execute).toHaveBeenLastCalledWith(['stop', '--timeout', '5', '--', 'owned'],
      expect.objectContaining({ timeout: 7500 }));
  });

  it('uses the same stop budget during identity-pinned graceful removal', async () => {
    const { adapter, execute } = fixture();
    const id = 'a'.repeat(64);
    execute.mockResolvedValueOnce({ ...success, stdout: JSON.stringify({ ID: id, Names: 'owned' }) });
    await adapter.removeContainer('owned', false, { graceful: true, stopTimeoutSeconds: 120 });
    expect(execute).toHaveBeenNthCalledWith(2, ['stop', '--timeout', '120', '--', id],
      expect.objectContaining({ timeout: 122500 }));
  });
});
