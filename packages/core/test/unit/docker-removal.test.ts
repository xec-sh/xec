import { describe, expect, it, vi } from 'vitest';
import { DockerAdapter } from '../../src/adapters/docker/index.js';

const first = 'a'.repeat(64), replacement = 'b'.repeat(64);
const result = (stdout = '', exitCode = 0, stderr = '') => ({ stdout, stderr, exitCode, stdall: stdout, signal: null });
const inventory = (id = first) => result(JSON.stringify({ ID: id, Names: 'owned' }));
function adapter(...answers: ReturnType<typeof result>[]) {
  const instance = new DockerAdapter();
  const command = vi.spyOn(instance as any, 'executeDockerCommand');
  for (const answer of answers) command.mockResolvedValueOnce(answer);
  return { instance, command };
}

describe('confirmed container removal', () => {
  it('pins the immutable ID and verifies absence', async () => {
    const { instance, command } = adapter(inventory(), result(first), result());
    await instance.removeContainer('owned', true);
    expect(command.mock.calls[1]?.[0]).toEqual(['rm', '-f', '--', first]);
    expect(command).toHaveBeenCalledTimes(3);
  });
  it('is idempotent for an observed absent container without sending rm', async () => {
    const { instance, command } = adapter(result());
    await instance.removeContainer('owned', true);
    expect(command).toHaveBeenCalledTimes(1);
  });
  it('never treats a failed inventory as empty', async () => {
    const { instance, command } = adapter(result('', 1, 'Cannot connect to Docker'));
    await expect(instance.removeContainer('owned', true)).rejects.toThrow('Cannot connect');
    expect(command).toHaveBeenCalledTimes(1);
  });
  it('reports a failed removal while the container still exists', async () => {
    const { instance } = adapter(inventory(), result('', 1, 'permission denied'), inventory());
    await expect(instance.removeContainer('owned')).rejects.toThrow('permission denied');
  });
  it('accepts a competing removal only after confirming absence', async () => {
    const { instance } = adapter(inventory(), result('', 1, 'No such container'), result());
    await instance.removeContainer('owned');
  });
  it('does not acknowledge an unobserved result when Docker goes away', async () => {
    const { instance } = adapter(inventory(), result(), result('', 1, 'daemon offline'));
    await expect(instance.removeContainer('owned')).rejects.toThrow('daemon offline');
  });
  it('does not remove a replacement that now occupies the original name', async () => {
    const { instance, command } = adapter(inventory(), result(), inventory(replacement));
    await expect(instance.removeContainer('owned')).rejects.toThrow('replaced');
    expect(command.mock.calls.filter(call => (call[0] as string[])[0] === 'rm')).toHaveLength(1);
    expect(command.mock.calls[1]?.[0]).toEqual(['rm', '--', first]);
  });
  it('rejects option injection, ambiguous IDs and malformed inventories', async () => {
    const { instance, command } = adapter();
    await expect(instance.removeContainer('--all')).rejects.toThrow('Invalid container');
    expect(command).not.toHaveBeenCalled();
    const ambiguous = adapter(result([first, 'a' + 'b'.repeat(63)].map(ID => JSON.stringify({ ID, Names: ID })).join('\n')));
    await expect(ambiguous.instance.removeContainer('a')).rejects.toThrow('Ambiguous');
    const malformed = adapter(result(JSON.stringify({ Names: 'owned' })));
    await expect(malformed.instance.removeContainer('owned')).rejects.toThrow('Malformed');
  });
});
