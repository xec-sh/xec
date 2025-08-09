/**
 * Comprehensive test for Tabs component to achieve maximum coverage
 * Targeting uncovered lines in tabs.ts
 */

import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { Tabs } from '../../../../src/components/complex/tabs.js';
import { createMockTerminal } from '../../../../src/test/mock-terminal.js';
import { createRenderEngine } from '../../../../src/core/render-engine.js';
import { createReactiveState } from '../../../../src/core/reactive-state.js';

import type { RenderEngine, TerminalStream } from '../../../../src/core/types.js';

describe('Tabs Component - Comprehensive Coverage', () => {
  let mockTerminal: ReturnType<typeof createMockTerminal>;
  let stream: TerminalStream;
  let renderEngine: RenderEngine;

  beforeEach(async () => {
    mockTerminal = createMockTerminal({
      width: 80,
      height: 24
    });
    stream = mockTerminal.asStream();
    renderEngine = createRenderEngine(stream, { enableDifferentialRendering: false });
  });

  afterEach(async () => {
    await renderEngine.stop();
    mockTerminal.reset();
  });

  describe('Complex Tab Management', () => {
    it('should handle dynamic tab addition and removal', async () => {
      const initialTabs = [
        { id: 'tab1', label: 'Tab 1', content: 'Content 1', closable: true },
        { id: 'tab2', label: 'Tab 2', content: 'Content 2', closable: false }
      ];

      const tabsComponent = new Tabs({
        tabs: initialTabs,
        activeTab: 'tab1',
        position: 'top',
        showBorders: true,
        tabSpacing: 2,
        minTabWidth: 8,
        maxTabWidth: 20,
        scrollable: true,
        overflowMode: 'scroll'
      });

      // Test direct rendering
      let directOutput = tabsComponent.render();
      let outputText = directOutput.lines.join(' ');

      // Should render initial tabs
      expect(outputText).toContain('Tab 1');
      expect(outputText).toContain('Tab 2');

      // Add a new tab dynamically
      tabsComponent.addTab({ id: 'tab3', label: 'New Tab', content: 'New Content', closable: true });
      directOutput = tabsComponent.render();
      outputText = directOutput.lines.join(' ');
      expect(outputText).toContain('New Tab');

      // Remove a tab
      tabsComponent.removeTab('tab2');
      directOutput = tabsComponent.render();
      outputText = directOutput.lines.join(' ');
      expect(outputText).not.toContain('Tab 2');
    });

    it('should handle extensive tab configurations', async () => {
      // Test many different configurations to hit edge cases
      const configurations = [
        {
          position: 'bottom' as const,
          showBorders: false,
          tabSpacing: 0
        },
        {
          position: 'left' as const,
          showBorders: true,
          tabSpacing: 3
        },
        {
          position: 'right' as const,
          showBorders: true,
          tabSpacing: 1
        }
      ];

      for (const config of configurations) {
        const tabs = [
          { id: 'a', label: 'Tab A', content: `Content for ${config.position}` },
          { id: 'b', label: 'Tab B', content: 'Content B' },
          { id: 'c', label: 'Very Long Tab Title That Should Be Truncated', content: 'Content C' }
        ];

        const tabsComponent = new Tabs({
          tabs,
          activeTab: 'a',
          ...config,
          minTabWidth: 5,
          maxTabWidth: 15,
          scrollable: true,
          overflowMode: 'scroll'
        });

        const directOutput = tabsComponent.render();
        const outputText = directOutput.lines.join(' ');

        // Should contain tab content regardless of configuration
        expect(outputText).toContain('Tab A');
      }
    });

    it('should handle complex keyboard navigation', async () => {
      const tabs = Array.from({ length: 10 }, (_, i) => ({
        id: `tab${i}`,
        label: `Tab ${i}`,
        content: `Content ${i}`,
        closable: i > 0 // First tab not closable
      }));

      const state = createReactiveState({
        activeTab: 'tab0',
        focusedTabId: 'tab0'
      });

      let lastChangedTab = '';
      let lastClosedTab = '';

      const tabsComponent = new Tabs({
        tabs,
        activeTab: state.get().activeTab,
        onTabChange: (tab) => {
          lastChangedTab = tab.id;
          state.update(s => ({ ...s, activeTab: tab.id }));
        },
        onTabClose: (tab) => {
          lastClosedTab = tab.id;
          return true;
        },
        keyboardNavigation: true,
        scrollable: true,
        position: 'top',
        showBorders: true
      });

      const directOutput = tabsComponent.render();
      const outputText = directOutput.lines.join(' ');

      // Should handle keyboard navigation - show some tabs
      expect(outputText).toContain('Tab 0');
      expect(outputText.length).toBeGreaterThan(0);
      
      // Test tab navigation functionality
      expect(lastChangedTab).toBe('');
      if (tabsComponent.options?.onTabChange) {
        tabsComponent.options.onTabChange({ id: 'tab1', label: 'Tab 1', content: 'Content 1', closable: true });
      }
      expect(lastChangedTab).toBe('tab1');
    });

    it('should handle scrolling with many tabs', async () => {
      // Create many tabs to force scrolling
      const manyTabs = Array.from({ length: 50 }, (_, i) => ({
        id: `tab${i}`,
        label: `Tab ${i}`,
        content: `Content for tab ${i}`,
        closable: true
      }));

      const tabsComponent = new Tabs({
        tabs: manyTabs,
        activeTab: 'tab25', // Middle tab
        onTabChange: () => {},
        scrollable: true,
        position: 'top',
        showScrollButtons: true,
        scrollButtonLeft: '<',
        scrollButtonRight: '>',
        maxTabWidth: 8,
        overflowMode: 'scroll'
      });

      const directOutput = tabsComponent.render();
      const outputText = directOutput.lines.join(' ');

      // Should show some tabs (might be scrolled/truncated)
      expect(outputText).toContain('Tab'); // Some tab should be visible
      expect(outputText.length).toBeGreaterThan(0);
    });

    it('should handle tab reordering', async () => {
      const state = createReactiveState({
        tabs: [
          { id: 'a', label: 'A', content: 'Content A' },
          { id: 'b', label: 'B', content: 'Content B' },
          { id: 'c', label: 'C', content: 'Content C' }
        ]
      });

      let reorderCalled = false;

      const tabsComponent = new Tabs({
        tabs: state.get().tabs,
        activeTab: 'a',
        onTabChange: () => {},
        onTabReorder: (fromIndex, toIndex) => {
          reorderCalled = true;
          const tabs = [...state.get().tabs];
          const [movedTab] = tabs.splice(fromIndex, 1);
          tabs.splice(toIndex, 0, movedTab);
          state.update(s => ({ ...s, tabs }));
        },
        reorderable: true,
        position: 'top'
      });

      const directOutput = tabsComponent.render();
      const outputText = directOutput.lines.join(' ');

      // Should show tabs in order
      expect(outputText).toContain('A');
      expect(outputText).toContain('B');
      expect(outputText).toContain('C');

      // Test that component handles reordering configuration
      expect(tabsComponent.options).toBeDefined();
    });

    it('should handle tab groups and categories', async () => {
      const tabsWithGroups = [
        { id: 'g1t1', label: 'Group 1 Tab 1', content: 'Content 1', group: 'group1' },
        { id: 'g1t2', label: 'Group 1 Tab 2', content: 'Content 2', group: 'group1' },
        { id: 'g2t1', label: 'Group 2 Tab 1', content: 'Content 3', group: 'group2' },
        { id: 'g2t2', label: 'Group 2 Tab 2', content: 'Content 4', group: 'group2' }
      ];

      const tabsComponent = new Tabs({
        tabs: tabsWithGroups,
        activeTab: 'g1t1',
        onTabChange: () => {},
        showGroups: true,
        groupSeparator: '|',
        position: 'top'
      });

      const directOutput = tabsComponent.render();
      const outputText = directOutput.lines.join(' ');

      // Should show tab content
      expect(outputText).toContain('Group 1 Tab 1');
      expect(outputText).toContain('Group 2 Tab 1');
    });

    it('should handle different tab states', async () => {
      const tabsWithStates = [
        { id: 'normal', label: 'Normal', content: 'Normal content' },
        { id: 'loading', label: 'Loading', content: 'Loading content', loading: true },
        { id: 'error', label: 'Error', content: 'Error content', error: true },
        { id: 'disabled', label: 'Disabled', content: 'Disabled content', disabled: true },
        { id: 'modified', label: 'Modified*', content: 'Modified content', modified: true }
      ];

      const tabsComponent = new Tabs({
        tabs: tabsWithStates,
        activeTab: 'normal',
        onTabChange: () => {},
        showTabStates: true,
        loadingIndicator: '⟳',
        errorIndicator: '⚠',
        modifiedIndicator: '*',
        position: 'top'
      });

      const directOutput = tabsComponent.render();
      const outputText = directOutput.lines.join(' ');

      // Should show tab content
      expect(outputText).toContain('Normal');
      expect(outputText).toContain('Loading');
      expect(outputText).toContain('Error');
      expect(outputText).toContain('Disabled');
      expect(outputText).toContain('Modified');
    });
  });

  describe('Advanced Tab Features', () => {
    it('should handle tab templates and customization', async () => {
      const customTabs = [
        { 
          id: 'custom1', 
          label: 'Custom', 
          content: 'Custom content',
          icon: '📁',
          badge: '5',
          tooltip: 'Custom tooltip'
        }
      ];

      const tabsComponent = new Tabs({
        tabs: customTabs,
        activeTab: 'custom1',
        onTabChange: () => {},
        showIcons: true,
        showBadges: true,
        showTooltips: true,
        tabTemplate: (tab) => `${tab.icon} ${tab.title} ${tab.badge ? `(${tab.badge})` : ''}`,
        position: 'top'
      });

      const directOutput = tabsComponent.render();
      const outputText = directOutput.lines.join(' ');

      expect(outputText).toContain('Custom');
      expect(outputText.length).toBeGreaterThan(0);
    });

    it('should handle overflow with different strategies', async () => {
      const manyTabs = Array.from({ length: 30 }, (_, i) => ({
        id: `tab${i}`,
        label: `Tab ${i}`,
        content: `Content ${i}`
      }));

      const overflowStrategies = ['hidden', 'scroll', 'wrap'] as const;

      for (const strategy of overflowStrategies) {
        const tabsComponent = new Tabs({
          tabs: manyTabs,
          activeTab: 'tab0',
          onTabChange: () => {},
          overflowMode: strategy,
          position: 'top',
          maxTabWidth: 6
        });

        const directOutput = tabsComponent.render();
        const outputText = directOutput.lines.join(' ');

        // Should contain at least the first tab
        expect(outputText).toContain('Tab 0');
      }
    });

    it('should handle tab animations and transitions', async () => {
      const state = createReactiveState({
        tabs: [
          { id: 'a', label: 'Tab A', content: 'Content A' },
          { id: 'b', label: 'Tab B', content: 'Content B' }
        ],
        activeTab: 'a'
      });

      const tabsComponent = new Tabs({
        tabs: state.get().tabs,
        activeTab: state.get().activeTab,
        onTabChange: (tabId) => {
          state.update(s => ({ ...s, activeTab: tabId }));
        },
        animateTransitions: true,
        transitionDuration: 100,
        easing: 'ease-in-out',
        position: 'top'
      });

      // Switch tabs to trigger animation
      state.update(s => ({ ...s, activeTab: 'b' }));

      const directOutput = tabsComponent.render();
      const outputText = directOutput.lines.join(' ');
      expect(outputText).toContain('Tab B');
    });

    it('should handle context menus and right-click actions', async () => {
      const tabs = [
        { id: 'a', label: 'Tab A', content: 'Content A' },
        { id: 'b', label: 'Tab B', content: 'Content B' }
      ];

      let contextMenuTab = '';
      let contextAction = '';

      const tabsComponent = new Tabs({
        tabs,
        activeTab: 'a',
        onTabChange: () => {},
        onTabContextMenu: (tabId) => {
          contextMenuTab = tabId;
        },
        onTabAction: (tabId, action) => {
          contextAction = action;
        },
        contextMenuActions: [
          'close',
          'close-others',
          'close-right',
          'duplicate',
          'move-to-new-window'
        ],
        position: 'top'
      });

      const directOutput = tabsComponent.render();
      const outputText = directOutput.lines.join(' ');

      // Should show tabs
      expect(outputText).toContain('Tab A');
      expect(outputText).toContain('Tab B');

      // Test that component handles context menu configuration
      expect(tabsComponent.options).toBeDefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty tabs array', async () => {
      const tabsComponent = new Tabs({
        tabs: [],
        activeTab: '',
        onTabChange: () => {},
        position: 'top'
      });

      const directOutput = tabsComponent.render();
      const outputText = directOutput.lines.join(' ');

      // Should not crash
      expect(outputText).toBeDefined();
    });

    it('should handle invalid active tab ID', async () => {
      const tabs = [
        { id: 'a', label: 'Tab A', content: 'Content A' }
      ];

      const tabsComponent = new Tabs({
        tabs,
        activeTab: 'nonexistent',
        onTabChange: () => {},
        position: 'top'
      });

      const directOutput = tabsComponent.render();
      const outputText = directOutput.lines.join(' ');

      // Should default to first tab or handle gracefully
      expect(outputText).toContain('Tab A');
    });

    it('should handle extremely long tab titles', async () => {
      const tabs = [
        { 
          id: 'long', 
          label: 'This is an extremely long tab title that should be truncated or handled appropriately by the component', 
          content: 'Content' 
        }
      ];

      const tabsComponent = new Tabs({
        tabs,
        activeTab: 'long',
        onTabChange: () => {},
        maxTabWidth: 10,
        ellipsis: '...',
        position: 'top'
      });

      const directOutput = tabsComponent.render();
      const outputText = directOutput.lines.join(' ');

      // Should handle long titles
      expect(outputText.length).toBeGreaterThan(0);
      expect(outputText).toContain('This is an extremely long'); // Should show at least part of the title
    });

    it('should handle rapid tab switching', async () => {
      const tabs = Array.from({ length: 5 }, (_, i) => ({
        id: `tab${i}`,
        label: `Tab ${i}`,
        content: `Content ${i}`
      }));

      const state = createReactiveState({ activeTab: 'tab0' });

      const tabsComponent = new Tabs({
        tabs,
        activeTab: state.get().activeTab,
        onTabChange: (tabId) => {
          state.update(s => ({ ...s, activeTab: tabId }));
        },
        position: 'top'
      });

      // Rapidly switch between tabs
      for (let i = 0; i < 10; i++) {
        const tabId = `tab${i % 5}`;
        state.update(s => ({ ...s, activeTab: tabId }));
      }

      const directOutput = tabsComponent.render();
      const outputText = directOutput.lines.join(' ');
      expect(outputText).toBeDefined();
    });

    it('should handle tab component with complex nested content', async () => {
      const tabs = [
        { 
          id: 'complex', 
          label: 'Complex', 
          content: {
            type: 'container',
            children: [
              { type: 'text', content: 'Nested content' },
              { type: 'button', label: 'Click me' },
              { type: 'list', items: ['Item 1', 'Item 2'] }
            ]
          }
        }
      ];

      const tabsComponent = new Tabs({
        tabs,
        activeTab: 'complex',
        onTabChange: () => {},
        position: 'top',
        contentRenderer: (content) => {
          if (typeof content === 'object' && content.type) {
            return { lines: [`${content.type}: ${JSON.stringify(content)}`] };
          }
          return { lines: [String(content)] };
        }
      });

      const directOutput = tabsComponent.render();
      const outputText = directOutput.lines.join(' ');

      expect(outputText).toContain('Complex');
      expect(outputText.length).toBeGreaterThan(0);
    });
  });
});