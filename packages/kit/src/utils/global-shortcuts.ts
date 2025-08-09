// Global shortcut registration

interface ShortcutHandler {
  shortcut: string;
  handler: () => Promise<void>;
}

class GlobalShortcutManager {
  private shortcuts: Map<string, ShortcutHandler> = new Map();
  
  register(shortcut: string, handler: () => Promise<void>): void {
    this.shortcuts.set(shortcut, { shortcut, handler });
    // Note: Actual keyboard hook implementation would go here
    // For now, this is a stub to make the API available
  }
  
  unregister(shortcut: string): void {
    this.shortcuts.delete(shortcut);
  }
  
  getShortcuts(): string[] {
    return Array.from(this.shortcuts.keys());
  }
}

export const globalShortcuts = new GlobalShortcutManager();

/**
 * Register a global keyboard shortcut
 */
export function registerGlobalShortcut(
  shortcut: string, 
  handler: () => Promise<void>
): void {
  globalShortcuts.register(shortcut, handler);
}