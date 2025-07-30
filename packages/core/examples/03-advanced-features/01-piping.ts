/**
 * 01. Piping - Redirecting Output Between Commands
 * 
 * Demonstrates various ways to redirect output.
 * 
 * IMPORTANT: Most pipe operations can be performed through shell,
 * using standard pipe syntax (|) in commands.
 */

import { $ } from '@xec-sh/core';

// 1. Simple pipe through shell
// Shell automatically handles pipe operators
const simpleResult = await $`echo "hello world" | tr '[:lower:]' '[:upper:]'`;
console.log('Simple pipe:', simpleResult.stdout); // HELLO WORLD

// 2. Multiple pipes through shell
// You can connect multiple commands via |
const count = await $`ls -la | grep ".ts" | wc -l`;
console.log('Number of .ts files:', count.stdout.trim());

// 3. Passing data through echo and pipe
// Use echo to pass data into pipe
const input = 'Line 1\nLine 2\nLine 3';
const numbered = await $`echo "${input}" | nl`; // nl adds line numbers
console.log('Numbered lines:\n', numbered.stdout);

// 4. File processing chain
// Use command chain to process file list
const jsonFiles = await $`find . -name "*.json" -type f | head -10 | sort | uniq`;
console.log('JSON files (first 10):', jsonFiles.stdout);

// 5. Passing output between commands
// Save output of first command and use it in second
const files = await $`ls -la`;
const filtered = await $`echo "${files.stdout}" | grep "test"`;
console.log('Filtered files:', filtered.stdout);

// 6. Error handling in pipe
// If any part of pipe fails, entire command will fail
const pipeResult = await $`echo "test" | grep "nonexistent" | wc -l`.nothrow();
if (!pipeResult.ok) {
  console.log('Pipe finished with error');
  console.log('Exit code:', pipeResult.exitCode);
} else {
  console.log('Result:', pipeResult.stdout.trim());
}

// 7. Searching for errors in logs
// Use tail without -f to get last lines
const logFile = '/var/log/system.log';
try {
  const errors = await $`tail -100 ${logFile} | grep ERROR | head -5`;
  if (errors.stdout) {
    console.log('Latest errors in log:');
    console.log(errors.stdout);
  } else {
    console.log('No errors found');
  }
} catch (error) {
  console.log('Failed to read log file');
}

// 8. Pipe with data transformation
// Use jq for JSON processing (if installed)
const jsonData = { name: 'test', value: 42 };
try {
  const extracted = await $`echo '${JSON.stringify(jsonData)}' | jq '.value'`;
  console.log('Extracted value:', extracted.stdout.trim()); // 42
} catch (error) {
  console.log('jq not installed, using alternative');
  const extracted = await $`echo '${JSON.stringify(jsonData)}' | grep -o '"value":[0-9]*' | cut -d: -f2`;
  console.log('Extracted value:', extracted.stdout.trim());
}

// 9. Complex processing chains
// Find Node.js processes and extract their PIDs
const nodePids = await $`ps aux | grep node | grep -v grep | awk '{print $2}' | head -5`;
if (nodePids.stdout) {
  console.log('Node.js PIDs:\n', nodePids.stdout);
} else {
  console.log('Node.js processes not found');
}

// 10. Archiving through pipe
// Create archive from text files and encode to base64
try {
  const $tmp = $.cd('/tmp');
  const archive = await $tmp`find . -name "*.txt" -type f -print0 | xargs -0 tar -czf - | base64`;
  if (archive.stdout) {
    console.log('Archive in base64 (first 100 chars):', archive.stdout.substring(0, 100));
  } else {
    console.log('Text files not found in /tmp');
  }
} catch (error) {
  console.log('Error creating archive');
}

// 11. Processing stdout and stderr
// When using pipe, stderr is not passed between commands
const streamResult = await $`echo "stdout1" && echo "stderr1" >&2 | cat && echo "stderr2" >&2`;
console.log('Stdout:', streamResult.stdout.trim());
console.log('Stderr:', streamResult.stderr.trim());

// 12. Conditional file processing
// Check file existence and process it
const testFile = '/tmp/test-data.txt';

// Create test file
await $`echo -e "apple\nbanana\napple\ncherry\nbanana\napple" > ${testFile}`;

// Check and process
const checkFile = await $`test -f ${testFile} && echo "exists" || echo "missing"`;

if (checkFile.stdout.trim() === 'exists') {
  const process = await $`cat ${testFile} | sort | uniq -c | sort -nr`;
  console.log('Word frequency:', process.stdout);

  // Remove test file
  await $`rm -f ${testFile}`;
} else {
  console.log('File not found');
}
