# Aura Table Component Specification

## Overview
The Table component provides a flexible, performant, and themeable way to display tabular data in terminal applications. It follows the established Aura component patterns and integrates seamlessly with the reactive system.

## Core Design Principles

### 1. Simplicity First
- Simple API that covers 80% of use cases
- Progressive enhancement through composition
- Minimal required props for basic usage
- Smart defaults based on data structure

### 2. Performance Optimization
- Native Rust rendering for large datasets
- Virtual scrolling for tables with many rows
- Column width caching and memoization
- Efficient diff-based updates

### 3. Theme Integration
- Full theme support via global theme system
- State-based styling (focused, selected, disabled)
- Consistent with other Aura components
- Support for both light and dark themes

### 4. Accessibility & Usability
- Keyboard navigation (arrow keys, vim bindings)
- Column sorting indicators
- Row selection with visual feedback
- Scroll indicators for large tables

## API Design

### Basic Props Interface

```typescript
export interface TableColumn {
  key: string;              // Unique column identifier
  title: string;            // Display title
  width?: number | 'auto';  // Fixed width or auto-calculate
  align?: 'left' | 'center' | 'right';  // Text alignment
  truncate?: TruncateMode;  // How to handle overflow
  formatter?: (value: any) => string;  // Custom cell formatter
}

export interface TableRow {
  [key: string]: any;       // Row data indexed by column key
  _id?: string;            // Optional unique row identifier
  _selected?: boolean;     // Optional selection state
  _disabled?: boolean;     // Optional disabled state
}

export interface TableProps extends ComponentProps {
  // Data
  columns: TableColumn[];
  rows: TableRow[];
  
  // Layout
  showHeader?: boolean;           // Show column headers (default: true)
  showBorder?: boolean;           // Show table borders (default: true)
  borderStyle?: BorderStyle;      // Border style (single, double, rounded, etc.)
  customBorderChars?: BorderCharacters;  // Custom border characters
  columnDivider?: boolean;        // Show vertical dividers between columns
  rowDivider?: boolean;          // Show horizontal dividers between rows
  compactMode?: boolean;         // Reduce padding for compact display
  
  // Behavior
  selectable?: boolean;          // Enable row selection (default: false)
  multiSelect?: boolean;         // Allow multiple selection (default: false)
  sortable?: boolean;           // Enable column sorting (default: false)
  scrollable?: boolean;         // Enable vertical scrolling (default: true)
  wrapText?: boolean;          // Wrap long text to multiple lines (default: false)
  
  // Appearance
  headerStyle?: TextStyle;      // Style for header row
  alternateRowColors?: boolean; // Alternate row background colors
  highlightOnHover?: boolean;   // Highlight row on hover/focus
  
  // Colors (theme tokens or direct colors)
  backgroundColor?: Color;
  borderColor?: Color;
  headerBackgroundColor?: Color;
  headerTextColor?: Color;
  selectedBackgroundColor?: Color;
  selectedTextColor?: Color;
  alternateRowColor?: Color;
  
  // Events
  onRowSelect?: (row: TableRow, index: number) => void;
  onSort?: (column: TableColumn, direction: 'asc' | 'desc') => void;
  onCellEdit?: (row: TableRow, column: TableColumn, value: any) => void;
}

export enum TruncateMode {
  END = 'end',       // "Long text..."
  START = 'start',   // "...ong text"
  MIDDLE = 'middle', // "Long...text"
  NONE = 'none'      // No truncation
}

export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
}
```

## Table Variations

### 1. Basic Table (Default)
Simple table with borders and headers.

```
┌─────────┬──────────┬───────────┐
│ Name    │ Age      │ City      │
├─────────┼──────────┼───────────┤
│ Alice   │ 30       │ New York  │
│ Bob     │ 25       │ London    │
│ Charlie │ 35       │ Tokyo     │
└─────────┴──────────┴───────────┘
```

### 2. Borderless Table
Clean, minimal table without borders.

```
Name      Age    City     
─────────────────────────
Alice     30     New York 
Bob       25     London   
Charlie   35     Tokyo    
```

### 3. Header-Only Borders
Table with only header separator.

```
Name      Age    City     
═════════════════════════
Alice     30     New York 
Bob       25     London   
Charlie   35     Tokyo    
```

### 4. Compact Table
Minimal spacing for data-dense displays.

```
┌──────┬───┬────────┐
│Name  │Age│City    │
├──────┼───┼────────┤
│Alice │30 │New York│
│Bob   │25 │London  │
│Charlie│35│Tokyo   │
└──────┴───┴────────┘
```

### 5. Selectable Table with Indicators
Shows selection state with visual indicators.

```
┌─┬─────────┬──────────┬───────────┐
│ │ Name    │ Age      │ City      │
├─┼─────────┼──────────┼───────────┤
│▶│ Alice   │ 30       │ New York  │  ← Selected
│ │ Bob     │ 25       │ London    │
│ │ Charlie │ 35       │ Tokyo     │
└─┴─────────┴──────────┴───────────┘
```

### 6. Tree Table (Hierarchical)
Displays hierarchical data with indentation.

```
┌──────────────────┬────────┬───────┐
│ Name             │ Type   │ Size  │
├──────────────────┼────────┼───────┤
│ ▼ src/           │ folder │ -     │
│   ├─ index.ts    │ file   │ 2.3KB │
│   └─ utils.ts    │ file   │ 1.5KB │
│ ▶ docs/          │ folder │ -     │
│ package.json     │ file   │ 0.8KB │
└──────────────────┴────────┴───────┘
```

### 7. Grid Table (Spreadsheet-like)
All cells have visible borders.

```
╔═══════╦═══════╦═══════╦═══════╗
║   A   ║   B   ║   C   ║   D   ║
╠═══════╬═══════╬═══════╬═══════╣
║   1   ║   2   ║   3   ║   4   ║
╠═══════╬═══════╬═══════╬═══════╣
║   5   ║   6   ║   7   ║   8   ║
╚═══════╩═══════╩═══════╩═══════╝
```

### 8. ASCII Art Table
Pure ASCII characters for compatibility.

```
+-------+--------+---------+
| Name  | Age    | City    |
+-------+--------+---------+
| Alice | 30     | NewYork |
| Bob   | 25     | London  |
+-------+--------+---------+
```

## Component Implementation Architecture

### TypeScript Component Structure

```typescript
export class TableComponent extends Component {
  protected focusable: boolean = true;
  
  private _columns: TableColumn[];
  private _rows: TableRow[];
  private _selectedIndices: Set<number>;
  private _sortColumn?: string;
  private _sortDirection: 'asc' | 'desc' = 'asc';
  private _scrollOffset: number = 0;
  private _columnWidths: Map<string, number>;
  private _maxVisibleRows: number;
  
  constructor(ctx: RenderContext, options: TableProps) {
    super(ctx, options);
    // Initialize with theme support
    this.initializeFromTheme();
    this.calculateColumnWidths();
    this.setupEventHandlers();
  }
  
  protected renderSelf(buffer: OptimizedBuffer): void {
    // Delegate to native rendering for performance
    this.renderTableNative();
  }
  
  private renderTableNative(): void {
    // Call Rust native renderer
    buffer.drawTable({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      columns: this._columns,
      rows: this.getVisibleRows(),
      options: this.getRenderOptions()
    });
  }
}
```

### Native Rust Optimization

```rust
// In buffer.rs
pub fn draw_table(
    &mut self,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    columns: &[TableColumn],
    rows: &[TableRow],
    options: &TableRenderOptions,
) -> Result<(), BufferError> {
    // Optimized table rendering algorithm
    // 1. Calculate column widths if auto
    // 2. Render header if enabled
    // 3. Render visible rows with virtual scrolling
    // 4. Apply selection/hover states
    // 5. Draw borders efficiently
}

// Column width calculation with caching
pub fn calculate_column_widths(
    columns: &[TableColumn],
    rows: &[TableRow],
    available_width: u32,
) -> Vec<u32> {
    // Smart width distribution algorithm
    // 1. Respect fixed widths
    // 2. Calculate min/max for auto columns
    // 3. Distribute remaining space proportionally
}

// Efficient border drawing
pub fn draw_table_borders(
    &mut self,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    style: BorderStyle,
    column_widths: &[u32],
    options: &TableBorderOptions,
) {
    // Optimized border rendering
    // 1. Use lookup tables for border characters
    // 2. Batch similar operations
    // 3. Skip invisible regions
}
```

## Reactive Integration

### Signal-based Updates

```typescript
// In reactive-bridge.ts
export function createReactiveTable(props: ReactiveTableProps) {
  const table = new TableComponent(ctx, unwrapReactiveProps(props));
  
  // Bind reactive columns
  if (isSignal(props.columns)) {
    effect(() => {
      table.columns = props.columns();
      table.recalculateLayout();
    });
  }
  
  // Bind reactive rows with efficient diffing
  if (isSignal(props.rows)) {
    effect(() => {
      const newRows = props.rows();
      table.updateRows(newRows); // Efficient diff-based update
    });
  }
  
  return table;
}
```

### Computed Properties

```typescript
export interface ReactiveTableProps extends TableProps {
  columns: TableColumn[] | Signal<TableColumn[]>;
  rows: TableRow[] | Signal<TableRow[]>;
  selectedRows?: Signal<TableRow[]>;
  sortConfig?: Signal<{ column: string; direction: 'asc' | 'desc' }>;
}
```

## Performance Optimizations

### 1. Virtual Scrolling
- Only render visible rows
- Maintain scroll position during updates
- Smooth scrolling with keyboard navigation

### 2. Column Width Caching
- Cache calculated widths
- Invalidate only on data/size changes
- Reuse widths for similar data

### 3. Batch Updates
- Group multiple property changes
- Single render pass for multiple updates
- Debounce rapid changes

### 4. Native Rendering
- Rust implementation for heavy lifting
- SIMD optimizations where applicable
- Memory-efficient data structures

## Keyboard Navigation

### Default Bindings

| Key | Action |
|-----|--------|
| ↑/k | Move selection up |
| ↓/j | Move selection down |
| ←/h | Scroll left (if horizontal scroll) |
| →/l | Scroll right (if horizontal scroll) |
| PgUp | Page up |
| PgDn | Page down |
| Home | Go to first row |
| End | Go to last row |
| Space | Toggle row selection |
| Enter | Activate row (emit event) |
| Tab | Move to next column (if editable) |
| Shift+Tab | Move to previous column |

## Theme Integration

### Component Theme Structure

```typescript
export interface TableTheme {
  // Base colors
  background?: ColorToken;
  border?: ColorToken;
  text?: ColorToken;
  
  // Header
  header?: {
    background?: ColorToken;
    text?: ColorToken;
    border?: ColorToken;
  };
  
  // States
  states?: {
    selected?: {
      background?: ColorToken;
      text?: ColorToken;
    };
    hover?: {
      background?: ColorToken;
      text?: ColorToken;
    };
    disabled?: {
      background?: ColorToken;
      text?: ColorToken;
    };
  };
  
  // Alternating rows
  alternateRow?: {
    background?: ColorToken;
  };
  
  // Borders
  borders?: {
    style?: BorderStyle;
    dividers?: boolean;
  };
}
```

## Usage Examples

### Basic Table

```typescript
const table = new TableComponent(ctx, {
  columns: [
    { key: 'name', title: 'Name', width: 20 },
    { key: 'age', title: 'Age', width: 10, align: 'right' },
    { key: 'city', title: 'City', width: 'auto' }
  ],
  rows: [
    { name: 'Alice', age: 30, city: 'New York' },
    { name: 'Bob', age: 25, city: 'London' }
  ]
});
```

### Selectable Table with Events

```typescript
const table = new TableComponent(ctx, {
  columns: [...],
  rows: [...],
  selectable: true,
  multiSelect: true,
  onRowSelect: (row, index) => {
    console.log(`Selected row ${index}:`, row);
  },
  selectedBackgroundColor: 'primary',
  alternateRowColors: true
});
```

### Reactive Table

```typescript
const rows = signal([...]);
const selectedRows = signal([]);

const table = createReactiveTable({
  columns: [...],
  rows: rows,
  selectedRows: selectedRows,
  sortable: true,
  onSort: (column, direction) => {
    rows.update(r => sortRows(r, column, direction));
  }
});
```

## Testing Strategy

### Unit Tests
- Column width calculation
- Row selection logic
- Sorting functionality
- Event emission
- Theme application

### Integration Tests
- Rendering with different data types
- Keyboard navigation
- Scroll behavior
- Theme switching
- Reactive updates

### Performance Tests
- Large dataset rendering (10,000+ rows)
- Rapid updates
- Memory usage
- Scroll performance

## Migration Path

### From Simple Text Tables
1. Wrap existing data in TableRow format
2. Define columns with keys matching data properties
3. Apply minimal styling for similar appearance

### From Other Table Libraries
1. Map props to Aura table props
2. Convert event handlers
3. Apply theme-based styling

## Future Enhancements (Not in Initial Implementation)

These features are documented for potential future development:

1. **Cell Editing**: In-place editing with validation
2. **Column Resizing**: Interactive column width adjustment
3. **Row Grouping**: Group rows by column values
4. **Filtering**: Built-in row filtering
5. **Pagination**: Alternative to scrolling for large datasets
6. **Export**: Export table data to CSV/JSON
7. **Sticky Headers/Columns**: Keep headers/columns visible during scroll
8. **Cell Merging**: Span cells across columns/rows
9. **Custom Cell Renderers**: Component-based cell content
10. **Drag & Drop**: Reorder rows/columns via drag

## Implementation Checklist

- [ ] Core TypeScript component (`src/components/table.ts`)
- [ ] Native Rust renderer (`rust/src/table.rs`)
- [ ] FFI bindings for native functions
- [ ] Theme integration and defaults
- [ ] Reactive bridge support
- [ ] Keyboard navigation handlers
- [ ] Virtual scrolling implementation
- [ ] Column width calculation algorithm
- [ ] Unit tests
- [ ] Integration tests
- [ ] Performance benchmarks
- [ ] Documentation with examples
- [ ] Migration guide from text tables

## Summary

The Aura Table component provides a powerful yet simple API for displaying tabular data in terminal applications. By following established Aura patterns and leveraging native Rust optimization, it achieves excellent performance while maintaining ease of use. The component integrates seamlessly with the reactive system and theme engine, making it a natural fit for the Aura ecosystem.