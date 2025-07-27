/**
 * 01. Temporary Files - Работа с временными файлами
 * 
 * Показывает использование утилит для работы с временными файлами.
 * 
 * ВАЖНО: В @xec-sh/core доступны только функции withTempDir и withTempFile.
 * Низкоуровневый API (TempFile, TempDir) не экспортируется.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { $, withTempDir, withTempFile } from '@xec-sh/core';

// 1. Временная директория с автоочисткой
// withTempDir принимает функцию-обработчик, которой передаётся объект TempDir
const result = await withTempDir(async (tmpDir) => {
  // tmpDir - это объект TempDir с свойством path
  console.log('Временная директория:', tmpDir.path);
  
  // Создаём файлы
  await $`touch ${tmpDir.path}/file1.txt ${tmpDir.path}/file2.txt`;
  await $`echo "test data" > ${tmpDir.path}/data.txt`;
  
  // Проверяем содержимое
  const files = await $`ls ${tmpDir.path}`;
  console.log('Файлы:', files.stdout);
  
  // Возвращаем результат
  return files.stdout.trim().split('\n').length;
});

console.log(`Создано файлов: ${result}`);
// Директория автоматически удалена

// 2. Временный файл с автоочисткой
// withTempFile принимает функцию-обработчик, которой передаётся объект TempFile
const content = await withTempFile(async (tmpFile) => {
  // tmpFile - это объект TempFile с свойством path
  console.log('Временный файл:', tmpFile.path);
  
  // Записываем данные через методы объекта
  await tmpFile.write('Hello, temp file!\n');
  await tmpFile.append('More data\n');
  
  // Читаем содержимое через метод объекта
  const data = await tmpFile.read();
  return data;
});

console.log('Содержимое файла:', content);
// Файл автоматически удалён

// 3. Создание временных файлов вручную через стандартные API Node.js
// Поскольку низкоуровневый temp API не экспортируется, используем os.tmpdir()
const tempDirPath = path.join(os.tmpdir(), `myapp-${Date.now()}`);
await fs.mkdir(tempDirPath, { recursive: true });
console.log('Создана директория:', tempDirPath);

// Используем директорию
await $`touch ${tempDirPath}/config.json`;
await $`echo '{"key": "value"}' > ${tempDirPath}/config.json`;

// Очищаем вручную
await fs.rm(tempDirPath, { recursive: true, force: true });
console.log('Директория очищена');

// 4. Временные файлы с расширениями через withTempFile
// Для создания файлов с определёнными расширениями используем опции
const scriptContent = await withTempFile(async (tmpFile) => {
  console.log('Временный скрипт:', tmpFile.path);
  
  // Записываем скрипт
  await tmpFile.write('#!/bin/bash\necho "Temp script executed"');
  
  // Делаем исполняемым
  await $`chmod +x ${tmpFile.path}`;
  
  // Выполняем
  const result = await $`${tmpFile.path}`;
  return result.stdout;
}, { suffix: '.sh' });

console.log('Результат скрипта:', scriptContent);

// 5. Временные файлы для обмена данными
async function processWithTempFiles(data: any[]) {
  return withTempDir(async (tmpDir) => {
    // Сохраняем данные во временные файлы
    const files = [];
    
    for (let i = 0; i < data.length; i++) {
      const file = path.join(tmpDir.path, `data-${i}.json`);
      await fs.writeFile(file, JSON.stringify(data[i]));
      files.push(file);
    }
    
    // Обрабатываем все файлы
    const results = [];
    for (const file of files) {
      // Если jq не установлен, используем альтернативный подход
      try {
        const result = await $`jq '.value * 2' < ${file}`;
        results.push(JSON.parse(result.stdout));
      } catch {
        // Альтернатива без jq
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

// 6. Временная рабочая директория
const buildResult = await withTempDir(async (buildDir) => {
  // Используем $.cd() для смены рабочей директории
  const $tmp = $.cd(buildDir.path);
  
  try {
    // Создаём проект
    await $tmp`npm init -y`;
    await $tmp`echo "console.log('Hello from temp build');" > index.js`;
    
    // Запускаем
    const output = await $tmp`node index.js`;
    return output.stdout;
  } catch (error) {
    console.error('Ошибка при сборке:', error.message);
    return 'Build failed';
  }
});

console.log('Результат сборки:', buildResult);

// 7. Безопасная работа с чувствительными данными
async function processSecretData(secret: string) {
  return withTempFile(async (tmpFile) => {
    // Записываем секрет через метод write объекта
    await tmpFile.write(secret);
    
    // Устанавливаем права доступа
    await $`chmod 600 ${tmpFile.path}`;
    
    // Проверяем права
    const stats = await $`ls -l ${tmpFile.path}`;
    console.log('Права файла:', stats.stdout.trim());
    
    // Вычисляем хэш
    const hash = await $`sha256sum ${tmpFile.path} | cut -d' ' -f1`;
    return hash.stdout.trim();
  });
  // Файл автоматически удалён, секрет не остаётся на диске
}

const secretHash = await processSecretData('super-secret-key-123');
console.log('Hash секрета:', secretHash);

// 8. Параллельная работа с временными файлами
const tasks = ['task1', 'task2', 'task3'];

const taskResults = await Promise.all(
  tasks.map(task => 
    withTempFile(async (tmpFile) => {
      await tmpFile.write(`Processing ${task}`);
      await $`sleep 0.5`;
      const result = await tmpFile.read();
      return { task, result: result.trim() };
    })
  )
);

console.log('Результаты задач:', taskResults);

// 9. Использование временных файлов для межпроцессного взаимодействия
// Создаём временный сокет вручную
const socketPath = path.join(os.tmpdir(), `ipc-${Date.now()}.sock`);

try {
  // Процесс 1: сервер (запускаем в фоне)
  const server = $`nc -lU ${socketPath}`.nothrow();
  
  // Даём серверу время запуститься
  await $`sleep 1`;
  
  // Процесс 2: клиент
  await $`echo "Hello from client" | nc -U ${socketPath}`.nothrow();
  
  // Ждём завершения сервера
  await server;
} catch (error) {
  console.error('Ошибка IPC:', error.message);
} finally {
  // Очищаем сокет
  await fs.rm(socketPath, { force: true }).catch(() => {});
}

// 10. Очистка при ошибках с withTempDir
async function safeProcess() {
  try {
    await withTempDir(async (tmpDir) => {
      // Работаем с файлами
      await $`touch ${tmpDir.path}/important.data`;
      
      // Симулируем ошибку
      throw new Error('Что-то пошло не так');
    });
  } catch (error) {
    console.error('Ошибка:', error.message);
    console.log('Временные файлы автоматически очищены');
  }
}

await safeProcess();
