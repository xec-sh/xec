# Aura - Post-Minimalist TUI Framework

Aura is a reactive, composable terminal UI framework built on top of TRM. It provides fine-grained reactivity and a declarative API for building modern terminal applications.

## 🌟 Features

- **Fine-grained Reactivity**: Signal-based reactive system for optimal performance
- **Declarative API**: Describe your UI, don't manipulate it
- **Type-safe**: Full TypeScript support with strict typing
- **Composable**: Build complex UIs from simple, reusable components
- **Terminal-first**: Designed specifically for terminal environments
- **Responsive**: Automatic adaptation to terminal size changes

## 📦 Installation

```bash
npm install @xec-sh/aura
```

## 🚀 Quick Start

```typescript
import { text, render } from '@xec-sh/aura';

// Create a simple text component
const app = text({
  value: 'Hello, Aura!',
  x: 'center',
  y: 'center',
  style: {
    fg: { r: 100, g: 200, b: 255 },
    bold: true
  }
});

// Render to terminal
await render(app);
```

## 🎯 Core Concepts

### Aura Components

Everything in Aura is an "aura" - a fundamental particle of the interface:

```typescript
import { aura, flex, text, button } from '@xec-sh/aura';

const app = flex({
  direction: 'column',
  gap: 2,
  children: [
    text({ value: 'Welcome to Aura!' }),
    button({ 
      label: 'Click me',
      onClick: () => console.log('Clicked!')
    })
  ]
});
```

### Reactive State

Aura uses signals for fine-grained reactivity:

```typescript
import { signal, computed, effect } from '@xec-sh/aura';

// Create reactive state
const count = signal(0);

// Derive computed values
const doubled = computed(() => count() * 2);

// React to changes
effect(() => {
  console.log(`Count is now: ${count()}`);
});

// Update state
count.set(5);
count.update(n => n + 1);
```

### Layout System

Aura provides powerful layout containers:

- **box**: Absolute positioning
- **flex**: Flexbox-like layout
- **grid**: CSS Grid-like layout
- **stack**: Layer elements on top of each other
- **dock**: Dock elements to edges
- **wrap**: Auto-wrap when space is limited

## 📚 Component Types

### Basic Components
- `text` - Display text with styling
- `input` - Text input field
- `select` - Dropdown selection
- `button` - Interactive button

### Layout Components
- `box` - Container with absolute positioning
- `flex` - Flexible box layout
- `grid` - Grid layout

### Data Components (Coming Soon)
- `table` - Data tables
- `tree` - Tree view
- `list` - List view

### Visualization (Coming Soon)
- `chart` - Charts and graphs
- `sparkline` - Inline sparklines
- `gauge` - Progress gauges

## 🎨 Styling

Aura supports rich styling options:

```typescript
const styled = text({
  value: 'Styled Text',
  style: {
    fg: { r: 255, g: 100, b: 100 },  // RGB color
    bg: { r: 0, g: 0, b: 100 },      // Background
    bold: true,
    italic: true,
    underline: true
  }
});
```

## 🔄 Lifecycle Hooks

```typescript
import { onMount, onCleanup, onUpdate } from '@xec-sh/aura';

// Inside component initialization
onMount(() => {
  console.log('Component mounted');
  
  return () => {
    console.log('Cleanup on unmount');
  };
});

onUpdate(() => {
  console.log('Component updated');
});
```

## 📖 Examples

Check out the `examples/` directory for more examples:

- `01-hello-world.ts` - Simple text rendering
- `02-reactive-counter.ts` - Reactive state management
- More examples coming soon!

## 🛠 Development Status

Aura is currently in early development (Stage 0). The following features are implemented:

- ✅ Core architecture
- ✅ Type definitions
- ✅ Basic reactive system (signals, computed, effects)
- ✅ Component factory functions
- ✅ Basic renderer
- 🚧 Layout system (in progress)
- 🚧 Built-in components (in progress)
- 📅 Advanced features (planned)

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please read the [contribution guidelines](../../CONTRIBUTING.md) first.

## 🔗 Links

- [Documentation](./docs)
- [API Reference](./docs/api.md)
- [Specification](./aura-spec.md)