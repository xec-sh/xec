import { describe, it, expect } from 'vitest';
import { HealthChecker } from '../../src/health/index.js';

describe('HealthChecker', () => {
  it('should pass command check', async () => {
    const checker = HealthChecker.create()
      .command('echo healthy', { contains: 'healthy' });

    const report = await checker.run();
    expect(report.healthy).toBe(true);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]!.healthy).toBe(true);
  });

  it('should fail command check when output missing', async () => {
    const checker = HealthChecker.create()
      .command('echo hello', { contains: 'missing-string' });

    const report = await checker.run();
    expect(report.healthy).toBe(false);
  });

  it('should pass custom check', async () => {
    const checker = HealthChecker.create()
      .custom('always-ok', async () => true);

    const report = await checker.run();
    expect(report.healthy).toBe(true);
    expect(report.summary.healthy).toBe(1);
  });

  it('should fail custom check', async () => {
    const checker = HealthChecker.create()
      .custom('always-fail', async () => false);

    const report = await checker.run();
    expect(report.healthy).toBe(false);
    expect(report.summary.unhealthy).toBe(1);
  });

  it('should aggregate multiple checks', async () => {
    const checker = HealthChecker.create()
      .command('echo ok')
      .custom('good', async () => true)
      .custom('bad', async () => false);

    const report = await checker.run();
    expect(report.healthy).toBe(false);
    expect(report.summary.total).toBe(3);
    expect(report.summary.healthy).toBe(2);
    expect(report.summary.unhealthy).toBe(1);
  });

  it('should run checks sequentially when requested', async () => {
    const order: string[] = [];
    const checker = HealthChecker.create()
      .custom('first', async () => { order.push('first'); return true; })
      .custom('second', async () => { order.push('second'); return true; });

    await checker.run({ sequential: true });
    expect(order).toEqual(['first', 'second']);
  });

  it('should include timing in report', async () => {
    const checker = HealthChecker.create()
      .custom('timed', async () => {
        await new Promise(r => setTimeout(r, 50));
        return true;
      });

    const report = await checker.run();
    expect(report.duration).toBeGreaterThanOrEqual(40);
    expect(report.checks[0]!.duration).toBeGreaterThanOrEqual(40);
  });
});
