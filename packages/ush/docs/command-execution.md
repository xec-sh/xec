# Command Execution

## Basic Command Execution

### Simple Commands

```javascript
// Run any shell command
await $`pwd`;                     // Print working directory
await $`date`;                    // Show current date
await $`whoami`;                  // Show current user

// Commands with arguments
await $`ls -la`;                  // List files with details
await $`grep "pattern" file.txt`; // Search in file
await $`curl https://api.github.com`; // Make HTTP request
```

### Getting Command Output

```javascript
// Capture output for processing
const files = await $`ls`;
console.log(files.stdout);        // The command's output
console.log(files.stderr);        // Any error messages
console.log(files.exitCode);      // 0 for success

// Process output line by line
const lines = files.stdout.trim().split('\n');
for (const line of lines) {
  console.log(`File: ${line}`);
}

// Parse JSON output
const data = await $`curl -s https://api.github.com/users/github`;
const user = JSON.parse(data.stdout);
console.log(`GitHub user: ${user.name}`);
```

## Working with Variables

### Safe Variable Interpolation

```javascript
// Variables are automatically escaped
const filename = "my file.txt";  // Space in filename
await $`touch ${filename}`;       // Creates "my file.txt"

// Multiple variables
const source = "/path/to/source";
const dest = "/path/to/dest";
await $`cp -r ${source} ${dest}`;

// Arrays are joined with spaces
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
await $`rm ${files}`;             // Removes all three files

// Objects are JSON stringified
const config = { name: 'app', port: 3000 };
await $`echo ${config} > config.json`;
```

### Raw Strings (Use with Caution!)

```javascript
// Sometimes you need unescaped strings for shell features
const pattern = '*.txt';
await $.raw`ls ${pattern}`;      // Globs all .txt files

// Pipe operations
await $.raw`ps aux | grep node`; // Pipe requires raw mode

// But be VERY careful with user input in raw mode!
// NEVER do this with untrusted input:
// await $.raw`ls ${userInput}`; // DANGEROUS!
```

## Command Output Streaming

### Real-time Output

```javascript
// Stream output as it arrives
await $`npm install`.pipe(process.stdout);

// Custom stream handling
const logStream = fs.createWriteStream('build.log');
await $`npm run build`.pipe(logStream);

// Multiple streams
await $`long-running-command`
  .pipe(process.stdout)  // Show to user
  .pipe(logStream);      // Save to file
```

### Progress Tracking

```javascript
// Built-in progress indicator
await $`npm install`.progress();

// Custom progress handling
await $`large-download`
  .on('stdout', (chunk) => {
    // Parse progress from output
    const match = chunk.match(/(\d+)%/);
    if (match) {
      console.log(`Progress: ${match[1]}%`);
    }
  });
```

## Advanced Execution Patterns

### Parallel Execution

```javascript
// Run commands in parallel
const [result1, result2, result3] = await Promise.all([
  $`curl https://api1.com`,
  $`curl https://api2.com`,
  $`curl https://api3.com`
]);

// Parallel with different adapters
const [$local, $remote] = await Promise.all([
  $`df -h`,                          // Local disk usage
  $.ssh('server.com')`df -h`         // Remote disk usage
]);
```

### Sequential Execution

```javascript
// Run commands in sequence
const results = [];
for (const file of ['file1.txt', 'file2.txt', 'file3.txt']) {
  const result = await $`wc -l ${file}`;
  results.push(result.stdout);
}

// Pipeline pattern
const data = await $`cat input.txt`;
const processed = await $`sort`.stdin(data.stdout);
const final = await $`uniq`.stdin(processed.stdout);
```

### Conditional Execution

```javascript
// Execute based on conditions
const exists = await $`test -f config.json`.nothrow();
if (exists.exitCode === 0) {
  await $`cat config.json`;
} else {
  await $`echo '{}' > config.json`;
}

// Chain with logical operators
await $.raw`test -f backup.tar || tar -cf backup.tar data/`;
await $.raw`ping -c 1 google.com && echo "Internet is working"`;
```

## Best Practices

1. **Always use variable interpolation** instead of string concatenation
2. **Check exit codes** when using `.nothrow()`
3. **Use appropriate timeouts** for network operations
4. **Stream large outputs** instead of buffering
5. **Handle errors gracefully** with try-catch or `.nothrow()`

## Next Steps

- Learn about [Configuration Options](./configuration.md)
- Explore [Error Handling](./error-handling.md) strategies
- See [Environment-specific Execution](./environments.md)