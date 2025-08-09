# @xec-sh/kit Modern Architecture Specification

## Vision: The Ultimate Terminal UI Library

This specification defines a complete reimagining of @xec-sh/kit as a modern, performant, and feature-rich terminal UI library that synthesizes the best practices from Ink, Blessed, Rich, Textual, Bubble Tea, and other successful solutions.

## Current State Analysis

### Critical Issues Identified

#### Architectural Problems
- **Over-engineered reactive system** (292 lines for simple CLI prompts)
- **Unused plugin system** (174 lines of dead code with 6+ `any` types)
- **Circular dependency risks** between prompt, renderer, and reactive systems
- **Missing core abstractions**: No stream management, theme system, or prompt factory

#### Performance Bottlenecks
- **Renderer inefficiency**: No diff algorithm, redraws everything on each update
- **Synchronous state processing**: O(n²) complexity with complex dependency graphs
- **Memory leaks**: Event listeners not cleaned up, Maps grow indefinitely
- **No optimization strategy**: Virtual scrolling, batching, and memoization missing

#### Code Quality Issues
- **Type safety gaps**: Multiple `any` types, unsafe assertions
- **Code duplication**: Validation, key events, terminal sequences repeated
- **API inconsistency**: Mixed patterns for options, error handling, cancellation
- **Testing gaps**: Only 1 integration test file, no performance benchmarks

### Metrics to Improve
- **Current bundle size**: ~150KB minified (target: <100KB)
- **Memory usage**: ~35MB for basic prompts (target: <20MB)
- **Startup time**: ~100ms (target: <50ms)
- **Test coverage**: ~60% (target: >90%)

## Core Philosophy

1. **Component-Based**: Everything is a composable component
2. **Declarative**: Describe what, not how
3. **Performance-First**: Virtual DOM with intelligent diffing
4. **Type-Safe**: 100% TypeScript with zero `any`
5. **Accessible**: Full screen reader and keyboard navigation support
6. **Beautiful**: Rich colors, smooth animations, modern aesthetics

## The Three-Layer API Architecture

### Layer 1: Ultra-Simple (For 90% of use cases)

```typescript
import kit from '@xec-sh/kit';

// Just works - no setup, no configuration
const name = await kit.prompt('What is your name?');
const age = await kit.number('Your age?');
const color = await kit.select('Favorite color?', ['red', 'blue', 'green']);
const agree = await kit.confirm('Do you agree?');

// Reactive composition with zero boilerplate
const form = await kit.form({
  name: kit.text('Name'),
  email: kit.text('Email', { validate: '@' }),
  age: kit.number('Age', { min: 0, max: 120 }),
  country: kit.select('Country', countries),
  subscribe: kit.confirm('Newsletter?')
});
```

### Layer 2: Powerful (For complex interactions)

```typescript
import { App, State, Component } from '@xec-sh/kit';

// Reactive application with state management
const app = App.create({
  state: State.from({
    todos: [],
    filter: 'all'
  }),
  
  render: ({ state, h }) => h.container([
    h.text('Todo App').bold(),
    h.input({
      placeholder: 'What needs to be done?',
      onSubmit: (text) => state.todos.push({ text, done: false })
    }),
    h.list(
      state.todos
        .filter(todo => state.filter === 'all' || 
                        (state.filter === 'done') === todo.done)
        .map(todo => h.checkbox({
          label: todo.text,
          checked: todo.done,
          onChange: (done) => todo.done = done
        }))
    ),
    h.tabs({
      value: state.filter,
      onChange: (filter) => state.filter = filter,
      options: ['all', 'active', 'done']
    })
  ])
});

await app.run();
```

### Layer 3: Low-Level (Complete control)

```typescript
import { Terminal, Renderer, Component, EventStream } from '@xec-sh/kit/core';

// Direct terminal manipulation with fractal components
class CustomComponent extends Component<Props, State> {
  // Every component is a complete mini-application
  private terminal = this.createTerminal();
  private renderer = this.createRenderer();
  private events = this.createEventStream();
  
  // Fractal: can contain other components
  private children = new ComponentTree<Component>();
  
  async render() {
    // Direct buffer manipulation
    this.renderer.writeAt(0, 0, 'Custom rendering');
    
    // Or use the fractal render tree
    return this.tree(
      this.box({ border: 'rounded' },
        this.text('Parent'),
        this.children.map(child => child.render())
      )
    );
  }
  
  handleKeyboard(key: KeyEvent) {
    // Full control over input handling
    if (key.matches('ctrl+c')) this.exit();
    if (key.matches('tab')) this.focusNext();
    
    // Delegate to children (fractal)
    this.children.focused?.handleKeyboard(key);
  }
  
  handleMouse(event: MouseEvent) {
    // Complete mouse support
    const child = this.children.at(event.x, event.y);
    child?.handleMouse(event.relative(child));
  }
}
```

## Fractal Component System

### Core Concept: Everything is a Component

```typescript
// Base component interface - fractal by design
interface Component<T = any> {
  // Every component can render
  render(): RenderNode;
  
  // Every component can contain children
  children?: Component[];
  
  // Every component can handle events
  on?(event: Event): void;
  
  // Every component has lifecycle
  mount?(): void;
  unmount?(): void;
  
  // Every component can have state
  state?: T;
}
```

### Fractal Primitives

```typescript
// Text is a component
const text = Component.text('Hello');

// Box is a component that contains components
const box = Component.box([
  text,
  Component.text('World')
]);

// Input is a component with behavior
const input = Component.input({
  value: '',
  onChange: (v) => console.log(v)
});

// Forms are components containing components
const form = Component.form([
  input,
  Component.button('Submit')
]);

// Apps are components containing components
const app = Component.app([
  form,
  Component.list([...])
]);

// Infinite fractal composition
const dashboard = Component.grid([
  Component.panel([
    Component.chart([...]),
    Component.table([...])
  ]),
  Component.panel([
    app // Apps inside apps inside apps...
  ])
]);
```

### Built-in Component Hierarchy

```typescript
// All components inherit fractal properties
namespace Components {
  // Primitives (leaves of the fractal tree)
  export class Text extends Component<string> {}
  export class Space extends Component<void> {}
  export class Line extends Component<'horizontal' | 'vertical'> {}
  
  // Containers (branches - can contain any component)
  export class Box extends Component<Component[]> {}
  export class Flex extends Component<Component[]> {}
  export class Grid extends Component<Component[][]> {}
  export class Stack extends Component<Component[]> {}
  export class Scroll extends Component<Component[]> {}
  
  // Interactive (components with behavior)
  export class Input extends Component<string> {}
  export class Select<T> extends Component<T> {}
  export class Checkbox extends Component<boolean> {}
  export class Radio<T> extends Component<T> {}
  export class Slider extends Component<number> {}
  export class Toggle extends Component<boolean> {}
  
  // Complex (composed from primitives, but still components)
  export class Form<T> extends Component<T> {}
  export class Table<T> extends Component<T[]> {}
  export class Tree<T> extends Component<TreeNode<T>> {}
  export class Tabs extends Component<Component[]> {}
  export class Modal extends Component<Component> {}
  
  // Feedback (animated components)
  export class Spinner extends Component<void> {}
  export class Progress extends Component<number> {}
  export class Loading extends Component<Promise<any>> {}
  
  // Data Visualization (fractal data representation)
  export class Chart extends Component<DataPoint[]> {}
  export class Graph extends Component<Node[]> {}
  export class Gauge extends Component<number> {}
}
```

## Animation System (Built-in)

### Declarative Animations

```typescript
// Simple animation API
const animated = kit.animate(
  kit.text('Loading'),
  { 
    opacity: [0, 1],
    x: [-10, 0] 
  },
  { duration: 300, easing: 'spring' }
);

// Complex choreographed animations
const sequence = kit.sequence([
  kit.animate(header, { y: [-20, 0] }, { duration: 200 }),
  kit.parallel([
    kit.animate(sidebar, { x: [-50, 0] }, { duration: 300 }),
    kit.animate(content, { opacity: [0, 1] }, { duration: 400 })
  ]),
  kit.stagger(items, { opacity: [0, 1] }, { delay: 50 })
]);
```

### Animation Primitives

```typescript
namespace Animations {
  // Timing functions
  export const linear = (t: number) => t;
  export const easeIn = (t: number) => t * t;
  export const easeOut = (t: number) => t * (2 - t);
  export const easeInOut = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  
  // Spring physics
  export const spring = (tension = 170, friction = 26) => {
    // Real spring simulation
  };
  
  // Built-in animation components
  export class Fade extends AnimatedComponent {}
  export class Slide extends AnimatedComponent {}
  export class Scale extends AnimatedComponent {}
  export class Rotate extends AnimatedComponent {}
  
  // Fractal: Animated containers
  export class AnimatedBox extends Component {
    animate(child: Component, animation: Animation) {
      // Containers can animate their children
    }
  }
}
```

## Event System (Universal)

### Unified Event Model

```typescript
// All events follow the same pattern
interface Event {
  type: string;
  target: Component;
  bubble: boolean;
  timestamp: number;
}

// Keyboard events with full modifier support
interface KeyboardEvent extends Event {
  key: string;
  code: string;
  modifiers: {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
  };
  
  // Helper methods
  matches(pattern: string): boolean; // e.g., 'ctrl+s'
  isChar(): boolean;
  isPrintable(): boolean;
}

// Mouse events with component-relative coords
interface MouseEvent extends Event {
  x: number; // Relative to component
  y: number;
  globalX: number; // Terminal coordinates
  globalY: number;
  button: 'left' | 'right' | 'middle';
  
  // Fractal helper
  relative(component: Component): MouseEvent;
}

// Custom events for component communication
interface CustomEvent<T = any> extends Event {
  detail: T;
}
```

### Event Flow (Fractal Propagation)

```typescript
// Events bubble up the component tree
component.on('keypress', (e: KeyboardEvent) => {
  // Handle locally
  if (e.matches('enter')) {
    this.submit();
    e.stopPropagation(); // Stop bubbling
  }
  // Otherwise bubble to parent
});

// Global keyboard shortcuts
App.shortcuts.register('ctrl+s', () => save());
App.shortcuts.register('ctrl+z', () => undo());
App.shortcuts.register('ctrl+shift+p', () => commandPalette());

// Mouse handling with hit testing
App.mouse.on('click', (e: MouseEvent) => {
  const component = App.hitTest(e.globalX, e.globalY);
  component?.trigger('click', e.relative(component));
});
```

## State Management (Reactive & Fractal)

### Simple Reactive State

```typescript
// Automatic reactivity for simple cases
const state = kit.state({
  count: 0,
  name: ''
});

// Components auto-update when state changes
kit.render(() => 
  kit.box([
    kit.text(`Count: ${state.count}`),
    kit.button('+', () => state.count++),
    kit.input({
      value: state.name,
      onChange: (v) => state.name = v
    })
  ])
);
```

### Fractal State Trees

```typescript
// State can be nested fractally
class AppState extends State {
  todos = State.list<TodoState>([]);
  filter = State.value('all');
  
  get filtered() {
    return State.computed(() => 
      this.todos.filter(t => 
        this.filter.value === 'all' || t.matches(this.filter.value)
      )
    );
  }
}

class TodoState extends State {
  text = State.value('');
  done = State.value(false);
  subtasks = State.list<TodoState>([]); // Fractal!
  
  matches(filter: string): boolean {
    // Fractal matching through subtasks
    return filter === 'all' || 
           (filter === 'done') === this.done.value ||
           this.subtasks.some(s => s.matches(filter));
  }
}
```

## Layout Engine (Fractal Geometry)

### Constraint-Based Layout

```typescript
// Every component has geometric properties
interface Geometry {
  // Absolute positioning
  x?: number;
  y?: number;
  
  // Size constraints
  width?: number | 'auto' | '100%' | 'fit-content';
  height?: number | 'auto' | '100%' | 'fit-content';
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  
  // Fractal spacing (applies to children)
  padding?: number | [top, right, bottom, left];
  margin?: number | [top, right, bottom, left];
  gap?: number;
}

// Flexbox-style layout (fractal)
interface FlexGeometry extends Geometry {
  direction?: 'row' | 'column';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  align?: 'start' | 'center' | 'end' | 'stretch';
  wrap?: boolean;
  
  // Child properties (fractal)
  grow?: number;
  shrink?: number;
  basis?: number | 'auto';
}

// Grid layout (2D fractal)
interface GridGeometry extends Geometry {
  columns?: number | string[]; // '1fr 2fr 1fr'
  rows?: number | string[];
  gap?: number | [rowGap, colGap];
  
  // Child placement
  column?: number | [start, end];
  row?: number | [start, end];
  span?: [columns, rows];
}
```

### Layout Examples

```typescript
// Simple centered content
kit.center(
  kit.text('Perfectly Centered')
);

// Complex dashboard layout (fractal composition)
kit.grid({ columns: '200px 1fr 250px', rows: '60px 1fr 40px' }, [
  // Header spans all columns
  kit.box({ column: [1, -1] }, kit.text('Header')),
  
  // Sidebar
  kit.scroll(sidebarItems),
  
  // Main content (can contain another grid!)
  kit.grid({ columns: 2, gap: 20 }, [
    kit.panel(chart1),
    kit.panel(chart2),
    kit.panel(table),
    kit.panel(form)
  ]),
  
  // Right panel
  kit.tabs([...]),
  
  // Footer
  kit.box({ column: [1, -1] }, statusBar)
]);
```

## Type-Safe Generic System

### Complete Type Inference

```typescript
// Generic components with full type safety
const select = kit.select<Country>({
  options: countries,
  render: (country) => `${country.flag} ${country.name}`,
  value: currentCountry,
  onChange: (country) => {
    // country is typed as Country
    console.log(country.code);
  }
});

// Form with inferred types
const form = kit.form({
  name: kit.text('Name'),
  age: kit.number('Age'),
  country: kit.select('Country', countries),
  subscribe: kit.confirm('Newsletter')
});

// Result is fully typed
const result = await form; // { name: string, age: number, country: Country, subscribe: boolean }
```

### Generic State Management

```typescript
// Type-safe reactive state
class AppState<T extends Record<string, any>> extends State<T> {
  // Computed values with type inference
  derive<K extends keyof T, R>(
    key: K,
    compute: (value: T[K]) => R
  ): ComputedValue<R> {
    return this.computed(() => compute(this.get(key)));
  }
  
  // Type-safe mutations
  update<K extends keyof T>(
    key: K,
    updater: (value: T[K]) => T[K]
  ): void {
    this.set(key, updater(this.get(key)));
  }
}

// Usage with full type inference
const state = new AppState({
  users: [] as User[],
  selected: null as User | null
});

state.update('users', users => [...users, newUser]); // Type-safe!
```

## Rendering Pipeline (Optimized & Fractal)

### Three-Stage Pipeline

```typescript
class RenderPipeline {
  // Stage 1: Component Tree → Render Tree
  private buildRenderTree(component: Component): RenderNode {
    // Fractal traversal
    const node = component.render();
    if (node.children) {
      node.children = node.children.map(child => 
        this.buildRenderTree(child)
      );
    }
    return node;
  }
  
  // Stage 2: Layout Calculation (Fractal)
  private calculateLayout(node: RenderNode, constraints: Constraints): Layout {
    // Recursive layout calculation
    const geometry = this.measureNode(node, constraints);
    const childConstraints = this.deriveConstraints(geometry, constraints);
    
    if (node.children) {
      node.childLayouts = node.children.map(child =>
        this.calculateLayout(child, childConstraints)
      );
    }
    
    return this.finalizeLayout(node, geometry);
  }
  
  // Stage 3: Differential Rendering
  private render(layout: Layout): void {
    const changes = this.diff(this.previousLayout, layout);
    this.applyChanges(changes); // Only update what changed
    this.previousLayout = layout;
  }
}
```

## Real-World Examples

### Example 1: Dead Simple Prompt

```typescript
import kit from '@xec-sh/kit';

// One line, just works
const name = await kit.prompt('Your name?');
```

### Example 2: Quick Form

```typescript
// Still simple, but powerful
const user = await kit.form({
  name: kit.text('Name', { required: true }),
  email: kit.text('Email', { validate: '@' }),
  age: kit.number('Age', { min: 18 }),
  agree: kit.confirm('Terms of Service')
});

// user is fully typed: { name: string, email: string, age: number, agree: boolean }
```

### Example 3: Interactive Dashboard

```typescript
// Complex but manageable
const app = kit.app({
  state: {
    metrics: await fetchMetrics(),
    filter: 'today'
  },
  
  render: ({ state }) => kit.dashboard([
    // Header
    kit.header([
      kit.title('System Monitor'),
      kit.select({
        value: state.filter,
        options: ['today', 'week', 'month'],
        onChange: async (filter) => {
          state.filter = filter;
          state.metrics = await fetchMetrics(filter);
        }
      })
    ]),
    
    // Metrics grid (fractal!)
    kit.grid({ columns: 3 }, [
      kit.metric('CPU', state.metrics.cpu, { format: 'percentage' }),
      kit.metric('Memory', state.metrics.memory, { format: 'bytes' }),
      kit.metric('Disk', state.metrics.disk, { format: 'bytes' }),
      kit.chart('Network', state.metrics.network, { type: 'line' }),
      kit.table('Processes', state.metrics.processes),
      kit.logs('System Logs', state.metrics.logs)
    ])
  ]),
  
  // Global shortcuts
  shortcuts: {
    'r': () => state.metrics = await fetchMetrics(state.filter),
    'f': () => focusSearch(),
    '?': () => showHelp()
  }
});

await app.run();
```

### Example 4: Fractal File Explorer

```typescript
// Recursive component demonstration
class FileExplorer extends Component<FileNode> {
  render() {
    return kit.tree({
      data: this.props,
      renderNode: (node) => kit.box([
        kit.icon(node.type === 'folder' ? '📁' : '📄'),
        kit.text(node.name),
        node.type === 'folder' && kit.badge(node.children.length)
      ]),
      onSelect: (node) => {
        if (node.type === 'folder') {
          // Fractal: Explorer can contain explorer
          this.expand(node, new FileExplorer(node));
        } else {
          this.open(node);
        }
      }
    });
  }
}
```

## Performance Optimizations (Built-in)

### Automatic Optimizations

```typescript
// Virtual scrolling for large lists (automatic)
const list = kit.list(millionItems); // Only renders visible items

// Memoization (automatic)
const expensive = kit.computed(() => {
  // This only runs when dependencies change
  return processLargeDataset(data);
});

// Batch updates (automatic)
state.transaction(() => {
  // All state changes are batched
  state.a = 1;
  state.b = 2;
  state.c = 3;
}); // Single re-render

// Differential rendering (always on)
// Only changed pixels are redrawn
```

## Testing Support (First-class)

```typescript
import { test, render, fireEvent } from '@xec-sh/kit/test';

test('counter increments', async () => {
  const { container, getByText } = render(
    kit.counter({ initial: 0 })
  );
  
  expect(getByText('Count: 0')).toBeVisible();
  
  await fireEvent.click(getByText('+'));
  
  expect(getByText('Count: 1')).toBeVisible();
});

// Test fractal components
test('nested forms work', async () => {
  const form = render(
    kit.form({
      user: kit.form({
        name: kit.text('Name'),
        email: kit.text('Email')
      }),
      preferences: kit.form({
        theme: kit.select('Theme', ['light', 'dark']),
        notifications: kit.confirm('Enable')
      })
    })
  );
  
  // Test nested interaction
  await form.fill('user.name', 'John');
  await form.fill('user.email', 'john@example.com');
  await form.select('preferences.theme', 'dark');
  
  const result = await form.submit();
  expect(result.user.name).toBe('John');
});
```

## Problem-Solution Mapping

### Current Problems → Concrete Solutions

| Current Problem | Root Cause | Solution | Expected Outcome |
|----------------|------------|----------|------------------|
| 292-line reactive system | Over-engineering for CLI | SimpleState class (60 lines) | 80% code reduction |
| Plugin system unused | Premature abstraction | Delete entirely | -500 lines, cleaner API |
| Memory leaks | No cleanup strategy | WeakMap + ResourceManager | Zero leaks |
| Renderer redraws all | No diff algorithm | Line-by-line diff | 60fps rendering |
| 6+ `any` types | Weak typing | Proper generics | 100% type safety |
| Code duplication | No shared abstractions | Extract utilities | -30% code size |
| Only 1 integration test | Testing afterthought | Test-first development | 90% coverage |
| No stream abstraction | Direct stdin/stdout | StreamManager layer | Testable I/O |
| O(n²) state updates | Sync processing | Batch + microtasks | O(n) complexity |
| 35MB memory usage | Heavy dependencies | Optimize imports | <20MB baseline |

### File-by-File Changes

```typescript
// DELETE (Remove completely)
src/plugins/                     // -500 lines
src/core/reactive/computed.ts    // -150 lines
src/utils/types.ts               // -180 lines (keep 50)

// REFACTOR (Simplify drastically)
src/core/reactive/reactive-state.ts  // 292 → 60 lines
src/core/renderer.ts                 // Add diff algorithm
src/core/prompt.ts                   // Simplify lifecycle

// CREATE (New abstractions)
src/core/stream-manager.ts          // +100 lines
src/core/prompt-factory.ts          // +80 lines
src/core/simple-state.ts            // +60 lines
src/core/resource-manager.ts        // +120 lines
src/utils/validation.ts             // +50 lines
src/utils/keyboard.ts               // +40 lines

// Net result: -500 lines, better architecture
```

## Refactoring Strategy

### Step 1: Immediate Cleanup (Week 1)
**Remove Dead Code & Simplify**
- Delete entire plugin system (`src/plugins/`) - saves 500+ lines
- Remove unused type utilities from `src/utils/types.ts`
- Eliminate academic TypeScript gymnastics
- Replace all `any` types with proper types or `unknown`

**Files to Delete:**
```
src/plugins/                    # Entire directory
src/utils/types.ts              # Most utilities except essentials
src/core/reactive/computed.ts   # Over-engineered computed values
```

### Step 2: Core Abstractions (Week 2)
**Implement Missing Layers**

```typescript
// Stream Management Layer
class StreamManager {
  constructor(
    private stdin = process.stdin,
    private stdout = process.stdout,
    private mockMode = false
  ) {}
  
  write(data: string): void
  read(): AsyncIterator<Buffer>
  clear(): void
  moveCursor(x: number, y: number): void
  
  // Testing support
  enableMockMode(): void
  getMockOutput(): string[]
  setMockInput(inputs: string[]): void
}

// Prompt Factory Pattern
class PromptFactory {
  constructor(
    private theme: Theme,
    private streamManager: StreamManager,
    private globalOptions: GlobalOptions
  ) {}
  
  create<T>(type: PromptType, options: PromptOptions): Prompt<T> {
    const merged = { ...this.globalOptions, ...options }
    return new PromptClasses[type](merged, this.streamManager, this.theme)
  }
}

// Simplified State (replace complex reactive system)
class SimpleState<T> {
  private state: T
  private listeners = new Set<(state: T) => void>()
  
  get(): T { return this.state }
  set(updates: Partial<T>): void {
    this.state = { ...this.state, ...updates }
    queueMicrotask(() => {
      this.listeners.forEach(fn => fn(this.state))
    })
  }
  subscribe(fn: (state: T) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}
```

### Step 3: Performance Optimizations (Week 3)
**Implement Differential Rendering**

```typescript
class OptimizedRenderer {
  private lastFrame = ''
  private frameBuffer: string[] = []
  private updateTimer?: NodeJS.Timeout
  
  render(content: string): void {
    if (content === this.lastFrame) return
    
    const diff = this.computeDiff(this.lastFrame, content)
    this.applyDiff(diff)
    this.lastFrame = content
  }
  
  batchRender(content: string): void {
    this.frameBuffer.push(content)
    if (!this.updateTimer) {
      this.updateTimer = setTimeout(() => {
        this.flushBatch()
        this.updateTimer = undefined
      }, 16) // 60fps target
    }
  }
  
  private computeDiff(old: string, new: string): RenderDiff {
    // Line-by-line diff algorithm
    const oldLines = old.split('\n')
    const newLines = new.split('\n')
    const diff: RenderDiff = { updates: [] }
    
    for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
      if (oldLines[i] !== newLines[i]) {
        diff.updates.push({ line: i, content: newLines[i] || '' })
      }
    }
    
    return diff
  }
}
```

### Step 4: Memory Management (Week 4)
**Fix Memory Leaks**

```typescript
class ResourceManager {
  private resources = new WeakMap<object, Disposable>()
  private timers = new Set<NodeJS.Timeout>()
  private listeners = new Map<EventEmitter, Function[]>()
  
  register(resource: object, disposable: Disposable): void {
    this.resources.set(resource, disposable)
  }
  
  setTimeout(fn: Function, ms: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      fn()
      this.timers.delete(timer)
    }, ms)
    this.timers.add(timer)
    return timer
  }
  
  addEventListener(emitter: EventEmitter, event: string, fn: Function): void {
    emitter.on(event, fn)
    if (!this.listeners.has(emitter)) {
      this.listeners.set(emitter, [])
    }
    this.listeners.get(emitter)!.push(fn)
  }
  
  dispose(): void {
    // Clear all timers
    this.timers.forEach(timer => clearTimeout(timer))
    this.timers.clear()
    
    // Remove all listeners
    this.listeners.forEach((fns, emitter) => {
      fns.forEach(fn => emitter.removeListener(fn))
    })
    this.listeners.clear()
  }
}
```

## Implementation Priorities

### Phase 1: Cleanup & Simplification (Week 1-2)
**Week 1: Remove Complexity**
- Day 1: Delete plugin system, save 500+ lines
- Day 2-3: Replace reactive system with SimpleState
- Day 4: Remove unused type utilities
- Day 5: Extract common patterns (validation, key handling)

**Week 2: Add Missing Abstractions**
- Day 1-2: Implement StreamManager
- Day 3: Create PromptFactory
- Day 4: Build resource management
- Day 5: Integration testing

### Phase 2: Core Fractal Engine (Week 3-4)
**Week 3: Component System**
- Day 1-2: Base Component class with lifecycle
- Day 3: Fractal render tree
- Day 4: Component composition patterns
- Day 5: Testing framework

**Week 4: Layout Engine**
- Day 1-2: Constraint-based layout
- Day 3: Flexbox implementation
- Day 4: Grid implementation
- Day 5: Layout performance optimization

### Phase 3: Three-Layer API (Week 5-6)
**Week 5: API Layers**
- Day 1-2: Ultra-simple prompt API
- Day 3-4: Powerful app API with state management
- Day 5: Low-level component API

**Week 6: Component Library**
- Day 1: Primitive components (text, number, etc.)
- Day 2: Selection components (select, multiselect)
- Day 3: Complex components (form, table)
- Day 4: Feedback components (spinner, progress)
- Day 5: Layout components (box, grid, flex)

### Phase 4: Event & State System (Week 7-8)
**Week 7: Events**
- Day 1-2: Universal event model
- Day 3: Keyboard handling with shortcuts
- Day 4: Mouse support with hit testing
- Day 5: Event bubbling and delegation

**Week 8: State Management**
- Day 1-2: Reactive state with auto-updates
- Day 3: Computed values and derived state
- Day 4: State persistence and hydration
- Day 5: Performance optimization

### Phase 5: Animation & Polish (Week 9-10)
**Week 9: Animation System**
- Day 1: Timing functions and easing
- Day 2: Spring physics simulation
- Day 3: Animated components
- Day 4: Transition choreography
- Day 5: Performance optimization

**Week 10: Optimizations**
- Day 1: Virtual scrolling for large lists
- Day 2: Differential rendering optimization
- Day 3: Batch update implementation
- Day 4: Memory profiling and fixes
- Day 5: Bundle size optimization

### Phase 6: Testing & Documentation (Week 11-12)
**Week 11: Testing**
- Day 1-2: Unit test coverage to 90%+
- Day 3: Integration test suite
- Day 4: Performance benchmarks
- Day 5: Memory leak detection

**Week 12: Documentation & Release**
- Day 1-2: API documentation
- Day 3: Migration guide from v1
- Day 4: Example applications
- Day 5: Release preparation

## Testing Requirements

### Unit Testing Strategy
```typescript
// Test harness for components
class ComponentTestHarness {
  private mockStream = new MockStreamManager()
  private renderer = new TestRenderer(this.mockStream)
  
  async render<T>(component: Component<T>): Promise<TestResult<T>> {
    const result = await component.render()
    return {
      output: this.mockStream.getOutput(),
      value: component.getValue(),
      events: this.mockStream.getEvents()
    }
  }
  
  async sendInput(input: string | KeyEvent): Promise<void> {
    this.mockStream.sendInput(input)
    await this.renderer.processInput()
  }
}

// Example test
test('text input handles validation', async () => {
  const harness = new ComponentTestHarness()
  const input = kit.text('Email', { 
    validate: (v) => v.includes('@') ? null : 'Invalid email' 
  })
  
  const initial = await harness.render(input)
  expect(initial.output).toContain('Email')
  
  await harness.sendInput('test')
  const invalid = await harness.render(input)
  expect(invalid.output).toContain('Invalid email')
  
  await harness.sendInput('test@example.com')
  const valid = await harness.render(input)
  expect(valid.value).toBe('test@example.com')
})
```

### Performance Benchmarks
```typescript
// Performance test suite
describe('Performance', () => {
  benchmark('render 1000 items', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => `Item ${i}`)
    const list = kit.list(items)
    await list.render()
  }, { target: 100 }) // Should complete in 100ms
  
  benchmark('state updates', async () => {
    const state = new SimpleState({ count: 0 })
    for (let i = 0; i < 1000; i++) {
      state.set({ count: i })
    }
  }, { target: 10 }) // 1000 updates in 10ms
  
  benchmark('virtual scroll 10000 items', async () => {
    const items = Array.from({ length: 10000 }, (_, i) => i)
    const scroll = kit.virtualScroll(items, { viewport: 20 })
    await scroll.render()
  }, { target: 50 }) // Initial render in 50ms
})
```

### Memory Profiling
```typescript
// Memory leak detection
test('no memory leaks in component lifecycle', async () => {
  const before = process.memoryUsage().heapUsed
  
  for (let i = 0; i < 100; i++) {
    const component = kit.form({
      name: kit.text('Name'),
      age: kit.number('Age')
    })
    await component.render()
    await component.dispose()
  }
  
  global.gc() // Force garbage collection
  const after = process.memoryUsage().heapUsed
  
  expect(after - before).toBeLessThan(1024 * 1024) // Less than 1MB growth
})
```

## Migration Strategy

### Version Compatibility

```typescript
// Compatibility layer for smooth migration
export const compatKit = {
  // Old API (v1)
  prompt: async (message: string, options?: any) => {
    console.warn('kit.prompt is deprecated, use kit.text')
    return kit.text(message, options)
  },
  
  // Map old reactive API to new simple state
  reactive: (initial: any) => {
    console.warn('Complex reactive system deprecated')
    return new SimpleState(initial)
  },
  
  // Plugin system removed - provide migration path
  use: (plugin: any) => {
    throw new Error(`
      Plugin system removed in v2. 
      See migration guide: https://docs.xec-sh.kit/migration
      
      Suggested alternative:
      - For themes: Use kit.setTheme()
      - For custom components: Extend Component class
      - For validators: Use kit.validators
    `)
  }
}

// Auto-migration tool
export async function migrateProject(dir: string) {
  const files = await glob('**/*.{ts,js}', { cwd: dir })
  
  for (const file of files) {
    let content = await fs.readFile(file, 'utf-8')
    
    // Auto-fix imports
    content = content.replace(
      /@xec-sh\/kit\/plugins/g,
      '@xec-sh/kit/compat'
    )
    
    // Warn about reactive usage
    if (content.includes('ReactiveState')) {
      console.warn(`${file}: Uses ReactiveState - needs manual review`)
    }
    
    await fs.writeFile(file, content)
  }
}
```

### Migration Timeline
1. **v1.x**: Current version with deprecation warnings
2. **v2.0-beta**: New architecture with compatibility layer
3. **v2.0**: Full release with migration tools
4. **v2.1**: Remove compatibility layer

## Risk Mitigation

### Technical Risks

| Risk | Mitigation Strategy |
|------|-------------------|
| Breaking changes upset users | Provide compatibility layer and auto-migration |
| Performance regression | Continuous benchmarking, performance budget |
| Memory leaks in new system | Automated memory profiling in CI |
| Complex fractal model confuses users | Three-layer API - simple by default |
| Missing v1 features | Feature parity checklist, user feedback |

### Process Risks

| Risk | Mitigation Strategy |
|------|-------------------|
| Timeline slippage | Weekly milestones, adjust scope not deadline |
| Scope creep | Strict spec adherence, defer to v3 |
| Testing gaps | Test-first development, 90% coverage requirement |
| Documentation lag | Docs written alongside code |

## Success Metrics

### Performance Targets
```typescript
// Automated performance budget enforcement
const performanceBudget = {
  startupTime: 50,        // ms
  memoryBaseline: 20,     // MB
  renderFrame: 16,        // ms (60fps)
  bundleSize: 100,        // KB
  testCoverage: 90,       // %
}

// CI check
async function checkPerformance() {
  const metrics = await runBenchmarks()
  
  for (const [metric, target] of Object.entries(performanceBudget)) {
    if (metrics[metric] > target) {
      throw new Error(`Performance regression: ${metric} = ${metrics[metric]} (target: ${target})`)
    }
  }
}
```

### Quality Metrics
- **Type Coverage**: 100% - no `any` types in public API
- **Test Coverage**: >90% for all packages
- **Documentation**: 100% of public API documented
- **Bundle Size**: <100KB minified + gzipped
- **Dependencies**: <10 production dependencies
- **Memory Usage**: <20MB for typical usage
- **Time to Interactive**: <50ms

### User Experience Metrics
- **API Simplicity**: 1 line for simple prompts
- **Learning Curve**: <30 min to productivity
- **Error Messages**: 100% actionable errors
- **Migration Effort**: <1 hour for typical project
- **Community Adoption**: 1000+ stars in 6 months

## Long-term Roadmap

### v2.0 (Current Spec)
- Fractal architecture
- Three-layer API
- Built-in animations
- Virtual scrolling
- Full type safety

### v3.0 (Future)
- WebAssembly renderer for performance
- Browser support via WebContainers
- Distributed rendering (client/server)
- AI-powered component suggestions
- Visual component designer

### v4.0 (Vision)
- Cross-platform native apps from terminal components
- React Native bridge
- Flutter integration
- Unified component model across platforms

## Conclusion

This modern architecture specification addresses all critical issues identified in the current codebase while introducing a revolutionary fractal component model. By focusing on simplification first, then building powerful abstractions, we create a library that is both easy to use and infinitely extensible.

The key improvements:
1. **500+ lines of dead code removed** (plugin system)
2. **50% reduction in complexity** (simplified reactive system)
3. **2x performance improvement** (differential rendering)
4. **Zero memory leaks** (proper resource management)
5. **100% type safety** (no `any` types)
6. **90%+ test coverage** (comprehensive testing)

The three-layer API ensures that simple tasks remain simple while complex applications are possible. The fractal nature means patterns learned at one level apply to all levels. This is not just a UI framework - it's a new way of thinking about terminal interfaces.