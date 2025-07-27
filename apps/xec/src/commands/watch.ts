import { z } from 'zod';
import chalk from 'chalk';
import chokidar from 'chokidar';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';

import { BaseCommand } from '../utils/command-base.js';
import { validateOptions } from '../utils/validation.js';

interface WatchOptions {
  interval?: number;
  files?: string[];
  ignore?: string[];
  exec?: string;
  clear?: boolean;
  quiet?: boolean;
  beep?: boolean;
  exitOnError?: boolean;
  differences?: boolean;
  precise?: boolean;
  noTitle?: boolean;
  color?: boolean;
}

class WatchCommand extends BaseCommand {
  private lastOutput: string = '';
  private lastExitCode: number = 0;
  private watchInterval?: NodeJS.Timeout;
  private fileWatcher?: any; // chokidar.FSWatcher

  constructor() {
    super({
      name: 'watch',
      description: 'Execute a command repeatedly and watch for changes',
      arguments: '[command...]',
      options: [
        {
          flags: '-n, --interval <seconds>',
          description: 'Seconds between executions',
          defaultValue: '2'
        },
        {
          flags: '-f, --files <patterns>',
          description: 'Watch files for changes (comma-separated)'
        },
        {
          flags: '--ignore <patterns>',
          description: 'Ignore file patterns'
        },
        {
          flags: '-x, --exec <command>',
          description: 'Command to execute'
        },
        {
          flags: '--clear',
          description: 'Clear screen between executions'
        },
        {
          flags: '-b, --beep',
          description: 'Beep if command has non-zero exit'
        },
        {
          flags: '-e, --exit-on-error',
          description: 'Exit on non-zero exit code'
        },
        {
          flags: '-d, --differences',
          description: 'Highlight differences between updates'
        },
        {
          flags: '-p, --precise',
          description: 'Attempt precise interval timing'
        },
        {
          flags: '-t, --no-title',
          description: 'Turn off header showing command'
        },
        {
          flags: '--color',
          description: 'Force color output'
        }
      ],
      examples: [
        {
          command: 'xec watch "ls -la"',
          description: 'Watch directory contents'
        },
        {
          command: 'xec watch -n 5 "docker ps"',
          description: 'Watch docker containers every 5 seconds'
        },
        {
          command: 'xec watch -f "src/**/*.ts" "npm test"',
          description: 'Run tests when TypeScript files change'
        },
        {
          command: 'xec watch -f "*.log" -d "tail -n 20 app.log"',
          description: 'Watch log file with differences highlighted'
        },
        {
          command: 'xec watch -x "kubectl get pods" -n 1',
          description: 'Watch Kubernetes pods every second'
        }
      ],
      validateOptions: (options) => {
        const schema = z.object({
          interval: z.coerce.number().positive().optional(),
          files: z.array(z.string()).optional(),
          ignore: z.array(z.string()).optional(),
          exec: z.string().optional(),
          clear: z.boolean().optional(),
          quiet: z.boolean().optional(),
          beep: z.boolean().optional(),
          exitOnError: z.boolean().optional(),
          differences: z.boolean().optional(),
          precise: z.boolean().optional(),
          noTitle: z.boolean().optional(),
          color: z.boolean().optional()
        });
        validateOptions(options, schema);
      }
    });
  }

  async execute(args: any[]): Promise<void> {
    const commandParts = args.slice(0, -1);
    const options = args[args.length - 1] as WatchOptions;

    // Determine command to execute
    let command: string;
    if (options.exec) {
      command = options.exec;
    } else if (commandParts.length > 0) {
      command = commandParts.join(' ');
    } else {
      throw new Error('No command specified. Use positional arguments or --exec');
    }

    // Set up signal handlers
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());

    // Enable color if requested
    if (options.color) {
      process.env['FORCE_COLOR'] = '1';
    }

    // Start watching
    if (options.files && options.files.length > 0) {
      await this.watchFiles(command, options);
    } else {
      await this.watchInterval$(command, options);
    }
  }

  private async watchInterval$(command: string, options: WatchOptions): Promise<void> {
    const interval = (options.interval || 2) * 1000;

    // Execute immediately
    await this.executeCommand(command, options);

    // Set up interval
    if (options.precise) {
      // Precise timing - account for execution time
      let nextRun = Date.now() + interval;
      
      const scheduleNext = async () => {
        const now = Date.now();
        const delay = Math.max(0, nextRun - now);
        
        this.watchInterval = setTimeout(async () => {
          await this.executeCommand(command, options);
          
          if (this.lastExitCode !== 0 && options.exitOnError) {
            this.cleanup(this.lastExitCode);
            return;
          }
          
          nextRun += interval;
          scheduleNext();
        }, delay);
      };
      
      scheduleNext();
    } else {
      // Simple interval
      this.watchInterval = setInterval(async () => {
        await this.executeCommand(command, options);
        
        if (this.lastExitCode !== 0 && options.exitOnError) {
          this.cleanup(this.lastExitCode);
        }
      }, interval);
    }

    // Keep process alive
    await new Promise(() => {});
  }

  private async watchFiles(command: string, options: WatchOptions): Promise<void> {
    const patterns = options.files || [];
    const ignored = options.ignore || [];

    this.log(`Watching for changes in: ${patterns.join(', ')}`, 'info');

    // Execute once immediately
    await this.executeCommand(command, options);

    // Set up file watcher
    this.fileWatcher = chokidar.watch(patterns, {
      ignored: [
        /(^|[\/\\])\../, // Hidden files
        /node_modules/,
        ...ignored
      ],
      persistent: true,
      ignoreInitial: true
    });

    // Debounce function to prevent multiple rapid executions
    let debounceTimer: NodeJS.Timeout | null = null;
    const debounceDelay = 100;

    const handleChange = (path: string) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(async () => {
        this.log(`\n${chalk.yellow('→')} File changed: ${path}`, 'info');
        await this.executeCommand(command, options);
        
        if (this.lastExitCode !== 0 && options.exitOnError) {
          this.cleanup(this.lastExitCode);
        }
      }, debounceDelay);
    };

    this.fileWatcher
      .on('add', handleChange)
      .on('change', handleChange)
      .on('unlink', handleChange)
      .on('error', (error: any) => {
        this.log(`Watcher error: ${error}`, 'error');
      });

    // Keep process alive
    await new Promise(() => {});
  }

  private async executeCommand(command: string, options: WatchOptions): Promise<void> {
    try {
      // Clear screen if requested
      if (options.clear) {
        console.clear();
      }

      // Show header
      if (!options.quiet && !options.noTitle) {
        const timestamp = new Date().toLocaleString();
        const header = `Every ${options.interval || 2}s: ${command}`;
        const headerLine = `${header}${' '.repeat(Math.max(0, process.stdout.columns - header.length - timestamp.length))}${timestamp}`;
        console.log(chalk.bold(headerLine));
        console.log();
      }

      // Execute command
      const startTime = Date.now();
      const result = await $`${command}`.nothrow();
      const duration = Date.now() - startTime;

      this.lastExitCode = result.exitCode;

      // Handle output
      const output = result.stdout + (result.stderr ? `\n${chalk.red(result.stderr)}` : '');

      if (options.differences && this.lastOutput) {
        // Highlight differences
        this.displayWithDifferences(output, this.lastOutput);
      } else {
        console.log(output);
      }

      this.lastOutput = output;

      // Show execution info if verbose
      if (this.isVerbose()) {
        console.log();
        console.log(chalk.gray(`Execution time: ${duration}ms | Exit code: ${result.exitCode}`));
      }

      // Beep on error if requested
      if (options.beep && result.exitCode !== 0) {
        process.stdout.write('\x07');
      }

    } catch (error) {
      this.lastExitCode = 1;
      
      if (options.beep) {
        process.stdout.write('\x07');
      }

      this.log(`Error: ${error instanceof Error ? error.message : String(error)}`, 'error');
      
      if (options.exitOnError) {
        this.cleanup(1);
      }
    }
  }

  private displayWithDifferences(current: string, previous: string): void {
    const currentLines = current.split('\n');
    const previousLines = previous.split('\n');
    const maxLines = Math.max(currentLines.length, previousLines.length);

    for (let i = 0; i < maxLines; i++) {
      const currentLine = currentLines[i] || '';
      const previousLine = previousLines[i] || '';

      if (currentLine !== previousLine) {
        // Line changed - highlight it
        if (i >= previousLines.length) {
          // New line
          console.log(chalk.green('+ ' + currentLine));
        } else if (i >= currentLines.length) {
          // Line removed
          console.log(chalk.red('- ' + previousLine));
        } else {
          // Line modified
          console.log(chalk.yellow('~ ' + currentLine));
        }
      } else {
        // Line unchanged
        console.log('  ' + currentLine);
      }
    }
  }

  private cleanup(exitCode: number = 0): void {
    // Clear intervals
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = undefined;
    }

    // Close file watcher
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = undefined;
    }

    // Clear screen one last time if needed
    if (process.stdout.isTTY) {
      console.log('\n' + chalk.yellow('Watch stopped.'));
    }

    process.exit(exitCode);
  }

  protected override isVerbose(): boolean {
    return super.isVerbose();
  }
}

export default function watchCommand(program: Command): void {
  const cmd = new WatchCommand();
  program.addCommand(cmd.create());
}