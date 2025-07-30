/**
 * 05. Working Directory - Working Directory Management
 * 
 * Demonstrates various ways to manage working directories.
 * @xec-sh/core allows setting the working directory for each
 * command independently, without affecting the current Node.js process.
 */

import * as os from 'os';
import * as path from 'path';
import { $ } from '@xec-sh/core';

// 1. Current working directory
// By default, commands are executed in the current process directory
const currentDir = await $`pwd`;
console.log('Current directory:', currentDir.stdout.trim());
console.log('Node.js current directory:', process.cwd());

// 2. Changing directory for a single command
// The cwd() method on ProcessPromise sets the directory for a specific command
const tmpResult = await $`pwd`.cwd('/tmp');
console.log('Directory for command:', tmpResult.stdout.trim());

// 3. Creating context with new working directory
// The cd() method creates a new instance with changed working directory
const $inTmp = $.cd('/tmp');
await $inTmp`touch test-file.txt`;
await $inTmp`ls test-file.txt`;
await $inTmp`rm test-file.txt`;

// 4. Relative paths
// You can use any paths - absolute or relative
const homeDir = os.homedir();
const $inHome = $.cd(homeDir);
const homePwd = await $inHome`pwd`;
console.log('Home directory:', homePwd.stdout.trim());

// 5. Chaining directory changes - DOESN'T WORK!
// Note: cd() sets absolute path, not relative
// If you need to set relative path, use path.join:
const tmpDir = '/tmp';
const subfolder = path.join(tmpDir, 'subfolder');
const $nested1 = $.cd(subfolder);

// Create directory first
await $`mkdir -p ${subfolder}`;
const nestedPwd1 = await $nested1`pwd`;
console.log('Nested directory:', nestedPwd1.stdout.trim()); // /tmp/subfolder

// 6. Using within for temporary directory change
// within allows temporarily changing configuration for all commands inside
const result = await $`ls`.cwd('/tmp');
console.log('Files in /tmp:', result.stdout);

// After within, configuration doesn't affect external commands
const afterWithin = await $`pwd`;
console.log('Directory after within:', afterWithin.stdout.trim());

// 7. Combining cd with other methods
// Configuration methods can be chained
const $complex = $.cd('/tmp')
  .env({ WORKING_DIR: '/tmp' })
  .timeout(5000);

await $complex`echo "Working in: $WORKING_DIR" && pwd`;

// 8. Checking directory existence before cd
// It's important to ensure the directory exists before using it
const targetDir1 = '/tmp/test-directory';
try {
  // Create directory
  await $`mkdir -p ${targetDir1}`;

  // Check that it exists
  const exists = await $`test -d ${targetDir1} && echo "exists"`.nothrow();
  if (exists.ok) {
    const $inTarget = $.cd(targetDir1);
    await $inTarget`touch file.txt`;
    await $inTarget`ls`;
  }
} finally {
  // Clean up
  await $`rm -rf ${targetDir1}`;
}

// 9. Working with absolute and relative paths
// cd() always sets absolute path
const baseDir = '/tmp';
const $base = $.cd(baseDir);

// Create nested directory
await $base`mkdir -p subdir/nested`;

// For relative paths, you need to build the full path
const nestedPath = path.join(baseDir, 'subdir/nested');
const $nested2 = $.cd(nestedPath);
const nestedPwd2 = await $nested2`pwd`;
console.log('Nested path:', nestedPwd2.stdout.trim()); // /tmp/subdir/nested

// Absolute path
const $absolute = $.cd('/usr/local');
const absolutePwd = await $absolute`pwd`;
console.log('Absolute path:', absolutePwd.stdout.trim()); // /usr/local

// 10. Complex scenario example
// Copying files using different directories
const sourceDir = '/tmp/source';
const targetDir2 = '/tmp/target';

try {
  // Prepare directories
  await $`mkdir -p ${sourceDir} ${targetDir2}`;

  // Create files in source directory
  const $source = $.cd(sourceDir);
  await $source`echo "Source content" > file.txt`;
  await $source`echo "Another file" > file2.txt`;

  // Copy files to target directory
  const $target = $.cd(targetDir2);
  await $target`cp ${sourceDir}/* .`;

  // Check result
  const files = await $target`ls -la`;
  console.log('Files in target directory:', files.stdout);
} finally {
  // Cleanup
  await $`rm -rf ${sourceDir} ${targetDir2} /tmp/subdir /tmp/subfolder`;
}

// Note: Changing working directory doesn't affect the current process.
// Each command is executed in a separate shell process with the specified directory.
