#!/usr/bin/env tsx
/**
 * Docker Run Mode Helper Example
 * 
 * This example shows a helper function for easier use of Docker run mode
 */

import { $ } from '../../src/index.js';

// Helper function for Docker run mode - now using simplified API
function dockerRun(image: string, options?: {
  volumes?: string[];
  workdir?: string;
  user?: string;
  env?: Record<string, string>;
}) {
  return $.docker({
    image,
    volumes: options?.volumes,
    workdir: options?.workdir,
    user: options?.user,
    env: options?.env
  });
}

async function main() {
  console.log('🐳 Docker Run Mode with Helper\n');

  // Example 1: Simple usage
  console.log('1️⃣ Simple command:');
  const result1 = await dockerRun('alpine:latest')`echo "Hello from Alpine!"`;
  console.log(result1.stdout);

  // Example 2: With volume
  console.log('\n2️⃣ With volume mount:');
  const result2 = await dockerRun('alpine:latest', {
    volumes: [`${process.cwd()}:/data:ro`],
    workdir: '/data'
  })`ls -la | head -5`;
  console.log(result2.stdout);

  // Example 3: Python example
  console.log('\n3️⃣ Running Python:');
  const result3 = await dockerRun('python:3-alpine')`python -c "
import sys
print(f'Python {sys.version}')
print('Hello from containerized Python!')
"`;
  console.log(result3.stdout);

  // Example 4: Node.js example
  console.log('\n4️⃣ Running Node.js:');
  const result4 = await dockerRun('node:alpine')`node -e "
console.log('Node.js', process.version);
console.log('Hello from containerized Node.js!');
"`;
  console.log(result4.stdout);

  // Example 5: Using tools not installed locally
  console.log('\n5️⃣ Using containerized tools:');
  
  // Pandoc example (markdown to HTML converter)
  const markdown = '# Hello\n\nThis is **bold** text.';
  const result5 = await dockerRun('pandoc/core')`echo ${markdown} | pandoc -f markdown -t html`;
  console.log('Converted HTML:', result5.stdout);

  // Example 6: Comparison of old vs new API
  console.log('\n6️⃣ API Comparison:');
  console.log('Old API required verbose configuration:');
  console.log(`$.with({ adapter: 'docker', adapterOptions: { runMode: 'run', ... }})`);
  console.log('\nNew simplified API:');
  console.log(`$.docker({ image: 'alpine' }) or $.docker().ephemeral('alpine').run`);

  console.log('\n✅ Done!');
}

// Extension: Create a more advanced helper using fluent API using fluent API
const containerTools = {
  // Run jq for JSON processing
  jq: (query: string) => $.docker().ephemeral('stedolan/jq').run`echo ${query}`,
  
  // Run Python scripts
  python: (script: string) => $.docker().ephemeral('python:3-alpine').run`python -c ${script}`,
  
  // Run Node.js scripts
  node: (script: string) => $.docker().ephemeral('node:alpine').run`node -e ${script}`,
  
  // Run shell scripts in Alpine
  alpine: () => $.docker({ image: 'alpine:latest' }),
  
  // Run Ubuntu commands
  ubuntu: () => $.docker({ image: 'ubuntu:latest' })
};

// Example usage of containerTools
async function advancedExample() {
  console.log('\n\n🚀 Advanced Container Tools Example:\n');

  // Process JSON with jq
  const json = JSON.stringify({ users: [{ name: 'Alice' }, { name: 'Bob' }] });
  const names = await containerTools.jq(json)`jq -r '.users[].name'`;
  console.log('Extracted names:', names.stdout);

  // Run Python calculation
  const pythonResult = await containerTools.python(`
import math
print(f"Pi squared is {math.pi ** 2:.4f}")
`)``;
  console.log(pythonResult.stdout);

  // Check Ubuntu version
  const ubuntuVersion = await containerTools.ubuntu()`cat /etc/os-release | grep VERSION= | head -1`;
  console.log('Ubuntu:', ubuntuVersion.stdout.trim());
}

// Run examples
main()
  .then(() => advancedExample())
  .catch(console.error);