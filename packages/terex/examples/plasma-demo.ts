#!/usr/bin/env node

/**
 * Plasma Effect Demo using Braille characters and TrueColor
 * 
 * A mesmerizing animated plasma effect that demonstrates:
 * - Full-screen terminal rendering
 * - Braille characters for high-resolution graphics
 * - TrueColor (24-bit RGB) support
 * - Smooth animated gradients
 * - Terminal resize handling
 */

// Braille character mapping for 2x4 dot matrix
const BRAILLE_OFFSET = 0x2800
const BRAILLE_MATRIX = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80]
]

/**
 * ANSI escape codes for terminal control
 */
const ANSI = {
  clearScreen: '\x1b[2J',
  cursorHome: '\x1b[1;1H',
  cursorHide: '\x1b[?25l',
  cursorShow: '\x1b[?25h',
  reset: '\x1b[0m',
  moveTo: (x: number, y: number) => `\x1b[${y};${x}H`,
  rgb: (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`,
  bgRgb: (r: number, g: number, b: number) => `\x1b[48;2;${r};${g};${b}m`
}

/**
 * Plasma effect generator
 */
class PlasmaEffect {
  private time: number = 0
  private width: number
  private height: number
  private frameCount: number = 0
  
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }
  
  /**
   * Update dimensions on terminal resize
   */
  resize(width: number, height: number): void {
    this.width = width
    this.height = height
  }
  
  /**
   * Generate plasma value using multiple sine waves
   */
  private plasmaFunction(x: number, y: number, t: number): number {
    // Multiple sine wave interference pattern for psychedelic effect
    const v1 = Math.sin(x * 10 + t)
    const v2 = Math.sin(10 * (x * Math.sin(t / 2) + y * Math.cos(t / 3)) + t)
    
    // Moving center point for dynamic effect
    const cx = x + 0.5 * Math.sin(t / 5)
    const cy = y + 0.5 * Math.cos(t / 3)
    const v3 = Math.sin(Math.sqrt(100 * (cx * cx + cy * cy) + 1) + t)
    
    // Combine waves
    return (v1 + v2 + v3) / 3
  }
  
  /**
   * Convert plasma value to RGB color with psychedelic palette
   */
  private plasmaToColor(value: number): { r: number, g: number, b: number } {
    // Normalize value to 0-1 range
    const normalized = (value + 1) / 2
    
    // Create shifting rainbow palette
    const phase = this.time / 10
    const r = Math.floor(255 * (0.5 + 0.5 * Math.sin(Math.PI * normalized * 2 + phase)))
    const g = Math.floor(255 * (0.5 + 0.5 * Math.sin(Math.PI * normalized * 2 + phase + 2 * Math.PI / 3)))
    const b = Math.floor(255 * (0.5 + 0.5 * Math.sin(Math.PI * normalized * 2 + phase + 4 * Math.PI / 3)))
    
    return { r, g, b }
  }
  
  /**
   * Convert 2x4 grid to Braille character
   */
  private toBraille(grid: boolean[][]): string {
    let codePoint = BRAILLE_OFFSET
    
    for (let y = 0; y < 4 && y < grid.length; y++) {
      for (let x = 0; x < 2 && x < grid[y].length; x++) {
        if (grid[y][x]) {
          codePoint |= BRAILLE_MATRIX[y][x]
        }
      }
    }
    
    return String.fromCharCode(codePoint)
  }
  
  /**
   * Convert HSL to RGB
   */
  private hslToRgb(h: number, s: number, l: number): { r: number, g: number, b: number } {
    h = h / 360
    s = s / 100  
    l = l / 100
    
    let r, g, b
    
    if (s === 0) {
      r = g = b = l
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1/6) return p + (q - p) * 6 * t
        if (t < 1/2) return q
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
        return p
      }
      
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      r = hue2rgb(p, q, h + 1/3)
      g = hue2rgb(p, q, h)
      b = hue2rgb(p, q, h - 1/3)
    }
    
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    }
  }
  
  /**
   * Render a single frame of the plasma effect
   */
  render(): string {
    let output = ''
    
    // Update animation time
    this.time += 0.15
    this.frameCount++
    
    // Clear screen and move cursor home
    output += ANSI.clearScreen + ANSI.cursorHome
    
    // Draw gradient border
    output += this.renderBorder()
    
    // Draw plasma effect inside border
    output += this.renderPlasma()
    
    // Draw title
    output += this.renderTitle()
    
    return output
  }
  
  /**
   * Render animated gradient border
   */
  private renderBorder(): string {
    let output = ''
    const borderChars = {
      horizontal: '═',
      vertical: '║',
      topLeft: '╔',
      topRight: '╗',
      bottomLeft: '╚',
      bottomRight: '╝'
    }
    
    // Animated hue offset for rainbow effect
    const hueOffset = this.frameCount * 3
    
    // Top border
    output += ANSI.moveTo(1, 1)
    const topHue = (hueOffset) % 360
    const { r: tr, g: tg, b: tb } = this.hslToRgb(topHue, 100, 50)
    output += ANSI.rgb(tr, tg, tb) + borderChars.topLeft
    
    for (let x = 2; x < this.width; x++) {
      const hue = (hueOffset + x * 2) % 360
      const { r, g, b } = this.hslToRgb(hue, 100, 50)
      output += ANSI.rgb(r, g, b) + borderChars.horizontal
    }
    
    const topRightHue = (hueOffset + this.width * 2) % 360
    const { r: trr, g: trg, b: trb } = this.hslToRgb(topRightHue, 100, 50)
    output += ANSI.rgb(trr, trg, trb) + borderChars.topRight
    
    // Side borders
    for (let y = 2; y < this.height; y++) {
      // Left border
      output += ANSI.moveTo(1, y)
      const leftHue = (hueOffset + y * 5) % 360
      const { r: lr, g: lg, b: lb } = this.hslToRgb(leftHue, 100, 50)
      output += ANSI.rgb(lr, lg, lb) + borderChars.vertical
      
      // Right border
      output += ANSI.moveTo(this.width, y)
      const rightHue = (hueOffset + (this.height - y) * 5) % 360
      const { r: rr, g: rg, b: rb } = this.hslToRgb(rightHue, 100, 50)
      output += ANSI.rgb(rr, rg, rb) + borderChars.vertical
    }
    
    // Bottom border
    output += ANSI.moveTo(1, this.height)
    const bottomLeftHue = (hueOffset + this.height * 5) % 360
    const { r: blr, g: blg, b: blb } = this.hslToRgb(bottomLeftHue, 100, 50)
    output += ANSI.rgb(blr, blg, blb) + borderChars.bottomLeft
    
    for (let x = 2; x < this.width; x++) {
      const hue = (hueOffset + (this.width - x) * 2) % 360
      const { r, g, b } = this.hslToRgb(hue, 100, 50)
      output += ANSI.rgb(r, g, b) + borderChars.horizontal
    }
    
    const bottomRightHue = (hueOffset) % 360
    const { r: brr, g: brg, b: brb } = this.hslToRgb(bottomRightHue, 100, 50)
    output += ANSI.rgb(brr, brg, brb) + borderChars.bottomRight
    
    return output + ANSI.reset
  }
  
  /**
   * Render plasma effect using Braille characters
   */
  private renderPlasma(): string {
    let output = ''
    
    // Inner bounds (inside border)
    const innerWidth = this.width - 2
    const innerHeight = this.height - 2
    
    // Each character position
    for (let row = 0; row < innerHeight; row++) {
      output += ANSI.moveTo(2, row + 2)
      
      for (let col = 0; col < innerWidth; col++) {
        // Sample 2x4 grid for each Braille character
        const grid: boolean[][] = []
        
        for (let by = 0; by < 4; by++) {
          grid[by] = []
          for (let bx = 0; bx < 2; bx++) {
            // Normalized coordinates
            const nx = (col * 2 + bx) / (innerWidth * 2)
            const ny = (row * 4 + by) / (innerHeight * 4)
            
            // Get plasma value and threshold
            const value = this.plasmaFunction(nx, ny, this.time)
            grid[by][bx] = value > -0.3
          }
        }
        
        // Get color for center of character
        const centerX = col / innerWidth
        const centerY = row / innerHeight
        const colorValue = this.plasmaFunction(centerX, centerY, this.time)
        const { r, g, b } = this.plasmaToColor(colorValue)
        
        // Output colored Braille character
        output += ANSI.rgb(r, g, b) + this.toBraille(grid)
      }
    }
    
    return output + ANSI.reset
  }
  
  /**
   * Render animated title
   */
  private renderTitle(): string {
    const title = '╣ P L A S M A ╠'
    const titleX = Math.floor((this.width - title.length) / 2) + 1
    
    // Animated color for title
    const hue = (this.frameCount * 5) % 360
    const { r, g, b } = this.hslToRgb(hue, 100, 50)
    
    return ANSI.moveTo(titleX, 1) + ANSI.rgb(r, g, b) + title + ANSI.reset
  }
}

/**
 * Main application controller
 */
class PlasmaApp {
  private plasma: PlasmaEffect
  private isRunning: boolean = false
  private animationTimer: NodeJS.Timeout | null = null
  private stdout: NodeJS.WriteStream
  private stdin: NodeJS.ReadStream
  
  constructor() {
    this.stdout = process.stdout
    this.stdin = process.stdin
    
    // Get initial terminal size
    const width = this.stdout.columns || 80
    const height = this.stdout.rows || 24
    
    // Create plasma effect
    this.plasma = new PlasmaEffect(width, height)
    
    // Set up terminal
    this.setupTerminal()
    
    // Set up event handlers
    this.setupEventHandlers()
  }
  
  /**
   * Set up terminal for raw mode
   */
  private setupTerminal(): void {
    // Hide cursor
    this.stdout.write(ANSI.cursorHide)
    
    // Clear screen
    this.stdout.write(ANSI.clearScreen)
    
    // Enable raw mode if available
    if (this.stdin.isTTY && this.stdin.setRawMode) {
      this.stdin.setRawMode(true)
      this.stdin.resume()
    }
  }
  
  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    // Handle keyboard input
    this.stdin.on('data', (data: Buffer) => {
      const key = data.toString()
      
      // Quit on 'q' or Ctrl+C
      if (key === 'q' || key === 'Q' || key === '\x03') {
        this.cleanup()
        process.exit(0)
      }
      
      // Toggle pause on space
      if (key === ' ') {
        if (this.isRunning) {
          this.stop()
        } else {
          this.start()
        }
      }
      
      // Increase speed on '+'
      if (key === '+' || key === '=') {
        // Speed is controlled by animation timer interval
        if (this.isRunning) {
          this.stop()
          this.start(20) // Faster
        }
      }
      
      // Decrease speed on '-'
      if (key === '-' || key === '_') {
        if (this.isRunning) {
          this.stop()
          this.start(50) // Slower
        }
      }
    })
    
    // Handle terminal resize
    this.stdout.on('resize', () => {
      const width = this.stdout.columns || 80
      const height = this.stdout.rows || 24
      this.plasma.resize(width, height)
    })
    
    // Handle process signals
    process.on('SIGINT', () => {
      this.cleanup()
      process.exit(0)
    })
    
    process.on('SIGTERM', () => {
      this.cleanup()
      process.exit(0)
    })
  }
  
  /**
   * Start animation
   */
  start(fps: number = 30): void {
    if (this.isRunning) return
    
    this.isRunning = true
    const interval = 1000 / fps
    
    const animate = () => {
      if (!this.isRunning) return
      
      // Render frame
      const frame = this.plasma.render()
      this.stdout.write(frame)
      
      // Schedule next frame
      this.animationTimer = setTimeout(animate, interval)
    }
    
    animate()
  }
  
  /**
   * Stop animation
   */
  stop(): void {
    this.isRunning = false
    
    if (this.animationTimer) {
      clearTimeout(this.animationTimer)
      this.animationTimer = null
    }
  }
  
  /**
   * Clean up terminal
   */
  cleanup(): void {
    this.stop()
    
    // Show cursor
    this.stdout.write(ANSI.cursorShow)
    
    // Clear screen
    this.stdout.write(ANSI.clearScreen + ANSI.cursorHome)
    
    // Reset colors
    this.stdout.write(ANSI.reset)
    
    // Restore terminal mode
    if (this.stdin.isTTY && this.stdin.setRawMode) {
      this.stdin.setRawMode(false)
      this.stdin.pause()
    }
  }
}

// Main entry point
function main(): void {
  // Check if we're in a TTY
  if (!process.stdout.isTTY) {
    console.error('This demo requires a TTY terminal')
    console.error('Try running directly in a terminal, not through a pipe')
    process.exit(1)
  }
  
  // Clear screen and show instructions
  console.clear()
  console.log('\n\n')
  console.log('  ╔══════════════════════════════════════════╗')
  console.log('  ║         PLASMA EFFECT DEMO               ║')
  console.log('  ╠══════════════════════════════════════════╣')
  console.log('  ║                                          ║')
  console.log('  ║  Controls:                               ║')
  console.log('  ║  • SPACE  - Pause/Resume                 ║')
  console.log('  ║  • +/-    - Speed up/Slow down           ║')
  console.log('  ║  • Q      - Quit                         ║')
  console.log('  ║                                          ║')
  console.log('  ║  Features:                               ║')
  console.log('  ║  • Braille characters (high resolution)  ║')
  console.log('  ║  • TrueColor support (16.7M colors)      ║')
  console.log('  ║  • Animated rainbow borders              ║')
  console.log('  ║  • Automatic terminal resize handling    ║')
  console.log('  ║                                          ║')
  console.log('  ╚══════════════════════════════════════════╝')
  console.log('\n  Starting in 3 seconds...\n')
  
  // Start after delay
  setTimeout(() => {
    const app = new PlasmaApp()
    app.start()
  }, 3000)
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

// Export for testing
export { PlasmaEffect, PlasmaApp }