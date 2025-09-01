#!/usr/bin/env tsx
/**
 * Path Component Basic Example
 *
 * Simple demonstration of file/directory selection
 */

import { basename } from 'node:path';

import * as p from '../../src/index.js';
import { prism as color } from '../../src/index.js';

async function demo() {
  console.clear();

  p.intro(`${color.bgCyan(color.black(' Path Selection Demo '))}`);

  // Basic file selection
  const filePath = await p.path({
    message: 'Select a file',
    initialValue: process.cwd(),
  });

  if (p.isCancel(filePath)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  p.log.success(`Selected: ${color.cyan(filePath)}`);

  // Directory selection
  const dirPath = await p.path({
    message: 'Select a directory',
    directory: true,
    initialValue: process.cwd(),
  });

  if (p.isCancel(dirPath)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  p.log.success(`Selected directory: ${color.cyan(dirPath)}`);

  // With validation
  const configFile = await p.path({
    message: 'Select a JSON file',
    initialValue: process.cwd(),
    validate: (value) => {
      if (!value) return 'Please select a file';
      if (!value.endsWith('.json')) return 'Please select a JSON file';
      return undefined;
    },
  });

  if (p.isCancel(configFile)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  p.log.success(`Selected JSON: ${color.cyan(basename(configFile))}`);

  p.outro(color.green('✨ Path selection completed!'));
}

demo().catch(console.error);
