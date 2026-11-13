import { execFile } from 'node:child_process';
import { it, expect, describe } from 'vitest';

const kit = new URL('../src/index.ts', import.meta.url).href;

function run(source: string) {
  return new Promise<{ code: number | string; stdout: string; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', source],
      { timeout: 10_000, env: { ...process.env, CI: 'true' } },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
    );
  });
}

describe('indicator process signals', () => {
  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const)('preserves %s termination after cleanup', async (signal, code) => {
    const child = await run(`
      import { spinner } from ${JSON.stringify(kit)};
      spinner().start('Working');
      setInterval(() => {}, 1000);
      process.kill(process.pid, ${JSON.stringify(signal)});
    `);
    expect(child.code, child.stderr).toBe(code);
    expect(child.stdout).toContain('Working');
    expect(child.stdout).toContain('Canceled');
  });

  it('lets an existing SIGINT owner finish asynchronous cleanup', async () => {
    const child = await run(`
      import { spinner } from ${JSON.stringify(kit)};
      process.on('SIGINT', () => setTimeout(() => { console.log('owner cleaned'); process.exit(17); }, 20));
      spinner().start('Working');
      setInterval(() => {}, 1000);
      process.kill(process.pid, 'SIGINT');
    `);
    expect(child.code, child.stderr).toBe(17);
    expect(child.stdout).toContain('owner cleaned');
  });

  it('lets onCancel own cancellation and await cleanup', async () => {
    const child = await run(`
      import { spinner } from ${JSON.stringify(kit)};
      spinner({ onCancel: async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        console.log('callback cleaned'); process.exit(19);
      } }).start('Working');
      setInterval(() => {}, 1000);
      process.kill(process.pid, 'SIGINT');
    `);
    expect(child.code, child.stderr).toBe(19);
    expect(child.stdout).toContain('callback cleaned');
  });
});
