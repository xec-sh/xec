import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { $, withTempDir, withTempFile } from '@xec-sh/core';
const result = await withTempDir(async (tmpDir) => {
    console.log('Временная директория:', tmpDir.path);
    await $ `touch ${tmpDir.path}/file1.txt ${tmpDir.path}/file2.txt`;
    await $ `echo "test data" > ${tmpDir.path}/data.txt`;
    const files = await $ `ls ${tmpDir.path}`;
    console.log('Файлы:', files.stdout);
    return files.stdout.trim().split('\n').length;
});
console.log(`Создано файлов: ${result}`);
const content = await withTempFile(async (tmpFile) => {
    console.log('Временный файл:', tmpFile.path);
    await tmpFile.write('Hello, temp file!\n');
    await tmpFile.append('More data\n');
    const data = await tmpFile.read();
    return data;
});
console.log('Содержимое файла:', content);
const tempDirPath = path.join(os.tmpdir(), `myapp-${Date.now()}`);
await fs.mkdir(tempDirPath, { recursive: true });
console.log('Создана директория:', tempDirPath);
await $ `touch ${tempDirPath}/config.json`;
await $ `echo '{"key": "value"}' > ${tempDirPath}/config.json`;
await fs.rm(tempDirPath, { recursive: true, force: true });
console.log('Директория очищена');
const scriptContent = await withTempFile(async (tmpFile) => {
    console.log('Временный скрипт:', tmpFile.path);
    await tmpFile.write('#!/bin/bash\necho "Temp script executed"');
    await $ `chmod +x ${tmpFile.path}`;
    const result = await $ `${tmpFile.path}`;
    return result.stdout;
}, { suffix: '.sh' });
console.log('Результат скрипта:', scriptContent);
async function processWithTempFiles(data) {
    return withTempDir(async (tmpDir) => {
        const files = [];
        for (let i = 0; i < data.length; i++) {
            const file = path.join(tmpDir.path, `data-${i}.json`);
            await fs.writeFile(file, JSON.stringify(data[i]));
            files.push(file);
        }
        const results = [];
        for (const file of files) {
            try {
                const result = await $ `jq '.value * 2' < ${file}`;
                results.push(JSON.parse(result.stdout));
            }
            catch {
                const content = await fs.readFile(file, 'utf8');
                const obj = JSON.parse(content);
                results.push(obj.value * 2);
            }
        }
        return results;
    });
}
const inputData = [
    { value: 10 },
    { value: 20 },
    { value: 30 }
];
const processed = await processWithTempFiles(inputData);
console.log('Обработанные данные:', processed);
const buildResult = await withTempDir(async (buildDir) => {
    const $tmp = $.cd(buildDir.path);
    try {
        await $tmp `npm init -y`;
        await $tmp `echo "console.log('Hello from temp build');" > index.js`;
        const output = await $tmp `node index.js`;
        return output.stdout;
    }
    catch (error) {
        console.error('Ошибка при сборке:', error.message);
        return 'Build failed';
    }
});
console.log('Результат сборки:', buildResult);
async function processSecretData(secret) {
    return withTempFile(async (tmpFile) => {
        await tmpFile.write(secret);
        await $ `chmod 600 ${tmpFile.path}`;
        const stats = await $ `ls -l ${tmpFile.path}`;
        console.log('Права файла:', stats.stdout.trim());
        const hash = await $ `sha256sum ${tmpFile.path} | cut -d' ' -f1`;
        return hash.stdout.trim();
    });
}
const secretHash = await processSecretData('super-secret-key-123');
console.log('Hash секрета:', secretHash);
const tasks = ['task1', 'task2', 'task3'];
const taskResults = await Promise.all(tasks.map(task => withTempFile(async (tmpFile) => {
    await tmpFile.write(`Processing ${task}`);
    await $ `sleep 0.5`;
    const result = await tmpFile.read();
    return { task, result: result.trim() };
})));
console.log('Результаты задач:', taskResults);
const socketPath = path.join(os.tmpdir(), `ipc-${Date.now()}.sock`);
try {
    const server = $ `nc -lU ${socketPath}`.nothrow();
    await $ `sleep 1`;
    await $ `echo "Hello from client" | nc -U ${socketPath}`.nothrow();
    await server;
}
catch (error) {
    console.error('Ошибка IPC:', error.message);
}
finally {
    await fs.rm(socketPath, { force: true }).catch(() => { });
}
async function safeProcess() {
    try {
        await withTempDir(async (tmpDir) => {
            await $ `touch ${tmpDir.path}/important.data`;
            throw new Error('Что-то пошло не так');
        });
    }
    catch (error) {
        console.error('Ошибка:', error.message);
        console.log('Временные файлы автоматически очищены');
    }
}
await safeProcess();
//# sourceMappingURL=01-temp-files.js.map