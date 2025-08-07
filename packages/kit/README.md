# @xec-sh/kit

Modern, type-safe CLI interaction library.

## Features

- 🚀 **Simple API** - One-liners for common use cases
- 🎯 **Type Safe** - Full TypeScript support with inference
- 🎨 **Beautiful** - Stunning terminal UI out of the box
- 🔌 **Standalone** - Zero dependencies on xec, works anywhere
- ⚡ **Fast** - Optimized rendering with minimal redraws
- ♿ **Accessible** - Screen reader support and keyboard navigation
- 🧪 **Testable** - Built with testing in mind

## Installation

```bash
npm install @xec-sh/kit
# or
yarn add @xec-sh/kit
# or
pnpm add @xec-sh/kit
```

## Quick Start

```typescript
import kit from '@xec-sh/kit';

// Ask for text input
const name = await kit.text('What is your name?');

// Ask a yes/no question  
const proceed = await kit.confirm('Continue?');

// Choose from a list
const color = await kit.select('Favorite color?', ['red', 'blue', 'green']);

// Multiple selection
const toppings = await kit.multiselect('Pizza toppings?', [
  'cheese', 'pepperoni', 'mushrooms', 'olives'
]);

// Password input
const password = await kit.password('Enter password:');

// Display messages
kit.log.info('This is an info message');
kit.log.success('✓ Task completed');
kit.log.error('✗ Something went wrong');
kit.log.warning('⚠ Be careful');
```

## API Reference

### Text Input

```typescript
const name = await kit.text('What is your name?', {
  placeholder: 'John Doe',
  defaultValue: 'Anonymous',
  validate: (value) => {
    if (value.length < 2) return 'Name must be at least 2 characters';
  },
  transform: (value) => value.trim()
});
```

### Confirm

```typescript
const confirmed = await kit.confirm('Are you sure?', {
  default: false,
  format: {
    yes: 'Absolutely!',
    no: 'Not really'
  }
});
```

### Select

```typescript
const choice = await kit.select('Choose an option:', [
  { value: 'opt1', label: 'Option 1', hint: 'This is the first option' },
  { value: 'opt2', label: 'Option 2', hint: 'This is the second option' },
  { value: 'opt3', label: 'Option 3', disabled: true }
], {
  filter: true,  // Enable filtering
  loop: true,    // Loop at boundaries
  limit: 10      // Show max 10 options
});
```

### Multi-Select

```typescript
const selected = await kit.multiselect('Select multiple:', [
  { value: 'a', label: 'Option A', selected: true },
  { value: 'b', label: 'Option B' },
  { value: 'c', label: 'Option C' }
], {
  required: true,
  min: 1,
  max: 2
});
```

### Password

```typescript
const password = await kit.password('Enter password:', {
  mask: '•',
  showStrength: true,
  validate: (value) => {
    if (value.length < 8) return 'Password must be at least 8 characters';
  }
});
```

### Logging

```typescript
kit.log.info('Information message');
kit.log.success('Success message');
kit.log.warning('Warning message');
kit.log.error('Error message');
kit.log.step('Step message');
kit.log.message('Plain message');
kit.log.break(); // Empty line
```

## Keyboard Shortcuts

All prompts support these standard shortcuts:

- `Ctrl+C` - Cancel/Exit
- `Enter` - Submit
- `←/→` or `Tab` - Navigate horizontally
- `↑/↓` - Navigate vertically
- `Space` - Toggle selection (multi-select)
- `a` - Select all (multi-select)
- `Home/End` - Jump to start/end
- `Page Up/Down` - Navigate by page

## Error Handling

All prompts throw an error with message "Cancelled" when the user cancels:

```typescript
try {
  const name = await kit.text('Name?');
} catch (error) {
  if (error.message === 'Cancelled') {
    console.log('User cancelled');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## License

MIT