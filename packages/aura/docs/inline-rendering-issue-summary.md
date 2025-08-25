# Inline Rendering Critical Issues - Summary

## The Core Problem

You correctly identified that I've been oscillating between two incomplete implementations:

1. **Current Implementation (Relative positioning with save/restore)**
   - ✅ Correct positioning relative to initial cursor
   - ❌ Loses text colors and attributes due to `\x1b[s]`/`\x1b[u]` limitations

2. **Alternative Implementation (Absolute positioning)**  
   - ✅ Preserves colors and attributes
   - ❌ Always renders from line 1, ignoring initial cursor position

## Why Current Implementation Fails

### The Save/Restore Limitation

```rust
// What we save (line 643):
output_buffer.extend_from_slice(b"\x1b[s]");  // ONLY saves cursor position

// What we restore (line 921):  
temp.push_str("\x1b[u");  // ONLY restores position, NOT attributes!
```

ANSI `\x1b[s]` (DECSC) and `\x1b[u]` (DECRC) only save/restore:
- Cursor position (row, column)

They DO NOT save/restore:
- Foreground color
- Background color  
- Text attributes (bold, italic, underline, etc.)

### Result
Every time we move the cursor using restore (`\x1b[u]`), the terminal resets to default text styling, causing all subsequent text to lose its colors and attributes.

## Why Space Allocation Fails

### Current Code (renderer.ts:1136)
```typescript
const renderHeight = Math.min(contentHeight, this.height);
```

### Problems:
1. **No cursor position detection** - Assumes we have full terminal height available
2. **No scrolling mechanism** - When cursor is at bottom, content overwrites previous lines
3. **No space pre-allocation** - Doesn't ensure space before rendering

### Scenario:
- Terminal height: 24 lines
- Cursor at line 22
- Content needs: 8 lines
- Available space: 3 lines (24 - 22 + 1)
- Result: Last 5 lines overwrite lines 1-5 of terminal!

## The Complete Solution

### Part 1: Attribute Preservation

Instead of save/restore, we need:

```rust
struct InlineState {
    start_row: u32,        // Initial cursor position
    start_col: u32,
    current_fg: Option<RGBA>,   // Track current colors
    current_bg: Option<RGBA>,
    current_attrs: u8,          // Track current attributes
}
```

Movement should:
1. Calculate absolute position from saved start
2. Use `\x1b[row;colH` for positioning
3. Re-apply current colors/attributes after movement

### Part 2: Space Allocation

```typescript
// 1. Query actual cursor position on start
const [startRow, startCol] = await queryCursorPosition();

// 2. Calculate available space
const available = terminalHeight - startRow + 1;

// 3. Scroll if needed
if (contentHeight > available) {
    const scrollLines = contentHeight - available;
    // Print newlines to scroll
    for (let i = 0; i < scrollLines; i++) {
        process.stdout.write('\n');
    }
    // Adjust start position
    startRow -= scrollLines;
}

// 4. Now render with confidence
```

## Files to Modify

1. **rust/src/renderer.rs**
   - Add `InlineState` struct
   - Replace save/restore with position tracking
   - Update `write_move_to_inline` to preserve attributes
   - Add cursor position querying

2. **src/renderer/renderer.ts**
   - Add `queryCursorPosition()` method
   - Add `ensureRenderSpace()` method
   - Update inline mode initialization
   - Calculate available space before rendering

## Testing

The test file (`test/inline-rendering-test.ts`) demonstrates both issues:
1. Colors disappearing after cursor movement
2. Content overwriting when starting from bottom

## Expected Behavior After Fix

- ✅ Text maintains colors through entire render
- ✅ Attributes (bold, italic, underline) preserved
- ✅ Terminal scrolls when needed to fit content
- ✅ No overwriting of previous terminal content
- ✅ Correct positioning relative to initial cursor
- ✅ Clean exit positioning after render

## Why This Keeps Happening

The fundamental misunderstanding is that ANSI save/restore cursor (`\x1b7`/`\x1b8` or `\x1b[s`/`\x1b[u`) is NOT a complete state save. It's just position. This is a common mistake because the names suggest they save "cursor state" but they only save cursor position.

The proper solution requires explicit tracking of ALL state we care about and re-applying it after position changes.