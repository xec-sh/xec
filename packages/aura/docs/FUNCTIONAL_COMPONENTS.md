# Functional Components in Aura

Functional components provide a React-like way to create dynamic, reactive components in Aura that automatically re-render when their dependencies change.

## Overview

Functional components are regular JavaScript/TypeScript functions that return Aura elements. Aura's smart children processing automatically detects and wraps these functions, eliminating boilerplate code.

## Basic Usage

### Direct Usage (Recommended)

With Aura's smart children processing, you can pass functional components directly to containers without any wrapper:

```typescript
import { Box, Text, HStack, store } from '@xec-sh/aura';

// Create a reactive store
const appState = store({
  count: 0,
  showDetails: false
});

// Define a functional component as a simple function
function DynamicCounter() {
  // This function will re-run when appState changes
  if (appState.showDetails) {
    return Box({
      border: true,
      title: 'Details'
    },
      Text({ value: `Current count: ${appState.count}` }),
      Text({ value: 'Press + to increment' })
    );
  }
  
  return Text({ value: `Count: ${appState.count}` });
}

// Use the functional component directly - no wrapping needed!
const app = await auraApp(() =>
  HStack({},
    DynamicCounter,  // ✨ Automatically detected as functional component
    SidePanel,       // ✨ No Functional() wrapper needed
    StatusBar        // ✨ Clean and simple!
  )
);
```

### Explicit Wrapping (Optional)

You can still explicitly wrap components with `Functional()` if you prefer, or for compatibility:

```typescript
import { Functional } from '@xec-sh/aura';

// Explicit wrapping still works
const app = await auraApp(() =>
  Box({},
    Functional(DynamicCounter)
  )
);
```

## Key Features

### Automatic Re-rendering
When any reactive dependency (signals, stores) accessed within the functional component changes, the component automatically re-renders with the new state.

### Conditional Rendering
Functional components can return different elements based on state:

```typescript
function ConditionalView() {
  if (userStore.isLoggedIn) {
    return UserDashboard();
  }
  return LoginForm();
}
```

### Dynamic Lists
Create dynamic lists that update when data changes:

```typescript
function TodoList() {
  return VStack({},
    ...todoStore.items.map(item =>
      Text({ value: `${item.done ? '✓' : '○'} ${item.text}` })
    )
  );
}
```

## Integration with Stores

Functional components work seamlessly with Aura's reactive stores:

```typescript
const workspace = store({
  currentPath: '/home',
  files: []
});

function FileExplorer() {
  return Box({
    title: workspace.currentPath
  },
    Table({
      rows: workspace.files.map(file => ({
        name: file.name,
        size: file.size,
        modified: file.modified
      }))
    })
  );
}
```

## Best Practices

1. **Keep Functions Pure**: Functional components should be pure functions that only depend on their inputs and reactive state.

2. **Avoid Side Effects**: Don't perform side effects directly in the function body. Use lifecycle hooks instead.

3. **Optimize Heavy Computations**: Use `computed` for expensive calculations:
   ```typescript
   const filteredItems = computed(() => 
     items.filter(item => item.matches(searchTerm()))
   );
   ```

4. **Component Composition**: Break down complex UIs into smaller functional components:
   ```typescript
   function App() {
     return VStack({},
       Header(),
       MainContent(),
       Footer()
     );
   }
   ```

## Limitations

- Functional components don't have direct access to component lifecycle methods
- They can't maintain local state (use signals or stores instead)
- Heavy re-renders might impact performance (use `untrack` for non-reactive reads)

## Example: Dynamic Workspace

```typescript
function WorkspaceView() {
  // Dynamically render based on current workspace
  const workspace = appStore.currentWorkspace;
  
  if (!workspace) {
    return Center({},
      ASCIIFont({ 
        text: "NO WORKSPACE",
        font: "standard"
      })
    );
  }
  
  return HStack({},
    FileTree,     // Just pass the component function
    Editor,       // No wrapper needed
    Terminal      // Clean and simple!
  );
}

function FileTree() {
  const workspace = appStore.currentWorkspace;
  return Box({ title: 'Files' },
    // ... file tree implementation
  );
}

function Editor() {
  const file = appStore.currentFile;
  return Box({ title: file?.name || 'Editor' },
    // ... editor implementation
  );
}

function Terminal() {
  return Box({ title: 'Terminal' },
    // ... terminal implementation
  );
}

// Use in your app - all functions are automatically wrapped
auraApp(() =>
  HStack({},
    WorkspaceView  // ✨ Just pass the function - Aura handles the rest!
  )
);
```

This pattern allows for clean, declarative UI that automatically stays in sync with your application state, without any boilerplate code.