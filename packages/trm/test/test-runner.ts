#!/usr/bin/env node

/**
 * Test runner for verifying tests work in all runtimes
 */

import { execSync } from 'child_process';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
};

interface TestResult {
  runtime: string;
  success: boolean;
  error?: string;
  duration?: number;
}

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function runTest(runtime: string, command: string): TestResult {
  const start = Date.now();
  try {
    log(`\n${colors.bold}Running tests with ${runtime}...${colors.reset}`, colors.blue);
    
    const output = execSync(command, {
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    
    const duration = Date.now() - start;
    log(`✓ ${runtime} tests passed (${duration}ms)`, colors.green);
    
    if (output) {
      console.log(output);
    }
    
    return { runtime, success: true, duration };
  } catch (error: any) {
    const duration = Date.now() - start;
    log(`✗ ${runtime} tests failed (${duration}ms)`, colors.red);
    
    if (error.stdout) {
      console.log(error.stdout);
    }
    if (error.stderr) {
      console.error(error.stderr);
    }
    
    return {
      runtime,
      success: false,
      error: error.message,
      duration
    };
  }
}

function checkRuntime(command: string): boolean {
  try {
    execSync(`${command} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  log(`${colors.bold}=== Terminal Library Test Runner ===${colors.reset}\n`, colors.blue);
  
  const results: TestResult[] = [];
  
  // Check available runtimes
  const runtimes = [
    { name: 'Node.js', command: 'node', test: 'npm run test:node', check: 'node' },
    { name: 'Bun', command: 'bun', test: 'npm run test:bun', check: 'bun' },
    { name: 'Deno', command: 'deno', test: 'npm run test:deno', check: 'deno' }
  ];
  
  log('Checking available runtimes...', colors.yellow);
  
  for (const runtime of runtimes) {
    const available = checkRuntime(runtime.check);
    if (available) {
      log(`  ✓ ${runtime.name} is available`, colors.green);
    } else {
      log(`  ✗ ${runtime.name} is not available`, colors.yellow);
    }
  }
  
  // Run tests for available runtimes
  for (const runtime of runtimes) {
    if (checkRuntime(runtime.check)) {
      const result = runTest(runtime.name, runtime.test);
      results.push(result);
    } else {
      results.push({
        runtime: runtime.name,
        success: false,
        error: 'Runtime not available'
      });
    }
  }
  
  // Summary
  log(`\n${colors.bold}=== Test Summary ===${colors.reset}`, colors.blue);
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  
  for (const result of results) {
    const status = result.success ? '✓' : '✗';
    const color = result.success ? colors.green : colors.red;
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    const error = result.error && result.error !== 'Runtime not available' 
      ? ` - ${result.error}` 
      : '';
    
    log(`  ${status} ${result.runtime}${duration}${error}`, color);
  }
  
  log(`\nTotal: ${passed} passed, ${failed} failed (${totalDuration}ms)`, 
    failed > 0 ? colors.red : colors.green);
  
  // Exit with error if any tests failed
  if (failed > 0) {
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    log(`Error: ${error.message}`, colors.red);
    process.exit(1);
  });
}

export { main };