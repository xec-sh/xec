import { it, expect, describe, beforeEach } from 'vitest'

import { stripAnsi } from '../../../../src/test/index.js'
import { createMockTerminal } from '../../../../src/test/mock-terminal.js'
import {
  gap,
  Space,
  space,
  blank,
  vSpace,
  hSpace,
  indent,
  margin,
  offset,
  filler,
  padding,
  emptyLine,
  placeholder
} from '../../../../src/components/primitives/space.js'

describe('Space', () => {
  let terminal: ReturnType<typeof createMockTerminal>

  beforeEach(() => {
    terminal = createMockTerminal()
  })

  describe('Basic Space Rendering', () => {
    it('should render empty space by default', () => {
      const component = new Space({})
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('     ')
    })

    it('should render space with specified dimensions', () => {
      const component = new Space({ width: 3, height: 2 })
      component.render({ x: 0, y: 0, width: 3, height: 2 }, terminal)
      
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 3)).toBe('   ')
      expect(stripAnsi(buffer[1]).substring(0, 3)).toBe('   ')
    })

    it('should respect position', () => {
      const component = new Space({ width: 3, height: 1 })
      component.render({ x: 5, y: 2, width: 3, height: 1 }, terminal)
      
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[2]?.substring(5, 8) || '')).toBe('   ')
    })

    it('should fill with custom character', () => {
      const component = new Space({ fill: '·' })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('·····')
    })

    it('should fill multi-line space', () => {
      const component = new Space({ fill: '-' })
      component.render({ x: 0, y: 0, width: 3, height: 3 }, terminal)
      
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 3)).toBe('---')
      expect(stripAnsi(buffer[1]).substring(0, 3)).toBe('---')
      expect(stripAnsi(buffer[2]).substring(0, 3)).toBe('---')
    })

    it('should handle empty fill character', () => {
      const component = new Space({ fill: '' })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('     ')
    })

    it('should handle null fill character', () => {
      const component = new Space({ fill: null as any })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('     ')
    })
  })

  describe('Dimension Handling', () => {
    it('should use provided width over bounds width', () => {
      const component = new Space({ width: 3 })
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('   ')
    })

    it('should use provided height over bounds height', () => {
      const component = new Space({ height: 2 })
      component.render({ x: 0, y: 0, width: 5, height: 5 }, terminal)
      
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 5)).toBe('     ')
      expect(stripAnsi(buffer[1]).substring(0, 5)).toBe('     ')
      expect(stripAnsi(buffer[2] || '').trim()).toBe('')
    })

    it('should handle zero width', () => {
      const component = new Space({ width: 0 })
      component.render({ x: 0, y: 0, width: 0, height: 1 }, terminal)
      
      expect(stripAnsi(terminal.getOutput())).toBe('')
    })

    it('should handle zero height', () => {
      const component = new Space({ height: 0 })
      component.render({ x: 0, y: 0, width: 5, height: 0 }, terminal)
      
      expect(stripAnsi(terminal.getOutput())).toBe('')
    })

    it('should handle negative dimensions gracefully', () => {
      const component = new Space({ width: -5, height: -5 })
      component.render({ x: 0, y: 0, width: -5, height: -5 }, terminal)
      
      expect(stripAnsi(terminal.getOutput())).toBe('')
    })

    it('should handle very large dimensions', () => {
      const component = new Space({ width: 1000, height: 100 })
      component.render({ x: 0, y: 0, width: 1000, height: 100 }, terminal)
      
      const buffer = terminal.getBufferRaw()
      expect(buffer.length).toBeGreaterThanOrEqual(100)
      expect(stripAnsi(buffer[0]).length).toBe(1000)
    })

    it('should clamp to bounds when no dimensions specified', () => {
      const component = new Space({})
      component.render({ x: 0, y: 0, width: 7, height: 3 }, terminal)
      
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 7)).toBe('       ')
      expect(stripAnsi(buffer[1]).substring(0, 7)).toBe('       ')
      expect(stripAnsi(buffer[2]).substring(0, 7)).toBe('       ')
    })
  })

  describe('Fill Characters', () => {
    it('should fill with unicode characters', () => {
      const component = new Space({ fill: '█' })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('█████')
    })

    it('should fill with emoji', () => {
      const component = new Space({ fill: '🔥' })
      component.render({ x: 0, y: 0, width: 3, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('🔥🔥🔥')
    })

    it('should handle multi-character fill by using first character', () => {
      const component = new Space({ fill: 'abc' })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('aaaaa')
    })

    it('should fill with tab character', () => {
      const component = new Space({ fill: '\t' })
      component.render({ x: 0, y: 0, width: 3, height: 1 }, terminal)
      
      const output = terminal.getOutput()
      expect(output).toContain('\t')
    })

    it('should fill with newline character gracefully', () => {
      const component = new Space({ fill: '\n' })
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      
      // Newline should be treated as space
      const output = stripAnsi(terminal.getOutput())
      expect(output.length).toBe(5)
    })
  })

  describe('State Management', () => {
    it('should update fill character', () => {
      const component = new Space({ fill: '-' })
      
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('-----')
      
      terminal.clear()
      component.setFill('=')
      component.render({ x: 0, y: 0, width: 5, height: 1 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('=====')
    })

    it('should update dimensions', () => {
      const component = new Space({ width: 3, height: 1 })
      
      component.render({ x: 0, y: 0, width: 10, height: 10 }, terminal)
      expect(stripAnsi(terminal.getOutput())).toBe('   ')
      
      terminal.clear()
      component.setDimensions(5, 2)
      component.render({ x: 0, y: 0, width: 10, height: 10 }, terminal)
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 5)).toBe('     ')
      expect(stripAnsi(buffer[1]).substring(0, 5)).toBe('     ')
    })

    it('should handle multiple state updates', () => {
      const component = new Space({})
      
      component.setFill('*')
      component.setDimensions(4, 2)
      component.render({ x: 0, y: 0, width: 10, height: 10 }, terminal)
      
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 4)).toBe('****')
      expect(stripAnsi(buffer[1]).substring(0, 4)).toBe('****')
    })
  })

  describe('Edge Cases', () => {
    it('should handle rendering at negative positions', () => {
      const component = new Space({ width: 5, height: 1, fill: 'x' })
      component.render({ x: -2, y: -1, width: 5, height: 1 }, terminal)
      
      // Should handle gracefully without crashing
      const buffer = terminal.getBufferRaw()
      expect(buffer).toBeDefined()
    })

    it('should handle very small dimensions', () => {
      const component = new Space({ width: 1, height: 1, fill: '@' })
      component.render({ x: 0, y: 0, width: 1, height: 1 }, terminal)
      
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('@')
    })

    it('should handle dimension changes during lifecycle', () => {
      const component = new Space({ width: 2, height: 2, fill: 'a' })
      
      component.render({ x: 0, y: 0, width: 10, height: 10 }, terminal)
      let buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 2)).toBe('aa')
      expect(stripAnsi(buffer[1]).substring(0, 2)).toBe('aa')
      
      terminal.clear()
      component.setDimensions(3, 1)
      component.render({ x: 0, y: 0, width: 10, height: 10 }, terminal)
      buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 3)).toBe('aaa')
      expect(stripAnsi(buffer[1] || '').trim()).toBe('')
    })

    it('should handle special ANSI sequences in fill', () => {
      const component = new Space({ fill: '\x1b[31mR\x1b[0m' })
      component.render({ x: 0, y: 0, width: 3, height: 1 }, terminal)
      
      // Should only use the visible character
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('RRR')
    })
  })

  describe('Factory Functions', () => {
    it('space() should create space with dimensions', () => {
      const component = space(5, 2)
      expect(component).toBeInstanceOf(Space)
      
      component.render({ x: 0, y: 0, width: 10, height: 10 }, terminal)
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 5)).toBe('     ')
      expect(stripAnsi(buffer[1]).substring(0, 5)).toBe('     ')
    })

    it('vSpace() should create vertical space', () => {
      const component = vSpace(3)
      
      component.render({ x: 0, y: 0, width: 5, height: 10 }, terminal)
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 5)).toBe('     ')
      expect(stripAnsi(buffer[1]).substring(0, 5)).toBe('     ')
      expect(stripAnsi(buffer[2]).substring(0, 5)).toBe('     ')
      expect(stripAnsi(buffer[3] || '').trim()).toBe('')
    })

    it('hSpace() should create horizontal space', () => {
      const component = hSpace(7)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('       ')
    })

    it('emptyLine() should create single empty line', () => {
      const component = emptyLine()
      
      component.render({ x: 0, y: 0, width: 10, height: 10 }, terminal)
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 10)).toBe('          ')
      expect(stripAnsi(buffer[1] || '').trim()).toBe('')
    })

    it('blank() should create blank area', () => {
      const component = blank(4, 2)
      
      component.render({ x: 0, y: 0, width: 10, height: 10 }, terminal)
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 4)).toBe('    ')
      expect(stripAnsi(buffer[1]).substring(0, 4)).toBe('    ')
    })

    it('gap() should create gap with custom fill', () => {
      const component = gap(5, '·')
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('·····')
    })

    it('indent() should create indentation', () => {
      const component = indent(4)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('    ')
    })

    it('padding() should create padding area', () => {
      const component = padding(2, 3)
      
      component.render({ x: 0, y: 0, width: 10, height: 10 }, terminal)
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 2)).toBe('  ')
      expect(stripAnsi(buffer[1]).substring(0, 2)).toBe('  ')
      expect(stripAnsi(buffer[2]).substring(0, 2)).toBe('  ')
    })

    it('margin() should create margin area', () => {
      const component = margin(3, 2)
      
      component.render({ x: 0, y: 0, width: 10, height: 10 }, terminal)
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 3)).toBe('   ')
      expect(stripAnsi(buffer[1]).substring(0, 3)).toBe('   ')
    })

    it('offset() should create offset space', () => {
      const component = offset(5)
      
      component.render({ x: 0, y: 0, width: 10, height: 1 }, terminal)
      const output = stripAnsi(terminal.getOutput())
      expect(output).toBe('     ')
    })

    it('filler() should create filler with character', () => {
      const component = filler(6, 2, '=')
      
      component.render({ x: 0, y: 0, width: 10, height: 10 }, terminal)
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 6)).toBe('======')
      expect(stripAnsi(buffer[1]).substring(0, 6)).toBe('======')
    })

    it('placeholder() should create placeholder area', () => {
      const component = placeholder(8, 3, '?')
      
      component.render({ x: 0, y: 0, width: 10, height: 10 }, terminal)
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 8)).toBe('????????')
      expect(stripAnsi(buffer[1]).substring(0, 8)).toBe('????????')
      expect(stripAnsi(buffer[2]).substring(0, 8)).toBe('????????')
    })
  })

  describe('Performance', () => {
    it('should handle large areas efficiently', () => {
      const component = new Space({ width: 1000, height: 100, fill: 'x' })
      
      const startTime = performance.now()
      component.render({ x: 0, y: 0, width: 1000, height: 100 }, terminal)
      const endTime = performance.now()
      
      expect(endTime - startTime).toBeLessThan(100) // Should render in less than 100ms
    })

    it('should cache fill patterns', () => {
      const component = new Space({ width: 100, height: 10, fill: '*' })
      
      // First render
      component.render({ x: 0, y: 0, width: 100, height: 10 }, terminal)
      
      // Second render should use cached pattern
      terminal.clear()
      const startTime = performance.now()
      component.render({ x: 0, y: 0, width: 100, height: 10 }, terminal)
      const endTime = performance.now()
      
      expect(endTime - startTime).toBeLessThan(5) // Should be very fast
    })

    it('should handle repeated renders efficiently', () => {
      const component = new Space({ width: 50, height: 20, fill: '~' })
      
      const startTime = performance.now()
      for (let i = 0; i < 100; i++) {
        terminal.clear()
        component.render({ x: 0, y: 0, width: 50, height: 20 }, terminal)
      }
      const endTime = performance.now()
      
      const avgTime = (endTime - startTime) / 100
      expect(avgTime).toBeLessThan(1) // Each render should be less than 1ms
    })
  })

  describe('Integration', () => {
    it('should work with different terminal sizes', () => {
      const component = new Space({ fill: '#' })
      
      // Small terminal
      component.render({ x: 0, y: 0, width: 10, height: 5 }, terminal)
      let buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 10)).toBe('##########')
      expect(buffer.length).toBeGreaterThanOrEqual(5)
      
      // Large terminal
      terminal.clear()
      component.render({ x: 0, y: 0, width: 80, height: 24 }, terminal)
      buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).length).toBe(80)
      expect(buffer.length).toBeGreaterThanOrEqual(24)
    })

    it('should handle partial rendering', () => {
      const component = new Space({ width: 5, height: 3, fill: '@' })
      
      // Render in middle of terminal
      component.render({ x: 10, y: 5, width: 5, height: 3 }, terminal)
      
      const buffer = terminal.getBufferRaw()
      expect(buffer[5]?.substring(10, 15)).toBe('@@@@@')
      expect(buffer[6]?.substring(10, 15)).toBe('@@@@@')
      expect(buffer[7]?.substring(10, 15)).toBe('@@@@@')
    })

    it('should handle overlapping renders', () => {
      const component1 = new Space({ width: 5, height: 2, fill: 'a' })
      const component2 = new Space({ width: 5, height: 2, fill: 'b' })
      
      component1.render({ x: 0, y: 0, width: 5, height: 2 }, terminal)
      component2.render({ x: 3, y: 1, width: 5, height: 2 }, terminal)
      
      const buffer = terminal.getBufferRaw()
      expect(stripAnsi(buffer[0]).substring(0, 5)).toBe('aaaaa')
      expect(stripAnsi(buffer[1]).substring(0, 3)).toBe('aaa')
      expect(stripAnsi(buffer[1]).substring(3, 8)).toBe('bbbbb')
      expect(stripAnsi(buffer[2]).substring(3, 8)).toBe('bbbbb')
    })
  })
})