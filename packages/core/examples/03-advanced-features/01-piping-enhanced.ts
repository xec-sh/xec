/**
 * 01. Enhanced Piping - Comprehensive Pipe Capabilities
 * 
 * Demonstrates the new comprehensive pipe functionality including:
 * - Template literal piping
 * - Stream piping
 * - Function piping
 * - Conditional piping
 * - Pipe utilities
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $, pipeUtils } from '@xec-sh/core';
import { createWriteStream } from 'node:fs';
import { Writable, Transform } from 'node:stream';

console.log('=== Enhanced Piping Examples ===\n');

// 1. Basic pipe with template literals
console.log('1. Template literal piping:');
const upper = await $`echo "hello world"`.pipe`tr a-z A-Z`;
console.log('Uppercase:', upper.stdout.trim()); // HELLO WORLD

// 2. Chain multiple pipes
console.log('\n2. Chained pipes:');
const processed = await $`echo "hello world"`
  .pipe`tr a-z A-Z`
  .pipe`sed 's/WORLD/UNIVERSE/'`
  .pipe`rev`;
console.log('Processed:', processed.stdout.trim()); // ESREVINU OLLEH

// 3. Pipe to Transform streams
console.log('\n3. Transform stream piping:');
const doubled = await $`echo "123"`
  .pipe(new Transform({
    transform(chunk, encoding, callback) {
      const num = parseInt(chunk.toString().trim());
      callback(null, String(num * 2));
    }
  }));
console.log('Doubled:', doubled.stdout.trim()); // 246

// 4. Using pipe utilities
console.log('\n4. Pipe utilities:');

// toUpperCase
const upperUtil = await $`echo "hello"`.pipe(pipeUtils.toUpperCase());
console.log('Upper with util:', upperUtil.stdout.trim()); // HELLO

// grep
const grepResult = await $`echo -e "apple\nbanana\napple pie\ncherry"`
  .pipe(pipeUtils.grep('apple'));
console.log('Grep result:', grepResult.stdout.trim());
// apple
// apple pie

// replace
const replaced = await $`echo "hello world"`
  .pipe(pipeUtils.replace(/w\w+d/, 'universe'));
console.log('Replaced:', replaced.stdout.trim()); // hello universe

// 5. Pipe to functions (line processing)
console.log('\n5. Function piping (line processing):');
const lines: string[] = [];
await $`echo -e "item1\nitem2\nitem3"`
  .pipe((line: string) => {
    lines.push(`processed: ${line}`);
  });
console.log('Processed lines:', lines);
// ['processed: item1', 'processed: item2', 'processed: item3']

// 6. Pipe to file (Writable stream)
console.log('\n6. Pipe to file:');
const outputFile = join(tmpdir(), 'pipe-output.txt');
const fileStream = createWriteStream(outputFile);

await $`echo "Data written to file"`.pipe(fileStream);
const fileContent = await $`cat ${outputFile}`;
console.log('File content:', fileContent.stdout.trim());

// Clean up
await $`rm -f ${outputFile}`;

// 7. Tee - split output to multiple destinations
console.log('\n7. Tee operator:');
const outputs: string[] = [];
const collector1 = new Writable({
  write(chunk, encoding, callback) {
    outputs.push(`Stream1: ${chunk.toString().trim()}`);
    callback();
  }
});
const collector2 = new Writable({
  write(chunk, encoding, callback) {
    outputs.push(`Stream2: ${chunk.toString().trim()}`);
    callback();
  }
});

const teeResult = await $`echo "broadcast message"`
  .pipe(pipeUtils.tee(collector1, collector2));
console.log('Tee result:', teeResult.stdout.trim());
console.log('Collected outputs:', outputs);

// 8. Error handling in pipes
console.log('\n8. Error handling:');
try {
  // This will fail because 'false' returns exit code 1
  await $`false`.pipe`echo "This won't run"`;
} catch (error) {
  console.log('Pipe failed as expected');
}

// With nothrow, pipe continues
const recovered = await $`false`
  .nothrow()
  .pipe`echo "Recovered from error"`;
console.log('Recovered:', recovered.stdout.trim());

// 9. Complex pipe chain with mixed targets
console.log('\n9. Complex mixed pipe chain:');
const wordCounts = new Map<string, number>();

const finalResult = await $`echo -e "apple\nbanana\napple\ncherry\nbanana\napple"`
  .pipe(pipeUtils.grep(/^a/)) // Filter lines starting with 'a'
  .pipe((line: string) => {
    // Count occurrences
    wordCounts.set(line, (wordCounts.get(line) || 0) + 1);
  });

console.log('Word counts:', Object.fromEntries(wordCounts));
// { apple: 3 }

// 10. Conditional piping with functions
console.log('\n10. Conditional piping:');
const processIfLarge = async (result: any) => {
  const lineCount = result.stdout.split('\n').filter(Boolean).length;
  if (lineCount > 2) {
    return 'echo "Large output detected"';
  }
  return null; // Skip piping
};

// This will pipe because we have 3 lines
const largeOutput = await $`echo -e "line1\nline2\nline3"`
  .pipe(processIfLarge as any);
console.log('Large output result:', largeOutput?.stdout?.trim());

// This won't pipe because we have only 1 line
const smallOutput = await $`echo "single line"`
  .pipe(processIfLarge as any);
console.log('Small output result:', smallOutput?.stdout?.trim());

// 11. Custom line separator
console.log('\n11. Custom line separator:');
const csvData: string[] = [];
await $`echo "name,age,city"`
  .pipe((field: string) => {
    csvData.push(field);
  }, { lineByLine: true, lineSeparator: ',' });
console.log('CSV fields:', csvData);
// ['name', 'age', 'city']

// 12. Performance: parallel processing with pipes
console.log('\n12. Parallel pipe processing:');
const urls = ['url1', 'url2', 'url3'];
const results = await Promise.all(
  urls.map(url => 
    $`echo "Fetching ${url}"`
      .pipe`sed 's/Fetching/Downloaded/'`
      .then(r => r.stdout.trim())
  )
);
console.log('Parallel results:', results);

console.log('\n=== Enhanced Piping Complete ===');