import { RGBA } from "./colors.js"
import tiny from "./fonts/tiny.json"
import block from "./fonts/block.json"
import shade from "./fonts/shade.json"
import slick from "./fonts/slick.json"
import { OptimizedBuffer } from "../renderer/buffer.js"

/*
 * Renders ASCII fonts to a buffer.
 * Font definitions plugged from cfonts - https://github.com/dominikwilkowski/cfonts
 */

export const fonts = {
  tiny,
  block,
  shade,
  slick,
}

type FontSegment = {
  text: string
  colorIndex: number
}

type FontDefinition = {
  name: string
  lines: number
  letterspace_size: number
  letterspace: string[]
  colors?: number
  chars: Record<string, string[]>
}

type ParsedFontDefinition = {
  name: string
  lines: number
  letterspace_size: number
  letterspace: string[]
  colors: number
  chars: Record<string, FontSegment[][]>
}

const parsedFonts: Record<string, ParsedFontDefinition> = {}

function parseColorTags(text: string): FontSegment[] {
  const segments: FontSegment[] = []
  const currentIndex = 0

  const colorTagRegex = /<c(\d+)>(.*?)<\/c\d+>/g
  let lastIndex = 0
  let match

  while ((match = colorTagRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plainText = text.slice(lastIndex, match.index)
      if (plainText) {
        segments.push({ text: plainText, colorIndex: 0 })
      }
    }

    const colorIndex = parseInt(match[1]) - 1
    const taggedText = match[2]
    segments.push({ text: taggedText, colorIndex: Math.max(0, colorIndex) })

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex)
    if (remainingText) {
      segments.push({ text: remainingText, colorIndex: 0 })
    }
  }

  return segments
}

function getParsedFont(fontKey: keyof typeof fonts): ParsedFontDefinition {
  if (!parsedFonts[fontKey]) {
    const fontDef = fonts[fontKey] as FontDefinition
    const parsedChars: Record<string, FontSegment[][]> = {}

    for (const [char, lines] of Object.entries(fontDef.chars)) {
      parsedChars[char] = lines.map((line) => parseColorTags(line))
    }

    parsedFonts[fontKey] = {
      ...fontDef,
      colors: fontDef.colors || 1,
      chars: parsedChars,
    }
  }

  return parsedFonts[fontKey]
}

export function measureText({ text, font = "tiny" }: { text: string; font?: keyof typeof fonts }): {
  width: number
  height: number
} {
  const fontDef = getParsedFont(font)
  if (!fontDef) {
    console.warn(`Font '${font}' not found`)
    return { width: 0, height: 0 }
  }

  let currentX = 0

  for (let i = 0; i < text.length; i++) {
    const char = text[i].toUpperCase()
    const charDef = fontDef.chars[char]

    if (!charDef) {
      const spaceChar = fontDef.chars[" "]
      if (spaceChar && spaceChar[0]) {
        let spaceWidth = 0
        for (const segment of spaceChar[0]) {
          spaceWidth += segment.text.length
        }
        currentX += spaceWidth
      } else {
        currentX += 1
      }
      continue
    }

    let charWidth = 0
    if (charDef[0]) {
      for (const segment of charDef[0]) {
        charWidth += segment.text.length
      }
    }

    currentX += charWidth

    if (i < text.length - 1) {
      currentX += fontDef.letterspace_size
    }
  }

  return {
    width: currentX,
    height: fontDef.lines,
  }
}

export function getCharacterPositions(text: string, font: keyof typeof fonts = "tiny"): number[] {
  const fontDef = getParsedFont(font)
  if (!fontDef) {
    return [0]
  }

  const positions: number[] = [0]
  let currentX = 0

  for (let i = 0; i < text.length; i++) {
    const char = text[i].toUpperCase()
    const charDef = fontDef.chars[char]

    let charWidth = 0
    if (!charDef) {
      const spaceChar = fontDef.chars[" "]
      if (spaceChar && spaceChar[0]) {
        for (const segment of spaceChar[0]) {
          charWidth += segment.text.length
        }
      } else {
        charWidth = 1
      }
    } else if (charDef[0]) {
      for (const segment of charDef[0]) {
        charWidth += segment.text.length
      }
    }

    currentX += charWidth

    if (i < text.length - 1) {
      currentX += fontDef.letterspace_size
    }

    positions.push(currentX)
  }

  return positions
}

export function coordinateToCharacterIndex(x: number, text: string, font: keyof typeof fonts = "tiny"): number {
  const positions = getCharacterPositions(text, font)

  if (x < 0) {
    return 0
  }

  for (let i = 0; i < positions.length - 1; i++) {
    const currentPos = positions[i]
    const nextPos = positions[i + 1]

    if (x >= currentPos && x < nextPos) {
      const charMidpoint = currentPos + (nextPos - currentPos) / 2
      return x < charMidpoint ? i : i + 1
    }
  }

  if (positions.length > 0 && x >= positions[positions.length - 1]) {
    return text.length
  }

  return 0
}

export function renderFontToFrameBuffer(
  buffer: OptimizedBuffer,
  {
    text,
    x = 0,
    y = 0,
    fg = [RGBA.fromInts(255, 255, 255, 255)],
    bg = RGBA.fromInts(0, 0, 0, 255),
    font = "tiny",
  }: {
    text: string
    x?: number
    y?: number
    fg?: RGBA | RGBA[]
    bg?: RGBA
    font?: keyof typeof fonts
  },
): { width: number; height: number } {
  const width = buffer.getWidth()
  const height = buffer.getHeight()

  const fontDef = getParsedFont(font)
  if (!fontDef) {
    console.warn(`Font '${font}' not found`)
    return { width: 0, height: 0 }
  }

  const colors = Array.isArray(fg) ? fg : [fg]

  if (y < 0 || y + fontDef.lines > height) {
    return { width: 0, height: fontDef.lines }
  }

  let currentX = x
  const startX = x

  for (let i = 0; i < text.length; i++) {
    const char = text[i].toUpperCase()
    const charDef = fontDef.chars[char]

    if (!charDef) {
      const spaceChar = fontDef.chars[" "]
      if (spaceChar && spaceChar[0]) {
        let spaceWidth = 0
        for (const segment of spaceChar[0]) {
          spaceWidth += segment.text.length
        }
        currentX += spaceWidth
      } else {
        currentX += 1
      }
      continue
    }

    let charWidth = 0
    if (charDef[0]) {
      for (const segment of charDef[0]) {
        charWidth += segment.text.length
      }
    }

    if (currentX >= width) break
    if (currentX + charWidth < 0) {
      currentX += charWidth + fontDef.letterspace_size
      continue
    }

    for (let lineIdx = 0; lineIdx < fontDef.lines && lineIdx < charDef.length; lineIdx++) {
      const segments = charDef[lineIdx]
      const renderY = y + lineIdx

      if (renderY >= 0 && renderY < height) {
        let segmentX = currentX

        for (const segment of segments) {
          const segmentColor = colors[segment.colorIndex] || colors[0]

          for (let charIdx = 0; charIdx < segment.text.length; charIdx++) {
            const renderX = segmentX + charIdx

            if (renderX >= 0 && renderX < width) {
              const fontChar = segment.text[charIdx]
              if (fontChar !== " ") {
                buffer.setCell(renderX, renderY, fontChar, segmentColor, bg)
              }
            }
          }

          segmentX += segment.text.length
        }
      }
    }

    currentX += charWidth

    if (i < text.length - 1) {
      currentX += fontDef.letterspace_size
    }
  }

  return {
    width: currentX - startX,
    height: fontDef.lines,
  }
}
