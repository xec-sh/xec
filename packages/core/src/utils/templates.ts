import type { Command } from '../types/command.js';
import type { ExecutionResult } from '../core/result.js';
import type { CallableExecutionEngine } from '../types/engine.js';
import type { ExecutionEngineConfig } from '../types/execution.js';
import type { ExecutionEngine } from '../core/execution-engine.js';

export interface TemplateOptions extends Partial<ExecutionEngineConfig> {
  validate?: (params: Record<string, any>) => void | Promise<void>;
  transform?: (result: ExecutionResult) => any;
  defaults?: Record<string, any>;
}

export class CommandTemplate {
  private template: string;
  private options: TemplateOptions;
  private requiredParams: Set<string>;

  constructor(template: string, options: TemplateOptions = {}) {
    this.template = template;
    this.options = options;
    this.requiredParams = this.extractRequiredParams(template);
  }

  private extractRequiredParams(template: string): Set<string> {
    const params = new Set<string>();
    const regex = /\{\{(\w+)\}\}/g;
    let match;

    while ((match = regex.exec(template)) !== null) {
      if (match[1]) {
        params.add(match[1]);
      }
    }

    return params;
  }

  private interpolate(params: Record<string, any>): string {
    const mergedParams = { ...this.options.defaults, ...params };

    return this.template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      if (!(key in mergedParams)) {
        throw new Error(`Missing required parameter: ${key}`);
      }

      const value = mergedParams[key];

      // Properly escape all string values for shell execution
      if (typeof value === 'string') {
        return this.escapeShellArg(value);
      }

      return String(value);
    });
  }

  private escapeShellArg(arg: string): string {
    // If empty or contains special characters, quote and escape
    if (!arg || /[^a-zA-Z0-9_\-./]/.test(arg)) {
      // Escape backslashes and double quotes, then wrap in double quotes
      return '"' + arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    }
    return arg;
  }

  async execute(
    engine: ExecutionEngine | CallableExecutionEngine,
    params: Record<string, any> = {}
  ): Promise<any> {
    if (this.options.validate) {
      await this.options.validate(params);
    }

    const command = this.interpolate(params);
    const engineWithOptions = this.options
      ? engine.with(this.options as Partial<Command>)
      : engine;

    const result = await engineWithOptions.execute({ command, shell: true });

    if (this.options.transform) {
      return this.options.transform(result);
    }

    return result;
  }


  bind(engine: ExecutionEngine | CallableExecutionEngine): BoundTemplate {
    return new BoundTemplate(this, engine);
  }

  getRequiredParams(): string[] {
    return Array.from(this.requiredParams);
  }

  describe(): string {
    return `Template: ${this.template}\nRequired params: ${this.getRequiredParams().join(', ')}`;
  }
}

export class BoundTemplate {
  constructor(
    private template: CommandTemplate,
    private engine: ExecutionEngine | CallableExecutionEngine
  ) { }

  async execute(params: Record<string, any> = {}): Promise<any> {
    return this.template.execute(this.engine, params);
  }


  with(config: Partial<Command>): BoundTemplate {
    return new BoundTemplate(this.template, this.engine.with(config));
  }
}

export class TemplateRegistry {
  private templates = new Map<string, CommandTemplate>();

  register(name: string, template: string | CommandTemplate, options?: TemplateOptions): void {
    const cmdTemplate = typeof template === 'string'
      ? new CommandTemplate(template, options)
      : template;

    this.templates.set(name, cmdTemplate);
  }

  get(name: string): CommandTemplate | undefined {
    return this.templates.get(name);
  }

  has(name: string): boolean {
    return this.templates.has(name);
  }

  list(): string[] {
    return Array.from(this.templates.keys());
  }

  bind(engine: ExecutionEngine | CallableExecutionEngine): BoundRegistry {
    return new BoundRegistry(this, engine);
  }
}

export class BoundRegistry {
  constructor(
    private registry: TemplateRegistry,
    private engine: ExecutionEngine | CallableExecutionEngine
  ) { }

  async execute(name: string, params?: Record<string, any>): Promise<any> {
    const template = this.registry.get(name);
    if (!template) {
      throw new Error(`Template not found: ${name}`);
    }

    return template.execute(this.engine, params);
  }


  get(name: string): BoundTemplate | undefined {
    const template = this.registry.get(name);
    return template ? template.bind(this.engine) : undefined;
  }
}

export const commonTemplates = {
  gitClone: new CommandTemplate('git clone {{repo}} {{dir}}', {
    defaults: { dir: '.' },
    validate: (params) => {
      if (!params['repo'] || !params['repo'].startsWith('http')) {
        throw new Error('Invalid repository URL');
      }
    }
  }),

  dockerRun: new CommandTemplate('docker run {{options}} {{image}} {{command}}', {
    defaults: { options: '', command: '' },
  }),

  curl: new CommandTemplate('curl {{options}} {{url}}', {
    defaults: { options: '-s' },
    transform: (result) => {
      try {
        return JSON.parse(result.stdout);
      } catch {
        return result.stdout;
      }
    }
  }),

  mkdir: new CommandTemplate('mkdir -p {{path}}'),

  rsync: new CommandTemplate('rsync {{options}} {{source}} {{destination}}', {
    defaults: { options: '-avz' }
  }),

  tar: new CommandTemplate('tar {{operation}} {{file}} {{path}}', {
    defaults: { operation: '-czf' }
  })
};

