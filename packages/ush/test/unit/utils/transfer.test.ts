import { it, expect, describe } from '@jest/globals';

import { TransferEngine } from '../../../src/utils/transfer.js';
import { ExecutionEngine, createCallableEngine } from '../../../src/index.js';

describe('Transfer Utils', () => {
  const engine = new ExecutionEngine();
  const $ = createCallableEngine(engine);

  describe('TransferEngine', () => {
    describe('parseEnvironment', () => {
      it('should parse local paths', () => {
        const transfer = new TransferEngine($);

        // @ts-ignore - accessing private method for testing
        const env = transfer.parseEnvironment('/home/user/file.txt');

        expect(env.type).toBe('local');
        expect(env.path).toBe('/home/user/file.txt');
      });

      it('should parse SSH URLs', () => {
        const transfer = new TransferEngine($);

        // @ts-ignore - accessing private method for testing
        const env = transfer.parseEnvironment('ssh://user@host/path/to/file');

        expect(env.type).toBe('ssh');
        expect(env.user).toBe('user');
        expect(env.host).toBe('host');
        expect(env.path).toBe('/path/to/file');
      });

      it('should parse Docker URLs', () => {
        const transfer = new TransferEngine($);

        // @ts-ignore - accessing private method for testing
        const env = transfer.parseEnvironment('docker://mycontainer:/app/file.txt');

        expect(env.type).toBe('docker');
        expect(env.container).toBe('mycontainer');
        expect(env.path).toBe('/app/file.txt');
      });

      it('should handle SSH URLs without user', () => {
        const transfer = new TransferEngine($);

        // @ts-ignore - accessing private method for testing
        const env = transfer.parseEnvironment('ssh://host/path');

        expect(env.type).toBe('ssh');
        expect(env.user).toBeUndefined();
        expect(env.host).toBe('host');
        expect(env.path).toBe('/path');
      });

      it('should handle Docker URLs with root path', () => {
        const transfer = new TransferEngine($);

        // @ts-ignore - accessing private method for testing
        const env = transfer.parseEnvironment('docker://container:/');

        expect(env.type).toBe('docker');
        expect(env.container).toBe('container');
        expect(env.path).toBe('/');
      });
    });

    describe('API', () => {
      it('should expose copy method', () => {
        expect($.transfer.copy).toBeDefined();
        expect(typeof $.transfer.copy).toBe('function');
      });

      it('should expose move method', () => {
        expect($.transfer.move).toBeDefined();
        expect(typeof $.transfer.move).toBe('function');
      });

      it('should expose sync method', () => {
        expect($.transfer.sync).toBeDefined();
        expect(typeof $.transfer.sync).toBe('function');
      });
    });
  });
});