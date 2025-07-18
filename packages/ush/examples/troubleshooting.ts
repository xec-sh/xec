#!/usr/bin/env node
/**
 * Troubleshooting Guide for @xec/ush
 * 
 * This file demonstrates common issues and their solutions,
 * helping you debug problems when using @xec/ush.
 */

import { $ } from '@xec/ush';

// ===== Issue 1: Command Not Found =====
async function handleCommandNotFound() {
  console.log('=== Issue: Command Not Found ===\n');
  
  // Problem: Command might not be in PATH
  console.log('Problem: Command not in PATH');
  
  try {
    await $`custom-command --help`;
  } catch (error: any) {
    console.log('Error:', error.stderr.trim());
  }
  
  // Solution 1: Use full path
  console.log('\nSolution 1: Use full path');
  try {
    await $`/usr/local/bin/custom-command --help`;
    console.log('✓ Command executed with full path');
  } catch (error) {
    console.log('Command still not found');
  }
  
  // Solution 2: Check if command exists first
  console.log('\nSolution 2: Check if command exists');
  const commands = ['node', 'npm', 'custom-command'];
  
  for (const cmd of commands) {
    const exists = await $.which(cmd);
    if (exists) {
      console.log(`✓ ${cmd} found at: ${exists}`);
    } else {
      console.log(`✗ ${cmd} not found`);
    }
  }
  
  // Solution 3: Modify PATH
  console.log('\nSolution 3: Modify PATH');
  const $withPath = $.env({
    PATH: `/usr/local/bin:/opt/bin:${process.env.PATH}`
  });
  
  try {
    await $withPath`custom-command --help`;
    console.log('✓ Command found with modified PATH');
  } catch (error) {
    console.log('Command still not found even with extended PATH');
  }
}

// ===== Issue 2: Shell Escaping Problems =====
async function handleEscapingIssues() {
  console.log('\n=== Issue: Shell Escaping Problems ===\n');
  
  // Problem: Special characters in filenames
  const problematicFiles = [
    'file with spaces.txt',
    'file(with)parens.txt',
    'file$with$dollar.txt',
    'file;with;semicolon.txt',
    'file\'with\'quotes.txt'
  ];
  
  console.log('Creating files with problematic names...');
  const testDir = `/tmp/ush-escaping-test-${Date.now()}`;
  await $`mkdir -p ${testDir}`;
  
  // Safe way: Use template literals (automatic escaping)
  console.log('\n✓ Safe way: Template literals');
  for (const file of problematicFiles) {
    await $`touch ${testDir}/${file}`;
    console.log(`Created: ${file}`);
  }
  
  // List files to verify
  console.log('\nVerifying files were created correctly:');
  await $`ls -la ${testDir}`;
  
  // Dangerous way: Raw mode (be careful!)
  console.log('\n⚠️  Dangerous: Raw mode without escaping');
  const userInput = 'test.txt; echo "INJECTED"';
  
  try {
    // This would be dangerous with user input
    await $.raw`echo ${userInput}`;
  } catch (error) {
    console.log('Raw mode can be dangerous with user input!');
  }
  
  // Clean up
  await $`rm -rf ${testDir}`;
}

// ===== Issue 3: Large Output Handling =====
async function handleLargeOutput() {
  console.log('\n=== Issue: Large Output Handling ===\n');
  
  // Problem: Command produces huge output
  console.log('Problem: Commands with large output can cause memory issues');
  
  // Create a large file for testing
  const largeFile = '/tmp/large-test.txt';
  console.log('\nCreating large test file...');
  await $`seq 1 1000000 > ${largeFile}`;
  
  // Wrong way: Loading everything into memory
  console.log('\n✗ Wrong way: Loading entire output');
  try {
    const result = await $`cat ${largeFile}`;
    console.log(`Output size: ${result.stdout.length} bytes`);
  } catch (error) {
    console.log('This could cause memory issues with very large files');
  }
  
  // Solution 1: Stream processing
  console.log('\n✓ Solution 1: Stream processing');
  let lineCount = 0;
  await $.stream`cat ${largeFile}`
    .onLine(() => {
      lineCount++;
      if (lineCount % 100000 === 0) {
        process.stdout.write(`\rProcessed ${lineCount} lines...`);
      }
    })
    .onComplete(() => {
      console.log(`\rTotal lines processed: ${lineCount}`);
    });
  
  // Solution 2: Use head/tail to limit output
  console.log('\n✓ Solution 2: Limit output with head/tail');
  const first10 = await $`head -10 ${largeFile}`;
  console.log('First 10 lines:', first10.stdout.trim().split('\n').length);
  
  // Solution 3: Process in chunks
  console.log('\n✓ Solution 3: Process in chunks');
  const chunkSize = 1000;
  for (let i = 0; i < 10; i++) {
    const start = i * chunkSize + 1;
    const end = (i + 1) * chunkSize;
    await $`sed -n '${start},${end}p' ${largeFile} | wc -l`.quiet();
    process.stdout.write(`\rProcessed chunk ${i + 1}/10`);
  }
  console.log('\nChunk processing complete');
  
  // Clean up
  await $`rm -f ${largeFile}`;
}

// ===== Issue 4: Timeout Handling =====
async function handleTimeouts() {
  console.log('\n=== Issue: Command Timeouts ===\n');
  
  // Problem: Long-running commands
  console.log('Problem: Commands that take too long');
  
  // Example: Command that takes too long
  console.log('\n✗ Command that will timeout:');
  try {
    await $`sleep 10`.timeout(2000);  // 2 second timeout
  } catch (error: any) {
    console.log(`Timeout error: ${error.message}`);
    console.log(`Command was killed after ${error.timeout}ms`);
  }
  
  // Solution 1: Increase timeout
  console.log('\n✓ Solution 1: Increase timeout');
  try {
    await $`sleep 2`.timeout(5000);  // 5 second timeout
    console.log('Command completed within timeout');
  } catch (error) {
    console.log('Still timed out');
  }
  
  // Solution 2: Disable timeout for long operations
  console.log('\n✓ Solution 2: Disable timeout');
  await $`echo "Long operation started..." && sleep 1 && echo "Done!"`.timeout(0);
  
  // Solution 3: Progress indication for long operations
  console.log('\n✓ Solution 3: Show progress');
  const longOperation = async () => {
    for (let i = 1; i <= 5; i++) {
      process.stdout.write(`\rProgress: ${i}/5`);
      await $`sleep 0.5`.quiet();
    }
    console.log('\rOperation complete!    ');
  };
  await longOperation();
}

// ===== Issue 5: SSH Connection Issues =====
async function handleSSHIssues() {
  console.log('\n=== Issue: SSH Connection Problems ===\n');
  
  // Common SSH problems and solutions
  console.log('Common SSH connection issues:');
  
  // Problem 1: Connection timeout
  console.log('\n1. Connection timeout');
  console.log('Solution: Configure timeouts');
  
  const $sshWithTimeout = $.ssh({
    host: 'example.com',
    username: 'user',
    connectTimeout: 10000,    // 10 second connection timeout
    readyTimeout: 5000,       // 5 second ready timeout
    retries: 3                // Retry 3 times
  });
  
  console.log('SSH configured with timeout and retry settings');
  
  // Problem 2: Host key verification
  console.log('\n2. Host key verification failed');
  console.log('Solution: Add host to known_hosts or disable strict checking');
  console.log('Note: Only disable strict checking for trusted networks!');
  
  // Problem 3: Authentication failures
  console.log('\n3. Authentication failures');
  console.log('Solution: Check SSH key permissions');
  
  // Check key permissions
  const keyPath = `${process.env.HOME}/.ssh/id_rsa`;
  const keyExists = await $`test -f ${keyPath}`.nothrow();
  
  if (keyExists.exitCode === 0) {
    const permissions = await $`stat -c %a ${keyPath} 2>/dev/null || stat -f %p ${keyPath}`;
    console.log(`Key permissions: ${permissions.stdout.trim()}`);
    console.log('Should be 600 (read/write for owner only)');
  }
  
  // Problem 4: Connection pooling
  console.log('\n4. Too many connections');
  console.log('Solution: Reuse connections');
  
  // Good: Reuse connection
  const $remote = $.ssh('user@server.com');
  console.log('✓ Reusing single SSH connection for multiple commands');
  
  // Bad: Creating new connection each time
  console.log('✗ Avoid creating new connections for each command');
}

// ===== Issue 6: Environment Variable Issues =====
async function handleEnvVarIssues() {
  console.log('\n=== Issue: Environment Variable Problems ===\n');
  
  // Problem: Environment variables not set
  console.log('Problem: Missing environment variables');
  
  // Check current environment
  console.log('\nCurrent NODE_ENV:', process.env.NODE_ENV || '(not set)');
  
  // Solution 1: Set for specific command
  console.log('\n✓ Solution 1: Set for specific command');
  await $`echo "NODE_ENV is: $NODE_ENV"`.env({ NODE_ENV: 'test' });
  
  // Solution 2: Create configured instance
  console.log('\n✓ Solution 2: Create configured instance');
  const $configured = $.env({
    NODE_ENV: 'production',
    API_URL: 'https://api.example.com',
    DEBUG: 'false'
  });
  
  await $configured`echo "Environment: NODE_ENV=$NODE_ENV, API_URL=$API_URL"`;
  
  // Solution 3: Load from .env file
  console.log('\n✓ Solution 3: Load from .env file');
  const envFile = '/tmp/.env.example';
  await $`echo "DATABASE_URL=postgres://localhost/mydb" > ${envFile}`;
  
  // Source the env file
  const envVars = await $`cat ${envFile} | grep -v '^#' | xargs`;
  console.log('Environment variables from file:', envVars.stdout.trim());
  
  // Clean up
  await $`rm -f ${envFile}`;
}

// ===== Issue 7: Error Information =====
async function handleErrorDebugging() {
  console.log('\n=== Issue: Debugging Command Errors ===\n');
  
  // Enhanced error information
  console.log('Getting detailed error information:');
  
  try {
    await $`ls /nonexistent/directory/that/does/not/exist`;
  } catch (error: any) {
    console.log('\nError details:');
    console.log('- Message:', error.message);
    console.log('- Command:', error.command);
    console.log('- Exit code:', error.exitCode);
    console.log('- Stdout:', JSON.stringify(error.stdout));
    console.log('- Stderr:', error.stderr.trim());
    console.log('- Duration:', error.duration, 'ms');
  }
  
  // Debug mode for more information
  console.log('\n✓ Enable verbose mode for debugging:');
  try {
    await $`false`.verbose();  // 'false' command always fails
  } catch (error) {
    console.log('Verbose mode provides more context');
  }
  
  // Custom error handling
  console.log('\n✓ Custom error handling:');
  const executeWithContext = async (command: string, context: any) => {
    try {
      return await $`${command}`;
    } catch (error: any) {
      console.error('\nCommand failed!');
      console.error('Context:', context);
      console.error('Error:', error.message);
      throw error;
    }
  };
  
  try {
    await executeWithContext('exit 42', { 
      operation: 'test',
      timestamp: new Date().toISOString()
    });
  } catch {
    // Error was logged with context
  }
}

// ===== Issue 8: Platform Differences =====
async function handlePlatformDifferences() {
  console.log('\n=== Issue: Platform Differences ===\n');
  
  // Detect platform
  const platform = process.platform;
  console.log(`Current platform: ${platform}`);
  
  // Platform-specific commands
  const commands = {
    darwin: {
      openFile: 'open',
      copyToClipboard: 'pbcopy',
      pasteFromClipboard: 'pbpaste',
      processInfo: 'ps aux'
    },
    linux: {
      openFile: 'xdg-open',
      copyToClipboard: 'xclip -selection clipboard',
      pasteFromClipboard: 'xclip -selection clipboard -o',
      processInfo: 'ps aux'
    },
    win32: {
      openFile: 'start',
      copyToClipboard: 'clip',
      pasteFromClipboard: 'powershell Get-Clipboard',
      processInfo: 'tasklist'
    }
  };
  
  const platformCommands = commands[platform] || commands.linux;
  
  // Example: Copy to clipboard (platform-specific)
  console.log('\n✓ Platform-specific command example:');
  const testText = 'Hello from ush!';
  
  try {
    await $`echo ${testText} | ${platformCommands.copyToClipboard}`;
    console.log(`Copied "${testText}" to clipboard using ${platform} command`);
  } catch (error) {
    console.log('Clipboard command not available on this system');
  }
  
  // Solution: Abstract platform differences
  console.log('\n✓ Better solution: Abstract platform differences');
  
  class PlatformCommands {
    static async openFile(filepath: string) {
      const opener = {
        darwin: 'open',
        linux: 'xdg-open',
        win32: 'start'
      }[platform] || 'xdg-open';
      
      return $`${opener} ${filepath}`;
    }
    
    static async getProcessList() {
      if (platform === 'win32') {
        return $`tasklist`;
      }
      return $`ps aux`;
    }
  }
  
  console.log('Platform abstraction created - use PlatformCommands class');
}

// ===== Run all troubleshooting examples =====
async function main() {
  console.log('🔧 @xec/ush Troubleshooting Guide\n');
  console.log('This guide demonstrates common issues and their solutions.\n');
  
  const examples = [
    { name: 'Command Not Found', fn: handleCommandNotFound },
    { name: 'Shell Escaping', fn: handleEscapingIssues },
    { name: 'Large Output', fn: handleLargeOutput },
    { name: 'Timeouts', fn: handleTimeouts },
    { name: 'SSH Issues', fn: handleSSHIssues },
    { name: 'Environment Variables', fn: handleEnvVarIssues },
    { name: 'Error Debugging', fn: handleErrorDebugging },
    { name: 'Platform Differences', fn: handlePlatformDifferences }
  ];
  
  for (const example of examples) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Running: ${example.name}`);
    console.log('='.repeat(50));
    
    try {
      await example.fn();
    } catch (error: any) {
      console.error(`\nExample failed: ${error.message}`);
    }
    
    // Pause between examples
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n✅ Troubleshooting guide complete!');
  console.log('\nKey takeaways:');
  console.log('- Always use template literals for safe variable interpolation');
  console.log('- Check command existence before executing');
  console.log('- Use streaming for large outputs');
  console.log('- Configure appropriate timeouts');
  console.log('- Reuse SSH connections');
  console.log('- Handle platform differences gracefully');
  console.log('- Use verbose mode for debugging');
}

if (require.main === module) {
  main().catch(console.error);
}