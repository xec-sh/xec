# Improved Aura Application Architecture

## Overview

The improved application architecture addresses a fundamental issue with root component management, providing a more intuitive and efficient API for building TUI applications.

## The Problem

In the original architecture:
1. The `CliRenderer` creates its own `RootComponent` during initialization
2. The `Application` class creates another root from user's element
3. User's root gets added as a child to renderer's root
4. This creates unnecessary nesting and confusion about which root to use

```typescript
// Original approach - problematic
const app = await createApp({
  root: Box({  // This becomes a child of renderer.root
    children: [/* your components */]
  })
});
```

## The Solution

The improved architecture:
1. Uses the renderer's existing `RootComponent` directly
2. Allows users to add multiple components at the root level
3. Eliminates unnecessary nesting
4. Provides a cleaner, more intuitive API

```typescript
// Improved approach - clean and intuitive
const app = await auraApp([
  // Multiple components at root level
  HeaderComponent(),
  MainContent(),
  Sidebar(),
  Footer()
]);
```

## Key Benefits

### 1. **No Root Confusion**
Users don't need to create or manage a root component - it already exists in the renderer.

### 2. **Direct Access**
Components are added directly to the renderer's root, maintaining the intended architecture.

### 3. **Multiple Top-Level Components**
Users can add any number of components at the root level, perfect for layouts:

```typescript
const app = await auraApp([
  Box({ /* header */ }),
  Box({ /* main content */ }),
  Box({ /* sidebar */ }),
  Box({ /* footer */ })
]);
```

### 4. **Dynamic Updates**
The application can update its children dynamically:

```typescript
// Switch between different views
app.updateChildren(newView());
```

### 5. **Simplified API**
Three ways to create apps, from simplest to most flexible:

```typescript
// 1. Minimal - single component
await auraApp(Text({ content: 'Hello!' }));

// 2. Multiple components
await auraApp([Component1(), Component2()]);

// 3. Dynamic with options
await auraApp(
  () => [/* dynamic components */],
  {
    onKeyPress: handleKey,
    onMount: setup
  }
);
```

## API Reference

### `auraApp(children, options?)`

Quick function to create an app with minimal boilerplate.

**Parameters:**
- `children`: Single element, array of elements, or function returning either
- `options`: Optional configuration object

**Returns:** `Promise<ImprovedApplication>`

### `ImprovedApplication`

Main application class with improved architecture.

**Methods:**
- `start()`: Initialize and start the application
- `stop()`: Stop the application and cleanup
- `updateChildren(children)`: Dynamically update root children
- `getRenderer()`: Get the renderer instance
- `getRootComponent()`: Get the renderer's root component
- `getMountedComponents()`: Get all mounted components

**Properties:**
- `running`: Check if application is running
- `dimensions`: Get terminal dimensions

### `ImprovedApplicationOptions`

Configuration options for the application:

```typescript
interface ImprovedApplicationOptions {
  // Components to render
  children: AuraElement | AuraElement[] | (() => AuraElement | AuraElement[]);
  
  // Terminal renderer options
  renderer?: CliRendererConfig;
  
  // Event handlers
  onError?: (error: Error) => void;
  onKeyPress?: (key: string) => void;
  
  // Lifecycle hooks
  onMount?: () => void;
  onCleanup?: () => void;
  onUpdate?: () => void;
  
  // Exit on 'q' or Ctrl+C (default: true)
  exitOnQuit?: boolean;
}
```

## Migration Guide

### From Original to Improved

**Before:**
```typescript
const app = await createApp({
  root: Box({
    width: '100%',
    height: '100%',
    children: [
      Header(),
      Content(),
      Footer()
    ]
  })
});
```

**After:**
```typescript
const app = await auraApp([
  Header(),
  Content(),
  Footer()
]);
```

### Accessing the Root

**Before:**
```typescript
const root = app.getRootComponent(); // Your created root
const actualRoot = app.getRenderer().root; // Renderer's root
```

**After:**
```typescript
const root = app.getRootComponent(); // Direct access to renderer's root
```

## Examples

### Basic Application

```typescript
import { auraApp } from '@xec-sh/aura-next';
import { Text } from '@xec-sh/aura-next/components';

const app = await auraApp(
  Text({ content: 'Hello, World!' })
);
```

### Layout with Multiple Components

```typescript
const app = await auraApp([
  Box({
    x: 0, y: 0,
    width: '100%', height: 3,
    title: 'Header'
  }),
  Box({
    x: 0, y: 3,
    width: '70%', height: 15,
    title: 'Main'
  }),
  Box({
    x: '70%', y: 3,
    width: '30%', height: 15,
    title: 'Sidebar'
  })
]);
```

### Dynamic Content

```typescript
const currentView = signal('home');

const app = await auraApp(
  () => {
    switch(currentView.get()) {
      case 'home': return HomeView();
      case 'settings': return SettingsView();
      default: return NotFoundView();
    }
  },
  {
    onKeyPress: (key) => {
      if (key === '1') currentView.set('home');
      if (key === '2') currentView.set('settings');
    }
  }
);
```

### View Switching

```typescript
const views = {
  home: () => HomeView(),
  settings: () => SettingsView(),
  about: () => AboutView()
};

const app = await auraApp(views.home());

// Switch views dynamically
app.updateChildren(views.settings());
```

## Best Practices

1. **Use arrays for layouts**: When creating multi-panel layouts, pass an array of components
2. **Keep root clean**: Add structural components (headers, sidebars) at root level
3. **Use functions for dynamic content**: Pass functions when content changes based on signals
4. **Leverage updateChildren**: For view switching and major UI changes
5. **Access renderer when needed**: Use `app.getRenderer()` for advanced features

## Summary

The improved architecture provides:
- ✅ Cleaner component hierarchy
- ✅ More intuitive API
- ✅ Better performance (less nesting)
- ✅ Flexibility for complex layouts
- ✅ Proper separation of concerns

This design respects the renderer's architecture while providing maximum flexibility for application developers.