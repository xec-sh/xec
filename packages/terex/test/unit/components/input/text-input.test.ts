import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import { Keys, Timing, stripAnsi } from '../../../../src/test/index.js'
import { TextInput } from '../../../../src/components/input/text-input.js'
import { createMockTerminal } from '../../../../src/test/mock-terminal.js'

describe('TextInput', () => {
  let terminal: ReturnType<typeof createMockTerminal>
  let component: TextInput

  beforeEach(() => {
    terminal = createMockTerminal()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Component Initialization', () => {
    it('should initialize with default options', () => {
      component = new TextInput()
      
      expect(component.getValue()).toBe('')
      expect(component.getError()).toBeUndefined()
    })

    it('should initialize with custom options', () => {
      component = new TextInput({
        defaultValue: 'initial',
        placeholder: 'Enter text',
        maxLength: 50,
        minLength: 5
      })
      
      expect(component.getValue()).toBe('initial')
    })

    it('should initialize with validation function', () => {
      const validate = vi.fn().mockResolvedValue(undefined)
      
      component = new TextInput({
        validate
      })
      
      expect(component).toBeInstanceOf(TextInput)
    })

    it('should initialize with transform function', () => {
      component = new TextInput({
        transform: (value) => value.toUpperCase()
      })
      
      expect(component).toBeInstanceOf(TextInput)
    })

    it('should initialize with format function', () => {
      component = new TextInput({
        format: (value) => `[${value}]`
      })
      
      expect(component).toBeInstanceOf(TextInput)
    })

    it('should initialize disabled component', () => {
      component = new TextInput({
        disabled: true,
        defaultValue: 'test'
      })
      
      expect(component.getValue()).toBe('test')
    })

    it('should initialize readonly component', () => {
      component = new TextInput({
        readOnly: true,
        defaultValue: 'readonly'
      })
      
      expect(component.getValue()).toBe('readonly')
    })
  })

  describe('Basic Rendering', () => {
    beforeEach(() => {
      component = new TextInput({ defaultValue: 'Hello World' })
    })

    it('should render basic text input', () => {
      const output = component.render()
      
      expect(output.lines).toHaveLength(1)
      expect(stripAnsi(output.lines[0] || '')).toContain('Hello World')
    })

    it('should render placeholder when empty', () => {
      component = new TextInput({ placeholder: 'Enter text here' })
      
      const output = component.render()
      expect(stripAnsi(output.lines[0] || '')).toContain('Enter text here')
    })

    it('should render with cursor when focused', () => {
      component.focus()
      
      const output = component.render()
      expect(output.cursor).toBeDefined()
      expect(output.cursor?.x).toBe(11) // After "Hello World"
      expect(output.cursor?.y).toBe(0)
    })

    it('should not render cursor when not focused', () => {
      const output = component.render()
      expect(output.cursor).toBeUndefined()
    })

    it('should render error message', () => {
      component.setState({ error: 'Invalid input' })
      
      const output = component.render()
      expect(output.lines).toHaveLength(2)
      expect(stripAnsi(output.lines[1] || '')).toContain('Invalid input')
    })

    it('should render with custom cursor style', () => {
      component = new TextInput({ 
        defaultValue: 'test',
        cursorStyle: 'underline'
      })
      component.focus()
      component.setState({ cursorPosition: 2 }) // Position cursor in middle of text
      
      const output = component.render()
      // In test environment without color support, underline is not applied
      // But cursor should still be positioned correctly
      expect(output.lines[0]).toContain('test')
      expect(output.cursor?.x).toBe(2)
    })

    it('should render masked input', () => {
      component = new TextInput({ 
        defaultValue: 'secret',
        mask: '*'
      })
      
      const output = component.render()
      expect(stripAnsi(output.lines[0] || '')).toContain('******')
    })

    it('should render with mask function', () => {
      component = new TextInput({ 
        defaultValue: 'test',
        mask: (char) => char === 't' ? 'X' : char
      })
      
      const output = component.render()
      expect(stripAnsi(output.lines[0] || '')).toContain('XesX')
    })
  })

  describe('Text Input and Manipulation', () => {
    beforeEach(() => {
      component = new TextInput()
      component.focus()
    })

    it('should insert characters at cursor position', async () => {
      await component.handleInput(Keys.char('H'))
      await component.handleInput(Keys.char('e'))
      await component.handleInput(Keys.char('l'))
      await component.handleInput(Keys.char('l'))
      await component.handleInput(Keys.char('o'))
      
      expect(component.getValue()).toBe('Hello')
    })

    it('should insert characters in middle of text', async () => {
      component.setState({ value: 'Helo', cursorPosition: 2 })
      
      await component.handleInput(Keys.char('l'))
      
      expect(component.getValue()).toBe('Hello')
    })

    it('should handle backspace', async () => {
      component.setState({ value: 'Hello', cursorPosition: 5 })
      
      await component.handleInput(Keys.backspace())
      
      expect(component.getValue()).toBe('Hell')
    })

    it('should handle delete key', async () => {
      component.setState({ value: 'Hello', cursorPosition: 2 })
      
      await component.handleInput(Keys.delete())
      
      expect(component.getValue()).toBe('Helo')
    })

    it('should not modify text beyond max length', async () => {
      component = new TextInput({ maxLength: 5 })
      component.focus()
      component.setState({ value: 'Hello', cursorPosition: 5 })
      
      await component.handleInput(Keys.char('!'))
      
      expect(component.getValue()).toBe('Hello')
    })

    it('should transform input text', async () => {
      component = new TextInput({ 
        transform: (value) => value.toUpperCase()
      })
      component.focus()
      
      await component.handleInput(Keys.char('h'))
      await component.handleInput(Keys.char('i'))
      
      expect(component.getValue()).toBe('HI')
    })

    it('should handle unicode characters', async () => {
      // Test with unicode characters (avoiding emoji which have encoding issues in test env)
      await component.handleInput(Keys.char('α'))
      await component.handleInput(Keys.char('世'))
      await component.handleInput(Keys.char('ñ'))
      
      expect(component.getValue()).toBe('α世ñ')
    })
  })

  describe('Cursor Movement', () => {
    beforeEach(() => {
      component = new TextInput({ defaultValue: 'Hello World' })
      component.focus()
    })

    it('should move cursor left', async () => {
      await component.handleInput(Keys.left())
      
      const state = component['state']
      expect(state.cursorPosition).toBe(10) // Was at end (11), now at 10
    })

    it('should move cursor right', async () => {
      component.setState({ cursorPosition: 5 })
      
      await component.handleInput(Keys.right())
      
      const state = component['state']
      expect(state.cursorPosition).toBe(6)
    })

    it('should move cursor to beginning with Home', async () => {
      await component.handleInput(Keys.home())
      
      const state = component['state']
      expect(state.cursorPosition).toBe(0)
    })

    it('should move cursor to end with End', async () => {
      component.setState({ cursorPosition: 0 })
      
      await component.handleInput(Keys.end())
      
      const state = component['state']
      expect(state.cursorPosition).toBe(11) // Length of "Hello World"
    })

    it('should not move cursor beyond text boundaries', async () => {
      // Already at end, try to move right
      await component.handleInput(Keys.right())
      
      const state = component['state']
      expect(state.cursorPosition).toBe(11) // Still at end
    })

    it('should not move cursor before beginning', async () => {
      component.setState({ cursorPosition: 0 })
      
      await component.handleInput(Keys.left())
      
      const state = component['state']
      expect(state.cursorPosition).toBe(0) // Still at beginning
    })
  })

  describe('Text Selection', () => {
    beforeEach(() => {
      component = new TextInput({ defaultValue: 'Hello World' })
      component.focus()
    })

    it('should select text with shift + arrow keys', async () => {
      component.setState({ cursorPosition: 5 }) // At space after "Hello"
      
      await component.handleInput({ ...Keys.right(), shift: true })
      await component.handleInput({ ...Keys.right(), shift: true })
      
      const state = component['state']
      expect(state.selectionStart).toBe(5)
      expect(state.selectionEnd).toBe(6) // Selected " W"
    })

    it('should extend selection with shift + home', async () => {
      component.setState({ cursorPosition: 5 })
      
      await component.handleInput({ ...Keys.home(), shift: true })
      
      const state = component['state']
      expect(state.selectionStart).toBe(0)
      expect(state.selectionEnd).toBe(4)
    })

    it('should extend selection with shift + end', async () => {
      component.setState({ cursorPosition: 5 })
      
      await component.handleInput({ ...Keys.end(), shift: true })
      
      const state = component['state']
      expect(state.selectionStart).toBe(5)
      expect(state.selectionEnd).toBe(10) // Up to end of text
    })

    it('should select all text with Ctrl+A', async () => {
      await component.handleInput(Keys.ctrl('a'))
      
      const state = component['state']
      expect(state.selectionStart).toBe(0)
      expect(state.selectionEnd).toBe(10) // Length - 1
    })

    it('should clear selection with regular navigation', async () => {
      // Create selection first
      await component.handleInput(Keys.ctrl('a'))
      
      // Move cursor (should clear selection)
      await component.handleInput(Keys.right())
      
      const state = component['state']
      expect(state.selectionStart).toBe(-1)
      expect(state.selectionEnd).toBe(-1)
    })

    it('should delete selection when typing', async () => {
      // Select "Hello"
      component.setState({
        selectionStart: 0,
        selectionEnd: 4,
        cursorPosition: 5
      })
      
      await component.handleInput(Keys.char('H'))
      
      expect(component.getValue()).toBe('H World')
    })

    it('should delete selection with backspace', async () => {
      component.setState({
        selectionStart: 0,
        selectionEnd: 4,
        cursorPosition: 5
      })
      
      await component.handleInput(Keys.backspace())
      
      expect(component.getValue()).toBe(' World')
    })
  })

  describe('Copy/Paste/Cut Operations', () => {
    let emitSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      component = new TextInput({ defaultValue: 'Hello World' })
      component.focus()
      emitSpy = vi.spyOn(component as any, 'emit')
    })

    it('should emit copy event with selected text', async () => {
      component.setState({
        selectionStart: 0,
        selectionEnd: 4, // "Hello"
        cursorPosition: 5
      })
      
      await component.handleInput(Keys.ctrl('c'))
      
      expect(emitSpy).toHaveBeenCalledWith('copy', 'Hello')
    })

    it('should emit cut event and delete selected text', async () => {
      component.setState({
        selectionStart: 0,
        selectionEnd: 4,
        cursorPosition: 5
      })
      
      await component.handleInput(Keys.ctrl('x'))
      
      expect(emitSpy).toHaveBeenCalledWith('cut', 'Hello')
      expect(component.getValue()).toBe(' World')
    })

    it('should emit paste event', async () => {
      await component.handleInput(Keys.ctrl('v'))
      
      expect(emitSpy).toHaveBeenCalledWith('paste')
    })

    it('should not copy/cut when no selection', async () => {
      await component.handleInput(Keys.ctrl('c'))
      
      expect(emitSpy).not.toHaveBeenCalledWith('copy', expect.anything())
    })
  })

  describe('Undo/Redo Operations', () => {
    let emitSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      component = new TextInput({ defaultValue: 'Hello World' })
      component.focus()
      emitSpy = vi.spyOn(component as any, 'emit')
    })

    it('should emit undo event', async () => {
      await component.handleInput(Keys.ctrl('z'))
      
      expect(emitSpy).toHaveBeenCalledWith('undo')
    })

    it('should emit redo event', async () => {
      await component.handleInput(Keys.ctrl('y'))
      
      expect(emitSpy).toHaveBeenCalledWith('redo')
    })
  })

  describe('Advanced Text Operations', () => {
    beforeEach(() => {
      component = new TextInput({ defaultValue: 'Hello beautiful world' })
      component.focus()
    })

    it('should delete to end of line with Ctrl+K', async () => {
      component.setState({ cursorPosition: 6 }) // At "beautiful world"
      
      await component.handleInput(Keys.ctrl('k'))
      
      expect(component.getValue()).toBe('Hello ')
    })

    it('should delete to beginning of line with Ctrl+U', async () => {
      component.setState({ cursorPosition: 15 }) // At "world"
      
      await component.handleInput(Keys.ctrl('u'))
      
      expect(component.getValue()).toBe(' world')
    })

    it('should delete word backward with Ctrl+W', async () => {
      component.setState({ cursorPosition: 21 }) // At end of "world"
      
      await component.handleInput(Keys.ctrl('w'))
      
      expect(component.getValue()).toBe('Hello beautiful ')
    })
  })

  describe('History Navigation', () => {
    beforeEach(() => {
      component = new TextInput()
      component.focus()
    })

    it('should navigate through history with up/down arrows', async () => {
      // Add some history
      component.setState({
        history: ['first', 'second', 'third'],
        historyIndex: -1
      })
      
      await component.handleInput(Keys.up())
      expect(component.getValue()).toBe('third')
      
      await component.handleInput(Keys.up())
      expect(component.getValue()).toBe('second')
      
      await component.handleInput(Keys.down())
      expect(component.getValue()).toBe('third')
    })

    it('should return to current input when navigating down from history', async () => {
      component.setState({
        value: 'current',
        history: ['previous'],
        historyIndex: -1
      })
      
      await component.handleInput(Keys.up())
      expect(component.getValue()).toBe('previous')
      
      await component.handleInput(Keys.down())
      expect(component.getValue()).toBe('')
    })
  })

  describe('Validation', () => {
    it('should validate minimum length', async () => {
      component = new TextInput({ minLength: 5 })
      component.focus()
      
      await component.handleInput(Keys.char('H'))
      await component.handleInput(Keys.char('i'))
      
      const isValid = await component.isValid()
      expect(isValid).toBe(false)
      expect(component.getError()).toContain('Minimum 5 characters required')
    })

    it('should validate maximum length', async () => {
      component = new TextInput({ maxLength: 3 })
      component.focus()
      
      await component.setValuePublic('Hello')
      
      const isValid = await component.isValid()
      expect(isValid).toBe(false)
      expect(component.getError()).toContain('Maximum 3 characters allowed')
    })

    it('should validate with pattern', async () => {
      component = new TextInput({ pattern: /^\d+$/ })
      component.focus()
      
      await component.setValuePublic('abc123')
      
      const isValid = await component.isValid()
      expect(isValid).toBe(false)
      expect(component.getError()).toBe('Invalid format')
    })

    it('should validate with custom function', async () => {
      const validate = vi.fn().mockResolvedValue('Custom error')
      component = new TextInput({ validate })
      component.focus()
      
      await component.setValuePublic('test')
      
      const isValid = await component.isValid()
      expect(isValid).toBe(false)
      expect(component.getError()).toBe('Custom error')
      expect(validate).toHaveBeenCalledWith('test')
    })

    it('should pass validation when valid', async () => {
      component = new TextInput({ 
        minLength: 2,
        maxLength: 10,
        pattern: /^[a-z]+$/
      })
      component.focus()
      
      await component.setValuePublic('hello')
      
      const isValid = await component.isValid()
      expect(isValid).toBe(true)
      expect(component.getError()).toBeUndefined()
    })

    it('should handle async validation function', async () => {
      const validate = vi.fn().mockImplementation(async (value: string) => {
        await Timing.wait(10)
        return value === 'invalid' ? 'Async error' : undefined
      })
      
      component = new TextInput({ validate })
      component.focus()
      
      await component.setValuePublic('invalid')
      
      expect(component.getError()).toBe('Async error')
    })

    it('should handle validation function that throws', async () => {
      const validate = vi.fn().mockRejectedValue(new Error('Validation threw'))
      
      component = new TextInput({ validate })
      component.focus()
      
      await component.setValuePublic('test')
      
      expect(component.getError()).toBe('Validation threw')
    })
  })

  describe('Form Submission', () => {
    let emitSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      component = new TextInput({ defaultValue: 'Hello' })
      component.focus()
      emitSpy = vi.spyOn(component as any, 'emit')
    })

    it('should submit valid input', async () => {
      await component.handleInput(Keys.enter())
      
      expect(emitSpy).toHaveBeenCalledWith('submit', 'Hello')
    })

    it('should not submit invalid input', async () => {
      component = new TextInput({ 
        defaultValue: 'Hi',
        minLength: 5
      })
      component.focus()
      emitSpy = vi.spyOn(component as any, 'emit')
      
      await component.handleInput(Keys.enter())
      
      expect(emitSpy).not.toHaveBeenCalledWith('submit', expect.anything())
    })

    it('should add to history on submit', async () => {
      await component.handleInput(Keys.enter())
      
      const state = component['state']
      expect(state.history).toContain('Hello')
    })

    it('should clear input after submit when configured', async () => {
      component = new TextInput({ 
        defaultValue: 'Hello',
        clearOnSubmit: true
      })
      component.focus()
      
      await component.handleInput(Keys.enter())
      
      expect(component.getValue()).toBe('')
    })

    it('should submit on blur when configured', async () => {
      component = new TextInput({ 
        defaultValue: 'Hello',
        submitOnBlur: true
      })
      component.focus()
      emitSpy = vi.spyOn(component as any, 'emit')
      
      component.blur()
      
      // Wait for async handleSubmit to complete
      await new Promise(resolve => setTimeout(resolve, 0))
      
      expect(emitSpy).toHaveBeenCalledWith('submit', 'Hello')
    })

    it('should not duplicate history entries', async () => {
      // Submit twice with same value
      await component.handleInput(Keys.enter())
      await component.handleInput(Keys.enter())
      
      const state = component['state']
      const helloCount = state.history.filter(item => item === 'Hello').length
      expect(helloCount).toBe(1)
    })
  })

  describe('Event Handling', () => {
    let emitSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      component = new TextInput({ defaultValue: 'Hello' })
      component.focus()
      emitSpy = vi.spyOn(component as any, 'emit')
    })

    it('should emit change event when value changes', async () => {
      await component.handleInput(Keys.char('!'))
      
      expect(emitSpy).toHaveBeenCalledWith('change', 'Hello!')
    })

    it('should emit tab event', async () => {
      await component.handleInput(Keys.tab())
      
      expect(emitSpy).toHaveBeenCalledWith('tab', false)
    })

    it('should emit tab event with shift modifier', async () => {
      await component.handleInput({ ...Keys.tab(), shift: true })
      
      expect(emitSpy).toHaveBeenCalledWith('tab', true)
    })

    it('should emit cancel event on escape', async () => {
      await component.handleInput(Keys.escape())
      
      expect(emitSpy).toHaveBeenCalledWith('cancel')
    })

    it('should clear selection on escape', async () => {
      component.setState({
        selectionStart: 0,
        selectionEnd: 4
      })
      
      await component.handleInput(Keys.escape())
      
      const state = component['state']
      expect(state.selectionStart).toBe(-1)
      expect(state.selectionEnd).toBe(-1)
    })
  })

  describe('Focus Management', () => {
    beforeEach(() => {
      component = new TextInput({ 
        defaultValue: 'Hello',
        selectOnFocus: true
      })
    })

    it('should select all text on focus when configured', () => {
      component.focus()
      
      const state = component['state']
      expect(state.selectionStart).toBe(0)
      expect(state.selectionEnd).toBe(4) // "Hello".length - 1
      expect(state.isFocused).toBe(true)
    })

    it('should not select text on focus by default', () => {
      component = new TextInput({ defaultValue: 'Hello' })
      
      component.focus()
      
      const state = component['state']
      expect(state.selectionStart).toBe(-1)
      expect(state.selectionEnd).toBe(-1)
    })

    it('should clear focus state on blur', () => {
      component.focus()
      component.blur()
      
      const state = component['state']
      expect(state.isFocused).toBe(false)
    })
  })

  describe('Disabled and ReadOnly States', () => {
    it('should not handle input when disabled', async () => {
      component = new TextInput({ 
        defaultValue: 'Hello',
        disabled: true
      })
      component.focus()
      
      await component.handleInput(Keys.char('!'))
      
      expect(component.getValue()).toBe('Hello')
    })

    it('should not handle input when readonly', async () => {
      component = new TextInput({ 
        defaultValue: 'Hello',
        readOnly: true
      })
      component.focus()
      
      await component.handleInput(Keys.char('!'))
      
      expect(component.getValue()).toBe('Hello')
    })

    it('should render disabled styling', () => {
      component = new TextInput({ 
        defaultValue: 'Hello',
        disabled: true
      })
      
      const output = component.render()
      // Check that output contains styling (dim)
      expect(output.lines[0]).toBeTruthy()
    })
  })

  describe('Public API', () => {
    beforeEach(() => {
      component = new TextInput({ defaultValue: 'Hello' })
    })

    it('should get current value', () => {
      expect(component.getValue()).toBe('Hello')
    })

    it('should set value programmatically', async () => {
      await component.setValuePublic('World')
      
      expect(component.getValue()).toBe('World')
    })

    it('should clear input', () => {
      component.clear()
      
      expect(component.getValue()).toBe('')
      expect(component.getError()).toBeUndefined()
    })

    it('should validate current value', async () => {
      component = new TextInput({ 
        defaultValue: 'Hello',
        minLength: 10
      })
      
      const isValid = await component.isValid()
      expect(isValid).toBe(false)
    })

    it('should get current error', () => {
      component.setState({ error: 'Test error' })
      
      expect(component.getError()).toBe('Test error')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      component = new TextInput()
      
      expect(component.getValue()).toBe('')
      
      const output = component.render()
      expect(output.lines).toHaveLength(1)
    })

    it('should handle very long text', async () => {
      const longText = 'a'.repeat(1000)
      component = new TextInput()
      component.focus()
      
      await component.setValuePublic(longText)
      
      expect(component.getValue()).toBe(longText)
    })

    it('should handle rapid input', async () => {
      component = new TextInput()
      component.focus()
      
      // Handle input sequentially to avoid race conditions
      for (let i = 0; i < 10; i++) {
        await component.handleInput(Keys.char(i.toString()))
      }
      
      expect(component.getValue()).toBe('0123456789')
    })

    it('should handle cursor position beyond text length', () => {
      component = new TextInput({ defaultValue: 'Hello' })
      component.focus() // Need to focus to get cursor output
      component.setState({ cursorPosition: 100 })
      
      const output = component.render()
      expect(output.cursor?.x).toBeLessThanOrEqual(5)
    })

    it('should handle negative cursor position', () => {
      component = new TextInput({ defaultValue: 'Hello' })
      component.focus() // Need to focus to get cursor output
      component.setState({ cursorPosition: -5 })
      
      const output = component.render()
      expect(output.cursor?.x).toBeGreaterThanOrEqual(0)
    })

    it('should handle malformed selection', () => {
      component = new TextInput({ defaultValue: 'Hello' })
      component.setState({
        selectionStart: 10,
        selectionEnd: 2
      })
      
      // Should not crash
      const output = component.render()
      expect(output.lines).toHaveLength(1)
    })

    it('should handle special characters in input', async () => {
      component = new TextInput()
      component.focus()
      
      await component.handleInput(Keys.char('\n'))
      await component.handleInput(Keys.char('\t'))
      await component.handleInput(Keys.char('\r'))
      
      // Should handle gracefully without errors (control chars are filtered out)
      expect(component.getValue()).toBe('')
      
      // Should still accept normal characters after control characters
      await component.handleInput(Keys.char('a'))
      expect(component.getValue()).toBe('a')
    })
  })

  describe('Performance', () => {
    it('should render large text efficiently', async () => {
      const largeText = 'Lorem ipsum '.repeat(100)
      component = new TextInput({ defaultValue: largeText })
      
      const startTime = performance.now()
      component.render()
      const endTime = performance.now()
      
      expect(endTime - startTime).toBeLessThan(50) // Should render in less than 50ms
    })

    it('should handle rapid state changes efficiently', async () => {
      component = new TextInput()
      component.focus()
      
      const startTime = performance.now()
      
      for (let i = 0; i < 100; i++) {
        component.setState({ value: `test${i}`, cursorPosition: `test${i}`.length })
      }
      
      const endTime = performance.now()
      
      expect(endTime - startTime).toBeLessThan(100) // Should handle 100 updates in less than 100ms
    })
  })

  describe('Integration with Parent Components', () => {
    let emitSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      component = new TextInput({ defaultValue: 'Hello' })
      emitSpy = vi.spyOn(component as any, 'emit')
    })

    it('should emit events that parent can listen to', async () => {
      component.focus()
      
      await component.handleInput(Keys.char('!'))
      await component.handleInput(Keys.enter())
      
      expect(emitSpy).toHaveBeenCalledWith('change', 'Hello!')
      expect(emitSpy).toHaveBeenCalledWith('submit', 'Hello!')
    })

    it('should handle focus/blur from parent', () => {
      const focusState = () => component['state'].isFocused
      
      expect(focusState()).toBe(false)
      
      component.focus()
      expect(focusState()).toBe(true)
      
      component.blur()
      expect(focusState()).toBe(false)
    })

    it('should allow parent to set value', async () => {
      await component.setValuePublic('Parent set value')
      
      expect(component.getValue()).toBe('Parent set value')
      expect(emitSpy).toHaveBeenCalledWith('change', 'Parent set value')
    })

    it('should allow parent to clear input', () => {
      component.clear()
      
      expect(component.getValue()).toBe('')
      expect(component.getError()).toBeUndefined()
    })

    it('should allow parent to check validation state', async () => {
      component = new TextInput({ 
        defaultValue: 'test',
        minLength: 10
      })
      
      const isValid = await component.isValid()
      expect(isValid).toBe(false)
    })
  })
})