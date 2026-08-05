import type { CallableExecutionEngine } from '../types/engine.js';
import type { ExecutionEngine } from '../core/execution-engine.js';
import type { UshEventMap, TypedEventEmitter } from '../types/events.js';

import { tmpdir } from 'node:os';
import { rm, stat } from 'node:fs/promises';
import { join, dirname, relative, isAbsolute } from 'node:path';

import { escapeArg } from './shell-escape.js';

/**
 * A local path to stage a transfer through.
 *
 * `/tmp` was written literally, which on Windows is `C:\tmp` — a directory
 * that usually does not exist, so every transfer between two remote
 * environments failed there. `os.tmpdir()` is the same directory on Unix
 * and the right one everywhere else.
 *
 * @returns A path in this machine's temporary directory.
 */
function localStagingPath(): string {
  return join(tmpdir(), `xec-transfer-${Date.now()}`);
}

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
  type: 'local' | 'ssh' | 'docker' | 'kubernetes';
  host?: string;
  user?: string;
  container?: string;
  pod?: string;
  namespace?: string;
  context?: string;
  kubeconfig?: string;
  path: string;
  raw: string;
}

export class TransferEngine {
  constructor(private engine: ExecutionEngine | CallableExecutionEngine) { }

  private emitEvent<K extends keyof UshEventMap>(
    event: K,
    data: Omit<UshEventMap[K], 'timestamp' | 'adapter'>
  ): void {
    if ('emit' in this.engine && typeof this.engine.emit === 'function') {
      (this.engine as TypedEventEmitter<UshEventMap>).emit(event, {
        ...data,
        timestamp: new Date(),
        adapter: 'local'
      } as UshEventMap[K]);
    }
  }

  async copy(source: string, dest: string, options: TransferOptions = {}): Promise<TransferResult> {
    return this.perform(this.parseEnvironment(source), this.parseEnvironment(dest), 'copy', options);
  }

  async move(source: string, dest: string, options: TransferOptions = {}): Promise<TransferResult> {
    return this.perform(this.parseEnvironment(source), this.parseEnvironment(dest), 'move', options);
  }

  async sync(source: string, dest: string, options: TransferOptions = {}): Promise<TransferResult> {
    // Sync is like copy but with deleteExtra option
    return this.copy(source, dest, { ...options, deleteExtra: true });
  }

  /**
   * Send a local path to this engine's target.
   *
   * The destination is resolved against the target the engine was pointed at —
   * `$.ssh(host).transfer.upload('dist/', '/srv/app')` uploads to `host`,
   * `$.docker(c)` to the container, `$.k8s(pod)` to the pod. `copy` with two
   * flat paths cannot do this: it reads the environment only from `ssh://` /
   * `docker://` URLs, so on a target engine both flat paths look local and the
   * transfer silently stays on the operator's machine. This method reads the
   * target from the engine instead.
   *
   * @param localSource - A local file or directory.
   * @param targetDest - The destination path on the engine's target.
   * @throws When the engine has no target (a bare `$`), with a message pointing
   *   at `copy()` with a URL.
   */
  async upload(localSource: string, targetDest: string, options: TransferOptions = {}): Promise<TransferResult> {
    const dest = this.targetEnvironment(targetDest, 'upload');
    const source = this.parseEnvironment(localSource);

    if (source.type !== 'local') {
      throw new Error(
        `upload() takes a local source path, received '${localSource}'. ` +
          `To move between two remotes, use copy() with ssh://, docker:// URLs.`
      );
    }

    return this.perform(source, dest, 'copy', options);
  }

  /**
   * Fetch a path from this engine's target down to a local path.
   *
   * The source is resolved against the target the engine was pointed at — see
   * {@link upload} for why `copy()` with flat paths cannot express this.
   *
   * @param targetSource - The source path on the engine's target.
   * @param localDest - A local destination path.
   * @throws When the engine has no target (a bare `$`).
   */
  async download(targetSource: string, localDest: string, options: TransferOptions = {}): Promise<TransferResult> {
    const source = this.targetEnvironment(targetSource, 'download');
    const dest = this.parseEnvironment(localDest);

    if (dest.type !== 'local') {
      throw new Error(
        `download() takes a local destination path, received '${localDest}'. ` +
          `To move between two remotes, use copy() with ssh://, docker:// URLs.`
      );
    }

    return this.perform(source, dest, 'copy', options);
  }

  /**
   * Build the {@link Environment} for the engine's own target at `path`.
   *
   * @throws When the engine is local / untargeted, so `upload`/`download` fail
   *   loudly rather than silently transferring on the local machine.
   */
  private targetEnvironment(path: string, verb: 'upload' | 'download'): Environment {
    const target = (this.engine as ExecutionEngine).targetInfo;

    if (!target || target.type === 'local') {
      throw new Error(
        `${verb}() needs an engine bound to a target — $.ssh(host), $.docker(container) ` +
          `or $.k8s(pod). A bare $ has no target; use copy() with an ssh:// or docker:// URL.`
      );
    }

    switch (target.type) {
      case 'ssh':
        return {
          type: 'ssh',
          host: target.host,
          user: target.username,
          path,
          raw: `ssh://${target.username}@${target.host}${path.startsWith('/') ? '' : '/'}${path}`
        };
      case 'docker':
        return { type: 'docker', container: target.container, path, raw: `docker://${target.container}:${path}` };
      case 'kubernetes':
        return {
          type: 'kubernetes',
          pod: target.pod,
          namespace: target.namespace,
          container: target.container,
          context: target.context,
          kubeconfig: target.kubeconfig,
          path,
          raw: `k8s://${target.namespace ?? 'default'}/${target.pod}:${path}`
        };
      default:
        // targetInfo.type is adapter-defined; a value outside the known set
        // means a new adapter arrived without a transfer leg.
        throw new Error(`${verb}() has no transfer route for target type '${(target as { type: string }).type}'`);
    }
  }

  /**
   * A local engine for orchestration commands.
   *
   * `docker cp`, `kubectl cp` and the local `cp`/`rm` steps run on the operator's
   * machine, not inside the target. Running them through `this.engine` when it
   * is bound to a container or pod would execute `docker cp` *inside* that
   * container. SFTP-based SSH helpers connect out regardless, so they are
   * unaffected.
   */
  private _control?: ExecutionEngine;
  private control(): ExecutionEngine | CallableExecutionEngine {
    if (!this._control) {
      const engine = this.engine as ExecutionEngine;
      this._control = typeof engine.local === 'function' ? engine.local() : engine;
    }
    return this._control;
  }

  private async perform(
    sourceEnv: Environment,
    destEnv: Environment,
    operation: 'copy' | 'move',
    options: TransferOptions
  ): Promise<TransferResult> {
    const startTime = Date.now();
    const direction = sourceEnv.type === 'local' ? 'upload' : 'download';

    this.emitEvent('transfer:start', {
      source: sourceEnv.raw,
      destination: destEnv.raw,
      direction
    });

    try {
      const result = await this.executeTransfer(sourceEnv, destEnv, operation, options);
      const finalResult = {
        ...result,
        success: true,
        duration: Date.now() - startTime
      };

      this.emitEvent('transfer:complete', {
        source: sourceEnv.raw,
        destination: destEnv.raw,
        direction,
        bytesTransferred: finalResult.bytesTransferred,
        duration: finalResult.duration
      });

      return finalResult;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.emitEvent('transfer:error', {
        source: sourceEnv.raw,
        destination: destEnv.raw,
        direction,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        filesTransferred: 0,
        bytesTransferred: 0,
        errors: [error as Error],
        duration
      };
    }
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
      case 'local-kubernetes':
        return this.localToKubernetes(source, dest, operation, options);
      case 'kubernetes-local':
        return this.kubernetesToLocal(source, dest, operation, options);
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

    await this.control().execute({ command, shell: true });

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
    // Get SSH execution context
    const $ssh = (this.control() as any).ssh({
      host: dest.host!,
      username: dest.user || 'root'
    });

    if (options.recursive) {
      // Upload directory
      await $ssh.uploadDirectory(source.path, dest.path);
    } else {
      // Upload single file
      await $ssh.uploadFile(source.path, dest.path);
    }

    // If move operation, delete source
    if (operation === 'move') {
      await this.control().execute({ command: `rm -rf ${escapeArg(source.path)}`, shell: true });
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
    await this.control().execute({ command, shell: true });

    // If move operation, delete source
    if (operation === 'move') {
      await this.control().execute({ command: `rm -rf ${sourcePath}`, shell: true });
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
    // Get SSH execution context
    const $ssh = (this.control() as any).ssh({
      host: source.host!,
      username: source.user || 'root'
    });

    if (options.recursive) {
      // Download directory - SSH adapter doesn't have downloadDirectory yet
      // For now, we'll need to implement this using the ssh context
      const remotePath = source.path;
      const localPath = dest.path;
      
      // Create local directory
      await this.control().execute({ command: `mkdir -p ${escapeArg(localPath)}`, shell: true });
      
      // Use tar over SSH for directory transfer
      await $ssh`tar -cf - -C ${dirname(remotePath)} ${relative(dirname(remotePath), remotePath)} | tar -xf - -C ${localPath}`;
    } else {
      // Download single file
      await $ssh.downloadFile(source.path, dest.path);
    }

    // If move operation, delete source on remote
    if (operation === 'move') {
      await $ssh`rm -rf ${source.path}`;
    }

    // Get approximate stats
    const stats = await this.getTransferStats(dest.path, options);
    return stats;
  }

  private async sshToSsh(
    source: Environment,
    dest: Environment,
    operation: 'copy' | 'move',
    options: TransferOptions
  ): Promise<Omit<TransferResult, 'success' | 'duration'>> {
    if (source.host === dest.host) {
      // Same host, use remote cp/mv
      const $ssh = (this.control() as any).ssh({
        host: source.host!,
        username: source.user || 'root'
      });

      const command = operation === 'copy'
        ? `cp ${this.buildCpFlags(options)} ${escapeArg(source.path)} ${escapeArg(dest.path)}`
        : `mv ${options.overwrite ? '-f' : '-n'} ${escapeArg(source.path)} ${escapeArg(dest.path)}`;

      await $ssh`${command}`;
    } else {
      // Different hosts, use intermediate transfer
      const tempPath = localStagingPath();

      // Copy from source to local temp
      await this.sshToLocal(source, { type: 'local', path: tempPath, raw: tempPath }, 'copy', options);

      // Copy from local temp to dest
      await this.localToSsh({ type: 'local', path: tempPath, raw: tempPath }, dest, 'copy', options);

      // Clean up temp
      await rm(tempPath, { recursive: true, force: true });

      // If move operation, delete source
      if (operation === 'move') {
        const $sshSource = (this.control() as any).ssh({
          host: source.host!,
          username: source.user || 'root'
        });
        await $sshSource`rm -rf ${source.path}`;
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
    const tempPath = localStagingPath();

    await this.sshToLocal(source, { type: 'local', path: tempPath, raw: tempPath }, 'copy', options);
    await this.localToDocker({ type: 'local', path: tempPath, raw: tempPath }, dest, 'copy', options);

    // Clean up
    await rm(tempPath, { recursive: true, force: true });

    if (operation === 'move') {
      const $ssh = (this.control() as any).ssh({
        host: source.host!,
        username: source.user || 'root'
      });
      await $ssh`rm -rf ${source.path}`;
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
    await this.control().execute({ command, shell: true });

    // Docker doesn't support move, so we need to delete manually
    if (operation === 'move') {
      await this.control().execute({
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
    const tempPath = localStagingPath();

    await this.dockerToLocal(source, { type: 'local', path: tempPath, raw: tempPath }, 'copy', options);
    await this.localToSsh({ type: 'local', path: tempPath, raw: tempPath }, dest, 'copy', options);

    // Clean up
    await rm(tempPath, { recursive: true, force: true });

    if (operation === 'move') {
      await this.control().execute({
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

      await this.control().execute({ command, shell: true });
    } else {
      // Different containers, use intermediate
      const tempPath = `/tmp/ush-transfer-${Date.now()}`;

      await this.dockerToLocal(source, { type: 'local', path: tempPath, raw: tempPath }, 'copy', options);
      await this.localToDocker({ type: 'local', path: tempPath, raw: tempPath }, dest, 'copy', options);

      // Clean up
      await rm(tempPath, { recursive: true, force: true });

      if (operation === 'move') {
        await this.control().execute({
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

  private async localToKubernetes(
    source: Environment,
    dest: Environment,
    operation: 'copy' | 'move',
    options: TransferOptions
  ): Promise<Omit<TransferResult, 'success' | 'duration'>> {
    const command = this.joinArgs([
      'kubectl', 'cp', escapeArg(source.path), this.podSpec(dest), this.k8sFlags(dest)
    ]);
    await this.control().execute({ command, shell: true });

    // A move deletes the *local* source once the copy up has landed.
    if (operation === 'move') {
      await this.control().execute({ command: `rm -rf ${escapeArg(source.path)}`, shell: true });
    }

    return this.getTransferStats(source.path, options);
  }

  private async kubernetesToLocal(
    source: Environment,
    dest: Environment,
    operation: 'copy' | 'move',
    options: TransferOptions
  ): Promise<Omit<TransferResult, 'success' | 'duration'>> {
    const command = this.joinArgs([
      'kubectl', 'cp', this.podSpec(source), escapeArg(dest.path), this.k8sFlags(source)
    ]);
    await this.control().execute({ command, shell: true });

    // A move deletes the source inside the pod. `kubectl exec` runs locally but
    // acts on the pod, matching how dockerToLocal deletes with `docker exec`.
    if (operation === 'move') {
      const del = this.joinArgs([
        'kubectl', 'exec', this.k8sFlags(source), escapeArg(source.pod!), '--', 'rm', '-rf', escapeArg(source.path)
      ]);
      await this.control().execute({ command: del, shell: true });
    }

    return this.getTransferStats(dest.path, options);
  }

  /**
   * Render `kubectl cp`'s `pod:path` peer.
   *
   * The pod name and the path are escaped separately so a space in the path is
   * quoted while the `:` kubectl parses on stays literal — the shell joins the
   * adjacent tokens into one word (`pod:'/a b'` → `pod:/a b`), which is the one
   * argv element kubectl expects.
   */
  private podSpec(env: Environment): string {
    return `${escapeArg(env.pod!)}:${escapeArg(env.path)}`;
  }

  /** Cluster/namespace/container flags a `kubectl` invocation must carry. */
  private k8sFlags(env: Environment): string {
    const flags: string[] = [];

    if (env.namespace) flags.push('-n', escapeArg(env.namespace));
    if (env.container) flags.push('-c', escapeArg(env.container));
    // A target names its own cluster; without these it would run against
    // whatever `kubectl config current-context` happens to be.
    if (env.context) flags.push('--context', escapeArg(env.context));
    if (env.kubeconfig) flags.push('--kubeconfig', escapeArg(env.kubeconfig));

    return flags.join(' ');
  }

  /** Join argv pieces, dropping the empty strings the flag builders may return. */
  private joinArgs(parts: string[]): string {
    return parts.filter(part => part.length > 0).join(' ');
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