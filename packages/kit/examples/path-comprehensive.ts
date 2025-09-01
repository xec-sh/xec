#!/usr/bin/env tsx
/**
 * Path Component Comprehensive Example
 *
 * Demonstrates all features of the path selection component including:
 * - Basic file/directory selection
 * - Custom root directory
 * - Directory-only mode
 * - Initial value setting
 * - Custom validation
 * - Error handling
 */

import { homedir } from 'node:os';
import { statSync, existsSync } from 'node:fs';
import { dirname, extname, basename } from 'node:path';

import * as p from '../src/index.js';
import { prism as color } from '../src/index.js';

async function main() {
  console.clear();

  p.intro(`${color.bgMagenta(color.black(' 📁 Path Selection Examples '))}`);

  p.note(
    `${color.cyan('This example demonstrates all path component features:')}
${color.yellow('Navigation:')}
- Type to filter paths
- Use ${color.green('↑/↓')} arrows to navigate
- Press ${color.green('Tab')} for autocomplete
- Press ${color.green('Enter')} to select
- Press ${color.green('Ctrl+C')} to cancel

${color.yellow('Features demonstrated:')}
1. Basic file selection
2. Directory-only selection  
3. Custom root directory
4. File type validation
5. Size validation
6. Initial value setting`,
    'Instructions'
  );

  // Example 1: Basic file selection from current directory
  const s = p.spinner();
  s.start('Example 1: Basic file selection');
  await sleep(500);
  s.stop('Ready');

  const file = await p.path({
    message: 'Select any file',
    initialValue: process.cwd(),
  });

  if (p.isCancel(file)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  p.log.success(`Selected file: ${color.cyan(file)}`);
  await sleep(1000);

  // Example 2: Directory-only selection
  s.start('Example 2: Directory-only selection');
  await sleep(500);
  s.stop('Ready');

  const directory = await p.path({
    message: 'Select a directory',
    directory: true,
    initialValue: process.cwd(),
  });

  if (p.isCancel(directory)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  p.log.success(`Selected directory: ${color.cyan(directory)}`);
  await sleep(1000);

  // Example 3: Custom root directory (home directory)
  s.start('Example 3: Selection from home directory');
  await sleep(500);
  s.stop('Ready');

  const homeFile = await p.path({
    message: 'Select a file from your home directory',
    root: homedir(),
    initialValue: homedir(),
  });

  if (p.isCancel(homeFile)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  p.log.success(`Selected from home: ${color.cyan(homeFile)}`);
  await sleep(1000);

  // Example 4: File type validation (only .ts or .js files)
  s.start('Example 4: TypeScript/JavaScript file selection');
  await sleep(500);
  s.stop('Ready');

  const scriptFile = await p.path({
    message: 'Select a TypeScript or JavaScript file',
    initialValue: process.cwd(),
    validate: (value) => {
      if (!value) return 'Please select a file';

      // Check if path exists
      if (!existsSync(value)) {
        return 'Path does not exist';
      }

      // Check if it's a file
      const stats = statSync(value);
      if (stats.isDirectory()) {
        return 'Please select a file, not a directory';
      }

      // Check file extension
      const ext = extname(value).toLowerCase();
      if (!['.ts', '.js', '.tsx', '.jsx'].includes(ext)) {
        return 'Please select a TypeScript or JavaScript file';
      }

      return undefined;
    },
  });

  if (p.isCancel(scriptFile)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  p.log.success(`Selected script: ${color.cyan(basename(scriptFile))}`);
  await sleep(1000);

  // Example 5: Size validation (files smaller than 1MB)
  s.start('Example 5: Small file selection (< 1MB)');
  await sleep(500);
  s.stop('Ready');

  const smallFile = await p.path({
    message: 'Select a file smaller than 1MB',
    initialValue: process.cwd(),
    validate: (value) => {
      if (!value) return 'Please select a file';

      if (!existsSync(value)) {
        return 'Path does not exist';
      }

      const stats = statSync(value);
      if (stats.isDirectory()) {
        return 'Please select a file, not a directory';
      }

      // Check file size (1MB = 1048576 bytes)
      if (stats.size > 1048576) {
        const sizeMB = (stats.size / 1048576).toFixed(2);
        return `File is too large (${sizeMB}MB). Please select a file smaller than 1MB`;
      }

      return undefined;
    },
  });

  if (p.isCancel(smallFile)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  const fileStats = statSync(smallFile);
  const fileSizeKB = (fileStats.size / 1024).toFixed(2);
  p.log.success(
    `Selected file: ${color.cyan(basename(smallFile))} (${color.yellow(fileSizeKB + 'KB')})`
  );
  await sleep(1000);

  // Example 6: Parent directory selection
  s.start('Example 6: Parent directory navigation');
  await sleep(500);
  s.stop('Ready');

  const parentDir = await p.path({
    message: 'Navigate to parent directories (use ..)',
    directory: true,
    initialValue: dirname(process.cwd()),
  });

  if (p.isCancel(parentDir)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  p.log.success(`Selected parent directory: ${color.cyan(parentDir)}`);
  await sleep(1000);

  // Example 7: Custom validation with multiple criteria
  s.start('Example 7: Configuration file selection');
  await sleep(500);
  s.stop('Ready');

  const configFile = await p.path({
    message: 'Select a configuration file (json, yaml, toml)',
    initialValue: process.cwd(),
    validate: (value) => {
      if (!value) return 'Please select a file';

      if (!existsSync(value)) {
        return 'Path does not exist';
      }

      const stats = statSync(value);
      if (stats.isDirectory()) {
        return 'Please select a file, not a directory';
      }

      // Check for config file extensions
      const ext = extname(value).toLowerCase();
      const validExts = ['.json', '.yaml', '.yml', '.toml', '.config.js', '.config.ts'];
      const name = basename(value).toLowerCase();

      // Check for common config file patterns
      const isConfigFile =
        validExts.includes(ext) ||
        name.includes('config') ||
        name === 'package.json' ||
        name === 'tsconfig.json' ||
        name === '.env' ||
        name.startsWith('.');

      if (!isConfigFile) {
        return 'Please select a configuration file';
      }

      // Warn about large config files
      if (stats.size > 100000) {
        return 'Configuration file seems unusually large. Please select a smaller config file';
      }

      return undefined;
    },
  });

  if (p.isCancel(configFile)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  p.log.success(`Selected config: ${color.cyan(basename(configFile))}`);

  // Summary
  p.outro(`
${color.bgGreen(color.black(' ✅ All examples completed! '))}

${color.cyan('Summary of selected paths:')}
• File: ${color.yellow(basename(file))}
• Directory: ${color.yellow(basename(directory))}
• Home file: ${color.yellow(basename(homeFile))}
• Script: ${color.yellow(basename(scriptFile))}
• Small file: ${color.yellow(basename(smallFile))} (${fileSizeKB}KB)
• Parent dir: ${color.yellow(basename(parentDir))}
• Config: ${color.yellow(basename(configFile))}

${color.dim('Thanks for trying the path component!')}`);
}

// Utility function for delays
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run the demo
main().catch((error) => {
  console.error(color.red('Error:'), error);
  process.exit(1);
});
