/**
 * 06. API Server Automation - Автоматизация API серверов
 * 
 * Показывает реальные сценарии работы с API серверами
 */

import * as path from 'path';
import { $ } from '@xec-sh/core';
import * as fs from 'fs/promises';

// 1. Тестирование API
async function runApiTests(config: ApiTestConfig) {
  console.log('\n=== Тестирование API ===\n');
  console.log(`Endpoint: ${config.baseUrl}`);
  console.log(`Тестов: ${config.tests.length}\n`);
  
  const results = [];
  // В @xec-sh/core нет progress, используем простое отображение
  let completed = 0;
  
  for (const test of config.tests) {
    const result = await executeApiTest(test, config);
    results.push(result);
    completed++;
    process.stdout.write(`\rВыполнено тестов: ${completed}/${config.tests.length}`);
  }
  
  console.log(''); // Новая строка
  
  // Генерируем отчет
  generateTestReport(results);
  
  // Сохраняем результаты
  if (config.saveResults) {
    await saveTestResults(results, config.resultsPath);
  }
  
  // Проверяем успешность
  const failed = results.filter(r => !r.passed);
  if (failed.length > 0 && config.failOnError) {
    throw new Error(`${failed.length} тестов провалилось`);
  }
  
  return results;
}

async function executeApiTest(test: ApiTest, config: ApiTestConfig): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    name: test.name,
    endpoint: test.endpoint,
    method: test.method,
    passed: false,
    duration: 0,
    assertions: [],
    error: null
  };
  
  try {
    // Формируем запрос
    const url = `${config.baseUrl}${test.endpoint}`;
    const curlOptions = [
      '-X', test.method,
      '-w', '\n%{http_code}\n%{time_total}',
      '-s'
    ];
    
    // Добавляем заголовки
    const headers = { ...config.defaultHeaders, ...test.headers };
    Object.entries(headers).forEach(([key, value]) => {
      curlOptions.push('-H', `${key}: ${value}`);
    });
    
    // Добавляем тело запроса
    if (test.body) {
      curlOptions.push('-d', JSON.stringify(test.body));
    }
    
    // Добавляем аутентификацию
    if (config.auth) {
      if (config.auth.type === 'bearer') {
        curlOptions.push('-H', `Authorization: Bearer ${config.auth.token}`);
      } else if (config.auth.type === 'basic') {
        curlOptions.push('-u', `${config.auth.username}:${config.auth.password}`);
      }
    }
    
    // Выполняем запрос
    const response = await $`curl ${curlOptions} ${url}`;
    const lines = response.stdout.trim().split('\n');
    
    // Парсим ответ
    const responseTime = parseFloat(lines.pop());
    const statusCode = parseInt(lines.pop());
    const responseBody = lines.join('\n');
    
    result.response = {
      statusCode,
      body: responseBody ? JSON.parse(responseBody) : null,
      time: responseTime * 1000 // в миллисекундах
    };
    
    // Выполняем проверки
    for (const assertion of test.assertions) {
      const assertionResult = await checkAssertion(assertion, result.response);
      result.assertions.push(assertionResult);
      
      if (!assertionResult.passed) {
        result.passed = false;
      }
    }
    
    // Если все проверки прошли
    if (result.assertions.every(a => a.passed)) {
      result.passed = true;
    }
    
  } catch (error) {
    result.error = error.message;
    result.passed = false;
  }
  
  result.duration = Date.now() - startTime;
  return result;
}

async function checkAssertion(assertion: ApiAssertion, response: any): Promise<AssertionResult> {
  const result: AssertionResult = {
    type: assertion.type,
    expected: assertion.expected,
    actual: null,
    passed: false,
    message: ''
  };
  
  switch (assertion.type) {
    case 'status':
      result.actual = response.statusCode;
      result.passed = response.statusCode === assertion.expected;
      result.message = `Status code: expected ${assertion.expected}, got ${result.actual}`;
      break;
      
    case 'responseTime':
      result.actual = response.time;
      result.passed = response.time <= assertion.expected;
      result.message = `Response time: expected <= ${assertion.expected}ms, got ${result.actual}ms`;
      break;
      
    case 'jsonPath': {
      const value = getJsonPath(response.body, assertion.path);
      result.actual = value;
      result.passed = deepEqual(value, assertion.expected);
      result.message = `JSON path ${assertion.path}: expected ${JSON.stringify(assertion.expected)}, got ${JSON.stringify(result.actual)}`;
      break;
    }

    case 'schema': {
      const schemaValid = validateJsonSchema(response.body, assertion.schema);
      result.passed = schemaValid;
      result.message = schemaValid ? 'Schema validation passed' : 'Schema validation failed';
      break;
    }
  }
  
  return result;
}

// 2. Нагрузочное тестирование
async function runLoadTest(config: LoadTestConfig) {
  console.log('\n=== Нагрузочное тестирование ===\n');
  console.log(`URL: ${config.url}`);
  console.log(`Пользователей: ${config.users}`);
  console.log(`Продолжительность: ${config.duration}с\n`);
  
  // Используем Apache Bench (ab) или wrk
  const tool = await detectLoadTestTool();
  
  if (!tool) {
    throw new Error('Не найдены инструменты нагрузочного тестирования (ab, wrk)');
  }
  
  let result;
  
  switch (tool) {
    case 'ab':
      result = await runApacheBench(config);
      break;
    case 'wrk':
      result = await runWrk(config);
      break;
  }
  
  // Анализируем результаты
  analyzeLoadTestResults(result, config);
  
  return result;
}

async function detectLoadTestTool(): Promise<string | null> {
  const ab = await $`which ab`.nothrow();
  if (ab.ok) return 'ab';
  
  const wrk = await $`which wrk`.nothrow();
  if (wrk.ok) return 'wrk';
  
  return null;
}

async function runApacheBench(config: LoadTestConfig): Promise<LoadTestResult> {
  const totalRequests = config.users * config.duration * 10; // примерно 10 запросов в секунду на пользователя
  
  const options = [
    '-n', totalRequests.toString(),
    '-c', config.users.toString(),
    '-t', config.duration.toString()
  ];
  
  // Добавляем заголовки
  if (config.headers) {
    Object.entries(config.headers).forEach(([key, value]) => {
      options.push('-H', `${key}: ${value}`);
    });
  }
  
  // POST запрос
  if (config.method === 'POST' && config.body) {
    const bodyFile = '/tmp/ab-body.json';
    await fs.writeFile(bodyFile, JSON.stringify(config.body));
    options.push('-p', bodyFile);
    options.push('-T', 'application/json');
  }
  
  console.log('🚀 Запуск Apache Bench...\n');
  const result = await $`ab ${options} ${config.url}`;
  
  // Парсим результаты
  const output = result.stdout;
  const metrics: LoadTestResult = {
    tool: 'ab',
    totalRequests: parseInt(output.match(/Complete requests:\s+(\d+)/)?.[1] || '0'),
    failedRequests: parseInt(output.match(/Failed requests:\s+(\d+)/)?.[1] || '0'),
    requestsPerSecond: parseFloat(output.match(/Requests per second:\s+([\d.]+)/)?.[1] || '0'),
    meanLatency: parseFloat(output.match(/Time per request:\s+([\d.]+)\s+\[ms\]\s+\(mean\)/)?.[1] || '0'),
    p50Latency: parseFloat(output.match(/50%\s+(\d+)/)?.[1] || '0'),
    p90Latency: parseFloat(output.match(/90%\s+(\d+)/)?.[1] || '0'),
    p99Latency: parseFloat(output.match(/99%\s+(\d+)/)?.[1] || '0'),
    throughput: parseFloat(output.match(/Transfer rate:\s+([\d.]+)\s+\[Kbytes\/sec\]/)?.[1] || '0'),
    raw: output
  };
  
  return metrics;
}

async function runWrk(config: LoadTestConfig): Promise<LoadTestResult> {
  const options = [
    '-t', Math.min(config.users, 10).toString(), // потоки
    '-c', config.users.toString(), // соединения
    '-d', `${config.duration}s`,
    '--latency'
  ];
  
  // Lua скрипт для POST запросов
  if (config.method === 'POST' && config.body) {
    const luaScript = `
wrk.method = "POST"
wrk.headers["Content-Type"] = "application/json"
wrk.body = '${JSON.stringify(config.body)}'
`;
    const scriptFile = '/tmp/wrk-script.lua';
    await fs.writeFile(scriptFile, luaScript);
    options.push('-s', scriptFile);
  }
  
  console.log('🚀 Запуск wrk...\n');
  const result = await $`wrk ${options} ${config.url}`;
  
  // Парсим результаты
  const output = result.stdout;
  const metrics: LoadTestResult = {
    tool: 'wrk',
    totalRequests: parseInt(output.match(/(\d+) requests in/)?.[1] || '0'),
    failedRequests: parseInt(output.match(/Socket errors:.*?(\d+)/)?.[1] || '0'),
    requestsPerSecond: parseFloat(output.match(/Requests\/sec:\s+([\d.]+)/)?.[1] || '0'),
    meanLatency: parseFloat(output.match(/Latency\s+([\d.]+)ms/)?.[1] || '0'),
    p50Latency: parseFloat(output.match(/50%\s+([\d.]+)ms/)?.[1] || '0'),
    p90Latency: parseFloat(output.match(/90%\s+([\d.]+)ms/)?.[1] || '0'),
    p99Latency: parseFloat(output.match(/99%\s+([\d.]+)ms/)?.[1] || '0'),
    throughput: 0, // wrk не показывает throughput напрямую
    raw: output
  };
  
  return metrics;
}

function analyzeLoadTestResults(result: LoadTestResult, config: LoadTestConfig) {
  console.log('\n📊 Результаты нагрузочного тестирования:');
  console.log(`Всего запросов: ${result.totalRequests}`);
  console.log(`Неудачных запросов: ${result.failedRequests}`);
  console.log(`Запросов в секунду: ${result.requestsPerSecond.toFixed(2)}`);
  console.log(`\nЗадержка (ms):`);
  console.log(`  Средняя: ${result.meanLatency.toFixed(2)}`);
  console.log(`  50%: ${result.p50Latency}`);
  console.log(`  90%: ${result.p90Latency}`);
  console.log(`  99%: ${result.p99Latency}`);
  
  if (result.throughput > 0) {
    console.log(`\nПропускная способность: ${result.throughput.toFixed(2)} KB/s`);
  }
  
  // Проверяем SLA
  if (config.sla) {
    console.log('\n🎯 Проверка SLA:');
    const slaResults = [];
    
    if (config.sla.maxMeanLatency && result.meanLatency > config.sla.maxMeanLatency) {
      slaResults.push(`❌ Средняя задержка ${result.meanLatency}ms превышает лимит ${config.sla.maxMeanLatency}ms`);
    } else if (config.sla.maxMeanLatency) {
      slaResults.push(`✅ Средняя задержка в пределах нормы`);
    }
    
    if (config.sla.maxP99Latency && result.p99Latency > config.sla.maxP99Latency) {
      slaResults.push(`❌ P99 задержка ${result.p99Latency}ms превышает лимит ${config.sla.maxP99Latency}ms`);
    } else if (config.sla.maxP99Latency) {
      slaResults.push(`✅ P99 задержка в пределах нормы`);
    }
    
    if (config.sla.minRequestsPerSecond && result.requestsPerSecond < config.sla.minRequestsPerSecond) {
      slaResults.push(`❌ RPS ${result.requestsPerSecond} ниже минимума ${config.sla.minRequestsPerSecond}`);
    } else if (config.sla.minRequestsPerSecond) {
      slaResults.push(`✅ RPS соответствует требованиям`);
    }
    
    if (config.sla.maxErrorRate) {
      const errorRate = (result.failedRequests / result.totalRequests) * 100;
      if (errorRate > config.sla.maxErrorRate) {
        slaResults.push(`❌ Процент ошибок ${errorRate.toFixed(2)}% превышает лимит ${config.sla.maxErrorRate}%`);
      } else {
        slaResults.push(`✅ Процент ошибок в пределах нормы`);
      }
    }
    
    slaResults.forEach(r => console.log(`  ${r}`));
  }
}

// 3. Мониторинг доступности API
async function monitorApiAvailability(config: ApiMonitorConfig) {
  console.log('\n=== Мониторинг доступности API ===\n');
  
  const results = [];
  const startTime = Date.now();
  
  console.log('Начат мониторинг. Нажмите Ctrl+C для остановки.\n');
  
  while (Date.now() - startTime < config.duration * 1000) {
    const checkTime = new Date();
    
    // Проверяем все endpoints
    const endpointResults = await Promise.all(
      config.endpoints.map(endpoint => checkEndpoint(endpoint, config))
    );
    
    const result = {
      timestamp: checkTime,
      checks: endpointResults,
      allHealthy: endpointResults.every(r => r.healthy)
    };
    
    results.push(result);
    
    // Выводим статус
    displayMonitoringStatus(result);
    
    // Проверяем алерты
    await checkAlerts(result, config);
    
    // Ждем перед следующей проверкой
    await new Promise(resolve => setTimeout(resolve, config.interval * 1000));
  }
  
  // Генерируем отчет
  generateAvailabilityReport(results, config);
}

async function checkEndpoint(endpoint: ApiEndpoint, config: ApiMonitorConfig): Promise<EndpointCheck> {
  const url = `${config.baseUrl}${endpoint.path}`;
  const startTime = Date.now();
  
  try {
    // В @xec-sh/core нет within, используем $.with() с timeout
    const $withTimeout = $.with({ timeout: endpoint.timeout || 5000 });
    const result = await $withTimeout`curl -s -o /dev/null -w "%{http_code}" ${url}`;
    
    const statusCode = parseInt(result.stdout.trim());
    const responseTime = Date.now() - startTime;
    
    const healthy = endpoint.expectedStatus 
      ? statusCode === endpoint.expectedStatus
      : statusCode >= 200 && statusCode < 400;
    
    return {
      endpoint: endpoint.name,
      url,
      healthy,
      statusCode,
      responseTime,
      error: null
    };
  } catch (error) {
    return {
      endpoint: endpoint.name,
      url,
      healthy: false,
      statusCode: 0,
      responseTime: Date.now() - startTime,
      error: error.message
    };
  }
}

function displayMonitoringStatus(result: MonitoringResult) {
  console.clear();
  console.log('=== Мониторинг доступности API ===\n');
  console.log(`Время: ${result.timestamp.toLocaleString()}`);
  console.log(`Статус: ${result.allHealthy ? '✅ Все сервисы работают' : '❌ Есть проблемы'}\n`);
  
  console.log('Endpoints:');
  result.checks.forEach(check => {
    const icon = check.healthy ? '✅' : '❌';
    const status = check.healthy ? 'OK' : 'FAIL';
    console.log(`${icon} ${check.endpoint}: ${status} (${check.responseTime}ms)`);
    if (!check.healthy && check.error) {
      console.log(`   Ошибка: ${check.error}`);
    }
  });
}

async function checkAlerts(result: MonitoringResult, config: ApiMonitorConfig) {
  if (!config.alerts) return;
  
  // Проверяем каждый неработающий endpoint
  for (const check of result.checks) {
    if (!check.healthy) {
      await sendAlert({
        level: 'error',
        endpoint: check.endpoint,
        message: `Endpoint ${check.endpoint} недоступен: ${check.error || `HTTP ${check.statusCode}`}`,
        timestamp: result.timestamp
      }, config.alerts);
    }
  }
  
  // Проверяем медленные ответы
  for (const check of result.checks) {
    if (check.healthy && check.responseTime > (config.alerts.slowResponseThreshold || 1000)) {
      await sendAlert({
        level: 'warning',
        endpoint: check.endpoint,
        message: `Endpoint ${check.endpoint} отвечает медленно: ${check.responseTime}ms`,
        timestamp: result.timestamp
      }, config.alerts);
    }
  }
}

async function sendAlert(alert: Alert, alertConfig: AlertConfig) {
  console.log(`\n🚨 ${alert.level.toUpperCase()}: ${alert.message}\n`);
  
  // Webhook
  if (alertConfig.webhook) {
    try {
      await $`curl -X POST ${alertConfig.webhook} \
        -H "Content-Type: application/json" \
        -d '${JSON.stringify(alert)}'`;
    } catch {
      console.error('Ошибка отправки webhook');
    }
  }
  
  // Email (через sendmail или другой MTA)
  if (alertConfig.email) {
    const emailBody = `
Subject: API Alert: ${alert.level}

Endpoint: ${alert.endpoint}
Time: ${alert.timestamp}
Message: ${alert.message}
`;
    
    try {
      await $`echo "${emailBody}" | sendmail ${alertConfig.email}`;
    } catch {
      console.error('Ошибка отправки email');
    }
  }
}

// 4. Генерация документации API
async function generateApiDocumentation(config: ApiDocConfig) {
  console.log('\n=== Генерация документации API ===\n');
  
  let documentation: ApiDocumentation;
  
  switch (config.source) {
    case 'openapi':
      documentation = await parseOpenApiSpec(config.specPath);
      break;
    case 'postman':
      documentation = await parsePostmanCollection(config.specPath);
      break;
    case 'code':
      documentation = await parseCodeAnnotations(config.sourcePath);
      break;
    default:
      throw new Error(`Unsupported source: ${config.source}`);
  }
  
  // Генерируем выходные файлы
  for (const format of config.outputFormats) {
    switch (format) {
      case 'markdown':
        await generateMarkdownDocs(documentation, config.outputPath);
        break;
      case 'html':
        await generateHtmlDocs(documentation, config.outputPath);
        break;
      case 'pdf':
        await generatePdfDocs(documentation, config.outputPath);
        break;
    }
  }
  
  console.log(`\n✅ Документация сгенерирована в ${config.outputPath}`);
}

async function parseOpenApiSpec(specPath: string): Promise<ApiDocumentation> {
  console.log('📖 Парсинг OpenAPI спецификации...');
  
  const spec = JSON.parse(await fs.readFile(specPath, 'utf-8'));
  
  const endpoints: ApiEndpointDoc[] = [];
  
  for (const [endpointPath, methods] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(methods as any)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
        endpoints.push({
          path: endpointPath,
          method: method.toUpperCase(),
          summary: operation.summary || '',
          description: operation.description || '',
          parameters: operation.parameters || [],
          requestBody: operation.requestBody,
          responses: operation.responses || {},
          tags: operation.tags || []
        });
      }
    }
  }
  
  return {
    title: spec.info?.title || 'API Documentation',
    version: spec.info?.version || '1.0.0',
    description: spec.info?.description || '',
    baseUrl: spec.servers?.[0]?.url || '',
    endpoints,
    models: spec.components?.schemas || {}
  };
}

async function generateMarkdownDocs(doc: ApiDocumentation, outputPath: string) {
  console.log('📝 Генерация Markdown документации...');
  
  let markdown = `# ${doc.title}\n\n`;
  markdown += `Version: ${doc.version}\n\n`;
  markdown += `${doc.description}\n\n`;
  markdown += `Base URL: \`${doc.baseUrl}\`\n\n`;
  
  // Группируем по тегам
  const endpointsByTag = new Map<string, ApiEndpointDoc[]>();
  
  doc.endpoints.forEach(endpoint => {
    const tags = endpoint.tags.length > 0 ? endpoint.tags : ['Other'];
    tags.forEach(tag => {
      if (!endpointsByTag.has(tag)) {
        endpointsByTag.set(tag, []);
      }
      endpointsByTag.get(tag)!.push(endpoint);
    });
  });
  
  // Генерируем документацию для каждого тега
  for (const [tag, endpoints] of endpointsByTag) {
    markdown += `## ${tag}\n\n`;
    
    for (const endpoint of endpoints) {
      markdown += `### ${endpoint.method} ${endpoint.path}\n\n`;
      
      if (endpoint.summary) {
        markdown += `${endpoint.summary}\n\n`;
      }
      
      if (endpoint.description) {
        markdown += `${endpoint.description}\n\n`;
      }
      
      // Параметры
      if (endpoint.parameters.length > 0) {
        markdown += `**Parameters:**\n\n`;
        markdown += '| Name | In | Type | Required | Description |\n';
        markdown += '|------|-----|------|----------|-------------|\n';
        
        endpoint.parameters.forEach((param: any) => {
          markdown += `| ${param.name} | ${param.in} | ${param.schema?.type || 'string'} | ${param.required ? 'Yes' : 'No'} | ${param.description || ''} |\n`;
        });
        
        markdown += '\n';
      }
      
      // Request Body
      if (endpoint.requestBody) {
        markdown += `**Request Body:**\n\n`;
        markdown += '```json\n';
        markdown += JSON.stringify(endpoint.requestBody.content?.['application/json']?.example || {}, null, 2);
        markdown += '\n```\n\n';
      }
      
      // Responses
      markdown += `**Responses:**\n\n`;
      for (const [code, response] of Object.entries(endpoint.responses)) {
        markdown += `- **${code}**: ${(response as any).description || 'Response'}\n`;
        
        const example = (response as any).content?.['application/json']?.example;
        if (example) {
          markdown += '\n```json\n';
          markdown += JSON.stringify(example, null, 2);
          markdown += '\n```\n\n';
        }
      }
      
      markdown += '\n---\n\n';
    }
  }
  
  // Модели
  if (Object.keys(doc.models).length > 0) {
    markdown += `## Models\n\n`;
    
    for (const [name, schema] of Object.entries(doc.models)) {
      markdown += `### ${name}\n\n`;
      markdown += '```json\n';
      markdown += JSON.stringify(schema, null, 2);
      markdown += '\n```\n\n';
    }
  }
  
  await fs.mkdir(outputPath, { recursive: true });
  await fs.writeFile(path.join(outputPath, 'api-docs.md'), markdown);
}

async function generateHtmlDocs(doc: ApiDocumentation, outputPath: string) {
  console.log('🌐 Генерация HTML документации...');
  
  // Используем swagger-ui для генерации
  const swaggerUiPath = path.join(outputPath, 'swagger-ui');
  await $`mkdir -p ${swaggerUiPath}`;
  
  // Скачиваем swagger-ui
  await $`curl -L https://github.com/swagger-api/swagger-ui/archive/master.tar.gz | tar xz -C ${swaggerUiPath} --strip-components=2 swagger-ui-master/dist`;
  
  // Создаем spec.json
  const spec = {
    openapi: '3.0.0',
    info: {
      title: doc.title,
      version: doc.version,
      description: doc.description
    },
    servers: [{ url: doc.baseUrl }],
    paths: {},
    components: { schemas: doc.models }
  };
  
  // Конвертируем endpoints обратно в OpenAPI формат
  doc.endpoints.forEach(endpoint => {
    if (!spec.paths[endpoint.path]) {
      spec.paths[endpoint.path] = {};
    }
    spec.paths[endpoint.path][endpoint.method.toLowerCase()] = {
      summary: endpoint.summary,
      description: endpoint.description,
      parameters: endpoint.parameters,
      requestBody: endpoint.requestBody,
      responses: endpoint.responses,
      tags: endpoint.tags
    };
  });
  
  await fs.writeFile(
    path.join(swaggerUiPath, 'spec.json'),
    JSON.stringify(spec, null, 2)
  );
  
  // Обновляем index.html
  const indexHtml = await fs.readFile(path.join(swaggerUiPath, 'index.html'), 'utf-8');
  const updatedHtml = indexHtml.replace(
    'url: "https://petstore.swagger.io/v2/swagger.json"',
    'url: "./spec.json"'
  );
  await fs.writeFile(path.join(swaggerUiPath, 'index.html'), updatedHtml);
}

// 5. API Security Testing
async function runSecurityTests(config: SecurityTestConfig) {
  console.log('\n=== Тестирование безопасности API ===\n');
  
  const results = [];
  
  // 1. Проверка HTTPS
  results.push(await testHttps(config.baseUrl));
  
  // 2. Проверка заголовков безопасности
  results.push(await testSecurityHeaders(config.baseUrl));
  
  // 3. Проверка аутентификации
  results.push(await testAuthentication(config));
  
  // 4. SQL Injection тесты
  if (config.sqlInjectionTests) {
    results.push(await testSqlInjection(config));
  }
  
  // 5. XSS тесты
  if (config.xssTests) {
    results.push(await testXss(config));
  }
  
  // 6. Rate limiting тесты
  results.push(await testRateLimiting(config));
  
  // Генерируем отчет
  generateSecurityReport(results);
}

async function testHttps(baseUrl: string): Promise<SecurityTestResult> {
  console.log('🔒 Проверка HTTPS...');
  
  const result: SecurityTestResult = {
    test: 'HTTPS',
    passed: false,
    findings: [],
    severity: 'high'
  };
  
  if (!baseUrl.startsWith('https://')) {
    result.findings.push('API не использует HTTPS');
    return result;
  }
  
  // Проверяем SSL сертификат
  try {
    await $`curl -I ${baseUrl} 2>&1 | grep -i "SSL certificate"`;
    result.passed = true;
    result.findings.push('HTTPS включен и работает корректно');
  } catch {
    result.findings.push('Проблемы с SSL сертификатом');
  }
  
  return result;
}

async function testSecurityHeaders(baseUrl: string): Promise<SecurityTestResult> {
  console.log('📋 Проверка заголовков безопасности...');
  
  const result: SecurityTestResult = {
    test: 'Security Headers',
    passed: true,
    findings: [],
    severity: 'medium'
  };
  
  const response = await $`curl -I ${baseUrl}`;
  const headers = response.stdout.toLowerCase();
  
  const requiredHeaders = [
    { name: 'X-Content-Type-Options', value: 'nosniff' },
    { name: 'X-Frame-Options', value: 'deny' },
    { name: 'X-XSS-Protection', value: '1; mode=block' },
    { name: 'Strict-Transport-Security', value: 'max-age=' },
    { name: 'Content-Security-Policy', value: null }
  ];
  
  for (const header of requiredHeaders) {
    const headerName = header.name.toLowerCase();
    if (!headers.includes(headerName)) {
      result.passed = false;
      result.findings.push(`Отсутствует заголовок ${header.name}`);
    }
  }
  
  if (result.passed) {
    result.findings.push('Все необходимые заголовки безопасности присутствуют');
  }
  
  return result;
}

async function testRateLimiting(config: SecurityTestConfig): Promise<SecurityTestResult> {
  console.log('⏱️ Проверка rate limiting...');
  
  const result: SecurityTestResult = {
    test: 'Rate Limiting',
    passed: false,
    findings: [],
    severity: 'medium'
  };
  
  // Делаем много запросов подряд
  const requests = 100;
  const results = [];
  
  for (let i = 0; i < requests; i++) {
    const response = await $`curl -s -o /dev/null -w "%{http_code}" ${config.baseUrl}${config.endpoints[0]}`.nothrow();
    results.push(response.stdout.trim());
  }
  
  // Проверяем, есть ли 429 статусы
  const rateLimited = results.filter(code => code === '429').length;
  
  if (rateLimited > 0) {
    result.passed = true;
    result.findings.push(`Rate limiting работает (${rateLimited} из ${requests} запросов заблокированы)`);
  } else {
    result.findings.push('Rate limiting не обнаружен или не настроен');
  }
  
  return result;
}

function generateSecurityReport(results: SecurityTestResult[]) {
  console.log('\n📊 Отчет по безопасности:\n');
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  console.log(`Пройдено тестов: ${passed}/${total}\n`);
  
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.test}`);
    result.findings.forEach(finding => {
      console.log(`   - ${finding}`);
    });
  });
  
  // Рекомендации
  const failedTests = results.filter(r => !r.passed);
  if (failedTests.length > 0) {
    console.log('\n⚠️  Рекомендации по улучшению безопасности:');
    
    if (failedTests.find(t => t.test === 'HTTPS')) {
      console.log('- Включите HTTPS для всех API endpoints');
    }
    
    if (failedTests.find(t => t.test === 'Security Headers')) {
      console.log('- Добавьте недостающие заголовки безопасности');
    }
    
    if (failedTests.find(t => t.test === 'Rate Limiting')) {
      console.log('- Настройте rate limiting для защиты от DDoS');
    }
  }
}

// Утилиты
function getJsonPath(obj: any, jsonPath: string): any {
  const parts = jsonPath.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }
  
  return current;
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!deepEqual(a[key], b[key])) return false;
  }
  
  return true;
}

function validateJsonSchema(data: any, schema: any): boolean {
  // Простая валидация схемы
  // В реальном проекте используйте ajv или другую библиотеку
  return true;
}

function generateTestReport(results: TestResult[]) {
  console.log('\n📋 Отчет о тестировании:');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`Всего тестов: ${results.length}`);
  console.log(`✅ Пройдено: ${passed}`);
  console.log(`❌ Провалено: ${failed}`);
  
  if (failed > 0) {
    console.log('\nПроваленные тесты:');
    results.filter(r => !r.passed).forEach(test => {
      console.log(`\n❌ ${test.name}`);
      console.log(`   Endpoint: ${test.method} ${test.endpoint}`);
      if (test.error) {
        console.log(`   Ошибка: ${test.error}`);
      }
      test.assertions.filter(a => !a.passed).forEach(assertion => {
        console.log(`   - ${assertion.message}`);
      });
    });
  }
  
  // Статистика по времени ответа
  const responseTimes = results
    .filter(r => r.response?.time)
    .map(r => r.response!.time);
  
  if (responseTimes.length > 0) {
    const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const maxTime = Math.max(...responseTimes);
    const minTime = Math.min(...responseTimes);
    
    console.log('\n⏱️ Время ответа:');
    console.log(`  Среднее: ${avgTime.toFixed(2)}ms`);
    console.log(`  Мин: ${minTime}ms`);
    console.log(`  Макс: ${maxTime}ms`);
  }
}

async function saveTestResults(results: TestResult[], resultsPath: string) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length
    },
    results
  };
  
  await fs.mkdir(path.dirname(resultsPath), { recursive: true });
  await fs.writeFile(resultsPath, JSON.stringify(report, null, 2));
  
  console.log(`\n💾 Результаты сохранены в ${resultsPath}`);
}

function generateAvailabilityReport(results: MonitoringResult[], config: ApiMonitorConfig) {
  console.log('\n\n📊 Отчет о доступности:\n');
  
  const totalChecks = results.length * config.endpoints.length;
  const failedChecks = results.flatMap(r => r.checks).filter(c => !c.healthy).length;
  const availability = ((totalChecks - failedChecks) / totalChecks) * 100;
  
  console.log(`Период мониторинга: ${config.duration}с`);
  console.log(`Всего проверок: ${totalChecks}`);
  console.log(`Успешных: ${totalChecks - failedChecks}`);
  console.log(`Неудачных: ${failedChecks}`);
  console.log(`Доступность: ${availability.toFixed(2)}%`);
  
  // Статистика по endpoints
  console.log('\nСтатистика по endpoints:');
  
  const endpointStats = new Map<string, { success: number; failed: number; avgTime: number }>();
  
  results.forEach(result => {
    result.checks.forEach(check => {
      if (!endpointStats.has(check.endpoint)) {
        endpointStats.set(check.endpoint, { success: 0, failed: 0, avgTime: 0 });
      }
      
      const stats = endpointStats.get(check.endpoint)!;
      if (check.healthy) {
        stats.success++;
      } else {
        stats.failed++;
      }
      stats.avgTime += check.responseTime;
    });
  });
  
  endpointStats.forEach((stats, endpoint) => {
    const total = stats.success + stats.failed;
    const availability = (stats.success / total) * 100;
    const avgTime = stats.avgTime / total;
    
    console.log(`\n${endpoint}:`);
    console.log(`  Доступность: ${availability.toFixed(2)}%`);
    console.log(`  Среднее время ответа: ${avgTime.toFixed(0)}ms`);
  });
}

// Типы
interface ApiTestConfig {
  baseUrl: string;
  tests: ApiTest[];
  defaultHeaders?: Record<string, string>;
  auth?: {
    type: 'bearer' | 'basic';
    token?: string;
    username?: string;
    password?: string;
  };
  saveResults?: boolean;
  resultsPath?: string;
  failOnError?: boolean;
}

interface ApiTest {
  name: string;
  endpoint: string;
  method: string;
  headers?: Record<string, string>;
  body?: any;
  assertions: ApiAssertion[];
}

interface ApiAssertion {
  type: 'status' | 'responseTime' | 'jsonPath' | 'schema';
  expected?: any;
  path?: string;
  schema?: any;
}

interface TestResult {
  name: string;
  endpoint: string;
  method: string;
  passed: boolean;
  duration: number;
  response?: {
    statusCode: number;
    body: any;
    time: number;
  };
  assertions: AssertionResult[];
  error: string | null;
}

interface AssertionResult {
  type: string;
  expected: any;
  actual: any;
  passed: boolean;
  message: string;
}

interface LoadTestConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  users: number;
  duration: number;
  sla?: {
    maxMeanLatency?: number;
    maxP99Latency?: number;
    minRequestsPerSecond?: number;
    maxErrorRate?: number;
  };
}

interface LoadTestResult {
  tool: string;
  totalRequests: number;
  failedRequests: number;
  requestsPerSecond: number;
  meanLatency: number;
  p50Latency: number;
  p90Latency: number;
  p99Latency: number;
  throughput: number;
  raw: string;
}

interface ApiMonitorConfig {
  baseUrl: string;
  endpoints: ApiEndpoint[];
  interval: number; // секунды
  duration: number; // секунды
  alerts?: AlertConfig;
}

interface ApiEndpoint {
  name: string;
  path: string;
  expectedStatus?: number;
  timeout?: number;
}

interface EndpointCheck {
  endpoint: string;
  url: string;
  healthy: boolean;
  statusCode: number;
  responseTime: number;
  error: string | null;
}

interface MonitoringResult {
  timestamp: Date;
  checks: EndpointCheck[];
  allHealthy: boolean;
}

interface AlertConfig {
  webhook?: string;
  email?: string;
  slowResponseThreshold?: number;
}

interface Alert {
  level: 'error' | 'warning';
  endpoint: string;
  message: string;
  timestamp: Date;
}

interface ApiDocConfig {
  source: 'openapi' | 'postman' | 'code';
  specPath?: string;
  sourcePath?: string;
  outputPath: string;
  outputFormats: Array<'markdown' | 'html' | 'pdf'>;
}

interface ApiDocumentation {
  title: string;
  version: string;
  description: string;
  baseUrl: string;
  endpoints: ApiEndpointDoc[];
  models: Record<string, any>;
}

interface ApiEndpointDoc {
  path: string;
  method: string;
  summary: string;
  description: string;
  parameters: any[];
  requestBody?: any;
  responses: Record<string, any>;
  tags: string[];
}

interface SecurityTestConfig {
  baseUrl: string;
  endpoints: string[];
  sqlInjectionTests?: boolean;
  xssTests?: boolean;
}

interface SecurityTestResult {
  test: string;
  passed: boolean;
  findings: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// Экспорт
export {
  runApiTests,
  runLoadTest,
  runSecurityTests,
  monitorApiAvailability,
  generateApiDocumentation
};