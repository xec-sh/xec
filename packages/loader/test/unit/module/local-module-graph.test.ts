import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { it, afterAll, beforeAll } from 'vitest';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rm, mkdir, mkdtemp, symlink } from 'node:fs/promises';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../../', import.meta.url));
let temporary: string;
let moduleURL: string;
let scenario = 0;

beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'xec-native-module-'));
  // Compile this API privately so these tests exercise Node's real hooks,
  // without a test-runner/tsx loader translating the fixture modules for us.
  await build({ entryPoints: [join(root, 'src/module/local-module-graph.ts')],
    outfile: join(temporary, 'graph.mjs'), bundle: true, packages: 'external',
    platform: 'node', format: 'esm', target: 'es2022' });
  await symlink(join(root, 'node_modules'), join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  moduleURL = pathToFileURL(join(temporary, 'graph.mjs')).href;
});
afterAll(async () => { await rm(temporary, { recursive: true, force: true }); });

async function native(body: string, flags: string[] = []): Promise<void> {
  const directory = join(temporary, `source #${scenario++} % space`);
  await mkdir(directory);
  const source = `
    import assert from 'node:assert/strict';
    import { dirname, join } from 'node:path';
    import { createRequire, syncBuiltinESMExports } from 'node:module';
    import { mkdir, writeFile, readFile } from 'node:fs/promises';
    import { pathToFileURL, fileURLToPath } from 'node:url';
    import { LocalModuleGraph } from ${JSON.stringify(moduleURL)};
    const directory = ${JSON.stringify(directory)};
    async function write(name, source) { const file=join(directory,name); await mkdir(dirname(file),{recursive:true}); await writeFile(file,source); return file; }
    await write('package.json', JSON.stringify({ type:'module' }));
    const graphs=[];
    function graph(name) { const g=new LocalModuleGraph(join(directory,name));graphs.push(g);return g; }
    try { ${body} } finally { for(const g of graphs) g.dispose(); }
  `;
  await execute(process.execPath, [...flags, '--input-type=module', '-e', source], {
    cwd: directory, timeout: 15_000, env: { ...process.env, NO_COLOR: '1' },
  });
}

it('keeps authored URLs, nested TS and runtime-relative data access from an unrelated cwd', async () => {
  await native(`
    await write('commands/nested/value.mts', 'export enum Value { Text = "nested" }');
    await write('commands/helper.ts', 'export { Value } from "./nested/value.mts";');
    await write('commands/message.txt', 'original data');
    const file=await write('commands/main.ts', \`
      import { Value } from './helper.ts';
      import { readFile } from 'node:fs/promises';
      export const value=Value.Text;
      export const meta=import.meta;
      export const data=()=>readFile(new URL('./message.txt', import.meta.url),'utf8');
    \`);
    const g=graph('commands/main.ts');
    const result=await g.load();
    assert.equal(g.sourceURL,pathToFileURL(file).href);
    assert.equal(fileURLToPath(result.meta.url),file);
    assert.equal(result.meta.filename,file);
    assert.equal(result.meta.dirname,dirname(file));
    assert.ok(new URL(result.meta.url).searchParams.has('__xec_module_graph'));
    assert.equal(fileURLToPath(result.meta.resolve('./helper.ts')),join(dirname(file),'helper.ts'));
    assert.equal(result.value,'nested');
    assert.equal(await result.data(),'original data');
  `);
});

it('isolates local ESM state per graph while retaining native bare-package identity and export conditions', async () => {
  await native(`
    await write('node_modules/native-choice/package.json',JSON.stringify({name:'native-choice',type:'module',exports:{'xec-test':'./selected.js',import:'./wrong.js'}}));
    await write('node_modules/native-choice/selected.js','export const singleton={};export const choice="selected";');
    await write('node_modules/native-choice/wrong.js','throw new Error("wrong export condition");');
    await write('package.json',JSON.stringify({type:'module',imports:{'#counter':'./counter.js'}}));
    await write('counter.js','let value=0;export const next=()=>++value;');
    await write('main.ts','export {next} from "#counter";export {singleton,choice} from "native-choice";');
    const first=graph('main.ts'), second=graph('main.ts');
    const [a,b]=await Promise.all([first.load(),second.load()]);
    assert.equal(await first.load(),a);
    assert.notEqual(a,b);
    assert.equal(a.next(),1); assert.equal(a.next(),2); assert.equal(b.next(),1);
    assert.equal(a.singleton,b.singleton); assert.equal(a.choice,'selected');
    await write('counter.js','let value=40;export const next=()=>++value;');
    const c=await graph('main.ts').load();
    assert.equal(c.next(),41); assert.equal(a.next(),3);
  `,['--conditions=xec-test']);
});

it('retains hooks for deferred variable imports and releases only its own graph on disposal', async () => {
  await native(`
    await write('late.ts','export enum Result { Value = 42 }');
    await write('never.ts','export enum Result { Value = 43 }');
    await write('main.ts','export const meta=import.meta; export const later=async(name:string)=>(await import(name)).Result.Value;');
    const first=graph('main.ts'), second=graph('main.ts');
    const a=await first.load(); const b=await second.load();
    assert.equal(await a.later('./late.ts'),42);
    first.dispose(); first.dispose();
    await assert.rejects(first.load(),/disposed/);
    assert.equal(await b.later('./late.ts'),42);
    const retired=new URL('./never.ts',a.meta.url); retired.search=new URL(a.meta.url).search;
    await assert.rejects(import(retired.href), /TypeScript enum|Unexpected|unsupported/i);
    assert.equal(await b.later('./never.ts'),43);
  `);
});

it('transforms JSX, TSX and CommonJS TypeScript without rewriting module source locations', async () => {
  await native(`
    await write('view.tsx','const React={createElement:(_tag:string,_props:unknown,value:string)=>value}; export const view=<span>tsx</span>;');
    await write('view.jsx','const React={createElement:(_tag,_props,value)=>value}; export const view=<span>jsx</span>;');
    await write('legacy.cts','const value: number = 7; export = {value};');
    await write('main.ts','export {view as tsx} from "./view.tsx";export {view as jsx} from "./view.jsx";export {default as cjs} from "./legacy.cts";');
    const result=await graph('main.ts').load();
    assert.equal(result.tsx,'tsx'); assert.equal(result.jsx,'jsx'); assert.equal(result.cjs.value,7);
  `);
});

it('preserves native JSON attributes and rejects unsupported TS attributes and broken sources', async () => {
  await native(`
    await write('value.json','{"value":19}');
    await write('valid.ts','export {default as data} from "./value.json" with {type:"json"};');
    assert.equal((await graph('valid.ts').load()).data.value,19);
    await write('typed.ts','export const value: number=1;');
    await write('invalid.ts','import "./typed.ts" with {type:"json"};');
    await assert.rejects(graph('invalid.ts').load(),/Import attributes/);
    await write('broken.ts','export const value: = ;');
    await assert.rejects(graph('broken.ts').load(),/Transform failed/);
  `);
});

it('fails explicitly without native hooks and never treats non-file URLs as local paths', async () => {
  await native(`
    assert.throws(()=>new LocalModuleGraph(new URL('https://example.invalid/main.ts')),/file URL/);
    const reserved=pathToFileURL(join(directory,'main.ts')); reserved.searchParams.set('__xec_module_graph','untrusted');
    assert.throws(()=>new LocalModuleGraph(reserved),/reserved/);
    const mod=createRequire(import.meta.url)('node:module');
    const original=mod.registerHooks;
    try { mod.registerHooks=undefined; syncBuiltinESMExports(); assert.throws(()=>graph('unread.ts'),/Node.js >=22.15/); }
    finally { mod.registerHooks=original; syncBuiltinESMExports(); }
  `);
});
