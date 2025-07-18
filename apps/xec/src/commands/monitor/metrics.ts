import { Command } from 'commander';
import { MetricCollector } from '@xec-js/core';

import { SubcommandBase } from '../../utils/command-base.js';
import { errorMessages } from '../../utils/error-handler.js';

interface MetricsOptions {
  type?: string;
  format?: 'text' | 'json' | 'prometheus';
  output?: string;
  interval?: number;
  duration?: number;
  threshold?: number;
}

export class MetricsCommand extends SubcommandBase {
  private collector: MetricCollector;
  private metricsOptions: MetricsOptions = {};

  constructor() {
    super({
      name: 'metrics',
      description: 'Manage system and application metrics',
      examples: [
        {
          command: 'xec monitor metrics list',
          description: 'List available metrics',
        },
        {
          command: 'xec monitor metrics get cpu.usage',
          description: 'Get specific metric value',
        },
        {
          command: 'xec monitor metrics export --format prometheus',
          description: 'Export metrics in Prometheus format',
        },
        {
          command: 'xec monitor metrics collect --interval 5',
          description: 'Start collecting metrics every 5 seconds',
        },
      ],
    });

    this.collector = new MetricCollector();
  }

  protected setupSubcommands(command: Command): void {
    // xec monitor metrics list
    command
      .command('list')
      .description('List available metrics')
      .option('--type <type>', 'Filter by metric type')
      .option('--json', 'Output as JSON')
      .action(async (options: MetricsOptions) => {
        this.metricsOptions = { ...this.metricsOptions, ...options };
        await this.listMetrics(options);
      });

    // xec monitor metrics get
    command
      .command('get')
      .description('Get metric value')
      .argument('<metric>', 'Metric name')
      .option('--format <format>', 'Output format (text|json)', 'text')
      .action(async (metric: string, options: MetricsOptions) => {
        this.metricsOptions = { ...this.metricsOptions, ...options };
        await this.getMetric(metric, options);
      });

    // xec monitor metrics collect
    command
      .command('collect')
      .description('Start collecting metrics')
      .option('--interval <interval>', 'Collection interval in seconds', '10')
      .option('--duration <duration>', 'Collection duration in seconds')
      .option('--output <output>', 'Output file for collected metrics')
      .action(async (options: MetricsOptions) => {
        this.metricsOptions = { ...this.metricsOptions, ...options };
        await this.collectMetrics(options);
      });

    // xec monitor metrics export
    command
      .command('export')
      .description('Export metrics')
      .option('--format <format>', 'Export format (text|json|prometheus)', 'json')
      .option('--output <output>', 'Output file path')
      .option('--type <type>', 'Filter by metric type')
      .action(async (options: MetricsOptions) => {
        this.metricsOptions = { ...this.metricsOptions, ...options };
        await this.exportMetrics(options);
      });

    // xec monitor metrics aggregate
    command
      .command('aggregate')
      .description('Aggregate metrics over time')
      .option('--type <type>', 'Metric type to aggregate')
      .option('--interval <interval>', 'Aggregation interval (1m|5m|1h|1d)', '5m')
      .option('--function <function>', 'Aggregation function (avg|min|max|sum)', 'avg')
      .option('--since <since>', 'Start time (e.g., 1h, 2d, 2023-01-01)')
      .action(async (options: MetricsOptions & { function?: string; since?: string }) => {
        this.metricsOptions = { ...this.metricsOptions, ...options };
        await this.aggregateMetrics(options);
      });

    // xec monitor metrics reset
    command
      .command('reset')
      .description('Reset metrics')
      .option('--type <type>', 'Reset specific metric type')
      .option('--force', 'Force reset without confirmation')
      .action(async (options: MetricsOptions & { force?: boolean }) => {
        this.metricsOptions = { ...this.metricsOptions, ...options };
        await this.resetMetrics(options);
      });
  }

  private async listMetrics(options: MetricsOptions): Promise<void> {
    try {
      const metricsMap = this.collector.getAllMetrics();
      const metrics = Array.from(metricsMap.entries()).map(([name, values]) => ({
        name,
        type: 'gauge',
        description: 'Metric description'
      }));

      let filteredMetrics = metrics;
      if (options.type) {
        filteredMetrics = metrics.filter((m: any) => m.type === options.type);
      }

      if (options.format === 'json') {
        this.output(filteredMetrics, 'Available Metrics');
      } else {
        this.intro('Available Metrics');

        const groupedMetrics = filteredMetrics.reduce((acc, metric) => {
          const type = metric.type || 'other';
          if (!acc[type]) acc[type] = [];
          acc[type].push(metric);
          return acc;
        }, {} as Record<string, any[]>);

        Object.entries(groupedMetrics).forEach(([type, metrics]) => {
          this.log(`\n${type.toUpperCase()}:`, 'info');
          metrics.forEach(metric => {
            this.log(`  ${metric.name} - ${metric.description || 'No description'}`, 'info');
          });
        });
      }
    } catch (error: any) {
      throw errorMessages.operationFailed('list metrics', error.message);
    }
  }

  private async getMetric(metric: string, options: MetricsOptions): Promise<void> {
    try {
      const values = this.collector.getMetric(metric);
      const lastValue = values.length > 0 ? values[values.length - 1] : null;
      const value = lastValue ? lastValue.value : null;

      if (options.format === 'json') {
        this.output({ metric, value, timestamp: new Date().toISOString() }, `Metric: ${metric}`);
      } else {
        this.log(`${metric}: ${value}`, 'info');
      }
    } catch (error: any) {
      throw errorMessages.operationFailed('get metric', error.message);
    }
  }

  private async collectMetrics(options: MetricsOptions): Promise<void> {
    try {
      const interval = options.interval || 10;
      const duration = options.duration || null;

      this.log(`Starting metrics collection (interval: ${interval}s${duration ? `, duration: ${duration}s` : ''})`, 'info');

      const startTime = Date.now();
      const collectedMetrics: any[] = [];

      const collect = async () => {
        const metricsMap = this.collector.getAllMetrics();
        const metrics = Array.from(metricsMap.entries()).map(([name, values]) => {
          const lastValue = values.length > 0 ? values[values.length - 1] : null;
          return {
            name,
            value: lastValue ? lastValue.value : 0
          };
        });
        collectedMetrics.push({
          timestamp: new Date().toISOString(),
          metrics
        });

        if (!this.options.quiet) {
          this.log(`Collected ${metrics.length} metrics`, 'info');
        }

        if (duration && (Date.now() - startTime) >= duration * 1000) {
          clearInterval(intervalId);
          await this.saveCollectedMetrics(collectedMetrics, options.output);
          this.log('Metrics collection completed', 'success');
        }
      };

      const intervalId = setInterval(collect, interval * 1000);

      // Initial collection
      await collect();

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        clearInterval(intervalId);
        await this.saveCollectedMetrics(collectedMetrics, options.output);
        this.log('Metrics collection stopped', 'info');
        process.exit(0);
      });

      if (!duration) {
        this.log('Press Ctrl+C to stop collection', 'info');
      }
    } catch (error: any) {
      throw errorMessages.operationFailed('collect metrics', error.message);
    }
  }

  private async exportMetrics(options: MetricsOptions): Promise<void> {
    try {
      const metricsMap = this.collector.getAllMetrics();
      const metrics = Array.from(metricsMap.entries()).map(([name, values]) => ({
        name,
        type: 'gauge',
        values
      }));

      let filteredMetrics = metrics;
      if (options.type) {
        filteredMetrics = metrics.filter((m: any) => m.type === options.type);
      }

      let output: string;

      switch (options.format) {
        case 'prometheus':
          output = this.formatPrometheus(filteredMetrics);
          break;
        case 'json':
          output = JSON.stringify(filteredMetrics, null, 2);
          break;
        default:
          output = this.formatText(filteredMetrics);
      }

      if (options.output) {
        const fs = await import('fs/promises');
        await fs.writeFile(options.output, output);
        this.log(`Metrics exported to ${options.output}`, 'success');
      } else {
        console.log(output);
      }
    } catch (error: any) {
      throw errorMessages.operationFailed('export metrics', error.message);
    }
  }

  private async aggregateMetrics(options: MetricsOptions & { function?: string; since?: string }): Promise<void> {
    try {
      // MetricAggregator doesn't exist in core, so we'll implement basic aggregation
      const metricsMap = this.collector.getAllMetrics();
      const aggregated: any[] = [];

      metricsMap.forEach((values, name) => {
        if (options.type && !name.includes(options.type)) return;

        if (values.length > 0) {
          const nums = values.map(v => v.value);
          let result = 0;

          switch (options.function || 'avg') {
            case 'avg':
              result = nums.reduce((a, b) => a + b, 0) / nums.length;
              break;
            case 'min':
              result = Math.min(...nums);
              break;
            case 'max':
              result = Math.max(...nums);
              break;
            case 'sum':
              result = nums.reduce((a, b) => a + b, 0);
              break;
          }

          aggregated.push({
            metric: name,
            function: options.function || 'avg',
            value: result,
            count: values.length
          });
        }
      });

      this.output(aggregated, 'Aggregated Metrics');
    } catch (error: any) {
      throw errorMessages.operationFailed('aggregate metrics', error.message);
    }
  }

  private async resetMetrics(options: MetricsOptions & { force?: boolean }): Promise<void> {
    try {
      if (!options.force) {
        const confirm = await this.confirm('Are you sure you want to reset metrics? This will clear all collected data.');
        if (!confirm) {
          this.log('Metrics reset cancelled', 'info');
          return;
        }
      }

      // MetricCollector doesn't have a reset method, so we'll just log a message
      this.log('Metrics reset functionality not implemented in current MetricCollector', 'warn');
      this.log('Consider re-initializing the collector for a fresh start', 'info');
    } catch (error: any) {
      throw errorMessages.operationFailed('reset metrics', error.message);
    }
  }

  private async saveCollectedMetrics(metrics: any[], outputPath?: string): Promise<void> {
    if (!outputPath) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      outputPath = `metrics-${timestamp}.json`;
    }

    const fs = await import('fs/promises');
    await fs.writeFile(outputPath, JSON.stringify(metrics, null, 2));
    this.log(`Metrics saved to ${outputPath}`, 'success');
  }

  private formatPrometheus(metrics: any[]): string {
    let output = '';

    metrics.forEach(metric => {
      output += `# HELP ${metric.name} ${metric.description || 'No description'}\n`;
      output += `# TYPE ${metric.name} ${metric.type || 'gauge'}\n`;
      output += `${metric.name} ${metric.value}\n\n`;
    });

    return output;
  }

  private formatText(metrics: any[]): string {
    let output = 'Metrics Report\n';
    output += '==============\n\n';

    metrics.forEach(metric => {
      output += `${metric.name}: ${metric.value}\n`;
      if (metric.description) {
        output += `  Description: ${metric.description}\n`;
      }
      output += `  Type: ${metric.type || 'gauge'}\n`;
      output += `  Updated: ${metric.timestamp}\n\n`;
    });

    return output;
  }
}