import { stat } from 'node:fs/promises';
import { join, dirname, relative, isAbsolute } from 'node:path';

import { escapeArg } from './shell-escape.js';

import type { CallableExecutionEngine } from '../types.js';
import type { ExecutionEngine } from '../core/execution-engine.js';

export interface TransferOptions {
  // Common options
  overwrite?: boolean;
  preserveMode?: boolean;
  preserveTimestamps?: boolean;
  recursive?: boolean;
  followSymlinks?: boolean;

  // Progress tracking
  onProgress?: (progress: TransferProgress) => void;

  // Filtering
  include?: string[];
  exclude?: string[];

  // Performance
  concurrent?: number;
  chunkSize?: number;

  // Compression (for remote transfers)
  compress?: boolean;

  // Delete extra files in destination (for sync)
  deleteExtra?: boolean;
}

export interface TransferProgress {
  totalFiles: number;
  completedFiles: number;
  totalBytes: number;
  transferredBytes: number;
  currentFile?: string;
  speed?: number; // bytes per second
}

export interface TransferResult {
  success: boolean;
  filesTransferred: number;
  bytesTransferred: number;
  errors?: Error[];
  duration: number;
}

export interface Environment {
  type: 'local' | 'ssh' | 'docker';
  host?: string;
  user?: string;
  container?: string;
  path: string;
  raw: string;
}

export class TransferEngine {
  constructor(private engine: ExecutionEngine | CallableExecutionEngine) { }

  async copy(source: string, dest: string, options: TransferOptions = {}): Promise<TransferResult> {
    const startTime = Date.now();
    const sourceEnv = this.parseEnvironment(source);
    const destEnv = this.parseEnvironment(dest);

    try {
      const result = await this.executeTransfer(sourceEnv, destEnv, 'copy', options);
      return {
        ...result,
        success: true,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        filesTransferred: 0,
        bytesTransferred: 0,
        errors: [error as Error],
        duration: Date.now() - startTime
      };
    }
  }

  async move(source: string, dest: string, options: TransferOptions = {}): Promise<TransferResult> {
    const startTime = Date.now();
    const sourceEnv = this.parseEnvironment(source);
    const destEnv = this.parseEnvironment(dest);

    try {
      const result = await this.executeTransfer(sourceEnv, destEnv, 'move', options);
      return {
        ...result,
        success: true,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        filesTransferred: 0,
        bytesTransferred: 0,
        errors: [error as Error],
        duration: Date.now() - startTime
      };
    }
  }

  async sync(source: string, dest: string, options: TransferOptions = {}): Promise<TransferResult> {
    // Sync is like copy but with deleteExtra option
    return this.copy(source, dest, { ...options, deleteExtra: true });
  }

  private parseEnvironment(path: string): Environment {
    // Parse SSH URLs: ssh://user@host/path
    const sshMatch = path.match(/^ssh:\/\/(?:([^@]+)@)?([^/]+)(.*)$/);
    if (sshMatch) {
      return {
        type: 'ssh',
        user: sshMatch[1],
        host: sshMatch[2],
        path: sshMatch[3] || '/',
        raw: path
      };
    }

    // Parse Docker URLs: docker://container:/path
    const dockerMatch = path.match(/^docker:\/\/([^:]+):(.*)$/);
    if (dockerMatch) {
      return {
        type: 'docker',
        container: dockerMatch[1],
        path: dockerMatch[2] || '/',
        raw: path
      };
    }

    // Local path
    return {
      type: 'local',
      path: isAbsolute(path) ? path : join(process.cwd(), path),
      raw: path
    };
  }

  private async executeTransfer(
    source: Environment,
    dest: Environment,
    operation: 'copy' | 'move',
    options: TransferOptions
  ): Promise<Omit<TransferResult, 'success' | 'duration'>> {
    const key = `${source.type}-${dest.type}`;

    switch (key) {
      case 'local-local':
        return this.localToLocal(source, dest, operation, options);
      case 'local-ssh':
        return this.localToSsh(source, dest, operation, options);
      case 'local-docker':
        return this.localToDocker(source, dest, operation, options);
      case 'ssh-local':
        return this.sshToLocal(source, dest, operation, options);
      case 'ssh-ssh':
        return this.sshToSsh(source, dest, operation, options);
      case 'ssh-docker':
        return this.sshToDocker(source, dest, operation, options);
      case 'docker-local':
        return this.dockerToLocal(source, dest, operation, options);
      case 'docker-ssh':
        return this.dockerToSsh(source, dest, operation, options);
      case 'docker-docker':
        return this.dockerToDocker(source, dest, operation, options);
      default:
        throw new Error(`Unsupported transfer: ${source.type} to ${dest.type}`);
    }
  }

  private async localToLocal(
    source: Environment,
    dest: Environment,
    operation: 'copy' | 'move',
    options: TransferOptions
  ): Promise<Omit<TransferResult, 'success' | 'duration'>> {
    const sourcePath = escapeArg(source.path);
    const destPath = escapeArg(dest.path);

    let command: string;
    if (operation === 'copy') {
      const flags = this.buildCpFlags(options);
      command = `cp ${flags} ${sourcePath} ${destPath}`;
    } else {
      command = `mv ${options.overwrite ? '-f' : '-n'} ${sourcePath} ${destPath}`;
    }

    await this.engine.execute({ command, shell: true });

    // Get transfer stats
    const stats = await this.getTransferStats(source.path, options);
    return stats;
  }

  private async localToSsh(
    source: Environment,
    dest: Environment,
    operation: 'copy' | 'move',
    options: TransferOptions
  ): Promise<Omit<TransferResult, 'success' | 'duration'>> {
    const sourcePath = escapeArg(source.path);
    const userHost = dest.user ? `${dest.user}@${dest.host}` : dest.host!;
    const destPath = escapeArg(dest.path);

    let command: string;
    if (options.compress && options.recursive) {
      // Use tar for compression
      const excludeFlags = this.buildExcludeFlags(options);
      command = `tar ${excludeFlags} -czf - -C ${escapeArg(dirname(source.path))} ${escapeArg(relative(dirname(source.path), source.path))} | ssh ${userHost} "tar -xzf - -C ${destPath}"`;
    } else {
      // Use scp
      const flags = this.buildScpFlags(options);
      command = `scp ${flags} ${sourcePath} ${userHost}:${destPath}`;
    }

    await this.engine.execute({ command, shell: true });

    // If move operation, delete source
    if (operation === 'move') {
      await this.engine.execute({ command: `rm -rf ${sourcePath}`, shell: true });
    }

    const stats = await this.getTransferStats(source.path, options);
    return stats;
  }

  private async localToDocker(
    source: Environment,
    dest: Environment,
    operation: 'copy' | 'move',
    options: TransferOptions
  ): Promise<Omit<TransferResult, 'success' | 'duration'>> {
    const sourcePath = escapeArg(source.path);
    const containerPath = `${dest.container}:${dest.path}`;

    const command = `docker cp ${sourcePath} ${containerPath}`;
    await this.engine.execute({ command, shell: true });

    // If move operation, delete source
    if (operation === 'move') {
      await this.engine.execute({ command: `rm -rf ${sourcePath}`, shell: true });
    }

    const stats = await this.getTransferStats(source.path, options);
    return stats;
  }

  private async sshToLocal(
    source: Environment,
    dest: Environment,
    operation: 'copy' | 'move',
    options: TransferOptions
  ): Promise<Omit<TransferResult, 'success' | 'duration'>> {
    const userHost = source.user ? `${source.user}@${source.host}` : source.host!;
    const sourcePath = escapeArg(source.path);
    const destPath = escapeArg(dest.path);

    let command: string;
    if (options.compress && options.recursive) {
      // Use tar for compression
      const excludeFlags = this.buildExcludeFlags(options);
      command = `ssh ${userHost} "tar ${excludeFlags} -czf - -C ${escapeArg(dirname(source.path))} ${escapeArg(relative(dirname(source.path), source.path))}" | tar -xzf - -C ${destPath}`;
    } else {
      // Use scp
      const flags = this.buildScpFlags(options);
      command = `scp ${flags} ${userHost}:${sourcePath} ${destPath}`;
    }

    await this.engine.execute({ command, shell: true });

    // If move operation, delete source on remote
    if (operation === 'move') {
      await this.engine.execute({
        command: `ssh ${userHost} "rm -rf ${sourcePath}"`,
        shell: true
      });
    }

    // Get approximate stats (can't easily get remote file stats)
    return {
      filesTransferred: 1,
      bytesTransferred: 0,
      errors: []
    };
  }

  private async sshToSsh(
    source: Environment,
    dest: Environment,
    operation: 'copy' | 'move',
    options: TransferOptions
  ): Promise<Omit<TransferResult, 'success' | 'duration'>> {
    const sourceUserHost = source.user ? `${source.user}@${source.host}` : source.host!;
    const destUserHost = dest.user ? `${dest.user}@${dest.host}` : dest.host!;

    if (source.host === dest.host) {
      // Same host, use remote cp/mv
      const command = operation === 'copy'
        ? `ssh ${sourceUserHost} "cp ${this.buildCpFlags(options)} ${escapeArg(source.path)} ${escapeArg(dest.path)}"`
        : `ssh ${sourceUserHost} "mv ${options.overwrite ? '-f' : '-n'} ${escapeArg(source.path)} ${escapeArg(dest.path)}"`;

      await this.engine.execute({ command, shell: true });
    } else {
      // Different hosts, use intermediate transfer
      const tempPath = `/tmp/ush-transfer-${Date.now()}`;

      // Copy from source to local temp
      await this.sshToLocal(source, { type: 'local', path: tempPath, raw: tempPath }, 'copy', options);

      // Copy from local temp to dest
      await this.localToSsh({ type: 'local', path: tempPath, raw: tempPath }, dest, 'copy', options);

      // Clean up temp
      await this.engine.execute({ command: `rm -rf ${escapeArg(tempPath)}`, shell: true });

      // If move operation, delete source
      if (operation === 'move') {
        await this.engine.execute({
          command: `ssh ${sourceUserHost} "rm -rf ${escapeArg(source.path)}"`,
          shell: true
        });
      }
    }

    return {
      filesTransferred: 1,
      bytesTransferred: 0,
      errors: []
    };
  }

  private async sshToDocker(
    source: Environment,
    dest: Environment,
    operation: 'copy' | 'move',
    options: TransferOptions
  ): Promise<Omit<TransferResult, 'success' | 'duration'>> {
    // Use intermediate local transfer
    const tempPath = `/tmp/ush-transfer-${Date.now()}`;

    await this.sshToLocal(source, { type: 'local', path: tempPath, raw: tempPath }, 'copy', options);
    await this.localToDocker({ type: 'local', path: tempPath, raw: tempPath }, dest, 'copy', options);

    // Clean up
    await this.engine.execute({ command: `rm -rf ${escapeArg(tempPath)}`, shell: true });

    if (operation === 'move') {
      const userHost = source.user ? `${source.user}@${source.host}` : source.host!;
      await this.engine.execute({
        command: `ssh ${userHost} "rm -rf ${escapeArg(source.path)}"`,
        shell: true
      });
    }

    return {
      filesTransferred: 1,
      bytesTransferred: 0,
      errors: []
    };
  }

  private async dockerToLocal(
    source: Environment,
    dest: Environment,
    operation: 'copy' | 'move',
    options: TransferOptions
  ): Promise<Omit<TransferResult, 'success' | 'duration'>> {
    const containerPath = `${source.container}:${source.path}`;
    const destPath = escapeArg(dest.path);

    const command = `docker cp ${containerPath} ${destPath}`;
    await this.engine.execute({ command, shell: true });

    // Docker doesn't support move, so we need to delete manually
    if (operation === 'move') {
      await this.engine.execute({
        command: `docker exec ${source.container} rm -rf ${escapeArg(source.path)}`,
        shell: true
      });
    }

    return {
      filesTransferred: 1,
      bytesTransferred: 0,
      errors: []
    };
  }

  private async dockerToSsh(
    source: Environment,
    dest: Environment,
    operation: 'copy' | 'move',
    options: TransferOptions
  ): Promise<Omit<TransferResult, 'success' | 'duration'>> {
    // Use intermediate local transfer
    const tempPath = `/tmp/ush-transfer-${Date.now()}`;

    await this.dockerToLocal(source, { type: 'local', path: tempPath, raw: tempPath }, 'copy', options);
    await this.localToSsh({ type: 'local', path: tempPath, raw: tempPath }, dest, 'copy', options);

    // Clean up
    await this.engine.execute({ command: `rm -rf ${escapeArg(tempPath)}`, shell: true });

    if (operation === 'move') {
      await this.engine.execute({
        command: `docker exec ${source.container} rm -rf ${escapeArg(source.path)}`,
        shell: true
      });
    }

    return {
      filesTransferred: 1,
      bytesTransferred: 0,
      errors: []
    };
  }

  private async dockerToDocker(
    source: Environment,
    dest: Environment,
    operation: 'copy' | 'move',
    options: TransferOptions
  ): Promise<Omit<TransferResult, 'success' | 'duration'>> {
    if (source.container === dest.container) {
      // Same container, use exec
      const command = operation === 'copy'
        ? `docker exec ${source.container} cp ${this.buildCpFlags(options)} ${escapeArg(source.path)} ${escapeArg(dest.path)}`
        : `docker exec ${source.container} mv ${options.overwrite ? '-f' : '-n'} ${escapeArg(source.path)} ${escapeArg(dest.path)}`;

      await this.engine.execute({ command, shell: true });
    } else {
      // Different containers, use intermediate
      const tempPath = `/tmp/ush-transfer-${Date.now()}`;

      await this.dockerToLocal(source, { type: 'local', path: tempPath, raw: tempPath }, 'copy', options);
      await this.localToDocker({ type: 'local', path: tempPath, raw: tempPath }, dest, 'copy', options);

      // Clean up
      await this.engine.execute({ command: `rm -rf ${escapeArg(tempPath)}`, shell: true });

      if (operation === 'move') {
        await this.engine.execute({
          command: `docker exec ${source.container} rm -rf ${escapeArg(source.path)}`,
          shell: true
        });
      }
    }

    return {
      filesTransferred: 1,
      bytesTransferred: 0,
      errors: []
    };
  }

  private buildCpFlags(options: TransferOptions): string {
    const flags: string[] = [];

    if (options.recursive) flags.push('-r');
    if (options.preserveMode) flags.push('-p');
    if (options.preserveTimestamps) flags.push('-p');
    if (!options.followSymlinks) flags.push('-P');
    if (options.overwrite === false) flags.push('-n');

    return flags.join(' ');
  }

  private buildScpFlags(options: TransferOptions): string {
    const flags: string[] = [];

    if (options.recursive) flags.push('-r');
    if (options.preserveMode) flags.push('-p');
    if (options.compress) flags.push('-C');

    return flags.join(' ');
  }

  private buildExcludeFlags(options: TransferOptions): string {
    const flags: string[] = [];

    if (options.exclude) {
      for (const pattern of options.exclude) {
        flags.push(`--exclude=${escapeArg(pattern)}`);
      }
    }

    return flags.join(' ');
  }

  private async getTransferStats(
    path: string,
    options: TransferOptions
  ): Promise<Omit<TransferResult, 'success' | 'duration'>> {
    try {
      const stats = await stat(path);

      if (stats.isFile()) {
        return {
          filesTransferred: 1,
          bytesTransferred: stats.size,
          errors: []
        };
      } else if (stats.isDirectory() && options.recursive) {
        // For directories, we'd need to recursively count files
        // For simplicity, returning basic stats
        return {
          filesTransferred: 1,
          bytesTransferred: 0,
          errors: []
        };
      }
    } catch {
      // If we can't get stats, return basic info
    }

    return {
      filesTransferred: 1,
      bytesTransferred: 0,
      errors: []
    };
  }
}