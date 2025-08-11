# Examples

Real-world examples of testing terminal applications with TUI Tester.

## Table of Contents

- [Basic Examples](#basic-examples)
- [Testing a CLI Tool](#testing-a-cli-tool)
- [Testing an Interactive REPL](#testing-an-interactive-repl)
- [Testing a Text Editor](#testing-a-text-editor)
- [Testing a Dashboard Application](#testing-a-dashboard-application)
- [Testing a Chat Application](#testing-a-chat-application)
- [Testing a File Manager](#testing-a-file-manager)
- [Testing a Git Client](#testing-a-git-client)
- [Testing with Different Frameworks](#testing-with-different-frameworks)

## Basic Examples

### Hello World Test

```typescript
import { createTester } from '@xec-sh/tui-tester';
import { describe, it, expect } from 'vitest';

describe('Hello World App', () => {
  it('should display hello world', async () => {
    const tester = createTester('node hello.js');
    
    await tester.start();
    await tester.waitForText('Hello World');
    
    const screen = await tester.getScreenText();
    expect(screen).toContain('Hello World');
    
    await tester.stop();
  });
});
```

### Echo Program Test

```typescript
describe('Echo Program', () => {
  it('should echo user input', async () => {
    const tester = createTester('node echo.js');
    
    await tester.start();
    await tester.waitForText('Enter text:');
    
    await tester.sendText('Hello Echo');
    await tester.sendKey('Enter');
    
    await tester.assertScreenContains('You entered: Hello Echo');
    
    await tester.stop();
  });
});
```

## Testing a CLI Tool

### Package Manager CLI

```typescript
import { createTester } from '@xec-sh/tui-tester';
import { describe, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

describe('Package Manager CLI', () => {
  let tester;
  let testDir;

  beforeEach(async () => {
    // Create test directory
    testDir = path.join(process.cwd(), 'test-project');
    await fs.mkdir(testDir, { recursive: true });
    
    tester = createTester('pkg', {
      cwd: testDir
    });
  });

  afterEach(async () => {
    if (tester?.isRunning()) {
      await tester.stop();
    }
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should initialize a new project', async () => {
    await tester.start();
    await tester.sendCommand('pkg init');
    
    // Answer prompts
    await tester.waitForText('Package name:');
    await tester.sendText('my-package');
    await tester.sendKey('Enter');
    
    await tester.waitForText('Version:');
    await tester.sendKey('Enter'); // Accept default
    
    await tester.waitForText('Description:');
    await tester.sendText('A test package');
    await tester.sendKey('Enter');
    
    await tester.waitForText('Author:');
    await tester.sendText('Test User');
    await tester.sendKey('Enter');
    
    await tester.waitForText('License:');
    await tester.sendText('MIT');
    await tester.sendKey('Enter');
    
    // Verify success
    await tester.assertScreenContains('package.json created successfully');
    
    // Verify file was created
    const packageJson = await fs.readFile(
      path.join(testDir, 'package.json'),
      'utf-8'
    );
    const pkg = JSON.parse(packageJson);
    
    expect(pkg.name).toBe('my-package');
    expect(pkg.description).toBe('A test package');
    expect(pkg.author).toBe('Test User');
    expect(pkg.license).toBe('MIT');
  });

  it('should install dependencies', async () => {
    // Create package.json
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        dependencies: {
          'lodash': '^4.17.21'
        }
      })
    );
    
    await tester.start();
    await tester.sendCommand('pkg install');
    
    // Wait for installation
    await tester.waitFor(
      screen => screen.includes('Installation complete'),
      { timeout: 30000 } // Allow time for download
    );
    
    // Verify installation
    await tester.assertScreenContains('1 package installed');
    
    // Check node_modules exists
    const stats = await fs.stat(path.join(testDir, 'node_modules'));
    expect(stats.isDirectory()).toBe(true);
  });

  it('should list installed packages', async () => {
    await tester.start();
    await tester.sendCommand('pkg list');
    
    await tester.waitFor(screen => 
      screen.includes('Installed packages:')
    );
    
    const screen = await tester.getScreenText();
    
    // Should show table headers
    expect(screen).toContain('Package');
    expect(screen).toContain('Version');
    expect(screen).toContain('Size');
  });
});
```

## Testing an Interactive REPL

### Node.js REPL Testing

```typescript
describe('Node.js REPL', () => {
  let tester;

  beforeEach(async () => {
    tester = createTester('node');
    await tester.start();
    await tester.waitFor(screen => screen.includes('>'));
  });

  afterEach(async () => {
    await tester.stop();
  });

  it('should evaluate expressions', async () => {
    await tester.sendText('2 + 2');
    await tester.sendKey('Enter');
    
    await tester.assertScreenContains('4');
  });

  it('should handle multiline input', async () => {
    await tester.sendText('function add(a, b) {');
    await tester.sendKey('Enter');
    
    await tester.waitFor(screen => screen.includes('...'));
    
    await tester.sendText('  return a + b;');
    await tester.sendKey('Enter');
    
    await tester.sendText('}');
    await tester.sendKey('Enter');
    
    // Test the function
    await tester.sendText('add(5, 3)');
    await tester.sendKey('Enter');
    
    await tester.assertScreenContains('8');
  });

  it('should show errors', async () => {
    await tester.sendText('undefined.property');
    await tester.sendKey('Enter');
    
    await tester.assertScreenContains('TypeError');
  });

  it('should support autocomplete', async () => {
    await tester.sendText('console.');
    await tester.sendKey('Tab');
    await tester.sendKey('Tab');
    
    await tester.assertScreenContains('console.log') &&
    tester.assertScreenContains('console.error') &&
    tester.assertScreenContains('console.warn');
  });
});
```

## Testing a Text Editor

### Vim-like Editor

```typescript
describe('Text Editor', () => {
  let tester;
  const testFile = 'test.txt';

  beforeEach(async () => {
    tester = createTester(`editor ${testFile}`);
    await tester.start();
  });

  afterEach(async () => {
    await tester.stop();
  });

  it('should enter and exit insert mode', async () => {
    // Wait for normal mode
    await tester.waitFor(screen => 
      screen.includes('NORMAL')
    );
    
    // Enter insert mode
    await tester.sendKey('i');
    
    await tester.assertScreenContains('INSERT');
    
    // Type some text
    await tester.sendText('Hello Editor');
    
    // Exit insert mode
    await tester.sendKey('Escape');
    
    await tester.assertScreenContains('NORMAL') &&
    tester.assertScreenContains('Hello Editor');
  });

  it('should save file', async () => {
    // Enter insert mode and add text
    await tester.sendKey('i');
    await tester.sendText('Test content');
    await tester.sendKey('Escape');
    
    // Save file
    await tester.sendKey(':');
    await tester.sendText('w');
    await tester.sendKey('Enter');
    
    await tester.assertScreenContains('written') ||
    tester.assertScreenContains('saved');
  });

  it('should support visual selection', async () => {
    // Add some text
    await tester.sendKey('i');
    await tester.sendText('Line 1\nLine 2\nLine 3');
    await tester.sendKey('Escape');
    
    // Go to beginning
    await tester.sendKey('g');
    await tester.sendKey('g');
    
    // Enter visual mode
    await tester.sendKey('V');
    
    await tester.assertScreenContains('VISUAL');
    
    // Select two lines
    await tester.sendKey('j');
    
    // Delete selection
    await tester.sendKey('d');
    
    // Should have only Line 3
    await tester.assertScreenContains('Line 3') &&
    !tester.assertScreenContains('Line 1') &&
    !tester.assertScreenContains('Line 2');
  });

  it('should search text', async () => {
    // Add searchable content
    await tester.sendKey('i');
    await tester.sendText('The quick brown fox\njumps over the lazy dog');
    await tester.sendKey('Escape');
    
    // Search
    await tester.sendKey('/');
    await tester.sendText('fox');
    await tester.sendKey('Enter');
    
    // Cursor should be on 'fox'
    const cursor = await tester.getCursor();
    const screen = await tester.getScreenText();
    const lines = screen.split('\n');
    
    expect(lines[cursor.y]).toContain('fox');
  });
});
```

## Testing a Dashboard Application

### System Monitor Dashboard

```typescript
describe('System Monitor Dashboard', () => {
  let tester;

  beforeEach(async () => {
    tester = createTester('monitor');
    await tester.start();
    await tester.waitFor(screen => 
      screen.includes('System Monitor')
    );
  });

  afterEach(async () => {
    await tester.stop();
  });

  it('should display CPU usage', async () => {
    await tester.assertScreenContains('CPU:');
    const screen = await tester.getScreenText();
    expect(screen).toMatch(/CPU:\\s+\\d+%/);
  });

  it('should navigate between tabs', async () => {
    // Should start on Overview tab
    await tester.assertScreenContains('[Overview]');
    
    // Navigate to Processes tab
    await tester.sendKey('Tab');
    
    await tester.assertScreenContains('[Processes]');
    
    // Should show process list
    await tester.assertScreenContains('PID') &&
    tester.assertScreenContains('CPU%') &&
    tester.assertScreenContains('MEM%');
    
    // Navigate to Network tab
    await tester.sendKey('Tab');
    
    await tester.assertScreenContains('[Network]');
  });

  it('should refresh data', async () => {
    // Get initial CPU value
    const screen1 = await tester.getScreen();
    const cpu1 = screen1.match(/CPU:\s+(\d+)%/)?.[1];
    
    // Press refresh
    await tester.sendKey('r');
    
    // Wait for refresh
    await tester.sleep(1000);
    
    // CPU value should potentially change
    const screen2 = await tester.getScreen();
    const cpu2 = screen2.match(/CPU:\s+(\d+)%/)?.[1];
    
    // At least the screen should still be valid
    expect(screen2).toContain('CPU:');
  });

  it('should sort process list', async () => {
    // Go to Processes tab
    await tester.sendKey('Tab');
    await tester.waitFor(screen => screen.includes('[Processes]'));
    
    // Sort by CPU
    await tester.sendKey('c');
    
    await tester.assertScreenContains('▼ CPU%'); // Descending indicator
    
    // Sort by Memory
    await tester.sendKey('m');
    
    await tester.assertScreenContains('▼ MEM%');
  });
});
```

## Testing a Chat Application

### Terminal Chat Client

```typescript
describe('Chat Client', () => {
  let tester;

  beforeEach(async () => {
    tester = createTester('chat-client', {
      env: {
        CHAT_SERVER: 'localhost:3000',
        CHAT_USER: 'testuser'
      }
    });
    await tester.start();
  });

  afterEach(async () => {
    await tester.stop();
  });

  it('should connect to server', async () => {
    await tester.waitFor(
      screen => screen.includes('Connected to server'),
      { timeout: 5000 }
    );
    
    await tester.assertScreenContains('testuser');
  });

  it('should send messages', async () => {
    await tester.waitFor(screen => 
      screen.includes('Connected')
    );
    
    // Type message
    await tester.sendText('Hello everyone!');
    await tester.sendKey('Enter');
    
    // Message should appear in chat
    await tester.assertScreenContains('[testuser]: Hello everyone!');
  });

  it('should handle commands', async () => {
    await tester.waitFor(screen => 
      screen.includes('Connected')
    );
    
    // List users
    await tester.sendText('/users');
    await tester.sendKey('Enter');
    
    await tester.assertScreenContains('Online users:');
    
    // Change nickname
    await tester.sendText('/nick newname');
    await tester.sendKey('Enter');
    
    await tester.assertScreenContains('Nickname changed to: newname');
    
    // Show help
    await tester.sendText('/help');
    await tester.sendKey('Enter');
    
    await tester.assertScreenContains('/users') &&
    tester.assertScreenContains('/nick') &&
    tester.assertScreenContains('/quit');
  });

  it('should handle private messages', async () => {
    await tester.waitFor(screen => 
      screen.includes('Connected')
    );
    
    // Send private message
    await tester.sendText('/msg otheruser Hello privately!');
    await tester.sendKey('Enter');
    
    await tester.assertScreenContains('[PM to otheruser]: Hello privately!');
  });
});
```

## Testing a File Manager

### Terminal File Manager

```typescript
describe('File Manager', () => {
  let tester;
  let testDir;

  beforeEach(async () => {
    // Setup test directory structure
    testDir = '/tmp/fm-test';
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(`${testDir}/file1.txt`, 'content1');
    await fs.writeFile(`${testDir}/file2.txt`, 'content2');
    await fs.mkdir(`${testDir}/subdir`);
    
    tester = createTester('file-manager', {
      cwd: testDir
    });
    await tester.start();
  });

  afterEach(async () => {
    await tester.stop();
    await fs.rm(testDir, { recursive: true });
  });

  it('should display files and directories', async () => {
    await tester.waitFor(screen => 
      screen.includes('file1.txt')
    );
    
    await tester.assertScreenContains('file1.txt') &&
    tester.assertScreenContains('file2.txt') &&
    tester.assertScreenContains('subdir/');
  });

  it('should navigate with arrow keys', async () => {
    await tester.waitFor(screen => 
      screen.includes('file1.txt')
    );
    
    // Move down
    await tester.sendKey('Down');
    
    // Check selection indicator
    const screen = await tester.getScreenText();
    const lines = screen.split('\n');
    const selectedLine = lines.find(l => l.includes('>') || l.includes('*'));
    
    expect(selectedLine).toContain('file2.txt');
  });

  it('should enter directories', async () => {
    // Navigate to subdir
    await tester.sendKey('Down');
    await tester.sendKey('Down');
    
    // Enter directory
    await tester.sendKey('Enter');
    
    // Should show parent directory option
    await tester.assertScreenContains('../');
    
    // Path should update
    await tester.assertScreenContains('subdir');
  });

  it('should copy files', async () => {
    // Select file1.txt
    await tester.waitFor(screen => 
      screen.includes('file1.txt')
    );
    
    // Copy
    await tester.sendKey('c');
    
    await tester.assertScreenContains('Copied: file1.txt');
    
    // Navigate to subdir
    await tester.sendKey('Down');
    await tester.sendKey('Down');
    await tester.sendKey('Enter');
    
    // Paste
    await tester.sendKey('p');
    
    await tester.assertScreenContains('Pasted: file1.txt');
  });

  it('should search files', async () => {
    // Open search
    await tester.sendKey('/');
    
    // Type search term
    await tester.sendText('file2');
    await tester.sendKey('Enter');
    
    // Should highlight or jump to file2
    await tester.assertScreen(screen => {
      const lines = screen.split('\n');
      const selectedLine = lines.find(l => 
        l.includes('>') || l.includes('*')
      );
      return selectedLine?.includes('file2.txt');
    });
  });
});
```

## Testing a Git Client

### Terminal Git UI

```typescript
describe('Git Client', () => {
  let tester;
  let repoDir;

  beforeEach(async () => {
    // Create test repository
    repoDir = '/tmp/test-repo';
    await fs.mkdir(repoDir, { recursive: true });
    
    // Initialize git repo
    await exec('git init', { cwd: repoDir });
    await exec('git config user.email "test@example.com"', { cwd: repoDir });
    await exec('git config user.name "Test User"', { cwd: repoDir });
    
    // Create some files
    await fs.writeFile(`${repoDir}/README.md`, '# Test Repo');
    await exec('git add .', { cwd: repoDir });
    await exec('git commit -m "Initial commit"', { cwd: repoDir });
    
    tester = createTester('git-ui', {
      cwd: repoDir
    });
    await tester.start();
  });

  afterEach(async () => {
    await tester.stop();
    await fs.rm(repoDir, { recursive: true });
  });

  it('should show repository status', async () => {
    await tester.waitFor(screen => 
      screen.includes('Branch: main') ||
      screen.includes('Branch: master')
    );
    
    await tester.assertScreenContains('nothing to commit');
  });

  it('should stage files', async () => {
    // Create new file
    await fs.writeFile(`${repoDir}/new-file.txt`, 'content');
    
    // Refresh UI
    await tester.sendKey('r');
    
    await tester.waitFor(screen => 
      screen.includes('new-file.txt')
    );
    
    // Stage file (usually Space or Enter)
    await tester.sendKey('Space');
    
    await tester.assertScreenContains('Changes to be committed:');
  });

  it('should commit changes', async () => {
    // Create and stage file
    await fs.writeFile(`${repoDir}/new-file.txt`, 'content');
    await exec('git add new-file.txt', { cwd: repoDir });
    
    // Refresh
    await tester.sendKey('r');
    
    // Open commit dialog
    await tester.sendKey('c');
    
    // Enter commit message
    await tester.waitFor(screen => 
      screen.includes('Commit message:')
    );
    
    await tester.sendText('Add new file');
    await tester.sendKey('Enter');
    
    // Confirm
    await tester.sendKey('Enter');
    
    await tester.assertScreenContains('Committed') ||
    tester.assertScreenContains('1 file changed');
  });

  it('should show commit history', async () => {
    // Switch to history view
    await tester.sendKey('h');
    
    await tester.assertScreenContains('Initial commit');
    
    // Should show commit details
    await tester.assertScreenContains('Test User') &&
    tester.assertScreenContains('test@example.com');
  });
});
```

## Testing with Different Frameworks

### With Jest

```typescript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.e2e.test.ts'],
  setupFilesAfterEnv: ['./test/setup.ts']
};

// test/setup.ts
import { TmuxTester } from '@xec-sh/tui-tester';

// Extend Jest matchers
expect.extend({
  async toContainOnScreen(tester: TmuxTester, expected: string) {
    const screen = await tester.getScreen();
    const pass = screen.includes(expected);
    
    return {
      pass,
      message: () => pass
        ? `Screen contains "${expected}"`
        : `Screen does not contain "${expected}"\nScreen:\n${screen}`
    };
  }
});

// app.e2e.test.ts
describe('App E2E', () => {
  let tester: TmuxTester;

  beforeEach(async () => {
    tester = createTester('app');
    await tester.start();
  });

  afterEach(async () => {
    await tester.stop();
  });

  it('should work', async () => {
    await expect(tester).toContainOnScreen('Ready');
  });
});
```

### With Mocha

```typescript
// test/e2e.spec.ts
import { expect } from 'chai';
import { createTester, TmuxTester } from '@xec-sh/tui-tester';

describe('App E2E', function() {
  this.timeout(10000); // Increase timeout for E2E tests
  
  let tester: TmuxTester;

  beforeEach(async () => {
    tester = createTester('app');
    await tester.start();
  });

  afterEach(async () => {
    await tester.stop();
  });

  it('should display welcome message', async () => {
    await tester.waitFor(screen => 
      screen.includes('Welcome')
    );
    
    const screen = await tester.getScreen();
    expect(screen).to.include('Welcome');
  });
});
```

### With Playwright Test

```typescript
// playwright.config.ts
import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './e2e',
  timeout: 30000,
  use: {
    // Custom fixture for TUI testing
    tester: async ({}, use) => {
      const tester = createTester('app');
      await tester.start();
      await use(tester);
      await tester.stop();
    }
  }
};

export default config;

// e2e/app.spec.ts
import { test, expect } from '@playwright/test';

test('should handle user input', async ({ tester }) => {
  await tester.waitForText('Enter name:');
  await tester.sendText('Alice');
  await tester.sendKey('Enter');
  
  const screen = await tester.getScreen();
  expect(screen).toContain('Hello, Alice');
});
```