# TRM Integration Tests

This directory contains comprehensive integration tests for the TRM (Terminal Manipulation) library using `@xec-sh/tui-tester`.

## Test Coverage

The integration tests cover >90% of terminal-related functionality:

### Core Terminal Features
- **Terminal Initialization**: Creation, initialization, and cleanup
- **Screen Operations**: Writing, clearing, positioning text
- **Cursor Management**: Movement, visibility, shapes
- **Input Handling**: Keyboard events, special keys, raw mode
- **Mouse Support**: Clicks, movements, scrolling
- **Terminal States**: Raw mode, alternate buffer, state restoration

### Visual Features
- **Colors**: ANSI colors, 256 colors, RGB/true color
- **Styles**: Bold, italic, underline, and other text decorations
- **ANSI Sequences**: Direct ANSI escape sequence manipulation

### Buffer Operations
- **Screen Buffers**: Creating, filling, writing to buffers
- **Box Drawing**: Drawing boxes and lines
- **Buffer Patches**: Creating and applying buffer diffs
- **Multiple Buffers**: Managing multiple screen buffers

### Advanced Features
- **Animation System**: Animation manager, FPS counter, easing functions
- **Layout System**: Flex layouts, grid layouts
- **State Management**: Reactive store, computed values, selectors
- **Performance Monitoring**: Performance metrics, memory monitoring
- **Console Redirection**: Redirecting console output to terminal

### Platform Detection
- **Runtime Detection**: Node.js, Deno, Bun detection
- **Terminal Capabilities**: TTY detection, size, color support
- **Environment Detection**: SSH, WSL, CI environment
- **Cross-platform Utilities**: Timers, intervals, high-resolution timing

## Running Tests

### Prerequisites

1. **Install tmux**: Required for terminal testing
   ```bash
   # macOS
   brew install tmux
   
   # Ubuntu/Debian
   sudo apt-get install tmux
   
   # Fedora
   sudo dnf install tmux
   ```

2. **Build the library**:
   ```bash
   npm run build
   ```

### Test Commands

```bash
# Run all integration tests
npm run test:integration

# Run with coverage report
npm run test:integration:coverage

# Watch mode for development
npm run test:integration:watch

# Run both unit and integration tests
npm run test:full

# Full test suite with coverage
npm run test:full:coverage
```

## Test Structure

```
test/
├── integration/              # Integration tests
│   ├── terminal.integration.test.ts    # Core terminal functionality
│   ├── buffer-ansi.integration.test.ts # Buffer and ANSI operations
│   ├── advanced.integration.test.ts    # Advanced features
│   └── platform.integration.test.ts    # Platform detection
├── fixtures/                 # Test applications
│   ├── test-terminal-app.js # Main test app
│   ├── test-buffer-app.js   # Buffer testing app
│   └── ...                  # Dynamic test scripts
├── unit/                     # Unit tests
│   ├── core/                # Core module tests
│   └── advanced/            # Advanced module tests
└── setup-integration.ts     # Integration test setup

```

## Coverage Report

After running tests with coverage, reports are generated in:
- `coverage/` - Unit test coverage
- `coverage-integration/` - Integration test coverage

View HTML reports:
```bash
open coverage-integration/index.html
```

## Writing New Integration Tests

1. Create test applications in `fixtures/` that use TRM features
2. Use `@xec-sh/tui-tester` to interact with the terminal app
3. Verify output, behavior, and state changes

Example test pattern:
```typescript
import { createTester } from '@xec-sh/tui-tester';

describe('Feature Test', () => {
  let tester;
  
  beforeEach(async () => {
    tester = createTester('node test-app.js');
    await tester.start();
    await tester.waitForText('Ready');
  });
  
  afterEach(async () => {
    await tester?.stop();
  });
  
  it('should test feature', async () => {
    await tester.sendKey('a');
    const screen = await tester.getScreenText();
    expect(screen).toContain('Expected output');
  });
});
```

## Troubleshooting

### tmux sessions not cleaning up
If test sessions remain after tests:
```bash
# List sessions
tmux ls

# Kill specific session
tmux kill-session -t session-name

# Kill all test sessions
tmux ls | grep "trm-" | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
```

### Tests timing out
- Increase timeout in test configuration
- Check that tmux is installed and working
- Verify the test app starts correctly

### Coverage not reaching 90%
- Check that all test files are running
- Verify test apps are exercising all code paths
- Add more test scenarios for uncovered branches

## CI/CD Integration

For CI environments:
1. Install tmux in CI pipeline
2. Set appropriate environment variables
3. Use headless mode (no display required)

Example GitHub Actions:
```yaml
- name: Install tmux
  run: sudo apt-get install -y tmux
  
- name: Run integration tests
  run: npm run test:integration:coverage
```