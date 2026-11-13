/**
 * 10 - Path Prompt
 *
 * File/directory selection with filesystem autocomplete.
 * Type a path and get real-time suggestions from the filesystem.
 */
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, basename } from 'node:path';

import { log, path, intro, outro, cancel, isCancel } from '../src/index.js';

async function main() {
  intro('Path Prompt Examples');
  const packageFile = fileURLToPath(new URL('../package.json', import.meta.url));
  const packageDirectory = dirname(packageFile);
  log.info('Read-only selection: this example does not create or change files.');

  // Select any file
  const file = await path({
    message: 'Select a file (Tab completes the focused path)',
    initialValue: packageFile,
    validate: async (value) => {
      if (!value) return 'Select a file.';
      try {
        return (await stat(value)).isFile() ? undefined : 'Select a regular file.';
      } catch {
        return 'Select an existing file.';
      }
    },
  });
  if (isCancel(file)) {
    cancel('Cancelled.');
    return;
  }
  log.step(`Selected file: ${basename(file)}`);

  // Select directory only
  const dir = await path({
    message: 'Select a directory',
    directory: true,
    initialValue: packageDirectory,
  });
  if (isCancel(dir)) {
    cancel('Cancelled.');
    return;
  }
  log.step(`Selected directory: ${dir}`);

  // With initial value and validation
  const config = await path({
    message: 'Path to config file',
    initialValue: packageFile,
    validate: (value) => {
      if (!value) return 'Path is required.';
      if (!value.endsWith('.json') && !value.endsWith('.yaml'))
        return 'Config must be .json or .yaml';
      return undefined;
    },
  });
  if (isCancel(config)) {
    cancel('Cancelled.');
    return;
  }

  log.success(`Config: ${config}`);
  outro('Done!');
}

await main();
