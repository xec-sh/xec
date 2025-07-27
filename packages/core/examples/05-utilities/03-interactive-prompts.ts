/**
 * 03. Interactive Prompts - Интерактивные промпты
 * 
 * Показывает использование интерактивных возможностей через readline и стандартные методы Node.js.
 * 
 * ВАЖНО: В @xec-sh/core нет встроенного модуля interactive.
 * Для интерактивного ввода используется стандартный модуль readline Node.js.
 */

import { $ } from '@xec-sh/core';
import * as readline from 'readline';

// Создаём интерфейс readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Утилита для промисификации вопросов
function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

// 1. Простой вопрос с подтверждением
const confirmAnswer = await question('Продолжить выполнение? (y/n): ');
const confirmed = confirmAnswer.toLowerCase() === 'y' || confirmAnswer.toLowerCase() === 'yes';

if (confirmed) {
  console.log('Продолжаем...');
} else {
  console.log('Отменено пользователем');
}

// 2. Текстовый ввод с валидацией
let username = '';
while (true) {
  username = await question('Введите имя пользователя: ');
  if (username.length >= 3) {
    break;
  }
  console.log('Имя должно содержать минимум 3 символа');
}

console.log(`Привет, ${username}!`);

// 3. Парольный ввод (псевдо-скрытие)
// Для настоящего скрытия пароля нужны дополнительные библиотеки
console.log('Введите пароль: ');
// В реальном приложении используйте специальные библиотеки для скрытия ввода
const password = await question('');
console.log('Пароль введён');

// 4. Выбор из списка
console.log('\nВыберите окружение:');
console.log('1. development');
console.log('2. staging');
console.log('3. production');

let environmentChoice = '';
let environment = '';
while (true) {
  environmentChoice = await question('Выберите (1-3): ');
  const choice = parseInt(environmentChoice);
  
  if (choice >= 1 && choice <= 3) {
    environment = ['development', 'staging', 'production'][choice - 1];
    break;
  }
  console.log('Пожалуйста, выберите число от 1 до 3');
}

console.log(`Выбрано окружение: ${environment}`);

// 5. Множественный выбор
console.log('\nВыберите функции для установки (через запятую):');
console.log('1. TypeScript');
console.log('2. ESLint');
console.log('3. Jest');
console.log('4. Prettier');

const featuresInput = await question('Введите номера (например, 1,2,4): ');
const featureIndices = featuresInput.split(',').map(s => parseInt(s.trim()) - 1);
const allFeatures = ['typescript', 'eslint', 'jest', 'prettier'];
const selectedFeatures = featureIndices
  .filter(i => i >= 0 && i < allFeatures.length)
  .map(i => allFeatures[i]);

console.log('Выбранные функции:', selectedFeatures.join(', '));

// 6. Несколько вопросов подряд
console.log('\n=== Информация о проекте ===');

const projectName = await question('Название проекта (my-project): ') || 'my-project';

let projectVersion = '';
while (true) {
  projectVersion = await question('Версия (1.0.0): ') || '1.0.0';
  const semverRegex = /^\d+\.\d+\.\d+$/;
  if (semverRegex.test(projectVersion)) {
    break;
  }
  console.log('Версия должна быть в формате x.y.z');
}

console.log('\nВыберите лицензию:');
const licenses = ['MIT', 'Apache-2.0', 'GPL-3.0', 'ISC', 'BSD-3-Clause'];
licenses.forEach((license, i) => {
  console.log(`${i + 1}. ${license}`);
});

let licenseChoice = '';
let projectLicense = '';
while (true) {
  licenseChoice = await question('Выберите (1-5): ');
  const choice = parseInt(licenseChoice);
  
  if (choice >= 1 && choice <= licenses.length) {
    projectLicense = licenses[choice - 1];
    break;
  }
  console.log(`Пожалуйста, выберите число от 1 до ${licenses.length}`);
}

const projectInfo = {
  name: projectName,
  version: projectVersion,
  license: projectLicense
};

console.log('\nИнформация о проекте:', projectInfo);

// 7. Анимация загрузки для длительных операций
console.log('\nУстановка зависимостей...');

// Простая анимация спиннера
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let frameIndex = 0;
let spinnerText = 'Установка зависимостей...';

const spinnerInterval = setInterval(() => {
  process.stdout.write(`\r${spinnerFrames[frameIndex]} ${spinnerText}`);
  frameIndex = (frameIndex + 1) % spinnerFrames.length;
}, 100);

// Симуляция установки
try {
  await $`sleep 2`;
  spinnerText = 'Компиляция...';
  await $`sleep 1`;
  clearInterval(spinnerInterval);
  process.stdout.write('\r✓ Установка завершена!                    \n');
} catch (error) {
  clearInterval(spinnerInterval);
  process.stdout.write('\r✗ Ошибка установки                         \n');
}

// 8. Условные вопросы
const useDockerAnswer = await question('Использовать Docker? (y/n): ');
const useDocker = useDockerAnswer.toLowerCase() === 'y';

if (useDocker) {
  const dockerImage = await question('Docker образ (node:18-alpine): ') || 'node:18-alpine';
  console.log(`Будет использоваться Docker образ: ${dockerImage}`);
}

// 9. Сложные сценарии
async function deploymentWizard() {
  console.log('\n=== Мастер развёртывания ===\n');
  
  // Шаг 1: Выбор сервера
  console.log('Выберите сервер:');
  const servers = [
    { name: 'Production (prod.example.com)', value: 'prod' },
    { name: 'Staging (staging.example.com)', value: 'staging' },
    { name: 'Development (dev.example.com)', value: 'dev' },
    { name: 'Другой...', value: 'custom' }
  ];
  
  servers.forEach((server, i) => {
    console.log(`${i + 1}. ${server.name}`);
  });
  
  let serverChoice = '';
  let serverHost = '';
  
  while (true) {
    serverChoice = await question('Выберите (1-4): ');
    const choice = parseInt(serverChoice);
    
    if (choice >= 1 && choice <= servers.length) {
      const selectedServer = servers[choice - 1];
      serverHost = selectedServer.value;
      
      if (serverHost === 'custom') {
        serverHost = await question('Введите адрес сервера: ');
        if (!serverHost) {
          console.log('Адрес не может быть пустым');
          continue;
        }
      }
      break;
    }
    console.log('Пожалуйста, выберите число от 1 до 4');
  }
  
  // Шаг 2: Настройки развёртывания
  console.log('\nВыберите задачи для выполнения (через запятую):');
  const tasks = [
    { name: 'Остановить текущие сервисы', value: 'stop' },
    { name: 'Обновить код', value: 'update' },
    { name: 'Установить зависимости', value: 'install' },
    { name: 'Выполнить миграции', value: 'migrate' },
    { name: 'Очистить кэш', value: 'cache' },
    { name: 'Запустить сервисы', value: 'start' }
  ];
  
  tasks.forEach((task, i) => {
    console.log(`${i + 1}. ${task.name}`);
  });
  
  const tasksInput = await question('Введите номера (например, 1,2,3,6): ') || '1,2,3,6';
  const taskIndices = tasksInput.split(',').map(s => parseInt(s.trim()) - 1);
  const selectedTasks = taskIndices
    .filter(i => i >= 0 && i < tasks.length)
    .map(i => tasks[i].value);
  
  const backupAnswer = await question('Создать резервную копию? (y/n): ');
  const createBackup = backupAnswer.toLowerCase() === 'y';
  
  // Шаг 3: Подтверждение
  console.log('\nНастройки развёртывания:');
  console.log(`- Сервер: ${serverHost}`);
  console.log(`- Задачи: ${selectedTasks.join(', ')}`);
  console.log(`- Резервная копия: ${createBackup ? 'Да' : 'Нет'}`);
  
  const proceedAnswer = await question('\nНачать развёртывание? (y/n): ');
  const proceed = proceedAnswer.toLowerCase() === 'y';
  
  if (proceed) {
    // Анимация развёртывания
    const deploySpinner = setInterval(() => {
      process.stdout.write('.');
    }, 500);
    
    process.stdout.write('Развёртывание');
    
    // Симуляция развёртывания
    await $`sleep 3`;
    
    clearInterval(deploySpinner);
    console.log('\n✓ Развёртывание завершено!');
  } else {
    console.log('Развёртывание отменено');
  }
}

// await deploymentWizard(); // Раскомментируйте для тестирования

// 10. Сохранение конфигурации
import * as fs from 'fs/promises';

async function configureProject() {
  console.log('\n=== Конфигурация проекта ===');
  
  const appName = await question('Название приложения (MyApp): ') || 'MyApp';
  
  let port = 3000;
  while (true) {
    const portInput = await question('Порт (3000): ') || '3000';
    port = parseInt(portInput);
    
    if (port >= 1 && port <= 65535) {
      break;
    }
    console.log('Порт должен быть от 1 до 65535');
  }
  
  console.log('\nВыберите базу данных:');
  const databases = ['PostgreSQL', 'MySQL', 'MongoDB', 'SQLite'];
  databases.forEach((db, i) => {
    console.log(`${i + 1}. ${db}`);
  });
  
  let database = '';
  while (true) {
    const dbChoice = await question('Выберите (1-4): ');
    const choice = parseInt(dbChoice);
    
    if (choice >= 1 && choice <= databases.length) {
      database = databases[choice - 1];
      break;
    }
    console.log('Пожалуйста, выберите число от 1 до 4');
  }
  
  const config = {
    appName,
    port,
    database
  };
  
  // Сохраняем конфигурацию
  const configJson = JSON.stringify(config, null, 2);
  await fs.writeFile('app-config.json', configJson);
  
  console.log('\nКонфигурация сохранена в app-config.json');
}

// await configureProject(); // Раскомментируйте для тестирования

// 11. Интерактивный выбор файлов
async function selectFiles() {
  // Получаем список файлов
  const files = await $`find . -name "*.ts" -type f | head -20`;
  const fileList = files.stdout.trim().split('\n').filter(Boolean);
  
  if (fileList.length === 0) {
    console.log('Файлы не найдены');
    return;
  }
  
  console.log('\nДоступные файлы:');
  fileList.forEach((file, i) => {
    console.log(`${i + 1}. ${file}`);
  });
  
  const selectedIndices = await question('\nВыберите файлы для обработки (через запятую): ');
  const indices = selectedIndices.split(',').map(s => parseInt(s.trim()) - 1);
  const selectedFiles = indices
    .filter(i => i >= 0 && i < fileList.length)
    .map(i => fileList[i]);
  
  if (selectedFiles.length > 0) {
    console.log('\nВыбранные файлы:');
    selectedFiles.forEach(file => console.log(`- ${file}`));
    
    console.log('\nЧто сделать с файлами?');
    console.log('1. Показать размеры');
    console.log('2. Скопировать');
    console.log('3. Архивировать');
    console.log('4. Отмена');
    
    const actionChoice = await question('Выберите (1-4): ');
    const action = parseInt(actionChoice);
    
    switch (action) {
      case 1:
        for (const file of selectedFiles) {
          const size = await $`wc -c < ${file}`;
          console.log(`${file}: ${size.stdout.trim()} байт`);
        }
        break;
      case 2:
        await $`mkdir -p ./backup`;
        for (const file of selectedFiles) {
          await $`cp ${file} ./backup/`;
        }
        console.log('Файлы скопированы в ./backup/');
        break;
      case 3:
        await $`tar -czf selected-files.tar.gz ${selectedFiles.join(' ')}`;
        console.log('Архив создан: selected-files.tar.gz');
        break;
      default:
        console.log('Отменено');
    }
  }
}

// await selectFiles(); // Раскомментируйте для тестирования

// Закрываем readline интерфейс
rl.close();
