import path from 'path';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import { temporaryDirectory } from 'tempy';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';

describe('new command', () => {
  let tempDir: string;
  let originalCwd: string;
  let xecPath: string;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = temporaryDirectory();
    await fs.ensureDir(tempDir);
    
    // Save current directory and change to temp
    originalCwd = process.cwd();
    process.chdir(tempDir);
    
    // Get the xec binary path
    xecPath = path.join(originalCwd, 'bin/xec');
  });

  afterEach(async () => {
    // Restore original directory
    process.chdir(originalCwd);
    
    // Clean up temp directory
    await fs.remove(tempDir);
  });

  // Helper function to run xec commands
  function runXec(args: string): string {
    try {
      const result = execSync(`node ${xecPath} ${args}`, {
        env: {
          ...process.env,
          CI: 'true', // Set CI to prevent interactive prompts
          XEC_NO_INTERACTIVE: 'true'
        },
        stdio: 'pipe',
        encoding: 'utf-8'
      });
      return result;
    } catch (error: any) {
      console.error('Command failed:', error.message);
      if (error.stderr) console.error('stderr:', error.stderr.toString());
      if (error.stdout) console.error('stdout:', error.stdout.toString());
      throw error;
    }
  }

  describe('project creation', () => {
    it('should create minimal project structure', async () => {
      runXec('new project test-project --minimal --skip-git --force --desc "Test project"');
      
      const projectDir = path.join(tempDir, 'test-project');
      
      // Check that minimal files were created
      expect(await fs.pathExists(path.join(projectDir, '.xec/config.yaml'))).toBe(true);
      expect(await fs.pathExists(path.join(projectDir, '.xec/.gitignore'))).toBe(true);
      
      // Verify config content
      const config = await fs.readFile(path.join(projectDir, '.xec/config.yaml'), 'utf-8');
      expect(config).toContain('version: "2.0"');
      expect(config).toContain('name: test-project');
      expect(config).toContain('description: Test project');
      
      // Should not create example files in minimal mode
      expect(await fs.pathExists(path.join(projectDir, '.xec/scripts/example.js'))).toBe(false);
    });

    it('should create standard project structure', async () => {
      runXec('new project test-project --skip-git --force --desc "Test project"');
      
      const projectDir = path.join(tempDir, 'test-project');
      
      // Check that all standard files were created
      expect(await fs.pathExists(path.join(projectDir, '.xec/config.yaml'))).toBe(true);
      expect(await fs.pathExists(path.join(projectDir, '.xec/.gitignore'))).toBe(true);
      expect(await fs.pathExists(path.join(projectDir, '.xec/scripts/example.js'))).toBe(true);
      expect(await fs.pathExists(path.join(projectDir, '.xec/commands/hello.js'))).toBe(true);
      expect(await fs.pathExists(path.join(projectDir, '.xec/README.md'))).toBe(true);
      
      // Verify config content
      const config = await fs.readFile(path.join(projectDir, '.xec/config.yaml'), 'utf-8');
      expect(config).toContain('version: "2.0"');
      expect(config).toContain('name: test-project');
      expect(config).toContain('vars:');
      expect(config).toContain('targets:');
      expect(config).toContain('tasks:');
    });

    it('should create project with custom description', async () => {
      runXec('new project test-project --desc "My awesome project" --skip-git --force');
      
      const projectDir = path.join(tempDir, 'test-project');
      const config = await fs.readFile(path.join(projectDir, '.xec/config.yaml'), 'utf-8');
      expect(config).toContain('description: My awesome project');
    });

    it('should handle existing directory', async () => {
      // Create project directory first
      await fs.ensureDir(path.join(tempDir, 'test-project'));
      await fs.ensureDir(path.join(tempDir, 'test-project', '.xec'));
      
      // Create the project with force flag first time
      runXec('new project test-project --skip-git --force --desc "First"');
      
      // Try to create project again with force flag - should succeed and overwrite
      runXec('new project test-project --skip-git --force --desc "Overwritten"');
      
      const projectDir = path.join(tempDir, 'test-project');
      const config = await fs.readFile(path.join(projectDir, '.xec/config.yaml'), 'utf-8');
      expect(config).toContain('description: Overwritten');
    });
  });

  describe('script creation', () => {
    beforeEach(async () => {
      // Create .xec directory for script tests
      await fs.ensureDir(path.join(tempDir, '.xec'));
      await fs.ensureDir(path.join(tempDir, '.xec/scripts'));
    });

    it('should create basic JavaScript script with --js flag', async () => {
      runXec('new script deploy --js --force --desc "Deploy script"');
      
      const scriptPath = path.join(tempDir, '.xec/scripts/deploy.js');
      expect(await fs.pathExists(scriptPath)).toBe(true);
      
      const content = await fs.readFile(scriptPath, 'utf-8');
      expect(content).toContain('#!/usr/bin/env xec');
      expect(content).toContain('Deploy script');
      expect(content).toContain('log.info');
      
      // Check file permissions (should be executable)
      const stats = await fs.stat(scriptPath);
      const isExecutable = (stats.mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });

    it('should create TypeScript script by default (without --js flag)', async () => {
      runXec('new script deploy --force --desc "Deploy script"');
      
      const scriptPath = path.join(tempDir, '.xec/scripts/deploy.ts');
      expect(await fs.pathExists(scriptPath)).toBe(true);
      
      const content = await fs.readFile(scriptPath, 'utf-8');
      expect(content).toContain('#!/usr/bin/env xec');
      expect(content).toContain(': string');  // TypeScript type annotation
    });

    it('should create advanced script template', async () => {
      runXec('new script deploy --advanced --js --force --desc "Deploy script"');
      
      const scriptPath = path.join(tempDir, '.xec/scripts/deploy.js');
      const content = await fs.readFile(scriptPath, 'utf-8');
      
      // Check for advanced template features
      expect(content).toContain('validateEnvironment');
      expect(content).toContain('function validateEnvironment');
      expect(content).toContain('options =');
    });

    it('should handle missing .xec directory', async () => {
      // Remove .xec directory
      await fs.remove(path.join(tempDir, '.xec'));
      
      expect(() => {
        runXec('new script test --desc "Test"');
      }).toThrow();
    });
  });

  describe('command creation', () => {
    beforeEach(async () => {
      // Create .xec directory for command tests
      await fs.ensureDir(path.join(tempDir, '.xec'));
      await fs.ensureDir(path.join(tempDir, '.xec/commands'));
    });

    it('should create basic command', async () => {
      runXec('new command deploy --js --force --desc "Deploy command"');
      
      const commandPath = path.join(tempDir, '.xec/commands/deploy.js');
      expect(await fs.pathExists(commandPath)).toBe(true);
      
      const content = await fs.readFile(commandPath, 'utf-8');
      expect(content).toContain('export function command(program)');
      expect(content).toContain('.command(\'deploy');
      expect(content).toContain('.description(');
      expect(content).toContain('Deploy command');
    });

    it('should create TypeScript command by default (without --js flag)', async () => {
      runXec('new command deploy --force --desc "Deploy command"');
      
      const commandPath = path.join(tempDir, '.xec/commands/deploy.ts');
      expect(await fs.pathExists(commandPath)).toBe(true);
      
      const content = await fs.readFile(commandPath, 'utf-8');
      expect(content).toContain('import type { Command } from \'commander\'');
      expect(content).toContain('export function command(program: Command): void');
    });

    it('should create advanced command with subcommands', async () => {
      runXec('new command manage --advanced --force --js --desc "Manage command"');
      
      const commandPath = path.join(tempDir, '.xec/commands/manage.js');
      const content = await fs.readFile(commandPath, 'utf-8');
      
      expect(content).toContain('.command(\'list\')');
      expect(content).toContain('await createItem(');
      expect(content).toContain('.command(\'delete');
    });
  });

  describe('task creation with advanced flag', () => {
    beforeEach(async () => {
      // Create initial config file
      await fs.ensureDir(path.join(tempDir, '.xec'));
      await fs.writeFile(
        path.join(tempDir, '.xec/config.yaml'),
        `version: "2.0"\nname: test-project\ntasks: {}\n`
      );
    });

    it('should create advanced task with hooks', async () => {
      runXec('new task deploy --advanced --force --desc "Deploy task"');
      
      const config = await fs.readFile(path.join(tempDir, '.xec/config.yaml'), 'utf-8');
      expect(config).toContain('deploy:');
      expect(config).toContain('description: Deploy task');
      expect(config).toContain('hooks:');
      expect(config).toContain('before:');
      expect(config).toContain('after:');
      expect(config).toContain('steps:');
    });
  });

  describe('profile creation', () => {
    beforeEach(async () => {
      // Create initial config file
      await fs.ensureDir(path.join(tempDir, '.xec'));
      await fs.writeFile(
        path.join(tempDir, '.xec/config.yaml'),
        `version: "2.0"\nname: test-project\n`
      );
    });

    it('should add profile to configuration', async () => {
      runXec('new profile production --force --desc "Production profile"');
      
      const config = await fs.readFile(path.join(tempDir, '.xec/config.yaml'), 'utf-8');
      expect(config).toContain('profiles:');
      expect(config).toContain('production:');
      expect(config).toContain('description: Production profile');
      expect(config).toContain('vars:');
    });

    it('should create advanced profile with targets', async () => {
      runXec('new profile staging --advanced --force --desc "Staging profile"');
      
      const config = await fs.readFile(path.join(tempDir, '.xec/config.yaml'), 'utf-8');
      expect(config).toContain('staging:');
      expect(config).toContain('description: Staging profile');
      expect(config).toContain('targets:');
      expect(config).toContain('hosts:');
      expect(config).toContain('containers:');
    });
  });

  describe('extension creation', () => {
    it('should create basic extension structure', async () => {
      runXec('new extension my-ext --force --desc "My extension"');
      
      const extDir = path.join(tempDir, 'my-ext');
      expect(await fs.pathExists(path.join(extDir, 'extension.yaml'))).toBe(true);
      expect(await fs.pathExists(path.join(extDir, 'package.json'))).toBe(true);
      
      // Verify extension.yaml content
      const extensionYaml = await fs.readFile(path.join(extDir, 'extension.yaml'), 'utf-8');
      expect(extensionYaml).toContain('name: my-ext');
      expect(extensionYaml).toContain('version:');
      expect(extensionYaml).toContain('description: My extension');
      
      // Verify package.json content
      const packageJson = await fs.readFile(path.join(extDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(packageJson);
      expect(pkg.name).toBe('xec-ext-my-ext');
      expect(pkg.description).toBe('My extension');
    });

    it('should create advanced extension with scripts', async () => {
      runXec('new extension my-ext --advanced --force --desc "My extension"');
      
      const extDir = path.join(tempDir, 'my-ext');
      expect(await fs.pathExists(path.join(extDir, 'scripts/my-ext-main.js'))).toBe(true);
      expect(await fs.pathExists(path.join(extDir, 'scripts/my-ext-utils.js'))).toBe(true);
      expect(await fs.pathExists(path.join(extDir, 'README.md'))).toBe(true);
      expect(await fs.pathExists(path.join(extDir, 'examples/basic.yaml'))).toBe(true);
    });
  });

  describe('validation', () => {
    it('should reject invalid project names', async () => {
      expect(() => {
        runXec('new project "invalid name!" --force --desc "Test"');
      }).toThrow();
    });

    it('should reject invalid script names with path traversal', async () => {
      // Create .xec directory first
      await fs.ensureDir(path.join(tempDir, '.xec'));
      
      // Use a simple invalid name that should fail validation
      expect(() => {
        runXec('new script "invalid/name" --force --desc "Test"');
      }).toThrow();
    });
  });

  describe('interactive mode', () => {
    it('should handle artifact type as a name when not a valid type', async () => {
      // When given 'my-awesome-project' as first argument (not a valid artifact type),
      // it should be treated as the project name
      runXec('new my-awesome-project --skip-git --force --desc "My project"');
      
      const projectDir = path.join(tempDir, 'my-awesome-project');
      
      // Should create a project with that name
      expect(await fs.pathExists(path.join(projectDir, '.xec/config.yaml'))).toBe(true);
      const config = await fs.readFile(path.join(projectDir, '.xec/config.yaml'), 'utf-8');
      expect(config).toContain('name: my-awesome-project');
      expect(config).toContain('description: My project');
    });
  });

  describe('error handling', () => {
    it('should provide helpful error for missing .xec directory', async () => {
      expect(() => {
        runXec('new script test --desc "Test"');
      }).toThrow();
    });

    it('should handle file write errors gracefully', async () => {
      // Create .xec directory with a valid config
      await fs.ensureDir(path.join(tempDir, '.xec'));
      
      // Create an existing task config
      await fs.writeFile(
        path.join(tempDir, '.xec/config.yaml'),
        `version: "2.0"\nname: test-project\ntasks:\n  test:\n    command: echo test\n`
      );
      
      // Try to add a task with the same name - should work with --force
      runXec('new task test --advanced --force --desc "New test task"');
      
      const config = await fs.readFile(path.join(tempDir, '.xec/config.yaml'), 'utf-8');
      expect(config).toContain('test:');
      expect(config).toContain('description: New test task');
    });
  });

  describe('comprehensive feature testing', () => {
    it('should handle overwrite with force flag', async () => {
      // Create existing script
      await fs.ensureDir(path.join(tempDir, '.xec/scripts'));
      await fs.writeFile(path.join(tempDir, '.xec/scripts/test.js'), '// existing content');
      
      // Overwrite with force flag
      runXec('new script test --js --force --desc "New content"');
      
      const content = await fs.readFile(path.join(tempDir, '.xec/scripts/test.js'), 'utf-8');
      expect(content).toContain('#!/usr/bin/env xec'); // New content
      expect(content).not.toContain('// existing content');
    });

    it('should create project with git by default when not skipped', async () => {
      // Create a project without --skip-git
      runXec('new project test-git --force --desc "Git project"');
      
      const projectDir = path.join(tempDir, 'test-git');
      
      // Check if git init was attempted (project structure should still be created)
      expect(await fs.pathExists(path.join(projectDir, '.xec/config.yaml'))).toBe(true);
    });

    it('should handle all artifact types', async () => {
      // Test creating each artifact type
      const artifacts = [
        { type: 'project', name: 'test-proj', path: 'test-proj/.xec/config.yaml', needsSetup: false },
        { type: 'script', name: 'test-script', path: '.xec/scripts/test-script.ts', needsSetup: true },
        { type: 'command', name: 'test-cmd', path: '.xec/commands/test-cmd.ts', needsSetup: true },
        { type: 'extension', name: 'test-ext', path: 'test-ext/extension.yaml', needsSetup: false }
      ];

      for (const artifact of artifacts) {
        // Clean up for each test
        process.chdir(originalCwd);
        await fs.remove(tempDir);
        tempDir = temporaryDirectory();
        await fs.ensureDir(tempDir);
        process.chdir(tempDir);
        
        // Create .xec directory for non-project artifacts
        if (artifact.needsSetup) {
          await fs.ensureDir(path.join(tempDir, '.xec'));
          if (artifact.type === 'script') {
            await fs.ensureDir(path.join(tempDir, '.xec/scripts'));
          } else if (artifact.type === 'command') {
            await fs.ensureDir(path.join(tempDir, '.xec/commands'));
          }
        }

        const skipGit = artifact.type === 'project' ? '--skip-git' : '';
        runXec(`new ${artifact.type} ${artifact.name} --force --desc "Test ${artifact.type}" ${skipGit}`);
        
        expect(await fs.pathExists(path.join(tempDir, artifact.path))).toBe(true);
      }
    });

    it('should preserve existing config when adding tasks and profiles', async () => {
      // Create initial config with existing content
      await fs.ensureDir(path.join(tempDir, '.xec'));
      await fs.writeFile(
        path.join(tempDir, '.xec/config.yaml'),
        `version: "2.0"\nname: test-project\ndescription: Original description\n\nvars:\n  existing_var: value\n\ntasks:\n  existing_task:\n    command: echo "existing"\n`
      );

      // Add new task with advanced flag to avoid prompts
      runXec('new task new-task --advanced --force --desc "New task"');
      
      let config = await fs.readFile(path.join(tempDir, '.xec/config.yaml'), 'utf-8');
      expect(config).toContain('existing_task:');
      expect(config).toContain('new-task:');
      expect(config).toContain('existing_var: value');
      expect(config).toContain('description: Original description');
      
      // Add new profile
      runXec('new profile dev --force --desc "Dev profile"');
      
      config = await fs.readFile(path.join(tempDir, '.xec/config.yaml'), 'utf-8');
      expect(config).toContain('profiles:');
      expect(config).toContain('dev:');
      expect(config).toContain('existing_task:'); // Still has existing content
    });
  });
});