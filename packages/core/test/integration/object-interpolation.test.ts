import { it, expect, describe, beforeEach } from '@jest/globals';

import { MockAdapter } from '../../src/adapters/mock/index.js';
import { ExecutionEngine, createCallableEngine } from '../../src/index.js';

describe('Object Interpolation Integration Tests', () => {
  let mockAdapter: MockAdapter;
  let engine: ExecutionEngine;
  let $test: any;
  
  beforeEach(() => {
    // Configure to use mock adapter to avoid actual command execution
    mockAdapter = new MockAdapter();
    engine = new ExecutionEngine();
    engine.registerAdapter('mock', mockAdapter);
    $test = createCallableEngine(engine);
  });

  it('should JSON stringify objects in template literals', async () => {
    const config = { name: 'app', port: 3000 };
    
    // Setup mock response for the expected command
    mockAdapter.mockSuccess('sh -c "echo \'{"name":"app","port":3000}\' > config.json"', 'Success');
    
    const mockEngine = $test.with({ adapter: 'mock' as any });
    const result = await mockEngine.run`echo ${config} > config.json`;
    expect(result.stdout).toBe('Success');
  });

  it('should handle complex objects', async () => {
    const data = {
      users: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ],
      config: { version: '1.0.0' }
    };

    const expectedJSON = JSON.stringify(data);
    mockAdapter.mockSuccess(`sh -c "echo '${expectedJSON}'"`, expectedJSON);

    const mockEngine = $test.with({ adapter: 'mock' as any });
    const result = await mockEngine.run`echo ${data}`;
    expect(result.stdout).toBe(JSON.stringify(data));
  });

  it('should handle Date objects', async () => {
    const date = new Date('2023-12-01T10:30:00.000Z');
    
    mockAdapter.mockSuccess('sh -c "echo \'2023-12-01T10:30:00.000Z\'"', '2023-12-01T10:30:00.000Z');

    const mockEngine = $test.with({ adapter: 'mock' as any });
    const result = await mockEngine.run`echo ${date}`;
    expect(result.stdout).toBe('2023-12-01T10:30:00.000Z');
  });

  it('should handle mixed arrays with objects', async () => {
    const mixed = ['text', 42, { key: 'value' }, true];
    
    mockAdapter.mockSuccess('sh -c "echo text 42 \'{"key":"value"}\' true"', 'processed');

    const mockEngine = $test.with({ adapter: 'mock' as any });
    const result = await mockEngine.run`echo ${mixed}`;
    expect(result.stdout).toBe('processed');
  });
});