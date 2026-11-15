import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { it, afterAll, beforeAll } from 'vitest';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rm, mkdtemp, symlink, readFile, writeFile } from 'node:fs/promises';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../../', import.meta.url));
let directory: string;
let moduleURL: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'xec-remote-graph-'));
  const outfile = join(directory, 'loader.mjs');
  // Private compilation, then ordinary native import in a fresh process: the
  // test runner cannot rewrite imports, supply a graph, or mask hook failures.
  await build({ stdin: { contents: `export { ModuleLoader } from './src/module/module-loader.ts'; export { ModuleGraph } from './src/module/module-graph.ts';export { ModuleIntegrityVerifier } from './src/module/module-integrity.ts';export { ModuleFetcher } from './src/module/module-fetcher.ts';export { MemoryCache } from './src/module/module-cache.ts';`, resolveDir: root },
    outfile, bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'es2022' });
  await symlink(join(root, 'node_modules'), join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const esbuild = JSON.parse(await readFile(join(root, 'node_modules/esbuild/package.json'), 'utf8')) as { version: string };
  await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module', dependencies: { esbuild: esbuild.version } }));
  moduleURL = pathToFileURL(outfile).href;
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

async function native(body: string): Promise<void> {
  const source = `
    import assert from 'node:assert/strict';
    import { createServer } from 'node:http';
    import { once } from 'node:events';
    import { join } from 'node:path';
    import { mkdtemp, rm } from 'node:fs/promises';
    import { createRequire, syncBuiltinESMExports } from 'node:module';
    import { ModuleLoader, ModuleGraph, ModuleIntegrityVerifier, ModuleFetcher, MemoryCache } from ${JSON.stringify(moduleURL)};
    const directory=await mkdtemp(join(${JSON.stringify(directory)},'case-'));
    const routes=new Map(), requests=[], owners=[];
    const server=createServer((req,res)=>{
      requests.push(req.url);
      const route=routes.get(req.url);
      if(typeof route==='function') return route(req,res);
      if(route===undefined) {res.writeHead(404);res.end();return;}
      res.writeHead(200,{'content-type':'application/javascript'});res.end(route);
    });
    server.listen(0,'127.0.0.1'); await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    function loader(options={}) {
      const value=new ModuleLoader({cacheDir:directory,integrity:{allowedHosts:['127.0.0.1']},...options});
      owners.push(value); return value;
    }
    try { ${body} } finally {
      for(const value of owners) value.dispose();
      server.closeAllConnections(); await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
      await rm(directory,{recursive:true,force:true});
    }
  `;
  const runtime = process.env['XEC_MODULE_GRAPH_RUNTIME'] ?? process.execPath;
  const args = runtime.endsWith('deno') ? ['eval', '--no-config', '--no-lock', '--no-remote', '--node-modules-dir=manual', source]
    : runtime.endsWith('bun') ? ['--eval', source] : ['--input-type=module', '-e', source];
  await execute(runtime, args, { cwd: directory, timeout: 15_000, env: { ...process.env, NO_COLOR: '1' } });
}

it('keeps redirected bases, default/star exports, side effects and singleton identity across roots and aliases', async () => {
  await native(`
    globalThis.effects=[];
    routes.set('/entry.js',(_req,res)=>{res.writeHead(302,{location:'/actual/main.js'});res.end();});
    routes.set('/actual/main.js','import "./effect.js"; export {default} from "./value.js"; export * from "./value.js"; export const url=import.meta.url;');
    routes.set('/actual/effect.js','globalThis.effects.push("effect");');
    routes.set('/actual/value.js','globalThis.effects.push("value");export let n=1;export const next=()=>++n;export default {tag:"same"};');
    routes.set('/other.js','export {default,next,n} from "./actual/value.js";');
    const owner=loader();
    const [a,b]=await Promise.all([owner.import(origin+'/entry.js'),owner.import(origin+'/entry.js')]);
    const direct=await owner.import(origin+'/actual/main.js');
    const other=await owner.import(origin+'/other.js');
    assert.equal(a,b);assert.equal(a,direct);assert.equal(a.default,other.default);
    assert.equal(a.next(),2);assert.equal(other.n,2);
    assert.equal(new URL(a.url).pathname,'/actual/main.js');
    assert.ok(new URL(a.url).hash.startsWith('#__xec_module_graph='));
    assert.deepEqual(globalThis.effects,['effect','value']);
    assert.equal(requests.filter(p=>p==='/actual/value.js').length,1);
    assert.ok(requests.every(p=>!p.includes('__xec_module_graph')));
    const verifier=new ModuleIntegrityVerifier(directory,{mode:'strict',allowedHosts:['127.0.0.1']});
    for(const path of ['/entry.js','/actual/main.js','/actual/effect.js','/actual/value.js','/other.js'])await verifier.assertFetchAllowed(origin+path);
  `);
});

it('preserves native cycles, live bindings, top-level await and delayed literal/known computed imports', async () => {
  await native(`
    globalThis.lateEffects=0;
    routes.set('/a.js','import {readB} from "./b.js";export let count=1;export const next=()=>++count;export const both=()=>readB();export const later=()=>import("./late.ts");export const computed=name=>import(name);await Promise.resolve();export const ready=true;');
    routes.set('/b.js','import {count} from "./a.js";export const readB=()=>count;');
    routes.set('/late.ts','globalThis.lateEffects++;export enum Value { Answer=42 }');
    const owner=loader(); const a=await owner.import(origin+'/a.js');
    assert.equal(a.ready,true);assert.equal(a.both(),1);a.next();assert.equal(a.both(),2);
    assert.equal(globalThis.lateEffects,0);
    await owner.clearCache();assert.equal(await owner.import(origin+'/a.js'),a);
    const late=await a.later();assert.equal(late.Value.Answer,42);assert.equal(globalThis.lateEffects,1);
    assert.equal(await a.computed('./late.ts'),late);
    const before=requests.length;
    await assert.rejects(a.computed('./not-prepared.js'),/Remote module was not prepared/);
    assert.equal(requests.length,before);
  `);
});

it('does not interpret import-like text and rejects unsupported dependencies before effects', async () => {
  await native(`
    globalThis.effects=0;
    routes.set('/strings.js','export const text='+JSON.stringify('import "/never.js"; export * from "./never.js"')+'; export const re=/import.+from/;');
    const owner=loader();const result=await owner.import(origin+'/strings.js');
    assert.equal(result.text,'import "/never.js"; export * from "./never.js"');assert.equal(requests.length,1);
    for(const [path,text] of [
      ['/bare.js','import "@private/unpublished";globalThis.effects++;'],
      ['/file.js','import "file:///private/secret.js";globalThis.effects++;'],
      ['/data.js','import "data:text/javascript,globalThis.effects++";'],
      ['/common.js','module.exports={};globalThis.effects++;'],
      ['/asset.js','import "./asset.css";globalThis.effects++;'],
      ['/attribute.js','import "./strings.js" with {type:"json"};globalThis.effects++;'],
    ]) { routes.set(path,text);routes.set('/asset.css','body {color:red}');await assert.rejects(owner.import(origin+path)); }
    assert.equal(globalThis.effects,0);assert.ok(!requests.some(p=>p.includes('@private')));
  `);
});

it('rejects child integrity mismatch and forbidden child hosts before any graph evaluation', async () => {
  await native(`
    globalThis.effects=0;
    routes.set('/entry.js','import "./child.js";globalThis.effects++;');
    routes.set('/child.js','globalThis.effects++;');
    const first=loader();await first.import(origin+'/entry.js');assert.equal(globalThis.effects,2);
    await first.clearCache();
    routes.set('/child.js','globalThis.effects+=1000;');
    const strict=loader({integrity:{mode:'strict',allowedHosts:['127.0.0.1']}});
    await assert.rejects(strict.import(origin+'/entry.js'),/Integrity mismatch/);assert.equal(globalThis.effects,2);
    routes.set('/forbidden.js','import "https://unlisted.invalid/child.js";globalThis.effects+=1000;');
    await assert.rejects(loader().import(origin+'/forbidden.js'),/unlisted host/);assert.equal(globalThis.effects,2);
  `);
});

it('never reruns throwing modules and isolates independent graph owners', async () => {
  await native(`
    globalThis.effects=0;routes.set('/throws.js','globalThis.effects++;throw new Error("fixture failure");');
    const owner=loader();await assert.rejects(owner.import(origin+'/throws.js'),/fixture failure/);
    await assert.rejects(owner.import(origin+'/throws.js'),/fixture failure/);assert.equal(globalThis.effects,1);
    await assert.rejects(loader().import(origin+'/throws.js'),/fixture failure/);assert.equal(globalThis.effects,2);
  `);
});

it('bounds total graph nodes and source bytes before executing prepared parents', async () => {
  await native(`
    globalThis.effects=0;
    routes.set('/root.js','import "./a.js";import "./b.js";globalThis.effects++;');
    routes.set('/a.js','globalThis.effects++;');routes.set('/b.js','globalThis.effects++;');
    await assert.rejects(loader({graph:{maxNodes:2}}).import(origin+'/root.js'),error=>error.code==='MODULE_GRAPH_LIMIT');
    await assert.rejects(loader({graph:{maxBytes:75}}).import(origin+'/root.js'),error=>error.code==='MODULE_GRAPH_LIMIT');
    assert.equal(globalThis.effects,0);
  `);
});

it('bounds concurrent requests and drains cancellation before returning', async () => {
  await native(`
    globalThis.effects=0;let active=0,peak=0,closed=0,ready,drain;const started=new Promise(resolve=>ready=resolve);const drained=new Promise(resolve=>drain=resolve);
    routes.set('/root.js',Array.from({length:6},(_,i)=>'import "./child'+i+'.js";').join('')+'globalThis.effects++;');
    for(let i=0;i<6;i++)routes.set('/child'+i+'.js',(_req,res)=>{active++;peak=Math.max(peak,active);if(active===2)ready();res.on('close',()=>{active--;closed++;if(closed===2)drain();});res.writeHead(200);res.write('/* unfinished');});
    const owner=loader({graph:{concurrency:2}}), control=new AbortController();
    const pending=owner.import(origin+'/root.js',{signal:control.signal});
    await started;assert.throws(()=>owner.dispose(),/active/);await assert.rejects(owner.clearCache(),/active/);
    control.abort(new Error('fixture cancelled'));
    await assert.rejects(pending,/fixture cancelled/);
    await drained;
    assert.equal(peak,2);assert.equal(active,0);assert.equal(closed,2);assert.equal(globalThis.effects,0);
    owner.dispose();await assert.rejects(owner.import(origin+'/root.js'),/disposed/);
  `);
});

it('applies whole-preparation deadlines and lets queued calls cancel without cancelling another owner', async () => {
  await native(`
    let ready;const started=new Promise(resolve=>ready=resolve);let respond;
    routes.set('/slow.js',(_req,res)=>{respond=()=>res.end('export const value=42;');ready();});
    const owner=loader({graph:{timeoutMs:2000}});const first=owner.import(origin+'/slow.js');await started;
    const control=new AbortController();const queued=owner.import(origin+'/queued.js',{signal:control.signal});control.abort(new Error('queued cancelled'));
    await assert.rejects(queued,/queued cancelled/);assert.equal(requests.length,1);
    respond();assert.equal((await first).value,42);
    routes.set('/timeout.js',(_req,res)=>{res.writeHead(200);res.write('/* pending');});
    await assert.rejects(loader({graph:{timeoutMs:40}}).import(origin+'/timeout.js'),/timed out/);
  `);
});

it('does not claim cancellation of already evaluating JavaScript or dispose active TLA', async () => {
  await native(`
    let entered;const started=new Promise(resolve=>entered=resolve);
    globalThis.started=entered;globalThis.wait=new Promise(resolve=>globalThis.finish=resolve);
    routes.set('/wait.js','globalThis.started();await globalThis.wait;export const value=42;');
    const owner=loader(),control=new AbortController();const pending=owner.import(origin+'/wait.js',{signal:control.signal});
    await started;control.abort(new Error('too late'));assert.throws(()=>owner.dispose(),/active/);
    globalThis.finish();assert.equal((await pending).value,42);owner.dispose();
  `);
});

it('disables response retention without forfeiting native module identity or trust pins', async () => {
  await native(`
    routes.set('/one.js','export const object={};');const owner=loader({cache:false});
    const first=await owner.import(origin+'/one.js');assert.equal(await owner.import(origin+'/one.js'),first);
    assert.deepEqual(await owner.getCacheStats(),{memoryEntries:0,fileEntries:0,totalSize:0});
    await owner.clearCache();assert.equal(await owner.import(origin+'/one.js'),first);assert.equal(requests.length,1);
    const second=loader({cache:false});assert.notEqual(await second.import(origin+'/one.js'),first);assert.equal(requests.length,2);
    await new ModuleIntegrityVerifier(directory,{mode:'strict',allowedHosts:['127.0.0.1']}).assertFetchAllowed(origin+'/one.js');
  `);
});

// Deno's syncBuiltinESMExports does not support the Node builtin-export mutation
// used by this fault-injection test. Actual unsupported Node/Bun hosts run it too.
it.skipIf(process.env['XEC_MODULE_GRAPH_RUNTIME']?.endsWith('deno'))('fails without native hooks before contacting a remote server', async () => {
  await native(`
    const module=createRequire(import.meta.url)('node:module'),original=module.registerHooks;
    try {module.registerHooks=undefined;syncBuiltinESMExports();await assert.rejects(loader().import(origin+'/entry.js'),error=>error.code==='MODULE_GRAPH_UNSUPPORTED');assert.equal(requests.length,0);}
    finally {module.registerHooks=original;syncBuiltinESMExports();}
  `);
});

it('prepares computed targets explicitly and keeps separate hook owners alive through callbacks', async () => {
  await native(`
    globalThis.effects=0;
    routes.set('/main.js','export const later=name=>import(name);globalThis.effects++;');
    routes.set('/target.js','export const value=42;globalThis.effects++;');
    const fetcher=new ModuleFetcher(new MemoryCache({maxSize:0}),new ModuleIntegrityVerifier(directory,{allowedHosts:['127.0.0.1']}));
    const first=new ModuleGraph(origin+'/main.js',{fetcher}),second=new ModuleGraph(origin+'/main.js',{fetcher});
    owners.push(first,second);
    await first.prepare();await first.prepare(origin+'/target.js');assert.equal(globalThis.effects,0);
    const a=await first.load();assert.equal((await a.later('./target.js')).value,42);assert.equal(globalThis.effects,2);
    const b=await second.load();await second.prepare(origin+'/target.js');first.dispose();
    assert.equal((await b.later('./target.js')).value,42);assert.equal(globalThis.effects,4);
    await assert.rejects(first.load(),error=>error.code==='MODULE_GRAPH_DISPOSED');
    const before=requests.length;const abort=new AbortController();abort.abort(new Error('before prepare'));
    await assert.rejects(second.prepare(origin+'/unused.js',{signal:abort.signal}),/before prepare/);assert.equal(requests.length,before);
  `);
});

it('keeps previously evaluated bytes immutable even when a new redirect aliases their URL', async () => {
  await native(`
    globalThis.effects=0;
    routes.set('/value.js','globalThis.effects++;export const value=1;');
    const owner=loader({cache:false,integrity:{mode:'off',allowedHosts:['127.0.0.1']}});
    assert.equal((await owner.import(origin+'/value.js')).value,1);
    routes.set('/alias.js',(_req,res)=>{res.writeHead(302,{location:'/value.js'});res.end();});
    routes.set('/value.js','globalThis.effects+=100;export const value=2;');
    await assert.rejects(owner.import(origin+'/alias.js'),error=>error.code==='MODULE_SOURCE_CHANGED');
    assert.equal((await owner.import(origin+'/value.js')).value,1);assert.equal(globalThis.effects,1);
  `);
});

it('offers nonexecuting preparation through the ordinary ModuleLoader API', async () => {
  await native(`
    globalThis.effects=0;
    routes.set('/main.js','export const later=name=>import(name);globalThis.effects++;');
    routes.set('/target.js','export const value=42;globalThis.effects++;');
    const owner=loader();await owner.prepare(origin+'/target.js');assert.equal(globalThis.effects,0);
    const main=await owner.import(origin+'/main.js');assert.equal((await main.later('./target.js')).value,42);
    assert.equal(globalThis.effects,2);await assert.rejects(owner.prepare('node:path'),/explicit remote/);
  `);
});
