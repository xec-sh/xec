import { Command } from 'commander';
import { PatternRegistry } from '@xec-js/core';

import { errorMessages } from '../utils/error-handler.js';

interface PatternOptions {
  type?: 'deployment' | 'resilience' | 'workflow';
  category?: string;
  namespace?: string;
  interactive?: boolean;
  validate?: boolean;
  json?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

export default function patternCommand(program: Command) {
  const pattern = program
    .command('pattern')
    .description('Manage deployment and workflow patterns')
    .action(async () => {
      // Show available patterns by default
      await listPatterns();
    });

  // xec pattern list
  pattern
    .command('list')
    .description('List available patterns')
    .option('--type <type>', 'Filter by pattern type (deployment|resilience|workflow)')
    .option('--category <category>', 'Filter by category')
    .option('--json', 'Output as JSON')
    .action(async (options: PatternOptions & { json?: boolean }) => {
      await listPatterns(options);
    });

  // xec pattern info
  pattern
    .command('info')
    .description('Show pattern information')
    .argument('<pattern>', 'Pattern name')
    .option('--json', 'Output as JSON')
    .action(async (patternName: string, options: PatternOptions & { json?: boolean }) => {
      await showPatternInfo(patternName, options);
    });

  // xec pattern create
  pattern
    .command('create')
    .description('Create a new pattern')
    .argument('<name>', 'Pattern name')
    .option('--type <type>', 'Pattern type (deployment|resilience|workflow)', 'deployment')
    .option('--interactive', 'Interactive pattern creation')
    .option('--template <template>', 'Use pattern template')
    .action(async (name: string, options: PatternOptions & { template?: string }) => {
      await createPattern(name, options);
    });

  // xec pattern test
  pattern
    .command('test')
    .description('Test a pattern')
    .argument('<pattern>', 'Pattern name')
    .option('--dry-run', 'Dry run test')
    .option('--verbose', 'Verbose output')
    .action(async (patternName: string, options: PatternOptions & { dryRun?: boolean; verbose?: boolean }) => {
      await testPattern(patternName, options);
    });

  // xec pattern apply
  pattern
    .command('apply')
    .description('Apply a pattern to a service or resource')
    .argument('<pattern>', 'Pattern name')
    .option('--to <target>', 'Target service or resource')
    .option('--params <params>', 'Pattern parameters (JSON)')
    .option('--dry-run', 'Dry run application')
    .action(async (patternName: string, options: PatternOptions & { to?: string; params?: string; dryRun?: boolean; json?: boolean }) => {
      await applyPattern(patternName, options);
    });

  // xec pattern validate
  pattern
    .command('validate')
    .description('Validate pattern configuration')
    .argument('<pattern>', 'Pattern name')
    .action(async (patternName: string) => {
      await validatePattern(patternName);
    });

  // xec pattern remove
  pattern
    .command('remove')
    .alias('rm')
    .description('Remove a pattern')
    .argument('<pattern>', 'Pattern name')
    .option('--force', 'Force removal without confirmation')
    .action(async (patternName: string, options: { force?: boolean }) => {
      await removePattern(patternName, options);
    });

  return pattern;
}

async function listPatterns(options: PatternOptions & { json?: boolean } = {}): Promise<void> {
  try {
    const registry = new PatternRegistry();
    const patternsMap = registry.getAll();
    const patterns = Array.from(patternsMap.values());

    let filteredPatterns = patterns;

    if (options.type) {
      filteredPatterns = registry.getByType(options.type);
    }

    if (options.category) {
      // Since category is not supported in PatternDefinition, we'll skip this filter
      // or use search method if available
      // Since category is not a built-in property, filter patterns manually
      filteredPatterns = patterns.filter(p => (p as any).category === options.category);
    }

    if (options.json) {
      console.log(JSON.stringify(filteredPatterns, null, 2));
    } else {
      console.log('Available Patterns:');
      filteredPatterns.forEach(pattern => {
        console.log(`  ${pattern.name} (${pattern.type})`);
        if (pattern.description) {
          console.log(`    ${pattern.description}`);
        }
      });
    }
  } catch (error) {
    throw errorMessages.operationFailed('list patterns', error instanceof Error ? error.message : String(error));
  }
}

async function showPatternInfo(patternName: string, options: PatternOptions & { json?: boolean }): Promise<void> {
  try {
    const registry = new PatternRegistry();
    const pattern = registry.get(patternName);

    if (!pattern) {
      throw errorMessages.resourceNotFound(`pattern '${patternName}'`);
    }

    if (options.json) {
      console.log(JSON.stringify(pattern, null, 2));
    } else {
      console.log(`Pattern: ${pattern.name}`);
      console.log(`Type: ${pattern.type || 'custom'}`);
      console.log(`Description: ${pattern.description || 'No description'}`);

      if (pattern.parameters) {
        console.log('\nParameters:');
        console.log(JSON.stringify(pattern.parameters, null, 2));
      }
    }
  } catch (error) {
    throw errorMessages.operationFailed('show pattern info', error instanceof Error ? error.message : String(error));
  }
}

async function createPattern(name: string, options: PatternOptions): Promise<void> {
  try {
    const registry = new PatternRegistry();

    // Check if pattern already exists
    const existing = registry.get(name);
    if (existing) {
      throw new Error(`Pattern '${name}' already exists`);
    }

    let description = '';
    const parameters: any = {};

    if (options.interactive) {
      const { text, confirm } = await import('@clack/prompts');

      description = await text({
        message: 'Pattern description:',
        placeholder: 'Enter pattern description'
      }) as string;

      const addParameters = await confirm({
        message: 'Add parameters?',
        initialValue: false
      });

      if (addParameters) {
        // Interactive parameter setup
        let addMore = true;
        while (addMore) {
          const paramName = await text({
            message: 'Parameter name:',
            placeholder: 'Enter parameter name'
          }) as string;

          const paramType = await text({
            message: 'Parameter type:',
            placeholder: 'string',
            initialValue: 'string'
          }) as string;

          parameters[paramName] = { type: paramType };

          addMore = await confirm({
            message: 'Add another parameter?',
            initialValue: false
          }) as boolean;
        }
      }
    }

    // Create a PatternDefinition
    const patternDefinition = {
      name,
      type: options.type as any || 'custom',
      description,
      parameters,
      template: async (params: any) =>
        // This is a placeholder template function
        ({ ...params, patternName: name })
      ,
      validate: async (params: any) =>
        // Basic validation
        true

    };

    // Register pattern with a module name (using 'cli' as the module name)
    registry.register('cli', patternDefinition);
    console.log(`Pattern '${name}' created successfully`);
  } catch (error) {
    throw errorMessages.operationFailed('create pattern', error instanceof Error ? error.message : String(error));
  }
}

async function testPattern(patternName: string, options: PatternOptions & { dryRun?: boolean; verbose?: boolean }): Promise<void> {
  try {
    const registry = new PatternRegistry();
    const pattern = registry.get(patternName);

    if (!pattern) {
      throw errorMessages.resourceNotFound(`pattern '${patternName}'`);
    }

    // Since DeploymentPatternManager doesn't exist, we'll do basic validation
    if (pattern.validate) {
      const isValid = await pattern.validate({});
      if (isValid) {
        console.log(`Pattern '${patternName}' validation passed`);
      } else {
        console.error(`Pattern '${patternName}' validation failed`);
      }
    } else {
      console.log(`Pattern '${patternName}' has no validation function`);
    }
  } catch (error) {
    throw errorMessages.operationFailed('test pattern', error instanceof Error ? error.message : String(error));
  }
}

async function applyPattern(patternName: string, options: PatternOptions & { to?: string; params?: string; dryRun?: boolean; json?: boolean }): Promise<void> {
  try {
    const registry = new PatternRegistry();
    const pattern = registry.get(patternName);

    if (!pattern) {
      throw errorMessages.resourceNotFound(`pattern '${patternName}'`);
    }

    const params = options.params ? JSON.parse(options.params) : {};

    // Add target to params if provided
    if (options.to) {
      params.target = options.to;
    }

    try {
      // Use the instantiate method from PatternRegistry
      const result = await registry.instantiate(patternName, params);
      console.log(`Pattern '${patternName}' applied successfully`);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      console.error(`Failed to apply pattern '${patternName}':`, error instanceof Error ? error.message : String(error));
    }
  } catch (error) {
    throw errorMessages.operationFailed('apply pattern', error instanceof Error ? error.message : String(error));
  }
}

async function validatePattern(patternName: string): Promise<void> {
  try {
    const registry = new PatternRegistry();
    const pattern = registry.get(patternName);

    if (!pattern) {
      throw errorMessages.resourceNotFound(`pattern '${patternName}'`);
    }

    // Use the validatePattern method from PatternRegistry
    const isValid = registry.validatePattern(pattern);

    if (isValid) {
      console.log(`Pattern '${patternName}' is valid`);

      // Additional validation using the pattern's own validate function
      if (pattern.validate) {
        const customValid = await pattern.validate({});
        if (customValid) {
          console.log(`Pattern '${patternName}' custom validation passed`);
        } else {
          console.error(`Pattern '${patternName}' custom validation failed`);
        }
      }
    } else {
      console.error(`Pattern '${patternName}' validation failed: Invalid pattern structure`);
    }
  } catch (error) {
    throw errorMessages.operationFailed('validate pattern', error instanceof Error ? error.message : String(error));
  }
}

async function removePattern(patternName: string, options: { force?: boolean }): Promise<void> {
  try {
    const registry = new PatternRegistry();
    const pattern = registry.get(patternName);

    if (!pattern) {
      throw errorMessages.resourceNotFound(`pattern '${patternName}'`);
    }

    if (!options.force) {
      const { confirm } = await import('@clack/prompts');
      const confirmed = await confirm({
        message: `Are you sure you want to remove pattern '${patternName}'?`,
        initialValue: false
      }) as boolean;

      if (!confirmed) {
        console.log('Pattern removal cancelled');
        return;
      }
    }

    // Extract module name and pattern name
    // Pattern names are stored as 'moduleName:patternName'
    const parts = patternName.split(':');
    let moduleName = 'cli';
    let actualPatternName = patternName;

    if (parts.length === 2 && parts[0] && parts[1]) {
      moduleName = parts[0];
      actualPatternName = parts[1];
    }

    registry.unregister(moduleName, actualPatternName);
    console.log(`Pattern '${patternName}' removed successfully`);
  } catch (error) {
    throw errorMessages.operationFailed('remove pattern', error instanceof Error ? error.message : String(error));
  }
}