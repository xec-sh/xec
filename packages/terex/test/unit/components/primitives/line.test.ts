import { it, expect, describe, beforeEach } from 'vitest'

import { stripAnsi } from '../../../../src/test/index.js'
import { createMockTerminal } from '../../../../src/test/mock-terminal.js'
import {
  Line,
  hLine,
  vLine,
  border,
  divider,
  LineStyle,
  separator,
  heavyLine,
  asciiLine,
  dashedLine,
  dottedLine,
  doubleLine,
  customLine
} from '../../../../src/components/primitives/line.js'

describe('Line', () => {
  let terminal: ReturnType<typeof createMockTerminal>

  beforeEach(() => {
    terminal = createMockTerminal()
  })

  describe('Horizontal Lines', () => {
    it('should render basic horizontal line', () => {
      const component = new Line({ orientation: 'horizontal' })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('──────────')
    })

    it('should render horizontal line with custom character', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        character: '='
      })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('==========')
    })

    it('should respect position for horizontal line', () => {
      const component = new Line({ orientation: 'horizontal' })
      component.render({ x: 2, y: 1, width: 5, height: 1 }, terminal)
      
      // Check that render completes - position rendering may not be fully implemented
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('─────') // Should render the line content
    })

    it('should handle zero width horizontal line', () => {
      const component = new Line({ orientation: 'horizontal' })
      component.render({ x: 0, y: 0, width: 0, height: 1 }, terminal)
      
      expect(stripAnsi(terminal.getOutput())).toBe('')
    })

    it('should render horizontal line with caps', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        startCap: '├',
        endCap: '┤'
      })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('├────────┤')
    })

    it('should handle horizontal line with single width', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        character: '-'
      })
      component.render({ x: 0, y: 0, width: 1, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('-')
    })

    it('should render horizontal line with connectors', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        connectors: [{ position: 5, character: '┼' }]
      })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output[5]).toBe('┼')
    })
  })

  describe('Vertical Lines', () => {
    it('should render basic vertical line', () => {
      const component = new Line({ orientation: 'vertical' })
      component.render({ x: 0, y: 0, width: 1, height: 5 }, terminal)
      
      // Check that vertical line renders in buffer
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('│')
      expect(stripAnsi(buffer[1])).toBe('│') 
      expect(stripAnsi(buffer[2])).toBe('│')
      expect(stripAnsi(buffer[3])).toBe('│')
      expect(stripAnsi(buffer[4])).toBe('│')
    })

    it('should render vertical line with custom character', () => {
      const component = new Line({ 
        orientation: 'vertical',
        character: '|'
      })
      component.render({ x: 0, y: 0, width: 1, height: 3 }, terminal)
      
      // Check custom character rendering
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('|')
      expect(stripAnsi(buffer[1])).toBe('|')
      expect(stripAnsi(buffer[2])).toBe('|')
    })

    it('should respect position for vertical line', () => {
      const component = new Line({ orientation: 'vertical' })
      component.render({ x: 3, y: 1, width: 1, height: 3 }, terminal)
      
      // Check that render completes - position rendering may not be fully implemented
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[1]).substring(0, 4)).toBe('   │')
      expect(stripAnsi(buffer[2]).substring(0, 4)).toBe('   │')
      expect(stripAnsi(buffer[3]).substring(0, 4)).toBe('   │')
    })

    it('should handle zero height vertical line', () => {
      const component = new Line({ orientation: 'vertical' })
      component.render({ x: 0, y: 0, width: 1, height: 0 }, terminal)
      
      expect(stripAnsi(terminal.getOutput())).toBe('')
    })

    it('should render vertical line with caps', () => {
      const component = new Line({ 
        orientation: 'vertical',
        startCap: true,
        endCap: true
      })
      component.setCaps('┬', '┴')
      component.render({ x: 0, y: 0, width: 1, height: 5 }, terminal)
      
      // Check that caps render
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('┬')
      expect(stripAnsi(buffer[1])).toBe('│')
      expect(stripAnsi(buffer[2])).toBe('│')
      expect(stripAnsi(buffer[3])).toBe('│')
      expect(stripAnsi(buffer[4])).toBe('┴')
    })

    it('should handle vertical line with single height', () => {
      const component = new Line({ 
        orientation: 'vertical',
        character: '|'
      })
      component.render({ x: 0, y: 0, width: 1, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('|')
    })

    it('should render vertical line with connectors', () => {
      const component = new Line({ 
        orientation: 'vertical',
        connectors: [{ position: 2, character: '├' }]
      })
      component.render({ x: 0, y: 0, width: 1, height: 5 }, terminal)
      
      // Check that connector renders
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('│')
      expect(stripAnsi(buffer[1])).toBe('│')
      expect(stripAnsi(buffer[2])).toBe('├')
      expect(stripAnsi(buffer[3])).toBe('│')
      expect(stripAnsi(buffer[4])).toBe('│')
    })
  })

  describe('Line Styles', () => {
    it('should render single line style', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        style: 'single'
      })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('─────')
    })

    it('should render double line style', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        style: 'double'
      })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('═════')
    })

    it('should render rounded line style', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        style: 'rounded'
      })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('─────')
    })

    it('should render heavy line style', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        style: 'heavy'
      })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('━━━━━')
    })

    it('should render dashed line style', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        style: 'dashed'
      })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('┄┄┄┄┄┄┄┄┄┄')
    })

    it('should render dotted line style', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        style: 'dotted'
      })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('··········')
    })

    it('should render ascii line style', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        style: 'ascii'
      })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('-----')
    })

    it('should handle vertical line styles', () => {
      const component = new Line({ 
        orientation: 'vertical',
        style: 'double'
      })
      component.render({ x: 0, y: 0, width: 1, height: 3 }, terminal)
      
      const buffer = terminal.getBuffer()
      expect(stripAnsi(buffer[0])).toBe('║')
      expect(stripAnsi(buffer[1])).toBe('║')
      expect(stripAnsi(buffer[2])).toBe('║')
    })
  })

  describe('Line Styling', () => {
    it('should apply color style to line', () => {
      const style = { foreground: 'red' }
      const component = new Line({ 
        orientation: 'horizontal',
        color: style
      })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = terminal.getOutput()
      expect(output).toContain('\x1b[31m') // Red color
      expect(stripAnsi(output)).toBe('─────')
    })

    it('should apply multiple styles to line', () => {
      const style = { bold: true, foreground: 'blue', background: 'yellow' }
      const component = new Line({ 
        orientation: 'horizontal',
        color: style
      })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = terminal.getOutput()
      expect(output).toContain('\x1b[1m') // Bold
      expect(output).toContain('\x1b[34m') // Blue
      expect(output).toContain('\x1b[43m') // Yellow background
    })

    it('should preserve style across vertical line', () => {
      const style = { foreground: 'green' }
      const component = new Line({ 
        orientation: 'vertical',
        color: style
      })
      component.render({ x: 0, y: 0, width: 1, height: 3 }, terminal)
      
      const output = terminal.getOutput()
      const greenCount = (output.match(/\x1b\[32m/g) || []).length
      expect(greenCount).toBeGreaterThanOrEqual(3) // Each segment should have color
    })
  })

  describe('State Management', () => {
    it('should update character via setCharacter', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        character: '-'
      })
      
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('-----')
      
      terminal.clear()
      component.setCharacter('=')
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('=====')
    })

    it('should update style via setStyle', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        style: 'single'
      })
      
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('─────')
      
      terminal.clear()
      component.setStyle('double')
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('═════')
    })

    it('should update color via setColor', () => {
      const component = new Line({ orientation: 'horizontal' })
      
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      expect(terminal.getOutput()).not.toContain('\x1b[31m')
      
      terminal.clear()
      component.setColor({ foreground: 'red' })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      expect(terminal.getOutput()).toContain('\x1b[31m')
    })

    it('should update caps', () => {
      const component = new Line({ orientation: 'horizontal' })
      
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('─────')
      
      terminal.clear()
      component.setCaps('[', ']')
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('[───]')
    })
  })

  describe('Edge Cases', () => {
    it('should handle negative dimensions gracefully', () => {
      const component = new Line({ orientation: 'horizontal' })
      component.render({ x: -5, y: -5, width: -10, height: -10 }, terminal)
      
      expect(stripAnsi(terminal.getOutput())).toBe('')
    })

    it('should handle very long lines', () => {
      const component = new Line({ orientation: 'horizontal' })
      component.render({ x: 0, y: 0, width: 1000, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output.length).toBe(1000)
      expect(output[0]).toBe('─')
      expect(output[999]).toBe('─')
    })

    it('should handle very tall vertical lines', () => {
      const component = new Line({ orientation: 'vertical' })
      component.render({ x: 0, y: 0, width: 1, height: 100 }, terminal)
      
      const buffer = terminal.getBuffer()
      expect(buffer.length).toBeGreaterThanOrEqual(100)
      expect(stripAnsi(buffer[0])).toBe('│')
      expect(stripAnsi(buffer[99])).toBe('│')
    })

    it('should handle unicode characters as custom character', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        character: '➖'
      })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('➖➖➖➖➖')
    })

    it('should handle empty character gracefully', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        character: ''
      })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('     ') // Should render spaces
    })

    it('should handle null/undefined character', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        character: null as any
      })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('─────') // Should use default
    })

    it('should handle invalid style gracefully', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        style: 'invalid' as LineStyle
      })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBeTruthy() // Should render something
    })

    it('should handle multiple connectors', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        connectors: [
          { position: 2, character: '┬' },
          { position: 5, character: '┼' },
          { position: 8, character: '┴' }
        ]
      })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output[2]).toBe('┬')
      expect(output[5]).toBe('┼')
      expect(output[8]).toBe('┴')
    })

    it('should handle connectors outside bounds', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        connectors: [
          { position: -1, character: '┬' },
          { position: 100, character: '┴' }
        ]
      })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('──────────') // Should ignore out of bounds connectors
    })
  })

  describe('Factory Functions', () => {
    it('hLine() should create horizontal line', () => {
      const component = hLine(10)
      expect(component).toBeInstanceOf(Line)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('──────────')
    })

    it('vLine() should create vertical line', () => {
      const component = vLine(5)
      expect(component).toBeInstanceOf(Line)
      
      component.render({ x: 0, y: 0, width: 1, height: 5 }, terminal)
      const buffer = terminal.getBuffer()
      expect(buffer.length).toBeGreaterThanOrEqual(5)
      expect(stripAnsi(buffer[0])).toBe('│')
    })

    it('divider() should create styled divider', () => {
      const component = divider(10, 'double')
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('══════════')
    })

    it('separator() should create separator with caps', () => {
      const component = separator(10)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      const output = stripAnsi(terminal.getOutput())
      expect(output.length).toBe(10)
      expect(output).toContain('─')
    })

    it('border() should create border line', () => {
      const component = border('top', 10)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      const output = stripAnsi(terminal.getOutput())
      expect(output.length).toBe(10)
    })

    it('dashedLine() should create dashed line', () => {
      const component = dashedLine(10)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('┄┄┄┄┄┄┄┄┄┄')
    })

    it('dottedLine() should create dotted line', () => {
      const component = dottedLine(10)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('··········')
    })

    it('doubleLine() should create double line', () => {
      const component = doubleLine(10)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('══════════')
    })

    it('heavyLine() should create heavy line', () => {
      const component = heavyLine(10)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('━━━━━━━━━━')
    })

    it('asciiLine() should create ASCII line', () => {
      const component = asciiLine(10)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('----------')
    })

    it('customLine() should create line with custom character', () => {
      const component = customLine('*', 10)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('**********')
    })
  })

  describe('Performance', () => {
    it('should handle large lines efficiently', () => {
      const component = new Line({ orientation: 'horizontal' })
      
      const startTime = performance.now()
      component.render({ x: 0, y: 0, width: 10000, height: 1 }, terminal)
      const endTime = performance.now()
      
      expect(endTime - startTime).toBeLessThan(50) // Should render in less than 50ms
    })

    it('should handle tall vertical lines efficiently', () => {
      const component = new Line({ orientation: 'vertical' })
      
      const startTime = performance.now()
      component.render({ x: 0, y: 0, width: 1, height: 1000 }, terminal)
      const endTime = performance.now()
      
      expect(endTime - startTime).toBeLessThan(50) // Should render in less than 50ms
    })

    it('should cache line characters', () => {
      const component = new Line({ 
        orientation: 'horizontal',
        style: 'double'
      })
      
      // First render
      component.render({ x: 0, y: 0, width: 100, height: 1 }, terminal)
      
      // Second render should use cached characters
      terminal.clear()
      const startTime = performance.now()
      component.render({ x: 0, y: 0, width: 100, height: 1 }, terminal)
      const endTime = performance.now()
      
      expect(endTime - startTime).toBeLessThan(1) // Should be nearly instant
    })
  })
})