import { MeasureMode } from "yoga-layout"

import { RGBA, parseColor } from "../lib/colors.js"
import { TextBuffer } from "../renderer/text-buffer.js"
import { TextSelectionHelper } from "../lib/selection.js"
import { Component, type ComponentProps } from "../component.js"
import { StyledText, stringToStyledText } from "../lib/styled-text.js"

import type { SelectionState } from "../types"
import type { OptimizedBuffer } from "../renderer/buffer.js"

export interface TextProps extends ComponentProps {
  content?: StyledText | string
  fg?: string | RGBA
  bg?: string | RGBA
  selectionBg?: string | RGBA
  selectionFg?: string | RGBA
  selectable?: boolean
  attributes?: number
}

export class TextComponent extends Component {
  public selectable: boolean = true
  private _text: StyledText = stringToStyledText("")
  private _defaultFg: RGBA
  private _defaultBg: RGBA
  private _defaultAttributes: number
  private _selectionBg: RGBA | undefined
  private _selectionFg: RGBA | undefined
  private selectionHelper: TextSelectionHelper

  private textBuffer: TextBuffer
  private _plainText: string = ""
  private _lineInfo: { lineStarts: number[]; lineWidths: number[] } = { lineStarts: [], lineWidths: [] }

  constructor(id: string, options: TextProps) {
    super(id, options)

    this.selectionHelper = new TextSelectionHelper(
      () => this.x,
      () => this.y,
      () => this._plainText.length,
      () => this._lineInfo,
    )

    const content = options.content ?? ""
    this._text = typeof content === "string" ? stringToStyledText(content) : content
    this._defaultFg = options.fg ? parseColor(options.fg) : RGBA.fromValues(1, 1, 1, 1)
    this._defaultBg = options.bg ? parseColor(options.bg) : RGBA.fromValues(0, 0, 0, 0)
    this._defaultAttributes = options.attributes ?? 0
    this._selectionBg = options.selectionBg ? parseColor(options.selectionBg) : undefined
    this._selectionFg = options.selectionFg ? parseColor(options.selectionFg) : undefined
    this.selectable = options.selectable ?? true

    this.textBuffer = TextBuffer.create(64)

    this.textBuffer.setDefaultFg(this._defaultFg)
    this.textBuffer.setDefaultBg(this._defaultBg)
    this.textBuffer.setDefaultAttributes(this._defaultAttributes)

    this.setupMeasureFunc()
    this.updateTextInfo()
  }

  get content(): StyledText {
    return this._text
  }

  set content(value: StyledText | string) {
    this._text = typeof value === "string" ? stringToStyledText(value) : value
    this.updateTextInfo()
  }

  get fg(): RGBA {
    return this._defaultFg
  }

  set fg(value: RGBA | string | undefined) {
    if (value) {
      this._defaultFg = parseColor(value)
      this.textBuffer.setDefaultFg(this._defaultFg)
      this.needsUpdate()
    }
  }

  get bg(): RGBA {
    return this._defaultBg
  }

  set bg(value: RGBA | string | undefined) {
    if (value) {
      this._defaultBg = parseColor(value)
      this.textBuffer.setDefaultBg(this._defaultBg)
      this.needsUpdate()
    }
  }

  get attributes(): number {
    return this._defaultAttributes
  }

  set attributes(value: number) {
    this._defaultAttributes = value
    this.textBuffer.setDefaultAttributes(this._defaultAttributes)
    this.needsUpdate()
  }

  protected onResize(width: number, height: number): void {
    const changed = this.selectionHelper.reevaluateSelection(width, height)
    if (changed) {
      this.syncSelectionToTextBuffer()
      this.needsUpdate()
    }
  }

  private syncSelectionToTextBuffer(): void {
    const selection = this.selectionHelper.getSelection()
    if (selection) {
      this.textBuffer.setSelection(selection.start, selection.end, this._selectionBg, this._selectionFg)
    } else {
      this.textBuffer.resetSelection()
    }
  }

  private updateTextInfo(): void {
    this._plainText = this._text.toString()
    this.updateTextBuffer()

    const lineInfo = this.textBuffer.lineInfo
    this._lineInfo.lineStarts = lineInfo.lineStarts
    this._lineInfo.lineWidths = lineInfo.lineWidths

    const changed = this.selectionHelper.reevaluateSelection(this.width, this.height)
    if (changed) {
      this.syncSelectionToTextBuffer()
    }

    this.layoutNode.yogaNode.markDirty();
    this.needsUpdate();
  }

  private setupMeasureFunc(): void {
    const measureFunc = (
      width: number,
      widthMode: MeasureMode,
      height: number,
      heightMode: MeasureMode,
    ): { width: number; height: number } => {
      const maxLineWidth = Math.max(...this._lineInfo.lineWidths, 0)
      const numLines = this._lineInfo.lineStarts.length || 1

      let measuredWidth = maxLineWidth
      let measuredHeight = numLines

      if (widthMode === MeasureMode.Exactly) {
        measuredWidth = width
      } else if (widthMode === MeasureMode.AtMost) {
        measuredWidth = Math.min(maxLineWidth, width)
      }

      if (heightMode === MeasureMode.Exactly) {
        measuredHeight = height
      } else if (heightMode === MeasureMode.AtMost) {
        measuredHeight = Math.min(numLines, height)
      }

      return {
        width: Math.max(1, measuredWidth),
        height: Math.max(1, measuredHeight),
      }
    }

    this.layoutNode.yogaNode.setMeasureFunc(measureFunc)
  }

  shouldStartSelection(x: number, y: number): boolean {
    return this.selectionHelper.shouldStartSelection(x, y, this.width, this.height)
  }

  onSelectionChanged(selection: SelectionState | null): boolean {
    const changed = this.selectionHelper.onSelectionChanged(selection, this.width, this.height)
    if (changed) {
      this.syncSelectionToTextBuffer()
      this.needsUpdate()
    }
    return this.selectionHelper.hasSelection()
  }

  getSelectedText(): string {
    const selection = this.selectionHelper.getSelection()
    if (!selection) return ""
    return this._plainText.slice(selection.start, selection.end)
  }

  hasSelection(): boolean {
    return this.selectionHelper.hasSelection()
  }

  private updateTextBuffer(): void {
    this.textBuffer.setStyledText(this._text)
  }

  protected renderSelf(buffer: OptimizedBuffer): void {
    if (this.textBuffer.ptr) {
      const clipRect = {
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
      }

      buffer.drawTextBuffer(this.textBuffer, this.x, this.y, clipRect)
    }
  }

  destroy(): void {
    this.textBuffer.destroy()
    super.destroy()
  }
}
