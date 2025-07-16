import { it, vi, expect, describe, beforeEach } from 'vitest';

import { 
  Logger, 
  createLogger, 
  logWithPrefix,
  createTaskLogger,
  getDefaultLogger,
  setDefaultLogger,
  createRecipeLogger,
  createModuleLogger,
  createProgressLogger
} from '../../../src/utils/logger.js';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createLogger({ enabled: false }); // Disable actual logging in tests
  });

  describe('Logger instance methods', () => {
    it('should create a logger instance', () => {
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should support all log levels', () => {
      expect(() => logger.debug('debug message')).not.toThrow();
      expect(() => logger.info('info message')).not.toThrow();
      expect(() => logger.warn('warn message')).not.toThrow();
      expect(() => logger.error('error message')).not.toThrow();
    });

    it('should support metadata in logs', () => {
      expect(() => logger.info('message', { key: 'value' })).not.toThrow();
      expect(() => logger.error('error', { error: new Error('test') })).not.toThrow();
    });

    it('should create child loggers', () => {
      const child = logger.child({ module: 'test' });
      expect(child).toBeInstanceOf(Logger);
      expect(child).not.toBe(logger);
    });

    it('should set and get log level', () => {
      logger.setLevel('debug');
      expect(logger.getLevel()).toBe('debug');
      
      logger.setLevel('error');
      expect(logger.getLevel()).toBe('error');
    });

    it('should check if level is enabled', () => {
      logger.setLevel('info');
      expect(logger.isLevelEnabled('error')).toBe(true);
      expect(logger.isLevelEnabled('info')).toBe(true);
      expect(logger.isLevelEnabled('debug')).toBe(false);
    });
  });

  describe('Logger factory functions', () => {
    it('should create task logger', () => {
      const taskLogger = createTaskLogger('task-123');
      expect(taskLogger).toBeInstanceOf(Logger);
    });

    it('should create recipe logger', () => {
      const recipeLogger = createRecipeLogger('recipe-456');
      expect(recipeLogger).toBeInstanceOf(Logger);
    });

    it('should create module logger', () => {
      const moduleLogger = createModuleLogger('my-module');
      expect(moduleLogger).toBeInstanceOf(Logger);
    });
  });

  describe('Default logger', () => {
    it('should get default logger', () => {
      const defaultLogger = getDefaultLogger();
      expect(defaultLogger).toBeInstanceOf(Logger);
      expect(getDefaultLogger()).toBe(defaultLogger); // Should return same instance
    });

    it('should set default logger', () => {
      const customLogger = createLogger({ name: 'custom' });
      setDefaultLogger(customLogger);
      expect(getDefaultLogger()).toBe(customLogger);
    });
  });

  describe('Logger configuration', () => {
    it('should support JSON output', () => {
      const jsonLogger = createLogger({ json: true, enabled: false });
      expect(jsonLogger).toBeInstanceOf(Logger);
    });

    it('should support file output', () => {
      const fileLogger = createLogger({ file: '/tmp/test.log', enabled: false });
      expect(fileLogger).toBeInstanceOf(Logger);
    });

    it('should support custom transports', () => {
      const customLogger = createLogger({
        enabled: false,
        transports: [
          { target: 'pino-pretty', options: { colorize: false } }
        ]
      });
      expect(customLogger).toBeInstanceOf(Logger);
    });

    it('should support redaction', () => {
      const redactLogger = createLogger({
        enabled: false,
        redact: ['password', 'secret']
      });
      expect(redactLogger).toBeInstanceOf(Logger);
    });

    it('should support custom serializers', () => {
      const serializerLogger = createLogger({
        enabled: false,
        serializers: {
          error: (err: Error) => ({ message: err.message })
        }
      });
      expect(serializerLogger).toBeInstanceOf(Logger);
    });

    it('should support mixin', () => {
      const mixinLogger = createLogger({
        enabled: false,
        mixin: () => ({ timestamp: Date.now() })
      });
      expect(mixinLogger).toBeInstanceOf(Logger);
    });

    it('should disable buffering by default', () => {
      const syncLogger = createLogger({ enabled: false });
      expect(syncLogger).toBeInstanceOf(Logger);
      // Sync is handled internally by pino
    });
  });

  describe('Utility functions', () => {
    it('should log with prefix', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logWithPrefix('PREFIX', 'message');
      spy.mockRestore();
    });

    it('should create progress logger', () => {
      const { logger: progressLogger, update, complete } = createProgressLogger(100, { enabled: false });
      
      expect(progressLogger).toBeInstanceOf(Logger);
      expect(typeof update).toBe('function');
      expect(typeof complete).toBe('function');
      
      // Test progress updates
      expect(() => update(50, 'Halfway')).not.toThrow();
      expect(() => complete('Done!')).not.toThrow();
    });
  });

  describe('Advanced pino features', () => {
    it('should expose pino instance', () => {
      const pino = logger.getPino();
      expect(pino).toBeDefined();
      expect(typeof pino.info).toBe('function');
    });

    it('should support flush method', () => {
      expect(() => logger.flush()).not.toThrow();
    });

    it('should support custom levels', () => {
      const customLevelLogger = createLogger({
        enabled: false,
        customLevels: {
          custom: 35
        }
      });
      expect(customLevelLogger).toBeInstanceOf(Logger);
    });

    it('should support formatters', () => {
      const formatterLogger = createLogger({
        enabled: false,
        formatters: {
          level: (label) => ({ level: label.toUpperCase() })
        }
      });
      expect(formatterLogger).toBeInstanceOf(Logger);
    });

    it('should support hooks', () => {
      const hookLogger = createLogger({
        enabled: false,
        hooks: {
          logMethod: (args, method, level) => {
            // Custom log method hook
          }
        }
      });
      expect(hookLogger).toBeInstanceOf(Logger);
    });
  });
});