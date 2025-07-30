/**
 * 03. Streaming - Stream Data Processing
 * 
 * Demonstrates working with data streams.
 * 
 * IMPORTANT: @xec-sh/core doesn't support direct access to stdout/stderr streams
 * during execution. Commands are executed and return results.
 * For real streaming, it's recommended to use separate
 * libraries or low-level Node.js APIs.
 */

import { $ } from '@xec-sh/core';

// 1. Processing large outputs
// Use tail without -f to read last lines
try {
  const lastLines = await $`tail -100 /var/log/system.log | head -10`;
  console.log('Last 10 lines from log:');
  console.log(lastLines.stdout);
} catch (error) {
  console.log('Failed to read log file');
}

// 2. Filtering logs through grep
// Use grep to filter errors
try {
  const errors = await $`tail -1000 /var/log/app.log 2>/dev/null | grep ERROR | head -20`;
  if (errors.stdout) {
    console.log('Errors in log:');
    console.log(errors.stdout);
  } else {
    console.log('No errors found in log');
  }
} catch (error) {
  console.log('Log file not found or inaccessible');
}

// 3. Processing large files in parts
// Use split to process file in parts
const testFile = '/tmp/large-test.txt';

// Create test file
await $`for i in {1..1000}; do echo "Line $i: Some test data"; done > ${testFile}`;

// Count file size
const sizeResult = await $`wc -c < ${testFile}`;
const fileSize = parseInt(sizeResult.stdout.trim());
console.log(`File size: ${(fileSize / 1024).toFixed(2)} KB`);

// Process first 100 lines
const firstLines = await $`head -100 ${testFile}`;
console.log(`First line: ${firstLines.stdout.split('\n')[0]}`);

// Remove test file
await $`rm -f ${testFile}`;

// 4. Processing JSON line by line
// Process JSON line by line
const jsonData = await $`echo '{"name":"test"}\n{"name":"test2"}\n{"name":"test3"}'`;
const jsonLines = [];

// Process each line
const lines = jsonData.stdout.trim().split('\n');
for (const line of lines) {
  if (line) {
    try {
      const obj = JSON.parse(line);
      jsonLines.push(obj);
      console.log('Received JSON:', obj);
    } catch (e) {
      console.error('Parsing error:', line);
    }
  }
}

console.log(`Total JSON objects processed: ${jsonLines.length}`);

// 5. Processing files in batches
// Find all JavaScript files and process them in batches
const findResult = await $`find . -type f -name "*.js" | head -50`;
const files = findResult.stdout.trim().split('\n').filter(Boolean);

if (files.length === 0) {
  console.log('JavaScript files not found');
} else {
  const BATCH_SIZE = 10;
  console.log(`Found ${files.length} JavaScript files`);

  // Process in batches
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}:`);
    batch.forEach(file => console.log(`  - ${file}`));

    // Here you can add processing for each batch
  }
}

// 6. Pipe through shell
// Use pipe through shell to pass data between processes
const pipeResult = await $`yes "data" | head -n 100 | wc -l`;
console.log('Processed lines:', pipeResult.stdout.trim());

// Another example: generate and process data
const processed = await $`seq 1 50 | awk '{print $1 * 2}' | paste -sd+ - | bc`;
console.log('Sum of doubled numbers:', processed.stdout.trim());

// 7. Processing stdout and stderr
// Commands return stdout and stderr in result
const multiOutput = await $`echo "stdout output" && echo "stderr output" >&2`;

console.log('STDOUT:', multiOutput.stdout.trim());
if (multiOutput.stderr) {
  console.log('STDERR:', multiOutput.stderr.trim());
}

// Example with real command
const commandWithWarning = await $`ls /nonexistent 2>&1 || echo "Command failed"`;
console.log('Result:', commandWithWarning.stdout);

// 8. Download with progress
// Use curl to download file with progress display
const outputFile = '/tmp/example.html';

// curl displays progress when using -# flag
try {
  console.log('Downloading file...');
  await $`curl -# -L https://example.com -o ${outputFile}`;

  // Check downloaded file size
  const size = await $`ls -lh ${outputFile} | awk '{print $5}'`;
  console.log(`\nDownload completed. File size: ${size.stdout.trim()}`);

  // Remove file
  await $`rm -f ${outputFile}`;
} catch (error) {
  console.log('Download error');
}

// 9. Data transformation
// Use standard Unix utilities for transformation
const inputData = 'line1\nline2\nline3';

// Convert to uppercase
const uppercased = await $`echo "${inputData}" | tr '[:lower:]' '[:upper:]'`;
console.log('Uppercase:');
console.log(uppercased.stdout);

// Add line numbering
const numbered = await $`echo "${inputData}" | nl`;
console.log('\nNumbered lines:');
console.log(numbered.stdout);

// Reverse order
const reversed = await $`echo "${inputData}" | tac 2>/dev/null || echo "${inputData}" | tail -r 2>/dev/null || echo "tac/tail -r not available"`;
console.log('\nReverse order:');
console.log(reversed.stdout);

// 10. Error handling
// Handle errors when working with files
const nonExistentFile = '/non/existent/file.txt';

const fileResult = await $`cat ${nonExistentFile} 2>&1`.nothrow();

if (fileResult.ok) {
  console.log('File content:', fileResult.stdout);
} else {
  console.log('File read error');
  console.log('Exit code:', fileResult.exitCode);
  // stderr was redirected to stdout via 2>&1
  console.log('Message:', fileResult.stdout.trim());
}

// 11. System monitoring
// Get system information
try {
  // Get CPU and memory information
  const topOutput = await $`top -l 1 -n 0 2>/dev/null || top -b -n 1 2>/dev/null || echo "top not available"`;

  if (topOutput.stdout.includes('top not available')) {
    console.log('top not available');
  } else {
    // Simple output of first lines
    const systemLines = topOutput.stdout.split('\n').slice(0, 10);
    console.log('System information:');
    systemLines.forEach(line => {
      if (line.includes('CPU') || line.includes('Mem') || line.includes('Load')) {
        console.log(line);
      }
    });
  }

  // Alternative way - use uptime
  const uptime = await $`uptime`;
  console.log('\nUptime:', uptime.stdout.trim());
} catch (error) {
  console.log('Failed to get system information');
}
