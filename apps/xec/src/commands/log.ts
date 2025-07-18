import { Command } from 'commander';
import { Logger, EventStore, MemoryStorageAdapter } from '@xec-js/core';

import { ValidationError } from '../utils/validation.js';
import { errorMessages } from '../utils/error-handler.js';

interface LogOptions {
  since?: string;
  until?: string;
  level?: string;
  format?: 'text' | 'json' | 'csv';
  output?: string;
  follow?: boolean;
  lines?: number;
  query?: string;
  component?: string;
  checkpoint?: string;
}

export default function logCommand(program: Command) {
  const log = program
    .command('log')
    .description('Manage logs and events')
    .action(async () => {
      // Show recent logs by default
      await streamLogs({ lines: 50 });
    });

  // xec log stream
  log
    .command('stream')
    .description('Stream logs in real-time')
    .option('--level <level>', 'Filter by log level (debug|info|warn|error)')
    .option('--component <component>', 'Filter by component')
    .option('--format <format>', 'Output format (text|json)', 'text')
    .option('--lines <lines>', 'Number of lines to show initially', '100')
    .action(async (options: LogOptions) => {
      await streamLogs(options);
    });

  // xec log search
  log
    .command('search')
    .description('Search logs')
    .option('--query <query>', 'Search query')
    .option('--since <since>', 'Start time (e.g., 1h, 2d, 2023-01-01)')
    .option('--until <until>', 'End time (e.g., 1h, 2d, 2023-01-01)')
    .option('--level <level>', 'Filter by log level')
    .option('--component <component>', 'Filter by component')
    .option('--format <format>', 'Output format (text|json|csv)', 'text')
    .option('--lines <lines>', 'Maximum number of lines to return', '1000')
    .action(async (options: LogOptions) => {
      await searchLogs(options);
    });

  // xec log export
  log
    .command('export')
    .description('Export logs to file')
    .option('--since <since>', 'Start time (e.g., 1h, 2d, 2023-01-01)')
    .option('--until <until>', 'End time (e.g., 1h, 2d, 2023-01-01)')
    .option('--level <level>', 'Filter by log level')
    .option('--component <component>', 'Filter by component')
    .option('--format <format>', 'Output format (text|json|csv)', 'json')
    .option('--output <output>', 'Output file path')
    .option('--compress', 'Compress output file')
    .action(async (options: LogOptions & { compress?: boolean }) => {
      await exportLogs(options);
    });

  // xec log replay
  log
    .command('replay')
    .description('Replay events from a specific point')
    .option('--from <checkpoint>', 'Replay from checkpoint or timestamp')
    .option('--to <checkpoint>', 'Replay until checkpoint or timestamp')
    .option('--speed <speed>', 'Replay speed multiplier', '1')
    .option('--dry-run', 'Dry run replay')
    .action(async (options: LogOptions & { to?: string; speed?: string; dryRun?: boolean }) => {
      await replayLogs(options);
    });

  // xec log aggregate
  log
    .command('aggregate')
    .description('Aggregate logs and generate statistics')
    .option('--since <since>', 'Start time (e.g., 1h, 2d, 2023-01-01)')
    .option('--until <until>', 'End time (e.g., 1h, 2d, 2023-01-01)')
    .option('--group-by <field>', 'Group by field (level|component|hour|day)', 'level')
    .option('--format <format>', 'Output format (text|json|csv)', 'text')
    .action(async (options: LogOptions & { groupBy?: string }) => {
      await aggregateLogs(options);
    });

  // xec log clear
  log
    .command('clear')
    .description('Clear logs')
    .option('--before <date>', 'Clear logs before date')
    .option('--level <level>', 'Clear logs of specific level')
    .option('--component <component>', 'Clear logs of specific component')
    .option('--force', 'Force clear without confirmation')
    .action(async (options: LogOptions & { before?: string; force?: boolean }) => {
      await clearLogs(options);
    });

  return log;
}

async function streamLogs(options: LogOptions): Promise<void> {
  try {
    const storage = new MemoryStorageAdapter();
    const eventStore = new EventStore(storage);
    await eventStore.initialize();
    const logger = new Logger({ name: 'log-stream' });

    // Get recent events to show initially
    const events = await eventStore.getEvents({
      limit: options.lines ? parseInt(options.lines.toString()) : 100
    });

    // Display initial events
    events.forEach((event: any) => {
      if (options.format === 'json') {
        console.log(JSON.stringify(event, null, 2));
      } else {
        const timestamp = new Date(event.timestamp).toISOString();
        const level = event.metadata?.level || 'info';
        const component = event.metadata?.component || 'system';
        console.log(`${timestamp} ${level.toUpperCase().padEnd(5)} [${component}] ${event.type}`);
      }
    });

    // Note: Real-time streaming would require additional implementation
    if (options.follow) {
      logger.info('Follow mode would stream new events in real-time');
    }
  } catch (error: any) {
    throw errorMessages.operationFailed('stream logs', error.message);
  }
}

async function searchLogs(options: LogOptions): Promise<void> {
  try {
    const storage = new MemoryStorageAdapter();
    const eventStore = new EventStore(storage);
    await eventStore.initialize();

    // Convert time strings to Date objects if provided
    const since = options.since ? new Date(options.since) : undefined;
    const until = options.until ? new Date(options.until) : undefined;

    let results;
    if (since || until) {
      results = await eventStore.getEventsByTimeRange({
        from: since?.getTime() || 0,
        to: until?.getTime()
      }, {
        limit: options.lines ? parseInt(options.lines.toString()) : 1000
      });
    } else {
      results = await eventStore.getEvents({
        limit: options.lines ? parseInt(options.lines.toString()) : 1000
      });
    }

    if (options.format === 'json') {
      console.log(JSON.stringify(results, null, 2));
    } else if (options.format === 'csv') {
      // Convert to CSV format
      const csvHeader = 'timestamp,type,resource,actor,data';
      console.log(csvHeader);

      results.forEach((entry: any) => {
        const row = [
          entry.timestamp,
          entry.type,
          entry.resource || '',
          entry.actor || '',
          `"${JSON.stringify(entry.data).replace(/"/g, '""')}"`
        ].join(',');
        console.log(row);
      });
    } else {
      // Text format
      results.forEach((entry: any) => {
        const timestamp = new Date(entry.timestamp).toISOString();
        const level = entry.metadata?.level || 'info';
        const component = entry.metadata?.component || 'system';
        console.log(`${timestamp} ${level.toUpperCase().padEnd(5)} [${component}] ${entry.type} - ${entry.resource || ''}`);
      });
    }
  } catch (error: any) {
    throw errorMessages.operationFailed('search logs', error.message);
  }
}

async function exportLogs(options: LogOptions & { compress?: boolean }): Promise<void> {
  try {
    const storage = new MemoryStorageAdapter();
    const eventStore = new EventStore(storage);
    await eventStore.initialize();
    const fs = await import('fs-extra');

    // Convert time strings to Date objects if provided
    const since = options.since ? new Date(options.since) : undefined;
    const until = options.until ? new Date(options.until) : undefined;

    let results;
    if (since || until) {
      results = await eventStore.getEventsByTimeRange({
        from: since?.getTime() || 0,
        to: until?.getTime()
      });
    } else {
      results = await eventStore.getEvents();
    }

    const outputPath = options.output || `logs-${new Date().toISOString().replace(/:/g, '-')}.${options.format || 'json'}`;

    let content: string;
    if (options.format === 'csv') {
      const csvHeader = 'timestamp,type,resource,actor,data\n';
      content = csvHeader + results.map((entry: any) => {
        const row = [
          entry.timestamp,
          entry.type,
          entry.resource || '',
          entry.actor || '',
          `"${JSON.stringify(entry.data).replace(/"/g, '""')}"`
        ].join(',');
        return row;
      }).join('\n');
    } else {
      content = JSON.stringify(results, null, 2);
    }

    await fs.writeFile(outputPath, content);

    console.log(`Logs exported to: ${outputPath}`);
    console.log(`Total entries: ${results.length}`);

    if (options.compress) {
      console.log('Compression not yet implemented');
    }
  } catch (error: any) {
    throw errorMessages.operationFailed('export logs', error.message);
  }
}

async function replayLogs(options: LogOptions & { to?: string; speed?: string; dryRun?: boolean }): Promise<void> {
  try {
    const storage = new MemoryStorageAdapter();
    const eventStore = new EventStore(storage);
    await eventStore.initialize();

    if (!options.checkpoint) {
      throw new ValidationError('checkpoint or from parameter is required', 'checkpoint');
    }

    const from = options.checkpoint;
    const to = options.to;
    const speed = options.speed ? parseFloat(options.speed) : 1;

    if (options.dryRun) {
      console.log('Dry run: Would replay events with options:', { from, to, speed });
      return;
    }

    // Get events for replay
    const events = await eventStore.getEventsByTimeRange({
      from: from ? new Date(from).getTime() : 0,
      to: to ? new Date(to).getTime() : Date.now()
    });

    console.log(`Found ${events.length} events to replay`);

    // Simulate replay with speed control
    for (const event of events) {
      console.log(`Replaying event: ${event.type} at ${event.timestamp}`);

      // Simulate delay based on speed
      if (speed < 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 / speed));
      }
    }

    console.log(`Replayed ${events.length} events`);
  } catch (error: any) {
    throw errorMessages.operationFailed('replay logs', error.message);
  }
}

async function aggregateLogs(options: LogOptions & { groupBy?: string }): Promise<void> {
  try {
    const storage = new MemoryStorageAdapter();
    const eventStore = new EventStore(storage);
    await eventStore.initialize();

    // Convert time strings to Date objects if provided
    const since = options.since ? new Date(options.since) : undefined;
    const until = options.until ? new Date(options.until) : undefined;

    let events;
    if (since || until) {
      events = await eventStore.getEventsByTimeRange({
        from: since?.getTime() || 0,
        to: until?.getTime()
      });
    } else {
      events = await eventStore.getEvents();
    }

    const groupBy = options.groupBy || 'type';
    const aggregated = new Map<string, number>();

    // Group events
    events.forEach((event: any) => {
      let groupKey: string;
      switch (groupBy) {
        case 'level':
          groupKey = event.metadata?.level || 'info';
          break;
        case 'component':
          groupKey = event.metadata?.component || 'system';
          break;
        case 'type':
          groupKey = event.type;
          break;
        case 'hour':
          groupKey = new Date(event.timestamp).toISOString().slice(0, 13);
          break;
        case 'day':
          groupKey = new Date(event.timestamp).toISOString().slice(0, 10);
          break;
        default:
          groupKey = event.type;
      }

      aggregated.set(groupKey, (aggregated.get(groupKey) || 0) + 1);
    });

    const total = events.length;
    const results = Array.from(aggregated.entries()).map(([group, count]) => ({
      group,
      count,
      percentage: total > 0 ? count / total : 0
    }));

    if (options.format === 'json') {
      console.log(JSON.stringify(results, null, 2));
    } else if (options.format === 'csv') {
      const csvHeader = 'group,count,percentage';
      console.log(csvHeader);

      results.forEach((entry: any) => {
        console.log(`${entry.group},${entry.count},${entry.percentage}`);
      });
    } else {
      // Text format
      console.log('Log Statistics:');
      console.log('===============');

      results.forEach((entry: any) => {
        const percentage = (entry.percentage * 100).toFixed(1);
        console.log(`${entry.group.padEnd(15)} ${entry.count.toString().padStart(8)} (${percentage}%)`);
      });
    }
  } catch (error: any) {
    throw errorMessages.operationFailed('aggregate logs', error.message);
  }
}

async function clearLogs(options: LogOptions & { before?: string; force?: boolean }): Promise<void> {
  try {
    if (!options.force) {
      const { confirm } = await import('@clack/prompts');
      const confirmed = await confirm({
        message: 'Are you sure you want to clear logs? This action cannot be undone.',
        initialValue: false
      });

      if (!confirmed) {
        console.log('Log clearing cancelled');
        return;
      }
    }

    const storage = new MemoryStorageAdapter();
    const eventStore = new EventStore(storage);
    await eventStore.initialize();

    // Get count before clearing
    const beforeCount = await eventStore.getEvents({ limit: 1000000 });
    const totalBefore = beforeCount.length;

    // Note: EventStore doesn't have a clear method, so we'll simulate it
    console.log(`Would clear ${totalBefore} log entries`);
    console.log('Log clearing not yet implemented in EventStore');

    // TODO: Implement actual clearing when EventStore supports it
  } catch (error: any) {
    throw errorMessages.operationFailed('clear logs', error.message);
  }
}