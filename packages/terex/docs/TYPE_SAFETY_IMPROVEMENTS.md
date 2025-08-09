# Type Safety Improvements for TX Object

## Overview

The new type-safe implementation of the `tx` object eliminates the need for separate `.d.ts` files and provides complete type inference at compile time.

## Key Improvements

### 1. No More `.d.ts` Files Needed

**Before:**
```typescript
// Required separate tx.d.ts file
declare module 'tx' {
  interface Tx {
    (message: string): Promise<string>;
    text(message: string): TextBuilder;
    // ... more declarations
  }
}
```

**After:**
```typescript
// Everything is in the implementation file!
import tx from './instant-typesafe';
// All types are automatically inferred
```

### 2. Eliminated `as any` Casts

**Before:**
```typescript
// Old implementation with unsafe casts
engine.start(wrapper as any);
component.on('submit', ((value: string) => {
  resolve(value);
}) as any);
```

**After:**
```typescript
// Type-safe implementation
engine.start(wrapper); // No cast needed
component.on('submit', submitHandler); // Properly typed
```

### 3. Const Type Inference

**Before:**
```typescript
// Generic string type
const color = await tx.select('Color?', ['red', 'blue', 'green']).prompt();
// color: string (too generic)
```

**After:**
```typescript
// Exact literal types with const assertion
const color = await tx.select('Color?', ['red', 'blue', 'green'] as const).prompt();
// color: 'red' | 'blue' | 'green' (exact types!)
```

### 4. Automatic Form Type Inference

**Before:**
```typescript
// Manual type annotations required
interface UserForm {
  name: string;
  age: number;
  active: boolean;
}

const user: UserForm = await tx.form({
  name: tx.text('Name'),
  age: tx.number('Age'),
  active: tx.confirm('Active?')
});
```

**After:**
```typescript
// Automatic type inference - no manual types needed!
const user = await tx.form({
  name: tx.text('Name'),
  age: tx.number('Age'),
  active: tx.confirm('Active?')
});
// user type is automatically inferred as:
// { name: string; age: number; active: boolean; }
```

### 5. Builder State Tracking

**Before:**
```typescript
// No compile-time validation of builder state
const text = tx.text('Input')
  .required()
  .validate(fn)
  .required(); // Redundant but not caught
```

**After:**
```typescript
// Compile-time state tracking with phantom types
const text = tx.text('Input')
  .required() // Returns TextBuilder<{required: true}>
  .validate(fn); // Returns TextBuilder<{required: true, validated: true}>
// State is tracked at type level
```

## Technical Improvements

### 1. Interface Merging

Uses TypeScript's interface merging for cleaner API:

```typescript
interface TxInterface {
  (message: string): Promise<string>;
  text(message: string): TextBuilder;
  // ... other methods
}
```

### 2. Generic Constraints

Proper use of generic constraints for type safety:

```typescript
select<const T>(message: string, options: readonly T[]): SelectBuilder<T>;
```

### 3. Branded Types

Uses branded types for additional type safety:

```typescript
type Brand<T, B> = T & { [brand]: B };
```

### 4. Phantom Types

Uses phantom types for compile-time state tracking:

```typescript
interface TextBuilder<State extends BuilderState> {
  readonly _phantom?: State;
}
```

### 5. Conditional Types

Uses conditional types for form result extraction:

```typescript
type ExtractFieldType<T> = 
  T extends TextBuilder<any> ? string :
  T extends NumberBuilder<any> ? number :
  T extends SelectBuilder<infer U, any> ? U :
  T extends ConfirmBuilder ? boolean :
  never;
```

## Benefits

1. **Complete Type Safety**: No runtime type errors
2. **Better IntelliSense**: IDE knows all types automatically
3. **Refactoring Safety**: Rename fields and TypeScript catches all usages
4. **No Configuration**: Works out of the box without setup
5. **Zero Runtime Overhead**: All type checking at compile time
6. **Cleaner Code**: No manual type annotations needed
7. **Better Developer Experience**: Autocomplete works perfectly

## Migration Guide

### Step 1: Update Import

```typescript
// Old
import tx from './instant';

// New
import tx from './instant-typesafe';
```

### Step 2: Add Const Assertions

```typescript
// Old
tx.select('Choice', ['a', 'b', 'c'])

// New (for literal types)
tx.select('Choice', ['a', 'b', 'c'] as const)
```

### Step 3: Remove Manual Types

```typescript
// Old
interface FormData {
  field1: string;
  field2: number;
}
const data: FormData = await tx.form({...});

// New (types are inferred)
const data = await tx.form({...});
```

### Step 4: Remove `.d.ts` Files

Delete any manual type declaration files for `tx` - they're no longer needed!

## Examples

### Simple Usage
```typescript
// Everything is type-safe out of the box
const name = await tx('What is your name?');
console.log(name.toUpperCase()); // TypeScript knows it's a string
```

### Complex Forms
```typescript
const config = await tx.form({
  server: tx.form({
    host: tx.text('Host').defaultValue('localhost'),
    port: tx.number('Port').min(1).max(65535),
    ssl: tx.confirm('Enable SSL?')
  }),
  database: tx.select('Database', ['postgres', 'mysql', 'sqlite'] as const),
  features: tx.select('Features', [
    { id: 'cache', name: 'Caching', enabled: true },
    { id: 'log', name: 'Logging', enabled: false }
  ] as const)
});

// Full type inference for nested structure!
console.log(config.server.port); // number
console.log(config.database); // 'postgres' | 'mysql' | 'sqlite'
console.log(config.features.enabled); // boolean
```

### Generic Functions
```typescript
// Create reusable generic functions with type preservation
async function askEnum<const T extends readonly string[]>(
  message: string,
  options: T
): Promise<T[number]> {
  return tx.select(message, options).prompt();
}

const size = await askEnum('Size?', ['S', 'M', 'L', 'XL'] as const);
// size: 'S' | 'M' | 'L' | 'XL'
```

## Performance

- **No Runtime Overhead**: All type checking happens at compile time
- **Same Bundle Size**: Types are stripped in production builds
- **Faster Development**: Better autocomplete and error catching

## Conclusion

The new type-safe implementation provides a superior developer experience with complete type safety, automatic inference, and no need for separate type declaration files. It leverages modern TypeScript features to provide compile-time guarantees while maintaining a clean and intuitive API.