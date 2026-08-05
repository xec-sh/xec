import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';

import { streamLines, streamExecute } from '../../../src/core/streaming-executor.js';

/**
 * Both streaming entry points run the script in a child process. A failure to
 * spawn the runtime must reach the caller — the async iterator used to swallow
 * it and simply end, so a missing runtime looked identical to a script that
 * produced no output and exited cleanly.
 */
describe('streaming-executor: error surfacing', () => {
  let tempDir: string;
  let script: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-stream-'));
    script = path.join(tempDir, 'ok.mjs');
    await fs.writeFile(script, `console.log('hello-from-child');`);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('streamLines throws when the runtime cannot be spawned', async () => {
    const drain = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of streamLines(script, { runtime: '/no/such/runtime-xyz' })) {
        // no events are expected; the spawn fails
      }
    };

    await expect(drain()).rejects.toThrow();
  });

  it('streamExecute rejects when the runtime cannot be spawned', async () => {
    await expect(
      streamExecute(script, { runtime: '/no/such/runtime-xyz' })
    ).rejects.toThrow();
  });

  it('streamLines yields the child output line by line', async () => {
    const lines: string[] = [];
    for await (const event of streamLines(script)) {
      if (event.type === 'stdout') lines.push(event.line);
    }

    expect(lines).toContain('hello-from-child');
  });
});
