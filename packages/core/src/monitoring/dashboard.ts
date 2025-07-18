/**
 * Dashboard and visualization system for Xec Core monitoring
 */

import { Alert } from './alerts.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('dashboard');

export interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'alert' | 'log' | 'status';
  title: string;
  position: { x: number; y: number; width: number; height: number };
  config: WidgetConfig;
  refreshInterval?: number;
}

export interface WidgetConfig {
  metric?: string;
  metrics?: string[];
  timeRange?: number; // Minutes
  aggregation?: 'avg' | 'sum' | 'min' | 'max' | 'count';
  chartType?: 'line' | 'bar' | 'gauge' | 'pie';
  thresholds?: { value: number; color: string; label?: string }[];
  unit?: string;
  format?: string;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  layout: 'grid' | 'flow';
  refreshInterval: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardData {
  timestamp: Date;
  widgets: Map<string, WidgetData>;
  alerts: Alert[];
  systemHealth: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    issues: string[];
  };
}

export interface WidgetData {
  widgetId: string;
  data: any;
  error?: string;
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    color?: string;
  }[];
}

export class DashboardManager {
  private dashboards: Map<string, Dashboard> = new Map();
  private dataProviders: Map<string, DataProvider> = new Map();
  private updateCallbacks: Map<string, (data: DashboardData) => void> = new Map();

  constructor() {
    this.initializeDefaultDashboards();
  }

  /**
   * Initialize default dashboards
   */
  private initializeDefaultDashboards(): void {
    // System Overview Dashboard
    this.createDashboard({
      id: 'system-overview',
      name: 'System Overview',
      description: 'Overall system health and performance',
      layout: 'grid',
      refreshInterval: 5000,
      widgets: [
        {
          id: 'cpu-gauge',
          type: 'metric',
          title: 'CPU Usage',
          position: { x: 0, y: 0, width: 3, height: 2 },
          config: {
            metric: 'system.cpu.usage',
            chartType: 'gauge',
            unit: '%',
            thresholds: [
              { value: 0, color: 'green' },
              { value: 60, color: 'yellow' },
              { value: 80, color: 'red' }
            ]
          }
        },
        {
          id: 'memory-gauge',
          type: 'metric',
          title: 'Memory Usage',
          position: { x: 3, y: 0, width: 3, height: 2 },
          config: {
            metric: 'system.memory.percentage',
            chartType: 'gauge',
            unit: '%',
            thresholds: [
              { value: 0, color: 'green' },
              { value: 70, color: 'yellow' },
              { value: 85, color: 'red' }
            ]
          }
        },
        {
          id: 'disk-gauge',
          type: 'metric',
          title: 'Disk Usage',
          position: { x: 6, y: 0, width: 3, height: 2 },
          config: {
            metric: 'system.disk.percentage',
            chartType: 'gauge',
            unit: '%',
            thresholds: [
              { value: 0, color: 'green' },
              { value: 75, color: 'yellow' },
              { value: 90, color: 'red' }
            ]
          }
        },
        {
          id: 'cpu-history',
          type: 'chart',
          title: 'CPU History',
          position: { x: 0, y: 2, width: 6, height: 3 },
          config: {
            metric: 'system.cpu.usage',
            chartType: 'line',
            timeRange: 60,
            unit: '%'
          }
        },
        {
          id: 'active-alerts',
          type: 'alert',
          title: 'Active Alerts',
          position: { x: 6, y: 2, width: 3, height: 3 },
          config: {}
        },
        {
          id: 'system-status',
          type: 'status',
          title: 'System Status',
          position: { x: 9, y: 0, width: 3, height: 5 },
          config: {}
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Task Performance Dashboard
    this.createDashboard({
      id: 'task-performance',
      name: 'Task Performance',
      description: 'Task execution metrics and performance',
      layout: 'grid',
      refreshInterval: 10000,
      widgets: [
        {
          id: 'task-count',
          type: 'metric',
          title: 'Total Tasks Executed',
          position: { x: 0, y: 0, width: 4, height: 2 },
          config: {
            metric: 'task_execution_count',
            aggregation: 'sum',
            format: 'number'
          }
        },
        {
          id: 'task-failure-rate',
          type: 'metric',
          title: 'Failure Rate',
          position: { x: 4, y: 0, width: 4, height: 2 },
          config: {
            metric: 'task_failure_rate',
            chartType: 'gauge',
            unit: '%',
            format: 'percentage'
          }
        },
        {
          id: 'active-tasks',
          type: 'metric',
          title: 'Active Tasks',
          position: { x: 8, y: 0, width: 4, height: 2 },
          config: {
            metric: 'active_tasks',
            format: 'number'
          }
        },
        {
          id: 'task-duration',
          type: 'chart',
          title: 'Task Duration Distribution',
          position: { x: 0, y: 2, width: 12, height: 4 },
          config: {
            metric: 'task_execution_duration',
            chartType: 'bar',
            aggregation: 'avg',
            unit: 'ms'
          }
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  /**
   * Create a new dashboard
   */
  createDashboard(dashboard: Dashboard): void {
    this.dashboards.set(dashboard.id, dashboard);
    logger.info(`Created dashboard: ${dashboard.name} (${dashboard.id})`);
  }

  /**
   * Get dashboard by ID
   */
  getDashboard(dashboardId: string): Dashboard | undefined {
    return this.dashboards.get(dashboardId);
  }

  /**
   * List all dashboards
   */
  listDashboards(): Dashboard[] {
    return Array.from(this.dashboards.values());
  }

  /**
   * Update dashboard
   */
  updateDashboard(dashboardId: string, updates: Partial<Dashboard>): void {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard '${dashboardId}' not found`);
    }

    Object.assign(dashboard, updates, { updatedAt: new Date() });
    logger.info(`Updated dashboard: ${dashboard.name} (${dashboardId})`);
  }

  /**
   * Delete dashboard
   */
  deleteDashboard(dashboardId: string): boolean {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return false;

    // Don't delete default dashboards
    if (['system-overview', 'task-performance'].includes(dashboardId)) {
      throw new Error('Cannot delete built-in dashboard');
    }

    this.dashboards.delete(dashboardId);
    this.updateCallbacks.delete(dashboardId);
    
    logger.info(`Deleted dashboard: ${dashboard.name} (${dashboardId})`);
    return true;
  }

  /**
   * Add widget to dashboard
   */
  addWidget(dashboardId: string, widget: DashboardWidget): void {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard '${dashboardId}' not found`);
    }

    dashboard.widgets.push(widget);
    dashboard.updatedAt = new Date();
    
    logger.info(`Added widget '${widget.title}' to dashboard '${dashboard.name}'`);
  }

  /**
   * Remove widget from dashboard
   */
  removeWidget(dashboardId: string, widgetId: string): boolean {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return false;

    const index = dashboard.widgets.findIndex(w => w.id === widgetId);
    if (index === -1) return false;

    dashboard.widgets.splice(index, 1);
    dashboard.updatedAt = new Date();
    
    logger.info(`Removed widget '${widgetId}' from dashboard '${dashboard.name}'`);
    return true;
  }

  /**
   * Register data provider
   */
  registerDataProvider(name: string, provider: DataProvider): void {
    this.dataProviders.set(name, provider);
  }

  /**
   * Get dashboard data
   */
  async getDashboardData(
    dashboardId: string,
    options?: { timeRange?: number }
  ): Promise<DashboardData> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard '${dashboardId}' not found`);
    }

    const widgetData = new Map<string, WidgetData>();

    // Collect data for each widget
    for (const widget of dashboard.widgets) {
      try {
        const data = await this.getWidgetData(widget, options);
        widgetData.set(widget.id, {
          widgetId: widget.id,
          data
        });
      } catch (error: any) {
        widgetData.set(widget.id, {
          widgetId: widget.id,
          data: null,
          error: error.message
        });
      }
    }

    // Get system health
    const healthProvider = this.dataProviders.get('system.health');
    const systemHealth = healthProvider ? await healthProvider() : {
      status: 'unknown' as const,
      issues: []
    };

    // Get alerts
    const alertProvider = this.dataProviders.get('alerts');
    const alerts = alertProvider ? await alertProvider() : [];

    return {
      timestamp: new Date(),
      widgets: widgetData,
      alerts,
      systemHealth
    };
  }

  /**
   * Get data for a specific widget
   */
  private async getWidgetData(
    widget: DashboardWidget,
    options?: { timeRange?: number }
  ): Promise<any> {
    switch (widget.type) {
      case 'metric':
        return this.getMetricData(widget.config, options);
      
      case 'chart':
        return this.getChartData(widget.config, options);
      
      case 'alert':
        return this.getAlertData(widget.config);
      
      case 'status':
        return this.getStatusData(widget.config);
      
      case 'log':
        return this.getLogData(widget.config, options);
      
      default:
        throw new Error(`Unknown widget type: ${widget.type}`);
    }
  }

  /**
   * Get metric data
   */
  private async getMetricData(
    config: WidgetConfig,
    options?: { timeRange?: number }
  ): Promise<any> {
    if (!config.metric) return null;

    const provider = this.dataProviders.get(config.metric);
    if (!provider) {
      throw new Error(`No data provider for metric: ${config.metric}`);
    }

    const value = await provider();
    
    // Format value based on config
    if (config.format === 'percentage' && typeof value === 'number') {
      return Math.round(value * 100) / 100;
    }

    return value;
  }

  /**
   * Get chart data
   */
  private async getChartData(
    config: WidgetConfig,
    options?: { timeRange?: number }
  ): Promise<ChartData> {
    const timeRange = options?.timeRange || config.timeRange || 60;
    const provider = this.dataProviders.get(`${config.metric}.history`);
    
    if (!provider) {
      return { labels: [], datasets: [] };
    }

    const history = await provider({ timeRange });
    
    // Convert to chart data format
    const labels: string[] = [];
    const data: number[] = [];

    for (const point of history) {
      labels.push(new Date(point.timestamp).toLocaleTimeString());
      data.push(point.value);
    }

    return {
      labels,
      datasets: [{
        label: config.metric || 'Value',
        data,
        color: '#3498db'
      }]
    };
  }

  /**
   * Get alert data
   */
  private async getAlertData(config: WidgetConfig): Promise<Alert[]> {
    const provider = this.dataProviders.get('alerts.active');
    return provider ? await provider() : [];
  }

  /**
   * Get status data
   */
  private async getStatusData(config: WidgetConfig): Promise<any> {
    const providers = {
      cpu: this.dataProviders.get('system.cpu'),
      memory: this.dataProviders.get('system.memory'),
      disk: this.dataProviders.get('system.disk'),
      health: this.dataProviders.get('system.health')
    };

    const status: any = {};

    for (const [key, provider] of Object.entries(providers)) {
      if (provider) {
        status[key] = await provider();
      }
    }

    return status;
  }

  /**
   * Get log data
   */
  private async getLogData(
    config: WidgetConfig,
    options?: { timeRange?: number }
  ): Promise<any[]> {
    const provider = this.dataProviders.get('logs.recent');
    return provider ? await provider({ limit: 100, timeRange: options?.timeRange }) : [];
  }

  /**
   * Subscribe to dashboard updates
   */
  subscribe(dashboardId: string, callback: (data: DashboardData) => void): () => void {
    this.updateCallbacks.set(dashboardId, callback);
    
    // Return unsubscribe function
    return () => {
      this.updateCallbacks.delete(dashboardId);
    };
  }

  /**
   * Start auto-refresh for a dashboard
   */
  startAutoRefresh(dashboardId: string): void {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return;

    const callback = this.updateCallbacks.get(dashboardId);
    if (!callback) return;

    const interval = setInterval(async () => {
      try {
        const data = await this.getDashboardData(dashboardId);
        callback(data);
      } catch (error) {
        logger.error(`Failed to refresh dashboard ${dashboardId}:`, error);
      }
    }, dashboard.refreshInterval);

    // Store interval for cleanup
    (dashboard as any).__refreshInterval = interval;
  }

  /**
   * Stop auto-refresh for a dashboard
   */
  stopAutoRefresh(dashboardId: string): void {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return;

    const interval = (dashboard as any).__refreshInterval;
    if (interval) {
      clearInterval(interval);
      delete (dashboard as any).__refreshInterval;
    }
  }

  /**
   * Export dashboard configuration
   */
  exportDashboard(dashboardId: string): Dashboard | null {
    return this.dashboards.get(dashboardId) || null;
  }

  /**
   * Import dashboard configuration
   */
  importDashboard(config: Dashboard): void {
    // Generate new ID to avoid conflicts
    config.id = `imported-${Date.now()}`;
    config.createdAt = new Date();
    config.updatedAt = new Date();
    
    this.createDashboard(config);
  }
}

// Type for data provider functions
type DataProvider = (options?: any) => Promise<any> | any;

// Global dashboard manager
let globalDashboardManager: DashboardManager | null = null;

export function getDashboardManager(): DashboardManager {
  if (!globalDashboardManager) {
    globalDashboardManager = new DashboardManager();
  }
  return globalDashboardManager;
}

// Helper functions
export function createMetricWidget(
  id: string,
  title: string,
  metric: string,
  position: { x: number; y: number; width: number; height: number },
  config?: Partial<WidgetConfig>
): DashboardWidget {
  return {
    id,
    type: 'metric',
    title,
    position,
    config: {
      metric,
      ...config
    }
  };
}

export function createChartWidget(
  id: string,
  title: string,
  metric: string,
  chartType: 'line' | 'bar' | 'gauge' | 'pie',
  position: { x: number; y: number; width: number; height: number },
  config?: Partial<WidgetConfig>
): DashboardWidget {
  return {
    id,
    type: 'chart',
    title,
    position,
    config: {
      metric,
      chartType,
      timeRange: 60,
      ...config
    }
  };
}

export function formatMetricValue(value: number, unit?: string): string {
  if (unit === '%') {
    return `${Math.round(value)}%`;
  } else if (unit === 'bytes') {
    if (value > 1024 * 1024 * 1024) {
      return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    } else if (value > 1024 * 1024) {
      return `${(value / (1024 * 1024)).toFixed(2)} MB`;
    } else if (value > 1024) {
      return `${(value / 1024).toFixed(2)} KB`;
    }
    return `${value} B`;
  } else if (unit === 'ms') {
    if (value > 1000) {
      return `${(value / 1000).toFixed(2)}s`;
    }
    return `${Math.round(value)}ms`;
  }
  
  return value.toString();
}