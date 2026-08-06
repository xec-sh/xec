// A broad sample of everything the escaping layer is asked to do.
const m = await import(new URL('../../src/utils/shell-escape.ts', import.meta.url).href);
const out = [];
const say = (label, fn) => { try { out.push(label + ' = ' + JSON.stringify(fn())); } catch (e) { out.push(label + ' THREW ' + e.constructor.name); } };

for (const shell of ['/bin/bash', 'cmd', 'cmd.exe', 'CMD.EXE', 'pwsh', 'powershell.exe', 'command', 'fish', 'c.exemd', 'a.exe.b', '', true, false, undefined, null])
  say('dialect ' + JSON.stringify(shell), () => m.dialectFor(shell));

const values = ['', 'ls', 'a b', "it's", 'a;b', 'a$(id)', '100%', 'C:\\dir\\', 'a\\"b', '$env:PATH', 'a\nb', '--flag=value', 'a*b', 'ünïcode'];
for (const dialect of ['posix', 'cmd', 'powershell'])
  for (const v of values) say(`quote ${dialect} ${JSON.stringify(v)}`, () => m.quoteForShell(v, dialect));

for (const v of values) say('ansi ' + JSON.stringify(v), () => m.quote(v));

const tag = (d) => (s, ...vals) => m.interpolateForShell(d, s, ...vals);
for (const d of ['posix', 'cmd', 'powershell']) {
  const t = tag(d);
  say(`i ${d} str`, () => t`x ${'a b'}`);
  say(`i ${d} null`, () => t`x ${null} y`);
  say(`i ${d} undef`, () => t`x ${undefined} y`);
  say(`i ${d} num`, () => t`x ${42}`);
  say(`i ${d} bool`, () => t`x ${true}`);
  say(`i ${d} date`, () => t`x ${new Date(0)}`);
  say(`i ${d} arr`, () => t`x ${['a b', null, 3]}`);
  say(`i ${d} obj`, () => t`x ${{ a: 1 }}`);
  say(`i ${d} result`, () => t`x ${{ stdout: 'o\n', text: () => 'o' }}`);
  say(`i ${d} stdoutonly`, () => t`x ${{ stdout: 'o' }}`);
  say(`i ${d} sym`, () => t`x ${Symbol('s')}`);
  say(`i ${d} big`, () => t`x ${10n}`);
  say(`i ${d} empty`, () => t`x ${''}`);
}
say('raw str', () => m.interpolateRaw`x ${'a b'} y`);
say('raw null', () => m.interpolateRaw`x ${null}y`);
say('raw arr', () => m.interpolateRaw`x ${['a', null, 'b']}`);
say('raw obj', () => m.interpolateRaw`x ${{ a: 1 }}`);
console.log(out.join('\n'));
