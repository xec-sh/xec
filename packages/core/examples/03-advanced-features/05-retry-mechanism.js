import { $ } from '@xec-sh/core';
const $retry = $.retry({ maxRetries: 3 });
try {
    await $retry `curl -f http://example.com || exit 1`;
    console.log('Успешно получены данные');
}
catch (error) {
    console.log('Не удалось получить данные после всех попыток');
}
const $retryWithDelay = $.retry({
    maxRetries: 5,
    initialDelay: 1000,
});
const result = await $retryWithDelay `ping -c 1 example.com || exit 1`.nothrow();
if (result.ok) {
    console.log('Хост доступен');
}
else {
    console.log('Хост недоступен после всех попыток');
}
const $exponentialRetry = $.retry({
    maxRetries: 4,
    backoffMultiplier: 2,
    initialDelay: 1000,
    maxDelay: 10000
});
try {
    await $exponentialRetry `test -f /tmp/ready || exit 1`;
    console.log('Файл готов');
}
catch (error) {
    console.log('Файл не появился');
}
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
    await $conditionalRetry `test -f /tmp/ready.flag`;
    console.log(`Файл найден после ${attemptCount} попыток`);
}
catch (error) {
    console.log('Файл не найден');
}
const $localRetry = $.local().retry({
    maxRetries: 3,
    initialDelay: 2000
});
try {
    await $localRetry `curl -f http://localhost:8080/health || exit 1`;
    console.log('Сервис доступен');
}
catch (error) {
    console.log('Сервис недоступен');
}
const $jitterRetry = $.retry({
    maxRetries: 5,
    initialDelay: 1000,
    jitter: true
});
const files = ['/tmp/file1', '/tmp/file2', '/tmp/file3'];
const fileChecks = files.map(file => $jitterRetry `test -f ${file} || exit 1`.nothrow());
const results = await Promise.all(fileChecks);
results.forEach((result, i) => {
    console.log(`Файл ${files[i]}: ${result.ok ? 'существует' : 'не найден'}`);
});
const $serviceRetry = $.retry({
    maxRetries: 30,
    initialDelay: 1000,
    onRetry: (attempt, result, nextDelay) => {
        console.log(`Ожидание сервиса... Попытка ${attempt}/30`);
    }
});
const markerFile = '/tmp/service-ready-marker';
await $ `rm -f ${markerFile}`;
setTimeout(async () => {
    await $ `touch ${markerFile}`;
    console.log('Сервис запущен!');
}, 5000);
try {
    await $serviceRetry `test -f ${markerFile}`;
    console.log('Сервис готов к работе');
}
catch (error) {
    console.log('Сервис не запустился');
}
const $smartRetry = $.retry({
    maxRetries: 5,
    isRetryable: (result) => {
        const temporaryErrors = [1, 2, 124, 125];
        return temporaryErrors.includes(result.exitCode);
    }
});
const apiResult = await $smartRetry `curl -f -X POST http://example.com/api/test || exit 2`.nothrow();
if (apiResult.ok) {
    console.log('API вызов успешен');
}
else {
    console.log(`API вызов неудачен: exit code ${apiResult.exitCode}`);
}
const $complexRetry = $.retry({
    maxRetries: 10,
    backoffMultiplier: 1.5,
    initialDelay: 500,
    maxDelay: 5000,
    jitter: true
});
try {
    await $complexRetry `curl -f --max-time 5 http://slow-service.com || exit 1`.timeout(30000);
    console.log('Сервис ответил');
}
catch (error) {
    console.log('Не удалось получить ответ от сервиса');
}
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
    const random = Math.random();
    await $metricRetry `test ${random} '<' '0.5' || exit 1`;
    retryMetrics.successfulAttempts = 1;
    console.log('Команда успешно выполнена');
}
catch (error) {
    console.log('Все попытки исчерпаны');
}
retryMetrics.totalRetryTime = Date.now() - startTime;
console.log('Метрики retry:', retryMetrics);
class CircuitBreaker {
    constructor(threshold = 5, timeout = 60000) {
        this.threshold = threshold;
        this.timeout = timeout;
        this.failures = 0;
        this.lastFailureTime = 0;
        this.state = 'closed';
    }
    async execute(command) {
        if (this.state === 'open') {
            if (Date.now() - this.lastFailureTime > this.timeout) {
                this.state = 'half-open';
                console.log('Circuit breaker: half-open');
            }
            else {
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
        }
        catch (error) {
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
const breaker = new CircuitBreaker(3, 5000);
for (let i = 0; i < 10; i++) {
    try {
        const random = Math.random();
        await breaker.execute($ `test ${random} '<' '0.6' || exit 1`);
        console.log(`Попытка ${i + 1}: успешно`);
    }
    catch (error) {
        console.log(`Попытка ${i + 1}: ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
}
console.log('\nТест circuit breaker завершён');
//# sourceMappingURL=05-retry-mechanism.js.map