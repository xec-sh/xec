/**
 * Parse variables from string input
 * Supports both JSON format and key=value pairs
 */
export function parseVariables(input: string): Record<string, any> {
  if (!input || input.trim() === '') {
    return {};
  }

  // Try parsing as JSON first
  try {
    const parsed = JSON.parse(input);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Not JSON, try key=value format
  }

  // Parse as key=value pairs
  const vars: Record<string, any> = {};
  const pairs = input.split(/[,\s]+/).filter(p => p.includes('='));
  
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split('=');
    const value = valueParts.join('=').trim();
    
    if (key && value) {
      // Try to parse value as JSON for complex types
      try {
        vars[key.trim()] = JSON.parse(value);
      } catch {
        // If not valid JSON, treat as string
        // Remove quotes if present
        vars[key.trim()] = value.replace(/^["']|["']$/g, '');
      }
    }
  }
  
  return vars;
}

/**
 * Merge multiple variable sources with precedence
 * Later sources override earlier ones
 */
export function mergeVariables(...sources: Record<string, any>[]): Record<string, any> {
  return sources.reduce((merged, source) => ({ ...merged, ...source }), {});
}

/**
 * Format variables for display
 */
export function formatVariables(vars: Record<string, any>, indent: number = 0): string {
  const lines: string[] = [];
  const prefix = ' '.repeat(indent);
  
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value === 'object' && value !== null) {
      lines.push(`${prefix}${key}:`);
      lines.push(formatVariables(value, indent + 2));
    } else {
      lines.push(`${prefix}${key}: ${JSON.stringify(value)}`);
    }
  }
  
  return lines.join('\n');
}