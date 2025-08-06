import { it, expect, describe } from '@jest/globals';

import { LocalAdapter } from '../../../src/adapters/local/index.js';

describe('LocalAdapter - Basic Tests', () => {
  let adapter: LocalAdapter;
  
  beforeEach(() => {
    adapter = new LocalAdapter({});
  });
  
  describe('Availability', () => {
    it('should always be available', async () => {
      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });
  });
  
  describe('executeSync method', () => {
    it('should have executeSync method with override modifier', () => {
      // Just verify the method exists
      expect(adapter.executeSync).toBeDefined();
      expect(typeof adapter.executeSync).toBe('function');
    });
    
    it('should execute simple sync command', () => {
      // Test with a simple command that should work on all platforms
      const result = adapter.executeSync({ 
        command: 'echo',
        args: ['test'],
        shell: true
      });
      
      expect(result).toBeDefined();
      expect(result.exitCode).toBe(0);
      expect(result.adapter).toBe('local');
      expect(result.stdout.trim()).toBe('test');
    });
  });
  
  describe('Basic command execution', () => {
    it('should execute echo command', async () => {
      const result = await adapter.execute({ 
        command: 'echo',
        args: ['Hello from test'],
        shell: true
      });
      
      expect(result.stdout.trim()).toBe('Hello from test');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(result.adapter).toBe('local');
    });
    
    it('should handle commands with environment variables', async () => {
      const result = await adapter.execute({
        command: process.platform === 'win32' ? 'echo %TEST_VAR%' : 'echo $TEST_VAR',
        env: { TEST_VAR: 'test-value' },
        shell: true
      });
      
      expect(result.stdout.trim()).toBe('test-value');
      expect(result.exitCode).toBe(0);
    });
  });
});