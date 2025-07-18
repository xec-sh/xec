import { Command } from 'commander';
import { Dashboard, DashboardWidget, DashboardManager } from '@xec-js/core';

import { SubcommandBase } from '../../utils/command-base.js';
import { errorMessages } from '../../utils/error-handler.js';

interface DashboardOptions {
  name?: string;
  format?: 'text' | 'json' | 'yaml' | 'csv' | 'html';
  output?: string;
  refresh?: number;
  theme?: 'light' | 'dark';
  layout?: 'grid' | 'list';
}

export class DashboardCommand extends SubcommandBase {
  private dashboardManager: DashboardManager;
  private dashboardOptions: DashboardOptions = {};

  constructor() {
    super({
      name: 'dashboard',
      description: 'Manage monitoring dashboards',
      examples: [
        {
          command: 'xec monitor dashboard list',
          description: 'List all dashboards',
        },
        {
          command: 'xec monitor dashboard create --name system',
          description: 'Create new dashboard',
        },
        {
          command: 'xec monitor dashboard show system',
          description: 'Display dashboard',
        },
        {
          command: 'xec monitor dashboard export system.json',
          description: 'Export dashboard configuration',
        },
      ],
    });

    this.dashboardManager = new DashboardManager();
  }

  protected setupSubcommands(command: Command): void {
    // xec monitor dashboard list
    command
      .command('list')
      .description('List available dashboards')
      .option('--json', 'Output as JSON')
      .action(async (options: DashboardOptions) => {
        this.dashboardOptions = { ...this.dashboardOptions, ...options };
        await this.listDashboards(options);
      });

    // xec monitor dashboard create
    command
      .command('create')
      .description('Create new dashboard')
      .option('--name <name>', 'Dashboard name')
      .option('--interactive', 'Interactive dashboard creation')
      .action(async (options: DashboardOptions & { interactive?: boolean }) => {
        this.dashboardOptions = { ...this.dashboardOptions, ...options };
        await this.createDashboard(options);
      });

    // xec monitor dashboard show
    command
      .command('show')
      .description('Display dashboard')
      .argument('<name>', 'Dashboard name')
      .option('--refresh <seconds>', 'Auto-refresh interval in seconds')
      .option('--format <format>', 'Output format (text|json|html)', 'text')
      .option('--theme <theme>', 'Display theme (light|dark)', 'light')
      .option('--layout <layout>', 'Layout style (grid|list)', 'grid')
      .action(async (name: string, options: DashboardOptions) => {
        this.dashboardOptions = { ...this.dashboardOptions, ...options };
        await this.showDashboard(name, options);
      });

    // xec monitor dashboard edit
    command
      .command('edit')
      .description('Edit dashboard')
      .argument('<name>', 'Dashboard name')
      .option('--add-widget <type>', 'Add widget type (metric|chart|table|alert)')
      .option('--remove-widget <id>', 'Remove widget by ID')
      .option('--interactive', 'Interactive editing')
      .action(async (name: string, options: DashboardOptions & { addWidget?: string; removeWidget?: string; interactive?: boolean }) => {
        this.dashboardOptions = { ...this.dashboardOptions, ...options };
        await this.editDashboard(name, options);
      });

    // xec monitor dashboard export
    command
      .command('export')
      .description('Export dashboard configuration')
      .argument('<name>', 'Dashboard name')
      .option('--format <format>', 'Export format (json|yaml)', 'json')
      .option('--output <output>', 'Output file path')
      .action(async (name: string, options: DashboardOptions) => {
        this.dashboardOptions = { ...this.dashboardOptions, ...options };
        await this.exportDashboard(name, options);
      });

    // xec monitor dashboard import
    command
      .command('import')
      .description('Import dashboard configuration')
      .argument('<file>', 'Configuration file path')
      .option('--name <name>', 'Override dashboard name')
      .action(async (file: string, options: DashboardOptions) => {
        this.dashboardOptions = { ...this.dashboardOptions, ...options };
        await this.importDashboard(file, options);
      });

    // xec monitor dashboard clone
    command
      .command('clone')
      .description('Clone existing dashboard')
      .argument('<source>', 'Source dashboard name')
      .argument('<target>', 'Target dashboard name')
      .action(async (source: string, target: string) => {
        await this.cloneDashboard(source, target);
      });

    // xec monitor dashboard remove
    command
      .command('remove')
      .alias('rm')
      .description('Remove dashboard')
      .argument('<name>', 'Dashboard name')
      .option('--force', 'Force removal without confirmation')
      .action(async (name: string, options: { force?: boolean }) => {
        this.dashboardOptions = { ...this.dashboardOptions, ...options };
        await this.removeDashboard(name, options);
      });
  }

  private async listDashboards(options: DashboardOptions): Promise<void> {
    try {
      const dashboards = this.dashboardManager.listDashboards();

      if (options.format === 'json') {
        this.output(dashboards, 'Dashboards');
      } else {
        this.intro('Available Dashboards');

        if (dashboards.length === 0) {
          this.log('No dashboards found', 'info');
          return;
        }

        const tableData = dashboards.map(dashboard => ({
          Name: dashboard.name,
          Widgets: dashboard.widgets.length.toString(),
          Created: new Date(dashboard.createdAt).toLocaleDateString(),
          Modified: new Date(dashboard.updatedAt).toLocaleDateString()
        }));

        this.table(tableData, ['Name', 'Widgets', 'Created', 'Modified']);
      }
    } catch (error: any) {
      throw errorMessages.operationFailed('list dashboards', error.message);
    }
  }

  private async createDashboard(options: DashboardOptions & { interactive?: boolean }): Promise<void> {
    try {
      let config: any = {};

      if (options.interactive) {
        config = await this.interactiveDashboardSetup();
      } else {
        config = {
          name: options.name || 'New Dashboard',
          widgets: []
        };
      }

      const dashboardId = config.name.toLowerCase().replace(/\s+/g, '-');
      const dashboard: Dashboard = {
        id: dashboardId,
        name: config.name,
        description: config.description,
        widgets: config.widgets || [],
        layout: config.layout || 'grid',
        refreshInterval: config.refreshInterval || 5000,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.dashboardManager.createDashboard(dashboard);
      this.log(`Dashboard '${dashboard.name}' created successfully`, 'success');
    } catch (error: any) {
      throw errorMessages.operationFailed('create dashboard', error.message);
    }
  }

  private async showDashboard(name: string, options: DashboardOptions): Promise<void> {
    try {
      const dashboard = this.dashboardManager.getDashboard(name);

      if (!dashboard) {
        throw errorMessages.resourceNotFound(`Dashboard '${name}'`);
      }

      if (options.format === 'json') {
        this.output(dashboard, `Dashboard: ${name}`);
        return;
      }

      if (options.format === 'html') {
        const html = await this.generateHtmlDashboard(dashboard, options);

        if (options.output) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.output, html);
          this.log(`Dashboard exported to ${options.output}`, 'success');
        } else {
          console.log(html);
        }
        return;
      }

      // Text format with optional auto-refresh
      const displayDashboard = async () => {
        console.clear();
        await this.renderTextDashboard(dashboard, options);
      };

      await displayDashboard();

      if (options.refresh) {
        const interval = options.refresh * 1000;
        this.log(`Auto-refresh enabled (${options.refresh}s). Press Ctrl+C to stop.`, 'info');

        const refreshInterval = setInterval(async () => {
          const updatedDashboard = await this.dashboardManager.getDashboard(name);
          if (updatedDashboard) {
            await displayDashboard();
          }
        }, interval);

        process.on('SIGINT', () => {
          clearInterval(refreshInterval);
          this.log('Dashboard monitoring stopped', 'info');
          process.exit(0);
        });
      }
    } catch (error: any) {
      throw errorMessages.operationFailed('show dashboard', error.message);
    }
  }

  private async editDashboard(name: string, options: DashboardOptions & { addWidget?: string; removeWidget?: string; interactive?: boolean }): Promise<void> {
    try {
      const dashboard = this.dashboardManager.getDashboard(name);

      if (!dashboard) {
        throw errorMessages.resourceNotFound(`Dashboard '${name}'`);
      }

      if (options.addWidget) {
        const widget = await this.createWidget(options.addWidget);
        await this.dashboardManager.addWidget(name, widget);
        this.log(`Widget added to dashboard '${name}'`, 'success');
      }

      if (options.removeWidget) {
        await this.dashboardManager.removeWidget(name, options.removeWidget);
        this.log(`Widget removed from dashboard '${name}'`, 'success');
      }

      if (options.interactive) {
        await this.interactiveDashboardEdit(name);
      }
    } catch (error: any) {
      throw errorMessages.operationFailed('edit dashboard', error.message);
    }
  }

  private async exportDashboard(name: string, options: DashboardOptions): Promise<void> {
    try {
      const dashboard = this.dashboardManager.getDashboard(name);

      if (!dashboard) {
        throw errorMessages.resourceNotFound(`Dashboard '${name}'`);
      }

      let content: string;

      if (options.format === 'yaml') {
        const yaml = await import('js-yaml');
        content = yaml.dump(dashboard);
      } else {
        content = JSON.stringify(dashboard, null, 2);
      }

      if (options.output) {
        const fs = await import('fs/promises');
        await fs.writeFile(options.output, content);
        this.log(`Dashboard exported to ${options.output}`, 'success');
      } else {
        console.log(content);
      }
    } catch (error: any) {
      throw errorMessages.operationFailed('export dashboard', error.message);
    }
  }

  private async importDashboard(file: string, options: DashboardOptions): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(file, 'utf8');

      let config: any;

      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const yaml = await import('js-yaml');
        config = yaml.load(content);
      } else {
        config = JSON.parse(content);
      }

      if (options.name) {
        config.name = options.name;
      }

      await this.dashboardManager.createDashboard(config);
      this.log(`Dashboard imported from ${file}`, 'success');
    } catch (error: any) {
      throw errorMessages.operationFailed('import dashboard', error.message);
    }
  }

  private async cloneDashboard(source: string, target: string): Promise<void> {
    try {
      const dashboard = await this.dashboardManager.getDashboard(source);

      if (!dashboard) {
        throw errorMessages.resourceNotFound(`Dashboard '${source}'`);
      }

      const cloned = { ...dashboard, name: target };
      await this.dashboardManager.createDashboard(cloned);

      this.log(`Dashboard '${source}' cloned to '${target}'`, 'success');
    } catch (error: any) {
      throw errorMessages.operationFailed('clone dashboard', error.message);
    }
  }

  private async removeDashboard(name: string, options: { force?: boolean }): Promise<void> {
    try {
      if (!options.force) {
        const confirm = await this.confirm(`Are you sure you want to remove dashboard '${name}'?`);
        if (!confirm) {
          this.log('Dashboard removal cancelled', 'info');
          return;
        }
      }

      await this.dashboardManager.deleteDashboard(name);
      this.log(`Dashboard '${name}' removed successfully`, 'success');
    } catch (error: any) {
      throw errorMessages.operationFailed('remove dashboard', error.message);
    }
  }

  private async interactiveDashboardSetup(): Promise<any> {
    const config: any = {};

    config.name = await this.prompt('Dashboard name');
    config.description = await this.prompt('Dashboard description');
    config.widgets = [];

    const addWidgets = await this.confirm('Add widgets to dashboard?', true);

    if (addWidgets) {
      let addMore = true;
      while (addMore) {
        const { select } = await import('@clack/prompts');

        const widgetType = await select({
          message: 'Widget type:',
          options: [
            { value: 'metric', label: 'Metric Display' },
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Data Table' },
            { value: 'alert', label: 'Alert Status' }
          ]
        });

        if (typeof widgetType !== 'symbol') {
          const widget = await this.createWidget(widgetType);
          config.widgets.push(widget);
        }

        addMore = await this.confirm('Add another widget?', false);
      }
    }

    return config;
  }

  private async createWidget(type: string): Promise<DashboardWidget> {
    const widget: any = { type, id: Date.now().toString() };

    switch (type) {
      case 'metric':
        widget.metric = await this.prompt('Metric name');
        widget.title = await this.prompt('Widget title', widget.metric);
        widget.unit = await this.prompt('Unit (optional)');
        break;

      case 'chart':
        widget.metrics = [await this.prompt('Metric name')];
        widget.title = await this.prompt('Chart title');
        widget.chartType = await this.prompt('Chart type (line|bar|pie)', 'line');
        widget.timeRange = await this.prompt('Time range (1h|24h|7d)', '1h');
        break;

      case 'table':
        widget.columns = [await this.prompt('Column name')];
        widget.title = await this.prompt('Table title');
        widget.dataSource = await this.prompt('Data source');
        break;

      case 'alert':
        widget.alertName = await this.prompt('Alert name');
        widget.title = await this.prompt('Widget title', `Alert: ${widget.alertName}`);
        break;
    }

    return widget;
  }

  private async interactiveDashboardEdit(name: string): Promise<void> {
    const { select } = await import('@clack/prompts');

    const action = await select({
      message: 'Edit action:',
      options: [
        { value: 'add', label: 'Add widget' },
        { value: 'remove', label: 'Remove widget' },
        { value: 'modify', label: 'Modify widget' },
        { value: 'reorder', label: 'Reorder widgets' }
      ]
    });

    switch (action) {
      case 'add':
        const widgetType = await select({
          message: 'Widget type:',
          options: [
            { value: 'metric', label: 'Metric Display' },
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Data Table' },
            { value: 'alert', label: 'Alert Status' }
          ]
        });

        if (typeof widgetType !== 'symbol') {
          const widget = await this.createWidget(widgetType);
          await this.dashboardManager.addWidget(name, widget);
          this.log('Widget added successfully', 'success');
        }
        break;

      case 'remove':
        const dashboard = this.dashboardManager.getDashboard(name);
        if (dashboard?.widgets.length === 0) {
          this.log('No widgets to remove', 'info');
          return;
        }

        const widgetToRemove = await select({
          message: 'Select widget to remove:',
          options: dashboard?.widgets.map(w => ({
            value: w.id,
            label: w.title || w.type
          })) || []
        });

        if (typeof widgetToRemove !== 'symbol') {
          await this.dashboardManager.removeWidget(name, widgetToRemove);
          this.log('Widget removed successfully', 'success');
        }
        break;
    }
  }

  private async renderTextDashboard(dashboard: any, options: DashboardOptions): Promise<void> {
    this.intro(`Dashboard: ${dashboard.name}`);

    if (dashboard.description) {
      this.log(dashboard.description, 'info');
    }

    if (dashboard.widgets.length === 0) {
      this.log('No widgets configured', 'info');
      return;
    }

    for (const widget of dashboard.widgets) {
      await this.renderWidget(widget, options);
    }
  }

  private async renderWidget(widget: any, options: DashboardOptions): Promise<void> {
    console.log(`\n${widget.title || widget.type.toUpperCase()}`);
    console.log('='.repeat(widget.title?.length || widget.type.length));

    switch (widget.type) {
      case 'metric':
        // TODO: getMetricValue is not implemented in DashboardManager
        // const value = await this.dashboardManager.getMetricValue(widget.metric);
        const value = 'N/A';
        console.log(`${value}${widget.unit ? ` ${widget.unit}` : ''}`);
        break;

      case 'chart':
        // TODO: getChartData is not implemented in DashboardManager
        // const chartData = await this.dashboardManager.getChartData(widget.metrics, widget.timeRange);
        const chartData: any[] = [];
        this.renderTextChart(chartData, widget);
        break;

      case 'table':
        // TODO: getTableData is not implemented in DashboardManager
        // const tableData = await this.dashboardManager.getTableData(widget.dataSource);
        const tableData: any[] = [];
        this.renderTextTable(tableData, widget);
        break;

      case 'alert':
        // TODO: getAlertStatus is not implemented in DashboardManager
        // const alertStatus = await this.dashboardManager.getAlertStatus(widget.alertName);
        const alertStatus = { active: false, message: '', triggeredAt: new Date() };
        this.renderAlertStatus(alertStatus);
        break;
    }
  }

  private renderTextChart(data: any, widget: any): void {
    // Simple ASCII chart rendering
    console.log('Chart data (simplified):');
    data.forEach((point: any, index: number) => {
      const bar = '█'.repeat(Math.floor(point.value / 10));
      console.log(`${point.timestamp} | ${bar} ${point.value}`);
    });
  }

  private renderTextTable(data: any[], widget: any): void {
    if (data.length === 0) {
      console.log('No data available');
      return;
    }

    // Use the table method from BaseCommand instead
    const tableData = data.map(row => widget.columns.map((col: string) => row[col] || ''));
    this.table(tableData, widget.columns);
  }

  private renderAlertStatus(alert: any): void {
    const status = alert.active ? '🚨 ACTIVE' : '✅ OK';
    console.log(`Status: ${status}`);

    if (alert.active) {
      console.log(`Message: ${alert.message}`);
      console.log(`Triggered: ${new Date(alert.triggeredAt).toLocaleString()}`);
    }
  }

  private async generateHtmlDashboard(dashboard: any, options: DashboardOptions): Promise<string> {
    const theme = options.theme || 'light';

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Dashboard: ${dashboard.name}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: ${theme === 'dark' ? '#1a1a1a' : '#f5f5f5'}; color: ${theme === 'dark' ? '#fff' : '#333'}; }
        .widget { margin: 20px 0; padding: 15px; background: ${theme === 'dark' ? '#2d2d2d' : '#fff'}; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .widget h3 { margin-top: 0; }
        .metric-value { font-size: 2em; font-weight: bold; color: #007acc; }
        .alert-active { color: #ff4444; }
        .alert-ok { color: #44ff44; }
    </style>
</head>
<body>
    <h1>Dashboard: ${dashboard.name}</h1>
    ${dashboard.description ? `<p>${dashboard.description}</p>` : ''}
    
    ${dashboard.widgets.map((widget: any) => `
        <div class="widget">
            <h3>${widget.title || widget.type.toUpperCase()}</h3>
            ${this.renderHtmlWidget(widget)}
        </div>
    `).join('')}
</body>
</html>
    `.trim();
  }

  private renderHtmlWidget(widget: any): string {
    switch (widget.type) {
      case 'metric':
        return `<div class="metric-value">${widget.value || 'N/A'}${widget.unit ? ` ${widget.unit}` : ''}</div>`;

      case 'alert':
        const alertClass = widget.active ? 'alert-active' : 'alert-ok';
        const alertText = widget.active ? '🚨 ACTIVE' : '✅ OK';
        return `<div class="${alertClass}">${alertText}</div>`;

      default:
        return `<div>Widget type: ${widget.type}</div>`;
    }
  }
}