# Getting Started with @xec-js/ush

## Installation

```bash
# Using npm
npm install @xec-js/ush

# Using yarn
yarn add @xec-js/ush

# Using pnpm
pnpm add @xec-js/ush

# Using bun
bun add @xec-js/ush
```

### Requirements

- Node.js 18+ or Bun 1.0+
- TypeScript 5.0+ (for TypeScript projects)
- SSH client (for SSH features)
- Docker (for Docker features)
- kubectl (for Kubernetes features)

## Quick Start for Beginners

If you're new to shell scripting or command execution in Node.js, this section will get you started step by step.

### Your First Script

Create a file named `hello.js`:

```javascript
import { $ } from '@xec-js/ush';

// Execute a simple command
const r = await $`echo "Hello, World!"`;
console.log(r.stdout.trim());

// The $ function executes shell commands
// The backticks `` allow you to write commands like in the terminal
// The await keyword waits for the command to finish
```

Run it:
```bash
node hello.js
# Output: Hello, World!
```

### Understanding the Basics

```javascript
import { $ } from '@xec-js/ush';

// 1. Commands return results
const result = await $`echo "Hello"`;
console.log(result.stdout); // "Hello\n"
console.log(result.exitCode); // 0 (success)

// 2. You can use JavaScript variables
const name = "Alice";
await $`echo "Hello, ${name}!"`; // Variables are safely escaped

// 3. Chain multiple commands
await $`mkdir -p temp`;
await $`cd temp && touch file.txt`;
await $`ls temp`; // Shows: file.txt

// 4. Handle errors gracefully
try {
  await $`cat non-existent-file.txt`;
} catch (error) {
  console.log("File not found!"); // This will be printed
}

// 5. Or use nothrow() to avoid exceptions
const result = await $`cat non-existent-file.txt`.nothrow();
if (result.exitCode !== 0) {
  console.log("File not found, but no exception thrown!");
}
```

### Key Concepts for Beginners

1. **The `$` function**: This is your main tool. Think of it as a way to run terminal commands from JavaScript.

2. **Template literals**: The backticks `` ` `` let you write commands naturally and embed JavaScript variables safely.

3. **Async/Await**: Shell commands take time to run. `await` tells JavaScript to wait for the command to finish.

4. **Exit codes**: Commands return 0 for success, non-zero for errors. @xec-js/ush throws errors for non-zero codes by default.

5. **Error handling**: You can use try-catch blocks for exceptions, or `.nothrow()` to handle errors manually by checking exit codes.

## Next Steps

- Learn about [Core Concepts](./core-concepts.md) to understand how @xec-js/ush works
- Explore [Basic Command Execution](./command-execution.md) for more examples
- Check out [Error Handling](./error-handling.md) to handle failures gracefully