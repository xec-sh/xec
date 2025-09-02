import { useTheme } from "../theme/context.js"
import { OptimizedBuffer } from "../renderer/buffer.js"
import { RGBA, parseColor, type Color } from "../lib/colors.js"
import { Component, type ComponentProps } from "../component.js"
import { nextWordEndCrossLines, previousWordStartCrossLines } from "../lib/word-jumps.js"

// InputTheme import removed - using global theme only
import type { ParsedKey, RenderContext } from "../types.js"

export interface InputProps extends ComponentProps {
  // Color properties - can be theme tokens or direct colors
  backgroundColor?: Color
  textColor?: Color
  focusedBackgroundColor?: Color
  focusedTextColor?: Color
  placeholder?: string
  placeholderColor?: Color
  cursorColor?: Color
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
  private _disabledBackgroundColor?: RGBA
  private _disabledTextColor?: RGBA
  // Theme prop removed - using global theme
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

  constructor(ctx: RenderContext, options: InputProps) {
    super(ctx, { ...options, buffered: true })

    // Get theme and resolve colors
    const theme = useTheme()

    // Remove theme prop - use global theme instead

    // Resolve colors from props or theme defaults
    const inputTheme = theme.components?.input

    // Helper function to resolve color
    const resolveColorValue = (value: Color | undefined, fallback?: string): RGBA => {
      if (value) {
        try {
          return theme.resolveColor(value)
        } catch {
          return parseColor(value)
        }
      }
      return parseColor(fallback || this._defaultOptions.backgroundColor)
    }

    // Resolve colors from props with theme fallbacks
    this._backgroundColor = resolveColorValue(
      options.backgroundColor,
      inputTheme?.background ? theme.resolveColor(inputTheme.background).toHex() : this._defaultOptions.backgroundColor
    )

    this._textColor = resolveColorValue(
      options.textColor,
      inputTheme?.foreground ? theme.resolveColor(inputTheme.foreground).toHex() : this._defaultOptions.textColor
    )

    // Resolve focused state colors
    this._focusedBackgroundColor = resolveColorValue(
      options.focusedBackgroundColor || options.backgroundColor,
      inputTheme?.states?.focused?.background
        ? theme.resolveColor(inputTheme.states.focused.background).toHex()
        : this._defaultOptions.focusedBackgroundColor
    )

    this._focusedTextColor = resolveColorValue(
      options.focusedTextColor || options.textColor,
      inputTheme?.states?.focused?.foreground
        ? theme.resolveColor(inputTheme.states.focused.foreground).toHex()
        : this._defaultOptions.focusedTextColor
    )

    // Resolve placeholder and cursor colors
    this._placeholderColor = resolveColorValue(
      options.placeholderColor,
      inputTheme?.placeholder ? theme.resolveColor(inputTheme.placeholder).toHex() : this._defaultOptions.placeholderColor
    )

    this._cursorColor = resolveColorValue(
      options.cursorColor,
      inputTheme?.cursor ? theme.resolveColor(inputTheme.cursor).toHex() : this._defaultOptions.cursorColor
    )

    // Resolve disabled state colors
    this._disabledBackgroundColor = inputTheme?.states?.disabled?.background
      ? theme.resolveColor(inputTheme.states.disabled.background)
      : undefined

    this._disabledTextColor = inputTheme?.states?.disabled?.foreground
      ? theme.resolveColor(inputTheme.states.disabled.foreground)
      : undefined


    this._placeholder = options.placeholder || this._defaultOptions.placeholder
    this._value = options.value || this._defaultOptions.value
    this._lastCommittedValue = this._value
    this._cursorPosition = this._value.length
    this._maxLength = options.maxLength || this._defaultOptions.maxLength
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

      this._ctx.setCursorPosition(absoluteCursorX, absoluteCursorY, true)
      this._ctx.setCursorColor(this._cursorColor)
    }
  }

  public focus(): void {
    super.focus()
    this._ctx.setCursorStyle("block", true)
    this._ctx.setCursorColor(this._cursorColor)
    this.updateCursorPosition()
  }

  public blur(): void {
    super.blur()
    this._ctx.setCursorPosition(0, 0, false)

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

    // Apply state-based colors
    let bgColor = this._backgroundColor
    if (this._disabled) {
      bgColor = this._disabledBackgroundColor || this._backgroundColor
    } else if (this._focused) {
      bgColor = this._focusedBackgroundColor
    }

    this.frameBuffer.clear(bgColor)

    const contentX = 0
    const contentY = 0
    const contentWidth = this.width
    const contentHeight = this.height

    const displayText = this._value || this._placeholder
    const isPlaceholder = !this._value && this._placeholder
    let baseTextColor = this._textColor
    if (this._disabled) {
      baseTextColor = this._disabledTextColor || this._textColor
    } else if (this._focused) {
      baseTextColor = this._focusedTextColor
    }
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
      this.requestRender()
      this.updateCursorPosition()
      this.emit(InputComponentEvents.INPUT, this._value)
    }
  }

  public set placeholder(placeholder: string) {
    if (this._placeholder !== placeholder) {
      this._placeholder = placeholder
      this.requestRender()
    }
  }

  public set cursorPosition(position: number) {
    const newPosition = Math.max(0, Math.min(position, this._value.length))
    if (this._cursorPosition !== newPosition) {
      this._cursorPosition = newPosition
      this.requestRender()
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
    this.requestRender()
    this.updateCursorPosition()
    this.emit(InputComponentEvents.INPUT, this._value)
  }

  private deleteCharacter(direction: "backward" | "forward"): void {
    if (direction === "backward" && this._cursorPosition > 0) {
      const beforeCursor = this._value.substring(0, this._cursorPosition - 1)
      const afterCursor = this._value.substring(this._cursorPosition)
      this._value = beforeCursor + afterCursor
      this._cursorPosition--
      this.requestRender()
      this.updateCursorPosition()
      this.emit(InputComponentEvents.INPUT, this._value)
    } else if (direction === "forward" && this._cursorPosition < this._value.length) {
      const beforeCursor = this._value.substring(0, this._cursorPosition)
      const afterCursor = this._value.substring(this._cursorPosition + 1)
      this._value = beforeCursor + afterCursor
      this.requestRender()
      this.updateCursorPosition()
      this.emit(InputComponentEvents.INPUT, this._value)
    }
  }

  public handleKeyPress(key: ParsedKey | string): boolean {
    // Don't handle keyboard input when disabled
    if (this._disabled) return false

    const isParsedKey = typeof key !== "string"
    const keyName = isParsedKey ? key.name : key

    // Check for modifier keys (only available for ParsedKey)
    const hasCtrl = isParsedKey ? (key.ctrl || false) : false
    const hasMeta = isParsedKey ? (key.meta || false) : false
    const hasOption = isParsedKey ? (key.option || false) : false
    const hasShift = isParsedKey ? (key.shift || false) : false

    // Cmd/Ctrl + Left/Right for start/end of line (VSCode style)
    if ((hasCtrl || hasMeta) && !hasOption) {
      switch (keyName) {
        case "left":
        case "home":  // Some terminals send home for Cmd+Left
          this.cursorPosition = 0
          return true
        case "right":
        case "end":   // Some terminals send end for Cmd+Right
          this.cursorPosition = this._value.length
          return true
        default:
          break
      }
    }

    // Option/Alt + Left/Right for word jumps (VSCode style)
    if (hasOption && !hasCtrl && !hasMeta) {
      switch (keyName) {
        case "left": {
          // Jump to start of previous word
          const prevWordStart = previousWordStartCrossLines(this._value, this._cursorPosition)
          this.cursorPosition = prevWordStart
          return true
        }
        case "right": {
          // Jump to end of next word
          const nextWordEnd = nextWordEndCrossLines(this._value, this._cursorPosition)
          this.cursorPosition = nextWordEnd
          return true
        }
        default:
          break
      }
    }

    // Option/Alt + Backspace to delete word backward
    if (hasOption && keyName === "backspace") {
      const prevWordStart = previousWordStartCrossLines(this._value, this._cursorPosition)
      const beforeWord = this._value.substring(0, prevWordStart)
      const afterCursor = this._value.substring(this._cursorPosition)
      this._value = beforeWord + afterCursor
      this._cursorPosition = prevWordStart
      this.requestRender()
      this.updateCursorPosition()
      this.emit(InputComponentEvents.INPUT, this._value)
      return true
    }

    // Option/Alt + Delete to delete word forward
    if (hasOption && keyName === "delete") {
      const nextWordEnd = nextWordEndCrossLines(this._value, this._cursorPosition)
      const beforeCursor = this._value.substring(0, this._cursorPosition)
      const afterWord = this._value.substring(nextWordEnd)
      this._value = beforeCursor + afterWord
      this.requestRender()
      this.updateCursorPosition()
      this.emit(InputComponentEvents.INPUT, this._value)
      return true
    }

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

      default: {
        // Only insert text if no modifier keys are pressed (except shift which is OK for uppercase)
        // For ParsedKey, use the sequence which contains the actual character
        // For string input, use the string itself
        const charToInsert = isParsedKey ? key.sequence : key

        if (
          charToInsert &&
          charToInsert.length === 1 &&
          charToInsert.charCodeAt(0) >= 32 &&
          charToInsert.charCodeAt(0) <= 126 &&
          !hasCtrl &&
          !hasMeta &&
          !hasOption
        ) {
          // The character is already in the correct case from key.sequence
          this.insertText(charToInsert)
          return true
        }
        break
      }
    }

    return false
  }

  public set maxLength(maxLength: number) {
    this._maxLength = maxLength
    if (this._value.length > maxLength) {
      this._value = this._value.substring(0, maxLength)
      this.requestRender()
    }
  }

  public set backgroundColor(value: Color) {
    const newColor = parseColor(value ?? this._defaultOptions.backgroundColor)
    if (this._backgroundColor !== newColor) {
      this._backgroundColor = newColor
      this.requestRender()
    }
  }

  public set textColor(value: Color) {
    const newColor = parseColor(value ?? this._defaultOptions.textColor)
    if (this._textColor !== newColor) {
      this._textColor = newColor
      this.requestRender()
    }
  }

  public set focusedBackgroundColor(value: Color) {
    const newColor = parseColor(value ?? this._defaultOptions.focusedBackgroundColor)
    if (this._focusedBackgroundColor !== newColor) {
      this._focusedBackgroundColor = newColor
      this.requestRender()
    }
  }

  public set focusedTextColor(value: Color) {
    const newColor = parseColor(value ?? this._defaultOptions.focusedTextColor)
    if (this._focusedTextColor !== newColor) {
      this._focusedTextColor = newColor
      this.requestRender()
    }
  }

  public set placeholderColor(value: Color) {
    const newColor = parseColor(value ?? this._defaultOptions.placeholderColor)
    if (this._placeholderColor !== newColor) {
      this._placeholderColor = newColor
      this.requestRender()
    }
  }

  public set cursorColor(value: Color) {
    const newColor = parseColor(value ?? this._defaultOptions.cursorColor)
    if (this._cursorColor !== newColor) {
      this._cursorColor = newColor
      this.requestRender()
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

  protected onRemove(): void {
    if (this._focused) {
      this._ctx.setCursorPosition(0, 0, false)
    }
  }
}