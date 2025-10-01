import { z } from 'zod';
import { $ } from '@xec-sh/core';
import { prism } from '@xec-sh/kit';
import { Command } from 'commander';
import * as readline from 'readline';

import { validateOptions } from '../utils/validation.js';
import { InteractiveHelpers } from '../utils/interactive-helpers.js';
import { ConfigAwareCommand, ConfigAwareOptions } from '../utils/command-base.js';

import type { ResolvedTarget } from '../config/types.js';

interface LogsOptions extends ConfigAwareOptions {
  follow?: boolean;
  tail?: string;
  since?: string;
  until?: string;
  timestamps?: boolean;
  container?: string;
  previous?: boolean;
  filter?: string;
  grep?: string;
  invert?: boolean;
  lines?: string;
  context?: string;
  before?: string;
  after?: string;
  color?: boolean;
  json?: boolean;
  parallel?: boolean;
  aggregate?: boolean;
  prefix?: boolean;
  task?: string;
}

interface LogStream {
  target: ResolvedTarget;
  process?: any;
  cleanup?: () => Promise<void>;
}

export class LogsCommand extends ConfigAwareCommand {
  private streams: Map<string, LogStream> = new Map();
  private running = true;

  constructor() {
    super({
      name: 'logs',
      aliases: ['l'],
      description: 'View and stream logs from targets (interactive mode if no target specified)',
      arguments: '[target] [path]',
      options: [
        {
          flags: '-p, --profile <profile>',
          description: 'Configuration profile to use',
        },
        {
          flags: '-f, --follow',
          description: 'Follow log output (stream new logs)',
        },
        {
          flags: '-n, --tail <lines>',
          description: 'Number of lines to show from the end',
          defaultValue: '50',
        },
        {
          flags: '--since <time>',
          description: 'Show logs since timestamp (e.g., 10m, 1h, 2d)',
        },
        {
          flags: '--until <time>',
          description: 'Show logs until timestamp',
        },
        {
          flags: '-t, --timestamps',
          description: 'Show timestamps with log lines',
        },
        {
          flags: '--container <name>',
          description: 'Container name (for pods with multiple containers)',
        },
        {
          flags: '--previous',
          description: 'Show previous container logs (Kubernetes)',
        },
        {
          flags: '-g, --grep <pattern>',
          description: 'Filter logs by pattern (regex)',
        },
        {
          flags: '-v, --invert',
          description: 'Invert grep match (exclude matching lines)',
        },
        {
          flags: '-A, --after <lines>',
          description: 'Show N lines after grep match',
        },
        {
          flags: '-B, --before <lines>',
          description: 'Show N lines before grep match',
        },
        {
          flags: '-C, --context <lines>',
          description: 'Show N lines before and after grep match',
        },
        {
          flags: '--no-color',
          description: 'Disable colored output',
        },
        {
          flags: '--json',
          description: 'Output logs as JSON',
        },
        {
          flags: '--parallel',
          description: 'View logs from multiple targets in parallel',
        },
        {
          flags: '--aggregate',
          description: 'Aggregate logs from multiple sources',
        },
        {
          flags: '--prefix',
          description: 'Prefix each line with target name',
        },
        {
          flags: '--task <task>',
          description: 'Run a log analysis task',
        },
      ],
      examples: [
        {
          command: 'xec logs',
          description: 'Start interactive mode to select targets and options',
        },
        {
          command: 'xec logs containers.app',
          description: 'View last 50 lines from Docker container',
        },
        {
          command: 'xec logs hosts.web-1 /var/log/nginx/access.log -f',
          description: 'Stream nginx access logs from SSH host',
        },
        {
          command: 'xec logs pods.api --tail 100 --since 1h',
          description: 'View last 100 lines from past hour',
        },
        {
          command: 'xec logs containers.* --parallel --prefix',
          description: 'View logs from all containers with prefixes',
        },
        {
          command: 'xec logs hosts.web-* /var/log/app.log --grep ERROR -C 3',
          description: 'Find errors with 3 lines of context',
        },
        {
          command: 'xec logs pods.worker --container sidecar -f',
          description: 'Stream logs from specific container in pod',
        },
        {
          command: 'xec logs local /var/log/system.log --since "2h ago"',
          description: 'View local system logs from 2 hours ago',
        },
        {
          command: 'xec logs hosts.db-* --task analyze-slow-queries',
          description: 'Run analysis task on database logs',
        },
        {
          command: 'xec logs --interactive',
          description: 'Interactive mode for selecting targets and log options',
        },
      ],
      validateOptions: (options) => {
        const schema = z.object({
          profile: z.string().optional(),
          interactive: z.boolean().optional(),
          follow: z.boolean().optional(),
          tail: z.string().optional(),
          since: z.string().optional(),
          until: z.string().optional(),
          timestamps: z.boolean().optional(),
          container: z.string().optional(),
          previous: z.boolean().optional(),
          grep: z.string().optional(),
          invert: z.boolean().optional(),
          after: z.string().optional(),
          before: z.string().optional(),
          context: z.string().optional(),
          color: z.boolean().optional(),
          json: z.boolean().optional(),
          parallel: z.boolean().optional(),
          aggregate: z.boolean().optional(),
          prefix: z.boolean().optional(),
          task: z.string().optional(),
          verbose: z.boolean().optional(),
          quiet: z.boolean().optional(),
          dryRun: z.boolean().optional(),
        });
        validateOptions(options, schema);
      },
    });
  }

  protected override getCommandConfigKey(): string {
    return 'logs';
  }

  override async execute(args: any[]): Promise<void> {
    // Check if the last arg is a Command object (Commander.js pattern)
    const lastArg = args[args.length - 1];
    const isCommand = lastArg && typeof lastArg === 'object' && lastArg.constructor && lastArg.constructor.name === 'Command';

    // The actual options should be the second-to-last argument if the last is a Command
    const options = isCommand ? args[args.length - 2] as LogsOptions : lastArg as LogsOptions;
    const positionalArgs = isCommand ? args.slice(0, -2) : args.slice(0, -1);

    let targetPattern = positionalArgs[0];
    let logPath = positionalArgs[1];

    // Handle interactive mode when no target is specified
    if (!targetPattern) {
      const interactiveResult = await this.runInteractiveMode(options);
      if (!interactiveResult) return;

      targetPattern = interactiveResult.targetPattern;
      logPath = interactiveResult.logPath;
      Object.assign(options, interactiveResult.options);
    }

    if (!targetPattern) {
      throw new Error('Target specification is required');
    }

    // Initialize configuration
    await this.initializeConfig(options);

    // Apply command defaults from config
    const defaults = this.getCommandDefaults();
    // Include global options from this.options
    const mergedOptions = this.applyDefaults({
      ...options,
      verbose: options.verbose ?? this.options?.verbose,
      quiet: options.quiet ?? this.options?.quiet
    }, defaults);

    // Resolve targets
    let targets: ResolvedTarget[];
    if (targetPattern.includes('*') || targetPattern.includes('{')) {
      targets = await this.findTargets(targetPattern);
      if (targets.length === 0) {
        throw new Error(`No targets found matching pattern: ${targetPattern}`);
      }
    } else {
      const target = await this.resolveTarget(targetPattern);
      targets = [target];
    }

    // Handle different execution modes
    if (mergedOptions.task) {
      await this.executeTask(targets, logPath, mergedOptions.task, mergedOptions);
    } else if (targets.length > 1 && (mergedOptions.parallel || mergedOptions.aggregate)) {
      await this.viewMultipleLogs(targets, logPath, mergedOptions);
    } else {
      // View logs from each target sequentially
      for (const target of targets) {
        await this.viewSingleLog(target, logPath, mergedOptions);
      }
    }
  }

  private async viewSingleLog(
    target: ResolvedTarget,
    logPath: string | undefined,
    options: LogsOptions
  ): Promise<void> {
    const targetDisplay = this.formatTargetDisplay(target);

    if (options.dryRun) {
      // Use console.log directly to ensure output is shown regardless of quiet mode
      console.log(`[DRY RUN] Would view logs from ${targetDisplay}${logPath ? `:${logPath}` : ''}`);
      return;
    }

    // Set up signal handlers for cleanup
    if (options.follow) {
      this.setupCleanupHandlers();
    }

    try {
      // Always show streaming message for follow mode, regardless of quiet setting
      if (options.follow) {
        console.log(`Streaming logs from ${targetDisplay}${logPath ? `:${logPath}` : ''}...`);
        if (options.grep) {
          console.log(`Filter: ${options.grep}${options.invert ? ' (inverted)' : ''}`);
        }
        console.log('Press Ctrl+C to stop\n');
      } else if (!options.quiet) {
        this.startSpinner(`Fetching logs from ${targetDisplay}...`);
      }

      // Build log command based on target type
      const logCommand = await this.buildLogCommand(target, logPath, options);

      if (options.verbose) {
        console.log(`[DEBUG] Log command: ${logCommand}`);
      }

      // Execute log command
      // For Docker and K8s logs, we need to run commands on the host, not in the target
      const useLocalEngine = target.type === 'docker' || target.type === 'kubernetes';
      const engine = useLocalEngine ? $ : await this.createTargetEngine(target);

      if (options.follow) {
        // Streaming mode
        await this.streamLogs(target, engine, logCommand, options);
      } else {
        // Batch mode
        let result;

        // Execute the command through shell to handle arguments properly
        result = await engine.raw`${logCommand}`;

        if (!options.quiet) {
          this.stopSpinner();
        }

        if (result.stdout && result.stdout.trim()) {
          this.displayLogs(result.stdout, target, options);
        } else {
          console.log('No logs found matching criteria.');
        }
      }
    } catch (error) {
      if (!options.quiet) {
        this.stopSpinner();
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`${prism.red('✗')} Failed to view logs: ${errorMessage}`, 'error');
      throw error;
    }
  }

  private async viewMultipleLogs(
    targets: ResolvedTarget[],
    logPath: string | undefined,
    options: LogsOptions
  ): Promise<void> {
    if (options.aggregate) {
      this.log('Aggregating logs from multiple targets...', 'info');
      // TODO: Implement log aggregation with proper time sorting
      throw new Error('Log aggregation is not yet implemented');
    }

    // Parallel viewing with prefixes
    this.log(`Viewing logs from ${targets.length} targets in parallel...`, 'info');

    if (options.follow) {
      this.setupCleanupHandlers();

      // Start streaming from all targets
      const promises = targets.map(async (target) => {
        try {
          await this.streamLogsWithPrefix(target, logPath, options);
        } catch (error) {
          // Log error but don't stop other streams
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.log(`${prism.red('✗')} ${this.formatTargetDisplay(target)}: ${errorMessage}`, 'error');
        }
      });

      // Wait for all streams (they won't complete until interrupted)
      try {
        await Promise.all(promises);
      } catch (error) {
        // This should not happen as we handle errors above, but just in case
        console.error('Unexpected error in parallel log streaming:', error);
      }
    } else {
      // Batch mode - fetch from all targets
      const promises = targets.map(async (target) => {
        try {
          const logCommand = await this.buildLogCommand(target, logPath, options);
          // For Docker and K8s logs, we need to run commands on the host
          const useLocalEngine = target.type === 'docker' || target.type === 'kubernetes';
          const engine = useLocalEngine ? $ : await this.createTargetEngine(target);
          const result = await engine.raw`${logCommand}`;

          return { target, logs: result.stdout, error: null };
        } catch (error) {
          return { target, logs: null, error };
        }
      });

      const results = await Promise.all(promises);

      // Display results
      for (const { target, logs, error } of results) {
        if (error) {
          this.log(`${prism.red('✗')} ${this.formatTargetDisplay(target)}: ${error}`, 'error');
        } else if (logs) {
          this.displayLogs(logs, target, { ...options, prefix: true });
        }
      }
    }
  }

  private async buildLogCommand(
    target: ResolvedTarget,
    logPath: string | undefined,
    options: LogsOptions
  ): Promise<string> {
    const parts: string[] = [];

    switch (target.type) {
      case 'docker': {
        const config = target.config as any;
        const container = config.container || target.name;

        parts.push('docker', 'logs');

        if (options.follow) parts.push('--follow');
        if (options.tail) parts.push('--tail', options.tail);
        if (options.since) parts.push('--since', this.convertTimeSpec(options.since));
        if (options.until) parts.push('--until', this.convertTimeSpec(options.until));
        if (options.timestamps) parts.push('--timestamps');

        parts.push(container);

        // Add grep filtering if requested
        if (options.grep) {
          parts.push('2>&1', '|', 'grep', '-E');
          if (options.invert) parts.push('-v');
          if (options.before) parts.push('-B', options.before);
          if (options.after) parts.push('-A', options.after);
          if (options.context) parts.push('-C', options.context);
          if (options.color !== false && !options.json) parts.push('--color=always');
          // Escape the grep pattern for shell
          parts.push(`'${options.grep.replace(/'/g, "'\\''")}'`);
        }

        break;
      }

      case 'kubernetes': {
        const config = target.config as any;
        const namespace = config.namespace || 'default';
        const pod = config.pod || target.name;

        parts.push('kubectl', 'logs');
        parts.push('-n', namespace);

        if (options.follow) parts.push('--follow');
        if (options.tail) parts.push('--tail', options.tail);
        if (options.since) parts.push('--since', this.convertK8sTimeSpec(options.since));
        if (options.timestamps) parts.push('--timestamps');
        if (options.previous) parts.push('--previous');
        if (options.container || config.container) {
          parts.push('--container', options.container || config.container);
        }

        parts.push(pod);

        // Add grep filtering if requested
        if (options.grep) {
          parts.push('2>&1', '|', 'grep', '-E');
          if (options.invert) parts.push('-v');
          if (options.before) parts.push('-B', options.before);
          if (options.after) parts.push('-A', options.after);
          if (options.context) parts.push('-C', options.context);
          if (options.color !== false && !options.json) parts.push('--color=always');
          // Escape the grep pattern for shell
          parts.push(`'${options.grep.replace(/'/g, "'\\''")}'`);
        }

        break;
      }

      case 'ssh':
      case 'local': {
        // For SSH and local, we use standard Unix tools
        const path = logPath || this.getDefaultLogPath(target);

        if (options.follow) {
          parts.push('tail', '-f');
          if (options.tail) parts.push('-n', options.tail);
        } else {
          // Use a more sophisticated command for time-based filtering
          if (options.since || options.until) {
            // Use awk or sed for time filtering (simplified version)
            parts.push('tail', '-n', '+1');
          } else {
            parts.push('tail', '-n', options.tail || '50');
          }
        }

        parts.push(path);

        // Add grep filtering if requested
        if (options.grep) {
          parts.push('|', 'grep', '-E');
          if (options.invert) parts.push('-v');
          if (options.before) parts.push('-B', options.before);
          if (options.after) parts.push('-A', options.after);
          if (options.context) parts.push('-C', options.context);
          if (options.color !== false && !options.json) parts.push('--color=always');
          // Escape the grep pattern for shell
          parts.push(`'${options.grep.replace(/'/g, "'\\''")}'`);
        }

        break;
      }

      default:
        throw new Error(`Log viewing not supported for target type: ${target.type}`);
    }

    return parts.join(' ');
  }

  private async streamLogs(
    target: ResolvedTarget,
    engine: any,
    logCommand: string,
    options: LogsOptions
  ): Promise<void> {
    const sessionId = `${target.id}:logs`;

    // Start the log streaming process
    let logProcess;

    // Execute the command through shell to handle arguments properly
    logProcess = engine.raw`${logCommand}`.nothrow();

    // Add error handling for the child process
    if (logProcess.child) {
      logProcess.child.on('error', (error: Error) => {
        console.error(`Child process error for ${sessionId}:`, error);
        this.streams.delete(sessionId);
      });
    }

    // Store session for cleanup
    this.streams.set(sessionId, {
      target,
      process: logProcess,
      cleanup: async () => {
        try {
          if (logProcess && typeof logProcess.kill === 'function') {
            logProcess.kill('SIGTERM');
          }
        } catch (error) {
          // Ignore cleanup errors
        }
      },
    });

    // Process output line by line
    if (logProcess.child?.stdout) {
      const rl = readline.createInterface({
        input: logProcess.child.stdout,
        crlfDelay: Infinity,
      });

      rl.on('line', (line: string) => {
        try {
          this.displayLogLine(line, target, options);
        } catch (error) {
          // Log display error but continue processing
          console.error('Error displaying log line:', error);
        }
      });

      rl.on('close', () => {
        this.streams.delete(sessionId);
      });

      rl.on('error', (error) => {
        console.error('Readline error:', error);
        this.streams.delete(sessionId);
      });
    }

    // Handle stderr
    if (logProcess.child?.stderr) {
      logProcess.child.stderr.on('data', (data: Buffer) => {
        try {
          if (options.verbose) {
            console.error(prism.yellow(data.toString().trim()));
          }
        } catch (error) {
          // Ignore stderr display errors
        }
      });

      logProcess.child.stderr.on('error', (error: Error) => {
        // Log stderr stream errors but don't throw
        if (options.verbose) {
          console.error('Stderr stream error:', error);
        }
      });
    }

    // Wait for process to complete
    try {
      await logProcess;
    } catch (error) {
      // Process was likely killed by signal, which is expected
      if (!this.running) {
        return;
      }
      throw error;
    }
  }

  private async streamLogsWithPrefix(
    target: ResolvedTarget,
    logPath: string | undefined,
    options: LogsOptions
  ): Promise<void> {
    const logCommand = await this.buildLogCommand(target, logPath, options);
    // For Docker and K8s logs, we need to run commands on the host
    const useLocalEngine = target.type === 'docker' || target.type === 'kubernetes';
    const engine = useLocalEngine ? $ : await this.createTargetEngine(target);

    await this.streamLogs(target, engine, logCommand, { ...options, prefix: true });
  }

  private displayLogs(logs: string, target: ResolvedTarget, options: LogsOptions): void {
    const lines = logs.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return;
    }

    for (const line of lines) {
      this.displayLogLine(line, target, options);
    }

    if (!options.quiet && !options.follow) {
      this.log(prism.gray(`\nDisplayed ${lines.length} log lines`), 'info');
    }
  }

  private displayLogLine(line: string, target: ResolvedTarget, options: LogsOptions): void {
    if (!line.trim()) return;

    let output = line;

    // Add prefix if requested
    if (options.prefix) {
      const prefix = prism.cyan(`[${this.formatTargetDisplay(target)}]`);
      output = `${prefix} ${output}`;
    }

    // Add timestamp if requested and not already present
    if (options.timestamps && !this.hasTimestamp(line)) {
      const timestamp = prism.gray(new Date().toISOString());
      output = `${timestamp} ${output}`;
    }

    // Format as JSON if requested
    if (options.json) {
      try {
        // Try to parse as JSON first
        const parsed = JSON.parse(line);
        console.log(JSON.stringify({
          target: target.id,
          timestamp: new Date().toISOString(),
          data: parsed,
        }, null, 2));
        return;
      } catch {
        // Not JSON, wrap as message
        console.log(JSON.stringify({
          target: target.id,
          timestamp: new Date().toISOString(),
          message: line.trim(),
        }));
        return;
      }
    }

    // Apply color highlighting for common patterns
    if (options.color !== false) {
      output = this.colorizeLogLine(output);
    }

    console.log(output);
  }

  private colorizeLogLine(line: string): string {
    // Highlight common log levels
    return line
      .replace(/\b(ERROR|ERR|FAIL|FAILURE|FATAL)\b/gi, prism.red('$1'))
      .replace(/\b(WARN|WARNING)\b/gi, prism.yellow('$1'))
      .replace(/\b(INFO|INFORMATION)\b/gi, prism.blue('$1'))
      .replace(/\b(DEBUG|TRACE)\b/gi, prism.gray('$1'))
      .replace(/\b(SUCCESS|OK|DONE)\b/gi, prism.green('$1'));
  }

  private hasTimestamp(line: string): boolean {
    const timestampPatterns = [
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO 8601
      /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/, // Common log format
      /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/, // Bracketed format
      /^\w{3} \d{1,2} \d{2}:\d{2}:\d{2}/, // Syslog format
    ];

    return timestampPatterns.some(pattern => pattern.test(line));
  }

  private convertTimeSpec(timeSpec: string): string {
    // Convert user-friendly time specs to Docker format
    // Docker expects RFC3339 or Unix timestamp
    const match = timeSpec.match(/^(\d+)([smhd])(?:\s+ago)?$/);
    if (match && match[1] && match[2]) {
      const value = match[1];
      const unit = match[2];
      const seconds = this.getSeconds(parseInt(value, 10), unit);
      return `${seconds}s`;
    }
    return timeSpec;
  }

  private convertK8sTimeSpec(timeSpec: string): string {
    // Kubernetes supports relative time like "10m", "1h", "2d"
    const match = timeSpec.match(/^(\d+)([smhd])(?:\s+ago)?$/);
    if (match) {
      const [, value, unit] = match;
      return `${value}${unit}`;
    }
    return timeSpec;
  }

  private getSeconds(value: number, unit: string): number {
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return value;
    }
  }

  private getDefaultLogPath(target: ResolvedTarget): string {
    // Get default log path from target config or use common defaults
    const config = target.config as any;

    if (config.logPath) {
      return config.logPath;
    }

    // Common default log paths
    switch (target.name) {
      case 'nginx':
        return '/var/log/nginx/access.log';
      case 'apache':
        return '/var/log/apache2/access.log';
      case 'mysql':
        return '/var/log/mysql/error.log';
      case 'postgres':
        return '/var/log/postgresql/postgresql.log';
      default:
        return '/var/log/syslog';
    }
  }

  private async executeTask(
    targets: ResolvedTarget[],
    logPath: string | undefined,
    taskName: string,
    options: LogsOptions
  ): Promise<void> {
    if (!this.taskManager) {
      throw new Error('Task manager not initialized');
    }

    for (const target of targets) {
      const targetDisplay = this.formatTargetDisplay(target);
      this.log(`Running log analysis task '${taskName}' on ${targetDisplay}...`, 'info');

      try {
        const result = await this.taskManager.run(taskName,
          { LOG_PATH: logPath || this.getDefaultLogPath(target) },
          { target: target.id }
        );

        if (result.success) {
          this.log(`${prism.green('✓')} Task completed on ${targetDisplay}`, 'success');
        } else {
          throw new Error(result.error?.message || 'Task failed');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log(`${prism.red('✗')} Task failed on ${targetDisplay}: ${errorMessage}`, 'error');
        throw error;
      }
    }
  }

  private async runInteractiveMode(options: LogsOptions): Promise<{
    targetPattern: string;
    logPath?: string;
    options: Partial<LogsOptions>;
  } | null> {
    InteractiveHelpers.startInteractiveMode('Interactive Logs Mode');

    try {
      // Select log source type
      const logSourceType = await InteractiveHelpers.selectFromList(
        'What type of logs do you want to view?',
        [
          { value: 'container', label: '🐳 Container logs (Docker)' },
          { value: 'pod', label: '☸️  Pod logs (Kubernetes)' },
          { value: 'file', label: '📄 Log file (SSH/Local)' },
          { value: 'syslog', label: '🖥️  System logs' },
        ],
        (item) => item.label
      );

      if (!logSourceType) return null;

      // Select target based on log source type
      let targetType: 'all' | 'ssh' | 'docker' | 'kubernetes' | 'local' = 'all';
      switch (logSourceType.value) {
        case 'container':
          targetType = 'docker';
          break;
        case 'pod':
          targetType = 'kubernetes';
          break;
        case 'file':
        case 'syslog':
          targetType = 'all'; // Allow SSH and local
          break;
      }

      const target = await InteractiveHelpers.selectTarget({
        message: 'Select target:',
        type: targetType,
        allowCustom: true,
      });

      if (!target || Array.isArray(target)) return null;

      const targetPattern = target.id;
      let logPath: string | undefined;

      // Get log path for file-based logs
      if (logSourceType.value === 'file') {
        const logPathInput = await InteractiveHelpers.inputText('Enter log file path:', {
          placeholder: '/var/log/app.log',
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Log path cannot be empty';
            }
            return undefined;
          },
        });
        if (!logPathInput) return null;
        logPath = logPathInput;
      } else if (logSourceType.value === 'syslog') {
        // Common system log paths
        const syslogType = await InteractiveHelpers.selectFromList(
          'Select system log type:',
          [
            { value: '/var/log/syslog', label: 'System log' },
            { value: '/var/log/messages', label: 'Messages' },
            { value: '/var/log/auth.log', label: 'Authentication log' },
            { value: '/var/log/kern.log', label: 'Kernel log' },
            { value: 'custom', label: 'Custom path...' },
          ],
          (item) => item.label
        );
        if (!syslogType) return null;

        if (syslogType.value === 'custom') {
          const customLogPath = await InteractiveHelpers.inputText('Enter custom log path:', {
            placeholder: '/var/log/custom.log',
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Log path cannot be empty';
              }
              return undefined;
            },
          });
          if (!customLogPath) return null;
          logPath = customLogPath;
        } else {
          logPath = syslogType.value;
        }
      }

      // Configure viewing options
      const viewingMode = await InteractiveHelpers.selectFromList(
        'How do you want to view the logs?',
        [
          { value: 'tail', label: '📖 View recent logs (tail)' },
          { value: 'follow', label: '🔄 Stream live logs (follow)' },
          { value: 'search', label: '🔍 Search and filter logs' },
        ],
        (item) => item.label
      );

      if (!viewingMode) return null;

      const interactiveOptions: Partial<LogsOptions> = {};

      // Configure based on viewing mode
      if (viewingMode.value === 'follow') {
        interactiveOptions.follow = true;
      } else if (viewingMode.value === 'search') {
        // Configure search options
        const searchPattern = await InteractiveHelpers.inputText('Enter search pattern (regex):', {
          placeholder: 'ERROR|WARN',
        });
        if (searchPattern) {
          interactiveOptions.grep = searchPattern;
        }

        const contextLines = await InteractiveHelpers.selectFromList(
          'Show context around matches?',
          [
            { value: 'none', label: 'No context' },
            { value: '3', label: '3 lines before and after' },
            { value: '5', label: '5 lines before and after' },
            { value: '10', label: '10 lines before and after' },
          ],
          (item) => item.label
        );
        if (contextLines && contextLines.value !== 'none') {
          interactiveOptions.context = contextLines.value;
        }

        const invertMatch = await InteractiveHelpers.confirmAction(
          'Invert match (exclude matching lines)?',
          false
        );
        if (invertMatch) {
          interactiveOptions.invert = true;
        }
      }

      // Configure number of lines for tail
      if (!interactiveOptions.follow) {
        const tailCount = await InteractiveHelpers.selectFromList(
          'How many recent lines to show?',
          [
            { value: '50', label: '50 lines' },
            { value: '100', label: '100 lines' },
            { value: '200', label: '200 lines' },
            { value: '500', label: '500 lines' },
            { value: 'custom', label: 'Custom amount...' },
          ],
          (item) => item.label
        );

        if (!tailCount) return null;

        if (tailCount.value === 'custom') {
          const customCount = await InteractiveHelpers.inputText('Enter number of lines:', {
            placeholder: '100',
            validate: (value) => {
              if (!value) return 'Number is required';
              const num = parseInt(value, 10);
              if (isNaN(num) || num <= 0) {
                return 'Please enter a positive number';
              }
              return undefined;
            },
          });
          if (!customCount) return null;
          interactiveOptions.tail = customCount;
        } else {
          interactiveOptions.tail = tailCount.value;
        }
      }

      // Configure time range
      const useTimeRange = await InteractiveHelpers.confirmAction(
        'Filter by time range?',
        false
      );

      if (useTimeRange) {
        const timeRange = await InteractiveHelpers.selectFromList(
          'Select time range:',
          [
            { value: '5m', label: 'Last 5 minutes' },
            { value: '15m', label: 'Last 15 minutes' },
            { value: '1h', label: 'Last hour' },
            { value: '6h', label: 'Last 6 hours' },
            { value: '1d', label: 'Last day' },
            { value: 'custom', label: 'Custom time...' },
          ],
          (item) => item.label
        );

        if (timeRange) {
          if (timeRange.value === 'custom') {
            const customTime = await InteractiveHelpers.inputText('Enter time specification:', {
              placeholder: '2h (2 hours ago) or 2023-12-01T10:00:00',
            });
            if (customTime) {
              interactiveOptions.since = customTime;
            }
          } else {
            interactiveOptions.since = timeRange.value;
          }
        }
      }

      // Container-specific options
      if (target.type === 'kubernetes') {
        const showPrevious = await InteractiveHelpers.confirmAction(
          'Show logs from previous container instance?',
          false
        );
        if (showPrevious) {
          interactiveOptions.previous = true;
        }

        // Check if target has multiple containers
        const containerName = await InteractiveHelpers.inputText('Container name (leave empty for default):', {
          placeholder: 'sidecar, main, etc.',
        });
        if (containerName) {
          interactiveOptions.container = containerName;
        }
      }

      // Output format options
      const outputOptions = await InteractiveHelpers.selectFromList(
        'Select output format:',
        [
          { value: 'default', label: '📝 Standard output' },
          { value: 'timestamps', label: '🕐 Include timestamps' },
          { value: 'json', label: '📋 JSON format' },
        ],
        (item) => item.label
      );

      if (outputOptions) {
        switch (outputOptions.value) {
          case 'timestamps':
            interactiveOptions.timestamps = true;
            break;
          case 'json':
            interactiveOptions.json = true;
            break;
        }
      }

      // Additional options
      const showColors = await InteractiveHelpers.confirmAction(
        'Enable colored output for log levels?',
        true
      );
      if (!showColors) {
        interactiveOptions.color = false;
      }

      InteractiveHelpers.endInteractiveMode('Logs configuration complete!');

      return {
        targetPattern,
        logPath,
        options: interactiveOptions,
      };
    } catch (error) {
      InteractiveHelpers.showError(`Interactive mode failed: ${error}`);
      return null;
    }
  }

  private setupCleanupHandlers(): void {
    const cleanup = async () => {
      try {
        this.running = false;
        this.log('\nStopping log streams...', 'info');

        for (const [sessionId, stream] of this.streams) {
          try {
            if (stream.cleanup) {
              await stream.cleanup();
            }
            this.log(`Stopped stream for ${sessionId}`, 'info');
          } catch (error) {
            this.log(`Failed to cleanup ${sessionId}: ${error}`, 'error');
          }
        }

        this.streams.clear();

        // Only exit if not in test environment
        if (process.env['NODE_ENV'] !== 'test') {
          process.exit(0);
        }
      } catch (error) {
        console.error('Error during cleanup:', error);
        if (process.env['NODE_ENV'] !== 'test') {
          process.exit(1);
        }
      }
    };

    // Wrap cleanup to handle any synchronous errors
    const safeCleanup = (...args: any[]) => {
      cleanup().catch((error) => {
        console.error('Unhandled error in cleanup:', error);
        if (process.env['NODE_ENV'] !== 'test') {
          process.exit(1);
        }
      });
    };

    process.once('SIGINT', safeCleanup);
    process.once('SIGTERM', safeCleanup);
  }
}

export default function command(program: Command): void {
  const cmd = new LogsCommand();
  program.addCommand(cmd.create());
}