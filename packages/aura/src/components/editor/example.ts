#!/usr/bin/env bun
/**
 * Example usage of the Editor component
 */

import { signal } from 'vibrancy';

import { BoxComponent } from '../box.js';
import { TextComponent } from '../text.js';
import { RGBA } from '../../lib/colors.js';
import { GroupComponent } from '../group.js';
import { EditorComponent } from './editor-component.js';
import { FindReplaceWidget } from './search/find-replace-widget.js';
import { ParsedKey, parseKeypress } from '../../lib/parse.keypress.js';
import { type Renderer, createRenderer } from '../../renderer/renderer.js';
// import { setupCommonDemoKeys } from '../../../examples/lib/standalone-keys.js'; // Removed to avoid conflict

let renderer: Renderer | null = null;
let editor: EditorComponent | null = null;
let statusText: TextComponent | null = null;
let cursorPosText: TextComponent | null = null;
const editorContent = signal(`// Welcome to Aura Editor - Full Phase 1-3 Implementation!
// This demonstrates all features from the first three phases.

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

class Calculator {
  add(a, b) {
    return a + b;
  }
  
  multiply(a, b) {
    return a * b;
  }
  
  // Code folding: Try folding this method
  complexCalculation() {
    const result = [];
    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) {
        result.push(i * 2);
      } else {
        result.push(i * 3);
      }
    }
    return result;
  }
}

// Test auto-closing pairs: Type (, [, {, ", '
const testString = "Hello, World!";
const testArray = [1, 2, 3, 4, 5];
const testObject = { name: "Aura", version: "1.0" };

// Bracket matching: Place cursor on any bracket
if (true) {
  console.log("Brackets are matched!");
}

// Multi-cursor editing: Alt+Click to add cursors
// Or use Ctrl+D to select next occurrence
const item1 = "apple";
const item2 = "apple";
const item3 = "apple";

// Block selection: Alt+Shift+Arrow for column selection
// Try selecting the numbers below vertically:
// Line 001
// Line 002  
// Line 003
// Line 004

fibonacci(10);`);

export function run(rendererInstance: Renderer): void {
  renderer = rendererInstance;

  // Set background color like in the layout example
  renderer.setBackgroundColor('#001122');

  // Create header with proper flexbox layout
  const header = new BoxComponent('header', {
    width: 'auto',
    height: 3,
    zIndex: 10,
    border: true,
    borderStyle: 'single',
    title: 'Aura Editor - Phase 1-3 Complete Demo',
    borderColor: RGBA.fromValues(0.5, 0.5, 1, 1),
    backgroundColor: RGBA.fromValues(0.15, 0.15, 0.2, 1),
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  });

  const headerText = new TextComponent('header-text', {
    content: 'Ctrl+Q quit | Ctrl+F find | Alt+Click multi-cursor | Alt+Shift+Arrow block select',
    fg: RGBA.fromValues(0.7, 0.7, 0.7, 1),
    bg: 'transparent'
  });

  header.add(headerText);


  // Create main content area with proper flex layout
  const contentArea = new GroupComponent('content-area', {
    width: 'auto',
    height: 'auto',
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'column',
    alignItems: 'stretch'
  });

  // Create editor with all Phase 1-3 features enabled
  editor = new EditorComponent('main-editor', {
    width: 'auto',
    height: 'auto',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    zIndex: 10,
    buffered: true,
    content: editorContent(),

    // Phase 1 features
    lineNumbers: true,
    tabSize: 2,
    insertSpaces: true,

    // Phase 2 features
    showGutter: true,
    showFindWidget: true,
    wordWrap: true,

    // Phase 3 features
    enableMultiCursor: true,
    enableBlockSelection: true,
    enableSmartIndent: true,
    enableBracketMatching: true,
    enableCodeFolding: true,
    enableAutoClosingPairs: true,

    // Event handlers
    onContentChange: (content) => {
      editorContent.set(content);
      const lines = content.split('\n').length;
      const chars = content.length;
      updateStatus(`${lines} lines, ${chars} chars`);
    },
    onCursorChange: (cursor) => {
      updateCursorPosition(cursor);
    },
    onSelectionChange: (selection) => {
      if (selection) {
        updateStatus('Selection active');
      }
    }
  });

  // Add editor to content area
  contentArea.add(editor);

  // Create status bar with proper layout
  const statusBar = new BoxComponent('status-bar', {
    width: 'auto',
    height: 3,
    zIndex: 10,
    backgroundColor: RGBA.fromValues(0.2, 0.2, 0.25, 1),
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderStyle: 'single',
    borderColor: RGBA.fromValues(0.3, 0.3, 0.35, 1)
  });

  // Left side of status bar
  const statusLeft = new GroupComponent('status-left', {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 1
  });

  statusText = new TextComponent('status-text', {
    content: 'Ready',
    fg: RGBA.fromValues(0.8, 0.8, 0.8, 1),
    bg: 'transparent'
  });

  statusLeft.add(statusText);

  // Right side of status bar
  const statusRight = new GroupComponent('status-right', {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 1
  });

  cursorPosText = new TextComponent('cursor-pos-text', {
    content: 'Line 1, Col 1',
    fg: RGBA.fromValues(0.7, 0.7, 0.8, 1),
    bg: 'transparent'
  });

  statusRight.add(cursorPosText);

  // Add both sides to status bar
  statusBar.add(statusLeft);
  statusBar.add(statusRight);

  // Helper function to update status
  function updateStatus(message: string) {
    if (statusText) {
      statusText.content = message;
      renderer?.needsUpdate();
    }
  }

  // Helper function to update cursor position
  function updateCursorPosition(cursor: any) {
    if (cursorPosText) {
      const line = cursor.position.line + 1;
      const col = cursor.position.column + 1;

      // Check if we have multiple cursors
      const cursorCount = editor?.getMultiCursorCount() || 1;
      if (cursorCount > 1) {
        cursorPosText.content = `${cursorCount} cursors | Line ${line}, Col ${col}`;
      } else {
        cursorPosText.content = `Line ${line}, Col ${col}`;
      }

      // Update status if there's a selection
      if (cursor.selection) {
        const selStart = cursor.selection.start;
        const selEnd = cursor.selection.end;
        const lines = selEnd.line - selStart.line + 1;

        if (cursor.selection.mode === 'block') {
          updateStatus(`Block selection: ${lines} lines`);
        } else {
          const chars = lines === 1
            ? selEnd.column - selStart.column
            : 'multiple lines';
          updateStatus(`Selected: ${chars} chars`);
        }
      }
    }
    renderer?.needsUpdate();
  }

  // Build component tree with proper order
  renderer.root.add(header);
  renderer.root.add(contentArea);
  renderer.root.add(statusBar);

  // Create key handler function
  function handleKeyPress(key: ParsedKey) {
    // Handle global shortcuts first
    if (key.ctrl) {
      // Ctrl+C or Ctrl+Q to quit
      if (key.name === 'c' || key.name === 'q') {
        destroy(renderer!);
        process.exit(0);
        return;
      }

      // Ctrl+S to save (simulation)
      if (key.name === 's') {
        updateStatus(`Saved - ${editorContent().split('\n').length} lines`);
        setTimeout(() => updateStatus('Ready'), 2000);
        renderer?.needsUpdate();
        return;
      }

      // Ctrl+F for find/replace
      if (key.name === 'f') {
        if (editor) {
          editor.toggleFindReplace();
          updateStatus('Find/Replace opened');
        }
        return;
      }

      // Ctrl+D for select next occurrence (multi-cursor)
      if (key.name === 'd') {
        if (editor) {
          editor.selectNextOccurrence();
          const count = editor.getMultiCursorCount();
          updateStatus(`${count} occurrences selected`);
        }
        return;
      }

      // Ctrl+G for go to line
      if (key.name === 'g') {
        // In a real implementation, this would open a dialog
        updateStatus('Go to line (not implemented in demo)');
        return;
      }
    }

    // Alt+Click handling would be done through mouse events
    // Alt+Shift+Arrow for block selection is handled by the editor
  }

  // Register the key handler using renderer's built-in event
  renderer.on('key', (data: Buffer) => {
    const key = parseKeypress(data);
    handleKeyPress(key);
  });

  // Focus the editor by default
  if (editor) {
    editor.focus();
    editor.needsUpdate();
  }

  // Handle resize events
  renderer.on('resize', (width: number, height: number) => {
    // The flex layout will automatically adjust
    // Just need to trigger a re-render
    renderer?.needsUpdate();
  });

  // Show initial help message
  updateStatus('Ready - Try multi-cursor, block selection, and code folding!');
  renderer.needsUpdate();

  // Demo feature showcase after 2 seconds
  setTimeout(() => {
    updateStatus('Tip: Alt+Click adds cursors, Alt+Shift+Arrow for block selection');
  }, 2000);

  setTimeout(() => {
    updateStatus('Tip: Brackets auto-close and match. Try folding code blocks!');
  }, 5000);

  setTimeout(() => {
    updateStatus('Ready');
  }, 8000);
}

export function destroy(rendererInstance: Renderer): void {
  // Unregister key handler
  if (renderer) {
    renderer.removeAllListeners('key');
  }

  // Remove resize handler
  if (renderer) {
    renderer.removeAllListeners('resize');
  }

  // Clean up components
  rendererInstance.root.remove('header');
  rendererInstance.root.remove('content-area');
  rendererInstance.root.remove('status-bar');

  // Clear references
  editor = null;
  statusText = null;
  cursorPosText = null;
  renderer = null;
}

// Run as standalone if this is the main module
if (import.meta.main) {
  (async () => {
    const renderer = await createRenderer({
      exitOnCtrlC: false, // We handle Ctrl+C ourselves
      targetFps: 30,
      useConsole: true,
    });

    run(renderer);

    // Don't use setupCommonDemoKeys as it creates a conflicting KeyHandler
    // We handle all keys through the renderer's built-in handler

    renderer.start();
  })();
}