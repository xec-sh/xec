import { Renderer } from "../renderer/renderer.js"
import { OptimizedBuffer } from "../renderer/buffer.js"
import { Component, type ComponentProps } from "../component.js"
import { RGBA, parseColor, type ColorInput } from "../lib/colors.js"

import type { ParsedKey } from "../lib/parse.keypress.js"

export interface InputProps extends ComponentProps {
  backgroundColor?: ColorInput
  textColor?: ColorInput
  focusedBackgroundColor?: ColorInput
  focusedTextColor?: ColorInput
  placeholder?: string
  placeholderColor?: ColorInput
  cursorColor?: ColorInput
  maxLength?: number
  value?: string
}

// TODO: make this just plain strings instead of an enum (same for other events)
export enum InputComponentEvents {
  INPUT = "input",
  CHANGE = "change",
  ENTER = "enter",
}

export class InputComponent extends Component {
  protected focusable: boolean = true

  private _value: string = ""
  private _cursorPosition: number = 0
  private _placeholder: string
  private _backgroundColor: RGBA
  private _textColor: RGBA
  private _focusedBackgroundColor: RGBA
  private _focusedTextColor: RGBA
  private _placeholderColor: RGBA
  private _cursorColor: RGBA
  private _maxLength: number
  private _lastCommittedValue: string = ""

  protected _defaultOptions = {
    backgroundColor: "transparent",
    textColor: "#FFFFFF",
    focusedBackgroundColor: "#1a1a1a",
    focusedTextColor: "#FFFFFF",
    placeholder: "",
    placeholderColor: "#666666",
    cursorColor: "#FFFFFF",
    maxLength: 1000,
    value: "",
  } satisfies Partial<InputProps>

  constructor(id: string, options: InputProps) {
    super(id, { ...options, buffered: true })

    this._backgroundColor = parseColor(options.backgroundColor || this._defaultOptions.backgroundColor)
    this._textColor = parseColor(options.textColor || this._defaultOptions.textColor)
    this._focusedBackgroundColor = parseColor(
      options.focusedBackgroundColor || options.backgroundColor || this._defaultOptions.focusedBackgroundColor,
    )
    this._focusedTextColor = parseColor(
      options.focusedTextColor || options.textColor || this._defaultOptions.focusedTextColor,
    )
    this._placeholder = options.placeholder || this._defaultOptions.placeholder
    this._value = options.value || this._defaultOptions.value
    this._lastCommittedValue = this._value
    this._cursorPosition = this._value.length
    this._maxLength = options.maxLength || this._defaultOptions.maxLength

    this._placeholderColor = parseColor(options.placeholderColor || this._defaultOptions.placeholderColor)
    this._cursorColor = parseColor(options.cursorColor || this._defaultOptions.cursorColor)
  }

  private updateCursorPosition(): void {
    if (!this._focused) return

    const contentX = 0
    const contentY = 0
    const contentWidth = this.width

    const maxVisibleChars = contentWidth - 1
    let displayStartIndex = 0

    if (this._cursorPosition >= maxVisibleChars) {
      displayStartIndex = this._cursorPosition - maxVisibleChars + 1
    }

    const cursorDisplayX = this._cursorPosition - displayStartIndex

    if (cursorDisplayX >= 0 && cursorDisplayX < contentWidth) {
      const absoluteCursorX = this.x + contentX + cursorDisplayX + 1
      const absoluteCursorY = this.y + contentY + 1

      Renderer.setCursorPosition(absoluteCursorX, absoluteCursorY, true)
      Renderer.setCursorColor(this._cursorColor)
    }
  }

  public focus(): void {
    super.focus()
    Renderer.setCursorStyle("block", true, this._cursorColor)
    this.updateCursorPosition()
  }

  public blur(): void {
    super.blur()
    Renderer.setCursorPosition(0, 0, false)

    if (this._value !== this._lastCommittedValue) {
      this._lastCommittedValue = this._value
      this.emit(InputComponentEvents.CHANGE, this._value)
    }
  }

  protected renderSelf(buffer: OptimizedBuffer, deltaTime: number): void {
    if (!this.visible || !this.frameBuffer) return

    if (this.isDirty) {
      this.refreshFrameBuffer()
    }
  }

  private refreshFrameBuffer(): void {
    if (!this.frameBuffer) return

    const bgColor = this._focused ? this._focusedBackgroundColor : this._backgroundColor
    this.frameBuffer.clear(bgColor)

    const contentX = 0
    const contentY = 0
    const contentWidth = this.width
    const contentHeight = this.height

    const displayText = this._value || this._placeholder
    const isPlaceholder = !this._value && this._placeholder
    const baseTextColor = this._focused ? this._focusedTextColor : this._textColor
    const textColor = isPlaceholder ? this._placeholderColor : baseTextColor

    const maxVisibleChars = contentWidth - 1
    let displayStartIndex = 0

    if (this._cursorPosition >= maxVisibleChars) {
      displayStartIndex = this._cursorPosition - maxVisibleChars + 1
    }

    const visibleText = displayText.substring(displayStartIndex, displayStartIndex + maxVisibleChars)

    if (visibleText) {
      this.frameBuffer.drawText(visibleText, contentX, contentY, textColor)
    }

    if (this._focused) {
      this.updateCursorPosition()
    }
  }

  public get value(): string {
    return this._value
  }

  public set value(value: string) {
    const newValue = value.substring(0, this._maxLength)
    if (this._value !== newValue) {
      this._value = newValue
      this._cursorPosition = Math.min(this._cursorPosition, this._value.length)
      this.needsUpdate()
      this.updateCursorPosition()
      this.emit(InputComponentEvents.INPUT, this._value)
    }
  }

  public set placeholder(placeholder: string) {
    if (this._placeholder !== placeholder) {
      this._placeholder = placeholder
      this.needsUpdate()
    }
  }

  public set cursorPosition(position: number) {
    const newPosition = Math.max(0, Math.min(position, this._value.length))
    if (this._cursorPosition !== newPosition) {
      this._cursorPosition = newPosition
      this.needsUpdate()
      this.updateCursorPosition()
    }
  }

  private insertText(text: string): void {
    if (this._value.length + text.length > this._maxLength) {
      return
    }

    const beforeCursor = this._value.substring(0, this._cursorPosition)
    const afterCursor = this._value.substring(this._cursorPosition)
    this._value = beforeCursor + text + afterCursor
    this._cursorPosition += text.length
    this.needsUpdate()
    this.updateCursorPosition()
    this.emit(InputComponentEvents.INPUT, this._value)
  }

  private deleteCharacter(direction: "backward" | "forward"): void {
    if (direction === "backward" && this._cursorPosition > 0) {
      const beforeCursor = this._value.substring(0, this._cursorPosition - 1)
      const afterCursor = this._value.substring(this._cursorPosition)
      this._value = beforeCursor + afterCursor
      this._cursorPosition--
      this.needsUpdate()
      this.updateCursorPosition()
      this.emit(InputComponentEvents.INPUT, this._value)
    } else if (direction === "forward" && this._cursorPosition < this._value.length) {
      const beforeCursor = this._value.substring(0, this._cursorPosition)
      const afterCursor = this._value.substring(this._cursorPosition + 1)
      this._value = beforeCursor + afterCursor
      this.needsUpdate()
      this.updateCursorPosition()
      this.emit(InputComponentEvents.INPUT, this._value)
    }
  }

  public handleKeyPress(key: ParsedKey | string): boolean {
    const keyName = typeof key === "string" ? key : key.name
    const keySequence = typeof key === "string" ? key : key.sequence

    switch (keyName) {
      case "left":
        this.cursorPosition = this._cursorPosition - 1
        return true

      case "right":
        this.cursorPosition = this._cursorPosition + 1
        return true

      case "home":
        this.cursorPosition = 0
        return true

      case "end":
        this.cursorPosition = this._value.length
        return true

      case "backspace":
        this.deleteCharacter("backward")
        return true

      case "delete":
        this.deleteCharacter("forward")
        return true

      case "return":
      case "enter":
        if (this._value !== this._lastCommittedValue) {
          this._lastCommittedValue = this._value
          this.emit(InputComponentEvents.CHANGE, this._value)
        }
        this.emit(InputComponentEvents.ENTER, this._value)
        return true

      default:
        if (
          keySequence &&
          keySequence.length === 1 &&
          keySequence.charCodeAt(0) >= 32 &&
          keySequence.charCodeAt(0) <= 126
        ) {
          this.insertText(keySequence)
          return true
        }
        break
    }

    return false
  }

  public set maxLength(maxLength: number) {
    this._maxLength = maxLength
    if (this._value.length > maxLength) {
      this._value = this._value.substring(0, maxLength)
      this.needsUpdate()
    }
  }

  public set backgroundColor(value: ColorInput) {
    const newColor = parseColor(value ?? this._defaultOptions.backgroundColor)
    if (this._backgroundColor !== newColor) {
      this._backgroundColor = newColor
      this.needsUpdate()
    }
  }

  public set textColor(value: ColorInput) {
    const newColor = parseColor(value ?? this._defaultOptions.textColor)
    if (this._textColor !== newColor) {
      this._textColor = newColor
      this.needsUpdate()
    }
  }

  public set focusedBackgroundColor(value: ColorInput) {
    const newColor = parseColor(value ?? this._defaultOptions.focusedBackgroundColor)
    if (this._focusedBackgroundColor !== newColor) {
      this._focusedBackgroundColor = newColor
      this.needsUpdate()
    }
  }

  public set focusedTextColor(value: ColorInput) {
    const newColor = parseColor(value ?? this._defaultOptions.focusedTextColor)
    if (this._focusedTextColor !== newColor) {
      this._focusedTextColor = newColor
      this.needsUpdate()
    }
  }

  public set placeholderColor(value: ColorInput) {
    const newColor = parseColor(value ?? this._defaultOptions.placeholderColor)
    if (this._placeholderColor !== newColor) {
      this._placeholderColor = newColor
      this.needsUpdate()
    }
  }

  public set cursorColor(value: ColorInput) {
    const newColor = parseColor(value ?? this._defaultOptions.cursorColor)
    if (this._cursorColor !== newColor) {
      this._cursorColor = newColor
      this.needsUpdate()
    }
  }

  public updateFromLayout(): void {
    super.updateFromLayout()
    this.updateCursorPosition()
  }

  protected onResize(width: number, height: number): void {
    super.onResize(width, height)
    this.updateCursorPosition()
  }

  protected destroySelf(): void {
    if (this._focused) {
      Renderer.setCursorPosition(0, 0, false)
    }
    super.destroySelf()
  }
}