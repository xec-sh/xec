import path from 'path';
import { glob } from 'glob';
import fs from 'fs/promises';
import { log, text, prism, select, confirm, isCancel, multiselect } from '@xec-sh/kit';

export interface FileSelectOptions {
  title?: string;
  multiple?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
  showHidden?: boolean;
  preview?: boolean;
  startPath?: string;
  allowCreate?: boolean;
}

/**
 * File selection utilities with enhanced file browser
 */
export class FileHelpers {

  /**
   * Select files using kit's file picker
   */
  static async selectFiles(options: FileSelectOptions = {}): Promise<string[] | null> {
    try {
      // Fallback: filePicker not available in packages/kit
      const filePath = await text({
        message: options.title || 'Enter file path',
      });

      // Ensure we always return an array
      return filePath && typeof filePath === 'string' ? [filePath] : null;
    } catch (error) {
      if (isCancel(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Fallback file selection for when file picker is not available
   */
  static async selectFilesSimple(options: FileSelectOptions = {}): Promise<string[] | null> {
    const startPath = options.startPath || process.cwd();

    // Get files in directory
    const files = await this.listFiles(startPath, {
      showHidden: options.showHidden,
      filters: options.filters,
    });

    if (files.length === 0) {
      log.warning('No files found in directory');
      return null;
    }

    // Prepare file options
    const fileOptions = files.map(file => ({
      value: file.path,
      label: `${file.type === 'directory' ? '📁' : '📄'} ${file.name}`,
      hint: file.type === 'directory' ? prism.blue('dir') : prism.gray(file.ext),
    }));

    // Add navigation options
    fileOptions.unshift({
      value: '..',
      label: '⬆️  Parent Directory',
      hint: prism.gray('Navigate up'),
    });

    if (options.allowCreate) {
      fileOptions.push({
        value: '__create_new__',
        label: '➕ Create New File',
        hint: prism.green('Create'),
      });
    }

    if (options.multiple) {
      const selected = await multiselect({
        message: options.title || 'Select files',
        options: fileOptions,
        required: false,
      });

      if (isCancel(selected)) {
        return null;
      }

      // Handle special selections
      const selections = selected as string[];
      if (selections.includes('__create_new__')) {
        const newFile = await this.promptCreateFile(startPath);
        if (newFile) {
          return [newFile];
        }
      }

      // Filter out navigation options
      return selections.filter(s => s !== '..' && s !== '__create_new__');
    } else {
      const selected = await select({
        message: options.title || 'Select file',
        options: fileOptions,
      });

      if (isCancel(selected)) {
        return null;
      }

      const selection = selected as string;

      // Handle navigation
      if (selection === '..') {
        const parentPath = path.dirname(startPath);
        return this.selectFilesSimple({
          ...options,
          startPath: parentPath,
        });
      }

      // Handle create new
      if (selection === '__create_new__') {
        const newFile = await this.promptCreateFile(startPath);
        if (newFile) {
          return [newFile];
        }
        return null;
      }

      // Check if it's a directory
      const stats = await fs.stat(selection);
      if (stats.isDirectory()) {
        // Navigate into directory
        return this.selectFilesSimple({
          ...options,
          startPath: selection,
        });
      }

      return [selection];
    }
  }

  /**
   * List files in a directory
   */
  private static async listFiles(
    dirPath: string,
    options: {
      showHidden?: boolean;
      filters?: Array<{ name: string; extensions: string[] }>;
    }
  ): Promise<Array<{ path: string; name: string; type: 'file' | 'directory'; ext: string }>> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: Array<{ path: string; name: string; type: 'file' | 'directory'; ext: string }> = [];

    for (const entry of entries) {
      // Skip hidden files unless requested
      if (!options.showHidden && entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const ext = path.extname(entry.name);

      // Apply filters if provided
      if (options.filters && options.filters.length > 0 && entry.isFile()) {
        const matchesFilter = options.filters.some(filter => {
          if (filter.extensions.includes('*')) return true;
          return filter.extensions.some(e => ext === `.${e}`);
        });

        if (!matchesFilter) continue;
      }

      files.push({
        path: fullPath,
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        ext: ext.replace('.', ''),
      });
    }

    // Sort: directories first, then alphabetically
    files.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return files;
  }

  /**
   * Prompt to create a new file
   */
  private static async promptCreateFile(dirPath: string): Promise<string | null> {
    const fileName = await text({
      message: 'Enter file name:',
      placeholder: 'example.txt',
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return 'File name cannot be empty';
        }
        if (value.includes('/') || value.includes('\\')) {
          return 'File name cannot contain path separators';
        }
        return undefined;
      },
    });

    if (isCancel(fileName)) {
      return null;
    }

    const filePath = path.join(dirPath, fileName as string);

    // Check if file already exists
    try {
      await fs.access(filePath);
      const overwrite = await confirm({
        message: `File '${fileName}' already exists. Overwrite?`,
        initialValue: false,
      });

      if (isCancel(overwrite) || !overwrite) {
        return null;
      }
    } catch {
      // File doesn't exist, which is good
    }

    // Create the file
    await fs.writeFile(filePath, '', 'utf-8');
    log.success(`Created file: ${filePath}`);

    return filePath;
  }

  /**
   * Edit a file (opens in default editor)
   */
  private static async editFile(filePath: string): Promise<void> {
    const { spawn } = await import('child_process');
    const editor = process.env['EDITOR'] || process.env['VISUAL'] || 'vi';

    const child = spawn(editor, [filePath], {
      stdio: 'inherit',
    });

    return new Promise((resolve, reject) => {
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Editor exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Rename a file
   */
  private static async renameFile(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    const oldName = path.basename(filePath);

    const newName = await text({
      message: 'Enter new name:',
      placeholder: oldName,
      defaultValue: oldName,
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Name cannot be empty';
        }
        if (value.includes('/') || value.includes('\\')) {
          return 'Name cannot contain path separators';
        }
        return undefined;
      },
    });

    if (isCancel(newName)) {
      return;
    }

    const newPath = path.join(dir, newName as string);

    // Check if target exists
    try {
      await fs.access(newPath);
      const overwrite = await confirm({
        message: `File '${newName}' already exists. Overwrite?`,
        initialValue: false,
      });

      if (isCancel(overwrite) || !overwrite) {
        return;
      }
    } catch {
      // Target doesn't exist, which is good
    }

    await fs.rename(filePath, newPath);
    log.success(`Renamed to: ${newPath}`);
  }

  /**
   * Delete a file with confirmation
   */
  private static async deleteFile(filePath: string): Promise<void> {
    const confirmResult = await confirm({
      message: `Delete '${path.basename(filePath)}'?`,
      initialValue: false,
    });

    if (isCancel(confirmResult) || !confirmResult) {
      return;
    }

    const stats = await fs.stat(filePath);

    if (stats.isDirectory()) {
      await fs.rm(filePath, { recursive: true, force: true });
    } else {
      await fs.unlink(filePath);
    }

    log.success(`Deleted: ${filePath}`);
  }

  /**
   * Create a new file
   */
  private static async createFile(dirPath: string): Promise<void> {
    const filePath = await FileHelpers.promptCreateFile(dirPath);
    if (filePath) {
      // Optionally open in editor
      const edit = await confirm({
        message: 'Open in editor?',
        initialValue: true,
      });

      if (!isCancel(edit) && edit) {
        await FileHelpers.editFile(filePath);
      }
    }
  }

  /**
   * Select a directory
   */
  static async selectDirectory(options: {
    title?: string;
    startPath?: string;
    allowCreate?: boolean;
  } = {}): Promise<string | null> {
    // Fallback: filePicker not available in packages/kit
    const dirPath = await text({
      message: options.title || 'Enter directory path',
    });

    return dirPath && typeof dirPath === 'string' ? dirPath : null;
  }

  /**
   * Simple directory selection fallback
   */
  static async selectDirectorySimple(options: {
    title?: string;
    startPath?: string;
    allowCreate?: boolean;
  }): Promise<string | null> {
    const startPath = options.startPath || process.cwd();

    // Get subdirectories
    const entries = await fs.readdir(startPath, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({
        value: path.join(startPath, e.name),
        label: `📁 ${e.name}`,
      }));

    // Add navigation options
    const dirOptions = [
      {
        value: startPath,
        label: '📍 Select Current Directory',
        hint: prism.blue(startPath),
      },
      {
        value: '..',
        label: '⬆️  Parent Directory',
        hint: prism.gray('Navigate up'),
      },
      ...dirs,
    ];

    if (options.allowCreate) {
      dirOptions.push({
        value: '__create_new__',
        label: '➕ Create New Directory',
        hint: prism.green('Create'),
      });
    }

    const selected = await select({
      message: options.title || 'Select directory',
      options: dirOptions,
    });

    if (isCancel(selected)) {
      return null;
    }

    const selection = selected as string;

    // Handle current directory selection
    if (selection === startPath) {
      return startPath;
    }

    // Handle navigation
    if (selection === '..') {
      const parentPath = path.dirname(startPath);
      return this.selectDirectorySimple({
        ...options,
        startPath: parentPath,
      });
    }

    // Handle create new
    if (selection === '__create_new__') {
      const dirName = await text({
        message: 'Enter directory name:',
        placeholder: 'new-directory',
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Directory name cannot be empty';
          }
          if (value.includes('/') || value.includes('\\')) {
            return 'Directory name cannot contain path separators';
          }
          return undefined;
        },
      });

      if (isCancel(dirName)) {
        return null;
      }

      const newDir = path.join(startPath, dirName as string);
      await fs.mkdir(newDir, { recursive: true });
      log.success(`Created directory: ${newDir}`);
      return newDir;
    }

    // Navigate into selected directory
    return this.selectDirectorySimple({
      ...options,
      startPath: selection,
    });
  }

  /**
   * Find files matching pattern
   */
  static async findFiles(pattern: string, options: {
    cwd?: string;
    ignore?: string[];
    absolute?: boolean;
  } = {}): Promise<string[]> {
    return glob(pattern, {
      cwd: options.cwd || process.cwd(),
      ignore: options.ignore || ['**/node_modules/**', '**/.git/**'],
      absolute: options.absolute !== false,
    });
  }
}

// Export convenience functions
export const selectFiles = FileHelpers.selectFiles.bind(FileHelpers);
export const selectDirectory = FileHelpers.selectDirectory.bind(FileHelpers);
export const findFiles = FileHelpers.findFiles.bind(FileHelpers);