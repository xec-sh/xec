---
id: troubleshooting
title: Устранение неполадок
sidebar_position: 3
---

# Устранение неполадок CLI

Это руководство поможет решить распространённые проблемы при работе с Xec CLI.

## Распространённые проблемы

### Команда xec не найдена

Если после установки команда `xec` не найдена:

```bash
# Проверьте установку
npm list -g @xec-sh/cli

# Переустановите глобально
npm install -g @xec-sh/cli

# Или используйте yarn
yarn global add @xec-sh/cli
```

### Ошибки разрешений

При ошибках разрешений:

```bash
# Linux/macOS: используйте sudo
sudo npm install -g @xec-sh/cli

# Или настройте npm для работы без sudo
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

### Проблемы с SSH соединением

При проблемах с SSH:

1. Проверьте доступность сервера:
   ```bash
   ping server.example.com
   ```

2. Проверьте SSH доступ:
   ```bash
   ssh user@server.example.com
   ```

3. Проверьте права на ключ:
   ```bash
   chmod 600 ~/.ssh/id_rsa
   ```

### Ошибки выполнения рецептов

При ошибках выполнения:

```typescript
// Включите отладку
xec run recipe.ts --debug

// Проверьте синтаксис
xec validate recipe.ts
```

## Отладка

### Включение подробного вывода

```bash
# Установите переменную окружения
export XEC_DEBUG=true

# Или используйте флаг
xec run recipe.ts --verbose
```

### Логирование

```typescript
import { logger } from '@xec-sh/core';

logger.info('Информационное сообщение');
logger.debug('Отладочное сообщение');
logger.error('Сообщение об ошибке');
```

## Получение помощи

- Проверьте документацию: `xec help`
- Посетите [GitHub Issues](https://github.com/xec-sh/xec/issues)
- Присоединяйтесь к сообществу

## Дополнительная информация

Для более подробной информации смотрите основную документацию CLI.