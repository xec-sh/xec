import { Readable, Writable, Transform } from 'stream';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { 
  pipeStreams, 
  collectStream, 
  createInputStream,
  createOutputStream 
} from '../../../src/utils/stream.js';

describe('Stream Utilities Comprehensive Tests', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createOutputStream', () => {
    it('should create output stream that inherits stdout', async () => {
      const stream = createOutputStream('inherit');
      expect(stream).toBe(process.stdout);
    });

    it('should create output stream that inherits stderr', async () => {
      const stream = createOutputStream('inherit', true);
      expect(stream).toBe(process.stderr);
    });

    it('should create piped stream', async () => {
      const stream = createOutputStream('pipe');
      expect(stream).toBeDefined();
      expect(stream.write).toBeDefined();
      expect(stream.end).toBeDefined();
    });

    it('should create null stream', async () => {
      const stream = createOutputStream('ignore');
      expect(stream).toBeDefined();
      
      // Writing to null stream should not throw
      stream.write('test');
      stream.end();
    });

    it('should create custom stream from writable', async () => {
      const chunks: string[] = [];
      const customStream = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk.toString());
          callback();
        }
      });

      const stream = createOutputStream(customStream);
      expect(stream).toBe(customStream);
      
      stream.write('test data');
      stream.end();
      
      await new Promise(resolve => stream.on('finish', resolve));
      expect(chunks).toEqual(['test data']);
    });

    it('should create custom stream from function', async () => {
      const chunks: string[] = [];
      const customFn = (chunk: string) => {
        chunks.push(chunk);
      };

      const stream = createOutputStream(customFn);
      stream.write('test1');
      stream.write('test2');
      stream.end();
      
      await new Promise(resolve => stream.on('finish', resolve));
      expect(chunks).toEqual(['test1', 'test2']);
    });

    it('should create stream from file path', async () => {
      const tmpFile = `/tmp/test-stream-${Date.now()}.txt`;
      const stream = createOutputStream(tmpFile);
      
      stream.write('file content');
      stream.end();
      
      await new Promise(resolve => stream.on('finish', resolve));
      
      // Verify file was created
      const fs = await import('fs');
      const content = fs.readFileSync(tmpFile, 'utf8');
      expect(content).toBe('file content');
      
      // Cleanup
      fs.unlinkSync(tmpFile);
    });
  });

  describe('createInputStream', () => {
    it('should create input stream from string', async () => {
      const stream = createInputStream('test input');
      
      const chunks: string[] = [];
      stream!.on('data', chunk => chunks.push(chunk.toString()));
      
      await new Promise(resolve => stream!.on('end', resolve));
      expect(chunks.join('')).toBe('test input');
    });

    it('should create input stream from Buffer', async () => {
      const buffer = Buffer.from('buffer input');
      const stream = createInputStream(buffer);
      
      const chunks: Buffer[] = [];
      stream!.on('data', chunk => chunks.push(chunk));
      
      await new Promise(resolve => stream!.on('end', resolve));
      expect(Buffer.concat(chunks).toString()).toBe('buffer input');
    });

    it('should create input stream from Readable', async () => {
      const readable = new Readable({
        read() {
          this.push('readable data');
          this.push(null);
        }
      });
      
      const stream = createInputStream(readable);
      expect(stream).toBe(readable);
      
      const chunks: string[] = [];
      stream!.on('data', chunk => chunks.push(chunk.toString()));
      
      await new Promise(resolve => stream!.on('end', resolve));
      expect(chunks.join('')).toBe('readable data');
    });

    it('should handle null input', () => {
      const stream = createInputStream(null);
      expect(stream).toBeNull();
    });

    it('should handle undefined input', () => {
      const stream = createInputStream(undefined);
      expect(stream).toBeUndefined();
    });
  });

  describe('pipeStreams', () => {
    it('should pipe data between streams', async () => {
      const input = new Readable({
        read() {
          this.push('piped data');
          this.push(null);
        }
      });
      
      const chunks: string[] = [];
      const output = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk.toString());
          callback();
        }
      });
      
      pipeStreams(input, output);
      
      await new Promise(resolve => output.on('finish', resolve));
      expect(chunks).toEqual(['piped data']);
    });

    it('should handle transform streams', async () => {
      const input = new Readable({
        read() {
          this.push('hello');
          this.push(null);
        }
      });
      
      const transform = new Transform({
        transform(chunk, encoding, callback) {
          this.push(chunk.toString().toUpperCase());
          callback();
        }
      });
      
      const chunks: string[] = [];
      const output = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk.toString());
          callback();
        }
      });
      
      pipeStreams(input, transform);
      pipeStreams(transform, output);
      
      await new Promise(resolve => output.on('finish', resolve));
      expect(chunks).toEqual(['HELLO']);
    });

    it('should handle errors in pipe', async () => {
      const input = new Readable({
        read() {
          this.emit('error', new Error('Read error'));
        }
      });
      
      const output = new Writable({
        write(chunk, encoding, callback) {
          callback();
        }
      });
      
      const errors: Error[] = [];
      input.on('error', err => errors.push(err));
      
      pipeStreams(input, output);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toBe('Read error');
    });
  });

  describe('collectStream', () => {
    it('should collect stream data into string', async () => {
      const stream = new Readable({
        read() {
          this.push('collected ');
          this.push('data');
          this.push(null);
        }
      });
      
      const result = await collectStream(stream);
      expect(result).toBe('collected data');
    });

    it('should collect stream data with encoding', async () => {
      const stream = new Readable({
        read() {
          this.push(Buffer.from('utf8 data', 'utf8'));
          this.push(null);
        }
      });
      
      const result = await collectStream(stream, 'utf8');
      expect(result).toBe('utf8 data');
    });

    it('should handle empty stream', async () => {
      const stream = new Readable({
        read() {
          this.push(null);
        }
      });
      
      const result = await collectStream(stream);
      expect(result).toBe('');
    });

    it('should handle stream errors', async () => {
      const stream = new Readable({
        read() {
          this.emit('error', new Error('Stream error'));
        }
      });
      
      await expect(collectStream(stream)).rejects.toThrow('Stream error');
    });

    it('should handle large data', async () => {
      const largeData = 'x'.repeat(100000);
      const stream = new Readable({
        read() {
          this.push(largeData);
          this.push(null);
        }
      });
      
      const result = await collectStream(stream);
      expect(result.length).toBe(100000);
      expect(result).toBe(largeData);
    });
  });


  describe('Edge Cases and Error Handling', () => {
    it('should handle circular stream references', () => {
      const stream = new Transform({
        transform(chunk, encoding, callback) {
          this.push(chunk);
          callback();
        }
      });
      
      // This would normally create a circular reference
      expect(() => pipeStreams(stream, stream)).not.toThrow();
    });

    it('should handle destroyed streams', async () => {
      const input = new Readable({
        read() {
          this.push('data');
          this.push(null);
        }
      });
      
      const output = new Writable({
        write(chunk, encoding, callback) {
          callback();
        }
      });
      
      output.destroy();
      
      // Should not throw when piping to destroyed stream
      expect(() => pipeStreams(input, output)).not.toThrow();
    });

    it('should handle backpressure', async () => {
      let writeCount = 0;
      const slowOutput = new Writable({
        highWaterMark: 1,
        write(chunk, encoding, callback) {
          writeCount++;
          // Simulate slow write
          setTimeout(callback, 50);
        }
      });
      
      const fastInput = new Readable({
        read() {
          // Push lots of data quickly
          for (let i = 0; i < 10; i++) {
            if (!this.push(`data${i}`)) {
              break;
            }
          }
          this.push(null);
        }
      });
      
      pipeStreams(fastInput, slowOutput);
      
      await new Promise(resolve => slowOutput.on('finish', resolve));
      
      // All data should eventually be written
      expect(writeCount).toBe(10);
    });
  });
});