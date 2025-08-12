/**
 * Circular buffer implementation for efficient memory management
 * Prevents unbounded growth of input buffers
 */

export interface CircularBufferOptions {
  maxSize?: number; // Maximum buffer size in bytes
  overflowStrategy?: 'drop-oldest' | 'drop-newest' | 'error';
}

export class CircularBuffer {
  private buffer: Buffer;
  private writePos = 0;
  private readPos = 0;
  private size = 0;
  private readonly maxSize: number;
  private readonly overflowStrategy: 'drop-oldest' | 'drop-newest' | 'error';
  
  constructor(options: CircularBufferOptions = {}) {
    this.maxSize = options.maxSize ?? 10 * 1024 * 1024; // 10MB default
    this.overflowStrategy = options.overflowStrategy ?? 'drop-oldest';
    this.buffer = Buffer.alloc(this.maxSize);
  }
  
  /**
   * Write data to the buffer
   */
  write(data: Buffer | Uint8Array): boolean {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    
    if (dataBuffer.length > this.maxSize) {
      if (this.overflowStrategy === 'error') {
        throw new Error(`Data size ${dataBuffer.length} exceeds buffer capacity ${this.maxSize}`);
      }
      // For drop strategies, we can't store data larger than buffer
      return false;
    }
    
    // Check if we have enough space
    const availableSpace = this.maxSize - this.size;
    
    if (dataBuffer.length > availableSpace) {
      switch (this.overflowStrategy) {
        case 'drop-oldest': {
          // Drop oldest data to make room
          const bytesToDrop = dataBuffer.length - availableSpace;
          this.readPos = (this.readPos + bytesToDrop) % this.maxSize;
          this.size -= bytesToDrop;
          break;
        }
          
        case 'drop-newest':
          // Don't write new data if no space
          return false;
          
        case 'error':
          throw new Error(`Buffer overflow: need ${dataBuffer.length} bytes, have ${availableSpace} available`);
          
        default:
          // Should never happen as TypeScript ensures exhaustive switch
          throw new Error(`Unknown overflow strategy: ${this.overflowStrategy}`);
      }
    }
    
    // Write data to buffer (may wrap around)
    let bytesWritten = 0;
    while (bytesWritten < dataBuffer.length) {
      const chunkSize = Math.min(
        dataBuffer.length - bytesWritten,
        this.maxSize - this.writePos
      );
      
      dataBuffer.copy(
        this.buffer,
        this.writePos,
        bytesWritten,
        bytesWritten + chunkSize
      );
      
      this.writePos = (this.writePos + chunkSize) % this.maxSize;
      bytesWritten += chunkSize;
    }
    
    this.size += dataBuffer.length;
    return true;
  }
  
  /**
   * Read data from the buffer
   */
  read(maxBytes?: number): Buffer | null {
    if (this.size === 0) {
      return null;
    }
    
    const bytesToRead = maxBytes ? Math.min(maxBytes, this.size) : this.size;
    const result = Buffer.alloc(bytesToRead);
    
    let bytesRead = 0;
    while (bytesRead < bytesToRead) {
      const chunkSize = Math.min(
        bytesToRead - bytesRead,
        this.maxSize - this.readPos
      );
      
      this.buffer.copy(
        result,
        bytesRead,
        this.readPos,
        this.readPos + chunkSize
      );
      
      this.readPos = (this.readPos + chunkSize) % this.maxSize;
      bytesRead += chunkSize;
    }
    
    this.size -= bytesToRead;
    return result;
  }
  
  /**
   * Peek at data without removing it
   */
  peek(maxBytes?: number): Buffer | null {
    if (this.size === 0) {
      return null;
    }
    
    const bytesToRead = maxBytes ? Math.min(maxBytes, this.size) : this.size;
    const result = Buffer.alloc(bytesToRead);
    
    let bytesRead = 0;
    let tempReadPos = this.readPos;
    
    while (bytesRead < bytesToRead) {
      const chunkSize = Math.min(
        bytesToRead - bytesRead,
        this.maxSize - tempReadPos
      );
      
      this.buffer.copy(
        result,
        bytesRead,
        tempReadPos,
        tempReadPos + chunkSize
      );
      
      tempReadPos = (tempReadPos + chunkSize) % this.maxSize;
      bytesRead += chunkSize;
    }
    
    return result;
  }
  
  /**
   * Get the number of bytes available to read
   */
  get available(): number {
    return this.size;
  }
  
  /**
   * Get the remaining capacity
   */
  get capacity(): number {
    return this.maxSize - this.size;
  }
  
  /**
   * Check if buffer is empty
   */
  get isEmpty(): boolean {
    return this.size === 0;
  }
  
  /**
   * Check if buffer is full
   */
  get isFull(): boolean {
    return this.size === this.maxSize;
  }
  
  /**
   * Clear the buffer
   */
  clear(): void {
    this.readPos = 0;
    this.writePos = 0;
    this.size = 0;
  }
  
  /**
   * Get buffer statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    utilization: number;
    readPos: number;
    writePos: number;
  } {
    return {
      size: this.size,
      maxSize: this.maxSize,
      utilization: this.size / this.maxSize,
      readPos: this.readPos,
      writePos: this.writePos
    };
  }
}