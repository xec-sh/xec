import { it, expect, describe, beforeEach } from 'vitest'

import { stripAnsi } from '../../../../src/test/index.js'
import { createMockTerminal } from '../../../../src/test/mock-terminal.js'
import {
  Text,
  text,
  code,
  label,
  title,
  subtitle,
  paragraph,
  styledText,
  wrappedText,
  centeredText,
  verticalText,
  animatedText,
  truncatedText,
  rightAlignedText
} from '../../../../src/components/primitives/text.js'

describe('Text', () => {
  let terminal: ReturnType<typeof createMockTerminal>

  beforeEach(() => {
    terminal = createMockTerminal()
  })

  describe('Basic Text Rendering', () => {
    it('should render simple text', () => {
      const component = new Text({ content: 'Hello World' })
      component.render({ x: 0, y: 0, width: 20, height: 1 }, terminal)
      
      expect(stripAnsi(terminal.getOutput())).toBe('Hello World')
    })

    it('should handle empty text', () => {
      const component = new Text({ content: '' })
      component.render({ x: 0, y: 0, width: 20, height: 1 }, terminal)
      
      expect(stripAnsi(terminal.getOutput())).toBe('')
    })

    it('should respect position', () => {
      const component = new Text({ content: 'Test' })
      component.render({ x: 5, y: 2, width: 10, height: 1 }, terminal)
      
      const output = terminal.getBuffer()
      expect(output[2]?.substring(5, 9)).toBe('Test')
    })

    it('should handle multiline text', () => {
      const component = new Text({ content: 'Line 1\nLine 2\nLine 3' })
      component.render({ x: 0, y: 0, width: 20, height: 3 }, terminal)
      
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('Line 1')
      expect(stripAnsi(buffer[1])).toBe('Line 2')
      expect(stripAnsi(buffer[2])).toBe('Line 3')
    })

    it('should handle carriage returns', () => {
      const component = new Text({ content: 'Line 1\r\nLine 2' })
      component.render({ x: 0, y: 0, width: 20, height: 2 }, terminal)
      
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('Line 1')
      expect(stripAnsi(buffer[1])).toBe('Line 2')
    })

    it('should handle tabs', () => {
      const component = new Text({ content: 'Tab\tText' })
      component.render({ x: 0, y: 0, width: 20, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output.includes('Tab')).toBe(true)
      expect(output.includes('Text')).toBe(true)
    })
  })

  describe('Text Alignment', () => {
    it('should align text left by default', () => {
      const component = new Text({ 
        content: 'Left',
        align: 'left'
      })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output.startsWith('Left')).toBe(true)
    })

    it('should center text horizontally', () => {
      const component = new Text({ 
        content: 'Center',
        align: 'center'
      })
      component.render({ x: 0, y: 0, width: 12, height: 1 }, terminal)
      
      const output = terminal.getBufferRaw()[0].substring(0, 12)
      expect(stripAnsi(output)).toBe('   Center   ')
    })

    it('should right align text', () => {
      const component = new Text({ 
        content: 'Right',
        align: 'right'
      })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = terminal.getBuffer()[0]
      expect(stripAnsi(output).trimEnd()).toBe('     Right')
    })

    it('should vertically align text top by default', () => {
      const component = new Text({ 
        content: 'Top',
        verticalAlign: 'top'
      })
      component.render({ x: 0, y: 0, width: 10, height: 3 }, terminal)
      
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('Top')
      expect(stripAnsi(buffer[1])).toBe('')
      expect(stripAnsi(buffer[2])).toBe('')
    })

    it('should vertically center text', () => {
      const component = new Text({ 
        content: 'Middle',
        verticalAlign: 'middle'
      })
      component.render({ x: 0, y: 0, width: 10, height: 3 }, terminal)
      
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('')
      expect(stripAnsi(buffer[1])).toBe('Middle')
      expect(stripAnsi(buffer[2])).toBe('')
    })

    it('should vertically align text to bottom', () => {
      const component = new Text({ 
        content: 'Bottom',
        verticalAlign: 'bottom'
      })
      component.render({ x: 0, y: 0, width: 10, height: 3 }, terminal)
      
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('')
      expect(stripAnsi(buffer[1])).toBe('')
      expect(stripAnsi(buffer[2])).toBe('Bottom')
    })

    it('should handle combined horizontal and vertical alignment', () => {
      const component = new Text({ 
        content: 'X',
        align: 'center',
        verticalAlign: 'middle'
      })
      component.render({ x: 0, y: 0, width: 5, height: 3 }, terminal)
      
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0].substring(0, 5))).toBe('     ')
      expect(stripAnsi(buffer[1].substring(0, 5))).toBe('  X  ')
      expect(stripAnsi(buffer[2].substring(0, 5))).toBe('     ')
    })
  })

  describe('Text Wrapping', () => {
    it('should wrap long text', () => {
      const component = new Text({ 
        content: 'This is a very long text that should wrap',
        wrap: true
      })
      component.render({ x: 0, y: 0, width: 10, height: 5 }, terminal)
      
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('This is a')
      expect(stripAnsi(buffer[1])).toBe('very long')
      expect(stripAnsi(buffer[2])).toBe('text that')
      expect(stripAnsi(buffer[3])).toBe('should')
      expect(stripAnsi(buffer[4])).toBe('wrap')
    })

    it('should respect word boundaries when wrapping', () => {
      const component = new Text({ 
        content: 'Hello beautiful world',
        wrap: true
      })
      component.render({ x: 0, y: 0, width: 8, height: 3 }, terminal)
      
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('Hello')
      expect(stripAnsi(buffer[1])).toBe('beautiful')
      expect(stripAnsi(buffer[2])).toBe('world')
    })

    it('should wrap very long words', () => {
      const component = new Text({ 
        content: 'supercalifragilisticexpialidocious',
        wrap: true
      })
      component.render({ x: 0, y: 0, width: 10, height: 4 }, terminal)
      
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('supercalif')
      expect(stripAnsi(buffer[1])).toBe('ragilistic')
      expect(stripAnsi(buffer[2])).toBe('expialidoc')
      expect(stripAnsi(buffer[3])).toBe('ious')
    })

    it('should handle wrap with alignment', () => {
      const component = new Text({ 
        content: 'Wrap and center this text',
        wrap: true,
        align: 'center'
      })
      component.render({ x: 0, y: 0, width: 10, height: 3 }, terminal)
      
      const buffer = terminal.getBuffer()
      // Each wrapped line should be centered
      expect(stripAnsi(buffer[0]).trim()).toBe('Wrap and')
      expect(stripAnsi(buffer[1]).trim()).toBe('center')
      expect(stripAnsi(buffer[2]).trim()).toBe('this text')
    })

    it('should not wrap when wrap is false', () => {
      const component = new Text({ 
        content: 'This is a very long text that should not wrap',
        wrap: false
      })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('This is a ')
    })
  })

  describe('Text Truncation', () => {
    it('should truncate text with ellipsis', () => {
      const component = new Text({ 
        content: 'This is a long text',
        truncate: true,
        ellipsis: '...'
      })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('This is...')
    })

    it('should truncate with custom ellipsis', () => {
      const component = new Text({ 
        content: 'Truncate me',
        truncate: true,
        ellipsis: '→'
      })
      component.render({ x: 0, y: 0, width: 8, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('Truncat→')
    })

    it('should truncate without ellipsis when specified', () => {
      const component = new Text({ 
        content: 'Truncate me',
        truncate: true,
        ellipsis: ''
      })
      component.render({ x: 0, y: 0, width: 8, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('Truncate')
    })

    it('should not truncate when text fits', () => {
      const component = new Text({ 
        content: 'Short',
        truncate: true,
        ellipsis: '...'
      })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('Short')
    })

    it('should handle truncation with alignment', () => {
      const component = new Text({ 
        content: 'Truncate and center',
        truncate: true,
        align: 'center',
        ellipsis: '...'
      })
      component.render({ x: 0, y: 0, width: 12, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getBuffer()[0])
      expect(output.trim()).toBe('Truncate...')
    })
  })

  describe('Text Styling', () => {
    it('should apply style to text', () => {
      const style = { bold: true, foreground: 'red' }
      const component = new Text({ 
        content: 'Styled',
        style
      })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = terminal.getOutput()
      expect(output).toContain('\x1b[1m') // Bold
      expect(output).toContain('\x1b[31m') // Red
      expect(stripAnsi(output)).toBe('Styled')
    })

    it('should apply multiple styles', () => {
      const style = { bold: true, italic: true, underline: true, foreground: 'blue', background: 'yellow' }
      const component = new Text({ 
        content: 'Multi',
        style
      })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = terminal.getOutput()
      expect(output).toContain('\x1b[1m') // Bold
      expect(output).toContain('\x1b[3m') // Italic
      expect(output).toContain('\x1b[4m') // Underline
      expect(output).toContain('\x1b[34m') // Blue
      expect(output).toContain('\x1b[43m') // Yellow background
    })

    it('should preserve style across wrapped lines', () => {
      const style = { foreground: 'green' }
      const component = new Text({ 
        content: 'This is green text that wraps',
        style,
        wrap: true
      })
      component.render({ x: 0, y: 0, width: 10, height: 3 }, terminal)
      
      const output = terminal.getOutput()
      const greenCount = (output.match(/\x1b\[32m/g) || []).length
      expect(greenCount).toBeGreaterThanOrEqual(3) // Each line should have green
    })
  })

  describe('State Management', () => {
    it('should update text via setState', () => {
      const component = new Text({ content: 'Initial' })
      
      component.render({ x: 0, y: 0, width: 20, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('Initial')
      
      terminal.clear()
      component.setText('Updated')
      component.render({ x: 0, y: 0, width: 20, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('Updated')
    })

    it('should update style via setStyle', () => {
      const component = new Text({ content: 'Text' })
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(terminal.getOutput()).not.toContain('\x1b[1m')
      
      terminal.clear()
      component.setStyle({ bold: true })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(terminal.getOutput()).toContain('\x1b[1m')
    })

    it('should update alignment', () => {
      const component = new Text({ content: 'Move', align: 'left' })
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(stripAnsi(terminal.getBuffer()[0])).toBe('Move')
      
      terminal.clear()
      component.setAlign('right')
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(stripAnsi(terminal.getBuffer()[0]).trimEnd()).toBe('      Move')
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero width', () => {
      const component = new Text({ content: 'Text' })
      component.render({ x: 0, y: 0, width: 0, height: 1 }, terminal)
      
      expect(stripAnsi(terminal.getOutput())).toBe('')
    })

    it('should handle zero height', () => {
      const component = new Text({ content: 'Text' })
      component.render({ x: 0, y: 0, width: 10, height: 0 }, terminal)
      
      expect(stripAnsi(terminal.getOutput())).toBe('')
    })

    it('should handle negative dimensions gracefully', () => {
      const component = new Text({ content: 'Text' })
      component.render({ x: -5, y: -5, width: -10, height: -10 }, terminal)
      
      expect(stripAnsi(terminal.getOutput())).toBe('')
    })

    it('should handle unicode characters', () => {
      const component = new Text({ content: '🚀 Hello 世界' })
      component.render({ x: 0, y: 0, width: 20, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('🚀 Hello 世界')
    })

    it('should handle ANSI escape sequences in content', () => {
      const component = new Text({ content: '\x1b[31mRed\x1b[0m Text' })
      component.render({ x: 0, y: 0, width: 20, height: 1 }, terminal)
      
      const output = terminal.getOutput()
      expect(output).toContain('Red')
      expect(output).toContain('Text')
    })

    it('should handle very long single line', () => {
      const longText = 'x'.repeat(1000)
      const component = new Text({ content: longText, truncate: true })
      component.render({ x: 0, y: 0, width: 50, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output.length).toBeLessThanOrEqual(50)
    })

    it('should handle empty lines in multiline text', () => {
      const component = new Text({ content: 'Line1\n\nLine3' })
      component.render({ x: 0, y: 0, width: 10, height: 3 }, terminal)
      
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('Line1')
      expect(stripAnsi(buffer[1])).toBe('')
      expect(stripAnsi(buffer[2])).toBe('Line3')
    })

    it('should handle null/undefined gracefully', () => {
      const component = new Text({ content: null as any })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      expect(stripAnsi(terminal.getOutput())).toBe('')
    })
  })

  describe('Factory Functions', () => {
    it('text() should create basic text component', () => {
      const component = text('Hello')
      expect(component).toBeInstanceOf(Text)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('Hello')
    })

    it('styledText() should create styled text', () => {
      const style = { bold: true }
      const component = styledText('Bold', style)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(terminal.getOutput()).toContain('\x1b[1m')
    })

    it('label() should create label text', () => {
      const component = label('Label:', 'Value')
      
      component.render({ x: 0, y: 0, width: 20, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toContain('Label:')
      expect(stripAnsi(terminal.getOutput())).toContain('Value')
    })

    it('title() should create title with style', () => {
      const component = title('Main Title')
      
      component.render({ x: 0, y: 0, width: 20, height: 1 }, terminal)
      const output = terminal.getOutput()
      expect(output).toContain('\x1b[1m') // Bold
      expect(stripAnsi(output)).toBe('Main Title')
    })

    it('subtitle() should create subtitle with style', () => {
      const component = subtitle('Subtitle Text')
      
      component.render({ x: 0, y: 0, width: 20, height: 1 }, terminal)
      const output = terminal.getOutput()
      expect(output).toContain('\x1b[') // Has styling
      expect(stripAnsi(output)).toBe('Subtitle Text')
    })

    it('paragraph() should create wrapped paragraph', () => {
      const component = paragraph('This is a long paragraph that should wrap nicely.')
      
      component.render({ x: 0, y: 0, width: 15, height: 4 }, terminal)
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBeTruthy()
      expect(stripAnsi(buffer[1])).toBeTruthy()
    })

    it('code() should create monospace code block', () => {
      const component = code('const x = 42;')
      
      component.render({ x: 0, y: 0, width: 20, height: 1 }, terminal)
      const output = terminal.getOutput()
      expect(stripAnsi(output)).toBe('const x = 42;')
    })

    it('centeredText() should create centered text', () => {
      const component = centeredText('Center')
      
      component.render({ x: 0, y: 0, width: 12, height: 1 }, terminal)
      const output = stripAnsi(terminal.getBufferRaw()[0].substring(0, 12))
      expect(output).toBe('   Center   ')
    })

    it('rightAlignedText() should create right-aligned text', () => {
      const component = rightAlignedText('Right')
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      const output = stripAnsi(terminal.getBuffer()[0])
      expect(output.trimEnd()).toBe('     Right')
    })

    it('truncatedText() should create truncated text', () => {
      const component = truncatedText('This is very long text', 10)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('This is...')
    })

    it('wrappedText() should create wrapped text', () => {
      const component = wrappedText('Wrap this text please', 8)
      
      component.render({ x: 0, y: 0, width: 8, height: 3 }, terminal)
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('Wrap')
      expect(stripAnsi(buffer[1])).toBe('this')
      expect(stripAnsi(buffer[2])).toBe('text')
    })

    it('verticalText() should create vertical text', () => {
      const component = verticalText('ABC')
      
      component.render({ x: 0, y: 0, width: 1, height: 3 }, terminal)
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('A')
      expect(stripAnsi(buffer[1])).toBe('B')
      expect(stripAnsi(buffer[2])).toBe('C')
    })

    it('animatedText() should create animated text', () => {
      const frames = ['>', '>>', '>>>', '>>>>']
      const component = animatedText(frames, 100)
      
      // Should render first frame initially
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('>')
    })
  })

  describe('Performance', () => {
    it('should handle large text efficiently', () => {
      const largeText = 'Lorem ipsum '.repeat(1000)
      const component = new Text({ content: largeText, wrap: true })
      
      const startTime = performance.now()
      component.render({ x: 0, y: 0, width: 80, height: 100 }, terminal)
      const endTime = performance.now()
      
      expect(endTime - startTime).toBeLessThan(100) // Should render in less than 100ms
    })

    it('should cache wrapped text calculations', () => {
      const component = new Text({ 
        content: 'This is text that needs wrapping',
        wrap: true
      })
      
      // First render
      component.render({ x: 0, y: 0, width: 10, height: 5 }, terminal)
      const firstOutput = terminal.getOutput()
      
      // Second render with same dimensions should use cache
      terminal.clear()
      const startTime = performance.now()
      component.render({ x: 0, y: 0, width: 10, height: 5 }, terminal)
      const endTime = performance.now()
      
      expect(endTime - startTime).toBeLessThan(1) // Should be nearly instant
      expect(terminal.getOutput()).toBe(firstOutput)
    })
  })
})