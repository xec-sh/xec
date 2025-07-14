/**
 * @xec/stdlib-file - File operations for Xec
 */

import { glob } from 'glob';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';

import { task } from '../../dsl/task.js';

import type { Task, Module, Helper } from '../../core/types.js';

// File Helpers
export const helpers: Record<string, Helper> = {
  // Path operations
  isAbsolute: (p: string) => path.isAbsolute(p),
  normalize: (p: string) => path.normalize(p),
  relative: (from: string, to: string) => path.relative(from, to),

  // File checks
  exists: async (p: string) => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  },

  isFile: async (p: string) => {
    try {
      const stats = await fs.stat(p);
      return stats.isFile();
    } catch {
      return false;
    }
  },

  isDirectory: async (p: string) => {
    try {
      const stats = await fs.stat(p);
      return stats.isDirectory();
    } catch {
      return false;
    }
  },

  // File size formatting
  formatBytes: (bytes: number, decimals: number = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },

  // File hash
  hashFile: async (filePath: string, algorithm: string = 'sha256') => {
    const hash = crypto.createHash(algorithm);
    const stream = createReadStream(filePath);

    for await (const chunk of stream) {
      hash.update(chunk);
    }

    return hash.digest('hex');
  }
};

// File Tasks
export const tasks: Record<string, Task> = {
  // Read file
  readFile: task('read-file')
    .description('Read file contents')
    .vars({
      path: { required: true },
      encoding: { default: 'utf8' }
    })
    .handler(async (context) => {
      const { path: filePath, encoding } = context.vars;
      const content = await fs.readFile(filePath, encoding);
      return { content, path: filePath };
    })
    .build(),

  // Write file
  writeFile: task('write-file')
    .description('Write content to file')
    .vars({
      path: { required: true },
      content: { required: true },
      encoding: { default: 'utf8' },
      mode: { type: 'number' }
    })
    .handler(async (context) => {
      const { path: filePath, content, encoding, mode } = context.vars;
      await fs.writeFile(filePath, content, { encoding, mode });
      return { written: filePath, size: Buffer.byteLength(content, encoding) };
    })
    .build(),

  // Copy file
  copyFile: task('copy-file')
    .description('Copy file from source to destination')
    .vars({
      source: { required: true },
      destination: { required: true },
      overwrite: { type: 'boolean', default: true }
    })
    .handler(async (context) => {
      const { source, destination, overwrite } = context.vars;

      if (!overwrite && await helpers.exists(destination)) {
        throw new Error(`Destination file already exists: ${destination}`);
      }

      await fs.copyFile(source, destination);
      const stats = await fs.stat(destination);

      return {
        source,
        destination,
        size: stats.size,
        copied: true
      };
    })
    .build(),

  // Move/rename file
  moveFile: task('move-file')
    .description('Move or rename file')
    .vars({
      source: { required: true },
      destination: { required: true }
    })
    .handler(async (context) => {
      const { source, destination } = context.vars;
      await fs.rename(source, destination);
      return { moved: { from: source, to: destination } };
    })
    .build(),

  // Delete file
  deleteFile: task('delete-file')
    .description('Delete file')
    .vars({
      path: { required: true },
      force: { type: 'boolean', default: false }
    })
    .handler(async (context) => {
      const { path: filePath, force } = context.vars;

      try {
        await fs.unlink(filePath);
        return { deleted: filePath };
      } catch (error: any) {
        if (error.code === 'ENOENT' && force) {
          return { deleted: filePath, existed: false };
        }
        throw error;
      }
    })
    .build(),

  // Create directory
  mkdir: task('mkdir')
    .description('Create directory')
    .vars({
      path: { required: true },
      recursive: { type: 'boolean', default: true },
      mode: { type: 'number', default: 0o755 }
    })
    .handler(async (context) => {
      const { path: dirPath, recursive, mode } = context.vars;
      await fs.mkdir(dirPath, { recursive, mode });
      return { created: dirPath };
    })
    .build(),

  // Remove directory
  rmdir: task('rmdir')
    .description('Remove directory')
    .vars({
      path: { required: true },
      recursive: { type: 'boolean', default: false }
    })
    .handler(async (context) => {
      const { path: dirPath, recursive } = context.vars;
      await fs.rm(dirPath, { recursive, force: true });
      return { removed: dirPath };
    })
    .build(),

  // List directory contents
  listDir: task('list-dir')
    .description('List directory contents')
    .vars({
      path: { required: true },
      recursive: { type: 'boolean', default: false },
      includeHidden: { type: 'boolean', default: false }
    })
    .handler(async (context) => {
      const { path: dirPath, recursive, includeHidden } = context.vars;

      if (recursive) {
        const pattern = includeHidden ? '**/*' : '**/[!.]*';
        const files = await glob(pattern, { cwd: dirPath });
        return { path: dirPath, files, count: files.length };
      } else {
        let files = await fs.readdir(dirPath);
        if (!includeHidden) {
          files = files.filter(f => !f.startsWith('.'));
        }
        return { path: dirPath, files, count: files.length };
      }
    })
    .build(),

  // File stats
  fileStats: task('file-stats')
    .description('Get file statistics')
    .vars({
      path: { required: true }
    })
    .handler(async (context) => {
      const { path: filePath } = context.vars;
      const stats = await fs.stat(filePath);

      return {
        path: filePath,
        size: stats.size,
        sizeFormatted: helpers.formatBytes(stats.size),
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        isSymbolicLink: stats.isSymbolicLink(),
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid
      };
    })
    .build(),

  // Find files
  findFiles: task('find-files')
    .description('Find files matching pattern')
    .vars({
      pattern: { required: true },
      cwd: { default: process.cwd() },
      ignore: { type: 'array', default: [] }
    })
    .handler(async (context) => {
      const { pattern, cwd, ignore } = context.vars;
      const files = await glob(pattern, { cwd, ignore });

      return {
        pattern,
        cwd,
        files,
        count: files.length
      };
    })
    .build(),

  // Ensure file exists
  ensureFile: task('ensure-file')
    .description('Ensure file exists, create if not')
    .vars({
      path: { required: true },
      content: { default: '' },
      mode: { type: 'number' }
    })
    .handler(async (context) => {
      const { path: filePath, content, mode } = context.vars;

      try {
        await fs.access(filePath);
        return { path: filePath, created: false };
      } catch {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, { mode });
        return { path: filePath, created: true };
      }
    })
    .build(),

  // File checksum
  checksum: task('checksum')
    .description('Calculate file checksum')
    .vars({
      path: { required: true },
      algorithm: { default: 'sha256' }
    })
    .handler(async (context) => {
      const { path: filePath, algorithm } = context.vars;
      const hash = await helpers.hashFile(filePath, algorithm);

      return {
        path: filePath,
        algorithm,
        hash
      };
    })
    .build()
};

// File Module
export const fileModule: Module = {
  name: '@xec/stdlib-file',
  version: '1.0.0',
  description: 'File system operations for Xec',
  exports: {
    tasks,
    helpers,
    patterns: {},
    integrations: {}
  },
  dependencies: ['@xec/stdlib-core'],
  metadata: {
    category: 'stdlib',
    tags: ['file', 'filesystem', 'io'],
    author: 'Xec Team'
  }
};

export default fileModule;