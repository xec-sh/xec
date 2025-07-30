/**
 * 03. System Monitoring - Системный мониторинг
 * 
 * Показывает реальные сценарии мониторинга систем.
 * 
 * ВАЖНО: В @xec-sh/core нет встроенных утилит для мониторинга.
 * Метрики собираются через стандартные команды shell.
 */

import { $ } from '@xec-sh/core';
import * as fs from 'fs/promises';

// 1. Мониторинг ресурсов системы
async function systemResourceMonitor() {
  console.log('\n=== Мониторинг системных ресурсов ===\n');
  
  const interval = 5000; // 5 секунд
  const duration = 30000; // 30 секунд
  
  console.log('Мониторинг начат...');
  
  const metrics: any[] = [];
  const startTime = Date.now();
  
  while (Date.now() - startTime < duration) {
    // Собираем метрики параллельно
    const [cpu, memory, disk, network] = await Promise.all([
      getCpuUsage(),
      getMemoryUsage(),
      getDiskUsage(),
      getNetworkStats()
    ]);
    
    const timestamp = new Date().toISOString();
    metrics.push({
      timestamp,
      cpu,
      memory,
      disk,
      network
    });
    
    process.stdout.write(`\rCPU: ${cpu.usage}% | RAM: ${memory.usedPercent}% | Disk: ${disk.usedPercent}%`);
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  console.log('\n✓ Мониторинг завершён');
  
  // Анализ результатов
  analyzeMetrics(metrics);
  
  // Сохранение отчёта
  await saveMonitoringReport(metrics);
}

async function getCpuUsage() {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    // macOS
    const result = await $`top -l 1 -n 0 | grep "CPU usage"`;
    const match = result.stdout.match(/(\d+\.\d+)% user/);
    return {
      usage: match ? parseFloat(match[1]) : 0,
      cores: await $`sysctl -n hw.ncpu`.then(r => parseInt(r.stdout))
    };
  } else if (platform === 'linux') {
    // Linux
    const result = await $`top -bn1 | grep "Cpu(s)"`;
    const match = result.stdout.match(/(\d+\.\d+)%us/);
    return {
      usage: match ? parseFloat(match[1]) : 0,
      cores: await $`nproc`.then(r => parseInt(r.stdout))
    };
  }
  
  return { usage: 0, cores: 1 };
}

async function getMemoryUsage() {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    // macOS
    const result = await $`vm_stat | grep -E "^Pages (free|active|inactive|speculative|wired down):"`;
    const pageSize = 4096; // байт
    const stats = {};
    
    result.stdout.split('\n').forEach(line => {
      const match = line.match(/Pages (\w+):\s+(\d+)/);
      if (match) {
        stats[match[1]] = parseInt(match[2]) * pageSize;
      }
    });
    
    const total = await $`sysctl -n hw.memsize`.then(r => parseInt(r.stdout));
    const free = (stats.free || 0) + (stats.speculative || 0);
    const used = total - free;
    
    return {
      total,
      used,
      free,
      usedPercent: Math.round((used / total) * 100)
    };
  } else if (platform === 'linux') {
    // Linux
    const result = await $`free -b | grep Mem`;
    const [, total, used, free] = result.stdout.split(/\s+/).map(n => parseInt(n));
    
    return {
      total,
      used,
      free,
      usedPercent: Math.round((used / total) * 100)
    };
  }
  
  return { total: 0, used: 0, free: 0, usedPercent: 0 };
}

async function getDiskUsage() {
  const result = await $`df -k / | tail -1`;
  const parts = result.stdout.trim().split(/\s+/);
  
  const total = parseInt(parts[1]) * 1024;
  const used = parseInt(parts[2]) * 1024;
  const available = parseInt(parts[3]) * 1024;
  const usedPercent = parseInt(parts[4]);
  
  return {
    total,
    used,
    available,
    usedPercent,
    mountpoint: '/'
  };
}

async function getNetworkStats() {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    // macOS - получаем основной интерфейс
    const iface = await $`route get default | grep interface | awk '{print $2}'`;
    const ifaceName = iface.stdout.trim();
    
    const result = await $`netstat -ib | grep ${ifaceName} | head -1`;
    const parts = result.stdout.trim().split(/\s+/);
    
    return {
      interface: ifaceName,
      rxBytes: parseInt(parts[6]) || 0,
      txBytes: parseInt(parts[9]) || 0
    };
  } else if (platform === 'linux') {
    // Linux
    const result = await $`cat /proc/net/dev | grep -E "eth0|ens|wlan0" | head -1`;
    const parts = result.stdout.trim().split(/\s+/);
    
    return {
      interface: parts[0].replace(':', ''),
      rxBytes: parseInt(parts[1]) || 0,
      txBytes: parseInt(parts[9]) || 0
    };
  }
  
  return { interface: 'unknown', rxBytes: 0, txBytes: 0 };
}

function analyzeMetrics(metrics: any[]) {
  console.log('\n=== Анализ метрик ===\n');
  
  // CPU анализ
  const cpuValues = metrics.map(m => m.cpu.usage);
  const avgCpu = cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length;
  const maxCpu = Math.max(...cpuValues);
  const minCpu = Math.min(...cpuValues);
  
  console.log(`CPU использование:`);
  console.log(`  Среднее: ${avgCpu.toFixed(2)}%`);
  console.log(`  Максимум: ${maxCpu.toFixed(2)}%`);
  console.log(`  Минимум: ${minCpu.toFixed(2)}%`);
  
  // Memory анализ
  const memValues = metrics.map(m => m.memory.usedPercent);
  const avgMem = memValues.reduce((a, b) => a + b, 0) / memValues.length;
  
  console.log(`\nПамять использование:`);
  console.log(`  Среднее: ${avgMem.toFixed(2)}%`);
  console.log(`  Всего: ${formatBytes(metrics[0].memory.total)}`);
  
  // Disk
  console.log(`\nДиск использование:`);
  console.log(`  Использовано: ${metrics[0].disk.usedPercent}%`);
  console.log(`  Всего: ${formatBytes(metrics[0].disk.total)}`);
  console.log(`  Доступно: ${formatBytes(metrics[0].disk.available)}`);
}

async function saveMonitoringReport(metrics: any[]) {
  const report = {
    startTime: metrics[0].timestamp,
    endTime: metrics[metrics.length - 1].timestamp,
    sampleCount: metrics.length,
    metrics
  };
  
  const filename = `monitoring-${new Date().toISOString().split('T')[0]}.json`;
  await fs.writeFile(filename, JSON.stringify(report, null, 2));
  
  console.log(`\nОтчёт сохранён: ${filename}`);
}

// 2. Мониторинг процессов
async function processMonitor(processName?: string) {
  console.log('\n=== Мониторинг процессов ===\n');
  
  const platform = process.platform;
  let command: string;
  
  if (platform === 'darwin') {
    command = processName 
      ? `ps aux | grep "${processName}" | grep -v grep`
      : 'ps aux | head -20';
  } else {
    command = processName
      ? `ps aux | grep "${processName}" | grep -v grep`
      : 'ps aux --sort=-%cpu | head -20';
  }
  
  const result = await $`${command}`.nothrow();
  
  if (!result.ok || !result.stdout.trim()) {
    console.log(`Процесс ${processName} не найден`);
    return;
  }
  
  // Парсим вывод ps
  const lines = result.stdout.trim().split('\n');
  const processes = lines.map(line => {
    const parts = line.split(/\s+/);
    return {
      user: parts[0],
      pid: parseInt(parts[1]),
      cpu: parseFloat(parts[2]),
      mem: parseFloat(parts[3]),
      command: parts.slice(10).join(' ')
    };
  });
  
  // Сортируем по CPU
  processes.sort((a, b) => b.cpu - a.cpu);
  
  console.log('Топ процессов по CPU:');
  console.log('PID\tCPU%\tMEM%\tКоманда');
  processes.slice(0, 10).forEach(p => {
    console.log(`${p.pid}\t${p.cpu.toFixed(1)}\t${p.mem.toFixed(1)}\t${p.command.substring(0, 50)}`);
  });
  
  // Проверяем критические процессы
  const criticalProcesses = processes.filter(p => p.cpu > 80 || p.mem > 50);
  if (criticalProcesses.length > 0) {
    console.log('\n⚠️  Внимание! Процессы с высоким потреблением ресурсов:');
    criticalProcesses.forEach(p => {
      console.log(`  PID ${p.pid}: CPU ${p.cpu}%, MEM ${p.mem}%`);
    });
  }
}

// 3. Мониторинг логов
async function logMonitor(logFile: string, patterns: string[]) {
  console.log(`\n=== Мониторинг лога: ${logFile} ===\n`);
  
  // Проверяем существование файла
  try {
    await fs.access(logFile);
  } catch {
    console.log(`Файл лога не найден: ${logFile}`);
    return;
  }
  
  // Начальная позиция
  const stats = await fs.stat(logFile);
  let lastPosition = stats.size;
  
  console.log('Мониторинг начат. Нажмите Ctrl+C для остановки.\n');
  
  // Следим за изменениями
  const watcher = fs.watch(logFile);
  
  for await (const event of watcher) {
    if (event.eventType === 'change') {
      // Читаем новые строки
      const currentStats = await fs.stat(logFile);
      const currentPosition = currentStats.size;
      
      if (currentPosition > lastPosition) {
        const buffer = Buffer.alloc(currentPosition - lastPosition);
        const fd = await fs.open(logFile, 'r');
        
        await fd.read(buffer, 0, buffer.length, lastPosition);
        await fd.close();
        
        const newContent = buffer.toString();
        const lines = newContent.split('\n').filter(Boolean);
        
        // Проверяем паттерны
        for (const line of lines) {
          for (const pattern of patterns) {
            if (line.toLowerCase().includes(pattern.toLowerCase())) {
              const timestamp = new Date().toISOString();
              console.log(`[${timestamp}] ${pattern.toUpperCase()}: ${line}`);
              
              // Можно добавить алерты
              if (pattern === 'error' || pattern === 'critical') {
                await sendAlert(pattern, line);
              }
            }
          }
        }
        
        lastPosition = currentPosition;
      }
    }
  }
}

async function sendAlert(level: string, message: string) {
  // Здесь можно отправить уведомление
  console.log(`\n🚨 ALERT [${level.toUpperCase()}]: ${message}\n`);
  
  // Например, через системные уведомления
  if (process.platform === 'darwin') {
    await $`osascript -e 'display notification "${message}" with title "Log Alert: ${level}"'`.nothrow();
  }
}

// 4. Мониторинг сервисов
async function serviceHealthCheck(services: ServiceConfig[]) {
  console.log('\n=== Проверка здоровья сервисов ===\n');
  
  const results: ServiceStatus[] = [];
  let checked = 0;
  
  console.log(`Проверка ${services.length} сервисов...`);
  
  for (const service of services) {
    const startTime = Date.now();
    let status: ServiceStatus = {
      name: service.name,
      url: service.url,
      healthy: false,
      responseTime: 0,
      error: null
    };
    
    try {
      switch (service.type) {
        case 'http':
          status = await checkHttpService(service);
          break;
        case 'tcp':
          status = await checkTcpService(service);
          break;
        case 'process':
          status = await checkProcessService(service);
          break;
      }
    } catch (error) {
      status.error = (error as Error).message;
    }
    
    status.responseTime = Date.now() - startTime;
    results.push(status);
    checked++;
    process.stdout.write(`\rПроверено: ${checked}/${services.length}`);
  }
  
  console.log(''); // Новая строка
  
  // Отчёт
  console.log('\nРезультаты проверки:');
  results.forEach(r => {
    const icon = r.healthy ? '✅' : '❌';
    const time = r.responseTime < 1000 ? `${r.responseTime}ms` : `${(r.responseTime/1000).toFixed(1)}s`;
    console.log(`${icon} ${r.name}: ${r.healthy ? 'OK' : 'FAIL'} (${time})`);
    if (r.error) {
      console.log(`   Ошибка: ${r.error}`);
    }
  });
  
  // Общая статистика
  const healthy = results.filter(r => r.healthy).length;
  const total = results.length;
  console.log(`\nИтого: ${healthy}/${total} сервисов работают`);
  
  if (healthy < total) {
    console.log('\n⚠️  Некоторые сервисы недоступны!');
  }
}

interface ServiceConfig {
  name: string;
  type: 'http' | 'tcp' | 'process';
  url?: string;
  host?: string;
  port?: number;
  processName?: string;
  timeout?: number;
}

interface ServiceStatus {
  name: string;
  url?: string;
  healthy: boolean;
  responseTime: number;
  error?: string | null;
}

async function checkHttpService(service: ServiceConfig): Promise<ServiceStatus> {
  const timeout = service.timeout || 5000;
  
  try {
    // Используем timeout через $.with()
    const $withTimeout = $.with({ timeout });
    const result = await $withTimeout`curl -s -o /dev/null -w "%{http_code}" ${service.url}`;
    
    const statusCode = parseInt(result.stdout.trim());
    const healthy = statusCode >= 200 && statusCode < 400;
    
    return {
      name: service.name,
      url: service.url,
      healthy,
      responseTime: 0,
      error: healthy ? null : `HTTP ${statusCode}`
    };
  } catch (error) {
    return {
      name: service.name,
      url: service.url,
      healthy: false,
      responseTime: 0,
      error: (error as Error).message
    };
  }
}

async function checkTcpService(service: ServiceConfig): Promise<ServiceStatus> {
  const timeout = service.timeout || 5000;
  
  try {
    const $withTimeout = $.with({ timeout });
    await $withTimeout`nc -z -v -w${timeout/1000} ${service.host} ${service.port}`;
    
    return {
      name: service.name,
      healthy: true,
      responseTime: 0,
      error: null
    };
  } catch {
    return {
      name: service.name,
      healthy: false,
      responseTime: 0,
      error: `Cannot connect to ${service.host}:${service.port}`
    };
  }
}

async function checkProcessService(service: ServiceConfig): Promise<ServiceStatus> {
  const result = await $`pgrep -f "${service.processName}"`.nothrow();
  
  return {
    name: service.name,
    healthy: result.ok && result.stdout.trim() !== '',
    responseTime: 0,
    error: result.ok ? null : 'Process not found'
  };
}

// 5. Мониторинг Docker контейнеров
async function dockerMonitor() {
  console.log('\n=== Мониторинг Docker контейнеров ===\n');
  
  // Проверяем, установлен ли Docker
  const dockerCheck = await $`docker --version`.nothrow();
  if (!dockerCheck.ok) {
    console.log('Docker не установлен или недоступен');
    return;
  }
  
  // Получаем список контейнеров
  const containers = await $`docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"`;
  console.log('Активные контейнеры:');
  console.log(containers.stdout);
  
  // Статистика использования ресурсов
  console.log('\nИспользование ресурсов:');
  const stats = await $`docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"`;
  console.log(stats.stdout);
  
  // Проверяем здоровье контейнеров
  const healthChecks = await $`docker ps --format "{{.Names}}" | xargs -I {} docker inspect {} --format '{{.Name}}: {{.State.Health.Status}}'`.nothrow();
  
  if (healthChecks.ok && healthChecks.stdout.trim()) {
    console.log('\nЗдоровье контейнеров:');
    healthChecks.stdout.split('\n').filter(Boolean).forEach(line => {
      const [name, status] = line.split(': ');
      const icon = status === 'healthy' ? '✅' : (status === 'unhealthy' ? '❌' : '⚠️');
      console.log(`${icon} ${name}: ${status || 'no health check'}`);
    });
  }
  
  // Проверяем логи на ошибки
  const containerNames = await $`docker ps --format "{{.Names}}"`;
  const names = containerNames.stdout.trim().split('\n').filter(Boolean);
  
  console.log('\nПоследние ошибки в логах:');
  for (const name of names) {
    const errors = await $`docker logs ${name} --tail 20 2>&1 | grep -i error || true`.nothrow();
    if (errors.stdout.trim()) {
      console.log(`\n${name}:`);
      console.log(errors.stdout.trim().split('\n').slice(0, 3).join('\n'));
    }
  }
}

// 6. Комплексный мониторинг инфраструктуры
async function infrastructureMonitor(config: InfrastructureConfig) {
  console.log('\n=== Комплексный мониторинг инфраструктуры ===\n');
  
  const report: any = {
    timestamp: new Date().toISOString(),
    servers: [],
    services: [],
    alerts: []
  };
  
  // Мониторинг серверов
  console.log('Проверка серверов...');
  for (const server of config.servers) {
    console.log(`Проверка ${server.name}...`);
    
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
      
      // Собираем метрики параллельно
      const [uptime, load, memory, disk] = await Promise.all([
        $ssh`uptime`,
        $ssh`cat /proc/loadavg 2>/dev/null || uptime`,
        $ssh`free -m | grep Mem | awk '{print $3/$2 * 100}'`,
        $ssh`df -h / | tail -1 | awk '{print $5}'`
      ]);
      
      const serverStatus: any = {
        name: server.name,
        host: server.host,
        status: 'online',
        uptime: uptime.stdout.trim(),
        load: load.stdout.trim().split(' ').slice(0, 3).join(' '),
        memoryUsage: parseFloat(memory.stdout.trim()),
        diskUsage: disk.stdout.trim()
      };
      
      report.servers.push(serverStatus);
      
      // Проверяем пороги
      if (serverStatus.memoryUsage > 90) {
        report.alerts.push({
          level: 'critical',
          server: server.name,
          message: `Высокое использование памяти: ${serverStatus.memoryUsage.toFixed(1)}%`
        });
      }
      
      console.log(`✓ ${server.name} - OK`);
    } catch (error) {
      console.error(`❌ ${server.name} - FAIL`);
      report.servers.push({
        name: server.name,
        host: server.host,
        status: 'offline',
        error: (error as Error).message
      });
      
      report.alerts.push({
        level: 'critical',
        server: server.name,
        message: `Сервер недоступен: ${(error as Error).message}`
      });
    }
  }
  
  // Мониторинг сервисов
  console.log('\nПроверка сервисов...');
  report.services = await serviceHealthCheck(config.services);
  
  // Генерация отчёта
  generateInfrastructureReport(report);
  
  // Отправка алертов
  if (report.alerts.length > 0) {
    await sendAlerts(report.alerts);
  }
}

interface InfrastructureConfig {
  servers: Array<{
    name: string;
    host: string;
    username: string;
    privateKey: string;
  }>;
  services: ServiceConfig[];
}

function generateInfrastructureReport(report: any) {
  console.log('\n=== Отчёт о состоянии инфраструктуры ===');
  console.log(`Время: ${report.timestamp}`);
  
  console.log('\nСерверы:');
  report.servers.forEach(server => {
    const icon = server.status === 'online' ? '🟢' : '🔴';
    console.log(`${icon} ${server.name} (${server.host}): ${server.status}`);
    if (server.status === 'online') {
      console.log(`   Загрузка: ${server.load}`);
      console.log(`   Память: ${server.memoryUsage?.toFixed(1)}%`);
      console.log(`   Диск: ${server.diskUsage}`);
    }
  });
  
  console.log('\nСервисы:');
  const healthyServices = report.services.filter(s => s.healthy).length;
  console.log(`Работает: ${healthyServices}/${report.services.length}`);
  
  if (report.alerts.length > 0) {
    console.log('\n⚠️  Алерты:');
    report.alerts.forEach(alert => {
      console.log(`[${alert.level.toUpperCase()}] ${alert.server}: ${alert.message}`);
    });
  }
}

async function sendAlerts(alerts: any[]) {
  // Здесь можно реализовать отправку алертов
  // Например, через webhook, email, SMS и т.д.
  console.log('\n📨 Отправка уведомлений...');
}

// Утилиты
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// Примеры использования
if (import.meta.url === `file://${process.argv[1]}`) {
  // Примеры конфигураций
  const services: ServiceConfig[] = [
    { name: 'Web App', type: 'http', url: 'https://example.com', timeout: 5000 },
    { name: 'API', type: 'http', url: 'https://api.example.com/health', timeout: 3000 },
    { name: 'Database', type: 'tcp', host: 'localhost', port: 5432 },
    { name: 'Redis', type: 'tcp', host: 'localhost', port: 6379 },
    { name: 'Nginx', type: 'process', processName: 'nginx' }
  ];
  
  // await systemResourceMonitor();
  // await processMonitor('node');
  // await serviceHealthCheck(services);
  // await dockerMonitor();
}

export {
  logMonitor,
  dockerMonitor,
  processMonitor,
  serviceHealthCheck,
  systemResourceMonitor,
  infrastructureMonitor
};