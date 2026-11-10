import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { resolveTypeScriptCompiler } from './typescript-compiler.mjs';

const root = process.cwd();
rmSync(join(root, 'dist'), { recursive: true, force: true, maxRetries: 3 });
rmSync(join(root, 'node_modules/.tmp/tsconfig.tsbuildinfo'), { force: true });
const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== '--clean') {
  const result = spawnSync(process.execPath, [resolveTypeScriptCompiler(root), ...args], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
