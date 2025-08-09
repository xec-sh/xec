/**
 * Tree component for Terex
 * Provides hierarchical data display with expand/collapse, keyboard navigation, and lazy loading
 */

import { StyleBuilder } from '../../core/color.js';
import { BaseComponent } from '../../core/component.js';

import type { Key, Output } from '../../core/types.js';

// ============================================================================
// Type Definitions
// ============================================================================

export type TreeNodeId = string | number;
export type TreeNodeData = Record<string, unknown>;

export interface TreeNode<T = TreeNodeData> {
  id: TreeNodeId;
  label: string;
  data?: T;
  children?: TreeNode<T>[];
  parent?: TreeNodeId;
  isLeaf?: boolean;
  isLoading?: boolean;
  icon?: string;
  disabled?: boolean;
  hidden?: boolean;
  metadata?: Record<string, unknown>;
}

export interface TreeNodeState {
  expanded: boolean;
  selected: boolean;
  focused: boolean;
  loading: boolean;
  level: number;
  hasChildren: boolean;
  childCount: number;
  visibleChildCount: number;
}

export interface TreeSelectionState {
  selectedNodes: Set<TreeNodeId>;
  focusedNode: TreeNodeId | null;
  selectionMode: 'single' | 'multiple' | 'none';
}

export interface TreeExpansionState {
  expandedNodes: Set<TreeNodeId>;
  loadedNodes: Set<TreeNodeId>;
  loadingNodes: Set<TreeNodeId>;
}

export interface TreeOptions<T = TreeNodeData> {
  data: TreeNode<T>[];
  selectable?: boolean;
  multiSelect?: boolean;
  expandable?: boolean;
  lazyLoading?: boolean;
  checkable?: boolean;
  draggable?: boolean;
  searchable?: boolean;
  showRoot?: boolean;
  showLines?: boolean;
  showIcons?: boolean;
  defaultExpanded?: boolean;
  defaultExpandLevel?: number;
  expandOnSelect?: boolean;
  keyboardNavigation?: boolean;
  indentSize?: number;
  maxHeight?: number;
  virtualScrolling?: boolean;
  filterPlaceholder?: string;
  emptyText?: string;
  loadingText?: string;
  onNodeSelect?: (node: TreeNode<T>, selected: boolean) => void;
  onNodeExpand?: (node: TreeNode<T>, expanded: boolean) => void;
  onNodeDoubleClick?: (node: TreeNode<T>) => void;
  onNodeRightClick?: (node: TreeNode<T>) => void;
  onLazyLoad?: (node: TreeNode<T>) => Promise<TreeNode<T>[]>;
  onNodeDrag?: (dragNode: TreeNode<T>, dropNode: TreeNode<T>, position: 'before' | 'after' | 'inside') => boolean;
  nodeRenderer?: (node: TreeNode<T>, state: TreeNodeState) => string;
  iconRenderer?: (node: TreeNode<T>, state: TreeNodeState) => string;
}

export interface TreeState<T = TreeNodeData> {
  nodes: Map<TreeNodeId, TreeNode<T>>;
  nodeStates: Map<TreeNodeId, TreeNodeState>;
  selection: TreeSelectionState;
  expansion: TreeExpansionState;
  flatNodes: Array<{ node: TreeNode<T>; state: TreeNodeState }>;
  visibleNodes: Array<{ node: TreeNode<T>; state: TreeNodeState }>;
  searchQuery: string;
  isSearchVisible: boolean;
  scrollOffset: number;
  maxVisibleNodes: number;
}

// ============================================================================
// Tree Component
// ============================================================================

export class Tree<T extends TreeNodeData = TreeNodeData> extends BaseComponent<TreeState<T>> {
  private options: Required<TreeOptions<T>>;
  private style: StyleBuilder;

  constructor(options: TreeOptions<T>) {
    const initialState: TreeState<T> = {
      nodes: new Map(),
      nodeStates: new Map(),
      selection: {
        selectedNodes: new Set(),
        focusedNode: null,
        selectionMode: options.multiSelect ? 'multiple' : options.selectable ? 'single' : 'none'
      },
      expansion: {
        expandedNodes: new Set(),
        loadedNodes: new Set(),
        loadingNodes: new Set()
      },
      flatNodes: [],
      visibleNodes: [],
      searchQuery: '',
      isSearchVisible: false,
      scrollOffset: 0,
      maxVisibleNodes: options.maxHeight || 20
    };

    super({ initialState });

    // Set default options
    this.options = {
      data: options.data || [],
      selectable: options.selectable ?? true,
      multiSelect: options.multiSelect ?? false,
      expandable: options.expandable ?? true,
      lazyLoading: options.lazyLoading ?? false,
      checkable: options.checkable ?? false,
      draggable: options.draggable ?? false,
      searchable: options.searchable ?? false,
      showRoot: options.showRoot ?? true,
      showLines: options.showLines ?? true,
      showIcons: options.showIcons ?? true,
      defaultExpanded: options.defaultExpanded ?? false,
      defaultExpandLevel: options.defaultExpandLevel ?? 0,
      expandOnSelect: options.expandOnSelect ?? false,
      keyboardNavigation: options.keyboardNavigation ?? true,
      indentSize: options.indentSize ?? 2,
      maxHeight: options.maxHeight ?? 20,
      virtualScrolling: options.virtualScrolling ?? false,
      filterPlaceholder: options.filterPlaceholder || 'Search...',
      emptyText: options.emptyText || 'No data',
      loadingText: options.loadingText || 'Loading...',
      onNodeSelect: options.onNodeSelect ?? (() => {}),
      onNodeExpand: options.onNodeExpand ?? (() => {}),
      onNodeDoubleClick: options.onNodeDoubleClick ?? (() => {}),
      onNodeRightClick: options.onNodeRightClick ?? (() => {}),
      onLazyLoad: options.onLazyLoad ?? (() => Promise.resolve([])),
      onNodeDrag: options.onNodeDrag ?? (() => true),
      nodeRenderer: options.nodeRenderer ?? ((node: TreeNode<T>) => node.label),
      iconRenderer: options.iconRenderer ?? (() => '')
    };

    this.style = new StyleBuilder();

    // Initialize tree
    this.initializeTree();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private initializeTree(): void {
    this.buildNodeMaps(this.options.data);
    this.applyDefaultExpansion();
    this.updateFlatNodes();
    this.updateVisibleNodes();
  }

  private buildNodeMaps(nodes: TreeNode<T>[], parent?: TreeNodeId, level: number = 0): void {
    for (const node of nodes) {
      // Store node
      this.state.nodes.set(node.id, { ...node, parent });

      // Calculate node state
      const hasChildren = !!(node.children && node.children.length > 0) || 
                         (this.options.lazyLoading && !node.isLeaf);
      
      const nodeState: TreeNodeState = {
        expanded: false,
        selected: false,
        focused: false,
        loading: false,
        level,
        hasChildren,
        childCount: node.children?.length || 0,
        visibleChildCount: 0
      };

      this.state.nodeStates.set(node.id, nodeState);

      // Recursively process children
      if (node.children && node.children.length > 0) {
        this.buildNodeMaps(node.children, node.id, level + 1);
      }
    }
  }

  private applyDefaultExpansion(): void {
    if (!this.options.expandable) return;

    for (const [nodeId, nodeState] of this.state.nodeStates) {
      const shouldExpand = this.options.defaultExpanded || 
                          (this.options.defaultExpandLevel > 0 && nodeState.level < this.options.defaultExpandLevel);
      
      if (shouldExpand && nodeState.hasChildren) {
        this.state.expansion.expandedNodes.add(nodeId);
        nodeState.expanded = true;
      }
    }
  }

  private updateFlatNodes(): void {
    const flatNodes: Array<{ node: TreeNode<T>; state: TreeNodeState }> = [];

    const traverse = (nodeIds: TreeNodeId[]) => {
      for (const nodeId of nodeIds) {
        const node = this.state.nodes.get(nodeId);
        const state = this.state.nodeStates.get(nodeId);
        
        if (!node || !state || node.hidden) continue;

        flatNodes.push({ node, state });

        // Add children if expanded
        if (state.expanded && node.children) {
          const childIds = node.children.map(child => child.id);
          traverse(childIds);
        }
      }
    };

    // Start with root nodes
    const rootNodes = this.options.data.map(node => node.id);
    traverse(rootNodes);

    this.setState({ flatNodes });
  }

  private updateVisibleNodes(): void {
    let visibleNodes = this.state.flatNodes;

    // Apply search filter
    if (this.state.searchQuery.trim()) {
      visibleNodes = visibleNodes.filter(({ node, state }) => node.label.toLowerCase().includes(this.state.searchQuery.toLowerCase()) ||
               this.matchesSearchInChildren(node));
    }

    // Apply virtual scrolling
    if (this.options.virtualScrolling && this.options.maxHeight) {
      const startIndex = Math.max(0, this.state.scrollOffset);
      const endIndex = Math.min(visibleNodes.length, startIndex + this.state.maxVisibleNodes);
      visibleNodes = visibleNodes.slice(startIndex, endIndex);
    }

    this.setState({ visibleNodes });
  }

  private matchesSearchInChildren(node: TreeNode<T>): boolean {
    if (!node.children) return false;

    return node.children.some(child => 
      child.label.toLowerCase().includes(this.state.searchQuery.toLowerCase()) ||
      this.matchesSearchInChildren(child)
    );
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  render(): Output {
    const lines: string[] = [];

    // Render search box
    if (this.options.searchable && this.state.isSearchVisible) {
      lines.push(...this.renderSearchBox());
      lines.push('');
    }

    // Render tree nodes
    if (this.state.visibleNodes.length === 0) {
      lines.push(this.style.dim().text(this.options.emptyText));
    } else {
      for (const { node, state } of this.state.visibleNodes) {
        lines.push(this.renderNode(node, state));
      }
    }

    // Render scroll indicator for virtual scrolling
    if (this.options.virtualScrolling && this.state.flatNodes.length > this.state.maxVisibleNodes) {
      lines.push('');
      lines.push(this.renderScrollIndicator());
    }

    return {
      lines,
      cursor: this.getCursorPosition()
    };
  }

  private renderSearchBox(): string[] {
    const lines: string[] = [];
    
    let searchBox = `🔍 ${this.state.searchQuery}`;
    if (this.state.searchQuery.length === 0) {
      searchBox = this.style.dim().text(`🔍 ${this.options.filterPlaceholder}`);
    }
    
    lines.push(this.style.cyan().text('Search:'));
    lines.push(searchBox);
    
    return lines;
  }

  private renderNode(node: TreeNode<T>, state: TreeNodeState): string {
    let line = '';

    // Add indentation
    const indent = ' '.repeat(state.level * this.options.indentSize);
    line += indent;

    // Add tree lines
    if (this.options.showLines && state.level > 0) {
      line += this.getTreeLines(node, state);
    }

    // Add expand/collapse indicator
    if (this.options.expandable && state.hasChildren) {
      if (state.loading) {
        line += this.style.yellow().text('⏳ ');
      } else if (state.expanded) {
        line += this.style.text('▼ ');
      } else {
        line += this.style.text('▶ ');
      }
    } else if (this.options.expandable) {
      line += '  ';
    }

    // Add checkbox
    if (this.options.checkable) {
      const checked = state.selected ? '✓' : ' ';
      line += `[${checked}] `;
    }

    // Add icon
    if (this.options.showIcons) {
      const icon = this.getNodeIcon(node, state);
      if (icon) {
        line += `${icon} `;
      }
    }

    // Add node label
    let label = node.label;
    if (this.options.nodeRenderer) {
      label = this.options.nodeRenderer(node, state);
    }

    // Apply styling based on state
    if (state.focused) {
      label = this.style.cyan().inverse().text(label);
    } else if (state.selected) {
      label = this.style.blue().text(label);
    } else if (node.disabled) {
      label = this.style.dim().text(label);
    }

    line += label;

    // Add child count indicator
    if (state.hasChildren && state.childCount > 0) {
      line += this.style.dim().text(` (${state.childCount})`);
    }

    return line;
  }

  private getTreeLines(node: TreeNode<T>, state: TreeNodeState): string {
    // This is a simplified version - a full implementation would need
    // to track which levels have more siblings to show proper tree lines
    return '├─ ';
  }

  private getNodeIcon(node: TreeNode<T>, state: TreeNodeState): string {
    if (this.options.iconRenderer) {
      return this.options.iconRenderer(node, state);
    }

    if (node.icon) {
      return node.icon;
    }

    // Default icons
    if (state.hasChildren) {
      return state.expanded ? '📂' : '📁';
    }

    return '📄';
  }

  private renderScrollIndicator(): string {
    const totalNodes = this.state.flatNodes.length;
    const visibleStart = this.state.scrollOffset + 1;
    const visibleEnd = Math.min(totalNodes, this.state.scrollOffset + this.state.maxVisibleNodes);
    
    return this.style.dim().text(`Showing ${visibleStart}-${visibleEnd} of ${totalNodes}`);
  }

  private getCursorPosition(): { x: number; y: number } | undefined {
    if (!this.state.selection.focusedNode) {
      return undefined;
    }

    // Find the focused node in visible nodes
    const focusedIndex = this.state.visibleNodes.findIndex(
      ({ node }) => node.id === this.state.selection.focusedNode
    );

    if (focusedIndex === -1) {
      return undefined;
    }

    let line = focusedIndex;
    if (this.options.searchable && this.state.isSearchVisible) {
      line += 3; // Account for search box and empty line
    }

    return { x: 0, y: line };
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  override handleKeypress(key: Key): boolean {
    if (!this.options.keyboardNavigation) {
      return false;
    }

    let handled = false;

    // Handle search mode
    if (this.state.isSearchVisible && this.options.searchable) {
      handled = this.handleSearchInput(key);
      if (handled) return true;
    }

    switch (key.name) {
      case 'up':
      case 'down':
        this.handleVerticalNavigation(key.name === 'up' ? -1 : 1);
        handled = true;
        break;

      case 'left':
        this.handleCollapseNode();
        handled = true;
        break;

      case 'right':
        this.handleExpandNode();
        handled = true;
        break;

      case 'space':
        if (this.options.selectable || this.options.checkable) {
          this.handleNodeSelection();
          handled = true;
        }
        break;

      case 'enter':
      case 'return':
        this.handleNodeAction();
        handled = true;
        break;

      case 'home':
        this.navigateToFirst();
        handled = true;
        break;

      case 'end':
        this.navigateToLast();
        handled = true;
        break;

      case 'pageup':
        this.handlePageNavigation(-1);
        handled = true;
        break;

      case 'pagedown':
        this.handlePageNavigation(1);
        handled = true;
        break;

      case 'f':
        if (key.ctrl && this.options.searchable) {
          this.toggleSearch();
          handled = true;
        }
        break;

      case 'escape':
        if (this.state.isSearchVisible) {
          this.toggleSearch();
          handled = true;
        }
        break;

      case 'a':
        if (key.ctrl && this.options.multiSelect) {
          this.selectAll();
          handled = true;
        }
        break;
    }

    if (!handled) {
      handled = super.handleKeypress(key);
    }

    return handled;
  }

  private handleSearchInput(key: Key): boolean {
    let handled = false;

    switch (key.name) {
      case 'escape':
        this.toggleSearch();
        handled = true;
        break;

      case 'backspace':
        if (this.state.searchQuery.length > 0) {
          this.setSearchQuery(this.state.searchQuery.slice(0, -1));
        }
        handled = true;
        break;

      case 'delete':
        this.setSearchQuery('');
        handled = true;
        break;

      default:
        if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
          this.setSearchQuery(this.state.searchQuery + key.sequence);
          handled = true;
        }
    }

    return handled;
  }

  private handleVerticalNavigation(direction: number): void {
    const currentIndex = this.getCurrentFocusedIndex();
    const newIndex = Math.max(0, Math.min(this.state.visibleNodes.length - 1, currentIndex + direction));
    
    if (newIndex !== currentIndex && this.state.visibleNodes[newIndex]) {
      this.focusNode(this.state.visibleNodes[newIndex].node.id);
    }
  }

  private handleExpandNode(): void {
    const { focusedNode } = this.state.selection;
    if (!focusedNode) return;

    const nodeState = this.state.nodeStates.get(focusedNode);
    if (!nodeState || !nodeState.hasChildren) return;

    if (!nodeState.expanded) {
      this.expandNode(focusedNode);
    }
  }

  private handleCollapseNode(): void {
    const { focusedNode } = this.state.selection;
    if (!focusedNode) return;

    const nodeState = this.state.nodeStates.get(focusedNode);
    if (!nodeState) return;

    if (nodeState.expanded) {
      this.collapseNode(focusedNode);
    } else {
      // Navigate to parent if not expanded
      const node = this.state.nodes.get(focusedNode);
      if (node && node.parent) {
        this.focusNode(node.parent);
      }
    }
  }

  private handleNodeSelection(): void {
    const { focusedNode, selectionMode } = this.state.selection;
    if (!focusedNode || selectionMode === 'none') return;

    const isCurrentlySelected = this.state.selection.selectedNodes.has(focusedNode);
    
    if (selectionMode === 'single') {
      this.state.selection.selectedNodes.clear();
      if (!isCurrentlySelected) {
        this.state.selection.selectedNodes.add(focusedNode);
      }
    } else {
      // Multiple selection
      if (isCurrentlySelected) {
        this.state.selection.selectedNodes.delete(focusedNode);
      } else {
        this.state.selection.selectedNodes.add(focusedNode);
      }
    }

    // Update node state
    const nodeState = this.state.nodeStates.get(focusedNode);
    if (nodeState) {
      nodeState.selected = this.state.selection.selectedNodes.has(focusedNode);
    }

    // Emit selection event
    const node = this.state.nodes.get(focusedNode);
    if (node && this.options.onNodeSelect) {
      this.options.onNodeSelect(node, nodeState?.selected || false);
    }

    // Expand on select if enabled
    if (this.options.expandOnSelect && nodeState?.hasChildren && !nodeState.expanded) {
      this.expandNode(focusedNode);
    }

    this.updateVisibleNodes();
  }

  private handleNodeAction(): void {
    const { focusedNode } = this.state.selection;
    if (!focusedNode) return;

    const node = this.state.nodes.get(focusedNode);
    if (node && this.options.onNodeDoubleClick) {
      this.options.onNodeDoubleClick(node);
    }
  }

  private handlePageNavigation(direction: number): void {
    const pageSize = Math.floor(this.state.maxVisibleNodes / 2);
    const currentIndex = this.getCurrentFocusedIndex();
    const newIndex = Math.max(0, Math.min(this.state.visibleNodes.length - 1, 
      currentIndex + (direction * pageSize)));
    
    if (newIndex !== currentIndex && this.state.visibleNodes[newIndex]) {
      this.focusNode(this.state.visibleNodes[newIndex].node.id);
    }
  }

  // ============================================================================
  // Navigation Methods
  // ============================================================================

  private getCurrentFocusedIndex(): number {
    const { focusedNode } = this.state.selection;
    if (!focusedNode) return -1;

    return this.state.visibleNodes.findIndex(({ node }) => node.id === focusedNode);
  }

  private navigateToFirst(): void {
    if (this.state.visibleNodes.length > 0) {
      const firstNode = this.state.visibleNodes[0];
      if (firstNode) {
        this.focusNode(firstNode.node.id);
      }
    }
  }

  private navigateToLast(): void {
    if (this.state.visibleNodes.length > 0) {
      const lastIndex = this.state.visibleNodes.length - 1;
      const lastNode = this.state.visibleNodes[lastIndex];
      if (lastNode) {
        this.focusNode(lastNode.node.id);
      }
    }
  }

  // ============================================================================
  // Node Operations
  // ============================================================================

  private async expandNode(nodeId: TreeNodeId): Promise<void> {
    const node = this.state.nodes.get(nodeId);
    const nodeState = this.state.nodeStates.get(nodeId);
    
    if (!node || !nodeState || nodeState.expanded) return;

    // Handle lazy loading
    if (this.options.lazyLoading && !this.state.expansion.loadedNodes.has(nodeId)) {
      if (this.options.onLazyLoad && !this.state.expansion.loadingNodes.has(nodeId)) {
        this.state.expansion.loadingNodes.add(nodeId);
        nodeState.loading = true;

        try {
          const children = await this.options.onLazyLoad(node);
          
          // Add children to node
          node.children = children;
          
          // Build node maps for new children
          this.buildNodeMaps(children, nodeId, nodeState.level + 1);
          
          // Update child count
          nodeState.childCount = children.length;
          nodeState.hasChildren = children.length > 0;
          
          this.state.expansion.loadedNodes.add(nodeId);
          
        } catch (error) {
          console.error('Failed to load children:', error);
        } finally {
          this.state.expansion.loadingNodes.delete(nodeId);
          nodeState.loading = false;
        }
      }
    }

    // Expand the node
    nodeState.expanded = true;
    this.state.expansion.expandedNodes.add(nodeId);

    // Emit expand event
    if (this.options.onNodeExpand) {
      this.options.onNodeExpand(node, true);
    }

    // Update flat and visible nodes
    this.updateFlatNodes();
    this.updateVisibleNodes();
  }

  private collapseNode(nodeId: TreeNodeId): void {
    const node = this.state.nodes.get(nodeId);
    const nodeState = this.state.nodeStates.get(nodeId);
    
    if (!node || !nodeState || !nodeState.expanded) return;

    // Collapse the node
    nodeState.expanded = false;
    this.state.expansion.expandedNodes.delete(nodeId);

    // Emit collapse event
    if (this.options.onNodeExpand) {
      this.options.onNodeExpand(node, false);
    }

    // Update flat and visible nodes
    this.updateFlatNodes();
    this.updateVisibleNodes();
  }

  private focusNode(nodeId: TreeNodeId): void {
    // Clear previous focus
    if (this.state.selection.focusedNode) {
      const prevState = this.state.nodeStates.get(this.state.selection.focusedNode);
      if (prevState) {
        prevState.focused = false;
      }
    }

    // Set new focus
    this.state.selection.focusedNode = nodeId;
    const nodeState = this.state.nodeStates.get(nodeId);
    if (nodeState) {
      nodeState.focused = true;
    }

    // Handle virtual scrolling
    if (this.options.virtualScrolling) {
      const nodeIndex = this.state.flatNodes.findIndex(({ node }) => node.id === nodeId);
      if (nodeIndex !== -1) {
        // Scroll to make node visible
        if (nodeIndex < this.state.scrollOffset) {
          this.setState({ scrollOffset: nodeIndex });
        } else if (nodeIndex >= this.state.scrollOffset + this.state.maxVisibleNodes) {
          this.setState({ scrollOffset: nodeIndex - this.state.maxVisibleNodes + 1 });
        }
      }
    }

    this.updateVisibleNodes();
  }

  // ============================================================================
  // Search Methods
  // ============================================================================

  private toggleSearch(): void {
    const isVisible = !this.state.isSearchVisible;
    this.setState({ 
      isSearchVisible: isVisible,
      searchQuery: isVisible ? this.state.searchQuery : ''
    });

    if (!isVisible) {
      this.updateVisibleNodes();
    }
  }

  private setSearchQuery(query: string): void {
    this.setState({ searchQuery: query });
    this.updateVisibleNodes();
  }

  // ============================================================================
  // Selection Methods
  // ============================================================================

  private selectAll(): void {
    if (this.state.selection.selectionMode !== 'multiple') return;

    for (const { node } of this.state.visibleNodes) {
      this.state.selection.selectedNodes.add(node.id);
      const nodeState = this.state.nodeStates.get(node.id);
      if (nodeState) {
        nodeState.selected = true;
      }
    }

    this.updateVisibleNodes();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get all tree data
   */
  getData(): TreeNode<T>[] {
    return this.options.data;
  }

  /**
   * Set tree data
   */
  setData(data: TreeNode<T>[]): void {
    this.options.data = data;
    this.state.nodes.clear();
    this.state.nodeStates.clear();
    this.state.selection.selectedNodes.clear();
    this.state.expansion.expandedNodes.clear();
    this.state.expansion.loadedNodes.clear();
    this.state.expansion.loadingNodes.clear();
    
    this.initializeTree();
  }

  /**
   * Get selected nodes
   */
  getSelectedNodes(): TreeNode<T>[] {
    return Array.from(this.state.selection.selectedNodes)
      .map(id => this.state.nodes.get(id))
      .filter(Boolean) as TreeNode<T>[];
  }

  /**
   * Set selected nodes
   */
  setSelectedNodes(nodeIds: TreeNodeId[]): void {
    // Clear current selection
    for (const [nodeId, nodeState] of this.state.nodeStates) {
      nodeState.selected = false;
    }
    this.state.selection.selectedNodes.clear();

    // Set new selection
    for (const nodeId of nodeIds) {
      if (this.state.nodes.has(nodeId)) {
        this.state.selection.selectedNodes.add(nodeId);
        const nodeState = this.state.nodeStates.get(nodeId);
        if (nodeState) {
          nodeState.selected = true;
        }
      }
    }

    this.updateVisibleNodes();
  }

  /**
   * Get focused node
   */
  getFocusedNode(): TreeNode<T> | null {
    const { focusedNode } = this.state.selection;
    return focusedNode ? this.state.nodes.get(focusedNode) || null : null;
  }

  /**
   * Focus a specific node
   */
  focusNodeById(nodeId: TreeNodeId): void {
    if (this.state.nodes.has(nodeId)) {
      this.focusNode(nodeId);
    }
  }

  /**
   * Expand a node
   */
  expandNodeById(nodeId: TreeNodeId): Promise<void> {
    return this.expandNode(nodeId);
  }

  /**
   * Collapse a node
   */
  collapseNodeById(nodeId: TreeNodeId): void {
    this.collapseNode(nodeId);
  }

  /**
   * Expand all nodes
   */
  expandAll(): void {
    for (const [nodeId, nodeState] of this.state.nodeStates) {
      if (nodeState.hasChildren) {
        nodeState.expanded = true;
        this.state.expansion.expandedNodes.add(nodeId);
      }
    }

    this.updateFlatNodes();
    this.updateVisibleNodes();
  }

  /**
   * Collapse all nodes
   */
  collapseAll(): void {
    for (const [nodeId, nodeState] of this.state.nodeStates) {
      nodeState.expanded = false;
    }
    
    this.state.expansion.expandedNodes.clear();
    this.updateFlatNodes();
    this.updateVisibleNodes();
  }

  /**
   * Get expanded nodes
   */
  getExpandedNodes(): TreeNodeId[] {
    return Array.from(this.state.expansion.expandedNodes);
  }

  /**
   * Set expanded nodes
   */
  setExpandedNodes(nodeIds: TreeNodeId[]): void {
    // Clear current expansion
    for (const [nodeId, nodeState] of this.state.nodeStates) {
      nodeState.expanded = false;
    }
    this.state.expansion.expandedNodes.clear();

    // Set new expansion
    for (const nodeId of nodeIds) {
      if (this.state.nodes.has(nodeId)) {
        this.state.expansion.expandedNodes.add(nodeId);
        const nodeState = this.state.nodeStates.get(nodeId);
        if (nodeState) {
          nodeState.expanded = true;
        }
      }
    }

    this.updateFlatNodes();
    this.updateVisibleNodes();
  }

  /**
   * Add a node
   */
  addNode(node: TreeNode<T>, parentId?: TreeNodeId): void {
    if (parentId) {
      const parent = this.state.nodes.get(parentId);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(node);
        
        // Update parent state
        const parentState = this.state.nodeStates.get(parentId);
        if (parentState) {
          parentState.hasChildren = true;
          parentState.childCount = parent.children.length;
        }
      }
    } else {
      this.options.data.push(node);
    }

    // Build node map for new node
    const parentState = parentId ? this.state.nodeStates.get(parentId) : null;
    const level = parentState ? parentState.level + 1 : 0;
    this.buildNodeMaps([node], parentId, level);

    this.updateFlatNodes();
    this.updateVisibleNodes();
  }

  /**
   * Remove a node
   */
  removeNode(nodeId: TreeNodeId): void {
    const node = this.state.nodes.get(nodeId);
    if (!node) return;

    // Remove from parent's children or root data
    if (node.parent) {
      const parent = this.state.nodes.get(node.parent);
      if (parent && parent.children) {
        parent.children = parent.children.filter(child => child.id !== nodeId);
        
        // Update parent state
        const parentState = this.state.nodeStates.get(node.parent);
        if (parentState) {
          parentState.childCount = parent.children.length;
          parentState.hasChildren = parent.children.length > 0;
        }
      }
    } else {
      this.options.data = this.options.data.filter(n => n.id !== nodeId);
    }

    // Remove from maps
    this.state.nodes.delete(nodeId);
    this.state.nodeStates.delete(nodeId);
    this.state.selection.selectedNodes.delete(nodeId);
    this.state.expansion.expandedNodes.delete(nodeId);

    // Clear focus if this node was focused
    if (this.state.selection.focusedNode === nodeId) {
      this.state.selection.focusedNode = null;
    }

    this.updateFlatNodes();
    this.updateVisibleNodes();
  }

  /**
   * Update a node
   */
  updateNode(nodeId: TreeNodeId, updates: Partial<TreeNode<T>>): void {
    const node = this.state.nodes.get(nodeId);
    if (!node) return;

    Object.assign(node, updates);
    this.updateVisibleNodes();
  }

  /**
   * Search nodes
   */
  search(query: string): void {
    this.setSearchQuery(query);
    if (query && !this.state.isSearchVisible) {
      this.setState({ isSearchVisible: true });
    }
  }

  /**
   * Clear search
   */
  clearSearch(): void {
    this.setState({ 
      searchQuery: '',
      isSearchVisible: false
    });
    this.updateVisibleNodes();
  }

  /**
   * Refresh the tree
   */
  refresh(): void {
    this.updateFlatNodes();
    this.updateVisibleNodes();
  }
}