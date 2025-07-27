/**
 * 04. Environment Variables - Working with Environment Variables
 * 
 * Demonstrates various ways to work with environment variables.
 * @xec-sh/core allows flexible environment management for each command.
 */

import { $ } from '@xec-sh/core';

// 1. Using existing variables
// Commands inherit the current environment by default
const home = await $`echo $HOME`;
console.log('Home directory:', home.stdout.trim());

// 2. Setting variables for a single command
// The env() method allows setting variables for a specific command
const result = await $`echo $MY_VAR`.env({ MY_VAR: 'Hello from env!' });
console.log('Result:', result.stdout.trim());

// 3. Setting multiple variables
// You can create a new instance with preset variables
const envVars = {
  NODE_ENV: 'production',
  DEBUG: 'true',
  API_KEY: 'secret-key-123'
};

// Create a new instance with added variables
const $withEnv = $.env(envVars);
await $withEnv`echo "Environment: $NODE_ENV, Debug: $DEBUG"`;

// 4. Inheriting current environment
// By default, commands inherit all variables from process.env
const inheritedResult = await $`printenv | grep PATH`;
console.log('PATH variable:', inheritedResult.stdout);

// 5. Overriding existing variables
// You can override any variables, including system ones
const customPath = '/custom/bin:' + process.env['PATH'];
const pathResult = await $`echo $PATH`.env({ PATH: customPath });
console.log('Custom PATH:', pathResult.stdout.trim());

// 6. Minimal environment
// You can set only necessary variables
const minimalEnv = await $`printenv | wc -l`.env({ 
  PATH: '/usr/bin:/bin',
  HOME: process.env['HOME'] || '/tmp'
});
console.log('Number of variables:', minimalEnv.stdout.trim());

// 7. Command chaining with different variables
// The env() method creates a new instance with supplemented variables
const $dev = $.env({ NODE_ENV: 'development' });
const $prod = $dev.env({ NODE_ENV: 'production' }); // Overrides NODE_ENV

await $dev`echo "Environment: $NODE_ENV"`; // development
await $prod`echo "Environment: $NODE_ENV"`; // production

// 8. Using variables in complex commands
// Multi-line commands can use environment variables
const appName = 'MyApp';
const version = '1.0.0';

const buildResult = await $`
  echo "Building \${APP_NAME} v\${VERSION}..."
  echo "Configuration: \${NODE_ENV}"
  echo "Debug mode: \${DEBUG}"
`.env({
  APP_NAME: appName,
  VERSION: version,
  NODE_ENV: 'production',
  DEBUG: 'false'
});

console.log('Build result:', buildResult.stdout);

// 9. Combining with other configuration methods
// The env() method can be combined with other methods
const $configured = $.env({ API_KEY: 'secret-key' })
  .cd('/tmp')       // Change working directory
  .timeout(10000);  // Set timeout

await $configured`pwd && echo "API_KEY: $API_KEY"`;

// 10. Passing variables between commands
// Set a variable in one command and use it in another
const $withOutput = $.env({ OUTPUT_DIR: '/tmp/output' });

// First command creates directory
await $withOutput`mkdir -p $OUTPUT_DIR`;

// Second command uses the same variable
await $withOutput`echo "Data" > $OUTPUT_DIR/file.txt`;

// Check result
await $withOutput`ls -la $OUTPUT_DIR`;

// Clean up
await $withOutput`rm -rf $OUTPUT_DIR`;

// Note: All environment variables exist only within the scope
// of command execution. They don't change the global Node.js environment.
