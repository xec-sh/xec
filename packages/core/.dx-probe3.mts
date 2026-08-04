import { appendFileSync } from 'node:fs';
import { ExecutionEngine, createCallableEngine } from './src/index.js';

const LOG = '.dx-probe3.log';
const say = (m: string) => appendFileSync(LOG, m + '\n');

// maxBuffer overflow: what does the caller see?
const engine = createCallableEngine(new ExecutionEngine({ maxBuffer: 1024 }));
try {
  const r = await (engine as any).exec(`node -e "process.stdout.write('x'.repeat(10000))"`).nothrow();
  say(`overflow nothrow: exit=${r.exitCode} ok=${r.ok} stdoutLen=${r.stdout.length} cause=${r.cause ?? ''}`);
} catch (e) {
  say(`overflow nothrow THREW: ${String(e).slice(0, 90)}`);
}
try {
  const r2 = await (engine as any).exec(`node -e "process.stdout.write('x'.repeat(10000))"`);
  say(`overflow throw-mode: exit=${r2.exitCode} ok=${r2.ok} stdoutLen=${r2.stdout.length}`);
} catch (e) {
  say(`overflow throw-mode THREW: ${String(e).slice(0, 90)}`);
}

// AbortSignal on local (reference), then note for others
const ac = new AbortController();
const p = (engine as any).exec('sleep 5').signal(ac.signal).nothrow();
setTimeout(() => ac.abort(), 150);
const t0 = Date.now();
const ra = await p;
say(`local abort: took=${Date.now() - t0}ms exit=${ra.exitCode} signal=${ra.signal ?? ''}`);
say('DONE');
