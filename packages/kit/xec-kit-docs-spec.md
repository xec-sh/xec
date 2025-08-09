# @xec-sh/kit Documentation Specification

## Executive Summary

This document provides a comprehensive specification for creating documentation for the `@xec-sh/kit` library in the `docs` project. The documentation should be clear, practical, and based on the actual implementation in `packages/kit/src`, with accurate, working examples that developers can use immediately.

## Documentation Goals

1. **Accessibility**: Make the library approachable for beginners while providing depth for advanced users
2. **Accuracy**: All examples must work with the current implementation
3. **Completeness**: Cover all exported components, utilities, and features
4. **Practicality**: Focus on real-world use cases and common patterns
5. **Progressive Disclosure**: Start simple, reveal complexity gradually

## Documentation Structure

```
docs/
├── kit/
│   ├── getting-started/
│   │   ├── index.md                 # Quick start guide
│   │   ├── installation.md          # Installation & setup
│   │   ├── first-prompt.md          # Your first prompt
│   │   ├── basic-concepts.md        # Core concepts
│   │   └── typescript.md            # TypeScript integration
│   ├── components/
│   │   ├── primitives/
│   │   │   ├── text.md              # Text input
│   │   │   ├── confirm.md           # Confirmation
│   │   │   ├── select.md            # Single selection
│   │   │   ├── multiselect.md       # Multiple selection
│   │   │   ├── number.md            # Number input
│   │   │   └── password.md          # Password input
│   │   ├── advanced/
│   │   │   ├── autocomplete.md      # Autocomplete with fuzzy search
│   │   │   ├── table.md             # Data tables
│   │   │   ├── form.md              # Multi-field forms
│   │   │   ├── file-picker.md       # File system navigation
│   │   │   └── command-palette.md   # Command palette
│   │   ├── feedback/
│   │   │   ├── spinner.md           # Loading spinners
│   │   │   ├── progress.md          # Progress bars
│   │   │   └── task-list.md         # Task execution
│   │   └── layout/
│   │       ├── group.md             # Grouped prompts
│   │       ├── panel.md             # Panel display
│   │       ├── wizard.md            # Multi-step wizards
│   │       └── columns.md           # Column layouts
│   ├── features/
│   │   ├── reactive-prompts.md      # Reactive system & state management
│   │   ├── themes.md                # Theme customization
│   │   ├── validation.md            # Input validation
│   │   ├── keyboard-shortcuts.md    # Keyboard navigation
│   │   ├── mouse-support.md         # Mouse interactions
│   │   ├── contextual-help.md       # Help system
│   │   ├── performance.md           # Performance optimization
│   │   └── accessibility.md         # Accessibility features
│   ├── advanced/
│   │   ├── plugins.md               # Plugin development
│   │   ├── custom-components.md     # Creating custom prompts
│   │   ├── stream-handling.md       # Shared streams & lifecycle
│   │   ├── testing.md               # Testing strategies
│   │   ├── debugging.md             # Debug tools
│   │   └── migration-v2.md          # v2.0 migration guide
│   ├── recipes/
│   │   ├── cli-tools.md             # Building CLI tools
│   │   ├── forms-wizards.md         # Complex forms & wizards
│   │   ├── data-collection.md       # Data collection patterns
│   │   ├── configuration.md         # Configuration wizards
│   │   ├── deployment.md            # Deployment scripts
│   │   └── integration.md           # Integration patterns
│   ├── api/
│   │   ├── index.md                 # API overview
│   │   ├── kit-object.md            # Main kit object
│   │   ├── types.md                 # TypeScript types
│   │   └── exports.md               # All exports reference
│   └── examples/
│       ├── todo-cli.md              # Complete TODO app
│       ├── deploy-script.md         # Deployment script
│       ├── config-generator.md      # Config generator
│       └── interactive-repl.md      # Interactive REPL
```

## Phase 1: Core Documentation (Week 1)

### Day 1-2: Getting Started Section

#### 1.1 Installation Guide (`getting-started/installation.md`)

```markdown
# Installation

## Prerequisites
- Node.js 14.0.0 or higher
- npm, yarn, or pnpm

## Installation Methods

### npm
\`\`\`bash
npm install @xec-sh/kit
\`\`\`

### yarn
\`\`\`bash
yarn add @xec-sh/kit
\`\`\`

### pnpm
\`\`\`bash
pnpm add @xec-sh/kit
\`\`\`

## Verify Installation

\`\`\`javascript
import kit from '@xec-sh/kit';

const name = await kit.text('What is your name?');
console.log(\`Hello, \${name}!\`);
\`\`\`

## TypeScript Setup

Kit includes TypeScript definitions. No additional setup required!

\`\`\`typescript
import kit from '@xec-sh/kit';
import type { TextOptions, SelectOptions } from '@xec-sh/kit';
\`\`\`

## ESM vs CommonJS

Kit supports both module systems:

### ESM (Recommended)
\`\`\`javascript
import kit from '@xec-sh/kit';
\`\`\`

### CommonJS
\`\`\`javascript
const kit = require('@xec-sh/kit').default;
\`\`\`
```

#### 1.2 Quick Start Guide (`getting-started/index.md`)

```markdown
# Quick Start

@xec-sh/kit is a modern CLI interaction library that makes building beautiful command-line interfaces simple and enjoyable.

## Your First Prompt

\`\`\`typescript
import kit from '@xec-sh/kit';

// It's this simple!
const name = await kit.text('What is your name?');
console.log(\`Hello, \${name}!\`);
\`\`\`

## Common Use Cases

### Collect User Information
\`\`\`typescript
const userInfo = {
  name: await kit.text('Name?'),
  age: await kit.number('Age?'),
  email: await kit.text('Email?', {
    validate: (v) => v.includes('@') ? undefined : 'Invalid email'
  }),
  newsletter: await kit.confirm('Subscribe to newsletter?')
};
\`\`\`

### Choose Options
\`\`\`typescript
const color = await kit.select('Favorite color?', [
  'red', 'blue', 'green', 'yellow'
]);

const features = await kit.multiselect('Select features:', [
  'TypeScript', 'ESLint', 'Prettier', 'Jest', 'Husky'
]);
\`\`\`

### Show Progress
\`\`\`typescript
const spinner = kit.spinner('Installing dependencies...');
await installDeps();
spinner.success('Dependencies installed!');
\`\`\`

## Next Steps
- [Learn basic concepts](./basic-concepts.md)
- [Explore components](../components/primitives/text.md)
- [See examples](../examples/todo-cli.md)
```

### Day 3-4: Primitive Components

#### 1.3 Text Component (`components/primitives/text.md`)

```markdown
# Text Input

The text prompt collects single-line text input from users.

## Basic Usage

\`\`\`typescript
import kit from '@xec-sh/kit';

const name = await kit.text('What is your name?');
\`\`\`

## Options

### Placeholder
\`\`\`typescript
const name = await kit.text('Name?', {
  placeholder: 'John Doe'
});
\`\`\`

### Default Value
\`\`\`typescript
const name = await kit.text('Name?', {
  defaultValue: process.env.USER
});
\`\`\`

### Validation
\`\`\`typescript
const email = await kit.text('Email?', {
  validate: (value) => {
    if (!value) return 'Email is required';
    if (!value.includes('@')) return 'Invalid email format';
    return undefined; // Valid
  }
});
\`\`\`

### Async Validation
\`\`\`typescript
const username = await kit.text('Username?', {
  validate: async (value) => {
    if (await userExists(value)) {
      return 'Username already taken';
    }
  }
});
\`\`\`

### Transform Input
\`\`\`typescript
const name = await kit.text('Name?', {
  transform: (value) => value.trim().toLowerCase()
});
\`\`\`

### Format Display
\`\`\`typescript
const name = await kit.text('Name?', {
  format: (value) => value.toUpperCase() // Display in uppercase
});
\`\`\`

## Advanced Features

### Multi-line Input
\`\`\`typescript
const description = await kit.text('Description?', {
  multiline: true,
  lines: 5
});
\`\`\`

### Character Limits
\`\`\`typescript
const tweet = await kit.text('Tweet?', {
  maxLength: 280,
  showCharacterCount: true
});
\`\`\`

### Pattern Matching
\`\`\`typescript
const phone = await kit.text('Phone?', {
  pattern: /^\\d{3}-\\d{3}-\\d{4}$/,
  patternMessage: 'Format: 123-456-7890'
});
\`\`\`

## Keyboard Shortcuts
- **Enter**: Submit input
- **Ctrl+C**: Cancel
- **Ctrl+U**: Clear input
- **Ctrl+A**: Move to start
- **Ctrl+E**: Move to end
- **Ctrl+K**: Delete to end
- **Ctrl+W**: Delete word

## API Reference

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| message | string | Required | The prompt message |
| placeholder | string | '' | Placeholder text |
| defaultValue | string | '' | Default value |
| validate | function | - | Validation function |
| transform | function | - | Transform final value |
| format | function | - | Format display value |
| multiline | boolean | false | Enable multi-line |
| maxLength | number | - | Maximum length |
| minLength | number | - | Minimum length |
| pattern | RegExp | - | Pattern to match |

## Examples

### Password Strength Indicator
\`\`\`typescript
const password = await kit.text('Password?', {
  mask: '*',
  validate: (value) => {
    if (value.length < 8) return 'At least 8 characters';
    if (!/[A-Z]/.test(value)) return 'Include uppercase';
    if (!/[0-9]/.test(value)) return 'Include number';
  }
});
\`\`\`

### URL Input
\`\`\`typescript
const url = await kit.text('Website URL?', {
  placeholder: 'https://example.com',
  validate: (value) => {
    try {
      new URL(value);
      return undefined;
    } catch {
      return 'Invalid URL';
    }
  }
});
\`\`\`

### Sanitized Input
\`\`\`typescript
const filename = await kit.text('Filename?', {
  transform: (value) => value
    .replace(/[^a-z0-9.-]/gi, '_')
    .toLowerCase()
});
\`\`\`
```

### Day 5-6: Advanced Components

#### 1.4 Form Component (`components/advanced/form.md`)

```markdown
# Forms

Multi-field forms with validation and field dependencies.

## Basic Usage

\`\`\`typescript
import kit from '@xec-sh/kit';

const userInfo = await kit.form({
  message: 'User Registration',
  fields: [
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      required: true
    },
    {
      name: 'email',
      label: 'Email',
      type: 'text',
      validate: (value) => {
        if (!value.includes('@')) return 'Invalid email';
      }
    },
    {
      name: 'age',
      label: 'Age',
      type: 'number',
      min: 18,
      max: 120
    },
    {
      name: 'newsletter',
      label: 'Subscribe to newsletter?',
      type: 'confirm',
      defaultValue: true
    }
  ]
});
\`\`\`

## Field Types

### Text Field
\`\`\`typescript
{
  type: 'text',
  name: 'username',
  label: 'Username',
  placeholder: 'john_doe',
  minLength: 3,
  maxLength: 20,
  pattern: /^[a-z0-9_]+$/
}
\`\`\`

### Number Field
\`\`\`typescript
{
  type: 'number',
  name: 'age',
  label: 'Age',
  min: 0,
  max: 120,
  step: 1
}
\`\`\`

### Password Field
\`\`\`typescript
{
  type: 'password',
  name: 'password',
  label: 'Password',
  mask: '*',
  showStrength: true
}
\`\`\`

### Select Field
\`\`\`typescript
{
  type: 'select',
  name: 'country',
  label: 'Country',
  options: ['USA', 'Canada', 'Mexico']
}
\`\`\`

### MultiSelect Field
\`\`\`typescript
{
  type: 'multiselect',
  name: 'languages',
  label: 'Languages',
  options: ['English', 'Spanish', 'French'],
  min: 1,
  max: 3
}
\`\`\`

### Confirm Field
\`\`\`typescript
{
  type: 'confirm',
  name: 'agree',
  label: 'I agree to the terms',
  required: true
}
\`\`\`

## Field Dependencies

### Conditional Fields
\`\`\`typescript
const form = await kit.form({
  fields: [
    {
      name: 'hasPhone',
      type: 'confirm',
      label: 'Do you have a phone?'
    },
    {
      name: 'phoneNumber',
      type: 'text',
      label: 'Phone Number',
      show: (formData) => formData.hasPhone === true,
      validate: (value, formData) => {
        if (formData.hasPhone && !value) {
          return 'Phone number is required';
        }
      }
    }
  ]
});
\`\`\`

### Dynamic Options
\`\`\`typescript
{
  name: 'state',
  type: 'select',
  label: 'State',
  options: (formData) => {
    if (formData.country === 'USA') {
      return ['California', 'Texas', 'New York'];
    }
    if (formData.country === 'Canada') {
      return ['Ontario', 'Quebec', 'British Columbia'];
    }
    return [];
  }
}
\`\`\`

## Multi-Step Forms

\`\`\`typescript
const result = await kit.form({
  message: 'Setup Wizard',
  steps: [
    {
      name: 'personal',
      title: 'Personal Information',
      fields: [
        { name: 'firstName', type: 'text', label: 'First Name' },
        { name: 'lastName', type: 'text', label: 'Last Name' }
      ]
    },
    {
      name: 'contact',
      title: 'Contact Details',
      fields: [
        { name: 'email', type: 'text', label: 'Email' },
        { name: 'phone', type: 'text', label: 'Phone' }
      ]
    },
    {
      name: 'preferences',
      title: 'Preferences',
      fields: [
        { name: 'theme', type: 'select', label: 'Theme', options: ['light', 'dark'] },
        { name: 'notifications', type: 'confirm', label: 'Enable notifications?' }
      ]
    }
  ]
});
\`\`\`

## Validation

### Cross-Field Validation
\`\`\`typescript
{
  name: 'confirmPassword',
  type: 'password',
  label: 'Confirm Password',
  validate: (value, formData) => {
    if (value !== formData.password) {
      return 'Passwords do not match';
    }
  }
}
\`\`\`

### Async Validation
\`\`\`typescript
{
  name: 'email',
  type: 'text',
  label: 'Email',
  validate: async (value) => {
    const exists = await checkEmailExists(value);
    if (exists) return 'Email already registered';
  }
}
\`\`\`

## Keyboard Navigation
- **Tab / Down**: Next field
- **Shift+Tab / Up**: Previous field
- **Enter**: Submit form (from last field)
- **Ctrl+Enter**: Submit form (from any field)
- **Escape**: Cancel form

## Real-World Example

### User Registration Form
\`\`\`typescript
const registration = await kit.form({
  message: 'Create Account',
  submitLabel: 'Register',
  cancelLabel: 'Cancel',
  fields: [
    {
      name: 'username',
      type: 'text',
      label: 'Username',
      required: true,
      minLength: 3,
      maxLength: 20,
      pattern: /^[a-zA-Z0-9_]+$/,
      validate: async (value) => {
        if (await userExists(value)) {
          return 'Username already taken';
        }
      }
    },
    {
      name: 'email',
      type: 'text',
      label: 'Email',
      required: true,
      validate: (value) => {
        if (!value.includes('@')) return 'Invalid email';
      }
    },
    {
      name: 'password',
      type: 'password',
      label: 'Password',
      required: true,
      showStrength: true,
      minLength: 8,
      validate: (value) => {
        if (!/[A-Z]/.test(value)) return 'Include uppercase letter';
        if (!/[0-9]/.test(value)) return 'Include number';
        if (!/[!@#$%]/.test(value)) return 'Include special character';
      }
    },
    {
      name: 'confirmPassword',
      type: 'password',
      label: 'Confirm Password',
      required: true,
      validate: (value, formData) => {
        if (value !== formData.password) {
          return 'Passwords do not match';
        }
      }
    },
    {
      name: 'age',
      type: 'number',
      label: 'Age',
      required: true,
      min: 18,
      max: 120
    },
    {
      name: 'country',
      type: 'select',
      label: 'Country',
      required: true,
      options: await getCountries()
    },
    {
      name: 'terms',
      type: 'confirm',
      label: 'I agree to the Terms of Service',
      required: true,
      validate: (value) => {
        if (!value) return 'You must agree to continue';
      }
    },
    {
      name: 'newsletter',
      type: 'confirm',
      label: 'Subscribe to newsletter?',
      defaultValue: true
    }
  ],
  validateOnBlur: true
});
\`\`\`
```

## Phase 2: Feature Documentation (Week 2)

### Day 7-8: Reactive System

#### 2.1 Reactive Prompts (`features/reactive-prompts.md`)

```markdown
# Reactive Prompts

Build dynamic, state-driven prompts that update in real-time.

## Introduction

The reactive system in Kit allows you to create prompts that respond to state changes, enabling complex multi-step forms, dependent fields, and real-time validation.

## Basic Reactive Prompt

\`\`\`typescript
import { reactive } from '@xec-sh/kit';

const form = await reactive({
  initialValues: {
    name: '',
    age: 0,
    showDetails: false
  },
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
      value: state.get('age')
    },
    {
      id: 'showDetails',
      type: 'confirm',
      message: 'Show additional details?',
      value: state.get('showDetails')
    },
    // Conditional prompt
    state.get('showDetails') && {
      id: 'details',
      type: 'text',
      message: 'Additional details:',
      multiline: true
    }
  ].filter(Boolean)
});
\`\`\`

## State Management

### Reactive State
\`\`\`typescript
import { ReactiveState } from '@xec-sh/kit';

const state = new ReactiveState({
  count: 0,
  items: [],
  user: null
});

// Subscribe to changes
state.subscribe((newState, oldState) => {
  console.log('State changed:', newState);
});

// Update state
state.set('count', 5);
state.update('count', (prev) => prev + 1);
\`\`\`

### Computed Values
\`\`\`typescript
import { computed } from '@xec-sh/kit';

const form = await reactive({
  initialValues: {
    price: 100,
    quantity: 1,
    taxRate: 0.08
  },
  computed: {
    subtotal: computed(
      ['price', 'quantity'],
      (price, quantity) => price * quantity
    ),
    tax: computed(
      ['subtotal', 'taxRate'],
      (subtotal, taxRate) => subtotal * taxRate
    ),
    total: computed(
      ['subtotal', 'tax'],
      (subtotal, tax) => subtotal + tax
    )
  },
  prompts: (state) => [
    {
      id: 'price',
      type: 'number',
      message: 'Price per item?',
      value: state.get('price')
    },
    {
      id: 'quantity',
      type: 'number',
      message: 'Quantity?',
      value: state.get('quantity')
    },
    {
      id: 'display',
      type: 'text',
      message: \`Total: \$\${state.get('total').toFixed(2)}\`,
      readOnly: true
    }
  ]
});
\`\`\`

### Watchers
\`\`\`typescript
import { watch } from '@xec-sh/kit';

const form = await reactive({
  initialValues: { city: '', weather: null },
  watchers: {
    city: watch(async (city) => {
      if (city) {
        const weather = await fetchWeather(city);
        return { weather };
      }
    })
  },
  prompts: (state) => [
    {
      id: 'city',
      type: 'text',
      message: 'City name?',
      value: state.get('city')
    },
    state.get('weather') && {
      id: 'weatherDisplay',
      type: 'text',
      message: \`Weather: \${state.get('weather').description}\`,
      readOnly: true
    }
  ].filter(Boolean)
});
\`\`\`

## Advanced Patterns

### Form with Real-Time Validation
\`\`\`typescript
import { ReactiveValidator, validators } from '@xec-sh/kit';

const validator = new ReactiveValidator({
  rules: {
    email: [
      validators.required('Email is required'),
      validators.email('Invalid email format')
    ],
    password: [
      validators.required('Password is required'),
      validators.minLength(8, 'At least 8 characters'),
      validators.pattern(/[A-Z]/, 'Include uppercase letter'),
      validators.pattern(/[0-9]/, 'Include number')
    ],
    confirmPassword: [
      validators.required('Please confirm password'),
      validators.matches('password', 'Passwords must match')
    ]
  }
});

const form = await reactive({
  initialValues: {
    email: '',
    password: '',
    confirmPassword: ''
  },
  validator,
  prompts: (state) => [
    {
      id: 'email',
      type: 'text',
      message: 'Email?',
      value: state.get('email'),
      error: validator.getError('email')
    },
    {
      id: 'password',
      type: 'password',
      message: 'Password?',
      value: state.get('password'),
      error: validator.getError('password'),
      hint: validator.getStrength('password')
    },
    {
      id: 'confirmPassword',
      type: 'password',
      message: 'Confirm Password?',
      value: state.get('confirmPassword'),
      error: validator.getError('confirmPassword')
    }
  ]
});
\`\`\`

### Dynamic Form Builder
\`\`\`typescript
const formBuilder = await reactive({
  initialValues: {
    fields: [],
    currentField: null
  },
  prompts: (state) => {
    const prompts = [];
    
    // Add field button
    prompts.push({
      id: 'addField',
      type: 'select',
      message: 'Add field:',
      options: ['Text', 'Number', 'Select', 'None'],
      value: state.get('currentField')
    });
    
    // If adding a field, show configuration
    if (state.get('currentField') && state.get('currentField') !== 'None') {
      prompts.push({
        id: 'fieldName',
        type: 'text',
        message: 'Field name:',
        validate: (value) => {
          if (!value) return 'Name is required';
          if (state.get('fields').some(f => f.name === value)) {
            return 'Field name already exists';
          }
        }
      });
      
      prompts.push({
        id: 'fieldLabel',
        type: 'text',
        message: 'Field label:'
      });
      
      if (state.get('currentField') === 'Select') {
        prompts.push({
          id: 'fieldOptions',
          type: 'text',
          message: 'Options (comma-separated):'
        });
      }
    }
    
    // Show current fields
    state.get('fields').forEach(field => {
      prompts.push({
        id: field.name,
        type: field.type.toLowerCase(),
        message: field.label,
        options: field.options
      });
    });
    
    return prompts;
  }
});
\`\`\`

### Wizard with Progress Tracking
\`\`\`typescript
const wizard = await reactive({
  initialValues: {
    step: 0,
    steps: ['personal', 'contact', 'preferences'],
    data: {}
  },
  computed: {
    progress: computed(
      ['step', 'steps'],
      (step, steps) => ((step + 1) / steps.length) * 100
    ),
    canGoBack: computed(['step'], (step) => step > 0),
    canGoForward: computed(
      ['step', 'steps'],
      (step, steps) => step < steps.length - 1
    )
  },
  prompts: (state) => {
    const step = state.get('steps')[state.get('step')];
    const prompts = [];
    
    // Progress bar
    prompts.push({
      id: 'progress',
      type: 'text',
      message: \`Progress: \${state.get('progress')}%\`,
      readOnly: true
    });
    
    // Step-specific prompts
    switch (step) {
      case 'personal':
        prompts.push(
          { id: 'firstName', type: 'text', message: 'First name?' },
          { id: 'lastName', type: 'text', message: 'Last name?' }
        );
        break;
      case 'contact':
        prompts.push(
          { id: 'email', type: 'text', message: 'Email?' },
          { id: 'phone', type: 'text', message: 'Phone?' }
        );
        break;
      case 'preferences':
        prompts.push(
          { id: 'theme', type: 'select', message: 'Theme?', options: ['light', 'dark'] },
          { id: 'newsletter', type: 'confirm', message: 'Subscribe?' }
        );
        break;
    }
    
    // Navigation
    prompts.push({
      id: 'navigation',
      type: 'select',
      message: 'Navigate:',
      options: [
        state.get('canGoBack') && { value: 'back', label: '← Back' },
        state.get('canGoForward') && { value: 'next', label: 'Next →' },
        { value: 'finish', label: '✓ Finish' }
      ].filter(Boolean)
    });
    
    return prompts;
  }
});
\`\`\`

## Performance Optimization

### Memoization
\`\`\`typescript
import { memo } from '@xec-sh/kit';

const expensiveComputation = memo((data) => {
  // This will only re-compute when data changes
  return processLargeDataset(data);
});

const form = await reactive({
  initialValues: { data: largeDataset },
  computed: {
    processed: computed(['data'], expensiveComputation)
  }
});
\`\`\`

### Async Computed Values
\`\`\`typescript
import { asyncComputed } from '@xec-sh/kit';

const form = await reactive({
  initialValues: { username: '' },
  computed: {
    availability: asyncComputed(
      ['username'],
      async (username) => {
        if (!username) return null;
        const available = await checkUsernameAvailability(username);
        return available ? '✓ Available' : '✗ Taken';
      }
    )
  }
});
\`\`\`

## Best Practices

1. **Keep State Minimal**: Only store what you need
2. **Use Computed Values**: Derive values instead of storing them
3. **Batch Updates**: Update multiple values at once when possible
4. **Handle Loading States**: Show spinners during async operations
5. **Validate Early**: Provide immediate feedback
6. **Clean Up**: Unsubscribe from watchers when done

## Common Patterns

### Dependent Dropdowns
\`\`\`typescript
const form = await reactive({
  initialValues: {
    country: '',
    state: '',
    city: ''
  },
  watchers: {
    country: watch(async (country) => {
      const states = await fetchStates(country);
      return { states, state: '', city: '' };
    }),
    state: watch(async (state, { country }) => {
      const cities = await fetchCities(country, state);
      return { cities, city: '' };
    })
  }
});
\`\`\`

### Auto-Save Form
\`\`\`typescript
const form = await reactive({
  initialValues: loadFromLocalStorage() || defaultValues,
  watchers: {
    '*': watch(
      debounce((state) => {
        saveToLocalStorage(state);
        showSavedIndicator();
      }, 1000)
    )
  }
});
\`\`\`
```

### Day 9-10: Plugin System

#### 2.2 Plugin Development (`advanced/plugins.md`)

```markdown
# Plugin Development

Extend Kit with custom components, themes, and functionality.

## Creating a Plugin

### Basic Plugin Structure
\`\`\`typescript
import type { KitPlugin } from '@xec-sh/kit';

export const myPlugin: KitPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'My custom plugin',
  
  // Register custom components
  components: {
    customPrompt: {
      factory: (options) => new CustomPrompt(options),
      docs: {
        description: 'A custom prompt component',
        examples: [/* ... */]
      }
    }
  },
  
  // Extend theme
  theme: {
    colors: {
      brand: '#FF6B6B'
    },
    symbols: {
      custom: '◆'
    }
  },
  
  // Add methods to kit object
  enhance: (kit) => {
    kit.custom = {
      prompt: async (options) => {
        return await kit.customPrompt(options);
      }
    };
  },
  
  // Lifecycle hooks
  onRegister: async (context) => {
    console.log('Plugin registered:', context);
  },
  
  onUnregister: async () => {
    console.log('Plugin unregistered');
  }
};
\`\`\`

### Register Plugin
\`\`\`typescript
import kit from '@xec-sh/kit';
import { myPlugin } from './my-plugin';

kit.use(myPlugin);
\`\`\`

## Real Example: Emoji Plugin

\`\`\`typescript
import type { KitPlugin } from '@xec-sh/kit';

const emojiMap = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  question: '❓',
  heart: '❤️',
  star: '⭐',
  fire: '🔥',
  rocket: '🚀',
  party: '🎉'
};

export const emojiPlugin: KitPlugin = {
  name: 'emoji',
  version: '1.0.0',
  description: 'Adds emoji support to Kit',
  
  theme: {
    symbols: {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      bullet: '•',
      arrow: '→',
      checkbox: {
        checked: '☑️',
        unchecked: '☐',
        cursor: '▶'
      }
    }
  },
  
  enhance: (kit) => {
    // Add emoji method
    kit.emoji = (name: string) => {
      return emojiMap[name] || name;
    };
    
    // Add emoji select prompt
    kit.emojiSelect = async (message: string) => {
      const emojis = Object.entries(emojiMap).map(([name, emoji]) => ({
        value: emoji,
        label: \`\${emoji} \${name}\`
      }));
      
      return await kit.select(message, emojis);
    };
    
    // Enhanced log with emojis
    kit.log.success = (message: string) => {
      console.log(\`✅ \${message}\`);
    };
    
    kit.log.error = (message: string) => {
      console.log(\`❌ \${message}\`);
    };
    
    kit.log.warning = (message: string) => {
      console.log(\`⚠️ \${message}\`);
    };
  }
};

// Usage
kit.use(emojiPlugin);

const emoji = await kit.emojiSelect('Choose an emoji:');
kit.log.success('Plugin loaded successfully!');
\`\`\`

## Custom Component Plugin

\`\`\`typescript
import { Prompt } from '@xec-sh/kit';
import type { KitPlugin, Key } from '@xec-sh/kit';

// Custom rating component
class RatingPrompt extends Prompt<number> {
  private stars = 5;
  private current = 0;
  
  render(): string {
    const filled = '★'.repeat(this.current);
    const empty = '☆'.repeat(this.stars - this.current);
    return \`\${this.config.message}\\n\${filled}\${empty} (\${this.current}/\${this.stars})\`;
  }
  
  async handleInput(key: Key): Promise<void> {
    if (key.name === 'left' && this.current > 0) {
      this.current--;
      this.renderer.render(this.render());
    } else if (key.name === 'right' && this.current < this.stars) {
      this.current++;
      this.renderer.render(this.render());
    } else if (key.name === 'return') {
      this.state.setState({ value: this.current, status: 'completed' });
    }
  }
}

export const ratingPlugin: KitPlugin = {
  name: 'rating',
  version: '1.0.0',
  
  components: {
    rating: {
      factory: (options) => new RatingPrompt(options),
      docs: {
        description: 'Star rating input',
        examples: [
          {
            code: "await kit.rating('Rate this experience:')",
            description: 'Basic rating prompt'
          }
        ]
      }
    }
  },
  
  enhance: (kit) => {
    kit.rating = async (message: string, options = {}) => {
      const prompt = new RatingPrompt({ message, ...options });
      return await prompt.prompt();
    };
  }
};
\`\`\`

## Theme Plugin

\`\`\`typescript
export const darkThemePlugin: KitPlugin = {
  name: 'dark-theme',
  version: '1.0.0',
  
  theme: {
    colors: {
      primary: '#61AFEF',
      secondary: '#98C379',
      success: '#98C379',
      warning: '#E5C07B',
      error: '#E06C75',
      info: '#61AFEF',
      muted: '#5C6370'
    },
    formatters: {
      primary: (text) => chalk.hex('#61AFEF')(text),
      secondary: (text) => chalk.hex('#98C379')(text),
      success: (text) => chalk.hex('#98C379')(text),
      warning: (text) => chalk.hex('#E5C07B')(text),
      error: (text) => chalk.hex('#E06C75')(text),
      muted: (text) => chalk.hex('#5C6370')(text)
    }
  }
};
\`\`\`

## Validation Plugin

\`\`\`typescript
export const validationPlugin: KitPlugin = {
  name: 'validation',
  version: '1.0.0',
  
  enhance: (kit) => {
    // Add validation helpers
    kit.validators = {
      email: (value: string) => {
        const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
        return regex.test(value) ? undefined : 'Invalid email';
      },
      
      url: (value: string) => {
        try {
          new URL(value);
          return undefined;
        } catch {
          return 'Invalid URL';
        }
      },
      
      phone: (value: string) => {
        const regex = /^\\+?[1-9]\\d{1,14}$/;
        return regex.test(value) ? undefined : 'Invalid phone number';
      },
      
      creditCard: (value: string) => {
        const regex = /^[0-9]{13,19}$/;
        const cleaned = value.replace(/\\s/g, '');
        return regex.test(cleaned) ? undefined : 'Invalid credit card';
      },
      
      postalCode: (country: string) => (value: string) => {
        const patterns = {
          US: /^\\d{5}(-\\d{4})?$/,
          UK: /^[A-Z]{1,2}\\d{1,2}[A-Z]?\\s?\\d[A-Z]{2}$/i,
          CA: /^[A-Z]\\d[A-Z]\\s?\\d[A-Z]\\d$/i
        };
        const pattern = patterns[country];
        return pattern && pattern.test(value) 
          ? undefined 
          : \`Invalid \${country} postal code\`;
      }
    };
    
    // Add validated input methods
    kit.email = async (message: string, options = {}) => {
      return await kit.text(message, {
        ...options,
        validate: kit.validators.email
      });
    };
    
    kit.url = async (message: string, options = {}) => {
      return await kit.text(message, {
        ...options,
        validate: kit.validators.url
      });
    };
  }
};
\`\`\`

## Integration Plugin Example

\`\`\`typescript
// Git integration plugin
export const gitPlugin: KitPlugin = {
  name: 'git',
  version: '1.0.0',
  
  enhance: (kit) => {
    kit.git = {
      // Conventional commit helper
      commit: async () => {
        const type = await kit.select('Commit type:', [
          { value: 'feat', label: 'feat: A new feature' },
          { value: 'fix', label: 'fix: A bug fix' },
          { value: 'docs', label: 'docs: Documentation' },
          { value: 'style', label: 'style: Code style' },
          { value: 'refactor', label: 'refactor: Refactoring' },
          { value: 'test', label: 'test: Tests' },
          { value: 'chore', label: 'chore: Maintenance' }
        ]);
        
        const scope = await kit.text('Scope (optional):', {
          placeholder: 'component'
        });
        
        const subject = await kit.text('Short description:', {
          validate: (v) => {
            if (!v) return 'Required';
            if (v.length > 50) return 'Keep under 50 characters';
          }
        });
        
        const body = await kit.text('Long description (optional):', {
          multiline: true
        });
        
        const breaking = await kit.confirm('Breaking change?');
        
        let message = \`\${type}\`;
        if (scope) message += \`(\${scope})\`;
        message += \`: \${subject}\`;
        if (body) message += \`\\n\\n\${body}\`;
        if (breaking) message += \`\\n\\nBREAKING CHANGE:\`;
        
        return message;
      },
      
      // Branch selector
      branch: async () => {
        const branches = await getBranches();
        return await kit.select('Select branch:', branches);
      },
      
      // Stash manager
      stash: async () => {
        const action = await kit.select('Stash action:', [
          'save', 'pop', 'list', 'apply', 'drop'
        ]);
        
        switch (action) {
          case 'save':
            const message = await kit.text('Stash message:');
            return { action, message };
          case 'pop':
          case 'apply':
          case 'drop':
            const stashes = await getStashes();
            const stash = await kit.select('Select stash:', stashes);
            return { action, stash };
          case 'list':
            return { action };
        }
      }
    };
  }
};
\`\`\`

## Plugin Registry

\`\`\`typescript
import { PluginRegistry } from '@xec-sh/kit';

// Get registry instance
const registry = new PluginRegistry();

// Register plugin
await registry.register(myPlugin);

// List registered plugins
const plugins = registry.list();
console.log('Registered plugins:', plugins);

// Get plugin info
const info = registry.get('my-plugin');
console.log('Plugin info:', info);

// Unregister plugin
await registry.unregister('my-plugin');

// Check if plugin is registered
if (registry.has('my-plugin')) {
  console.log('Plugin is registered');
}

// Enable/disable plugins
registry.enable('my-plugin');
registry.disable('my-plugin');

// Plugin events
registry.on('register', (plugin) => {
  console.log('Plugin registered:', plugin.name);
});

registry.on('unregister', (plugin) => {
  console.log('Plugin unregistered:', plugin.name);
});
\`\`\`

## Best Practices

1. **Namespace Your Plugin**: Use unique names to avoid conflicts
2. **Version Your Plugin**: Follow semantic versioning
3. **Document Your API**: Provide clear documentation and examples
4. **Handle Errors Gracefully**: Don't break the host application
5. **Clean Up Resources**: Implement proper cleanup in onUnregister
6. **Test Thoroughly**: Test with different Kit versions
7. **Provide TypeScript Types**: Include type definitions

## Publishing Plugins

### Package Structure
\`\`\`
my-kit-plugin/
├── src/
│   └── index.ts
├── dist/
│   ├── index.js
│   └── index.d.ts
├── package.json
├── README.md
└── LICENSE
\`\`\`

### Package.json
\`\`\`json
{
  "name": "@myorg/kit-plugin-example",
  "version": "1.0.0",
  "description": "Example Kit plugin",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@xec-sh/kit": "^2.0.0"
  },
  "keywords": ["kit", "kit-plugin", "cli"],
  "license": "MIT"
}
\`\`\`

### Usage
\`\`\`typescript
import kit from '@xec-sh/kit';
import { examplePlugin } from '@myorg/kit-plugin-example';

kit.use(examplePlugin);
\`\`\`
```

## Phase 3: Recipe Documentation (Week 3)

### Day 11-12: Real-World Examples

#### 3.1 CLI Tools Recipe (`recipes/cli-tools.md`)

```markdown
# Building CLI Tools with Kit

Learn how to build professional command-line tools using Kit.

## Basic CLI Structure

### Single Command CLI
\`\`\`typescript
#!/usr/bin/env node
import kit from '@xec-sh/kit';

async function main() {
  try {
    const action = await kit.select('What would you like to do?', [
      'Create new project',
      'Run tests',
      'Deploy',
      'Exit'
    ]);
    
    switch (action) {
      case 'Create new project':
        await createProject();
        break;
      case 'Run tests':
        await runTests();
        break;
      case 'Deploy':
        await deploy();
        break;
      case 'Exit':
        process.exit(0);
    }
  } catch (error) {
    if (error.message === 'Cancelled') {
      kit.log.info('Goodbye!');
    } else {
      kit.log.error(\`Error: \${error.message}\`);
    }
    process.exit(1);
  }
}

main();
\`\`\`

### Multi-Command CLI with Arguments
\`\`\`typescript
#!/usr/bin/env node
import kit from '@xec-sh/kit';

const commands = {
  init: async () => {
    const config = await kit.form({
      message: 'Project Configuration',
      fields: [
        { name: 'name', type: 'text', label: 'Project name', required: true },
        { name: 'type', type: 'select', label: 'Project type', options: ['node', 'react', 'vue'] },
        { name: 'typescript', type: 'confirm', label: 'Use TypeScript?' }
      ]
    });
    
    const spinner = kit.spinner('Creating project...');
    await createProject(config);
    spinner.success('Project created!');
  },
  
  add: async () => {
    const component = await kit.select('Add component:', [
      'authentication',
      'database',
      'api',
      'testing'
    ]);
    
    await addComponent(component);
    kit.log.success(\`Added \${component} component\`);
  },
  
  deploy: async () => {
    const env = await kit.select('Deploy to:', ['staging', 'production']);
    
    const confirm = await kit.confirm(\`Deploy to \${env}?\`);
    if (!confirm) return;
    
    const tasks = kit.taskList([
      {
        title: 'Building application',
        task: async () => await build()
      },
      {
        title: 'Running tests',
        task: async () => await test()
      },
      {
        title: 'Deploying',
        task: async () => await deploy(env)
      }
    ]);
    
    await tasks.run();
  }
};

const command = process.argv[2];

if (!command || !commands[command]) {
  const selected = await kit.select('Choose command:', Object.keys(commands));
  await commands[selected]();
} else {
  await commands[command]();
}
\`\`\`

## Complete Example: TODO CLI

\`\`\`typescript
#!/usr/bin/env node
import kit from '@xec-sh/kit';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const TODO_FILE = path.join(os.homedir(), '.todos.json');

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  completedAt?: Date;
}

class TodoCLI {
  private todos: Todo[] = [];
  
  async init() {
    await this.load();
    await this.mainMenu();
  }
  
  async load() {
    try {
      const data = await fs.readFile(TODO_FILE, 'utf-8');
      this.todos = JSON.parse(data);
    } catch {
      this.todos = [];
    }
  }
  
  async save() {
    await fs.writeFile(TODO_FILE, JSON.stringify(this.todos, null, 2));
  }
  
  async mainMenu() {
    while (true) {
      const action = await kit.select('Todo Manager:', [
        { value: 'list', label: '📋 List todos' },
        { value: 'add', label: '➕ Add todo' },
        { value: 'complete', label: '✅ Complete todo' },
        { value: 'delete', label: '🗑️ Delete todo' },
        { value: 'stats', label: '📊 Statistics' },
        { value: 'exit', label: '👋 Exit' }
      ]);
      
      switch (action) {
        case 'list':
          await this.listTodos();
          break;
        case 'add':
          await this.addTodo();
          break;
        case 'complete':
          await this.completeTodo();
          break;
        case 'delete':
          await this.deleteTodo();
          break;
        case 'stats':
          await this.showStats();
          break;
        case 'exit':
          kit.log.info('Goodbye! 👋');
          process.exit(0);
      }
    }
  }
  
  async listTodos() {
    if (this.todos.length === 0) {
      kit.log.info('No todos yet. Add one to get started!');
      return;
    }
    
    const filter = await kit.select('Filter:', [
      'all', 'active', 'completed', 'high-priority'
    ]);
    
    let filtered = this.todos;
    switch (filter) {
      case 'active':
        filtered = this.todos.filter(t => !t.completed);
        break;
      case 'completed':
        filtered = this.todos.filter(t => t.completed);
        break;
      case 'high-priority':
        filtered = this.todos.filter(t => t.priority === 'high');
        break;
    }
    
    console.log('\\n' + '='.repeat(50));
    filtered.forEach(todo => {
      const status = todo.completed ? '✅' : '⬜';
      const priority = {
        low: '🔵',
        medium: '🟡',
        high: '🔴'
      }[todo.priority];
      
      console.log(\`\${status} \${priority} \${todo.text}\`);
      if (todo.completed && todo.completedAt) {
        console.log(\`   Completed: \${new Date(todo.completedAt).toLocaleDateString()}\`);
      }
    });
    console.log('='.repeat(50) + '\\n');
    
    await kit.text('Press Enter to continue...', { placeholder: '' });
  }
  
  async addTodo() {
    const text = await kit.text('What needs to be done?', {
      validate: (v) => v.length > 0 ? undefined : 'Todo cannot be empty'
    });
    
    const priority = await kit.select<'low' | 'medium' | 'high'>('Priority:', [
      { value: 'low', label: '🔵 Low' },
      { value: 'medium', label: '🟡 Medium' },
      { value: 'high', label: '🔴 High' }
    ]);
    
    const todo: Todo = {
      id: Date.now().toString(),
      text,
      completed: false,
      priority,
      createdAt: new Date()
    };
    
    this.todos.push(todo);
    await this.save();
    
    kit.log.success('Todo added successfully!');
  }
  
  async completeTodo() {
    const active = this.todos.filter(t => !t.completed);
    
    if (active.length === 0) {
      kit.log.info('No active todos!');
      return;
    }
    
    const selected = await kit.multiselect(
      'Select todos to complete:',
      active.map(t => ({
        value: t.id,
        label: t.text,
        hint: \`Priority: \${t.priority}\`
      }))
    );
    
    selected.forEach(id => {
      const todo = this.todos.find(t => t.id === id);
      if (todo) {
        todo.completed = true;
        todo.completedAt = new Date();
      }
    });
    
    await this.save();
    kit.log.success(\`Completed \${selected.length} todo(s)!\`);
  }
  
  async deleteTodo() {
    if (this.todos.length === 0) {
      kit.log.info('No todos to delete!');
      return;
    }
    
    const selected = await kit.multiselect(
      'Select todos to delete:',
      this.todos.map(t => ({
        value: t.id,
        label: t.text,
        hint: t.completed ? 'Completed' : 'Active'
      }))
    );
    
    const confirm = await kit.confirm(\`Delete \${selected.length} todo(s)?\`);
    if (!confirm) return;
    
    this.todos = this.todos.filter(t => !selected.includes(t.id));
    await this.save();
    
    kit.log.success(\`Deleted \${selected.length} todo(s)!\`);
  }
  
  async showStats() {
    const total = this.todos.length;
    const completed = this.todos.filter(t => t.completed).length;
    const active = total - completed;
    const highPriority = this.todos.filter(t => t.priority === 'high' && !t.completed).length;
    
    const stats = \`
📊 Todo Statistics
══════════════════════════
Total todos: \${total}
✅ Completed: \${completed} (\${total ? Math.round(completed/total * 100) : 0}%)
⬜ Active: \${active}
🔴 High priority: \${highPriority}
══════════════════════════
    \`;
    
    console.log(stats);
    await kit.text('Press Enter to continue...', { placeholder: '' });
  }
}

// Run the CLI
const cli = new TodoCLI();
cli.init().catch(error => {
  kit.log.error(\`Error: \${error.message}\`);
  process.exit(1);
});
\`\`\`

## Error Handling

\`\`\`typescript
async function safeCLI() {
  try {
    await runCLI();
  } catch (error) {
    if (error.message === 'Cancelled') {
      // User cancelled - exit gracefully
      kit.log.info('Operation cancelled');
      process.exit(0);
    } else if (error.code === 'EACCES') {
      kit.log.error('Permission denied. Try running with sudo.');
      process.exit(1);
    } else if (error.code === 'ENOENT') {
      kit.log.error('File or directory not found.');
      process.exit(1);
    } else {
      // Unexpected error
      kit.log.error(\`Unexpected error: \${error.message}\`);
      
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      
      const report = await kit.confirm('Would you like to report this issue?');
      if (report) {
        await reportIssue(error);
      }
      
      process.exit(1);
    }
  }
}
\`\`\`

## Configuration Management

\`\`\`typescript
class Config {
  private configPath = path.join(os.homedir(), '.myapp/config.json');
  private config: any = {};
  
  async load() {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(data);
    } catch {
      // First run - create config
      await this.setup();
    }
  }
  
  async setup() {
    kit.log.info('Welcome! Let\\'s set up your configuration.');
    
    this.config = await kit.form({
      message: 'Configuration',
      fields: [
        {
          name: 'apiUrl',
          type: 'text',
          label: 'API URL',
          defaultValue: 'https://api.example.com',
          validate: (v) => {
            try {
              new URL(v);
              return undefined;
            } catch {
              return 'Invalid URL';
            }
          }
        },
        {
          name: 'apiKey',
          type: 'password',
          label: 'API Key',
          required: true
        },
        {
          name: 'theme',
          type: 'select',
          label: 'Theme',
          options: ['dark', 'light', 'auto'],
          defaultValue: 'auto'
        },
        {
          name: 'notifications',
          type: 'confirm',
          label: 'Enable notifications?',
          defaultValue: true
        }
      ]
    });
    
    await this.save();
    kit.log.success('Configuration saved!');
  }
  
  async save() {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }
  
  get(key: string) {
    return this.config[key];
  }
  
  async set(key: string, value: any) {
    this.config[key] = value;
    await this.save();
  }
  
  async edit() {
    const field = await kit.select('Edit configuration:', Object.keys(this.config));
    const current = this.config[field];
    
    let newValue;
    if (typeof current === 'boolean') {
      newValue = await kit.confirm(\`\${field}?\`, { default: current });
    } else if (typeof current === 'number') {
      newValue = await kit.number(\`\${field}:\`, { defaultValue: current });
    } else {
      newValue = await kit.text(\`\${field}:\`, { defaultValue: current });
    }
    
    await this.set(field, newValue);
    kit.log.success('Configuration updated!');
  }
}
\`\`\`

## Best Practices

1. **Always Handle Cancellation**: Users expect Ctrl+C to work
2. **Provide Clear Feedback**: Use spinners and progress bars
3. **Validate Input Early**: Don't let users proceed with invalid data
4. **Save Progress**: For long workflows, save state
5. **Provide Help**: Include --help flag and inline help
6. **Use Colors Wisely**: Enhance readability, don't overwhelm
7. **Test Interactively**: Test the actual user experience
8. **Handle Errors Gracefully**: Provide actionable error messages
```

## Phase 4: API Documentation (Week 4)

### Day 13-14: Complete API Reference

#### 4.1 API Overview (`api/index.md`)

```markdown
# API Reference

Complete API documentation for @xec-sh/kit.

## Main Kit Object

The default export provides a convenient interface to all Kit functionality:

\`\`\`typescript
import kit from '@xec-sh/kit';
\`\`\`

### Properties and Methods

| Method | Description | Returns |
|--------|-------------|---------|
| kit.text() | Text input prompt | Promise<string> |
| kit.confirm() | Yes/no confirmation | Promise<boolean> |
| kit.password() | Password input | Promise<string> |
| kit.number() | Number input | Promise<number> |
| kit.select() | Single selection | Promise<T> |
| kit.multiselect() | Multiple selection | Promise<T[]> |
| kit.autocomplete() | Autocomplete input | Promise<T> |
| kit.table() | Table selection | Promise<T \| T[]> |
| kit.form() | Multi-field form | Promise<T> |
| kit.filePicker() | File browser | Promise<string \| string[]> |
| kit.spinner() | Loading spinner | Spinner |
| kit.progress() | Progress bar | Progress |
| kit.multiProgress() | Multiple progress bars | MultiProgress |
| kit.taskList() | Task execution | TaskList |
| kit.group() | Grouped prompts | Promise<T> |
| kit.panel() | Panel display | Promise<void> |
| kit.wizard() | Multi-step wizard | Promise<T> |
| kit.columns() | Column layout | Promise<void> |
| kit.commandPalette() | Command palette | Promise<string> |
| kit.log | Logging utilities | Logger |
| kit.debug | Debug utilities | DebugManager |
| kit.reactive() | Reactive prompts | Promise<T> |
| kit.computed() | Computed values | ComputedValue |
| kit.watch() | Value watcher | Watcher |
| kit.validators | Validation helpers | Validators |
| kit.help() | Help system | Help |
| kit.shortcuts | Keyboard shortcuts | KeyboardShortcuts |
| kit.mouse | Mouse support | MouseSupport |
| kit.use() | Register plugin | void |

## Named Exports

### Components

\`\`\`typescript
import {
  // Primitive Components
  TextPrompt,
  ConfirmPrompt,
  PasswordPrompt,
  NumberPrompt,
  SelectPrompt,
  MultiSelectPrompt,
  
  // Advanced Components
  AutocompletePrompt,
  TablePrompt,
  FormPrompt,
  FilePickerPrompt,
  CommandPalette,
  
  // Feedback Components
  Spinner,
  Progress,
  MultiProgress,
  TaskList,
  
  // Layout Components
  GroupPrompt,
  PanelPrompt,
  WizardPrompt,
  ColumnsPrompt
} from '@xec-sh/kit';
\`\`\`

### Types

\`\`\`typescript
import type {
  // Core Types
  Theme,
  Key,
  PromptConfig,
  
  // Component Options
  TextOptions,
  ConfirmOptions,
  PasswordOptions,
  NumberOptions,
  SelectOptions,
  MultiSelectOptions,
  AutocompleteOptions,
  TableOptions,
  FormOptions,
  FilePickerOptions,
  
  // Utility Types
  ValidationRule,
  ValidationResult,
  ComputedValue,
  ReactiveState,
  
  // Plugin Types
  KitPlugin,
  PluginContext,
  ComponentDefinition
} from '@xec-sh/kit';
\`\`\`

### Utilities

\`\`\`typescript
import {
  // Reactive System
  reactive,
  computed,
  watch,
  memo,
  derived,
  asyncComputed,
  ReactiveState,
  ReactiveValidator,
  validators,
  
  // Debug Tools
  debug,
  DebugManager,
  DebugLevel,
  
  // Performance
  VirtualScroller,
  RenderBatcher,
  MemoryManager,
  PerformanceMonitor,
  
  // Interaction
  KeyboardShortcuts,
  MouseSupport,
  ContextualHelp,
  
  // Plugin System
  PluginRegistry,
  
  // Stream Handling
  StreamHandler,
  StreamHandlerFactory
} from '@xec-sh/kit';
\`\`\`

## Type Definitions

### Core Types

\`\`\`typescript
interface Key {
  sequence: string;
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

interface Theme {
  colors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    muted: string;
  };
  symbols: {
    question: string;
    success: string;
    error: string;
    warning: string;
    info: string;
    bullet: string;
    arrow: string;
    pointer: string;
    checkbox: {
      checked: string;
      unchecked: string;
      cursor: string;
    };
    radio: {
      active: string;
      inactive: string;
      cursor: string;
    };
    spinner: {
      frames: string[];
      interval: number;
    };
  };
  formatters: {
    primary: (text: string) => string;
    bold: (text: string) => string;
    highlight: (text: string) => string;
    muted: (text: string) => string;
    error: (text: string) => string;
    success: (text: string) => string;
    warning: (text: string) => string;
    info: (text: string) => string;
    inverse: (text: string) => string;
    secondary: (text: string) => string;
  };
}
\`\`\`

### Option Types

\`\`\`typescript
interface TextOptions {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string) => string | undefined | Promise<string | undefined>;
  transform?: (value: string) => string;
  format?: (value: string) => string;
  multiline?: boolean;
  lines?: number;
  maxLength?: number;
  minLength?: number;
  pattern?: RegExp;
  mask?: string | ((char: string) => string);
}

interface SelectOptions<T> {
  message: string;
  options: T[] | SelectOption<T>[];
  filter?: boolean;
  loop?: boolean;
  limit?: number;
  hint?: string;
}

interface SelectOption<T> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'password' | 'select' | 'multiselect' | 'confirm' | 'boolean';
  required?: boolean;
  placeholder?: string;
  description?: string;
  defaultValue?: any;
  validate?: (value: any, formData: any) => string | undefined | Promise<string | undefined>;
  dependsOn?: string | string[];
  show?: (formData: any) => boolean;
}

interface FormOptions {
  message: string;
  fields?: FormField[];
  steps?: FormStep[];
  submitLabel?: string;
  cancelLabel?: string;
  validateOnBlur?: boolean;
}
\`\`\`

## Lifecycle Methods

All prompt classes that extend the base `Prompt` class have these lifecycle methods:

\`\`\`typescript
class CustomPrompt extends Prompt<T> {
  // Required abstract methods
  render(): string;
  handleInput(key: Key): void | Promise<void>;
  
  // Optional lifecycle methods
  protected async initialize(): Promise<void>;
  protected handleNonInteractive(): T | symbol;
  protected cleanup(): void;
  
  // New v2.0 methods for reactive scenarios
  async renderOnly(): Promise<string>;
  async handleInputOnly(key: Key): Promise<void>;
  getValue(): T | undefined;
}
\`\`\`

## Error Handling

All prompt methods can throw these errors:

\`\`\`typescript
// User cancelled the prompt
Error('Cancelled')

// Validation failed
ValidationError {
  message: string;
  field?: string;
  value?: any;
}

// Non-TTY environment
NonTTYError {
  message: 'Not running in a TTY environment';
}
\`\`\`

## Environment Variables

Kit respects these environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| NO_COLOR | Disable color output | false |
| FORCE_COLOR | Force color output | false |
| CI | Running in CI environment | false |
| TERM | Terminal type | - |
| DEBUG | Enable debug output | false |
```

## Phase 5: Migration and Testing Documentation (Week 5)

### Day 15: Migration Guide

Complete the migration guide based on MIGRATION.md with practical examples.

### Day 16: Testing Documentation

Create comprehensive testing guide with examples.

## Documentation Standards

### Code Examples

1. **Always Working**: Every example must be tested and working
2. **Complete**: Include all necessary imports
3. **Commented**: Add inline comments for clarity
4. **Progressive**: Start simple, add complexity
5. **Error Handling**: Show how to handle errors

### Writing Style

1. **Clear and Concise**: Avoid unnecessary jargon
2. **Task-Oriented**: Focus on what users want to accomplish
3. **Consistent**: Use the same terminology throughout
4. **Searchable**: Use keywords users would search for
5. **Visual**: Include screenshots/GIFs where helpful

### Example Template

```markdown
## [Feature Name]

Brief description of what this feature does and when to use it.

### Basic Usage

\`\`\`typescript
// Minimal example that works
import kit from '@xec-sh/kit';

const result = await kit.feature();
\`\`\`

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| ... | ... | ... | ... |

### Advanced Usage

\`\`\`typescript
// More complex example with all options
\`\`\`

### Real-World Example

\`\`\`typescript
// Practical example from actual use case
\`\`\`

### Common Patterns

- Pattern 1: Description
- Pattern 2: Description

### Troubleshooting

**Issue**: Common problem
**Solution**: How to fix it

### See Also

- [Related Feature 1](link)
- [Related Feature 2](link)
```

## Quality Checklist

For each documentation page:

- [ ] All code examples tested and working
- [ ] TypeScript types are accurate
- [ ] Links to related pages work
- [ ] API signatures match implementation
- [ ] Screenshots/GIFs added where helpful
- [ ] Common errors and solutions documented
- [ ] Keyboard shortcuts documented
- [ ] Accessibility considerations noted
- [ ] Performance tips included where relevant
- [ ] Migration notes for breaking changes

## Maintenance Plan

1. **Version Updates**: Update docs with each release
2. **Example Testing**: Automated tests for all examples
3. **User Feedback**: Incorporate user feedback regularly
4. **Search Analytics**: Optimize based on search patterns
5. **Video Tutorials**: Create video guides for complex topics

## Success Metrics

- **Completeness**: 100% of public API documented
- **Accuracy**: All examples working with current version
- **Discoverability**: Users find what they need in <3 clicks
- **Clarity**: <5% of users need additional help
- **Up-to-date**: Documentation updated within 24h of release

## Conclusion

This documentation specification provides a comprehensive roadmap for creating professional, user-friendly documentation for @xec-sh/kit. By following this structure and adhering to the standards outlined, the documentation will serve as both a learning resource for new users and a reference for experienced developers.

The key to success is maintaining accuracy with the actual implementation, providing working examples, and continuously improving based on user feedback. Remember: good documentation is as important as good code.