import { Pipeline } from '@xec-sh/ops';
import { acquireReleaseLock } from '@xec-sh/ops/release';
import { sep, join, resolve, relative, isAbsolute } from 'node:path';
import { rm, lstat, rename, mkdtemp, readFile } from 'node:fs/promises';

import { resolveTypeScriptCompiler } from './typescript-compiler.js';

export interface PackageBuildOptions {
  project?: string;
  bundle?: string;
  development?: boolean;
  signal?: AbortSignal;
}

function inside(root: string, file: string): string {
  const selected = resolve(root, file);
  const local = relative(root, selected);
  if (!local || local === '..' || local.startsWith('..' + sep) || isAbsolute(local))
    throw new Error(`Build input must be inside its package: ${file}`);
  return selected;
}

async function outputExists(directory: string): Promise<boolean> {
  try {
    const entry = await lstat(directory);
    if (!entry.isDirectory() || entry.isSymbolicLink())
      throw new Error(`Build output must be an ordinary directory: ${directory}`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Produce an artifact under the same single-writer primitive used by release preparation. */
export async function buildPackage(directory: string, options: PackageBuildOptions = {}): Promise<void> {
  const project = inside(directory, options.project ?? 'tsconfig.json');
  const entry = options.bundle && inside(directory, options.bundle);
  const compiler = resolveTypeScriptCompiler(directory);
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const unlock = await acquireReleaseLock(directory);
  let temporary: string | undefined;
  let previous: string | undefined;
  let preserveRecovery = false;
  let failed = false;
  let failure: unknown;
  try {
    temporary = await mkdtemp(join(directory, '.dist-build-'));
    // Match dist's directory depth so both JS and declaration maps remain valid.
    const output = temporary;
    const pipeline = Pipeline.create('package build')
      .step('configuration', {
        run: {
          command: process.execPath,
          shell: false,
          cwd: directory,
          args: [compiler, '--project', project, '--showConfig'],
        },
        timeout: 60_000,
      })
      .step('validate', {
        dependsOn: ['configuration'],
        run: async ({ outputs, signal }) => {
          signal?.throwIfAborted();
          const config = JSON.parse(outputs['configuration'] ?? '{}') as {
            compilerOptions?: { declarationDir?: string; outFile?: string; noEmit?: boolean };
          };
          if (
            !config.compilerOptions ||
            config.compilerOptions.declarationDir ||
            config.compilerOptions.outFile ||
            config.compilerOptions.noEmit
          ) {
            throw new Error(
              'Package compilation requires output under outDir; declarationDir, outFile and noEmit are not supported'
            );
          }
        },
      })
      .step('compile', {
        dependsOn: ['validate'],
        run: {
          command: process.execPath,
          shell: false,
          cwd: directory,
          args: [
            compiler,
            '--project',
            project,
            '--outDir',
            output,
            '--tsBuildInfoFile',
            join(temporary, '.compiler.tsbuildinfo'),
          ],
        },
        timeout: 600_000,
      });
    if (entry)
      pipeline.step('bundle', {
        dependsOn: ['compile'],
        timeout: 120_000,
        run: {
          command: 'bun',
          shell: false,
          cwd: directory,
          args: [
            'build',
            entry,
            '--target=node',
            `--outdir=${output}`,
            '--sourcemap',
            '--format=esm',
            ...(options.development ? [] : ['--minify']),
            ...Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }).flatMap((name) => [
              '--external',
              name,
            ]),
          ],
        },
      });
    pipeline.step('publish', {
      dependsOn: [entry ? 'bundle' : 'compile'],
      run: async ({ signal }) => {
        for (const name of ['index.js', 'index.d.ts']) {
          if (!(await lstat(join(output, name))).isFile()) throw new Error(`Missing package output: ${name}`);
        }
        await rm(join(output, '.compiler.tsbuildinfo'), { force: true });
        const dist = join(directory, 'dist');
        const exists = await outputExists(dist);
        signal?.throwIfAborted();
        if (exists) {
          const retained = output + '-previous';
          await rename(dist, retained);
          previous = retained;
        }
        let installed = false;
        try {
          signal?.throwIfAborted();
          await rename(output, dist);
          installed = true;
          signal?.throwIfAborted();
        } catch (error) {
          try {
            if (installed) await rename(dist, output);
            if (previous) {
              await rename(previous, dist);
              previous = undefined;
            }
          } catch (recovery) {
            preserveRecovery = true;
            throw new AggregateError(
              [error, recovery],
              `Build publication failed; inspect ${output}, ${previous ?? dist} and ${join(directory, '.release-artifacts/running')}`,
              { cause: recovery }
            );
          }
          throw error;
        }
      },
    });
    const result = await pipeline.run(
      {},
      {
        signal: options.signal,
        outputLimit: 1024 * 1024,
        onEvent: (event) => {
          if (event.type === 'step-output' && event.step !== 'configuration') process[event.stream].write(event.text);
        },
      }
    );
    if (!result.success)
      throw new Error(
        result.steps
          .filter((step) => !step.success && !step.skipped)
          .map((step) => `${step.name}: ${step.error ?? `exit ${step.exitCode}`}`)
          .join('\n') || `Build ${result.status}`
      );
  } catch (error) {
    failed = true;
    failure = error;
  }
  // An unknown rollback retains both artifacts and its single-writer lock.
  if (!preserveRecovery) {
    const cleanupErrors: unknown[] = [];
    for (const output of [temporary, previous]) {
      if (!output) continue;
      try {
        await rm(output, { recursive: true, force: true });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await unlock();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length)
      throw new AggregateError(
        failed ? [failure, ...cleanupErrors] : cleanupErrors,
        `Package build cleanup is incomplete in ${directory}`,
        { cause: failed ? failure : cleanupErrors[0] }
      );
  }
  if (failed) throw failure;
}

export async function cleanPackage(directory: string): Promise<void> {
  const unlock = await acquireReleaseLock(directory);
  try {
    const dist = join(directory, 'dist');
    await outputExists(dist);
    await rm(dist, { recursive: true, force: true, maxRetries: 3 });
  } finally {
    await unlock();
  }
}
