import { getEventListeners } from 'node:events';

import { LocalAdapter } from '../../../src/adapters/local/index.js';

describe('local command cancellation lifetime', () => {
  const command = (script: string) => ({ command: process.execPath, args: ['-e', script], shell: false, timeout: 5000 });
  const adapter = () => new LocalAdapter({ forceImplementation: 'node' });

  it('detaches cancellation after success so a later abort cannot address a recycled process', async () => {
    const controller = new AbortController();
    const result = await adapter().execute({ ...command('process.stdout.write("done")'), signal: controller.signal });
    expect(result.stdout).toBe('done');
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    controller.abort();
    expect(result.exitCode).toBe(0);
  });

  it('detaches after nonzero exit and native spawn failure', async () => {
    for (const spec of [command('process.exit(7)'), { ...command(''), command: 'xec-nonexistent-abort-fixture' }]) {
      const controller = new AbortController();
      await expect(adapter().execute({ ...spec, signal: controller.signal })).rejects.toThrow();
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    }
  });

  it('detaches after timeout', async () => {
    const controller = new AbortController();
    await expect(adapter().execute({ ...command('setInterval(()=>{},1000)'), timeout: 100, signal: controller.signal })).rejects.toThrow();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('does not spawn when the signal was already cancelled', async () => {
    const controller = new AbortController(); controller.abort();
    const spawned = vi.fn();
    await expect(adapter().execute({ ...command('setInterval(()=>{},1000)'), signal: controller.signal, onSpawn: spawned })).rejects.toThrow();
    expect(spawned).not.toHaveBeenCalled();
  });

  it('handles cancellation requested synchronously by the spawn observer', async () => {
    const controller = new AbortController();
    await expect(adapter().execute({ ...command('setInterval(()=>{},1000)'), signal: controller.signal,
      onSpawn: () => controller.abort(new Error('cancelled at spawn')) })).rejects.toThrow();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('still cancels a running command and releases its listener', async () => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await adapter().execute({ ...command('setInterval(()=>{},1000)'), signal: controller.signal, nothrow: true,
        onSpawn: () => { timer = setTimeout(() => controller.abort(), 100); } });
      expect(result.exitCode).not.toBe(0);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    } finally { if (timer) clearTimeout(timer); }
  });
});
