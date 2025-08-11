# TUI Tester - Test Suite

Comprehensive test suite for the TUI Tester framework, supporting Node.js, Bun, and Deno runtimes.

## Test Structure

```
test/
├── core/                      # Core functionality tests
│   └── utils.test.ts         # Utility functions tests
├── adapters/                  # Runtime adapter tests  
│   └── adapters.test.ts      # Node, Bun, Deno adapter tests
├── tmux/                      # Tmux integration tests
│   └── tmux-tester.test.ts   # Tmux tester functionality
├── snapshot/                  # Snapshot management tests
│   └── snapshot-manager.test.ts
├── helpers/                   # Helper function tests
│   └── interactions.test.ts  # High-level interaction helpers
├── runtimes/                  # Runtime-specific tests
│   ├── bun.test.ts           # Bun-specific features
│   └── deno.test.ts          # Deno-specific features
└── run-all-tests.sh          # Multi-runtime test runner
```

## Running Tests

### All Runtimes
```bash
npm run test:all        # Run tests in all available runtimes
./test/run-all-tests.sh # Alternative method
```

### Node.js (Vitest)
```bash
npm test               # Run all tests with Vitest
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report
```

### Bun
```bash
npm run test:bun       # Run tests with Bun
bun test              # Direct Bun command
```

### Deno
```bash
npm run test:deno      # Run tests with Deno
deno test --allow-all test/**/*.test.ts  # Direct Deno command
```

### Integration Tests
```bash
npm run test:integration  # Run Tmux integration tests
```

## Test Coverage

### Core Utils (`core/utils.test.ts`)
- ✅ Delay and timing functions
- ✅ ANSI stripping and text normalization
- ✅ Screen parsing and line processing
- ✅ Condition waiting with timeout
- ✅ Regex escaping and text utilities
- ✅ Terminal size detection
- ✅ Command availability checking

### Runtime Adapters (`adapters/adapters.test.ts`)
- ✅ NodeAdapter - Node.js child_process/pty support
- ✅ BunAdapter - Bun.spawn integration
- ✅ DenoAdapter - Deno.Command support
- ✅ Process spawning and termination
- ✅ Input/output handling
- ✅ PTY resizing
- ✅ Environment variables and working directory
- ✅ Cross-runtime compatibility

### Tmux Integration (`tmux/tmux-tester.test.ts`)
- ✅ Session creation and management
- ✅ Terminal size configuration
- ✅ Text input and special keys
- ✅ Screen content capture
- ✅ Text waiting and assertion
- ✅ Window resizing
- ✅ Snapshot creation
- ✅ Recording and replay
- ✅ Interactive application testing
- ✅ Error handling and cleanup

### Snapshot Manager (`snapshot/snapshot-manager.test.ts`)
- ✅ Save and load snapshots
- ✅ Snapshot comparison and diffing
- ✅ Directory management
- ✅ Metadata handling
- ✅ Update detection
- ✅ Formatted output
- ✅ Concurrent operations
- ✅ Error handling

### Interaction Helpers (`helpers/interactions.test.ts`)
- ✅ Form field filling
- ✅ Text selection and clipboard
- ✅ Menu navigation
- ✅ Scrolling operations
- ✅ Keyboard shortcuts
- ✅ Loading indicators
- ✅ Annotated snapshots
- ✅ Complex workflows

### Bun Runtime (`runtimes/bun.test.ts`)
- ✅ Bun.spawn process management
- ✅ Bun file operations
- ✅ ArrayBuffer/Uint8Array handling
- ✅ Bun.serve HTTP server
- ✅ WebSocket support
- ✅ Performance benchmarks
- ✅ Bun-specific APIs

### Deno Runtime (`runtimes/deno.test.ts`)
- ✅ Deno.Command execution
- ✅ Permission management
- ✅ Deno file system APIs
- ✅ Deno.serve HTTP server
- ✅ WebSocket support
- ✅ Worker threads
- ✅ Signal handling
- ✅ Deno-specific features

## Requirements

### Required for Basic Tests
- Node.js 18+ (for Vitest)
- TypeScript 5.9+

### Optional for Runtime Tests
- Bun 1.0+ (for Bun tests)
- Deno 1.38+ (for Deno tests)
- tmux 3.0+ (for integration tests)

### Environment Variables
```bash
DEBUG=true        # Enable debug output
NO_COLOR=1       # Disable colored output
FORCE_COLOR=1    # Force colored output
```

## Test Utilities

The test suite includes comprehensive utilities for:

1. **Process Management**: Spawning, killing, and monitoring processes
2. **Screen Parsing**: ANSI stripping, line parsing, text normalization
3. **Timing Control**: Delays, timeouts, condition waiting
4. **Snapshot Management**: Save, load, compare terminal states
5. **Interaction Simulation**: Keyboard input, mouse events, form filling
6. **Cross-Runtime Support**: Unified API across Node.js, Bun, and Deno

## Adding New Tests

### Create a New Test File
```typescript
import { describe, it, expect } from 'vitest'; // or bun:test, or deno testing
import { YourModule } from '../src/your-module';

describe('YourModule', () => {
  it('should do something', () => {
    const result = YourModule.doSomething();
    expect(result).toBe(expected);
  });
});
```

### Runtime-Specific Tests
```typescript
// For Bun
const isBun = typeof Bun !== 'undefined';
const describeBun = isBun ? describe : describe.skip;

// For Deno
const isDeno = typeof Deno !== 'undefined';
const describeDeno = isDeno ? describe : describe.skip;
```

### Integration Tests with Tmux
```typescript
import { TmuxTester } from '../src/tmux-tester';

const tester = new TmuxTester({
  command: ['your-app'],
  size: { cols: 80, rows: 24 }
});

await tester.start();
await tester.typeText('input');
const content = await tester.getScreenContent();
await tester.stop();
```

## Troubleshooting

### Tests Failing with "command not found"
- Ensure tmux is installed: `brew install tmux` (macOS) or `apt-get install tmux` (Linux)
- Check PATH includes tmux: `which tmux`

### Deno Permission Errors
- Run with `--allow-all` flag: `deno test --allow-all`
- Or grant specific permissions: `--allow-read --allow-write --allow-run`

### Bun Tests Not Running
- Ensure Bun is installed: `curl -fsSL https://bun.sh/install | bash`
- Check version: `bun --version`

### Timeout Errors
- Increase timeout in test options
- Check if tmux sessions are cleaned up: `tmux kill-server`

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run Tests
  run: |
    npm ci
    npm run typecheck
    npm run test:all
```

### Docker
```dockerfile
FROM node:20
RUN apt-get update && apt-get install -y tmux
# Install Bun and Deno if needed
COPY . .
RUN npm ci
RUN npm run test:all
```

## Performance Benchmarks

The test suite includes performance benchmarks for:
- Process spawn/kill operations
- Snapshot save/load operations
- Screen parsing and ANSI stripping
- Large text processing

Run benchmarks: `npm test -- --grep "benchmark"`

## Coverage Reports

Generate coverage report: `npm run test:coverage`

View report: `open coverage/index.html`