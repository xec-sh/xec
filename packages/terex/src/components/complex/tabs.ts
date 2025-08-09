/**
 * Tabs component for Terex
 * Provides tabbed interface with keyboard navigation, dynamic tab management, and overflow handling
 */

import { StyleBuilder } from '../../core/color.js';
import { BaseComponent } from '../../core/component.js';

import type { Key, Output, Component } from '../../core/types.js';

// ============================================================================
// Type Definitions
// ============================================================================

export type TabId = string | number;
export type TabPosition = 'top' | 'bottom' | 'left' | 'right';
export type TabSize = 'small' | 'medium' | 'large';

export interface TabData {
  id: TabId;
  label: string;
  content: Component<unknown> | string;
  icon?: string;
  closable?: boolean;
  disabled?: boolean;
  loading?: boolean;
  badge?: string | number;
  tooltip?: string;
  metadata?: Record<string, unknown>;
}

export interface TabState {
  visible: boolean;
  active: boolean;
  focused: boolean;
  loading: boolean;
  closable: boolean;
  disabled: boolean;
  width: number;
  x: number;
}

export interface TabsOptions {
  tabs: TabData[];
  activeTab?: TabId;
  position?: TabPosition;
  size?: TabSize;
  closable?: boolean;
  addable?: boolean;
  draggable?: boolean;
  scrollable?: boolean;
  animated?: boolean;
  lazy?: boolean;
  keepAlive?: boolean;
  showBorders?: boolean;
  showIcons?: boolean;
  showBadges?: boolean;
  maxTabs?: number;
  minTabWidth?: number;
  maxTabWidth?: number;
  tabSpacing?: number;
  overflowMode?: 'scroll' | 'dropdown' | 'wrap';
  keyboardNavigation?: boolean;
  addTabText?: string;
  emptyText?: string;
  loadingText?: string;
  onTabChange?: (tab: TabData, previousTab?: TabData) => void;
  onTabClose?: (tab: TabData) => boolean | void;
  onTabAdd?: () => TabData | void;
  onTabDrag?: (dragTab: TabData, dropTab: TabData, position: 'before' | 'after') => boolean;
  onTabRightClick?: (tab: TabData, event: { x: number; y: number }) => void;
  tabRenderer?: (tab: TabData, state: TabState) => string;
  contentRenderer?: (tab: TabData) => Output;
}

export interface TabsState {
  tabs: Map<TabId, TabData>;
  tabStates: Map<TabId, TabState>;
  activeTab: TabId | null;
  focusedTab: TabId | null;
  tabOrder: TabId[];
  visibleTabs: TabId[];
  scrollOffset: number;
  maxVisibleTabs: number;
  availableWidth: number;
  showAddButton: boolean;
  showOverflowButton: boolean;
  isOverflowMenuOpen: boolean;
  dragState: {
    dragging: boolean;
    dragTab: TabId | null;
    dropPosition: 'before' | 'after' | null;
    dropTab: TabId | null;
  };
}

// ============================================================================
// Tabs Component
// ============================================================================

export class Tabs extends BaseComponent<TabsState> {
  private options: Required<Omit<TabsOptions, 'activeTab'>> & { activeTab?: TabId };
  private style: StyleBuilder;

  constructor(options: TabsOptions) {
    const initialTabs = new Map<TabId, TabData>();
    const initialTabStates = new Map<TabId, TabState>();
    const tabOrder: TabId[] = [];

    // Initialize tabs and their states
    options.tabs.forEach((tab, index) => {
      initialTabs.set(tab.id, { ...tab });
      initialTabStates.set(tab.id, {
        visible: true,
        active: false,
        focused: false,
        loading: tab.loading || false,
        closable: tab.closable ?? options.closable ?? true,
        disabled: tab.disabled || false,
        width: 0,
        x: 0
      });
      tabOrder.push(tab.id);
    });

    // Set initial active tab
    const activeTab = options.activeTab || (options.tabs.length > 0 ? options.tabs[0]?.id : null);
    if (activeTab && initialTabStates.has(activeTab)) {
      const tabState = initialTabStates.get(activeTab);
      if (tabState) {
        tabState.active = true;
      }
    }

    const initialState: TabsState = {
      tabs: initialTabs,
      tabStates: initialTabStates,
      activeTab: activeTab ?? null,
      focusedTab: activeTab ?? null,
      tabOrder,
      visibleTabs: [],
      scrollOffset: 0,
      maxVisibleTabs: 10,
      availableWidth: process.stdout.columns || 80,
      showAddButton: false,
      showOverflowButton: false,
      isOverflowMenuOpen: false,
      dragState: {
        dragging: false,
        dragTab: null,
        dropPosition: null,
        dropTab: null
      }
    };

    super({ initialState });

    // Set default options
    this.options = {
      tabs: options.tabs || [],
      activeTab: options.activeTab,
      position: options.position || 'top',
      size: options.size || 'medium',
      closable: options.closable ?? true,
      addable: options.addable ?? false,
      draggable: options.draggable ?? false,
      scrollable: options.scrollable ?? true,
      animated: options.animated ?? true,
      lazy: options.lazy ?? false,
      keepAlive: options.keepAlive ?? true,
      showBorders: options.showBorders ?? true,
      showIcons: options.showIcons ?? true,
      showBadges: options.showBadges ?? true,
      maxTabs: options.maxTabs || 20,
      minTabWidth: options.minTabWidth || 8,
      maxTabWidth: options.maxTabWidth || 30,
      tabSpacing: options.tabSpacing || 1,
      overflowMode: options.overflowMode || 'scroll',
      keyboardNavigation: options.keyboardNavigation ?? true,
      addTabText: options.addTabText || '+',
      emptyText: options.emptyText || 'No tabs',
      loadingText: options.loadingText || 'Loading...',
      onTabChange: options.onTabChange ?? (() => {}),
      onTabClose: options.onTabClose ?? (() => true),
      onTabAdd: options.onTabAdd ?? (() => {}),
      onTabDrag: options.onTabDrag ?? (() => true),
      onTabRightClick: options.onTabRightClick ?? (() => {}),
      tabRenderer: options.tabRenderer ?? ((tab: TabData) => tab.label),
      contentRenderer: options.contentRenderer ?? (() => ({ lines: [] }))
    };

    this.style = new StyleBuilder();

    // Initialize layout
    this.calculateTabLayout();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private calculateTabLayout(): void {
    const { availableWidth } = this.state;
    let currentX = 0;
    let totalWidth = 0;

    // Calculate space needed for add button and overflow button
    let reservedWidth = 0;
    if (this.options.addable) {
      reservedWidth += 4; // "[ + ]" width
    }
    if (this.options.overflowMode === 'dropdown') {
      reservedWidth += 4; // "[ » ]" width
    }

    const contentWidth = availableWidth - reservedWidth - 2; // Account for borders

    for (const tabId of this.state.tabOrder) {
      const tab = this.state.tabs.get(tabId);
      const tabState = this.state.tabStates.get(tabId);
      if (!tab || !tabState) continue;

      // Calculate tab width
      let tabWidth = this.calculateTabWidth(tab);
      tabWidth = Math.max(this.options.minTabWidth, Math.min(this.options.maxTabWidth, tabWidth));

      tabState.width = tabWidth;
      tabState.x = currentX;

      currentX += tabWidth + this.options.tabSpacing;
      totalWidth += tabWidth + this.options.tabSpacing;

      // Check if tab fits in available width
      tabState.visible = currentX <= contentWidth;
    }

    // Calculate visible tabs and overflow state
    this.updateVisibleTabs();
  }

  private calculateTabWidth(tab: TabData): number {
    let width = tab.label.length + 2; // Label + padding

    if (this.options.showIcons && tab.icon) {
      width += 2; // Icon + space
    }

    if (this.options.showBadges && tab.badge) {
      width += String(tab.badge).length + 3; // Badge + brackets + space
    }

    if (tab.closable) {
      width += 2; // Close button + space
    }

    return width;
  }

  private updateVisibleTabs(): void {
    const visibleTabs: TabId[] = [];
    let totalWidth = 0;
    const maxWidth = this.state.availableWidth - 4; // Account for borders and buttons

    for (const tabId of this.state.tabOrder) {
      const tabState = this.state.tabStates.get(tabId);
      if (!tabState) continue;

      if (totalWidth + tabState.width <= maxWidth) {
        visibleTabs.push(tabId);
        totalWidth += tabState.width + this.options.tabSpacing;
      } else {
        break;
      }
    }

    this.setState({
      visibleTabs,
      showAddButton: this.options.addable && totalWidth + 4 <= maxWidth,
      showOverflowButton: visibleTabs.length < this.state.tabOrder.length
    });
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  render(): Output {
    const lines: string[] = [];

    if (this.state.tabOrder.length === 0) {
      return { lines: [this.style.dim().text(this.options.emptyText)] };
    }

    // Render based on position
    switch (this.options.position) {
      case 'top':
        lines.push(...this.renderTabBar());
        lines.push(...this.renderContent());
        break;
      case 'bottom':
        lines.push(...this.renderContent());
        lines.push(...this.renderTabBar());
        break;
      case 'left':
        return this.renderSideLayout('left');
      case 'right':
        return this.renderSideLayout('right');
    }

    return { lines };
  }

  private renderTabBar(): string[] {
    const lines: string[] = [];

    // Render tab buttons
    lines.push(this.renderTabButtons());

    // Render borders
    if (this.options.showBorders) {
      lines.push(this.renderTabBarBorder());
    }

    // Render overflow menu if open
    if (this.state.isOverflowMenuOpen) {
      lines.push(...this.renderOverflowMenu());
    }

    return lines;
  }

  private renderTabButtons(): string {
    let line = '';

    // Left border
    if (this.options.showBorders) {
      line += '┌';
    }

    // Render visible tabs
    for (let i = 0; i < this.state.visibleTabs.length; i++) {
      const tabId = this.state.visibleTabs[i];
      if (!tabId) continue;
      const tab = this.state.tabs.get(tabId);
      const tabState = this.state.tabStates.get(tabId);
      
      if (!tab || !tabState) continue;

      line += this.renderTab(tab, tabState);

      // Tab separator
      if (i < this.state.visibleTabs.length - 1 || this.state.showAddButton || this.state.showOverflowButton) {
        line += this.options.showBorders ? '┬' : '│';
      }
    }

    // Add button
    if (this.state.showAddButton) {
      line += this.renderAddButton();
      if (this.state.showOverflowButton) {
        line += this.options.showBorders ? '┬' : '│';
      }
    }

    // Overflow button
    if (this.state.showOverflowButton) {
      line += this.renderOverflowButton();
    }

    // Fill remaining space
    const currentLength = this.getVisualLength(line);
    const remaining = Math.max(0, this.state.availableWidth - currentLength - 1);
    line += '─'.repeat(remaining);

    // Right border
    if (this.options.showBorders) {
      line += '┐';
    }

    return line;
  }

  private renderTab(tab: TabData, state: TabState): string {
    if (this.options.tabRenderer) {
      return this.options.tabRenderer(tab, state);
    }

    let tabContent = '';

    // Add icon
    if (this.options.showIcons && tab.icon) {
      tabContent += `${tab.icon} `;
    }

    // Add label
    let label = tab.label;
    const maxLabelWidth = state.width - (tabContent.length + (tab.closable ? 2 : 0) + (tab.badge ? String(tab.badge).length + 3 : 0));
    if (label.length > maxLabelWidth) {
      label = label.slice(0, maxLabelWidth - 1) + '…';
    }
    tabContent += label;

    // Add badge
    if (this.options.showBadges && tab.badge) {
      tabContent += ` (${tab.badge})`;
    }

    // Add close button
    if (state.closable) {
      tabContent += ' ×';
    }

    // Pad to tab width
    tabContent = tabContent.padEnd(state.width);

    // Apply styling
    if (state.disabled) {
      return this.style.dim().text(tabContent);
    } else if (state.active) {
      return this.style.cyan().inverse().text(tabContent);
    } else if (state.focused) {
      return this.style.cyan().underline().text(tabContent);
    } else if (state.loading) {
      return this.style.yellow().text(tabContent);
    } else {
      return this.style.text(tabContent);
    }
  }

  private renderAddButton(): string {
    const button = ` ${this.options.addTabText} `;
    const focused = this.state.focusedTab === 'add-button';
    
    if (focused) {
      return this.style.green().inverse().text(button);
    } else {
      return this.style.green().text(button);
    }
  }

  private renderOverflowButton(): string {
    const button = ' » ';
    const focused = this.state.focusedTab === 'overflow-button';
    
    if (focused) {
      return this.style.blue().inverse().text(button);
    } else {
      return this.style.blue().text(button);
    }
  }

  private renderTabBarBorder(): string {
    let border = '';
    
    if (this.options.position === 'top') {
      border = '├';
      
      for (let i = 0; i < this.state.visibleTabs.length; i++) {
        const tabId = this.state.visibleTabs[i];
        if (!tabId) continue;
        const tabState = this.state.tabStates.get(tabId);
        
        if (tabState) {
          if (tabState.active) {
            border += ' '.repeat(tabState.width);
          } else {
            border += '─'.repeat(tabState.width);
          }
          
          if (i < this.state.visibleTabs.length - 1) {
            border += '┼';
          }
        }
      }
      
      // Fill remaining space
      const currentLength = this.getVisualLength(border);
      const remaining = Math.max(0, this.state.availableWidth - currentLength - 1);
      border += '─'.repeat(remaining);
      border += '┤';
    }

    return border;
  }

  private renderContent(): string[] {
    const lines: string[] = [];
    const { activeTab } = this.state;

    if (!activeTab) {
      return lines;
    }

    const tab = this.state.tabs.get(activeTab);
    if (!tab) {
      return lines;
    }

    const tabState = this.state.tabStates.get(activeTab);
    if (tabState?.loading) {
      lines.push(this.style.yellow().text(`⏳ ${this.options.loadingText}`));
      return lines;
    }

    // Render tab content
    if (this.options.contentRenderer) {
      const output = this.options.contentRenderer(tab);
      if ('lines' in output) {
        lines.push(...output.lines);
      }
    } else if (typeof tab.content === 'string') {
      lines.push(...tab.content.split('\n'));
    } else if ('render' in tab.content) {
      const output = tab.content.render();
      if ('lines' in output) {
        lines.push(...output.lines);
      }
    }

    // Add content borders
    if (this.options.showBorders && lines.length > 0) {
      const maxWidth = Math.max(...lines.map(line => this.getVisualLength(line)));
      const paddedLines = lines.map(line => {
        const padding = Math.max(0, maxWidth - this.getVisualLength(line));
        return `│ ${line}${' '.repeat(padding)} │`;
      });
      
      // Top border (if tabs are at bottom)
      if (this.options.position === 'bottom') {
        const topBorder = '┌' + '─'.repeat(maxWidth + 2) + '┐';
        paddedLines.unshift(topBorder);
      }
      
      // Bottom border
      const bottomBorder = '└' + '─'.repeat(maxWidth + 2) + '┘';
      paddedLines.push(bottomBorder);
      
      return paddedLines;
    }

    return lines;
  }

  private renderSideLayout(side: 'left' | 'right'): Output {
    const lines: string[] = [];
    const tabBarWidth = Math.max(...this.state.tabOrder.map(id => {
      const tab = this.state.tabs.get(id);
      return tab ? this.calculateTabWidth(tab) : 0;
    }));

    const contentWidth = this.state.availableWidth - tabBarWidth - 3;

    // Get content lines
    const contentLines = this.renderContent();
    const maxContentHeight = Math.max(contentLines.length, this.state.tabOrder.length);

    for (let i = 0; i < maxContentHeight; i++) {
      let line = '';
      
      // Left side tabs
      if (side === 'left') {
        if (i < this.state.tabOrder.length) {
          const tabId = this.state.tabOrder[i];
          if (!tabId) continue;
          const tab = this.state.tabs.get(tabId);
          const tabState = this.state.tabStates.get(tabId);
          
          if (tab && tabState) {
            line += this.renderTab(tab, tabState);
          } else {
            line += ' '.repeat(tabBarWidth);
          }
        } else {
          line += ' '.repeat(tabBarWidth);
        }
        
        line += ' │ ';
        
        // Content
        if (i < contentLines.length) {
          line += (contentLines[i] || '').padEnd(contentWidth);
        } else {
          line += ' '.repeat(contentWidth);
        }
      } else {
        // Right side tabs
        // Content
        if (i < contentLines.length) {
          line += (contentLines[i] || '').padEnd(contentWidth);
        } else {
          line += ' '.repeat(contentWidth);
        }
        
        line += ' │ ';
        
        if (i < this.state.tabOrder.length) {
          const tabId = this.state.tabOrder[i];
          if (!tabId) continue;
          const tab = this.state.tabs.get(tabId);
          const tabState = this.state.tabStates.get(tabId);
          
          if (tab && tabState) {
            line += this.renderTab(tab, tabState);
          } else {
            line += ' '.repeat(tabBarWidth);
          }
        } else {
          line += ' '.repeat(tabBarWidth);
        }
      }
      
      lines.push(line);
    }

    return { lines };
  }

  private renderOverflowMenu(): string[] {
    const lines: string[] = [];
    const hiddenTabs = this.state.tabOrder.filter(id => !this.state.visibleTabs.includes(id));

    if (hiddenTabs.length === 0) return lines;

    // Menu header
    lines.push('┌─ More Tabs ─┐');

    // Menu items
    hiddenTabs.forEach((tabId, index) => {
      const tab = this.state.tabs.get(tabId);
      const tabState = this.state.tabStates.get(tabId);
      
      if (tab && tabState) {
        let item = `│ ${tab.label}`;
        if (tab.badge) {
          item += ` (${tab.badge})`;
        }
        item = item.padEnd(14) + ' │';
        
        if (tabState.active) {
          item = this.style.cyan().text(item);
        } else if (tabState.disabled) {
          item = this.style.dim().text(item);
        }
        
        lines.push(item);
      }
    });

    // Menu footer
    lines.push('└──────────────┘');

    return lines;
  }

  private getVisualLength(text: string): number {
    // Remove ANSI escape sequences for accurate length calculation
    return text.replace(/\x1b\[[0-9;]*m/g, '').length;
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  override handleKeypress(key: Key): boolean {
    if (!this.options.keyboardNavigation) {
      return false;
    }

    let handled = false;

    switch (key.name) {
      case 'left':
      case 'right':
        if (this.options.position === 'top' || this.options.position === 'bottom') {
          this.handleHorizontalNavigation(key.name === 'left' ? -1 : 1);
          handled = true;
        }
        break;

      case 'up':
      case 'down':
        if (this.options.position === 'left' || this.options.position === 'right') {
          this.handleVerticalNavigation(key.name === 'up' ? -1 : 1);
          handled = true;
        }
        break;

      case 'tab':
        this.handleTabNavigation(key.shift ? -1 : 1);
        handled = true;
        break;

      case 'enter':
      case 'return':
        this.handleTabActivation();
        handled = true;
        break;

      case 'space':
        if (this.state.focusedTab === 'add-button') {
          this.handleAddTab();
          handled = true;
        } else if (this.state.focusedTab === 'overflow-button') {
          this.toggleOverflowMenu();
          handled = true;
        }
        break;

      case 'delete':
      case 'backspace':
        if (key.ctrl) {
          this.handleTabClose();
          handled = true;
        }
        break;

      case 'home':
        this.focusFirstTab();
        handled = true;
        break;

      case 'end':
        this.focusLastTab();
        handled = true;
        break;

      case 'escape':
        if (this.state.isOverflowMenuOpen) {
          this.toggleOverflowMenu();
          handled = true;
        }
        break;

      case 'n':
        if (key.ctrl && this.options.addable) {
          this.handleAddTab();
          handled = true;
        }
        break;

      case 'w':
        if (key.ctrl) {
          this.handleTabClose();
          handled = true;
        }
        break;

      default:
        // Number keys for quick tab switching
        if (key.name && /^[1-9]$/.test(key.name)) {
          const tabIndex = parseInt(key.name) - 1;
          if (tabIndex < this.state.tabOrder.length) {
            const tabId = this.state.tabOrder[tabIndex];
            if (tabId) {
              this.activateTab(tabId);
            }
            handled = true;
          }
        }
    }

    if (!handled) {
      handled = super.handleKeypress(key);
    }

    return handled;
  }

  private handleHorizontalNavigation(direction: number): void {
    const currentIndex = this.getCurrentFocusIndex();
    const maxIndex = this.getMaxFocusIndex();
    
    const newIndex = Math.max(0, Math.min(maxIndex, currentIndex + direction));
    this.focusByIndex(newIndex);
  }

  private handleVerticalNavigation(direction: number): void {
    this.handleHorizontalNavigation(direction);
  }

  private handleTabNavigation(direction: number): void {
    this.handleHorizontalNavigation(direction);
  }

  private handleTabActivation(): void {
    const { focusedTab } = this.state;
    
    if (focusedTab === 'add-button') {
      this.handleAddTab();
    } else if (focusedTab === 'overflow-button') {
      this.toggleOverflowMenu();
    } else if (focusedTab && this.state.tabs.has(focusedTab)) {
      this.activateTab(focusedTab);
    }
  }

  private handleTabClose(): void {
    const { focusedTab } = this.state;
    
    if (focusedTab && this.state.tabs.has(focusedTab)) {
      const tab = this.state.tabs.get(focusedTab);
      const tabState = this.state.tabStates.get(focusedTab);
      
      if (tab && tabState?.closable) {
        this.closeTab(focusedTab);
      }
    }
  }

  private handleAddTab(): void {
    if (this.options.onTabAdd) {
      const newTab = this.options.onTabAdd();
      if (newTab) {
        this.addTab(newTab);
      }
    }
  }

  // ============================================================================
  // Focus Management
  // ============================================================================

  private getCurrentFocusIndex(): number {
    const { focusedTab } = this.state;
    
    if (focusedTab === 'add-button') {
      return this.state.visibleTabs.length;
    } else if (focusedTab === 'overflow-button') {
      return this.state.visibleTabs.length + (this.state.showAddButton ? 1 : 0);
    } else if (focusedTab) {
      return this.state.visibleTabs.indexOf(focusedTab);
    }
    
    return -1;
  }

  private getMaxFocusIndex(): number {
    let maxIndex = this.state.visibleTabs.length - 1;
    
    if (this.state.showAddButton) {
      maxIndex++;
    }
    
    if (this.state.showOverflowButton) {
      maxIndex++;
    }
    
    return maxIndex;
  }

  private focusByIndex(index: number): void {
    if (index < this.state.visibleTabs.length) {
      const tab = this.state.visibleTabs[index];
      if (tab) {
        this.focusTab(tab);
      }
    } else if (index === this.state.visibleTabs.length && this.state.showAddButton) {
      this.focusTab('add-button');
    } else if (this.state.showOverflowButton) {
      this.focusTab('overflow-button');
    }
  }

  private focusTab(tabId: TabId | 'add-button' | 'overflow-button'): void {
    // Clear previous focus
    if (this.state.focusedTab && this.state.tabStates.has(this.state.focusedTab)) {
      this.state.tabStates.get(this.state.focusedTab)!.focused = false;
    }

    this.setState({ focusedTab: tabId });

    // Set new focus
    if (typeof tabId === 'string' && (tabId === 'add-button' || tabId === 'overflow-button')) {
      // Special buttons don't have tab states
      return;
    }

    const tabState = this.state.tabStates.get(tabId);
    if (tabState) {
      tabState.focused = true;
    }
  }

  private focusFirstTab(): void {
    if (this.state.visibleTabs.length > 0) {
      const firstTab = this.state.visibleTabs[0];
      if (firstTab) {
        this.focusTab(firstTab);
      }
    }
  }

  private focusLastTab(): void {
    if (this.state.visibleTabs.length > 0) {
      const lastIndex = this.state.visibleTabs.length - 1;
      const lastTab = this.state.visibleTabs[lastIndex];
      if (lastTab) {
        this.focusTab(lastTab);
      }
    }
  }

  // ============================================================================
  // Tab Management
  // ============================================================================

  private activateTab(tabId: TabId): void {
    const tab = this.state.tabs.get(tabId);
    const tabState = this.state.tabStates.get(tabId);
    
    if (!tab || !tabState || tabState.disabled) return;

    // Get previous active tab
    const previousActiveTab = this.state.activeTab ? this.state.tabs.get(this.state.activeTab) : undefined;

    // Clear previous active state
    if (this.state.activeTab && this.state.tabStates.has(this.state.activeTab)) {
      const prevTabState = this.state.tabStates.get(this.state.activeTab);
      if (prevTabState) {
        prevTabState.active = false;
      }
    }

    // Set new active state
    tabState.active = true;
    this.setState({ activeTab: tabId });
    this.focusTab(tabId);

    // Emit change event
    if (this.options.onTabChange) {
      this.options.onTabChange(tab, previousActiveTab);
    }
  }

  private closeTab(tabId: TabId): void {
    const tab = this.state.tabs.get(tabId);
    if (!tab) return;

    // Check if tab can be closed
    if (this.options.onTabClose) {
      const canClose = this.options.onTabClose(tab);
      if (canClose === false) return;
    }

    // Find new active tab if this was active
    let newActiveTab: TabId | null = null;
    if (this.state.activeTab === tabId) {
      const currentIndex = this.state.tabOrder.indexOf(tabId);
      if (currentIndex > 0) {
        newActiveTab = this.state.tabOrder[currentIndex - 1] ?? null;
      } else if (currentIndex < this.state.tabOrder.length - 1) {
        newActiveTab = this.state.tabOrder[currentIndex + 1] ?? null;
      }
    }

    // Remove tab
    this.state.tabs.delete(tabId);
    this.state.tabStates.delete(tabId);
    this.setState({
      tabOrder: this.state.tabOrder.filter(id => id !== tabId),
      activeTab: newActiveTab || this.state.activeTab,
      focusedTab: newActiveTab || this.state.focusedTab
    });

    // Activate new tab if needed
    if (newActiveTab) {
      this.activateTab(newActiveTab);
    }

    // Recalculate layout
    this.calculateTabLayout();
  }

  private toggleOverflowMenu(): void {
    this.setState({ isOverflowMenuOpen: !this.state.isOverflowMenuOpen });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get all tabs
   */
  getTabs(): TabData[] {
    return Array.from(this.state.tabs.values());
  }

  /**
   * Get active tab
   */
  getActiveTab(): TabData | null {
    return this.state.activeTab ? this.state.tabs.get(this.state.activeTab) || null : null;
  }

  /**
   * Set active tab
   */
  setActiveTab(tabId: TabId): void {
    if (this.state.tabs.has(tabId)) {
      this.activateTab(tabId);
    }
  }

  /**
   * Add a tab
   */
  addTab(tab: TabData, index?: number): void {
    // Check max tabs limit
    if (this.state.tabs.size >= this.options.maxTabs) {
      return;
    }

    // Add tab to maps
    this.state.tabs.set(tab.id, { ...tab });
    this.state.tabStates.set(tab.id, {
      visible: true,
      active: false,
      focused: false,
      loading: tab.loading || false,
      closable: tab.closable ?? this.options.closable,
      disabled: tab.disabled || false,
      width: 0,
      x: 0
    });

    // Insert into tab order
    if (index !== undefined && index >= 0 && index < this.state.tabOrder.length) {
      this.state.tabOrder.splice(index, 0, tab.id);
    } else {
      this.state.tabOrder.push(tab.id);
    }

    // Recalculate layout
    this.calculateTabLayout();

    // Activate if first tab or explicitly requested
    if (this.state.tabs.size === 1 || !this.state.activeTab) {
      this.activateTab(tab.id);
    }
  }

  /**
   * Remove a tab
   */
  removeTab(tabId: TabId): void {
    if (this.state.tabs.has(tabId)) {
      this.closeTab(tabId);
    }
  }

  /**
   * Update a tab
   */
  updateTab(tabId: TabId, updates: Partial<TabData>): void {
    const tab = this.state.tabs.get(tabId);
    if (!tab) return;

    Object.assign(tab, updates);

    // Update state if needed
    const tabState = this.state.tabStates.get(tabId);
    if (tabState && updates.disabled !== undefined) {
      tabState.disabled = updates.disabled;
    }
    if (tabState && updates.loading !== undefined) {
      tabState.loading = updates.loading;
    }

    // Recalculate layout if label or other visual properties changed
    if (updates.label || updates.icon || updates.badge || updates.closable) {
      this.calculateTabLayout();
    }
  }

  /**
   * Move a tab
   */
  moveTab(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= this.state.tabOrder.length) {
      return;
    }

    const tabOrder = [...this.state.tabOrder];
    const [movedTab] = tabOrder.splice(fromIndex, 1);
    if (movedTab) {
      tabOrder.splice(toIndex, 0, movedTab);
    }

    this.setState({ tabOrder });
    this.calculateTabLayout();
  }

  /**
   * Clear all tabs
   */
  clearTabs(): void {
    this.state.tabs.clear();
    this.state.tabStates.clear();
    this.setState({
      tabOrder: [],
      activeTab: null,
      focusedTab: null
    });
    this.calculateTabLayout();
  }

  /**
   * Get tab by ID
   */
  getTab(tabId: TabId): TabData | null {
    return this.state.tabs.get(tabId) || null;
  }

  /**
   * Check if tab exists
   */
  hasTab(tabId: TabId): boolean {
    return this.state.tabs.has(tabId);
  }

  /**
   * Get tab count
   */
  getTabCount(): number {
    return this.state.tabs.size;
  }

  /**
   * Refresh the component
   */
  refresh(): void {
    this.calculateTabLayout();
  }
}