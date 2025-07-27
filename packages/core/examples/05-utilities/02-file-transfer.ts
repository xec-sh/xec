/**
 * 02. File Transfer - Передача файлов между средами
 * 
 * Показывает использование команд для передачи файлов между различными средами.
 * 
 * ВАЖНО: В @xec-sh/core нет встроенной функции transfer.
 * Для передачи файлов используются стандартные команды: cp, scp, rsync, docker cp.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { $, withTempDir } from '@xec-sh/core';

// 1. Простая передача между локальными путями
await withTempDir(async (tmpDir) => {
  // Создаём файл
  const sourceFile = path.join(tmpDir.path, 'source.txt');
  await fs.writeFile(sourceFile, 'Hello, transfer!');
  
  // Копируем файл локально
  const destFile = path.join(tmpDir.path, 'destination.txt');
  await $`cp ${sourceFile} ${destFile}`;
  
  // Проверяем
  const content = await fs.readFile(destFile, 'utf-8');
  console.log('Переданное содержимое:', content);
});

// 2. Передача через SSH
// Для работы с SSH нужен настроенный SSH доступ
const sshHost = 'example.com';
const sshUser = 'user';
const sshKey = '/path/to/id_rsa';

// Загрузка файла на сервер через scp
console.log('Загрузка файла на сервер...');
await $`scp -i ${sshKey} /local/data.csv ${sshUser}@${sshHost}:/remote/data.csv`.nothrow();

// Альтернатива с rsync (более гибкая)
await $`rsync -avz -e "ssh -i ${sshKey}" /local/data.csv ${sshUser}@${sshHost}:/remote/`.nothrow();

// Скачивание файла с сервера
console.log('Скачивание файла с сервера...');
await $`scp -i ${sshKey} ${sshUser}@${sshHost}:/remote/results.csv /local/results.csv`.nothrow();

// Использование SSH адаптера для выполнения команд
const $ssh = $.ssh({
  host: sshHost,
  username: sshUser,
  privateKey: sshKey
});

// Создаём файл на удалённом сервере
await $ssh`echo "Remote file content" > /tmp/remote-file.txt`;

// 3. Передача в Docker контейнер
// Предполагаем, что контейнер уже существует
const containerName = 'my-alpine-container';

// Копирование файла в контейнер
console.log('Копирование в Docker контейнер...');
await $`docker cp /local/config.json ${containerName}:/data/config.json`.nothrow();

// Обработка в контейнере
const $docker = $.docker({
  container: containerName
});

// Если jq не установлен в контейнере, используем альтернативу
try {
  await $docker`cat /data/config.json | jq '.settings'`;
} catch {
  // Альтернатива без jq
  const content = await $docker`cat /data/config.json`;
  console.log('Содержимое config.json:', content.stdout);
}

// Копирование из контейнера
await $`docker cp ${containerName}:/data/output.json /local/output.json`.nothrow();

// 4. Массовая передача файлов
async function transferMultipleFiles(files: string[], destination: string, isRemote = false) {
  const results = [];
  
  for (const file of files) {
    const destPath = path.join(destination, path.basename(file));
    try {
      if (isRemote) {
        // Передача на удалённый сервер
        await $`scp -i ${sshKey} ${file} ${sshUser}@${sshHost}:${destPath}`;
      } else {
        // Локальное копирование
        await $`cp ${file} ${destPath}`;
      }
      results.push({ file, status: 'success' });
    } catch (error) {
      results.push({ file, status: 'failed', error: error.message });
    }
  }
  
  return results;
}

// Создаём тестовые файлы
await withTempDir(async (tmpDir) => {
  const files = [];
  for (let i = 1; i <= 3; i++) {
    const file = path.join(tmpDir.path, `file${i}.txt`);
    await fs.writeFile(file, `Content of file ${i}`);
    files.push(file);
  }
  
  // Передаём локально
  const localDest = path.join(tmpDir.path, 'backup');
  await $`mkdir -p ${localDest}`;
  
  const transferResults = await transferMultipleFiles(files, localDest, false);
  console.log('Результаты передачи:', transferResults);
});

// 5. Передача с отображением прогресса
console.log('\nПередача больших файлов с прогрессом:');

async function transferWithProgress(source: string, dest: string, isRemote = false) {
  // Получаем размер файла
  const stats = await fs.stat(source);
  const fileSize = stats.size;
  const fileName = path.basename(source);
  
  console.log(`Передача ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
  
  // Для rsync можно использовать --progress
  if (isRemote) {
    await $`rsync --progress -avz -e "ssh -i ${sshKey}" ${source} ${sshUser}@${sshHost}:${dest}`;
  } else {
    // Для локального копирования используем dd с прогрессом
    await $`dd if=${source} of=${dest} bs=1M status=progress`;
  }
  
  console.log('Передача завершена');
}

// Использование
await withTempDir(async (tmpDir) => {
  const bigFile = path.join(tmpDir.path, 'big.dat');
  await $`dd if=/dev/zero of=${bigFile} bs=1M count=10`;
  
  await transferWithProgress(bigFile, path.join(tmpDir.path, 'big-copy.dat'));
});

// 6. Передача директорий
async function transferDirectory(sourceDir: string, destDir: string, isRemote = false) {
  if (isRemote) {
    // Используем rsync для передачи директории на удалённый сервер
    console.log(`Передача директории ${sourceDir} на удалённый сервер...`);
    await $`rsync -avz -e "ssh -i ${sshKey}" ${sourceDir}/ ${sshUser}@${sshHost}:${destDir}/`;
  } else {
    // Локальное копирование директории
    console.log(`Копирование директории ${sourceDir}...`);
    await $`cp -r ${sourceDir} ${destDir}`;
  }
  
  console.log('Директория передана');
}

// Пример использования с временной директорией
await withTempDir(async (tmpDir) => {
  // Создаём тестовую структуру
  const projectDir = path.join(tmpDir.path, 'project');
  await $`mkdir -p ${projectDir}/src ${projectDir}/docs`;
  await fs.writeFile(path.join(projectDir, 'README.md'), '# Test Project');
  await fs.writeFile(path.join(projectDir, 'src/index.js'), 'console.log("Hello");');
  
  // Копируем локально
  const backupDir = path.join(tmpDir.path, 'backup');
  await transferDirectory(projectDir, backupDir, false);
  
  // Проверяем
  const files = await $`find ${backupDir} -type f`;
  console.log('Скопированные файлы:', files.stdout);
});

// 7. Синхронизация файлов
async function syncFiles(localDir: string, remoteDir: string) {
  // rsync автоматически синхронизирует файлы
  console.log('Синхронизация файлов...');
  
  // --delete удаляет файлы в назначении, которых нет в источнике
  await $`rsync -avz --delete -e "ssh -i ${sshKey}" ${localDir}/ ${sshUser}@${sshHost}:${remoteDir}/`;
  
  console.log('Синхронизация завершена');
}

// 8. Передача с сжатием
async function transferCompressed(source: string, dest: string, isRemote = false) {
  return withTempDir(async (tmpDir) => {
    const archive = path.join(tmpDir.path, 'transfer.tar.gz');
    
    // Сжимаем
    console.log('Сжатие...');
    await $`tar -czf ${archive} -C ${path.dirname(source)} ${path.basename(source)}`;
    
    // Передаём
    console.log('Передача...');
    if (isRemote) {
      const remoteArchive = '/tmp/transfer.tar.gz';
      await $`scp -i ${sshKey} ${archive} ${sshUser}@${sshHost}:${remoteArchive}`;
      
      // Распаковываем на удалённом сервере
      await $ssh`tar -xzf ${remoteArchive} -C ${path.dirname(dest)}`;
      await $ssh`rm ${remoteArchive}`;
    } else {
      await $`tar -xzf ${archive} -C ${path.dirname(dest)}`;
    }
    
    console.log('Передача с сжатием завершена');
  });
}

// 9. Передача между контейнерами через промежуточный файл
async function dockerToDockerTransfer() {
  // Предполагаем, что контейнеры существуют
  const sourceContainer = 'source-container';
  const destContainer = 'dest-container';
  
  return withTempDir(async (tmpDir) => {
    const tempFile = path.join(tmpDir.path, 'transfer.txt');
    
    // Создаём файл в первом контейнере
    const $dockerSource = $.docker({ container: sourceContainer });
    await $dockerSource`echo "Docker to Docker transfer" > /tmp/test.txt`;
    
    // Копируем из первого контейнера
    await $`docker cp ${sourceContainer}:/tmp/test.txt ${tempFile}`;
    
    // Копируем во второй контейнер
    await $`docker cp ${tempFile} ${destContainer}:/tmp/received.txt`;
    
    // Проверяем
    const $dockerDest = $.docker({ container: destContainer });
    const content = await $dockerDest`cat /tmp/received.txt`;
    console.log('Переданное содержимое:', content.stdout);
  });
}

// Запускаем только если контейнеры существуют
try {
  await dockerToDockerTransfer();
} catch (error) {
  console.log('Пропускаем docker-to-docker передачу (контейнеры не найдены)');
}

// 10. Безопасная передача с проверкой контрольной суммы
async function secureTransfer(source: string, dest: string, isRemote = false) {
  // Вычисляем контрольную сумму исходного файла
  const sourceHash = await $`sha256sum ${source} | cut -d' ' -f1`;
  const sourceHashValue = sourceHash.stdout.trim();
  
  console.log(`Исходный hash: ${sourceHashValue}`);
  
  // Передаём файл
  if (isRemote) {
    await $`scp -i ${sshKey} ${source} ${sshUser}@${sshHost}:${dest}`;
    
    // Проверяем контрольную сумму на удалённом сервере
    const destHash = await $ssh`sha256sum ${dest} | cut -d' ' -f1`;
    const destHashValue = destHash.stdout.trim();
    
    if (sourceHashValue === destHashValue) {
      console.log('✓ Передача успешна, контрольные суммы совпадают');
      return true;
    } else {
      console.error('✗ Ошибка: контрольные суммы не совпадают!');
      await $ssh`rm ${dest}`;
      return false;
    }
  } else {
    await $`cp ${source} ${dest}`;
    
    const destHash = await $`sha256sum ${dest} | cut -d' ' -f1`;
    const destHashValue = destHash.stdout.trim();
    
    if (sourceHashValue === destHashValue) {
      console.log('✓ Передача успешна, контрольные суммы совпадают');
      return true;
    } else {
      console.error('✗ Ошибка: контрольные суммы не совпадают!');
      await $`rm ${dest}`;
      return false;
    }
  }
}

// Тестирование
await withTempDir(async (tmpDir) => {
  const testFile = path.join(tmpDir.path, 'secure.dat');
  await fs.writeFile(testFile, 'Secure data for transfer');
  
  await secureTransfer(testFile, path.join(tmpDir.path, 'secure-copy.dat'), false);
});
