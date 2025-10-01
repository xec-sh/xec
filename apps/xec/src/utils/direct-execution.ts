import { $ } from '@xec-sh/core';
import { log, prism } from '@xec-sh/kit';

import { parseTimeout } from './time.js';
import { ConfigurationManager } from '../config/configuration-manager.js';

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
  // Create a new configuration manager instance
  const configManager = new ConfigurationManager();
  const config = await configManager.load();

  // Check targets section (new structure)
  const targets = config.targets || {};

  // Check SSH hosts
  const hosts = targets.hosts || {};
  if (hosts[arg]) {
    return {
      type: 'ssh',
      name: arg,
      config: { ...hosts[arg], type: 'ssh' },
    };
  }

  // Check containers
  const containers = targets.containers || {};
  if (containers[arg]) {
    return {
      type: 'docker',
      name: arg,
      config: { ...containers[arg], type: 'docker' },
    };
  }

  // Check pods
  const pods = targets.pods || {};
  if (pods[arg]) {
    return {
      type: 'kubernetes',
      name: arg,
      config: { ...pods[arg], type: 'kubernetes' },
    };
  }

  // Try to detect running containers/pods
  try {
    // Check Docker
    const dockerResult = await $.local()`docker ps --format "{{.Names}}" | grep -E "^${arg}$"`.quiet().nothrow();
    if (dockerResult.ok && dockerResult.stdout.trim()) {
      return { type: 'docker', name: arg };
    }
  } catch {
    // Ignore
  }

  try {
    // Check Kubernetes (default namespace)
    const k8sResult = await $.local()`kubectl get pod ${arg} -o name`.quiet().nothrow();
    if (k8sResult.ok && k8sResult.stdout.trim()) {
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

  const targetDisplay = prism.cyan(target.name);

  if (!options.quiet) {
    log.info(`Executing on ${targetDisplay} (${target.type})...`);
  }

  let engine: any;

  // eslint-disable-next-line default-case
  switch (target.type) {
    case 'ssh':
      {
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
      }

    case 'docker':
      {
        const containerName = target.config?.name || target.name;
        engine = $.docker({ container: containerName });
        break;
      }

    case 'kubernetes':
      {
        const podConfig = target.config || {};
        engine = $.k8s({
          pod: podConfig.name || target.name,
          namespace: podConfig.namespace || 'default',
          container: podConfig.container,
        });
        break;
      }
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

  // Execute using raw mode to avoid escaping
  const result = await engine.raw`${command}`;

  if (result.stdout && !options.quiet) {
    console.log(result.stdout.trim());
  }

  if (result.stderr && options.verbose) {
    console.error(prism.yellow(result.stderr.trim()));
  }
}

/**
 * Execute command locally
 */
async function executeLocally(
  command: string,
  options: DirectExecutionOptions
): Promise<void> {
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

  // Execute using raw mode to avoid escaping
  const result = await engine.raw`${command}`;

  if (result.stdout && !options.quiet) {
    console.log(result.stdout.trim());
  }

  if (result.stderr && options.verbose) {
    console.error(prism.yellow(result.stderr.trim()));
  }
}

/**
 * Check if arguments look like a direct command (not a subcommand)
 */
export function isDirectCommand(args: string[], commandRegistry?: string[], taskNames?: string[]): boolean {
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

  // Check if it's a task name
  if (taskNames && taskNames.includes(firstArg)) {
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
      'release', 'r', 'i', 'v', // Include aliases and dynamic commands
      'tasks', 'explain' // Add new task-related commands
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

/**
 * Create execution engine for a target
 */
export async function createTargetEngine(target: any, options: any = {}): Promise<any> {
  const config = target.config as any;

  switch (target.type) {
    case 'local':
      return $;

    case 'ssh':
      return $.ssh({
        host: config.host,
        username: config.user || config.username,
        port: config.port,
        privateKey: config.privateKey,
        password: config.password,
        passphrase: config.passphrase,
        keepAlive: config.keepAlive,
        keepAliveInterval: config.keepAliveInterval,
        ...options
      });

    case 'docker':
      return $.docker({
        container: config.container || target.name,
        image: config.image || 'alpine:latest',
        user: config.user,
        workingDir: config.workdir,
        tty: config.tty,
        ...options
      });

    case 'kubernetes':
      return $.k8s({
        pod: config.pod || target.name,
        namespace: config.namespace || 'default',
        container: config.container,
        context: config.context,
        kubeconfig: config.kubeconfig,
        ...options
      });

    default:
      throw new Error(`Unsupported target type: ${target.type}`);
  }
}