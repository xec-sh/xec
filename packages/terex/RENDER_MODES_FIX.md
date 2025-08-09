# Render Modes Implementation - Terminal Clearing Fix

## Problem Statement
The `improved-terminal-demo.ts` example was clearing the terminal and rendering from the first line, despite `logUpdateStyle` being enabled by default. This violated the core concept of log-update style rendering, which should render at the current cursor position without clearing the terminal.

## Solution Implemented
Implemented two mutually exclusive render modes for the terex terminal rendering engine:

### 1. **Inline Mode** (Default)
- Renders at current cursor position
- Does NOT clear the terminal
- Preserves existing terminal content above and below
- Perfect for simple prompts, progress indicators, and log-update style rendering
- Disables advanced features like draggable and resizable components

### 2. **Fullscreen Mode**
- Takes over the entire terminal
- Clears screen and renders from top-left corner
- Enables advanced features:
  - Z-index layering via LayerManager
  - Draggable components
  - Resizable components
  - Full terminal control

## Implementation Details

### Core Changes

1. **Added RenderMode Type** (`render-engine.ts`)
   ```typescript
   export type RenderMode = 'inline' | 'fullscreen';
   ```

2. **Updated RenderEngineOptions**
   - Added `mode?: RenderMode` option
   - Maintained backward compatibility with deprecated `logUpdateStyle` option

3. **Modified performRender() Method**
   - Conditional rendering based on mode
   - Inline mode: Simple component rendering without layer management
   - Fullscreen mode: Full layer management with z-index support

4. **TerminalManager Updates**
   - Added `renderFullscreen()` method for fullscreen mode
   - Enhanced `renderAtPosition()` for inline mode
   - Proper cursor management for each mode

5. **Mouse Event Handling**
   - Draggable/resizable features only work in fullscreen mode
   - Mouse events are ignored in inline mode

### Factory Functions
Created dedicated factory functions for easy mode selection:

```typescript
// For inline mode (default, log-update style)
createInlineRenderEngine(options?: RenderEngineOptions): RenderEngine

// For fullscreen mode (full terminal control)
createFullscreenRenderEngine(options?: RenderEngineOptions): RenderEngine

// Legacy support (deprecated, maps to inline mode)
createLogUpdateRenderEngine(options?: RenderEngineOptions): RenderEngine
```

### LayerManager Integration
- Properly integrated LayerManager for fullscreen mode
- Fixed method calls: `clear()`, `push()`, `getRenderOrder()`
- Layer management only active in fullscreen mode

## Usage Examples

### Inline Mode (Default)
```typescript
import { createInlineRenderEngine } from '@xec-sh/terex';

const engine = createInlineRenderEngine();
// Renders at cursor position, doesn't clear terminal
```

### Fullscreen Mode
```typescript
import { createFullscreenRenderEngine } from '@xec-sh/terex';

const engine = createFullscreenRenderEngine();
// Takes over entire terminal, enables z-index/draggable/resizable
```

### Direct Mode Specification
```typescript
import { RenderEngine } from '@xec-sh/terex';

const engine = new RenderEngine(stream, {
  mode: 'inline', // or 'fullscreen'
  // other options...
});
```

## Test Coverage
Added comprehensive test suite (`test/render-modes.test.ts`) covering:
- Inline mode rendering behavior
- Fullscreen mode rendering behavior
- Mode-specific feature availability
- Legacy option compatibility
- ANSI escape sequence verification

## Benefits
1. **Correct Default Behavior**: Inline mode by default preserves terminal context
2. **Clear Separation**: Two distinct modes for different use cases
3. **Backward Compatibility**: Legacy `logUpdateStyle` option still works
4. **Progressive Enhancement**: Advanced features only available when needed (fullscreen)
5. **Better User Experience**: No unexpected terminal clearing for simple prompts

## Migration Guide
For existing code:
- Code using `logUpdateStyle: true` → Automatically uses inline mode
- Code using `logUpdateStyle: false` → Automatically uses fullscreen mode
- Recommended: Use new factory functions for clarity

## Files Modified
1. `src/core/render-engine.ts` - Core implementation
2. `src/core/terminal-manager.ts` - Terminal control methods
3. `src/core/index.ts` - Export new factory functions
4. `examples/render-modes-demo.ts` - Demonstration of both modes
5. `test/render-modes.test.ts` - Test coverage

## Verification
Run the demos to see the difference:
```bash
# Inline mode (no terminal clearing)
npx tsx examples/render-modes-demo.ts inline

# Fullscreen mode (full terminal control)
npx tsx examples/render-modes-demo.ts fullscreen

# Original demo (now works correctly with inline mode)
npx tsx examples/improved-terminal-demo.ts
```