import { test, expect, describe } from '@jest/globals';

import { ProcessInfo } from '../../../src/utils/process-utils';

describe('process-utils', () => {
  describe('ProcessInfo interface', () => {
    test('should accept valid ProcessInfo objects', () => {
      const processInfo: ProcessInfo = {
        pid: 1234,
        ppid: 1000,
        command: 'node test.js',
        cpu: 25.5,
        memory: 1024
      };
      
      expect(processInfo.pid).toBe(1234);
      expect(processInfo.ppid).toBe(1000);
      expect(processInfo.command).toBe('node test.js');
      expect(processInfo.cpu).toBe(25.5);
      expect(processInfo.memory).toBe(1024);
    });
    
    test('should accept ProcessInfo without optional fields', () => {
      const processInfo: ProcessInfo = {
        pid: 5678,
        ppid: 2000,
        command: 'npm run test'
      };
      
      expect(processInfo.pid).toBe(5678);
      expect(processInfo.ppid).toBe(2000);
      expect(processInfo.command).toBe('npm run test');
      expect(processInfo.cpu).toBeUndefined();
      expect(processInfo.memory).toBeUndefined();
    });
  });
});