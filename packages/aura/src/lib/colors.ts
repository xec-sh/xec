export class RGBA {
  buffer: Float32Array

  constructor(buffer: Float32Array) {
    this.buffer = buffer
  }

  static fromArray(array: Float32Array) {
    return new RGBA(array)
  }

  static fromValues(r: number, g: number, b: number, a: number = 1.0) {
    return new RGBA(new Float32Array([r, g, b, a]))
  }

  static fromInts(r: number, g: number, b: number, a: number = 255) {
    return new RGBA(new Float32Array([r / 255, g / 255, b / 255, a / 255]))
  }

  static fromHex(hex: string): RGBA {
    return hexToRgb(hex)
  }

  toInts(): [number, number, number, number] {
    return [Math.round(this.r * 255), Math.round(this.g * 255), Math.round(this.b * 255), Math.round(this.a * 255)]
  }

  toHex(): string {
    const [r, g, b] = this.toInts()
    const toHexComponent = (value: number) => value.toString(16).padStart(2, '0')
    return `${toHexComponent(r)}${toHexComponent(g)}${toHexComponent(b)}`
  }

  get r(): number {
    return this.buffer[0]
  }

  set r(value: number) {
    this.buffer[0] = value
  }

  get g(): number {
    return this.buffer[1]
  }

  set g(value: number) {
    this.buffer[1] = value
  }

  get b(): number {
    return this.buffer[2]
  }

  set b(value: number) {
    this.buffer[2] = value
  }

  get a(): number {
    return this.buffer[3]
  }

  set a(value: number) {
    this.buffer[3] = value
  }

  map<R>(fn: (value: number) => R) {
    return [fn(this.r), fn(this.g), fn(this.b), fn(this.a)]
  }

  toString() {
    return `rgba(${this.r.toFixed(2)}, ${this.g.toFixed(2)}, ${this.b.toFixed(2)}, ${this.a.toFixed(2)})`
  }

  // Fluent methods for color manipulation

  withAlpha(alpha: number): RGBA {
    return RGBA.fromValues(this.r, this.g, this.b, Math.max(0, Math.min(1, alpha)))
  }

  withOpacity(opacity: number): RGBA {
    return this.withAlpha(opacity)
  }

  darker(amount: number = 0.2): RGBA {
    const factor = 1 - Math.max(0, Math.min(1, amount))
    return RGBA.fromValues(
      this.r * factor,
      this.g * factor,
      this.b * factor,
      this.a
    )
  }

  lighter(amount: number = 0.2): RGBA {
    const factor = Math.max(0, Math.min(1, amount))
    return RGBA.fromValues(
      this.r + (1 - this.r) * factor,
      this.g + (1 - this.g) * factor,
      this.b + (1 - this.b) * factor,
      this.a
    )
  }

  saturate(amount: number = 0.2): RGBA {
    const hsl = this.toHSL()
    hsl.s = Math.min(1, hsl.s + amount)
    return RGBA.fromHSL(hsl.h, hsl.s, hsl.l, this.a)
  }

  desaturate(amount: number = 0.2): RGBA {
    const hsl = this.toHSL()
    hsl.s = Math.max(0, hsl.s - amount)
    return RGBA.fromHSL(hsl.h, hsl.s, hsl.l, this.a)
  }

  rotate(degrees: number): RGBA {
    const hsl = this.toHSL()
    hsl.h = (hsl.h + degrees) % 360
    if (hsl.h < 0) hsl.h += 360
    return RGBA.fromHSL(hsl.h, hsl.s, hsl.l, this.a)
  }

  mix(other: RGBA, amount: number = 0.5): RGBA {
    const factor = Math.max(0, Math.min(1, amount))
    return RGBA.fromValues(
      this.r * (1 - factor) + other.r * factor,
      this.g * (1 - factor) + other.g * factor,
      this.b * (1 - factor) + other.b * factor,
      this.a * (1 - factor) + other.a * factor
    )
  }

  invert(): RGBA {
    return RGBA.fromValues(1 - this.r, 1 - this.g, 1 - this.b, this.a)
  }

  grayscale(): RGBA {
    const gray = 0.299 * this.r + 0.587 * this.g + 0.114 * this.b
    return RGBA.fromValues(gray, gray, gray, this.a)
  }

  clone(): RGBA {
    return RGBA.fromValues(this.r, this.g, this.b, this.a)
  }

  equals(other: RGBA): boolean {
    return (
      Math.abs(this.r - other.r) < 0.001 &&
      Math.abs(this.g - other.g) < 0.001 &&
      Math.abs(this.b - other.b) < 0.001 &&
      Math.abs(this.a - other.a) < 0.001
    )
  }

  private toHSL(): { h: number; s: number; l: number } {
    const max = Math.max(this.r, this.g, this.b)
    const min = Math.min(this.r, this.g, this.b)
    let h = 0
    let s = 0
    const l = (max + min) / 2

    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

      switch (max) {
        case this.r:
          h = ((this.g - this.b) / d + (this.g < this.b ? 6 : 0)) / 6
          break
        case this.g:
          h = ((this.b - this.r) / d + 2) / 6
          break
        case this.b:
          h = ((this.r - this.g) / d + 4) / 6
          break
        default:
      }
    }

    return { h: h * 360, s, l }
  }

  private static fromHSL(h: number, s: number, l: number, a: number = 1): RGBA {
    h = h / 360

    if (s === 0) {
      return RGBA.fromValues(l, l, l, a)
    }

    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q

    const r = hue2rgb(p, q, h + 1 / 3)
    const g = hue2rgb(p, q, h)
    const b = hue2rgb(p, q, h - 1 / 3)

    return RGBA.fromValues(r, g, b, a)
  }
}

export type Color = string | RGBA


export function hexToRgb(hex: string): RGBA {
  hex = hex.replace(/^#/, "")

  // Handle 3-character hex (RGB)
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  
  // Handle 4-character hex (RGBA shorthand)
  if (hex.length === 4) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
  }

  // Handle 6-character hex (RRGGBB)
  if (hex.length === 6 && /^[0-9A-Fa-f]{6}$/.test(hex)) {
    const r = parseInt(hex.substring(0, 2), 16) / 255
    const g = parseInt(hex.substring(2, 4), 16) / 255
    const b = parseInt(hex.substring(4, 6), 16) / 255
    return RGBA.fromValues(r, g, b, 1)
  }

  // Handle 8-character hex (RRGGBBAA)
  if (hex.length === 8 && /^[0-9A-Fa-f]{8}$/.test(hex)) {
    const r = parseInt(hex.substring(0, 2), 16) / 255
    const g = parseInt(hex.substring(2, 4), 16) / 255
    const b = parseInt(hex.substring(4, 6), 16) / 255
    const a = parseInt(hex.substring(6, 8), 16) / 255
    return RGBA.fromValues(r, g, b, a)
  }

  console.warn(`Invalid hex color: ${hex}, defaulting to magenta`)
  return RGBA.fromValues(1, 0, 1, 1)
}

export function rgbToHex(rgb: RGBA): string {
  return (
    "#" +
    [rgb.r, rgb.g, rgb.b]
      .map((x) => {
        const hex = Math.floor(Math.max(0, Math.min(1, x) * 255)).toString(16)
        return hex.length === 1 ? "0" + hex : hex
      })
      .join("")
  )
}

export function hsvToRgb(h: number, s: number, v: number): RGBA {
  let r = 0,
    g = 0,
    b = 0

  const i = Math.floor(h / 60) % 6
  const f = h / 60 - Math.floor(h / 60)
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)

  switch (i) {
    case 0:
      r = v
      g = t
      b = p
      break
    case 1:
      r = q
      g = v
      b = p
      break
    case 2:
      r = p
      g = v
      b = t
      break
    case 3:
      r = p
      g = q
      b = v
      break
    case 4:
      r = t
      g = p
      b = v
      break
    case 5:
      r = v
      g = p
      b = q
      break;
    default:
      break;
  }

  return RGBA.fromValues(r, g, b, 1)
}

const CSS_COLOR_NAMES: Record<string, string> = {
  black: "#000000",
  white: "#FFFFFF",
  red: "#FF0000",
  green: "#008000",
  blue: "#0000FF",
  yellow: "#FFFF00",
  cyan: "#00FFFF",
  magenta: "#FF00FF",
  silver: "#C0C0C0",
  gray: "#808080",
  grey: "#808080",
  maroon: "#800000",
  olive: "#808000",
  lime: "#00FF00",
  aqua: "#00FFFF",
  teal: "#008080",
  navy: "#000080",
  fuchsia: "#FF00FF",
  purple: "#800080",
  orange: "#FFA500",
  brightblack: "#666666",
  brightred: "#FF6666",
  brightgreen: "#66FF66",
  brightblue: "#6666FF",
  brightyellow: "#FFFF66",
  brightcyan: "#66FFFF",
  brightmagenta: "#FF66FF",
  brightwhite: "#FFFFFF",
}

export function parseColor(color: Color, resolveThemeColor?: (token: string) => RGBA | null): RGBA {
  if (typeof color === "string") {
    const lowerColor = color.toLowerCase()

    if (lowerColor === "transparent") {
      return RGBA.fromValues(0, 0, 0, 0)
    }

    if (CSS_COLOR_NAMES[lowerColor]) {
      return hexToRgb(CSS_COLOR_NAMES[lowerColor])
    }

    // Try to resolve as theme token if resolver provided
    if (resolveThemeColor && !color.startsWith('#')) {
      const resolved = resolveThemeColor(color)
      if (resolved) {
        return resolved
      }
    }

    return hexToRgb(color)
  }
  return color
}