const m = await import(new URL('../../src/utils/parallel.ts', import.meta.url).href);
const out = [];
const say = async (l, fn) => { try { out.push(l + ' = ' + JSON.stringify(await fn())); } catch (e) { out.push(l + ' THREW ' + e.constructor.name + ':' + String(e.message).slice(0,40)); } };

const engineFor = (answer) => {
  const started = [];
  return { started, engine: { execute: async (cmd) => {
    const text = cmd?.command ?? String(cmd);
    started.push(text);
    const r = answer(text);
    if (r instanceof Error) throw r;
    return { stdout: '', stderr: '', exitCode: 0, signal: undefined, command: text, duration: 1, adapter: 'mock', ...r };
  } } };
};
const ok = () => ({ exitCode: 0 });
const bad = () => ({ exitCode: 1, ok: false });
const shape = r => ({ succeeded: r.succeeded.length, failed: r.failed.length, results: r.results.length });

for (const conc of [undefined, 1, 2, 10]) {
  const label = 'conc=' + conc;
  {
    const { engine, started } = engineFor(ok);
    await say(label + ' all ok', async () => ({ ...shape(await m.parallel(['a','b','c'], engine, { maxConcurrency: conc })), started: [...started] }));
  }
  {
    const { engine, started } = engineFor(c => c === 'b' ? bad() : ok());
    await say(label + ' one bad', async () => ({ ...shape(await m.parallel(['a','b','c'], engine, { maxConcurrency: conc })), started: [...started] }));
  }
  {
    const { engine, started } = engineFor(c => c === 'a' ? bad() : ok());
    await say(label + ' stop', async () => ({ ...shape(await m.parallel(['a','b','c'], engine, { maxConcurrency: conc, stopOnError: true })), started: [...started] }));
  }
  {
    const { engine, started } = engineFor(c => c === 'a' ? new Error('boom') : ok());
    await say(label + ' throw-stop', async () => ({ ...shape(await m.parallel(['a','b','c'], engine, { maxConcurrency: conc, stopOnError: true })), started: [...started] }));
  }
  {
    const { engine } = engineFor(() => ({ exitCode: 0, signal: 'SIGKILL', ok: undefined }));
    await say(label + ' signal', async () => shape(await m.parallel(['a'], engine, { maxConcurrency: conc })));
  }
  {
    const { engine } = engineFor(() => ({ exitCode: 3, ok: undefined }));
    await say(label + ' noOk', async () => shape(await m.parallel(['a'], engine, { maxConcurrency: conc })));
  }
  {
    const { engine } = engineFor(ok);
    await say(label + ' empty', async () => shape(await m.parallel([], engine, { maxConcurrency: conc })));
  }
  {
    const { engine } = engineFor(c => ({ exitCode: 0, stdout: c }));
    await say(label + ' order', async () => (await m.parallel(['a','b','c'], engine, { maxConcurrency: conc })).results.map(r => r.stdout));
  }
  {
    const { engine } = engineFor(c => c === 'b' ? bad() : ok());
    const seen = [];
    await say(label + ' progress', async () => { await m.parallel(['a','b'], engine, { maxConcurrency: conc, onProgress: (...a) => seen.push(a) }); return seen; });
  }
}
for (const [name, answer] of [['ok', ok], ['bad', bad], ['mixed', c => c === 'c' ? ok() : bad()], ['throw', () => new Error('x')], ['signal', () => ({ exitCode: 0, signal: 'SIGKILL', ok: undefined })]]) {
  const { engine } = engineFor(answer);
  const pe = new m.ParallelEngine(engine);
  await say('every ' + name, () => pe.every(['a','b','c']));
  const { engine: e2 } = engineFor(answer);
  await say('some ' + name, () => new m.ParallelEngine(e2).some(['a','b','c']));
  const { engine: e3, started } = engineFor(answer);
  await say('all ' + name, async () => { try { const r = await new m.ParallelEngine(e3).all(['a','b','c'], { maxConcurrency: 1 }); return { n: r.length, started: [...started] }; } catch (e) { return { threw: String(e.message).slice(0,30), started: [...started] }; } });
}
console.log(out.join('\n'));
