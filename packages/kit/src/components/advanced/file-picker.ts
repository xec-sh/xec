// File picker component for navigating and selecting files/directories

import * as path from 'path';
import * as fs from 'fs/promises';

import { Key } from '../../core/types.js';
import { Prompt } from '../../core/prompt.js';

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: Date;
  permissions?: string;
}

export interface FilePickerOptions {
  message: string;
  title?: string; // Alternative to message
  root?: string;
  filter?: (file: FileInfo) => boolean;
  filters?: Array<{ name: string; extensions: string[] }>; // File type filters
  multiple?: boolean;
  showHidden?: boolean;
  showSize?: boolean;
  showModified?: boolean;
  directories?: boolean;
  files?: boolean;
  maxDepth?: number;
  preview?: boolean; // Show file preview
  actions?: Array<{ key: string; label: string; action: (filePath: string) => void }>; // Custom actions
  breadcrumbs?: boolean; // Show path navigation
  theme?: any;
}

interface FilePickerState {
  currentPath: string;
  files: FileInfo[];
  selectedFiles: Set<string>;
  focusedIndex: number;
  error?: string;
  status: string;
}

export class FilePickerPrompt extends Prompt<string | string[], FilePickerOptions> {
  private rootPath: string;

  constructor(options: FilePickerOptions) {
    super({
      ...options
    });

    this.rootPath = path.resolve(options.root || process.cwd());

    const state: FilePickerState = {
      currentPath: this.rootPath,
      files: [],
      selectedFiles: new Set(),
      focusedIndex: 0,
      error: undefined,
      status: 'idle'
    };

    this.state.setState(state);
    this.loadDirectory(this.rootPath);
  }

  render(): string {
    const state = this.state.getState() as FilePickerState;
    const { theme } = this.getRenderContext();
    const lines: string[] = [];

    // Message
    lines.push(theme.formatters.primary(this.config.message));
    lines.push('');

    // Current path
    const relativePath = path.relative(this.rootPath, state.currentPath) || '.';
    lines.push(theme.formatters.muted(`📁 ${relativePath}`));
    lines.push('');

    // Files
    if (state.files.length === 0) {
      lines.push(theme.formatters.muted('  (empty directory)'));
    } else {
      state.files.forEach((file, index) => {
        const isFocused = index === state.focusedIndex;
        const isSelected = state.selectedFiles.has(file.path);
        const line = this.renderFile(file, isFocused, isSelected);
        lines.push(line);
      });
    }

    // Selection info
    if (this.config.multiple && state.selectedFiles.size > 0) {
      lines.push('');
      lines.push(theme.formatters.success(`${state.selectedFiles.size} selected`));
    }

    // Error
    if (state.error) {
      lines.push('');
      lines.push(theme.formatters.error(`✗ ${state.error}`));
    }

    // Help
    lines.push('');
    const helpItems = ['↑↓: navigate', 'Enter: select'];
    if (this.config.multiple) helpItems.push('Space: toggle');
    helpItems.push('←: go up', '→: enter directory');
    lines.push(theme.formatters.muted(helpItems.join(' • ')));

    return lines.join('\n');
  }

  async handleInput(key: Key): Promise<void> {
    const state = this.state.getState() as FilePickerState;

    // Navigation
    if (key.name === 'up') {
      this.moveFocus(-1);
      return;
    }

    if (key.name === 'down') {
      this.moveFocus(1);
      return;
    }

    // Directory navigation
    if (key.name === 'right' || (key.name === 'return' && !key.shift)) {
      const focused = state.files[state.focusedIndex];
      if (focused?.isDirectory) {
        await this.enterDirectory(focused.path);
      } else if (!this.config.multiple && focused) {
        // Single file selection
        await this.submit(focused.path);
      }
      return;
    }

    if (key.name === 'left') {
      await this.goUp();
      return;
    }

    // Selection (multiple mode)
    if (this.config.multiple && key.name === 'space') {
      this.toggleSelection();
      return;
    }

    // Submit
    if (key.name === 'return' || key.name === 'enter') {
      if (this.config.multiple) {
        if (state.selectedFiles.size > 0) {
          await this.submit(Array.from(state.selectedFiles));
        }
      } else {
        const focused = state.files[state.focusedIndex];
        if (focused && !focused.isDirectory) {
          await this.submit(focused.path);
        }
      }
      return;
    }

    // Quick navigation by typing
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      this.quickNav(key.sequence);
    }
  }

  private async loadDirectory(dirPath: string): Promise<void> {
    const state = this.state.getState() as FilePickerState;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      const files: FileInfo[] = [];
      
      // Add parent directory entry if not at root
      if (dirPath !== this.rootPath) {
        files.push({
          name: '..',
          path: path.dirname(dirPath),
          isDirectory: true
        });
      }

      // Process entries
      for (const entry of entries) {
        // Skip hidden files if configured
        if (!this.config.showHidden && entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const isDirectory = entry.isDirectory();

        // Apply type filter
        if (this.config.directories === false && isDirectory) continue;
        if (this.config.files === false && !isDirectory) continue;

        const fileInfo: FileInfo = {
          name: entry.name,
          path: fullPath,
          isDirectory
        };

        // Get additional info if requested
        if (!isDirectory && (this.config.showSize || this.config.showModified)) {
          try {
            const stats = await fs.stat(fullPath);
            if (this.config.showSize) fileInfo.size = stats.size;
            if (this.config.showModified) fileInfo.modified = stats.mtime;
          } catch {
            // Ignore stat errors
          }
        }

        // Apply custom filter
        if (this.config.filter && !this.config.filter(fileInfo)) {
          continue;
        }

        files.push(fileInfo);
      }

      // Sort: directories first, then alphabetically
      files.sort((a, b) => {
        if (a.name === '..') return -1;
        if (b.name === '..') return 1;
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      this.state.setState({
        ...state,
        currentPath: dirPath,
        files,
        focusedIndex: 0,
        error: undefined
      });
    } catch (error) {
      this.state.setState({
        ...state,
        error: `Failed to read directory: ${(error as Error).message}`
      });
    }
  }

  private async enterDirectory(dirPath: string): Promise<void> {
    await this.loadDirectory(dirPath);
  }

  private async goUp(): Promise<void> {
    const state = this.state.getState() as FilePickerState;
    
    if (state.currentPath !== this.rootPath) {
      const parentPath = path.dirname(state.currentPath);
      await this.loadDirectory(parentPath);
    }
  }

  private moveFocus(delta: number): void {
    const state = this.state.getState() as FilePickerState;
    const newIndex = Math.max(0, Math.min(state.files.length - 1, state.focusedIndex + delta));
    this.state.setState({ ...state, focusedIndex: newIndex });
  }

  private toggleSelection(): void {
    const state = this.state.getState() as FilePickerState;
    const focused = state.files[state.focusedIndex];
    
    if (!focused || focused.name === '..') return;
    
    const newSelected = new Set(state.selectedFiles);
    if (newSelected.has(focused.path)) {
      newSelected.delete(focused.path);
    } else {
      newSelected.add(focused.path);
    }
    
    this.state.setState({ ...state, selectedFiles: newSelected });
  }

  private quickNav(char: string): void {
    const state = this.state.getState() as FilePickerState;
    const lowerChar = char.toLowerCase();
    
    // Find next file starting with this character
    let newIndex = -1;
    for (let i = state.focusedIndex + 1; i < state.files.length; i++) {
      const file = state.files[i];
      if (file && file.name.toLowerCase().startsWith(lowerChar)) {
        newIndex = i;
        break;
      }
    }
    
    // Wrap around to beginning
    if (newIndex === -1) {
      for (let i = 0; i <= state.focusedIndex; i++) {
        const file = state.files[i];
        if (file && file.name.toLowerCase().startsWith(lowerChar)) {
          newIndex = i;
          break;
        }
      }
    }
    
    if (newIndex !== -1) {
      this.state.setState({ ...state, focusedIndex: newIndex });
    }
  }

  private renderFile(file: FileInfo, isFocused: boolean, isSelected: boolean): string {
    const { theme } = this.getRenderContext();
    const parts: string[] = [];

    // Focus indicator
    parts.push(isFocused ? theme.formatters.primary('▶') : ' ');

    // Selection checkbox (multiple mode)
    if (this.config.multiple) {
      parts.push(isSelected ? theme.formatters.success('[✓]') : '[ ]');
    }

    // Icon
    const icon = file.isDirectory ? '📁' : this.getFileIcon(file.name);
    parts.push(icon);

    // Name
    let name = file.name;
    if (file.isDirectory && file.name !== '..') {
      name += '/';
    }
    
    if (isFocused) {
      name = theme.formatters.primary(name);
    } else if (file.isDirectory) {
      name = theme.formatters.bold(name);
    }
    parts.push(name);

    // Size
    if (this.config.showSize && file.size !== undefined) {
      parts.push(theme.formatters.muted(this.formatSize(file.size)));
    }

    // Modified time
    if (this.config.showModified && file.modified) {
      parts.push(theme.formatters.muted(this.formatDate(file.modified)));
    }

    return parts.join(' ');
  }

  private getFileIcon(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const iconMap: Record<string, string> = {
      '.js': '📜',
      '.ts': '📘',
      '.json': '📋',
      '.md': '📝',
      '.txt': '📄',
      '.png': '🖼️',
      '.jpg': '🖼️',
      '.jpeg': '🖼️',
      '.gif': '🖼️',
      '.svg': '🎨',
      '.pdf': '📕',
      '.zip': '📦',
      '.tar': '📦',
      '.gz': '📦'
    };
    
    return iconMap[ext] || '📄';
  }

  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return 'Today';
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  protected override formatValue(value: string | string[]): string {
    if (Array.isArray(value)) {
      return `${value.length} files selected`;
    }
    return path.basename(value);
  }
}