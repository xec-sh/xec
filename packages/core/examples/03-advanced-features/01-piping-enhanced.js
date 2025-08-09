import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $, pipeUtils } from '@xec-sh/core';
import { createWriteStream } from 'node:fs';
import { Writable, Transform } from 'node:stream';
console.log('=== Enhanced Piping Examples ===\n');
console.log('1. Template literal piping:');
const upper = await $ `echo "hello world"`.pipe `tr a-z A-Z`;
console.log('Uppercase:', upper.stdout.trim());
console.log('\n2. Chained pipes:');
const processed = await $ `echo "hello world"`
    .pipe `tr a-z A-Z`
    .pipe `sed 's/WORLD/UNIVERSE/'`
    .pipe `rev`;
console.log('Processed:', processed.stdout.trim());
console.log('\n3. Transform stream piping:');
const doubled = await $ `echo "123"`
    .pipe(new Transform({
    transform(chunk, encoding, callback) {
        const num = parseInt(chunk.toString().trim());
        callback(null, String(num * 2));
    }
}));
console.log('Doubled:', doubled.stdout.trim());
console.log('\n4. Pipe utilities:');
const upperUtil = await $ `echo "hello"`.pipe(pipeUtils.toUpperCase());
console.log('Upper with util:', upperUtil.stdout.trim());
const grepResult = await $ `echo -e "apple\nbanana\napple pie\ncherry"`
    .pipe(pipeUtils.grep('apple'));
console.log('Grep result:', grepResult.stdout.trim());
const replaced = await $ `echo "hello world"`
    .pipe(pipeUtils.replace(/w\w+d/, 'universe'));
console.log('Replaced:', replaced.stdout.trim());
console.log('\n5. Function piping (line processing):');
const lines = [];
await $ `echo -e "item1\nitem2\nitem3"`
    .pipe((line) => {
    lines.push(`processed: ${line}`);
});
console.log('Processed lines:', lines);
console.log('\n6. Pipe to file:');
const outputFile = join(tmpdir(), 'pipe-output.txt');
const fileStream = createWriteStream(outputFile);
await $ `echo "Data written to file"`.pipe(fileStream);
const fileContent = await $ `cat ${outputFile}`;
console.log('File content:', fileContent.stdout.trim());
await $ `rm -f ${outputFile}`;
console.log('\n7. Tee operator:');
const outputs = [];
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
const teeResult = await $ `echo "broadcast message"`
    .pipe(pipeUtils.tee(collector1, collector2));
console.log('Tee result:', teeResult.stdout.trim());
console.log('Collected outputs:', outputs);
console.log('\n8. Error handling:');
try {
    await $ `false`.pipe `echo "This won't run"`;
}
catch (error) {
    console.log('Pipe failed as expected');
}
const recovered = await $ `false`
    .nothrow()
    .pipe `echo "Recovered from error"`;
console.log('Recovered:', recovered.stdout.trim());
console.log('\n9. Complex mixed pipe chain:');
const wordCounts = new Map();
const finalResult = await $ `echo -e "apple\nbanana\napple\ncherry\nbanana\napple"`
    .pipe(pipeUtils.grep(/^a/))
    .pipe((line) => {
    wordCounts.set(line, (wordCounts.get(line) || 0) + 1);
});
console.log('Word counts:', Object.fromEntries(wordCounts));
console.log('\n10. Conditional piping:');
const processIfLarge = async (result) => {
    const lineCount = result.stdout.split('\n').filter(Boolean).length;
    if (lineCount > 2) {
        return 'echo "Large output detected"';
    }
    return null;
};
const largeOutput = await $ `echo -e "line1\nline2\nline3"`
    .pipe(processIfLarge);
console.log('Large output result:', largeOutput?.stdout?.trim());
const smallOutput = await $ `echo "single line"`
    .pipe(processIfLarge);
console.log('Small output result:', smallOutput?.stdout?.trim());
console.log('\n11. Custom line separator:');
const csvData = [];
await $ `echo "name,age,city"`
    .pipe((field) => {
    csvData.push(field);
}, { lineByLine: true, lineSeparator: ',' });
console.log('CSV fields:', csvData);
console.log('\n12. Parallel pipe processing:');
const urls = ['url1', 'url2', 'url3'];
const results = await Promise.all(urls.map(url => $ `echo "Fetching ${url}"`
    .pipe `sed 's/Fetching/Downloaded/'`
    .then(r => r.stdout.trim())));
console.log('Parallel results:', results);
console.log('\n=== Enhanced Piping Complete ===');
//# sourceMappingURL=01-piping-enhanced.js.map