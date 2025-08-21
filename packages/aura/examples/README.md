# Aura Next Examples

This directory contains examples demonstrating various features and patterns of the Aura Next TUI framework.

## Running Examples

All examples can be run using Bun:

```bash
bun run examples/<example-name>.ts
```

Or make them executable and run directly:

```bash
chmod +x examples/<example-name>.ts
./examples/<example-name>.ts
```

## Reactive Components

### 🔢 Counter Examples

#### `simple-counter.ts`
A minimal example demonstrating the core concepts of reactive components:
- Creating custom components
- Using reactive signals for state
- Rendering with `aura('text')`
- Basic keyboard interaction

```bash
bun run examples/simple-counter.ts
```

#### `counter-demo.ts`
A comprehensive counter example showcasing advanced features:
- Reactive state management with signals
- Computed values for derived state
- Side effects with history tracking
- Dynamic styling based on state
- Statistics and progress visualization
- Advanced keyboard controls

```bash
bun run examples/counter-demo.ts
```

## Component Demos

### Layout & Positioning
- `simple-layout-example.ts` - Basic layout patterns
- `relative-positioning-demo.ts` - Relative positioning
- `nested-zindex-demo.ts` - Z-index and layering

### Input Components
- `input-demo.ts` - Text input component
- `select-demo.ts` - Selection component
- `input-select-layout-demo.ts` - Combined input examples
- `tab-select-demo.ts` - Tab selection component

### Visual Components
- `ascii-font-selection-demo.ts` - ASCII art fonts
- `styled-text-demo.ts` - Text styling options
- `transparency-demo.ts` - Transparency and blending
- `framebuffer-demo.ts` - Frame buffer rendering

### Advanced Features
- `improved-app-demo.ts` - Modern application patterns
- `mouse-interaction-demo.ts` - Mouse support
- `text-selection-demo.ts` - Text selection
- `timeline-example.ts` - Animation timelines
- `hast-syntax-highlighting-demo.ts` - Syntax highlighting

## Key Concepts

### Creating Custom Components

Custom components in Aura Next are functions that return an `AuraElement`:

```typescript
function MyComponent(props?: MyProps): AnyAuraElement {
  // Create reactive state
  const state = signal(initialValue);
  
  // Define computed values
  const derived = computed(() => transform(state.get()));
  
  // Return component tree using aura()
  return aura('box', {
    children: [
      aura('text', {
        content: derived // Reactive content!
      })
    ]
  });
}
```

### Using Reactive Primitives

Aura Next uses `@xec-sh/neoflux` for reactivity:

```typescript
import { signal, computed, effect } from '@xec-sh/neoflux';

// Create reactive value
const count = signal(0);

// Derive values
const doubled = computed(() => count.get() * 2);

// Side effects
effect(() => {
  console.log('Count changed:', count.get());
});

// Update value
count.set(10);
```

### Application Structure

```typescript
import { auraApp } from '../src/app/application.js';
import { aura } from '../src/app/aura.js';

const app = await auraApp({
  children: MyComponent(),
  onKeyPress: (key) => {
    // Handle keyboard input
  },
  exitOnCtrlC: true
});
```

## Common Patterns

### Keyboard Interaction
```typescript
onKeyPress: (key) => {
  switch (key.name) {
    case 'up': moveUp(); break;
    case 'down': moveDown(); break;
    case 'q': app.stop(); break;
  }
}
```

### Dynamic Styling
```typescript
aura('text', {
  style: {
    color: computed(() => 
      isActive.get() ? [0, 1, 0, 1] : [0.5, 0.5, 0.5, 1]
    )
  }
})
```

### Conditional Rendering
```typescript
import { Show } from '../src/app/aura.js';

Show({
  when: isVisible,
  children: () => aura('text', { content: 'Visible!' })
})
```

### List Rendering
```typescript
import { For } from '../src/app/aura.js';

For({
  each: items,
  children: (item, index) => 
    aura('text', {
      y: computed(() => index.get()),
      content: item
    })
})
```

## Tips

1. **Use signals for state** - Any value that changes should be a signal
2. **Use computed for derived values** - Don't duplicate state
3. **Keep components pure** - Side effects go in effects or event handlers
4. **Leverage reactivity** - The UI updates automatically when signals change
5. **Test with keyboard** - Most examples use keyboard controls

## Contributing

Feel free to add more examples! Follow these guidelines:
- Keep examples focused on demonstrating specific features
- Include comments explaining key concepts
- Add keyboard controls and instructions
- Update this README with your example

## License

MIT