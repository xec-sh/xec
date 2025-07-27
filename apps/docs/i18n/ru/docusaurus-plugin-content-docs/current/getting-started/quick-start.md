---
id: quick-start
title: Быстрый старт
sidebar_position: 2
---

# Руководство по быстрому старту

Начните работу с Xec всего за 5 минут! Это руководство проведет вас через установку, базовое использование и вашу первую автоматизацию инфраструктуры.

## Предварительные требования

Перед началом убедитесь, что у вас есть:
- Node.js 18 или выше
- Менеджер пакетов npm или yarn
- Базовые знания TypeScript/JavaScript

## Установка

### Установите CLI глобально

```bash
npm install -g @xec-sh/cli
```

Или используя yarn:

```bash
yarn global add @xec-sh/cli
```

### Проверьте установку

```bash
xec --version
```

## Ваш первый проект Xec

### 1. Инициализируйте новый проект

```bash
mkdir my-infrastructure
cd my-infrastructure
xec init
```

Это создаст базовую структуру проекта:

```
my-infrastructure/
├── xec.config.ts      # Основной файл конфигурации
├── resources/         # Ресурсы инфраструктуры
├── modules/           # Переиспользуемые модули
└── package.json       # Зависимости Node.js
```

### 2. Установите зависимости

```bash
npm install
```

### 3. Создайте ваш первый ресурс

Создайте файл `resources/hello-world.ts`:

```typescript
import { defineResource } from '@xec-sh/core';

export default defineResource({
  name: 'hello-world',
  type: 'shell-script',
  
  properties: {
    script: `
      echo "Привет от Xec!"
      echo "Текущее время: $(date)"
    `,
  },
  
  actions: {
    deploy: async (ctx) => {
      await ctx.execute(ctx.properties.script);
    },
  },
});
```

### 4. Разверните ваш ресурс

```bash
xec run hello-world
```

## Использование универсального выполнения shell

Мощь Xec заключается в его возможностях универсального выполнения shell-команд. Вот как использовать его в различных средах:

### Локальное выполнение

```typescript
import { $ } from '@xec-sh/core';

// Простая команда
await $`echo "Привет, мир!"`;

// С опциями
await $`npm install`.cwd('/path/to/project');
```

### Выполнение через SSH

```typescript
const $remote = $.ssh({
  host: 'example.com',
  username: 'user',
  privateKey: '/path/to/key',
});

await $remote`ls -la`;
await $remote`docker ps`;
```

### Выполнение в Docker

```typescript
const $docker = $.docker('my-container');

await $docker`python --version`;
await $docker`pip install -r requirements.txt`;
```

## Базовая конфигурация

Создайте или обновите `xec.config.ts`:

```typescript
import { defineConfig } from '@xec-sh/core';

export default defineConfig({
  // Метаданные проекта
  project: {
    name: 'my-infrastructure',
    version: '1.0.0',
  },
  
  // Конфигурации окружений
  environments: {
    dev: {
      variables: {
        NODE_ENV: 'development',
        API_URL: 'http://localhost:3000',
      },
    },
    prod: {
      variables: {
        NODE_ENV: 'production',
        API_URL: 'https://api.example.com',
      },
    },
  },
  
  // Конфигурации провайдеров
  providers: {
    aws: {
      region: 'us-east-1',
      profile: 'default',
    },
  },
});
```

## Основные команды

### Управление ресурсами

```bash
# Список всех ресурсов
xec list

# Показать детали ресурса
xec show <имя-ресурса>

# Выполнить конкретный рецепт
xec run <имя-рецепта>

# Развернуть с паттернами развертывания
xec deploy <имя-рецепта>

# Удалить ресурсы
xec destroy <имя-ресурса>
```

### Управление окружениями

```bash
# Установить активное окружение
xec env set prod

# Показать текущее окружение
xec env show

# Список всех окружений
xec env list
```

### Управление модулями

```bash
# Установить модуль
xec module install @xec-sh/aws-vpc

# Список установленных модулей
xec module list

# Обновить модули
xec module update
```

## Следующие шаги

Поздравляем! Вы только что:
- ✅ Установили Xec CLI
- ✅ Создали свой первый проект
- ✅ Развернули ресурс
- ✅ Изучили основные команды

### Что дальше?

1. **Изучите примеры**: Посмотрите наш [репозиторий примеров](https://github.com/xec-js/examples)
2. **Узнайте о ресурсах**: Глубокое погружение в управление ресурсами
3. **Освойте USH**: Изучите продвинутые паттерны выполнения shell

## Устранение неполадок

### Частые проблемы

**Команда не найдена: xec**
- Убедитесь, что глобальная директория npm/yarn bin находится в вашем PATH
- Попробуйте запустить с npx: `npx @xec-sh/cli`

**Ошибки отказа в доступе**
- Проверьте права доступа к файлам
- Для SSH убедитесь, что ваш ключ имеет правильные права: `chmod 600 ~/.ssh/id_rsa`

**Таймауты подключения**
- Проверьте сетевое подключение
- Проверьте правила файрвола
- Для SSH сначала проверьте подключение вручную

### Получение помощи

- Ознакомьтесь с нашим руководством по устранению неполадок
- Поищите в [GitHub issues](https://github.com/xec-sh/xec/issues)
- Спросите на [Stack Overflow](https://stackoverflow.com/questions/tagged/xec)