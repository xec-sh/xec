/**
 * Component Registry System
 * Extensible component registration and factory management
 */

// Import all component classes
import { BoxComponent } from '../components/box.js';
import { TextComponent } from '../components/text.js';
import { TabsComponent } from '../components/tabs.js';
import { InputComponent } from '../components/input.js';
import { TableComponent } from '../components/table.js';
import { SelectComponent } from '../components/select.js';
import { ASCIIFontComponent } from '../components/ascii-font.js';
import { ScrollBarComponent } from '../components/scroll-bar.js';
import { ScrollBoxComponent } from '../components/scroll-box.js';
import { FrameBufferComponent } from '../components/frame-buffer.js';

import type { RenderContext } from '../types.js';
import type {
  ComponentType,
  ComponentProps,
  ComponentInstance,
  ComponentRegistry as IComponentRegistry
} from './types.js';

/**
 * Component factory function type
 */
type ComponentFactory<T extends ComponentType> = (
  ctx: RenderContext,
  props: ComponentProps<T>
) => ComponentInstance<T>;

/**
 * Registry implementation for component management
 */
export class ComponentRegistry implements IComponentRegistry {
  private factories = new Map<ComponentType, ComponentFactory<any>>();

  constructor() {
    // Register default components
    this.registerDefaults();
  }

  /**
   * Register a component factory
   */
  register<T extends ComponentType>(
    type: T,
    factory: ComponentFactory<T>
  ): void {
    this.factories.set(type, factory);
  }

  /**
   * Create a component instance
   */
  create<T extends ComponentType>(
    type: T,
    props: ComponentProps<T>,
    ctx: RenderContext
  ): ComponentInstance<T> {
    const factory = this.factories.get(type);

    if (!factory) {
      throw new Error(
        `Component type "${type}" is not registered. ` +
        `Available types: ${Array.from(this.factories.keys()).join(', ')}`
      );
    }

    return factory(ctx, props) as ComponentInstance<T>;
  }

  /**
   * Check if a component type is registered
   */
  has(type: string): boolean {
    return this.factories.has(type as ComponentType);
  }

  /**
   * Get all registered component types
   */
  getTypes(): ComponentType[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Register default Aura components
   * Props are already unwrapped by the time they reach here
   */
  private registerDefaults(): void {
    // Box component - props are already unwrapped
    this.register('box', (ctx, props: any) => new BoxComponent(ctx, props));

    // Text component
    this.register('text', (ctx, props: any) => new TextComponent(ctx, props));

    // Input component
    this.register('input', (ctx, props: any) => new InputComponent(ctx, props));

    // Select component
    this.register('select', (ctx, props: any) => new SelectComponent(ctx, props));

    // Table component
    this.register('table', (ctx, props: any) => new TableComponent(ctx, props));

    // Tabs component
    this.register('tabs', (ctx, props: any) => new TabsComponent(ctx, props));

    // FrameBuffer component
    this.register('frame-buffer', (ctx, props: any) => new FrameBufferComponent(ctx, props));

    // ASCII Font component
    this.register('ascii-font', (ctx, props: any) => new ASCIIFontComponent(ctx, props));

    // ScrollBar component
    this.register('scroll-bar', (ctx, props: any) => new ScrollBarComponent(ctx, props));

    // ScrollBox component
    this.register('scroll-box', (ctx, props: any) => new ScrollBoxComponent(ctx, props));
  }

  /**
   * Clear all registered components (useful for testing)
   */
  clear(): void {
    this.factories.clear();
  }

  /**
   * Clone the registry with all its factories
   */
  clone(): ComponentRegistry {
    const newRegistry = new ComponentRegistry();
    newRegistry.factories.clear(); // Clear defaults

    // Copy all factories
    for (const [type, factory] of this.factories) {
      newRegistry.factories.set(type, factory);
    }

    return newRegistry;
  }
}

/**
 * Global singleton instance
 */
let globalRegistry: ComponentRegistry | null = null;

/**
 * Get the global component registry
 */
export function getGlobalRegistry(): ComponentRegistry {
  if (!globalRegistry) {
    globalRegistry = new ComponentRegistry();
  }
  return globalRegistry;
}

/**
 * Set a custom global registry
 */
export function setGlobalRegistry(registry: ComponentRegistry): void {
  globalRegistry = registry;
}

/**
 * Create a new component registry
 */
export function createRegistry(): ComponentRegistry {
  return new ComponentRegistry();
}