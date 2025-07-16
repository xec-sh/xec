/**
 * Example of using the new Pino-based logger with advanced features
 */

import { createLogger, createTaskLogger, createModuleLogger } from '../src/utils/logger.js';

// Basic logger with default configuration
const basicLogger = createLogger();
basicLogger.info('Basic logger initialized');
basicLogger.debug('Debug message');
basicLogger.warn('Warning message');
basicLogger.error('Error message');

// Logger with JSON output
const jsonLogger = createLogger({ 
  json: true,
  name: 'json-logger'
});
jsonLogger.info('Structured logging', { user: 'john', action: 'login' });

// Logger with file output
const fileLogger = createLogger({
  file: '/tmp/xec.log',
  name: 'file-logger',
  sync: true // Buffering disabled by default
});
fileLogger.info('This will be written to file');

// Logger with custom configuration
const customLogger = createLogger({
  level: 'debug',
  name: 'custom',
  colorize: true,
  timestamps: true,
  prettyPrint: {
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
    singleLine: false
  },
  // Redact sensitive information
  redact: ['password', 'secret', 'token'],
  // Custom serializers
  serializers: {
    error: (err: Error) => ({
      message: err.message,
      stack: err.stack,
      type: err.name
    })
  },
  // Add custom fields to every log
  mixin: () => ({
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  })
});

// Log with metadata
customLogger.info('User action', { 
  user: 'john', 
  action: 'update-profile',
  password: 'secret123' // Will be redacted
});

// Log errors
try {
  throw new Error('Something went wrong');
} catch (error) {
  customLogger.error('Operation failed', { error });
}

// Child loggers for context
const taskLogger = createTaskLogger('deploy-app');
taskLogger.info('Starting deployment');

const moduleLogger = createModuleLogger('auth');
moduleLogger.debug('Authenticating user');

// Child logger with additional context
const requestLogger = customLogger.child({
  requestId: '123456',
  userId: 'user-789'
});
requestLogger.info('Processing request');

// Custom transports
const advancedLogger = createLogger({
  transports: [
    {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:mm:ss',
        ignore: 'pid,hostname'
      }
    },
    {
      target: 'pino/file',
      options: {
        destination: '/tmp/xec-advanced.log'
      },
      level: 'error' // Only errors to file
    }
  ]
});

advancedLogger.info('This goes to console');
advancedLogger.error('This goes to both console and file');

// Check log level
const debugLogger = createLogger({ level: 'debug' });
console.log('Is debug enabled?', debugLogger.isLevelEnabled('debug'));
console.log('Is trace enabled?', debugLogger.isLevelEnabled('trace'));

// Progress logger
import { createProgressLogger } from '../src/utils/logger.js';

const { logger: progressLogger, update, complete } = createProgressLogger(100);
for (let i = 0; i <= 100; i += 10) {
  update(i, `Processing ${i}%`);
}
complete('Processing completed!');

// Advanced Pino features
const pinoLogger = createLogger({ name: 'pino-advanced' });

// Access underlying Pino instance
const pino = pinoLogger.getPino();
console.log('Pino version:', pino.version);

// Flush logs (useful before process exit)
pinoLogger.flush();

console.log('\nAll examples completed!');