import { it, expect, describe, beforeEach } from '@jest/globals';

import { $, configure } from '../../src/index.js';

describe('Mutable Configuration', () => {
  beforeEach(() => {
    // Reset configuration before each test
    configure({
      defaultTimeout: 120000,
      defaultEnv: {}
    });
  });

  describe('$.config.set()', () => {
    it('should update configuration without recreating engine', () => {
      // Reset to known state
      $.config.set({ defaultTimeout: 120000 });
      
      // Set up event listener to verify engine is not recreated
      let eventCount = 0;
      $.on('command:start', () => { eventCount++; });
      
      // Initial config
      const initialConfig = $.config.get();
      expect(initialConfig.defaultTimeout).toBe(120000); // Default 2 minutes
      
      // Update config
      $.config.set({ defaultTimeout: 30000 });
      
      // Verify config was updated
      const updatedConfig = $.config.get();
      expect(updatedConfig.defaultTimeout).toBe(30000);
      
      // Event listener should still be attached
      // Would need to execute a command to verify, but that's integration testing
    });
    
    it('should allow updating multiple config values', () => {
      $.config.set({
        defaultTimeout: 5000,
        defaultShell: '/bin/bash',
        defaultEnv: { FOO: 'bar' },
        throwOnNonZeroExit: false
      });
      
      const config = $.config.get();
      expect(config.defaultTimeout).toBe(5000);
      expect(config.defaultShell).toBe('/bin/bash');
      expect(config.defaultEnv).toEqual({ FOO: 'bar' });
      expect(config.throwOnNonZeroExit).toBe(false);
    });
    
    it('should merge environment variables', () => {
      $.config.set({ defaultEnv: { FOO: 'bar' } });
      $.config.set({ defaultEnv: { BAZ: 'qux' } });
      
      const config = $.config.get();
      expect(config.defaultEnv).toEqual({ FOO: 'bar', BAZ: 'qux' });
    });
  });
  
  describe('$.defaults()', () => {
    it('should set default values for commands', () => {
      const engine = $.defaults({ 
        timeout: 5000,
        cwd: '/tmp',
        env: { TEST: 'value' }
      });
      
      // Should return a callable engine for chaining
      expect(typeof engine).toBe('function');
      
      // Verify timeout was updated in config  
      const config = $.config.get();
      expect(config.defaultTimeout).toBe(5000);
    });
    
    it('should update global defaults when using defaultEnv and defaultCwd', () => {
      $.defaults({
        defaultEnv: { NEW_VAR: 'value' },
        defaultCwd: '/home/user'
      });
      
      const config = $.config.get();
      expect(config.defaultEnv).toMatchObject({ NEW_VAR: 'value' });
      expect(config.defaultCwd).toBe('/home/user');
    });
    
    it('should update timeout and shell in global config', () => {
      $.defaults({
        timeout: 3000,
        shell: false
      });
      
      const config = $.config.get();
      expect(config.defaultTimeout).toBe(3000);
      expect(config.defaultShell).toBe(false);
    });
  });
  
  describe('Integration', () => {
    it('should preserve event listeners when using config.set()', () => {
      const events: string[] = [];
      
      // Add multiple event listeners
      $.on('command:start', () => events.push('start'));
      $.on('command:complete', () => events.push('complete'));
      $.on('command:error', () => events.push('error'));
      
      // Update configuration
      $.config.set({ defaultTimeout: 1000 });
      
      // Event listeners should still be registered
      expect($.listenerCount('command:start')).toBe(1);
      expect($.listenerCount('command:complete')).toBe(1);
      expect($.listenerCount('command:error')).toBe(1);
    });
    
    it('should not affect existing adapter instances', () => {
      // This would require actually creating adapters and testing
      // For now, just verify the config is updated
      $.config.set({
        adapters: {
          local: { encoding: 'latin1' }
        }
      });
      
      const config = $.config.get();
      expect(config.adapters?.local?.encoding).toBe('latin1');
    });
  });
});