/**
 * Undo/Redo Manager - handles undo and redo operations
 */

import type { UndoableAction, DocumentChange } from '../types.js';

export interface UndoManagerOptions {
  maxHistorySize?: number;
  groupDelay?: number; // Time in ms to group consecutive changes
}

export class UndoManager {
  private undoStack: UndoableAction[] = [];
  private redoStack: UndoableAction[] = [];
  private maxHistorySize: number;
  private groupDelay: number;
  private lastActionTime: number = 0;
  private pendingAction: UndoableAction | null = null;
  private groupingTimer: NodeJS.Timeout | null = null;

  constructor(options: UndoManagerOptions = {}) {
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.groupDelay = options.groupDelay || 300;
  }

  /**
   * Add an action to the undo stack
   */
  addAction(action: UndoableAction): void {
    const now = Date.now();

    // Check if we should group with the pending action
    if (this.pendingAction &&
      now - this.lastActionTime < this.groupDelay &&
      this.canGroup(this.pendingAction, action)) {
      // Group with pending action
      this.mergeActions(this.pendingAction, action);
      this.lastActionTime = now;

      // Reset the grouping timer
      if (this.groupingTimer) {
        clearTimeout(this.groupingTimer);
      }
      this.groupingTimer = setTimeout(() => this.commitPendingAction(), this.groupDelay);

      return;
    }

    // Commit any pending action
    this.commitPendingAction();

    // Start a new pending action
    this.pendingAction = action;
    this.lastActionTime = now;

    // Set timer to commit the pending action
    this.groupingTimer = setTimeout(() => this.commitPendingAction(), this.groupDelay);

    // Clear redo stack when new action is added
    this.redoStack = [];
  }

  /**
   * Commit the pending action to the undo stack
   */
  private commitPendingAction(): void {
    if (this.pendingAction) {
      this.undoStack.push(this.pendingAction);
      this.pendingAction = null;

      // Limit stack size
      if (this.undoStack.length > this.maxHistorySize) {
        this.undoStack.shift();
      }
    }

    if (this.groupingTimer) {
      clearTimeout(this.groupingTimer);
      this.groupingTimer = null;
    }
  }

  /**
   * Check if two actions can be grouped
   */
  private canGroup(action1: UndoableAction, action2: UndoableAction): boolean {
    // Group consecutive insertions or deletions at the same position
    if (action1.changes.length !== 1 || action2.changes.length !== 1) {
      return false;
    }

    const change1 = action1.changes[0];
    const change2 = action2.changes[0];
    
    if (!change1 || !change2) {
      return false;
    }

    // Check if both are insertions
    if (change1.text && change2.text) {
      // Group if inserting at the end of the previous insertion
      const expectedPos = this.getEndPosition(change1);
      return change2.range.start.line === expectedPos.line &&
        change2.range.start.column === expectedPos.column &&
        this.isSingleCharacter(change2.text);
    }

    // Check if both are deletions
    if (!change1.text && !change2.text) {
      // Group if deleting adjacent positions
      return Math.abs(change1.range.start.column - change2.range.start.column) <= 1 &&
        change1.range.start.line === change2.range.start.line;
    }

    return false;
  }

  /**
   * Merge two actions
   */
  private mergeActions(target: UndoableAction, source: UndoableAction): void {
    // Merge changes
    target.changes.push(...source.changes);

    // Update cursor after position
    target.cursorAfter = source.cursorAfter;
  }

  /**
   * Get the end position after applying a change
   */
  private getEndPosition(change: DocumentChange): { line: number; column: number } {
    if (!change.text) {
      return change.range.start;
    }

    const lines = change.text.split('\n');
    if (lines.length === 1) {
      return {
        line: change.range.start.line,
        column: change.range.start.column + change.text.length
      };
    }

    return {
      line: change.range.start.line + lines.length - 1,
      column: (lines[lines.length - 1] ?? '').length
    };
  }

  /**
   * Check if text is a single character (excluding newlines)
   */
  private isSingleCharacter(text: string): boolean {
    return text.length === 1 || text === '\n';
  }

  /**
   * Undo the last action
   */
  undo(): UndoableAction | null {
    // Commit any pending action first
    this.commitPendingAction();

    if (this.undoStack.length === 0) {
      return null;
    }

    const action = this.undoStack.pop()!;
    this.redoStack.push(action);

    return action;
  }

  /**
   * Redo the last undone action
   */
  redo(): UndoableAction | null {
    if (this.redoStack.length === 0) {
      return null;
    }

    const action = this.redoStack.pop()!;
    this.undoStack.push(action);

    return action;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 0 || this.pendingAction !== null;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pendingAction = null;

    if (this.groupingTimer) {
      clearTimeout(this.groupingTimer);
      this.groupingTimer = null;
    }
  }

  /**
   * Get history size
   */
  getHistorySize(): { undo: number; redo: number } {
    return {
      undo: this.undoStack.length + (this.pendingAction ? 1 : 0),
      redo: this.redoStack.length
    };
  }

  /**
   * Create a checkpoint (commit pending changes)
   */
  checkpoint(): void {
    this.commitPendingAction();
  }
}