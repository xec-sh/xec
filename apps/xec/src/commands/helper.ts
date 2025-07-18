import { Command } from 'commander';
import { HelperRegistry, HelperDefinition } from '@xec-js/core';

import { errorMessages } from '../utils/error-handler.js';

interface HelperOptions {
  category?: string;
  namespace?: string;
  interactive?: boolean;
  global?: boolean;
  args?: string;
}

export default function helperCommand(program: Command) {
  const helper = program
    .command('helper')
    .description('Manage template helpers and utilities')
    .action(async () => {
      // Show available helpers by default
      await listHelpers();
    });

  // xec helper list
  helper
    .command('list')
    .description('List available helpers')
    .option('--category <category>', 'Filter by category')
    .option('--global', 'Show global helpers')
    .option('--json', 'Output as JSON')
    .action(async (options: HelperOptions) => {
      await listHelpers(options);
    });

  // xec helper info
  helper
    .command('info')
    .description('Show helper information')
    .argument('<helper>', 'Helper name')
    .option('--json', 'Output as JSON')
    .action(async (helperName: string, options: HelperOptions) => {
      await showHelperInfo(helperName, options);
    });

  // xec helper test
  helper
    .command('test')
    .description('Test a helper function')
    .argument('<helper>', 'Helper name')
    .option('--args <args>', 'Test arguments (JSON)')
    .option('--verbose', 'Verbose output')
    .action(async (helperName: string, options: HelperOptions) => {
      await testHelper(helperName, options);
    });

  // xec helper create
  helper
    .command('create')
    .description('Create a new helper')
    .argument('<name>', 'Helper name')
    .option('--category <category>', 'Helper category')
    .option('--interactive', 'Interactive helper creation')
    .option('--global', 'Create global helper')
    .action(async (name: string, options: HelperOptions) => {
      await createHelper(name, options);
    });

  // xec helper doc
  helper
    .command('doc')
    .description('Show helper documentation')
    .argument('<helper>', 'Helper name')
    .option('--format <format>', 'Output format (text|markdown|json)', 'text')
    .action(async (helperName: string, options: HelperOptions & { format?: string }) => {
      await showHelperDoc(helperName, options);
    });

  // xec helper validate
  helper
    .command('validate')
    .description('Validate helper implementation')
    .argument('<helper>', 'Helper name')
    .action(async (helperName: string) => {
      await validateHelper(helperName);
    });

  // xec helper remove
  helper
    .command('remove')
    .alias('rm')
    .description('Remove a helper')
    .argument('<helper>', 'Helper name')
    .option('--force', 'Force removal without confirmation')
    .option('--global', 'Remove from global helpers')
    .action(async (helperName: string, options: { force?: boolean; global?: boolean }) => {
      await removeHelper(helperName, options);
    });

  return helper;
}

async function listHelpers(options: HelperOptions = {}): Promise<void> {
  try {
    const registry = new HelperRegistry();
    const allHelpers = registry.getAll();
    const helpers: any[] = [];

    // Convert Map to array format
    for (const [fullName, helper] of Array.from(allHelpers.entries())) {
      const [moduleName, helperName] = fullName.includes(':') ? fullName.split(':') : ['default', fullName];
      helpers.push({
        name: helper.name,
        fullName,
        module: moduleName,
        description: helper.description,
        methods: Object.keys(helper.methods)
      });
    }

    let filteredHelpers = helpers;

    if (options.namespace) {
      filteredHelpers = helpers.filter(h => h.module === options.namespace);
    }

    if ((options as any).json) {
      console.log(JSON.stringify(filteredHelpers, null, 2));
    } else {
      console.log('Available Helpers:');

      // Group by module
      const categorized = filteredHelpers.reduce((acc, helper) => {
        const module = helper.module || 'default';
        if (!acc[module]) acc[module] = [];
        acc[module].push(helper);
        return acc;
      }, {} as Record<string, any[]>);

      Object.entries(categorized).forEach(([module, helpers]) => {
        console.log(`\n${module}:`);
        (helpers as any[]).forEach((helper: any) => {
          console.log(`  ${helper.name} - ${helper.description || 'No description'}`);
          if (helper.methods.length > 0) {
            console.log(`    Methods: ${helper.methods.join(', ')}`);
          }
        });
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw errorMessages.operationFailed('list helpers', errorMessage);
  }
}

async function showHelperInfo(helperName: string, options: HelperOptions): Promise<void> {
  try {
    const registry = new HelperRegistry();
    const helper = registry.get(helperName);

    if (!helper) {
      throw errorMessages.resourceNotFound(`helper: ${helperName}`);
    }

    const methods = Object.keys(helper.methods);

    if ((options as any).json) {
      console.log(JSON.stringify({
        name: helper.name,
        description: helper.description,
        methods: methods.map(m => ({
          name: m,
          type: 'function'
        }))
      }, null, 2));
    } else {
      console.log(`Helper: ${helper.name}`);
      console.log(`Description: ${helper.description || 'No description'}`);

      if (methods.length > 0) {
        console.log('\nMethods:');
        methods.forEach(method => {
          console.log(`  - ${method}()`);
        });
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw errorMessages.operationFailed('show helper info', errorMessage);
  }
}

async function testHelper(helperName: string, options: HelperOptions): Promise<void> {
  try {
    const registry = new HelperRegistry();
    const helper = registry.get(helperName);

    if (!helper) {
      throw errorMessages.resourceNotFound(`helper: ${helperName}`);
    }

    // Parse method and args if provided in format "helper:method"
    let methodName = 'default';
    if (helperName.includes('.')) {
      const parts = helperName.split('.');
      methodName = parts[parts.length - 1] || 'default';
    }

    const args = options.args ? JSON.parse(options.args) : [];
    const methods = registry.getMethods(helperName);

    if (!methods.includes(methodName)) {
      console.log(`Available methods for ${helper.name}: ${methods.join(', ')}`);
      throw new Error(`Method '${methodName}' not found in helper`);
    }

    try {
      const result = registry.invokeMethod(helperName, methodName, ...args);

      if ((options as any).verbose) {
        console.log(`Testing ${helperName}.${methodName} with args:`, args);
        console.log('Result:', result);
      } else {
        console.log(result);
      }
    } catch (error) {
      console.error('Execution error:', error);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw errorMessages.operationFailed('test helper', errorMessage);
  }
}

async function createHelper(name: string, options: HelperOptions): Promise<void> {
  try {
    const registry = new HelperRegistry();

    // Check if helper already exists
    const existing = registry.get(name);
    if (existing) {
      throw new Error(`Helper '${name}' already exists`);
    }

    const helperConfig: any = {
      name,
      category: options.category || 'custom',
      description: '',
      global: options.global || false,
      parameters: [],
      implementation: ''
    };

    if (options.interactive) {
      const { text, confirm, select } = await import('@clack/prompts');

      const description = await text({
        message: 'Helper description:',
        placeholder: 'Enter helper description'
      });
      helperConfig.description = typeof description === 'string' ? description : '';

      helperConfig.category = await select({
        message: 'Helper category:',
        options: [
          { value: 'string', label: 'String utilities' },
          { value: 'date', label: 'Date utilities' },
          { value: 'math', label: 'Math utilities' },
          { value: 'array', label: 'Array utilities' },
          { value: 'object', label: 'Object utilities' },
          { value: 'custom', label: 'Custom category' }
        ],
        initialValue: 'custom'
      });

      const addParameters = await confirm({
        message: 'Add parameters?',
        initialValue: false
      });

      if (addParameters) {
        // Interactive parameter setup
        let addMore = true;
        while (addMore) {
          const paramNameResult = await text({
            message: 'Parameter name:',
            placeholder: 'Enter parameter name'
          });
          const paramName = typeof paramNameResult === 'string' ? paramNameResult : '';

          const paramType = await select({
            message: 'Parameter type:',
            options: [
              { value: 'string', label: 'String' },
              { value: 'number', label: 'Number' },
              { value: 'boolean', label: 'Boolean' },
              { value: 'object', label: 'Object' },
              { value: 'array', label: 'Array' }
            ],
            initialValue: 'string'
          });

          const paramDescResult = await text({
            message: 'Parameter description:',
            placeholder: 'Enter parameter description'
          });
          const paramDesc = typeof paramDescResult === 'string' ? paramDescResult : '';

          helperConfig.parameters.push({
            name: paramName,
            type: paramType,
            description: paramDesc
          });

          const addMoreResult = await confirm({
            message: 'Add another parameter?',
            initialValue: false
          });

          addMore = addMoreResult === true;
        }
      }

      const implementation = await text({
        message: 'Helper implementation (JavaScript):',
        placeholder: 'return args[0] || "";'
      });
      helperConfig.implementation = typeof implementation === 'string' ? implementation : 'return args[0] || "";';
    }

    // Convert helperConfig to HelperDefinition format
    const helperDef: HelperDefinition = {
      name,
      description: helperConfig.description,
      methods: {
        // Create a default method based on the implementation
        default: ((...args: any[]) => {
          const fn = new Function('...args', helperConfig.implementation || 'return args[0] || "";');
          return fn(...args);
        })
      }
    };

    // Register in the specified namespace or 'custom'
    const namespace = options.namespace || 'custom';
    registry.register(namespace, helperDef);
    console.log(`Helper '${name}' created successfully in namespace '${namespace}'`);
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw errorMessages.operationFailed('create helper', errorMessage);
  }
}

async function showHelperDoc(helperName: string, options: HelperOptions & { format?: string }): Promise<void> {
  try {
    const registry = new HelperRegistry();
    const helper = registry.get(helperName);

    if (!helper) {
      throw errorMessages.resourceNotFound(`helper: ${helperName}`);
    }

    const format = options.format || 'text';

    if (format === 'json') {
      console.log(JSON.stringify(helper, null, 2));
    } else if (format === 'markdown') {
      console.log(`# ${helper.name}\n`);
      console.log(`${helper.description || 'No description'}\n`);

      const methods = Object.keys(helper.methods);
      if (methods.length > 0) {
        console.log('## Methods\n');
        methods.forEach(method => {
          console.log(`- **${method}()** - Function`);
        });
        console.log();
      }
    } else {
      console.log(`${helper.name}`);
      console.log(`${'='.repeat(helper.name.length)}\n`);
      console.log(`${helper.description || 'No description'}\n`);

      const methods = Object.keys(helper.methods);
      if (methods.length > 0) {
        console.log('Methods:');
        methods.forEach(method => {
          console.log(`  - ${method}()`);
        });
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw errorMessages.operationFailed('show helper documentation', errorMessage);
  }
}

async function validateHelper(helperName: string): Promise<void> {
  try {
    const registry = new HelperRegistry();
    const helper = registry.get(helperName);

    if (!helper) {
      throw errorMessages.resourceNotFound(`helper: ${helperName}`);
    }

    // Use the built-in validateHelper method
    const isValid = registry.validateHelper(helper);

    if (isValid) {
      console.log(`Helper '${helperName}' is valid`);
      console.log(`  - Name: ${helper.name}`);
      console.log(`  - Methods: ${Object.keys(helper.methods).join(', ')}`);
    } else {
      console.error(`Helper '${helperName}' validation failed`);
      console.error('  - Check that name is a non-empty string');
      console.error('  - Check that methods is an object with function values');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw errorMessages.operationFailed('validate helper', errorMessage);
  }
}

async function removeHelper(helperName: string, options: { force?: boolean; global?: boolean }): Promise<void> {
  try {
    const registry = new HelperRegistry();
    const helper = registry.get(helperName);

    if (!helper) {
      throw errorMessages.resourceNotFound(`helper: ${helperName}`);
    }

    if (!options.force) {
      const { confirm } = await import('@clack/prompts');
      const confirmed = await confirm({
        message: `Are you sure you want to remove helper '${helperName}'?`,
        initialValue: false
      });

      if (!confirmed) {
        console.log('Helper removal cancelled');
        return;
      }
    }

    // Extract module name from helper name if it contains ':'
    let moduleName = 'custom';
    let shortName = helperName;
    if (helperName.includes(':')) {
      const parts = helperName.split(':');
      moduleName = parts[0] || 'custom';
      shortName = parts[1] || helperName;
    }

    registry.unregister(moduleName, shortName);
    console.log(`Helper '${helperName}' removed successfully`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw errorMessages.operationFailed('remove helper', errorMessage);
  }
}