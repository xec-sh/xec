import { $, MockAdapter } from '@xec/ush';

import { Xec } from '../../src/xec.js';
import { Host } from '../../src/inventory/host.js';
import { Group } from '../../src/inventory/group.js';
import { MockSSHClient } from '../../src/core/mock-ssh-client.js';

export function createTestXec() {
  return new Xec({
    logLevel: 'error',
    dryRun: true
  });
}

export function createTestHost(overrides?: Partial<Host>) {
  return new Host({
    hostname: 'test-host',
    ip: '127.0.0.1',
    port: 22,
    username: 'test-user',
    privateKeyPath: '/path/to/key',
    ...overrides
  });
}

export function createTestGroup(name = 'test-group', hosts: Host[] = []) {
  const group = new Group(name);
  hosts.forEach(host => group.addHost(host));
  return group;
}

/**
 * @deprecated Use createMockAdapter instead
 */
export function createMockSSHClient(commandMocks?: Record<string, any>) {
  return new MockSSHClient(commandMocks);
}

export function createMockAdapter(commandResults?: Record<string, { stdout?: string; stderr?: string; exitCode?: number }>) {
  const mockAdapter = new MockAdapter();

  if (commandResults) {
    Object.entries(commandResults).forEach(([command, result]) => {
      mockAdapter.addMockResponse(command, {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode ?? 0,
        duration: 0,
        command,
        killed: false,
        signal: null
      });
    });
  }

  return mockAdapter;
}

export function createMockExecutionEngine() {
  // Create a mock adapter and register it with $
  const mockAdapter = new MockAdapter();
  $.registerAdapter('mock', mockAdapter);
  
  // Return $ configured to use the mock adapter
  return $.with({ adapter: 'mock' });
}

export function setupTestEnvironment() {
  // Set NODE_ENV to test
  process.env['NODE_ENV'] = 'test';

  // Return cleanup function
  return () => {
    delete process.env['NODE_ENV'];
  };
}