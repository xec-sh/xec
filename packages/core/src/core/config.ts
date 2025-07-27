import type { Command } from './command.js';

export interface ExecutionConfig extends Partial<Command> {
  defaultEnv?: Record<string, string>;
  defaultCwd?: string;
  defaultTimeout?: number;
  defaultShell?: string | boolean;
  throwOnNonZeroExit?: boolean;
  encoding?: BufferEncoding;
  maxBuffer?: number;
}