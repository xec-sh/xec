import type { PrettyOptions } from 'pino-pretty';

import chalk from 'chalk';
import pinoPretty from 'pino-pretty';
import pino, { 
  type Bindings,
  type Logger as PinoLogger, 
  type LoggerOptions as PinoOptions
} from 'pino';

import type { Logger as ILogger } from '../core/types.js';

export interface TransportConfig {
  target: string;
  options?: Record<string, any>;
  level?: string;
}

export interface LoggerOptions {
  level?: pino.LevelWithSilentOrString;
  name?: string;
  colorize?: boolean;
  timestamps?: boolean;
  json?: boolean;
  file?: string;
  sync?: boolean;
  prettyPrint?: boolean | PrettyOptions;
  messageKey?: string;
  timestampKey?: string;
  errorKey?: string;
  base?: Record<string, any> | null;
  serializers?: Record<string, (value: any) => any>;
  redact?: string[] | { paths: string[]; censor?: string | ((value: any, path: string[]) => any); remove?: boolean };
  transports?: TransportConfig[];
  hooks?: {
    logMethod?: (args: any[], method: pino.LogFn, level: number) => void;
  };
  formatters?: {
    level?: (label: string, number: number) => object;
    bindings?: (bindings: Bindings) => object;
    log?: (object: Record<string, any>) => Record<string, any>;
  };
  mixin?: (context: object, level: number) => object;
  customLevels?: Record<string, number>;
  useOnlyCustomLevels?: boolean;
  enabled?: boolean;
  browser?: any; // Browser support configuration
  nestedKey?: string;
  depthLimit?: number;
  edgeLimit?: number;
}

const levelColors = {
  fatal: 'red',
  error: 'red',
  warn: 'yellow',
  info: 'cyan',
  debug: 'gray',
  trace: 'gray'
};

function createPrettyTransport(options: LoggerOptions): TransportConfig {
  const prettyOptions: PrettyOptions = {
    colorize: options.colorize !== false,
    translateTime: options.timestamps !== false ? 'HH:mm:ss' : false,
    ignore: 'pid,hostname',
    messageKey: options.messageKey || 'msg',
    errorLikeObjectKeys: ['err', 'error'],
    customPrettifiers: {
      ...(options.timestamps === false && { time: () => '' }),
      level: (logLevel: string | object) => {
        const level = typeof logLevel === 'string' ? logLevel : String(logLevel);
        const color = levelColors[level as keyof typeof levelColors] || 'white';
        const chalkFn = chalk[color as keyof typeof chalk] || chalk.white;
        return (chalkFn as any)(level.toUpperCase().padEnd(5));
      }
    }
  };

  if (typeof options.prettyPrint === 'object') {
    Object.assign(prettyOptions, options.prettyPrint);
  }

  return {
    target: 'pino-pretty',
    options: prettyOptions
  };
}

/**
 * Get default log level from environment or return 'warn'
 */
function getDefaultLogLevel(): pino.LevelWithSilentOrString {
  const envLevel = process.env.XEC_LOG_LEVEL;
  if (envLevel && ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'].includes(envLevel)) {
    return envLevel as pino.LevelWithSilentOrString;
  }
  return 'warn';
}

export class Logger implements ILogger {
  private pino: PinoLogger;
  private name?: string;
  private options: LoggerOptions;

  constructor(options: LoggerOptions = {}) {
    this.options = {
      level: getDefaultLogLevel(),
      sync: true, // Disable buffering by default
      ...options
    };
    
    this.name = this.options.name;

    const pinoOptions: PinoOptions = {
      level: this.options.level as string,
      name: this.options.name,
      enabled: this.options.enabled !== false,
      base: this.options.base === null ? null : { ...this.options.base },
      serializers: this.options.serializers,
      redact: this.options.redact,
      hooks: this.options.hooks || {},
      formatters: this.options.formatters,
      mixin: this.options.mixin,
      customLevels: this.options.customLevels,
      useOnlyCustomLevels: this.options.useOnlyCustomLevels,
      depthLimit: this.options.depthLimit || 5,
      edgeLimit: this.options.edgeLimit || 100,
      browser: this.options.browser,
      messageKey: this.options.messageKey || 'msg',
      nestedKey: this.options.nestedKey,
      timestamp: this.options.timestamps !== false,
      errorKey: this.options.errorKey
    };

    // Configure transports
    const transports: TransportConfig[] = this.options.transports || [];
    
    // Add console transport if not in JSON mode and no transports specified
    if (!this.options.json && transports.length === 0) {
      transports.push(createPrettyTransport(this.options));
    }

    // Add file transport if specified
    if (this.options.file) {
      transports.push({
        target: 'pino/file',
        options: { 
          destination: this.options.file,
          sync: this.options.sync !== false
        }
      });
    }

    // Create logger with transports
    // When sync mode is enabled or logger is disabled, don't use worker threads
    if (transports.length > 0 && this.options.sync !== true && this.options.enabled !== false) {
      this.pino = pino({
        ...pinoOptions,
        transport: {
          targets: transports
        }
      });
    } else if (transports.length > 0 && (this.options.sync === true || this.options.enabled === false)) {
      // For sync mode or disabled logger, create without worker threads
      // Just use the base pino logger with pretty printing if needed
      if (!this.options.json && !this.options.file) {
        const pretty = pinoPretty;
        const stream = pretty({
          colorize: this.options.colorize !== false,
          translateTime: this.options.timestamps !== false ? 'HH:mm:ss' : false,
          ignore: 'pid,hostname',
          messageKey: this.options.messageKey || 'msg'
        });
        this.pino = pino(pinoOptions, stream);
      } else {
        this.pino = pino(pinoOptions);
      }
    } else {
      this.pino = pino(pinoOptions);
    }
  }

  debug(message: string, meta?: any): void {
    if (meta !== undefined) {
      this.pino.debug(meta, message);
    } else {
      this.pino.debug(message);
    }
  }

  info(message: string, meta?: any): void {
    if (meta !== undefined) {
      this.pino.info(meta, message);
    } else {
      this.pino.info(message);
    }
  }

  warn(message: string, meta?: any): void {
    if (meta !== undefined) {
      this.pino.warn(meta, message);
    } else {
      this.pino.warn(message);
    }
  }

  error(message: string, meta?: any): void {
    if (meta !== undefined) {
      this.pino.error(meta, message);
    } else {
      this.pino.error(message);
    }
  }

  child(options: { name?: string; [key: string]: any }): Logger {
    const childPino = this.pino.child(options);
    const childLogger = Object.create(this);
    childLogger.pino = childPino;
    childLogger.name = options.name || this.name;
    return childLogger;
  }

  setLevel(level: string): void {
    this.pino.level = level;
  }

  getLevel(): string {
    return this.pino.level;
  }

  isLevelEnabled(level: string): boolean {
    return this.pino.isLevelEnabled(level);
  }

  // Additional pino-specific methods for advanced usage
  flush(): void {
    if ('flush' in this.pino && typeof this.pino.flush === 'function') {
      this.pino.flush();
    }
  }

  // Get underlying pino instance for advanced usage
  getPino(): PinoLogger {
    return this.pino;
  }
}

export function createLogger(options?: LoggerOptions): Logger {
  return new Logger(options);
}

export function createTaskLogger(taskId: string, options?: LoggerOptions): Logger {
  return new Logger({
    ...options,
    name: taskId
  });
}

export function createRecipeLogger(recipeId: string, options?: LoggerOptions): Logger {
  return new Logger({
    ...options,
    name: `recipe:${recipeId}`
  });
}

export function createModuleLogger(moduleName: string, options?: LoggerOptions): Logger {
  return new Logger({
    ...options,
    name: `module:${moduleName}`
  });
}

let defaultLogger: Logger | null = null;

export function getDefaultLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger();
  }
  return defaultLogger;
}

export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger;
}

export function logWithPrefix(prefix: string, message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info'): void {
  const prefixedMessage = `[${prefix}] ${message}`;
  getDefaultLogger()[level](prefixedMessage);
}

export function createProgressLogger(total: number, options?: LoggerOptions): {
  logger: Logger;
  update: (current: number, message?: string) => void;
  complete: (message?: string) => void;
} {
  const logger = createLogger(options);
  let lastPercentage = -1;

  const update = (current: number, message?: string) => {
    const percentage = Math.floor((current / total) * 100);
    if (percentage !== lastPercentage) {
      lastPercentage = percentage;
      const progressBar = createProgressBar(percentage);
      const msg = message ? `${progressBar} ${message}` : progressBar;
      logger.info(msg);
    }
  };

  const complete = (message?: string) => {
    const msg = message || 'Complete!';
    logger.info(`${createProgressBar(100)} ${msg}`);
  };

  return { logger, update, complete };
}

function createProgressBar(percentage: number, width: number = 30): string {
  const filled = Math.floor((percentage / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percentage}%`;
}