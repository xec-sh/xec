import { LocalAdapter } from '../../../src/adapters/local/index.js';

it('redacts credentials from failed local command messages and structured output', async () => {
  const adapter = new LocalAdapter({});
  try {
    await adapter.execute({ command: process.execPath, shell: false,
      args: ['-e', 'process.stderr.write(process.argv.slice(1).join(" "));process.exit(9)', '--',
        '--rpc-login=service:rpc-secret-fixture', '--health-cmd',
        'curl --digest --user "service:health secret fixture" http://localhost:18082/health'],
    });
    throw new Error('Expected command failure');
  } catch (error) {
    const failure = error as Error & { command?: string; stderr?: string };
    expect(failure.message).toContain('[REDACTED]');
    for (const value of [failure.message, failure.command, failure.stderr]) {
      expect(value).not.toContain('rpc-secret-fixture');
      expect(value).not.toContain('health secret fixture');
    }
    expect(failure.message).toContain('18082/health');
  } finally { await adapter.dispose(); }
});
