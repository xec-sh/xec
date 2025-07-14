import chalk from 'chalk';
import winston from 'winston';

import type { Logger as ILogger } from '../core/types.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

export interface LoggerOptions {
  level?: string;
  name?: string;
  colorize?: boolean;
  timestamps?: boolean;
  json?: boolean;
  file?: string;
}

const levelColors = {
  error: 'red',
  warn: 'yellow',
  info: 'cyan',
  debug: 'gray'
};

const customColorize = winston.format((info) => {
  const level = info.level;
  const color = levelColors[level as keyof typeof levelColors] || 'white';
  const chalkFn = chalk[color as 'red' | 'yellow' | 'cyan' | 'gray'] || chalk.white;
  info.level = chalkFn(level.toUpperCase().padEnd(5));
  return info;
});

const consoleFormat = printf(({ level, message, timestamp, name, ...metadata }) => {
  let msg = `${level}`;
  
  if (timestamp) {
    msg += ` ${chalk.gray(timestamp)}`;
  }
  
  if (name) {
    msg += ` ${chalk.blue(`[${name}]`)}`;
  }
  
  msg += ` ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += ` ${chalk.gray(JSON.stringify(metadata))}`;
  }
  
  return msg;
});

const jsonFormat = combine(
  timestamp(),
  errors({ stack: true }),
  winston.format.json()
);

export class Logger implements ILogger {
  private winston: winston.Logger;
  private name?: string;

  constructor(options: LoggerOptions = {}) {
    const {
      level = 'info',
      name,
      colorize = true,
      timestamps = true,
      json = false,
      file
    } = options;

    this.name = name;

    const formats = [];
    
    if (!json) {
      if (colorize) {
        formats.push(customColorize());
      }
      if (timestamps) {
        formats.push(timestamp({ format: 'HH:mm:ss' }));
      }
      formats.push(consoleFormat);
    } else {
      formats.push(jsonFormat);
    }

    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: combine(...formats)
      })
    ];

    if (file) {
      transports.push(
        new winston.transports.File({
          filename: file,
          format: jsonFormat
        })
      );
    }

    this.winston = winston.createLogger({
      level,
      transports,
      defaultMeta: name ? { name } : undefined
    });
  }

  debug(message: string, meta?: any): void {
    this.winston.debug(message, meta);
  }

  info(message: string, meta?: any): void {
    this.winston.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.winston.warn(message, meta);
  }

  error(message: string, meta?: any): void {
    this.winston.error(message, meta);
  }

  child(options: { name?: string; [key: string]: any }): Logger {
    const childOptions = {
      ...this.winston.defaultMeta,
      ...options
    };
    
    const childLogger = new Logger({
      level: this.winston.level,
      name: options.name || this.name,
      colorize: true,
      timestamps: true
    });
    
    childLogger.winston.defaultMeta = childOptions;
    return childLogger;
  }

  setLevel(level: string): void {
    this.winston.level = level;
  }

  getLevel(): string {
    return this.winston.level;
  }

  isLevelEnabled(level: string): boolean {
    const levels = Object.keys(winston.config.npm.levels);
    const currentLevelPriority = winston.config.npm.levels[this.winston.level];
    const checkLevelPriority = winston.config.npm.levels[level];
    return checkLevelPriority <= currentLevelPriority;
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