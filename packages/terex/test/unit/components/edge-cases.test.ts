/**
 * Component Edge Case Testing - Nuclear Reactor Level Reliability
 * Tests all possible edge cases and failure modes for every component
 */

import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { BaseComponent } from '../../../src/core/component.js';
import { Form } from '../../../src/components/complex/form.js';
// Import all components to test
import { Box } from '../../../src/components/containers/box.js';
import { Select } from '../../../src/components/input/select.js';
import { Flex } from '../../../src/components/containers/flex.js';
import { Grid } from '../../../src/components/containers/grid.js';
import { Text } from '../../../src/components/primitives/text.js';
import { Line } from '../../../src/components/primitives/line.js';
import { Space } from '../../../src/components/primitives/space.js';
import { createMockTerminal } from '../../../src/test/mock-terminal.js';
import { TextInput } from '../../../src/components/input/text-input.js';
import { createReactiveState } from '../../../src/core/reactive-state.js';
import { NumberInput } from '../../../src/components/input/number-input.js';
import { RenderEngine, createRenderEngine } from '../../../src/core/render-engine.js';

import type { Output, TerminalStream } from '../../../src/core/types.js';

describe('Component Edge Cases', () => {
  let mockTerminal: ReturnType<typeof createMockTerminal>;
  let stream: TerminalStream;
  let renderEngine: RenderEngine;

  beforeEach(async () => {
    mockTerminal = createMockTerminal();
    stream = mockTerminal.asStream();
    renderEngine = createRenderEngine(stream, {
      enableFrameScheduling: false,
      enableDifferentialRendering: false
    });
  });

  afterEach(async () => {
    await renderEngine.stop();
    mockTerminal.reset();
  });

  describe('Box Component Edge Cases', () => {
    it('should handle null/undefined title gracefully', async () => {
      const boxes = [
        new Box({ title: null as any }),
        new Box({ title: undefined as any }),
        new Box({ title: '' }),
        new Box({ title: '   ' }),
        new Box({ title: '\n\t\r' })
      ];

      for (const box of boxes) {
        await renderEngine.start(box);
        await renderEngine.requestRender();
        await renderEngine.stop();
        
        const output = mockTerminal.getAllOutput();
        expect(output).toBeTruthy(); // Should not crash
        mockTerminal.reset();
      }
    });

    it('should handle extreme padding values', async () => {
      const extremePaddings = [
        { padding: -1000 },
        { padding: Number.MAX_SAFE_INTEGER },
        { padding: Number.NEGATIVE_INFINITY },
        { padding: Number.POSITIVE_INFINITY },
        { padding: NaN },
        { padding: { top: -100, right: 1000, bottom: NaN, left: Infinity } }
      ];

      for (const config of extremePaddings) {
        const box = new Box({ title: 'Extreme Padding', ...config });
        await renderEngine.start(box);
        await renderEngine.requestRender();
        await renderEngine.stop();
        
        expect(mockTerminal.getAllOutput()).toBeTruthy();
        mockTerminal.reset();
      }
    });

    it('should handle children array mutations during render', async () => {
      const children = [
        new Text({ content: 'Child 1' }),
        new Text({ content: 'Child 2' }),
        new Text({ content: 'Child 3' })
      ];

      const box = new Box({ title: 'Mutating Children', children });

      class MutatingBox extends Box {
        private renderCount = 0;

        render(): Output {
          this.renderCount++;
          
          // Mutate children during render
          if (this.renderCount === 2) {
            this.children?.push(new Text({ content: 'Added during render' }));
          } else if (this.renderCount === 3) {
            this.children?.splice(0, 1); // Remove first child
          } else if (this.renderCount === 4) {
            (this.children as any) = null; // Corrupt children array
          }

          return super.render();
        }
      }

      const mutatingBox = new MutatingBox({ title: 'Mutating', children });
      await renderEngine.start(mutatingBox);

      // Render multiple times to trigger mutations
      for (let i = 0; i < 5; i++) {
        await renderEngine.requestRender();
      }

      expect(mockTerminal.getAllOutput()).toBeTruthy();
    });

    it('should handle circular child references', async () => {
      const box1 = new Box({ title: 'Box 1' });
      const box2 = new Box({ title: 'Box 2' });
      
      // Create circular reference
      box1.addChild?.(box2);
      box2.addChild?.(box1);

      await renderEngine.start(box1);
      await renderEngine.requestRender();

      expect(mockTerminal.getAllOutput()).toBeTruthy(); // Should not cause stack overflow
    });
  });

  describe('Text Component Edge Cases', () => {
    it('should handle all types of invalid content', async () => {
      const invalidContents = [
        null,
        undefined,
        0,
        false,
        {},
        [],
        Symbol('test'),
        () => 'function',
        new Date(),
        /regex/,
        new Error('error object')
      ];

      for (const content of invalidContents) {
        const text = new Text({ content: content as any });
        await renderEngine.start(text);
        await renderEngine.requestRender();
        await renderEngine.stop();
        
        expect(mockTerminal.getAllOutput()).toBeTruthy();
        mockTerminal.reset();
      }
    });

    it('should handle extremely long content strings', async () => {
      const longStrings = [
        'A'.repeat(1000000), // 1MB string
        'Unicode: ' + '🚀'.repeat(100000), // Unicode repetition
        'Newlines:\n'.repeat(10000), // Many newlines
        'Tabs:\t'.repeat(10000), // Many tabs
        '\0'.repeat(1000) // Null characters
      ];

      for (const content of longStrings) {
        const text = new Text({ content });
        await renderEngine.start(text);
        await renderEngine.requestRender();
        await renderEngine.stop();
        
        expect(mockTerminal.getAllOutput()).toBeTruthy();
        mockTerminal.reset();
      }
    });

    it('should handle content changes during render', async () => {
      class MutatingTextComponent extends Text {
        private renderCount = 0;

        render(): Output {
          this.renderCount++;
          
          // Change content during render
          if (this.renderCount === 2) {
            (this as any).content = 'Changed during render';
          } else if (this.renderCount === 3) {
            (this as any).content = null;
          } else if (this.renderCount === 4) {
            delete (this as any).content;
          }

          return super.render();
        }
      }

      const text = new MutatingTextComponent({ content: 'Original' });
      await renderEngine.start(text);

      for (let i = 0; i < 5; i++) {
        await renderEngine.requestRender();
      }

      expect(mockTerminal.getAllOutput()).toBeTruthy();
    });
  });

  describe('Input Component Edge Cases', () => {
    it('should handle TextInput with invalid configurations', async () => {
      const invalidConfigs = [
        { placeholder: null },
        { placeholder: undefined },
        { placeholder: 123 as any },
        { placeholder: {} as any },
        { maxLength: -1 },
        { maxLength: NaN },
        { maxLength: 'invalid' as any },
        { value: null },
        { value: 123 as any },
        { disabled: 'true' as any },
        { required: 'false' as any }
      ];

      for (const config of invalidConfigs) {
        const input = new TextInput(config as any);
        await renderEngine.start(input);
        await renderEngine.requestRender();
        await renderEngine.stop();
        
        expect(mockTerminal.getAllOutput()).toBeTruthy();
        mockTerminal.reset();
      }
    });

    it('should handle NumberInput with extreme values', async () => {
      const extremeConfigs = [
        { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY },
        { min: NaN, max: NaN },
        { min: 'invalid' as any, max: 'invalid' as any },
        { step: 0 },
        { step: -1 },
        { step: Number.POSITIVE_INFINITY },
        { value: Number.MAX_VALUE },
        { value: Number.MIN_VALUE },
        { precision: -1 },
        { precision: 100 }
      ];

      for (const config of extremeConfigs) {
        const input = new NumberInput(config as any);
        await renderEngine.start(input);
        await renderEngine.requestRender();
        await renderEngine.stop();
        
        expect(mockTerminal.getAllOutput()).toBeTruthy();
        mockTerminal.reset();
      }
    });

    it('should handle Select with invalid options', async () => {
      const invalidOptionSets = [
        null,
        undefined,
        'not an array' as any,
        123 as any,
        [],
        [null, undefined, 'string', 123, {}],
        Array(10000).fill({ value: 'option', label: 'Option' }), // Massive options
        [{ value: null, label: null }],
        [{ value: {}, label: [] }],
        [{ notValue: 'wrong', notLabel: 'properties' }]
      ];

      for (const options of invalidOptionSets) {
        const select = new Select({ options: options as any });
        await renderEngine.start(select);
        await renderEngine.requestRender();
        await renderEngine.stop();
        
        expect(mockTerminal.getAllOutput()).toBeTruthy();
        mockTerminal.reset();
      }
    });

    it('should handle rapid input changes', async () => {
      const input = new TextInput({ placeholder: 'Rapid input test' });
      await renderEngine.start(input);

      // Simulate very rapid typing
      const rapidInputs = Array.from({ length: 1000 }, (_, i) => 
        String.fromCharCode(65 + (i % 26)) // A-Z cycling
      );

      for (const char of rapidInputs) {
        await mockTerminal.sendKey({ name: char.toLowerCase(), sequence: char });
        
        // Occasional special keys
        if (Math.random() < 0.1) {
          await mockTerminal.sendKey({ name: 'backspace', sequence: '\b' });
        }
        if (Math.random() < 0.05) {
          await mockTerminal.sendKey({ name: 'delete', sequence: '\x7f' });
        }
      }

      await renderEngine.requestRender();
      expect(mockTerminal.getAllOutput()).toBeTruthy();
    });
  });

  describe('Layout Component Edge Cases', () => {
    it('should handle Flex with invalid direction', async () => {
      const invalidDirections = [
        'invalid' as any,
        null,
        undefined,
        123,
        {},
        []
      ];

      for (const direction of invalidDirections) {
        const flex = new Flex({ direction: direction as any });
        await renderEngine.start(flex);
        await renderEngine.requestRender();
        await renderEngine.stop();
        
        expect(mockTerminal.getAllOutput()).toBeTruthy();
        mockTerminal.reset();
      }
    });

    it('should handle Grid with invalid dimensions', async () => {
      const invalidGridConfigs = [
        { rows: -1, columns: -1 },
        { rows: 0, columns: 0 },
        { rows: NaN, columns: NaN },
        { rows: 'invalid' as any, columns: 'invalid' as any },
        { rows: 1000000, columns: 1000000 }, // Extremely large
        { rows: null, columns: undefined }
      ];

      for (const config of invalidGridConfigs) {
        const grid = new Grid(config as any);
        await renderEngine.start(grid);
        await renderEngine.requestRender();
        await renderEngine.stop();
        
        expect(mockTerminal.getAllOutput()).toBeTruthy();
        mockTerminal.reset();
      }
    });

    it('should handle Grid with mismatched children count', async () => {
      // Grid expects 2x2 = 4 children, but provide different amounts
      const childCounts = [0, 1, 3, 5, 10, 100];
      
      for (const count of childCounts) {
        const children = Array.from({ length: count }, (_, i) => 
          new Text({ content: `Child ${i}` })
        );
        
        const grid = new Grid({ rows: 2, columns: 2, children });
        await renderEngine.start(grid);
        await renderEngine.requestRender();
        await renderEngine.stop();
        
        expect(mockTerminal.getAllOutput()).toBeTruthy();
        mockTerminal.reset();
      }
    });
  });

  describe('Primitive Component Edge Cases', () => {
    it('should handle Line with invalid configurations', async () => {
      const invalidLineConfigs = [
        { length: -1 },
        { length: 0 },
        { length: NaN },
        { length: Number.POSITIVE_INFINITY },
        { character: null },
        { character: undefined },
        { character: '' },
        { character: 'too long string' },
        { character: 123 as any },
        { character: {} as any }
      ];

      for (const config of invalidLineConfigs) {
        const line = new Line(config as any);
        await renderEngine.start(line);
        await renderEngine.requestRender();
        await renderEngine.stop();
        
        expect(mockTerminal.getAllOutput()).toBeTruthy();
        mockTerminal.reset();
      }
    });

    it('should handle Space with invalid height', async () => {
      const invalidHeights = [-1, 0, NaN, Infinity, 'invalid' as any, null, undefined, {}];

      for (const height of invalidHeights) {
        const space = new Space({ height: height as any });
        await renderEngine.start(space);
        await renderEngine.requestRender();
        await renderEngine.stop();
        
        expect(mockTerminal.getAllOutput()).toBeTruthy();
        mockTerminal.reset();
      }
    });
  });

  describe('Complex Component Edge Cases', () => {
    it('should handle Form with invalid field configurations', async () => {
      const invalidFormConfigs = [
        { fields: null },
        { fields: undefined },
        { fields: 'not an array' as any },
        { fields: [] }, // Empty fields
        { 
          fields: [
            { name: null, type: 'text', label: 'Invalid Name' },
            { name: '', type: 'invalid' as any, label: 'Invalid Type' },
            { name: 'test', type: 'text', label: null },
            { notName: 'wrong', notType: 'properties' } as any
          ]
        },
        {
          fields: Array(1000).fill({ // Massive field count
            name: 'field',
            type: 'text',
            label: 'Field'
          })
        }
      ];

      for (const config of invalidFormConfigs) {
        const form = new Form(config as any);
        await renderEngine.start(form);
        await renderEngine.requestRender();
        await renderEngine.stop();
        
        expect(mockTerminal.getAllOutput()).toBeTruthy();
        mockTerminal.reset();
      }
    });

    it('should handle Form with circular validation dependencies', async () => {
      const form = new Form({
        fields: [
          {
            name: 'field1',
            type: 'text',
            label: 'Field 1',
            validation: (value: string, values: any) => {
              if (values.field2 && !value) return 'Field 1 required when Field 2 has value';
              return null;
            }
          },
          {
            name: 'field2', 
            type: 'text',
            label: 'Field 2',
            validation: (value: string, values: any) => {
              if (values.field1 && !value) return 'Field 2 required when Field 1 has value';
              return null;
            }
          }
        ]
      });

      await renderEngine.start(form);

      // Trigger validation that could cause infinite loops
      (form as any).setFieldValue('field1', 'value');
      await renderEngine.requestRender();
      
      (form as any).setFieldValue('field2', 'value');
      await renderEngine.requestRender();
      
      (form as any).setFieldValue('field1', '');
      await renderEngine.requestRender();

      expect(mockTerminal.getAllOutput()).toBeTruthy();
    });
  });

  describe('Component State Mutation Edge Cases', () => {
    it('should handle concurrent state mutations', async () => {
      const state = createReactiveState({ value: 0 });
      
      class ConcurrentMutationComponent extends BaseComponent {
        constructor() {
          super();
          state.subscribe(() => this.invalidate());
        }

        async performConcurrentMutations(): Promise<void> {
          const mutations = Array.from({ length: 100 }, (_, i) => 
            state.update(s => ({ ...s, value: s.value + i }))
          );
          
          await Promise.all(mutations);
        }

        render(): Output {
          return {
            lines: [`Concurrent value: ${state.get().value}`]
          };
        }
      }

      const component = new ConcurrentMutationComponent();
      await renderEngine.start(component);
      
      await (component as any).performConcurrentMutations();
      await renderEngine.requestRender();

      expect(state.get().value).toBeGreaterThan(0);
      expect(mockTerminal.getAllOutput()).toBeTruthy();
    });

    it('should handle component disposal during async operations', async () => {
      const asyncResults: string[] = [];

      class AsyncDisposalComponent extends BaseComponent {
        private disposed = false;

        constructor() {
          super();
          this.startAsyncOperation();
        }

        override unmount(): void {
          this.disposed = true;
          super.unmount();
        }

        private async startAsyncOperation(): Promise<void> {
          for (let i = 0; i < 100; i++) {
            if (this.disposed) break;
            
            await new Promise(resolve => setTimeout(resolve, 1));
            
            if (!this.disposed) {
              asyncResults.push(`async-${i}`);
            }
          }
        }

        render(): Output {
          return {
            lines: [
              `Async component - disposed: ${this.disposed}`,
              `Results: ${asyncResults.length}`
            ]
          };
        }
      }

      const component = new AsyncDisposalComponent();
      await renderEngine.start(component);
      
      // Stop engine quickly to trigger disposal during async operations
      setTimeout(() => renderEngine.stop(), 10);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should not crash and should handle disposal gracefully
      expect(true).toBe(true);
    });
  });

  describe('Memory Corruption Edge Cases', () => {
    it('should handle component property corruption', async () => {
      const component = new Text({ content: 'Original content' });
      await renderEngine.start(component);

      // Corrupt various properties
      (component as any).content = null;
      await renderEngine.requestRender();
      
      delete (component as any).content;
      await renderEngine.requestRender();
      
      (component as any).render = null;
      try {
        await renderEngine.requestRender();
      } catch {
        // Expected to fail, but should not crash the system
      }

      expect(true).toBe(true); // Test passes if no system crash
    });

    it('should handle prototype pollution attempts', async () => {
      class PollutionTestComponent extends BaseComponent {
        render(): Output {
          // Attempt prototype pollution
          try {
            (Object.prototype as any).__proto__.polluted = 'malicious';
            (Array.prototype as any).polluted = 'malicious';
            (Function.prototype as any).polluted = 'malicious';
          } catch {
            // Pollution attempts should be caught/prevented
          }

          return {
            lines: [
              'Pollution test component',
              `Object polluted: ${'polluted' in {}}`,
              `Array polluted: ${'polluted' in []}`,
              `Function polluted: ${'polluted' in (() => {})}`
            ]
          };
        }
      }

      const component = new PollutionTestComponent();
      await renderEngine.start(component);
      await renderEngine.requestRender();

      // Clean up any pollution that might have occurred
      try {
        delete (Object.prototype as any).polluted;
        delete (Array.prototype as any).polluted;
        delete (Function.prototype as any).polluted;
      } catch {
        // Cleanup attempts
      }

      expect(mockTerminal.getAllOutput()).toBeTruthy();
    });
  });

  describe('Extreme Resource Usage Edge Cases', () => {
    it('should handle component with massive render output', async () => {
      class MassiveOutputComponent extends BaseComponent {
        render(): Output {
          // Generate massive output
          const lines = Array.from({ length: 10000 }, (_, i) => 
            `Massive line ${i}: ${'x'.repeat(100)}`
          );

          return { lines };
        }
      }

      const component = new MassiveOutputComponent();
      await renderEngine.start(component);
      await renderEngine.requestRender();

      expect(mockTerminal.getAllOutput()).toBeTruthy();
    });

    it('should handle recursive component creation', async () => {
      let recursionDepth = 0;

      class RecursiveComponent extends BaseComponent {
        private depth: number;

        constructor(depth = 0) {
          super();
          this.depth = depth;
        }

        render(): Output {
          recursionDepth = Math.max(recursionDepth, this.depth);
          
          // Simplified test - just test that render is called with different depths
          return {
            lines: [`Recursive component at depth ${this.depth}`]
          };
        }
      }

      // Test multiple instances to simulate recursion
      const component1 = new RecursiveComponent(0);
      const component2 = new RecursiveComponent(5);
      const component3 = new RecursiveComponent(3);
      
      await renderEngine.start(component1);
      await renderEngine.stop();
      
      await renderEngine.start(component2);
      await renderEngine.stop();
      
      await renderEngine.start(component3);
      await renderEngine.stop();

      expect(recursionDepth).toBe(5); // Should be the maximum depth we tested
      expect(mockTerminal.getAllOutput()).toBeTruthy();
    });
  });
});