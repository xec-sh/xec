import { RGBA } from "../lib/colors.js"
import { type Pointer, type RenderLib, resolveRenderLib } from "./native.js"
import { type BorderStyle, type BorderSides, BorderCharArrays } from "../lib/border.js"

import type { TextBuffer } from "./text-buffer.js"

let fbIdCounter = 0

// Pack drawing options into a single u32
// bits 0-3: borderSides, bit 4: shouldFill, bits 5-6: titleAlignment
function packDrawOptions(
  border: boolean | BorderSides[],
  shouldFill: boolean,
  titleAlignment: "left" | "center" | "right",
): number {
  let packed = 0

  if (border === true) {
    packed |= 0b1111 // All sides
  } else if (Array.isArray(border)) {
    if (border.includes("top")) packed |= 0b1000
    if (border.includes("right")) packed |= 0b0100
    if (border.includes("bottom")) packed |= 0b0010
    if (border.includes("left")) packed |= 0b0001
  }

  if (shouldFill) {
    packed |= 1 << 4
  }

  const alignmentMap: Record<string, number> = {
    left: 0,
    center: 1,
    right: 2,
  }
  const alignment = alignmentMap[titleAlignment]
  packed |= alignment << 5

  return packed
}

export class OptimizedBuffer {
  public id: string
  public lib: RenderLib
  private bufferPtr: Pointer
  private buffer: {
    char: Uint32Array
    fg: Float32Array
    bg: Float32Array
    attributes: Uint8Array
  }
  private width: number
  private height: number
  public respectAlpha: boolean = false

  get ptr(): Pointer {
    return this.bufferPtr
  }

  constructor(
    lib: RenderLib,
    ptr: Pointer,
    buffer: {
      char: Uint32Array
      fg: Float32Array
      bg: Float32Array
      attributes: Uint8Array
    },
    width: number,
    height: number,
    options: { respectAlpha?: boolean },
  ) {
    this.id = `fb_${fbIdCounter++}`
    this.lib = lib
    this.respectAlpha = options.respectAlpha || false
    this.width = width
    this.height = height
    this.bufferPtr = ptr
    this.buffer = buffer
  }

  static create(width: number, height: number, options: { respectAlpha?: boolean } = {}): OptimizedBuffer {
    const lib = resolveRenderLib()
    const respectAlpha = options.respectAlpha || false
    return lib.createOptimizedBuffer(width, height, respectAlpha)
  }

  public get buffers(): {
    char: Uint32Array
    fg: Float32Array
    bg: Float32Array
    attributes: Uint8Array
  } {
    return this.buffer
  }

  private coordsToIndex(x: number, y: number): number {
    return y * this.width + x
  }

  public getWidth(): number {
    return this.width
  }

  public getHeight(): number {
    return this.height
  }

  public setRespectAlpha(respectAlpha: boolean): void {
    this.lib.bufferSetRespectAlpha(this.bufferPtr, respectAlpha)
    this.respectAlpha = respectAlpha
  }

  public clear(bg: RGBA = RGBA.fromValues(0, 0, 0, 1), clearChar: string = " "): void {
    this.clearFFI(bg)
  }

  public clearLocal(bg: RGBA = RGBA.fromValues(0, 0, 0, 1), clearChar: string = " "): void {
    this.buffer.char.fill(clearChar.charCodeAt(0))
    this.buffer.attributes.fill(0)

    for (let i = 0; i < this.width * this.height; i++) {
      const index = i * 4

      this.buffer.fg[index] = 1.0
      this.buffer.fg[index + 1] = 1.0
      this.buffer.fg[index + 2] = 1.0
      this.buffer.fg[index + 3] = 1.0

      this.buffer.bg[index] = bg.r
      this.buffer.bg[index + 1] = bg.g
      this.buffer.bg[index + 2] = bg.b
      this.buffer.bg[index + 3] = bg.a
    }
  }

  public setCell(x: number, y: number, char: string, fg: RGBA, bg: RGBA, attributes: number = 0): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return

    const opaqueBg = bg.a === 1.0 ? bg : RGBA.fromValues(bg.r, bg.g, bg.b, bg.a);
    this.lib.bufferSetCellWithAlphaBlending(this.bufferPtr, x, y, char, fg, opaqueBg, attributes);
  }

  public get(x: number, y: number): { char: number; fg: RGBA; bg: RGBA; attributes: number } | null {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null

    const index = this.coordsToIndex(x, y)
    const colorIndex = index * 4

    return {
      char: this.buffer.char[index],
      fg: RGBA.fromArray(this.buffer.fg.slice(colorIndex, colorIndex + 4)),
      bg: RGBA.fromArray(this.buffer.bg.slice(colorIndex, colorIndex + 4)),
      attributes: this.buffer.attributes[index],
    }
  }

  public setCellWithAlphaBlending(
    x: number,
    y: number,
    char: string,
    fg: RGBA,
    bg: RGBA,
    attributes: number = 0,
  ): void {
    this.setCellWithAlphaBlendingFFI(x, y, char, fg, bg, attributes)
  }

  public drawText(
    text: string,
    x: number,
    y: number,
    fg: RGBA,
    bg?: RGBA,
    attributes: number = 0,
    selection?: { start: number; end: number; bgColor?: RGBA; fgColor?: RGBA } | null,
  ): void {
    if (!selection) {
      this.drawTextFFI.call(this, text, x, y, fg, bg, attributes)
      return
    }

    const { start, end } = selection

    let selectionBg: RGBA
    let selectionFg: RGBA

    if (selection.bgColor) {
      selectionBg = selection.bgColor
      selectionFg = selection.fgColor || fg
    } else {
      const defaultBg = bg || RGBA.fromValues(0, 0, 0, 0)
      selectionFg = defaultBg.a > 0 ? defaultBg : RGBA.fromValues(0, 0, 0, 1)
      selectionBg = fg
    }

    if (start > 0) {
      const beforeText = text.slice(0, start)
      this.drawTextFFI.call(this, beforeText, x, y, fg, bg, attributes)
    }

    if (end > start) {
      const selectedText = text.slice(start, end)
      this.drawTextFFI.call(this, selectedText, x + start, y, selectionFg, selectionBg, attributes)
    }

    if (end < text.length) {
      const afterText = text.slice(end)
      this.drawTextFFI.call(this, afterText, x + end, y, fg, bg, attributes)
    }
  }

  public fillRect(x: number, y: number, width: number, height: number, bg: RGBA): void {
    this.fillRectFFI(x, y, width, height, bg)
  }

  public drawFrameBuffer(
    destX: number,
    destY: number,
    frameBuffer: OptimizedBuffer,
    sourceX?: number,
    sourceY?: number,
    sourceWidth?: number,
    sourceHeight?: number,
  ): void {
    this.drawFrameBufferFFI(destX, destY, frameBuffer, sourceX, sourceY, sourceWidth, sourceHeight)
  }

  public drawFrameBufferLocal(
    destX: number,
    destY: number,
    frameBuffer: OptimizedBuffer,
    sourceX?: number,
    sourceY?: number,
    sourceWidth?: number,
    sourceHeight?: number,
  ): void {
    const srcX = sourceX ?? 0
    const srcY = sourceY ?? 0
    const srcWidth = sourceWidth ?? frameBuffer.getWidth()
    const srcHeight = sourceHeight ?? frameBuffer.getHeight()

    if (srcX >= frameBuffer.getWidth() || srcY >= frameBuffer.getHeight()) return
    if (srcWidth === 0 || srcHeight === 0) return

    const clampedSrcWidth = Math.min(srcWidth, frameBuffer.getWidth() - srcX)
    const clampedSrcHeight = Math.min(srcHeight, frameBuffer.getHeight() - srcY)

    const startDestX = Math.max(0, destX)
    const startDestY = Math.max(0, destY)
    const endDestX = Math.min(this.width - 1, destX + clampedSrcWidth - 1)
    const endDestY = Math.min(this.height - 1, destY + clampedSrcHeight - 1)

    if (!frameBuffer.respectAlpha) {
      for (let dY = startDestY; dY <= endDestY; dY++) {
        for (let dX = startDestX; dX <= endDestX; dX++) {
          const relativeDestX = dX - destX
          const relativeDestY = dY - destY
          const sX = srcX + relativeDestX
          const sY = srcY + relativeDestY

          if (sX >= frameBuffer.getWidth() || sY >= frameBuffer.getHeight()) continue

          const destIndex = this.coordsToIndex(dX, dY)
          const srcIndex = frameBuffer.coordsToIndex(sX, sY)

          const destColorIndex = destIndex * 4
          const srcColorIndex = srcIndex * 4

          // Copy character and attributes
          this.buffer.char[destIndex] = frameBuffer.buffer.char[srcIndex]
          this.buffer.attributes[destIndex] = frameBuffer.buffer.attributes[srcIndex]

          // Copy foreground color
          this.buffer.fg[destColorIndex] = frameBuffer.buffer.fg[srcColorIndex]
          this.buffer.fg[destColorIndex + 1] = frameBuffer.buffer.fg[srcColorIndex + 1]
          this.buffer.fg[destColorIndex + 2] = frameBuffer.buffer.fg[srcColorIndex + 2]
          this.buffer.fg[destColorIndex + 3] = frameBuffer.buffer.fg[srcColorIndex + 3]

          // Copy background color
          this.buffer.bg[destColorIndex] = frameBuffer.buffer.bg[srcColorIndex]
          this.buffer.bg[destColorIndex + 1] = frameBuffer.buffer.bg[srcColorIndex + 1]
          this.buffer.bg[destColorIndex + 2] = frameBuffer.buffer.bg[srcColorIndex + 2]
          this.buffer.bg[destColorIndex + 3] = frameBuffer.buffer.bg[srcColorIndex + 3]
        }
      }
      return
    }

    for (let dY = startDestY; dY <= endDestY; dY++) {
      for (let dX = startDestX; dX <= endDestX; dX++) {
        const relativeDestX = dX - destX
        const relativeDestY = dY - destY
        const sX = srcX + relativeDestX
        const sY = srcY + relativeDestY

        if (sX >= frameBuffer.getWidth() || sY >= frameBuffer.getHeight()) continue

        const srcIndex = frameBuffer.coordsToIndex(sX, sY)
        const srcColorIndex = srcIndex * 4

        if (frameBuffer.buffer.bg[srcColorIndex + 3] === 0 && frameBuffer.buffer.fg[srcColorIndex + 3] === 0) {
          continue
        }

        const charCode = frameBuffer.buffer.char[srcIndex]
        const fg: RGBA = RGBA.fromArray(frameBuffer.buffer.fg.slice(srcColorIndex, srcColorIndex + 4))
        const bg: RGBA = RGBA.fromArray(frameBuffer.buffer.bg.slice(srcColorIndex, srcColorIndex + 4))
        const attributes = frameBuffer.buffer.attributes[srcIndex]

        this.setCellWithAlphaBlending(dX, dY, String.fromCharCode(charCode), fg, bg, attributes)
      }
    }
  }

  public destroy(): void {
    this.lib.destroyOptimizedBuffer(this.bufferPtr)
  }

  public drawTextBuffer(
    textBuffer: TextBuffer,
    x: number,
    y: number,
    clipRect?: { x: number; y: number; width: number; height: number },
  ): void {
    // Use native implementation
    this.lib.bufferDrawTextBuffer(this.bufferPtr, textBuffer.ptr, x, y, clipRect)
  }

  public drawSuperSampleBuffer(
    x: number,
    y: number,
    pixelDataPtr: Pointer,
    pixelDataLength: number,
    format: "bgra8unorm" | "rgba8unorm",
    alignedBytesPerRow: number,
  ): void {
    // Prefer FFI for super sample buffer drawing
    this.drawSuperSampleBufferFFI(x, y, pixelDataPtr, pixelDataLength, format, alignedBytesPerRow)
  }

  //
  // FFI
  //

  public drawSuperSampleBufferFFI(
    x: number,
    y: number,
    pixelDataPtr: Pointer,
    pixelDataLength: number,
    format: "bgra8unorm" | "rgba8unorm",
    alignedBytesPerRow: number,
  ): void {
    this.lib.bufferDrawSuperSampleBuffer(
      this.bufferPtr,
      x,
      y,
      pixelDataPtr,
      pixelDataLength,
      format,
      alignedBytesPerRow,
    )
  }

  public drawPackedBuffer(
    dataPtr: Pointer,
    dataLen: number,
    posX: number,
    posY: number,
    terminalWidthCells: number,
    terminalHeightCells: number,
  ): void {
    this.lib.bufferDrawPackedBuffer(
      this.bufferPtr,
      dataPtr,
      dataLen,
      posX,
      posY,
      terminalWidthCells,
      terminalHeightCells,
    )
  }

  public setCellWithAlphaBlendingFFI(
    x: number,
    y: number,
    char: string,
    fg: RGBA,
    bg: RGBA,
    attributes?: number,
  ): void {
    this.lib.bufferSetCellWithAlphaBlending(this.bufferPtr, x, y, char, fg, bg, attributes)
  }

  public fillRectFFI(x: number, y: number, width: number, height: number, bg: RGBA): void {
    this.lib.bufferFillRect(this.bufferPtr, x, y, width, height, bg)
  }

  public resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return

    this.width = width
    this.height = height

    this.buffer = this.lib.bufferResize(this.bufferPtr, width, height)
  }

  public clearFFI(bg: RGBA = RGBA.fromValues(0, 0, 0, 1)): void {
    this.lib.bufferClear(this.bufferPtr, bg)
  }

  public drawTextFFI(
    text: string,
    x: number,
    y: number,
    fg: RGBA = RGBA.fromValues(1.0, 1.0, 1.0, 1.0),
    bg?: RGBA,
    attributes: number = 0,
  ): void {
    this.lib.bufferDrawText(this.bufferPtr, text, x, y, fg, bg, attributes)
  }

  public drawFrameBufferFFI(
    destX: number,
    destY: number,
    frameBuffer: OptimizedBuffer,
    sourceX?: number,
    sourceY?: number,
    sourceWidth?: number,
    sourceHeight?: number,
  ): void {
    this.lib.drawFrameBuffer(this.bufferPtr, destX, destY, frameBuffer.ptr, sourceX, sourceY, sourceWidth, sourceHeight)
  }

  public drawBox(options: {
    x: number
    y: number
    width: number
    height: number
    borderStyle?: BorderStyle
    customBorderChars?: Uint32Array
    border: boolean | BorderSides[]
    borderColor: RGBA
    backgroundColor: RGBA
    shouldFill?: boolean
    title?: string
    titleAlignment?: "left" | "center" | "right"
  }): void {
    const style = options.borderStyle || "single"
    const borderChars: Uint32Array = options.customBorderChars ?? BorderCharArrays[style]

    const packedOptions = packDrawOptions(options.border, options.shouldFill ?? false, options.titleAlignment || "left")

    this.lib.bufferDrawBox(
      this.bufferPtr,
      options.x,
      options.y,
      options.width,
      options.height,
      borderChars,
      packedOptions,
      options.borderColor,
      options.backgroundColor,
      options.title ?? null,
    )
  }
}
