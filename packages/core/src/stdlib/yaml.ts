import type { CallableExecutionEngine } from '@xec-js/ush';

import type { Logger } from '../utils/logger.js';
import type {
  YAML,
  EnvironmentInfo,
} from '../types/environment-types.js';

export async function createYAML(
  $: CallableExecutionEngine,
  env: EnvironmentInfo,
  log?: Logger
): Promise<YAML> {

  // Simple YAML parser - in production would use a proper library
  const simpleYamlParse = (text: string): any => {
    // Very basic YAML parsing - only handles simple cases
    const lines = text.split('\n');
    const result: any = {};
    const currentIndent = 0;
    let currentObj = result;
    const stack: any[] = [result];

    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith('#')) continue;

      const indent = line.search(/\S/);
      const content = line.trim();

      if (content.includes(':')) {
        const [key, ...valueParts] = content.split(':');
        const value = valueParts.join(':').trim();

        if (key) {
          const trimmedKey = key.trim();
          if (value) {
            currentObj[trimmedKey] = value;
          } else {
            currentObj[trimmedKey] = {};
            stack.push(currentObj[trimmedKey]);
            currentObj = currentObj[trimmedKey];
          }
        }
      }
    }

    return result;
  };

  const simpleYamlStringify = (obj: any, indent: number = 0): string => {
    const lines: string[] = [];
    const prefix = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        lines.push(`${prefix}${key}:`);
        lines.push(simpleYamlStringify(value, indent + 1));
      } else {
        lines.push(`${prefix}${key}: ${value}`);
      }
    }

    return lines.join('\n');
  };

  const yaml: YAML = {
    parse<T = any>(text: string): T {
      try {
        // In production, would use a proper YAML parser
        return simpleYamlParse(text) as T;
      } catch (error) {
        throw new Error(`Failed to parse YAML: ${error}`);
      }
    },

    stringify(value: any): string {
      try {
        // In production, would use a proper YAML stringifier
        return simpleYamlStringify(value);
      } catch (error) {
        throw new Error(`Failed to stringify YAML: ${error}`);
      }
    },

    async read<T = any>(path: string): Promise<T> {
      try {
        const result = await $`cat ${path}`;
        return this.parse<T>(result.stdout);
      } catch (error) {
        throw new Error(`Failed to read YAML from ${path}: ${error}`);
      }
    },

    async write(path: string, data: any): Promise<void> {
      try {
        const content = this.stringify(data);
        await $`cat << 'EOF' > ${path}
${content}
EOF`;
      } catch (error) {
        throw new Error(`Failed to write YAML to ${path}: ${error}`);
      }
    },

    parseAll<T = any>(text: string): T[] {
      // Split by document separator
      const docs = text.split(/^---$/m).filter(Boolean);
      return docs.map(doc => this.parse<T>(doc));
    },

    stringifyAll(values: any[]): string {
      return values.map(value => this.stringify(value)).join('\n---\n');
    },
  };

  return yaml;
}