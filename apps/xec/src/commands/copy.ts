import path from 'path';
import { z } from 'zod';
import fs from 'fs-extra';
import chalk from 'chalk';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

import { getConfig } from '../utils/config.js';
import { BaseCommand } from '../utils/command-base.js';
import { validateOptions } from '../utils/validation.js';

interface CopyOptions {
  recursive?: boolean;
  force?: boolean;
  preserve?: boolean;
  exclude?: string[];
  dryRun?: boolean;
  verbose?: boolean;
  compress?: boolean;
  progress?: boolean;
}

interface Location {
  adapter: 'local' | 'ssh' | 'docker' | 'kubernetes';
  path: string;
  host?: string;
  container?: string;
  pod?: string;
  namespace?: string;
  user?: string;
}

class CopyCommand extends BaseCommand {
  constructor() {
    super({
      name: 'copy',
      description: 'Copy files between local and remote systems',
      arguments: '<source> <destination>',
      options: [
        {
          flags: '-r, --recursive',
          description: 'Copy directories recursively'
        },
        {
          flags: '-f, --force',
          description: 'Overwrite existing files'
        },
        {
          flags: '-p, --preserve',
          description: 'Preserve file attributes'
        },
        {
          flags: '--exclude <pattern>',
          description: 'Exclude files matching pattern'
        },
        {
          flags: '-z, --compress',
          description: 'Compress during transfer'
        },
        {
          flags: '--progress',
          description: 'Show progress during transfer'
        }
      ],
      examples: [
        {
          command: 'xec copy ./app.tar.gz server.com:/tmp/',
          description: 'Copy file to SSH server'
        },
        {
          command: 'xec copy server.com:/var/log/app.log ./logs/',
          description: 'Copy file from SSH server'
        },
        {
          command: 'xec copy ./config.json docker:myapp:/app/config.json',
          description: 'Copy file to Docker container'
        },
        {
          command: 'xec copy k8s:mypod:/data/export.csv ./data/ -n production',
          description: 'Copy file from Kubernetes pod'
        },
        {
          command: 'xec copy -r ./dist/ server.com:/var/www/html/ --exclude "*.map"',
          description: 'Copy directory excluding source maps'
        }
      ],
      validateOptions: (options) => {
        const schema = z.object({
          recursive: z.boolean().optional(),
          force: z.boolean().optional(),
          preserve: z.boolean().optional(),
          exclude: z.array(z.string()).optional(),
          dryRun: z.boolean().optional(),
          verbose: z.boolean().optional(),
          compress: z.boolean().optional(),
          progress: z.boolean().optional()
        });
        validateOptions(options, schema);
      }
    });
  }

  override async execute(args: any[]): Promise<void> {
    const [source, destination] = args.slice(0, 2);
    const options = args[args.length - 1] as CopyOptions;

    if (!source || !destination) {
      throw new Error('Both source and destination are required');
    }

    const srcLocation = this.parseLocation(source);
    const destLocation = this.parseLocation(destination);

    // Validate that at least one location is local
    if (srcLocation.adapter !== 'local' && destLocation.adapter !== 'local') {
      throw new Error('Direct copying between remote systems is not supported. One location must be local.');
    }

    if (options.dryRun) {
      this.log('[DRY RUN] Would copy:', 'info');
      this.log(`  From: ${this.formatLocation(srcLocation)}`, 'info');
      this.log(`  To: ${this.formatLocation(destLocation)}`, 'info');
      return;
    }

    // Perform the copy based on adapters
    if (srcLocation.adapter === 'local' && destLocation.adapter === 'local') {
      await this.copyLocal(srcLocation.path, destLocation.path, options);
    } else if (srcLocation.adapter === 'local') {
      await this.copyToRemote(srcLocation, destLocation, options);
    } else {
      await this.copyFromRemote(srcLocation, destLocation, options);
    }
  }

  private parseLocation(location: string): Location {
    // Parse different location formats:
    // - ./local/path or /absolute/path (local)
    // - user@host:/path or host:/path (ssh)
    // - docker:container:/path (docker)
    // - k8s:pod:/path or kubernetes:pod:/path (kubernetes)

    // Docker format
    const dockerMatch = location.match(/^docker:([^:]+):(.+)$/);
    if (dockerMatch) {
      return {
        adapter: 'docker' as const,
        container: dockerMatch[1],
        path: dockerMatch[2] || ''
      };
    }

    // Kubernetes format
    const k8sMatch = location.match(/^(k8s|kubernetes):([^:]+):(.+)$/);
    if (k8sMatch) {
      return {
        adapter: 'kubernetes' as const,
        pod: k8sMatch[2],
        path: k8sMatch[3] || ''
      };
    }

    // SSH format
    const sshMatch = location.match(/^(([^@]+)@)?([^:]+):(.+)$/);
    if (sshMatch && !location.startsWith('/') && !location.startsWith('./')) {
      return {
        adapter: 'ssh' as const,
        user: sshMatch[2] || undefined,
        host: sshMatch[3],
        path: sshMatch[4] || ''
      };
    }

    // Local path
    return {
      adapter: 'local' as const,
      path: location
    };
  }

  private formatLocation(location: Location): string {
    switch (location.adapter) {
      case 'ssh':
        return `${location.user || 'root'}@${location.host || 'unknown'}:${location.path}`;
      case 'docker':
        return `docker:${location.container || 'unknown'}:${location.path}`;
      case 'kubernetes':
        return `k8s:${location.pod || 'unknown'}:${location.path}`;
      default:
        return location.path;
    }
  }

  private async copyLocal(src: string, dest: string, options: CopyOptions): Promise<void> {
    this.startSpinner('Copying files locally...');

    try {
      const srcPath = path.resolve(src);
      const destPath = path.resolve(dest);

      // Check if source exists
      if (!await fs.pathExists(srcPath)) {
        throw new Error(`Source not found: ${src}`);
      }

      const stat = await fs.stat(srcPath);

      // Check if destination exists
      if (await fs.pathExists(destPath) && !options.force) {
        this.stopSpinner();
        const shouldOverwrite = await clack.confirm({
          message: `Destination exists. Overwrite?`,
          initialValue: false
        });

        if (!shouldOverwrite) {
          this.log('Copy cancelled', 'info');
          return;
        }
        this.startSpinner('Copying files locally...');
      }

      // Copy based on type
      if (stat.isDirectory()) {
        if (!options.recursive) {
          throw new Error('Use -r/--recursive to copy directories');
        }
        await fs.copy(srcPath, destPath, {
          overwrite: options.force,
          preserveTimestamps: options.preserve,
          filter: (src) => {
            if (options.exclude) {
              const relativePath = path.relative(srcPath, src);
              return !options.exclude.some(pattern => 
                this.matchPattern(relativePath, pattern)
              );
            }
            return true;
          }
        });
      } else {
        await fs.copy(srcPath, destPath, {
          overwrite: options.force,
          preserveTimestamps: options.preserve
        });
      }

      this.stopSpinner();
      this.log(`${chalk.green('✓')} Copied ${src} to ${dest}`, 'success');
    } catch (error) {
      this.stopSpinner();
      throw error;
    }
  }

  private async copyToRemote(src: Location, dest: Location, options: CopyOptions): Promise<void> {
    const config = getConfig();

    this.startSpinner(`Copying to ${dest.adapter}...`);

    try {
      switch (dest.adapter) {
        case 'ssh':
          await this.copyToSSH(src.path, dest, options);
          break;
        
        case 'docker':
          await this.copyToDocker(src.path, dest, options);
          break;
        
        case 'kubernetes':
          await this.copyToKubernetes(src.path, dest, options);
          break;
      }

      this.stopSpinner();
      this.log(`${chalk.green('✓')} Copied to ${this.formatLocation(dest)}`, 'success');
    } catch (error) {
      this.stopSpinner();
      throw error;
    }
  }

  private async copyFromRemote(src: Location, dest: Location, options: CopyOptions): Promise<void> {
    const config = getConfig();

    this.startSpinner(`Copying from ${src.adapter}...`);

    try {
      switch (src.adapter) {
        case 'ssh':
          await this.copyFromSSH(src, dest.path, options);
          break;
        
        case 'docker':
          await this.copyFromDocker(src, dest.path, options);
          break;
        
        case 'kubernetes':
          await this.copyFromKubernetes(src, dest.path, options);
          break;
      }

      this.stopSpinner();
      this.log(`${chalk.green('✓')} Copied from ${this.formatLocation(src)}`, 'success');
    } catch (error) {
      this.stopSpinner();
      throw error;
    }
  }

  private async copyToSSH(localPath: string, remote: Location, options: CopyOptions): Promise<void> {
    const config = getConfig();
    const hostConfig = config.getSSHHost(remote.host!);
    
    const sshOptions = hostConfig || {
      host: remote.host,
      username: remote.user || process.env['USER'] || 'root'
    };

    // Use scp command for SSH transfers
    const remoteUrl = `${remote.user || sshOptions.username || 'root'}@${remote.host}:${remote.path}`;
    await $`scp ${localPath} ${remoteUrl}`;
  }

  private async copyFromSSH(remote: Location, localPath: string, options: CopyOptions): Promise<void> {
    const config = getConfig();
    const hostConfig = config.getSSHHost(remote.host!);
    
    const sshOptions = hostConfig || {
      host: remote.host,
      username: remote.user || process.env['USER'] || 'root'
    };

    // Use scp command for SSH transfers
    const remoteUrl = `${remote.user || sshOptions.username || 'root'}@${remote.host}:${remote.path}`;
    await $`scp ${remoteUrl} ${localPath}`;
  }

  private async copyToDocker(localPath: string, remote: Location, options: CopyOptions): Promise<void> {
    // Use docker cp command
    const args = ['cp'];
    if (options.preserve) args.push('-a');
    args.push(localPath, `${remote.container}:${remote.path}`);

    await $`docker ${args.join(' ')}`;
  }

  private async copyFromDocker(remote: Location, localPath: string, options: CopyOptions): Promise<void> {
    // Use docker cp command
    const args = ['cp'];
    if (options.preserve) args.push('-a');
    args.push(`${remote.container}:${remote.path}`, localPath);

    await $`docker ${args.join(' ')}`;
  }

  private async copyToKubernetes(localPath: string, remote: Location, options: CopyOptions): Promise<void> {
    const config = getConfig();
    const namespace = remote.namespace || 
                     config.getValue('kubernetes.defaults.namespace') || 
                     'default';

    const $k8s = $.k8s({ namespace } as any);
    const pod = $k8s.pod(remote.pod!);
    await pod.copyTo(localPath, remote.path);
  }

  private async copyFromKubernetes(remote: Location, localPath: string, options: CopyOptions): Promise<void> {
    const config = getConfig();
    const namespace = remote.namespace || 
                     config.getValue('kubernetes.defaults.namespace') || 
                     'default';

    const $k8s = $.k8s({ namespace } as any);
    const pod = $k8s.pod(remote.pod!);
    await pod.copyFrom(remote.path, localPath);
  }

  private matchPattern(path: string, pattern: string): boolean {
    // Simple glob pattern matching
    const regex = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
    
    return new RegExp(`^${regex}$`).test(path);
  }
}

export default function copyCommand(program: Command): void {
  const cmd = new CopyCommand();
  program.addCommand(cmd.create());
}