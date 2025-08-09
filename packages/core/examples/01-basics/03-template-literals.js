import { $, ExecutionEngine } from '@xec-sh/core';
const filename = 'test.txt';
const content = 'Hello, xec!';
await $ `echo ${content} > ${filename}`;
await $ `cat ${filename}`;
await $ `rm ${filename}`;
const dangerous = "'; rm -rf /; echo '";
await $ `echo ${dangerous}`;
const userInput = '$(cat /etc/passwd)';
await $ `echo "User said: ${userInput}"`;
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
await $ `touch ${files}`;
await $ `ls file*.txt`;
await $ `rm ${files}`;
const config = {
    name: 'test-app',
    version: '1.0.0'
};
const result = await $ `echo ${config}`;
console.log('Object as string:', result.stdout.trim());
const fileWithSpaces = 'file with spaces.txt';
await $ `touch ${fileWithSpaces}`;
await $ `ls ${fileWithSpaces}`;
await $ `rm ${fileWithSpaces}`;
const count = 5;
const isEnabled = true;
await $ `echo "Count: ${count}, Enabled: ${isEnabled}"`;
const command = 'ls -la';
await $ `${command}`;
const engine = new ExecutionEngine();
const pattern = '*.txt';
const foundFiles = await engine.raw `ls ${pattern}`;
console.log('Found .txt files:', foundFiles.stdout);
const nullValue = null;
const undefinedValue = undefined;
await $ `echo "Null: ${nullValue}, Undefined: ${undefinedValue}"`;
const getDirName = async () => 'important-dir';
const dirName = getDirName();
await $ `mkdir -p ${dirName}`;
await $ `ls ${dirName}`;
await $ `rmdir ${dirName}`;
const port = 3000;
const host = 'localhost';
const protocol = 'http';
const flags = ['-v', '--color', '--no-warnings'];
await $ `curl ${flags} ${protocol}://${host}:${port}/api/health`;
//# sourceMappingURL=03-template-literals.js.map