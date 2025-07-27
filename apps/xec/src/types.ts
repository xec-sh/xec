
export interface CLIContext {
  cwd: string;
  env: Record<string, string>;
  args: string[];
  flags: Record<string, any>;
  config?: CLIConfig;
  output?: Console;
}

export interface CLIConfig {
  colors: boolean;
  verbose: boolean;
  quiet: boolean;
  format: 'text' | 'json' | 'yaml';
  configFile?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface Command {
  name: string;
  description: string;
  aliases?: string[];
  usage?: string;
  examples?: string[];
  options?: CommandOption[];
  arguments?: CommandArgument[];
  subcommands?: Command[];
  handler: CommandHandler;
  hidden?: boolean;
}

export interface CommandOption {
  name: string;
  short?: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  default?: any;
  required?: boolean;
  choices?: any[];
  multiple?: boolean;
  validate?: (value: any) => boolean | string;
}

export interface CommandArgument {
  name: string;
  description: string;
  required?: boolean;
  variadic?: boolean;
  default?: any;
  choices?: any[];
  validate?: (value: any) => boolean | string;
}

export type CommandHandler = (context: CLIContext) => Promise<void>;

export interface ParsedCommand {
  command: string[];
  args: Record<string, any>;
  flags: Record<string, any>;
  positional: string[];
}

export interface OutputFormatter {
  success(message: string): void;
  error(message: string | Error): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
  
  table(data: any[], columns?: string[]): void;
  json(data: any): void;
  yaml(data: any): void;
  
  progress(message: string, current: number, total: number): void;
  spinner(message: string): Spinner;
}

export interface Spinner {
  start(): void;
  stop(): void;
  succeed(message?: string): void;
  fail(message?: string): void;
  update(message: string): void;
}

export interface InteractivePrompt {
  confirm(message: string, defaultValue?: boolean): Promise<boolean>;
  input(message: string, defaultValue?: string): Promise<string>;
  password(message: string): Promise<string>;
  select<T>(message: string, choices: Choice<T>[]): Promise<T>;
  multiselect<T>(message: string, choices: Choice<T>[]): Promise<T[]>;
}

export interface Choice<T = any> {
  name: string;
  value: T;
  disabled?: boolean;
  hint?: string;
}

export interface CompletionProvider {
  getCompletions(partial: string, context: CLIContext): Promise<string[]>;
  generateScript(shell: 'bash' | 'zsh' | 'fish'): string;
}

export interface CLIPlugin {
  name: string;
  version: string;
  commands?: Command[];
  middleware?: CLIMiddleware[];
}

export type CLIMiddleware = (
  context: CLIContext,
  next: () => Promise<void>
) => Promise<void>;