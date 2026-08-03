import { ExecutionEngine } from '../../../src/core/execution-engine.js';

import type { UshEventMap } from '../../../src/types/events.js';

/**
 * Events are consumed by loggers and telemetry sinks, so anything they publish
 * must already be safe to persist. These tests pin that contract.
 */
describe('event payloads must not leak credentials', () => {
  const SECRET = 'sk_live_51H8totallysecretvalue';

  it('publishes environment variable names but never their values', async () => {
    const engine = new ExecutionEngine();
    const events: UshEventMap['command:start'][] = [];
    engine.on('command:start', event => events.push(event));

    await engine.execute({
      command: 'echo hi',
      shell: true,
      env: { AWS_SECRET_ACCESS_KEY: SECRET, PATH: process.env['PATH'] ?? '' },
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.envKeys).toContain('AWS_SECRET_ACCESS_KEY');

    // The whole payload, not just the env field: a secret must not reach a
    // listener through any property.
    expect(JSON.stringify(events[0])).not.toContain(SECRET);

    await engine.dispose();
  });

  it('redacts credentials embedded in the command itself', async () => {
    const engine = new ExecutionEngine();
    const seen: string[] = [];
    engine.on('command:start', event => seen.push(event.command));
    engine.on('command:complete', event => seen.push(event.command));

    await engine.execute({
      command: `echo token=${SECRET}`,
      shell: true,
    });

    expect(seen.length).toBeGreaterThan(0);

    for (const command of seen) {
      expect(command).not.toContain(SECRET);
      expect(command).toContain('[REDACTED]');
    }

    await engine.dispose();
  });
});
