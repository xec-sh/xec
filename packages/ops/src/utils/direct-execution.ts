import { $ } from '@xec-sh/core';

import { parseTimeout } from './time.js';

interface DirectExecutionOptions {
  verbose?: boolean;
  quiet?: boolean;
  cwd?: string;
  timeout?: string;
  env?: Record<string, string>;
}

/** Execute local argv literally. Remote execution requires an explicit target command. */
export async function executeDirectCommand(
  args: string[],
  options: DirectExecutionOptions = {}
): Promise<void> {
  const [command, ...argv] = args;
  if (!command?.trim()) throw new Error('No command specified');

  const result = await $.local().exec(command, {
    args: argv,
    shell: false,
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeout === undefined ? undefined : parseTimeout(options.timeout),
  });
  // Preserve stream boundaries and whitespace. Failed commands retain their
  // captured output on the error; the shared diagnostic formatter owns it.
  if (!options.quiet) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

/** Resolve against the actual native command and task registries, not a second inventory. */
export function isDirectCommand(args: string[], commandRegistry: string[], taskNames: string[] = []): boolean {
  const firstArg = args[0];
  return Boolean(firstArg && !firstArg.startsWith('-') && !commandRegistry.includes(firstArg) && !taskNames.includes(firstArg));
}

/**
 * Create execution engine for a target
 */
type TargetExecutionEngine = ReturnType<typeof $.local> | ReturnType<typeof $.ssh> | ReturnType<typeof $.k8s>;

export async function createTargetEngine(target: any, options: any = {}): Promise<TargetExecutionEngine> {
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
        // Host key policy must reach the adapter, or a target that declares
        // `hostKeyChecking` silently gets the default instead.
        hostKeyChecking: config.hostKeyChecking,
        knownHostsPath: config.knownHostsPath,
        ...options
      });

    case 'docker':
      return $.docker({
        container: config.container || target.name,
        // No default image. The engine reads `image` as "run a fresh
        // ephemeral container", so defaulting it sent every command into a
        // brand-new alpine instead of the container the target names —
        // verified: two different hostnames for the same target.
        ...(config.image ? { image: config.image } : {}),
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