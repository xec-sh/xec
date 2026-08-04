import { appendFileSync } from 'node:fs';
import { $ } from './src/index.js';

const LOG = '.dx-probe2.log';
const say = (m: string) => appendFileSync(LOG, m + '\n');

// The core promise of xec: ONE API across environments.
// Are the four targeting methods actually shaped the same?

const local = $.local();
say(`local()   -> keys: ${Object.getOwnPropertyNames(Object.getPrototypeOf(local)).slice(0,5).join(',')} callable=${typeof local === 'function'}`);

const ssh = $.ssh('user@host');
say(`ssh()     -> ctor=${ssh?.constructor?.name} callable=${typeof ssh === 'function'} keys=${Object.keys(ssh).slice(0,12).join(',')}`);

const docker = $.docker({ container: 'x' });
say(`docker()  -> ctor=${docker?.constructor?.name} callable=${typeof docker === 'function'}`);

const k8s = $.k8s('default/pod');
say(`k8s()     -> ctor=${k8s?.constructor?.name} callable=${typeof k8s === 'function'} keys=${Object.keys(k8s).slice(0,12).join(',')}`);

// Can each be used as a template tag directly?
for (const [name, eng] of [['local', local], ['ssh', ssh], ['docker', docker], ['k8s', k8s]] as const) {
  try {
    const p = (eng as any)`echo hi`;
    say(`${name} tagged-template: ok, has .nothrow=${typeof p?.nothrow === 'function'} .pipe=${typeof p?.pipe === 'function'} .text=${typeof p?.text === 'function'}`);
    if (name !== 'local') p?.nothrow?.()?.catch?.(() => {});
  } catch (e) {
    say(`${name} tagged-template THREW: ${String(e).slice(0, 90)}`);
  }
}

// Do chaining methods exist uniformly?
for (const [name, eng] of [['local', local], ['ssh', ssh], ['docker', docker], ['k8s', k8s]] as const) {
  const chainable = ['cd', 'env', 'timeout', 'retry', 'with', 'exec', 'raw'].map(m => `${m}=${typeof (eng as any)[m] === 'function' ? 'y' : 'N'}`).join(' ');
  say(`${name.padEnd(6)} chain: ${chainable}`);
}
say('DONE');
