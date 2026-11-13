import { tmpdir } from 'node:os';
import { inspect } from 'node:util';
import { createServer } from 'node:http';
import { join, delimiter } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { rm, access, mkdtemp, readFile, writeFile } from 'node:fs/promises';

import { Deployer } from '../../src/deploy/index.js';
import { Workflow } from '../../src/workflow/index.js';
import { Discovery } from '../../src/discovery/index.js';
import { HealthChecker } from '../../src/health/index.js';

let directory: string;
let script: string;
const exists = async (path: string) => access(path).then(() => true, () => false);
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const command = (mode: string, ...args: string[]) => ({ command: process.execPath, args: [script, mode, ...args], shell: false });
const waitForFile = (name: string) => vi.waitFor(async () => expect(await exists(join(directory, name))).toBe(true), { timeout: 5000, interval: 20 });

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'xec-ops-native-'));
  script = join(directory, 'child.cjs');
  await writeFile(script, `
const fs=require('node:fs');const path=require('node:path');
const [mode,...args]=process.argv.slice(2);
if(mode==='echo') process.stdout.write(JSON.stringify({args,env:process.env.OPS_NATIVE_ENV,cwd:process.cwd()}));
if(mode==='exit'){process.stdout.write(args[1]??'');process.exitCode=Number(args[0]);}
if(mode==='meet'){
  fs.writeFileSync(path.join(__dirname,args[0]+'.ready'),'ready');
  const deadline=setTimeout(()=>{process.stderr.write('rendezvous incomplete');process.exit(9)},4000);
  const poll=setInterval(()=>{if(fs.readdirSync(__dirname).filter(x=>x.endsWith('.ready')).length===2){
    clearTimeout(deadline);clearInterval(poll);process.stdout.write(args[0]);
  }},10);
}
if(mode==='wait'){
  const closed=path.join(__dirname,args[0]+'.closed');
  process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync(closed,'closed');process.exit(0)},80));
  fs.writeFileSync(path.join(__dirname,args[0]+'.pid'),String(process.pid));
  setInterval(()=>{},1000);
}
`);
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe('Ops native execution', () => {
  it('uses core escaping in deploy templates and passes declared environment and cwd', async () => {
    const value = 'literal ; $(printf injected) & "quoted"';
    let captured = '';
    const result = await Deployer.create({ name: 'fixture', targets: ['local'], strategy: 'rolling',
      env: { OPS_NATIVE_ENV: 'declared' }, cwd: directory,
      hooks: { deploy: async ctx => { captured = (await ctx.exec`${process.execPath} ${script} echo ${value}`).stdout; } },
    }).deploy('fixture-version');
    expect(result.success).toBe(true);
    expect(JSON.parse(captured)).toEqual({ args: [value], env: 'declared', cwd: directory });
  });

  it('does not mark a failed unawaited deploy command as success', async () => {
    const result = await Deployer.create({ name: 'fixture', targets: ['local'], strategy: 'rolling',
      hooks: { deploy: async ctx => { void ctx.exec(command('exit', '7')); } },
    }).deploy('fixture-version');
    expect(result.success).toBe(false);
    expect(result.targets[0]?.error).toContain('exit code 7');
  });

  it('executes workflow commands concurrently and preserves the trusted string overload', async () => {
    const workflow = Workflow.create('native')
      .task('first', async ctx => (await ctx.exec(command('meet', 'first'))).stdout, { parallel: true })
      .task('second', async ctx => (await ctx.exec(command('meet', 'second'))).stdout, { parallel: true })
      .task('trusted-source', async ctx => (await ctx.exec('echo trusted')).stdout, { dependsOn: ['first', 'second'] });
    const result = await workflow.run({ env: { OPS_NATIVE_ENV: 'workflow' } });
    expect(result.success).toBe(true);
    expect(result.tasks.map(task => task.output)).toEqual(['first', 'second', expect.stringContaining('trusted')]);
  });

  it('validates dependency graphs before any side effects and only blocks descendants', async () => {
    const run = vi.fn(async () => {});
    await expect(Workflow.create('bad').task('effect', run).task('cycle', run, { dependsOn: ['cycle'] }).run()).rejects.toThrow('Circular');
    await expect(Workflow.create('bad').task('effect', run).task('bad', run, { dependsOn: ['missing'] }).run()).rejects.toThrow('unknown task');
    expect(run).not.toHaveBeenCalled();
    const result = await Workflow.create('branches')
      .task('broken', async ctx => { await ctx.exec(command('exit', '7')); })
      .task('good', async () => 42)
      .task('dependent', run, { dependsOn: ['broken'] })
      .task('independent', async ctx => ctx.taskOutput('good'), { dependsOn: ['good'] }).run();
    expect(result.tasks[2]?.status).toBe('skipped');
    expect(result.tasks[3]).toMatchObject({ status: 'success', output: 42 });
  });

  it('waits for cooperative timeout cleanup before the next attempt', async () => {
    const events: string[] = [];
    let attempt = 0;
    const result = await Workflow.create('timed')
      .task('operation', async ctx => {
        const current = ++attempt;
        events.push(`start:${current}`);
        try {
          if (current === 1) await delay(60_000, undefined, { signal: ctx.signal });
        } finally { await delay(20); events.push(`end:${current}`); }
      }, { timeout: 60, retry: 2 }).run();
    expect(result.success).toBe(true);
    expect(events).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
  });

  it.skipIf(process.platform === 'win32')('returns from workflow cancellation only after the native child closes', async () => {
    const controller = new AbortController();
    const workflow = Workflow.create('cancel').task('wait', async ctx => { await ctx.exec(command('wait', 'workflow')); });
    const running = workflow.run({ signal: controller.signal });
    await waitForFile('workflow.pid');
    const pid = Number(await readFile(join(directory, 'workflow.pid'), 'utf8'));
    controller.abort(new Error('stop native test'));
    const result = await running;
    expect(result.success).toBe(false);
    expect(result.tasks[0]).toMatchObject({ cancelled: true });
    expect(alive(pid)).toBe(false);
    expect(await exists(join(directory, 'workflow.closed'))).toBe(true);
  });

  it('reports failure-handler errors and rollback-hook errors explicitly', async () => {
    const workflow = await Workflow.create('failure')
      .task('bad', async () => { throw new Error('task error'); })
      .onFailure(async ctx => { await ctx.exec(command('exit', '9')); }).run();
    expect(workflow.failureHandlerError).toContain('exit code 9');
    const deployment = await Deployer.create({ name: 'fixture', targets: ['local'], strategy: 'rolling', hooks: {
      deploy: async () => { throw new Error('deploy error'); },
      rollback: async ctx => { await ctx.exec(command('exit', '8')); },
      onError: async () => { throw new Error('handler error'); },
    } }).deploy('fixture-version');
    expect(deployment.targets[0]).toMatchObject({ success: false, rolledBack: false, handlerError: 'handler error' });
    expect(deployment.targets[0]?.rollbackError).toContain('exit code 8');
  });

  it('deploys the canary only once and waits for in-flight rolling work after failure', async () => {
    const targets: string[] = [];
    const canary = await Deployer.create({ name: 'fixture', targets: ['a', 'b', 'c'], strategy: 'canary',
      hooks: { deploy: async ctx => { targets.push(ctx.target); } },
    }).deploy('fixture-version');
    expect(canary.success).toBe(true);
    expect(targets).toEqual(['a', 'b', 'c']);
    let finished = false;
    const rolling = await Deployer.create({ name: 'fixture', targets: ['a', 'b', 'c'], strategy: 'rolling',
      maxConcurrent: 2, abortOnFirstFailure: true, hooks: { deploy: async ctx => {
        if (ctx.target === 'a') throw new Error('failure');
        await delay(40); finished = true;
      } },
    }).deploy('fixture-version');
    expect(finished).toBe(true);
    expect(rolling.targets[2]).toMatchObject({ skipped: true, success: false });
  });

  it('requires both the expected exit status and output in health checks', async () => {
    const report = await HealthChecker.create()
      .command(command('exit', '0', 'present'), { exitCode: 7 })
      .command(command('exit', '7', 'other'), { exitCode: 7, contains: 'present' })
      .command(command('exit', '7', 'token=synthetic-health-value'), { exitCode: 7, contains: 'token=synthetic-health-value' })
      .run();
    expect(report.checks.map(check => check.healthy)).toEqual([false, false, true]);
  });

  it('keeps the HTTP timeout active while reading a response body', async () => {
    const server = createServer((_request, response) => { response.writeHead(200); response.write('partial'); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    try {
      const report = await HealthChecker.create().http(`http://127.0.0.1:${typeof address === 'object' ? address?.port : 0}/`,
        { contains: 'complete', timeout: 100 }).run();
      expect(report.healthy).toBe(false);
      expect(report.checks[0]?.error).toMatch(/timeout|abort/i);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});

describe.skipIf(process.platform === 'win32')('Discovery native CLI sources', () => {
  beforeEach(async () => {
    for (const name of ['docker', 'kubectl']) await writeFile(join(directory, name), `#!${process.execPath}
const fs=require('node:fs');const path=require('node:path');const tool=path.basename(process.argv[1]);
fs.writeFileSync(path.join(__dirname,tool+'.args'),JSON.stringify(process.argv.slice(2)));
if(process.env.FAIL_SOURCE===tool){process.stderr.write('password=synthetic-discovery-secret');process.exit(7);}
const output=tool==='docker'?JSON.stringify({Names:'app',Labels:'token=synthetic-label=a',Image:'fixture'}):JSON.stringify({items:[{metadata:{name:'pod',namespace:'test',labels:{token:'synthetic-label'}},status:{phase:'Running'}}]});
if(process.env.WAIT_SOURCE){
 process.on('SIGTERM',()=>{fs.writeFileSync(path.join(__dirname,tool+'.closed'),'closed');process.exit(0)});
 fs.writeFileSync(path.join(__dirname,tool+'.pid'),String(process.pid));setInterval(()=>{},1000);
}else process.stdout.write(output);
`, { mode: 0o700 });
  });
  const env = () => ({ PATH: `${directory}${delimiter}${process.env.PATH}` });

  it('passes literal filter argv and parses exact protocol data', async () => {
    const label = 'app=x; $(printf injected)';
    const result = await Discovery.create().docker({ label }).kubernetes({ label, context: 'exact context' }).scan({ env: env() });
    expect(result).toHaveLength(2);
    expect(result[0]?.labels?.token).toBe('synthetic-label=a');
    expect(result[1]?.labels?.token).toBe('synthetic-label');
    expect(JSON.parse(await readFile(join(directory, 'docker.args'), 'utf8'))).toContain(`label=${label}`);
    expect(JSON.parse(await readFile(join(directory, 'kubectl.args'), 'utf8'))).toContain(label);
  });

  it('exposes source failures and settles other sources before returning', async () => {
    let settled = false;
    const discovery = Discovery.create().docker().custom('slow', async () => { await delay(80); settled = true; return []; });
    const failure = await discovery.scan({ env: { ...env(), FAIL_SOURCE: 'docker' } }).catch(error => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.message).toBe('Discovery failed');
    expect(inspect(failure, { depth: null })).not.toContain('synthetic-discovery-secret');
    expect(inspect(failure, { depth: null })).toContain('[REDACTED]');
    expect(settled).toBe(true);
  });

  it('cancels native discovery and joins its process before rejecting', async () => {
    const controller = new AbortController();
    const pending = Discovery.create().docker().scan({ signal: controller.signal, env: { ...env(), WAIT_SOURCE: 'yes' } });
    const rejected = pending.catch(error => error);
    await waitForFile('docker.pid');
    const pid = Number(await readFile(join(directory, 'docker.pid'), 'utf8'));
    controller.abort(new Error('stop discovery'));
    expect(await rejected).toBeInstanceOf(Error);
    expect(alive(pid)).toBe(false);
    expect(await exists(join(directory, 'docker.closed'))).toBe(true);
  });
});
