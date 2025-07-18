import type { CallableExecutionEngine } from '@xec/ush';

import type { Logger } from '../utils/logger.js';
import type { 
  EnvironmentInfo,
  JSON as JSONUtil,
} from '../types/environment-types.js';

export async function createJSON(
  $: CallableExecutionEngine,
  env: EnvironmentInfo,
  log?: Logger
): Promise<JSONUtil> {
  
  const json: JSONUtil = {
    parse<T = any>(text: string): T {
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error(`Failed to parse JSON: ${error}`);
      }
    },

    stringify(value: any, space?: number): string {
      try {
        return JSON.stringify(value, null, space);
      } catch (error) {
        throw new Error(`Failed to stringify JSON: ${error}`);
      }
    },

    async read<T = any>(path: string): Promise<T> {
      try {
        const result = await $`cat ${path}`;
        return this.parse<T>(result.stdout);
      } catch (error) {
        throw new Error(`Failed to read JSON from ${path}: ${error}`);
      }
    },

    async write(path: string, data: any, space?: number): Promise<void> {
      try {
        const content = this.stringify(data, space);
        await $`cat << 'EOF' > ${path}
${content}
EOF`;
      } catch (error) {
        throw new Error(`Failed to write JSON to ${path}: ${error}`);
      }
    },

    merge(...objects: any[]): any {
      return objects.reduce((acc, obj) => ({ ...acc, ...obj }), {});
    },

    get(object: any, path: string, defaultValue?: any): any {
      const keys = path.split('.');
      let current = object;
      
      for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
          current = current[key];
        } else {
          return defaultValue;
        }
      }
      
      return current;
    },

    set(object: any, path: string, value: any): void {
      const keys = path.split('.');
      const lastKey = keys.pop();
      
      if (!lastKey) return;
      
      let current = object;
      
      for (const key of keys) {
        if (!current[key] || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key];
      }
      
      current[lastKey] = value;
    },
  };

  return json;
}