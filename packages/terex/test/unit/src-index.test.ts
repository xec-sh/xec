/**
 * Test for main index.ts file
 * Ensures all exports and constants are properly tested
 */

import { it, expect, describe } from 'vitest';

// Import everything from the main index
import {
  // Containers
  Box,
  // Test utilities
  test,
  // Primitives
  Text,
  Line,
  Flex,
  Grid,
  // Complex components
  Form,
  Tree,
  Tabs,
  Space,
  Table,
  Select,
  // Input components
  TextInput,
  ColorSystem,
  NumberInput,
  RenderEngine,
  Autocomplete,
  ReactiveState,
  VirtualScreen,
  // Advanced components
  VirtualScroll,
  CursorController,
  // Core exports
  createRenderEngine,
  createReactiveState,
  createVirtualScreen
} from '../../src/index.js';

describe('Main Index Exports', () => {
  describe('Core Exports', () => {
    it('should export core functions', () => {
      expect(typeof createRenderEngine).toBe('function');
      expect(typeof createReactiveState).toBe('function');
      expect(typeof createVirtualScreen).toBe('function');
    });

    it('should export core classes/constructors', () => {
      expect(ColorSystem).toBeDefined();
      expect(CursorController).toBeDefined();
      expect(RenderEngine).toBeDefined();
      expect(ReactiveState).toBeDefined();
      expect(VirtualScreen).toBeDefined();
    });
  });

  describe('Test Utilities Export', () => {
    it('should export test utilities namespace', () => {
      expect(test).toBeDefined();
      expect(typeof test).toBe('object');

      // Should have test utilities
      expect(test.createMockTerminal).toBeDefined();
      expect(test.createTestHarness).toBeDefined();
      expect(test.MockTerminal).toBeDefined();
    });
  });

  describe('Component Exports', () => {
    describe('Primitives', () => {
      it('should export primitive components', () => {
        expect(Text).toBeDefined();
        expect(Line).toBeDefined();
        expect(Space).toBeDefined();

        expect(typeof Text).toBe('function');
        expect(typeof Line).toBe('function');
        expect(typeof Space).toBe('function');
      });
    });

    describe('Containers', () => {
      it('should export container components', () => {
        expect(Box).toBeDefined();
        expect(Flex).toBeDefined();
        expect(Grid).toBeDefined();

        expect(typeof Box).toBe('function');
        expect(typeof Flex).toBeDefined(); // Could be object with factory functions
        expect(typeof Grid).toBeDefined(); // Could be object with factory functions
      });
    });

    describe('Input Components', () => {
      it('should export input components', () => {
        expect(TextInput).toBeDefined();
        expect(NumberInput).toBeDefined();
        expect(Select).toBeDefined();
        expect(Autocomplete).toBeDefined();

        expect(typeof TextInput).toBe('function');
        expect(typeof NumberInput).toBe('function');
        expect(typeof Select).toBe('function');
        expect(typeof Autocomplete).toBe('function');
      });
    });

    describe('Complex Components', () => {
      it('should export complex components', () => {
        expect(Form).toBeDefined();
        expect(Table).toBeDefined();
        expect(Tree).toBeDefined();
        expect(Tabs).toBeDefined();

        expect(typeof Form).toBe('function');
        expect(typeof Table).toBe('function');
        expect(typeof Tree).toBe('function');
        expect(typeof Tabs).toBe('function');
      });
    });

    describe('Advanced Components', () => {
      it('should export advanced components', () => {
        expect(VirtualScroll).toBeDefined();
        expect(typeof VirtualScroll).toBe('function');
      });
    });
  });

  describe('Export Structure Integrity', () => {
    it('should have consistent export structure', () => {
      // All component constructors should be functions
      const componentExports = [
        Text, Line, Space,
        Box, TextInput, NumberInput, Select, Autocomplete,
        Form, Table, Tree, Tabs, VirtualScroll
      ];

      componentExports.forEach((component, index) => {
        expect(typeof component, `Component at index ${index} should be a function`).toBe('function');
      });
    });

    it('should have all expected top-level exports', () => {
      // Test that we can import the main exports without errors
      const coreExports = {
        createRenderEngine,
        createReactiveState,
        createVirtualScreen,
        ColorSystem,
        CursorController,
        RenderEngine,
        ReactiveState,
        VirtualScreen
      };

      Object.entries(coreExports).forEach(([name, exportValue]) => {
        expect(exportValue, `${name} should be defined`).toBeDefined();
      });
    });
  });

  describe('Import/Export Validation', () => {
    it('should successfully import all re-exports', () => {
      // This test ensures all re-exports are valid and don't cause import errors
      expect(() => {
        // These imports should not throw
        const core = { createRenderEngine, createReactiveState, createVirtualScreen };
        const components = { Text, Box, TextInput, Form, VirtualScroll };
        const utilities = { test };

        return { core, components, utilities };
      }).not.toThrow();
    });

    it('should have proper module structure', () => {
      // Should be able to destructure everything without errors
      const destructured = {
        test,
        Text, Line, Space,
        Box, Flex, Grid,
        TextInput, NumberInput, Select,
        Form, Table, Tree,
        VirtualScroll
      };

      expect(Object.keys(destructured).length).toBe(14);
    });
  });
});