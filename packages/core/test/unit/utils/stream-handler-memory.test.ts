import { Readable } from 'node:stream';
import { it, jest, expect, describe } from '@jest/globals';

import { StreamHandler } from '../../../src/utils/stream.js';

describe('StreamHandler Memory Management', () => {
  describe('Buffer cleanup', () => {
    it('should clean up buffers on reset', () => {
      const handler = new StreamHandler({ maxBuffer: 1024 });
      const transform = handler.createTransform();

      // Write some data
      const testData = Buffer.from('test data');
      transform.write(testData);

      expect(handler.getContent()).toBe('test data');

      // Reset should clear buffers
      handler.reset();
      expect(handler.getContent()).toBe('');
      expect(handler.getBuffer().length).toBe(0);
    });

    it('should clean up buffers on dispose', () => {
      const handler = new StreamHandler({ maxBuffer: 1024 });
      const transform = handler.createTransform();

      // Write some data
      transform.write(Buffer.from('test data'));
      expect(handler.getContent()).toBe('test data');

      // Dispose should clear everything
      handler.dispose();
      expect(handler.getContent()).toBe('');
      expect(handler.getBuffer().length).toBe(0);
    });

    it('should prevent operations after dispose', () => {
      const handler = new StreamHandler({ maxBuffer: 1024 });
      handler.dispose();

      // Operations after dispose should return empty/safe values
      expect(handler.getContent()).toBe('');
      expect(handler.getBuffer().length).toBe(0);

      // Reset after dispose should be safe
      handler.reset();
      expect(handler.getContent()).toBe('');
    });

    it('should clean up on transform error', async () => {
      const onError = jest.fn();
      const handler = new StreamHandler({
        maxBuffer: 10, // Very small buffer
        onError
      });

      const transform = handler.createTransform();

      // Consume the readable side
      transform.resume();

      // Write data that exceeds buffer
      const largeData = Buffer.alloc(20, 'x');

      await new Promise<void>((resolve, reject) => {
        transform.on('error', (err) => {
          expect(err.message).toContain('exceeded maximum buffer size');
          expect(onError).toHaveBeenCalledWith(err);

          // After error, buffers should be cleared
          expect(handler.getContent()).toBe('');
          expect(handler.getBuffer().length).toBe(0);
          resolve();
        });

        transform.write(largeData);
      });
    });

    it('should keep buffers after flush for later access', async () => {
      const handler = new StreamHandler();
      const transform = handler.createTransform();

      // Consume the readable side so the stream can finish
      transform.resume();

      transform.write(Buffer.from('test'));

      await new Promise<void>((resolve) => {
        transform.end(() => {
          // After flush, buffers should still be available for getContent()
          expect(handler.getContent()).toBe('test');
          expect(handler.getBuffer().length).toBe(4);
          resolve();
        });
      });
    });

    it('should clean up when explicitly disposed', async () => {
      const handler = new StreamHandler();
      const transform = handler.createTransform();

      // Consume the readable side
      transform.resume();

      transform.write(Buffer.from('test data'));
      transform.end();

      // Wait for stream to finish
      await new Promise<void>((resolve) => {
        transform.on('finish', resolve);
      });

      // Before dispose, content should be available
      expect(handler.getContent()).toBe('test data');

      // After explicit dispose, buffers should be cleared
      handler.dispose();
      expect(handler.getContent()).toBe('');
      expect(handler.getBuffer().length).toBe(0);
    });
  });

  describe('Memory limits', () => {
    it('should enforce max buffer size', async () => {
      const handler = new StreamHandler({ maxBuffer: 100 });
      const transform = handler.createTransform();

      const errorPromise = new Promise<Error>((resolve) => {
        transform.on('error', resolve);
      });

      // Try to write more than max buffer
      const largeData = Buffer.alloc(150, 'x');
      transform.write(largeData);

      const error = await errorPromise;
      expect(error.message).toContain('exceeded maximum buffer size');

      // Buffers should be cleared after error
      expect(handler.getBuffer().length).toBe(0);
    });

    it('should accumulate data up to max buffer', () => {
      const handler = new StreamHandler({ maxBuffer: 1024 });
      const transform = handler.createTransform();

      // Write data in chunks
      for (let i = 0; i < 10; i++) {
        transform.write(Buffer.from(`chunk${i}`));
      }

      const content = handler.getContent();
      expect(content).toContain('chunk0');
      expect(content).toContain('chunk9');
    });
  });

  describe('Stream lifecycle', () => {
    it('should handle multiple transforms from same handler', () => {
      const handler = new StreamHandler();

      const transform1 = handler.createTransform();
      const transform2 = handler.createTransform();

      transform1.write(Buffer.from('data1'));
      transform2.write(Buffer.from('data2'));

      // Both transforms share the same handler buffer
      const content = handler.getContent();
      expect(content).toContain('data1');
      expect(content).toContain('data2');
    });

    it('should handle disposal during active streaming', async () => {
      const handler = new StreamHandler();
      const transform = handler.createTransform();

      // Consume the readable side
      transform.resume();

      const readable = Readable.from(['chunk1', 'chunk2', 'chunk3']);

      // Dispose immediately before piping to ensure error on first chunk
      handler.dispose();
      readable.pipe(transform);

      await new Promise((resolve) => {
        transform.on('error', (err) => {
          expect(err.message).toContain('StreamHandler has been disposed');
          resolve(undefined);
        });
        // If no error, resolve on finish (shouldn't happen)
        transform.on('finish', resolve);
      });

      // After disposal, getContent should return empty string
      expect(handler.getContent()).toBe('');
    });

    it('should handle concurrent operations safely', async () => {
      const handler = new StreamHandler();
      const transform = handler.createTransform();

      // Consume the readable side
      transform.resume();

      const operations = [];

      // Concurrent writes
      for (let i = 0; i < 10; i++) {
        operations.push(
          new Promise<void>((resolve) => {
            setTimeout(() => {
              transform.write(Buffer.from(`data${i}`), () => resolve());
            }, Math.random() * 10);
          })
        );
      }

      // Concurrent reads
      for (let i = 0; i < 5; i++) {
        operations.push(
          new Promise<void>((resolve) => {
            setTimeout(() => {
              const content = handler.getContent();
              expect(content).toBeDefined();
              resolve();
            }, Math.random() * 10);
          })
        );
      }

      // Reset in the middle
      operations.push(
        new Promise<void>((resolve) => {
          setTimeout(() => {
            handler.reset();
            resolve();
          }, 5);
        })
      );

      await Promise.all(operations);

      // No crashes, handler should still be functional
      transform.write(Buffer.from('final'));
      expect(handler.getContent()).toBeDefined();
    });
  });

  describe('Encoding handling', () => {
    it('should handle different encodings properly', () => {
      const handler = new StreamHandler({ encoding: 'base64' });
      const transform = handler.createTransform();

      const data = Buffer.from('Hello, World!');
      transform.write(data);

      const content = handler.getContent();
      expect(content).toBe(data.toString('base64'));
    });

    it('should reset decoder on reset', () => {
      const handler = new StreamHandler({ encoding: 'utf8' });
      const transform = handler.createTransform();

      // Write partial UTF-8 sequence
      const partialUtf8 = Buffer.from([0xE2, 0x82]); // Partial Euro sign
      transform.write(partialUtf8);

      // Reset should clear decoder state
      handler.reset();

      // Write complete sequence
      transform.write(Buffer.from('Hello'));
      expect(handler.getContent()).toBe('Hello');
    });
  });

  describe('Callback handling', () => {
    it('should call onData callback with chunks', async () => {
      const onData = jest.fn();
      const handler = new StreamHandler({ onData });
      const transform = handler.createTransform();

      transform.write(Buffer.from('chunk1'));
      transform.write(Buffer.from('chunk2'));

      expect(onData).toHaveBeenCalledTimes(2);
      expect(onData).toHaveBeenCalledWith('chunk1');
      expect(onData).toHaveBeenCalledWith('chunk2');
    });

    it('should call onError callback on errors', async () => {
      const onError = jest.fn();
      const handler = new StreamHandler({
        maxBuffer: 10,
        onError
      });

      const transform = handler.createTransform();

      // Consume the readable side
      transform.resume();

      await new Promise<void>((resolve) => {
        transform.on('error', () => resolve());
        transform.write(Buffer.alloc(20));
      });

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    });

    it('should not call callbacks after dispose', () => {
      const onData = jest.fn();
      const onError = jest.fn();
      const handler = new StreamHandler({ onData, onError });
      const transform = handler.createTransform();

      handler.dispose();

      // Writes after dispose should error but not call callbacks
      transform.on('error', () => {
        // Error is expected
      });

      transform.write(Buffer.from('test'));

      // Give time for any async operations
      return new Promise(resolve => setTimeout(resolve, 10)).then(() => {
        expect(onData).not.toHaveBeenCalled();
      });
    });
  });

  describe('Performance and memory pressure', () => {
    it('should handle large amounts of data efficiently', async () => {
      const handler = new StreamHandler({ maxBuffer: 1024 * 1024 }); // 1MB
      const transform = handler.createTransform();

      // Consume the readable side
      transform.resume();

      // Write 100KB of data in 1KB chunks
      const chunkSize = 1024;
      const numChunks = 100;

      // Write data and wait for all chunks to be processed
      for (let i = 0; i < numChunks; i++) {
        const chunk = Buffer.alloc(chunkSize, i % 256);
        const canContinue = transform.write(chunk);

        // If backpressure, wait for drain
        if (!canContinue) {
          await new Promise(resolve => transform.once('drain', resolve));
        }
      }

      // Give transform a chance to process final chunks
      await new Promise(resolve => setImmediate(resolve));

      const buffer = handler.getBuffer();
      expect(buffer.length).toBe(chunkSize * numChunks);

      // Clean up
      handler.dispose();
      expect(handler.getBuffer().length).toBe(0);
    });

    it('should measure memory usage before and after cleanup', () => {
      const handler = new StreamHandler({ maxBuffer: 10 * 1024 * 1024 }); // 10MB
      const transform = handler.createTransform();

      // Write 5MB of data
      const largeData = Buffer.alloc(5 * 1024 * 1024, 'x');
      transform.write(largeData);

      const beforeCleanup = handler.getBuffer().length;
      expect(beforeCleanup).toBe(5 * 1024 * 1024);

      // Cleanup should free memory
      handler.reset();

      const afterCleanup = handler.getBuffer().length;
      expect(afterCleanup).toBe(0);

      // Dispose for final cleanup
      handler.dispose();
      expect(handler.getBuffer().length).toBe(0);
    });
  });
});