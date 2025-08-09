# @xec-sh/kit - Missing Features Specification

## Overview
This document outlines the missing features in `@xec-sh/kit` that are referenced in the `apps/xec` migration from `@clack/prompts`. These features need to be implemented to complete the migration successfully.

## Analysis Summary

### Features Used in Migration
After analyzing the migration code in `apps/xec`:
- `kit-adapter.ts` - Compatibility layer mapping @clack/prompts to @xec-sh/kit
- `interactive-helpers.ts` - Main interactive utilities using kit features
- `config/features.ts` - Feature flags for progressive migration
- Type definitions in `types/kit.d.ts` - TypeScript interfaces for kit API

### Currently Implemented Features ✅
- Basic prompts: `text`, `confirm`, `password`, `number`, `select`, `multiselect`
- Advanced prompts: `autocomplete`, `table`, `form`, `filePicker`
- Feedback: `spinner`, `progress`, `taskList`
- Layout: `group`, `panel`, `wizard`, `columns`
- Utilities: Basic `log` methods, reactive system, plugin system
- Cancellation: `Symbol.for('kit.cancel')` exists in core/types.ts

### Missing Features ❌
Features referenced in migration but not fully implemented in kit.

---

## Implementation Specifications

### 1. Enhanced Log Methods

**Priority: HIGH** - Used immediately in migration

#### 1.1 Add header() and footer() methods to Log class

**File:** `packages/kit/src/utils/log.ts`

```typescript
// Add to Log class
header(message: string): void {
  const width = Math.min(80, this.stdout.columns || 80);
  const padding = Math.max(0, Math.floor((width - message.length - 2) / 2));
  const line = '─'.repeat(width);
  
  this.stdout.write('\n');
  this.stdout.write(this.theme.formatters.muted(line) + '\n');
  this.stdout.write(' '.repeat(padding) + this.theme.formatters.bold(message) + '\n');
  this.stdout.write(this.theme.formatters.muted(line) + '\n');
  this.stdout.write('\n');
}

footer(message: string): void {
  const width = Math.min(80, this.stdout.columns || 80);
  const line = '─'.repeat(width);
  
  this.stdout.write('\n');
  this.stdout.write(this.theme.formatters.muted(line) + '\n');
  this.stdout.write(this.theme.formatters.success(` ✓ ${message}`) + '\n');
  this.stdout.write('\n');
}
```

### 2. Cancellation Utilities

**Priority: HIGH** - Core functionality for all prompts

#### 2.1 Add isCancel() utility function

**File:** `packages/kit/src/index.ts`

```typescript
/**
 * Check if a value represents a cancelled prompt
 */
export function isCancel(value: any): boolean {
  return value === Symbol.for('kit.cancel');
}

// Add to kit object
export const kit = {
  // ... existing properties
  isCancel,
  cancel: Symbol.for('kit.cancel'), // Export the cancel symbol
  // ...
};
```

### 3. Enhanced Select/MultiSelect Options

**Priority: MEDIUM** - Enhanced UX features

#### 3.1 Add search capability to SelectPrompt

**File:** `packages/kit/src/components/primitives/select.ts`

```typescript
export interface SelectOptions<T = string> {
  // ... existing options
  search?: boolean; // Enable search/filter
  searchPlaceholder?: string; // Search input placeholder
  searchEmptyMessage?: string; // Message when no results
}

// Implementation in SelectPrompt class
private searchQuery = '';
private filteredOptions: SelectOption<T>[] = [];

private filterOptions(): void {
  if (!this.options.search || !this.searchQuery) {
    this.filteredOptions = this.options.options;
    return;
  }
  
  const query = this.searchQuery.toLowerCase();
  this.filteredOptions = this.options.options.filter(opt => 
    opt.label.toLowerCase().includes(query) ||
    (opt.hint && opt.hint.toLowerCase().includes(query))
  );
}

// Add search input handling in render() method
```

#### 3.2 Add showSelectAll to MultiSelectPrompt

**File:** `packages/kit/src/components/primitives/multiselect.ts`

```typescript
export interface MultiSelectOptions<T = string> {
  // ... existing options
  showSelectAll?: boolean; // Show "Select All" option
  selectAllLabel?: string; // Custom label for select all
  search?: boolean; // Enable search/filter
}

// Implementation in MultiSelectPrompt class
private renderSelectAll(): string {
  if (!this.options.showSelectAll) return '';
  
  const allSelected = this.selected.size === this.options.options.length;
  const symbol = allSelected ? '☑' : '☐';
  const label = this.options.selectAllLabel || 'Select All';
  
  return `${symbol} ${label}\n${'─'.repeat(20)}\n`;
}

private toggleSelectAll(): void {
  if (this.selected.size === this.options.options.length) {
    this.selected.clear();
  } else {
    this.options.options.forEach(opt => this.selected.add(opt.value));
  }
}
```

### 4. Live Output Component

**Priority: LOW** - Advanced feature for Phase 3

#### 4.1 Create LiveOutput component

**File:** `packages/kit/src/components/feedback/live-output.ts`

```typescript
export interface LiveOutputOptions {
  title?: string;
  height?: number;
  follow?: boolean; // Auto-scroll to bottom
  highlight?: Record<string, RegExp>; // Patterns to highlight
  controls?: Record<string, string>; // Keyboard controls
}

export class LiveOutput {
  private lines: string[] = [];
  private viewport: { start: number; end: number };
  
  constructor(private options: LiveOutputOptions) {
    this.viewport = { start: 0, end: options.height || 20 };
  }
  
  append(data: string, type?: 'error' | 'warning' | 'success'): void {
    const lines = data.split('\n');
    this.lines.push(...lines);
    
    if (this.options.follow) {
      this.scrollToBottom();
    }
    
    this.render();
  }
  
  success(message: string): void {
    this.append(`✓ ${message}`, 'success');
  }
  
  error(message: string): void {
    this.append(`✗ ${message}`, 'error');
  }
  
  clear(): void {
    this.lines = [];
    this.render();
  }
  
  private scrollToBottom(): void {
    const totalLines = this.lines.length;
    const viewHeight = this.options.height || 20;
    this.viewport.start = Math.max(0, totalLines - viewHeight);
    this.viewport.end = totalLines;
  }
  
  private render(): void {
    // Clear previous output
    process.stdout.write('\x1b[2J\x1b[H');
    
    // Render title
    if (this.options.title) {
      console.log(this.options.title);
      console.log('─'.repeat(40));
    }
    
    // Render visible lines
    const visibleLines = this.lines.slice(this.viewport.start, this.viewport.end);
    visibleLines.forEach(line => {
      const highlighted = this.highlightLine(line);
      console.log(highlighted);
    });
  }
  
  private highlightLine(line: string): string {
    if (!this.options.highlight) return line;
    
    for (const [type, pattern] of Object.entries(this.options.highlight)) {
      if (pattern.test(line)) {
        switch (type) {
          case 'error': return `\x1b[31m${line}\x1b[0m`; // Red
          case 'warning': return `\x1b[33m${line}\x1b[0m`; // Yellow
          case 'success': return `\x1b[32m${line}\x1b[0m`; // Green
        }
      }
    }
    
    return line;
  }
}

export function liveOutput(options: LiveOutputOptions): LiveOutput {
  return new LiveOutput(options);
}
```

### 5. State Persistence

**Priority: LOW** - Advanced feature for Phase 4

#### 5.1 Add state management utilities

**File:** `packages/kit/src/utils/state.ts`

```typescript
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const STATE_DIR = path.join(os.tmpdir(), '.kit-state');

export async function saveState(key: string, state: any): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const filePath = path.join(STATE_DIR, `${key}.json`);
  await fs.writeFile(filePath, JSON.stringify(state, null, 2));
}

export async function loadState(key: string): Promise<any | null> {
  try {
    const filePath = path.join(STATE_DIR, `${key}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function clearState(key: string): Promise<void> {
  try {
    const filePath = path.join(STATE_DIR, `${key}.json`);
    await fs.unlink(filePath);
  } catch {
    // Ignore if file doesn't exist
  }
}
```

### 6. Markdown Utilities

**Priority: LOW** - Nice-to-have feature

#### 6.1 Add markdown rendering utilities

**File:** `packages/kit/src/utils/markdown.ts`

```typescript
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

// Configure marked with terminal renderer
marked.setOptions({
  renderer: new TerminalRenderer({
    showSectionPrefix: false,
    width: 80,
    reflowText: true,
  })
});

export function markdown(content: string): string {
  return marked(content);
}

export function renderMarkdown(content: string): string {
  const rendered = markdown(content);
  process.stdout.write(rendered);
  return rendered;
}
```

### 7. Session Recovery

**Priority: LOW** - Advanced feature

#### 7.1 Create Session component

**File:** `packages/kit/src/components/advanced/session.ts`

```typescript
import { saveState, loadState, clearState } from '../../utils/state.js';

export interface SessionOptions<T = any> {
  id: string;
  autoSave?: boolean;
  saveInterval?: number; // ms
  prompt: (restored?: T) => Promise<T>;
}

export class Session<T = any> {
  private state?: T;
  private saveTimer?: NodeJS.Timeout;
  
  constructor(private options: SessionOptions<T>) {}
  
  async run(): Promise<T> {
    // Try to restore previous session
    this.state = await loadState(this.options.id);
    
    // Set up auto-save if enabled
    if (this.options.autoSave) {
      this.startAutoSave();
    }
    
    try {
      // Run the prompt with restored state
      const result = await this.options.prompt(this.state);
      
      // Clear state on successful completion
      await clearState(this.options.id);
      
      return result;
    } catch (error) {
      // Save state on error
      if (this.state) {
        await saveState(this.options.id, this.state);
      }
      throw error;
    } finally {
      this.stopAutoSave();
    }
  }
  
  private startAutoSave(): void {
    const interval = this.options.saveInterval || 5000;
    this.saveTimer = setInterval(async () => {
      if (this.state) {
        await saveState(this.options.id, this.state);
      }
    }, interval);
  }
  
  private stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = undefined;
    }
  }
  
  updateState(state: T): void {
    this.state = state;
  }
}

export function session<T = any>(options: SessionOptions<T>): Promise<T> {
  const s = new Session(options);
  return s.run();
}
```

### 8. Global Shortcuts

**Priority: LOW** - Advanced feature

#### 8.1 Add global shortcut registration

**File:** `packages/kit/src/utils/global-shortcuts.ts`

```typescript
import readline from 'readline';

interface ShortcutHandler {
  shortcut: string;
  handler: () => Promise<void>;
}

class GlobalShortcutManager {
  private shortcuts: Map<string, ShortcutHandler> = new Map();
  private rl?: readline.Interface;
  private isListening = false;
  
  register(shortcut: string, handler: () => Promise<void>): void {
    this.shortcuts.set(this.normalizeShortcut(shortcut), { shortcut, handler });
    
    if (!this.isListening) {
      this.startListening();
    }
  }
  
  unregister(shortcut: string): void {
    this.shortcuts.delete(this.normalizeShortcut(shortcut));
    
    if (this.shortcuts.size === 0) {
      this.stopListening();
    }
  }
  
  private normalizeShortcut(shortcut: string): string {
    return shortcut.toLowerCase().replace(/\s+/g, '');
  }
  
  private startListening(): void {
    if (this.isListening) return;
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', this.handleKeypress.bind(this));
    
    this.isListening = true;
  }
  
  private stopListening(): void {
    if (!this.isListening) return;
    
    process.stdin.setRawMode(false);
    process.stdin.removeAllListeners('keypress');
    
    if (this.rl) {
      this.rl.close();
      this.rl = undefined;
    }
    
    this.isListening = false;
  }
  
  private async handleKeypress(str: string, key: readline.Key): Promise<void> {
    const shortcut = this.buildShortcut(key);
    const handler = this.shortcuts.get(shortcut);
    
    if (handler) {
      await handler.handler();
    }
  }
  
  private buildShortcut(key: readline.Key): string {
    const parts: string[] = [];
    
    if (key.ctrl) parts.push('ctrl');
    if (key.meta) parts.push('meta');
    if (key.shift) parts.push('shift');
    if (key.name) parts.push(key.name);
    
    return parts.join('+').toLowerCase();
  }
}

export const globalShortcuts = new GlobalShortcutManager();

export function registerGlobalShortcut(
  shortcut: string, 
  handler: () => Promise<void>
): void {
  globalShortcuts.register(shortcut, handler);
}
```

### 9. Export Updates

**Priority: HIGH** - Required for migration

#### 9.1 Update main kit export

**File:** `packages/kit/src/index.ts`

```typescript
// Import new utilities
import { saveState, loadState, clearState } from './utils/state.js';
import { markdown, renderMarkdown } from './utils/markdown.js';
import { registerGlobalShortcut } from './utils/global-shortcuts.js';
import { liveOutput } from './components/feedback/live-output.js';
import { session } from './components/advanced/session.js';

// Update kit object
export const kit = {
  // ... existing properties
  
  // Cancellation
  isCancel,
  cancel: Symbol.for('kit.cancel'),
  
  // State management
  saveState,
  loadState,
  clearState,
  
  // Markdown
  markdown,
  renderMarkdown,
  
  // Global shortcuts
  registerGlobalShortcut,
  
  // Advanced components
  liveOutput,
  session,
  
  // ... rest of existing properties
};
```

---

## Implementation Priority

### Phase 1: Critical (Required for basic migration)
1. ✅ Enhanced Log Methods - `header()`, `footer()`
2. ✅ Cancellation Utilities - `isCancel()`, export cancel symbol
3. ✅ Update main kit export with new functions

### Phase 2: Important (Enhanced functionality)
1. ⬜ Search capability for Select/MultiSelect
2. ⬜ SelectAll option for MultiSelect
3. ⬜ Better option types with hints

### Phase 3: Nice-to-have (Advanced features)
1. ⬜ LiveOutput component
2. ⬜ State persistence utilities
3. ⬜ Markdown rendering
4. ⬜ Session recovery
5. ⬜ Global shortcuts

---

## Testing Requirements

### Unit Tests
Each new feature should have corresponding unit tests:
- Log methods: Test header/footer formatting
- Cancellation: Test isCancel detection
- Search: Test filtering logic
- State: Test save/load/clear operations

### Integration Tests
- Test migration with feature flags enabled
- Test compatibility with existing @clack/prompts code
- Test cancellation flow across different prompts

### Visual Tests
- Capture output of new log methods
- Test LiveOutput rendering
- Verify search UI in select prompts

---

## Migration Notes

### Breaking Changes
- None expected - all changes are additive

### Deprecation Strategy
- Keep kit-adapter.ts for backward compatibility
- Feature flags allow gradual adoption
- No immediate removal of @clack/prompts dependency

### Documentation Updates
- Update kit README with new features
- Add examples for each new component
- Document feature flags and migration path

---

## Development Checklist

### Immediate Tasks (Phase 1)
- [ ] Implement log.header() and log.footer()
- [ ] Add isCancel() utility function  
- [ ] Export cancel symbol from kit object
- [ ] Update TypeScript definitions

### Short-term Tasks (Phase 2)
- [ ] Add search to SelectPrompt
- [ ] Add showSelectAll to MultiSelectPrompt
- [ ] Test with xec CLI migration

### Long-term Tasks (Phase 3)
- [ ] Implement LiveOutput component
- [ ] Add state persistence
- [ ] Add markdown utilities
- [ ] Implement session recovery
- [ ] Add global shortcuts

---

## Conclusion

This specification outlines all missing features needed for the @xec-sh/kit migration. The implementation has been prioritized based on usage in the migration code. Phase 1 features are critical and should be implemented immediately to enable basic migration testing. Phase 2 and 3 features can be implemented progressively as the migration stabilizes.