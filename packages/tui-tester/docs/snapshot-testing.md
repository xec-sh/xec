# Snapshot Testing

Visual regression testing for terminal applications.

## Table of Contents

- [Overview](#overview)
- [Basic Usage](#basic-usage)
- [Snapshot Management](#snapshot-management)
- [Configuration](#configuration)
- [Update Strategies](#update-strategies)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

Snapshot testing captures the visual state of your terminal application and compares it against previously saved snapshots to detect unintended changes.

### Benefits

- **Visual Regression Detection**: Catch unexpected UI changes
- **Documentation**: Snapshots serve as visual documentation
- **Confidence**: Ensure UI consistency across changes
- **Efficiency**: Quickly verify complex UI states

### How It Works

1. First run: Capture and save snapshot
2. Subsequent runs: Compare current state with saved snapshot
3. On mismatch: Test fails with diff
4. On match: Test passes

## Basic Usage

### Taking Snapshots

```typescript
import { createTester } from '@xec-sh/tui-tester';

describe('App Snapshots', () => {
  it('should match home screen snapshot', async () => {
    const tester = createTester('app');
    await tester.start();
    
    // Wait for app to load
    await tester.waitFor(screen => 
      screen.includes('Welcome')
    );
    
    // Take snapshot
    await tester.snapshot('home-screen');
    
    await tester.stop();
  });
});
```

### First Run

On first run, the snapshot will be created:

```
✓ should match home screen snapshot
  Snapshot created: home-screen.snap
```

### Subsequent Runs

On subsequent runs, the current screen is compared:

```
✓ should match home screen snapshot
  Snapshot matched: home-screen.snap
```

### Failed Matches

When snapshots don't match:

```
✗ should match home screen snapshot
  Snapshot mismatch: home-screen.snap
  
  Expected:
  ┌─────────────────┐
  │ Welcome to App  │
  │ Version 1.0.0   │
  └─────────────────┘
  
  Actual:
  ┌─────────────────┐
  │ Welcome to App  │
  │ Version 2.0.0   │
  └─────────────────┘
  
  Diff:
  - │ Version 1.0.0   │
  + │ Version 2.0.0   │
```

## Snapshot Management

### Snapshot Manager API

```typescript
import { 
  SnapshotManager, 
  getSnapshotManager 
} from '@xec-sh/tui-tester';

// Get global snapshot manager
const manager = getSnapshotManager();

// Configure
manager.configure({
  snapshotDir: './test/snapshots',
  updateSnapshots: process.env.UPDATE_SNAPSHOTS === 'true'
});

// Manual operations
await manager.save('name', content);
const snapshot = await manager.load('name');
const matches = await manager.compare('name', content);
```

### Snapshot Options

```typescript
interface SnapshotOptions {
  // Update existing snapshot
  updateSnapshot?: boolean;
  
  // Remove ANSI escape codes
  stripAnsi?: boolean;
  
  // Trim whitespace
  trim?: boolean;
  
  // Custom comparison function
  compare?: (expected: string, actual: string) => boolean;
  
  // Diff options
  diffOptions?: {
    contextLines?: number;
    expand?: boolean;
  };
}
```

### Using Options

```typescript
// Strip ANSI codes for cleaner snapshots
await tester.snapshot('plain-text', {
  stripAnsi: true
});

// Trim whitespace
await tester.snapshot('trimmed', {
  trim: true
});

// Custom comparison
await tester.snapshot('custom', {
  compare: (expected, actual) => {
    // Ignore timestamps
    const normalize = (s: string) => 
      s.replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
    
    return normalize(expected) === normalize(actual);
  }
});
```

## Configuration

### Directory Structure

```
project/
├── src/
├── test/
│   ├── snapshots/           # Default snapshot directory
│   │   ├── home-screen.snap
│   │   ├── login-page.snap
│   │   └── error-state.snap
│   └── app.test.ts
└── package.json
```

### Global Configuration

```typescript
// test/setup.ts
import { getSnapshotManager } from '@xec-sh/tui-tester';

// Configure globally
getSnapshotManager().configure({
  snapshotDir: './test/snapshots',
  updateSnapshots: process.env.UPDATE_SNAPSHOTS === 'true',
  stripAnsi: true,  // Strip ANSI by default
  trim: true        // Trim by default
});
```

### Per-Test Configuration

```typescript
describe('App', () => {
  let tester;

  beforeEach(async () => {
    tester = createTester('app', {
      snapshotDir: './test/custom-snapshots'
    });
    await tester.start();
  });
});
```

## Update Strategies

### Manual Update

Update specific snapshots:

```bash
# Update all snapshots
UPDATE_SNAPSHOTS=true npm test

# Update specific test file
UPDATE_SNAPSHOTS=true npm test -- app.test.ts
```

### Interactive Update

Implement interactive update mode:

```typescript
// test/utils/snapshot-updater.ts
export async function interactiveUpdate(
  name: string,
  expected: string,
  actual: string
): Promise<boolean> {
  console.log('\nSnapshot mismatch:', name);
  console.log('Expected:', expected.substring(0, 100));
  console.log('Actual:', actual.substring(0, 100));
  console.log('\nUpdate snapshot? (y/n)');
  
  const answer = await readline();
  return answer.toLowerCase() === 'y';
}

// In test
if (!matches && process.env.INTERACTIVE) {
  const shouldUpdate = await interactiveUpdate(
    'home-screen',
    expected,
    actual
  );
  
  if (shouldUpdate) {
    await tester.snapshot('home-screen', {
      updateSnapshot: true
    });
  }
}
```

### Selective Update

Update only specific snapshots:

```typescript
// Mark snapshots for update
const SNAPSHOTS_TO_UPDATE = [
  'home-screen',  // Version changed
  'about-page'    // Copyright year updated
];

await tester.snapshot('home-screen', {
  updateSnapshot: SNAPSHOTS_TO_UPDATE.includes('home-screen')
});
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup
        run: |
          sudo apt-get install -y tmux
          npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Upload snapshot failures
        if: failure()
        uses: actions/upload-artifact@v2
        with:
          name: snapshot-diffs
          path: |
            test/snapshots/*.snap.actual
            test/snapshots/*.snap.diff
```

### Snapshot Review Process

1. **Developer creates PR** with changes
2. **CI runs tests** and detects snapshot changes
3. **Review snapshots** in PR review
4. **Update snapshots** if changes are intentional
5. **Merge PR** with updated snapshots

### Git Configuration

Add to `.gitignore`:

```gitignore
# Snapshot artifacts
*.snap.actual
*.snap.diff
*.snap.tmp

# But track actual snapshots
!*.snap
```

Add to `.gitattributes`:

```gitattributes
# Treat snapshots as binary to avoid line ending issues
*.snap binary
```

## Best Practices

### 1. Meaningful Names

Use descriptive snapshot names:

```typescript
// Bad
await tester.snapshot('test1');
await tester.snapshot('screen');

// Good
await tester.snapshot('login-form-empty');
await tester.snapshot('login-form-validation-error');
await tester.snapshot('dashboard-loaded-with-data');
```

### 2. Stable State

Ensure consistent state before snapshots:

```typescript
// Wait for animations to complete
await tester.sleep(500);

// Wait for data to load
await tester.waitFor(screen => 
  !screen.includes('Loading...')
);

// Now take snapshot
await tester.snapshot('stable-state');
```

### 3. Isolate Dynamic Content

Handle dynamic content appropriately:

```typescript
// Normalize timestamps
async function normalizeScreen(tester: TmuxTester): Promise<string> {
  const screen = await tester.getScreen();
  
  return screen
    // Replace timestamps
    .replace(/\d{2}:\d{2}:\d{2}/g, 'HH:MM:SS')
    // Replace dates
    .replace(/\d{4}-\d{2}-\d{2}/g, 'YYYY-MM-DD')
    // Replace IDs
    .replace(/id: [a-f0-9-]+/g, 'id: <ID>');
}

// Use normalized content for snapshot
const normalized = await normalizeScreen(tester);
await tester.snapshot('normalized-content', {
  customContent: normalized
});
```

### 4. Multiple Viewports

Test different terminal sizes:

```typescript
const sizes = [
  { cols: 80, rows: 24 },   // Standard
  { cols: 120, rows: 40 },  // Large
  { cols: 40, rows: 20 }    // Small
];

for (const size of sizes) {
  it(`should render correctly at ${size.cols}x${size.rows}`, async () => {
    const tester = createTester('app', { ...size });
    await tester.start();
    
    await tester.waitFor(screen => screen.includes('Ready'));
    
    await tester.snapshot(`home-${size.cols}x${size.rows}`);
    
    await tester.stop();
  });
}
```

### 5. Color Support

Test with different color modes:

```typescript
describe('Color Support', () => {
  it('should render in monochrome', async () => {
    const tester = createTester('app', {
      env: { NO_COLOR: '1' }
    });
    
    await tester.start();
    await tester.snapshot('monochrome');
    await tester.stop();
  });

  it('should render in 256 colors', async () => {
    const tester = createTester('app', {
      env: { TERM: 'xterm-256color' }
    });
    
    await tester.start();
    await tester.snapshot('256-colors');
    await tester.stop();
  });
});
```

## Troubleshooting

### Common Issues

#### 1. Snapshots Differ Between Environments

**Problem**: Snapshots pass locally but fail in CI.

**Solutions**:
- Use consistent terminal settings
- Strip ANSI codes
- Normalize dynamic content
- Use Docker for consistent environment

```typescript
// Ensure consistent environment
const tester = createTester('app', {
  env: {
    TERM: 'xterm',
    LANG: 'en_US.UTF-8',
    TZ: 'UTC'
  }
});
```

#### 2. Large Snapshot Files

**Problem**: Snapshot files are too large.

**Solutions**:
- Strip unnecessary whitespace
- Remove ANSI codes
- Compress snapshots
- Store only relevant portions

```typescript
// Capture only relevant area
async function captureRegion(
  tester: TmuxTester,
  startLine: number,
  endLine: number
): Promise<string> {
  const lines = await tester.getLines();
  return lines.slice(startLine, endLine).join('\n');
}

const region = await captureRegion(tester, 5, 15);
await tester.snapshot('content-region', {
  customContent: region
});
```

#### 3. Flaky Snapshots

**Problem**: Snapshots randomly fail.

**Solutions**:
- Add proper waits
- Disable animations
- Mock time-dependent data
- Increase timeout values

```typescript
// Disable animations
const tester = createTester('app', {
  env: {
    NO_ANIMATION: 'true',
    TESTING: 'true'
  }
});

// Wait for stable state
await tester.waitFor(screen => 
  screen.includes('Ready') &&
  !screen.includes('Loading')
);

// Add buffer time
await tester.sleep(100);

// Now safe to snapshot
await tester.snapshot('stable');
```

### Debug Mode

Enable debug mode for snapshot issues:

```typescript
const tester = createTester('app', {
  debug: true,
  snapshotDebug: true
});

// Will output:
// - Snapshot file path
// - Comparison details
// - Diff visualization
```

### Manual Verification

Manually inspect snapshots:

```bash
# View snapshot content
cat test/snapshots/home-screen.snap

# Compare snapshots
diff test/snapshots/home-screen.snap \
     test/snapshots/home-screen.snap.actual

# Visual diff
vimdiff test/snapshots/home-screen.snap \
        test/snapshots/home-screen.snap.actual
```