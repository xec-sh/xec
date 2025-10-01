# @xec-sh/kit

> TypeScript library for building beautiful command-line interfaces

[![Version](https://img.shields.io/npm/v/@xec-sh/kit.svg)](https://www.npmjs.com/package/@xec-sh/kit)
[![License](https://img.shields.io/npm/l/@xec-sh/kit.svg)](https://github.com/xec-sh/xec/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)

**Status**: ✅ Production Ready

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Core Concepts](#core-concepts)
- [Prompts System](#prompts-system)
- [Prism Color System](#prism-color-system)
- [Components](#components)
- [Utilities](#utilities)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

`@xec-sh/kit` is a comprehensive toolkit for building interactive command-line interfaces in TypeScript. It provides a rich set of components, prompts, and utilities designed for modern terminal applications.

### What is @xec-sh/kit?

At its core, `@xec-sh/kit` is a modular library that combines:

1. **Interactive Prompts** - Rich user input components (text, select, confirm, autocomplete)
2. **Prism Color System** - Advanced terminal coloring with multiple color spaces (RGB, HSL, HSV, LAB, LCH)
3. **UI Components** - Pre-built components (spinners, progress bars, boxes, notes, task logs)
4. **Utilities** - Helper functions for logging, path manipulation, stream handling, and more

### Why @xec-sh/kit?

- **Type-Safe**: 100% TypeScript with comprehensive type definitions
- **Modern Architecture**: Event-driven design with clean abstractions
- **Flexible**: Composable components that work together seamlessly
- **Performance**: Optimized for speed with minimal dependencies
- **Cross-Runtime**: Works on Node.js (18+) and Bun (1.2+)
- **Well-Tested**: Comprehensive test suite with visual testing via tui-tester
- **Zero Lock-In**: Use individual components without adopting the entire library

---

## Features

### Interactive Prompts

- ✅ **Text Input** - Single-line and multi-line text input with validation
- ✅ **Select** - Single selection from a list with keyboard navigation
- ✅ **Multi-Select** - Multiple selections with toggle support
- ✅ **Autocomplete** - Searchable select with fuzzy matching
- ✅ **Confirm** - Yes/No confirmation dialogs
- ✅ **Password** - Masked password input
- ✅ **Select Key** - Quick single-key selection
- ✅ **Group Multi-Select** - Grouped multi-selection with categories
- ✅ **Path Selector** - Interactive file/directory picker with autocomplete
- ✅ **Group** - Group multiple prompts with context sharing

### Prism Color System

- ✅ **Color Spaces**: RGB, HSL, HSV, LAB, LCH support
- ✅ **CSS Colors**: Parse and use 140+ CSS color names
- ✅ **Color Mixing**: Blend colors in different color spaces
- ✅ **Accessibility**: Luminance and contrast ratio calculations
- ✅ **Auto-Detection**: Automatic terminal color capability detection
- ✅ **Chainable API**: Fluent builder pattern for styling
- ✅ **Separate Streams**: Different configurations for stdout/stderr

### UI Components

- ✅ **Spinner** - Animated loading indicators with 80+ built-in animations
- ✅ **Progress Bar** - Customizable progress indicators
- ✅ **Box** - Bordered containers for content
- ✅ **Note** - Highlighted message blocks
- ✅ **Task** - Task execution with status indicators
- ✅ **Task Log** - Multi-task progress tracking

### Utilities

- ✅ **Intro/Outro** - Start and end CLI with styled messages
- ✅ **Logging** - Structured logging with levels (info, success, warn, error, step)
- ✅ **Streaming** - Real-time output for iterables and async iterables
- ✅ **Cancel Messages** - Styled cancellation messages
- ✅ **Path Utilities** - Path manipulation helpers
- ✅ **Message Utilities** - Formatted message rendering
- ✅ **String Width** - Unicode-aware string width calculation
- ✅ **ANSI Utilities** - Strip, parse, and manipulate ANSI codes
- ✅ **Terminal Detection** - Unicode support, TTY, and CI detection
- ✅ **Symbol Utilities** - 30+ pre-defined Unicode symbols

---

## Installation

### npm

```bash
npm install @xec-sh/kit
```

### yarn

```bash
yarn add @xec-sh/kit
```

### pnpm

```bash
pnpm add @xec-sh/kit
```

### bun

```bash
bun add @xec-sh/kit
```

### Requirements

- **Node.js**: 18.0.0 or higher
- **Bun**: 1.2.0 or higher (optional)
- **TypeScript**: 5.9.0 or higher (peer dependency)

---

## Quick Start

### Basic Example

```typescript
import { text, select, confirm, spinner, log, prism } from '@xec-sh/kit';

// Get user input
const name = await text({
  message: 'What is your name?',
  placeholder: 'Enter your name',
  validate: (value) => {
    if (!value) return 'Name is required';
  },
});

// Single selection
const framework = await select({
  message: 'Choose a framework',
  options: [
    { value: 'react', label: 'React' },
    { value: 'vue', label: 'Vue' },
    { value: 'svelte', label: 'Svelte' },
  ],
});

// Confirmation
const confirmed = await confirm({
  message: 'Continue with installation?',
  initialValue: true,
});

// Show spinner during async operation
const s = spinner();
s.start('Installing dependencies...');
await installDependencies();
s.stop('Installation complete!');

// Logging with colors
log.info('This is an info message');
log.success('This is a success message');
log.warn('This is a warning');
log.error('This is an error');

// Use prism for advanced coloring
console.log(prism.cyan('Hello') + ' ' + prism.bold.yellow('World!'));
console.log(prism.rgb(255, 100, 50)('Custom RGB color'));
console.log(prism.hex('#ff6432')('Hex color'));
```

### Prompts Example

```typescript
import { multiselect, autocomplete, password } from '@xec-sh/kit';

// Multi-selection
const features = await multiselect({
  message: 'Select features to enable',
  options: [
    { value: 'typescript', label: 'TypeScript', hint: 'Type-safe code' },
    { value: 'testing', label: 'Unit Testing', hint: 'Vitest included' },
    { value: 'linting', label: 'ESLint', hint: 'Code quality' },
    { value: 'formatting', label: 'Prettier', hint: 'Code formatting' },
  ],
  required: true,
});

// Autocomplete with search
const country = await autocomplete({
  message: 'Select your country',
  options: [
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' },
    { value: 'ca', label: 'Canada' },
    // ... more options
  ],
});

// Password input
const password = await password({
  message: 'Enter your password',
  validate: (value) => {
    if (value.length < 8) return 'Password must be at least 8 characters';
  },
});
```

### Components Example

```typescript
import { box, note, progressBar, taskLog } from '@xec-sh/kit';

// Display a box
box({
  title: 'Welcome',
  content: 'This is a boxed message with a title',
  borderColor: 'cyan',
});

// Show a note
note('This is an important note', 'Note');

// Progress bar
const total = 100;
const bar = progressBar({ total });
for (let i = 0; i <= total; i++) {
  bar.update(i);
  await sleep(10);
}

// Task log for multiple tasks
const tasks = taskLog();
const t1 = tasks.add('Build project');
const t2 = tasks.add('Run tests');
const t3 = tasks.add('Deploy');

t1.start();
await build();
t1.complete('Built successfully');

t2.start();
await test();
t2.complete('Tests passed');

t3.start();
await deploy();
t3.complete('Deployed to production');
```

---

## Architecture

### Package Structure

```
@xec-sh/kit/
├── src/
│   ├── core/               # Core prompt engine
│   │   ├── prompts/        # Base prompt classes
│   │   │   ├── prompt.ts         # Base Prompt class
│   │   │   ├── text.ts           # TextPrompt
│   │   │   ├── select.ts         # SelectPrompt
│   │   │   ├── confirm.ts        # ConfirmPrompt
│   │   │   ├── password.ts       # PasswordPrompt
│   │   │   ├── select-key.ts     # SelectKeyPrompt
│   │   │   ├── multi-select.ts   # MultiSelectPrompt
│   │   │   ├── autocomplete.ts   # AutocompletePrompt
│   │   │   └── group-multiselect.ts # GroupMultiSelectPrompt
│   │   ├── utils/          # Core utilities
│   │   │   ├── settings.ts       # Global settings
│   │   │   ├── string.ts         # String utilities
│   │   │   ├── string-width.ts   # Width calculation
│   │   │   ├── string-truncated-width.ts
│   │   │   ├── wrap-ansi.ts      # Text wrapping
│   │   │   ├── is-unicode-supported.ts
│   │   │   └── index.ts
│   │   ├── types.ts        # Core type definitions
│   │   └── index.ts
│   ├── prism/              # Advanced color system
│   │   ├── core/           # Core prism implementation
│   │   │   ├── prism.ts         # Main Prism class
│   │   │   └── builder.ts       # PrismBuilder
│   │   ├── color/          # Color utilities
│   │   │   ├── parser.ts        # CSS color parsing
│   │   │   └── spaces.ts        # Color space conversions
│   │   ├── utils/          # Prism utilities
│   │   │   ├── ansi.ts          # ANSI code handling
│   │   │   └── supports.ts      # Terminal capability detection
│   │   └── index.ts
│   ├── prompts/            # High-level prompt functions
│   │   ├── text.ts              # text() function
│   │   ├── select.ts            # select() function
│   │   ├── confirm.ts           # confirm() function
│   │   ├── password.ts          # password() function
│   │   ├── select-key.ts        # selectKey() function
│   │   ├── multi-select.ts      # multiselect() function
│   │   ├── autocomplete.ts      # autocomplete() function
│   │   ├── group-multi-select.ts # groupMultiselect() function
│   │   └── group.ts             # group() function
│   ├── components/         # UI components
│   │   ├── spinner.ts           # Spinner component
│   │   ├── progress-bar.ts      # ProgressBar component
│   │   ├── box.ts               # Box component
│   │   ├── note.ts              # Note component
│   │   ├── task.ts              # Task component
│   │   └── task-log.ts          # TaskLog component
│   ├── utilities/          # Utility functions
│   │   ├── log.ts               # Logging utilities
│   │   ├── common.ts            # Common symbols & types
│   │   ├── messages.ts          # Message formatting
│   │   ├── stream.ts            # Stream handling
│   │   ├── path.ts              # Path utilities
│   │   └── limit-options.ts     # Option limiting
│   ├── helpers/            # Helper functions
│   └── types/              # Shared type definitions
├── test/                   # Test files
├── scripts/                # Build scripts
├── package.json
├── tsconfig.json
└── README.md               # This file
```

### Dependency Graph

```
┌─────────────────────────────┐
│       @xec-sh/kit           │
└─────────────────────────────┘
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
┌────────┐ ┌──────┐ ┌───────────┐
│ prompts│ │prism │ │components │
└────────┘ └──────┘ └───────────┘
    │         │         │
    └─────────┼─────────┘
              ▼
        ┌──────────┐
        │   core   │
        └──────────┘
              │
              ▼
        ┌──────────┐
        │utilities │
        └──────────┘
```

### Key Design Principles

1. **Separation of Concerns**
   - **Core**: Base prompt engine with event system
   - **Prompts**: High-level user-facing API
   - **Components**: Reusable UI elements
   - **Utilities**: Shared helper functions
   - **Prism**: Independent color system

2. **Event-Driven Architecture**
   - All prompts extend base `Prompt` class
   - Event emitter for state changes
   - Lifecycle hooks (initial, active, submit, cancel, error)
   - Custom keyboard handling

3. **Composability**
   - Small, focused modules
   - Functional approach for utilities
   - Class-based for stateful components
   - Mix and match as needed

4. **Type Safety**
   - Generic types for prompts (`Prompt<TValue>`)
   - Strict TypeScript configuration
   - Discriminated unions for state
   - Branded types where appropriate

5. **Performance**
   - Single dependency (sisteransi)
   - Lazy initialization
   - Efficient rendering
   - Minimal allocations

---

## Core Concepts

### 1. Prompt System

All interactive prompts in `@xec-sh/kit` are built on a common foundation:

#### Base Prompt Class

```typescript
class Prompt<TValue> extends EventEmitter {
  state: ClackState;  // 'initial' | 'active' | 'cancel' | 'submit' | 'error'
  value: TValue;

  // Lifecycle methods
  protected on(event: keyof ClackEvents<TValue>, handler: Function): void;
  protected emit(event: keyof ClackEvents<TValue>, value?: any): void;

  // Override in subclasses
  protected cursorAt?(cursor: number): string;
  protected renderInput(value: TValue): string;
  protected valueWithCursor(value: TValue): string;
}
```

#### State Machine

Every prompt goes through these states:

```
initial → active → (submit | cancel | error)
```

- **initial**: Prompt created but not yet shown
- **active**: Prompt is accepting input
- **submit**: User submitted value (Enter)
- **cancel**: User cancelled (Ctrl+C, Escape)
- **error**: Validation failed

#### Event System

Prompts emit events at key points:

```typescript
prompt.on('initial', (value) => {
  // Prompt initialized
});

prompt.on('active', (value) => {
  // Prompt became active
});

prompt.on('value', (value) => {
  // Value changed
});

prompt.on('submit', (value) => {
  // User submitted
});

prompt.on('cancel', (value) => {
  // User cancelled
});
```

### 2. Prism Color System

Prism provides a powerful, chainable API for terminal colors:

#### Color Methods

Prism supports multiple ways to specify colors:

1. **Named colors**: `prism.red()`, `prism.blue()`, etc.
2. **CSS colors**: `prism.hex('#ff6432')`, `prism.css('tomato')`
3. **RGB**: `prism.rgb(255, 100, 50)`
4. **Color spaces**: `prism.hsl(120, 50, 50)`, `prism.lab(50, 20, -30)`

#### Styles

```typescript
prism.bold()        // Bold text
prism.dim()         // Dimmed text
prism.italic()      // Italic text
prism.underline()   // Underlined text
prism.strikethrough() // Strikethrough text
prism.inverse()     // Inverted colors
```

#### Chaining

All methods are chainable:

```typescript
prism.bold.underline.red('Important message');
prism.dim.italic.gray('Subtle hint');
prism.bgBlue.white.bold('Button');
```

### 3. Settings & Configuration

Global settings affect all prompts:

```typescript
import { settings, updateSettings } from '@xec-sh/kit';

// View current settings
console.log(settings);

// Update settings
updateSettings({
  // Custom key bindings
  actions: {
    submit: ['enter', 'return'],
    cancel: ['esc', 'ctrl+c'],
    next: ['down', 'j'],
    prev: ['up', 'k'],
  },

  // Symbols
  symbols: {
    radio: {
      active: '●',
      inactive: '○',
    },
    checkbox: {
      active: '◉',
      inactive: '◯',
    },
  },
});
```

### 4. Components

Components are higher-level UI elements that don't require user input:

#### Stateless Components

Simple render-and-display:
- `box()` - Display bordered content
- `note()` - Show highlighted message

#### Stateful Components

Manage internal state:
- `spinner()` - Animated loading indicator
- `progressBar()` - Progress tracking
- `taskLog()` - Multi-task status

---

<!-- PART 1 COMPLETE - Continue with Part 2 -->
## Prompts System

The prompts system provides a comprehensive set of interactive input components. All prompts share a common architecture and can be used independently or composed together.

### Common Features

All prompts support:

- **Keyboard Navigation**: Arrow keys, Enter, Escape, Tab
- **Validation**: Custom validation with error messages
- **Cancellation**: Ctrl+C or Escape to cancel
- **State Management**: Reactive state updates
- **Custom Rendering**: Override default appearance
- **Stream Control**: Custom input/output streams
- **Signal Support**: AbortController for cancellation

### Common Options

All prompts accept these options:

```typescript
interface CommonOptions {
  /**
   * Custom output stream (default: process.stdout)
   */
  output?: NodeJS.WritableStream;

  /**
   * Custom input stream (default: process.stdin)
   */
  input?: NodeJS.ReadableStream;

  /**
   * AbortSignal for cancellation control
   */
  signal?: AbortSignal;
}
```

### Return Values

All prompts return a `Promise` that resolves to either:
- The selected value (on submit)
- A `symbol` (on cancel) - use `isCancel()` to check

```typescript
import { isCancel } from '@xec-sh/kit';

const name = await text({ message: 'Enter your name' });

if (isCancel(name)) {
  console.log('User cancelled');
  process.exit(0);
}

// name is now typed as string (symbol filtered out)
console.log(`Hello, ${name}!`);
```

---

### text()

Single-line text input with optional placeholder and validation.

#### Signature

```typescript
function text(options: TextOptions): Promise<string | symbol>

interface TextOptions extends CommonOptions {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  initialValue?: string;
  validate?: (value: string | undefined) => string | Error | undefined;
}
```

#### Example

```typescript
import { text, isCancel } from '@xec-sh/kit';

// Basic text input
const name = await text({
  message: 'What is your name?',
});

// With placeholder
const email = await text({
  message: 'Enter your email',
  placeholder: 'user@example.com',
});

// With validation
const username = await text({
  message: 'Choose a username',
  placeholder: 'username',
  validate: (value) => {
    if (!value) return 'Username is required';
    if (value.length < 3) return 'Username must be at least 3 characters';
    if (!/^[a-z0-9_-]+$/i.test(value)) return 'Username can only contain letters, numbers, _ and -';
  },
});

// With default value
const port = await text({
  message: 'Enter port',
  defaultValue: '3000',
});

// With initial value (pre-filled)
const apiKey = await text({
  message: 'Enter API key',
  initialValue: process.env.API_KEY,
});
```

#### Features

- **Cursor Positioning**: Move cursor with arrow keys
- **Placeholder**: Shown when input is empty
- **Default Value**: Used if user submits empty input
- **Initial Value**: Pre-fills input field
- **Validation**: Real-time validation with error display
- **Unicode Support**: Full Unicode character support

---

### select()

Single selection from a list of options with keyboard navigation.

#### Signature

```typescript
function select<Value>(options: SelectOptions<Value>): Promise<Value | symbol>

interface SelectOptions<Value> extends CommonOptions {
  message: string;
  options: Option<Value>[];
  initialValue?: Value;
  maxItems?: number;
}

type Option<Value> = {
  value: Value;
  label?: string;  // Display text (defaults to stringified value)
  hint?: string;   // Optional hint shown when active
}
```

#### Example

```typescript
import { select } from '@xec-sh/kit';

// Basic select
const color = await select({
  message: 'Choose a color',
  options: [
    { value: 'red', label: 'Red' },
    { value: 'green', label: 'Green' },
    { value: 'blue', label: 'Blue' },
  ],
});

// With hints
const framework = await select({
  message: 'Choose a framework',
  options: [
    { value: 'react', label: 'React', hint: 'Most popular' },
    { value: 'vue', label: 'Vue', hint: 'Progressive' },
    { value: 'svelte', label: 'Svelte', hint: 'Compile-time' },
    { value: 'solid', label: 'Solid', hint: 'Fine-grained reactivity' },
  ],
});

// With initial value
const theme = await select({
  message: 'Select theme',
  options: [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'auto', label: 'Auto' },
  ],
  initialValue: 'dark',
});

// With limited display items
const country = await select({
  message: 'Select your country',
  options: countries, // Large list
  maxItems: 10, // Show only 10 at a time
});

// Simple values (no objects)
const answer = await select({
  message: 'Choose one',
  options: [
    { value: 'yes' },
    { value: 'no' },
    { value: 'maybe' },
  ],
});
```

#### Features

- **Keyboard Navigation**: Up/Down arrows, j/k (vim-style)
- **Initial Value**: Pre-select an option
- **Hints**: Show contextual information
- **Max Items**: Scroll through large lists
- **Auto Label**: Use value as label if not provided
- **Generic Values**: Strongly typed option values

---

### multiselect()

Multiple selections from a list with space-bar toggling.

#### Signature

```typescript
function multiselect<Value>(options: MultiSelectOptions<Value>): Promise<Value[] | symbol>

interface MultiSelectOptions<Value> extends CommonOptions {
  message: string;
  options: Option<Value>[];
  initialValues?: Value[];
  maxItems?: number;
  required?: boolean;
  cursorAt?: Value;
}
```

#### Example

```typescript
import { multiselect } from '@xec-sh/kit';

// Basic multi-select
const features = await multiselect({
  message: 'Select features to enable',
  options: [
    { value: 'typescript', label: 'TypeScript' },
    { value: 'eslint', label: 'ESLint' },
    { value: 'prettier', label: 'Prettier' },
    { value: 'testing', label: 'Vitest' },
  ],
});

// With hints
const services = await multiselect({
  message: 'Select AWS services',
  options: [
    { value: 's3', label: 'S3', hint: 'Object storage' },
    { value: 'ec2', label: 'EC2', hint: 'Virtual servers' },
    { value: 'rds', label: 'RDS', hint: 'Managed databases' },
    { value: 'lambda', label: 'Lambda', hint: 'Serverless functions' },
  ],
});

// With initial selections
const permissions = await multiselect({
  message: 'Grant permissions',
  options: [
    { value: 'read', label: 'Read' },
    { value: 'write', label: 'Write' },
    { value: 'delete', label: 'Delete' },
    { value: 'admin', label: 'Admin' },
  ],
  initialValues: ['read'], // Pre-select read permission
});

// Required (at least one selection)
const languages = await multiselect({
  message: 'Select programming languages (at least one)',
  options: languageOptions,
  required: true, // default is true
});

// Optional (can submit with no selections)
const plugins = await multiselect({
  message: 'Select optional plugins',
  options: pluginOptions,
  required: false,
});

// Start cursor at specific option
const tasks = await multiselect({
  message: 'Select tasks',
  options: taskOptions,
  cursorAt: 'important-task', // Start cursor here
});
```

#### Features

- **Space Toggle**: Press space to select/deselect
- **Multiple Selections**: Select many options
- **Required Validation**: Enforce at least one selection
- **Initial Values**: Pre-select options
- **Cursor Position**: Start at specific option
- **Visual Feedback**: Clear selected state indicators

---

### autocomplete()

Searchable select with fuzzy matching and filtering.

#### Signature

```typescript
function autocomplete<Value>(options: AutocompleteOptions<Value>): Promise<Value | symbol>

interface AutocompleteOptions<Value> extends CommonOptions {
  message: string;
  options: Option<Value>[] | (() => Option<Value>[]);
  maxItems?: number;
  placeholder?: string;
  initialValue?: Value;
  initialUserInput?: string;
  validate?: (value: Value | undefined) => string | Error | undefined;
}
```

#### Example

```typescript
import { autocomplete } from '@xec-sh/kit';

// Basic autocomplete
const country = await autocomplete({
  message: 'Select your country',
  options: [
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' },
    { value: 'ca', label: 'Canada' },
    { value: 'au', label: 'Australia' },
    // ... hundreds more
  ],
});

// With placeholder
const city = await autocomplete({
  message: 'Enter city',
  placeholder: 'Start typing to search...',
  options: cityOptions,
});

// With initial user input
const search = await autocomplete({
  message: 'Search',
  options: searchResults,
  initialUserInput: 'react', // Pre-fill search
});

// Dynamic options (function)
const package = await autocomplete({
  message: 'Select npm package',
  options: async function() {
    // Can access this.userInput for search query
    const query = this.userInput;
    const results = await searchNpm(query);
    return results.map(pkg => ({
      value: pkg.name,
      label: pkg.name,
      hint: pkg.description,
    }));
  },
});

// With validation
const email = await autocomplete({
  message: 'Select email',
  options: emailOptions,
  validate: (value) => {
    if (!value) return 'Email is required';
    if (!value.includes('@')) return 'Invalid email';
  },
});
```

#### Features

- **Live Search**: Filter as you type
- **Fuzzy Matching**: Matches label, hint, and value
- **Case Insensitive**: Search is not case-sensitive
- **Dynamic Options**: Load options based on search
- **Keyboard Navigation**: Navigate filtered results
- **Placeholder**: Show hint when empty

---

### confirm()

Yes/No confirmation dialog.

#### Signature

```typescript
function confirm(options: ConfirmOptions): Promise<boolean | symbol>

interface ConfirmOptions extends CommonOptions {
  message: string;
  active?: string;     // default: 'Yes'
  inactive?: string;   // default: 'No'
  initialValue?: boolean;
}
```

#### Example

```typescript
import { confirm } from '@xec-sh/kit';

// Basic confirm
const shouldContinue = await confirm({
  message: 'Continue with installation?',
});

// Custom labels
const deleteConfirm = await confirm({
  message: 'Delete all files?',
  active: 'Delete',
  inactive: 'Keep',
});

// Initial value (default selection)
const useTypeScript = await confirm({
  message: 'Use TypeScript?',
  initialValue: true, // Default to Yes
});

// Practical usage
const confirmed = await confirm({
  message: 'This will overwrite existing files. Continue?',
  active: 'Overwrite',
  inactive: 'Cancel',
  initialValue: false,
});

if (confirmed) {
  // Proceed with operation
} else {
  console.log('Operation cancelled');
}
```

#### Features

- **Toggle**: Left/Right arrows or Y/N keys
- **Custom Labels**: Change Yes/No to any text
- **Initial Value**: Pre-select Yes or No
- **Simple API**: Returns boolean (not object)

---

### password()

Masked password input.

#### Signature

```typescript
function password(options: PasswordOptions): Promise<string | symbol>

interface PasswordOptions extends CommonOptions {
  message: string;
  validate?: (value: string | undefined) => string | Error | undefined;
  mask?: string; // default: '•'
}
```

#### Example

```typescript
import { password } from '@xec-sh/kit';

// Basic password
const pwd = await password({
  message: 'Enter your password',
});

// With validation
const newPassword = await password({
  message: 'Create password',
  validate: (value) => {
    if (!value) return 'Password is required';
    if (value.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(value)) return 'Password must contain uppercase letter';
    if (!/[0-9]/.test(value)) return 'Password must contain number';
  },
});

// Confirm password pattern
const password1 = await password({
  message: 'Enter password',
});

const password2 = await password({
  message: 'Confirm password',
  validate: (value) => {
    if (value !== password1) return 'Passwords do not match';
  },
});

// Custom mask character
const pin = await password({
  message: 'Enter PIN',
  mask: '*',
  validate: (value) => {
    if (!/^\d{4}$/.test(value)) return 'PIN must be 4 digits';
  },
});
```

#### Features

- **Masked Input**: Characters hidden as •••
- **Custom Mask**: Change mask character
- **Validation**: Enforce password rules
- **Backspace Support**: Delete characters
- **Secure**: Input not visible in terminal

---

### selectKey()

Quick single-key selection (no Enter required).

#### Signature

```typescript
function selectKey<Value extends string>(options: SelectKeyOptions<Value>): Promise<Value | symbol>

interface SelectKeyOptions<Value> extends CommonOptions {
  message: string;
  options: Array<{ value: Value; label?: string; hint?: string }>;
}
```

#### Example

```typescript
import { selectKey } from '@xec-sh/kit';

// Basic select key
const action = await selectKey({
  message: 'Choose action',
  options: [
    { value: 'c', label: 'Create' },
    { value: 'u', label: 'Update' },
    { value: 'd', label: 'Delete' },
  ],
});

// With hints
const command = await selectKey({
  message: 'Git command',
  options: [
    { value: 'p', label: 'Pull', hint: 'Fetch and merge' },
    { value: 's', label: 'Status', hint: 'Show status' },
    { value: 'l', label: 'Log', hint: 'Show commits' },
    { value: 'b', label: 'Branch', hint: 'Manage branches' },
  ],
});

// Yes/No/Cancel
const choice = await selectKey({
  message: 'Save changes?',
  options: [
    { value: 'y', label: 'Yes' },
    { value: 'n', label: 'No' },
    { value: 'c', label: 'Cancel' },
  ],
});
```

#### Features

- **Instant Selection**: No Enter key needed
- **Single Character**: Only first character matters
- **Fast Workflow**: Quick decision making
- **Visual Hints**: Show keyboard shortcuts

---

### groupMultiselect()

Multi-select with grouped options.

#### Signature

```typescript
function groupMultiselect<Value>(options: GroupMultiSelectOptions<Value>): Promise<Value[] | symbol>

interface GroupMultiSelectOptions<Value> extends CommonOptions {
  message: string;
  options: Record<string, Option<Value>[]>;
  initialValues?: Value[];
  required?: boolean;
}
```

#### Example

```typescript
import { groupMultiselect } from '@xec-sh/kit';

// Grouped selection
const permissions = await groupMultiselect({
  message: 'Select permissions',
  options: {
    'Read Access': [
      { value: 'read-users', label: 'Read Users' },
      { value: 'read-posts', label: 'Read Posts' },
      { value: 'read-comments', label: 'Read Comments' },
    ],
    'Write Access': [
      { value: 'write-users', label: 'Write Users' },
      { value: 'write-posts', label: 'Write Posts' },
      { value: 'write-comments', label: 'Write Comments' },
    ],
    'Admin Access': [
      { value: 'delete-users', label: 'Delete Users' },
      { value: 'manage-roles', label: 'Manage Roles' },
    ],
  },
  required: true,
});

// Project features by category
const features = await groupMultiselect({
  message: 'Select features to enable',
  options: {
    'Core Features': [
      { value: 'auth', label: 'Authentication' },
      { value: 'db', label: 'Database' },
      { value: 'api', label: 'API Routes' },
    ],
    'Development Tools': [
      { value: 'ts', label: 'TypeScript' },
      { value: 'eslint', label: 'ESLint' },
      { value: 'prettier', label: 'Prettier' },
    ],
    'Testing': [
      { value: 'vitest', label: 'Vitest' },
      { value: 'playwright', label: 'Playwright' },
    ],
  },
  initialValues: ['auth', 'db'], // Pre-select some
});
```

#### Features

- **Group Headers**: Organize options by category
- **Multi-Selection**: Select across groups
- **Initial Values**: Pre-select options
- **Visual Grouping**: Clear category separation

---

### group()

Group multiple prompts together with a summary.

#### Signature

```typescript
function group<T>(prompts: PromptGroup<T>, options?: GroupOptions): Promise<T>

type PromptGroup<T> = {
  [K in keyof T]: (context: Partial<T>) => Promise<T[K]> | T[K];
};

interface GroupOptions {
  onCancel?: () => void;
}
```

#### Example

```typescript
import { group, text, select, confirm } from '@xec-sh/kit';

// Group related prompts
const config = await group({
  name: () => text({ message: 'Project name' }),
  
  framework: () => select({
    message: 'Choose framework',
    options: [
      { value: 'react', label: 'React' },
      { value: 'vue', label: 'Vue' },
      { value: 'svelte', label: 'Svelte' },
    ],
  }),

  // Access previous answers
  typescript: ({ framework }) => confirm({
    message: `Use TypeScript with ${framework}?`,
    initialValue: true,
  }),

  // Conditional prompts
  testing: ({ typescript }) =>
    typescript
      ? select({
          message: 'Testing framework',
          options: [
            { value: 'vitest', label: 'Vitest' },
            { value: 'jest', label: 'Jest' },
          ],
        })
      : Promise.resolve(null),

  // Synchronous values
  author: () => 'Current User',
});

// config is fully typed:
// {
//   name: string;
//   framework: string;
//   typescript: boolean;
//   testing: string | null;
//   author: string;
// }
```

#### Features

- **Sequential Prompts**: One after another
- **Context Access**: Later prompts see earlier answers
- **Conditional Logic**: Skip/show based on context
- **Type Safety**: Fully typed results
- **Sync/Async Mix**: Mix promises and values
- **Single Cancellation Point**: Cancel entire group

---

### path()

Interactive file/directory path selector with autocomplete.

#### Signature

```typescript
function path(options: PathOptions): Promise<string | symbol>

interface PathOptions extends CommonOptions {
  message: string;
  root?: string;
  directory?: boolean;
  initialValue?: string;
  validate?: (value: string | undefined) => string | Error | undefined;
}
```

#### Example

```typescript
import { path } from '@xec-sh/kit';

// Select any file/directory
const filePath = await path({
  message: 'Select a file',
  initialValue: process.cwd(),
});

// Select only directories
const dirPath = await path({
  message: 'Select output directory',
  directory: true,
});

// With validation
const configPath = await path({
  message: 'Select config file',
  validate: (value) => {
    if (!value?.endsWith('.json')) {
      return 'Must be a JSON file';
    }
  },
});

// With custom root
const projectFile = await path({
  message: 'Select project file',
  root: '/Users/projects',
  initialValue: '/Users/projects',
});
```

#### Features

- **Interactive Autocomplete**: Real-time file system navigation
- **Directory Filtering**: Optionally show only directories
- **Path Validation**: Custom validation logic
- **Smart Defaults**: Auto-fills current directory
- **Keyboard Navigation**: Arrow keys to browse, Tab to autocomplete

---

<!-- PART 2 COMPLETE - Continue with Part 3 -->
## Prism Color System

Prism is an advanced terminal color system that provides a rich, chainable API for styling terminal output. It supports multiple color spaces, automatic terminal capability detection, and various styling options.

### Overview

Prism provides:
- **Multiple Color Formats**: Named colors, hex, RGB, HSL, HSV, LAB, LCH
- **140+ CSS Colors**: Use familiar color names like 'tomato', 'skyblue'
- **Chainable API**: Combine styles fluently
- **Auto-Detection**: Automatic terminal color capability detection
- **Color Space Conversions**: Convert between RGB, HSL, HSV, LAB, LCH
- **Accessibility**: Luminance and contrast calculations
- **Separate Streams**: Different configurations for stdout/stderr

### Basic Usage

```typescript
import prism from '@xec-sh/kit';

// Named colors
console.log(prism.red('Error message'));
console.log(prism.green('Success message'));
console.log(prism.blue('Info message'));

// Chaining
console.log(prism.bold.red('Bold red text'));
console.log(prism.dim.italic.gray('Subtle hint'));

// Background colors
console.log(prism.bgBlue.white('Blue button'));
console.log(prism.bgGreen.black.bold('Success badge'));

// Combining styles
console.log(prism.underline.cyan('Clickable link'));
console.log(prism.strikethrough.dim('Deleted text'));
```

### Color Methods

#### Named Colors (16 colors)

```typescript
// Foreground
prism.black()
prism.red()
prism.green()
prism.yellow()
prism.blue()
prism.magenta()
prism.cyan()
prism.white()
prism.gray()       // alias for brightBlack
prism.grey()       // alias for brightBlack

// Bright variants
prism.brightRed()
prism.brightGreen()
prism.brightYellow()
prism.brightBlue()
prism.brightMagenta()
prism.brightCyan()
prism.brightWhite()

// Background
prism.bgBlack()
prism.bgRed()
prism.bgGreen()
prism.bgYellow()
prism.bgBlue()
prism.bgMagenta()
prism.bgCyan()
prism.bgWhite()

// Bright background variants
prism.bgBrightRed()
prism.bgBrightGreen()
// ... etc
```

#### Hex Colors

```typescript
// 6-digit hex
prism.hex('#ff6432')('Custom color');
prism.hex('#f64')('Shorthand hex');

// Background
prism.bgHex('#ff6432')('Colored background');

// Chaining
prism.bold.hex('#ff6432')('Bold custom color');
```

#### RGB Colors

```typescript
// RGB (0-255)
prism.rgb(255, 100, 50)('RGB color');

// Background
prism.bgRgb(50, 100, 255)('RGB background');

// Chaining
prism.bold.rgb(255, 100, 50)('Bold RGB');
```

#### CSS Colors

```typescript
// Any CSS color name
prism.css('tomato')('Tomato colored');
prism.css('skyblue')('Sky blue');
prism.css('mediumseagreen')('Medium sea green');

// 140+ supported colors:
// aliceblue, antiquewhite, aqua, aquamarine, azure, beige,
// bisque, blanchedalmond, blueviolet, brown, burlywood,
// cadetblue, chartreuse, chocolate, coral, cornflowerblue,
// ... and many more

// Background
prism.bgCss('lavender')('Lavender background');
```

#### Advanced Color Spaces

```typescript
// HSL (Hue: 0-360, Saturation: 0-100, Lightness: 0-100)
prism.hsl(120, 50, 50)('HSL green');
prism.bgHsl(240, 100, 50)('HSL blue background');

// HSV (Hue: 0-360, Saturation: 0-100, Value: 0-100)
prism.hsv(0, 100, 100)('HSV red');

// LAB (Lightness: 0-100, a: -128 to 127, b: -128 to 127)
prism.lab(50, 20, -30)('LAB color');

// LCH (Lightness: 0-100, Chroma: 0-230, Hue: 0-360)
prism.lch(50, 50, 120)('LCH color');
```

### Text Styles

```typescript
prism.bold()          // Bold/bright text
prism.dim()           // Dimmed text
prism.italic()        // Italic text
prism.underline()     // Underlined text
prism.strikethrough() // Strikethrough text
prism.inverse()       // Inverted colors
prism.hidden()        // Hidden text (same color as background)
```

### Chaining

All methods return a chainable instance:

```typescript
// Style combinations
prism.bold.underline.red('Important!');
prism.dim.italic.gray('Subtle note');
prism.bgYellow.black.bold('Warning');

// Multiple styles
prism
  .bold
  .underline
  .bgBlue
  .white('Complex styling');

// Color + style
prism.bold.hex('#ff6432')('Bold custom');
prism.italic.rgb(100, 150, 200)('Italic RGB');
prism.underline.hsl(200, 80, 60)('Underline HSL');
```

### Utility Functions

```typescript
import {
  stripAnsi,
  stringLength,
  hasAnsi,
  parseColor,
  getCssColor,
  getCssColorNames,
  isValidColor
} from '@xec-sh/kit';

// Strip ANSI codes
const plain = prism.strip(prism.red('colored'));
// or
const plain = stripAnsi(prism.red('colored'));

// Get visible string length (ignoring ANSI)
const colored = prism.bold.red('Hello');
const length = prism.stringLength(colored); // 5
// or
const length = stringLength(colored);

// Check if string contains ANSI codes
hasAnsi(prism.red('text')); // true
hasAnsi('plain text'); // false

// Parse color string to RGB
const rgb = parseColor('#ff6432');
// { r: 255, g: 100, b: 50 }

// Get CSS color by name
const hex = getCssColor('tomato');
// '#ff6347'

// Validate color string
isValidColor('#ff6432'); // true
isValidColor('tomato'); // true
isValidColor('invalid'); // false

// Get all CSS color names
const colorNames = getCssColorNames();
// ['aliceblue', 'antiquewhite', 'aqua', ..., 'yellowgreen']
// Returns array of 140+ CSS color names
```

### Color Space Conversions

```typescript
import {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  rgbToHsv,
  hsvToRgb,
  rgbToLab,
  labToRgb,
  rgbToLch,
  lchToRgb,
  mixRgb,
  luminance,
  contrastRatio,
} from '@xec-sh/kit';

// Hex <-> RGB
const rgb = hexToRgb('#ff6432');
// { r: 255, g: 100, b: 50 }
const hex = rgbToHex({ r: 255, g: 100, b: 50 });
// '#ff6432'

// RGB <-> HSL
const hsl = rgbToHsl({ r: 255, g: 100, b: 50 });
// { h: 14.63, s: 100, l: 59.8 }
const rgb = hslToRgb({ h: 15, s: 100, l: 60 });
// { r: 255, g: 102, b: 51 }

// RGB <-> HSV
const hsv = rgbToHsv({ r: 255, g: 100, b: 50 });
const rgb = hsvToRgb({ h: 15, s: 80, v: 100 });

// RGB <-> LAB
const lab = rgbToLab({ r: 255, g: 100, b: 50 });
const rgb = labToRgb({ l: 50, a: 20, b: -30 });

// RGB <-> LCH
const lch = rgbToLch({ r: 255, g: 100, b: 50 });
const rgb = lchToRgb({ l: 50, c: 50, h: 120 });

// Mix colors
const mixed = mixRgb(
  { r: 255, g: 0, b: 0 },    // red
  { r: 0, g: 0, b: 255 },    // blue
  0.5                         // 50% mix
);
// { r: 127, g: 0, b: 127 } - purple

// Calculate luminance (0-1)
const lum = luminance({ r: 255, g: 100, b: 50 });
// 0.34

// Calculate contrast ratio (1-21)
const ratio = contrastRatio(
  { r: 255, g: 255, b: 255 }, // white
  { r: 0, g: 0, b: 0 }        // black
);
// 21 (maximum contrast)
```

### Terminal Capability Detection

```typescript
import {
  stdoutColor,
  stderrColor,
  isColorEnabled,
  getBestColorMethod,
  ColorLevel,
} from '@xec-sh/kit';

// Get color support for stdout
const stdout = stdoutColor();
console.log(stdout.level); // 0 (none), 1 (basic), 2 (256), 3 (truecolor)
console.log(stdout.hasBasic); // 16 colors
console.log(stdout.has256); // 256 colors
console.log(stdout.has16m); // 16 million colors (truecolor)

// Get color support for stderr
const stderr = stderrColor();

// Check if colors are enabled
const enabled = isColorEnabled();

// Get best color method
const method = getBestColorMethod();
// 'none' | 'basic' | '256' | 'truecolor'

// Color levels
ColorLevel.None = 0
ColorLevel.Basic = 1
ColorLevel.Ansi256 = 2
ColorLevel.TrueColor = 3
```

### Custom Prism Instances

```typescript
import { createPrism, createPrismStderr } from '@xec-sh/kit';

// Create custom instance
const customPrism = createPrism({
  level: ColorLevel.TrueColor, // Force truecolor
  enabled: true,
});

// Use custom instance
customPrism.red('Custom instance');

// Stderr instance (auto-detected)
const stderrPrism = createPrismStderr();
process.stderr.write(stderrPrism.red('Error to stderr'));

// Disable colors
const noColorPrism = createPrism({
  enabled: false,
});
noColorPrism.red('Not colored'); // Plain text

// Access default stderr instance
import prism from '@xec-sh/kit';
prism.stderr.red('Error');
```

### Environment Variables

Prism respects standard color environment variables:

- **`NO_COLOR`**: Disable colors completely
- **`FORCE_COLOR=0`**: Disable colors
- **`FORCE_COLOR=1`**: Enable basic colors
- **`FORCE_COLOR=2`**: Enable 256 colors
- **`FORCE_COLOR=3`**: Enable truecolor
- **`COLORTERM=truecolor`**: Enable truecolor

```bash
# Disable colors
NO_COLOR=1 node script.js

# Force truecolor
FORCE_COLOR=3 node script.js
```

### Advanced Examples

#### Color Gradients

```typescript
import prism, { rgbToHsl, hslToRgb } from '@xec-sh/kit';

function gradient(text: string, startColor: RGB, endColor: RGB) {
  const len = text.length;
  return text.split('').map((char, i) => {
    const ratio = i / (len - 1);
    const color = mixRgb(startColor, endColor, ratio);
    return prism.rgb(color.r, color.g, color.b)(char);
  }).join('');
}

const rainbowText = gradient(
  'Rainbow Text',
  { r: 255, g: 0, b: 0 },    // red
  { r: 128, g: 0, b: 255 }   // purple
);
```

#### Accessibility Checker

```typescript
import { contrastRatio, luminance } from '@xec-sh/kit';

function checkContrast(fg: RGB, bg: RGB) {
  const ratio = contrastRatio(fg, bg);
  
  // WCAG AA requirements
  const normalAA = ratio >= 4.5;
  const largeAA = ratio >= 3;
  
  // WCAG AAA requirements
  const normalAAA = ratio >= 7;
  const largeAAA = ratio >= 4.5;
  
  return {
    ratio,
    normalAA,
    largeAA,
    normalAAA,
    largeAAA,
  };
}

const result = checkContrast(
  { r: 0, g: 0, b: 0 },       // black text
  { r: 255, g: 255, b: 255 }  // white background
);
// { ratio: 21, normalAA: true, largeAA: true, normalAAA: true, largeAAA: true }
```

#### Dynamic Color Theming

```typescript
import prism, { hslToRgb } from '@xec-sh/kit';

interface Theme {
  primary: RGB;
  secondary: RGB;
  success: RGB;
  warning: RGB;
  error: RGB;
}

const lightTheme: Theme = {
  primary: hslToRgb({ h: 210, s: 100, l: 50 }),
  secondary: hslToRgb({ h: 280, s: 70, l: 50 }),
  success: hslToRgb({ h: 120, s: 70, l: 40 }),
  warning: hslToRgb({ h: 40, s: 100, l: 50 }),
  error: hslToRgb({ h: 0, s: 80, l: 50 }),
};

const darkTheme: Theme = {
  primary: hslToRgb({ h: 210, s: 80, l: 60 }),
  secondary: hslToRgb({ h: 280, s: 60, l: 60 }),
  success: hslToRgb({ h: 120, s: 60, l: 50 }),
  warning: hslToRgb({ h: 40, s: 90, l: 60 }),
  error: hslToRgb({ h: 0, s: 70, l: 60 }),
};

function applyTheme(theme: Theme) {
  return {
    primary: (text: string) => prism.rgb(theme.primary.r, theme.primary.g, theme.primary.b)(text),
    secondary: (text: string) => prism.rgb(theme.secondary.r, theme.secondary.g, theme.secondary.b)(text),
    success: (text: string) => prism.rgb(theme.success.r, theme.success.g, theme.success.b)(text),
    warning: (text: string) => prism.rgb(theme.warning.r, theme.warning.g, theme.warning.b)(text),
    error: (text: string) => prism.rgb(theme.error.r, theme.error.g, theme.error.b)(text),
  };
}

const theme = applyTheme(lightTheme);
console.log(theme.primary('Primary text'));
console.log(theme.success('Success message'));
```

### Type Definitions

```typescript
// Color space types
export interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export interface HSV {
  h: number; // 0-360
  s: number; // 0-100
  v: number; // 0-100
}

export interface LAB {
  l: number; // 0-100
  a: number; // -128 to 127
  b: number; // -128 to 127
}

export interface LCH {
  l: number; // 0-100
  c: number; // 0-230
  h: number; // 0-360
}

// Color levels
export enum ColorLevel {
  None = 0,      // No color support
  Basic = 1,     // 16 colors
  Ansi256 = 2,   // 256 colors
  TrueColor = 3, // 16 million colors
}

// Prism options
export interface PrismOptions {
  level?: ColorLevel;
  enabled?: boolean;
}
```

---

<!-- PART 3 COMPLETE - Continue with Part 4 -->
## Components

Components are higher-level UI elements that provide visual feedback without requiring user input. They're designed for displaying information, progress, and status.

### spinner()

Animated loading indicator with customizable frames and messages.

#### Signature

```typescript
function spinner(options?: SpinnerOptions): SpinnerResult

interface SpinnerOptions extends CommonOptions {
  indicator?: 'dots' | 'timer';
  onCancel?: () => void;
  cancelMessage?: string;
  errorMessage?: string;
  frames?: readonly string[];
  delay?: number;
  style?: SpinnerFrameStyle; // 'braille' | 'circle' | 'dots' | 'line' | 'arrow' | 'binary' | 'moon'
}

interface SpinnerResult {
  start(message: string): void;
  stop(message?: string): void;
  message(message: string): void;
  isCancelled: () => boolean;
}
```

#### Example

```typescript
import { spinner } from '@xec-sh/kit';

// Basic spinner
const s = spinner();
s.start('Loading...');
await fetchData();
s.stop('Done!');

// With different style
const s = spinner({ style: 'dots' });
s.start('Processing...');
await process();
s.stop('Complete!');

// Update message during operation
const s = spinner();
s.start('Starting...');
s.message('Step 1: Fetching data...');
await fetch();
s.message('Step 2: Processing...');
await process();
s.stop('All done!');

// Error handling
const s = spinner();
s.start('Attempting operation...');
try {
  await riskyOperation();
  s.stop('Success!');
} catch (error) {
  s.stop('Failed!');
}

// Cancellation
const controller = new AbortController();
const s = spinner({
  signal: controller.signal,
  cancelMessage: 'Operation cancelled',
  onCancel: () => console.log('Cleanup...'),
});
s.start('Long operation...');

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);
```

#### Built-in Spinner Styles

```typescript
// braille (default) - Smooth spinning dots
{ style: 'braille' } // ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏

// circle - Rotating circle quarters
{ style: 'circle' } // ◐ ◓ ◑ ◒

// dots - Pulsing dots
{ style: 'dots' } // ⠄ ⠆ ⠇ ⠋ ⠙ ⠸ ⠰ ⠠

// line - Rotating line
{ style: 'line' } // ─ \ | /

// arrow - Rotating arrow
{ style: 'arrow' } // ← ↖ ↑ ↗ → ↘ ↓ ↙

// binary - Alternating 0/1
{ style: 'binary' } // 0 1

// moon - Moon phases (emoji)
{ style: 'moon' } // 🌑 🌒 🌓 🌔 🌕 🌖 🌗 🌘

// Custom frames
const s = spinner({
  frames: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
  delay: 80,
});
```

---

### progressBar()

Progress bar for tracking completion percentage.

#### Signature

```typescript
function progressBar(options?: ProgressOptions): ProgressResult

interface ProgressOptions {
  message?: string;
  style?: 'light' | 'heavy' | 'block';
  max?: number;    // Total steps (default: 100)
  size?: number;   // Bar width in characters (default: 40)
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  signal?: AbortSignal;
}

interface ProgressResult extends SpinnerResult {
  advance(step?: number, message?: string): void;
}
```

#### Example

```typescript
import { progressBar } from '@xec-sh/kit';

// Basic progress bar
const total = 100;
const bar = progressBar({ max: total });
bar.start('Processing items...');

for (let i = 0; i <= total; i++) {
  await processItem(i);
  bar.advance(1, `Item ${i}/${total}`);
}

bar.stop('Complete!');

// Different styles
const bar = progressBar({
  max: 50,
  style: 'light',  // ──────────
});

const bar = progressBar({
  max: 50,
  style: 'heavy',  // ━━━━━━━━━━ (default)
});

const bar = progressBar({
  max: 50,
  style: 'block',  // ██████████
});

// Custom size
const bar = progressBar({
  max: 100,
  size: 60,  // Wider bar
});

// File download example
const bar = progressBar({
  max: fileSize,
  style: 'block',
});

bar.start(`Downloading ${filename}...`);

const stream = fs.createWriteStream(destination);
const response = await fetch(url);

let downloaded = 0;
for await (const chunk of response.body) {
  downloaded += chunk.length;
  bar.advance(chunk.length);
  stream.write(chunk);
}

bar.stop(`Downloaded ${filename}`);
```

---

### box()

Display content in a bordered box.

#### Signature

```typescript
function box(content: string, options?: BoxOptions): void
function box(options: { content: string; title?: string } & BoxOptions): void

interface BoxOptions extends CommonOptions {
  title?: string;
  contentAlign?: 'left' | 'center' | 'right';
  titleAlign?: 'left' | 'center' | 'right';
  width?: number | 'auto';
  titlePadding?: number;
  contentPadding?: number;
  rounded?: boolean;
  includePrefix?: boolean;
  formatBorder?: (text: string) => string;
}
```

#### Example

```typescript
import { box } from '@xec-sh/kit';

// Simple box
box('This is a boxed message');

// With title
box({
  title: 'Important',
  content: 'This is an important message',
});

// Alignment
box({
  content: 'Centered text',
  contentAlign: 'center',
});

box({
  title: 'Right Aligned',
  content: 'Content on the right',
  contentAlign: 'right',
  titleAlign: 'right',
});

// Custom width
box({
  content: 'Fixed width box',
  width: 60,
});

// Rounded corners
box({
  content: 'Rounded box',
  rounded: true,
});

// Custom border color
import prism from '@xec-sh/kit';

box({
  content: 'Colored border',
  formatBorder: (text) => prism.cyan(text),
});

// Multi-line content
box({
  title: 'Multi-line',
  content: `Line 1
Line 2
Line 3`,
});

// Padding
box({
  content: 'More padding',
  contentPadding: 3,
  titlePadding: 2,
});
```

---

### note()

Display a highlighted message block.

#### Signature

```typescript
function note(message: string, title?: string, options?: NoteOptions): void

interface NoteOptions extends CommonOptions {
  format?: (line: string) => string;
}
```

#### Example

```typescript
import { note } from '@xec-sh/kit';

// Simple note
note('This is a note');

// With title
note('Important information here', 'Note');

// Warning note
import prism from '@xec-sh/kit';

note(
  'This action cannot be undone',
  'Warning',
  { format: (line) => prism.yellow(line) }
);

// Error note
note(
  'Operation failed',
  'Error',
  { format: (line) => prism.red(line) }
);

// Info note
note(
  'For more information, see documentation',
  'Info',
  { format: (line) => prism.blue(line) }
);

// Multi-line note
note(`
  Step 1: Configure settings
  Step 2: Run build
  Step 3: Deploy
`, 'Instructions');
```

---

### task() / tasks()

Execute tasks with progress indication.

#### Signature

```typescript
type Task = {
  title: string;
  task: (message: (msg: string) => void) => string | Promise<string> | void | Promise<void>;
  enabled?: boolean;
};

function tasks(list: Task[], options?: CommonOptions): Promise<void>
```

#### Example

```typescript
import { tasks } from '@xec-sh/kit';

await tasks([
  {
    title: 'Installing dependencies',
    task: async () => {
      await exec('npm install');
      return 'Dependencies installed';
    },
  },
  {
    title: 'Building project',
    task: async (message) => {
      message('Compiling TypeScript...');
      await exec('tsc');
      message('Bundling assets...');
      await exec('vite build');
      return 'Build complete';
    },
  },
  {
    title: 'Running tests',
    task: async () => {
      await exec('vitest run');
      return 'All tests passed';
    },
  },
  {
    title: 'Deploying',
    task: async () => {
      await deploy();
      return 'Deployed to production';
    },
    enabled: process.env.NODE_ENV === 'production', // Conditional
  },
]);

// With error handling
await tasks([
  {
    title: 'Critical task',
    task: async () => {
      try {
        await riskyOperation();
        return 'Success';
      } catch (error) {
        throw new Error(`Failed: ${error.message}`);
      }
    },
  },
]);
```

---

### taskLog()

Multi-task logger with collapsible output.

#### Signature

```typescript
function taskLog(options: TaskLogOptions): TaskLogger

interface TaskLogOptions extends CommonOptions {
  title: string;
  limit?: number;      // Max visible tasks
  spacing?: number;
  retainLog?: boolean; // Keep log on completion
}

interface TaskLogger {
  add(header: string): TaskItem;
  complete(message: string, options?: TaskLogCompletionOptions): void;
  error(message: string): void;
}

interface TaskItem {
  log(message: string, options?: TaskLogMessageOptions): void;
  complete(message: string): void;
  error(message: string): void;
}
```

#### Example

```typescript
import { taskLog } from '@xec-sh/kit';

// Create task log
const logger = taskLog({
  title: 'Building Project',
  limit: 5, // Show only 5 tasks at a time
});

// Add tasks
const compile = logger.add('Compiling TypeScript');
compile.log('Found 150 files...');
compile.log('Type checking...');
compile.log('Emitting output...');
compile.complete('Compiled successfully');

const bundle = logger.add('Bundling assets');
bundle.log('Processing CSS...');
bundle.log('Optimizing images...');
bundle.error('Failed to optimize large.png');

const test = logger.add('Running tests');
test.log('Jest test suite');
test.log('47/50 tests passed');
test.error('3 tests failed');

// Complete entire log
logger.complete('Build finished with errors', {
  showLog: true, // Keep failed tasks visible
});

// Deployment example
const deploy = taskLog({ title: 'Deployment' });

const build = deploy.add('Building');
await runBuild();
build.complete('Build successful');

const upload = deploy.add('Uploading');
await uploadFiles();
upload.complete('Files uploaded');

const verify = deploy.add('Verifying');
await verifyDeployment();
verify.complete('Verification passed');

deploy.complete('Deployment successful');
```

---

## Utilities

Utility functions for common CLI tasks.

### intro()

Display a title message at the start of your CLI.

#### Signature

```typescript
function intro(title?: string, options?: CommonOptions): void
```

#### Example

```typescript
import { intro } from '@xec-sh/kit';

intro('create-project');
// ┌  create-project

intro(prism.bgCyan(prism.black(' My CLI ')));
// ┌  My CLI (with background)
```

---

### outro()

Display a completion message at the end of your CLI.

#### Signature

```typescript
function outro(message?: string, options?: CommonOptions): void
```

#### Example

```typescript
import { outro, prism } from '@xec-sh/kit';

outro('Done!');
// │
// └  Done!

outro(prism.green('✓ Installation complete!'));
// │
// └  ✓ Installation complete!

outro(prism.red('✗ Installation failed'));
// │
// └  ✗ Installation failed
```

---

### cancel()

Display a cancellation message.

#### Signature

```typescript
function cancel(message?: string, options?: CommonOptions): void
```

#### Example

```typescript
import { cancel, prism } from '@xec-sh/kit';

cancel('Operation cancelled');
// └  Operation cancelled

cancel(prism.red('Aborted by user'));
// └  Aborted by user
```

---

### log

Structured logging with colored output.

#### Signature

```typescript
const log: {
  message(message: string | string[], options?: LogMessageOptions): void;
  info(message: string, options?: LogMessageOptions): void;
  success(message: string, options?: LogMessageOptions): void;
  step(message: string, options?: LogMessageOptions): void;
  warn(message: string, options?: LogMessageOptions): void;
  warning(message: string, options?: LogMessageOptions): void;
  error(message: string, options?: LogMessageOptions): void;
};

interface LogMessageOptions extends CommonOptions {
  symbol?: string;
  spacing?: number;
  secondarySymbol?: string;
}
```

#### Example

```typescript
import { log } from '@xec-sh/kit';

// Different log levels
log.info('Starting process...');
log.success('Operation completed successfully');
log.step('Step 1: Initialize');
log.warn('Warning: This might take a while');
log.error('Error: Operation failed');

// Multi-line messages
log.info(`
  Configuration loaded:
  - Port: 3000
  - Environment: development
  - Debug: enabled
`);

// Custom spacing
log.message('Spaced message', { spacing: 2 });

// Custom symbol
import prism from '@xec-sh/kit';

log.message('Custom icon', {
  symbol: prism.cyan('⚡'),
});
```

---

### stream

Stream-based logging for real-time output with iterables and async iterables.

#### Signature

```typescript
const stream: {
  message(iterable: Iterable<string> | AsyncIterable<string>, options?: LogMessageOptions): Promise<void>;
  info(iterable: Iterable<string> | AsyncIterable<string>): Promise<void>;
  success(iterable: Iterable<string> | AsyncIterable<string>): Promise<void>;
  step(iterable: Iterable<string> | AsyncIterable<string>): Promise<void>;
  warn(iterable: Iterable<string> | AsyncIterable<string>): Promise<void>;
  warning(iterable: Iterable<string> | AsyncIterable<string>): Promise<void>;
  error(iterable: Iterable<string> | AsyncIterable<string>): Promise<void>;
};
```

#### Example

```typescript
import { stream } from '@xec-sh/kit';

// Stream from async generator
async function* buildOutput() {
  yield 'Compiling...';
  await delay(100);
  yield 'Bundling...';
  await delay(100);
  yield 'Done!';
}

await stream.info(buildOutput());

// Stream from array
await stream.success(['Step 1', 'Step 2', 'Step 3']);

// Stream command output
import { exec } from 'child_process';
import { createInterface } from 'readline';

const child = exec('npm install');
const rl = createInterface({ input: child.stdout });

await stream.step(rl);

// Real-time progress
async function* progress() {
  for (let i = 0; i <= 100; i += 10) {
    yield `Progress: ${i}%`;
    await delay(200);
  }
}

await stream.info(progress());
```

#### Features

- **Async Iterator Support**: Stream from any async iterable
- **Real-time Output**: Display output as it arrives
- **Automatic Line Wrapping**: Handles terminal width
- **Same API as log**: Familiar interface with info/success/warn/error
- **Backpressure Handling**: Properly handles slow consumers

---

### Common Symbols

Pre-defined Unicode symbols for consistent UI.

```typescript
import {
  // Box drawing symbols
  S_BAR,                    // │
  S_BAR_H,                  // ─
  S_BAR_START,              // ┌
  S_BAR_END,                // └
  S_BAR_START_RIGHT,        // ┐
  S_BAR_END_RIGHT,          // ┘
  S_CONNECT_LEFT,           // ├
  S_CORNER_TOP_LEFT,        // ╭
  S_CORNER_TOP_RIGHT,       // ╮
  S_CORNER_BOTTOM_LEFT,     // ╰
  S_CORNER_BOTTOM_RIGHT,    // ╯

  // Radio/checkbox symbols
  S_RADIO_ACTIVE,           // ●
  S_RADIO_INACTIVE,         // ○
  S_CHECKBOX_ACTIVE,        // ◻
  S_CHECKBOX_INACTIVE,      // ◻
  S_CHECKBOX_SELECTED,      // ◼

  // Step/state symbols
  S_STEP_ACTIVE,            // ◆
  S_STEP_SUBMIT,            // ◇
  S_STEP_CANCEL,            // ■
  S_STEP_ERROR,             // ▲

  // Status symbols
  S_INFO,                   // ●
  S_SUCCESS,                // ◆
  S_WARN,                   // ▲
  S_ERROR,                  // ■

  // Other symbols
  S_PASSWORD_MASK,          // ▪
} from '@xec-sh/kit';
```

#### Helper Functions

```typescript
import { symbol, unicodeOr, unicode, isCI, isTTY } from '@xec-sh/kit';

// Get state symbol with color
import { symbol } from '@xec-sh/kit';
const activeSymbol = symbol('active');   // cyan ◆
const submitSymbol = symbol('submit');   // green ◇
const cancelSymbol = symbol('cancel');   // red ■
const errorSymbol = symbol('error');     // yellow ▲

// Choose Unicode or fallback
const check = unicodeOr('✓', 'v');       // '✓' if Unicode supported, 'v' otherwise
const arrow = unicodeOr('→', '->');      // '→' if Unicode supported, '->' otherwise

// Check Unicode support
if (unicode) {
  console.log('Unicode is supported');
}

// Check if running in CI
if (isCI()) {
  console.log('Running in CI environment');
}

// Check if output is TTY
import { isTTY } from '@xec-sh/kit';
if (isTTY(process.stdout)) {
  console.log('Output is a terminal');
}
```

---

### Settings

Global configuration for all prompts.

#### Signature

```typescript
interface ClackSettings {
  actions: Record<Action, string[]>;
  symbols: {
    radio: { active: string; inactive: string };
    checkbox: { active: string; inactive: string; selected: string };
  };
}

type Action = 'submit' | 'cancel' | 'next' | 'prev' | 'left' | 'right' | 'select';

const settings: ClackSettings;
function updateSettings(newSettings: Partial<ClackSettings>): void;
```

#### Example

```typescript
import { settings, updateSettings } from '@xec-sh/kit';

// View current settings
console.log(settings.actions);
console.log(settings.symbols);

// Customize key bindings
updateSettings({
  actions: {
    submit: ['enter', 'return'],
    cancel: ['esc', 'ctrl+c'],
    next: ['down', 'j'],      // Vim-style
    prev: ['up', 'k'],        // Vim-style
    left: ['left', 'h'],
    right: ['right', 'l'],
    select: ['space'],
  },
});

// Customize symbols
updateSettings({
  symbols: {
    radio: {
      active: '◉',
      inactive: '◯',
    },
    checkbox: {
      active: '☑',
      inactive: '☐',
      selected: '☑',
    },
  },
});

// Restore defaults
updateSettings({
  actions: settings.actions,
  symbols: settings.symbols,
});
```

### Utility Functions

```typescript
import {
  isCancel,      // Check if user cancelled prompt
  block,         // Block async operation
  getRows,       // Get terminal rows
  getColumns,    // Get terminal columns
} from '@xec-sh/kit';

// Check cancellation
const name = await text({ message: 'Name?' });
if (isCancel(name)) {
  console.log('Cancelled');
  process.exit(0);
}

// Terminal dimensions
const columns = getColumns();
const rows = getRows();
console.log(`Terminal: ${columns}x${rows}`);

// Block operation (wait for all writes to complete)
await block();
```

---

<!-- PART 4 COMPLETE - Continue with Part 5 -->
## Examples

### Complete CLI Application

```typescript
import {
  intro,
  outro,
  text,
  select,
  multiselect,
  confirm,
  spinner,
  log,
  prism,
  isCancel,
} from '@xec-sh/kit';

async function main() {
  console.clear();

  // Start
  intro(prism.bgCyan(prism.black(' create-app ')));

  // Get project name
  const projectName = await text({
    message: 'What is your project name?',
    placeholder: 'my-awesome-app',
    validate: (value) => {
      if (!value) return 'Project name is required';
      if (!/^[a-z0-9-]+$/.test(value))
        return 'Project name can only contain lowercase letters, numbers and dashes';
    },
  });

  if (isCancel(projectName)) {
    outro(prism.red('Operation cancelled'));
    process.exit(0);
  }

  // Select framework
  const framework = await select({
    message: 'Choose a framework',
    options: [
      { value: 'react', label: 'React', hint: 'Most popular' },
      { value: 'vue', label: 'Vue', hint: 'Progressive framework' },
      { value: 'svelte', label: 'Svelte', hint: 'Compile-time magic' },
    ],
  });

  if (isCancel(framework)) {
    outro(prism.red('Operation cancelled'));
    process.exit(0);
  }

  // Select features
  const features = await multiselect({
    message: 'Select additional features',
    options: [
      { value: 'typescript', label: 'TypeScript' },
      { value: 'eslint', label: 'ESLint' },
      { value: 'prettier', label: 'Prettier' },
      { value: 'testing', label: 'Vitest' },
    ],
    required: false,
  });

  if (isCancel(features)) {
    outro(prism.red('Operation cancelled'));
    process.exit(0);
  }

  // Confirm
  const shouldInstall = await confirm({
    message: 'Install dependencies?',
    initialValue: true,
  });

  if (isCancel(shouldInstall)) {
    outro(prism.red('Operation cancelled'));
    process.exit(0);
  }

  // Create project
  const s = spinner();
  s.start('Creating project...');

  await createProjectFiles(projectName, framework, features);
  s.stop('Project created');

  // Install dependencies
  if (shouldInstall) {
    s.start('Installing dependencies...');
    await installDependencies();
    s.stop('Dependencies installed');
  }

  // Done
  outro(prism.green('Project ready! 🎉'));
  log.info(`cd ${projectName}`);
  log.info('npm run dev');
}

main().catch(console.error);
```

### Form Wizard

```typescript
import { group, text, select, password, confirm } from '@xec-sh/kit';

interface UserData {
  username: string;
  email: string;
  password: string;
  role: string;
  subscribe: boolean;
}

const userData = await group<UserData>({
  // Sequential prompts with context access
  username: () =>
    text({
      message: 'Choose a username',
      validate: (value) => {
        if (!value) return 'Username is required';
        if (value.length < 3) return 'Username must be at least 3 characters';
      },
    }),

  email: () =>
    text({
      message: 'Enter your email',
      validate: (value) => {
        if (!value) return 'Email is required';
        if (!value.includes('@')) return 'Invalid email address';
      },
    }),

  password: () =>
    password({
      message: 'Create a password',
      validate: (value) => {
        if (!value) return 'Password is required';
        if (value.length < 8) return 'Password must be at least 8 characters';
      },
    }),

  // Access previous answers
  confirmPassword: ({ password }) =>
    password({
      message: 'Confirm password',
      validate: (value) => {
        if (value !== password) return 'Passwords do not match';
      },
    }),

  role: () =>
    select({
      message: 'Select your role',
      options: [
        { value: 'user', label: 'User' },
        { value: 'admin', label: 'Administrator' },
        { value: 'moderator', label: 'Moderator' },
      ],
    }),

  // Conditional prompt
  subscribe: ({ email }) =>
    confirm({
      message: `Send updates to ${email}?`,
      initialValue: true,
    }),
});

console.log('User data:', userData);
```

### Progress Tracking

```typescript
import { taskLog, progressBar } from '@xec-sh/kit';

// Multi-task logging
async function buildProject() {
  const logger = taskLog({ title: 'Building Project' });

  // Compile TypeScript
  const compile = logger.add('Compiling TypeScript');
  compile.log('Scanning files...');
  const files = await scanFiles();
  compile.log(`Found ${files.length} files`);
  compile.log('Type checking...');
  await typeCheck(files);
  compile.complete('Compilation successful');

  // Bundle assets
  const bundle = logger.add('Bundling assets');
  bundle.log('Processing CSS...');
  await processCss();
  bundle.log('Optimizing images...');
  await optimizeImages();
  bundle.complete('Assets bundled');

  // Run tests
  const test = logger.add('Running tests');
  test.log('Jest test suite...');
  const results = await runTests();
  test.log(`${results.passed}/${results.total} tests passed`);
  if (results.failed > 0) {
    test.error(`${results.failed} tests failed`);
  } else {
    test.complete('All tests passed');
  }

  logger.complete('Build complete');
}

// Progress bar for downloads
async function downloadFile(url: string, destination: string) {
  const response = await fetch(url);
  const total = parseInt(response.headers.get('content-length') || '0');

  const bar = progressBar({
    max: total,
    style: 'block',
  });

  bar.start(`Downloading ${path.basename(destination)}...`);

  const writer = fs.createWriteStream(destination);
  let downloaded = 0;

  for await (const chunk of response.body) {
    downloaded += chunk.length;
    bar.advance(chunk.length);
    writer.write(chunk);
  }

  bar.stop('Download complete');
}
```

### Color Themes

```typescript
import prism, { hslToRgb, rgbToHex } from '@xec-sh/kit';

// Define theme
interface ColorTheme {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

const darkTheme: ColorTheme = {
  primary: rgbToHex(hslToRgb({ h: 210, s: 80, l: 60 })),
  secondary: rgbToHex(hslToRgb({ h: 280, s: 60, l: 60 })),
  success: rgbToHex(hslToRgb({ h: 120, s: 60, l: 50 })),
  warning: rgbToHex(hslToRgb({ h: 40, s: 90, l: 60 })),
  error: rgbToHex(hslToRgb({ h: 0, s: 70, l: 60 })),
  info: rgbToHex(hslToRgb({ h: 200, s: 70, l: 60 })),
};

// Apply theme
function themed(theme: ColorTheme) {
  return {
    primary: (text: string) => prism.hex(theme.primary)(text),
    secondary: (text: string) => prism.hex(theme.secondary)(text),
    success: (text: string) => prism.hex(theme.success)(text),
    warning: (text: string) => prism.hex(theme.warning)(text),
    error: (text: string) => prism.hex(theme.error)(text),
    info: (text: string) => prism.hex(theme.info)(text),
  };
}

const t = themed(darkTheme);

console.log(t.primary('Primary message'));
console.log(t.success('Success message'));
console.log(t.error('Error message'));
```

---

## Best Practices

### 1. Error Handling

Always handle cancellations and validation errors:

```typescript
import { text, isCancel, log } from '@xec-sh/kit';

const name = await text({
  message: 'Enter name',
  validate: (value) => {
    if (!value) return 'Name is required';
    if (value.length < 2) return 'Name too short';
  },
});

if (isCancel(name)) {
  log.warn('Operation cancelled by user');
  process.exit(0);
}

// name is now guaranteed to be a valid string
console.log(`Hello, ${name}!`);
```

### 2. Consistent Cancellation Handling

Create a reusable helper:

```typescript
function handleCancel<T>(value: T | symbol): asserts value is T {
  if (isCancel(value)) {
    log.warn('Operation cancelled');
    process.exit(0);
  }
}

// Use in your prompts
const name = await text({ message: 'Name?' });
handleCancel(name);

const age = await text({ message: 'Age?' });
handleCancel(age);

// TypeScript knows these are not symbols
console.log(name.toUpperCase());
console.log(parseInt(age));
```

### 3. Validation Best Practices

```typescript
// Use clear error messages
validate: (value) => {
  if (!value) return 'This field is required';
  if (value.length < 8) return 'Must be at least 8 characters';
  if (!/[A-Z]/.test(value)) return 'Must contain uppercase letter';
  if (!/[0-9]/.test(value)) return 'Must contain number';
  // Return undefined for valid input
};

// Async validation
validate: async (value) => {
  if (!value) return 'Username required';

  const exists = await checkUsername(value);
  if (exists) return 'Username already taken';
};

// External validation function
function validateEmail(email: string | undefined): string | undefined {
  if (!email) return 'Email required';
  if (!email.includes('@')) return 'Invalid email';
  if (email.length > 254) return 'Email too long';
}

const email = await text({
  message: 'Email',
  validate: validateEmail,
});
```

### 4. Grouping Related Prompts

Use `group()` for related prompts:

```typescript
// Good: Grouped related prompts
const config = await group({
  host: () => text({ message: 'Database host' }),
  port: () => text({ message: 'Database port', defaultValue: '5432' }),
  username: () => text({ message: 'Database username' }),
  password: () => password({ message: 'Database password' }),
});

// Bad: Individual prompts (harder to cancel, less context)
const host = await text({ message: 'Database host' });
if (isCancel(host)) process.exit(0);

const port = await text({ message: 'Database port' });
if (isCancel(port)) process.exit(0);
// ... etc
```

### 5. Spinner vs Progress Bar

```typescript
// Use spinner for unknown duration
const s = spinner();
s.start('Fetching data...');
await fetchFromAPI();
s.stop('Data fetched');

// Use progress bar for known steps
const total = files.length;
const bar = progressBar({ max: total });
bar.start('Processing files...');

for (let i = 0; i < files.length; i++) {
  await processFile(files[i]);
  bar.advance(1, `${i + 1}/${total}`);
}

bar.stop('All files processed');
```

### 6. Conditional Prompts

```typescript
const config = await group({
  useDocker: () => confirm({ message: 'Use Docker?' }),

  // Only ask if using Docker
  dockerImage: ({ useDocker }) =>
    useDocker
      ? select({
          message: 'Select image',
          options: [
            { value: 'node:20', label: 'Node 20' },
            { value: 'node:18', label: 'Node 18' },
          ],
        })
      : Promise.resolve(null),

  // Conditional on previous answers
  port: ({ useDocker, dockerImage }) =>
    useDocker
      ? text({ message: 'Container port', defaultValue: '3000' })
      : text({ message: 'Local port', defaultValue: '8080' }),
});
```

### 7. Custom Output Streams

```typescript
import { text, spinner } from '@xec-sh/kit';
import fs from 'fs';

// Write to file
const logFile = fs.createWriteStream('install.log');

const name = await text({
  message: 'Project name',
  output: logFile, // Write to file instead of stdout
});

// Use stderr for errors
const s = spinner({
  output: process.stderr, // Write to stderr
});
```

### 8. Accessibility

```typescript
// Provide hints for complex prompts
const selection = await select({
  message: 'Choose deployment target',
  options: [
    { value: 'prod', label: 'Production', hint: 'Live environment' },
    { value: 'staging', label: 'Staging', hint: 'Testing environment' },
    { value: 'dev', label: 'Development', hint: 'Local environment' },
  ],
});

// Use clear labels
const confirmed = await confirm({
  message: 'This will delete all data. Are you sure?',
  active: 'Yes, delete everything',
  inactive: 'No, keep my data',
  initialValue: false, // Default to safe option
});
```

### 9. Color Accessibility

```typescript
import { contrastRatio, log, prism } from '@xec-sh/kit';

// Check contrast before using colors
function safeColor(fg: RGB, bg: RGB, text: string) {
  const ratio = contrastRatio(fg, bg);

  // WCAG AA standard: ratio >= 4.5
  if (ratio < 4.5) {
    log.warn('Color combination has poor contrast');
  }

  return prism.rgb(fg.r, fg.g, fg.b)(text);
}

// Respect NO_COLOR environment variable
if (process.env.NO_COLOR) {
  // Colors automatically disabled
}
```

### 10. Testing CLI Applications

```typescript
// Use custom streams for testing
import { Writable, Readable } from 'stream';
import { text } from '@xec-sh/kit';

// Mock output stream
const outputBuffer: string[] = [];
const mockOutput = new Writable({
  write(chunk, encoding, callback) {
    outputBuffer.push(chunk.toString());
    callback();
  },
});

// Mock input stream
const mockInput = new Readable({
  read() {
    this.push('test-value\n');
    this.push(null);
  },
});

// Test prompt
const result = await text({
  message: 'Enter value',
  input: mockInput,
  output: mockOutput,
});

// Verify
expect(result).toBe('test-value');
expect(outputBuffer.join('')).toContain('Enter value');
```

---

## API Reference

### Complete Type Definitions

```typescript
// Prompts
export function text(options: TextOptions): Promise<string | symbol>;
export function select<T>(options: SelectOptions<T>): Promise<T | symbol>;
export function multiselect<T>(options: MultiSelectOptions<T>): Promise<T[] | symbol>;
export function autocomplete<T>(options: AutocompleteOptions<T>): Promise<T | symbol>;
export function confirm(options: ConfirmOptions): Promise<boolean | symbol>;
export function password(options: PasswordOptions): Promise<string | symbol>;
export function selectKey<T extends string>(options: SelectKeyOptions<T>): Promise<T | symbol>;
export function groupMultiselect<T>(options: GroupMultiSelectOptions<T>): Promise<T[] | symbol>;
export function group<T>(prompts: PromptGroup<T>, options?: GroupOptions): Promise<T>;
export function path(options: PathOptions): Promise<string | symbol>;

// Components
export function spinner(options?: SpinnerOptions): SpinnerResult;
export function progressBar(options?: ProgressOptions): ProgressResult;
export function box(content: string, options?: BoxOptions): void;
export function box(options: { content: string; title?: string } & BoxOptions): void;
export function note(message: string, title?: string, options?: NoteOptions): void;
export function tasks(list: Task[], options?: CommonOptions): Promise<void>;
export function taskLog(options: TaskLogOptions): TaskLogger;

// Utilities
export function intro(title?: string, options?: CommonOptions): void;
export function outro(message?: string, options?: CommonOptions): void;
export function cancel(message?: string, options?: CommonOptions): void;

export const log: {
  message(message: string | string[], options?: LogMessageOptions): void;
  info(message: string, options?: LogMessageOptions): void;
  success(message: string, options?: LogMessageOptions): void;
  step(message: string, options?: LogMessageOptions): void;
  warn(message: string, options?: LogMessageOptions): void;
  warning(message: string, options?: LogMessageOptions): void;
  error(message: string, options?: LogMessageOptions): void;
};

export const stream: {
  message(iterable: Iterable<string> | AsyncIterable<string>, options?: LogMessageOptions): Promise<void>;
  info(iterable: Iterable<string> | AsyncIterable<string>): Promise<void>;
  success(iterable: Iterable<string> | AsyncIterable<string>): Promise<void>;
  step(iterable: Iterable<string> | AsyncIterable<string>): Promise<void>;
  warn(iterable: Iterable<string> | AsyncIterable<string>): Promise<void>;
  warning(iterable: Iterable<string> | AsyncIterable<string>): Promise<void>;
  error(iterable: Iterable<string> | AsyncIterable<string>): Promise<void>;
};

export function isCancel(value: unknown): value is symbol;
export function block(options?: BlockOptions): () => void;
export function getRows(output?: NodeJS.WritableStream): number;
export function getColumns(output?: NodeJS.WritableStream): number;

// Common utilities
export function symbol(state: State): string;
export function unicodeOr(unicode: string, fallback: string): string;
export const unicode: boolean;
export function isCI(): boolean;
export function isTTY(output: NodeJS.WritableStream): boolean;

// Settings
export const settings: ClackSettings;
export function updateSettings(newSettings: Partial<ClackSettings>): void;

// Prism
export const prism: PrismBuilderInstance;
export function createPrism(options?: PrismOptions): PrismBuilderInstance;
export function createPrismStderr(options?: PrismOptions): PrismBuilderInstance;

// Color utilities
export function stripAnsi(text: string): string;
export function stringLength(text: string): number;
export function hasAnsi(text: string): boolean;
export function parseColor(color: string): RGB | null;
export function getCssColor(name: string): string | undefined;
export function getCssColorNames(): string[];
export function isValidColor(color: string): boolean;

// Color space conversions
export function hexToRgb(hex: string): RGB;
export function rgbToHex(rgb: RGB): string;
export function rgbToHsl(rgb: RGB): HSL;
export function hslToRgb(hsl: HSL): RGB;
export function rgbToHsv(rgb: RGB): HSV;
export function hsvToRgb(hsv: HSV): RGB;
export function rgbToLab(rgb: RGB): LAB;
export function labToRgb(lab: LAB): RGB;
export function rgbToLch(rgb: RGB): LCH;
export function lchToRgb(lch: LCH): RGB;
export function mixRgb(rgb1: RGB, rgb2: RGB, ratio: number): RGB;
export function luminance(rgb: RGB): number;
export function contrastRatio(rgb1: RGB, rgb2: RGB): number;

// Terminal support
export function stdoutColor(): ColorSupport;
export function stderrColor(): ColorSupport;
export function isColorEnabled(): boolean;
export function getBestColorMethod(): 'none' | 'basic' | '256' | 'truecolor';
export enum ColorLevel {
  None = 0,
  Basic = 1,
  Ansi256 = 2,
  TrueColor = 3,
}
```

---

## Contributing

Contributions are welcome! Please read our [Contributing Guide](../../CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone repository
git clone https://github.com/xec-sh/xec.git
cd xec/packages/kit

# Install dependencies
yarn install

# Build
yarn build

# Run tests
yarn test

# Watch mode
yarn test:watch

# Type checking
yarn typecheck
```

### Testing

```bash
# Run all tests
yarn test

# Run with coverage
yarn test --coverage

# Visual testing (TUI)
yarn test:tui
```

### Code Quality

```bash
# Format code
yarn prettier:write

# Check formatting
yarn prettier:check
```

---

## License

MIT © [Xec Contributors](https://github.com/xec-sh/xec/graphs/contributors)

---

## Related Packages

- [@xec-sh/core](../core) - Core execution engine for command execution
- [@xec-sh/cli](../../apps/xec) - Command-line interface built with @xec-sh/kit
- [@xec-sh/loader](../loader) - Script and module loader

---

## Acknowledgments

@xec-sh/kit is inspired by and builds upon ideas from:

- [@clack/prompts](https://github.com/natemoo-re/clack) - Interactive CLI prompts
- [chalk](https://github.com/chalk/chalk) - Terminal string styling
- [ora](https://github.com/sindresorhus/ora) - Elegant terminal spinners

---

## Support

- 📖 [Documentation](https://xec.sh/docs/kit)
- 💬 [Discussions](https://github.com/xec-sh/xec/discussions)
- 🐛 [Issue Tracker](https://github.com/xec-sh/xec/issues)
- 📧 [Contact](mailto:team@xec.sh)

---

**Last Updated**: 2025-10-02  
**Version**: 0.8.1  
**Status**: Production Ready ✅
