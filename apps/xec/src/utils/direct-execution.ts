import chalk from 'chalk';
import { $ } from '@xec-sh/core';
import * as clack from '@clack/prompts';

import { getConfig } from './config.js';
import { parseTimeout } from './time.js';

interface DirectExecutionOptions {
  verbose?: boolean;
  quiet?: boolean;
  cwd?: string;
  timeout?: string;
  env?: Record<string, string>;
}

/**
 * Execute a command directly based on smart defaults
 */
export async function executeDirectCommand(
  args: string[],
  options: DirectExecutionOptions = {}
): Promise<void> {
  const config = getConfig();
  
  // Join all arguments as the command
  const command = args.join(' ');
  
  if (!command.trim()) {
    throw new Error('No command specified');
  }

  // Check if the first argument matches a known host, container, or pod
  const firstArg = args[0];
  if (!firstArg) {
    // No arguments, execute locally
    await executeLocally(command, options);
    return;
  }
  
  const target = await detectTarget(firstArg);
  
  if (target) {
    // Execute on detected target
    await executeOnTarget(target, args.slice(1).join(' '), options);
  } else {
    // Execute locally
    await executeLocally(command, options);
  }
}

interface Target {
  type: 'ssh' | 'docker' | 'kubernetes';
  name: string;
  config?: any;
}

/**
 * Detect if the first argument is a known target
 */
async function detectTarget(arg: string): Promise<Target | null> {
  const config = getConfig();
  
  // Check SSH hosts
  const sshHosts = config.getValue('adapters.ssh.hosts') || {};
  const unifiedHosts = config.getValue('hosts') || {};
  
  if (sshHosts[arg] || unifiedHosts[arg]) {
    return {
      type: 'ssh',
      name: arg,
      config: sshHosts[arg] || unifiedHosts[arg],
    };
  }
  
  // Check containers
  const containers = config.getValue('containers') || {};
  if (containers[arg]) {
    return {
      type: 'docker',
      name: arg,
      config: containers[arg],
    };
  }
  
  // Check pods
  const pods = config.getValue('pods') || {};
  if (pods[arg]) {
    return {
      type: 'kubernetes',
      name: arg,
      config: pods[arg],
    };
  }
  
  // Try to detect running containers/pods
  try {
    // Check Docker
    const dockerResult = await $.local()`docker ps --format "{{.Names}}" | grep -E "^${arg}$"`.quiet().nothrow();
    if (dockerResult.isSuccess() && dockerResult.stdout.trim()) {
      return { type: 'docker', name: arg };
    }
  } catch {
    // Ignore
  }
  
  try {
    // Check Kubernetes (default namespace)
    const k8sResult = await $.local()`kubectl get pod ${arg} -o name`.quiet().nothrow();
    if (k8sResult.isSuccess() && k8sResult.stdout.trim()) {
      return { type: 'kubernetes', name: arg };
    }
  } catch {
    // Ignore
  }
  
  return null;
}

/**
 * Execute command on detected target
 */
async function executeOnTarget(
  target: Target,
  command: string,
  options: DirectExecutionOptions
): Promise<void> {
  if (!command.trim()) {
    throw new Error('No command specified for target');
  }

  const targetDisplay = chalk.cyan(target.name);
  
  if (!options.quiet) {
    clack.log.info(`Executing on ${targetDisplay} (${target.type})...`);
  }
  
  try {
    let engine: any;
    
    switch (target.type) {
      case 'ssh':
        const sshConfig = target.config || { host: target.name };
        engine = $.ssh({
          host: sshConfig.host || target.name,
          username: sshConfig.username || sshConfig.user || process.env['USER'] || 'root',
          port: sshConfig.port || 22,
          privateKey: sshConfig.privateKey || sshConfig.key || sshConfig.identityFile,
          password: sshConfig.password,
          passphrase: sshConfig.passphrase,
        });
        break;
        
      case 'docker':
        const containerName = target.config?.name || target.name;
        engine = $.docker({ container: containerName });
        break;
        
      case 'kubernetes':
        const podConfig = target.config || {};
        engine = $.k8s({
          pod: podConfig.name || target.name,
          namespace: podConfig.namespace || 'default',
          container: podConfig.container,
        });
        break;
    }
    
    // Apply options
    if (options.cwd) {
      engine = engine.cd(options.cwd);
    }
    
    if (options.env) {
      engine = engine.env(options.env);
    }
    
    if (options.timeout) {
      const timeoutMs = parseTimeout(options.timeout);
      engine = engine.timeout(timeoutMs);
    }
    
    // Execute
    const result = await engine`${command}`;
    
    if (result.stdout && !options.quiet) {
      console.log(result.stdout.trim());
    }
    
    if (result.stderr && options.verbose) {
      console.error(chalk.yellow(result.stderr.trim()));
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!options.quiet) {
      clack.log.error(`Failed on ${targetDisplay}: ${errorMessage}`);
    }
    throw error;
  }
}

/**
 * Execute command locally
 */
async function executeLocally(
  command: string,
  options: DirectExecutionOptions
): Promise<void> {
  try {
    let engine = $.local();
    
    // Apply options
    if (options.cwd) {
      engine = engine.cd(options.cwd);
    }
    
    if (options.env) {
      engine = engine.env(options.env);
    }
    
    if (options.timeout) {
      const timeoutMs = parseTimeout(options.timeout);
      engine = engine.timeout(timeoutMs);
    }
    
    // Execute
    const result = await engine`${command}`;
    
    if (result.stdout && !options.quiet) {
      console.log(result.stdout.trim());
    }
    
    if (result.stderr && options.verbose) {
      console.error(chalk.yellow(result.stderr.trim()));
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!options.quiet) {
      clack.log.error(errorMessage);
    }
    throw error;
  }
}

/**
 * Check if arguments look like a direct command (not a subcommand)
 */
export function isDirectCommand(args: string[], commandRegistry?: string[]): boolean {
  if (args.length === 0) {
    return false;
  }
  
  const firstArg = args[0];
  if (!firstArg) {
    return false;
  }
  
  // If first arg starts with -, it's probably an option
  if (firstArg.startsWith('-')) {
    return false;
  }
  
  // Use command registry if provided
  if (commandRegistry) {
    // Check if the first arg is a known command
    if (commandRegistry.includes(firstArg)) {
      return false;
    }
  } else {
    // Fallback to static list if no registry provided
    const knownSubcommands = [
      'exec', 'ssh', 'docker', 'k8s', 'run', 'init', 'config',
      'env', 'copy', 'list', 'new', 'version', 'watch',
      'on', 'in', 'help', 'cache', 'forward', 'interactive', 'logs',
      'release', 'r', 'i', 'v' // Include aliases and dynamic commands
    ];
    
    if (knownSubcommands.includes(firstArg)) {
      return false;
    }
  }
  
  // If the first argument is quoted or contains spaces, it's likely a command
  if (firstArg && (firstArg.includes(' ') || (firstArg.startsWith('"') && firstArg.endsWith('"')))) {
    return true;
  }
  
  // Otherwise, it might be a direct command
  return true;
}