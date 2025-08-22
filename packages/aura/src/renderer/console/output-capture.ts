import { Writable } from "stream"
import { EventEmitter } from "events"

export type CapturedOutput = {
  stream: "stdout" | "stderr"
  output: string
}

export class Capture extends EventEmitter {
  // Optimized with Buffer to avoid expensive join() operations
  private buffer: Buffer
  private position: number = 0
  private outputCount: number = 0
  private readonly initialSize: number

  constructor(initialSize: number = 4096) {
    super()
    this.initialSize = initialSize
    this.buffer = Buffer.allocUnsafe(initialSize)
  }

  get size(): number {
    return this.outputCount
  }

  write(stream: "stdout" | "stderr", data: string): void {
    const bytes = Buffer.from(data, 'utf8')
    this.ensureCapacity(bytes.length)
    bytes.copy(this.buffer, this.position)
    this.position += bytes.length
    this.outputCount++
    this.emit("write", stream, data)
  }

  private ensureCapacity(bytesNeeded: number): void {
    if (this.position + bytesNeeded > this.buffer.length) {
      // Grow buffer exponentially for better amortized performance
      const newSize = Math.max(this.buffer.length * 2, this.position + bytesNeeded)
      const newBuffer = Buffer.allocUnsafe(newSize)
      this.buffer.copy(newBuffer, 0, 0, this.position)
      this.buffer = newBuffer
    }
  }

  claimOutput(): string {
    const output = this.buffer.toString('utf8', 0, this.position)
    this.clear()
    return output
  }

  private clear(): void {
    this.position = 0
    this.outputCount = 0
    // Reset buffer size if it grew too large
    if (this.buffer.length > this.initialSize * 4) {
      this.buffer = Buffer.allocUnsafe(this.initialSize)
    }
  }
}

export class CapturedWritableStream extends Writable {
  public isTTY: boolean = true
  public columns: number = process.stdout.columns || 80
  public rows: number = process.stdout.rows || 24

  constructor(
    private stream: "stdout" | "stderr",
    private capture: Capture,
  ) {
    super()
  }

  override _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const data = chunk.toString()
    this.capture.write(this.stream, data)
    callback()
  }

  getColorDepth(): number {
    return process.stdout.getColorDepth?.() || 8
  }
}
