import { statSync } from 'node:fs';
import { join, dirname, basename, delimiter, isAbsolute } from 'node:path';

/**
 * Find the native binary or JavaScript entry behind Windows package-manager shims.
 * @param {'npm' | 'pnpm'} name
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ executable: string, script?: string }}
 */
export function windowsPackageManager(name, env) {
  const cli = name === 'npm' ? 'npm-cli.js' : 'pnpm.cjs';
  /** @param {string} file */
  const isFile = file => statSync(file, { throwIfNoEntry: false })?.isFile() === true;
  const current = env.npm_execpath;
  if (current && isAbsolute(current)) {
    const file = basename(current).toLowerCase();
    if (file === name + '.exe' && isFile(current)) return { executable: current };
    if (file === name && isFile(current + '.exe')) return { executable: current + '.exe' };
    if ((file === cli || file === name + '.mjs' || file === name + '.js') && isFile(current)) {
      return { executable: process.execPath, script: current };
    }
  }

  const path = Object.entries(env).reverse().find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? '';
  const directories = [...path.split(delimiter), dirname(process.execPath)];
  for (const directory of directories) {
    if (!isAbsolute(directory)) continue;
    const standalone = join(directory, name + '.exe');
    if (isFile(standalone)) return { executable: standalone };
    // An npm global bin directory holds node_modules; a workspace .bin
    // directory has the corresponding packages as siblings.
    const modules = basename(directory).toLowerCase() === '.bin' ? dirname(directory) : join(directory, 'node_modules');
    const root = join(modules, name);
    if (name === 'pnpm') {
      const binary = join(root, 'pnpm.exe');
      if (isFile(binary)) return { executable: binary };
    }
    for (const script of [join(root, 'bin', cli), join(root, 'bin', name + '.mjs'), join(modules, 'corepack', 'dist', name + '.js')]) {
      if (isFile(script)) return { executable: process.execPath, script };
    }
  }
  throw new Error('Cannot locate the installed Windows ' + name + ' executable or JavaScript entry point on PATH');
}
