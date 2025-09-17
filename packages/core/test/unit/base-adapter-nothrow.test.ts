import { it, expect, describe } from '@jest/globals';

import { BaseAdapter } from '../../src/adapters/base-adapter.js';

import type { Command } from '../../src/types/command.js';

// Create a concrete implementation for testing
class TestAdapter extends BaseAdapter {
  protected adapterName = 'test';
  
  async isAvailable(): Promise<boolean> {
    return true;
  }
  
  async execute(command: Command): Promise<any> {
    // Not used in this test
    return { stdout: '', stderr: '', exitCode: 0 };
  }
  
  async dispose(): Promise<void> {
    // No-op for testing
  }
  
  // Expose the protected method for testing
  testShouldThrowOnNonZeroExit(command: Command | string, exitCode: number): boolean {
    return this.shouldThrowOnNonZeroExit(command, exitCode);
  }
  
  // Expose config for testing
  getTestConfig() {
    return this.config;
  }
}

describe('BaseAdapter throwOnNonZeroExit configuration', () => {
  it('should respect throwOnNonZeroExit: false in adapter config', () => {
    const adapter = new TestAdapter({ throwOnNonZeroExit: false });
    
    // Test with command object
    const command: Command = { command: 'test', shell: true };
    expect(adapter.testShouldThrowOnNonZeroExit(command, 1)).toBe(false);
    expect(adapter.testShouldThrowOnNonZeroExit(command, 0)).toBe(false);
    
    // Test with string command
    expect(adapter.testShouldThrowOnNonZeroExit('test', 1)).toBe(false);
  });
  
  it('should respect throwOnNonZeroExit: true in adapter config', () => {
    const adapter = new TestAdapter({ throwOnNonZeroExit: true });
    
    // Test with command object
    const command: Command = { command: 'test', shell: true };
    expect(adapter.testShouldThrowOnNonZeroExit(command, 1)).toBe(true);
    expect(adapter.testShouldThrowOnNonZeroExit(command, 0)).toBe(false);
    
    // Test with string command
    expect(adapter.testShouldThrowOnNonZeroExit('test', 1)).toBe(true);
  });
  
  it('should respect command.nothrow when set', () => {
    const adapter = new TestAdapter({ throwOnNonZeroExit: true });
    
    // Command with nothrow: true should not throw
    const nothrowCommand: Command = { command: 'test', shell: true, nothrow: true };
    expect(adapter.testShouldThrowOnNonZeroExit(nothrowCommand, 1)).toBe(false);
    
    // Command with nothrow: false should throw
    const throwCommand: Command = { command: 'test', shell: true, nothrow: false };
    expect(adapter.testShouldThrowOnNonZeroExit(throwCommand, 1)).toBe(true);
  });
  
  it('should handle false value for throwOnNonZeroExit correctly', () => {
    // This tests the specific fix for the ?? operator issue
    const config = { throwOnNonZeroExit: false };
    const adapter = new TestAdapter(config);
    
    // Verify the config was set correctly
    expect(adapter.getTestConfig().throwOnNonZeroExit).toBe(false);
    
    // Verify behavior
    const command: Command = { command: 'test', shell: true };
    expect(adapter.testShouldThrowOnNonZeroExit(command, 1)).toBe(false);
  });
});