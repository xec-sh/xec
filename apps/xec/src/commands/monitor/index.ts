import { Command } from 'commander';

import { AlertsCommand } from './alerts.js';
import { MetricsCommand } from './metrics.js';
import { DashboardCommand } from './dashboard.js';

export default function monitorCommand(program: Command) {
  const monitor = program
    .command('monitor')
    .description('Monitor system and application metrics')
    .action(async () => {
      // Show monitor help by default
      monitor.help();
    });

  // Add subcommands
  const metricsCommand = new MetricsCommand();
  const alertsCommand = new AlertsCommand();
  const dashboardCommand = new DashboardCommand();

  // Setup subcommands
  monitor.addCommand(metricsCommand.create());
  monitor.addCommand(alertsCommand.create());
  monitor.addCommand(dashboardCommand.create());

  return monitor;
}