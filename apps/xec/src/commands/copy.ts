import { z } from 'zod';
import * as os from 'os';
import * as path from 'path';
import { $ } from '@xec-sh/core';
import * as fs from 'fs/promises';
import { prism } from '@xec-sh/kit';
import { Command } from 'commander';

import { validateOptions } from '../utils/validation.js';
import { ConfigAwareCommand, ConfigAwareOptions } from '../utils/command-base.js';
import { InteractiveHelpers, InteractiveOptions } from '../utils/interactive-helpers.js';

import type { ResolvedTarget } from '../config/types.js';

interface CopyOptions extends ConfigAwareOptions, InteractiveOptions {
  recursive?: boolean;
  preserve?: boolean;
  force?: boolean;
  parallel?: boolean;
  maxConcurrent?: string;
}

interface CopyOperation {
  source: ResolvedTarget;
  sourcePath: string;
  destination: ResolvedTarget;
  destinationPath: string;
}

export class CopyCommand extends ConfigAwareCommand {
  constructor() {
    super({
      name: 'copy',
      aliases: ['cp'],
      description: 'Copy files between targets',
      arguments: '<source> <destination>',
      options: [
        {
          flags: '-p, --profile <profile>',
          description: 'Configuration profile to use',
        },
        {
          flags: '-i, --interactive',
          description: 'Interactive mode for selecting files and options',
        },
        {
          flags: '-r, --recursive',
          description: 'Copy directories recursively',
        },
        {
          flags: '--preserve',
          description: 'Preserve file attributes',
        },
        {
          flags: '-f, --force',
          description: 'Force overwrite of existing files',
        },
        {
          flags: '--parallel',
          description: 'Copy multiple files in parallel',
        },
        {
          flags: '--max-concurrent <n>',
          description: 'Maximum concurrent copy operations',
          defaultValue: '4',
        },
      ],
      examples: [
        {
          command: 'xec copy local:./src containers.app:/app/src',
          description: 'Copy local directory to Docker container',
        },
        {
          command: 'xec copy hosts.web-1:/var/log/nginx/*.log ./logs/',
          description: 'Copy logs from SSH host to local',
        },
        {
          command: 'xec copy pods.app:/data/* hosts.backup:/backup/',
          description: 'Copy from Kubernetes pod to SSH host',
        },
        {
          command: 'xec copy containers.*:/app/config.json ./configs/{name}.json',
          description: 'Copy from multiple containers with name substitution',
        },
      ],
      validateOptions: (options) => {
        const schema = z.object({
          profile: z.string().optional(),
          interactive: z.boolean().optional(),
          recursive: z.boolean().optional(),
          preserve: z.boolean().optional(),
          force: z.boolean().optional(),
          parallel: z.boolean().optional(),
          maxConcurrent: z.string().optional(),
          verbose: z.boolean().optional(),
          quiet: z.boolean().optional(),
          dryRun: z.boolean().optional(),
        });
        validateOptions(options, schema);
      },
    });
  }

  protected override getCommandConfigKey(): string {
    return 'copy';
  }

  override async execute(args: any[]): Promise<void> {
    let [sourceSpec, destinationSpec] = args.slice(0, -1);
    const options = args[args.length - 1] as CopyOptions;

    // Handle interactive mode
    if (options.interactive) {
      const interactiveResult = await this.runInteractiveMode(options);
      if (!interactiveResult) return;

      sourceSpec = interactiveResult.sourceSpec;
      destinationSpec = interactiveResult.destinationSpec;
      Object.assign(options, interactiveResult.options);
    }

    if (!sourceSpec || !destinationSpec) {
      throw new Error('Both source and destination are required');
    }

    // Initialize configuration
    await this.initializeConfig(options);

    // Apply command defaults from config
    const defaults = this.getCommandDefaults();
    const mergedOptions = this.applyDefaults(options, defaults);

    // Parse source and destination specifications
    const operations = await this.parseCopyOperations(sourceSpec, destinationSpec, mergedOptions);

    if (operations.length === 0) {
      throw new Error('No files to copy');
    }

    // Execute copy operations
    if (mergedOptions.parallel && operations.length > 1) {
      await this.executeParallelCopy(operations, mergedOptions);
    } else {
      for (const operation of operations) {
        await this.executeSingleCopy(operation, mergedOptions);
      }
    }
  }

  private async parseCopyOperations(
    sourceSpec: string,
    destinationSpec: string,
    options: CopyOptions
  ): Promise<CopyOperation[]> {
    // Parse source
    const sourceParts = this.parseTargetPath(sourceSpec);
    const sourceTargets = await this.resolveTargetsFromSpec(sourceParts.target);

    // Parse destination
    const destParts = this.parseTargetPath(destinationSpec);
    const destTargets = await this.resolveTargetsFromSpec(destParts.target);

    if (destTargets.length === 0) {
      throw new Error('No destination target found');
    }

    if (destTargets.length > 1) {
      throw new Error('Destination must be a single target');
    }

    const destinationTarget = destTargets[0]!;
    const operations: CopyOperation[] = [];

    // Handle wildcards in source path
    for (const sourceTarget of sourceTargets) {
      if (sourceParts.path.includes('*')) {
        // Expand wildcards
        const files = await this.expandWildcard(sourceTarget, sourceParts.path);
        for (const file of files) {
          const destPath = this.computeDestinationPath(
            file,
            sourceParts.path,
            destParts.path,
            sourceTarget.name
          );
          operations.push({
            source: sourceTarget,
            sourcePath: file,
            destination: destinationTarget,
            destinationPath: destPath,
          });
        }
      } else {
        // Single file/directory
        const destPath = this.computeDestinationPath(
          sourceParts.path,
          sourceParts.path,
          destParts.path,
          sourceTarget.name
        );
        operations.push({
          source: sourceTarget,
          sourcePath: sourceParts.path,
          destination: destinationTarget,
          destinationPath: destPath,
        });
      }
    }

    return operations;
  }

  private parseTargetPath(spec: string): { target: string; path: string } {
    const colonIndex = spec.indexOf(':');
    if (colonIndex === -1) {
      // Local path without target prefix
      return { target: 'local', path: spec };
    }

    const target = spec.substring(0, colonIndex);
    const path = spec.substring(colonIndex + 1);

    // Handle absolute paths on Windows (C:\path)
    if (target.length === 1 && /[a-zA-Z]/.test(target)) {
      return { target: 'local', path: spec };
    }

    return { target, path };
  }

  private async resolveTargetsFromSpec(targetSpec: string): Promise<ResolvedTarget[]> {
    if (targetSpec === 'local') {
      return [{
        id: 'local',
        type: 'local',
        name: 'local',
        config: {
          type: 'local'
        },
        source: 'configured',
      }];
    }

    if (targetSpec.includes('*') || targetSpec.includes('{')) {
      return await this.findTargets(targetSpec);
    }

    const target = await this.resolveTarget(targetSpec);
    return [target];
  }

  private async expandWildcard(
    target: ResolvedTarget,
    pattern: string
  ): Promise<string[]> {
    if (target.type === 'local') {
      // Use local glob
      const files = await this.localGlob(pattern);
      return files;
    }

    // For remote targets, use find command
    const dir = path.dirname(pattern);
    const basename = path.basename(pattern);

    const engine = await this.createTargetEngine(target);
    const result = await engine`find ${dir} -name "${basename}" -type f 2>/dev/null || true`;

    if (!result.stdout.trim()) {
      return [];
    }

    return result.stdout
      .trim()
      .split('\n')
      .filter((line: string) => line.length > 0);
  }

  private async localGlob(pattern: string): Promise<string[]> {
    const { glob } = await import('glob');
    return await glob(pattern);
  }

  private computeDestinationPath(
    sourcePath: string,
    sourcePattern: string,
    destPattern: string,
    sourceName?: string
  ): string {
    // Handle {name} substitution
    if (destPattern.includes('{name}')) {
      // Use the source file name for substitution
      const fileName = path.basename(sourcePath);
      return destPattern.replace('{name}', fileName);
    }

    // If destination ends with /, append source filename
    if (destPattern.endsWith('/')) {
      return path.join(destPattern, path.basename(sourcePath));
    }

    // If source is a pattern and dest is not, use dest as directory
    if (sourcePattern.includes('*') && !destPattern.includes('*')) {
      return path.join(destPattern, path.basename(sourcePath));
    }

    return destPattern;
  }

  private async executeSingleCopy(
    operation: CopyOperation,
    options: CopyOptions
  ): Promise<void> {
    const { source, sourcePath, destination, destinationPath } = operation;

    const sourceDisplay = this.formatCopyPath(source, sourcePath);
    const destDisplay = this.formatCopyPath(destination, destinationPath);

    if (options.dryRun) {
      this.log(`[DRY RUN] Would copy ${sourceDisplay} to ${destDisplay}`, 'info');
      return;
    }

    if (!options.quiet) {
      this.startSpinner(`Copying ${sourceDisplay} to ${destDisplay}...`);
    }

    try {
      // Check if source exists
      const exists = await this.checkFileExists(source, sourcePath);
      if (!exists) {
        throw new Error(`Source file not found: ${sourcePath}`);
      }

      // Check if source is directory
      const isDir = await this.isDirectory(source, sourcePath);
      if (isDir && !options.recursive) {
        throw new Error(`${sourcePath} is a directory (use --recursive to copy directories)`);
      }

      // Perform the copy based on source and destination types
      await this.performCopy(
        source,
        sourcePath,
        destination,
        destinationPath,
        isDir,
        options
      );

      if (!options.quiet) {
        this.stopSpinner();
        this.log(`${prism.green('✓')} Copied ${sourceDisplay} to ${destDisplay}`, 'success');
      }
    } catch (error) {
      if (!options.quiet) {
        this.stopSpinner();
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`${prism.red('✗')} Failed to copy: ${errorMessage}`, 'error');
      throw error;
    }
  }

  private async executeParallelCopy(
    operations: CopyOperation[],
    options: CopyOptions
  ): Promise<void> {
    const maxConcurrent = parseInt(options.maxConcurrent || '4', 10);
    this.log(`Copying ${operations.length} files in parallel (max ${maxConcurrent} concurrent)...`, 'info');

    let completed = 0;
    const total = operations.length;
    const results: Array<{ operation: CopyOperation; success: boolean; error?: any }> = [];

    // Process operations in batches
    for (let i = 0; i < operations.length; i += maxConcurrent) {
      const batch = operations.slice(i, i + maxConcurrent);

      const batchPromises = batch.map(async (operation) => {
        try {
          await this.executeSingleCopy(operation, { ...options, quiet: true });
          completed++;
          results.push({ operation, success: true });

          if (!options.quiet) {
            this.log(`[${completed}/${total}] Copied ${this.formatCopyPath(operation.source, operation.sourcePath)}`, 'info');
          }
        } catch (error) {
          results.push({ operation, success: false, error });
        }
      });

      await Promise.all(batchPromises);
    }

    // Display results
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (successful.length > 0) {
      this.log(`${prism.green('✓')} Successfully copied ${successful.length} files`, 'success');
    }

    if (failed.length > 0) {
      this.log(`${prism.red('✗')} Failed to copy ${failed.length} files:`, 'error');
      for (const result of failed) {
        const errorMessage = result.error instanceof Error ? result.error.message : String(result.error);
        this.log(`  - ${this.formatCopyPath(result.operation.source, result.operation.sourcePath)}: ${errorMessage}`, 'error');
      }
      throw new Error(`Copy failed for ${failed.length} files`);
    }
  }

  private async performCopy(
    source: ResolvedTarget,
    sourcePath: string,
    destination: ResolvedTarget,
    destinationPath: string,
    isDirectory: boolean,
    options: CopyOptions
  ): Promise<void> {
    // Create a temporary directory for staging
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-copy-'));

    try {
      const tempPath = path.join(tempDir, path.basename(sourcePath));

      // Step 1: Copy from source to temp
      await this.copyToTemp(source, sourcePath, tempPath, isDirectory, options);

      // Step 2: Copy from temp to destination
      await this.copyFromTemp(tempPath, destination, destinationPath, isDirectory, options);
    } finally {
      // Cleanup temp directory
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  private async copyToTemp(
    source: ResolvedTarget,
    sourcePath: string,
    tempPath: string,
    isDirectory: boolean,
    options: CopyOptions
  ): Promise<void> {
    // Create a local engine that doesn't depend on process.cwd()
    const localEngine = $.local().cd(os.homedir());
    // eslint-disable-next-line default-case
    switch (source.type) {
      case 'local':
        if (isDirectory) {
          await this.copyDirectory(sourcePath, tempPath, options.preserve);
        } else {
          await fs.copyFile(sourcePath, tempPath);
          if (options.preserve) {
            const stats = await fs.stat(sourcePath);
            await fs.utimes(tempPath, stats.atime, stats.mtime);
          }
        }
        break;

      case 'ssh': {
        const config = source.config as any;
        const sshEngine = await this.createTargetEngine(source);

        if (isDirectory) {
          // Use tar for directory transfer
          const remoteFile = `/tmp/xec-copy-${Date.now()}.tar`;
          await sshEngine`tar -cf ${remoteFile} -C ${path.dirname(sourcePath)} ${path.basename(sourcePath)}`;

          // Transfer tar file using sshpass if password is provided
          const scpArgs = this.buildSshArgs(config);
          const scpTarget = this.buildSshTarget(config);

          if (config.password) {
            await localEngine`sshpass -p ${config.password} scp ${scpArgs} ${scpTarget}:${remoteFile} ${tempPath}.tar`;
          } else {
            await localEngine`scp ${scpArgs} ${scpTarget}:${remoteFile} ${tempPath}.tar`;
          }

          // Extract tar locally
          await localEngine`tar -xf ${tempPath}.tar -C ${path.dirname(tempPath)}`;
          await fs.unlink(`${tempPath}.tar`);

          // Clean up remote tar file
          await sshEngine`rm -f ${remoteFile}`;
        } else {
          // Direct file transfer using sshpass if password is provided
          const scpArgs = this.buildSshArgs(config);
          const scpTarget = this.buildSshTarget(config);

          if (config.password) {
            await localEngine`sshpass -p ${config.password} scp ${scpArgs} ${scpTarget}:${sourcePath} ${tempPath}`;
          } else {
            await localEngine`scp ${scpArgs} ${scpTarget}:${sourcePath} ${tempPath}`;
          }
        }
        break;
      }

      case 'docker': {
        const config = source.config as any;
        const container = config.container || source.name;

        if (isDirectory) {
          await localEngine`docker cp ${container}:${sourcePath} ${tempPath}`;
        } else {
          await localEngine`docker cp ${container}:${sourcePath} ${tempPath}`;
        }
        break;
      }

      case 'kubernetes': {
        const config = source.config as any;
        const namespace = config.namespace || 'default';
        const pod = config.pod || source.name;
        const containerFlag = config.container ? `-c ${config.container}` : '';

        if (isDirectory) {
          // Use tar for directory transfer
          const tarFile = `${tempPath}.tar`;
          const tarCommand = `kubectl exec -n ${namespace} ${containerFlag} ${pod} -- tar -cf - -C ${path.dirname(sourcePath)} ${path.basename(sourcePath)}`;
          await localEngine`sh -c "${tarCommand} > ${tarFile}"`;

          // Extract tar
          await localEngine`tar -xf ${tarFile} -C ${path.dirname(tempPath)}`;
          await fs.unlink(tarFile);
        } else {
          await localEngine`kubectl cp ${namespace}/${pod}:${sourcePath} ${tempPath} ${containerFlag}`;
        }
        break;
      }
    }
  }

  private async copyFromTemp(
    tempPath: string,
    destination: ResolvedTarget,
    destinationPath: string,
    isDirectory: boolean,
    options: CopyOptions
  ): Promise<void> {
    // Create a local engine that doesn't depend on process.cwd()
    const localEngine = $.local().cd(os.homedir());
    // eslint-disable-next-line default-case
    switch (destination.type) {
      case 'local':
        if (isDirectory) {
          await this.copyDirectory(tempPath, destinationPath, options.preserve);
        } else {
          // Ensure destination directory exists
          await fs.mkdir(path.dirname(destinationPath), { recursive: true });
          await fs.copyFile(tempPath, destinationPath);
          if (options.preserve) {
            const stats = await fs.stat(tempPath);
            await fs.utimes(destinationPath, stats.atime, stats.mtime);
          }
        }
        break;

      case 'ssh': {
        const config = destination.config as any;
        const sshEngine = await this.createTargetEngine(destination);

        // Ensure destination directory exists
        await sshEngine`mkdir -p ${path.dirname(destinationPath)}`;

        if (isDirectory) {
          // Use tar for directory transfer
          const tarFile = `${tempPath}.tar`;
          await localEngine`tar -cf ${tarFile} -C ${path.dirname(tempPath)} ${path.basename(tempPath)}`;

          // Transfer tar file using sshpass if password is provided
          const remoteFile = `/tmp/xec-copy-${Date.now()}.tar`;
          const scpArgs = this.buildSshArgs(config);
          const scpTarget = this.buildSshTarget(config);

          if (config.password) {
            await localEngine`sshpass -p ${config.password} scp ${scpArgs} ${tarFile} ${scpTarget}:${remoteFile}`;
          } else {
            await localEngine`scp ${scpArgs} ${tarFile} ${scpTarget}:${remoteFile}`;
          }

          // Extract tar on remote
          await sshEngine`tar -xf ${remoteFile} -C ${path.dirname(destinationPath)} && rm ${remoteFile}`;
          await fs.unlink(tarFile);
        } else {
          // Direct file transfer using sshpass if password is provided
          const scpArgs = this.buildSshArgs(config);
          const scpTarget = this.buildSshTarget(config);

          if (config.password) {
            await localEngine`sshpass -p ${config.password} scp ${scpArgs} ${tempPath} ${scpTarget}:${destinationPath}`;
          } else {
            await localEngine`scp ${scpArgs} ${tempPath} ${scpTarget}:${destinationPath}`;
          }
        }
        break;
      }

      case 'docker': {
        const config = destination.config as any;
        const container = config.container || destination.name;

        await localEngine`docker cp ${tempPath} ${container}:${destinationPath}`;
        break;
      }

      case 'kubernetes': {
        const config = destination.config as any;
        const namespace = config.namespace || 'default';
        const pod = config.pod || destination.name;
        const containerFlag = config.container ? `-c ${config.container}` : '';

        if (isDirectory) {
          // Use tar for directory transfer
          const tarFile = `${tempPath}.tar`;
          await localEngine`tar -cf ${tarFile} -C ${path.dirname(tempPath)} ${path.basename(tempPath)}`;

          await localEngine`kubectl cp ${tarFile} ${namespace}/${pod}:${tarFile} ${containerFlag}`;
          const k8sEngine = await this.createTargetEngine(destination);
          await k8sEngine`tar -xf ${tarFile} -C ${path.dirname(destinationPath)} && rm ${tarFile}`;
        } else {
          await localEngine`kubectl cp ${tempPath} ${namespace}/${pod}:${destinationPath} ${containerFlag}`;
        }
        break;
      }
    }
  }

  private async copyDirectory(source: string, destination: string, preserve?: boolean): Promise<void> {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath, preserve);
      } else {
        await fs.copyFile(sourcePath, destPath);
        if (preserve) {
          const stats = await fs.stat(sourcePath);
          await fs.utimes(destPath, stats.atime, stats.mtime);
        }
      }
    }
  }

  private async checkFileExists(target: ResolvedTarget, filePath: string): Promise<boolean> {
    try {
      if (target.type === 'local') {
        await fs.access(filePath);
        return true;
      }

      const engine = await this.createTargetEngine(target);
      const result = await engine`test -e ${filePath} && echo "exists" || echo "not-exists"`;
      return result.stdout.trim() === 'exists';
    } catch {
      return false;
    }
  }

  private async isDirectory(target: ResolvedTarget, filePath: string): Promise<boolean> {
    try {
      if (target.type === 'local') {
        const stat = await fs.stat(filePath);
        return stat.isDirectory();
      }

      const engine = await this.createTargetEngine(target);
      const result = await engine`test -d ${filePath} && echo "directory" || echo "not-directory"`;
      return result.stdout.trim() === 'directory';
    } catch {
      return false;
    }
  }

  private buildSshArgs(config: any): string {
    const args: string[] = [];

    if (config.port && config.port !== 22) {
      args.push('-P', String(config.port));
    }

    if (config.privateKey) {
      args.push('-i', config.privateKey);
    }

    return args.join(' ');
  }

  private buildSshTarget(config: any): string {
    return `${config.user || process.env['USER'] || 'root'}@${config.host}`;
  }

  private formatCopyPath(target: ResolvedTarget, filePath: string): string {
    if (target.type === 'local') {
      return filePath;
    }
    return `${this.formatTargetDisplay(target)}:${filePath}`;
  }

  private async runInteractiveMode(options: CopyOptions): Promise<{
    sourceSpec: string;
    destinationSpec: string;
    options: Partial<CopyOptions>;
  } | null> {
    InteractiveHelpers.startInteractiveMode('Interactive Copy Mode');

    try {
      // Select source
      const sourceType = await InteractiveHelpers.selectFromList(
        'What do you want to copy?',
        [
          { value: 'file', label: 'Single file' },
          { value: 'directory', label: 'Directory' },
          { value: 'pattern', label: 'Files matching pattern' },
        ],
        (item) => item.label
      );

      if (!sourceType) return null;

      // Select source target
      const sourceTarget = await InteractiveHelpers.selectTarget({
        message: 'Select source location:',
        type: 'all',
        allowCustom: true,
      });

      if (!sourceTarget || Array.isArray(sourceTarget)) return null;

      // Get source path
      let sourcePath: string | null = null;
      if (sourceType.value === 'pattern') {
        sourcePath = await InteractiveHelpers.inputText('Enter file pattern:', {
          placeholder: '*.log or /path/*.txt',
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Pattern cannot be empty';
            }
            return undefined;
          },
        });
      } else {
        sourcePath = await InteractiveHelpers.inputText('Enter source path:', {
          placeholder: sourceType.value === 'file' ? '/path/to/file.txt' : '/path/to/directory',
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Path cannot be empty';
            }
            return undefined;
          },
        });
      }

      if (!sourcePath) return null;

      // Select destination target
      const destTarget = await InteractiveHelpers.selectTarget({
        message: 'Select destination location:',
        type: 'all',
        allowCustom: true,
      });

      if (!destTarget || Array.isArray(destTarget)) return null;

      // Get destination path
      const destPath = await InteractiveHelpers.inputText('Enter destination path:', {
        placeholder: '/path/to/destination/',
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Path cannot be empty';
          }
          return undefined;
        },
      });

      if (!destPath) return null;

      // Copy options
      const copyOptions: Partial<CopyOptions> = {};

      if (sourceType.value === 'directory') {
        copyOptions.recursive = await InteractiveHelpers.confirmAction(
          'Copy recursively?',
          true
        );
      }

      copyOptions.preserve = await InteractiveHelpers.confirmAction(
        'Preserve file attributes?',
        false
      );

      copyOptions.force = await InteractiveHelpers.confirmAction(
        'Force overwrite existing files?',
        false
      );

      // For multiple files, ask about parallel copy
      if (sourceType.value === 'pattern') {
        copyOptions.parallel = await InteractiveHelpers.confirmAction(
          'Copy files in parallel?',
          false
        );

        if (copyOptions.parallel) {
          const maxConcurrent = await InteractiveHelpers.inputText(
            'Maximum concurrent operations:',
            {
              initialValue: '4',
              validate: (value) => {
                if (!value) return 'Value is required';
                const num = parseInt(value);
                if (isNaN(num) || num < 1) {
                  return 'Please enter a valid number (1 or more)';
                }
                return undefined;
              },
            }
          );
          if (maxConcurrent) {
            copyOptions.maxConcurrent = maxConcurrent;
          }
        }
      }

      // Build source and destination specs
      const sourceSpec = sourceTarget.type === 'local'
        ? sourcePath
        : `${sourceTarget.id}:${sourcePath}`;

      const destinationSpec = destTarget.type === 'local'
        ? destPath
        : `${destTarget.id}:${destPath}`;

      // Show summary
      InteractiveHelpers.showInfo('\nCopy Summary:');
      console.log(`  Source: ${prism.cyan(sourceSpec)}`);
      console.log(`  Destination: ${prism.cyan(destinationSpec)}`);
      if (copyOptions.recursive) console.log(`  Options: ${prism.gray('recursive')}`);
      if (copyOptions.preserve) console.log(`  Options: ${prism.gray('preserve attributes')}`);
      if (copyOptions.force) console.log(`  Options: ${prism.gray('force overwrite')}`);
      if (copyOptions.parallel) console.log(`  Options: ${prism.gray(`parallel (max ${copyOptions.maxConcurrent || '4'})`)}`);

      const confirm = await InteractiveHelpers.confirmAction(
        '\nProceed with copy?',
        true
      );

      if (!confirm) {
        InteractiveHelpers.endInteractiveMode('Copy cancelled');
        return null;
      }

      return {
        sourceSpec,
        destinationSpec,
        options: copyOptions,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('cancelled')) {
        InteractiveHelpers.endInteractiveMode('Copy cancelled');
      } else {
        InteractiveHelpers.showError(error instanceof Error ? error.message : String(error));
      }
      return null;
    }
  }
}

export default function command(program: Command): void {
  const cmd = new CopyCommand();
  program.addCommand(cmd.create());
}