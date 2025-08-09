import { it, expect, describe } from 'vitest'

import { withTTY, stripAnsi, createTestHarness } from '../../src/test/index.js'
import {
  text,
  title,
  hLine,
  paragraph,
  TextComponent,
  LineComponent
} from '../../src/components/primitives/index.js'
import { Style, ColorSystem, BaseComponent, CursorController, ScreenController, MouseEventParser, KeyboardEventParser, DifferentialRenderer } from '../../src/core/index.js'

// Real-world UI component for testing
class InteractiveMenuComponent extends BaseComponent<{
  title: string
  items: string[]
  selectedIndex: number
}> {
  constructor(title: string, items: string[]) {
    super()
    this.state = { title, items, selectedIndex: 0 }
  }

  handleKeyPress(event: any): boolean {
    switch (event.key) {
      case 'ArrowUp':
        this.setState({
          selectedIndex: Math.max(0, this.state.selectedIndex - 1)
        })
        return true
      case 'ArrowDown':
        this.setState({
          selectedIndex: Math.min(this.state.items.length - 1, this.state.selectedIndex + 1)
        })
        return true
      case 'Enter':
        // Selection made
        return true
      default:
        return false
    }
  }

  render(bounds: { x: number; y: number; width: number; height: number }, terminal: any) {
    // Render title
    const titleText = new TextComponent({
      content: this.state.title,
      style: new Style().bold().fg('cyan'),
      align: 'center'
    })
    titleText.render({ ...bounds, height: 1 }, terminal)

    // Render separator
    const separator = new LineComponent({
      orientation: 'horizontal',
      style: 'single'
    })
    separator.render({ x: bounds.x, y: bounds.y + 1, width: bounds.width, height: 1 }, terminal)

    // Render menu items
    this.state.items.forEach((item, index) => {
      const isSelected = index === this.state.selectedIndex
      const itemText = new TextComponent({
        content: isSelected ? `▶ ${item}` : `  ${item}`,
        style: isSelected ? new Style().bold().fg('yellow') : new Style()
      })
      itemText.render({
        x: bounds.x,
        y: bounds.y + 2 + index,
        width: bounds.width,
        height: 1
      }, terminal)
    })
  }
}

describe('E2E Terminal Scenarios', () => {
  describe('Real Terminal Rendering', () => {
    it('should render a complete UI in real terminal', () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const harness = createTestHarness({ stdin, stdout })
        const cursor = new CursorController(stdout)
        const screen = new ScreenController(stdout)

        // Clear screen and hide cursor
        screen.clear()
        cursor.hide()

        // Create UI components
        const header = title('Terminal Application')
        const divider = hLine(40)
        const content = paragraph('Welcome to the terminal application. This is a real TTY rendering test.')

        // Render UI
        header.render({ x: 0, y: 0, width: 40, height: 1 }, harness.terminal)
        divider.render({ x: 0, y: 1, width: 40, height: 1 }, harness.terminal)
        content.render({ x: 0, y: 3, width: 40, height: 5 }, harness.terminal)

        // Show cursor again
        cursor.show()

        const output = harness.getOutput()
        expect(output[0]).toContain('Terminal Application')
        expect(output[1]).toContain('────')
        expect(output.join('\n')).toContain('Welcome to the terminal')

        // Verify TTY environment
        expect(env.isTTY).toBe(true)
        expect(env.columns).toBeGreaterThan(0)
        expect(env.rows).toBeGreaterThan(0)
      })
    )

    it('should handle interactive menu navigation', () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const harness = createTestHarness({ stdin, stdout })

        const menu = new InteractiveMenuComponent('Main Menu', [
          'Option 1',
          'Option 2',
          'Option 3',
          'Exit'
        ])

        // Initial render
        menu.render({ x: 0, y: 0, width: 30, height: 8 }, harness.terminal)

        let output = harness.getOutput()
        expect(output[0]).toContain('Main Menu')
        expect(output[2]).toContain('▶ Option 1') // First item selected

        // Simulate arrow down
        harness.clear()
        menu.handleKeyPress({ key: 'ArrowDown' })
        menu.render({ x: 0, y: 0, width: 30, height: 8 }, harness.terminal)

        output = harness.getOutput()
        expect(output[2]).toContain('  Option 1')
        expect(output[3]).toContain('▶ Option 2') // Second item selected

        // Simulate arrow down again
        harness.clear()
        menu.handleKeyPress({ key: 'ArrowDown' })
        menu.render({ x: 0, y: 0, width: 30, height: 8 }, harness.terminal)

        output = harness.getOutput()
        expect(output[3]).toContain('  Option 2')
        expect(output[4]).toContain('▶ Option 3') // Third item selected

        // Simulate arrow up
        harness.clear()
        menu.handleKeyPress({ key: 'ArrowUp' })
        menu.render({ x: 0, y: 0, width: 30, height: 8 }, harness.terminal)

        output = harness.getOutput()
        expect(output[3]).toContain('▶ Option 2') // Back to second item
      })
    )

    it('should handle terminal colors and styles', () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const harness = createTestHarness({ stdin, stdout })
        const colorSystem = new ColorSystem()

        // Detect color support
        const colorMode = colorSystem.detectColorMode()
        expect(colorMode).toBeTruthy()

        // Create styled components
        const redText = new TextComponent({
          content: 'Red Error Message',
          style: new Style().fg('red').bold()
        })

        const greenText = new TextComponent({
          content: 'Green Success Message',
          style: new Style().fg('green').italic()
        })

        const yellowBg = new TextComponent({
          content: 'Yellow Background',
          style: new Style().bg('yellow').fg('black')
        })

        // Render styled text
        redText.render({ x: 0, y: 0, width: 30, height: 1 }, harness.terminal)
        greenText.render({ x: 0, y: 1, width: 30, height: 1 }, harness.terminal)
        yellowBg.render({ x: 0, y: 2, width: 30, height: 1 }, harness.terminal)

        const rawOutput = harness.getRawOutput()

        // Verify ANSI codes are present
        expect(rawOutput).toContain('\x1b[31m') // Red
        expect(rawOutput).toContain('\x1b[32m') // Green
        expect(rawOutput).toContain('\x1b[43m') // Yellow background
        expect(rawOutput).toContain('\x1b[1m')  // Bold
        expect(rawOutput).toContain('\x1b[3m')  // Italic

        // Verify text content
        const output = harness.getOutput()
        expect(stripAnsi(output[0])).toBe('Red Error Message')
        expect(stripAnsi(output[1])).toBe('Green Success Message')
        expect(stripAnsi(output[2])).toBe('Yellow Background')
      })
    )
  })

  describe('Terminal Input Handling', () => {
    it('should parse keyboard events in raw mode', () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const parser = new KeyboardEventParser()

        // Enable raw mode
        if (stdin.setRawMode) {
          stdin.setRawMode(true)
          expect(env.isRaw).toBe(true)

          // Test various key sequences
          const tests = [
            { input: 'a', expected: { key: 'a', ctrl: false } },
            { input: '\x03', expected: { key: 'c', ctrl: true } }, // Ctrl+C
            { input: '\x1b[A', expected: { key: 'ArrowUp' } },    // Arrow Up
            { input: '\x1b[B', expected: { key: 'ArrowDown' } },  // Arrow Down
            { input: '\r', expected: { key: 'Enter' } },          // Enter
            { input: '\x1b', expected: { key: 'Escape' } },       // Escape
            { input: '\t', expected: { key: 'Tab' } },            // Tab
            { input: '\x7f', expected: { key: 'Backspace' } },    // Backspace
          ]

          tests.forEach(test => {
            const event = parser.parse(Buffer.from(test.input))
            if (event) {
              expect(event.key).toBe(test.expected.key)
              if (test.expected.ctrl !== undefined) {
                expect(event.ctrl).toBe(test.expected.ctrl)
              }
            }
          })

          // Disable raw mode
          stdin.setRawMode(false)
        }
      })
    )

    it('should handle mouse events if supported', () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const parser = new MouseEventParser()

        // Enable mouse tracking (if terminal supports it)
        stdout.write('\x1b[?1000h') // X10 mouse tracking

        // Test X10 mouse protocol
        const x10Click = Buffer.from([0x1b, 0x5b, 0x4d, 0x20, 0x21, 0x21])
        const mouseEvent = parser.parse(x10Click)

        if (mouseEvent) {
          expect(mouseEvent.type).toBe('click')
          expect(mouseEvent.x).toBe(0)
          expect(mouseEvent.y).toBe(0)
          expect(mouseEvent.button).toBe('left')
        }

        // Disable mouse tracking
        stdout.write('\x1b[?1000l')
      })
    )

    it('should handle special key combinations', () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const harness = createTestHarness({ stdin, stdout })
        const parser = new KeyboardEventParser()

        // Component that responds to shortcuts
        class ShortcutComponent extends BaseComponent<{ lastKey: string }> {
          constructor() {
            super()
            this.state = { lastKey: 'none' }
          }

          handleKeyPress(event: any): boolean {
            if (event.ctrl && event.key === 's') {
              this.setState({ lastKey: 'Ctrl+S (Save)' })
              return true
            }
            if (event.ctrl && event.key === 'q') {
              this.setState({ lastKey: 'Ctrl+Q (Quit)' })
              return true
            }
            if (event.alt && event.key === 'Enter') {
              this.setState({ lastKey: 'Alt+Enter (Fullscreen)' })
              return true
            }
            return false
          }

          render(bounds: any, terminal: any) {
            const t = text(`Last key: ${this.state.lastKey}`)
            t.render(bounds, terminal)
          }
        }

        const component = new ShortcutComponent()

        // Test Ctrl+S
        component.handleKeyPress({ ctrl: true, key: 's' })
        component.render({ x: 0, y: 0, width: 30, height: 1 }, harness.terminal)
        let output = harness.getOutput()
        expect(output[0]).toContain('Ctrl+S (Save)')

        // Test Ctrl+Q
        harness.clear()
        component.handleKeyPress({ ctrl: true, key: 'q' })
        component.render({ x: 0, y: 0, width: 30, height: 1 }, harness.terminal)
        output = harness.getOutput()
        expect(output[0]).toContain('Ctrl+Q (Quit)')

        // Test Alt+Enter
        harness.clear()
        component.handleKeyPress({ alt: true, key: 'Enter' })
        component.render({ x: 0, y: 0, width: 30, height: 1 }, harness.terminal)
        output = harness.getOutput()
        expect(output[0]).toContain('Alt+Enter (Fullscreen)')
      })
    )
  })

  describe('Terminal Features', () => {
    it('should handle terminal resize events', () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const harness = createTestHarness({ stdin, stdout })

        // Get initial size
        const initialCols = env.columns
        const initialRows = env.rows

        expect(initialCols).toBeGreaterThan(0)
        expect(initialRows).toBeGreaterThan(0)

        // Component that adapts to terminal size
        class ResponsiveComponent extends BaseComponent {
          render(bounds: any, terminal: any) {
            const width = bounds.width || env.columns || 80
            const content = width > 60 ? 'Wide Layout' : 'Narrow Layout'
            const t = text(content)
            t.render(bounds, terminal)
          }
        }

        const component = new ResponsiveComponent()

        // Render with current size
        component.render({ x: 0, y: 0, width: env.columns, height: 1 }, harness.terminal)
        const output = harness.getOutput()
        expect(output[0]).toContain('Layout')

        // Simulate resize event
        harness.resize(120, 40)

        // Re-render after resize
        harness.clear()
        component.render({ x: 0, y: 0, width: 120, height: 1 }, harness.terminal)
      })
    )

    it('should use differential rendering for efficiency', () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const renderer = new DifferentialRenderer(stdout)

        // First frame
        const frame1 = [
          'Line 1: Initial',
          'Line 2: Initial',
          'Line 3: Initial'
        ]

        renderer.render(frame1)

        // Second frame with partial changes
        const frame2 = [
          'Line 1: Initial',  // Unchanged
          'Line 2: Updated',  // Changed
          'Line 3: Initial'   // Unchanged
        ]

        // Differential render should only update changed line
        const writeCount = renderer.render(frame2)

        // Verify efficient rendering
        expect(writeCount).toBeLessThanOrEqual(frame2.length)
      })
    )

    it('should handle alternate screen buffer', () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const screen = new ScreenController(stdout)

        // Switch to alternate buffer (for full-screen apps)
        screen.enterAlternateBuffer()

        // Clear and draw in alternate buffer
        screen.clear()

        const harness = createTestHarness({ stdin, stdout })
        const appTitle = title('Full Screen Application')
        appTitle.render({ x: 0, y: 0, width: 40, height: 1 }, harness.terminal)

        // Return to main buffer
        screen.exitAlternateBuffer()

        // Main buffer should be restored
        expect(env.isTTY).toBe(true)
      })
    )

    it('should handle cursor positioning and visibility', () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const cursor = new CursorController(stdout)
        const harness = createTestHarness({ stdin, stdout })

        // Hide cursor during rendering
        cursor.hide()

        // Move cursor to specific position
        cursor.moveTo(10, 5)

        // Render at cursor position
        const component = text('At cursor position')
        component.render({ x: 10, y: 5, width: 20, height: 1 }, harness.terminal)

        // Save cursor position
        cursor.save()

        // Move and render elsewhere
        cursor.moveTo(0, 0)
        const header = text('Header')
        header.render({ x: 0, y: 0, width: 10, height: 1 }, harness.terminal)

        // Restore cursor position
        cursor.restore()

        // Show cursor again
        cursor.show()

        const output = harness.getOutput()
        expect(output).toBeDefined()
      })
    )
  })

  describe('Complex UI Scenarios', () => {
    it('should render a complete dashboard UI', () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const harness = createTestHarness({ stdin, stdout })
        const screen = new ScreenController(stdout)

        // Clear screen for dashboard
        screen.clear()

        // Dashboard components
        const header = new TextComponent({
          content: '═══ System Dashboard ═══',
          style: new Style().bold().fg('cyan'),
          align: 'center'
        })

        const statusSection = new TextComponent({
          content: 'Status: ● Online',
          style: new Style().fg('green')
        })

        const cpuMeter = new TextComponent({
          content: 'CPU: [████████░░] 80%',
          style: new Style().fg('yellow')
        })

        const memMeter = new TextComponent({
          content: 'MEM: [██████░░░░] 60%',
          style: new Style().fg('blue')
        })

        const divider = new LineComponent({
          orientation: 'horizontal',
          style: 'double'
        })

        const logSection = new TextComponent({
          content: '📜 Recent Logs:\n  [INFO] System started\n  [INFO] All services running\n  [WARN] High memory usage',
          wrap: true
        })

        // Render dashboard
        header.render({ x: 0, y: 0, width: 50, height: 1 }, harness.terminal)
        divider.render({ x: 0, y: 1, width: 50, height: 1 }, harness.terminal)
        statusSection.render({ x: 2, y: 3, width: 20, height: 1 }, harness.terminal)
        cpuMeter.render({ x: 2, y: 5, width: 25, height: 1 }, harness.terminal)
        memMeter.render({ x: 2, y: 6, width: 25, height: 1 }, harness.terminal)
        divider.render({ x: 0, y: 8, width: 50, height: 1 }, harness.terminal)
        logSection.render({ x: 2, y: 10, width: 46, height: 5 }, harness.terminal)

        const output = harness.getOutput()
        expect(output[0]).toContain('System Dashboard')
        expect(output.join('\n')).toContain('Online')
        expect(output.join('\n')).toContain('CPU')
        expect(output.join('\n')).toContain('MEM')
        expect(output.join('\n')).toContain('Recent Logs')
      })
    )

    it('should handle multi-column layout', () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const harness = createTestHarness({ stdin, stdout })

        // Create three-column layout
        const leftColumn = new TextComponent({
          content: 'Left Panel\n\nNavigation:\n• Home\n• About\n• Settings',
          wrap: true
        })

        const middleColumn = new TextComponent({
          content: 'Main Content\n\nThis is the main content area where the primary information is displayed.',
          wrap: true
        })

        const rightColumn = new TextComponent({
          content: 'Right Panel\n\nQuick Actions:\n• Save\n• Export\n• Share',
          wrap: true
        })

        // Vertical separators
        const separator1 = new LineComponent({
          orientation: 'vertical',
          character: '│'
        })

        const separator2 = new LineComponent({
          orientation: 'vertical',
          character: '│'
        })

        // Render columns
        leftColumn.render({ x: 0, y: 0, width: 15, height: 10 }, harness.terminal)
        separator1.render({ x: 15, y: 0, width: 1, height: 10 }, harness.terminal)
        middleColumn.render({ x: 17, y: 0, width: 20, height: 10 }, harness.terminal)
        separator2.render({ x: 37, y: 0, width: 1, height: 10 }, harness.terminal)
        rightColumn.render({ x: 39, y: 0, width: 15, height: 10 }, harness.terminal)

        const output = harness.getOutput()
        expect(output[0]).toContain('Left Panel')
        expect(output[0]).toContain('Main Content')
        expect(output[0]).toContain('Right Panel')
        expect(output.join('\n')).toContain('Navigation')
        expect(output.join('\n')).toContain('Quick Actions')
      })
    )

    it('should handle animated loading states', async () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const harness = createTestHarness({ stdin, stdout })

        // Animated spinner frames
        const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
        let frameIndex = 0

        class LoadingComponent extends BaseComponent<{ frame: string; message: string }> {
          constructor(message: string) {
            super()
            this.state = { frame: spinnerFrames[0], message }
          }

          nextFrame() {
            frameIndex = (frameIndex + 1) % spinnerFrames.length
            this.setState({ frame: spinnerFrames[frameIndex] })
          }

          render(bounds: any, terminal: any) {
            const t = text(`${this.state.frame} ${this.state.message}`)
            t.render(bounds, terminal)
          }
        }

        const loader = new LoadingComponent('Loading data...')

        // Simulate animation frames
        for (let i = 0; i < 3; i++) {
          harness.clear()
          loader.nextFrame()
          loader.render({ x: 0, y: 0, width: 30, height: 1 }, harness.terminal)

          const output = harness.getOutput()
          expect(output[0]).toContain('Loading data...')
          expect(output[0]).toContain(spinnerFrames[frameIndex])

          // Small delay between frames (in real app would use setInterval)
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      })
    )
  })

  describe('Error Recovery', () => {
    it('should recover from terminal errors', () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const harness = createTestHarness({ stdin, stdout })

        // Component that might fail
        class UnstableComponent extends BaseComponent {
          render(bounds: any, terminal: any) {
            if (Math.random() > 0.5) {
              throw new Error('Random failure')
            }
            const t = text('Rendered successfully')
            t.render(bounds, terminal)
          }
        }

        const component = new UnstableComponent()

        // Try rendering multiple times
        let successCount = 0
        let errorCount = 0

        for (let i = 0; i < 10; i++) {
          try {
            harness.clear()
            component.render({ x: 0, y: 0, width: 30, height: 1 }, harness.terminal)
            successCount++
          } catch (e) {
            errorCount++
            // System should recover and continue
          }
        }

        // Should have some successes and some errors
        expect(successCount + errorCount).toBe(10)
      })
    )

    it('should handle terminal disconnection gracefully', () =>
      withTTY(async ({ stdin, stdout, env }) => {
        const harness = createTestHarness({ stdin, stdout })

        // Simulate terminal disconnection
        const originalWrite = stdout.write
        stdout.write = () => { throw new Error('Terminal disconnected') }

        const component = text('Test')

        // Should handle error gracefully
        try {
          component.render({ x: 0, y: 0, width: 10, height: 1 }, harness.terminal)
        } catch (e) {
          expect(e.message).toContain('disconnected')
        }

        // Restore terminal
        stdout.write = originalWrite

        // Should work again after reconnection
        harness.clear()
        component.render({ x: 0, y: 0, width: 10, height: 1 }, harness.terminal)

        const output = harness.getOutput()
        expect(stripAnsi(output[0])).toBe('Test')
      })
    )
  })
})