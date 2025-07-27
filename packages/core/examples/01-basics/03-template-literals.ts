/**
 * 03. Template Literals - Interpolation and Escaping
 * 
 * Shows how to safely insert variables into commands.
 * @xec-sh/core automatically escapes all interpolated values,
 * preventing command injections.
 */

import { $, ExecutionEngine } from '@xec-sh/core';

// 1. Simple string interpolation
// String values are automatically escaped
const filename = 'test.txt';
const content = 'Hello, xec!';
await $`echo ${content} > ${filename}`;
await $`cat ${filename}`;
await $`rm ${filename}`;

// 2. Escaping special characters
// This is one of the main security features - automatic escaping
const dangerous = "'; rm -rf /; echo '";
await $`echo ${dangerous}`; // Safe! Will output: '; rm -rf /; echo '

// Other examples of dangerous inputs
const userInput = '$(cat /etc/passwd)';
await $`echo "User said: ${userInput}"`; // Safe! Won't execute command

// 3. Array interpolation
// Arrays are automatically converted to separate arguments
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
await $`touch ${files}`; // Converts to: touch file1.txt file2.txt file3.txt
await $`ls file*.txt`;
await $`rm ${files}`;

// 4. Object interpolation
// Objects are converted to string via JSON.stringify
const config = {
  name: 'test-app',
  version: '1.0.0'
};
// Object will be converted to escaped JSON string
const result = await $`echo ${config}`;
console.log('Object as string:', result.stdout.trim());

// 5. Spaces in filenames
// Names with spaces are automatically escaped
const fileWithSpaces = 'file with spaces.txt';
await $`touch ${fileWithSpaces}`; // Automatically escaped
await $`ls ${fileWithSpaces}`; // Will also work correctly
await $`rm ${fileWithSpaces}`;

// 6. Numbers and boolean values
// Numbers and boolean values are converted to strings
const count = 5;
const isEnabled = true;
await $`echo "Count: ${count}, Enabled: ${isEnabled}"`; // Count: 5, Enabled: true

// 7. Commands as variables
// You can store parts of commands in variables
const command = 'ls -la';
await $`${command}`; // Will execute ls -la

// 8. Raw mode to disable escaping
// To use raw you need to create an ExecutionEngine instance
const engine = new ExecutionEngine();
const pattern = '*.txt';
// Won't escape *, works as glob
const foundFiles = await engine.raw`ls ${pattern}`;
console.log('Found .txt files:', foundFiles.stdout);

// 9. Handling null and undefined
// null and undefined are converted to empty strings
const nullValue = null;
const undefinedValue = undefined;
await $`echo "Null: ${nullValue}, Undefined: ${undefinedValue}"`; 
// Will output: Null: , Undefined:

// 10. Async interpolation support
// You can interpolate Promise and other thenable objects
const getDirName = async () => 'important-dir';
const dirName = getDirName(); // Promise<string>

// Promise will be automatically resolved before execution
await $`mkdir -p ${dirName}`;
await $`ls ${dirName}`;
await $`rmdir ${dirName}`;

// 11. Combining different data types
const port = 3000;
const host = 'localhost';
const protocol = 'http';
const flags = ['-v', '--color', '--no-warnings'];

// All types will be properly converted and escaped
await $`curl ${flags} ${protocol}://${host}:${port}/api/health`;

// Note: Interpolation works only inside template literals.
// You cannot use regular strings:
// const cmd = 'echo test';
// await $(cmd); // Error! $ is a tagged template function
