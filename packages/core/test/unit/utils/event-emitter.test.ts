import { it, jest, expect, describe, beforeEach } from '@jest/globals';

import { EnhancedEventEmitter } from '../../../src/utils/event-emitter.js';

describe('EnhancedEventEmitter', () => {
  let emitter: EnhancedEventEmitter;

  beforeEach(() => {
    emitter = new EnhancedEventEmitter();
  });

  describe('Basic Functionality', () => {
    it('should emit and receive basic events', () => {
      const handler = jest.fn();
      
      emitter.on('command:start', handler);
      
      emitter.emit('command:start', {
        command: 'echo test',
        timestamp: new Date(),
        adapter: 'local'
      });
      
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'echo test',
          adapter: 'local'
        })
      );
    });

    it('should support emitEnhanced with automatic metadata', () => {
      const handler = jest.fn();
      
      emitter.on('cache:hit', handler);
      
      emitter.emitEnhanced('cache:hit', {
        key: 'test-key',
        ttl: 5000
      }, 'cache');
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'test-key',
          ttl: 5000,
          adapter: 'cache',
          timestamp: expect.any(Date)
        })
      );
    });
  });

  describe('Event Filtering', () => {
    it('should filter events by adapter', () => {
      const sshHandler = jest.fn();
      const dockerHandler = jest.fn();
      const allHandler = jest.fn();
      
      emitter.onFiltered('command:start', { adapter: 'ssh' }, sshHandler);
      emitter.onFiltered('command:start', { adapter: 'docker' }, dockerHandler);
      emitter.onFiltered('command:start', allHandler);
      
      // Emit SSH event
      emitter.emit('command:start', {
        command: 'ls',
        timestamp: new Date(),
        adapter: 'ssh'
      });
      
      expect(sshHandler).toHaveBeenCalledTimes(1);
      expect(dockerHandler).toHaveBeenCalledTimes(0);
      expect(allHandler).toHaveBeenCalledTimes(1);
      
      // Emit Docker event
      emitter.emit('command:start', {
        command: 'ps',
        timestamp: new Date(),
        adapter: 'docker'
      });
      
      expect(sshHandler).toHaveBeenCalledTimes(1);
      expect(dockerHandler).toHaveBeenCalledTimes(1);
      expect(allHandler).toHaveBeenCalledTimes(2);
    });

    it('should filter by multiple adapters', () => {
      const handler = jest.fn();
      
      emitter.onFiltered('command:complete', { adapter: ['ssh', 'docker'] }, handler);
      
      // Should match SSH
      emitter.emit('command:complete', {
        command: 'ls',
        exitCode: 0,
        duration: 100,
        timestamp: new Date(),
        adapter: 'ssh'
      });
      
      // Should match Docker
      emitter.emit('command:complete', {
        command: 'ps',
        exitCode: 0,
        duration: 200,
        timestamp: new Date(),
        adapter: 'docker'
      });
      
      // Should NOT match local
      emitter.emit('command:complete', {
        command: 'echo',
        exitCode: 0,
        duration: 50,
        timestamp: new Date(),
        adapter: 'local'
      });
      
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should filter by custom properties', () => {
      const handler = jest.fn();
      
      emitter.onFiltered('connection:open', { 
        host: 'example.com',
        port: 22
      }, handler);
      
      // Should match
      emitter.emit('connection:open', {
        host: 'example.com',
        port: 22,
        type: 'ssh',
        timestamp: new Date(),
        adapter: 'ssh'
      });
      
      // Should NOT match (different host)
      emitter.emit('connection:open', {
        host: 'other.com',
        port: 22,
        type: 'ssh',
        timestamp: new Date(),
        adapter: 'ssh'
      });
      
      // Should NOT match (different port)
      emitter.emit('connection:open', {
        host: 'example.com',
        port: 2222,
        type: 'ssh',
        timestamp: new Date(),
        adapter: 'ssh'
      });
      
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Wildcard Patterns', () => {
    it('should support simple wildcard patterns', () => {
      const handler = jest.fn();
      
      emitter.onFiltered('command:*', handler);
      
      emitter.emit('command:start', {
        command: 'ls',
        timestamp: new Date(),
        adapter: 'local'
      });
      
      emitter.emit('command:complete', {
        command: 'ls',
        exitCode: 0,
        duration: 100,
        timestamp: new Date(),
        adapter: 'local'
      });
      
      emitter.emit('command:error', {
        command: 'fail',
        error: 'Command not found',
        duration: 50,
        timestamp: new Date(),
        adapter: 'local'
      });
      
      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should support wildcard with filtering', () => {
      const handler = jest.fn();
      
      emitter.onFiltered('ssh:*', { adapter: 'ssh' }, handler);
      
      emitter.emit('ssh:connect', {
        host: 'example.com',
        port: 22,
        timestamp: new Date(),
        adapter: 'ssh'
      });
      
      emitter.emit('ssh:execute', {
        host: 'example.com',
        command: 'ls',
        timestamp: new Date(),
        adapter: 'ssh'
      });
      
      // Should NOT match (wrong adapter)
      emitter.emit('ssh:connect', {
        host: 'example.com',
        port: 22,
        timestamp: new Date(),
        adapter: 'docker' // Wrong adapter
      });
      
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should support catch-all wildcard', () => {
      const handler = jest.fn();
      
      emitter.onFiltered('*', handler);
      
      emitter.emit('command:start', {
        command: 'test',
        timestamp: new Date(),
        adapter: 'local'
      });
      
      emitter.emit('cache:hit', {
        key: 'test',
        timestamp: new Date(),
        adapter: 'cache'
      });
      
      emitter.emit('retry:attempt', {
        attempt: 1,
        maxAttempts: 3,
        delay: 100,
        timestamp: new Date(),
        adapter: 'retry'
      });
      
      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should handle dynamic event registration', () => {
      const handler = jest.fn();
      
      // Register wildcard handler first
      emitter.onFiltered('cache:*', handler);
      
      // Emit events that match the pattern
      emitter.emit('cache:hit', {
        key: 'test1',
        timestamp: new Date(),
        adapter: 'cache'
      });
      
      emitter.emit('cache:miss', {
        key: 'test2',
        timestamp: new Date(),
        adapter: 'cache'
      });
      
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Listener Management', () => {
    it('should remove filtered listeners', () => {
      const handler = jest.fn();
      
      emitter.onFiltered('command:start', { adapter: 'ssh' }, handler);
      
      emitter.emit('command:start', {
        command: 'ls',
        timestamp: new Date(),
        adapter: 'ssh'
      });
      
      expect(handler).toHaveBeenCalledTimes(1);
      
      // Remove listener
      emitter.offFiltered('command:start', handler);
      
      emitter.emit('command:start', {
        command: 'ls',
        timestamp: new Date(),
        adapter: 'ssh'
      });
      
      expect(handler).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should remove wildcard listeners', () => {
      const handler = jest.fn();
      
      emitter.onFiltered('cache:*', handler);
      
      emitter.emit('cache:hit', {
        key: 'test',
        timestamp: new Date(),
        adapter: 'cache'
      });
      
      expect(handler).toHaveBeenCalledTimes(1);
      
      // Remove listener
      emitter.offFiltered('cache:*', handler);
      
      emitter.emit('cache:miss', {
        key: 'test',
        timestamp: new Date(),
        adapter: 'cache'
      });
      
      expect(handler).toHaveBeenCalledTimes(1); // Still 1
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle multiple filters on same event', () => {
      const sshHandler = jest.fn();
      const dockerHandler = jest.fn();
      const errorHandler = jest.fn();
      
      emitter.onFiltered('command:complete', { adapter: 'ssh' }, sshHandler);
      emitter.onFiltered('command:complete', { adapter: 'docker' }, dockerHandler);
      emitter.onFiltered('command:complete', { exitCode: 1 }, errorHandler);
      
      // SSH success
      emitter.emit('command:complete', {
        command: 'ls',
        exitCode: 0,
        duration: 100,
        timestamp: new Date(),
        adapter: 'ssh'
      });
      
      expect(sshHandler).toHaveBeenCalledTimes(1);
      expect(dockerHandler).toHaveBeenCalledTimes(0);
      expect(errorHandler).toHaveBeenCalledTimes(0);
      
      // Docker error
      emitter.emit('command:complete', {
        command: 'fail',
        exitCode: 1,
        duration: 200,
        timestamp: new Date(),
        adapter: 'docker'
      });
      
      expect(sshHandler).toHaveBeenCalledTimes(1);
      expect(dockerHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle overlapping wildcard patterns', () => {
      const allHandler = jest.fn();
      const commandHandler = jest.fn();
      const sshHandler = jest.fn();
      
      emitter.onFiltered('*', allHandler);
      emitter.onFiltered('command:*', commandHandler);
      emitter.onFiltered('ssh:*', sshHandler);
      
      emitter.emit('command:start', {
        command: 'test',
        timestamp: new Date(),
        adapter: 'local'
      });
      
      expect(allHandler).toHaveBeenCalledTimes(1);
      expect(commandHandler).toHaveBeenCalledTimes(1);
      expect(sshHandler).toHaveBeenCalledTimes(0);
      
      emitter.emit('ssh:connect', {
        host: 'example.com',
        port: 22,
        timestamp: new Date(),
        adapter: 'ssh'
      });
      
      expect(allHandler).toHaveBeenCalledTimes(2);
      expect(commandHandler).toHaveBeenCalledTimes(1);
      expect(sshHandler).toHaveBeenCalledTimes(1);
    });
  });
});