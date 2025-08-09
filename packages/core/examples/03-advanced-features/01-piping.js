import { $ } from '@xec-sh/core';
const simpleResult = await $ `echo "hello world" | tr '[:lower:]' '[:upper:]'`;
console.log('Simple pipe:', simpleResult.stdout);
const count = await $ `ls -la | grep ".ts" | wc -l`;
console.log('Number of .ts files:', count.stdout.trim());
const input = 'Line 1\nLine 2\nLine 3';
const numbered = await $ `echo "${input}" | nl`;
console.log('Numbered lines:\n', numbered.stdout);
const jsonFiles = await $ `find . -name "*.json" -type f | head -10 | sort | uniq`;
console.log('JSON files (first 10):', jsonFiles.stdout);
const files = await $ `ls -la`;
const filtered = await $ `echo "${files.stdout}" | grep "test"`;
console.log('Filtered files:', filtered.stdout);
const pipeResult = await $ `echo "test" | grep "nonexistent" | wc -l`.nothrow();
if (!pipeResult.ok) {
    console.log('Pipe finished with error');
    console.log('Exit code:', pipeResult.exitCode);
}
else {
    console.log('Result:', pipeResult.stdout.trim());
}
const logFile = '/var/log/system.log';
try {
    const errors = await $ `tail -100 ${logFile} | grep ERROR | head -5`;
    if (errors.stdout) {
        console.log('Latest errors in log:');
        console.log(errors.stdout);
    }
    else {
        console.log('No errors found');
    }
}
catch (error) {
    console.log('Failed to read log file');
}
const jsonData = { name: 'test', value: 42 };
try {
    const extracted = await $ `echo '${JSON.stringify(jsonData)}' | jq '.value'`;
    console.log('Extracted value:', extracted.stdout.trim());
}
catch (error) {
    console.log('jq not installed, using alternative');
    const extracted = await $ `echo '${JSON.stringify(jsonData)}' | grep -o '"value":[0-9]*' | cut -d: -f2`;
    console.log('Extracted value:', extracted.stdout.trim());
}
const nodePids = await $ `ps aux | grep node | grep -v grep | awk '{print $2}' | head -5`;
if (nodePids.stdout) {
    console.log('Node.js PIDs:\n', nodePids.stdout);
}
else {
    console.log('Node.js processes not found');
}
try {
    const $tmp = $.cd('/tmp');
    const archive = await $tmp `find . -name "*.txt" -type f -print0 | xargs -0 tar -czf - | base64`;
    if (archive.stdout) {
        console.log('Archive in base64 (first 100 chars):', archive.stdout.substring(0, 100));
    }
    else {
        console.log('Text files not found in /tmp');
    }
}
catch (error) {
    console.log('Error creating archive');
}
const streamResult = await $ `echo "stdout1" && echo "stderr1" >&2 | cat && echo "stderr2" >&2`;
console.log('Stdout:', streamResult.stdout.trim());
console.log('Stderr:', streamResult.stderr.trim());
const testFile = '/tmp/test-data.txt';
await $ `echo -e "apple\nbanana\napple\ncherry\nbanana\napple" > ${testFile}`;
const checkFile = await $ `test -f ${testFile} && echo "exists" || echo "missing"`;
if (checkFile.stdout.trim() === 'exists') {
    const process = await $ `cat ${testFile} | sort | uniq -c | sort -nr`;
    console.log('Word frequency:', process.stdout);
    await $ `rm -f ${testFile}`;
}
else {
    console.log('File not found');
}
//# sourceMappingURL=01-piping.js.map