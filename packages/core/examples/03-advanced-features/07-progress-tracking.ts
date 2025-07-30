/**
 * 07. Progress Tracking - Отслеживание прогресса
 * 
 * Показывает различные способы отображения прогресса выполнения команд.
 * 
 * ВАЖНО: В @xec-sh/core нет встроенных утилит для прогресс-баров.
 * Для отображения прогресса используются стандартные методы Node.js
 * и вывод информации в консоль.
 */

import { $ } from '@xec-sh/core';

// 1. Простой текстовый прогресс
console.log('Начинаем загрузку файлов...');

for (let i = 1; i <= 10; i++) {
  await $`sleep 0.2`;
  // Используем \r для перезаписи строки
  process.stdout.write(`\rЗагрузка: ${i}/10 файлов`);
}
console.log('\nЗагрузка завершена!');

// 2. Прогресс с процентами
console.log('\nОбработка данных...');

for (let i = 0; i <= 100; i += 5) {
  await $`sleep 0.1`;
  const percentage = i;
  const filled = Math.floor(i / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  process.stdout.write(`\rОбработка [${bar}] ${percentage}%`);
}
console.log('\nОбработка завершена!');

// 3. Отслеживание нескольких задач
console.log('\nВыполнение параллельных задач:');

const taskStatus = {
  download: 0,
  process: 0,
  upload: 0
};

// Функция для обновления статуса
const updateStatus = () => {
  process.stdout.write('\r' + 
    `Download: ${taskStatus.download}% | ` +
    `Process: ${taskStatus.process}% | ` +
    `Upload: ${taskStatus.upload}%`
  );
};

// Симуляция параллельных задач
const tasks = [
  async () => {
    for (let i = 0; i <= 100; i += 10) {
      await $`sleep 0.1`;
      taskStatus.download = i;
      updateStatus();
    }
  },
  async () => {
    for (let i = 0; i <= 100; i += 5) {
      await $`sleep 0.15`;
      taskStatus.process = i;
      updateStatus();
    }
  },
  async () => {
    for (let i = 0; i <= 100; i += 20) {
      await $`sleep 0.08`;
      taskStatus.upload = i;
      updateStatus();
    }
  }
];

await Promise.all(tasks.map(task => task()));
console.log('\nВсе задачи завершены!');

// 4. Анимация ожидания для неопределённых задач
console.log('\nПодключение к серверу...');

const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;

const spinnerInterval = setInterval(() => {
  process.stdout.write(`\r${spinnerChars[spinnerIndex]} Подключение к серверу...`);
  spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
}, 100);

await $`sleep 2`;
clearInterval(spinnerInterval);
process.stdout.write('\r✓ Подключено успешно!      \n');

// 5. Прогресс при обработке файлов
console.log('\nКопирование файлов:');

const files = await $`find . -type f -name "*.ts" | head -20`;
const fileList = files.stdout.trim().split('\n').filter(Boolean);

const totalFiles = fileList.length;
console.log(`Найдено файлов: ${totalFiles}`);

for (let i = 0; i < fileList.length; i++) {
  await $`sleep 0.1`; // Симуляция копирования
  const progress = i + 1;
  const percentage = Math.round((progress / totalFiles) * 100);
  process.stdout.write(`\rКопирование: ${progress}/${totalFiles} файлов (${percentage}%)`);
}
console.log('\nКопирование завершено!');

// 6. Прогресс с детальной информацией
class DetailedProgress {
  private startTime: number;
  private processed = 0;
  private errors = 0;
  
  constructor(private total: number) {
    this.startTime = Date.now();
  }
  
  update(success: boolean) {
    this.processed++;
    if (!success) this.errors++;
    
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = this.processed / elapsed;
    const eta = (this.total - this.processed) / rate;
    
    process.stdout.write(
      `\rОбработано: ${this.processed}/${this.total} | ` +
      `Ошибок: ${this.errors} | ` +
      `Скорость: ${rate.toFixed(1)}/сек | ` +
      `Осталось: ${eta.toFixed(0)}с`
    );
  }
  
  finish() {
    const totalTime = (Date.now() - this.startTime) / 1000;
    console.log(
      `\nЗавершено! Обработано: ${this.processed}, ` +
      `Ошибок: ${this.errors}, Время: ${totalTime.toFixed(1)}с`
    );
  }
}

console.log('\nТестирование с детальным прогрессом:');
const detailed = new DetailedProgress(20);

for (let i = 0; i < 20; i++) {
  const success = Math.random() > 0.1; // 90% успех
  const result = await $`test ${success ? '1' : '0'} -eq 1`.nothrow();
  detailed.update(result.ok);
}

detailed.finish();

// 7. Прогресс в реальном времени из вывода команды
console.log('\nЗагрузка файла с отслеживанием прогресса:');

// Создаём ProcessPromise для команды загрузки
const download = $`curl -L https://example.com/large-file.zip -o /tmp/file.zip --progress-bar 2>&1`;

// Функция для отображения прогресса
let lastProgress = 0;
const showDownloadProgress = (data: string) => {
  const match = data.match(/(\d+)\s*%/);
  if (match) {
    const currentProgress = parseInt(match[1]);
    if (currentProgress > lastProgress) {
      lastProgress = currentProgress;
      const filled = Math.floor(currentProgress / 5);
      const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
      process.stdout.write(`\rЗагрузка [${bar}] ${currentProgress}%`);
    }
  }
};

// Обработка вывода в реальном времени (если curl установлен)
try {
  // Для curl нужно перенаправить stderr в stdout для получения прогресса
  const result = await download;
  if (result.stdout.includes('%')) {
    // Обработка прогресса из вывода
    const lines = result.stdout.split('\n');
    for (const line of lines) {
      showDownloadProgress(line);
    }
  }
  console.log('\nЗагрузка завершена');
} catch (error) {
  console.error('\nОшибка загрузки (возможно, curl не установлен)');
}

// 8. Прогресс с этапами
console.log('\nРазвёртывание приложения по этапам:');

const stages = [
  { name: 'Инициализация', weight: 10 },
  { name: 'Установка зависимостей', weight: 30 },
  { name: 'Сборка', weight: 40 },
  { name: 'Тестирование', weight: 15 },
  { name: 'Развёртывание', weight: 5 }
];

const totalWeight = stages.reduce((sum, stage) => sum + stage.weight, 0);
let completedWeight = 0;

// Функция для отображения общего прогресса
const showStageProgress = (currentWeight: number) => {
  const percentage = Math.round((currentWeight / totalWeight) * 100);
  const filled = Math.round((currentWeight / totalWeight) * 30);
  const bar = '█'.repeat(filled) + '░'.repeat(30 - filled);
  process.stdout.write(`\rРазвёртывание [${bar}] ${percentage}%`);
};

for (const stage of stages) {
  console.log(`\n\nЭтап: ${stage.name}`);
  
  // Симуляция работы этапа
  for (let i = 0; i < stage.weight; i++) {
    await $`sleep 0.05`;
    showStageProgress(completedWeight + i + 1);
  }
  
  completedWeight += stage.weight;
  console.log(`\n✓ ${stage.name} завершён`);
}

console.log('\n\nРазвёртывание завершено!');

// 9. Проверка системы с индикаторами
const systemChecks = [
  { name: 'Проверка доступности API', cmd: $`curl -s -o /dev/null -w "%{http_code}" https://api.example.com/health || echo "000"` },
  { name: 'Проверка базы данных', cmd: $`echo "SELECT 1"` },
  { name: 'Проверка кэша', cmd: $`echo "PING"` },
  { name: 'Проверка файловой системы', cmd: $`df -h | grep -v "100%" | head -1` }
];

console.log('\nПроверка системы:\n');

for (const check of systemChecks) {
  process.stdout.write(`⠋ ${check.name}...`);
  
  try {
    const result = await check.cmd.nothrow();
    if (result.ok) {
      process.stdout.write(`\r✓ ${check.name}                    \n`);
    } else {
      process.stdout.write(`\r✗ ${check.name}                    \n`);
    }
  } catch (error) {
    process.stdout.write(`\r✗ ${check.name} (ошибка)          \n`);
  }
}

// 10. Прогресс с логированием и временными метками
console.log('\nОбработка данных с логированием:');

const logProgress = (message: string, progress: number, total: number) => {
  const percentage = Math.round((progress / total) * 100);
  const filled = Math.round((progress / total) * 20);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  
  console.log(`[${new Date().toISOString()}] ${message}: [${bar}] ${percentage}%`);
};

const items = Array.from({ length: 10 }, (_, i) => `item-${i}`);

for (let i = 0; i < items.length; i++) {
  await $`sleep 0.2`;
  logProgress('Обработка данных', i + 1, items.length);
}

// 11. Простой интерактивный прогресс
console.log('\nПример интерактивного прогресса:');

// Имитация запроса подтверждения
console.log('Начать длительную операцию? (y/n)');

// Для демонстрации автоматически "соглашаемся"
const userConfirm = 'y'; // В реальном приложении нужно читать ввод пользователя

if (userConfirm === 'y') {
  console.log('Выполнение операции...');
  
  // Прогресс с временем выполнения
  const startTime = Date.now();
  
  for (let i = 0; i <= 100; i++) {
    await $`sleep 0.03`;
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const percentage = i;
    const filled = Math.floor(i / 3.33);
    const bar = '█'.repeat(filled) + '░'.repeat(30 - filled);
    
    process.stdout.write(`\r[${bar}] ${percentage}% | ${elapsed}s`);
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nОперация завершена за ${totalTime}s!`);
} else {
  console.log('Операция отменена');
}
