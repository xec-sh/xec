---
title: LocalAdapter
sidebar_label: Локальный адаптер
description: Выполнение команд в локальной системе через child_process
---

# LocalAdapter - Локальное выполнение

LocalAdapter обеспечивает выполнение команд в локальной системе через Node.js child_process API. Это базовый и наиболее производительный адаптер.

## Основные возможности

- ✅ Прямое выполнение через spawn/spawnSync
- ✅ Поддержка Bun runtime
- ✅ Синхронное и асинхронное выполнение
- ✅ Потоковая обработка вывода
- ✅ Полный контроль над процессами
- ✅ Минимальные накладные расходы

## Использование

### Базовое выполнение

```typescript
import { $ } from '@xec-sh/core';

// По умолчанию используется LocalAdapter
await $`ls -la`;

// Явное указание
const local = $.local();
await local`pwd`;
```

### Конфигурация

```typescript
const $ = new ExecutionEngine({
  adapters: {
    local: {
      preferBun: true,          // Предпочитать Bun runtime
      uid: 1000,                // Unix user ID
      gid: 1000,                // Unix group ID
      killSignal: 'SIGTERM',    // Сигнал для завершения
      defaultShell: '/bin/bash' // Shell по умолчанию
    }
  }
});
```

## Режимы выполнения

### Shell режим

```typescript
// Автоматический shell (true)
await $`echo $HOME && ls *.txt`;

// Конкретный shell
await $`echo $0`.shell('/bin/zsh');

// Без shell (false) - безопаснее
await $`ls`.shell(false);
```

### Синхронное выполнение

```typescript
import { ExecutionEngine } from '@xec-sh/core';

const $ = new ExecutionEngine();
const adapter = $.getAdapter('local');

// Синхронное выполнение (блокирует event loop)
const result = adapter.executeSync({
  command: 'ls',
  args: ['-la'],
  shell: false
});

console.log(result.stdout);
```

## Управление процессами

### Сигналы и завершение

```typescript
// Graceful shutdown с таймаутом
const server = $`node server.js`;

setTimeout(() => {
  server.kill('SIGTERM');  // Мягкое завершение
  
  setTimeout(() => {
    server.kill('SIGKILL'); // Принудительное
  }, 5000);
}, 30000);

await server;
```

### AbortController

```typescript
const controller = new AbortController();

const longTask = $`sleep 100`.signal(controller.signal);

// Отмена через 5 секунд
setTimeout(() => controller.abort(), 5000);

try {
  await longTask;
} catch (error) {
  console.log('Task aborted');
}
```

## Работа с потоками

### Stdin

```typescript
// Строка
await $`cat`.stdin('Hello, World!');

// Buffer
const data = Buffer.from('binary data');
await $`process`.stdin(data);

// Stream
import { createReadStream } from 'fs';
const stream = createReadStream('input.txt');
await $`sort`.stdin(stream);
```

### Stdout/Stderr

```typescript
// Перенаправление в файл
import { createWriteStream } from 'fs';
const output = createWriteStream('output.txt');
await $`ls -la`.stdout(output);

// Inherit - вывод в консоль
await $`npm install`.stdout('inherit').stderr('inherit');

// Ignore - игнорировать вывод
await $`noisy-command`.stdout('ignore');

// Pipe - по умолчанию, собирает вывод
const result = await $`echo test`.stdout('pipe');
console.log(result.stdout); // 'test\n'
```

## Окружение и контекст

### Рабочая директория

```typescript
// Изменение директории
await $`pwd`.cwd('/tmp');  // Выведет: /tmp

// Цепочка с cd
const project = $.cd('/projects/my-app');
await project`npm install`;
await project`npm test`;
```

### Переменные окружения

```typescript
// Добавление переменных
await $`node app.js`.env({
  NODE_ENV: 'production',
  PORT: '3000'
});

// Слияние с существующими
const withEnv = $.env({ API_KEY: 'secret' });
await withEnv`curl $API_URL`;

// Очистка окружения
await $`printenv`.env({});  // Пустое окружение
```

## Обработка ошибок

### Exit коды

```typescript
// По умолчанию бросает исключение при exitCode !== 0
try {
  await $`exit 1`;
} catch (error) {
  console.log('Exit code:', error.exitCode);  // 1
  console.log('Stderr:', error.stderr);
}

// Отключение исключений
const result = await $`exit 1`.nothrow();
if (result.exitCode !== 0) {
  console.log('Command failed');
}
```

### Таймауты

```typescript
// Таймаут выполнения
try {
  await $`sleep 100`.timeout(1000);  // 1 секунда
} catch (error) {
  console.log('Command timed out');
}

// С custom сигналом
await $`server`.timeout(5000, 'SIGINT');
```

## Интерактивный режим

```typescript
// Полностью интерактивный
await $`npm init`.interactive();

// Частично интерактивный
await $`ssh user@host`
  .stdin(process.stdin)
  .stdout('inherit')
  .stderr('inherit');
```

## Bun runtime поддержка

```typescript
const $ = new ExecutionEngine({
  adapters: {
    local: {
      preferBun: true,  // Использовать Bun если доступен
      forceImplementation: 'bun' // Принудительно Bun
    }
  }
});

// Автоопределение
if (RuntimeDetector.isBun()) {
  console.log('Running with Bun!');
}
```

## Производительность

### Сравнение режимов

| Режим | Скорость | Безопасность | Использование |
|-------|----------|--------------|---------------|
| shell: false | Быстро | Высокая | Простые команды |
| shell: true | Средне | Средняя | Сложные пайплайны |
| shell: '/bin/sh' | Быстро | Средняя | POSIX совместимость |
| sync | Очень быстро | Высокая | Скрипты, CLI |

### Оптимизации

```typescript
// Переиспользование процессов
const node = $`node`.interactive();
for (const script of scripts) {
  await node.stdin.write(`require('${script}')\n`);
}

// Batch обработка
const files = ['file1', 'file2', 'file3'];
await $`process ${files}`;  // Один процесс

// Вместо:
for (const file of files) {
  await $`process ${file}`;  // N процессов
}
```

## Специфичные для платформы команды

```typescript
import { platform } from 'os';

// Кроссплатформенные команды
const isWindows = platform() === 'win32';
const listCmd = isWindows ? 'dir' : 'ls -la';
await $`${listCmd}`;

// Или через shell
if (isWindows) {
  await $`dir`.shell('cmd.exe');
} else {
  await $`ls -la`.shell('/bin/bash');
}
```

## Отладка

### Логирование команд

```typescript
const $ = new ExecutionEngine();

$.on('command:start', ({ command, cwd }) => {
  console.log(`[LOCAL] Executing: ${command} in ${cwd}`);
});

$.on('command:complete', ({ exitCode, duration }) => {
  console.log(`[LOCAL] Completed: exit=${exitCode}, time=${duration}ms`);
});
```

### Детальный вывод

```typescript
// Verbose mode
const verbose = $.with({
  stdout: 'inherit',
  stderr: 'inherit'
});

await verbose`npm install`;  // Вывод в реальном времени
```

## Безопасность

### Предотвращение инъекций

```typescript
// Опасно - shell injection
const userInput = "'; rm -rf /";
await $.raw`echo ${userInput}`;  // НЕ ДЕЛАЙТЕ ТАК!

// Безопасно - автоматическое экранирование
await $`echo ${userInput}`;  // Выведет: '; rm -rf /

// Ещё безопаснее - без shell
await $.local().execute({
  command: 'echo',
  args: [userInput],
  shell: false
});
```

### Ограничение ресурсов

```typescript
// Ограничение размера вывода
const $ = new ExecutionEngine({
  maxBuffer: 1024 * 1024  // 1MB максимум
});

// Ограничение времени выполнения
await $`untrusted-script`
  .timeout(5000)  // 5 секунд максимум
  .nothrow();     // Не падать при ошибке
```

## Примеры использования

### Git операции

```typescript
async function gitStatus() {
  const status = await $`git status --porcelain`.text();
  if (status) {
    const files = status.split('\n').filter(Boolean);
    console.log(`Changed files: ${files.length}`);
    
    for (const file of files) {
      const [status, path] = file.split(/\s+/);
      console.log(`  ${status}: ${path}`);
    }
  }
}
```

### Системный мониторинг

```typescript
async function systemInfo() {
  const [cpu, memory, disk] = await Promise.all([
    $`top -bn1 | head -5`.text(),
    $`free -h`.text(),
    $`df -h`.text()
  ]);
  
  return { cpu, memory, disk };
}
```

### Build pipeline

```typescript
async function build() {
  // Очистка
  await $`rm -rf dist`;
  
  // Установка зависимостей
  await $`npm ci`.stdout('inherit');
  
  // Линтинг
  const lintResult = await $`npm run lint`.nothrow();
  if (lintResult.exitCode !== 0) {
    console.warn('Lint warnings:', lintResult.stderr);
  }
  
  // Сборка
  await $`npm run build`;
  
  // Тесты
  await $`npm test`;
}
```

## Troubleshooting

### Проблемы с PATH

```typescript
// Явное указание пути
await $`/usr/local/bin/node script.js`;

// Или через env
await $`node script.js`.env({
  PATH: '/usr/local/bin:/usr/bin:/bin'
});
```

### Проблемы с кодировкой

```typescript
// Указание кодировки
const $ = new ExecutionEngine({
  encoding: 'latin1'  // или 'utf16le', 'base64', etc.
});

// Или для конкретной команды
const result = await $.execute({
  command: 'cat file.txt',
  encoding: 'utf8'
});
```

### Zombie процессы

```typescript
// Всегда очищайте ресурсы
const engine = new ExecutionEngine();

try {
  await engine`long-running-task`;
} finally {
  await engine.dispose();  // Очистка всех процессов
}
```

## Заключение

LocalAdapter - это основа для быстрого и безопасного выполнения команд в локальной системе. Его преимущества:

- **Производительность**: минимальные накладные расходы
- **Гибкость**: полный контроль над процессами
- **Безопасность**: автоматическое экранирование
- **Совместимость**: работает везде, где есть Node.js
- **Простота**: интуитивный API