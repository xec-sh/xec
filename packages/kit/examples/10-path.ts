/**
 * 10 - Path Prompt
 *
 * File/directory selection with filesystem autocomplete.
 * Type a path and get real-time suggestions from the filesystem.
 */
import { basename } from 'node:path';

import { intro, path, isCancel, cancel, log, outro } from '../src/index.js';

async function main() {
  intro('Path Prompt Examples');

  // Select any file
  const file = await path({
    message: 'Select a file',
  });
  if (isCancel(file)) { cancel('Cancelled.'); process.exit(0); }
  log.step(`Selected file: ${basename(file as string)}`);

  // Select directory only
  const dir = await path({
    message: 'Select a directory',
    directory: true,
  });
  if (isCancel(dir)) { cancel('Cancelled.'); process.exit(0); }
  log.step(`Selected directory: ${dir}`);

  // With initial value and validation
  const config = await path({
    message: 'Path to config file',
    initialValue: process.cwd(),
    validate: (value) => {
      if (!value) return 'Path is required.';
      if (!value.endsWith('.json') && !value.endsWith('.yaml'))
        return 'Config must be .json or .yaml';
      return undefined;
    },
  });
  if (isCancel(config)) { cancel('Cancelled.'); process.exit(0); }

  log.success(`Config: ${config}`);
  outro('Done!');
}

main().catch(console.error);
