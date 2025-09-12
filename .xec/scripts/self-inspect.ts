#!/usr/bin/env xec
/// <reference path="/Users/taaliman/projects/xec-sh/xec/apps/xec/globals.d.ts" />

/**
 * Xec self inspection
 * 
 * Usage: xec .xec/scripts/self-inspect.ts
 */

// Type-safe command execution
const result = await $`echo "Hello from TypeScript!"`;
log.success(result.stdout);

// Work with files using built-in fs
const files = await glob('**/*.ts');
log.step(`Found ${files.length} TypeScript files`);

// Interactive prompts with type inference
const qName = await kit.text({
  message: 'What is your name?',
  defaultValue: 'Developer'
});

// Use chalk for colored output
log.info(prism.blue(`Hello, ${qName}!`));

// Example: Fetch data from API
interface GitHubRepo {
  name: string;
  description: string;
  stargazers_count: number;
}

try {
  const response = await fetch('https://api.github.com/repos/xec-sh/xec');
  const repo: GitHubRepo = await response.json();

  log.step(`Repo: ${prism.cyan(repo.name)}`);
  log.step(`Stars: ${prism.yellow('⭐')} ${repo.stargazers_count}`);
} catch (error) {
  log.error(`Failed to fetch repo info: ${error}`);
}

log.success('✅ Script completed successfully!');
