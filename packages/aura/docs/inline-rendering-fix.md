# Critical Inline Rendering Issues and Solutions

## Problems Identified

### 1. Attribute and Color Reset Issue
**Location**: `renderer.rs` lines 643, 647, 921

The current implementation uses ANSI escape codes `\x1b[s]` (save cursor) and `\x1b[u]` (restore cursor) which only save/restore cursor POSITION, not text attributes or colors.

**Current problematic flow**:
```rust
// Line 643: Save cursor position
output_buffer.extend_from_slice(b"\x1b[s");

// Line 921 in write_move_to_inline:
temp.push_str("\x1b[u");  // Restores position but LOSES colors/attributes!
```

**Result**: Text is rendered without colors or styles after cursor restore.

### 2. Insufficient Space Allocation
**Location**: `renderer.ts` line 1136

```typescript
const renderHeight = Math.min(contentHeight, this.height);
```

**Problem**: `this.height` is the full terminal height, but if cursor is at bottom, available space is less. The code doesn't:
- Query initial cursor position
- Calculate available space from cursor to terminal bottom
- Allocate space by scrolling if needed

**Result**: Content overwrites previous terminal content when cursor is near bottom.

## Root Cause Analysis

The implementation alternates between two incomplete approaches:
1. **Current**: Correct positioning but loses attributes (uses save/restore)
2. **Alternative**: Preserves attributes but breaks positioning (uses absolute positioning from line 1)

## Complete Solution

### Fix 1: Preserve Attributes During Movement

Instead of using `\x1b[s]` and `\x1b[u]`, we need to:

1. **Track cursor position explicitly**:
```rust
struct InlineRenderState {
    start_row: u32,      // Initial cursor row
    start_col: u32,      // Initial cursor column
    current_fg: Option<RGBA>,  // Current foreground color
    current_bg: Option<RGBA>,  // Current background color
    current_attrs: u8,         // Current attributes
}
```

2. **Query initial cursor position** using DSR (Device Status Report):
```rust
fn query_cursor_position() -> (u32, u32) {
    // Send DSR request
    write!(stdout, "\x1b[6n")?;
    stdout.flush()?;
    
    // Parse response: \x1b[{row};{col}R
    // Return (row, col)
}
```

3. **Rewrite `write_move_to_inline`** to use absolute positioning:
```rust
fn write_move_to_inline(buffer: &mut Vec<u8>, x: u32, y: u32, 
                        inline_state: &InlineRenderState) {
    // Calculate absolute position from saved start
    let abs_row = inline_state.start_row + y - 1;
    let abs_col = if x > 1 { x } else { inline_state.start_col };
    
    // Use CSI H for absolute positioning
    write!(buffer, "\x1b[{};{}H", abs_row, abs_col);
    
    // Restore attributes if needed
    if let Some(fg) = inline_state.current_fg {
        Self::write_fg_color(buffer, fg);
    }
    if let Some(bg) = inline_state.current_bg {
        Self::write_bg_color(buffer, bg);
    }
    if inline_state.current_attrs != 0 {
        Self::write_attributes(buffer, inline_state.current_attrs);
    }
}
```

### Fix 2: Proper Space Allocation

1. **Calculate available space**:
```typescript
// In renderer.ts
private calculateAvailableSpace(): number {
    // Get current cursor position
    const cursorRow = this.getCursorPosition();
    const terminalHeight = this.height;
    
    // Available space from cursor to bottom
    return terminalHeight - cursorRow + 1;
}
```

2. **Allocate space if needed**:
```typescript
private ensureRenderSpace(needed: number): void {
    const available = this.calculateAvailableSpace();
    
    if (needed > available) {
        // Need to scroll terminal up
        const scrollLines = needed - available;
        
        // Print newlines to scroll
        for (let i = 0; i < scrollLines; i++) {
            process.stdout.write('\n');
        }
        
        // Move cursor back up
        process.stdout.write(`\x1b[${scrollLines}A`);
        
        // Update start position
        this.inlineStartRow -= scrollLines;
    }
}
```

3. **Update render height calculation**:
```typescript
if (!this._useAlternateScreen) {
    const calculatedHeight = this.root.calculateLayout();
    const contentHeight = Math.ceil(calculatedHeight) || 1;
    
    // Ensure we have space for rendering
    this.ensureRenderSpace(contentHeight);
    
    // Now we can safely use the content height
    const renderHeight = contentHeight;
    
    // Update native renderer
    if (renderHeight !== this.linesRendered) {
        this.lib.resizeRenderer(this.rendererPtr, this.width, renderHeight);
        this.lib.setLinesRendered(this.rendererPtr, renderHeight);
        this.linesRendered = renderHeight;
    }
}
```

## Implementation Priority

1. **First**: Fix attribute preservation (more critical for visual correctness)
2. **Second**: Fix space allocation (improves usability)

## Testing the Fix

Create a test that:
1. Starts with cursor at bottom of terminal
2. Renders colored text in inline mode
3. Verifies colors are preserved
4. Verifies no content is overwritten

```typescript
// Test case
const test = () => {
    // Move cursor to bottom
    process.stdout.write(`\x1b[${process.stdout.rows}H`);
    
    // Render colored content
    renderer.renderInline({
        text: "Red text",
        color: [1, 0, 0, 1]
    });
    
    // Verify rendering
    // - Colors should be preserved
    // - Previous terminal content should not be overwritten
}
```

## Summary

The current inline rendering has two critical flaws:
1. **Color/attribute loss** due to cursor save/restore limitations
2. **Space allocation failure** when cursor is at terminal bottom

The solution requires:
- Explicit attribute tracking and restoration
- Proper cursor position querying
- Dynamic space allocation with scrolling

This will provide correct inline rendering that preserves both positioning AND styling.