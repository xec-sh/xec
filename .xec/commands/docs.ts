import type { Command } from 'commander';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

import { checkDocExamples, formatDocExamplesReport } from '../lib/doc-examples.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
interface CheckOptions { file?: string; only?: string; report?: string; strict?: boolean }

/** Repository documentation operations, driven by the pinned published Xec CLI. */
export function command(program: Command): void {
  const docs = program.command('docs').description('Validate documentation against the workspace public API')
    .allowUnknownOption(false).allowExcessArguments(false);
  docs.command('check').description('Compile Markdown and homepage examples without executing them')
    .option('--file <markdown>', 'Check one Markdown file, relative to the current working directory')
    .option('--only <substring>', 'Select source paths containing this literal substring')
    .option('--report <json-file>', 'Write structured diagnostics as JSON')
    .option('--strict', 'Enable TypeScript strict checking')
    .allowUnknownOption(false).allowExcessArguments(false)
    .action(async (options: CheckOptions): Promise<void> => {
      const result = await checkDocExamples({ root, ...options });
      if (options.report !== undefined) await writeFile(resolve(options.report), JSON.stringify(result, null, 2) + '\n');
      process.stdout.write(formatDocExamplesReport(result, root));
      if (result.failures.length) process.exitCode = 1;
    });
}
