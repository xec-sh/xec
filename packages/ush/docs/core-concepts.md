# Core Concepts

## What is a Shell Command?

A shell command is an instruction you type in the terminal. For example:
- `ls` - lists files
- `echo "text"` - prints text
- `mkdir folder` - creates a directory

@xec/ush lets you run these commands from JavaScript/TypeScript.

## Execution Environments

Commands can run in different places:

### 1. Local (default)
On your computer:
```javascript
await $`ls`; // Lists files on your computer
```

### 2. SSH
On a remote server:
```javascript
const $remote = $.ssh('user@server.com');
await $remote`ls`; // Lists files on the server
```

### 3. Docker
Inside a container:
```javascript
const $container = $.docker('my-container');
await $container`ls`; // Lists files in the container
```

### 4. Kubernetes
In a pod:
```javascript
const $pod = $.k8s('my-pod', 'my-namespace');
await $pod`ls`; // Lists files in the pod
```

## Command Interpolation and Safety

When you include JavaScript variables in commands, @xec/ush automatically escapes them to prevent injection attacks:

```javascript
// SAFE - Variable is automatically escaped
const userInput = "file; rm -rf /"; // Malicious input
await $`echo ${userInput}`; // Prints: file; rm -rf /
// The semicolon and command are treated as text, not executed

// UNSAFE - Raw string concatenation (DON'T DO THIS!)
// await $`echo ` + userInput; // Would execute rm command!

// Multiple variables
const fileName = "my file.txt"; // Note the space
const content = "Hello\nWorld";
await $`echo ${content} > ${fileName}`; // Creates "my file.txt" safely
```

## The Execution Engine

@xec/ush uses an execution engine that:
1. **Parses** your command template
2. **Escapes** variables for safety
3. **Routes** to the appropriate adapter (local, SSH, Docker, etc.)
4. **Executes** the command
5. **Returns** structured results

## Command Results

Every command returns an `ExecutionResult` object:

```javascript
const result = await $`echo "Hello"`;

console.log(result.stdout);    // "Hello\n"
console.log(result.stderr);    // ""
console.log(result.exitCode);  // 0
console.log(result.duration);  // 15 (milliseconds)
console.log(result.command);   // "echo \"Hello\""
```

## Error Handling Philosophy

By default, @xec/ush throws an error when a command fails (non-zero exit code):

```javascript
// This throws an error
await $`exit 1`;

// This doesn't throw
const result = await $`exit 1`.nothrow();
console.log(result.exitCode); // 1
```

This makes scripts fail fast and prevents cascading errors.

## Adapter Pattern

@xec/ush uses adapters to execute commands in different environments:

- **LocalAdapter**: Runs commands on your machine
- **SSHAdapter**: Runs commands over SSH
- **DockerAdapter**: Runs commands in Docker containers
- **KubernetesAdapter**: Runs commands in Kubernetes pods
- **MockAdapter**: For testing without actually running commands

All adapters implement the same interface, making your code portable across environments.

## Next Steps

- Learn about [Command Execution](./command-execution.md) patterns
- Explore [Configuration Options](./configuration.md)
- Understand [Error Handling](./error-handling.md) strategies