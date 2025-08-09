# Terex - Terminal Experience Framework

A modern, minimalist terminal UI framework with fractal architecture. Built from the ground up with zero dependencies and 100% type safety.

## 🚀 Features

- **Zero Dependencies**: Core has no external dependencies
- **100% Type Safe**: No `any` types, full TypeScript inference
- **Fractal Architecture**: Components contain components infinitely
- **Three-Layer API**: Simple for simple tasks, powerful when needed
- **Built-in Testing**: Comprehensive testing infrastructure included
- **Performance First**: Differential rendering from day one

## 📦 Installation

```bash
npm install @xec-sh/terex
# or
yarn add @xec-sh/terex
# or
pnpm add @xec-sh/terex
```

## 🎯 Current Status (v0.1.0)

This is the initial foundation release focusing on core terminal control:

### ✅ Available Now

- **Cursor Control**: Full cursor manipulation and tracking
- **Color System**: Support for 16, 256, and true color modes
- **Screen Management**: Clearing, scrolling, and buffer control
- **Testing Infrastructure**: Mock terminal and test harness for component testing

### 🔜 Coming Soon

- Simple one-line prompts API
- Reactive component system
- Layout engine (flexbox, grid)
- Animation system
- And much more!

## 📖 Basic Usage

Currently, the library provides low-level terminal control. The high-level API is coming soon.

```typescript
import { 
  createCursorController, 
  createColorSystem, 
  createScreenController 
} from '@xec-sh/terex/core';

// Create terminal controllers
const stream = { 
  input: process.stdin, 
  output: process.stdout, 
  isTTY: true, 
  colorMode: 'truecolor' 
};

const cursor = createCursorController(stream);
const color = createColorSystem(stream);
const screen = createScreenController(stream, cursor);

// Move cursor
cursor.moveTo(10, 5);
cursor.up(2);
cursor.forward(3);

// Apply colors and styles
const styled = color.style('Hello World', {
  foreground: { r: 255, g: 100, b: 50 },
  background: 'blue',
  bold: true,
  underline: true
});

// Screen operations
screen.clear();
screen.writeAt(10, 5, styled);
```

## 🧪 Testing Your Components

Terex includes a comprehensive testing infrastructure:

```typescript
import { createTestHarness, Keys, Mouse } from '@xec-sh/terex/test';

// Create test harness
const harness = createTestHarness({
  width: 80,
  height: 24,
  colorMode: 'none' // No colors in tests
});

// Render your component
await harness.render(yourComponent);

// Simulate user input
harness.sendKey(Keys.enter());
harness.sendMouse(Mouse.click(10, 5));
harness.sendInput('Hello World');

// Assert output
const output = harness.getOutput();
expect(output).toContain('Expected text');

// Clean up
await harness.unmount();
```

## 🏗️ Architecture

Terex follows a fractal architecture where everything is a component:

```
Component
├── Primitive (Text, Space, Line)
├── Input (TextInput, Select, Confirm)
├── Container (Box, Flex, Grid)
├── Feedback (Spinner, Progress)
└── Complex (Form, Table, Tree)
```

## 🎨 Type System

Terex uses the strictest TypeScript configuration with zero `any` types:

```typescript
// Everything is strictly typed
interface Component<TState = Record<string, never>> {
  readonly id: string;
  readonly type: string;
  readonly state: TState;
  render(): Output;
  // ... more strictly typed methods
}

// No any, no unknown in public APIs
// Full inference support
const result = await tx.form({
  name: tx.text('Name'),
  age: tx.number('Age')
});
// result is automatically typed as { name: string; age: number }
```

## 🔧 Development

```bash
# Install dependencies
yarn install

# Build
yarn build

# Run tests
yarn test

# Watch mode
yarn dev

# Type checking
yarn typecheck

# Linting
yarn lint
```

## 📚 Documentation

Full documentation is coming soon. For now, check out:

- [Specification](./spec.md) - Complete design document
- [Type Definitions](./src/core/types.ts) - All type definitions
- [Tests](./test/) - Examples of usage

## 🚦 Roadmap

### Phase 1: Foundation ✅
- Core terminal control
- Type system
- Testing infrastructure

### Phase 2: Components (In Progress)
- Event system
- Differential renderer
- Basic components

### Phase 3: Features (Planned)
- Reactive state management
- Layout engine
- Animation system

### Phase 4: Polish (Planned)
- Developer tools
- Documentation site
- Migration guides

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please ensure:

- No `any` types
- 95%+ test coverage
- All tests pass
- TypeScript strict mode compliance

---

**Terex: Terminal experiences that spark joy.** 🎯