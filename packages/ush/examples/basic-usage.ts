import { $, createExecutionEngine } from '../src/index.js';

// Example 1: Basic usage with global $
async function example1() {
  console.log('=== Example 1: Basic commands ===');
  
  const result = await $`echo "Hello, World!"`;
  console.log('Output:', result.stdout.trim());
  console.log('Exit code:', result.exitCode);
}

// Example 2: Template literal interpolation
async function example2() {
  console.log('\n=== Example 2: Template interpolation ===');
  
  const filename = 'my file.txt';
  const result = await $`echo "File: ${filename}"`;
  console.log('Output:', result.stdout.trim());
}

// Example 3: Configuration chaining
async function example3() {
  console.log('\n=== Example 3: Configuration chaining ===');
  
  const $prod = $.with({
    env: { NODE_ENV: 'production' },
    cwd: '/tmp'
  });
  
  const result = await $prod.run`echo "Environment: $NODE_ENV"`;
  console.log('Output:', result.stdout.trim());
}

// Example 4: Error handling
async function example4() {
  console.log('\n=== Example 4: Error handling ===');
  
  try {
    await $`exit 1`;
  } catch (error: any) {
    console.log('Caught error:', error.message);
    console.log('Exit code:', error.exitCode);
  }
  
  // Using nothrow
  const $noThrow = createExecutionEngine({ throwOnNonZeroExit: false });
  const result = await $noThrow`exit 42`;
  console.log('Exit code without throwing:', result.exitCode);
}

// Example 5: Different adapters (mock example)
async function example5() {
  console.log('\n=== Example 5: Using different adapters ===');
  
  // Local execution (default)
  const localResult = await $`echo "Local execution"`;
  console.log('Local:', localResult.stdout.trim());
  
  // SSH example (would require actual SSH server)
  // const $remote = $.ssh({
  //   host: 'server.example.com',
  //   username: 'user'
  // });
  // const remoteResult = await $remote.run`echo "Remote execution"`;
  
  // Docker example (would require Docker)
  // const $docker = $.docker({
  //   container: 'alpine',
  //   workdir: '/app'
  // });
  // const dockerResult = await $docker.run`echo "Docker execution"`;
}

// Example 6: Working with directories and environment
async function example6() {
  console.log('\n=== Example 6: Directories and environment ===');
  
  const $custom = $
    .cd('/tmp')
    .env({ CUSTOM_VAR: 'Hello from env' })
    .timeout(5000);
    
  const pwd = await $custom.run`pwd`;
  console.log('Working directory:', pwd.stdout.trim());
  
  const env = await $custom.run`echo $CUSTOM_VAR`;
  console.log('Environment variable:', env.stdout.trim());
}

// Run all examples
async function main() {
  try {
    await example1();
    await example2();
    await example3();
    await example4();
    await example5();
    await example6();
  } catch (error) {
    console.error('Error in examples:', error);
  }
}

main();