# Troubleshooting

Common issues and solutions when using TUI Tester.

## Table of Contents

- [Installation Issues](#installation-issues)
- [tmux Issues](#tmux-issues)
- [Runtime Issues](#runtime-issues)
- [Test Failures](#test-failures)
- [Performance Issues](#performance-issues)
- [Platform-Specific Issues](#platform-specific-issues)
- [Debugging Tips](#debugging-tips)
- [FAQ](#faq)

## Installation Issues

### tmux Not Found

**Problem**: `Error: tmux is not installed`

**Solution**:

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt-get update
sudo apt-get install tmux

# Fedora/RHEL
sudo dnf install tmux

# Alpine
apk add tmux

# Verify installation
tmux -V
```

### Package Installation Fails

**Problem**: `npm install @xec-sh/tui-tester` fails

**Solutions**:

1. Clear npm cache:
```bash
npm cache clean --force
npm install @xec-sh/tui-tester
```

2. Use different registry:
```bash
npm install @xec-sh/tui-tester --registry https://registry.npmjs.org/
```

3. Check Node version:
```bash
node --version  # Should be 18.0.0 or higher
```

### TypeScript Errors

**Problem**: TypeScript compilation errors

**Solution**:

```json
// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "types": ["node"]
  }
}
```

## tmux Issues

### Session Already Exists

**Problem**: `Error: Session 'test-session' already exists`

**Solution**:

```typescript
// Kill existing session before starting
await tester.exec(`tmux kill-session -t ${sessionName} 2>/dev/null`);

// Or use unique session names
const tester = createTester('app', {
  sessionName: `test-${Date.now()}`
});
```

### Session Not Found

**Problem**: `Error: Session not found`

**Causes & Solutions**:

1. Session was killed externally:
```typescript
// Check if session exists
const result = await tester.exec('list-sessions');
if (!result.stdout.includes(tester.getSessionName())) {
  // Restart session
  await tester.restart();
}
```

2. tmux server crashed:
```bash
# Restart tmux server
tmux kill-server
```

### Permission Denied

**Problem**: `Error: Permission denied`

**Solutions**:

1. Check tmux socket permissions:
```bash
ls -la /tmp/tmux-*/
chmod 700 /tmp/tmux-*
```

2. Run with proper user:
```bash
# Don't run tests as root
sudo -u normaluser npm test
```

### Display Issues

**Problem**: Characters appear garbled or incorrect

**Solution**:

```typescript
// Set proper locale and terminal
const tester = createTester('app', {
  env: {
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    TERM: 'xterm-256color'
  }
});
```

## Runtime Issues

### Deno Permission Errors

**Problem**: `PermissionDenied: Requires run permission`

**Solution**:

```bash
# Grant all permissions
deno test --allow-all test.ts

# Or specific permissions
deno test \
  --allow-run=tmux \
  --allow-read \
  --allow-write \
  --allow-env \
  test.ts
```

### Bun Compatibility Issues

**Problem**: Bun-specific API differences

**Solution**:

```typescript
// Use compatibility mode
const adapter = new BunAdapter({
  nodeCompat: true  // Use Node.js APIs
});

// Or check Bun version
if (Bun.version < "1.0.0") {
  // Use fallback implementation
}
```

### Node.js Version Issues

**Problem**: `SyntaxError: Unexpected token`

**Solution**:

Ensure Node.js 18+ for full ES module support:

```bash
# Check version
node --version

# Update Node.js
nvm install 18
nvm use 18
```

## Test Failures

### Timing Issues

**Problem**: Tests pass locally but fail in CI

**Solutions**:

1. Increase timeouts:
```typescript
await tester.waitFor(
  screen => screen.includes('Ready'),
  { timeout: 10000 }  // Increase from default 3000
);
```

2. Add stability checks:
```typescript
// Wait for stable state
await tester.waitFor(screen => {
  return screen.includes('Ready') &&
         !screen.includes('Loading');
});

// Add buffer time
await tester.sleep(500);
```

3. Use retry logic:
```typescript
async function retryCommand(tester, command, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await tester.sendCommand(command);
      await tester.waitFor(screen => 
        screen.includes('Success')
      );
      return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await tester.sleep(1000);
    }
  }
}
```

### Screen Content Mismatch

**Problem**: `Expected screen to contain "text"`

**Debug Steps**:

1. Capture actual screen:
```typescript
it('should show text', async () => {
  try {
    await tester.assertScreen(screen => 
      screen.includes('Expected')
    );
  } catch (error) {
    // Debug output
    const screen = await tester.getScreen();
    console.log('Actual screen:');
    console.log(screen);
    console.log('---');
    
    // Save for inspection
    await fs.writeFile('debug-screen.txt', screen);
    
    throw error;
  }
});
```

2. Check for ANSI codes:
```typescript
// Strip ANSI codes for comparison
const plainScreen = await tester.getScreen({ stripAnsi: true });
```

3. Check cursor position:
```typescript
const cursor = await tester.getCursor();
console.log('Cursor at:', cursor);
```

### Input Not Received

**Problem**: Application doesn't respond to input

**Solutions**:

1. Add delays between inputs:
```typescript
await tester.sendText('input');
await tester.sleep(100);  // Wait for processing
await tester.sendKey('Enter');
```

2. Check focus state:
```typescript
// Ensure terminal has focus
await tester.click(0, 0);  // Click to focus
await tester.sendText('input');
```

3. Use raw key sequences:
```typescript
// Send raw tmux command
await tester.exec(`tmux send-keys -t ${session} -l "text"`);
```

## Performance Issues

### Slow Test Execution

**Problem**: Tests take too long to run

**Solutions**:

1. Reduce wait intervals:
```typescript
await tester.waitFor(condition, {
  interval: 50  // Check every 50ms instead of 100ms
});
```

2. Parallel execution:
```typescript
describe.concurrent('Tests', () => {
  it.concurrent('test 1', async () => {
    // Use unique session
  });
  
  it.concurrent('test 2', async () => {
    // Use unique session
  });
});
```

3. Reuse sessions:
```typescript
let globalTester;

beforeAll(async () => {
  globalTester = createTester('app');
  await globalTester.start();
});

afterAll(async () => {
  await globalTester.stop();
});

beforeEach(async () => {
  // Reset state instead of restart
  await globalTester.clear();
});
```

### Memory Leaks

**Problem**: Memory usage increases over time

**Solutions**:

1. Clean up properly:
```typescript
afterEach(async () => {
  // Clear large buffers
  tester.clearOutput();
  
  // Clear snapshots if not needed
  tester.snapshots.clear();
  
  // Stop tester
  await tester.stop();
  tester = null;  // Allow GC
});
```

2. Limit buffer sizes:
```typescript
class LimitedTester extends TmuxTester {
  private maxBufferSize = 100 * 1024;  // 100KB
  
  async getScreen(): Promise<string> {
    const screen = await super.getScreen();
    
    if (screen.length > this.maxBufferSize) {
      // Keep only recent content
      return screen.slice(-this.maxBufferSize);
    }
    
    return screen;
  }
}
```

### High CPU Usage

**Problem**: Tests consume excessive CPU

**Solutions**:

1. Increase poll intervals:
```typescript
// Reduce polling frequency
await tester.waitFor(condition, {
  interval: 200  // Poll less frequently
});
```

2. Batch operations:
```typescript
// Instead of many small operations
for (const char of text) {
  await tester.sendKey(char);
}

// Send as single operation
await tester.sendText(text);
```

## Platform-Specific Issues

### Windows/WSL

**Problem**: Tests fail on Windows

**Solutions**:

1. Use WSL:
```bash
# Install WSL
wsl --install

# Run tests in WSL
wsl npm test
```

2. Use Git Bash:
```bash
# Run in Git Bash terminal
npm test
```

3. Docker alternative:
```dockerfile
FROM node:18
RUN apt-get update && apt-get install -y tmux
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "test"]
```

### macOS

**Problem**: `tmux: need UTF-8 locale`

**Solution**:

```bash
# Set locale
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

# Or in test
const tester = createTester('app', {
  env: {
    LC_ALL: 'en_US.UTF-8',
    LANG: 'en_US.UTF-8'
  }
});
```

### Linux

**Problem**: `Error: Cannot open terminal`

**Solution**:

```bash
# Install terminal info
sudo apt-get install ncurses-term

# Set TERM variable
export TERM=xterm-256color
```

## Debugging Tips

### Enable Debug Mode

```typescript
// Global debug
process.env.DEBUG = 'tui-tester:*';

// Per-tester debug
const tester = createTester('app', {
  debug: true
});
```

### Attach to tmux Session

```bash
# List sessions
tmux list-sessions

# Attach to test session
tmux attach -t test-session

# Detach: Ctrl+B, then D
```

### Capture Debug Information

```typescript
class DebugHelper {
  static async captureDebugInfo(tester: TmuxTester) {
    const info = {
      sessionName: tester.getSessionName(),
      isRunning: tester.isRunning(),
      screen: await tester.getScreen(),
      cursor: await tester.getCursor(),
      size: tester.getSize(),
      timestamp: Date.now()
    };
    
    await fs.writeFile(
      `debug-${Date.now()}.json`,
      JSON.stringify(info, null, 2)
    );
    
    return info;
  }
}

// Use in tests
try {
  await tester.assertScreen(/* ... */);
} catch (error) {
  await DebugHelper.captureDebugInfo(tester);
  throw error;
}
```

### Logging

```typescript
// Enable verbose logging
const tester = createTester('app', {
  debug: true,
  logLevel: 'verbose'
});

// Custom logger
class LoggingTester extends TmuxTester {
  private log(message: string): void {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }
  
  async sendText(text: string): Promise<void> {
    this.log(`sendText: "${text}"`);
    await super.sendText(text);
  }
  
  async sendKey(key: string): Promise<void> {
    this.log(`sendKey: "${key}"`);
    await super.sendKey(key);
  }
}
```

## FAQ

### Q: Can I test GUI applications?

**A**: TUI Tester is designed for terminal/console applications. For GUI applications, use tools like Playwright or Selenium.

### Q: How do I test applications that require sudo?

**A**: Avoid running tests with sudo. Instead:
- Mock privileged operations
- Use Docker with appropriate permissions
- Test logic separately from privileged operations

### Q: Can I test over SSH?

**A**: Yes, by running tmux on the remote machine:

```typescript
const tester = createTester('ssh user@host "tmux new-session -d app"');
```

### Q: How do I handle applications that clear the screen?

**A**: Capture screen before clear:

```typescript
// Monitor for clear sequences
const screen = await tester.getScreen();
if (screen.includes('\x1b[2J')) {
  // Screen was cleared
  await tester.snapshot('before-clear');
}
```

### Q: Can I test with different terminal sizes?

**A**: Yes, use the size option:

```typescript
const sizes = [
  { cols: 80, rows: 24 },
  { cols: 120, rows: 40 }
];

for (const size of sizes) {
  const tester = createTester('app', size);
  // Test with this size
}
```

### Q: How do I test color output?

**A**: Check for ANSI color codes:

```typescript
const screen = await tester.getScreen();

// Check for red text (\x1b[31m)
expect(screen).toContain('\x1b[31m');

// Or strip colors for content testing
const plain = await tester.getScreen({ stripAnsi: true });
expect(plain).toContain('Error message');
```

### Q: What if my app uses a custom shell?

**A**: Specify the shell:

```typescript
const tester = createTester('app', {
  shell: '/usr/bin/fish'  // Use fish shell
});
```

### Q: How do I test interactive installers?

**A**: Script the interaction:

```typescript
async function testInstaller(tester: TmuxTester) {
  // Start installer
  await tester.sendCommand('./install.sh');
  
  // Answer prompts
  await tester.waitForText('Install location:');
  await tester.sendText('/opt/app');
  await tester.sendKey('Enter');
  
  await tester.waitForText('Continue? (y/n)');
  await tester.sendKey('y');
  
  // Wait for completion
  await tester.waitFor(
    screen => screen.includes('Installation complete'),
    { timeout: 60000 }  // 1 minute
  );
}
```

### Q: Can I use this for benchmarking?

**A**: Yes, measure timing:

```typescript
const start = Date.now();
await tester.sendCommand('heavy-operation');
await tester.waitFor(screen => screen.includes('Complete'));
const duration = Date.now() - start;

expect(duration).toBeLessThan(5000);  // Under 5 seconds
```