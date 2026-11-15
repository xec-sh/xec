import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

/** Resolve the compiler declared by this workspace, including aliased TypeScript packages. */
export function resolveTypeScriptCompiler(root) {
  const require = createRequire(join(root, 'package.json'));
  for (const name of ['@typescript/native', 'typescript']) {
    let manifest;
    try { manifest = require.resolve(`${name}/package.json`); }
    catch (error) { if (error.code === 'MODULE_NOT_FOUND') continue; throw error; }
    const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
    const entry = typeof bin === 'string' ? bin : bin?.tsc ?? bin?.tsc6;
    if (entry) return resolve(dirname(manifest), entry);
  }
  throw new Error('No TypeScript compiler declared by this workspace could be resolved');
}
