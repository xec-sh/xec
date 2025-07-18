/**
 * Alert management system for Xec Core
 */

import { EventEmitter } from 'events';

import { SystemMetrics } from './metrics.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('alerts');

export interface Alert {
  id: string;
  name: string;
  severity: 'critical' | 'warning' | 'info';
  status: 'active' | 'resolved' | 'acknowledged';
  condition: AlertCondition;
  message: string;
  details?: Record<string, any>;
  triggeredAt: Date;
  resolvedAt?: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  count: number;
}

export interface AlertCondition {
  type: 'threshold' | 'rate' | 'absence' | 'custom';
  metric?: string;
  operator?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  threshold?: number;
  duration?: number; // How long condition must be true (ms)
  evaluator?: (value: any) => boolean;
}

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  condition: AlertCondition;
  severity: 'critical' | 'warning' | 'info';
  message: string | ((value: any) => string);
  cooldown?: number; // Minimum time between alerts (ms)
  actions?: AlertAction[];
}

export interface AlertAction {
  type: 'log' | 'email' | 'webhook' | 'custom';
  config?: Record<string, any>;
  handler?: (alert: Alert) => Promise<void>;
}

export interface AlertState {
  ruleId: string;
  lastTriggered?: Date;
  lastValue?: any;
  consecutiveMatches: number;
  active: boolean;
}

export class AlertManager extends EventEmitter {
  private rules: Map<string, AlertRule> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private alertStates: Map<string, AlertState> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private metricsProvider?: () => Map<string, any>;
  private systemMetricsProvider?: () => SystemMetrics | null;

  constructor() {
    super();
    this.initializeDefaultRules();
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultRules(): void {
    // High CPU usage
    this.addRule({
      id: 'high-cpu',
      name: 'High CPU Usage',
      description: 'CPU usage above 80%',
      enabled: true,
      condition: {
        type: 'threshold',
        metric: 'system.cpu.usage',
        operator: 'gt',
        threshold: 80,
        duration: 60000 // 1 minute
      },
      severity: 'warning',
      message: 'CPU usage is above 80%'
    });

    // High memory usage
    this.addRule({
      id: 'high-memory',
      name: 'High Memory Usage',
      description: 'Memory usage above 85%',
      enabled: true,
      condition: {
        type: 'threshold',
        metric: 'system.memory.percentage',
        operator: 'gt',
        threshold: 85,
        duration: 60000 // 1 minute
      },
      severity: 'warning',
      message: 'Memory usage is above 85%'
    });

    // High disk usage
    this.addRule({
      id: 'high-disk',
      name: 'High Disk Usage',
      description: 'Disk usage above 90%',
      enabled: true,
      condition: {
        type: 'threshold',
        metric: 'system.disk.percentage',
        operator: 'gt',
        threshold: 90,
        duration: 300000 // 5 minutes
      },
      severity: 'critical',
      message: 'Disk usage is above 90%'
    });

    // Task failure rate
    this.addRule({
      id: 'high-failure-rate',
      name: 'High Task Failure Rate',
      description: 'Task failure rate above 10%',
      enabled: true,
      condition: {
        type: 'rate',
        metric: 'task_failure_rate',
        operator: 'gt',
        threshold: 0.1,
        duration: 300000 // 5 minutes
      },
      severity: 'warning',
      message: 'Task failure rate is above 10%'
    });
  }

  /**
   * Set metrics provider
   */
  setMetricsProvider(provider: () => Map<string, any>): void {
    this.metricsProvider = provider;
  }

  /**
   * Set system metrics provider
   */
  setSystemMetricsProvider(provider: () => SystemMetrics | null): void {
    this.systemMetricsProvider = provider;
  }

  /**
   * Add an alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    this.alertStates.set(rule.id, {
      ruleId: rule.id,
      consecutiveMatches: 0,
      active: false
    });

    logger.info(`Added alert rule: ${rule.name} (${rule.id})`);
  }

  /**
   * Remove an alert rule
   */
  removeRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    this.rules.delete(ruleId);
    this.alertStates.delete(ruleId);

    // Remove associated alerts
    for (const [alertId, alert] of this.alerts) {
      if (alert.name === rule.name) {
        this.alerts.delete(alertId);
      }
    }

    logger.info(`Removed alert rule: ${rule.name} (${ruleId})`);
    return true;
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
      logger.info(`Alert rule ${ruleId} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Get all rules
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get all alerts
   */
  getAlerts(status?: 'active' | 'resolved' | 'acknowledged'): Alert[] {
    const alerts = Array.from(this.alerts.values());
    if (status) {
      return alerts.filter(a => a.status === status);
    }
    return alerts;
  }

  /**
   * Get alert by ID
   */
  getAlert(alertId: string): Alert | undefined {
    return this.alerts.get(alertId);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.status !== 'active') return false;

    alert.status = 'acknowledged';
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = acknowledgedBy;

    this.emit('alert:acknowledged', alert);
    logger.info(`Alert acknowledged: ${alert.name} (${alertId})`);
    
    return true;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.status === 'resolved') return false;

    alert.status = 'resolved';
    alert.resolvedAt = new Date();

    this.emit('alert:resolved', alert);
    logger.info(`Alert resolved: ${alert.name} (${alertId})`);
    
    return true;
  }

  /**
   * Start alert monitoring
   */
  start(intervalMs = 10000): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkAlerts();
    }, intervalMs);

    logger.info(`Started alert monitoring (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop alert monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Stopped alert monitoring');
    }
  }

  /**
   * Check all alert rules
   */
  private async checkAlerts(): Promise<void> {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      try {
        await this.checkRule(rule);
      } catch (error) {
        logger.error(`Error checking rule ${rule.id}:`, error);
      }
    }
  }

  /**
   * Check a single rule
   */
  private async checkRule(rule: AlertRule): Promise<void> {
    const state = this.alertStates.get(rule.id);
    if (!state) return;

    const value = await this.evaluateCondition(rule.condition);
    const matches = this.conditionMatches(rule.condition, value);

    if (matches) {
      state.consecutiveMatches++;
      state.lastValue = value;

      const duration = rule.condition.duration || 0;
      const matchDuration = state.consecutiveMatches * 10000; // Assuming 10s check interval

      if (matchDuration >= duration && !state.active) {
        // Trigger alert
        await this.triggerAlert(rule, value);
        state.active = true;
        state.lastTriggered = new Date();
      }
    } else {
      if (state.active) {
        // Condition no longer matches, resolve alert
        const activeAlerts = this.getAlerts('active').filter(a => a.name === rule.name);
        for (const alert of activeAlerts) {
          this.resolveAlert(alert.id);
        }
      }
      state.consecutiveMatches = 0;
      state.active = false;
    }
  }

  /**
   * Evaluate condition to get current value
   */
  private async evaluateCondition(condition: AlertCondition): Promise<any> {
    if (condition.type === 'custom' && condition.evaluator) {
      // Custom evaluator
      return null; // Evaluator will handle the check
    }

    if (!condition.metric) return null;

    // Check system metrics
    if (condition.metric.startsWith('system.') && this.systemMetricsProvider) {
      const systemMetrics = this.systemMetricsProvider();
      if (!systemMetrics) return null;

      const path = condition.metric.split('.');
      let value: any = systemMetrics;
      
      for (let i = 1; i < path.length; i++) {
        const key = path[i];
        if (key === undefined) return null;
        value = value[key];
        if (value === undefined) return null;
      }
      
      return value;
    }

    // Check application metrics
    if (this.metricsProvider) {
      const metrics = this.metricsProvider();
      return metrics.get(condition.metric);
    }

    return null;
  }

  /**
   * Check if condition matches
   */
  private conditionMatches(condition: AlertCondition, value: any): boolean {
    if (condition.type === 'custom' && condition.evaluator) {
      return condition.evaluator(value);
    }

    if (value === null || value === undefined) return false;

    const threshold = condition.threshold;
    if (threshold === undefined) return false;

    const numValue = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numValue)) return false;

    switch (condition.operator) {
      case 'gt': return numValue > threshold;
      case 'gte': return numValue >= threshold;
      case 'lt': return numValue < threshold;
      case 'lte': return numValue <= threshold;
      case 'eq': return numValue === threshold;
      case 'neq': return numValue !== threshold;
      default: return false;
    }
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(rule: AlertRule, value: any): Promise<void> {
    const alert: Alert = {
      id: `${rule.id}-${Date.now()}`,
      name: rule.name,
      severity: rule.severity,
      status: 'active',
      condition: rule.condition,
      message: typeof rule.message === 'function' ? rule.message(value) : rule.message,
      details: {
        ruleId: rule.id,
        value,
        threshold: rule.condition.threshold,
        metric: rule.condition.metric
      },
      triggeredAt: new Date(),
      count: 1
    };

    // Check for existing active alert of same type
    const existingAlert = Array.from(this.alerts.values()).find(
      a => a.name === rule.name && a.status === 'active'
    );

    if (existingAlert) {
      existingAlert.count++;
      logger.info(`Alert count increased: ${rule.name} (count: ${existingAlert.count})`);
    } else {
      this.alerts.set(alert.id, alert);
      this.emit('alert:triggered', alert);
      logger.warn(`Alert triggered: ${rule.name} - ${alert.message}`);

      // Execute actions
      if (rule.actions) {
        for (const action of rule.actions) {
          await this.executeAction(action, alert);
        }
      }
    }
  }

  /**
   * Execute alert action
   */
  private async executeAction(action: AlertAction, alert: Alert): Promise<void> {
    try {
      switch (action.type) {
        case 'log':
          logger.warn(`ALERT [${alert.severity}]: ${alert.message}`, alert.details);
          break;

        case 'webhook':
          if (action.config?.['url']) {
            // Would implement webhook call here
            logger.info(`Would send webhook to ${action.config['url']}`);
          }
          break;

        case 'email':
          if (action.config?.['to']) {
            // Would implement email sending here
            logger.info(`Would send email to ${action.config['to']}`);
          }
          break;

        case 'custom':
          if (action.handler) {
            await action.handler(alert);
          }
          break;
      }
    } catch (error) {
      logger.error(`Failed to execute alert action ${action.type}:`, error);
    }
  }

  /**
   * Clear all alerts
   */
  clearAlerts(): void {
    this.alerts.clear();
    for (const state of this.alertStates.values()) {
      state.active = false;
      state.consecutiveMatches = 0;
    }
  }

  /**
   * Export alert configuration
   */
  exportConfiguration(): {
    rules: AlertRule[];
  } {
    return {
      rules: Array.from(this.rules.values())
    };
  }

  /**
   * Import alert configuration
   */
  importConfiguration(config: { rules: AlertRule[] }): void {
    for (const rule of config.rules) {
      this.addRule(rule);
    }
  }
}

// Global alert manager
let globalAlertManager: AlertManager | null = null;

export function getAlertManager(): AlertManager {
  if (!globalAlertManager) {
    globalAlertManager = new AlertManager();
  }
  return globalAlertManager;
}

// Helper functions
export function createThresholdAlert(
  name: string,
  metric: string,
  threshold: number,
  operator: 'gt' | 'lt' = 'gt',
  severity: 'critical' | 'warning' | 'info' = 'warning'
): AlertRule {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    enabled: true,
    condition: {
      type: 'threshold',
      metric,
      operator,
      threshold,
      duration: 60000 // 1 minute default
    },
    severity,
    message: `${metric} is ${operator === 'gt' ? 'above' : 'below'} ${threshold}`
  };
}

export function createCustomAlert(
  name: string,
  evaluator: (value: any) => boolean,
  message: string,
  severity: 'critical' | 'warning' | 'info' = 'warning'
): AlertRule {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    enabled: true,
    condition: {
      type: 'custom',
      evaluator
    },
    severity,
    message
  };
}