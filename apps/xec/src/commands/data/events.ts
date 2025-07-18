import * as fs from 'fs/promises';
import { Command } from 'commander';
import { OptimizedEventStore, MemoryStorageAdapter } from '@xec/core';

import { SubcommandBase } from '../../utils/command-base.js';
import { errorMessages } from '../../utils/error-handler.js';

interface EventsOptions {
  filter?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  type?: string;
  source?: string;
  format?: 'json' | 'yaml';
}

export class EventsCommand extends SubcommandBase {
  private eventStore: OptimizedEventStore;

  constructor() {
    super({
      name: 'events',
      description: 'Manage event store and event sourcing',
      examples: [
        {
          command: 'xec data events list --filter type=deploy',
          description: 'List deployment events',
        },
        {
          command: 'xec data events show <id>',
          description: 'Show event details',
        },
        {
          command: 'xec data events export --format json',
          description: 'Export events to JSON',
        },
      ],
    });
    
    // Initialize event store with memory adapter for now
    const adapter = new MemoryStorageAdapter();
    this.eventStore = new OptimizedEventStore(adapter);
  }

  protected setupSubcommands(command: Command): void {
    // xec data events list
    command
      .command('list')
      .description('List events')
      .option('--filter <filter>', 'Filter events by criteria')
      .option('--from <date>', 'Start date/time')
      .option('--to <date>', 'End date/time')
      .option('--limit <number>', 'Limit number of events', '50')
      .option('--offset <number>', 'Offset for pagination', '0')
      .option('--type <type>', 'Filter by event type')
      .option('--source <source>', 'Filter by event source')
      .action(async (options: EventsOptions) => {
        this.options = { ...this.options, ...options };
        await this.listEvents(options);
      });

    // xec data events show
    command
      .command('show')
      .description('Show event details')
      .argument('<id>', 'Event ID')
      .option('--raw', 'Show raw event data')
      .action(async (id: string, options: { raw?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.showEvent(id, options);
      });

    // xec data events export
    command
      .command('export')
      .description('Export events to file')
      .option('-f, --file <file>', 'Export file path')
      .option('--format <format>', 'Export format (json|yaml)', 'json')
      .option('--from <date>', 'Export from date/time')
      .option('--to <date>', 'Export to date/time')
      .option('--type <type>', 'Filter by event type')
      .option('--compress', 'Compress export file')
      .action(async (options: EventsOptions & { file?: string; compress?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.exportEvents(options);
      });

    // xec data events stats
    command
      .command('stats')
      .description('Show event store statistics')
      .option('--detailed', 'Show detailed statistics')
      .option('--by-type', 'Group by event type')
      .option('--by-source', 'Group by event source')
      .action(async (options: { detailed?: boolean; byType?: boolean; bySource?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.showStats(options);
      });
  }

  private async listEvents(options: EventsOptions): Promise<void> {
    try {
      await this.eventStore.initialize();
      
      const queryOptions = {
        limit: options.limit || 50,
        offset: options.offset || 0,
        orderBy: 'timestamp' as const,
        orderDirection: 'desc' as const,
      };

      let events;
      if (options.type) {
        events = await this.eventStore.getEventsByType(options.type, queryOptions);
      } else if (options.from || options.to) {
        const fromTimestamp = options.from ? new Date(options.from).getTime() : 0;
        const toTimestamp = options.to ? new Date(options.to).getTime() : Date.now();
        events = await this.eventStore.getEventsByTimeRange(
          { from: fromTimestamp, to: toTimestamp },
          queryOptions
        );
      } else {
        events = await this.eventStore.getEvents(queryOptions);
      }
      
      if (events.length === 0) {
        this.log('No events found', 'info');
        return;
      }
      
      const tableData = {
        columns: [
          { header: 'ID', width: 20 },
          { header: 'Type', width: 20 },
          { header: 'Source', width: 20 },
          { header: 'Timestamp', width: 20 },
          { header: 'Data', width: 40 },
        ],
        rows: events.map(event => [
          event.id,
          event.type,
          event.metadata.source || 'unknown',
          new Date(event.timestamp).toISOString(),
          this.truncateData(JSON.stringify(event.payload)),
        ]),
      };
      
      this.formatter.table(tableData);
      
      if (events.length === options.limit) {
        this.log(`Showing ${events.length} events (use --limit and --offset for pagination)`, 'info');
      }
    } catch (error) {
      throw errorMessages.configurationInvalid('events', `Failed to list events: ${(error as Error).message}`);
    }
  }

  private async showEvent(id: string, options: { raw?: boolean }): Promise<void> {
    try {
      await this.eventStore.initialize();
      const event = await this.eventStore.getEvent(id);
      
      if (!event) {
        throw errorMessages.configurationInvalid('event', `Event with ID '${id}' not found`);
      }
      
      if (options.raw) {
        this.output(event, 'Raw Event Data');
      } else {
        this.formatter.keyValue({
          ID: event.id,
          Type: event.type,
          Source: event.metadata.source || 'unknown',
          Timestamp: new Date(event.timestamp).toISOString(),
          Version: event.metadata.version || 1,
          'Correlation ID': event.metadata.correlationId || 'none',
          'Causation ID': event.metadata.causationId || 'none',
          Actor: event.actor,
          'Sequence Number': event.sequenceNumber?.toString() || 'unknown',
        }, `Event: ${id}`);
        
        if (event.payload) {
          this.formatter.keyValue(event.payload, 'Event Payload');
        }
        
        if (event.metadata.tags && event.metadata.tags.size > 0) {
          const tags: Record<string, string> = {};
          event.metadata.tags.forEach((value, key) => {
            tags[key] = value;
          });
          this.formatter.keyValue(tags, 'Event Tags');
        }
      }
    } catch (error) {
      throw errorMessages.configurationInvalid('events', `Failed to show event: ${(error as Error).message}`);
    }
  }

  private async exportEvents(options: EventsOptions & { file?: string; compress?: boolean }): Promise<void> {
    try {
      await this.eventStore.initialize();
      
      const queryOptions = {
        limit: 1000, // Export more events by default
        offset: 0,
        orderBy: 'timestamp' as const,
        orderDirection: 'asc' as const,
      };

      let events;
      if (options.type) {
        events = await this.eventStore.getEventsByType(options.type, queryOptions);
      } else if (options.from || options.to) {
        const fromTimestamp = options.from ? new Date(options.from).getTime() : 0;
        const toTimestamp = options.to ? new Date(options.to).getTime() : Date.now();
        events = await this.eventStore.getEventsByTimeRange(
          { from: fromTimestamp, to: toTimestamp },
          queryOptions
        );
      } else {
        events = await this.eventStore.getEvents(queryOptions);
      }
      
      const exportData = {
        timestamp: new Date().toISOString(),
        count: events.length,
        events: events.map(event => ({
          ...event,
          metadata: {
            ...event.metadata,
            tags: event.metadata.tags ? Object.fromEntries(event.metadata.tags) : {},
          },
        })),
      };
      
      const exportFile = options.file || `events-export-${Date.now()}.json`;
      let content: string;
      
      if (options.format === 'yaml') {
        const yaml = await import('js-yaml');
        content = yaml.dump(exportData, { lineWidth: -1, noRefs: true });
      } else {
        content = JSON.stringify(exportData, null, 2);
      }
      
      if (options.compress) {
        const zlib = await import('zlib');
        const compressed = zlib.gzipSync(content);
        await fs.writeFile(exportFile + '.gz', compressed);
        this.log(`Events exported to ${exportFile}.gz`, 'success');
      } else {
        await fs.writeFile(exportFile, content);
        this.log(`Events exported to ${exportFile}`, 'success');
      }
      
      this.log(`Exported ${events.length} events`, 'info');
    } catch (error) {
      throw errorMessages.configurationInvalid('events', `Failed to export events: ${(error as Error).message}`);
    }
  }

  private async showStats(options: { detailed?: boolean; byType?: boolean; bySource?: boolean }): Promise<void> {
    try {
      await this.eventStore.initialize();
      
      // Get all events to compute stats
      const allEvents = await this.eventStore.getEvents({ limit: 10000 });
      
      // Basic stats
      const totalEvents = allEvents.length;
      const totalSize = JSON.stringify(allEvents).length;
      const oldestEvent = allEvents.length > 0 ? Math.min(...allEvents.map(e => e.timestamp)) : null;
      const newestEvent = allEvents.length > 0 ? Math.max(...allEvents.map(e => e.timestamp)) : null;
      const averageSize = totalEvents > 0 ? totalSize / totalEvents : 0;
      
      this.formatter.keyValue({
        'Total Events': totalEvents.toString(),
        'Total Size': this.formatSize(totalSize),
        'Oldest Event': oldestEvent ? new Date(oldestEvent).toISOString() : 'none',
        'Newest Event': newestEvent ? new Date(newestEvent).toISOString() : 'none',
        'Average Size': this.formatSize(averageSize),
      }, 'Event Store Statistics');
      
      // By type
      if (options.byType) {
        const typeStats = new Map<string, { count: number; size: number }>();
        allEvents.forEach(event => {
          const existing = typeStats.get(event.type) || { count: 0, size: 0 };
          const eventSize = JSON.stringify(event).length;
          typeStats.set(event.type, {
            count: existing.count + 1,
            size: existing.size + eventSize,
          });
        });
        
        if (typeStats.size > 0) {
          const typeTableData = {
            columns: [
              { header: 'Type', width: 25 },
              { header: 'Count', width: 15 },
              { header: 'Size', width: 15 },
              { header: 'Avg Size', width: 15 },
            ],
            rows: Array.from(typeStats.entries()).map(([type, data]) => [
              type,
              data.count.toString(),
              this.formatSize(data.size),
              this.formatSize(data.size / data.count),
            ]),
          };
          
          this.formatter.table(typeTableData);
        }
      }
      
      // By source
      if (options.bySource) {
        const sourceStats = new Map<string, { count: number; size: number }>();
        allEvents.forEach(event => {
          const source = event.metadata.source || 'unknown';
          const existing = sourceStats.get(source) || { count: 0, size: 0 };
          const eventSize = JSON.stringify(event).length;
          sourceStats.set(source, {
            count: existing.count + 1,
            size: existing.size + eventSize,
          });
        });
        
        if (sourceStats.size > 0) {
          const sourceTableData = {
            columns: [
              { header: 'Source', width: 25 },
              { header: 'Count', width: 15 },
              { header: 'Size', width: 15 },
              { header: 'Avg Size', width: 15 },
            ],
            rows: Array.from(sourceStats.entries()).map(([source, data]) => [
              source,
              data.count.toString(),
              this.formatSize(data.size),
              this.formatSize(data.size / data.count),
            ]),
          };
          
          this.formatter.table(sourceTableData);
        }
      }
    } catch (error) {
      throw errorMessages.configurationInvalid('events', `Failed to show stats: ${(error as Error).message}`);
    }
  }

  private truncateData(data: string): string {
    if (data.length > 40) {
      return data.substring(0, 37) + '...';
    }
    return data;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}