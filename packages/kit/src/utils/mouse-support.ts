// Mouse support for interactive components

import { EventEmitter } from '../core/event-emitter.js';

export interface MousePosition {
  x: number;
  y: number;
}

export interface MouseEvent {
  type: 'click' | 'scroll' | 'move' | 'drag';
  position: MousePosition;
  button?: 'left' | 'right' | 'middle';
  direction?: 'up' | 'down';
  delta?: number;
  modifiers?: {
    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
    meta?: boolean;
  };
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  id?: string;
  data?: any;
}

export interface MouseSupportOptions {
  enabled?: boolean;
  scrollSensitivity?: number;
  clickDelay?: number;
  regions?: Region[];
}

export class MouseSupport extends EventEmitter {
  private enabled: boolean;
  private scrollSensitivity: number;
  private clickDelay: number;
  private regions: Map<string, Region> = new Map();
  private lastClickTime: number = 0;
  private dragStart: MousePosition | null = null;
  private hoveredRegion: Region | null = null;

  constructor(options: MouseSupportOptions = {}) {
    super();

    this.enabled = options.enabled ?? true;
    this.scrollSensitivity = options.scrollSensitivity ?? 1;
    this.clickDelay = options.clickDelay ?? 300; // Double-click threshold

    if (options.regions) {
      options.regions.forEach(region => {
        if (region.id) {
          this.regions.set(region.id, region);
        }
      });
    }
  }

  enable() {
    this.enabled = true;
    this.emit('enabled');
  }

  disable() {
    this.enabled = false;
    this.emit('disabled');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  addRegion(region: Region) {
    if (!region.id) {
      region.id = `region-${Date.now()}-${Math.random()}`;
    }

    this.regions.set(region.id, region);
    this.emit('region-added', region);
  }

  removeRegion(id: string) {
    const region = this.regions.get(id);
    if (region) {
      this.regions.delete(id);
      this.emit('region-removed', region);

      if (this.hoveredRegion?.id === id) {
        this.hoveredRegion = null;
      }
    }
  }

  updateRegion(id: string, updates: Partial<Region>) {
    const region = this.regions.get(id);
    if (region) {
      Object.assign(region, updates);
      this.emit('region-updated', region);
    }
  }

  clearRegions() {
    this.regions.clear();
    this.hoveredRegion = null;
    this.emit('regions-cleared');
  }

  private findRegionAt(position: MousePosition): Region | null {
    for (const region of this.regions.values()) {
      if (this.isPositionInRegion(position, region)) {
        return region;
      }
    }
    return null;
  }

  private isPositionInRegion(position: MousePosition, region: Region): boolean {
    return (
      position.x >= region.x &&
      position.x < region.x + region.width &&
      position.y >= region.y &&
      position.y < region.y + region.height
    );
  }

  handleMouseEvent(event: MouseEvent): boolean {
    if (!this.enabled) return false;

    switch (event.type) {
      case 'click':
        return this.handleClick(event);
      case 'scroll':
        return this.handleScroll(event);
      case 'move':
        return this.handleMove(event);
      case 'drag':
        return this.handleDrag(event);
      default:
        return false;
    }
  }

  private handleClick(event: MouseEvent): boolean {
    const region = this.findRegionAt(event.position);
    const now = Date.now();
    const isDoubleClick = now - this.lastClickTime < this.clickDelay;

    this.lastClickTime = now;

    // Emit general click event
    this.emit('click', {
      ...event,
      region,
      isDoubleClick,
    });

    // Emit region-specific click if applicable
    if (region) {
      this.emit('region-click', {
        region,
        event,
        isDoubleClick,
      });

      // Also emit on the region ID for easier listening
      this.emit(`click:${region.id}`, {
        event,
        isDoubleClick,
      });
    }

    return !!region;
  }

  private handleScroll(event: MouseEvent): boolean {
    const region = this.findRegionAt(event.position);
    const delta = (event.delta || 0) * this.scrollSensitivity;

    // Emit general scroll event
    this.emit('scroll', {
      ...event,
      region,
      delta,
    });

    // Emit region-specific scroll if applicable
    if (region) {
      this.emit('region-scroll', {
        region,
        event,
        delta,
      });

      this.emit(`scroll:${region.id}`, {
        event,
        delta,
      });
    }

    return !!region;
  }

  private handleMove(event: MouseEvent): boolean {
    const region = this.findRegionAt(event.position);
    const previousRegion = this.hoveredRegion;

    // Handle hover changes
    if (region !== previousRegion) {
      if (previousRegion) {
        this.emit('region-leave', {
          region: previousRegion,
          event,
        });
        this.emit(`leave:${previousRegion.id}`, { event });
      }

      if (region) {
        this.emit('region-enter', {
          region,
          event,
        });
        this.emit(`enter:${region.id}`, { event });
      }

      this.hoveredRegion = region;
    }

    // Emit general move event
    this.emit('move', {
      ...event,
      region,
    });

    // Emit region-specific move if hovering
    if (region) {
      this.emit('region-move', {
        region,
        event,
      });
      this.emit(`move:${region.id}`, { event });
    }

    return !!region;
  }

  private handleDrag(event: MouseEvent): boolean {
    if (!this.dragStart) {
      this.dragStart = event.position;
      this.emit('drag-start', { event });
    }

    const region = this.findRegionAt(event.position);
    const startRegion = this.findRegionAt(this.dragStart);

    const dragInfo = {
      start: this.dragStart,
      current: event.position,
      delta: {
        x: event.position.x - this.dragStart.x,
        y: event.position.y - this.dragStart.y,
      },
      startRegion,
      currentRegion: region,
    };

    // Emit drag event
    this.emit('drag', {
      ...event,
      ...dragInfo,
    });

    // End drag on button release
    if (event.button === undefined) {
      this.dragStart = null;
      this.emit('drag-end', {
        ...event,
        ...dragInfo,
      });
    }

    return true;
  }

  // Convert terminal row/column to region coordinates
  static terminalToRegion(row: number, col: number, cellWidth = 1, cellHeight = 1): Region {
    return {
      x: col * cellWidth,
      y: row * cellHeight,
      width: cellWidth,
      height: cellHeight,
    };
  }

  // Parse mouse escape sequences
  static parseMouseSequence(sequence: string): MouseEvent | null {
    // Basic mouse sequence parsing (simplified)
    // Real implementation would handle various terminal mouse protocols

    // Example SGR mouse format: \x1b[<0;10;20M (button;x;y + M/m for press/release)
    const sgrMatch = sequence.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
    if (sgrMatch) {
      const [, button, x, y, action] = sgrMatch;
      const buttonCode = parseInt(button || '0');
      const isRelease = action === 'm';

      // Check for scroll wheel codes first
      if (buttonCode === 64 || buttonCode === 65) {
        return {
          type: 'scroll',
          position: { x: parseInt(x || '0') - 1, y: parseInt(y || '0') - 1 },
          direction: buttonCode === 64 ? 'up' : 'down',
          delta: 1,
        };
      }

      // Regular click
      return {
        type: 'click',
        position: { x: parseInt(x || '0') - 1, y: parseInt(y || '0') - 1 },
        button: buttonCode === 0 ? 'left' : buttonCode === 1 ? 'middle' : 'right',
      };
    }

    return null;
  }
}

// Mouse tracking modes for terminal
export enum MouseMode {
  Off = 0,
  X10 = 9,           // Basic mouse tracking
  Normal = 1000,     // Normal tracking (press/release)
  Highlight = 1001,  // Highlight tracking
  ButtonEvent = 1002, // Button event tracking
  AnyEvent = 1003,   // Any event tracking (includes move)
}

// Helper to enable/disable mouse in terminal
export class TerminalMouse {
  private mode: MouseMode = MouseMode.Off;
  private writer: (data: string) => void;

  constructor(writer: (data: string) => void) {
    this.writer = writer;
  }

  enable(mode: MouseMode = MouseMode.Normal) {
    if (this.mode !== MouseMode.Off) {
      this.disable();
    }

    this.mode = mode;

    // Enable mouse tracking
    this.writer(`\x1b[?${mode}h`);

    // Enable SGR extended mode (for coordinates > 223)
    this.writer('\x1b[?1006h');

    // Enable focus events
    this.writer('\x1b[?1004h');
  }

  disable() {
    if (this.mode === MouseMode.Off) return;

    // Disable mouse tracking
    this.writer(`\x1b[?${this.mode}l`);

    // Disable SGR mode
    this.writer('\x1b[?1006l');

    // Disable focus events
    this.writer('\x1b[?1004l');

    this.mode = MouseMode.Off;
  }

  isEnabled(): boolean {
    return this.mode !== MouseMode.Off;
  }

  getMode(): MouseMode {
    return this.mode;
  }
}

// Mixin for adding mouse support to prompts
export interface WithMouseSupport {
  mouse?: MouseSupport;
  terminalMouse?: TerminalMouse;

  handleMouseEvent(event: MouseEvent): boolean;
  enableMouse(): void;
  disableMouse(): void;
}

export function withMouseSupport<T extends new (...args: any[]) => any>(Base: T) {
  return class extends Base implements WithMouseSupport {
    mouse?: MouseSupport;
    terminalMouse?: TerminalMouse;

    constructor(...args: any[]) {
      super(...args);

      const options = args[0];
      if (options?.mouse !== false) { // Enable by default
        this.mouse = new MouseSupport({
          enabled: options?.mouse?.enabled ?? true,
          scrollSensitivity: options?.mouse?.scrollSensitivity,
          clickDelay: options?.mouse?.clickDelay,
        });

        // Set up terminal mouse if we have a writer
        if (this.writer || options?.writer) {
          this.terminalMouse = new TerminalMouse(
            this.writer || options.writer
          );
        }

        // Listen for mouse events
        this.setupMouseListeners();
      }
    }

    setupMouseListeners() {
      if (!this.mouse) return;

      // Override these in subclasses for specific behavior
      this.mouse.on('click', (data) => {
        if (this.onMouseClick) {
          this.onMouseClick(data);
        }
      });

      this.mouse.on('scroll', (data) => {
        if (this.onMouseScroll) {
          this.onMouseScroll(data);
        }
      });
    }

    handleMouseEvent(event: MouseEvent): boolean {
      if (!this.mouse) return false;
      return this.mouse.handleMouseEvent(event);
    }

    enableMouse() {
      if (this.mouse) {
        this.mouse.enable();
      }
      if (this.terminalMouse) {
        this.terminalMouse.enable();
      }
    }

    disableMouse() {
      if (this.mouse) {
        this.mouse.disable();
      }
      if (this.terminalMouse) {
        this.terminalMouse.disable();
      }
    }

    // Override these in subclasses
    onMouseClick?(data: any): void;
    onMouseScroll?(data: any): void;
    writer?(data: string): void;
  };
}