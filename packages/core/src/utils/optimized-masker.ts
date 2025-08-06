/**
 * Truly optimized masking implementation that compiles patterns once
 */

interface CompiledPattern {
  regex: RegExp;
  replacer: (match: string, ...args: any[]) => string;
}

export class OptimizedMasker {
  private readonly compiledPatterns: CompiledPattern[] = [];
  
  constructor(patterns: RegExp[], private replacement: string) {
    // Pre-compile all patterns with their replacers
    this.compiledPatterns = patterns.map(pattern => ({
      regex: new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'),
      replacer: this.createReplacer()
    }));
  }
  
  private createReplacer(): (match: string, ...args: any[]) => string {
    const replacement = this.replacement;
    
    return (match: string, ...args: any[]) => {
      // Special case for SSH keys - replace entire key
      if (match.includes('BEGIN') && match.includes('PRIVATE KEY')) {
        return replacement;
      }

      // Special case for GitHub tokens that match the pattern directly
      if (match.match(/^gh[ps]_[a-zA-Z0-9]{16,}$/)) {
        return replacement;
      }

      // The last two args are offset and full string, remove them
      const groups = args.slice(0, -2);

      // If no capture groups, replace the whole match
      if (groups.length === 0 || groups.every(g => g === undefined)) {
        return replacement;
      }

      // JSON pattern: "key": "value"
      if (groups.length === 2 && match.includes('":')) {
        return `"${groups[0]}": ${replacement}`;
      }

      // Authorization headers with Bearer/Basic (4 groups)
      if (groups.length === 4 && groups[0] && groups[0].includes('Authorization') && groups[1] && groups[2] !== undefined && groups[3]) {
        return groups[0] + groups[1] + ' ' + replacement;
      }

      // Patterns with quoted/unquoted values (6 groups)
      if (groups.length === 6) {
        const key = groups[0];
        const separator = groups[1];

        if (key.startsWith('--')) {
          return key + ' ' + replacement;
        }

        return key + separator + replacement;
      }

      // Patterns with quoted/unquoted values (5 groups)
      if (groups.length === 5 && groups[0] && groups[0].startsWith('--')) {
        return groups[0] + ' ' + replacement;
      }

      // For patterns with 3 groups
      if (groups.length === 3 && groups[0] && groups[1] !== undefined && groups[2]) {
        if (groups[0] === 'Bearer') {
          return groups[0] + ' ' + replacement;
        }
        return groups[0] + groups[1] + replacement;
      }

      // For patterns with 2 groups
      if (groups.length === 2 && groups[0] && groups[1]) {
        return groups[0] + replacement;
      }

      // For single group patterns
      if (groups.length === 1 && groups[0]) {
        return replacement;
      }

      // Default: try to preserve structure if possible
      if (match.includes('=')) {
        const [key] = match.split('=', 2);
        return key + '=' + replacement;
      } else if (match.includes(':')) {
        const [key] = match.split(':', 2);
        return key + ': ' + replacement;
      }

      return replacement;
    };
  }
  
  mask(text: string): string {
    if (!text) return text;
    
    let maskedText = text;
    
    // Apply each compiled pattern
    for (const { regex, replacer } of this.compiledPatterns) {
      maskedText = maskedText.replace(regex, replacer);
    }
    
    return maskedText;
  }
}

/**
 * Factory function to create an optimized masker
 */
export function createOptimizedMasker(patterns: RegExp[], replacement: string): (text: string) => string {
  const masker = new OptimizedMasker(patterns, replacement);
  return (text: string) => masker.mask(text);
}