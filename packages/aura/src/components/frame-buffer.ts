import { OptimizedBuffer } from "../renderer/buffer"
import { Component, type ComponentProps } from "../component"

export interface FrameBufferProps extends ComponentProps {
  width: number
  height: number
  respectAlpha?: boolean
}

export class FrameBufferComponent extends Component {
  public frameBuffer: OptimizedBuffer
  protected respectAlpha: boolean

  constructor(id: string, options: FrameBufferProps) {
    super(id, options)
    this.respectAlpha = options.respectAlpha || false
    this.frameBuffer = OptimizedBuffer.create(options.width, options.height, {
      respectAlpha: this.respectAlpha,
    })
  }

  protected onResize(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid resize dimensions for FrameBufferComponent ${this.id}: ${width}x${height}`)
    }

    this.frameBuffer.resize(width, height)
    super.onResize(width, height)
    this.needsUpdate()
  }

  protected renderSelf(buffer: OptimizedBuffer): void {
    if (!this.visible) return
    buffer.drawFrameBuffer(this.x, this.y, this.frameBuffer)
  }

  protected destroySelf(): void {
    // TODO: framebuffer collides with buffered Renderable, which holds a framebuffer
    // and destroys it if it exists already. Maybe instead of extending FrameBufferComponent,
    // subclasses can use the buffered option on the base renderable instead,
    // then this would become something that takes in an external framebuffer to bring it into layout.
    this.frameBuffer?.destroy()
    super.destroySelf()
  }
}
