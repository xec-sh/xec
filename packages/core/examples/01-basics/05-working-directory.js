import * as os from 'os';
import * as path from 'path';
import { $ } from '@xec-sh/core';
const currentDir = await $ `pwd`;
console.log('Current directory:', currentDir.stdout.trim());
console.log('Node.js current directory:', process.cwd());
const tmpResult = await $ `pwd`.cwd('/tmp');
console.log('Directory for command:', tmpResult.stdout.trim());
const $inTmp = $.cd('/tmp');
await $inTmp `touch test-file.txt`;
await $inTmp `ls test-file.txt`;
await $inTmp `rm test-file.txt`;
const homeDir = os.homedir();
const $inHome = $.cd(homeDir);
const homePwd = await $inHome `pwd`;
console.log('Home directory:', homePwd.stdout.trim());
const tmpDir = '/tmp';
const subfolder = path.join(tmpDir, 'subfolder');
const $nested1 = $.cd(subfolder);
await $ `mkdir -p ${subfolder}`;
const nestedPwd1 = await $nested1 `pwd`;
console.log('Nested directory:', nestedPwd1.stdout.trim());
const result = await $ `ls`.cwd('/tmp');
console.log('Files in /tmp:', result.stdout);
const afterWithin = await $ `pwd`;
console.log('Directory after within:', afterWithin.stdout.trim());
const $complex = $.cd('/tmp')
    .env({ WORKING_DIR: '/tmp' })
    .timeout(5000);
await $complex `echo "Working in: $WORKING_DIR" && pwd`;
const targetDir1 = '/tmp/test-directory';
try {
    await $ `mkdir -p ${targetDir1}`;
    const exists = await $ `test -d ${targetDir1} && echo "exists"`.nothrow();
    if (exists.ok) {
        const $inTarget = $.cd(targetDir1);
        await $inTarget `touch file.txt`;
        await $inTarget `ls`;
    }
}
finally {
    await $ `rm -rf ${targetDir1}`;
}
const baseDir = '/tmp';
const $base = $.cd(baseDir);
await $base `mkdir -p subdir/nested`;
const nestedPath = path.join(baseDir, 'subdir/nested');
const $nested2 = $.cd(nestedPath);
const nestedPwd2 = await $nested2 `pwd`;
console.log('Nested path:', nestedPwd2.stdout.trim());
const $absolute = $.cd('/usr/local');
const absolutePwd = await $absolute `pwd`;
console.log('Absolute path:', absolutePwd.stdout.trim());
const sourceDir = '/tmp/source';
const targetDir2 = '/tmp/target';
try {
    await $ `mkdir -p ${sourceDir} ${targetDir2}`;
    const $source = $.cd(sourceDir);
    await $source `echo "Source content" > file.txt`;
    await $source `echo "Another file" > file2.txt`;
    const $target = $.cd(targetDir2);
    await $target `cp ${sourceDir}/* .`;
    const files = await $target `ls -la`;
    console.log('Files in target directory:', files.stdout);
}
finally {
    await $ `rm -rf ${sourceDir} ${targetDir2} /tmp/subdir /tmp/subfolder`;
}
//# sourceMappingURL=05-working-directory.js.map