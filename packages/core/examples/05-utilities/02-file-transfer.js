import * as path from 'path';
import * as fs from 'fs/promises';
import { $, withTempDir } from '@xec-sh/core';
await withTempDir(async (tmpDir) => {
    const sourceFile = path.join(tmpDir.path, 'source.txt');
    await fs.writeFile(sourceFile, 'Hello, transfer!');
    const destFile = path.join(tmpDir.path, 'destination.txt');
    await $ `cp ${sourceFile} ${destFile}`;
    const content = await fs.readFile(destFile, 'utf-8');
    console.log('Переданное содержимое:', content);
});
const sshHost = 'example.com';
const sshUser = 'user';
const sshKey = '/path/to/id_rsa';
console.log('Загрузка файла на сервер...');
await $ `scp -i ${sshKey} /local/data.csv ${sshUser}@${sshHost}:/remote/data.csv`.nothrow();
await $ `rsync -avz -e "ssh -i ${sshKey}" /local/data.csv ${sshUser}@${sshHost}:/remote/`.nothrow();
console.log('Скачивание файла с сервера...');
await $ `scp -i ${sshKey} ${sshUser}@${sshHost}:/remote/results.csv /local/results.csv`.nothrow();
const $ssh = $.ssh({
    host: sshHost,
    username: sshUser,
    privateKey: sshKey
});
await $ssh `echo "Remote file content" > /tmp/remote-file.txt`;
const containerName = 'my-alpine-container';
console.log('Копирование в Docker контейнер...');
await $ `docker cp /local/config.json ${containerName}:/data/config.json`.nothrow();
const $docker = $.docker({
    container: containerName
});
try {
    await $docker `cat /data/config.json | jq '.settings'`;
}
catch {
    const content = await $docker `cat /data/config.json`;
    console.log('Содержимое config.json:', content.stdout);
}
await $ `docker cp ${containerName}:/data/output.json /local/output.json`.nothrow();
async function transferMultipleFiles(files, destination, isRemote = false) {
    const results = [];
    for (const file of files) {
        const destPath = path.join(destination, path.basename(file));
        try {
            if (isRemote) {
                await $ `scp -i ${sshKey} ${file} ${sshUser}@${sshHost}:${destPath}`;
            }
            else {
                await $ `cp ${file} ${destPath}`;
            }
            results.push({ file, status: 'success' });
        }
        catch (error) {
            results.push({ file, status: 'failed', error: error.message });
        }
    }
    return results;
}
await withTempDir(async (tmpDir) => {
    const files = [];
    for (let i = 1; i <= 3; i++) {
        const file = path.join(tmpDir.path, `file${i}.txt`);
        await fs.writeFile(file, `Content of file ${i}`);
        files.push(file);
    }
    const localDest = path.join(tmpDir.path, 'backup');
    await $ `mkdir -p ${localDest}`;
    const transferResults = await transferMultipleFiles(files, localDest, false);
    console.log('Результаты передачи:', transferResults);
});
console.log('\nПередача больших файлов с прогрессом:');
async function transferWithProgress(source, dest, isRemote = false) {
    const stats = await fs.stat(source);
    const fileSize = stats.size;
    const fileName = path.basename(source);
    console.log(`Передача ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    if (isRemote) {
        await $ `rsync --progress -avz -e "ssh -i ${sshKey}" ${source} ${sshUser}@${sshHost}:${dest}`;
    }
    else {
        await $ `dd if=${source} of=${dest} bs=1M status=progress`;
    }
    console.log('Передача завершена');
}
await withTempDir(async (tmpDir) => {
    const bigFile = path.join(tmpDir.path, 'big.dat');
    await $ `dd if=/dev/zero of=${bigFile} bs=1M count=10`;
    await transferWithProgress(bigFile, path.join(tmpDir.path, 'big-copy.dat'));
});
async function transferDirectory(sourceDir, destDir, isRemote = false) {
    if (isRemote) {
        console.log(`Передача директории ${sourceDir} на удалённый сервер...`);
        await $ `rsync -avz -e "ssh -i ${sshKey}" ${sourceDir}/ ${sshUser}@${sshHost}:${destDir}/`;
    }
    else {
        console.log(`Копирование директории ${sourceDir}...`);
        await $ `cp -r ${sourceDir} ${destDir}`;
    }
    console.log('Директория передана');
}
await withTempDir(async (tmpDir) => {
    const projectDir = path.join(tmpDir.path, 'project');
    await $ `mkdir -p ${projectDir}/src ${projectDir}/docs`;
    await fs.writeFile(path.join(projectDir, 'README.md'), '# Test Project');
    await fs.writeFile(path.join(projectDir, 'src/index.js'), 'console.log("Hello");');
    const backupDir = path.join(tmpDir.path, 'backup');
    await transferDirectory(projectDir, backupDir, false);
    const files = await $ `find ${backupDir} -type f`;
    console.log('Скопированные файлы:', files.stdout);
});
async function syncFiles(localDir, remoteDir) {
    console.log('Синхронизация файлов...');
    await $ `rsync -avz --delete -e "ssh -i ${sshKey}" ${localDir}/ ${sshUser}@${sshHost}:${remoteDir}/`;
    console.log('Синхронизация завершена');
}
async function transferCompressed(source, dest, isRemote = false) {
    return withTempDir(async (tmpDir) => {
        const archive = path.join(tmpDir.path, 'transfer.tar.gz');
        console.log('Сжатие...');
        await $ `tar -czf ${archive} -C ${path.dirname(source)} ${path.basename(source)}`;
        console.log('Передача...');
        if (isRemote) {
            const remoteArchive = '/tmp/transfer.tar.gz';
            await $ `scp -i ${sshKey} ${archive} ${sshUser}@${sshHost}:${remoteArchive}`;
            await $ssh `tar -xzf ${remoteArchive} -C ${path.dirname(dest)}`;
            await $ssh `rm ${remoteArchive}`;
        }
        else {
            await $ `tar -xzf ${archive} -C ${path.dirname(dest)}`;
        }
        console.log('Передача с сжатием завершена');
    });
}
async function dockerToDockerTransfer() {
    const sourceContainer = 'source-container';
    const destContainer = 'dest-container';
    return withTempDir(async (tmpDir) => {
        const tempFile = path.join(tmpDir.path, 'transfer.txt');
        const $dockerSource = $.docker({ container: sourceContainer });
        await $dockerSource `echo "Docker to Docker transfer" > /tmp/test.txt`;
        await $ `docker cp ${sourceContainer}:/tmp/test.txt ${tempFile}`;
        await $ `docker cp ${tempFile} ${destContainer}:/tmp/received.txt`;
        const $dockerDest = $.docker({ container: destContainer });
        const content = await $dockerDest `cat /tmp/received.txt`;
        console.log('Переданное содержимое:', content.stdout);
    });
}
try {
    await dockerToDockerTransfer();
}
catch (error) {
    console.log('Пропускаем docker-to-docker передачу (контейнеры не найдены)');
}
async function secureTransfer(source, dest, isRemote = false) {
    const sourceHash = await $ `sha256sum ${source} | cut -d' ' -f1`;
    const sourceHashValue = sourceHash.stdout.trim();
    console.log(`Исходный hash: ${sourceHashValue}`);
    if (isRemote) {
        await $ `scp -i ${sshKey} ${source} ${sshUser}@${sshHost}:${dest}`;
        const destHash = await $ssh `sha256sum ${dest} | cut -d' ' -f1`;
        const destHashValue = destHash.stdout.trim();
        if (sourceHashValue === destHashValue) {
            console.log('✓ Передача успешна, контрольные суммы совпадают');
            return true;
        }
        else {
            console.error('✗ Ошибка: контрольные суммы не совпадают!');
            await $ssh `rm ${dest}`;
            return false;
        }
    }
    else {
        await $ `cp ${source} ${dest}`;
        const destHash = await $ `sha256sum ${dest} | cut -d' ' -f1`;
        const destHashValue = destHash.stdout.trim();
        if (sourceHashValue === destHashValue) {
            console.log('✓ Передача успешна, контрольные суммы совпадают');
            return true;
        }
        else {
            console.error('✗ Ошибка: контрольные суммы не совпадают!');
            await $ `rm ${dest}`;
            return false;
        }
    }
}
await withTempDir(async (tmpDir) => {
    const testFile = path.join(tmpDir.path, 'secure.dat');
    await fs.writeFile(testFile, 'Secure data for transfer');
    await secureTransfer(testFile, path.join(tmpDir.path, 'secure-copy.dat'), false);
});
//# sourceMappingURL=02-file-transfer.js.map