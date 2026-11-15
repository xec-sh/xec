/**
 * Configuration Validator
 * Validates configuration structure and values
 */

import type {
  TaskConfig,
  Configuration,
  TargetsConfig,
  ValidationError
} from './types.js';

import { TaskParser, TaskParseError } from './task-parser.js';
import { SUPPORTED_SECRET_PROVIDERS, UNIMPLEMENTED_SECRET_PROVIDERS } from '../secrets/index.js';

/**
 * Configuration validator implementation
 */
export class ConfigValidator {
  private errors: ValidationError[] = [];

  /** Reject unsupported executable contracts before loading can create files or run code. */
  static unsupportedCapabilities(config: unknown): ValidationError[] {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return [];
    const value = config as Record<string, unknown>;
    const entries: Array<[string, unknown]> = [['', value]];
    if (value['profiles'] && typeof value['profiles'] === 'object' && !Array.isArray(value['profiles'])) {
      entries.push(...Object.entries(value['profiles']).map(([name, profile]): [string, unknown] => [`profiles.${name}.`, profile]));
    }
    return entries.flatMap(([prefix, entry]) => entry && typeof entry === 'object' && Object.hasOwn(entry, 'extensions')
      ? [{ path: `${prefix}extensions`, rule: 'error',
        message: 'Extension loading is not implemented. Use native project commands in .xec/commands/ or explicit task definitions.' }]
      : []);
  }

  /**
   * Validate configuration
   */
  async validate(config: Configuration): Promise<ValidationError[]> {
    this.errors = ConfigValidator.unsupportedCapabilities(config);

    // Validate version
    this.validateVersion(config.version);

    // Validate structure
    if (config.vars) {
      this.validateVars(config.vars, 'vars');
    }

    if (config.targets) {
      this.validateTargets(config.targets);
    }

    if (config.profiles) {
      this.validateProfiles(config.profiles);
    }

    if (config.tasks) {
      this.validateTasks(config.tasks);
    }

    if (config.scripts) {
      this.validateScripts(config.scripts);
    }

    if (config.commands) {
      this.validateCommands(config.commands);
    }

    if (config.secrets) {
      this.validateSecrets(config.secrets);
    }

    return this.errors;
  }

  // Private validation methods

  private validateVersion(version: string): void {
    if (!version) {
      this.addError('version', 'Version is required');
      return;
    }

    // Check version format (major.minor)
    if (!/^\d+\.\d+$/.test(version)) {
      this.addError('version', `Invalid version format: ${version}. Expected: major.minor (e.g., 1.0)`);
    }

    // Check supported versions
    const versionParts = version.split('.').map(Number);
    const major = versionParts[0];
    if (!major || major < 1) {
      this.addError('version', `Version ${version} is not supported. Minimum version: 1.0`);
    }
  }

  private validateVars(vars: Record<string, any>, path: string): void {
    for (const [key, value] of Object.entries(vars)) {
      const varPath = `${path}.${key}`;

      // Check for reserved variable names
      if (['env', 'params', 'cmd', 'secret'].includes(key)) {
        this.addError(varPath, `Variable name '${key}' is reserved`);
      }

      // Check for circular references (basic check)
      if (typeof value === 'string' && value.includes(`\${vars.${key}}`)) {
        this.addError(varPath, 'Circular reference detected');
      }

      // Validate nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.validateVars(value, varPath);
      }
    }
  }

  private validateTargets(targets: TargetsConfig): void {
    // Validate hosts
    if (targets.hosts) {
      for (const [name, config] of Object.entries(targets.hosts)) {
        this.validateHost(config, `targets.hosts.${name}`);
      }
    }

    // Validate containers
    if (targets.containers) {
      for (const [name, config] of Object.entries(targets.containers)) {
        this.validateContainer(config, `targets.containers.${name}`);
      }
    }

    // Validate pods
    if (targets.pods) {
      for (const [name, config] of Object.entries(targets.pods)) {
        this.validatePod(config, `targets.pods.${name}`);
      }
    }
  }

  private validateHost(config: any, path: string): void {
    if (!config.host) {
      this.addError(path, 'Host is required for SSH target');
    }

    if (config.port && (typeof config.port !== 'number' || config.port < 1 || config.port > 65535)) {
      this.addError(`${path}.port`, 'Port must be a number between 1 and 65535');
    }

    if (config.privateKey && config.password) {
      this.addWarning(path, 'Both privateKey and password specified. privateKey will take precedence');
    }
  }

  private validateContainer(config: any, path: string): void {
    if (!config.image && !config.container) {
      this.addError(path, 'Either image or container must be specified');
    }

    if (config.volumes && !Array.isArray(config.volumes)) {
      this.addError(`${path}.volumes`, 'Volumes must be an array');
    }

    if (config.ports && !Array.isArray(config.ports)) {
      this.addError(`${path}.ports`, 'Ports must be an array');
    }
  }

  private validatePod(config: any, path: string): void {
    if (!config.pod && !config.selector) {
      this.addError(path, 'Either pod or selector must be specified');
    }

    if (config.pod && config.selector) {
      this.addWarning(path, 'Both pod and selector specified. pod will take precedence');
    }
  }

  private validateProfiles(profiles: Record<string, any>): void {
    for (const [name, profile] of Object.entries(profiles)) {
      const path = `profiles.${name}`;

      if (profile.extends) {
        // Check if extended profile exists
        if (!profiles[profile.extends]) {
          this.addError(`${path}.extends`, `Extended profile '${profile.extends}' not found`);
        }

        // Check for circular inheritance
        if (this.hasCircularInheritance(name, profiles)) {
          this.addError(path, 'Circular profile inheritance detected');
        }
      }

      if (profile.vars) {
        this.validateVars(profile.vars, `${path}.vars`);
      }

      if (profile.targets) {
        this.validateTargets(profile.targets);
      }
    }
  }

  private validateTasks(tasks: Record<string, TaskConfig>): void {
    if (!tasks || typeof tasks !== 'object' || Array.isArray(tasks)) {
      this.addError('tasks', 'Tasks must be an object');
      return;
    }
    try { new TaskParser().parseTasks(tasks); }
    catch (error) {
      if (!(error instanceof TaskParseError)) throw error;
      this.errors.push(...error.errors.map(item => ({ ...item, rule: item.rule ?? 'error' })));
    }
  }

  private validateTimeout(timeout: string | number, path: string): void {
    if (typeof timeout === 'number') {
      if (timeout < 0) {
        this.addError(path, 'Timeout must be positive');
      }
    } else if (typeof timeout === 'string') {
      // Validate duration format (e.g., 30s, 5m, 1h)
      if (!/^\d+[smh]$/.test(timeout)) {
        this.addError(path, 'Invalid timeout format. Use number (ms) or duration string (e.g., 30s, 5m, 1h)');
      }
    }
  }

  private validateScripts(scripts: any): void {
    if (scripts.sandbox) {
      const sandbox = scripts.sandbox;

      if (sandbox.restrictions && !Array.isArray(sandbox.restrictions)) {
        this.addError('scripts.sandbox.restrictions', 'Restrictions must be an array');
      }

      if (sandbox.memoryLimit && !/^\d+[KMG]B?$/i.test(sandbox.memoryLimit)) {
        this.addError('scripts.sandbox.memoryLimit', 'Invalid memory limit format');
      }

      if (sandbox.timeout) {
        this.validateTimeout(sandbox.timeout, 'scripts.sandbox.timeout');
      }
    }
  }

  private validateCommands(commands: Record<string, unknown>): void {
    // The CLI owns option names, types and subcommands. Ops only validates
    // this container; it must not maintain a second command option schema.
    for (const [name, value] of Object.entries(commands)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        this.addError(`commands.${name}`, 'Command defaults must be an object');
      }
    }
  }

  private validateSecrets(secrets: any): void {
    if (!secrets.provider) {
      this.addError('secrets.provider', 'Provider is required');
      return;
    }

    // Must match what SecretManager actually implements — the lists are shared
    // so validation and runtime support cannot drift apart.
    const supported = SUPPORTED_SECRET_PROVIDERS as readonly string[];
    const notImplemented = UNIMPLEMENTED_SECRET_PROVIDERS as readonly string[];

    if (!supported.includes(secrets.provider)) {
      const message = notImplemented.includes(secrets.provider)
        ? `Secrets provider '${secrets.provider}' is not yet implemented. Supported providers: ${supported.join(', ')}`
        : `Unknown secrets provider: '${secrets.provider}'. Supported providers: ${supported.join(', ')}`;
      this.addError('secrets.provider', message);
    }
  }

  private hasCircularInheritance(profile: string, profiles: Record<string, any>): boolean {
    const visited = new Set<string>();
    let current = profile;

    while (current) {
      if (visited.has(current)) {
        return true;
      }

      visited.add(current);
      current = profiles[current]?.extends;
    }

    return false;
  }

  private addError(path: string, message: string, value?: any): void {
    this.errors.push({
      path,
      message,
      value,
      rule: 'error'
    });
  }

  private addWarning(path: string, message: string, value?: any): void {
    this.errors.push({
      path,
      message,
      value,
      rule: 'warning'
    });
  }
}