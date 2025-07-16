import chalk from 'chalk';
import * as path from 'path';
import { Command } from 'commander';
import { promises as fs } from 'fs';
import { spinner } from '@clack/prompts';
import { Task, Recipe } from '@xec/core';

import { loadRecipe } from '../utils/recipe.js';
import { getProjectRoot } from '../utils/project.js';

interface Host {
  host?: string;
  hostname?: string;
  port?: number;
  user?: string;
  vars?: Record<string, any>;
}

interface Group {
  hosts: string[];
  children?: string[];
  vars?: Record<string, any>;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  info: ValidationInfo[];
}

interface ValidationError {
  type: 'error';
  path: string;
  message: string;
  line?: number;
  column?: number;
}

interface ValidationWarning {
  type: 'warning';
  path: string;
  message: string;
  line?: number;
  column?: number;
}

interface ValidationInfo {
  type: 'info';
  path: string;
  message: string;
}

export default function validateCommand(program: Command) {
  program
    .command('validate')
    .description('Validate recipes and configurations')
    .argument('[path]', 'Recipe or configuration file to validate')
    .option('--type <type>', 'Explicitly set file type (recipe|config|inventory)')
    .option('--schema <schema>', 'Path to custom JSON schema')
    .option('--strict', 'Enable strict validation mode')
    .option('--fix', 'Auto-fix issues where possible')
    .option('--json', 'Output results as JSON')
    .action(async (filePath?: string, options?: any) => {
      try {
        if (!filePath) {
          // Validate all recipes in the project
          await validateProject(options);
          return;
        }

        // Validate specific file
        const result = await validateFile(filePath, options);
        
        if (options?.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        displayValidationResult(filePath, result);
        
        if (!result.valid) {
          process.exit(1);
        }
        
      } catch (error) {
        console.error(chalk.red(`Validation failed: ${error}`));
        process.exit(1);
      }
    });
}

async function validateProject(options: any): Promise<void> {
  console.log(chalk.bold('Validating Xec project...\n'));
  
  const projectRoot = await getProjectRoot();
  const results: Array<{ path: string; result: ValidationResult }> = [];
  
  // Check if .xec directory exists
  const xecDir = path.join(projectRoot, '.xec');
  try {
    await fs.access(xecDir);
  } catch {
    console.log(chalk.red('✗ Not a valid Xec project (missing .xec directory)'));
    process.exit(1);
  }

  const s = spinner();
  s.start('Scanning for files to validate...');

  // Find all files to validate
  const filesToValidate: Array<{ path: string; type: string }> = [];
  
  // Find recipes
  const recipePaths = [
    path.join(projectRoot, '.xec', 'recipes'),
    path.join(projectRoot, 'recipes'),
  ];
  
  for (const recipePath of recipePaths) {
    try {
      const files = await fs.readdir(recipePath);
      for (const file of files) {
        if (file.endsWith('.js') || file.endsWith('.ts')) {
          filesToValidate.push({
            path: path.join(recipePath, file),
            type: 'recipe',
          });
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  // Find configs
  const configFiles = [
    path.join(projectRoot, '.xec', 'config.json'),
    path.join(projectRoot, '.xec', 'xec.json'),
    path.join(projectRoot, 'xec.json'),
  ];
  
  for (const configFile of configFiles) {
    try {
      await fs.access(configFile);
      filesToValidate.push({ path: configFile, type: 'config' });
    } catch {
      // File doesn't exist, skip
    }
  }

  // Find inventory
  const inventoryFiles = [
    path.join(projectRoot, '.xec', 'inventory.yaml'),
    path.join(projectRoot, '.xec', 'inventory.json'),
    path.join(projectRoot, 'inventory.yaml'),
    path.join(projectRoot, 'inventory.json'),
  ];
  
  for (const inventoryFile of inventoryFiles) {
    try {
      await fs.access(inventoryFile);
      filesToValidate.push({ path: inventoryFile, type: 'inventory' });
    } catch {
      // File doesn't exist, skip
    }
  }

  s.stop(chalk.green(`Found ${filesToValidate.length} files to validate`));

  if (filesToValidate.length === 0) {
    console.log(chalk.yellow('\nNo files found to validate'));
    return;
  }

  // Validate each file
  for (const { path: filePath, type } of filesToValidate) {
    const relativePath = path.relative(projectRoot, filePath);
    process.stdout.write(chalk.gray(`Validating ${relativePath}... `));
    
    try {
      const result = await validateFile(filePath, { ...options, type });
      results.push({ path: relativePath, result });
      
      if (result.valid) {
        console.log(chalk.green('✓'));
      } else {
        console.log(chalk.red(`✗ (${result.errors.length} errors)`));
      }
    } catch (error) {
      console.log(chalk.red(`✗ (${error})`));
      results.push({
        path: relativePath,
        result: {
          valid: false,
          errors: [{
            type: 'error',
            path: relativePath,
            message: String(error),
          }],
          warnings: [],
          info: [],
        },
      });
    }
  }

  // Display summary
  console.log(chalk.bold('\n\nValidation Summary:\n'));
  
  const totalErrors = results.reduce((sum, r) => sum + r.result.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.result.warnings.length, 0);
  const validFiles = results.filter(r => r.result.valid).length;
  
  console.log(`Total files: ${results.length}`);
  console.log(`Valid files: ${chalk.green(validFiles.toString())}`);
  console.log(`Invalid files: ${results.length - validFiles > 0 ? chalk.red((results.length - validFiles).toString()) : '0'}`);
  console.log(`Total errors: ${totalErrors > 0 ? chalk.red(totalErrors.toString()) : '0'}`);
  console.log(`Total warnings: ${totalWarnings > 0 ? chalk.yellow(totalWarnings.toString()) : '0'}`);

  // Show details for files with issues
  const filesWithIssues = results.filter(r => !r.result.valid || r.result.warnings.length > 0);
  
  if (filesWithIssues.length > 0) {
    console.log(chalk.bold('\nIssues found:\n'));
    
    for (const { path: filePath, result } of filesWithIssues) {
      if (result.errors.length > 0 || result.warnings.length > 0) {
        console.log(chalk.cyan(filePath));
        
        for (const error of result.errors) {
          console.log(`  ${chalk.red('error:')} ${error.message}`);
        }
        
        for (const warning of result.warnings) {
          console.log(`  ${chalk.yellow('warning:')} ${warning.message}`);
        }
        
        console.log();
      }
    }
  }

  if (totalErrors > 0) {
    console.log(chalk.red('\n✗ Validation failed'));
    process.exit(1);
  } else {
    console.log(chalk.green('\n✓ All validations passed'));
  }
}

async function validateFile(filePath: string, options: any): Promise<ValidationResult> {
  const fileType = options?.type || detectFileType(filePath);
  
  switch (fileType) {
    case 'recipe':
      return validateRecipeFile(filePath, options);
    case 'config':
      return validateConfigFile(filePath, options);
    case 'inventory':
      return validateInventoryFile(filePath, options);
    default:
      throw new Error(`Unknown file type: ${fileType}`);
  }
}

async function validateRecipeFile(filePath: string, options: any): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const info: ValidationInfo[] = [];

  try {
    // Try to load the recipe
    const recipe = await loadRecipe(path.basename(filePath, path.extname(filePath)));
    
    if (!recipe) {
      errors.push({
        type: 'error',
        path: filePath,
        message: 'Failed to load recipe - file does not export a valid Recipe',
      });
      return { valid: false, errors, warnings, info };
    }

    // Validate recipe structure
    if (!recipe.name) {
      errors.push({
        type: 'error',
        path: filePath,
        message: 'Recipe must have a name',
      });
    }

    if (!recipe.description) {
      warnings.push({
        type: 'warning',
        path: filePath,
        message: 'Recipe should have a description',
      });
    }

    if (!recipe.tasks || recipe.tasks.size === 0) {
      warnings.push({
        type: 'warning',
        path: filePath,
        message: 'Recipe has no tasks',
      });
    }

    // Validate each task
    if (recipe.tasks instanceof Map) {
      let taskIndex = 0;
      for (const [taskKey, task] of recipe.tasks.entries()) {
        const taskPath = `${filePath}:tasks[${taskKey}]`;
        taskIndex++;
      
      if (!task.name) {
        errors.push({
          type: 'error',
          path: taskPath,
          message: 'Task must have a name',
        });
      }

      if (!task.handler) {
        errors.push({
          type: 'error',
          path: taskPath,
          message: 'Task must have a handler function',
        });
      }

      if (!task.description) {
        warnings.push({
          type: 'warning',
          path: taskPath,
          message: `Task '${task.name}' should have a description`,
        });
      }

      // Check for common issues
      if (task.dependencies && task.dependencies.length > 0) {
        for (const dep of task.dependencies) {
          const depExists = recipe.tasks.has(dep);
          if (!depExists) {
            errors.push({
              type: 'error',
              path: taskPath,
              message: `Task '${task.name}' depends on non-existent task '${dep}'`,
            });
          }
        }
      }

      // Check for circular dependencies
      const circular = detectCircularDependencies(Array.from(recipe.tasks.values()), task.name);
      if (circular.length > 0) {
        errors.push({
          type: 'error',
          path: taskPath,
          message: `Circular dependency detected: ${circular.join(' -> ')}`,
        });
      }
      }
    } else {
      warnings.push({
        type: 'warning',
        path: filePath,
        message: 'Recipe tasks should be a Map',
      });
    }

    // Strict mode checks
    if (options?.strict) {
      // Check for unused variables
      if (recipe.vars) {
        info.push({
          type: 'info',
          path: filePath,
          message: `Recipe defines ${Object.keys(recipe.vars).length} variable(s)`,
        });
      }

      // Check for duplicate task names
      const taskNames = Array.from(recipe.tasks.values()).map(t => t.name);
      const duplicates = taskNames.filter((name, index) => taskNames.indexOf(name) !== index);
      
      if (duplicates.length > 0) {
        errors.push({
          type: 'error',
          path: filePath,
          message: `Duplicate task names: ${duplicates.join(', ')}`,
        });
      }
    }

    // Auto-fix if requested
    if (options?.fix && (errors.length > 0 || warnings.length > 0)) {
      const fixed = await autoFixRecipe(filePath, recipe, errors, warnings);
      if (fixed) {
        info.push({
          type: 'info',
          path: filePath,
          message: 'Some issues were automatically fixed',
        });
      }
    }

  } catch (error) {
    errors.push({
      type: 'error',
      path: filePath,
      message: `Failed to validate recipe: ${error}`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
  };
}

async function validateConfigFile(filePath: string, options: any): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const info: ValidationInfo[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    let config: any;
    
    try {
      config = JSON.parse(content);
    } catch (parseError: any) {
      errors.push({
        type: 'error',
        path: filePath,
        message: `Invalid JSON: ${parseError.message}`,
        line: parseError.line,
        column: parseError.column,
      });
      return { valid: false, errors, warnings, info };
    }

    // Validate config structure
    if (!config.version) {
      warnings.push({
        type: 'warning',
        path: filePath,
        message: 'Configuration should have a version field',
      });
    }

    // Check for unknown top-level keys
    const knownKeys = ['version', 'defaults', 'ssh', 'docker', 'paths', 'registry'];
    const unknownKeys = Object.keys(config).filter(key => !knownKeys.includes(key));
    
    if (unknownKeys.length > 0) {
      warnings.push({
        type: 'warning',
        path: filePath,
        message: `Unknown configuration keys: ${unknownKeys.join(', ')}`,
      });
    }

    // Validate specific sections
    if (config.defaults) {
      if (typeof config.defaults.parallel === 'number' && config.defaults.parallel < 1) {
        errors.push({
          type: 'error',
          path: `${filePath}:defaults.parallel`,
          message: 'Parallel limit must be at least 1',
        });
      }
      
      if (typeof config.defaults.timeout === 'number' && config.defaults.timeout < 0) {
        errors.push({
          type: 'error',
          path: `${filePath}:defaults.timeout`,
          message: 'Timeout must be non-negative',
        });
      }
    }

    if (config.ssh) {
      if (config.ssh.defaultPort && (config.ssh.defaultPort < 1 || config.ssh.defaultPort > 65535)) {
        errors.push({
          type: 'error',
          path: `${filePath}:ssh.defaultPort`,
          message: 'SSH port must be between 1 and 65535',
        });
      }
    }

    // Use custom schema if provided
    if (options?.schema) {
      const schemaPath = path.resolve(options.schema);
      try {
        const schema = JSON.parse(await fs.readFile(schemaPath, 'utf-8'));
        const schemaErrors = validateAgainstSchema(config, schema);
        errors.push(...schemaErrors.map(e => ({
          type: 'error' as const,
          path: `${filePath}:${e.path}`,
          message: e.message,
        })));
      } catch (schemaError) {
        warnings.push({
          type: 'warning',
          path: filePath,
          message: `Failed to load custom schema: ${schemaError}`,
        });
      }
    }

  } catch (error) {
    errors.push({
      type: 'error',
      path: filePath,
      message: `Failed to validate config: ${error}`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
  };
}

async function validateInventoryFile(filePath: string, options: any): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const info: ValidationInfo[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    let inventory: any;
    
    if (filePath.endsWith('.json')) {
      try {
        inventory = JSON.parse(content);
      } catch (parseError: any) {
        errors.push({
          type: 'error',
          path: filePath,
          message: `Invalid JSON: ${parseError.message}`,
        });
        return { valid: false, errors, warnings, info };
      }
    } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      // In real implementation, parse YAML
      const yaml = await import('js-yaml');
      try {
        inventory = yaml.load(content);
      } catch (parseError: any) {
        errors.push({
          type: 'error',
          path: filePath,
          message: `Invalid YAML: ${parseError.message}`,
        });
        return { valid: false, errors, warnings, info };
      }
    }

    // Validate inventory structure
    if (!inventory.hosts && !inventory.groups) {
      errors.push({
        type: 'error',
        path: filePath,
        message: 'Inventory must have either hosts or groups',
      });
    }

    // Validate hosts
    if (inventory.hosts) {
      const hosts = inventory.hosts as Record<string, Host>;
      for (const [hostName, host] of Object.entries(hosts)) {
        const hostPath = `${filePath}:hosts.${hostName}`;
        
        if (!host.host && !host.hostname) {
          errors.push({
            type: 'error',
            path: hostPath,
            message: `Host '${hostName}' must have a hostname or host field`,
          });
        }

        if (host.port && (host.port < 1 || host.port > 65535)) {
          errors.push({
            type: 'error',
            path: `${hostPath}.port`,
            message: 'Port must be between 1 and 65535',
          });
        }
      }
    }

    // Validate groups
    if (inventory.groups) {
      const groups = inventory.groups as Record<string, Group>;
      for (const [groupName, group] of Object.entries(groups)) {
        const groupPath = `${filePath}:groups.${groupName}`;
        
        if (!group.hosts || !Array.isArray(group.hosts)) {
          errors.push({
            type: 'error',
            path: groupPath,
            message: `Group '${groupName}' must have a hosts array`,
          });
        } else {
          // Check if hosts exist
          for (const hostRef of group.hosts) {
            if (inventory.hosts && !inventory.hosts[hostRef]) {
              warnings.push({
                type: 'warning',
                path: `${groupPath}.hosts`,
                message: `Group '${groupName}' references non-existent host '${hostRef}'`,
              });
            }
          }
        }
      }
    }

    // Count hosts and groups
    const hostCount = Object.keys(inventory.hosts || {}).length;
    const groupCount = Object.keys(inventory.groups || {}).length;
    
    info.push({
      type: 'info',
      path: filePath,
      message: `Inventory contains ${hostCount} host(s) and ${groupCount} group(s)`,
    });

  } catch (error) {
    errors.push({
      type: 'error',
      path: filePath,
      message: `Failed to validate inventory: ${error}`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
  };
}

function detectFileType(filePath: string): string {
  const basename = path.basename(filePath);
  
  if (basename === 'xec.json' || basename === 'config.json') {
    return 'config';
  }
  
  if (basename.startsWith('inventory')) {
    return 'inventory';
  }
  
  if (filePath.includes('/recipes/') || filePath.includes('/.xec/recipes/')) {
    return 'recipe';
  }
  
  // Default based on extension
  if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
    return 'recipe';
  }
  
  return 'config';
}

function displayValidationResult(filePath: string, result: ValidationResult): void {
  console.log(chalk.bold(`\nValidation Results for ${filePath}:\n`));
  
  if (result.valid) {
    console.log(chalk.green('✓ Valid'));
  } else {
    console.log(chalk.red('✗ Invalid'));
  }

  if (result.errors.length > 0) {
    console.log(chalk.red(`\nErrors (${result.errors.length}):`));
    for (const error of result.errors) {
      console.log(`  ${chalk.red('●')} ${error.message}`);
      if (error.line) {
        console.log(`    at line ${error.line}${error.column ? `, column ${error.column}` : ''}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    console.log(chalk.yellow(`\nWarnings (${result.warnings.length}):`));
    for (const warning of result.warnings) {
      console.log(`  ${chalk.yellow('●')} ${warning.message}`);
    }
  }

  if (result.info.length > 0) {
    console.log(chalk.blue(`\nInfo:`));
    for (const item of result.info) {
      console.log(`  ${chalk.blue('●')} ${item.message}`);
    }
  }
}

function detectCircularDependencies(tasks: Task[], startTask: string): string[] {
  const visited = new Set<string>();
  const path: string[] = [];
  
  function visit(taskName: string): string[] | null {
    if (path.includes(taskName)) {
      return [...path.slice(path.indexOf(taskName)), taskName];
    }
    
    if (visited.has(taskName)) {
      return null;
    }
    
    visited.add(taskName);
    path.push(taskName);
    
    const task = tasks.find(t => t.name === taskName);
    if (task?.dependencies && task.dependencies.length > 0) {
      for (const dep of task.dependencies) {
        const circular = visit(dep);
        if (circular) {
          return circular;
        }
      }
    }
    
    path.pop();
    return null;
  }
  
  return visit(startTask) || [];
}

function validateAgainstSchema(data: any, schema: any): Array<{ path: string; message: string }> {
  // Simple schema validation - in real implementation would use ajv or similar
  const errors: Array<{ path: string; message: string }> = [];
  
  // This is a placeholder - real implementation would validate against JSON Schema
  return errors;
}

async function autoFixRecipe(filePath: string, recipe: Recipe, errors: ValidationError[], warnings: ValidationWarning[]): Promise<boolean> {
  // This is a placeholder - real implementation would modify the recipe file
  // to fix common issues like missing descriptions, etc.
  return false;
}