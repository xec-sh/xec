# Test Framework Integrations

How to integrate TUI Tester with popular testing frameworks.

## Table of Contents

- [Vitest](#vitest)
- [Jest](#jest)
- [Mocha](#mocha)
- [Playwright Test](#playwright-test)
- [Cypress](#cypress)
- [AVA](#ava)
- [Tap](#tap)
- [Custom Integrations](#custom-integrations)

## Vitest

Vitest is the recommended test runner for TUI Tester due to its speed and modern features.

### Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,  // Increase for E2E tests
    hookTimeout: 10000,
    
    // Setup file
    setupFiles: ['./test/setup.ts'],
    
    // Reporter for better output
    reporters: ['verbose'],
    
    // Snapshot configuration
    snapshotFormat: {
      printBasicPrototype: false
    }
  }
});
```

### Setup File

```typescript
// test/setup.ts
import { setupVitestMatchers, getSnapshotManager, createTester } from '@xec-sh/tui-tester';

// Setup custom matchers
setupVitestMatchers();

// Configure snapshot manager
getSnapshotManager({
  snapshotDir: './test/snapshots',
  updateSnapshots: process.env.UPDATE_SNAPSHOTS === 'true'
});

// Global test utilities
globalThis.createTestTester = (command: string) => {
  return createTester(command, {
    debug: process.env.DEBUG === 'true',
    sessionName: `test-${Date.now()}`
  });
};
```

### Custom Matchers

```typescript
// Custom Vitest matchers
expect.extend({
  async toShowText(tester, text: string) {
    const screen = await tester.getScreen();
    const pass = screen.includes(text);
    
    return {
      pass,
      message: () => pass
        ? `Screen contains "${text}"`
        : `Screen does not contain "${text}"\nScreen:\n${screen}`,
      actual: screen,
      expected: text
    };
  },
  
  async toHaveCursorAt(tester, x: number, y: number) {
    const cursor = await tester.getCursor();
    const pass = cursor.x === x && cursor.y === y;
    
    return {
      pass,
      message: () => pass
        ? `Cursor is at (${x}, ${y})`
        : `Cursor is at (${cursor.x}, ${cursor.y}), expected (${x}, ${y})`
    };
  }
});

// Usage
await expect(tester).toShowText('Welcome');
await expect(tester).toHaveCursorAt(0, 0);
```

### Test Example

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTester } from '@xec-sh/tui-tester';

describe('App Tests', () => {
  let tester;

  beforeEach(async () => {
    tester = createTester('app');
    await tester.start();
  });

  afterEach(async () => {
    await tester?.stop();
  });

  it('should work', async () => {
    await expect(tester).toShowText('Ready');
  });
  
  it.concurrent('can run concurrently', async () => {
    // Tests with different session names can run in parallel
    const tester = createTester('app', {
      sessionName: `concurrent-${Date.now()}`
    });
    
    await tester.start();
    await expect(tester).toShowText('Ready');
    await tester.stop();
  });
});
```

## Jest

Jest is a popular test framework with built-in mocking and coverage.

### Setup

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  
  // Test patterns
  testMatch: [
    '**/*.e2e.test.ts',
    '**/*.integration.test.ts'
  ],
  
  // Coverage
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ],
  
  // Snapshot configuration
  snapshotResolver: '<rootDir>/test/snapshot-resolver.js'
};
```

### Custom Matchers

```typescript
// test/setup.ts
import { TmuxTester } from '@xec-sh/tui-tester';

declare global {
  namespace jest {
    interface Matchers<R> {
      toShowText(text: string): Promise<R>;
      toMatchSnapshot(name?: string): Promise<R>;
    }
  }
}

expect.extend({
  async toShowText(received: TmuxTester, expected: string) {
    const screen = await received.getScreen();
    const pass = screen.includes(expected);
    
    return {
      pass,
      message: () => 
        `expected screen ${pass ? 'not ' : ''}to contain "${expected}"`,
    };
  },
  
  async toMatchSnapshot(received: TmuxTester, name?: string) {
    const screen = await received.getScreen({ stripAnsi: true });
    
    // Use Jest's built-in snapshot
    expect(screen).toMatchSnapshot(name);
    
    return { pass: true, message: () => '' };
  }
});
```

### Test Example

```typescript
describe('App', () => {
  let tester: TmuxTester;

  beforeAll(async () => {
    tester = createTester('app');
    await tester.start();
  });

  afterAll(async () => {
    await tester.stop();
  });

  test('should display welcome', async () => {
    await expect(tester).toShowText('Welcome');
  });
  
  test('should match snapshot', async () => {
    await expect(tester).toMatchSnapshot('home-screen');
  });
});
```

### Parallel Execution

```typescript
// Run tests in parallel with unique sessions
describe.concurrent('Parallel Tests', () => {
  test.concurrent('test 1', async () => {
    const tester = createTester('app', {
      sessionName: `parallel-1-${Date.now()}`
    });
    // ...
  });
  
  test.concurrent('test 2', async () => {
    const tester = createTester('app', {
      sessionName: `parallel-2-${Date.now()}`
    });
    // ...
  });
});
```

## Mocha

Mocha is a flexible test framework that works well with TUI Tester.

### Setup

```javascript
// .mocharc.json
{
  "timeout": 30000,
  "require": [
    "ts-node/register",
    "./test/setup.js"
  ],
  "spec": [
    "test/**/*.test.ts"
  ],
  "reporter": "spec",
  "exit": true
}
```

### Setup File

```typescript
// test/setup.js
import { expect } from 'chai';
import { createTester } from '@xec-sh/tui-tester';

// Add custom assertions
chai.use(function(chai, utils) {
  chai.Assertion.addAsyncMethod('showText', async function(text) {
    const tester = this._obj;
    const screen = await tester.getScreen();
    
    this.assert(
      screen.includes(text),
      `expected screen to contain "${text}"`,
      `expected screen not to contain "${text}"`,
      text,
      screen
    );
  });
});

// Global helpers
global.createTestTester = createTester;
```

### Test Example

```typescript
import { expect } from 'chai';
import { createTester } from '@xec-sh/tui-tester';

describe('App Tests', function() {
  this.timeout(30000);
  
  let tester;

  beforeEach(async function() {
    tester = createTester('app');
    await tester.start();
  });

  afterEach(async function() {
    await tester.stop();
  });

  it('should show welcome', async function() {
    await expect(tester).to.showText('Welcome');
  });
  
  it('should handle input', async function() {
    await tester.sendText('test');
    await tester.sendKey('Enter');
    
    const screen = await tester.getScreen();
    expect(screen).to.include('Received: test');
  });
});
```

## Playwright Test

Playwright Test provides powerful testing capabilities that complement TUI Tester.

### Setup

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  
  // Parallel execution
  workers: 4,
  fullyParallel: true,
  
  // Reporting
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results.json' }]
  ],
  
  // Projects for different scenarios
  projects: [
    {
      name: 'small-terminal',
      use: {
        terminalSize: { cols: 40, rows: 20 }
      }
    },
    {
      name: 'standard-terminal',
      use: {
        terminalSize: { cols: 80, rows: 24 }
      }
    },
    {
      name: 'large-terminal',
      use: {
        terminalSize: { cols: 120, rows: 40 }
      }
    }
  ]
});
```

### Custom Fixtures

```typescript
// test/fixtures.ts
import { test as base } from '@playwright/test';
import { TmuxTester } from '@xec-sh/tui-tester';

type TestFixtures = {
  tester: TmuxTester;
  terminalSize: { cols: number; rows: number };
};

export const test = base.extend<TestFixtures>({
  terminalSize: [{ cols: 80, rows: 24 }, { option: true }],
  
  tester: async ({ terminalSize }, use) => {
    const tester = createTester('app', {
      ...terminalSize,
      sessionName: `pw-${Date.now()}`
    });
    
    await tester.start();
    await use(tester);
    await tester.stop();
  }
});

export { expect } from '@playwright/test';
```

### Test Example

```typescript
import { test, expect } from './fixtures';

test.describe('Terminal App', () => {
  test('should work in different sizes', async ({ tester, terminalSize }) => {
    await tester.waitForText('Ready');
    
    const screen = await tester.getScreen();
    console.log(`Testing with ${terminalSize.cols}x${terminalSize.rows}`);
    
    expect(screen).toContain('Welcome');
  });
  
  test('should handle user workflow', async ({ tester }) => {
    // Complex user workflow
    await tester.sendCommand('login');
    await tester.waitForText('Username:');
    await tester.sendText('user');
    await tester.sendKey('Tab');
    await tester.sendText('password');
    await tester.sendKey('Enter');
    
    await expect(tester.getScreen()).resolves.toContain('Logged in');
  });
});
```

## Cypress

While Cypress is primarily for web testing, you can use it with TUI Tester for E2E workflows.

### Plugin Setup

```javascript
// cypress/plugins/tui-tester.js
const { createTester } = require('@xec-sh/tui-tester');

let tester;

module.exports = {
  startApp(command, options) {
    tester = createTester(command, options);
    return tester.start();
  },
  
  stopApp() {
    return tester?.stop();
  },
  
  sendText(text) {
    return tester.sendText(text);
  },
  
  sendKey(key, modifiers) {
    return tester.sendKey(key, modifiers);
  },
  
  getScreen() {
    return tester.getScreen();
  }
};
```

### Command Registration

```javascript
// cypress/support/commands.js
Cypress.Commands.add('startTerminalApp', (command, options) => {
  return cy.task('startApp', { command, options });
});

Cypress.Commands.add('stopTerminalApp', () => {
  return cy.task('stopApp');
});

Cypress.Commands.add('sendTerminalText', (text) => {
  return cy.task('sendText', text);
});

Cypress.Commands.add('getTerminalScreen', () => {
  return cy.task('getScreen');
});
```

### Test Example

```javascript
describe('Terminal App E2E', () => {
  before(() => {
    cy.startTerminalApp('app');
  });
  
  after(() => {
    cy.stopTerminalApp();
  });
  
  it('should display welcome', () => {
    cy.getTerminalScreen().should('contain', 'Welcome');
  });
  
  it('should handle input', () => {
    cy.sendTerminalText('test input');
    cy.sendTerminalKey('Enter');
    cy.getTerminalScreen().should('contain', 'Received: test input');
  });
});
```

## AVA

AVA is a minimalist test runner with good TypeScript support.

### Setup

```json
// package.json
{
  "ava": {
    "extensions": ["ts"],
    "require": ["ts-node/register"],
    "files": ["test/**/*.test.ts"],
    "timeout": "30s",
    "serial": false,
    "verbose": true
  }
}
```

### Test Example

```typescript
import test from 'ava';
import { createTester } from '@xec-sh/tui-tester';

test.beforeEach(async t => {
  t.context.tester = createTester('app', {
    sessionName: `ava-${Date.now()}`
  });
  await t.context.tester.start();
});

test.afterEach.always(async t => {
  await t.context.tester?.stop();
});

test('shows welcome message', async t => {
  const { tester } = t.context;
  
  await tester.waitForText('Welcome');
  const screen = await tester.getScreen();
  
  t.true(screen.includes('Welcome'));
  t.snapshot(screen, 'welcome-screen');
});

test.serial('handles sequential operations', async t => {
  const { tester } = t.context;
  
  await tester.sendCommand('first');
  await tester.waitForText('First complete');
  
  await tester.sendCommand('second');
  await tester.waitForText('Second complete');
  
  t.pass();
});
```

## Tap

TAP (Test Anything Protocol) based testing.

### Setup

```javascript
// test/setup.js
const tap = require('tap');
const { createTester } = require('@xec-sh/tui-tester');

tap.beforeEach(async (t) => {
  t.context.tester = createTester('app');
  await t.context.tester.start();
});

tap.afterEach(async (t) => {
  await t.context.tester?.stop();
});
```

### Test Example

```javascript
const tap = require('tap');
const { createTester } = require('@xec-sh/tui-tester');

tap.test('Terminal App', async (t) => {
  const tester = createTester('app');
  await tester.start();
  
  t.test('shows welcome', async (t) => {
    await tester.waitForText('Welcome');
    const screen = await tester.getScreen();
    t.match(screen, /Welcome/);
  });
  
  t.test('handles input', async (t) => {
    await tester.sendText('input');
    await tester.sendKey('Enter');
    
    const screen = await tester.getScreen();
    t.match(screen, /Received: input/);
  });
  
  await tester.stop();
  t.end();
});
```

## Custom Integrations

### Creating a Custom Integration

```typescript
// my-integration.ts
import { TmuxTester } from '@xec-sh/tui-tester';

export interface IntegrationOptions {
  framework: string;
  reporter?: string;
  timeout?: number;
}

export class CustomIntegration {
  private options: IntegrationOptions;
  
  constructor(options: IntegrationOptions) {
    this.options = options;
  }
  
  // Setup helpers
  setupHelpers(context: any): void {
    context.createTester = (cmd: string) => {
      return new TmuxTester({
        command: cmd.split(' '),
        debug: this.options.reporter === 'verbose'
      });
    };
    
    context.assertScreen = async (tester: TmuxTester, check: (s: string) => boolean) => {
      const screen = await tester.getScreen();
      if (!check(screen)) {
        throw new Error(`Screen assertion failed:\n${screen}`);
      }
    };
  }
  
  // Custom matchers
  registerMatchers(expect: any): void {
    expect.addMatcher('toShowPrompt', async (tester: TmuxTester, prompt: string) => {
      const screen = await tester.getScreen();
      const lines = screen.split('\n');
      const lastLine = lines[lines.length - 1];
      
      return lastLine.includes(prompt);
    });
  }
  
  // Lifecycle hooks
  beforeEach(fn: () => Promise<void>): void {
    // Framework-specific implementation
  }
  
  afterEach(fn: () => Promise<void>): void {
    // Framework-specific implementation
  }
}
```

### Using the Integration

```typescript
import { CustomIntegration } from './my-integration';

const integration = new CustomIntegration({
  framework: 'myframework',
  reporter: 'verbose',
  timeout: 30000
});

// Setup in test file
integration.setupHelpers(global);
integration.registerMatchers(expect);

// Use in tests
describe('App', () => {
  let tester;
  
  integration.beforeEach(async () => {
    tester = createTester('app');
    await tester.start();
  });
  
  integration.afterEach(async () => {
    await tester.stop();
  });
  
  it('works', async () => {
    await expect(tester).toShowPrompt('>');
  });
});
```

## Best Practices

1. **Use Framework Features**: Leverage built-in features like fixtures, hooks, and parallel execution
2. **Custom Matchers**: Create domain-specific matchers for better test readability
3. **Proper Cleanup**: Always ensure testers are stopped in afterEach/afterAll hooks
4. **Unique Sessions**: Use unique session names for parallel test execution
5. **Timeout Configuration**: Set appropriate timeouts for E2E tests
6. **Error Reporting**: Capture screen state on test failures for debugging