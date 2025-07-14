import { Readable, Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

export interface StreamHandlerOptions {
  encoding?: BufferEncoding;
  maxBuffer?: number;
  onData?: (chunk: string) => void;
  onError?: (error: Error) => void;
}

export class StreamHandler {
  private buffer: Buffer[] = [];
  private totalLength = 0;
  private decoder: StringDecoder;
  private readonly encoding: BufferEncoding;
  private readonly maxBuffer: number;
  private readonly onData?: (chunk: string) => void;
  private readonly onError?: (error: Error) => void;

  constructor(options: StreamHandlerOptions = {}) {
    this.encoding = options.encoding || 'utf8';
    this.decoder = new StringDecoder(this.encoding);
    this.maxBuffer = options.maxBuffer || 1024 * 1024 * 10; // 10MB default
    this.onData = options.onData;
    this.onError = options.onError;
  }

  createTransform(): Transform {
    const self = this;
    
    return new Transform({
      transform(chunk: Buffer, encoding, callback) {
        try {
          if (self.totalLength + chunk.length > self.maxBuffer) {
            callback(new Error(`Stream exceeded maximum buffer size of ${self.maxBuffer} bytes`));
            return;
          }

          self.buffer.push(chunk);
          self.totalLength += chunk.length;

          const str = self.decoder.write(chunk);
          if (self.onData && str) {
            self.onData(str);
          }

          this.push(chunk);
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },

      flush(callback) {
        try {
          const str = self.decoder.end();
          if (self.onData && str) {
            self.onData(str);
          }
          callback();
        } catch (error) {
          callback(error as Error);
        }
      }
    });
  }

  getContent(): string {
    const fullBuffer = Buffer.concat(this.buffer, this.totalLength);
    return fullBuffer.toString(this.encoding);
  }

  getBuffer(): Buffer {
    return Buffer.concat(this.buffer, this.totalLength);
  }

  reset(): void {
    this.buffer = [];
    this.totalLength = 0;
    this.decoder = new StringDecoder(this.encoding);
  }
}

export function createLineTransform(onLine: (line: string) => void): Transform {
  let buffer = '';
  
  return new Transform({
    transform(chunk: Buffer, encoding, callback) {
      const str = chunk.toString();
      buffer += str;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        onLine(line);
      }
      
      this.push(chunk);
      callback();
    },
    
    flush(callback) {
      if (buffer) {
        onLine(buffer);
      }
      callback();
    }
  });
}

export async function streamToString(stream: Readable, encoding: BufferEncoding = 'utf8'): Promise<string> {
  const chunks: Buffer[] = [];
  
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  
  return Buffer.concat(chunks).toString(encoding);
}

export function combineStreams(stdout: Readable, stderr: Readable): Readable {
  const combined = new Readable({
    read() {}
  });

  let stdoutEnded = false;
  let stderrEnded = false;

  function checkEnd() {
    if (stdoutEnded && stderrEnded) {
      combined.push(null);
    }
  }

  function pipeStream(stream: Readable, prefix: string, onEnd: () => void) {
    stream.on('data', (chunk) => {
      combined.push(`[${prefix}] ${chunk}`);
    });

    stream.on('error', (error) => {
      combined.destroy(error);
    });

    stream.on('end', () => {
      onEnd();
      checkEnd();
    });
  }

  pipeStream(stdout, 'stdout', () => { stdoutEnded = true; });
  pipeStream(stderr, 'stderr', () => { stderrEnded = true; });

  return combined;
}