/**
 * Configuration Validator
 * Validates configuration structure and values
 */

import type {
  TaskConfig,
  Configuration,
  TaskParameter,
  TargetsConfig,
  TaskDefinition,
  ValidationError
} from './types.js';

/**
 * Configuration validator implementation
 */
export class ConfigValidator {
  private errors: ValidationError[] = [];

  /**
   * Validate configuration
   */
  async validate(config: Configuration): Promise<ValidationError[]> {
    this.errors = [];

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

    if (config.extensions) {
      this.validateExtensions(config.extensions);
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
    const taskNames = new Set(Object.keys(tasks));

    for (const [name, task] of Object.entries(tasks)) {
      const path = `tasks.${name}`;

      if (typeof task === 'string') {
        // Simple command task - no validation needed
        continue;
      }

      const taskDef = task as TaskDefinition;

      // Validate task structure
      if (!taskDef.command && !taskDef.steps && !taskDef.script) {
        this.addError(path, 'Task must have either command, steps, or script');
      }

      if (taskDef.command && taskDef.steps) {
        this.addError(path, 'Task cannot have both command and steps');
      }

      // Validate parameters
      if (taskDef.params) {
        this.validateTaskParameters(taskDef.params, `${path}.params`);
      }

      // Validate steps
      if (taskDef.steps) {
        this.validateTaskSteps(taskDef.steps, `${path}.steps`, taskNames);
      }

      // Validate target references
      if (taskDef.target) {
        this.validateTargetReference(taskDef.target, `${path}.target`);
      }

      if (taskDef.targets) {
        for (let i = 0; i < taskDef.targets.length; i++) {
          const target = taskDef.targets[i];
          if (target !== undefined) {
            this.validateTargetReference(target, `${path}.targets[${i}]`);
          }
        }
      }

      // Validate timeout
      if (taskDef.timeout) {
        this.validateTimeout(taskDef.timeout, `${path}.timeout`);
      }

      // Validate dependencies
      if (taskDef.dependsOn) {
        for (const dep of taskDef.dependsOn) {
          if (!taskNames.has(dep)) {
            this.addError(`${path}.dependsOn`, `Dependency task '${dep}' not found`);
          }
        }
      }

      // Validate template reference
      if (taskDef.template && !tasks[taskDef.template]) {
        this.addError(`${path}.template`, `Template task '${taskDef.template}' not found`);
      }
    }
  }

  private validateTaskParameters(params: TaskParameter[], path: string): void {
    const names = new Set<string>();

    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      if (!param) continue;

      const paramPath = `${path}[${i}]`;

      if (!param.name) {
        this.addError(`${paramPath}.name`, 'Parameter name is required');
        continue;
      }

      if (names.has(param.name)) {
        this.addError(paramPath, `Duplicate parameter name: ${param.name}`);
      }
      names.add(param.name);

      // Validate type
      if (param.type && !['string', 'number', 'boolean', 'array', 'enum'].includes(param.type)) {
        this.addError(`${paramPath}.type`, `Invalid parameter type: ${param.type}`);
      }

      // Validate enum values
      if (param.type === 'enum' && !param.values) {
        this.addError(paramPath, 'Enum parameter must have values');
      }

      // Validate pattern
      if (param.pattern) {
        try {
          new RegExp(param.pattern);
        } catch {
          this.addError(`${paramPath}.pattern`, 'Invalid regular expression');
        }
      }

      // Validate min/max
      if (param.min !== undefined && param.max !== undefined && param.min > param.max) {
        this.addError(paramPath, 'min cannot be greater than max');
      }
    }
  }

  private validateTaskSteps(steps: any[], path: string, taskNames: Set<string>): void {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepPath = `${path}[${i}]`;

      if (!step.command && !step.task && !step.script) {
        this.addError(stepPath, 'Step must have either command, task, or script');
      }

      if (step.task && !taskNames.has(step.task)) {
        this.addError(`${stepPath}.task`, `Task '${step.task}' not found`);
      }

      if (step.target) {
        this.validateTargetReference(step.target, `${stepPath}.target`);
      }

      if (step.targets) {
        for (let j = 0; j < step.targets.length; j++) {
          const targetRef = step.targets[j];
          if (targetRef) {
            this.validateTargetReference(targetRef, `${stepPath}.targets[${j}]`);
          }
        }
      }
    }
  }

  private validateTargetReference(ref: string, path: string): void {
    // Basic validation of target reference format
    const validPrefixes = ['hosts.', 'containers.', 'pods.', 'local'];
    const hasValidPrefix = validPrefixes.some(prefix =>
      ref === 'local' || ref.startsWith(prefix)
    );

    if (!hasValidPrefix) {
      this.addWarning(path, `Target reference '${ref}' may not be valid. Expected format: hosts.name, containers.name, pods.name, or local`);
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

  private validateCommands(commands: Record<string, any>): void {
    // Command-specific validation
    for (const [cmd, config] of Object.entries(commands)) {
      const path = `commands.${cmd}`;

      if (config.defaultTimeout) {
        this.validateTimeout(config.defaultTimeout, `${path}.defaultTimeout`);
      }

      if (config.interval && (typeof config.interval !== 'number' || config.interval < 0)) {
        this.addError(`${path}.interval`, 'Interval must be a positive number');
      }
    }
  }

  private validateSecrets(secrets: any): void {
    if (!secrets.provider) {
      this.addError('secrets.provider', 'Provider is required');
      return;
    }

    const validProviders = ['local', 'vault', '1password', 'aws-secrets', 'env', 'dotenv'];
    if (!validProviders.includes(secrets.provider)) {
      this.addError('secrets.provider', `Invalid provider: ${secrets.provider}. Valid options: ${validProviders.join(', ')}`);
    }
  }

  private validateExtensions(extensions: any[]): void {
    for (let i = 0; i < extensions.length; i++) {
      const ext = extensions[i];
      const path = `extensions[${i}]`;

      if (!ext.source) {
        this.addError(`${path}.source`, 'Extension source is required');
      }

      if (ext.tasks && !Array.isArray(ext.tasks)) {
        this.addError(`${path}.tasks`, 'Tasks must be an array');
      }
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