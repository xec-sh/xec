# Testing Guide

Best practices and patterns for testing terminal applications with TUI Tester.

## Table of Contents

- [Testing Strategies](#testing-strategies)
- [Test Organization](#test-organization)
- [Common Patterns](#common-patterns)
- [Testing Interactive Apps](#testing-interactive-apps)
- [Testing CLI Tools](#testing-cli-tools)
- [Performance Testing](#performance-testing)
- [Debugging Tests](#debugging-tests)
- [CI/CD Integration](#cicd-integration)

## Testing Strategies

### 1. Unit vs Integration Testing

TUI Tester is primarily designed for **integration and end-to-end testing**. Use it to test:

- Complete user workflows
- Application startup and initialization
- User interaction flows
- Visual output and formatting
- Error handling and recovery
- Command-line argument processing

For unit testing individual functions, use standard testing frameworks without TUI Tester.

### 2. Test Isolation

Each test should be independent and isolated:

```typescript
describe('App Tests', () => {
  let tester;

  beforeEach(async () => {
    // Fresh instance for each test
    tester = createTester('app', {
      sessionName: `test-${Date.now()}` // Unique session
    });
    await tester.start();
  });

  afterEach(async () => {
    // Always clean up
    if (tester?.isRunning()) {
      await tester.stop();
    }
  });
});
```

### 3. Wait Strategies

Always wait for the application to be ready before interacting:

```typescript
// Bad - No waiting
await tester.start();
await tester.sendText('input'); // May fail!

// Good - Wait for ready state
await tester.start();
await tester.waitFor(screen => screen.includes('Ready'));
await tester.sendText('input');
```

## Test Organization

### Directory Structure

```
tests/
├── e2e/                    # End-to-end tests
│   ├── workflows/          # Complete user workflows
│   ├── integration/        # Integration tests
│   └── smoke/              # Smoke tests
├── visual/                 # Visual regression tests
│   ├── snapshots/          # Snapshot files
│   └── screenshots/        # Screenshots
├── fixtures/               # Test data and fixtures
├── helpers/                # Test utilities
└── setup.ts                # Test setup and configuration
```

### Test Naming Conventions

```typescript
// Descriptive test names
describe('User Authentication Flow', () => {
  it('should successfully login with valid credentials', async () => {
    // ...
  });

  it('should display error message for invalid password', async () => {
    // ...
  });

  it('should lock account after 3 failed attempts', async () => {
    // ...
  });
});
```

## Common Patterns

### 1. Page Object Pattern

Encapsulate screen interactions in page objects:

```typescript
class LoginPage {
  constructor(private tester: TmuxTester) {}

  async waitForLoad() {
    await this.tester.waitFor(screen => 
      screen.includes('Login')
    );
  }

  async enterUsername(username: string) {
    await this.tester.sendText(username);
    await this.tester.sendKey('Tab');
  }

  async enterPassword(password: string) {
    await this.tester.sendText(password);
    await this.tester.sendKey('Tab');
  }

  async submit() {
    await this.tester.sendKey('Enter');
  }

  async login(username: string, password: string) {
    await this.waitForLoad();
    await this.enterUsername(username);
    await this.enterPassword(password);
    await this.submit();
  }

  async getErrorMessage(): Promise<string | null> {
    const screen = await this.tester.getScreen();
    const match = screen.match(/Error: (.+)/);
    return match ? match[1] : null;
  }
}

// Usage in tests
it('should login successfully', async () => {
  const loginPage = new LoginPage(tester);
  await loginPage.login('user', 'pass123');
  
  await tester.assertScreen(screen => 
    screen.includes('Welcome')
  );
});
```

### 2. Custom Assertions

Create custom assertion helpers:

```typescript
class CustomAssertions {
  constructor(private tester: TmuxTester) {}

  async assertPrompt(expected: string) {
    await this.tester.assertScreen(screen => {
      const lines = screen.split('\n');
      const lastLine = lines[lines.length - 1];
      return lastLine.includes(expected);
    });
  }

  async assertStatus(status: 'success' | 'error' | 'warning') {
    const colors = {
      success: '\x1b[32m',  // green
      error: '\x1b[31m',    // red
      warning: '\x1b[33m'   // yellow
    };
    
    await this.tester.assertScreen(screen => 
      screen.includes(colors[status])
    );
  }

  async assertTable(headers: string[]) {
    await this.tester.assertScreen(screen => {
      return headers.every(header => 
        screen.includes(header)
      );
    });
  }
}
```

### 3. Test Data Fixtures

Use fixtures for consistent test data:

```typescript
// fixtures/users.ts
export const testUsers = {
  valid: {
    username: 'testuser',
    password: 'Test123!',
    email: 'test@example.com'
  },
  invalid: {
    username: 'invalid',
    password: 'wrong',
    email: 'notanemail'
  },
  admin: {
    username: 'admin',
    password: 'Admin123!',
    email: 'admin@example.com'
  }
};

// In tests
import { testUsers } from '../fixtures/users';

it('should accept valid user', async () => {
  await tester.sendText(testUsers.valid.username);
  // ...
});
```

## Testing Interactive Apps

### Menu Navigation

```typescript
async function navigateMenu(tester: TmuxTester, path: string[]) {
  for (const item of path) {
    // Find and select menu item
    await tester.waitFor(screen => screen.includes(item));
    
    // Navigate to item
    let attempts = 0;
    while (attempts < 10) {
      const screen = await tester.getScreen();
      const lines = screen.split('\n');
      
      // Check if item is selected (usually highlighted)
      const selectedLine = lines.find(line => 
        line.includes('>') && line.includes(item)
      );
      
      if (selectedLine) {
        await tester.sendKey('Enter');
        break;
      }
      
      await tester.sendKey('Down');
      attempts++;
    }
  }
}

// Usage
await navigateMenu(tester, ['File', 'Open', 'Recent']);
```

### Form Testing

```typescript
async function fillForm(tester: TmuxTester, data: Record<string, string>) {
  for (const [field, value] of Object.entries(data)) {
    // Wait for field label
    await tester.waitFor(screen => screen.includes(field));
    
    // Move to field (Tab navigation)
    await tester.sendKey('Tab');
    
    // Clear existing value
    await tester.sendKey('a', { ctrl: true });
    await tester.sendKey('Backspace');
    
    // Enter new value
    await tester.sendText(value);
  }
  
  // Submit form
  await tester.sendKey('Enter');
}

// Usage
await fillForm(tester, {
  'Name': 'John Doe',
  'Email': 'john@example.com',
  'Phone': '555-1234'
});
```

### Dialog Handling

```typescript
async function handleDialog(
  tester: TmuxTester,
  expectedText: string,
  response: 'yes' | 'no' | 'cancel'
) {
  // Wait for dialog
  await tester.waitFor(screen => screen.includes(expectedText));
  
  // Send response
  switch (response) {
    case 'yes':
      await tester.sendKey('y');
      break;
    case 'no':
      await tester.sendKey('n');
      break;
    case 'cancel':
      await tester.sendKey('Escape');
      break;
  }
}

// Usage
await handleDialog(tester, 'Are you sure?', 'yes');
```

## Testing CLI Tools

### Command Testing

```typescript
describe('CLI Command Tests', () => {
  async function runCommand(args: string): Promise<string> {
    const tester = createTester(`mycli ${args}`);
    await tester.start();
    
    // Wait for command to complete
    await tester.waitFor(screen => 
      screen.includes('$') || // Prompt returned
      screen.includes('Process finished') // Or explicit end
    );
    
    const output = await tester.getScreen();
    await tester.stop();
    
    return output;
  }

  it('should show help', async () => {
    const output = await runCommand('--help');
    expect(output).toContain('Usage:');
    expect(output).toContain('Options:');
  });

  it('should handle invalid arguments', async () => {
    const output = await runCommand('--invalid');
    expect(output).toContain('Error');
    expect(output).toContain('Unknown option');
  });
});
```

### Pipe Testing

```typescript
it('should handle piped input', async () => {
  const tester = createTester('sh');
  await tester.start();
  
  // Send piped command
  await tester.sendCommand('echo "test data" | mycli process');
  
  await tester.waitFor(screen => 
    screen.includes('Processed: test data')
  );
  
  await tester.stop();
});
```

### Interactive CLI Testing

```typescript
describe('Interactive CLI', () => {
  it('should handle interactive prompts', async () => {
    const tester = createTester('mycli init');
    await tester.start();
    
    // Answer prompts
    await tester.waitForText('Project name:');
    await tester.sendText('my-project');
    await tester.sendKey('Enter');
    
    await tester.waitForText('Author:');
    await tester.sendText('John Doe');
    await tester.sendKey('Enter');
    
    await tester.waitForText('License:');
    await tester.sendKey('Down'); // Select MIT
    await tester.sendKey('Enter');
    
    // Verify output
    await tester.assertScreen(screen => 
      screen.includes('Project created successfully')
    );
    
    await tester.stop();
  });
});
```

## Performance Testing

### Response Time Testing

```typescript
async function measureResponseTime(
  tester: TmuxTester,
  action: () => Promise<void>,
  expectedResponse: string
): Promise<number> {
  const startTime = Date.now();
  
  await action();
  
  await tester.waitFor(screen => 
    screen.includes(expectedResponse)
  );
  
  return Date.now() - startTime;
}

it('should respond quickly to user input', async () => {
  const responseTime = await measureResponseTime(
    tester,
    () => tester.sendKey('Enter'),
    'Ready'
  );
  
  expect(responseTime).toBeLessThan(1000); // Under 1 second
});
```

### Load Testing

```typescript
it('should handle rapid input', async () => {
  const inputs = Array(100).fill('test');
  
  for (const input of inputs) {
    await tester.sendText(input);
    await tester.sendKey('Enter');
    // No delay - rapid fire
  }
  
  // Should not crash
  await tester.assertScreen(screen => 
    !screen.includes('Error')
  );
});
```

## Debugging Tests

### Enable Debug Mode

```typescript
const tester = createTester('app', {
  debug: true  // Enable debug output
});
```

### Capture Screenshots on Failure

```typescript
it('should work correctly', async () => {
  try {
    // Test code...
  } catch (error) {
    // Capture screen state on failure
    const screen = await tester.getScreen();
    const capture = await tester.capture();
    
    console.log('Screen at failure:');
    console.log(screen);
    console.log('Cursor:', capture.cursor);
    
    // Save snapshot for investigation
    await tester.snapshot(`failure-${Date.now()}`);
    
    throw error;
  }
});
```

### Interactive Debugging

```typescript
// Pause test for manual inspection
async function debugPause(tester: TmuxTester) {
  console.log('Test paused. Attach to tmux session:');
  console.log(`tmux attach -t ${tester.getSessionName()}`);
  console.log('Press Enter to continue...');
  
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });
}

// Usage
it('debug test', async () => {
  await tester.start();
  await tester.sendText('command');
  
  // Pause here for debugging
  await debugPause(tester);
  
  await tester.stop();
});
```

## CI/CD Integration

### GitHub Actions

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Install tmux
        run: sudo apt-get install -y tmux
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          CI: true
      
      - name: Upload snapshots on failure
        if: failure()
        uses: actions/upload-artifact@v2
        with:
          name: failed-snapshots
          path: test/snapshots/
```

### Docker Testing

```dockerfile
FROM node:18

# Install tmux
RUN apt-get update && apt-get install -y tmux

# Copy app
WORKDIR /app
COPY . .

# Install dependencies
RUN npm ci

# Run tests
CMD ["npm", "test"]
```

### Headless Testing

```typescript
// Ensure tests work in CI without display
const tester = createTester('app', {
  env: {
    ...process.env,
    TERM: 'xterm-256color',
    CI: 'true'
  }
});
```

## Best Practices

1. **Always clean up**: Use `try/finally` blocks or `afterEach` hooks
2. **Wait for stability**: Add appropriate waits after actions
3. **Use unique session names**: Prevent conflicts in parallel execution
4. **Test incrementally**: Build complex tests from simple ones
5. **Capture failures**: Save screen state when tests fail
6. **Mock external dependencies**: Use test doubles for external services
7. **Keep tests focused**: One test should verify one behavior
8. **Use descriptive names**: Test names should explain what and why
9. **Avoid hard-coded delays**: Use `waitFor` instead of `sleep`
10. **Version control snapshots**: Track visual changes over time