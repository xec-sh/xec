/**
 * 05. Retry Mechanism - Механизм повторных попыток
 * 
 * Показывает различные стратегии повторных попыток
 */

import { $ } from '@xec-sh/core';

// 1. Простой retry
// Используем maxRetries для указания количества повторов
const $retry = $.retry({ maxRetries: 3 });

try {
  // Попытается 3 раза (плюс первая попытка)
  await $retry`curl -f http://example.com || exit 1`;
  console.log('Успешно получены данные');
} catch (error) {
  console.log('Не удалось получить данные после всех попыток');
}

// 2. Retry с задержкой
const $retryWithDelay = $.retry({
  maxRetries: 5,
  initialDelay: 1000, // 1 секунда начальная задержка
});

const result = await $retryWithDelay`ping -c 1 example.com || exit 1`.nothrow();
if (result.ok) {
  console.log('Хост доступен');
} else {
  console.log('Хост недоступен после всех попыток');
}

// 3. Exponential backoff
// Используем backoffMultiplier для экспоненциальной задержки
const $exponentialRetry = $.retry({
  maxRetries: 4,
  backoffMultiplier: 2, // Удваивать задержку после каждой попытки
  initialDelay: 1000, // Начать с 1 секунды
  maxDelay: 10000 // Максимум 10 секунд
});

// Задержки: 1s, 2s, 4s, 8s (но не больше 10s)
try {
  await $exponentialRetry`test -f /tmp/ready || exit 1`;
  console.log('Файл готов');
} catch (error) {
  console.log('Файл не появился');
}

// 4. Retry с колбэком
let attemptCount = 0;
const $conditionalRetry = $.retry({
  maxRetries: 10,
  initialDelay: 500,
  onRetry: (attempt, result, nextDelay) => {
    attemptCount = attempt;
    console.log(`Попытка ${attempt}: exit code ${result.exitCode}, следующая задержка ${nextDelay}мс`);
  }
});

try {
  await $conditionalRetry`test -f /tmp/ready.flag`;
  console.log(`Файл найден после ${attemptCount} попыток`);
} catch (error) {
  console.log('Файл не найден');
}

// 5. Retry для разных адаптеров
// Пример с локальным адаптером
const $localRetry = $.local().retry({
  maxRetries: 3,
  initialDelay: 2000
});

// Проверяем доступность сервиса
try {
  await $localRetry`curl -f http://localhost:8080/health || exit 1`;
  console.log('Сервис доступен');
} catch (error) {
  console.log('Сервис недоступен');
}

// 6. Retry с jitter (случайная задержка)
const $jitterRetry = $.retry({
  maxRetries: 5,
  initialDelay: 1000,
  jitter: true // Добавить случайную задержку
});

// Проверка нескольких файлов
const files = ['/tmp/file1', '/tmp/file2', '/tmp/file3'];
const fileChecks = files.map(file => 
  $jitterRetry`test -f ${file} || exit 1`.nothrow()
);

const results = await Promise.all(fileChecks);
results.forEach((result, i) => {
  console.log(`Файл ${files[i]}: ${result.ok ? 'существует' : 'не найден'}`);
});

// 7. Простой пример ожидания сервиса
const $serviceRetry = $.retry({
  maxRetries: 30,
  initialDelay: 1000,
  onRetry: (attempt, result, nextDelay) => {
    console.log(`Ожидание сервиса... Попытка ${attempt}/30`);
  }
});

// Создаём файл-маркер для теста
const markerFile = '/tmp/service-ready-marker';
await $`rm -f ${markerFile}`;

// Симулируем запуск сервиса через 5 секунд
setTimeout(async () => {
  await $`touch ${markerFile}`;
  console.log('Сервис запущен!');
}, 5000);

try {
  await $serviceRetry`test -f ${markerFile}`;
  console.log('Сервис готов к работе');
} catch (error) {
  console.log('Сервис не запустился');
}

// 8. Retry с кастомным условием
const $smartRetry = $.retry({
  maxRetries: 5,
  isRetryable: (result) => {
    // Повторять только для временных ошибок
    const temporaryErrors = [1, 2, 124, 125]; // Коды временных ошибок
    return temporaryErrors.includes(result.exitCode);
  }
});

const apiResult = await $smartRetry`curl -f -X POST http://example.com/api/test || exit 2`.nothrow();
if (apiResult.ok) {
  console.log('API вызов успешен');
} else {
  console.log(`API вызов неудачен: exit code ${apiResult.exitCode}`);
}

// 9. Retry с комбинированными стратегиями
const $complexRetry = $.retry({
  maxRetries: 10,
  backoffMultiplier: 1.5,
  initialDelay: 500,
  maxDelay: 5000,
  jitter: true
});

// Пример с таймаутом
try {
  // Проверяем доступность сервиса с таймаутом
  await $complexRetry`curl -f --max-time 5 http://slow-service.com || exit 1`.timeout(30000);
  console.log('Сервис ответил');
} catch (error) {
  console.log('Не удалось получить ответ от сервиса');
}

// 10. Retry с метриками
const retryMetrics = {
  totalAttempts: 0,
  successfulAttempts: 0,
  failedAttempts: 0,
  totalRetryTime: 0
};

const startTime = Date.now();
const $metricRetry = $.retry({
  maxRetries: 3,
  initialDelay: 1000,
  onRetry: (attempt, result, nextDelay) => {
    retryMetrics.totalAttempts = attempt;
    retryMetrics.failedAttempts++;
    console.log(`Retry ${attempt}: exit code ${result.exitCode}`);
  }
});

try {
  // Тестируем с 50% шансом успеха
  const random = Math.random();
  await $metricRetry`test ${random} '<' '0.5' || exit 1`;
  retryMetrics.successfulAttempts = 1;
  console.log('Команда успешно выполнена');
} catch (error) {
  console.log('Все попытки исчерпаны');
}

retryMetrics.totalRetryTime = Date.now() - startTime;
console.log('Метрики retry:', retryMetrics);

// 11. Простой пример Circuit Breaker паттерна
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold = 5,
    private timeout = 60000
  ) {}
  
  async execute(command: any) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        console.log('Circuit breaker: half-open');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await command;
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
        console.log('Circuit breaker: closed');
      }
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
        console.log('Circuit breaker: open');
      }
      throw error;
    }
  }
}

const breaker = new CircuitBreaker(3, 5000); // 3 ошибки, 5 секунд таймаут

// Тестируем circuit breaker
for (let i = 0; i < 10; i++) {
  try {
    // 60% шанс успеха
    const random = Math.random();
    await breaker.execute(
      $`test ${random} '<' '0.6' || exit 1`
    );
    console.log(`Попытка ${i + 1}: успешно`);
  } catch (error: any) {
    console.log(`Попытка ${i + 1}: ${error.message}`);
  }
  
  await new Promise(resolve => setTimeout(resolve, 500));
}

console.log('\nТест circuit breaker завершён');
