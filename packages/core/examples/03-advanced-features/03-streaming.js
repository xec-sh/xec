import { $ } from '@xec-sh/core';
try {
    const lastLines = await $ `tail -100 /var/log/system.log | head -10`;
    console.log('Last 10 lines from log:');
    console.log(lastLines.stdout);
}
catch (error) {
    console.log('Failed to read log file');
}
try {
    const errors = await $ `tail -1000 /var/log/app.log 2>/dev/null | grep ERROR | head -20`;
    if (errors.stdout) {
        console.log('Errors in log:');
        console.log(errors.stdout);
    }
    else {
        console.log('No errors found in log');
    }
}
catch (error) {
    console.log('Log file not found or inaccessible');
}
const testFile = '/tmp/large-test.txt';
await $ `for i in {1..1000}; do echo "Line $i: Some test data"; done > ${testFile}`;
const sizeResult = await $ `wc -c < ${testFile}`;
const fileSize = parseInt(sizeResult.stdout.trim());
console.log(`File size: ${(fileSize / 1024).toFixed(2)} KB`);
const firstLines = await $ `head -100 ${testFile}`;
console.log(`First line: ${firstLines.stdout.split('\n')[0]}`);
await $ `rm -f ${testFile}`;
const jsonData = await $ `echo '{"name":"test"}\n{"name":"test2"}\n{"name":"test3"}'`;
const jsonLines = [];
const lines = jsonData.stdout.trim().split('\n');
for (const line of lines) {
    if (line) {
        try {
            const obj = JSON.parse(line);
            jsonLines.push(obj);
            console.log('Received JSON:', obj);
        }
        catch (e) {
            console.error('Parsing error:', line);
        }
    }
}
console.log(`Total JSON objects processed: ${jsonLines.length}`);
const findResult = await $ `find . -type f -name "*.js" | head -50`;
const files = findResult.stdout.trim().split('\n').filter(Boolean);
if (files.length === 0) {
    console.log('JavaScript files not found');
}
else {
    const BATCH_SIZE = 10;
    console.log(`Found ${files.length} JavaScript files`);
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}:`);
        batch.forEach(file => console.log(`  - ${file}`));
    }
}
const pipeResult = await $ `yes "data" | head -n 100 | wc -l`;
console.log('Processed lines:', pipeResult.stdout.trim());
const processed = await $ `seq 1 50 | awk '{print $1 * 2}' | paste -sd+ - | bc`;
console.log('Sum of doubled numbers:', processed.stdout.trim());
const multiOutput = await $ `echo "stdout output" && echo "stderr output" >&2`;
console.log('STDOUT:', multiOutput.stdout.trim());
if (multiOutput.stderr) {
    console.log('STDERR:', multiOutput.stderr.trim());
}
const commandWithWarning = await $ `ls /nonexistent 2>&1 || echo "Command failed"`;
console.log('Result:', commandWithWarning.stdout);
const outputFile = '/tmp/example.html';
try {
    console.log('Downloading file...');
    await $ `curl -# -L https://example.com -o ${outputFile}`;
    const size = await $ `ls -lh ${outputFile} | awk '{print $5}'`;
    console.log(`\nDownload completed. File size: ${size.stdout.trim()}`);
    await $ `rm -f ${outputFile}`;
}
catch (error) {
    console.log('Download error');
}
const inputData = 'line1\nline2\nline3';
const uppercased = await $ `echo "${inputData}" | tr '[:lower:]' '[:upper:]'`;
console.log('Uppercase:');
console.log(uppercased.stdout);
const numbered = await $ `echo "${inputData}" | nl`;
console.log('\nNumbered lines:');
console.log(numbered.stdout);
const reversed = await $ `echo "${inputData}" | tac 2>/dev/null || echo "${inputData}" | tail -r 2>/dev/null || echo "tac/tail -r not available"`;
console.log('\nReverse order:');
console.log(reversed.stdout);
const nonExistentFile = '/non/existent/file.txt';
const fileResult = await $ `cat ${nonExistentFile} 2>&1`.nothrow();
if (fileResult.ok) {
    console.log('File content:', fileResult.stdout);
}
else {
    console.log('File read error');
    console.log('Exit code:', fileResult.exitCode);
    console.log('Message:', fileResult.stdout.trim());
}
try {
    const topOutput = await $ `top -l 1 -n 0 2>/dev/null || top -b -n 1 2>/dev/null || echo "top not available"`;
    if (topOutput.stdout.includes('top not available')) {
        console.log('top not available');
    }
    else {
        const systemLines = topOutput.stdout.split('\n').slice(0, 10);
        console.log('System information:');
        systemLines.forEach(line => {
            if (line.includes('CPU') || line.includes('Mem') || line.includes('Load')) {
                console.log(line);
            }
        });
    }
    const uptime = await $ `uptime`;
    console.log('\nUptime:', uptime.stdout.trim());
}
catch (error) {
    console.log('Failed to get system information');
}
//# sourceMappingURL=03-streaming.js.map