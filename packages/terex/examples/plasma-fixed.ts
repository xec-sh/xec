#!/usr/bin/env tsx

/**
 * PLASMA - Advanced Terminal UI Demonstration (Fixed Version)
 * 
 * This example demonstrates advanced terminal UI concepts including:
 * - Draggable and resizable panels
 * - Layer management with z-index
 * - Real-time statistics display
 * - Instruction panels with keyboard shortcuts
 * - Mouse interaction support
 * - Multiple panel management
 * 
 * NOTE: This example uses FULLSCREEN render mode to enable advanced features
 * like draggable/resizable panels and z-index layering. The fullscreen mode
 * takes over the entire terminal for complete control.
 */

import {
  Box,
  Text,
  Flex,
  Grid,
  type Key,
  type Output,
  BaseComponent,
  VirtualScroll,
  type Rectangle,
  type Component,
  type MouseEvent,
  createFullscreenRenderEngine
} from '../src/index.js';

// Simple progress bar implementation
class SimpleProgressBar extends BaseComponent<{ value: number; max: number; width: number; label?: string }> {
  constructor(options: { value: number; max: number; width: number; label?: string; color?: string }) {
    super();
    this.state = {
      value: options.value,
      max: options.max,
      width: options.width,
      label: options.label
    };
  }

  render(bounds?: Rectangle, terminal?: any): Output {
    const percentage = Math.min(100, Math.max(0, (this.state.value / this.state.max) * 100));
    const filled = Math.floor((percentage / 100) * this.state.width);
    const empty = this.state.width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const label = this.state.label ? `${this.state.label}: ` : '';
    const text = `${label}${bar} ${percentage.toFixed(0)}%`;

    return { lines: [text] };
  }
}

// ============================================================================
// Draggable Panel Component
// ============================================================================

interface DraggablePanelState {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  minimized: boolean;
  dragging: boolean;
  resizing: boolean;
  dragStartX: number;
  dragStartY: number;
  dragOffsetX: number;
  dragOffsetY: number;
  resizeStartWidth: number;
  resizeStartHeight: number;
  focused: boolean;
  zIndex: number;
  title: string;
}

class DraggablePanel extends BaseComponent<DraggablePanelState> {
  private container: Box;
  private content: Component<any> | null = null;
  private options: {
    draggable?: boolean;
    resizable?: boolean;
    closable?: boolean;
    minimizable?: boolean;
    borderStyle?: 'single' | 'double' | 'rounded' | 'thick' | 'none';
    borderColor?: string;
    backgroundColor?: string;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    onClose?: () => void;
    onMinimize?: () => void;
    onMove?: (x: number, y: number) => void;
    onResize?: (width: number, height: number) => void;
  };

  constructor(options: {
    title?: string;
    content?: Component<any> | string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    zIndex?: number;
    visible?: boolean;
    draggable?: boolean;
    resizable?: boolean;
    closable?: boolean;
    minimizable?: boolean;
    borderStyle?: 'single' | 'double' | 'rounded' | 'thick' | 'none';
    borderColor?: string;
    backgroundColor?: string;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    onClose?: () => void;
    onMinimize?: () => void;
    onMove?: (x: number, y: number) => void;
    onResize?: (width: number, height: number) => void;
  } = {}) {
    super();

    this.options = {
      draggable: options.draggable ?? true,
      resizable: options.resizable ?? false,
      closable: options.closable ?? true,
      minimizable: options.minimizable ?? false,
      borderStyle: options.borderStyle ?? 'rounded',
      borderColor: options.borderColor,
      backgroundColor: options.backgroundColor,
      minWidth: options.minWidth ?? 10,
      minHeight: options.minHeight ?? 3,
      maxWidth: options.maxWidth,
      maxHeight: options.maxHeight,
      onClose: options.onClose,
      onMinimize: options.onMinimize,
      onMove: options.onMove,
      onResize: options.onResize
    };

    this.state = {
      title: options.title || 'Panel',
      x: options.x ?? 0,
      y: options.y ?? 0,
      width: options.width ?? 40,
      height: options.height ?? 20,
      zIndex: options.zIndex ?? 0,
      visible: options.visible ?? true,
      minimized: false,
      dragging: false,
      resizing: false,
      dragStartX: 0,
      dragStartY: 0,
      dragOffsetX: 0,
      dragOffsetY: 0,
      resizeStartWidth: 0,
      resizeStartHeight: 0,
      focused: false
    };

    // Create container
    this.container = new Box({
      borderStyle: this.options.borderStyle,
      borderColor: this.options.borderColor,
      backgroundColor: this.options.backgroundColor,
      title: this.state.title,
      padding: 1
    });

    // Set content
    if (options.content) {
      this.setContent(options.content);
    }

    this.updateTitleBar();
  }

  setContent(content: Component<any> | string): void {
    if (typeof content === 'string') {
      this.content = new Text({ content });
    } else {
      this.content = content;
    }

    this.container.clearChildren();
    if (this.content) {
      this.container.addChild(this.content);
    }
    this.invalidate();
  }

  private updateTitleBar(): void {
    let titleText = this.state.title;
    const buttons: string[] = [];

    if (this.options.minimizable) {
      buttons.push(this.state.minimized ? '⊡' : '─');
    }
    if (this.options.closable) {
      buttons.push('✕');
    }

    if (buttons.length > 0) {
      const buttonStr = ' [' + buttons.join('') + ']';
      titleText = this.state.title + buttonStr;
    }

    this.container.setTitle(titleText);
  }

  override show(): void {
    this.setState({ visible: true });
    this.emit('show');
  }

  override hide(): void {
    this.setState({ visible: false });
    this.emit('hide');
  }

  minimize(): void {
    if (this.options.minimizable) {
      this.setState({ minimized: true });
      this.updateTitleBar();
      this.options.onMinimize?.();
      this.emit('minimize');
    }
  }

  restore(): void {
    if (this.state.minimized) {
      this.setState({ minimized: false });
      this.updateTitleBar();
      this.emit('restore');
    }
  }

  close(): void {
    if (this.options.closable) {
      this.hide();
      this.options.onClose?.();
      this.emit('close');
    }
  }

  moveTo(x: number, y: number): void {
    const maxWidth = 120;
    const maxHeight = 40;

    x = Math.max(0, Math.min(x, maxWidth - this.state.width));
    y = Math.max(0, Math.min(y, maxHeight - this.state.height));

    this.setState({ x, y });
    this.options.onMove?.(x, y);
    this.emit('move', { x, y });
  }

  resize(width: number, height: number): void {
    width = Math.max(this.options.minWidth!, width);
    height = Math.max(this.options.minHeight!, height);

    if (this.options.maxWidth) {
      width = Math.min(this.options.maxWidth, width);
    }
    if (this.options.maxHeight) {
      height = Math.min(this.options.maxHeight, height);
    }

    this.setState({ width, height });
    this.options.onResize?.(width, height);
    this.emit('resize', { width, height });
  }

  override focus(): void {
    if (this.state.focused) return; // Already focused
    this.setState({ focused: true });
    this.container.setBorderColor(this.options.borderColor || 'cyan');
    this.emit('focus');
  }

  override blur(): void {
    if (!this.state.focused) return; // Already blurred
    this.setState({ focused: false });
    this.container.setBorderColor(this.options.borderColor || 'gray');
    this.emit('blur');
  }

  handleMouse(event: MouseEvent): boolean {
    if (!this.state.visible) return false;

    const localX = event.x - this.state.x;
    const localY = event.y - this.state.y;

    // Check if click is on title bar for dragging
    if (event.type === 'mousedown' && this.options.draggable) {
      if (localY === 0 && localX >= 0 && localX < this.state.width) {
        // Check if clicking on control buttons
        if (this.options.closable && localX >= this.state.width - 3) {
          this.close();
          return true;
        }
        if (this.options.minimizable && localX >= this.state.width - 5) {
          if (this.state.minimized) {
            this.restore();
          } else {
            this.minimize();
          }
          return true;
        }

        // Start dragging
        this.setState({
          dragging: true,
          dragStartX: event.x,
          dragStartY: event.y,
          dragOffsetX: localX,
          dragOffsetY: localY
        });
        return true;
      }
    }

    // Handle mouse move for dragging
    if (event.type === 'mousemove' && this.state.dragging) {
      const newX = event.x - this.state.dragOffsetX;
      const newY = event.y - this.state.dragOffsetY;
      this.moveTo(newX, newY);
      return true;
    }

    // Handle mouse up to stop dragging
    if (event.type === 'mouseup') {
      if (this.state.dragging) {
        this.setState({ dragging: false });
        return true;
      }
    }

    return false;
  }

  override handleKeypress(key: Key): boolean {
    if (!this.state.visible) return false;

    if (this.state.focused) {
      // Close on Escape
      if (key.name === 'escape' && this.options.closable) {
        this.close();
        return true;
      }

      // Minimize on Ctrl+M
      if (key.ctrl && key.name === 'm' && this.options.minimizable) {
        if (this.state.minimized) {
          this.restore();
        } else {
          this.minimize();
        }
        return true;
      }

      // Move with arrow keys when Alt is pressed
      if (key.meta && this.options.draggable) {
        const moveAmount = key.shift ? 10 : 1;
        // eslint-disable-next-line default-case
        switch (key.name) {
          case 'up':
            this.moveTo(this.state.x, this.state.y - moveAmount);
            return true;
          case 'down':
            this.moveTo(this.state.x, this.state.y + moveAmount);
            return true;
          case 'left':
            this.moveTo(this.state.x - moveAmount, this.state.y);
            return true;
          case 'right':
            this.moveTo(this.state.x + moveAmount, this.state.y);
            return true;
        }
      }
    }

    return false;
  }

  render(bounds?: Rectangle, terminal?: any): Output {
    if (!this.state.visible) return { lines: [] };

    // Simply render the container - it will handle its own bounds
    return this.container.render();
  }
}

// ============================================================================
// Statistics Panel
// ============================================================================

class StatisticsPanel extends DraggablePanel {
  private stats: {
    fps: number;
    frameTime: number;
    memoryUsage: number;
    componentsRendered: number;
    eventsProcessed: number;
    renderCycles: number;
    uptime: number;
  };
  private startTime: number;
  private statsContainer: Flex;

  constructor(options: any = {}) {
    super({
      title: '📊 Statistics',
      x: options.x ?? 60,
      y: options.y ?? 2,
      width: options.width ?? 35,
      height: options.height ?? 20,
      zIndex: options.zIndex ?? 999,
      visible: options.visible ?? false,
      draggable: true,
      resizable: true,
      closable: true,
      minimizable: true,
      borderStyle: 'double',
      borderColor: 'magenta',
      ...options
    });

    this.startTime = Date.now();
    this.stats = {
      fps: 60,
      frameTime: 16.67,
      memoryUsage: 0,
      componentsRendered: 0,
      eventsProcessed: 0,
      renderCycles: 0,
      uptime: 0
    };

    this.statsContainer = new Flex({ direction: 'column', gap: 1 });
    this.setContent(this.statsContainer);
    this.updateDisplay();
  }

  updateStats(stats: Partial<typeof this.stats>): void {
    this.stats = { ...this.stats, ...stats };
    this.stats.uptime = Math.floor((Date.now() - this.startTime) / 1000);
    this.updateDisplay();
  }

  private updateDisplay(): void {
    this.statsContainer.clearChildren();

    // Create vertical container for stats
    const vContainer = new Flex({ direction: 'column', gap: 0 });

    // Title
    vContainer.addChild(new Text({
      content: '━━━ Performance Metrics ━━━',
      style: { foreground: 'cyan', bold: true }
    }));

    // FPS
    vContainer.addChild(new Text({
      content: `FPS: ${this.stats.fps.toFixed(1)}`,
      style: { foreground: this.stats.fps > 30 ? 'green' : 'red' }
    }));

    // Frame Time
    vContainer.addChild(new Text({
      content: `Frame Time: ${this.stats.frameTime.toFixed(2)}ms`,
      style: { foreground: this.stats.frameTime < 33 ? 'green' : 'yellow' }
    }));

    // Memory Usage
    const memoryMB = this.stats.memoryUsage / 1024 / 1024;
    vContainer.addChild(new Text({
      content: `Memory: ${memoryMB.toFixed(2)} MB`,
      style: { foreground: memoryMB < 100 ? 'green' : 'yellow' }
    }));

    // Components
    vContainer.addChild(new Text({
      content: `Components: ${this.stats.componentsRendered}`,
      style: { foreground: 'white' }
    }));

    // Events
    vContainer.addChild(new Text({
      content: `Events: ${this.stats.eventsProcessed}`,
      style: { foreground: 'white' }
    }));

    // Render Cycles
    vContainer.addChild(new Text({
      content: `Renders: ${this.stats.renderCycles}`,
      style: { foreground: 'white' }
    }));

    // Uptime
    const hours = Math.floor(this.stats.uptime / 3600);
    const minutes = Math.floor((this.stats.uptime % 3600) / 60);
    const seconds = this.stats.uptime % 60;
    vContainer.addChild(new Text({
      content: `Uptime: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
      style: { foreground: 'cyan' }
    }));

    // Memory bar
    const memoryProgress = new SimpleProgressBar({
      value: memoryMB,
      max: 200,
      width: 25,
      label: 'Memory',
      color: memoryMB < 100 ? 'green' : memoryMB < 150 ? 'yellow' : 'red'
    });
    vContainer.addChild(memoryProgress);

    this.statsContainer.addChild(vContainer);
    this.invalidate();
  }
}

// ============================================================================
// Instruction Panel
// ============================================================================

class InstructionPanel extends DraggablePanel {
  constructor(options: any = {}) {
    const instructions = [
      '📖 Instructions',
      '',
      '• Press [i] to toggle this panel',
      '• Press [s] to toggle statistics',
      '• Press [d] to toggle demo panel',
      '• Press [Tab] to switch focus between panels',
      '• Press [Escape] to close focused panel',
      '',
      'When panel is focused:',
      '• Drag title bar with mouse to move',
      '• Alt + Arrow keys to move panel',
      '• Ctrl + M to minimize/restore',
      '',
      'Application shortcuts:',
      '• Press [q] or Ctrl+C to quit',
      '• Press [r] to refresh display',
      '• Press [h] to show/hide help',
      '',
      'Tips:',
      '• Panels with higher z-index appear on top',
      '• Click on a panel to focus it',
      '• Focused panels have cyan borders'
    ];

    const container = new Flex({ direction: 'column', gap: 0 });
    instructions.forEach(line => {
      container.addChild(new Text({
        content: line,
        style: line.startsWith('•') ? { foreground: 'yellow' } :
          line.startsWith('📖') ? { foreground: 'cyan', bold: true } :
            line === '' ? {} : { foreground: 'white' }
      }));
    });

    super({
      title: '📖 Instructions',
      content: container,
      x: options.x ?? 2,
      y: options.y ?? 2,
      width: options.width ?? 50,
      height: options.height ?? 25,
      zIndex: options.zIndex ?? 100,
      visible: options.visible ?? false,
      draggable: true,
      resizable: false,
      closable: true,
      minimizable: true,
      borderStyle: 'rounded',
      borderColor: 'green',
      ...options
    });
  }
}

// ============================================================================
// Demo Panel with Advanced Content
// ============================================================================

class DemoPanel extends DraggablePanel {
  private demoContent: VirtualScroll;

  constructor(options: any = {}) {
    super({
      title: '🎨 Demo Content',
      x: options.x ?? 30,
      y: options.y ?? 10,
      width: options.width ?? 40,
      height: options.height ?? 20,
      zIndex: options.zIndex ?? 50,
      visible: options.visible ?? false,
      draggable: true,
      resizable: true,
      closable: true,
      minimizable: true,
      borderStyle: 'thick',
      borderColor: 'blue',
      ...options
    });

    // Create virtual scroll with demo items - fixed to match VirtualItem interface
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: `item-${i}`,
      data: {
        title: `Item ${i + 1}`,
        description: `This is demo item number ${i + 1}`,
        value: Math.random() * 100
      }
    }));

    this.demoContent = new VirtualScroll({
      items,
      itemHeight: 2,
      height: 8
    });

    this.setContent(this.demoContent);
  }

  override handleKeypress(key: Key): boolean {
    // Pass arrow keys to virtual scroll when focused
    if (this.state.focused) {
      if (key.name === 'up' || key.name === 'down' ||
        key.name === 'pageup' || key.name === 'pagedown' ||
        key.name === 'home' || key.name === 'end') {
        return this.demoContent.handleKeypress(key);
      }
    }

    return super.handleKeypress(key);
  }
}

// ============================================================================
// Layer Manager - manages z-index ordering of panels
// ============================================================================

class LayerManager {
  panels: Map<string, DraggablePanel> = new Map();  // Made public for access in PlasmaApp
  private focusedPanel: string | null = null;

  addPanel(id: string, panel: DraggablePanel): void {
    this.panels.set(id, panel);

    // Listen for close events only
    // Focus will be handled by direct calls, not events to avoid circular references
    panel.on('close', () => {
      this.removePanel(id);
    });
  }

  removePanel(id: string): void {
    this.panels.delete(id);
    if (this.focusedPanel === id) {
      this.focusedPanel = null;
    }
  }

  focusPanel(id: string): void {
    // Avoid re-focusing the same panel
    if (this.focusedPanel === id) {
      return;
    }

    // Blur previously focused panel
    if (this.focusedPanel) {
      const prevPanel = this.panels.get(this.focusedPanel);
      if (prevPanel) {
        // Directly set the state without triggering events
        prevPanel.setState({ focused: false });
        prevPanel.container.setBorderColor(prevPanel.options.borderColor || 'gray');
      }
    }

    this.focusedPanel = id;

    // Bring to front by adjusting z-index
    const panel = this.panels.get(id);
    if (panel) {
      // Find max z-index
      let maxZ = 0;
      this.panels.forEach(p => {
        if (p.state.zIndex > maxZ) {
          maxZ = p.state.zIndex;
        }
      });

      // Set this panel's z-index to be on top
      if (panel.state.zIndex <= maxZ) {
        panel.setState({ zIndex: maxZ + 1 });
      }

      // Directly set the state without triggering circular events
      panel.setState({ focused: true });
      panel.container.setBorderColor(panel.options.borderColor || 'cyan');
    }
  }

  cycleFocus(): void {
    const ids = Array.from(this.panels.keys());
    if (ids.length === 0) return;

    if (!this.focusedPanel) {
      this.focusPanel(ids[0]);
    } else {
      const currentIndex = ids.indexOf(this.focusedPanel);
      const nextIndex = (currentIndex + 1) % ids.length;
      this.focusPanel(ids[nextIndex]);
    }
  }

  renderAll(): Output[] {
    // Sort panels by z-index
    const sortedPanels = Array.from(this.panels.entries())
      .sort((a, b) => a[1].state.zIndex - b[1].state.zIndex);

    // Collect outputs in z-order
    const outputs: Output[] = [];
    for (const [_, panel] of sortedPanels) {
      if (panel.state.visible) {
        outputs.push(panel.render());
      }
    }
    return outputs;
  }

  handleMouse(event: MouseEvent): boolean {
    // Check panels in reverse z-order (top to bottom)
    const sortedPanels = Array.from(this.panels.entries())
      .sort((a, b) => b[1].state.zIndex - a[1].state.zIndex);

    for (const [id, panel] of sortedPanels) {
      if (panel.state.visible) {
        // Check if click is within panel bounds
        const inBounds = event.x >= panel.state.x &&
          event.x < panel.state.x + panel.state.width &&
          event.y >= panel.state.y &&
          event.y < panel.state.y + panel.state.height;

        if (inBounds) {
          // Focus the panel on click
          if (event.type === 'mousedown') {
            this.focusPanel(id);
          }

          // Let the panel handle the event
          if (panel.handleMouse(event)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  handleKeypress(key: Key): boolean {
    // Let focused panel handle key first
    if (this.focusedPanel) {
      const panel = this.panels.get(this.focusedPanel);
      if (panel && panel.handleKeypress(key)) {
        return true;
      }
    }

    return false;
  }
}

// ============================================================================
// Main Application
// ============================================================================

class PlasmaApp extends BaseComponent<any> {
  private layerManager: LayerManager;
  private mainContent: Box;
  private instructionsPanel: InstructionPanel;
  private statisticsPanel: StatisticsPanel;
  private demoPanel: DemoPanel;
  private frameCount: number = 0;
  private eventCount: number = 0;
  private lastFrameTime: number = Date.now();

  constructor() {
    super();

    this.layerManager = new LayerManager();

    // Create main content area
    this.mainContent = new Box({
      borderStyle: 'single',
      borderColor: 'gray',
      title: '🌈 PLASMA - Advanced Terminal UI Demo',
      padding: 2
    });

    // Add welcome message
    const welcomeGrid = new Grid({ columns: 1, gap: 1 });
    welcomeGrid.addChild(new Text({
      content: 'Welcome to PLASMA!',
      style: { foreground: 'cyan', bold: true }
    }));
    welcomeGrid.addChild(new Text({
      content: 'A demonstration of advanced terminal UI concepts',
      style: { foreground: 'white' }
    }));
    welcomeGrid.addChild(new Text({ content: '' }));
    welcomeGrid.addChild(new Text({
      content: 'Press [i] for instructions | [s] for statistics | [d] for demo panel',
      style: { foreground: 'yellow' }
    }));
    welcomeGrid.addChild(new Text({
      content: 'Press [Tab] to switch focus | [q] to quit',
      style: { foreground: 'yellow' }
    }));

    this.mainContent.addChild(welcomeGrid);

    // Create panels
    this.instructionsPanel = new InstructionPanel({ visible: true });
    this.statisticsPanel = new StatisticsPanel({ visible: false });
    this.demoPanel = new DemoPanel({ visible: false });

    // Add panels to layer manager
    this.layerManager.addPanel('instructions', this.instructionsPanel);
    this.layerManager.addPanel('statistics', this.statisticsPanel);
    this.layerManager.addPanel('demo', this.demoPanel);

    // Add panels as children so they're part of the component tree
    this.addChild(this.instructionsPanel);
    this.addChild(this.statisticsPanel);
    this.addChild(this.demoPanel);

    // Start stats update timer
    setInterval(() => {
      this.updateStats();
    }, 100);
  }

  private updateStats(): void {
    const now = Date.now();
    const deltaTime = now - this.lastFrameTime;
    const fps = deltaTime > 0 ? 1000 / deltaTime : 60;

    this.statisticsPanel.updateStats({
      fps,
      frameTime: deltaTime,
      memoryUsage: process.memoryUsage().heapUsed,
      componentsRendered: 4, // main + 3 panels
      eventsProcessed: this.eventCount,
      renderCycles: this.frameCount
    });

    this.lastFrameTime = now;
  }

  override handleKeypress(key: Key): boolean {
    this.eventCount++;

    // Check layer manager first
    if (this.layerManager.handleKeypress(key)) {
      return true;
    }

    // Global shortcuts
    // eslint-disable-next-line default-case
    switch (key.name) {
      case 'q':
        if (!key.ctrl) {
          process.exit(0);
        }
        break;

      case 'i':
        if (this.instructionsPanel.state.visible) {
          this.instructionsPanel.hide();
        } else {
          this.instructionsPanel.show();
          this.layerManager.focusPanel('instructions');
        }
        return true;

      case 's':
        if (this.statisticsPanel.state.visible) {
          this.statisticsPanel.hide();
        } else {
          this.statisticsPanel.show();
          this.layerManager.focusPanel('statistics');
        }
        return true;

      case 'd':
        if (this.demoPanel.state.visible) {
          this.demoPanel.hide();
        } else {
          this.demoPanel.show();
          this.layerManager.focusPanel('demo');
        }
        return true;

      case 'tab':
        this.layerManager.cycleFocus();
        return true;

      case 'r':
        this.invalidate();
        return true;

      case 'h':
        // Toggle help (instructions)
        if (this.instructionsPanel.state.visible) {
          this.instructionsPanel.hide();
        } else {
          this.instructionsPanel.show();
          this.layerManager.focusPanel('instructions');
        }
        return true;
    }

    // Handle Ctrl+C
    if (key.ctrl && key.name === 'c') {
      process.exit(0);
    }

    return false;
  }

  handleMouse(event: MouseEvent): boolean {
    this.eventCount++;
    return this.layerManager.handleMouse(event);
  }

  render(bounds?: Rectangle, terminal?: any): Output {
    this.frameCount++;

    // Create a simple text output for now to test
    const lines: string[] = [];

    // Add title
    lines.push('╔══════════════════════════════════════════════════════════════════════════╗');
    lines.push('║  🌈 PLASMA - Advanced Terminal UI Demo                                   ║');
    lines.push('╠══════════════════════════════════════════════════════════════════════════╣');
    lines.push('║  Welcome to PLASMA!                                                      ║');
    lines.push('║  A demonstration of advanced terminal UI concepts                        ║');
    lines.push('║                                                                          ║');
    lines.push('║  Press [i] for instructions | [s] for statistics | [d] for demo panel    ║');
    lines.push('║  Press [Tab] to switch focus | [q] to quit                               ║');
    lines.push('╚══════════════════════════════════════════════════════════════════════════╝');

    // Add empty lines to fill screen
    for (let i = lines.length; i < 24; i++) {
      lines.push('');
    }

    return { lines };
  }
}

// ============================================================================
// Application Entry Point
// ============================================================================

async function main() {
  console.clear();
  console.log('Starting PLASMA...\n');

  // Use fullscreen mode for advanced features (draggable, resizable, z-index)
  const engine = createFullscreenRenderEngine({
    mode: 'fullscreen',
    enhancedInput: true,
    targetFps: 60,
    autoResize: true
  });

  const app = new PlasmaApp();

  try {
    // Start the engine with the root component
    await engine.start(app);

    // Show instructions on start
    setTimeout(() => {
      app.handleKeypress({ name: 'i', ctrl: false, meta: false, shift: false } as Key);
      engine.requestRender();
    }, 500);

  } catch (error) {
    console.error('Error starting PLASMA:', error);
    process.exit(1);
  }
}

// Run the application
main().catch(console.error);

export { PlasmaApp, DemoPanel, LayerManager, DraggablePanel, StatisticsPanel, InstructionPanel };