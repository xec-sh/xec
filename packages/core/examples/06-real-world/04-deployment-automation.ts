/**
 * 04. Deployment Automation - Автоматизация развертывания
 * 
 * Показывает реальные сценарии развертывания приложений.
 * 
 * ВАЖНО: В @xec-sh/core нет встроенных утилит для развертывания.
 * Для передачи файлов используются стандартные команды shell.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { $, withTempDir } from '@xec-sh/core';

// 1. Многосерверное развертывание
interface DeploymentTarget {
  name: string;
  host: string;
  username: string;
  privateKey: string;
  deployPath: string;
  environment: 'production' | 'staging' | 'development';
  role: 'web' | 'api' | 'worker' | 'database';
}

async function multiServerDeployment(
  targets: DeploymentTarget[],
  config: DeploymentConfig
) {
  console.log('\n=== Многосерверное развертывание ===\n');
  console.log(`Версия: ${config.version}`);
  console.log(`Ветка: ${config.branch}`);
  console.log(`Серверов: ${targets.length}\n`);
  
  // Создаем артефакт для развертывания
  const artifactPath = await createDeploymentArtifact(config);
  
  // Группируем серверы по ролям
  const serversByRole = groupBy(targets, 'role');
  const deploymentOrder = ['database', 'api', 'worker', 'web'];
  
  const results = [];
  
  for (const role of deploymentOrder) {
    const servers = serversByRole[role] || [];
    if (servers.length === 0) continue;
    
    console.log(`\n📦 Развертывание ${role} серверов (${servers.length})...`);
    
    // Развертываем параллельно в пределах одной роли
    const roleResults = await deployToServers(servers, artifactPath, config);
    results.push(...roleResults);
    
    // Проверяем здоровье после развертывания роли
    if (config.healthCheck) {
      await performHealthChecks(servers, config);
    }
  }
  
  // Отчет о развертывании
  generateDeploymentReport(results, config);
  
  // Очищаем артефакт
  await $`rm -f ${artifactPath}`;
  
  return results;
}

async function createDeploymentArtifact(config: DeploymentConfig): Promise<string> {
  console.log('🔨 Создание артефакта...');
  
  // withTempDir принимает callback который возвращает значение
  const artifactPath = await withTempDir(async (tmpDir) => {
    const buildDir = path.join(tmpDir.path, 'build');
    
    // Клонируем репозиторий
    await $`git clone --branch ${config.branch} --depth 1 ${config.repository} ${buildDir}`;
    
    // Создаём $ с рабочей директорией
    const $build = $.cd(buildDir);
    await $build`npm ci --production`;
    await $build`npm run build`;
    
    // Создаем метаданные
    const metadata = {
      version: config.version,
      branch: config.branch,
      commit: await $build`git rev-parse HEAD`.then(r => r.stdout.trim()),
      buildTime: new Date().toISOString(),
      buildHost: await $`hostname`.then(r => r.stdout.trim())
    };
    
    await fs.writeFile(
      path.join(buildDir, 'deployment.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    // Архивируем
    const artifactName = `deploy-${config.version}-${Date.now()}.tar.gz`;
    await $`tar -czf ${artifactName} -C ${buildDir} .`;
    
    return path.resolve(artifactName);
  });
  
  return artifactPath;
}

async function deployToServers(
  servers: DeploymentTarget[],
  artifactPath: string,
  config: DeploymentConfig
): Promise<DeploymentResult[]> {
  console.log(`Развертывание на ${servers.length} серверах...`);
  let deployed = 0;
  
  const deploymentPromises = servers.map(async (server) => {
    const result: DeploymentResult = {
      server: server.name,
      status: 'pending',
      startTime: new Date(),
      endTime: null,
      error: null,
      rollbackVersion: null
    };
    
    try {
      // Создаём $ с SSH адаптером
      const $ssh = $.with({
        adapter: 'ssh',
        sshOptions: {
          host: server.host,
          username: server.username,
          privateKey: server.privateKey
        }
      });
      
      // Сохраняем текущую версию для отката
      result.rollbackVersion = await getCurrentVersion($ssh, server.deployPath);
      
      // Подготовка директории
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const releaseDir = `${server.deployPath}/releases/${timestamp}`;
      
      await $ssh`mkdir -p ${releaseDir}`;
      
      // Загружаем артефакт через scp
      await $`scp -i ${server.privateKey} ${artifactPath} ${server.username}@${server.host}:${releaseDir}/artifact.tar.gz`;
      
      // Распаковываем
      await $ssh`cd ${releaseDir} && tar -xzf artifact.tar.gz && rm artifact.tar.gz`;
      
      // Устанавливаем переменные окружения
      await $ssh`cp ${server.deployPath}/shared/.env ${releaseDir}/.env || true`;
      
      // Выполняем pre-deploy хуки
      if (config.hooks?.preDeploy) {
        await $ssh`cd ${releaseDir} && ${config.hooks.preDeploy}`;
      }
      
      // Останавливаем старую версию
      await $ssh`cd ${server.deployPath}/current && npm run stop || true`;
      
      // Обновляем симлинк
      await $ssh`ln -sfn ${releaseDir} ${server.deployPath}/current`;
      
      // Запускаем новую версию
      await $ssh`cd ${server.deployPath}/current && npm run start:${server.environment}`;
      
      // Выполняем post-deploy хуки
      if (config.hooks?.postDeploy) {
        await $ssh`cd ${server.deployPath}/current && ${config.hooks.postDeploy}`;
      }
      
      // Очищаем старые релизы
      await cleanupOldReleases($ssh, server.deployPath, config.keepReleases || 5);
      
      result.status = 'success';
      result.endTime = new Date();
      
    } catch (error) {
      result.status = 'failed';
      result.error = (error as Error).message;
      result.endTime = new Date();
      
      // Пытаемся откатиться
      if (config.autoRollback && result.rollbackVersion) {
        await rollbackDeployment(server, result.rollbackVersion);
      }
    }
    
    deployed++;
    process.stdout.write(`\rРазвернуто: ${deployed}/${servers.length}`);
    return result;
  });
  
  const results = await Promise.all(deploymentPromises);
  console.log(''); // Новая строка
  
  return results;
}

async function getCurrentVersion($ssh: any, deployPath: string): Promise<string | null> {
  try {
    const result = await $ssh`readlink ${deployPath}/current`;
    return path.basename(result.stdout.trim());
  } catch {
    return null;
  }
}

async function cleanupOldReleases($ssh: any, deployPath: string, keepCount: number) {
  // Получаем список релизов
  const releases = await $ssh`ls -t ${deployPath}/releases`;
  const releaseList = releases.stdout.trim().split('\n').filter(Boolean);
  
  if (releaseList.length > keepCount) {
    const toDelete = releaseList.slice(keepCount);
    for (const release of toDelete) {
      await $ssh`rm -rf ${deployPath}/releases/${release}`;
    }
    console.log(`  Удалено старых релизов: ${toDelete.length}`);
  }
}

// 2. Blue-Green развертывание
async function blueGreenDeployment(
  config: BlueGreenConfig
) {
  console.log('\n=== Blue-Green развертывание ===\n');
  
  const $ssh = $.with({
    adapter: 'ssh',
    sshOptions: {
      host: config.host,
      username: config.username,
      privateKey: config.privateKey
    }
  });
  
  // Определяем текущее окружение
  const currentEnv = await $ssh`cat ${config.basePath}/current-env 2>/dev/null || echo "blue"`;
  const activeEnv = currentEnv.stdout.trim();
  const inactiveEnv = activeEnv === 'blue' ? 'green' : 'blue';
  
  console.log(`Текущее окружение: ${activeEnv}`);
  console.log(`Развертывание в: ${inactiveEnv}`);
  
  try {
    // 1. Развертываем в неактивное окружение
    console.log(`\n1️⃣ Развертывание в ${inactiveEnv}...`);
    const deployPath = `${config.basePath}/${inactiveEnv}`;
    
    await $ssh`cd ${deployPath} && git pull origin ${config.branch}`;
    await $ssh`cd ${deployPath} && npm ci --production`;
    await $ssh`cd ${deployPath} && npm run build`;
    
    // 2. Запускаем в неактивном окружении
    console.log(`\n2️⃣ Запуск ${inactiveEnv} окружения...`);
    const inactivePort = inactiveEnv === 'blue' ? config.bluePort : config.greenPort;
    
    await $ssh`cd ${deployPath} && PORT=${inactivePort} npm run start:bg`;
    
    // 3. Прогрев приложения
    console.log('\n3️⃣ Прогрев приложения...');
    await warmupApplication(`http://${config.host}:${inactivePort}`, config.warmupEndpoints);
    
    // 4. Проверка здоровья
    console.log('\n4️⃣ Проверка здоровья...');
    const healthCheck = await checkApplicationHealth(
      `http://${config.host}:${inactivePort}/health`
    );
    
    if (!healthCheck.healthy) {
      throw new Error(`Health check failed: ${healthCheck.error}`);
    }
    
    // 5. Переключение трафика
    console.log('\n5️⃣ Переключение трафика...');
    await switchTraffic($ssh, config, inactiveEnv);
    
    // 6. Обновляем текущее окружение
    await $ssh`echo "${inactiveEnv}" > ${config.basePath}/current-env`;
    
    // 7. Останавливаем старое окружение (с задержкой)
    console.log(`\n6️⃣ Остановка ${activeEnv} окружения через 30 секунд...`);
    setTimeout(async () => {
      const activePort = activeEnv === 'blue' ? config.bluePort : config.greenPort;
      await $ssh`fuser -k ${activePort}/tcp || true`;
      console.log(`✅ ${activeEnv} окружение остановлено`);
    }, 30000);
    
    console.log('\n✅ Blue-Green развертывание завершено успешно!');
    
  } catch (error) {
    console.error('\n❌ Ошибка развертывания:', error.message);
    console.log('Откатываемся на предыдущее окружение...');
    
    // Откат не требуется - старое окружение все еще работает
    console.log(`✅ Трафик остается на ${activeEnv} окружении`);
    throw error;
  }
}

async function warmupApplication(baseUrl: string, endpoints: string[]) {
  console.log('Прогрев приложения...');
  
  for (const endpoint of endpoints) {
    process.stdout.write(`\rПрогрев ${endpoint}...`);
    try {
      await $`curl -s ${baseUrl}${endpoint} > /dev/null`;
    } catch {
      // Игнорируем ошибки прогрева
    }
  }
  
  console.log('\n✅ Прогрев завершен');
}

async function checkApplicationHealth(healthUrl: string, retries = 5): Promise<HealthCheckResult> {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await $`curl -s -f ${healthUrl}`;
      const health = JSON.parse(result.stdout);
      
      if (health.status === 'ok' || health.healthy === true) {
        return { healthy: true, details: health };
      }
    } catch (error) {
      if (i === retries - 1) {
        return { healthy: false, error: error.message };
      }
      // Ждем перед повтором
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return { healthy: false, error: 'Health check timeout' };
}

async function switchTraffic($ssh: any, config: BlueGreenConfig, targetEnv: string) {
  const targetPort = targetEnv === 'blue' ? config.bluePort : config.greenPort;
  
  // Обновляем конфигурацию nginx
  const nginxConfig = `
upstream app {
    server 127.0.0.1:${targetPort};
}

server {
    listen 80;
    server_name ${config.domain};
    
    location / {
        proxy_pass http://app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
`;
  
  await $ssh`echo '${nginxConfig}' | sudo tee /etc/nginx/sites-available/${config.domain}`;
  await $ssh`sudo nginx -t`;
  await $ssh`sudo nginx -s reload`;
}

// 3. Канареечное развертывание
async function canaryDeployment(
  config: CanaryConfig,
  servers: DeploymentTarget[]
) {
  console.log('\n=== Канареечное развертывание ===\n');
  console.log(`Стратегия: ${config.strategy}`);
  console.log(`Этапы: ${config.stages.map(s => `${s.percentage}%`).join(' → ')}\n`);
  
  const totalServers = servers.length;
  let deployedServers = 0;
  
  for (const stage of config.stages) {
    const serversInStage = Math.ceil(totalServers * stage.percentage / 100);
    const targetServers = servers.slice(deployedServers, deployedServers + serversInStage);
    
    console.log(`\n🕊️ Этап ${stage.name}: ${stage.percentage}% (${targetServers.length} серверов)`);
    
    // Развертываем на целевых серверах
    const results = await deployToServers(targetServers, config.artifactPath, config);
    
    // Проверяем результаты
    const failed = results.filter(r => r.status === 'failed');
    if (failed.length > 0) {
      console.error(`❌ Развертывание провалилось на ${failed.length} серверах`);
      
      if (config.rollbackOnFailure) {
        await rollbackCanaryDeployment(servers.slice(0, deployedServers + serversInStage));
      }
      
      throw new Error('Canary deployment failed');
    }
    
    // Мониторим метрики
    console.log(`\n📊 Мониторинг метрик (${stage.monitorDuration}с)...`);
    const metrics = await monitorCanaryMetrics(
      targetServers,
      stage.monitorDuration,
      config.metrics
    );
    
    // Анализируем метрики
    const analysis = analyzeCanaryMetrics(metrics, config.thresholds);
    
    if (!analysis.healthy) {
      console.error('❌ Метрики не соответствуют порогам:');
      analysis.violations.forEach(v => console.error(`  - ${v}`));
      
      if (config.rollbackOnFailure) {
        await rollbackCanaryDeployment(servers.slice(0, deployedServers + serversInStage));
      }
      
      throw new Error('Canary metrics validation failed');
    }
    
    console.log('✅ Метрики в норме');
    deployedServers += serversInStage;
    
    // Пауза между этапами
    if (stage.pauseAfter && deployedServers < totalServers) {
      console.log(`\n⏸️ Пауза ${stage.pauseAfter}с перед следующим этапом...`);
      await new Promise(resolve => setTimeout(resolve, stage.pauseAfter * 1000));
    }
  }
  
  console.log('\n✅ Канареечное развертывание завершено успешно!');
}

async function monitorCanaryMetrics(
  servers: DeploymentTarget[],
  duration: number,
  metricsConfig: MetricsConfig
): Promise<CanaryMetrics> {
  const startTime = Date.now();
  const metrics: CanaryMetrics = {
    errorRate: [],
    responseTime: [],
    cpu: [],
    memory: []
  };
  
  process.stdout.write('Сбор метрик...');
  
  while (Date.now() - startTime < duration * 1000) {
    const timestamp = Date.now();
    
    // Собираем метрики со всех серверов
    const serverMetrics = await Promise.all(
      servers.map(server => collectServerMetrics(server, metricsConfig))
    );
    
    // Агрегируем метрики
    const aggregated = aggregateMetrics(serverMetrics);
    
    metrics.errorRate.push({ timestamp, value: aggregated.errorRate });
    metrics.responseTime.push({ timestamp, value: aggregated.responseTime });
    metrics.cpu.push({ timestamp, value: aggregated.cpu });
    metrics.memory.push({ timestamp, value: aggregated.memory });
    
    process.stdout.write(`\rМетрики: Ошибки ${aggregated.errorRate.toFixed(2)}% | Отклик ${aggregated.responseTime}ms | CPU ${aggregated.cpu.toFixed(1)}%`);
    
    // Ждем перед следующим сбором
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  console.log(''); // Новая строка
  return metrics;
}

async function collectServerMetrics(
  server: DeploymentTarget,
  config: MetricsConfig
): Promise<ServerMetrics> {
  const $ssh = $.with({
    adapter: 'ssh',
    sshOptions: {
      host: server.host,
      username: server.username,
      privateKey: server.privateKey
    }
  });
  
  try {
    // Получаем метрики приложения
    const appMetrics = await $ssh`curl -s http://localhost:${config.metricsPort}/metrics`;
    const metrics = JSON.parse(appMetrics.stdout);
    
    // Получаем системные метрики
    const cpu = await $ssh`top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`;
    const memory = await $ssh`free | grep Mem | awk '{print ($3/$2) * 100}'`;
    
    return {
      errorRate: metrics.errorRate || 0,
      responseTime: metrics.responseTime || 0,
      cpu: parseFloat(cpu.stdout),
      memory: parseFloat(memory.stdout)
    };
  } catch {
    // Возвращаем дефолтные значения при ошибке
    return {
      errorRate: 0,
      responseTime: 0,
      cpu: 0,
      memory: 0
    };
  }
}

function aggregateMetrics(serverMetrics: ServerMetrics[]): ServerMetrics {
  const count = serverMetrics.length;
  
  return {
    errorRate: serverMetrics.reduce((sum, m) => sum + m.errorRate, 0) / count,
    responseTime: serverMetrics.reduce((sum, m) => sum + m.responseTime, 0) / count,
    cpu: serverMetrics.reduce((sum, m) => sum + m.cpu, 0) / count,
    memory: serverMetrics.reduce((sum, m) => sum + m.memory, 0) / count
  };
}

function analyzeCanaryMetrics(
  metrics: CanaryMetrics,
  thresholds: MetricThresholds
): MetricsAnalysis {
  const violations = [];
  
  // Проверяем средние значения
  const avgErrorRate = average(metrics.errorRate.map(m => m.value));
  const avgResponseTime = average(metrics.responseTime.map(m => m.value));
  const avgCpu = average(metrics.cpu.map(m => m.value));
  const avgMemory = average(metrics.memory.map(m => m.value));
  
  if (avgErrorRate > thresholds.maxErrorRate) {
    violations.push(`Error rate ${avgErrorRate.toFixed(2)}% exceeds threshold ${thresholds.maxErrorRate}%`);
  }
  
  if (avgResponseTime > thresholds.maxResponseTime) {
    violations.push(`Response time ${avgResponseTime}ms exceeds threshold ${thresholds.maxResponseTime}ms`);
  }
  
  if (avgCpu > thresholds.maxCpu) {
    violations.push(`CPU usage ${avgCpu.toFixed(1)}% exceeds threshold ${thresholds.maxCpu}%`);
  }
  
  if (avgMemory > thresholds.maxMemory) {
    violations.push(`Memory usage ${avgMemory.toFixed(1)}% exceeds threshold ${thresholds.maxMemory}%`);
  }
  
  return {
    healthy: violations.length === 0,
    violations,
    metrics: {
      errorRate: avgErrorRate,
      responseTime: avgResponseTime,
      cpu: avgCpu,
      memory: avgMemory
    }
  };
}

// 4. Откат развертывания
async function rollbackDeployment(
  server: DeploymentTarget,
  version: string
) {
  console.log(`\n🔄 Откат на ${server.name} к версии ${version}...`);
  
  const $ssh = $.with({
    adapter: 'ssh',
    sshOptions: {
      host: server.host,
      username: server.username,
      privateKey: server.privateKey
    }
  });
  
  try {
    // Останавливаем текущую версию
    await $ssh`cd ${server.deployPath}/current && npm run stop || true`;
    
    // Восстанавливаем предыдущую версию
    await $ssh`ln -sfn ${server.deployPath}/releases/${version} ${server.deployPath}/current`;
    
    // Запускаем восстановленную версию
    await $ssh`cd ${server.deployPath}/current && npm run start:${server.environment}`;
    
    console.log(`✅ Откат на ${server.name} завершен`);
  } catch (error) {
    console.error(`❌ Ошибка отката на ${server.name}:`, error.message);
    throw error;
  }
}

async function rollbackCanaryDeployment(servers: DeploymentTarget[]) {
  console.log('\n🔄 Откат канареечного развертывания...');
  
  const rollbackPromises = servers.map(async server => {
    const version = await getDeploymentHistory(server);
    if (version) {
      await rollbackDeployment(server, version);
    }
  });
  
  await Promise.all(rollbackPromises);
  console.log('✅ Откат завершен');
}

async function getDeploymentHistory(server: DeploymentTarget): Promise<string | null> {
  const $ssh = $.with({
    adapter: 'ssh',
    sshOptions: {
      host: server.host,
      username: server.username,
      privateKey: server.privateKey
    }
  });
  
  try {
    const history = await $ssh`ls -t ${server.deployPath}/releases | head -2 | tail -1`;
    return history.stdout.trim();
  } catch {
    return null;
  }
}

// 5. Health checks
async function performHealthChecks(
  servers: DeploymentTarget[],
  config: DeploymentConfig
) {
  console.log('\n🏥 Проверка здоровья...');
  
  const healthPromises = servers.map(async server => {
    const url = `http://${server.host}:${config.healthCheckPort}/health`;
    const result = await checkApplicationHealth(url);
    
    return {
      server: server.name,
      healthy: result.healthy,
      details: result.details || result.error
    };
  });
  
  const results = await Promise.all(healthPromises);
  
  results.forEach(r => {
    const icon = r.healthy ? '✅' : '❌';
    console.log(`${icon} ${r.server}: ${r.healthy ? 'OK' : 'FAIL'}`);
    if (!r.healthy) {
      console.log(`   Детали: ${r.details}`);
    }
  });
  
  const unhealthy = results.filter(r => !r.healthy);
  if (unhealthy.length > 0) {
    throw new Error(`Health check failed on ${unhealthy.length} servers`);
  }
}

// 6. Отчеты
function generateDeploymentReport(
  results: DeploymentResult[],
  config: DeploymentConfig
) {
  console.log('\n📋 Отчет о развертывании');
  console.log('=' .repeat(50));
  console.log(`Версия: ${config.version}`);
  console.log(`Время: ${new Date().toISOString()}`);
  console.log(`Всего серверов: ${results.length}`);
  
  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'failed');
  
  console.log(`Успешно: ${successful.length}`);
  console.log(`Провалено: ${failed.length}`);
  
  if (failed.length > 0) {
    console.log('\nПроваленные серверы:');
    failed.forEach(r => {
      console.log(`  - ${r.server}: ${r.error}`);
    });
  }
  
  // Время развертывания
  const deploymentTimes = successful.map(r => 
    (r.endTime.getTime() - r.startTime.getTime()) / 1000
  );
  
  if (deploymentTimes.length > 0) {
    const avgTime = average(deploymentTimes);
    const maxTime = Math.max(...deploymentTimes);
    const minTime = Math.min(...deploymentTimes);
    
    console.log('\nВремя развертывания:');
    console.log(`  Среднее: ${avgTime.toFixed(1)}с`);
    console.log(`  Мин: ${minTime.toFixed(1)}с`);
    console.log(`  Макс: ${maxTime.toFixed(1)}с`);
  }
}

// Утилиты
function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((result, item) => {
    const group = String(item[key]);
    if (!result[group]) result[group] = [];
    result[group].push(item);
    return result;
  }, {} as Record<string, T[]>);
}

function average(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

// Типы
interface DeploymentConfig {
  version: string;
  branch: string;
  repository: string;
  keepReleases?: number;
  healthCheck?: boolean;
  healthCheckPort?: number;
  autoRollback?: boolean;
  hooks?: {
    preDeploy?: string;
    postDeploy?: string;
  };
}

interface DeploymentResult {
  server: string;
  status: 'pending' | 'success' | 'failed';
  startTime: Date;
  endTime: Date | null;
  error: string | null;
  rollbackVersion: string | null;
}

interface BlueGreenConfig {
  host: string;
  username: string;
  privateKey: string;
  basePath: string;
  branch: string;
  domain: string;
  bluePort: number;
  greenPort: number;
  warmupEndpoints: string[];
}

interface CanaryConfig extends DeploymentConfig {
  strategy: 'linear' | 'exponential';
  stages: Array<{
    name: string;
    percentage: number;
    monitorDuration: number;
    pauseAfter?: number;
  }>;
  metrics: MetricsConfig;
  thresholds: MetricThresholds;
  rollbackOnFailure: boolean;
  artifactPath: string;
}

interface MetricsConfig {
  metricsPort: number;
  endpoints: string[];
}

interface MetricThresholds {
  maxErrorRate: number;
  maxResponseTime: number;
  maxCpu: number;
  maxMemory: number;
}

interface CanaryMetrics {
  errorRate: Array<{ timestamp: number; value: number }>;
  responseTime: Array<{ timestamp: number; value: number }>;
  cpu: Array<{ timestamp: number; value: number }>;
  memory: Array<{ timestamp: number; value: number }>;
}

interface ServerMetrics {
  errorRate: number;
  responseTime: number;
  cpu: number;
  memory: number;
}

interface MetricsAnalysis {
  healthy: boolean;
  violations: string[];
  metrics: ServerMetrics;
}

interface HealthCheckResult {
  healthy: boolean;
  details?: any;
  error?: string;
}

// Экспорт
export {
  canaryDeployment,
  rollbackDeployment,
  blueGreenDeployment,
  performHealthChecks,
  multiServerDeployment
};