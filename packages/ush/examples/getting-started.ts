#!/usr/bin/env node
/**
 * Getting Started with @xec-js/ush
 * 
 * This example is designed for beginners. It introduces concepts
 * one at a time with clear explanations.
 * 
 * To run: ts-node getting-started.ts
 */

import { $ } from '@xec-js/ush';

// Helper to pause between examples
const pause = async (message: string) => {
  console.log(`\n${message}`);
  console.log('Press Enter to continue...');
  await new Promise(resolve => process.stdin.once('data', resolve));
};

async function main() {
  console.log('Welcome to @xec-js/ush! 🚀\n');
  console.log('This tutorial will teach you the basics step by step.\n');

  // ===== LESSON 1: Your First Command =====
  console.log('=== LESSON 1: Your First Command ===\n');

  // The $ function runs shell commands
  console.log('Running a simple echo command:');
  await $`echo "Hello from ush!"`;

  // Commands are asynchronous, so we use 'await'
  console.log('\nCommands run asynchronously. Always use await:');
  await $`echo "This waits for the command to finish"`;

  await pause('Ready for Lesson 2?');

  // ===== LESSON 2: Capturing Output =====
  console.log('\n=== LESSON 2: Capturing Output ===\n');

  // Commands return results you can use
  console.log('Capturing command output:');
  const dateResult = await $`date`;
  console.log('The date command returned:', dateResult.stdout.trim());

  // Results have multiple properties
  console.log('\nExploring result properties:');
  const result = await $`echo "test"`;
  console.log('stdout:', JSON.stringify(result.stdout));  // "test\n"
  console.log('stderr:', JSON.stringify(result.stderr));  // ""
  console.log('exitCode:', result.exitCode);             // 0 (success)

  await pause('Ready for Lesson 3?');

  // ===== LESSON 3: Using Variables =====
  console.log('\n=== LESSON 3: Using Variables ===\n');

  // Variables are automatically escaped for safety
  const name = 'World';
  console.log('Using a variable in a command:');
  await $`echo "Hello, ${name}!"`;

  // This protects against injection attacks
  const dangerousInput = 'test; echo "HACKED"';
  console.log('\nSafe handling of dangerous input:');
  await $`echo "User said: ${dangerousInput}"`;
  console.log('Notice the semicolon was escaped!');

  // Arrays are handled intelligently
  const files = ['file1.txt', 'file2.txt', 'file3.txt'];
  console.log('\nUsing arrays:');
  await $`echo "Files:" ${files}`;

  await pause('Ready for Lesson 4?');

  // ===== LESSON 4: Working Directory =====
  console.log('\n=== LESSON 4: Working Directory ===\n');

  // Create a temporary directory for our examples
  await $`mkdir -p /tmp/ush-tutorial`;

  // Change directory for one command
  console.log('Running ls in /tmp:');
  await $`ls`.cwd('/tmp');

  // Create a new $ with different working directory
  console.log('\nCreating a $ for /tmp/ush-tutorial:');
  const $tutorial = $.cd('/tmp/ush-tutorial');

  // All commands with $tutorial run in that directory
  await $tutorial`touch example.txt`;
  await $tutorial`echo "Hello" > example.txt`;
  await $tutorial`cat example.txt`;

  await pause('Ready for Lesson 5?');

  // ===== LESSON 5: Error Handling =====
  console.log('\n=== LESSON 5: Error Handling ===\n');

  // Commands throw errors on failure by default
  console.log('Handling command failures:');
  try {
    await $`cat /does/not/exist.txt`;
  } catch (error: any) {
    console.log('Error caught!');
    console.log('Exit code:', error.exitCode);
    console.log('Error message:', error.stderr.trim());
  }

  // Use nothrow() to handle errors yourself
  console.log('\nUsing nothrow mode:');
  const result2 = await $`cat /does/not/exist.txt`.nothrow();
  if (result2.exitCode !== 0) {
    console.log('Command failed with exit code:', result2.exitCode);
  }

  await pause('Ready for Lesson 6?');

  // ===== LESSON 6: Environment Variables =====
  console.log('\n=== LESSON 6: Environment Variables ===\n');

  // Set environment variables for a command
  console.log('Setting environment variables:');
  await $`echo "NODE_ENV is: $NODE_ENV"`.env({ NODE_ENV: 'development' });

  // Create a $ with custom environment
  const $production = $.env({
    NODE_ENV: 'production',
    DEBUG: 'false'
  });

  console.log('\nUsing production environment:');
  await $production`echo "NODE_ENV=$NODE_ENV DEBUG=$DEBUG"`;

  await pause('Ready for Lesson 7?');

  // ===== LESSON 7: Command Chaining =====
  console.log('\n=== LESSON 7: Command Chaining ===\n');

  // You can chain multiple configurations
  console.log('Chaining configurations:');
  await $`ls -la`
    .cwd('/tmp')
    .env({ LANG: 'en_US.UTF-8' })
    .timeout(5000)
    .quiet();  // Suppress output

  console.log('Command completed quietly!');

  // Create reusable configurations
  const $myConfig = $.cd('/tmp/ush-tutorial')
    .env({ APP_NAME: 'Tutorial' })
    .timeout(10000);

  console.log('\nUsing reusable configuration:');
  await $myConfig`echo "Working in $PWD with app $APP_NAME"`;

  await pause('Ready for Lesson 8?');

  // ===== LESSON 8: Pipes and Streams =====
  console.log('\n=== LESSON 8: Pipes and Streams ===\n');

  // Using pipes within commands
  console.log('Using shell pipes:');
  await $.raw`echo "apple\nbanana\napple\ncherry" | sort | uniq`;

  // Using ush pipe for better error handling
  console.log('\nUsing ush pipes:');
  await $.pipe(
    $`echo "Line 1\nLine 2\nLine 3"`,
    $`grep "2"`,
    $`wc -l`
  );

  await pause('Ready for the final lesson?');

  // ===== LESSON 9: Practical Example =====
  console.log('\n=== LESSON 9: Practical Example ===\n');
  console.log('Let\'s create a simple backup script:\n');

  // Define what to backup
  const sourceDir = '/tmp/ush-tutorial';
  const backupName = `backup-${new Date().toISOString().split('T')[0]}.tar.gz`;
  const backupPath = `/tmp/${backupName}`;

  // Create the backup
  console.log(`Creating backup of ${sourceDir}...`);
  await $`tar -czf ${backupPath} -C /tmp ush-tutorial`;

  // Check the backup
  const size = await $`du -h ${backupPath} | cut -f1`;
  console.log(`Backup created: ${backupPath} (${size.stdout.trim()})`);

  // List contents
  console.log('\nBackup contents:');
  await $`tar -tzf ${backupPath} | head -5`;

  // Cleanup
  console.log('\nCleaning up...');
  await $`rm -rf /tmp/ush-tutorial ${backupPath}`;

  console.log('\n🎉 Congratulations! You\'ve completed the tutorial!');
  console.log('\nNext steps:');
  console.log('- Check out common-patterns.ts for idiomatic usage');
  console.log('- Explore real-world/ directory for practical examples');
  console.log('- Read the README.md for comprehensive documentation');
  console.log('\nHappy scripting! 🚀');
}

// Run the tutorial
if (require.main === module) {
  // Set up stdin for pause functionality
  process.stdin.setRawMode?.(true);
  process.stdin.resume();

  main()
    .catch(console.error)
    .finally(() => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.exit(0);
    });
}