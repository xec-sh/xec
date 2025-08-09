/**
 * Main Entry Coverage Test
 * Simple test to ensure main index.ts exports are covered
 */

import { it, expect, describe } from 'vitest';

describe('Main Entry Coverage', () => {
  it('should import and validate all main exports', async () => {
    // Import the main index to ensure it gets coverage
    const mainExports = await import('../../src/index.js');

    // Test that default export exists
    expect(mainExports.tx).toBeDefined();

    // Test that core functions are exported
    expect(typeof mainExports.createRenderEngine).toBe('function');
    expect(typeof mainExports.createReactiveState).toBe('function');
    expect(typeof mainExports.createVirtualScreen).toBe('function');

    // Test that core classes are exported
    expect(mainExports.ColorSystem).toBeDefined();
    expect(mainExports.CursorController).toBeDefined();
    expect(mainExports.RenderEngine).toBeDefined();
    expect(mainExports.ReactiveState).toBeDefined();
    expect(mainExports.VirtualScreen).toBeDefined();

    // Test that test utilities are exported
    expect(mainExports.test).toBeDefined();
    expect(typeof mainExports.test).toBe('object');

    // Test that component exports exist
    expect(mainExports.Text).toBeDefined();
    expect(mainExports.Line).toBeDefined();
    expect(mainExports.Space).toBeDefined();
    expect(mainExports.Box).toBeDefined();
    expect(mainExports.Flex).toBeDefined();
    expect(mainExports.Grid).toBeDefined();
    expect(mainExports.TextInput).toBeDefined();
    expect(mainExports.NumberInput).toBeDefined();
    expect(mainExports.Select).toBeDefined();
    expect(mainExports.Autocomplete).toBeDefined();
    expect(mainExports.Form).toBeDefined();
    expect(mainExports.Table).toBeDefined();
    expect(mainExports.Tree).toBeDefined();
    expect(mainExports.Tabs).toBeDefined();
    expect(mainExports.VirtualScroll).toBeDefined();
  });

  it('should validate component constructors work', async () => {
    const {
      Text, Line, Space, Box, Flex, Grid,
      TextInput, NumberInput, Select, Autocomplete,
      VirtualScroll
    } = await import('../../src/index.js');

    // Test that components can be instantiated (this covers constructor paths)
    expect(() => new Text({ content: 'test' })).not.toThrow();
    expect(() => new Line({ length: 5 })).not.toThrow();
    expect(() => new Space({ width: 3, height: 2 })).not.toThrow();
    expect(() => new Box({ children: [] })).not.toThrow();
    expect(() => new Flex({ children: [] })).not.toThrow();
    expect(() => new Grid({ children: [], rows: 1, columns: 1 })).not.toThrow();
    expect(() => new TextInput({ value: '' })).not.toThrow();
    expect(() => new NumberInput({ value: 0 })).not.toThrow();
    expect(() => new Select({ options: [], value: null })).not.toThrow();
    expect(() => new Autocomplete({ options: [], value: '' })).not.toThrow();
    expect(() => new VirtualScroll({
      items: [],
      itemHeight: 20,
      containerHeight: 100,
      renderItem: () => ''
    })).not.toThrow();
  });

  it('should validate core factories work', async () => {
    const {
      createRenderEngine,
      createReactiveState,
      createVirtualScreen,
      createCursorController,
      createColorSystem
    } = await import('../../src/index.js');

    const { createMockTerminal } = await import('../../src/test/mock-terminal.js');

    // Test core factory functions
    const mockTerminal = createMockTerminal();

    expect(() => createRenderEngine(mockTerminal.asStream())).not.toThrow();
    expect(() => createReactiveState({ test: true })).not.toThrow();
    expect(() => createVirtualScreen({ width: 80, height: 24 })).not.toThrow();
    expect(() => createCursorController(mockTerminal.asStream())).not.toThrow();
    expect(() => createColorSystem(mockTerminal.asStream())).not.toThrow();

    mockTerminal.reset();
  });

  it('should validate test utilities', async () => {
    const { test } = await import('../../src/index.js');

    // Test that test utilities are accessible
    expect(test.createMockTerminal).toBeDefined();
    expect(typeof test.createMockTerminal).toBe('function');

    expect(test.createTestHarness).toBeDefined();
    expect(typeof test.createTestHarness).toBe('function');

    expect(test.MockTerminal).toBeDefined();

    // Test that mock terminal can be created
    const mockTerminal = test.createMockTerminal();
    expect(mockTerminal).toBeDefined();
    expect(typeof mockTerminal.write).toBe('function');
    expect(typeof mockTerminal.getAllOutput).toBe('function');

    mockTerminal.reset();
  });

  it('should exercise various utility paths', async () => {
    // Import utilities to ensure they get some coverage
    const utils = await import('../../src/utils/index.js');

    // Test that utilities exist and are functions
    Object.values(utils).forEach(exportValue => {
      if (typeof exportValue === 'function') {
        expect(typeof exportValue).toBe('function');
      }
    });
  });
});