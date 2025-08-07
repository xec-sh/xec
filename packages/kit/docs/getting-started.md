# Getting Started with @xec-sh/kit

Welcome to Kit! This guide will help you create beautiful, interactive command-line interfaces in minutes.

## Installation

```bash
npm install @xec-sh/kit
# or
yarn add @xec-sh/kit
# or
pnpm add @xec-sh/kit
```

## Quick Start

Here's a simple example to get you started:

```typescript
import { text, select, confirm, log } from '@xec-sh/kit';

async function main() {
  // Get user's name
  const name = await text('What is your name?');
  
  // Ask for favorite color
  const color = await select('What is your favorite color?', [
    'Red',
    'Blue', 
    'Green',
    'Yellow'
  ]);
  
  // Confirm the information
  const confirmed = await confirm(
    `Your name is ${name} and you like ${color}. Is this correct?`
  );
  
  if (confirmed) {
    log.success('Great! Nice to meet you!');
  } else {
    log.info('Let\'s try again...');
  }
}

main().catch(console.error);
```

## Core Concepts

### Prompts

Kit provides various prompt types for different input scenarios:

#### Text Input
```typescript
const name = await text('Enter your name:', {
  placeholder: 'John Doe',
  defaultValue: 'Anonymous',
  validate: (value) => {
    if (value.length < 2) return 'Name must be at least 2 characters';
    return true;
  }
});
```

#### Number Input
```typescript
const age = await number('Enter your age:', {
  min: 0,
  max: 120,
  step: 1
});
```

#### Selection
```typescript
// Simple array of options
const fruit = await select('Choose a fruit:', ['Apple', 'Banana', 'Orange']);

// With detailed options
const task = await select('What would you like to do?', {
  options: [
    { value: 'create', label: 'Create new project', hint: 'Start fresh' },
    { value: 'open', label: 'Open existing', hint: 'Continue working' },
    { value: 'exit', label: 'Exit' }
  ]
});
```

#### Multi-select
```typescript
const toppings = await multiselect('Choose pizza toppings:', [
  'Cheese',
  'Pepperoni',
  'Mushrooms',
  'Olives',
  'Onions'
]);
```

#### Confirmation
```typescript
const proceed = await confirm('Do you want to continue?', {
  defaultValue: true
});
```

#### Password
```typescript
const password = await password('Enter your password:', {
  mask: '*',
  validate: (value) => {
    if (value.length < 8) return 'Password must be at least 8 characters';
    return true;
  }
});
```

### Feedback Components

Show progress and status to users:

#### Spinner
```typescript
const spin = spinner('Loading...');
spin.start();

// Do some work
await someAsyncOperation();

spin.success('Done!');
// or spin.error('Failed!');
// or spin.warning('Warning!');
// or spin.stop();
```

#### Progress Bar
```typescript
const bar = progress('Downloading...', { total: 100 });
bar.start();

for (let i = 0; i <= 100; i++) {
  bar.update(i);
  await sleep(50);
}

bar.complete('Download complete!');
```

#### Task List
```typescript
const tasks = taskList([
  {
    title: 'Install dependencies',
    task: async () => {
      await exec('npm install');
    }
  },
  {
    title: 'Build project',
    task: async () => {
      await exec('npm run build');
    }
  },
  {
    title: 'Run tests',
    task: async () => {
      await exec('npm test');
    }
  }
]);

await tasks.run();
```

### Layout Components

Organize complex interfaces:

#### Group
```typescript
const answers = await group({
  name: () => text('Name:'),
  email: () => text('Email:'),
  age: () => number('Age:'),
  newsletter: () => confirm('Subscribe to newsletter?')
});

console.log(answers); // { name: '...', email: '...', age: ..., newsletter: ... }
```

#### Wizard
```typescript
const result = await wizard({
  pages: [
    {
      id: 'basic',
      title: 'Basic Information',
      fields: {
        name: () => text('Full name:'),
        email: () => text('Email address:')
      }
    },
    {
      id: 'preferences',
      title: 'Preferences',
      fields: {
        theme: () => select('Theme:', ['Light', 'Dark', 'Auto']),
        notifications: () => confirm('Enable notifications?')
      }
    }
  ]
});
```

### Logging

Kit provides styled logging utilities:

```typescript
import { log } from '@xec-sh/kit';

log.success('Operation completed successfully!');
log.error('An error occurred:', error);
log.warning('This action cannot be undone');
log.info('For more information, visit our docs');
log.message('Simple message');
```

## Error Handling

All Kit prompts handle cancellation gracefully:

```typescript
try {
  const name = await text('Enter your name:');
  // User entered a name
} catch (error) {
  if (error.message === 'Cancelled') {
    // User pressed Ctrl+C or Escape
    console.log('Operation cancelled');
  } else {
    // Some other error
    console.error('Error:', error);
  }
}
```

## Themes

Kit automatically adapts to the terminal's capabilities:

- Full Unicode support with emoji on capable terminals
- Graceful fallback to ASCII on limited terminals
- Respects NO_COLOR and FORCE_COLOR environment variables
- Automatic color detection

## TypeScript Support

Kit is written in TypeScript and provides full type safety:

```typescript
import { select } from '@xec-sh/kit';

interface Project {
  id: string;
  name: string;
  path: string;
}

const projects: Project[] = [
  { id: '1', name: 'My App', path: './my-app' },
  { id: '2', name: 'API Server', path: './api' }
];

const selected = await select<Project>('Choose a project:', {
  options: projects.map(p => ({
    value: p,
    label: p.name,
    hint: p.path
  }))
});

// `selected` is typed as Project
console.log(selected.id, selected.name);
```

## Next Steps

- Check out the [API Reference](./api-reference.md) for detailed documentation
- See [Examples](../examples) for more complex use cases
- Read the [Common Patterns](./patterns.md) guide for best practices

---

Happy building! 🚀