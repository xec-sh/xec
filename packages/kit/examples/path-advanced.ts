#!/usr/bin/env tsx
/**
 * Path Component Advanced Example
 *
 * Demonstrates advanced usage patterns and edge cases:
 * - Multi-step file operations
 * - Path validation patterns
 * - Permission checking
 * - Symbolic link handling
 * - Hidden file filtering
 */

import { join, dirname, extname, resolve, basename, relative } from 'node:path';
import { statSync, lstatSync, constants, existsSync, accessSync, readdirSync } from 'node:fs';

import * as p from '../src/index.js';
import { prism as color } from '../src/index.js';

async function main() {
  console.clear();

  p.intro(`${color.bgBlue(color.black(' 🚀 Advanced Path Selection '))}`);

  const examples = [
    'source-destination',
    'project-setup',
    'backup-selection',
    'permission-check',
    'relative-paths',
  ];

  const choice = await p.select({
    message: 'Choose an example to run',
    options: [
      {
        value: 'source-destination',
        label: '📋 Source & Destination Selection',
        hint: 'Copy/move operations',
      },
      {
        value: 'project-setup',
        label: '🏗️ Project Setup Wizard',
        hint: 'Multi-step path selection',
      },
      {
        value: 'backup-selection',
        label: '💾 Backup File Selection',
        hint: 'Filter by date and type',
      },
      {
        value: 'permission-check',
        label: '🔒 Permission-aware Selection',
        hint: 'Check read/write access',
      },
      {
        value: 'relative-paths',
        label: '📍 Relative Path Resolution',
        hint: 'Work with relative paths',
      },
      { value: 'all', label: '🎯 Run All Examples', hint: 'Execute all examples in sequence' },
    ],
  });

  if (p.isCancel(choice)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  if (choice === 'all') {
    for (const example of examples) {
      await runExample(example);
      await sleep(1500);
    }
  } else {
    await runExample(choice as string);
  }

  p.outro(color.green('✨ Example completed!'));
}

async function runExample(example: string) {
  switch (example) {
    case 'source-destination':
      await sourceDestinationExample();
      break;
    case 'project-setup':
      await projectSetupExample();
      break;
    case 'backup-selection':
      await backupSelectionExample();
      break;
    case 'permission-check':
      await permissionCheckExample();
      break;
    case 'relative-paths':
      await relativePathsExample();
      break;
  }
}

// Example 1: Source and Destination file selection (copy/move operations)
async function sourceDestinationExample() {
  p.note('Select source and destination for file operations', 'Source & Destination');

  // Select source file
  const sourceFile = await p.path({
    message: 'Select source file to copy',
    initialValue: process.cwd(),
    validate: (value) => {
      if (!value) return 'Please select a file';
      if (!existsSync(value)) return 'Source file does not exist';

      const stats = statSync(value);
      if (stats.isDirectory()) return 'Please select a file, not a directory';

      // Check if file is readable
      try {
        accessSync(value, constants.R_OK);
      } catch {
        return 'File is not readable. Please select a file you have permission to read';
      }

      return undefined;
    },
  });

  if (p.isCancel(sourceFile)) return;

  p.log.info(`Source: ${color.cyan(basename(sourceFile))}`);

  // Select destination directory
  const destDir = await p.path({
    message: 'Select destination directory',
    directory: true,
    initialValue: dirname(sourceFile),
    validate: (value) => {
      if (!value) return 'Please select a directory';
      if (!existsSync(value)) return 'Directory does not exist';

      const stats = statSync(value);
      if (!stats.isDirectory()) return 'Please select a directory';

      // Check if directory is writable
      try {
        accessSync(value, constants.W_OK);
      } catch {
        return 'Directory is not writable. Please select a directory you have permission to write to';
      }

      // Prevent selecting the same directory
      if (resolve(value) === resolve(dirname(sourceFile))) {
        return 'Destination must be different from source directory';
      }

      return undefined;
    },
  });

  if (p.isCancel(destDir)) return;

  const destPath = join(destDir, basename(sourceFile));

  // Check if destination file already exists
  if (existsSync(destPath)) {
    const overwrite = await p.confirm({
      message: `File ${basename(sourceFile)} already exists in destination. Overwrite?`,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.log.warn('Copy operation cancelled');
      return;
    }
  }

  p.log.success(`Would copy: ${color.cyan(sourceFile)} → ${color.green(destPath)}`);
}

// Example 2: Project setup wizard with multiple path selections
async function projectSetupExample() {
  p.note('Setup a new project with proper structure', 'Project Setup Wizard');

  // Select project root
  const projectRoot = await p.path({
    message: 'Select project root directory',
    directory: true,
    initialValue: process.cwd(),
    validate: (value) => {
      if (!value) return 'Please select a directory';
      if (!existsSync(value)) return 'Directory does not exist';

      const stats = statSync(value);
      if (!stats.isDirectory()) return 'Please select a directory';

      // Check if directory is empty or has few files (good for new project)
      const files = readdirSync(value);
      const hasGitIgnore = files.includes('.gitignore');
      const hasPackageJson = files.includes('package.json');

      if (files.length > 10 && !hasPackageJson) {
        return 'Directory contains many files. Consider selecting an empty directory for new project';
      }

      return undefined;
    },
  });

  if (p.isCancel(projectRoot)) return;

  // Select source directory
  const srcDirDefault = join(projectRoot, 'src');
  const srcDir = existsSync(srcDirDefault) ? srcDirDefault : projectRoot;

  const sourceDir = await p.path({
    message: 'Select or create source directory',
    directory: true,
    initialValue: srcDir,
    validate: (value) => {
      if (!value) return 'Please select a directory';

      // Allow non-existent paths (will be created)
      if (!existsSync(value)) {
        const parent = dirname(value);
        if (!existsSync(parent)) {
          return 'Parent directory does not exist';
        }
        // Check if parent is writable
        try {
          accessSync(parent, constants.W_OK);
        } catch {
          return 'Cannot create directory here - no write permission';
        }
      }

      return undefined;
    },
  });

  if (p.isCancel(sourceDir)) return;

  // Select test directory
  const testDirDefault = join(projectRoot, 'test');
  const testDir = existsSync(testDirDefault) ? testDirDefault : projectRoot;

  const testsDir = await p.path({
    message: 'Select or create test directory',
    directory: true,
    initialValue: testDir,
  });

  if (p.isCancel(testsDir)) return;

  // Select config file template
  const configTemplate = await p.path({
    message: 'Select a config file as template (optional - press Esc to skip)',
    initialValue: projectRoot,
    validate: (value) => {
      if (!value) return undefined; // Allow empty (optional)
      if (!existsSync(value)) return 'File does not exist';

      const stats = statSync(value);
      if (stats.isDirectory()) return 'Please select a file';

      const ext = extname(value).toLowerCase();
      const validConfigExts = ['.json', '.js', '.ts', '.yaml', '.yml', '.toml'];

      if (!validConfigExts.includes(ext)) {
        return 'Please select a configuration file';
      }

      return undefined;
    },
  });

  p.log.success(`
Project structure:
${color.cyan('Root:')} ${projectRoot}
${color.cyan('Source:')} ${relative(projectRoot, sourceDir)}
${color.cyan('Tests:')} ${relative(projectRoot, testsDir)}
${color.cyan('Config:')} ${configTemplate && !p.isCancel(configTemplate) ? basename(configTemplate) : 'None'}
	`);
}

// Example 3: Backup file selection with date filtering
async function backupSelectionExample() {
  p.note('Select files for backup based on modification date', 'Backup Selection');

  const backupSource = await p.path({
    message: 'Select file or directory to backup',
    initialValue: process.cwd(),
    validate: (value) => {
      if (!value) return 'Please select a path';
      if (!existsSync(value)) return 'Path does not exist';

      const stats = statSync(value);
      const now = Date.now();
      const fileAge = now - stats.mtime.getTime();
      const daysSinceModified = fileAge / (1000 * 60 * 60 * 24);

      // Warn about old files
      if (daysSinceModified > 365) {
        return `File hasn't been modified in ${Math.floor(daysSinceModified)} days. Are you sure?`;
      }

      // Check size for backup feasibility
      if (stats.size > 1024 * 1024 * 100) {
        // 100MB
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        return `File is ${sizeMB}MB. Consider compressing before backup`;
      }

      return undefined;
    },
  });

  if (p.isCancel(backupSource)) return;

  const stats = statSync(backupSource);
  const modifiedDate = stats.mtime.toLocaleDateString();
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  p.log.success(`
Backup candidate:
${color.cyan('Path:')} ${backupSource}
${color.cyan('Modified:')} ${modifiedDate}
${color.cyan('Size:')} ${sizeMB}MB
${color.cyan('Type:')} ${stats.isDirectory() ? 'Directory' : 'File'}
	`);
}

// Example 4: Permission-aware file selection
async function permissionCheckExample() {
  p.note('Select files with permission checking', 'Permission Check');

  const modes = [
    { value: 'read', label: 'Read-only file', hint: 'Check R permission' },
    { value: 'write', label: 'Writable file', hint: 'Check W permission' },
    { value: 'execute', label: 'Executable file', hint: 'Check X permission' },
    { value: 'all', label: 'Full access file', hint: 'Check RWX permissions' },
  ];

  const mode = await p.select({
    message: 'What permission check do you need?',
    options: modes,
  });

  if (p.isCancel(mode)) return;

  const selectedFile = await p.path({
    message: `Select a file with ${mode} permissions`,
    initialValue: process.cwd(),
    validate: (value) => {
      if (!value) return 'Please select a file';
      if (!existsSync(value)) return 'File does not exist';

      const stats = statSync(value);
      if (stats.isDirectory() && mode !== 'execute') {
        return 'Please select a file, not a directory';
      }

      // Check permissions based on mode
      try {
        switch (mode) {
          case 'read':
            accessSync(value, constants.R_OK);
            break;
          case 'write':
            accessSync(value, constants.W_OK);
            break;
          case 'execute':
            accessSync(value, constants.X_OK);
            break;
          case 'all':
            accessSync(value, constants.R_OK | constants.W_OK | constants.X_OK);
            break;
        }
      } catch (err) {
        const perms = [];
        try {
          accessSync(value, constants.R_OK);
          perms.push('R');
        } catch {}
        try {
          accessSync(value, constants.W_OK);
          perms.push('W');
        } catch {}
        try {
          accessSync(value, constants.X_OK);
          perms.push('X');
        } catch {}

        return `Insufficient permissions. File has: ${perms.join('') || 'none'}, needs: ${mode.toUpperCase()}`;
      }

      // Check if it's a symbolic link
      const lStats = lstatSync(value);
      if (lStats.isSymbolicLink()) {
        return 'Symbolic links not allowed for this operation';
      }

      return undefined;
    },
  });

  if (p.isCancel(selectedFile)) return;

  // Display file permissions
  const perms = [];
  try {
    accessSync(selectedFile, constants.R_OK);
    perms.push('READ');
  } catch {}
  try {
    accessSync(selectedFile, constants.W_OK);
    perms.push('WRITE');
  } catch {}
  try {
    accessSync(selectedFile, constants.X_OK);
    perms.push('EXECUTE');
  } catch {}

  p.log.success(`
File permissions:
${color.cyan('Path:')} ${selectedFile}
${color.cyan('Permissions:')} ${color.green(perms.join(' | '))}
	`);
}

// Example 5: Relative path resolution
async function relativePathsExample() {
  p.note('Work with relative paths and resolution', 'Relative Paths');

  const basePath = await p.path({
    message: 'Select base directory for relative paths',
    directory: true,
    initialValue: process.cwd(),
  });

  if (p.isCancel(basePath)) return;

  const targetPath = await p.path({
    message: 'Select target file/directory',
    initialValue: basePath,
    validate: (value) => {
      if (!value) return 'Please select a path';
      if (!existsSync(value)) return 'Path does not exist';

      // Calculate relative path
      const relPath = relative(basePath, value);

      // Warn if path is outside base directory
      if (relPath.startsWith('..')) {
        return 'Target is outside the base directory. Please select a path within the base directory';
      }

      // Warn about deep nesting
      const depth = relPath.split('/').length;
      if (depth > 5) {
        return `Path is ${depth} levels deep. Consider selecting a path closer to the base`;
      }

      return undefined;
    },
  });

  if (p.isCancel(targetPath)) return;

  const relativePath = relative(basePath, targetPath);
  const absolutePath = resolve(basePath, relativePath);

  p.log.success(`
Path resolution:
${color.cyan('Base:')} ${basePath}
${color.cyan('Target:')} ${targetPath}
${color.cyan('Relative:')} ${color.green(relativePath)}
${color.cyan('Absolute:')} ${absolutePath}
${color.cyan('Is inside base:')} ${!relativePath.startsWith('..')}
	`);
}

// Utility function
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run the demo
main().catch((error) => {
  console.error(color.red('Error:'), error);
  process.exit(1);
});
