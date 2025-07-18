import type { CallableExecutionEngine } from '@xec/ush';

import { join, resolve, dirname, extname, basename } from 'path';

import type { Logger } from '../utils/logger.js';
import type { 
  FileStat, 
  FileSystem, 
  EnvironmentInfo,
} from '../types/environment-types.js';

export async function createFileSystem(
  $: CallableExecutionEngine,
  env: EnvironmentInfo,
  log?: Logger
): Promise<FileSystem> {
  
  const fs: FileSystem = {
    // Basic operations
    async read(path: string): Promise<string> {
      try {
        const result = await $`cat ${path}`;
        return result.stdout;
      } catch (error) {
        throw new Error(`Failed to read file ${path}: ${error}`);
      }
    },

    async write(path: string, content: string | Buffer): Promise<void> {
      try {
        const data = typeof content === 'string' ? content : content.toString();
        // Use heredoc for safer content handling
        await $`cat << 'EOF' > ${path}
${data}
EOF`;
      } catch (error) {
        throw new Error(`Failed to write file ${path}: ${error}`);
      }
    },

    async append(path: string, content: string | Buffer): Promise<void> {
      try {
        const data = typeof content === 'string' ? content : content.toString();
        await $`cat << 'EOF' >> ${path}
${data}
EOF`;
      } catch (error) {
        throw new Error(`Failed to append to file ${path}: ${error}`);
      }
    },

    async exists(path: string): Promise<boolean> {
      try {
        await $`test -e ${path}`;
        return true;
      } catch {
        return false;
      }
    },

    async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
      try {
        const flags = options?.recursive ? '-rf' : '-f';
        await $`rm ${flags} ${path}`;
      } catch (error) {
        throw new Error(`Failed to remove ${path}: ${error}`);
      }
    },

    // Directory operations
    async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
      try {
        const flags = options?.recursive ? '-p' : '';
        await $`mkdir ${flags} ${path}`;
      } catch (error) {
        throw new Error(`Failed to create directory ${path}: ${error}`);
      }
    },

    async ls(path: string): Promise<string[]> {
      try {
        const result = await $`ls -1 ${path}`;
        return result.stdout.trim().split('\n').filter(Boolean);
      } catch (error) {
        throw new Error(`Failed to list directory ${path}: ${error}`);
      }
    },

    // Advanced operations
    async copy(source: string, dest: string): Promise<void> {
      try {
        // Use different commands based on environment
        if (env.type === 'docker' && env.connection?.container) {
          // If copying between host and container
          if (source.startsWith('host:')) {
            await $`docker cp ${source.replace('host:', '')} ${env.connection.container}:${dest}`;
          } else if (dest.startsWith('host:')) {
            await $`docker cp ${env.connection.container}:${source} ${dest.replace('host:', '')}`;
          } else {
            await $`cp -r ${source} ${dest}`;
          }
        } else if (env.type === 'kubernetes' && env.connection?.pod && env.connection?.namespace) {
          // Kubernetes pod copy
          if (source.startsWith('host:')) {
            await $`kubectl cp ${source.replace('host:', '')} ${env.connection.namespace}/${env.connection.pod}:${dest}`;
          } else if (dest.startsWith('host:')) {
            await $`kubectl cp ${env.connection.namespace}/${env.connection.pod}:${source} ${dest.replace('host:', '')}`;
          } else {
            await $`cp -r ${source} ${dest}`;
          }
        } else {
          // Standard copy
          await $`cp -r ${source} ${dest}`;
        }
      } catch (error) {
        throw new Error(`Failed to copy from ${source} to ${dest}: ${error}`);
      }
    },

    async move(source: string, dest: string): Promise<void> {
      try {
        await $`mv ${source} ${dest}`;
      } catch (error) {
        throw new Error(`Failed to move from ${source} to ${dest}: ${error}`);
      }
    },

    async chmod(path: string, mode: string | number): Promise<void> {
      try {
        const modeStr = typeof mode === 'number' ? mode.toString(8) : mode;
        await $`chmod ${modeStr} ${path}`;
      } catch (error) {
        throw new Error(`Failed to change permissions for ${path}: ${error}`);
      }
    },

    async chown(path: string, uid: number, gid: number): Promise<void> {
      try {
        await $`chown ${uid}:${gid} ${path}`;
      } catch (error) {
        throw new Error(`Failed to change ownership for ${path}: ${error}`);
      }
    },

    // Stats
    async stat(path: string): Promise<FileStat> {
      try {
        // Use stat command with portable format
        let result;
        if (env.platform.os === 'darwin') {
          // macOS stat command
          result = await $`stat -f '%z %p %u %g %m %a %c' ${path}`;
        } else {
          // Linux stat command
          result = await $`stat -c '%s %f %u %g %Y %X %Z' ${path}`;
        }
        
        const parts = result.stdout.trim().split(' ').map(Number);
        const [size = 0, mode = 0, uid = 0, gid = 0, mtime = 0, atime = 0, ctime = 0] = parts;
        
        // Get file type
        let isFile = false;
        let isDir = false;
        
        try {
          await $`test -f ${path}`;
          isFile = true;
        } catch {
          try {
            await $`test -d ${path}`;
            isDir = true;
          } catch {
            // Neither file nor directory
          }
        }
        
        return {
          size,
          mode,
          uid,
          gid,
          mtime: new Date(mtime * 1000),
          atime: new Date(atime * 1000),
          ctime: new Date(ctime * 1000),
          isFile: () => isFile,
          isDirectory: () => isDir,
        };
      } catch (error) {
        throw new Error(`Failed to stat ${path}: ${error}`);
      }
    },

    async isFile(path: string): Promise<boolean> {
      try {
        await $`test -f ${path}`;
        return true;
      } catch {
        return false;
      }
    },

    async isDir(path: string): Promise<boolean> {
      try {
        await $`test -d ${path}`;
        return true;
      } catch {
        return false;
      }
    },

    // Temporary files
    async temp(options?: { prefix?: string; suffix?: string }): Promise<string> {
      try {
        const prefix = options?.prefix || 'tmp';
        const suffix = options?.suffix || '';
        let cmd: string;
        
        if (env.platform.os === 'darwin') {
          // macOS mktemp
          cmd = suffix 
            ? `mktemp -t ${prefix}.XXXXXX${suffix}`
            : `mktemp -t ${prefix}.XXXXXX`;
        } else {
          // Linux mktemp
          cmd = suffix
            ? `mktemp --suffix=${suffix} -t ${prefix}.XXXXXX`
            : `mktemp -t ${prefix}.XXXXXX`;
        }
        
        const result = await $`${cmd}`;
        return result.stdout.trim();
      } catch (error) {
        throw new Error(`Failed to create temporary file: ${error}`);
      }
    },

    // Path utilities - these don't need shell commands
    join(...paths: string[]): string {
      return join(...paths);
    },

    resolve(...paths: string[]): string {
      return resolve(...paths);
    },

    dirname(path: string): string {
      return dirname(path);
    },

    basename(path: string): string {
      return basename(path);
    },

    extname(path: string): string {
      return extname(path);
    },
  };

  return fs;
}