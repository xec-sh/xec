---
title: Template Literals API
sidebar_label: Template Literals
description: Безопасное построение команд через template literals с автоматическим экранированием
---

# Template Literals API

Template literals — это основной способ построения команд в Xec. Этот API обеспечивает безопасное внедрение переменных в команды с автоматическим экранированием, предотвращая инъекции и ошибки.

## Основы использования

### Простое выполнение команд

```typescript
import { $ } from '@xec-sh/core';

// Простая команда
await $`ls -la`;

// С переменными
const dir = '/home/user';
await $`ls -la ${dir}`;

// Многострочные команды
await $`
  echo "Starting process..."
  npm install
  npm build
  echo "Process completed"
`;
```

### Автоматическое экранирование

Все значения, подставляемые через `${}`, автоматически экранируются:

```typescript
// Файлы с пробелами
const file = "my document.txt";
await $`cat ${file}`;
// Выполнится: cat "my document.txt"

// Специальные символы
const dangerous = "'; rm -rf /; echo '";
await $`echo ${dangerous}`;
// Выполнится: echo "'; rm -rf /; echo '"
// Вывод: '; rm -rf /; echo '

// Попытка инъекции команд
const userInput = "$(malicious command)";
await $`echo ${userInput}`;
// Безопасно! Выведет: $(malicious command)
```

## Типы данных и их обработка

### Строки

Строки экранируются с учетом контекста:

```typescript
const text = "Hello, World!";
await $`echo ${text}`;  // echo "Hello, World!"

const path = "/path/with spaces/file.txt";
await $`cat ${path}`;  // cat "/path/with spaces/file.txt"

const quote = 'He said "Hello"';
await $`echo ${quote}`;  // echo "He said \"Hello\""
```

### Числа и булевы значения

```typescript
const port = 3000;
const count = 42;
const enabled = true;

await $`node server.js --port ${port}`;  // --port 3000
await $`head -n ${count} file.txt`;       // head -n 42
await $`./script.sh --verbose ${enabled}`; // --verbose true
```

### Массивы

Массивы разворачиваются в отдельные аргументы:

```typescript
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
await $`rm ${files}`;
// Выполнится: rm file1.txt file2.txt file3.txt

const flags = ['-v', '--recursive', '--force'];
await $`command ${flags} target`;
// Выполнится: command -v --recursive --force target

// Пустой массив игнорируется
const empty: string[] = [];
await $`ls ${empty} -la`;  // ls -la
```

### Объекты

Объекты преобразуются в JSON:

```typescript
const config = { 
  name: 'app',
  version: '1.0.0',
  port: 3000 
};

await $`echo ${config}`;
// Выполнится: echo '{"name":"app","version":"1.0.0","port":3000}'

// Использование в конфигурационных файлах
await $`echo ${config} > config.json`;
```

### null и undefined

```typescript
const nullValue = null;
const undefinedValue = undefined;

await $`echo "Value: ${nullValue}"`;      // echo "Value: "
await $`echo "Value: ${undefinedValue}"`; // echo "Value: "

// Полезно для опциональных параметров
const optionalFlag = condition ? '--verbose' : undefined;
await $`command ${optionalFlag} file.txt`;
// Если condition false: command file.txt
// Если condition true: command --verbose file.txt
```

### Promises и async значения

Template literals автоматически ожидают разрешения промисов:

```typescript
// Функция возвращает Promise
async function getVersion() {
  return '1.2.3';
}

// Promise автоматически разрешается
await $`npm publish --tag ${getVersion()}`;
// Выполнится: npm publish --tag 1.2.3

// Цепочка промисов
const data = fetch('/api/config').then(r => r.json());
await $`deploy --config ${data}`;

// Параллельное разрешение
const [user, host] = [
  Promise.resolve('admin'),
  Promise.resolve('server.com')
];
await $`ssh ${user}@${host}`;
```

## Raw mode - без экранирования

Для случаев, когда нужно отключить экранирование:

```typescript
import { ExecutionEngine } from '@xec-sh/core';

const $ = new ExecutionEngine();

// Обычный режим - с экранированием
const pattern = '*.txt';
await $`ls ${pattern}`;  // ls "*.txt" (ищет файл с именем *.txt)

// Raw режим - без экранирования
await $.raw`ls ${pattern}`;  // ls *.txt (работает как glob)

// Полезно для:
// - Glob паттернов
const files = '*.{js,ts}';
await $.raw`rm ${files}`;

// - Перенаправлений
const output = '> output.txt';
await $.raw`echo "test" ${output}`;

// - Пайпов
const pipe = '| grep error';
await $.raw`cat log.txt ${pipe}`;
```

⚠️ **Внимание**: Используйте raw mode только с доверенными данными!

## Сложные примеры

### Динамическое построение команд

```typescript
// Условные флаги
const verbose = process.env.DEBUG === 'true';
const dryRun = process.env.DRY_RUN === 'true';

const flags = [
  verbose && '--verbose',
  dryRun && '--dry-run',
  '--color'
].filter(Boolean);

await $`npm publish ${flags}`;
```

### Шаблонизация команд

```typescript
// Создание переиспользуемого шаблона
function gitCommit(message: string, files: string[] = []) {
  return $`git add ${files.length ? files : '.'} && git commit -m ${message}`;
}

await gitCommit('Initial commit');
await gitCommit('Add features', ['src/feature.ts', 'tests/feature.test.ts']);
```

### Работа с путями

```typescript
import * as path from 'path';

const baseDir = '/projects';
const projectName = 'my-app';
const fileName = 'config.json';

// Безопасное построение путей
const fullPath = path.join(baseDir, projectName, fileName);
await $`cat ${fullPath}`;

// Множественные пути
const dirs = ['src', 'tests', 'docs'].map(d => path.join(baseDir, d));
await $`ls -la ${dirs}`;
```

### Работа с окружением

```typescript
// Переменные окружения в командах
const env = {
  NODE_ENV: 'production',
  PORT: '3000',
  API_KEY: 'secret-key'
};

// Передача через env
await $`node app.js`.env(env);

// Или inline
const port = 3000;
const host = 'localhost';
await $`NODE_ENV=production npm start -- --port ${port} --host ${host}`;
```

## Специальные символы и их обработка

### Кавычки

```typescript
// Одинарные кавычки
const single = "It's a test";
await $`echo ${single}`;  // echo "It's a test"

// Двойные кавычки
const double = 'Say "Hello"';
await $`echo ${double}`;  // echo "Say \"Hello\""

// Смешанные
const mixed = `It's "complex"`;
await $`echo ${mixed}`;  // echo "It's \"complex\""
```

### Символы shell

```typescript
// Специальные символы экранируются
const special = '$HOME && ls || rm -rf /';
await $`echo ${special}`;
// Вывод: $HOME && ls || rm -rf /

// Обратные кавычки
const backticks = '`command`';
await $`echo ${backticks}`;  // echo "\`command\`"

// Переменные shell
const shellVar = '${PATH}';
await $`echo ${shellVar}`;  // echo "\${PATH}"
```

### Unicode и эмодзи

```typescript
// Unicode поддерживается
const unicode = 'Привет, мир! 你好世界';
await $`echo ${unicode}`;

// Эмодзи работают
const emoji = '🚀 Deploying...';
await $`echo ${emoji}`;

// Специальные символы
const special = '→ ← ↑ ↓ • × ÷';
await $`echo ${special}`;
```

## Интерполяция функций

```typescript
// Функции вызываются автоматически
function getTimestamp() {
  return new Date().toISOString();
}

await $`echo "Deployed at: ${getTimestamp()}"`;

// Async функции
async function getGitHash() {
  const result = await $`git rev-parse HEAD`;
  return result.stdout.trim();
}

await $`docker build -t app:${getGitHash()} .`;

// Методы объектов
const config = {
  getConnectionString() {
    return 'postgresql://localhost/db';
  }
};

await $`psql ${config.getConnectionString()}`;
```

## Вложенные template literals

```typescript
// Команды могут быть вложенными
const branch = await $`git branch --show-current`.text();
await $`git push origin ${branch}`;

// Или в одну строку
await $`git push origin ${await $`git branch --show-current`.text()}`;

// Сложные композиции
const files = await $`find . -name "*.js"`.lines();
await $`eslint ${files}`;
```

## Многострочные команды

```typescript
// Shell скрипты
await $`
  set -e
  echo "Starting deployment..."
  
  # Обновление кода
  git pull origin main
  
  # Установка зависимостей
  npm ci
  
  # Сборка
  npm run build
  
  # Перезапуск
  pm2 restart app
  
  echo "Deployment completed!"
`;

// С переменными
const appName = 'my-app';
const environment = 'production';

await $`
  echo "Deploying ${appName} to ${environment}"
  cd /apps/${appName}
  git checkout ${environment}
  npm run deploy:${environment}
`;
```

## Обработка ошибок в template literals

```typescript
// Неправильное использование
try {
  const result = $`command`;  // Забыли await!
  // result - это ProcessPromise, не результат
} catch (e) {
  // Этот блок не выполнится
}

// Правильное использование
try {
  const result = await $`command`;
  console.log(result.stdout);
} catch (error) {
  console.error('Command failed:', error.stderr);
}

// С nothrow
const result = await $`may-fail`.nothrow();
if (result.exitCode !== 0) {
  console.log('Failed but continued');
}
```

## Производительность и оптимизации

### Переиспользование строк

```typescript
// Неэффективно - создаёт новую строку каждый раз
for (const file of files) {
  await $`process ${file}`;
}

// Эффективнее - batch обработка
await $`process ${files}`;

// Или параллельно
await $.parallel.map(files, file => $`process ${file}`);
```

### Кэширование результатов

```typescript
// Кэширование дорогих операций
const getData = () => $`expensive-operation`.cache({ ttl: 60000 });

// Первый вызов выполнит команду
const data1 = await getData();

// Второй вызов вернёт кэш
const data2 = await getData();
```

## Отладка template literals

```typescript
// Просмотр итоговой команды
const file = "test file.txt";
const cmd = $`cat ${file}`;

// Не выполняя, можно увидеть команду
console.log(cmd.toString());  // ProcessPromise не имеет toString

// Для отладки используйте dry-run
const $ = new ExecutionEngine();
$.on('command:start', ({ command }) => {
  console.log('Executing:', command);
});

await $`cat ${file}`;
// Выведет: Executing: cat "test file.txt"
```

## Best Practices

### ✅ Хорошие практики

```typescript
// Используйте переменные для читаемости
const sourceDir = '/source';
const destDir = '/dest';
await $`rsync -av ${sourceDir}/ ${destDir}/`;

// Разбивайте сложные команды
const files = await $`find . -type f -name "*.ts"`.lines();
const filtered = files.filter(f => !f.includes('node_modules'));
await $`prettier --write ${filtered}`;

// Используйте деструктуризацию
const { stdout: version } = await $`node --version`;
```

### ❌ Избегайте

```typescript
// Не используйте конкатенацию строк
const bad = 'ls ' + userInput;  // Опасно!
await $`${bad}`;

// Не забывайте await
const result = $`command`;  // Это Promise, не результат!

// Не используйте raw без необходимости
await $.raw`rm ${userInput}`;  // Опасно!

// Не передавайте непроверенные данные
await $`mysql -p${userPassword}`;  // Пароль в логах!
```

## Заключение

Template literals API в Xec обеспечивает:

- **Безопасность**: автоматическое экранирование предотвращает инъекции
- **Удобство**: естественный синтаксис JavaScript
- **Гибкость**: поддержка всех типов данных JavaScript
- **Асинхронность**: автоматическая обработка промисов
- **Читаемость**: код выглядит как обычные shell команды

Этот API является основой для безопасного и удобного выполнения команд во всех окружениях, поддерживаемых Xec.