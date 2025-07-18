import { Command } from 'commander';
import { AlertRule, AlertManager } from '@xec-js/core';

import { SubcommandBase } from '../../utils/command-base.js';
import { errorMessages } from '../../utils/error-handler.js';

interface AlertsOptions {
  name?: string;
  level?: 'info' | 'warning' | 'critical';
  active?: boolean;
  format?: 'text' | 'json';
  output?: string;
  threshold?: number;
  metric?: string;
  operator?: 'gt' | 'lt' | 'eq' | 'ne' | 'gte' | 'lte';
  duration?: string;
}

export class AlertsCommand extends SubcommandBase {
  private alertManager: AlertManager;
  private alertOptions: AlertsOptions = {};

  constructor() {
    super({
      name: 'alerts',
      description: 'Manage monitoring alerts',
      examples: [
        {
          command: 'xec monitor alerts list',
          description: 'List all alerts',
        },
        {
          command: 'xec monitor alerts create --name high-cpu --threshold 80',
          description: 'Create CPU usage alert',
        },
        {
          command: 'xec monitor alerts test high-cpu',
          description: 'Test alert rule',
        },
        {
          command: 'xec monitor alerts active',
          description: 'Show active alerts',
        },
      ],
    });

    this.alertManager = new AlertManager();
  }

  protected setupSubcommands(command: Command): void {
    // xec monitor alerts list
    command
      .command('list')
      .description('List alert rules')
      .option('--active', 'Show only active alerts')
      .option('--level <level>', 'Filter by alert level')
      .option('--json', 'Output as JSON')
      .action(async (options: AlertsOptions) => {
        this.alertOptions = options;
        await this.listAlerts(options);
      });

    // xec monitor alerts create
    command
      .command('create')
      .description('Create alert rule')
      .option('--name <name>', 'Alert name')
      .option('--metric <metric>', 'Metric to monitor')
      .option('--operator <operator>', 'Comparison operator (gt|lt|eq|ne|gte|lte)', 'gt')
      .option('--threshold <threshold>', 'Alert threshold')
      .option('--level <level>', 'Alert level (info|warning|critical)', 'warning')
      .option('--duration <duration>', 'Duration before triggering (e.g., 5m, 1h)', '5m')
      .option('--interactive', 'Interactive alert creation')
      .action(async (options: AlertsOptions & { interactive?: boolean }) => {
        this.alertOptions = options;
        await this.createAlert(options);
      });

    // xec monitor alerts update
    command
      .command('update')
      .description('Update alert rule')
      .argument('<name>', 'Alert name')
      .option('--metric <metric>', 'Metric to monitor')
      .option('--operator <operator>', 'Comparison operator')
      .option('--threshold <threshold>', 'Alert threshold')
      .option('--level <level>', 'Alert level')
      .option('--duration <duration>', 'Duration before triggering')
      .action(async (name: string, options: AlertsOptions) => {
        this.alertOptions = options;
        await this.updateAlert(name, options);
      });

    // xec monitor alerts test
    command
      .command('test')
      .description('Test alert rule')
      .argument('<name>', 'Alert name')
      .option('--value <value>', 'Test value to simulate')
      .action(async (name: string, options: AlertsOptions & { value?: string }) => {
        this.alertOptions = options;
        await this.testAlert(name, options);
      });

    // xec monitor alerts active
    command
      .command('active')
      .description('Show active alerts')
      .option('--level <level>', 'Filter by alert level')
      .option('--json', 'Output as JSON')
      .action(async (options: AlertsOptions) => {
        this.alertOptions = options;
        await this.showActiveAlerts(options);
      });

    // xec monitor alerts acknowledge
    command
      .command('acknowledge')
      .alias('ack')
      .description('Acknowledge alert')
      .argument('<name>', 'Alert name')
      .option('--message <message>', 'Acknowledgment message')
      .action(async (name: string, options: AlertsOptions & { message?: string }) => {
        this.alertOptions = options;
        await this.acknowledgeAlert(name, options);
      });

    // xec monitor alerts resolve
    command
      .command('resolve')
      .description('Resolve alert')
      .argument('<name>', 'Alert name')
      .option('--message <message>', 'Resolution message')
      .action(async (name: string, options: AlertsOptions & { message?: string }) => {
        this.alertOptions = options;
        await this.resolveAlert(name, options);
      });

    // xec monitor alerts enable
    command
      .command('enable')
      .description('Enable alert rule')
      .argument('<name>', 'Alert name')
      .action(async (name: string) => {
        await this.enableAlert(name);
      });

    // xec monitor alerts disable
    command
      .command('disable')
      .description('Disable alert rule')
      .argument('<name>', 'Alert name')
      .action(async (name: string) => {
        await this.disableAlert(name);
      });

    // xec monitor alerts remove
    command
      .command('remove')
      .alias('rm')
      .description('Remove alert rule')
      .argument('<name>', 'Alert name')
      .option('--force', 'Force removal without confirmation')
      .action(async (name: string, options: { force?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.removeAlert(name, options);
      });
  }

  private async listAlerts(options: AlertsOptions): Promise<void> {
    try {
      const alerts = await this.alertManager.getAlerts();

      let filteredAlerts = alerts;

      if (options.active) {
        filteredAlerts = alerts.filter(a => a.status === 'active');
      }

      if (options.level) {
        filteredAlerts = alerts.filter(a => a.severity === options.level);
      }

      if (options.format === 'json') {
        this.output(filteredAlerts, 'Alert Rules');
      } else {
        this.intro('Alert Rules');

        if (filteredAlerts.length === 0) {
          this.log('No alerts found', 'info');
          return;
        }

        const tableData = filteredAlerts.map(alert => ({
          Name: alert.name,
          Metric: alert.condition.metric || 'N/A',
          Operator: alert.condition.operator || 'N/A',
          Threshold: alert.condition.threshold?.toString() || 'N/A',
          Level: alert.severity,
          Status: alert.status
        }));

        this.table(tableData, ['Name', 'Metric', 'Operator', 'Threshold', 'Level', 'Status']);
      }
    } catch (error: any) {
      throw errorMessages.operationFailed('list alerts', error.message);
    }
  }

  private async createAlert(options: AlertsOptions & { interactive?: boolean }): Promise<void> {
    try {
      let alertConfig: any = {};

      if (options.interactive) {
        alertConfig = await this.interactiveAlertSetup();
      } else {
        alertConfig = {
          name: options.name,
          metric: options.metric,
          operator: options.operator || 'gt',
          threshold: options.threshold,
          severity: (options.level || 'warning') as 'info' | 'warning' | 'critical',
          duration: options.duration || '5m'
        };
      }

      // Validate required fields
      if (!alertConfig.name || !alertConfig.metric || !alertConfig.threshold) {
        throw new Error('Name, metric, and threshold are required');
      }

      const rule: AlertRule = {
        id: alertConfig.name.toLowerCase().replace(/\s+/g, '-'),
        name: alertConfig.name,
        enabled: true,
        condition: {
          type: 'threshold',
          metric: alertConfig.metric,
          operator: alertConfig.operator || 'gt',
          threshold: alertConfig.threshold,
          duration: 60000 // 1 minute
        },
        severity: alertConfig.level || 'warning',
        message: `${alertConfig.name}: ${alertConfig.metric} is ${alertConfig.operator} ${alertConfig.threshold}`
      };

      this.alertManager.addRule(rule);

      this.log(`Alert rule '${alertConfig.name}' created successfully`, 'success');
    } catch (error: any) {
      throw errorMessages.operationFailed('create alert', error.message);
    }
  }

  private async updateAlert(name: string, options: AlertsOptions): Promise<void> {
    try {
      const rules = this.alertManager.getRules();
      const rule = rules.find(r => r.name === name || r.id === name);

      if (!rule) {
        throw errorMessages.resourceNotFound(`Alert rule '${name}'`);
      }

      // Create updated rule
      const updatedRule: AlertRule = {
        ...rule,
        condition: {
          ...rule.condition,
          metric: options.metric || rule.condition.metric,
          operator: (options.operator || rule.condition.operator) as 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'neq',
          threshold: options.threshold || rule.condition.threshold
        },
        severity: options.level || rule.severity
      };

      // Remove old rule and add updated one
      this.alertManager.removeRule(rule.id);
      this.alertManager.addRule(updatedRule);

      this.log(`Alert rule '${name}' updated successfully`, 'success');
    } catch (error: any) {
      throw errorMessages.operationFailed('update alert', error.message);
    }
  }

  private async testAlert(name: string, options: AlertsOptions & { value?: string }): Promise<void> {
    try {
      const rules = this.alertManager.getRules();
      const rule = rules.find(r => r.name === name || r.id === name);

      if (!rule) {
        throw errorMessages.resourceNotFound(`Alert rule '${name}'`);
      }

      const testValue = options.value ? parseFloat(options.value) : Math.random() * 100;
      const result = this.evaluateCondition(rule.condition, testValue);

      if (result) {
        this.log(`Alert '${name}' would trigger with value ${testValue}`, 'warn');
      } else {
        this.log(`Alert '${name}' would not trigger with value ${testValue}`, 'success');
      }

      this.log(`Evaluation: ${testValue} ${rule.condition.operator} ${rule.condition.threshold} = ${result}`, 'info');
    } catch (error: any) {
      throw errorMessages.operationFailed('test alert', error.message);
    }
  }

  private async showActiveAlerts(options: AlertsOptions): Promise<void> {
    try {
      const activeAlerts = this.alertManager.getAlerts('active');

      let filteredAlerts = activeAlerts;

      if (options.level) {
        filteredAlerts = activeAlerts.filter(a => a.severity === options.level);
      }

      if (options.format === 'json') {
        this.output(filteredAlerts, 'Active Alerts');
      } else {
        this.intro('Active Alerts');

        if (filteredAlerts.length === 0) {
          this.log('No active alerts', 'success');
          return;
        }

        const headers = ['Name', 'Level', 'Message', 'Triggered', 'Duration'];
        const rows = filteredAlerts.map((alert) => {
          const duration = this.formatDuration(Date.now() - new Date(alert.triggeredAt).getTime());
          return {
            Name: alert.name,
            Level: alert.severity,
            Message: alert.message,
            Triggered: new Date(alert.triggeredAt).toLocaleString(),
            Duration: duration
          };
        });

        this.table(rows, headers);
      }
    } catch (error: any) {
      throw errorMessages.operationFailed('show active alerts', error.message);
    }
  }

  private async acknowledgeAlert(name: string, options: AlertsOptions & { message?: string }): Promise<void> {
    try {
      const alerts = this.alertManager.getAlerts('active');
      const alert = alerts.find(a => a.name === name || a.id === name);

      if (!alert) {
        throw errorMessages.resourceNotFound(`Active alert '${name}'`);
      }

      const success = this.alertManager.acknowledgeAlert(alert.id, 'user');
      if (success) {
        this.log(`Alert '${name}' acknowledged`, 'success');
      } else {
        throw new Error('Failed to acknowledge alert');
      }
    } catch (error: any) {
      throw errorMessages.operationFailed('acknowledge alert', error.message);
    }
  }

  private async resolveAlert(name: string, options: AlertsOptions & { message?: string }): Promise<void> {
    try {
      const alerts = this.alertManager.getAlerts();
      const alert = alerts.find(a => a.name === name || a.id === name);

      if (!alert) {
        throw errorMessages.resourceNotFound(`Alert '${name}'`);
      }

      const success = this.alertManager.resolveAlert(alert.id);
      if (success) {
        this.log(`Alert '${name}' resolved`, 'success');
      } else {
        throw new Error('Failed to resolve alert');
      }
    } catch (error: any) {
      throw errorMessages.operationFailed('resolve alert', error.message);
    }
  }

  private async enableAlert(name: string): Promise<void> {
    try {
      const rules = this.alertManager.getRules();
      const rule = rules.find(r => r.name === name || r.id === name);

      if (!rule) {
        throw errorMessages.resourceNotFound(`Alert rule '${name}'`);
      }

      this.alertManager.setRuleEnabled(rule.id, true);
      this.log(`Alert rule '${name}' enabled`, 'success');
    } catch (error: any) {
      throw errorMessages.operationFailed('enable alert', error.message);
    }
  }

  private async disableAlert(name: string): Promise<void> {
    try {
      const rules = this.alertManager.getRules();
      const rule = rules.find(r => r.name === name || r.id === name);

      if (!rule) {
        throw errorMessages.resourceNotFound(`Alert rule '${name}'`);
      }

      this.alertManager.setRuleEnabled(rule.id, false);
      this.log(`Alert rule '${name}' disabled`, 'success');
    } catch (error: any) {
      throw errorMessages.operationFailed('disable alert', error.message);
    }
  }

  private async removeAlert(name: string, options: { force?: boolean }): Promise<void> {
    try {
      if (!options.force) {
        const confirm = await this.confirm(`Are you sure you want to remove alert '${name}'?`);
        if (!confirm) {
          this.log('Alert removal cancelled', 'info');
          return;
        }
      }

      const rules = this.alertManager.getRules();
      const rule = rules.find(r => r.name === name || r.id === name);

      if (!rule) {
        throw errorMessages.resourceNotFound(`Alert rule '${name}'`);
      }

      const success = this.alertManager.removeRule(rule.id);
      if (success) {
        this.log(`Alert rule '${name}' removed successfully`, 'success');
      } else {
        throw new Error('Failed to remove alert rule');
      }
    } catch (error: any) {
      throw errorMessages.operationFailed('remove alert', error.message);
    }
  }

  private async interactiveAlertSetup(): Promise<any> {
    const config: any = {};

    config.name = await this.prompt('Alert name');
    config.metric = await this.prompt('Metric to monitor');

    const { select } = await import('@clack/prompts');

    config.operator = await select({
      message: 'Comparison operator:',
      options: [
        { value: 'gt', label: 'Greater than (>)' },
        { value: 'gte', label: 'Greater than or equal (>=)' },
        { value: 'lt', label: 'Less than (<)' },
        { value: 'lte', label: 'Less than or equal (<=)' },
        { value: 'eq', label: 'Equal to (=)' },
        { value: 'neq', label: 'Not equal to (!=)' }
      ],
      initialValue: 'gt'
    });

    config.threshold = parseFloat(await this.prompt('Threshold value'));

    config.level = await select({
      message: 'Alert level:',
      options: [
        { value: 'info', label: 'Info' },
        { value: 'warning', label: 'Warning' },
        { value: 'critical', label: 'Critical' }
      ],
      initialValue: 'warning'
    });

    config.duration = await this.prompt('Duration before triggering (e.g., 5m, 1h)', '5m');

    const addNotifications = await this.confirm('Add notification channels?', false);

    if (addNotifications) {
      config.notifications = [];

      let addMore = true;
      while (addMore) {
        const channel = await select({
          message: 'Notification channel:',
          options: [
            { value: 'email', label: 'Email' },
            { value: 'slack', label: 'Slack' },
            { value: 'webhook', label: 'Webhook' },
            { value: 'sms', label: 'SMS' }
          ]
        });

        const target = await this.prompt(`${String(channel)} target (e.g., email address, webhook URL)`);

        config.notifications.push({ channel, target });

        addMore = await this.confirm('Add another notification channel?', false);
      }
    }

    return config;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  private evaluateCondition(condition: any, value: number): boolean {
    if (!condition.threshold) return false;

    switch (condition.operator) {
      case 'gt': return value > condition.threshold;
      case 'gte': return value >= condition.threshold;
      case 'lt': return value < condition.threshold;
      case 'lte': return value <= condition.threshold;
      case 'eq': return value === condition.threshold;
      case 'neq': return value !== condition.threshold;
      default: return false;
    }
  }
}