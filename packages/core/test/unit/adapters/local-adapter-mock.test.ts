import { it, expect, describe, beforeEach } from '@jest/globals';

import { LocalAdapter } from '../../../src/adapters/local/index.js';

describe('LocalAdapter - Mock Tests', () => {
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
  
  describe('Simple command execution', () => {
    it('should execute simple commands', async () => {
      // Use real command execution with a simple echo
      const result = await adapter.execute({ 
        command: 'echo',
        args: ['Hello, World!']
      });
      
      expect(result.stdout.trim()).toBe('Hello, World!');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(result.adapter).toBe('local');
    });
  });
  
  describe('Configuration options', () => {
    it('should respect uid and gid options', async () => {
      // Only test configuration creation, not actual execution with uid/gid
      // as that requires elevated privileges
      const adapterWithUid = new LocalAdapter({
        uid: 1000,
        gid: 1000
      });
      
      expect(adapterWithUid).toBeDefined();
      expect(adapterWithUid.isAvailable()).resolves.toBe(true);
    });
    
    it('should use custom kill signal configuration', async () => {
      const adapterWithSignal = new LocalAdapter({
        killSignal: 'SIGKILL'
      });
      
      expect(adapterWithSignal).toBeDefined();
      expect(adapterWithSignal.isAvailable()).resolves.toBe(true);
    });
  });
  
  describe('executeSync method', () => {
    it('should have executeSync method', () => {
      expect(adapter.executeSync).toBeDefined();
      expect(typeof adapter.executeSync).toBe('function');
    });
    
    it('should execute sync commands', () => {
      const result = adapter.executeSync({
        command: 'echo',
        args: ['sync test']
      });
      
      expect(result.stdout.trim()).toBe('sync test');
      expect(result.exitCode).toBe(0);
      expect(result.adapter).toBe('local');
    });
  });
});