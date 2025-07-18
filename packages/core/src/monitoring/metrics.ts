/**
 * Metrics collection and management for Xec Core
 */

import { EventEmitter } from 'events';

import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('metrics');

export interface Metric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
  unit?: string;
  description?: string;
}

export interface MetricOptions {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  description?: string;
  unit?: string;
  labels?: string[];
  buckets?: number[]; // For histograms
}

export interface MetricValue {
  value: number;
  labels?: Record<string, string>;
}

export interface AggregatedMetric {
  name: string;
  type: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50?: number;
  p95?: number;
  p99?: number;
  labels?: Record<string, string>;
  period: {
    start: Date;
    end: Date;
  };
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    count: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  network?: {
    rx_bytes: number;
    tx_bytes: number;
    rx_packets: number;
    tx_packets: number;
  };
  timestamp: Date;
}

export class MetricCollector {
  private metrics: Map<string, MetricOptions> = new Map();
  private values: Map<string, MetricValue[]> = new Map();
  private emitter: EventEmitter = new EventEmitter();

  /**
   * Register a new metric
   */
  register(options: MetricOptions): void {
    if (this.metrics.has(options.name)) {
      throw new Error(`Metric '${options.name}' already registered`);
    }

    this.metrics.set(options.name, options);
    this.values.set(options.name, []);

    logger.debug(`Registered metric: ${options.name} (${options.type})`);
  }

  /**
   * Record a metric value
   */
  record(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric) {
      throw new Error(`Metric '${name}' not registered`);
    }

    const metricValue: MetricValue = { value, labels };
    
    // Store value
    const values = this.values.get(name) || [];
    values.push(metricValue);
    
    // Keep only last 1000 values per metric to prevent memory issues
    if (values.length > 1000) {
      values.shift();
    }

    // Emit metric event
    this.emitter.emit('metric', {
      name,
      type: metric.type,
      value,
      timestamp: new Date(),
      labels,
      unit: metric.unit,
      description: metric.description
    } as Metric);
  }

  /**
   * Increment a counter
   */
  increment(name: string, value = 1, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'counter') {
      throw new Error(`Metric '${name}' is not a counter`);
    }

    this.record(name, value, labels);
  }

  /**
   * Set a gauge value
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'gauge') {
      throw new Error(`Metric '${name}' is not a gauge`);
    }

    this.record(name, value, labels);
  }

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'histogram') {
      throw new Error(`Metric '${name}' is not a histogram`);
    }

    this.record(name, value, labels);
  }

  /**
   * Get current metric values
   */
  getMetric(name: string): MetricValue[] {
    return this.values.get(name) || [];
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Map<string, MetricValue[]> {
    return new Map(this.values);
  }

  /**
   * Get aggregated metrics
   */
  aggregate(
    name: string,
    period?: { start: Date; end: Date }
  ): AggregatedMetric | null {
    const metric = this.metrics.get(name);
    if (!metric) return null;

    const values = this.values.get(name) || [];
    if (values.length === 0) return null;

    const numbers = values.map(v => v.value);
    const sorted = [...numbers].sort((a, b) => a - b);

    return {
      name,
      type: metric.type,
      count: numbers.length,
      sum: numbers.reduce((a, b) => a + b, 0),
      min: Math.min(...numbers),
      max: Math.max(...numbers),
      avg: numbers.reduce((a, b) => a + b, 0) / numbers.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      period: period || {
        start: new Date(Date.now() - 3600000), // Last hour
        end: new Date()
      }
    };
  }

  /**
   * Clear metrics
   */
  clear(name?: string): void {
    if (name) {
      this.values.set(name, []);
    } else {
      for (const key of this.values.keys()) {
        this.values.set(key, []);
      }
    }
  }

  /**
   * Subscribe to metric events
   */
  on(event: 'metric', listener: (metric: Metric) => void): void {
    this.emitter.on(event, listener);
  }

  /**
   * Unsubscribe from metric events
   */
  off(event: 'metric', listener: (metric: Metric) => void): void {
    this.emitter.off(event, listener);
  }
}

/**
 * System metrics collector
 */
export class SystemMetricsCollector {
  private interval: NodeJS.Timeout | null = null;
  private metrics: SystemMetrics[] = [];
  private maxHistory = 60; // Keep 60 data points

  /**
   * Start collecting system metrics
   */
  start(intervalMs = 5000): void {
    if (this.interval) return;

    this.interval = setInterval(async () => {
      try {
        const metrics = await this.collect();
        this.metrics.push(metrics);

        // Keep only recent metrics
        if (this.metrics.length > this.maxHistory) {
          this.metrics.shift();
        }
      } catch (error) {
        logger.error('Failed to collect system metrics', error);
      }
    }, intervalMs);

    logger.info(`Started system metrics collection (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop collecting system metrics
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Stopped system metrics collection');
    }
  }

  /**
   * Collect current system metrics
   */
  async collect(): Promise<SystemMetrics> {
    const os = await import('os');
    
    // CPU metrics
    const cpus = os.cpus();
    const totalCpu = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total);
    }, 0);

    // Memory metrics
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Mock disk metrics (would need platform-specific implementation)
    const diskTotal = 100 * 1024 * 1024 * 1024; // 100GB
    const diskUsed = 60 * 1024 * 1024 * 1024; // 60GB

    return {
      cpu: {
        usage: (totalCpu / cpus.length) * 100,
        count: cpus.length,
        loadAverage: os.loadavg()
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percentage: (usedMem / totalMem) * 100
      },
      disk: {
        total: diskTotal,
        used: diskUsed,
        free: diskTotal - diskUsed,
        percentage: (diskUsed / diskTotal) * 100
      },
      timestamp: new Date()
    };
  }

  /**
   * Get current metrics
   */
  getCurrent(): SystemMetrics | null {
    return this.metrics[this.metrics.length - 1] || null;
  }

  /**
   * Get metrics history
   */
  getHistory(): SystemMetrics[] {
    return [...this.metrics];
  }

  /**
   * Get average metrics over a period
   */
  getAverage(minutes = 5): SystemMetrics | null {
    const cutoff = Date.now() - minutes * 60 * 1000;
    const recent = this.metrics.filter(m => m.timestamp.getTime() > cutoff);

    if (recent.length === 0) return null;

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    return {
      cpu: {
        usage: avg(recent.map(m => m.cpu.usage).filter(v => v !== undefined)),
        count: recent[0]?.cpu.count || 0,
        loadAverage: [
          avg(recent.map(m => m.cpu.loadAverage[0]).filter(v => v !== undefined)),
          avg(recent.map(m => m.cpu.loadAverage[1]).filter(v => v !== undefined)),
          avg(recent.map(m => m.cpu.loadAverage[2]).filter(v => v !== undefined))
        ]
      },
      memory: {
        total: recent[0]?.memory.total || 0,
        used: avg(recent.map(m => m.memory.used).filter(v => v !== undefined)),
        free: avg(recent.map(m => m.memory.free).filter(v => v !== undefined)),
        percentage: avg(recent.map(m => m.memory.percentage).filter(v => v !== undefined))
      },
      disk: {
        total: recent[0]?.disk.total || 0,
        used: avg(recent.map(m => m.disk.used).filter(v => v !== undefined)),
        free: avg(recent.map(m => m.disk.free).filter(v => v !== undefined)),
        percentage: avg(recent.map(m => m.disk.percentage).filter(v => v !== undefined))
      },
      timestamp: new Date()
    };
  }
}

// Global instances
let globalMetricCollector: MetricCollector | null = null;
let globalSystemCollector: SystemMetricsCollector | null = null;

export function getMetricCollector(): MetricCollector {
  if (!globalMetricCollector) {
    globalMetricCollector = new MetricCollector();
    
    // Register default metrics
    globalMetricCollector.register({
      name: 'task_execution_count',
      type: 'counter',
      description: 'Number of tasks executed'
    });
    
    globalMetricCollector.register({
      name: 'task_execution_duration',
      type: 'histogram',
      description: 'Task execution duration',
      unit: 'ms'
    });
    
    globalMetricCollector.register({
      name: 'task_failure_count',
      type: 'counter',
      description: 'Number of task failures'
    });
    
    globalMetricCollector.register({
      name: 'active_tasks',
      type: 'gauge',
      description: 'Number of currently active tasks'
    });
  }
  return globalMetricCollector;
}

export function getSystemMetricsCollector(): SystemMetricsCollector {
  if (!globalSystemCollector) {
    globalSystemCollector = new SystemMetricsCollector();
  }
  return globalSystemCollector;
}

// Helper functions
export function recordTaskStart(taskName: string): void {
  const collector = getMetricCollector();
  collector.increment('task_execution_count', 1, { task: taskName });
  collector.gauge('active_tasks', 1, { task: taskName });
}

export function recordTaskEnd(taskName: string, duration: number, success: boolean): void {
  const collector = getMetricCollector();
  collector.histogram('task_execution_duration', duration, { task: taskName });
  collector.gauge('active_tasks', -1, { task: taskName });
  
  if (!success) {
    collector.increment('task_failure_count', 1, { task: taskName });
  }
}

export async function getSystemHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  metrics: SystemMetrics | null;
  issues: string[];
}> {
  const collector = getSystemMetricsCollector();
  const current = collector.getCurrent();
  
  if (!current) {
    return { status: 'unhealthy', metrics: null, issues: ['No metrics available'] };
  }

  const issues: string[] = [];
  
  // Check CPU usage
  if (current.cpu.usage > 90) {
    issues.push('High CPU usage');
  }
  
  // Check memory usage
  if (current.memory.percentage > 90) {
    issues.push('High memory usage');
  }
  
  // Check disk usage
  if (current.disk.percentage > 90) {
    issues.push('High disk usage');
  }
  
  const status = issues.length === 0 ? 'healthy' : 
                 issues.length === 1 ? 'degraded' : 'unhealthy';
  
  return { status, metrics: current, issues };
}