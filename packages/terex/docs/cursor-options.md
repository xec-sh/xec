# Cursor Options for Text and Number Inputs

## Overview

The Terex instant API provides comprehensive cursor customization for text and number input fields. By default, a block-style cursor is shown in all input fields, but this can be customized or disabled as needed.

## Options

### `showCursor`

Controls whether the cursor is visible in the input field.

- **Type**: `boolean`
- **Default**: `true`
- **Use cases**: 
  - Hide cursor for password fields
  - Hide cursor for readonly displays
  - Hide cursor when visual feedback is not needed

### `cursorStyle`

Defines the visual style of the cursor.

- **Type**: `'block' | 'underline' | 'bar'`
- **Default**: `'block'`
- **Styles**:
  - `'block'`: Inverted background on the current character (default)
  - `'underline'`: Underline under the current character
  - `'bar'`: Vertical bar cursor (|)

## Usage Examples

### Text Input with Cursor Options

```typescript
import tx from '@xec-sh/terex/instant';

// Default cursor (block style, shown)
const name = await tx.text('Name:')
  .prompt();

// Underline cursor
const email = await tx.text('Email:')
  .cursorStyle('underline')
  .prompt();

// Bar cursor
const username = await tx.text('Username:')
  .cursorStyle('bar')
  .prompt();

// Hidden cursor (for passwords)
const password = await tx.text('Password:')
  .mask('*')
  .showCursor(false)
  .prompt();
```

### Number Input with Cursor Options

```typescript
// Block cursor (default)
const age = await tx.number('Age:')
  .min(0)
  .max(150)
  .prompt();

// Underline cursor for financial data
const price = await tx.number('Price:')
  .cursorStyle('underline')
  .decimals(2)
  .format(v => `$${v.toFixed(2)}`)
  .prompt();

// Hidden cursor for special cases
const code = await tx.number('Security Code:')
  .showCursor(false)
  .min(1000)
  .max(9999)
  .prompt();
```

## Best Practices

### When to Use Different Cursor Styles

1. **Block cursor (`'block'`)**: 
   - Best for general text input
   - High visibility
   - Default choice for most cases

2. **Underline cursor (`'underline'`)**: 
   - Good for form fields
   - Less intrusive visual
   - Works well with styled inputs

3. **Bar cursor (`'bar'`)**: 
   - Traditional terminal style
   - Good for code editors or technical inputs
   - Minimal visual footprint

### When to Hide the Cursor

Consider hiding the cursor (`showCursor(false)`) in these cases:

1. **Password fields**: When using masking, hiding the cursor can enhance security perception
2. **Read-only displays**: When showing values that can't be edited
3. **Loading states**: During validation or async operations
4. **Special UI requirements**: When custom visual feedback is provided

## Advanced Example: Form with Mixed Cursor Styles

```typescript
import tx from '@xec-sh/terex/instant';

async function createUser() {
  // Username with bar cursor for technical feel
  const username = await tx.text('Username:')
    .cursorStyle('bar')
    .minLength(3)
    .prompt();

  // Email with underline cursor for form consistency
  const email = await tx.text('Email:')
    .cursorStyle('underline')
    .validate(v => v.includes('@') ? undefined : 'Invalid email')
    .prompt();

  // Password with hidden cursor for security
  const password = await tx.text('Password:')
    .mask('*')
    .showCursor(false)
    .minLength(8)
    .prompt();

  // Age with default block cursor
  const age = await tx.number('Age:')
    .min(0)
    .max(150)
    .prompt();

  return { username, email, password, age };
}
```

## Implementation Details

The cursor is rendered as part of the component's visual output:

- In focused state, the cursor position is tracked and displayed
- Cursor moves with arrow keys, Home, End, and during typing
- Cursor style is applied using ANSI escape codes for terminal rendering
- When `showCursor` is false, no cursor styling is applied

## Compatibility

Cursor options are supported in:
- `TextInput` component
- `NumberInput` component
- All builders that create these components (`tx.text()`, `tx.number()`)

## TypeScript Support

Full TypeScript support with type-safe method chaining:

```typescript
const input = tx.text('Input:')
  .cursorStyle('underline')  // Type: 'block' | 'underline' | 'bar'
  .showCursor(true)          // Type: boolean
  .prompt();                 // Returns: Promise<string | null>
```