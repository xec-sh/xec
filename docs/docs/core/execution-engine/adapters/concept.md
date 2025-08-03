---
title: Концепция адаптеров
sidebar_label: Концепция
description: Архитектура системы адаптеров для выполнения команд в различных окружениях
---

# Концепция адаптеров

Адаптеры — это ключевой компонент архитектуры Xec, обеспечивающий выполнение команд в различных окружениях через единый API. Каждый адаптер инкапсулирует специфику конкретного окружения, предоставляя универсальный интерфейс.

## Архитектура системы адаптеров

```
┌─────────────────────────────────────────────┐
│              ExecutionEngine                │
│                                             │
│  • Управление адаптерами                    │
│  • Маршрутизация команд                     │
│  • Конфигурация и контекст                 │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│              BaseAdapter                    │
│                                             │
│  • Базовая функциональность                 │
│  • Обработка потоков                        │
│  • Маскирование данных                      │
│  • Обработка ошибок                         │
└──────┬──────┬──────┬──────┬──────┬─────────┘
       │      │      │      │      │
       ▼      ▼      ▼      ▼      ▼
   ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐
   │Local ││ SSH  ││Docker││ K8s  ││Remote│
   └──────┘└──────┘└──────┘└──────┘└──────┘
```

## Базовый класс адаптера

Все адаптеры наследуются от `BaseAdapter`:

```typescript
export abstract class BaseAdapter extends EnhancedEventEmitter {
  protected config: BaseAdapterConfig;
  protected abstract readonly adapterName: string;
  
  // Основной метод выполнения
  abstract execute(command: Command): Promise<ExecutionResult>;
  
  // Проверка доступности
  abstract isAvailable(): Promise<boolean>;
  
  // Очистка ресурсов
  abstract dispose(): Promise<void>;
  
  // Опциональная синхронная версия
  executeSync?(command: Command): ExecutionResult;
}
```

### Конфигурация адаптера

```typescript
interface BaseAdapterConfig {
  defaultTimeout?: number;        // Таймаут по умолчанию
  defaultCwd?: string;            // Рабочая директория
  defaultEnv?: Record<string, string>; // Переменные окружения
  defaultShell?: string | boolean;    // Shell для выполнения
  encoding?: BufferEncoding;      // Кодировка вывода
  maxBuffer?: number;             // Максимальный размер буфера
  throwOnNonZeroExit?: boolean;  // Бросать исключение при ошибке
  sensitiveDataMasking?: {        // Маскирование данных
    enabled: boolean;
    patterns: RegExp[];
    replacement: string;
  };
}
```

## Жизненный цикл выполнения

### 1. Выбор адаптера

```typescript
// Явный выбор
await $.ssh({ host: 'server' })`ls`;

// Через конфигурацию
await $.with({ 
  adapter: 'docker',
  adapterOptions: { container: 'app' }
})`ls`;

// Автоматический выбор
await $`ls`;  // Использует LocalAdapter
```

### 2. Подготовка команды

```typescript
// Адаптер объединяет настройки
protected mergeCommand(command: Command): Command {
  return {
    ...command,
    cwd: command.cwd ?? this.config.defaultCwd,
    env: { ...this.config.defaultEnv, ...command.env },
    timeout: command.timeout ?? this.config.defaultTimeout,
    shell: command.shell ?? this.config.defaultShell
  };
}
```

### 3. Выполнение

```typescript
// Каждый адаптер реализует свою логику
async execute(command: Command): Promise<ExecutionResult> {
  const merged = this.mergeCommand(command);
  
  // Специфичная для адаптера реализация
  const result = await this.runInEnvironment(merged);
  
  // Создание унифицированного результата
  return this.createResult(
    result.stdout,
    result.stderr,
    result.exitCode,
    result.signal,
    merged
  );
}
```

### 4. Обработка результата

```typescript
interface ExecutionResult {
  stdout: string;         // Стандартный вывод
  stderr: string;         // Вывод ошибок
  exitCode: number;       // Код завершения
  signal?: string;        // Сигнал завершения
  duration: number;       // Время выполнения
  startTime: Date;        // Начало выполнения
  endTime: Date;          // Конец выполнения
  adapter: string;        // Использованный адаптер
  host?: string;          // Хост (для SSH)
  container?: string;     // Контейнер (для Docker)
}
```

## Типы адаптеров

### LocalAdapter

Выполнение команд в локальной системе:

```typescript
const local = $.local();
await local`ls -la`;
```

**Особенности:**
- Прямое выполнение через child_process
- Поддержка Bun runtime
- Синхронное выполнение
- Минимальные накладные расходы

### SSHAdapter

Выполнение команд на удалённых серверах:

```typescript
const ssh = $.ssh({
  host: 'server.com',
  username: 'user',
  privateKey: '/path/to/key'
});
await ssh`ls -la`;
```

**Особенности:**
- Пул SSH соединений
- SSH туннели
- Передача файлов (SCP/SFTP)
- Sudo поддержка

### DockerAdapter

Выполнение команд в Docker контейнерах:

```typescript
const docker = $.docker({
  container: 'my-app'
});
await docker`ls -la`;
```

**Особенности:**
- Управление жизненным циклом контейнеров
- Потоковая передача логов
- Монтирование томов
- Docker Compose интеграция

### KubernetesAdapter

Выполнение команд в Kubernetes подах:

```typescript
const k8s = $.k8s().pod('my-pod');
await k8s`ls -la`;
```

**Особенности:**
- Port forwarding
- Логи контейнеров
- Копирование файлов
- Namespace поддержка

### RemoteDockerAdapter

Docker через SSH соединение:

```typescript
const remote = $.remoteDocker({
  ssh: { host: 'server', username: 'user' },
  docker: { container: 'app' }
});
await remote`ls -la`;
```

**Особенности:**
- Комбинация SSH и Docker
- Удалённое управление контейнерами
- Туннелирование Docker API

## Общие возможности адаптеров

### Обработка потоков

```typescript
// StreamHandler для всех адаптеров
protected createStreamHandler(options?: {
  onData?: (chunk: string) => void
}): StreamHandler {
  return new StreamHandler({
    encoding: this.config.encoding,
    maxBuffer: this.config.maxBuffer,
    onData: options?.onData
  });
}
```

### Маскирование чувствительных данных

```typescript
// Автоматическое скрытие паролей и ключей
protected maskSensitiveData(text: string): string {
  if (!this.config.sensitiveDataMasking.enabled) {
    return text;
  }
  
  for (const pattern of this.config.sensitiveDataMasking.patterns) {
    text = text.replace(pattern, this.config.sensitiveDataMasking.replacement);
  }
  
  return text;
}
```

**Примеры маскирования:**

```typescript
// Пароли
"password=secret123" → "password=[REDACTED]"

// API ключи
"api_key: abc123" → "api_key: [REDACTED]"

// Bearer токены
"Authorization: Bearer xyz789" → "Authorization: Bearer [REDACTED]"

// SSH ключи
"-----BEGIN RSA PRIVATE KEY-----..." → "[REDACTED]"
```

### Обработка таймаутов

```typescript
protected async handleTimeout(
  promise: Promise<any>,
  timeout: number,
  command: string,
  cleanup?: () => void
): Promise<any> {
  if (timeout <= 0) return promise;
  
  const timeoutPromise = new Promise((_, reject) => {
    const timer = setTimeout(() => {
      if (cleanup) cleanup();
      reject(new TimeoutError(command, timeout));
    }, timeout);
    
    promise.finally(() => clearTimeout(timer));
  });
  
  return Promise.race([promise, timeoutPromise]);
}
```

### События адаптеров

```typescript
// Каждый адаптер может генерировать события
adapter.on('connection:established', ({ host }) => {
  console.log(`Connected to ${host}`);
});

adapter.on('transfer:progress', ({ bytes, total }) => {
  console.log(`Transfer: ${bytes}/${total}`);
});

adapter.on('container:created', ({ id, name }) => {
  console.log(`Container ${name} created: ${id}`);
});
```

## Создание собственного адаптера

### Шаг 1: Наследование от BaseAdapter

```typescript
import { BaseAdapter, BaseAdapterConfig } from '@xec-sh/core';

interface CustomAdapterConfig extends BaseAdapterConfig {
  customOption?: string;
}

export class CustomAdapter extends BaseAdapter {
  protected readonly adapterName = 'custom';
  private customConfig: CustomAdapterConfig;
  
  constructor(config: CustomAdapterConfig = {}) {
    super(config);
    this.name = this.adapterName;
    this.customConfig = config;
  }
}
```

### Шаг 2: Реализация execute

```typescript
async execute(command: Command): Promise<ExecutionResult> {
  const merged = this.mergeCommand(command);
  const startTime = Date.now();
  
  try {
    // Ваша логика выполнения
    const result = await this.runCustomCommand(merged);
    
    return this.createResult(
      result.stdout,
      result.stderr,
      result.exitCode,
      result.signal,
      this.buildCommandString(merged),
      startTime,
      Date.now()
    );
  } catch (error) {
    throw new AdapterError(
      this.adapterName,
      'execute',
      error instanceof Error ? error : new Error(String(error))
    );
  }
}
```

### Шаг 3: Проверка доступности

```typescript
async isAvailable(): Promise<boolean> {
  try {
    // Проверка, что окружение доступно
    await this.checkEnvironment();
    return true;
  } catch {
    return false;
  }
}
```

### Шаг 4: Очистка ресурсов

```typescript
async dispose(): Promise<void> {
  // Закрытие соединений
  await this.closeConnections();
  
  // Очистка временных файлов
  await this.cleanupTemp();
  
  // Удаление слушателей событий
  this.removeAllListeners();
}
```

### Шаг 5: Регистрация адаптера

```typescript
import { ExecutionEngine } from '@xec-sh/core';
import { CustomAdapter } from './custom-adapter';

const $ = new ExecutionEngine();
$.registerAdapter('custom', new CustomAdapter({
  customOption: 'value'
}));

// Использование
await $.with({ adapter: 'custom' })`custom-command`;
```

## Управление ресурсами

### Пулы соединений

SSH и другие сетевые адаптеры используют пулы:

```typescript
class ConnectionPool {
  private connections = new Map<string, Connection>();
  private maxConnections = 10;
  private ttl = 300000; // 5 минут
  
  async getConnection(key: string): Promise<Connection> {
    // Переиспользование существующего
    if (this.connections.has(key)) {
      return this.connections.get(key)!;
    }
    
    // Создание нового
    const conn = await this.createConnection();
    this.connections.set(key, conn);
    
    // Автоочистка по TTL
    setTimeout(() => {
      this.closeConnection(key);
    }, this.ttl);
    
    return conn;
  }
}
```

### Ленивая инициализация

Адаптеры создаются только при необходимости:

```typescript
class ExecutionEngine {
  private adapters = new Map<string, BaseAdapter>();
  
  private async selectAdapter(command: Command): Promise<BaseAdapter> {
    const type = command.adapter || 'local';
    
    // Создание при первом использовании
    if (!this.adapters.has(type)) {
      this.adapters.set(type, this.createAdapter(type));
    }
    
    return this.adapters.get(type)!;
  }
}
```

## Обработка ошибок

### Типы ошибок

```typescript
// Ошибка адаптера
class AdapterError extends Error {
  constructor(
    public adapter: string,
    public operation: string,
    public cause: Error
  ) {
    super(`${adapter} adapter failed during ${operation}: ${cause.message}`);
  }
}

// Ошибка команды
class CommandError extends Error {
  constructor(
    public command: string,
    public exitCode: number,
    public stderr: string
  ) {
    super(`Command failed with exit code ${exitCode}: ${stderr}`);
  }
}

// Ошибка таймаута
class TimeoutError extends Error {
  constructor(
    public command: string,
    public timeout: number
  ) {
    super(`Command timed out after ${timeout}ms: ${command}`);
  }
}
```

### Стратегии обработки

```typescript
// Автоматический retry
async executeWithRetry(command: Command): Promise<ExecutionResult> {
  let lastError;
  
  for (let i = 0; i < 3; i++) {
    try {
      return await this.execute(command);
    } catch (error) {
      lastError = error;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  
  throw lastError;
}

// Fallback на другой адаптер
async executeWithFallback(command: Command): Promise<ExecutionResult> {
  try {
    return await this.primaryAdapter.execute(command);
  } catch {
    return await this.fallbackAdapter.execute(command);
  }
}
```

## Производительность

### Метрики адаптеров

```typescript
interface AdapterMetrics {
  totalExecutions: number;
  averageDuration: number;
  errorRate: number;
  activeConnections: number;
  cacheHitRate: number;
}

// Сбор метрик
adapter.on('command:complete', ({ duration }) => {
  metrics.totalExecutions++;
  metrics.averageDuration = 
    (metrics.averageDuration * (metrics.totalExecutions - 1) + duration) / 
    metrics.totalExecutions;
});
```

### Оптимизации

1. **Кэширование результатов** - для идемпотентных команд
2. **Пулы соединений** - переиспользование подключений
3. **Потоковая обработка** - для больших выводов
4. **Параллельное выполнение** - для независимых команд
5. **Ленивая загрузка** - создание по требованию

## Заключение

Система адаптеров в Xec обеспечивает:

- **Универсальность**: единый API для всех окружений
- **Расширяемость**: легкое добавление новых адаптеров
- **Безопасность**: маскирование чувствительных данных
- **Производительность**: оптимизации для каждого окружения
- **Надёжность**: обработка ошибок и восстановление

Адаптеры являются основой для создания мощных инструментов автоматизации, работающих в любых окружениях.