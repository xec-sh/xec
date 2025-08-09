/**
 * Comprehensive NumberInput component tests for edge cases and branch coverage
 */

import { it, vi, expect, describe, beforeEach } from 'vitest';

import { NumberInput } from '../../../../src/components/input/number-input.js';


describe('NumberInput Comprehensive Coverage', () => {
  let component: NumberInput;

  beforeEach(() => {
    component = new NumberInput();
  });

  describe('Constructor Edge Cases', () => {
    it('should handle initialization with null defaultValue', () => {
      const nullComponent = new NumberInput({ defaultValue: null });
      expect(nullComponent.state.value).toBeNull();
      expect(nullComponent.state.showPlaceholder).toBe(true);
    });

    it('should handle initialization with zero precision', () => {
      const zeroPrecisionComponent = new NumberInput({ 
        defaultValue: 3.14159, 
        precision: 0,
        allowDecimal: false
      });
      expect(zeroPrecisionComponent.state.displayValue).toBe('3');
    });

    it('should handle custom decimal separator', () => {
      const customSepComponent = new NumberInput({
        defaultValue: 3.14,
        decimalSeparator: ',',
        allowDecimal: true
      });
      expect(customSepComponent.state.displayValue).toBe('3,14');
    });

    it('should handle prefix and suffix with formatting', () => {
      const prefixSuffixComponent = new NumberInput({
        defaultValue: 100,
        prefix: '$',
        suffix: ' USD',
        thousandsSeparator: ','
      });
      expect(prefixSuffixComponent.state.displayValue).toBe('$100 USD');
    });

    it('should handle thousands separator with decimals', () => {
      const thousandsDecimalComponent = new NumberInput({
        defaultValue: 12345.67,
        thousandsSeparator: ',',
        decimalSeparator: '.',
        allowDecimal: true,
        precision: 2
      });
      expect(thousandsDecimalComponent.state.displayValue).toBe('12,345.67');
    });

    it('should handle custom format function', () => {
      const formatComponent = new NumberInput({
        defaultValue: 0.75,
        format: (value: number) => `${(value * 100).toFixed(1)}%`
      });
      expect(formatComponent.state.displayValue).toBe('75.0%');
    });

    it('should handle allowDecimal based on precision', () => {
      const precisionComponent = new NumberInput({
        precision: 2
      });
      // allowDecimal should default to true when precision > 0
      expect(precisionComponent).toBeDefined();
    });
  });

  describe('Input Handling Edge Cases', () => {
    it('should handle ctrl key combinations', async () => {
      component.setState({ displayValue: '12345', cursorPosition: 3, value: 12345 });
      
      // Ctrl+A (select all) - moves cursor to end
      await component.handleKeypress({ name: 'a', sequence: '\\x01', ctrl: true, shift: false, meta: false });
      expect(component.state.cursorPosition).toBe(5);
      
      // Ctrl+K (clear to end)
      await component.handleKeypress({ name: 'k', sequence: '\\x0b', ctrl: true, shift: false, meta: false });
      expect(component.state.displayValue).toBe('12345'); // Cursor was at end, so no change
      
      // Set cursor to middle and try Ctrl+K
      component.setState({ cursorPosition: 2 });
      await component.handleKeypress({ name: 'k', sequence: '\\x0b', ctrl: true, shift: false, meta: false });
      expect(component.state.displayValue).toBe('12');
      
      // Ctrl+U (clear all)
      await component.handleKeypress({ name: 'u', sequence: '\\x15', ctrl: true, shift: false, meta: false });
      expect(component.state.displayValue).toBe('');
    });

    it('should handle negative sign insertion correctly', async () => {
      const negativeComponent = new NumberInput({ allowNegative: true });
      
      // Insert negative sign at beginning
      await negativeComponent.handleKeypress({ name: '-', sequence: '-', ctrl: false, shift: false, meta: false });
      expect(negativeComponent.state.displayValue).toBe('-');
      expect(negativeComponent.state.cursorPosition).toBe(1);
      
      // Try to add another negative sign - should be ignored
      await negativeComponent.handleKeypress({ name: '-', sequence: '-', ctrl: false, shift: false, meta: false });
      expect(negativeComponent.state.displayValue).toBe('-');
    });

    it('should handle decimal separator correctly', async () => {
      const decimalComponent = new NumberInput({ 
        allowDecimal: true,
        decimalSeparator: '.'
      });
      
      await decimalComponent.handleKeypress({ name: '3', sequence: '3', ctrl: false, shift: false, meta: false });
      await decimalComponent.handleKeypress({ name: '.', sequence: '.', ctrl: false, shift: false, meta: false });
      expect(decimalComponent.state.displayValue).toBe('3.');
      
      // Try to add another decimal point - should be ignored
      await decimalComponent.handleKeypress({ name: '.', sequence: '.', ctrl: false, shift: false, meta: false });
      expect(decimalComponent.state.displayValue).toBe('3.');
    });

    it('should handle tab key for navigation', async () => {
      const tabListener = vi.fn();
      component.on('tab', tabListener);
      
      await component.handleKeypress({ name: 'tab', sequence: '\\t', ctrl: false, shift: false, meta: false });
      expect(tabListener).toHaveBeenCalledWith(false);
      
      await component.handleKeypress({ name: 'tab', sequence: '\\t', ctrl: false, shift: true, meta: false });
      expect(tabListener).toHaveBeenCalledWith(true);
    });

    it('should handle escape key for cancellation', async () => {
      const cancelListener = vi.fn();
      component.on('cancel', cancelListener);
      
      await component.handleKeypress({ name: 'escape', sequence: '\\x1b', ctrl: false, shift: false, meta: false });
      expect(cancelListener).toHaveBeenCalled();
    });

    it('should handle enter key for submission', async () => {
      const submitListener = vi.fn();
      component.on('submit', submitListener);
      
      component.setState({ value: 42, displayValue: '42' });
      await component.handleKeypressAsync({ name: 'return', sequence: '\\r', ctrl: false, shift: false, meta: false });
      expect(submitListener).toHaveBeenCalledWith(42);
    });

    it('should handle submit with null value', async () => {
      await component.handleKeypressAsync({ name: 'return', sequence: '\\r', ctrl: false, shift: false, meta: false });
      expect(component.state.error).toBe('Value is required');
    });

    it('should handle submit with invalid value', async () => {
      const validatingComponent = new NumberInput({
        min: 10
      });
      
      await validatingComponent.handleKeypress({ name: '5', sequence: '5', ctrl: false, shift: false, meta: false });
      await validatingComponent.handleKeypress({ name: 'return', sequence: '\\r', ctrl: false, shift: false, meta: false });
      
      // Should not emit submit event for invalid value
      expect(validatingComponent.state.error).toBeDefined();
    });

    it('should handle backspace at cursor position 0', async () => {
      component.setState({ displayValue: '123', value: 123, cursorPosition: 0 });
      
      await component.handleKeypress({ name: 'backspace', sequence: '\\b', ctrl: false, shift: false, meta: false });
      
      // Should not change anything
      expect(component.state.displayValue).toBe('123');
      expect(component.state.cursorPosition).toBe(0);
    });

    it('should handle delete at end of string', async () => {
      component.setState({ displayValue: '123', value: 123, cursorPosition: 3 });
      
      await component.handleKeypress({ name: 'delete', sequence: '\\x7f', ctrl: false, shift: false, meta: false });
      
      // Should not change anything
      expect(component.state.displayValue).toBe('123');
      expect(component.state.cursorPosition).toBe(3);
    });

    it('should handle cursor movement bounds', async () => {
      component.setState({ displayValue: '123', value: 123, cursorPosition: 0 });
      
      // Try to move left from position 0
      await component.handleKeypress({ name: 'left', sequence: '\\x1b[D', ctrl: false, shift: false, meta: false });
      expect(component.state.cursorPosition).toBe(0);
      
      // Move to end and try to move right
      component.setState({ cursorPosition: 3 });
      await component.handleKeypress({ name: 'right', sequence: '\\x1b[C', ctrl: false, shift: false, meta: false });
      expect(component.state.cursorPosition).toBe(3);
    });

    it('should handle step with null value', async () => {
      // Start with null value
      await component.handleKeypress({ name: 'up', sequence: '\\x1b[A', ctrl: false, shift: false, meta: false });
      expect(component.state.value).toBe(1); // Default step from null should be step value
      
      component.clear();
      await component.handleKeypress({ name: 'down', sequence: '\\x1b[B', ctrl: false, shift: false, meta: false });
      expect(component.state.value).toBe(-1); // Default step down from null
    });

    it('should handle invalid character input', async () => {
      // Test various invalid characters
      const invalidChars = ['a', 'x', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '=', '+'];
      const initialState = { ...component.state };
      
      for (const char of invalidChars) {
        await component.handleKeypress({ name: char, sequence: char, ctrl: false, shift: false, meta: false });
      }
      
      // State should be unchanged
      expect(component.state.value).toBe(initialState.value);
      expect(component.state.displayValue).toBe(initialState.displayValue);
    });

    it('should handle meta key combinations', async () => {
      // Test that meta keys don't interfere with regular input
      await component.handleKeypress({ name: '5', sequence: '5', ctrl: false, shift: false, meta: true });
      
      // Should not process input with meta key
      expect(component.state.value).toBeNull();
    });

    it('should handle error in handleInput method', async () => {
      // Mock console.error to prevent noise in test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Override handleInput to throw error
      const originalHandleInput = component['handleInput'].bind(component);
      component['handleInput'] = vi.fn().mockRejectedValue(new Error('Test error'));
      
      // This should not throw, but should log error
      const result = component.handleKeypress({ name: '5', sequence: '5', ctrl: false, shift: false, meta: false });
      expect(result).toBe(true); // Should always return true
      
      // Wait for async error handling
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(consoleSpy).toHaveBeenCalledWith('Input handling error:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('Validation Edge Cases', () => {
    it('should handle validation throwing errors', async () => {
      const throwingComponent = new NumberInput({
        validate: () => {
          throw new Error('Validation exception');
        }
      });
      
      await throwingComponent.handleKeypress({ name: '5', sequence: '5', ctrl: false, shift: false, meta: false });
      
      expect(throwingComponent.state.error).toBe('Validation exception');
      expect(throwingComponent.state.isValidating).toBe(false);
    });

    it('should handle async validation errors', async () => {
      const asyncErrorComponent = new NumberInput({
        validate: async () => {
          throw new Error('Async validation error');
        }
      });
      
      await asyncErrorComponent.handleKeypress({ name: '5', sequence: '5', ctrl: false, shift: false, meta: false });
      
      expect(asyncErrorComponent.state.error).toBe('Async validation error');
      expect(asyncErrorComponent.state.isValidating).toBe(false);
    });
  });

  describe('Rendering Edge Cases', () => {
    it('should handle rendering with cursor at end', () => {
      component.setState({
        displayValue: '123',
        value: 123,
        cursorPosition: 4, // Beyond end
        isFocused: true
      });
      
      const output = component.render();
      expect(output.lines[0]).toContain('123');
      expect(output.cursor).toBeDefined();
    });

    it('should handle rendering with prefix and suffix', () => {
      const prefixSuffixComponent = new NumberInput({
        defaultValue: 50,
        prefix: '$',
        suffix: '.00'
      });
      
      const output = prefixSuffixComponent.render();
      expect(output.lines[0]).toContain('$');
      expect(output.lines[0]).toContain('.00');
    });

    it('should handle disabled styling in render', () => {
      const disabledComponent = new NumberInput({
        defaultValue: 25,
        disabled: true
      });
      
      const output = disabledComponent.render();
      expect(output.lines).toBeDefined();
      expect(output.lines.length).toBeGreaterThan(0);
    });

    it('should handle readonly styling in render', () => {
      const readOnlyComponent = new NumberInput({
        defaultValue: 25,
        readOnly: true
      });
      
      const output = readOnlyComponent.render();
      expect(output.lines).toBeDefined();
      expect(output.lines.length).toBeGreaterThan(0);
    });

    it('should test all render method branches', () => {
      // Test with placeholder
      const placeholderComponent = new NumberInput({ placeholder: 'Enter number' });
      let output = placeholderComponent.render();
      expect(output.lines[0]).toContain('Enter number');
      
      // Test with value but not focused (formatting)
      placeholderComponent.setState({ value: 1234, displayValue: '1234', isFocused: false });
      output = placeholderComponent.render();
      expect(output.lines[0]).toContain('1234');
      
      // Test with focused state
      placeholderComponent.setState({ isFocused: true, cursorPosition: 2 });
      output = placeholderComponent.render();
      expect(output.cursor).toBeDefined();
      expect(output.cursor?.x).toBe(2);
    });
  });

  describe('Focus Management Edge Cases', () => {
    it('should handle focus and blur with formatting', () => {
      const formattingComponent = new NumberInput({
        defaultValue: 1234.56,
        thousandsSeparator: ',',
        precision: 2,
        allowDecimal: true
      });
      
      // Focus should not format
      formattingComponent.focus();
      expect(formattingComponent.state.isFocused).toBe(true);
      expect(formattingComponent.state.showPlaceholder).toBe(false);
      
      // Blur should format
      formattingComponent.blur();
      expect(formattingComponent.state.isFocused).toBe(false);
      expect(formattingComponent.state.displayValue).toBe('1,234.56');
    });

    it('should handle blur with null value', () => {
      component.blur();
      expect(component.state.showPlaceholder).toBe(true);
    });
  });

  describe('Number Parsing Edge Cases', () => {
    it('should handle empty and invalid strings in parsing', async () => {
      // Empty string
      component.setState({ displayValue: '' });
      await component.handleKeypress({ name: '5', sequence: '5', ctrl: false, shift: false, meta: false });
      expect(component.state.value).toBe(5);
      
      // Just negative sign
      component.clear();
      const negativeComponent = new NumberInput({ allowNegative: true });
      await negativeComponent.handleKeypress({ name: '-', sequence: '-', ctrl: false, shift: false, meta: false });
      expect(negativeComponent.state.value).toBeNull();
    });

    it('should handle integer-only mode', () => {
      const integerComponent = new NumberInput({
        defaultValue: 3.14159,
        allowDecimal: false
      });
      
      expect(integerComponent.state.value).toBe(3); // Should be rounded
    });

    it('should handle display value formatting edge cases', () => {
      // Test formatting with no custom format and no thousands separator
      const basicComponent = new NumberInput({
        defaultValue: 123.456,
        allowDecimal: true
      });
      
      expect(basicComponent.state.displayValue).toBe('123.456');
      
      // Test formatting with precision but no thousands separator
      const precisionComponent = new NumberInput({
        defaultValue: 123.456,
        precision: 2,
        allowDecimal: true
      });
      
      expect(precisionComponent.state.displayValue).toBe('123.46');
    });

    it('should test formatNumber method branches', () => {
      // Test with custom format
      const customFormatComponent = new NumberInput({
        defaultValue: 100,
        format: (value) => `Custom: ${value}`
      });
      expect(customFormatComponent.state.displayValue).toBe('Custom: 100');
      
      // Test with precision and decimal
      const precisionComponent = new NumberInput({
        defaultValue: 3.14159,
        precision: 3,
        allowDecimal: true
      });
      expect(precisionComponent.state.displayValue).toBe('3.142');
      
      // Test with integer mode
      const integerComponent = new NumberInput({
        defaultValue: 3.14159,
        allowDecimal: false
      });
      expect(integerComponent.state.displayValue).toBe('3');
    });
  });

  describe('Public API Methods', () => {
    it('should handle public API methods comprehensively', async () => {
      // getValue
      expect(component.getValue()).toBeNull();
      
      // setValuePublic
      await component.setValuePublic(42);
      expect(component.getValue()).toBe(42);
      expect(component.state.cursorPosition).toBe(2); // Cursor at end
      
      // clear
      const oldValue = component.getValue();
      component.clear();
      expect(component.getValue()).toBeNull();
      expect(component.state.displayValue).toBe('');
      expect(component.state.showPlaceholder).toBe(true);
      
      // isValid
      const validResult = await component.isValid();
      expect(validResult).toBe(false); // null value is invalid
      
      await component.setValuePublic(50);
      const validResult2 = await component.isValid();
      expect(validResult2).toBe(true);
      
      // getError
      expect(component.getError()).toBeUndefined();
      
      // Test with validation error
      const invalidComponent = new NumberInput({ min: 100 });
      await invalidComponent.setValuePublic(50);
      expect(await invalidComponent.isValid()).toBe(false);
      expect(invalidComponent.getError()).toBeDefined();
    });

    it('should handle validate method edge cases', async () => {
      // Test validate with null value
      const result1 = await component.validate();
      expect(result1).toBe(false);
      expect(component.state.error).toBe('Value is required');
      
      // Test validate with valid value
      await component.setValuePublic(25);
      const result2 = await component.validate();
      expect(result2).toBe(true);
      expect(component.state.error).toBeUndefined();
    });
  });

  describe('Event Emission Edge Cases', () => {
    it('should emit input event for every valid keystroke', async () => {
      const inputListener = vi.fn();
      component.on('input', inputListener);
      
      await component.handleKeypressAsync({ name: '1', sequence: '1', ctrl: false, shift: false, meta: false });
      await component.handleKeypressAsync({ name: '2', sequence: '2', ctrl: false, shift: false, meta: false });
      await component.handleKeypressAsync({ name: '3', sequence: '3', ctrl: false, shift: false, meta: false });
      
      expect(inputListener).toHaveBeenCalledTimes(3);
      expect(inputListener).toHaveBeenLastCalledWith(
        expect.objectContaining({
          value: 123,
          displayValue: '123'
        })
      );
    });

    it('should emit change event only when value actually changes', async () => {
      const changeListener = vi.fn();
      component.on('change', changeListener);
      
      // Set initial value
      await component.setValuePublic(5);
      expect(changeListener).toHaveBeenCalledTimes(1);
      
      // Set same value again
      await component.setValuePublic(5);
      expect(changeListener).toHaveBeenCalledTimes(1); // Should not emit again
      
      // Set different value
      await component.setValuePublic(10);
      expect(changeListener).toHaveBeenCalledTimes(2);
    });

    it('should emit validation events correctly', async () => {
      const validationListener = vi.fn();
      component.on('validation', validationListener);
      
      await component.handleKeypressAsync({ name: '5', sequence: '5', ctrl: false, shift: false, meta: false });
      
      expect(validationListener).toHaveBeenCalledWith(
        expect.objectContaining({
          isValid: true,
          error: undefined,
          value: 5
        })
      );
    });
  });

  describe('Stress Testing', () => {
    it('should handle rapid input efficiently', async () => {
      const startTime = performance.now();
      
      // Simulate rapid typing
      for (let i = 0; i < 50; i++) {
        const digit = String(i % 10);
        await component.handleKeypress({ 
          name: digit, 
          sequence: digit, 
          ctrl: false, 
          shift: false, 
          meta: false 
        });
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete in reasonable time (less than 200ms for 50 inputs)
      expect(duration).toBeLessThan(200);
    });

    it('should handle extreme values', () => {
      const largeComponent = new NumberInput({
        defaultValue: Number.MAX_SAFE_INTEGER
      });
      expect(largeComponent.state.value).toBe(Number.MAX_SAFE_INTEGER);

      const smallComponent = new NumberInput({
        defaultValue: Number.MIN_SAFE_INTEGER,
        allowNegative: true
      });
      expect(smallComponent.state.value).toBe(Number.MIN_SAFE_INTEGER);
    });

    it('should handle complex formatting scenarios', () => {
      const complexComponent = new NumberInput({
        defaultValue: 1234567.89123,
        thousandsSeparator: ',',
        decimalSeparator: '.',
        precision: 3,
        prefix: '$',
        suffix: ' USD',
        allowDecimal: true
      });
      
      expect(complexComponent.state.displayValue).toBe('$1,234,567.891 USD');
    });
  });
});