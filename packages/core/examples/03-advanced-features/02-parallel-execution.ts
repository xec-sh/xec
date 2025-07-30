/**
 * 02. Parallel Execution - Parallel Command Execution
 * 
 * Demonstrates various ways to execute commands in parallel.
 * 
 * @xec-sh/core provides three approaches for parallel execution:
 * 
 * 1. $.parallel (high-level API) - RECOMMENDED for most cases
 *    - Use when: You need rich functionality like map, filter, race, etc.
 *    - Benefits: Built-in error handling, progress tracking, concurrency control
 *    - Examples: $.parallel.all(), $.parallel.map(), $.parallel.filter()
 * 
 * 2. $.batch() - Convenience method for limited concurrency execution
 *    - Use when: You want to limit concurrent executions with simple API
 *    - Benefits: Simple API, built-in concurrency limit (default: 5)
 *    - Key difference: It's just $.parallel.settled() with concurrency alias
 * 
 * 3. Promise.all - Simple approach for basic parallel execution
 *    - Use when: You need simple parallel execution with Promise compatibility
 *    - Benefits: Familiar JavaScript API, works with any Promise-based code
 *    - Examples: Promise.all(), Promise.race(), Promise.allSettled()
 * 
 * 4. parallel() function - Low-level API for advanced use cases
 *    - Use when: You need fine control over execution details
 *    - Benefits: Full control over concurrency, detailed result information
 *    - Examples: Custom error handling, batch processing, complex workflows
 */

import { $, parallel } from '@xec-sh/core';

// 1. RECOMMENDED: High-level API with $.parallel
// $.parallel provides rich functionality for parallel execution
console.log('\n=== Method 1: $.parallel (Recommended) ===');

// $.parallel.all() - executes all commands, throws on first error
const parallelResults = await $.parallel.all([
  'sleep 1 && echo "Task 1 done"',
  'sleep 0.5 && echo "Task 2 done"',
  'sleep 0.7 && echo "Task 3 done"'
]);

parallelResults.forEach((result, i) => {
  console.log(`Task ${i + 1}:`, result.stdout.trim());
});

// $.parallel.settled() - executes all commands, returns all results (including errors)
const settledResults = await $.parallel.settled([
  'echo "Success 1"',
  'exit 1',  // This will fail
  'echo "Success 2"'
]);

console.log('\nSettled results:');
console.log(`Succeeded: ${settledResults.succeeded.length}`);
console.log(`Failed: ${settledResults.failed.length}`);

// $.parallel.race() - returns the first completed result
const winner = await $.parallel.race([
  'sleep 2 && echo "Slow"',
  'sleep 0.5 && echo "Fast"',  // This will win
  'sleep 1 && echo "Medium"'
]);
console.log('\nRace winner:', winner.stdout.trim());

// 2. Real-world example: API rate limiting with $.batch()
console.log('\n=== Real-World Example: API Rate Limiting ===');
// Simulate API calls that need rate limiting
const apiEndpoints = Array.from({ length: 20 }, (_, i) => `https://api.example.com/data/${i}`);

console.log('Making 20 API calls with rate limit of 3 concurrent requests:');
const apiResults = await $.batch(
  apiEndpoints.map(url => `echo "GET ${url}" && sleep 0.3 && echo "Response: {data: ${url.split('/').pop()}}"`),
  {
    concurrency: 3, // Rate limit: max 3 concurrent requests
    onProgress: (completed, total) => {
      const percentage = Math.round((completed / total) * 100);
      console.log(`  Progress: ${completed}/${total} (${percentage}%)`);
    }
  }
);
console.log(`All API calls completed. Success rate: ${(apiResults.succeeded.length / apiEndpoints.length * 100).toFixed(1)}%`);

// 3. Simple approach with Promise.all
// Good for basic cases and when you need Promise compatibility
console.log('\n=== Method 3: Promise.all (Simple cases) ===');
const promiseResults = await Promise.all([
  $`echo "Promise Task 1"`,
  $`echo "Promise Task 2"`,
  $`echo "Promise Task 3"`
]);

promiseResults.forEach((result, i) => {
  console.log(`Task ${i + 1}:`, result.stdout.trim());
});

// 4. Low-level parallel function for advanced control
// Use when you need fine control over concurrency and error handling
console.log('\n=== Method 4: parallel() function (Advanced) ===');
const advancedResult = await parallel(
  [
    'echo "Advanced Task 1" && sleep 1',
    'echo "Advanced Task 2" && sleep 0.5',
    'echo "Advanced Task 3" && sleep 0.7',
    'echo "Advanced Task 4" && sleep 0.3',
    'echo "Advanced Task 5" && sleep 0.6'
  ],
  $,
  { 
    maxConcurrency: 2,  // Limit to 2 concurrent tasks
    stopOnError: false, // Continue even if some tasks fail
    onProgress: (completed, total, succeeded, failed) => {
      console.log(`  Progress: ${completed}/${total} completed`);
    }
  }
);

console.log(`\nCompleted in ${advancedResult.duration}ms`);
console.log(`Succeeded: ${advancedResult.succeeded.length}`);
console.log(`Failed: ${advancedResult.failed.length}`);

// 4. Parallel file processing with $.parallel.map()
console.log('\n=== Parallel File Processing ===');
const files = ['file1.txt', 'file2.txt', 'file3.txt'];

// Using $.parallel.map() for cleaner code
const mapResult = await $.parallel.map(
  files,
  (file) => `echo "Processing ${file}" && sleep 0.5 && echo "Done with ${file}"`,
  { maxConcurrency: 2 }
);

console.log('All files processed');
mapResult.succeeded.forEach((result, i) => {
  console.log(`File ${i + 1}: ${result.stdout.trim()}`);
});

// 🎯 QUICK DECISION GUIDE:
console.log('\n=== 🎯 QUICK DECISION GUIDE ===');
console.log('\n📋 Choose $.parallel when:');
console.log('  - You need methods like .map(), .filter(), .race(), .some(), .every()');
console.log('  - You want fine control over error handling (all vs settled)');
console.log('  - You need unlimited concurrency by default');
console.log('\n📋 Choose $.batch() when:');
console.log('  - You want a simple API for limited concurrency');
console.log('  - You\'re OK with always getting all results (no fail-fast)');
console.log('  - You prefer "concurrency" over "maxConcurrency" as parameter name');
console.log('\n📋 Choose Promise.all/race/allSettled when:');
console.log('  - You need standard JavaScript Promise behavior');
console.log('  - You\'re mixing with other Promise-based code');
console.log('  - You don\'t need progress tracking or concurrency limits');

// 5. IMPORTANT: Understanding the difference between $.parallel and $.batch()
console.log('\n=== COMPARISON: $.parallel vs $.batch() ===');

// First, let's use $.parallel.settled() with maxConcurrency
console.log('\n1. Using $.parallel.settled() with maxConcurrency:');
const parallelSettledResult = await $.parallel.settled(
  ['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5'].map(cmd => `echo "${cmd}" && sleep 0.5`),
  {
    maxConcurrency: 2, // Note: parameter is called maxConcurrency
    onProgress: (completed, total, succeeded, failed) => {
      console.log(`  Progress: ${completed}/${total}`);
    }
  }
);
console.log(`  Completed in ${parallelSettledResult.duration}ms`);

// Now, let's use $.batch() - which is just a convenience wrapper
console.log('\n2. Using $.batch() (convenience wrapper for $.parallel.settled()):');
const batchResult = await $.batch(
  ['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5'].map(cmd => `echo "${cmd}" && sleep 0.5`),
  {
    concurrency: 2, // Note: parameter is called concurrency (alias for maxConcurrency)
    onProgress: (completed, total, succeeded, failed) => {
      console.log(`  Progress: ${completed}/${total}`);
    }
  }
);
console.log(`  Completed in ${batchResult.duration}ms`);

console.log('\n🔍 Key insights:');
console.log('- $.batch() is EXACTLY $.parallel.settled() with a different parameter name');
console.log('- $.batch() uses "concurrency" instead of "maxConcurrency"');
console.log('- $.batch() defaults to concurrency: 5 (vs $.parallel\'s Infinity)');
console.log('- Both return the same ParallelResult structure');
console.log('- $.batch() ALWAYS continues on errors (like settled), never throws');

// Demonstrate the default concurrency difference
console.log('\n3. Default concurrency comparison:');
const manyTasks = Array.from({ length: 10 }, (_, i) => `echo "Task ${i}" && sleep 0.1`);

console.log('\n  $.parallel.settled() (default: unlimited concurrency):');
const start1 = Date.now();
await $.parallel.settled(manyTasks);
console.log(`  All 10 tasks completed in: ${Date.now() - start1}ms (all run in parallel)`);

console.log('\n  $.batch() (default: concurrency = 5):');
const start2 = Date.now();
await $.batch(manyTasks);
console.log(`  All 10 tasks completed in: ${Date.now() - start2}ms (max 5 at a time)`);

// 6. PRACTICAL USE CASES: When to use each method
console.log('\n=== PRACTICAL USE CASES ===');

// Use Case 1: When you need to stop on first error - use $.parallel.all()
console.log('\n📌 Use Case 1: Critical operations that must all succeed');
console.log('Use $.parallel.all() - stops on first error:');
try {
  await $.parallel.all([
    'echo "Check 1: OK"',
    'echo "Check 2: OK"',
    'false', // This will fail
    'echo "Check 3: Will not run"'
  ]);
} catch (error) {
  console.log('  ❌ Stopped on first error (as expected)');
}

// Use Case 2: When you want all results regardless of errors - use $.batch() or $.parallel.settled()
console.log('\n📌 Use Case 2: Bulk operations where some might fail');
console.log('Use $.batch() - continues despite errors:');
const bulkResults = await $.batch([
  'echo "Upload file1.txt"',
  'echo "Upload file2.txt" && false', // This fails
  'echo "Upload file3.txt"',
  'echo "Upload file4.txt"'
], { concurrency: 2 });
console.log(`  ✓ Succeeded: ${bulkResults.succeeded.length}`);
console.log(`  ✗ Failed: ${bulkResults.failed.length}`);

// Use Case 3: When you need specific parallel methods - use $.parallel
console.log('\n📌 Use Case 3: Advanced parallel operations');
console.log('Use $.parallel for rich functionality:');

// Example: Filter files that exist
const filesToCheck = ['file1.txt', 'file2.txt', 'nonexistent.txt'];
const existingFiles = await $.parallel.filter(
  filesToCheck,
  (file) => `test -f ${file}` // Returns exit code 0 if file exists
);
console.log('  Existing files:', existingFiles);

// Example: Race between different approaches
const fastestResult = await $.parallel.race([
  'sleep 2 && echo "Slow algorithm"',
  'sleep 0.5 && echo "Fast algorithm"',
  'sleep 1 && echo "Medium algorithm"'
]);
console.log('  Fastest algorithm:', fastestResult.stdout.trim());

// 7. Parallel execution on different adapters
// Example only for local adapter and existing containers
const mixedTasks = [
  $.local()`echo "Local task"`,
  // Docker works only with existing containers
  // $.docker({ container: 'my-container' })`echo "Docker task"`,
  // $.ssh({ host: 'example.com', username: 'user', privateKey: '/path/to/key' })`echo "SSH task"`
  $.local()`echo "Another local task"`,
  $.local()`echo "Third local task"`
];

try {
  const mixedResults = await Promise.all(mixedTasks);
  mixedResults.forEach((result, i) => {
    console.log(`Task ${i + 1}:`, result.stdout.trim());
  });
} catch (error) {
  console.log('Error in one of the tasks');
}

// 7. Error handling in parallel tasks
// Use nothrow() to not interrupt execution on errors
const tasksWithErrors = [
  $`echo "Success 1"`,
  $`exit 1`, // Error
  $`echo "Success 2"`,
  $`false`, // Error
  $`echo "Success 3"`
];

const resultsWithErrors = await Promise.all(
  tasksWithErrors.map(task => task.nothrow())
);

resultsWithErrors.forEach((result, i) => {
  if (result.ok) {
    console.log(`Task ${i + 1}: Success`);
    console.log(`  Output: ${result.stdout.trim()}`);
  } else {
    console.log(`Task ${i + 1}: Error (exit code: ${result.exitCode})`);
  }
});

// 8. Using $.parallel.filter() to filter based on command results
console.log('\n=== Parallel Filtering ===');
const numbers = [1, 2, 3, 4, 5];
const evenNumbers = await $.parallel.filter(
  numbers,
  (num) => `test $((${num} % 2)) -eq 0`  // Shell test for even numbers
);
console.log('Even numbers:', evenNumbers);

// 9. Using $.parallel.some() and $.parallel.every()
console.log('\n=== Parallel Conditions ===');
const someSuccess = await $.parallel.some([
  'false',
  'false',
  'true',  // At least one succeeds
  'false'
]);
console.log('At least one command succeeded:', someSuccess);

const allSuccess = await $.parallel.every([
  'true',
  'true',
  'false',  // One fails
  'true'
]);
console.log('All commands succeeded:', allSuccess);

// 10. Parallel information gathering from servers
// Simulate gathering information from servers
const servers = ['server1', 'server2', 'server3'];
const infoTasks = servers.map(server => ({
  server,
  task: $`echo "CPU: ${Math.floor(Math.random() * 100)}%" && echo "Memory: ${Math.floor(Math.random() * 16)}GB" && echo "Disk: ${Math.floor(Math.random() * 500)}GB"`
}));

const serverInfo = await Promise.all(
  infoTasks.map(async ({ server, task }) => ({
    server,
    info: await task
  }))
);

serverInfo.forEach(({ server, info }) => {
  console.log(`\n${server}:\n${info.stdout}`);
});

// 11. Parallel processing with progress tracking
// Simple way to track progress without external dependencies
const longTasks = Array.from({ length: 10 }, (_, i) =>
  $`sleep ${Math.random() * 2} && echo "Task ${i + 1} completed"`
);

let completed = 0;
const total = longTasks.length;

console.log(`Starting ${total} tasks...`);

const progressResults = await Promise.all(
  longTasks.map(async (task, i) => {
    const result = await task;
    completed++;
    console.log(`Progress: ${completed}/${total} completed`);
    return result;
  })
);

console.log('\nAll tasks completed!');

// 12. Map-Reduce pattern
// Create test files for demonstration
const testDir = '/tmp/mapreduce-test';
await $`mkdir -p ${testDir}`;

// Create test files
const dataFiles = ['data1.txt', 'data2.txt', 'data3.txt'];
await Promise.all([
  $`echo -e "line1\nline2\nline3" > ${testDir}/data1.txt`,
  $`echo -e "line1\nline2\nline3\nline4\nline5" > ${testDir}/data2.txt`,
  $`echo -e "line1\nline2" > ${testDir}/data3.txt`
]);

// Map: count lines in each file
const mapTasks = dataFiles.map(file =>
  $`wc -l < ${testDir}/${file} || echo 0`
);

const counts = await Promise.all(mapTasks);

// Reduce: sum the results
const totalLines = counts.reduce((sum, result) =>
  sum + parseInt(result.stdout.trim() || '0'), 0
);

console.log(`Total number of lines: ${totalLines}`);

// Clean up
await $`rm -rf ${testDir}`;

// 13. Dynamic task creation
const dynamicTaskCount = 5;
const dynamicTasks = [];

for (let i = 0; i < dynamicTaskCount; i++) {
  dynamicTasks.push($`echo "Dynamic task ${i + 1}" && sleep 0.5`);
}

const dynamicResults = await Promise.all(dynamicTasks);
console.log(`Completed ${dynamicResults.length} dynamic tasks`);

// Show results
dynamicResults.forEach((result) => {
  console.log(result.stdout.trim());
});

// 14. Parallel pipelines
// Use pipe through shell for parallel processing
const pipelineTasks = [
  $`echo "data1" | base64`,
  $`echo "data2" | base64`,
  $`echo "data3" | base64`
];

const encodedResults = await Promise.all(pipelineTasks);
encodedResults.forEach((result, i) => {
  console.log(`Encoded ${i + 1}:`, result.stdout.trim());
});

// 15. Comparison: $.parallel.race() vs Promise.race()
// Promise.race returns the result of the first completed task
const raceTasks = [
  $`sleep 3 && echo "Slow task 1"`,
  $`sleep 1 && echo "Fast task 2"`,
  $`sleep 2 && echo "Medium task 3"`
];

try {
  const winner = await Promise.race(raceTasks);
  console.log('First completed task:', winner.stdout.trim());

  // Other tasks are still running, but their results are ignored
} catch (error) {
  console.log('Error in one of the tasks');
}

// 16. Comparison: $.parallel.settled() vs Promise.allSettled()
// allSettled waits for all tasks, regardless of success or error
const settledTasks = [
  $`echo "Success"`,
  $`exit 1`,
  $`echo "Another success"`,
  $`false`
];

const settled = await Promise.allSettled(settledTasks);
settled.forEach((result, i) => {
  if (result.status === 'fulfilled') {
    console.log(`Task ${i + 1}: Success`);
  } else {
    console.log(`Task ${i + 1}: Error - ${result.reason.message}`);
  }
});

// FINAL SUMMARY: $.parallel vs $.batch()
console.log('\n\n=== 📚 FINAL SUMMARY: $.parallel vs $.batch() ===');
console.log('\n🔵 $.parallel - Full-featured parallel execution toolkit');
console.log('  const results = await $.parallel.all(commands);     // Fails fast on error');
console.log('  const results = await $.parallel.settled(commands); // Gets all results');
console.log('  const winner = await $.parallel.race(commands);     // First to complete');
console.log('  const mapped = await $.parallel.map(items, fn);     // Transform items');
console.log('  const filtered = await $.parallel.filter(items, fn);// Filter by condition');
console.log('  Default concurrency: Infinity (unlimited)');

console.log('\n🟢 $.batch() - Simple concurrency-limited execution');
console.log('  const results = await $.batch(commands, { concurrency: 5 });');
console.log('  - Always returns all results (never throws)');
console.log('  - Just an alias for $.parallel.settled() with different defaults');
console.log('  - Default concurrency: 5 (vs Infinity for $.parallel)');
console.log('  - Parameter name: "concurrency" (vs "maxConcurrency")');

console.log('\n💡 Key Takeaway:');
console.log('$.batch() = $.parallel.settled() + { default concurrency: 5 } + renamed parameter');
console.log('\nUse $.batch() for simple rate-limited operations.');
console.log('Use $.parallel for everything else!');
