import { z } from 'zod';
import chalk from 'chalk';
import { Command } from 'commander';
import { $ , ConvenienceAPI } from '@xec-sh/core';

import { getConfig } from '../utils/config.js';
import { BaseCommand } from '../utils/command-base.js';
import { validateOptions } from '../utils/validation.js';

interface LogsOptions {
  follow?: boolean;
  tail?: number;
  since?: string;
  timestamps?: boolean;
  namespace?: string;
  container?: string;
  previous?: boolean;
  filter?: string;
  output?: 'text' | 'json';
  verbose?: boolean;
}

class LogsCommand extends BaseCommand {
  private logStream: any = null;

  constructor() {
    super({
      name: 'logs',
      description: 'View and stream logs from containers, pods, or remote files',
      arguments: '<source>',
      options: [
        {
          flags: '-f, --follow',
          description: 'Follow log output (stream new logs)'
        },
        {
          flags: '-t, --tail <lines>',
          description: 'Number of lines to show from the end',
          defaultValue: '10'
        },
        {
          flags: '--since <time>',
          description: 'Show logs since timestamp (e.g., 10m, 1h)'
        },
        {
          flags: '--timestamps',
          description: 'Show timestamps with log lines'
        },
        {
          flags: '-n, --namespace <namespace>',
          description: 'Kubernetes namespace'
        },
        {
          flags: '--container <container>',
          description: 'Container name (for multi-container pods)'
        },
        {
          flags: '-p, --previous',
          description: 'Show previous container logs (K8s only)'
        },
        {
          flags: '--filter <pattern>',
          description: 'Filter logs by pattern (regex)'
        }
      ],
      examples: [
        {
          command: 'xec logs container:myapp',
          description: 'View last 10 lines from Docker container'
        },
        {
          command: 'xec logs container:myapp -f',
          description: 'Stream logs from Docker container'
        },
        {
          command: 'xec logs pod:web -n production --tail 100',
          description: 'View last 100 lines from Kubernetes pod'
        },
        {
          command: 'xec logs pod:app -c nginx --timestamps',
          description: 'View nginx container logs with timestamps'
        },
        {
          command: 'xec logs prod:/var/log/app.log -f',
          description: 'Stream remote log file via SSH'
        },
        {
          command: 'xec logs container:api --filter "ERROR|WARN"',
          description: 'Filter logs for errors and warnings'
        },
        {
          command: 'xec logs pod:worker --since 1h',
          description: 'Show logs from the last hour'
        }
      ],
      validateOptions: (options) => {
        const schema = z.object({
          follow: z.boolean().optional(),
          tail: z.string().transform(val => parseInt(val, 10)).optional(),
          since: z.string().optional(),
          timestamps: z.boolean().optional(),
          namespace: z.string().optional(),
          container: z.string().optional(),
          previous: z.boolean().optional(),
          filter: z.string().optional(),
          output: z.enum(['text', 'json']).optional(),
          verbose: z.boolean().optional()
        });
        validateOptions(options, schema);
      }
    });
  }

  override async execute(args: any[]): Promise<void> {
    const [source] = args.slice(0, 1);
    const options = args[args.length - 1] as LogsOptions;

    if (!source) {
      throw new Error('Source is required (e.g., container:name, pod:name, host:/path/to/log)');
    }

    // Set up signal handlers for graceful shutdown
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());

    try {
      await this.viewLogs(source, options);
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  private async viewLogs(source: string, options: LogsOptions): Promise<void> {
    const config = getConfig();
    const helpers = new ConvenienceAPI($ as any);

    // Parse source type
    let sourceType: 'container' | 'pod' | 'ssh';
    let displayName: string;

    if (source.includes('container:')) {
      sourceType = 'container';
      displayName = source.split(':')[1] || 'unknown';
    } else if (source.includes('pod:')) {
      sourceType = 'pod';
      displayName = source.split(':')[1] || 'unknown';
    } else if (source.includes(':/')) {
      sourceType = 'ssh';
      const [host, path] = source.split(':');
      displayName = `${host || 'unknown'}:${path || '/'}`;
    } else {
      throw new Error('Invalid source format. Use container:name, pod:name, or host:/path/to/log');
    }

    // Set up log display
    if (!options.follow) {
      this.startSpinner(`Fetching logs from ${displayName}...`);
    } else {
      this.log(`Streaming logs from ${displayName}...`, 'info');
      if (options.filter) {
        this.log(`Filter: ${options.filter}`, 'info');
      }
      this.log('Press Ctrl+C to stop\n', 'info');
    }

    try {
      // Create filter regex if provided
      const filterRegex = options.filter ? new RegExp(options.filter) : null;
      let lineCount = 0;

      // Log handler
      const handleLogLine = (line: string) => {
        // Apply filter if provided
        if (filterRegex && !filterRegex.test(line)) {
          return;
        }

        // Format line based on output type
        if (options.output === 'json') {
          try {
            const parsed = JSON.parse(line);
            console.log(JSON.stringify(parsed, null, 2));
          } catch {
            // Not JSON, output as is
            console.log(JSON.stringify({ 
              message: line.trim(),
              timestamp: options.timestamps ? new Date().toISOString() : undefined
            }));
          }
        } else {
          // Text output
          if (options.timestamps && !this.hasTimestamp(line)) {
            console.log(`${chalk.gray(new Date().toISOString())} ${line.trim()}`);
          } else {
            console.log(line.trim());
          }
        }
        lineCount++;
      };

      // Use convenience helper to get logs
      if (options.follow) {
        this.logStream = await helpers.logs(source, {
          follow: true,
          tail: options.tail,
          since: options.since,
          timestamps: options.timestamps,
          onData: handleLogLine
        });
      } else {
        // Non-streaming mode
        const logs = await helpers.logs(source, {
          follow: false,
          tail: options.tail,
          since: options.since,
          timestamps: options.timestamps
        });

        this.stopSpinner();

        // Process and display logs
        if (typeof logs === 'string') {
          const lines = logs.split('\n').filter(line => line.trim());
          lines.forEach(handleLogLine);
          
          if (lineCount === 0) {
            this.log('No logs found matching criteria.', 'info');
          } else {
            this.log(`\n${chalk.gray(`Displayed ${lineCount} log line(s)`)}`, 'info');
          }
        }
      }

      // If following, keep the process alive
      if (options.follow) {
        await new Promise(() => {}); // Wait forever
      }
    } catch (error) {
      this.stopSpinner();
      if (error instanceof Error) {
        // Provide helpful error messages
        if (error.message.includes('not found')) {
          throw new Error(`${sourceType} '${displayName}' not found`);
        } else if (error.message.includes('permission')) {
          throw new Error(`Permission denied accessing logs for '${displayName}'`);
        }
        throw new Error(`Failed to get logs: ${error.message}`);
      }
      throw error;
    }
  }

  private hasTimestamp(line: string): boolean {
    // Check if line already has a timestamp at the beginning
    // Common formats: ISO 8601, RFC3339, etc.
    const timestampPatterns = [
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO 8601
      /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/, // Common log format
      /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/, // Bracketed format
      /^\w{3} \d{1,2} \d{2}:\d{2}:\d{2}/, // Syslog format
    ];

    return timestampPatterns.some(pattern => pattern.test(line));
  }

  private async cleanup(): Promise<void> {
    if (this.logStream) {
      try {
        if (typeof this.logStream.stop === 'function') {
          this.logStream.stop();
        } else if (typeof this.logStream.close === 'function') {
          await this.logStream.close();
        }
      } catch (error) {
        // Ignore cleanup errors
      }
      this.logStream = null;
    }
    this.stopSpinner();
  }
}

export default function logsCommand(program: Command): void {
  const cmd = new LogsCommand();
  program.addCommand(cmd.create());
}