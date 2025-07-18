#!/usr/bin/env node
/**
 * System Monitoring with @xec/ush
 * 
 * Real-world examples of system monitoring and alerting using @xec/ush.
 */

import * as os from 'os';
import { $ } from '@xec/ush';

// ===== Monitoring Types =====
interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: [number, number, number];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  disk: Array<{
    filesystem: string;
    size: number;
    used: number;
    available: number;
    percentage: number;
    mountpoint: string;
  }>;
  network: {
    interfaces: Array<{
      name: string;
      rx: number;
      tx: number;
    }>;
  };
  processes: {
    total: number;
    running: number;
    sleeping: number;
    zombie: number;
  };
}

interface Alert {
  level: 'info' | 'warning' | 'critical';
  component: string;
  message: string;
  value?: number;
  threshold?: number;
  timestamp: Date;
}

// ===== System Monitor Class =====
class SystemMonitor {
  private alerts: Alert[] = [];
  private metrics: SystemMetrics[] = [];
  private alertHandlers: ((alert: Alert) => Promise<void>)[] = [];
  
  constructor(
    private thresholds = {
      cpu: { warning: 70, critical: 90 },
      memory: { warning: 80, critical: 95 },
      disk: { warning: 80, critical: 90 },
      loadAverage: { warning: 2, critical: 4 }
    }
  ) {}
  
  // Register alert handler
  onAlert(handler: (alert: Alert) => Promise<void>) {
    this.alertHandlers.push(handler);
  }
  
  // Collect CPU metrics
  private async collectCPUMetrics() {
    const cores = os.cpus().length;
    const loadAverage = os.loadavg() as [number, number, number];
    
    // Get CPU usage
    let cpuUsage = 0;
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const result = await $`top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`.nothrow();
      if (result.exitCode === 0) {
        cpuUsage = parseFloat(result.stdout.trim()) || 0;
      }
    } else if (process.platform === 'win32') {
      const result = await $`wmic cpu get loadpercentage /value`.nothrow();
      const match = result.stdout.match(/LoadPercentage=(\d+)/);
      if (match) {
        cpuUsage = parseInt(match[1]);
      }
    }
    
    return {
      usage: cpuUsage,
      loadAverage,
      cores
    };
  }
  
  // Collect memory metrics
  private async collectMemoryMetrics() {
    if (process.platform === 'darwin') {
      const result = await $`vm_stat | perl -ne '/page size of (\\d+)/ and $size=$1; /Pages free:\\s+(\\d+)/ and printf("%.2f", $1 * $size / 1048576); /Pages active:\\s+(\\d+)/ and printf(" %.2f", $1 * $size / 1048576); /Pages inactive:\\s+(\\d+)/ and printf(" %.2f", $1 * $size / 1048576); /Pages wired down:\\s+(\\d+)/ and printf(" %.2f\\n", $1 * $size / 1048576);'`;
      const [free, active, inactive, wired] = result.stdout.trim().split(' ').map(Number);
      const total = os.totalmem() / 1024 / 1024; // MB
      const used = active + wired;
      
      return {
        total,
        used,
        free: free + inactive,
        percentage: (used / total) * 100
      };
    } else if (process.platform === 'linux') {
      const result = await $`free -m | grep "^Mem:"`;
      const parts = result.stdout.trim().split(/\s+/);
      const total = parseInt(parts[1]);
      const used = parseInt(parts[2]);
      const free = parseInt(parts[3]);
      
      return {
        total,
        used,
        free,
        percentage: (used / total) * 100
      };
    } else {
      // Fallback to Node.js os module
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;
      
      return {
        total: total / 1024 / 1024,
        used: used / 1024 / 1024,
        free: free / 1024 / 1024,
        percentage: (used / total) * 100
      };
    }
  }
  
  // Collect disk metrics
  private async collectDiskMetrics() {
    const disks = [];
    
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const result = await $`df -k | grep -E "^/dev" | awk '{print $1, $2, $3, $4, $5, $6}'`;
      const lines = result.stdout.trim().split('\n');
      
      for (const line of lines) {
        const [filesystem, size, used, available, percentage, mountpoint] = line.split(/\s+/);
        disks.push({
          filesystem,
          size: parseInt(size) / 1024, // MB
          used: parseInt(used) / 1024,
          available: parseInt(available) / 1024,
          percentage: parseInt(percentage),
          mountpoint
        });
      }
    } else if (process.platform === 'win32') {
      const result = await $`wmic logicaldisk get size,freespace,caption`;
      // Parse Windows output
      // TODO: Implement Windows disk parsing
    }
    
    return disks;
  }
  
  // Collect network metrics
  private async collectNetworkMetrics() {
    const interfaces = [];
    
    if (process.platform === 'darwin') {
      const result = await $`netstat -ib | grep -E "^[a-z]" | grep -v "^Name"`;
      const lines = result.stdout.trim().split('\n');
      
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 7) {
          interfaces.push({
            name: parts[0],
            rx: parseInt(parts[6]) || 0,
            tx: parseInt(parts[9]) || 0
          });
        }
      }
    } else if (process.platform === 'linux') {
      const result = await $`cat /proc/net/dev | grep -E "^\\s*[a-z]" | awk '{print $1, $2, $10}'`;
      const lines = result.stdout.trim().split('\n');
      
      for (const line of lines) {
        const [name, rx, tx] = line.split(/\s+/);
        interfaces.push({
          name: name.replace(':', ''),
          rx: parseInt(rx) || 0,
          tx: parseInt(tx) || 0
        });
      }
    }
    
    return { interfaces };
  }
  
  // Collect process metrics
  private async collectProcessMetrics() {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const result = await $`ps aux | tail -n +2 | awk '{print $8}' | sort | uniq -c`;
      const stats = {
        total: 0,
        running: 0,
        sleeping: 0,
        zombie: 0
      };
      
      const lines = result.stdout.trim().split('\n');
      for (const line of lines) {
        const [count, state] = line.trim().split(/\s+/);
        const num = parseInt(count);
        stats.total += num;
        
        if (state.includes('R')) stats.running += num;
        else if (state.includes('S')) stats.sleeping += num;
        else if (state.includes('Z')) stats.zombie += num;
      }
      
      return stats;
    }
    
    // Fallback
    return {
      total: 0,
      running: 0,
      sleeping: 0,
      zombie: 0
    };
  }
  
  // Collect all metrics
  async collectMetrics(): Promise<SystemMetrics> {
    const [cpu, memory, disk, network, processes] = await Promise.all([
      this.collectCPUMetrics(),
      this.collectMemoryMetrics(),
      this.collectDiskMetrics(),
      this.collectNetworkMetrics(),
      this.collectProcessMetrics()
    ]);
    
    const metrics: SystemMetrics = {
      timestamp: new Date(),
      cpu,
      memory,
      disk,
      network,
      processes
    };
    
    this.metrics.push(metrics);
    
    // Keep only last 1000 metrics
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
    
    return metrics;
  }
  
  // Check thresholds and generate alerts
  private async checkThresholds(metrics: SystemMetrics) {
    const newAlerts: Alert[] = [];
    
    // CPU checks
    if (metrics.cpu.usage >= this.thresholds.cpu.critical) {
      newAlerts.push({
        level: 'critical',
        component: 'CPU',
        message: `CPU usage is critically high: ${metrics.cpu.usage.toFixed(1)}%`,
        value: metrics.cpu.usage,
        threshold: this.thresholds.cpu.critical,
        timestamp: new Date()
      });
    } else if (metrics.cpu.usage >= this.thresholds.cpu.warning) {
      newAlerts.push({
        level: 'warning',
        component: 'CPU',
        message: `CPU usage is high: ${metrics.cpu.usage.toFixed(1)}%`,
        value: metrics.cpu.usage,
        threshold: this.thresholds.cpu.warning,
        timestamp: new Date()
      });
    }
    
    // Load average check
    const loadPerCore = metrics.cpu.loadAverage[0] / metrics.cpu.cores;
    if (loadPerCore >= this.thresholds.loadAverage.critical) {
      newAlerts.push({
        level: 'critical',
        component: 'Load',
        message: `System load is critically high: ${metrics.cpu.loadAverage[0].toFixed(2)}`,
        value: loadPerCore,
        threshold: this.thresholds.loadAverage.critical,
        timestamp: new Date()
      });
    }
    
    // Memory checks
    if (metrics.memory.percentage >= this.thresholds.memory.critical) {
      newAlerts.push({
        level: 'critical',
        component: 'Memory',
        message: `Memory usage is critically high: ${metrics.memory.percentage.toFixed(1)}%`,
        value: metrics.memory.percentage,
        threshold: this.thresholds.memory.critical,
        timestamp: new Date()
      });
    } else if (metrics.memory.percentage >= this.thresholds.memory.warning) {
      newAlerts.push({
        level: 'warning',
        component: 'Memory',
        message: `Memory usage is high: ${metrics.memory.percentage.toFixed(1)}%`,
        value: metrics.memory.percentage,
        threshold: this.thresholds.memory.warning,
        timestamp: new Date()
      });
    }
    
    // Disk checks
    for (const disk of metrics.disk) {
      if (disk.percentage >= this.thresholds.disk.critical) {
        newAlerts.push({
          level: 'critical',
          component: 'Disk',
          message: `Disk ${disk.mountpoint} is critically full: ${disk.percentage}%`,
          value: disk.percentage,
          threshold: this.thresholds.disk.critical,
          timestamp: new Date()
        });
      } else if (disk.percentage >= this.thresholds.disk.warning) {
        newAlerts.push({
          level: 'warning',
          component: 'Disk',
          message: `Disk ${disk.mountpoint} is filling up: ${disk.percentage}%`,
          value: disk.percentage,
          threshold: this.thresholds.disk.warning,
          timestamp: new Date()
        });
      }
    }
    
    // Process zombie check
    if (metrics.processes.zombie > 0) {
      newAlerts.push({
        level: 'warning',
        component: 'Process',
        message: `Found ${metrics.processes.zombie} zombie process(es)`,
        value: metrics.processes.zombie,
        timestamp: new Date()
      });
    }
    
    // Trigger alert handlers
    for (const alert of newAlerts) {
      this.alerts.push(alert);
      for (const handler of this.alertHandlers) {
        await handler(alert);
      }
    }
    
    return newAlerts;
  }
  
  // Monitor system continuously
  async startMonitoring(intervalMs = 60000) {
    console.log('🔍 Starting system monitoring...\n');
    
    const monitor = async () => {
      try {
        const metrics = await this.collectMetrics();
        const alerts = await this.checkThresholds(metrics);
        
        // Display current status
        this.displayStatus(metrics, alerts);
        
      } catch (error: any) {
        console.error('Monitoring error:', error.message);
      }
    };
    
    // Initial check
    await monitor();
    
    // Set up interval
    return setInterval(monitor, intervalMs);
  }
  
  // Display current system status
  private displayStatus(metrics: SystemMetrics, alerts: Alert[]) {
    // Clear console (optional)
    // console.clear();
    
    console.log('\n' + '='.repeat(60));
    console.log(`📊 System Status - ${metrics.timestamp.toLocaleString()}`);
    console.log('='.repeat(60));
    
    // CPU Status
    console.log('\n💻 CPU:');
    console.log(`   Usage: ${this.formatBar(metrics.cpu.usage)} ${metrics.cpu.usage.toFixed(1)}%`);
    console.log(`   Load Average: ${metrics.cpu.loadAverage.map(l => l.toFixed(2)).join(', ')}`);
    console.log(`   Cores: ${metrics.cpu.cores}`);
    
    // Memory Status
    console.log('\n🧠 Memory:');
    console.log(`   Usage: ${this.formatBar(metrics.memory.percentage)} ${metrics.memory.percentage.toFixed(1)}%`);
    console.log(`   Total: ${this.formatBytes(metrics.memory.total * 1024 * 1024)}`);
    console.log(`   Used: ${this.formatBytes(metrics.memory.used * 1024 * 1024)}`);
    console.log(`   Free: ${this.formatBytes(metrics.memory.free * 1024 * 1024)}`);
    
    // Disk Status
    console.log('\n💾 Disk:');
    for (const disk of metrics.disk) {
      console.log(`   ${disk.mountpoint}:`);
      console.log(`      Usage: ${this.formatBar(disk.percentage)} ${disk.percentage}%`);
      console.log(`      Total: ${this.formatBytes(disk.size * 1024 * 1024)}`);
      console.log(`      Available: ${this.formatBytes(disk.available * 1024 * 1024)}`);
    }
    
    // Process Status
    console.log('\n⚙️  Processes:');
    console.log(`   Total: ${metrics.processes.total}`);
    console.log(`   Running: ${metrics.processes.running}`);
    console.log(`   Sleeping: ${metrics.processes.sleeping}`);
    if (metrics.processes.zombie > 0) {
      console.log(`   ⚠️  Zombie: ${metrics.processes.zombie}`);
    }
    
    // Alerts
    if (alerts.length > 0) {
      console.log('\n🚨 Active Alerts:');
      for (const alert of alerts) {
        const icon = {
          info: 'ℹ️',
          warning: '⚠️',
          critical: '🔴'
        }[alert.level];
        console.log(`   ${icon} ${alert.message}`);
      }
    } else {
      console.log('\n✅ All systems operational');
    }
    
    console.log('\n' + '='.repeat(60));
  }
  
  // Format percentage as bar
  private formatBar(percentage: number, width = 20): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    let bar = '[';
    
    // Color based on percentage
    if (percentage >= 90) {
      bar += '\x1b[31m'; // Red
    } else if (percentage >= 70) {
      bar += '\x1b[33m'; // Yellow
    } else {
      bar += '\x1b[32m'; // Green
    }
    
    bar += '█'.repeat(filled);
    bar += '\x1b[0m'; // Reset color
    bar += '░'.repeat(empty);
    bar += ']';
    
    return bar;
  }
  
  // Format bytes to human readable
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
  
  // Get metrics history
  getMetricsHistory(minutes = 60): SystemMetrics[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.metrics.filter(m => m.timestamp >= cutoff);
  }
  
  // Get recent alerts
  getRecentAlerts(minutes = 60): Alert[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.alerts.filter(a => a.timestamp >= cutoff);
  }
}

// ===== Alert Handlers =====

// Email alert handler
async function emailAlertHandler(alert: Alert) {
  if (alert.level === 'critical') {
    // Send email using mail command
    const subject = `[${alert.level.toUpperCase()}] ${alert.component} Alert`;
    const body = `
Alert Level: ${alert.level}
Component: ${alert.component}
Message: ${alert.message}
Value: ${alert.value}
Threshold: ${alert.threshold}
Time: ${alert.timestamp.toISOString()}
Host: ${os.hostname()}
`;
    
    // Example using mail command
    await $`echo ${body} | mail -s ${subject} admin@example.com`.nothrow();
  }
}

// Slack webhook handler
async function slackAlertHandler(alert: Alert) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  
  const color = {
    info: '#36a64f',
    warning: '#ff9900',
    critical: '#ff0000'
  }[alert.level];
  
  const payload = {
    attachments: [{
      color,
      title: `${alert.level.toUpperCase()}: ${alert.component}`,
      text: alert.message,
      fields: [
        { title: 'Host', value: os.hostname(), short: true },
        { title: 'Time', value: alert.timestamp.toLocaleString(), short: true }
      ],
      footer: 'System Monitor',
      ts: Math.floor(alert.timestamp.getTime() / 1000)
    }]
  };
  
  await $`curl -X POST ${webhookUrl} -H "Content-Type: application/json" -d ${JSON.stringify(payload)}`.nothrow();
}

// Log file handler
async function logFileHandler(alert: Alert) {
  const logFile = '/var/log/system-monitor.log';
  const logEntry = `${alert.timestamp.toISOString()} [${alert.level.toUpperCase()}] ${alert.component}: ${alert.message}\n`;
  
  await $`echo ${logEntry} >> ${logFile}`.nothrow();
}

// ===== Service Monitor =====
class ServiceMonitor {
  constructor(
    private services: Array<{
      name: string;
      checkCommand: string;
      healthUrl?: string;
      port?: number;
    }>
  ) {}
  
  async checkServices(): Promise<Array<{
    service: string;
    status: 'up' | 'down' | 'degraded';
    responseTime?: number;
    error?: string;
  }>> {
    const results = [];
    
    for (const service of this.services) {
      const startTime = Date.now();
      let status: 'up' | 'down' | 'degraded' = 'up';
      let error: string | undefined;
      
      try {
        // Check if service is running
        const result = await $`${service.checkCommand}`.nothrow();
        if (result.exitCode !== 0) {
          status = 'down';
          error = 'Service not running';
        }
        
        // Check health endpoint if provided
        if (service.healthUrl && status === 'up') {
          const healthCheck = await $`curl -sf ${service.healthUrl} -o /dev/null -w "%{http_code}"`.nothrow();
          const httpCode = parseInt(healthCheck.stdout.trim());
          
          if (httpCode >= 500) {
            status = 'down';
            error = `Health check returned ${httpCode}`;
          } else if (httpCode >= 400) {
            status = 'degraded';
            error = `Health check returned ${httpCode}`;
          }
        }
        
        // Check port if provided
        if (service.port && status === 'up') {
          const portCheck = await $`nc -zv localhost ${service.port}`.nothrow();
          if (portCheck.exitCode !== 0) {
            status = 'down';
            error = `Port ${service.port} not accessible`;
          }
        }
        
      } catch (e: any) {
        status = 'down';
        error = e.message;
      }
      
      results.push({
        service: service.name,
        status,
        responseTime: Date.now() - startTime,
        error
      });
    }
    
    return results;
  }
}

// ===== Log Monitor =====
class LogMonitor {
  private patterns = [
    { pattern: /ERROR|FATAL/i, level: 'error' },
    { pattern: /WARN|WARNING/i, level: 'warning' },
    { pattern: /OutOfMemory/i, level: 'critical' },
    { pattern: /StackOverflow/i, level: 'critical' },
    { pattern: /Connection refused/i, level: 'error' },
    { pattern: /Timeout/i, level: 'warning' }
  ];
  
  async monitorLog(
    logFile: string,
    onMatch: (match: { line: string; level: string; timestamp: Date }) => void
  ) {
    // Use tail -f for real-time monitoring
    await $.stream`tail -f ${logFile}`
      .onLine((line) => {
        for (const { pattern, level } of this.patterns) {
          if (pattern.test(line)) {
            onMatch({
              line,
              level,
              timestamp: new Date()
            });
            break;
          }
        }
      });
  }
  
  async searchLogs(
    logFile: string,
    pattern: string,
    lines = 100
  ): Promise<string[]> {
    const result = await $`tail -n ${lines} ${logFile} | grep -i "${pattern}"`.nothrow();
    if (result.exitCode === 0) {
      return result.stdout.trim().split('\n').filter(line => line);
    }
    return [];
  }
}

// ===== Demo Function =====
async function runDemo() {
  console.log('🔍 System Monitoring Demo\n');
  
  // Create system monitor
  const monitor = new SystemMonitor({
    cpu: { warning: 50, critical: 80 },
    memory: { warning: 70, critical: 90 },
    disk: { warning: 70, critical: 85 },
    loadAverage: { warning: 1.5, critical: 3 }
  });
  
  // Register alert handlers
  monitor.onAlert(async (alert) => {
    console.log(`\n🔔 Alert: ${alert.message}`);
    await logFileHandler(alert);
    
    // Uncomment to enable other handlers
    // await emailAlertHandler(alert);
    // await slackAlertHandler(alert);
  });
  
  // Create service monitor
  const serviceMonitor = new ServiceMonitor([
    {
      name: 'SSH',
      checkCommand: 'ps aux | grep -q "[s]shd"',
      port: 22
    },
    {
      name: 'HTTP',
      checkCommand: 'curl -sf http://localhost >/dev/null',
      port: 80,
      healthUrl: 'http://localhost/health'
    }
  ]);
  
  // Monitor for 30 seconds
  console.log('Monitoring system for 30 seconds...\n');
  console.log('(In a real scenario, this would run continuously)\n');
  
  const interval = await monitor.startMonitoring(5000); // Check every 5 seconds
  
  // Check services
  setTimeout(async () => {
    console.log('\n📡 Checking services...');
    const serviceResults = await serviceMonitor.checkServices();
    
    console.log('\nService Status:');
    for (const result of serviceResults) {
      const icon = result.status === 'up' ? '✅' : result.status === 'degraded' ? '⚠️' : '❌';
      console.log(`  ${icon} ${result.service}: ${result.status} (${result.responseTime}ms)`);
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
    }
  }, 10000);
  
  // Stop after 30 seconds
  setTimeout(() => {
    clearInterval(interval);
    
    // Show summary
    console.log('\n\n📊 Monitoring Summary');
    console.log('='.repeat(50));
    
    const history = monitor.getMetricsHistory(1);
    console.log(`Collected ${history.length} metric samples`);
    
    const alerts = monitor.getRecentAlerts(1);
    console.log(`Generated ${alerts.length} alerts`);
    
    if (history.length > 0) {
      const avgCPU = history.reduce((sum, m) => sum + m.cpu.usage, 0) / history.length;
      const avgMem = history.reduce((sum, m) => sum + m.memory.percentage, 0) / history.length;
      
      console.log(`\nAverage CPU: ${avgCPU.toFixed(1)}%`);
      console.log(`Average Memory: ${avgMem.toFixed(1)}%`);
    }
    
    console.log('\n✅ Monitoring demo completed!');
    process.exit(0);
  }, 30000);
}

// Run demo if executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}