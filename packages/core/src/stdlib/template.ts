import type { CallableExecutionEngine } from '@xec/ush';

import type { Logger } from '../utils/logger.js';
import type { 
  FileSystem,
  TemplateEngine,
  EnvironmentInfo,
} from '../types/environment-types.js';

export async function createTemplateEngine(
  $: CallableExecutionEngine,
  env: EnvironmentInfo,
  fs: FileSystem,
  log?: Logger
): Promise<TemplateEngine> {
  
  const template: TemplateEngine = {
    async render(template: string, data: any): Promise<string> {
      // Simple template engine with ${var} syntax
      let result = template;
      
      // Replace ${var} syntax
      result = result.replace(/\$\{([^}]+)\}/g, (match, path) => {
        const value = getValueByPath(data, path.trim());
        return value !== undefined ? String(value) : match;
      });
      
      // Replace {{ var }} syntax (Jinja2-style)
      result = result.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, path) => {
        const value = getValueByPath(data, path.trim());
        return value !== undefined ? String(value) : match;
      });
      
      // Simple conditionals: {% if var %} ... {% endif %}
      result = result.replace(/\{%\s*if\s+([^%]+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g, (match, condition, content) => {
        const value = getValueByPath(data, condition.trim());
        return value ? content : '';
      });
      
      // Simple loops: {% for item in items %} ... {% endfor %}
      result = result.replace(/\{%\s*for\s+(\w+)\s+in\s+([^%]+)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, 
        (match, itemName, arrayPath, content) => {
          const array = getValueByPath(data, arrayPath.trim());
          if (!Array.isArray(array)) return '';
          
          return array.map(item => {
            const itemData = { ...data, [itemName]: item };
            // Recursively render the loop content
            return this.render(content, itemData);
          }).join('');
        }
      );
      
      return result;
    },

    async renderFile(path: string, data: any): Promise<string> {
      const content = await fs.read(path);
      return this.render(content, data);
    },
  };

  return template;
}

// Helper function to get nested values from objects
function getValueByPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current && typeof current === 'object') {
      // Handle array index notation: items[0]
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, prop, index] = arrayMatch;
        if (prop && index) {
          current = current[prop]?.[parseInt(index)];
        } else {
          return undefined;
        }
      } else {
        current = current[part];
      }
    } else {
      return undefined;
    }
  }
  
  return current;
}