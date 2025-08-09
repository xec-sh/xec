# E2E Testing Specification for Terex Terminal UI Library

## Executive Summary

This specification defines a comprehensive end-to-end (E2E) testing strategy for the Terex terminal UI library using `node-pty` to create a real pseudo-terminal environment. The goal is to test the library as if a real user is interacting with it in an actual terminal, bridging the gap between unit tests and real-world usage.

## Problem Statement

While unit tests show high coverage (~95%), the library behaves differently in real terminal environments. This discrepancy occurs because:

1. **Mock Terminal Limitations**: Unit tests use simplified mock terminals that don't accurately emulate real terminal behavior
2. **ANSI Sequence Handling**: Real terminals process ANSI escape sequences differently than mocks
3. **Timing and Buffering**: Real terminals have different timing characteristics and buffer handling
4. **Input Processing**: Keyboard and mouse events are processed differently in real terminals
5. **Render Pipeline**: The complete render pipeline from component to terminal output isn't fully tested

## Solution Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                     E2E Test Suite                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Test Case  │  │ Virtual      │  │  Assertion   │        │
│  │  Runner     │→ │ Terminal     │→ │  Engine      │        │
│  └─────────────┘  └──────────────┘  └──────────────┘        │
│         ↓                ↓                   ↑              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   node-pty  │  │ ANSI Parser  │  │  Screen      │        │
│  │   Process   │→ │ & Interpreter│→ │  Buffer      │        │
│  └─────────────┘  └──────────────┘  └──────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1. Virtual Terminal Environment

```typescript
interface VirtualTerminal {
  // Terminal properties
  cols: number;
  rows: number;
  
  // Process management
  spawn(command: string, args: string[]): Promise<void>;
  kill(): void;
  
  // I/O operations
  write(data: string): void;
  onData(callback: (data: string) => void): void;
  
  // Screen state
  getScreen(): ScreenBuffer;
  getCursor(): CursorPosition;
  
  // Utilities
  waitForRender(timeout?: number): Promise<void>;
  takeSnapshot(): TerminalSnapshot;
}
```

### 2. Screen Buffer Implementation

```typescript
class ScreenBuffer {
  private cells: Cell[][];
  private cursor: CursorPosition;
  private scrollbackBuffer: Cell[][];
  
  constructor(cols: number, rows: number) {
    this.cells = Array(rows).fill(null).map(() => 
      Array(cols).fill(null).map(() => new Cell())
    );
  }
  
  // Get text content without styling
  getText(): string[];
  
  // Get content with ANSI styling preserved
  getStyledContent(): string[];
  
  // Get specific region
  getRegion(x: number, y: number, width: number, height: number): Cell[][];
  
  // Find text on screen
  findText(text: string): Position | null;
  
  // Check if text exists
  containsText(text: string): boolean;
}

interface Cell {
  char: string;
  fg: Color;
  bg: Color;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  blink: boolean;
  inverse: boolean;
  hidden: boolean;
}
```

### 3. ANSI Parser and Interpreter

```typescript
class ANSIInterpreter {
  private screen: ScreenBuffer;
  private parser: ANSIParser;
  
  process(data: string): void {
    const sequences = this.parser.parse(data);
    
    for (const seq of sequences) {
      switch (seq.type) {
        case 'text':
          this.writeText(seq.content);
          break;
        case 'cursor':
          this.moveCursor(seq.params);
          break;
        case 'style':
          this.applyStyle(seq.params);
          break;
        case 'erase':
          this.eraseDisplay(seq.params);
          break;
        // ... more sequence types
      }
    }
  }
}
```

## Testing Hierarchy

### Level 1: Core Primitives Testing

Test the most basic terminal operations:

```typescript
describe('E2E: Core Primitives', () => {
  test('Text rendering', async () => {
    const terminal = await VirtualTerminal.create();
    const app = await terminal.spawn('node', ['examples/text-demo.js']);
    
    await terminal.waitForRender();
    
    const screen = terminal.getScreen();
    expect(screen.containsText('Hello, World!')).toBe(true);
    expect(screen.getCursor()).toEqual({ x: 13, y: 0 });
  });
  
  test('Color support', async () => {
    const terminal = await VirtualTerminal.create();
    const app = await terminal.spawn('node', ['examples/color-demo.js']);
    
    await terminal.waitForRender();
    
    const screen = terminal.getScreen();
    const cell = screen.getCell(0, 0);
    expect(cell.fg).toEqual({ r: 255, g: 0, b: 0 }); // Red text
  });
  
  test('Cursor movement', async () => {
    const terminal = await VirtualTerminal.create();
    const app = await terminal.spawn('node', ['examples/cursor-demo.js']);
    
    await terminal.waitForRender();
    
    const positions = [];
    terminal.onCursorMove((pos) => positions.push(pos));
    
    await terminal.write('\x1b[A'); // Up arrow
    await terminal.write('\x1b[B'); // Down arrow
    
    expect(positions).toHaveLength(2);
  });
});
```

### Level 2: Component Testing

Test individual UI components in isolation:

```typescript
describe('E2E: Components', () => {
  describe('Text Component', () => {
    test('renders with wrapping', async () => {
      const terminal = await VirtualTerminal.create({ cols: 20, rows: 10 });
      const app = await terminal.spawn('node', ['examples/text-wrap.js']);
      
      await terminal.waitForRender();
      
      const screen = terminal.getScreen();
      const lines = screen.getText();
      
      expect(lines[0]).toBe('This is a very long');
      expect(lines[1]).toBe('text that should');
      expect(lines[2]).toBe('wrap correctly');
    });
  });
  
  describe('Box Component', () => {
    test('renders with borders', async () => {
      const terminal = await VirtualTerminal.create();
      const app = await terminal.spawn('node', ['examples/box.js']);
      
      await terminal.waitForRender();
      
      const screen = terminal.getScreen();
      
      // Check corners
      expect(screen.getCell(0, 0).char).toBe('┌');
      expect(screen.getCell(19, 0).char).toBe('┐');
      expect(screen.getCell(0, 9).char).toBe('└');
      expect(screen.getCell(19, 9).char).toBe('┘');
      
      // Check title
      expect(screen.findText('│ Title │')).toBeTruthy();
    });
  });
  
  describe('Select Component', () => {
    test('keyboard navigation', async () => {
      const terminal = await VirtualTerminal.create();
      const app = await terminal.spawn('node', ['examples/select.js']);
      
      await terminal.waitForRender();
      
      // Initial state
      let screen = terminal.getScreen();
      expect(screen.containsText('▶ Option 1')).toBe(true);
      expect(screen.containsText('  Option 2')).toBe(true);
      
      // Navigate down
      await terminal.write('\x1b[B'); // Down arrow
      await terminal.waitForRender();
      
      screen = terminal.getScreen();
      expect(screen.containsText('  Option 1')).toBe(true);
      expect(screen.containsText('▶ Option 2')).toBe(true);
      
      // Select
      await terminal.write('\r'); // Enter
      await terminal.waitForRender();
      
      screen = terminal.getScreen();
      expect(screen.containsText('Selected: Option 2')).toBe(true);
    });
  });
});
```

### Level 3: Interactive Components Testing

Test complex interactive components:

```typescript
describe('E2E: Interactive Components', () => {
  describe('TextInput', () => {
    test('typing and editing', async () => {
      const terminal = await VirtualTerminal.create();
      const app = await terminal.spawn('node', ['examples/text-input.js']);
      
      await terminal.waitForRender();
      
      // Type text
      await terminal.write('Hello');
      await terminal.waitForRender();
      
      let screen = terminal.getScreen();
      expect(screen.containsText('Hello')).toBe(true);
      expect(screen.getCursor()).toEqual({ x: 5, y: 0 });
      
      // Backspace
      await terminal.write('\x7f'); // Backspace
      await terminal.waitForRender();
      
      screen = terminal.getScreen();
      expect(screen.containsText('Hell')).toBe(true);
      
      // Ctrl+A (select all)
      await terminal.write('\x01');
      // Delete
      await terminal.write('\x7f');
      
      screen = terminal.getScreen();
      expect(screen.containsText('Hell')).toBe(false);
    });
    
    test('validation', async () => {
      const terminal = await VirtualTerminal.create();
      const app = await terminal.spawn('node', ['examples/validated-input.js']);
      
      await terminal.waitForRender();
      
      // Type invalid email
      await terminal.write('invalid');
      await terminal.write('\r'); // Enter
      
      await terminal.waitForRender();
      
      const screen = terminal.getScreen();
      expect(screen.containsText('Invalid email')).toBe(true);
      
      // Fix it
      await terminal.write('@example.com');
      await terminal.write('\r');
      
      await terminal.waitForRender();
      expect(screen.containsText('✓ Valid')).toBe(true);
    });
  });
  
  describe('Table Component', () => {
    test('scrolling and selection', async () => {
      const terminal = await VirtualTerminal.create({ rows: 10 });
      const app = await terminal.spawn('node', ['examples/table.js']);
      
      await terminal.waitForRender();
      
      // Check header
      let screen = terminal.getScreen();
      expect(screen.containsText('Name')).toBe(true);
      expect(screen.containsText('Age')).toBe(true);
      
      // Scroll down
      for (let i = 0; i < 5; i++) {
        await terminal.write('\x1b[B'); // Down arrow
        await terminal.waitForRender();
      }
      
      // Check if scrolled
      screen = terminal.getScreen();
      const visibleRows = screen.getText().filter(line => 
        line.includes('Row')
      );
      expect(visibleRows.length).toBeLessThanOrEqual(8); // Minus header
      
      // Select row
      await terminal.write(' '); // Space to select
      await terminal.waitForRender();
      
      screen = terminal.getScreen();
      expect(screen.containsText('[✓]')).toBe(true);
    });
    
    test('sorting', async () => {
      const terminal = await VirtualTerminal.create();
      const app = await terminal.spawn('node', ['examples/sortable-table.js']);
      
      await terminal.waitForRender();
      
      // Press 's' for sort menu
      await terminal.write('s');
      await terminal.waitForRender();
      
      // Select 'Age' column
      await terminal.write('\x1b[B'); // Down to Age option
      await terminal.write('\r'); // Enter
      
      await terminal.waitForRender();
      
      const screen = terminal.getScreen();
      const rows = screen.getText().filter(line => line.includes('Row'));
      
      // Verify sorted by age
      const ages = rows.map(row => parseInt(row.match(/\d+/)?.[0] || '0'));
      expect(ages).toEqual([...ages].sort((a, b) => a - b));
    });
  });
});
```

### Level 4: Complex Forms and Wizards

Test multi-step forms and complex interactions:

```typescript
describe('E2E: Forms and Wizards', () => {
  test('multi-field form', async () => {
    const terminal = await VirtualTerminal.create();
    const app = await terminal.spawn('node', ['examples/user-form.js']);
    
    await terminal.waitForRender();
    
    // Fill first field (name)
    await terminal.write('John Doe');
    await terminal.write('\t'); // Tab to next field
    
    // Fill email
    await terminal.write('john@example.com');
    await terminal.write('\t');
    
    // Fill age
    await terminal.write('25');
    await terminal.write('\t');
    
    // Select country (dropdown)
    await terminal.write('\r'); // Open dropdown
    await terminal.write('\x1b[B'); // Down to second option
    await terminal.write('\r'); // Select
    
    // Submit form
    await terminal.write('\x1b[0J'); // Ctrl+Enter to submit
    
    await terminal.waitForRender();
    
    const screen = terminal.getScreen();
    expect(screen.containsText('Form submitted successfully')).toBe(true);
    expect(screen.containsText('Name: John Doe')).toBe(true);
    expect(screen.containsText('Email: john@example.com')).toBe(true);
  });
  
  test('wizard navigation', async () => {
    const terminal = await VirtualTerminal.create();
    const app = await terminal.spawn('node', ['examples/setup-wizard.js']);
    
    await terminal.waitForRender();
    
    // Step 1
    let screen = terminal.getScreen();
    expect(screen.containsText('Step 1 of 3')).toBe(true);
    
    await terminal.write('Project Name');
    await terminal.write('\r'); // Next
    
    // Step 2
    await terminal.waitForRender();
    screen = terminal.getScreen();
    expect(screen.containsText('Step 2 of 3')).toBe(true);
    
    // Go back
    await terminal.write('\x1b[D'); // Left arrow or specific back key
    await terminal.waitForRender();
    
    screen = terminal.getScreen();
    expect(screen.containsText('Step 1 of 3')).toBe(true);
    expect(screen.containsText('Project Name')).toBe(true); // Data preserved
  });
});
```

### Level 5: Layout and Responsive Testing

Test layout systems and responsive behavior:

```typescript
describe('E2E: Layout Systems', () => {
  test('flex layout', async () => {
    const terminal = await VirtualTerminal.create({ cols: 80, rows: 24 });
    const app = await terminal.spawn('node', ['examples/flex-layout.js']);
    
    await terminal.waitForRender();
    
    const screen = terminal.getScreen();
    
    // Check horizontal alignment
    const row = screen.getText()[0];
    expect(row.indexOf('Left')).toBeLessThan(row.indexOf('Center'));
    expect(row.indexOf('Center')).toBeLessThan(row.indexOf('Right'));
  });
  
  test('grid layout', async () => {
    const terminal = await VirtualTerminal.create({ cols: 80, rows: 24 });
    const app = await terminal.spawn('node', ['examples/grid-layout.js']);
    
    await terminal.waitForRender();
    
    const screen = terminal.getScreen();
    
    // Find grid cells
    const cell1 = screen.findText('Cell 1');
    const cell2 = screen.findText('Cell 2');
    const cell3 = screen.findText('Cell 3');
    const cell4 = screen.findText('Cell 4');
    
    // Check 2x2 grid positioning
    expect(cell1.y).toBe(cell2.y);
    expect(cell3.y).toBe(cell4.y);
    expect(cell1.x).toBe(cell3.x);
    expect(cell2.x).toBe(cell4.x);
  });
  
  test('responsive resize', async () => {
    const terminal = await VirtualTerminal.create({ cols: 80, rows: 24 });
    const app = await terminal.spawn('node', ['examples/responsive.js']);
    
    await terminal.waitForRender();
    
    let screen = terminal.getScreen();
    expect(screen.containsText('Desktop View')).toBe(true);
    
    // Resize terminal
    await terminal.resize(40, 24);
    await terminal.waitForRender();
    
    screen = terminal.getScreen();
    expect(screen.containsText('Mobile View')).toBe(true);
  });
});
```

### Level 6: Performance and Stress Testing

Test performance under load:

```typescript
describe('E2E: Performance', () => {
  test('rapid updates', async () => {
    const terminal = await VirtualTerminal.create();
    const app = await terminal.spawn('node', ['examples/live-data.js']);
    
    await terminal.waitForRender();
    
    const frameRates = [];
    let lastRender = Date.now();
    
    terminal.onRender(() => {
      const now = Date.now();
      const fps = 1000 / (now - lastRender);
      frameRates.push(fps);
      lastRender = now;
    });
    
    // Wait for 100 updates
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const avgFps = frameRates.reduce((a, b) => a + b, 0) / frameRates.length;
    expect(avgFps).toBeGreaterThan(30); // Should maintain 30+ FPS
  });
  
  test('large data rendering', async () => {
    const terminal = await VirtualTerminal.create();
    const app = await terminal.spawn('node', ['examples/large-table.js']);
    
    const startTime = Date.now();
    await terminal.waitForRender();
    const renderTime = Date.now() - startTime;
    
    expect(renderTime).toBeLessThan(1000); // Should render within 1 second
    
    const screen = terminal.getScreen();
    expect(screen.containsText('10000 rows')).toBe(true);
  });
  
  test('memory stability', async () => {
    const terminal = await VirtualTerminal.create();
    const app = await terminal.spawn('node', ['examples/memory-test.js']);
    
    const memoryUsage = [];
    
    for (let i = 0; i < 100; i++) {
      await terminal.write('r'); // Trigger re-render
      await terminal.waitForRender();
      
      memoryUsage.push(process.memoryUsage().heapUsed);
      
      if (i > 10) {
        // Check for memory leaks (should not grow linearly)
        const recent = memoryUsage.slice(-10);
        const growth = recent[9] - recent[0];
        expect(growth).toBeLessThan(1024 * 1024); // Less than 1MB growth
      }
    }
  });
});
```

### Level 7: Integration Testing

Test complete applications:

```typescript
describe('E2E: Complete Applications', () => {
  test('todo app workflow', async () => {
    const terminal = await VirtualTerminal.create();
    const app = await terminal.spawn('node', ['examples/todo-app.js']);
    
    await terminal.waitForRender();
    
    // Add task
    await terminal.write('a'); // Add command
    await terminal.waitForRender();
    
    await terminal.write('Buy groceries');
    await terminal.write('\r');
    
    // Verify task added
    let screen = terminal.getScreen();
    expect(screen.containsText('Buy groceries')).toBe(true);
    expect(screen.containsText('[ ]')).toBe(true); // Unchecked
    
    // Complete task
    await terminal.write('\x1b[B'); // Down to task
    await terminal.write(' '); // Space to toggle
    
    await terminal.waitForRender();
    
    screen = terminal.getScreen();
    expect(screen.containsText('[✓]')).toBe(true); // Checked
    
    // Delete task
    await terminal.write('d'); // Delete command
    await terminal.write('y'); // Confirm
    
    await terminal.waitForRender();
    
    screen = terminal.getScreen();
    expect(screen.containsText('Buy groceries')).toBe(false);
  });
  
  test('file browser navigation', async () => {
    const terminal = await VirtualTerminal.create();
    const app = await terminal.spawn('node', ['examples/file-browser.js']);
    
    await terminal.waitForRender();
    
    // Navigate to folder
    const screen = terminal.getScreen();
    const folderPos = screen.findText('📁 src');
    
    // Move cursor to folder
    for (let i = 0; i < folderPos.y; i++) {
      await terminal.write('\x1b[B');
    }
    
    // Enter folder
    await terminal.write('\r');
    await terminal.waitForRender();
    
    // Verify we're in the folder
    expect(screen.containsText('src/')).toBe(true);
    expect(screen.containsText('index.ts')).toBe(true);
    
    // Go back
    await terminal.write('\x1b[D'); // Left arrow or backspace
    await terminal.waitForRender();
    
    expect(screen.containsText('src/')).toBe(false);
  });
});
```

## Testing Utilities

### Snapshot Testing

```typescript
class SnapshotManager {
  saveSnapshot(name: string, screen: ScreenBuffer): void {
    const snapshot = {
      text: screen.getText(),
      styled: screen.getStyledContent(),
      cursor: screen.getCursor(),
      dimensions: { cols: screen.cols, rows: screen.rows },
      timestamp: Date.now()
    };
    
    fs.writeFileSync(
      `__snapshots__/${name}.json`,
      JSON.stringify(snapshot, null, 2)
    );
  }
  
  compareSnapshot(name: string, screen: ScreenBuffer): SnapshotDiff | null {
    const saved = JSON.parse(
      fs.readFileSync(`__snapshots__/${name}.json`, 'utf-8')
    );
    
    // Intelligent comparison that ignores timing-dependent changes
    return this.intelligentDiff(saved, screen);
  }
}
```

### Visual Regression Testing

```typescript
class VisualRegression {
  async captureScreenshot(terminal: VirtualTerminal): Promise<Buffer> {
    const screen = terminal.getScreen();
    
    // Convert to PNG using canvas or similar
    const canvas = createCanvas(screen.cols * 8, screen.rows * 16);
    const ctx = canvas.getContext('2d');
    
    // Render each cell
    for (let y = 0; y < screen.rows; y++) {
      for (let x = 0; x < screen.cols; x++) {
        const cell = screen.getCell(x, y);
        this.renderCell(ctx, cell, x, y);
      }
    }
    
    return canvas.toBuffer('png');
  }
  
  async compareScreenshots(before: Buffer, after: Buffer): Promise<number> {
    // Use image comparison library
    const diff = await pixelmatch(before, after, ...);
    return diff / (before.length / 4); // Percentage difference
  }
}
```

### Input Helpers

```typescript
class InputHelpers {
  // Keyboard shortcuts
  static readonly Keys = {
    UP: '\x1b[A',
    DOWN: '\x1b[B',
    RIGHT: '\x1b[C',
    LEFT: '\x1b[D',
    ENTER: '\r',
    ESCAPE: '\x1b',
    TAB: '\t',
    BACKSPACE: '\x7f',
    DELETE: '\x1b[3~',
    HOME: '\x1b[H',
    END: '\x1b[F',
    PAGE_UP: '\x1b[5~',
    PAGE_DOWN: '\x1b[6~',
    
    // Control keys
    CTRL_A: '\x01',
    CTRL_C: '\x03',
    CTRL_V: '\x16',
    CTRL_X: '\x18',
    CTRL_Z: '\x1a',
    
    // Function keys
    F1: '\x1bOP',
    F2: '\x1bOQ',
    F3: '\x1bOR',
    F4: '\x1bOS',
  };
  
  // Mouse events
  static mouseClick(x: number, y: number): string {
    return `\x1b[<0;${x};${y}M\x1b[<0;${x};${y}m`;
  }
  
  static mouseDrag(x1: number, y1: number, x2: number, y2: number): string {
    // SGR mouse protocol
    const events = [];
    events.push(`\x1b[<0;${x1};${y1}M`); // Button down
    events.push(`\x1b[<32;${x2};${y2}M`); // Drag
    events.push(`\x1b[<0;${x2};${y2}m`); // Button up
    return events.join('');
  }
  
  static mouseScroll(x: number, y: number, direction: 'up' | 'down'): string {
    const button = direction === 'up' ? 64 : 65;
    return `\x1b[<${button};${x};${y}M`;
  }
}
```

## Test Data Management

### Fixture System

```typescript
class FixtureManager {
  static async loadFixture(name: string): Promise<any> {
    return JSON.parse(
      await fs.readFile(`fixtures/${name}.json`, 'utf-8')
    );
  }
  
  static async createMockData(type: string, count: number): Promise<any[]> {
    switch (type) {
      case 'users':
        return Array.from({ length: count }, (_, i) => ({
          id: i + 1,
          name: faker.name.fullName(),
          email: faker.internet.email(),
          age: faker.datatype.number({ min: 18, max: 80 })
        }));
      
      case 'products':
        return Array.from({ length: count }, (_, i) => ({
          id: i + 1,
          name: faker.commerce.productName(),
          price: faker.commerce.price(),
          category: faker.commerce.department()
        }));
      
      // ... more types
    }
  }
}
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        terminal: [xterm, xterm-256color, screen, tmux]
        node: [18, 20]
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node }}
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build library
        run: npm run build
      
      - name: Run E2E tests
        env:
          TERM: ${{ matrix.terminal }}
        run: npm run test:e2e
      
      - name: Upload screenshots
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: e2e-screenshots
          path: __screenshots__/
      
      - name: Upload terminal logs
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: terminal-logs
          path: __logs__/
```

### Docker Environment

```dockerfile
FROM node:20-slim

# Install terminal emulators and tools
RUN apt-get update && apt-get install -y \
    xterm \
    tmux \
    screen \
    ncurses-bin \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Run tests in different terminal environments
CMD ["npm", "run", "test:e2e:all"]
```

## Performance Benchmarks

### Benchmark Suite

```typescript
describe('E2E: Performance Benchmarks', () => {
  const benchmarks = [];
  
  afterAll(() => {
    // Generate report
    console.table(benchmarks);
    
    // Save to file
    fs.writeFileSync(
      'benchmark-results.json',
      JSON.stringify(benchmarks, null, 2)
    );
  });
  
  test('component render performance', async () => {
    const terminal = await VirtualTerminal.create();
    
    const components = [
      'text', 'box', 'table', 'form', 'tree'
    ];
    
    for (const component of components) {
      const app = await terminal.spawn('node', [
        'benchmarks',
        `${component}.js`
      ]);
      
      const start = performance.now();
      await terminal.waitForRender();
      const renderTime = performance.now() - start;
      
      benchmarks.push({
        component,
        renderTime,
        fps: 1000 / renderTime
      });
      
      expect(renderTime).toBeLessThan(100); // Max 100ms
      
      await app.kill();
    }
  });
  
  test('input latency', async () => {
    const terminal = await VirtualTerminal.create();
    const app = await terminal.spawn('node', ['examples/input-latency.js']);
    
    await terminal.waitForRender();
    
    const latencies = [];
    
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await terminal.write('a');
      await terminal.waitForRender();
      const latency = performance.now() - start;
      
      latencies.push(latency);
    }
    
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);
    
    expect(avgLatency).toBeLessThan(50); // Average < 50ms
    expect(maxLatency).toBeLessThan(100); // Max < 100ms
    
    benchmarks.push({
      test: 'input-latency',
      avg: avgLatency,
      max: maxLatency,
      p95: latencies.sort((a, b) => a - b)[95]
    });
  });
});
```

## Debugging Support

### Debug Mode

```typescript
class DebugTerminal extends VirtualTerminal {
  private debugLog: string[] = [];
  
  constructor(options: TerminalOptions & { debug: boolean }) {
    super(options);
    
    if (options.debug) {
      this.enableDebugMode();
    }
  }
  
  private enableDebugMode() {
    // Log all ANSI sequences
    this.onData((data) => {
      const readable = data
        .replace(/\x1b/g, '\\x1b')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
      
      this.debugLog.push(`[${Date.now()}] OUT: ${readable}`);
    });
    
    // Log all input
    const originalWrite = this.write.bind(this);
    this.write = (data: string) => {
      const readable = data
        .replace(/\x1b/g, '\\x1b')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
      
      this.debugLog.push(`[${Date.now()}] IN: ${readable}`);
      return originalWrite(data);
    };
  }
  
  saveDebugLog(path: string) {
    fs.writeFileSync(path, this.debugLog.join('\n'));
  }
  
  getDebugInfo() {
    return {
      log: this.debugLog,
      screen: this.getScreen().getText(),
      cursor: this.getCursor(),
      stats: {
        totalInput: this.debugLog.filter(l => l.includes('IN:')).length,
        totalOutput: this.debugLog.filter(l => l.includes('OUT:')).length,
        renderCount: this.renderCount
      }
    };
  }
}
```

### Recording and Playback

```typescript
class TerminalRecorder {
  private recording: Recording = {
    events: [],
    startTime: Date.now(),
    terminal: { cols: 80, rows: 24 }
  };
  
  record(terminal: VirtualTerminal) {
    terminal.onData((data) => {
      this.recording.events.push({
        type: 'output',
        data,
        timestamp: Date.now() - this.recording.startTime
      });
    });
    
    const originalWrite = terminal.write.bind(terminal);
    terminal.write = (data: string) => {
      this.recording.events.push({
        type: 'input',
        data,
        timestamp: Date.now() - this.recording.startTime
      });
      return originalWrite(data);
    };
  }
  
  async playback(terminal: VirtualTerminal, speed: number = 1) {
    for (const event of this.recording.events) {
      await new Promise(resolve => 
        setTimeout(resolve, event.timestamp / speed)
      );
      
      if (event.type === 'input') {
        terminal.write(event.data);
      }
      // Output events are just for reference
    }
  }
  
  save(path: string) {
    fs.writeFileSync(path, JSON.stringify(this.recording, null, 2));
  }
  
  load(path: string) {
    this.recording = JSON.parse(fs.readFileSync(path, 'utf-8'));
  }
}
```

## Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1) ✅ COMPLETED
1. ✅ Set up node-pty integration
2. ✅ Implement VirtualTerminal class
3. ✅ Create ScreenBuffer implementation
4. ✅ Build ANSI parser and interpreter
5. ✅ Add basic assertion helpers

### Phase 2: Component Tests (Week 2)
1. ✅ Implement primitive component tests
2. ✅ Add interactive component tests
3. ✅ Create layout system tests
4. ✅ Build form and wizard tests
   - ✅ Layer 1 (Instant API) tests implemented
   - ✅ Layer 2 (Reactive API) tests implemented  
   - ✅ Layer 3 (Advanced API) tests implemented

### Phase 3: Integration & Performance (Week 3)
1. Create complete application tests
2. Add performance benchmarks
3. Implement stress tests
4. Build memory leak detection

### Phase 4: Tools & Utilities (Week 4)
1. Create snapshot system
2. Add visual regression testing
3. Build debugging tools
4. Implement recording/playback

### Phase 5: CI/CD & Documentation (Week 5)
1. Set up CI/CD pipeline
2. Create Docker environments
3. Write documentation
4. Build example test suites

## Success Criteria

1. **Coverage**: 100% of user-facing functionality tested via E2E
2. **Reliability**: Less than 0.1% flaky test rate
3. **Performance**: All tests complete within 5 minutes
4. **Compatibility**: Tests pass on Linux, macOS, and Windows
5. **Debugging**: Failed tests provide clear diagnostics
6. **Maintenance**: Tests are easy to write and maintain

## Conclusion

This E2E testing specification provides a comprehensive framework for testing the Terex terminal UI library in real terminal environments. By using node-pty and implementing proper terminal emulation, we can ensure that the library behaves correctly in production scenarios, bridging the gap between unit tests and real-world usage.

The hierarchical testing approach, from primitives to complete applications, ensures thorough coverage while maintaining test clarity and maintainability. The debugging and diagnostic tools provide the necessary visibility when tests fail, making it easy to identify and fix issues.

With this testing infrastructure in place, we can confidently ship Terex knowing it will work reliably across different terminal environments and use cases.