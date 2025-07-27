/**
 * 01. Local Adapter - Local Command Execution
 * 
 * Demonstrates the use of the local adapter (default)
 */

import { $, CommandError } from '@xec-sh/core';

// 1. Local adapter is used by default
const result = await $`echo "Running locally"`;
console.log('Local result:', result.stdout);

// 2. Explicitly specifying local adapter
const $local = $.local();
await $local`whoami`;

// 3. Using different shells
const $bash = $.local().shell('/bin/bash');
const $zsh = $.local().shell('/bin/zsh');
const $sh = $.local().shell('/bin/sh');

await $bash`echo $SHELL`;
await $zsh`echo $SHELL`;
await $sh`echo $SHELL`;

// 4. Disabling shell (direct execution)
const $direct = $.local().shell(false);
await $direct`ls`; // Will execute ls directly, without shell

// 5. Simple output handling
// Regular execution and getting result
const findResult = await $`find . -name "*.ts" | head -10`;
console.log('Found files:', findResult.stdout);

// 6. Passing input via pipe
// You can use pipe to pass data
const input = 'Hello from stdin';
const echoResult = await $`echo "${input}" | cat`;
console.log('Response:', echoResult.stdout);

// 7. Timeouts
try {
  await $.local().timeout(1000)`sleep 5`;
} catch (error) {
  console.log('Command interrupted by timeout');
}

// 8. Combining with other settings
const $configured = $.local()
  .cd('/tmp')
  .env({ MY_VAR: 'test' })
  .timeout(5000);

await $configured`echo "Working in: $(pwd) with MY_VAR=$MY_VAR"`;

// 9. Error handling

try {
  await $.local()`nonexistent_command`;
} catch (error) {
  if (error instanceof CommandError) {
    console.log('Command returned error');
    console.log('Exit code:', error.exitCode);
    console.log('Error:', error.stderr);
  }
}

// 10. Sequential execution of multiple commands
// Promise.all for parallel execution
const results = await Promise.all([
  $.local()`echo "Task 1"`,
  $.local()`echo "Task 2"`,
  $.local()`echo "Task 3"`
]);

results.forEach((r, i) => {
  console.log(`Task ${i + 1}:`, r.stdout.trim());
});
