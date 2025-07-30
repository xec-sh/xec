#!/usr/bin/env tsx
/**
 * Docker Run Mode Example
 * 
 * This example demonstrates using Docker's run mode for ephemeral containers
 * that execute a single command and exit immediately.
 */

import { $ } from '../../src/index.js';

async function main() {
  console.log('🐳 Docker Run Mode Example\n');

  // Example 1: Simple ephemeral container
  console.log('1️⃣ Running a simple command in an ephemeral container:');
  const result1 = await $.docker({
    image: 'alpine:latest'
  })`echo "Hello from ephemeral container!"`;
  
  console.log('Output:', result1.stdout);

  // Example 2: With volume mounts
  console.log('\n2️⃣ Running with volume mounts:');
  const result2 = await $.docker({
    image: 'alpine:latest',
    volumes: [`${process.cwd()}:/workspace:ro`],
    workdir: '/workspace'
  })`ls -la`;
  
  console.log('Files in current directory:');
  console.log(result2.stdout);

  // Example 3: With environment variables
  console.log('\n3️⃣ Running with environment variables:');
  const result3 = await $.docker({
    image: 'alpine:latest',
    env: {
      MY_VAR: 'Hello from env!',
      USER_NAME: 'xec-user'
    }
  })`sh -c 'echo "MY_VAR=$MY_VAR, USER_NAME=$USER_NAME"'`;
  
  console.log('Environment output:', result3.stdout);

  // Example 4: Using fluent API for more control
  console.log('\n4️⃣ Using fluent API for ephemeral containers:');
  try {
    const result4 = await $.docker()
      .ephemeral('alpine:latest')
      .workdir('/etc')
      .run`cat os-release | head -3`;
    
    console.log('OS Info:', result4.stdout);
  } catch (error) {
    console.error('Error:', error);
  }

  // Example 5: Complex command with shell
  console.log('\n5️⃣ Running complex shell command:');
  const result5 = await $.docker({
    image: 'alpine:latest'
  })`sh -c 'echo "Files in /etc:" && ls /etc | head -5 | nl'`;
  
  console.log(result5.stdout);

  // Example 6: Using run mode for tools that aren't installed locally
  console.log('\n6️⃣ Using containerized tools:');
  
  // Example with jq (JSON processor)
  const jsonData = JSON.stringify({ name: 'xec', type: 'tool', awesome: true });
  const result6 = await $.docker({
    image: 'stedolan/jq'
  })`echo ${jsonData} | jq .name`;
  
  console.log('Extracted name:', result6.stdout.trim());

  // Example 7: Comparing old vs new API
  console.log('\n7️⃣ API Comparison:');
  console.log('Old verbose API required:');
  console.log(`  $.with({ adapter: 'docker', adapterOptions: { type: 'docker', runMode: 'run', ... }})`);
  console.log('\nNew simplified API:');
  console.log(`  $.docker({ image: 'alpine' }) or $.docker().ephemeral('alpine').run`);

  console.log('\n✅ All examples completed!');
}

// Run the example
main().catch(console.error);