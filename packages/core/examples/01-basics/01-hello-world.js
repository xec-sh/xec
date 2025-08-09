import { $, CommandError } from '../../src/index.js';
await $ `echo "Hello, World!"`;
const result = await $ `echo "Hello from xec!"`;
console.log('Output:', result.stdout);
console.log('Exit code:', result.exitCode);
console.log('Success:', result.ok);
console.log('Cause:', result.cause);
const name = 'TypeScript';
await $ `echo "Hello, ${name}!"`;
const userInput = 'World; rm -rf /';
await $ `echo "Hello, ${userInput}!"`;
await $ `echo "This is an error" >&2`;
try {
    await $ `exit 1`;
}
catch (error) {
    if (error instanceof CommandError) {
        console.log('Command finished with error');
        console.log('Exit code:', error.exitCode);
        console.log('Command:', error.command);
    }
}
//# sourceMappingURL=01-hello-world.js.map