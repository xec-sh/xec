#!/usr/bin/env xec run --universal

// This script can run in Node.js, Bun, or Deno with the universal loader
// Run with: xec run --universal examples/universal-script.ts
// Or with specific runtime: xec run --runtime bun examples/universal-script.ts

import { $ } from '@xec-sh/core';

// Main function to wrap async operations
async function main() {
  // Display runtime information
  console.log(chalk.bold('🚀 Universal Script Example'));
  console.log(chalk.dim('─'.repeat(40)));

  // Detect which runtime we're using
  const runtime = process.env['XEC_RUNTIME'] || 'unknown';
  console.log(`Runtime: ${chalk.cyan(runtime)}`);
  console.log(`Platform: ${chalk.green(os.platform())}`);
  console.log(`Architecture: ${chalk.green(os.arch())}`);
  console.log(chalk.dim('─'.repeat(40)));

  // Example 1: Run commands
  console.log(chalk.yellow('\n📦 Package Manager Detection:'));
  const packageManagers = ['npm', 'yarn', 'pnpm', 'bun'];

  for (const pm of packageManagers) {
    const result = await which(pm).catch(() => null);
    if (result) {
      const version = await $`${pm} --version`.nothrow();
      console.log(`  ${chalk.green('✓')} ${pm}: ${version.stdout.trim()}`);
    } else {
      console.log(`  ${chalk.red('✗')} ${pm}: not found`);
    }
  }

  // Example 2: File operations
  console.log(chalk.yellow('\n📁 File Operations:'));
  const tempFile = tmpfile('universal-test-', '.txt');
  await fs.writeFile(tempFile, 'Hello from universal script!');
  console.log(`  Created temp file: ${chalk.blue(tempFile)}`);

  const content = await fs.readFile(tempFile, 'utf-8');
  console.log(`  Content: ${chalk.gray(content)}`);

  await fs.remove(tempFile);
  console.log(`  ${chalk.green('✓')} Cleaned up temp file`);

  // Example 3: HTTP request (works in all runtimes)
  console.log(chalk.yellow('\n🌐 HTTP Request:'));
  try {
    const response = await fetch('https://api.github.com/repos/xec-sh/xec');
    const data = await response.json();
    console.log(`  Repo: ${chalk.cyan(data.full_name)}`);
    console.log(`  Stars: ${chalk.yellow('⭐')} ${data.stargazers_count}`);
    console.log(`  Language: ${chalk.blue(data.language)}`);
  } catch (error) {
    console.log(`  ${chalk.red('✗')} Failed to fetch repo info`);
  }

  // Example 4: Interactive prompt (if supported)
  console.log(chalk.yellow('\n💬 Interactive Features:'));
  if (process.stdin.isTTY) {
    const name = await question({
      message: 'What\'s your name?',
      defaultValue: 'Anonymous'
    });
    
    console.log(`  Hello, ${chalk.green(name)}!`);
  } else {
    console.log('  (Skipping interactive prompt - not a TTY)');
  }

  // Example 5: Runtime-specific features
  console.log(chalk.yellow('\n⚡ Runtime-Specific Features:'));

  // Check Bun-specific features
  if (typeof globalThis.Bun !== 'undefined') {
    console.log(`  ${chalk.cyan('Bun')} detected!`);
    console.log(`  - Version: ${globalThis.Bun.version}`);
    console.log(`  - Native TypeScript: ${chalk.green('✓')}`);
    console.log(`  - Built-in SQLite: ${chalk.green('✓')}`);
  }

  // Check Deno-specific features
  if (typeof globalThis.Deno !== 'undefined') {
    console.log(`  ${chalk.cyan('Deno')} detected!`);
    console.log(`  - Version: ${globalThis.Deno.version.deno}`);
    console.log(`  - Native TypeScript: ${chalk.green('✓')}`);
    console.log(`  - Built-in permissions: ${chalk.green('✓')}`);
  }

  // Check Node.js-specific features
  if (typeof globalThis.Bun === 'undefined' && typeof globalThis.Deno === 'undefined') {
    console.log(`  ${chalk.cyan('Node.js')} detected!`);
    console.log(`  - Version: ${process.version}`);
    console.log(`  - V8 Version: ${process.versions.v8}`);
  }

  console.log(chalk.dim('\n─'.repeat(40)));
  console.log(chalk.green('✅ Universal script completed successfully!'));
}

// Run main function
main().catch(error => {
  console.error(chalk.red('Error:'), error);
  process.exit(1);
});