# @xec-sh/kit Migration Guide

## Version 2.0.0 - Reactive Architecture Update

This guide covers the breaking changes and migration steps for upgrading to @xec-sh/kit v2.0.0, which introduces the new reactive prompt architecture with shared stream support.

## Table of Contents
- [Breaking Changes](#breaking-changes)
- [New Features](#new-features)
- [Migration Steps](#migration-steps)
- [Code Examples](#code-examples)
- [Troubleshooting](#troubleshooting)

## Breaking Changes

### 1. Prompt Base Class Changes

The `Prompt` base class has undergone significant internal changes to support shared streams and improved lifecycle management.

#### Changed Access Modifiers
- `handleNonInteractive()` - Changed from `private` to `protected`
- `cleanup()` - Changed from `private` to `protected`

**Impact**: Custom prompt classes that extend `Prompt` can now override these methods.

### 2. New Lifecycle States

Prompts now have explicit lifecycle states:
- `Created` - Initial state
- `Initialized` - After first render or input handling
- `Active` - During interactive prompt
- `Completed` - After completion or cancellation

**Impact**: Minimal for most users, but important for custom prompt implementations.

### 3. Stream Handler Updates

The `StreamHandler` class now supports shared mode with reference counting.

**Before:**
```typescript
const stream = new StreamHandler();
```

**After:**
```typescript
// For shared streams
const stream = new StreamHandler({ shared: true });

// For exclusive streams (default)
const stream = new StreamHandler();
```

## New Features

### 1. Shared Stream Support

Multiple prompts can now share the same `StreamHandler` instance, enabling complex multi-prompt scenarios without resource conflicts.

```typescript
const sharedStream = new StreamHandler({ shared: true });

const prompt1 = new TextPrompt({
  message: 'First prompt',
  stream: sharedStream
});

const prompt2 = new SelectPrompt({
  message: 'Second prompt',
  options: ['A', 'B', 'C'],
  stream: sharedStream
});
```

### 2. New Prompt Methods

All prompts now support these new methods for reactive scenarios:

- `renderOnly()` - Render without starting full prompt lifecycle
- `handleInputOnly(key)` - Handle input without full lifecycle
- `getValue()` - Get current value without completing prompt

```typescript
const prompt = new TextPrompt({ message: 'Enter text' });

// Render without blocking
const output = await prompt.renderOnly();

// Handle input programmatically
await prompt.handleInputOnly({ 
  sequence: 'a', 
  name: 'a', 
  ctrl: false, 
  meta: false, 
  shift: false 
});

// Get value without completing
const currentValue = prompt.getValue();
```

### 3. Improved ReactivePrompt

The `ReactivePrompt` class has been completely redesigned to properly manage child prompts without resource conflicts.

```typescript
const form = new ReactivePrompt({
  initialValues: { name: '', age: 0 },
  prompts: (state) => [
    {
      id: 'name',
      type: 'text',
      message: 'Your name?',
      value: state.get('name')
    },
    {
      id: 'age',
      type: 'number',
      message: 'Your age?',
      value: state.get('age'),
      when: () => state.get('name') !== ''
    }
  ]
});

const result = await form.prompt();
```

## Migration Steps

### Step 1: Update Package

```bash
npm update @xec-sh/kit
# or
yarn upgrade @xec-sh/kit
```

### Step 2: Review Custom Prompts

If you have custom prompt implementations:

1. Check if you override `handleNonInteractive()` or `cleanup()`
2. Update access modifiers if needed
3. Consider using the new lifecycle methods

**Before:**
```typescript
class CustomPrompt extends Prompt {
  // Couldn't override these before
}
```

**After:**
```typescript
class CustomPrompt extends Prompt {
  protected override handleNonInteractive(): TValue | symbol {
    // Custom non-interactive handling
    return super.handleNonInteractive();
  }
  
  protected override cleanup(): void {
    // Custom cleanup logic
    super.cleanup();
  }
}
```

### Step 3: Update Reactive Forms

If using reactive forms with multiple prompts:

**Before (might have issues):**
```typescript
// Old implementation had resource conflicts
const form = reactive({
  initialValues: { /* ... */ },
  prompts: (state) => [ /* ... */ ]
});
```

**After (works correctly):**
```typescript
// New implementation handles resources properly
const form = reactive({
  initialValues: { /* ... */ },
  prompts: (state) => [ /* ... */ ]
});
// No code changes needed, just works better!
```

### Step 4: Leverage New Features (Optional)

Take advantage of new capabilities:

```typescript
// Share streams between prompts
const stream = new StreamHandler({ shared: true });

// Use prompts without blocking
const prompt = new TextPrompt({ 
  message: 'Test',
  stream // Share the stream
});

// Render and handle input separately
const rendered = await prompt.renderOnly();
await prompt.handleInputOnly(keyEvent);
const value = prompt.getValue();
```

## Code Examples

### Example 1: Simple Migration

**Before:**
```typescript
import { text, select, confirm } from '@xec-sh/kit';

async function collectUserInfo() {
  const name = await text({ message: 'Name?' });
  const age = await text({ message: 'Age?' });
  const agree = await confirm({ message: 'Agree to terms?' });
  
  return { name, age, agree };
}
```

**After (no changes needed):**
```typescript
import { text, select, confirm } from '@xec-sh/kit';

async function collectUserInfo() {
  const name = await text({ message: 'Name?' });
  const age = await text({ message: 'Age?' });
  const agree = await confirm({ message: 'Agree to terms?' });
  
  return { name, age, agree };
}
```

### Example 2: Advanced Multi-Prompt Scenario

**New capability (not possible before):**
```typescript
import { ReactivePrompt } from '@xec-sh/kit';

const wizard = new ReactivePrompt({
  initialValues: {
    step: 'personal',
    name: '',
    email: '',
    preferences: {
      theme: 'light',
      notifications: true
    }
  },
  prompts: (state) => {
    const prompts = [];
    
    if (state.get('step') === 'personal') {
      prompts.push(
        {
          id: 'name',
          type: 'text',
          message: 'Your name?',
          validate: (value) => value.length > 0 ? undefined : 'Required'
        },
        {
          id: 'email',
          type: 'text',
          message: 'Your email?',
          validate: (value) => value.includes('@') ? undefined : 'Invalid email'
        }
      );
    }
    
    if (state.get('step') === 'preferences' && state.get('name')) {
      prompts.push(
        {
          id: 'preferences.theme',
          type: 'select',
          message: `${state.get('name')}, choose your theme:`,
          options: ['light', 'dark', 'auto']
        },
        {
          id: 'preferences.notifications',
          type: 'confirm',
          message: 'Enable notifications?'
        }
      );
    }
    
    return prompts;
  }
});

const result = await wizard.prompt();
```

### Example 3: Custom Prompt with Shared Stream

```typescript
import { Prompt, StreamHandler } from '@xec-sh/kit';

class CustomPrompt extends Prompt {
  protected override async initialize(): Promise<void> {
    await super.initialize();
    // Custom initialization
  }
  
  async renderOnly(): Promise<string> {
    // Can now be used in reactive contexts
    return this.render();
  }
  
  async handleInputOnly(key: Key): Promise<void> {
    // Handle input without full lifecycle
    await this.handleInput(key);
  }
}

// Use with shared stream
const sharedStream = new StreamHandler({ shared: true });

const custom1 = new CustomPrompt({ 
  message: 'First',
  stream: sharedStream 
});

const custom2 = new CustomPrompt({ 
  message: 'Second',
  stream: sharedStream 
});
```

## Troubleshooting

### Issue: "Stream already in use" errors

**Solution**: Use shared streams when multiple prompts need to run in sequence:

```typescript
const stream = new StreamHandler({ shared: true });
// Pass to all prompts that need to share
```

### Issue: Reactive forms exit immediately

**Solution**: This should be fixed in v2.0.0. If still occurring:
1. Ensure you're using the latest version
2. Check that your terminal supports TTY
3. File an issue with reproduction steps

### Issue: Custom prompt not working

**Solution**: Ensure your custom prompt:
1. Calls `super()` in constructor
2. Implements required abstract methods
3. Uses proper lifecycle management

### Issue: Tests failing after upgrade

**Solution**: Update your test helpers:

```typescript
import { createSharedStreamContext } from '@xec-sh/kit/test-helpers';

const context = createSharedStreamContext();
const prompt = new TextPrompt({
  message: 'Test',
  stream: context.stream
});
```

## Performance Improvements

The new architecture includes several performance optimizations:

1. **Reduced memory usage**: Shared streams reduce duplication
2. **Faster renders**: Optimized render cycles with batching
3. **Better cleanup**: Proper resource management prevents leaks

## Getting Help

If you encounter issues during migration:

1. Check this guide for solutions
2. Review the [examples](./examples) directory
3. File an issue on [GitHub](https://github.com/xec-sh/kit/issues)
4. Join our [Discord community](https://discord.gg/xec-sh)

## Summary

The v2.0.0 update brings significant improvements to the reactive prompt system while maintaining backward compatibility for simple use cases. Most users won't need to change their code, but those using advanced features will benefit from the improved architecture.

Key benefits:
- ✅ Reactive forms now work reliably
- ✅ Better resource management
- ✅ New capabilities for complex UIs
- ✅ Improved performance
- ✅ Backward compatible for simple cases