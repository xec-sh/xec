# Hierarchical Focus Management System

## Overview

The Hierarchical Focus Management System extends Aura's focus capabilities to support multi-level focus, where multiple components can be focused simultaneously at different hierarchical levels. This enables rich UI patterns like focused containers with focused children, custom navigation keys per scope, and complex focus flows.

## Key Concepts

### Focus Levels

Components can exist at different hierarchical levels:

```typescript
enum FocusLevel {
  CONTAINER = 0,  // Top-level containers/panels
  GROUP = 1,      // Groups within containers
  COMPONENT = 2,  // Individual interactive components
  DETAIL = 3      // Sub-components or details
}
```

### Focus Scopes

Scopes define navigation boundaries and behavior:

```typescript
interface FocusScope {
  id: string;
  level: FocusLevel;
  parentId?: string;
  navigationKeys?: NavigationKeys;
  trap?: boolean;
  circular?: boolean;
  allowSimultaneousFocus?: boolean;
}
```

### Simultaneous Focus

When `allowSimultaneousFocus` is enabled, a container (like a Box) can remain focused while its child components are also focused. This creates visual hierarchy where:
- The container shows its focused state (e.g., highlighted border)
- The child shows its focused state (e.g., cursor, selection)

## Usage

### Basic Setup

```typescript
import {
  hierarchicalFocusManager,
  useHierarchicalFocus,
  useFocusScope,
  FocusLevel,
  hFocus
} from '@xec-sh/aura/app';

// Define a scope for a panel
const panelScope: FocusScope = {
  id: "main-panel",
  level: FocusLevel.CONTAINER,
  allowSimultaneousFocus: true,
  navigationKeys: {
    next: "tab",
    previous: "shift+tab",
    enter: "enter",
    exit: "escape"
  }
};

// Register the scope
hierarchicalFocusManager.registerScope(panelScope);

// Register components at different levels
const panelBox = new BoxComponent(ctx, {
  id: "panel",
  focusedBorderColor: "#00aaff"
});

useHierarchicalFocus(panelBox, {
  scopeId: "main-panel",
  level: FocusLevel.CONTAINER,
  order: 0
});

const inputBox = new BoxComponent(ctx, {
  id: "input-box",
  focusedBorderColor: "#00ff00"
});

useHierarchicalFocus(inputBox, {
  scopeId: "main-panel",
  level: FocusLevel.GROUP,
  order: 0,
  maintainParentFocus: true  // Keep panel focused when this is focused
});

const input = new InputComponent(ctx, {
  id: "text-input"
});

useHierarchicalFocus(input, {
  scopeId: "main-panel",
  level: FocusLevel.COMPONENT,
  order: 0,
  maintainParentFocus: true
});
```

### Custom Navigation Keys

Different scopes can have different navigation keys:

```typescript
const dialogScope: FocusScope = {
  id: "dialog",
  level: FocusLevel.CONTAINER,
  trap: true,  // Focus cannot leave with Tab
  navigationKeys: {
    next: ["tab", "down", "j"],
    previous: ["shift+tab", "up", "k"],
    exit: "escape"
  }
};

const mainScope: FocusScope = {
  id: "main",
  level: FocusLevel.CONTAINER,
  navigationKeys: {
    next: "alt+tab",
    previous: "alt+shift+tab",
    custom: (key: ParsedKey) => {
      // Custom navigation logic
      if (key.ctrl && key.name === 'p') {
        // Handle Ctrl+P
        return true;
      }
      return false;
    }
  }
};
```

### Keyboard Handling

```typescript
import { getKeyHandler } from '@xec-sh/aura/lib';

getKeyHandler().on("keypress", (key: ParsedKey) => {
  // Let hierarchical focus manager handle navigation
  if (hFocus.handleKey(key)) {
    return;
  }

  // Custom key handling
  if (key.option && key.name === "1") {
    hFocus.enterScope("panel-1");
  }
});
```

### Focus State Queries

```typescript
// Get all currently focused components at each level
const focused = hFocus.getAllFocused();
for (const [level, component] of focused) {
  console.log(`Level ${FocusLevel[level]}: ${component?.id}`);
}

// Check if a component is focused at a specific level
const { focusedAtLevel } = useHierarchicalFocus(component);
const isFocusedAtContainer = focusedAtLevel(FocusLevel.CONTAINER);
```

## Advanced Patterns

### Modal Dialogs

```typescript
const modalScope: FocusScope = {
  id: "modal",
  level: FocusLevel.CONTAINER,
  trap: true,  // Cannot Tab out
  circular: true,  // Tab wraps around
  onEnter: () => {
    // Save previous focus
    previousFocus = hFocus.getAllFocused();
  },
  onExit: () => {
    // Restore previous focus
    restoreFocus(previousFocus);
  }
};
```

### Multi-Panel Layout

```typescript
// Three panels with different navigation
const leftPanel: FocusScope = {
  id: "left",
  level: FocusLevel.CONTAINER,
  allowSimultaneousFocus: true
};

const rightPanel: FocusScope = {
  id: "right",
  level: FocusLevel.CONTAINER,
  allowSimultaneousFocus: true
};

// Switch between panels with Alt+number
if (key.option) {
  switch (key.name) {
    case "1": hFocus.enterScope("left"); break;
    case "2": hFocus.enterScope("right"); break;
  }
}

// Navigate within current panel with Tab
if (key.name === "tab") {
  hFocus.navigate(key.shift ? "previous" : "next");
}
```

### Nested Menus

```typescript
const menuScope: FocusScope = {
  id: "menu",
  level: FocusLevel.GROUP,
  parentId: "menubar",
  navigationKeys: {
    next: "down",
    previous: "up",
    enter: "right",  // Enter submenu
    exit: "left"      // Exit to parent
  }
};

const submenuScope: FocusScope = {
  id: "submenu",
  level: FocusLevel.COMPONENT,
  parentId: "menu",
  trap: true
};
```

## API Reference

### Focus Manager Functions

- `hFocus.navigate(direction)` - Navigate within current scope
- `hFocus.enterScope(scopeId)` - Enter a specific scope
- `hFocus.exitScope()` - Exit current scope
- `hFocus.clearLevel(level)` - Clear focus at a specific level
- `hFocus.clearAll()` - Clear all focus
- `hFocus.getAllFocused()` - Get all focused components
- `hFocus.handleKey(key)` - Handle keyboard input
- `hFocus.reset()` - Reset the focus manager

### Hook Functions

- `useHierarchicalFocus(component, options)` - Register a component
- `useFocusScope(config)` - Create and manage a scope

## Migration from Standard Focus Manager

The hierarchical focus manager is compatible with the standard focus manager API. To migrate:

1. Replace `useFocusable` with `useHierarchicalFocus`
2. Replace `useFocusGroup` with `useFocusScope`
3. Add `level` and `scopeId` to your focus options
4. Update key handlers to use `hFocus.handleKey()`

## Best Practices

1. **Use Appropriate Levels**: Place components at the correct hierarchical level
2. **Maintain Visual Hierarchy**: Use different focus indicators for different levels
3. **Configure Navigation Keys**: Customize keys based on your UI patterns
4. **Handle Focus Traps**: Use trap for modals and popups
5. **Test Accessibility**: Ensure keyboard navigation is intuitive
6. **Provide Visual Feedback**: Always show which elements are focused

## Examples

See `examples/hierarchical-focus-demo.ts` for a complete working example demonstrating:
- Multi-level focus with containers and children
- Custom navigation keys
- Visual focus indicators at different levels
- Panel switching
- Focus state tracking