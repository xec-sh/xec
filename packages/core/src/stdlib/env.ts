import type { CallableExecutionEngine } from '@xec-js/ush';

import type { Logger } from '../utils/logger.js';
import type {
  Environment,
  EnvironmentInfo,
} from '../types/environment-types.js';

export async function createEnvironment(
  $: CallableExecutionEngine,
  envInfo: EnvironmentInfo,
  log?: Logger
): Promise<Environment> {

  const env: Environment = {
    get(key: string, defaultValue?: string): string | undefined {
      // In a real implementation, this would get the env var from the execution context
      return process.env[key] || defaultValue;
    },

    set(key: string, value: string): void {
      // In a real implementation, this would set the env var in the execution context
      process.env[key] = value;
    },

    all(): Record<string, string> {
      // In a real implementation, this would get all env vars from the execution context
      return { ...process.env } as Record<string, string>;
    },

    async load(file: string = '.env'): Promise<void> {
      try {
        const result = await $`cat ${file}`;
        const lines = result.stdout.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();

          // Skip empty lines and comments
          if (!trimmed || trimmed.startsWith('#')) continue;

          // Parse KEY=VALUE
          const match = trimmed.match(/^([^=]+)=(.*)$/);
          if (match) {
            const [, key, value] = match;
            // Remove quotes if present
            const cleanValue = value?.trim().replace(/^["']|["']$/g, '') || '';
            this.set(key?.trim() || '', cleanValue);
          }
        }

        log?.info(`Loaded environment from ${file}`);
      } catch (error) {
        throw new Error(`Failed to load environment from ${file}: ${error}`);
      }
    },

    expand(template: string): string {
      // Replace ${VAR} and $VAR with environment values
      return template.replace(/\$\{([^}]+)\}|\$(\w+)/g, (match, p1, p2) => {
        const key = p1 || p2;
        return this.get(key) || match;
      });
    },

    require(key: string): string {
      const value = this.get(key);
      if (value === undefined) {
        throw new Error(`Required environment variable ${key} is not set`);
      }
      return value;
    },
  };

  return env;
}