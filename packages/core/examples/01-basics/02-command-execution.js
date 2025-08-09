import { $, CommandError, ExecutionEngine } from '@xec-sh/core';
const files = await $ `ls -la`;
console.log('File list:', files.stdout);
const engine = new ExecutionEngine();
const rawResult = await engine.raw `echo "$HOME"`;
console.log('Home directory:', rawResult.stdout);
const homeDir = await $ `echo $HOME`;
console.log('Home directory (via shell):', homeDir.stdout);
const currentDir = (await $ `pwd`).stdout.trim();
console.log('Current directory:', currentDir);
const currentDirClean = await $ `pwd`.text();
console.log('Current directory (via text()):', currentDirClean);
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
const nothrowResult = await $ `false`.nothrow();
console.log('Exit code:', nothrowResult.exitCode);
console.log('Success:', nothrowResult.ok);
console.log('Cause:', nothrowResult.cause);
const fullResult = await $ `echo "test" && echo "error" >&2`;
console.log({
    stdout: fullResult.stdout,
    stderr: fullResult.stderr,
    exitCode: fullResult.exitCode,
    success: fullResult.ok,
    cause: fullResult.cause,
    command: fullResult.command
});
await $ `
  echo "Line 1"
  echo "Line 2"
  echo "Line 3"
`;
const piped = await $ `echo "hello world" | tr '[:lower:]' '[:upper:]'`;
console.log('In uppercase:', piped.stdout);
const packageInfo = await $ `cat package.json`.json();
console.log('Package name:', packageInfo.name);
const fileLines = await $ `ls -1`.lines();
console.log('File count:', fileLines.length);
const binaryData = await $ `cat /dev/urandom | head -c 10`.buffer();
console.log('Data size:', binaryData.length);
const timedResult = await $ `sleep 0.1 && echo "done"`.timeout(1000);
console.log('Result with timeout:', timedResult.stdout);
const complexResult = await $ `echo "test"`
    .timeout(5000)
    .env({ DEBUG: '1' })
    .cwd('/tmp')
    .nothrow()
    .quiet();
//# sourceMappingURL=02-command-execution.js.map