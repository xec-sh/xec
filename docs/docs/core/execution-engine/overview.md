---
title: Универсальный движок выполнения
sidebar_label: Обзор
description: Архитектура и принципы работы универсального движка выполнения команд Xec
---

# Универсальный движок выполнения

Движок выполнения (`ExecutionEngine`) — это ядро системы Xec, обеспечивающее единообразное выполнение команд в различных окружениях. Он предоставляет универсальный API для работы с локальными процессами, SSH-соединениями, Docker-контейнерами и Kubernetes-подами.

## Основные концепции

### Универсальность выполнения

Движок абстрагирует детали конкретных окружений, позволяя использовать один и тот же код для разных целевых систем:

```typescript
import { $ } from '@xec-sh/core';

// Локальное выполнение
await $`ls -la`;

// SSH выполнение
const remote = $.ssh({ host: 'server.com', username: 'user' });
await remote`ls -la`;

// Docker выполнение
const container = $.docker({ container: 'my-app' });
await container`ls -la`;

// Kubernetes выполнение
const pod = $.k8s().pod('my-pod');
await pod`ls -la`;
```

### Архитектура движка

```
┌─────────────────────────────────────────┐
│           ExecutionEngine               │
├─────────────────────────────────────────┤
│  • Template literal API                 │
│  • Command building & escaping          │
│  • Configuration management             │
│  • Event emission                       │
└──────────────┬──────────────────────────┘
               │
        ┌──────▼──────┐
        │  Adapters   │
        └──────┬──────┘
               │
    ┌──────────┼──────────┬──────────┬──────────┐
    ▼          ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ Local  │ │  SSH   │ │ Docker │ │  K8s   │ │ Remote │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘
```

## Жизненный цикл команды

### 1. Построение команды

Команда формируется через template literal с автоматическим экранированием:

```typescript
const file = "file with spaces.txt";
const dangerous = "'; rm -rf /";

// Безопасное экранирование
await $`cat ${file}`;        // cat "file with spaces.txt"
await $`echo ${dangerous}`;  // echo "'; rm -rf /"
```

### 2. Конфигурация контекста

Команда обогащается контекстом выполнения:

```typescript
// Глобальная конфигурация
const $ = new ExecutionEngine({
  defaultTimeout: 30000,
  defaultCwd: '/app',
  defaultEnv: { NODE_ENV: 'production' }
});

// Локальная конфигурация
await $`npm start`
  .cwd('/projects/app')
  .env({ DEBUG: 'true' })
  .timeout(60000);
```

### 3. Выбор адаптера

Движок автоматически выбирает подходящий адаптер:

```typescript
// Явный выбор через метод
const ssh = $.ssh({ host: 'server' });

// Автоматический выбор через опции
await $.execute({
  command: 'ls',
  adapter: 'docker',
  adapterOptions: { container: 'app' }
});
```

### 4. Выполнение и обработка результата

```typescript
const result = await $`ls -la`;

// Результат содержит:
result.stdout;      // Стандартный вывод
result.stderr;      // Вывод ошибок
result.exitCode;    // Код завершения
result.duration;    // Время выполнения
result.startTime;   // Время начала
result.endTime;     // Время окончания
```

## ProcessPromise API

`ProcessPromise` — это расширенный Promise с дополнительными методами для управления выполнением:

### Управление потоками

```typescript
// Перенаправление вывода
await $`ls -la`
  .stdout(process.stdout)
  .stderr(process.stderr);

// Интерактивный режим
await $`npm init`.interactive();

// Тихий режим (без вывода)
await $`npm install`.quiet();
```

### Обработка ошибок

```typescript
// Не бросать исключение при ошибке
const result = await $`may-fail`.nothrow();
if (result.exitCode !== 0) {
  console.log('Command failed:', result.stderr);
}

// Повтор при ошибке
await $`flaky-command`.retry({
  maxRetries: 3,
  delay: 1000,
  exponentialBackoff: true
});
```

### Управление выполнением

```typescript
// Таймаут
await $`long-running`.timeout(5000);

// Отмена через AbortSignal
const controller = new AbortController();
const promise = $`sleep 100`.signal(controller.signal);
setTimeout(() => controller.abort(), 1000);

// Принудительное завершение
const proc = $`server`;
setTimeout(() => proc.kill(), 5000);
```

### Преобразование результата

```typescript
// Получить текст без пробелов по краям
const text = await $`cat file.txt`.text();

// Парсинг JSON
const data = await $`cat config.json`.json();

// Массив строк
const lines = await $`ls`.lines();

// Buffer
const buffer = await $`cat binary.dat`.buffer();
```

## Конвейеры (Piping)

Движок поддерживает Unix-подобные конвейеры:

```typescript
// Простой конвейер
await $`cat file.txt`.pipe($`grep pattern`).pipe($`wc -l`);

// Конвейер с обработкой
await $`ls -la`.pipe(async (output) => {
  const files = output.split('\n');
  return files.filter(f => f.includes('.txt'));
});

// Конвейер в файл
await $`generate-report`.pipe('report.txt');
```

## Параллельное выполнение

```typescript
// Параллельное выполнение нескольких команд
const results = await $.parallel.all([
  $`test-unit`,
  $`test-integration`,
  $`test-e2e`
]);

// С ограничением параллелизма
await $.batch(commands, {
  concurrency: 5,
  onProgress: (completed, total) => {
    console.log(`Progress: ${completed}/${total}`);
  }
});
```

## События и мониторинг

Движок предоставляет систему событий для мониторинга:

```typescript
const $ = new ExecutionEngine();

$.on('command:start', ({ command, cwd }) => {
  console.log(`Starting: ${command} in ${cwd}`);
});

$.on('command:complete', ({ command, exitCode, duration }) => {
  console.log(`Completed: ${command} (${exitCode}) in ${duration}ms`);
});

$.on('command:error', ({ command, error }) => {
  console.error(`Failed: ${command}`, error);
});
```

## Кэширование результатов

```typescript
// Кэширование результата команды
const data = await $`expensive-operation`.cache({
  ttl: 60000,  // 1 минута
  key: 'operation-result'
});

// Повторный вызов вернёт кэшированный результат
const cached = await $`expensive-operation`.cache({
  key: 'operation-result'
});
```

## Контекстное выполнение

```typescript
// Создание контекста с настройками
const context = $.with({
  cwd: '/app',
  env: { NODE_ENV: 'production' },
  timeout: 30000
});

// Все команды в контексте наследуют настройки
await context`npm install`;
await context`npm build`;
await context`npm test`;

// Вложенные контексты
await $.within(async () => {
  $.cd('/project');
  await $`npm install`;
  await $`npm test`;
});
```

## Шаблоны команд

```typescript
// Создание шаблона
const gitClone = $.template('git clone {{repo}} {{dir}}', {
  defaults: { dir: '.' },
  validate: (params) => {
    if (!params.repo?.startsWith('http')) {
      throw new Error('Invalid repo URL');
    }
  }
});

// Использование шаблона
await gitClone.execute($, {
  repo: 'https://github.com/user/repo.git',
  dir: '/projects/repo'
});
```

## Утилиты и хелперы

### Временные файлы

```typescript
// Создание временного файла
const temp = await $.tempFile({ prefix: 'data-' });
await $`echo "test" > ${temp.path}`;
await temp.cleanup();

// Автоматическая очистка
await $.withTempFile(async (path) => {
  await $`process-data > ${path}`;
  return $`upload ${path}`;
});
```

### Передача файлов

```typescript
// Между адаптерами
await $.transfer.copy(
  '/local/file.txt',
  'remote:/server/file.txt'
);

// С прогрессом
await $.transfer.sync('/source', '/dest', {
  onProgress: (transferred, total) => {
    console.log(`${transferred}/${total} bytes`);
  }
});
```

### Интерактивные промпты

```typescript
// Ввод текста
const name = await $.question('Enter name: ');

// Подтверждение
const proceed = await $.confirm('Continue?');

// Выбор из списка
const option = await $.select('Choose:', {
  choices: ['dev', 'staging', 'prod']
});

// Ввод пароля
const password = await $.password('Password: ');
```

## Обработка ошибок

```typescript
try {
  await $`risky-command`;
} catch (error) {
  if (error.code === 'COMMAND_FAILED') {
    console.log('Exit code:', error.exitCode);
    console.log('Stderr:', error.stderr);
  }
}

// Или через nothrow
const result = await $`risky-command`.nothrow();
if (!result.ok) {
  console.log('Failed with:', result.stderr);
}
```

## Производительность и оптимизации

### Пул соединений

SSH и другие адаптеры автоматически управляют пулом соединений:

```typescript
const ssh = $.ssh({ host: 'server' });

// Использует одно соединение
for (const file of files) {
  await ssh`process ${file}`;
}
```

### Ленивая инициализация

Адаптеры создаются только при первом использовании:

```typescript
// Docker адаптер создастся только здесь
await $.docker({ container: 'app' })`ls`;
```

### Потоковая обработка

```typescript
// Обработка больших выводов
await $`generate-huge-output`
  .stdout(async (chunk) => {
    await processChunk(chunk);
  });
```

## Безопасность

### Автоматическое экранирование

Все значения в template literals автоматически экранируются:

```typescript
const userInput = "'; DROP TABLE users; --";
await $`mysql -e "SELECT * FROM data WHERE name = ${userInput}"`;
// Безопасно! Инъекция невозможна
```

### Маскирование чувствительных данных

```typescript
const $ = new ExecutionEngine({
  sensitiveDataMasking: {
    enabled: true,
    patterns: [/password=\w+/gi],
    replacement: '[REDACTED]'
  }
});

// Пароли будут скрыты в логах
await $`curl -u admin:secret123 https://api.example.com`;
// Вывод: curl -u admin:[REDACTED] https://api.example.com
```

### Безопасная передача паролей

```typescript
import { SecureString } from '@xec-sh/core';

const password = new SecureString('secret123');
await $`mysql -p${password} -e "SHOW DATABASES"`;
// Пароль не попадёт в логи
```

## Интеграция с async/await

Движок полностью совместим с async/await и Promise API:

```typescript
// Promise chaining
$`npm test`
  .then(result => console.log('Tests passed'))
  .catch(error => console.error('Tests failed'));

// Promise.all
const [test, lint, build] = await Promise.all([
  $`npm test`,
  $`npm run lint`,
  $`npm run build`
]);

// Promise.race
const fastest = await Promise.race([
  $`fetch-from-cache`,
  $`fetch-from-api`
]);
```

## Расширяемость

### Регистрация адаптеров

```typescript
import { CustomAdapter } from './custom-adapter';

const $ = new ExecutionEngine();
$.registerAdapter('custom', new CustomAdapter());

await $.with({ adapter: 'custom' })`custom-command`;
```

### Плагины и middleware

```typescript
// Добавление middleware для логирования
$.on('command:start', async (event) => {
  await logger.log('Command started', event);
});

// Модификация результатов
$.on('command:complete', (event) => {
  event.stdout = sanitize(event.stdout);
});
```

## Примеры использования

### CI/CD пайплайн

```typescript
async function deploy(environment: string) {
  const $ = new ExecutionEngine();
  
  // Сборка
  await $`npm ci`;
  await $`npm run build`;
  
  // Тесты
  await $`npm test`.nothrow() || 
    throw new Error('Tests failed');
  
  // Деплой
  const server = $.ssh({
    host: `${environment}.example.com`,
    username: 'deploy'
  });
  
  await server`cd /app && git pull`;
  await server`npm ci --production`;
  await server`pm2 restart app`;
}
```

### Обработка данных

```typescript
async function processLogs() {
  // Получение логов из разных источников
  const [app1, app2, db] = await $.parallel.all([
    $.docker({ container: 'app1' })`tail -n 1000 /logs/app.log`,
    $.docker({ container: 'app2' })`tail -n 1000 /logs/app.log`,
    $.ssh({ host: 'db-server' })`tail -n 1000 /var/log/mysql/error.log`
  ]);
  
  // Обработка и агрегация
  const errors = [...app1.stdout, ...app2.stdout, ...db.stdout]
    .split('\n')
    .filter(line => line.includes('ERROR'));
  
  // Сохранение результата
  await $`echo ${errors.join('\n')} > errors-report.txt`;
}
```

### Мониторинг системы

```typescript
async function monitorSystem() {
  const servers = ['web1', 'web2', 'db1'];
  
  while (true) {
    const metrics = await $.parallel.map(servers, async (server) => {
      const ssh = $.ssh({ host: `${server}.local` });
      
      const cpu = await ssh`top -bn1 | grep "Cpu(s)"`.text();
      const memory = await ssh`free -m | grep "Mem:"`.text();
      const disk = await ssh`df -h | grep "/dev/sda1"`.text();
      
      return { server, cpu, memory, disk };
    });
    
    console.table(metrics);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
```

## Заключение

ExecutionEngine предоставляет мощный и гибкий API для выполнения команд в различных окружениях. Его ключевые преимущества:

- **Универсальность**: единый API для всех окружений
- **Безопасность**: автоматическое экранирование и маскирование данных
- **Производительность**: пулы соединений и кэширование
- **Удобство**: интуитивный API с поддержкой современного JavaScript
- **Расширяемость**: система адаптеров и событий

Движок является основой для построения сложных систем автоматизации, CI/CD пайплайнов и инструментов управления инфраструктурой.