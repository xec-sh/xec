---
id: advanced-patterns
title: Продвинутые паттерны
sidebar_position: 2
---

# Продвинутые паттерны Ush

Это руководство охватывает продвинутые паттерны использования универсального движка выполнения Ush.

## Обзор

Ush предоставляет мощные возможности для выполнения команд в различных средах. Здесь мы рассмотрим продвинутые паттерны использования.

## Цепочки команд

### Последовательное выполнение

```typescript
import { $ } from '@xec-sh/core';

const result = await $`
  echo "Шаг 1" &&
  echo "Шаг 2" &&
  echo "Шаг 3"
`;
```

### Параллельное выполнение

```typescript
const [result1, result2, result3] = await Promise.all([
  $`команда1`,
  $`команда2`,
  $`команда3`
]);
```

## Работа с потоками

### Пайпы

```typescript
const result = await $`cat file.txt`
  .pipe($`grep pattern`)
  .pipe($`sort`)
  .pipe($`uniq`);
```

### Перенаправление

```typescript
await $`echo "данные" > output.txt`;
await $`команда < input.txt > output.txt 2>&1`;
```

## Обработка ошибок

```typescript
try {
  await $`команда-которая-может-упасть`;
} catch (error) {
  console.error('Ошибка выполнения:', error.message);
}
```

## SSH паттерны

```typescript
const $remote = $.ssh({
  host: 'server.example.com',
  username: 'user',
  privateKey: 'путь/к/ключу'
});

await $remote`команда на удалённом сервере`;
```

## Дополнительная информация

Для более подробной информации смотрите основную документацию Ush.