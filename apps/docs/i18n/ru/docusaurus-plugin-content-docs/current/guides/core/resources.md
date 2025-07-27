---
id: resources
title: Ресурсы
sidebar_position: 1
---

# Работа с ресурсами в Xec Core

Это руководство объясняет, как работать с ресурсами в Xec Core.

## Обзор

Ресурсы являются основными строительными блоками в Xec. Они представляют компоненты инфраструктуры, которыми вы хотите управлять.

## Типы ресурсов

### Файловые ресурсы

```typescript
import { resource } from '@xec-sh/core';

const configFile = resource('file')
  .path('/etc/myapp/config.yml')
  .content('key: value')
  .mode('0644');
```

### Сервисные ресурсы

```typescript
const webService = resource('service')
  .name('nginx')
  .ensure('running')
  .enable(true);
```

### Пакетные ресурсы

```typescript
const nodePackage = resource('package')
  .name('nodejs')
  .version('18.x')
  .ensure('installed');
```

## Дополнительная информация

Для более подробной информации смотрите основную документацию.