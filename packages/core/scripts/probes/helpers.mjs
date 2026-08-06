const m = await import(new URL('../../src/utils/helpers.ts', import.meta.url).href);
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const out = [];
const say = (l, fn) => { try { out.push(l + ' = ' + JSON.stringify(fn())); } catch (e) { out.push(l + ' THREW ' + e.constructor.name); } };
const sayAsync = async (l, fn) => { try { out.push(l + ' = ' + JSON.stringify(await fn())); } catch (e) { out.push(l + ' THREW ' + e.constructor.name); } };

for (const d of [0, 1500, '100ms', '5s', '2m', '1h', '1d', '1.5h', '5 s', '5S', '250', '', 'soon', '5w', 'x5s', '5s!', '  5s  ', '0.0015s'])
  say('dur ' + JSON.stringify(d), () => m.parseDuration(d));

const take = (n, ...a) => { const o = []; for (const v of m.expBackoff(...a)) { o.push(v); if (o.length === n) break; } return o; };
say('backoff default', () => take(6));
say('backoff capped', () => take(6, 400, 50));
say('backoff start', () => take(3, 60000, 1000));

// Fixed, so the output is a function of the code and not of mkdtemp.
const root = join(tmpdir(), 'probe-glob-fixed');
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
for (const f of ['a.ts','b.js','.hidden.ts','src/one.ts','src/deep/two.ts','src/deep/three.js','notes.md','a{b.ts','a[b.ts','zz.ts']) {
  mkdirSync(dirname(join(root, f)), { recursive: true });
  writeFileSync(join(root, f), '');
}
for (const p of ['*.ts','**/*.ts','src/**','src/**/*.ts','*.{ts,js}','*.{ts','[ab].ts','[ab.ts','a{b.ts','a[b.ts','notes.md','**','?.ts'])
  await sayAsync('glob ' + JSON.stringify(p), () => m.glob(p, { cwd: root }));
await sayAsync('glob dot', () => m.glob('*.ts', { cwd: root, dot: true }));
await sayAsync('glob many', () => m.glob(['*.js','*.ts'], { cwd: root }));
await sayAsync('glob abs', () => m.glob('*.ts', { cwd: root, absolute: true }));
rmSync(root, { recursive: true, force: true });

await sayAsync('kill undefined', async () => { await m.kill(undefined); return 'ok'; });
await sayAsync('kill gone', async () => { await m.kill(2147483646); return 'ok'; });
console.log(out.join('\n'));
