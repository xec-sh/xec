---
sidebar_position: 2
---

# Быстрый старт

Начните работу с Xec за 5 минут! Это руководство проведет вас через ваши первые команды и покажет мощь Xec.

## Ваша первая команда Xec

Начнем с чего-то простого:

```bash
# Выполните команду используя Xec
xec eval 'await $`echo "Hello from Xec!"`'
```

Эта команда демонстрирует синтаксис шаблонных литералов Xec для выполнения shell команд.

## Создание вашего первого скрипта

Создайте файл `hello.js`:

```javascript
#!/usr/bin/env xec

// Импортируйте глобальную функцию $
import { $ } from '@xec-sh/core';

// Выполняйте команды с шаблонными литералами
await $`echo "Starting automation..."`;

// Получите информацию о системе
const hostname = await $`hostname`;
const user = await $`whoami`;
const date = await $`date`;

console.log(`
System Information:
- Hostname: ${hostname.stdout.trim()}
- User: ${user.stdout.trim()}
- Date: ${date.stdout.trim()}
`);

// Проверьте, существует ли команда
const hasDocker = await $`which docker`.nothrow();
if (hasDocker.exitCode === 0) {
  console.log('✓ Docker is installed');
} else {
  console.log('✗ Docker is not installed');
}
```

Запустите ваш скрипт:

```bash
# Сделайте его исполняемым
chmod +x hello.js

# Запустите его
./hello.js

# Или используйте xec напрямую
xec hello.js
```

## Работа с разными средами

### Локальное выполнение

```javascript
// Простое выполнение команды
await $`ls -la`;

// Захват вывода
const files = await $`ls`;
console.log('Files:', files.stdout);

// Изменение директории
const projectDir = await $`pwd`;
console.log('Current directory:', projectDir.stdout.trim());

// Переменные окружения
await $.env({ NODE_ENV: 'production' })`echo $NODE_ENV`;
```

### SSH выполнение

```javascript
// Подключитесь к удаленному серверу
const remote = $.ssh({
  host: 'example.com',
  username: 'user'
});

// Выполняйте команды удаленно
await remote`uname -a`;
await remote`df -h`;
await remote`docker ps`;

// Передавайте файлы
await remote.uploadFile('./local-file.txt', '/tmp/remote-file.txt');
await remote.downloadFile('/etc/hostname', './hostname.txt');
```

### Docker выполнение

```javascript
// Выполните в существующем контейнере
const docker = $.docker({ container: 'my-app' });
await docker`ps aux`;

// Или создайте новый контейнер
const container = await $.docker({ 
  image: 'node:18',
  name: 'test-container'
}).start();

await container.exec`node --version`;
await container.exec`npm --version`;

// Очистка
await container.stop();
await container.remove();
```

### Kubernetes выполнение

```javascript
// Работайте с Kubernetes подами
const k8s = $.k8s({ namespace: 'default' });
const pod = k8s.pod('my-app-pod');

// Выполняйте команды в поде
await pod.exec`hostname`;
await pod.exec`ps aux`;

// Получите логи
const logs = await pod.logs({ tail: 50 });
console.log('Recent logs:', logs);

// Потоковые логи в реальном времени
await pod.follow(line => console.log(line));
```

## Общие паттерны

### Обработка ошибок

```javascript
// Используйте .nothrow() чтобы предотвратить исключения
const result = await $`false`.nothrow();
if (result.exitCode !== 0) {
  console.log('Command failed with exit code:', result.exitCode);
}

// Или используйте try-catch
try {
  await $`exit 1`;
} catch (error) {
  console.log('Command failed:', error.message);
}
```

### Параллельное выполнение

```javascript
// Запускайте команды параллельно
const results = await Promise.all([
  $`sleep 1 && echo "Task 1"`,
  $`sleep 1 && echo "Task 2"`,
  $`sleep 1 && echo "Task 3"`
]);

// Или используйте помощник parallel
import { parallel } from '@xec-sh/core';

await parallel([
  () => $`npm install`,
  () => $`npm run build`,
  () => $`npm test`
], { maxConcurrent: 2 });
```

### Пайпинг и потоки

```javascript
// Пайпинг вывода команд
await $`cat package.json | grep version`;

// Или используйте помощник pipe
import { pipe } from '@xec-sh/core';

await pipe(
  $`cat package.json`,
  $`grep version`,
  $`cut -d'"' -f4`
);

// Потоковый вывод в реальном времени
await $`npm install`.stream();
```

### Работа с файлами

```javascript
// Читайте содержимое файла
const content = await $`cat package.json`;
const pkg = JSON.parse(content.stdout);
console.log('Package name:', pkg.name);

// Записывайте файлы
await $`echo "Hello World" > output.txt`;

// Используйте временные файлы
import { withTempFile } from '@xec-sh/core';

await withTempFile(async (tmpFile) => {
  await $`echo "temporary data" > ${tmpFile}`;
  await $`cat ${tmpFile}`;
  // Файл автоматически очищается
});
```

## Создание простой автоматизации

Давайте создадим скрипт развертывания, который объединяет несколько концепций:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

console.log('🚀 Starting deployment...');

// 1. Запустите тесты локально
console.log('📋 Running tests...');
const tests = await $`npm test`.nothrow();
if (tests.exitCode !== 0) {
  console.error('❌ Tests failed!');
  process.exit(1);
}
console.log('✅ Tests passed!');

// 2. Соберите приложение
console.log('🔨 Building application...');
await $`npm run build`;

// 3. Подключитесь к продакшн серверу
const prod = $.ssh({
  host: 'prod.example.com',
  username: 'deploy'
});

// 4. Разверните в продакшн
console.log('📦 Deploying to production...');
await prod`cd /app && git pull`;
await prod`cd /app && npm install --production`;
await prod`cd /app && npm run migrate`;

// 5. Перезапустите сервисы
console.log('🔄 Restarting services...');
await prod`sudo systemctl restart app.service`;

// 6. Проверка здоровья
console.log('❤️  Running health check...');
const health = await prod`curl -f http://localhost:3000/health`.nothrow();

if (health.exitCode === 0) {
  console.log('✅ Deployment successful!');
} else {
  console.log('❌ Health check failed!');
  // Откат если нужно
  await prod`cd /app && git checkout HEAD~1`;
  await prod`sudo systemctl restart app.service`;
}
```

## Быстрый справочник CLI

### Основные команды

```bash
# Выполните скрипт
xec script.js

# Выполните встроенный код
xec eval 'await $`date`'

# Запустите с определенными флагами Node
xec --node-options="--max-old-space-size=4096" script.js
```

### Работа с рецептами

```bash
# Список доступных рецептов
xec list

# Запустите рецепт
xec run deploy

# Запустите определенный файл рецепта
xec run --file ./recipes/custom-deploy.js
```

### Работа с задачами

```bash
# Список доступных задач
xec task --list

# Запустите задачу
xec task docker:cleanup

# Получите справку по задаче
xec task docker:cleanup --help
```

## Переменные окружения

Xec распознает несколько переменных окружения:

```bash
# Установите оболочку по умолчанию
export XEC_SHELL=/bin/zsh

# Установите таймаут по умолчанию (мс)
export XEC_TIMEOUT=60000

# Включите отладочный вывод
export XEC_DEBUG=true

# Запустите с переменными окружения
XEC_DEBUG=true xec script.js
```

## Создание вашего собственного проекта

Готовы создать свой собственный проект Xec? Инициализируйте новый проект с:

```bash
# Создайте новый проект с примерами
xec init my-project

# Или создайте минимальный проект
xec init my-project --minimal
```

Затем используйте команду `new` для создания шаблонов:

```bash
# Создайте новый скрипт
xec new script deploy

# Создайте новую команду
xec new command backup
```

Узнайте больше о [создании пользовательских команд и скриптов](../projects/cli/custom-commands).

## Следующие шаги

Теперь, когда вы увидели основы, изучите:

1. **[Первый проект](./first-project)** - Создайте полный проект автоматизации
2. **[Пользовательские команды](../projects/cli/custom-commands)** - Создайте свои собственные CLI команды
3. **[Примеры](../projects/core/examples)** - Учитесь на практических примерах
4. **[API справочник](../projects/core/api-reference)** - Изучите все доступные функции

## Советы для успеха

1. **Начните просто**: Начните с базовых локальных команд перед переходом к удаленному выполнению
2. **Используйте TypeScript**: Получите полную типобезопасность и автодополнение
3. **Обрабатывайте ошибки**: Всегда учитывайте, что происходит, когда команды не удаются
4. **Тестируйте локально**: Тестируйте скрипты локально перед запуском в продакшн
5. **Контроль версий**: Храните ваши скрипты автоматизации в Git

## Частые вопросы

**В: Как передать переменные в команды?**
```javascript
const name = "world";
await $`echo "Hello ${name}"`;
```

**В: Как использовать sudo?**
```javascript
// Локально
await $`sudo systemctl restart nginx`;

// Удаленно (с паролем)
const remote = $.ssh({ 
  host: 'server',
  username: 'user',
  password: 'secret'
});
await remote`echo 'secret' | sudo -S systemctl restart nginx`;
```

**В: Как обрабатывать интерактивные подсказки?**
```javascript
// Предоставьте ввод через stdin
await $`npm init`.stdin('my-package\n1.0.0\nMy description\n');
```

Готовы создать что-то удивительное? Поехали! 🚀