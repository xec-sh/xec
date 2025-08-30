/**
 * Real-world integration tests using actual file operations
 * Tests Phase 1 and Phase 2 features comprehensively
 */

import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import {
  TaskManager,
  TargetResolver,
  ConfigurationManager
} from '../../src/config/index.js';

describe('Real-World Configuration Integration Tests', () => {
  let tempDir: string;
  let projectDir: string;
  let globalDir: string;

  beforeEach(async () => {
    // Create real temporary directories
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-real-test-'));
    projectDir = path.join(tempDir, 'project');
    globalDir = path.join(tempDir, 'global');

    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });
    await fs.mkdir(path.join(globalDir, '.xec'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Phase 1: YAML Configuration Loading and Task Execution', () => {
    it('should handle real YAML file with syntax errors gracefully', async () => {
      // Write invalid YAML with actual syntax error - tab character causes parse error
      const invalidYaml = `version: "2.0"
tasks:
  test: npm test
	build:    # This line has a tab character which is invalid in YAML
    command: npm build`;

      await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), invalidYaml);

      const manager = new ConfigurationManager({
        projectRoot: projectDir,
        strict: true
      });

      await expect(manager.load()).rejects.toThrow(/tab characters must not be used in indentation/);
    });

    it('should execute real commands and capture output', async () => {
      // Use command substitution to create a temp file
      const configData = {
        version: "2.0",
        vars: {
          test_file: "${cmd:mktemp}"
        },
        tasks: {
          "create-file": {
            command: 'echo "Hello from task" > ${vars.test_file}'
          },
          "read-file": {
            command: "cat ${vars.test_file}"
          },
          cleanup: {
            command: "rm -f ${vars.test_file}"
          }
        }
      };

      await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(configData));

      const manager = new ConfigurationManager({ projectRoot: projectDir });
      const loaded = await manager.load();

      // Verify command substitution created a temp file
      expect(loaded.vars?.test_file).toMatch(/^\/.*\/tmp\.[A-Za-z0-9]+/);

      const taskManager = new TaskManager({ configManager: manager });
      await taskManager.load();

      // Execute tasks in sequence
      const createResult = await taskManager.run('create-file');
      expect(createResult.success).toBe(true);

      // Verify file was created
      const fileExists = await fs.access(loaded.vars.test_file as string)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Read the file
      const readResult = await taskManager.run('read-file');
      expect(readResult.success).toBe(true);
      // Check if the output contains our text (the output might include newlines)
      const readOutput = readResult.output || readResult.steps?.[0]?.output || '';
      expect(readOutput).toContain('Hello from task');

      // Cleanup
      const cleanupResult = await taskManager.run('cleanup');
      expect(cleanupResult.success).toBe(true);
    });

    it('should handle multi-step pipelines with real file operations', async () => {
      const testFile = path.join(projectDir, 'test-output.txt');
      const configData = {
        version: "2.0",
        vars: {
          output_file: testFile,
          project_dir: projectDir
        },
        tasks: {
          pipeline: {
            description: "Multi-step pipeline test",
            steps: [
              {
                name: "Write step 1",
                command: 'echo "Step 1" > ${vars.output_file}'
              },
              {
                name: "Append step 2",
                command: 'echo "Step 2" >> ${vars.output_file}'
              },
              {
                name: "Verify content",
                command: 'cat ${vars.output_file} | grep -c "Step"'
              }
            ]
          }
        }
      };

      await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(configData));

      const manager = new ConfigurationManager({ projectRoot: projectDir });
      await manager.load();

      const taskManager = new TaskManager({ configManager: manager });
      await taskManager.load();

      // Execute with project directory as working directory
      const result = await taskManager.run('pipeline', {}, { cwd: projectDir });

      // Log the result for debugging
      if (!result.success) {
        console.log('Pipeline failed:', result);
        result.steps?.forEach((step, i) => {
          console.log(`Step ${i} (${step.name}):`, step.success, step.output, step.error);
        });
      }

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);

      // Verify file was created with correct content
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toContain('Step 1');
      expect(content).toContain('Step 2');

      // Last step should output "2" (two lines with "Step")
      const lastStepOutput = result.steps?.[2].output?.trim();
      expect(lastStepOutput).toBe('2');
    });

    it('should handle task parameters with real command execution', async () => {
      const configData = {
        version: "2.0",
        tasks: {
          "echo-params": {
            params: [
              { name: "message", default: "default message" },
              { name: "count", type: "number", default: 1 }
            ],
            command: 'echo "${params.message}"'
          },
          "echo-multiple": {
            params: [
              { name: "message", default: "default message" },
              { name: "count", type: "number", default: 1 }
            ],
            steps: [
              { name: "echo1", command: 'echo "${params.message}"' },
              { name: "echo2", command: 'echo "${params.message}"' },
              { name: "echo3", command: 'echo "${params.message}"' }
            ]
          }
        }
      };

      await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(configData));

      const manager = new ConfigurationManager({ projectRoot: projectDir });
      await manager.load();

      const taskManager = new TaskManager({ configManager: manager });
      await taskManager.load();

      // Test with default params - execute in project directory
      const result1 = await taskManager.run('echo-params', {}, { cwd: projectDir });
      expect(result1.success).toBe(true);
      const output1 = result1.output || result1.steps?.[0]?.output || '';
      expect(output1.trim()).toBe('default message');

      // Test with custom params - using simple echo
      const result2 = await taskManager.run('echo-params', {
        message: 'custom',
        count: 3
      }, { cwd: projectDir });
      expect(result2.success).toBe(true);
      const output2 = result2.output || result2.steps?.[0]?.output || '';
      expect(output2.trim()).toBe('custom');

      // Test with multiple steps
      const result3 = await taskManager.run('echo-multiple', {
        message: 'test',
        count: 3
      }, { cwd: projectDir });
      expect(result3.success).toBe(true);
      expect(result3.steps).toHaveLength(3);
      expect(result3.steps?.every(s => s.output?.trim() === 'test')).toBe(true);
    });
  });

  describe('Phase 2: Advanced Features', () => {
    describe('Configuration Import and Extension', () => {
      it('should merge global and project configurations', async () => {
        // Create global config
        const globalConfig = {
          version: "2.0",
          vars: {
            global_var: "from global",
            shared_var: "global value"
          },
          targets: {
            hosts: {
              "global-server": {
                host: "global.example.com",
                user: "admin"
              }
            }
          }
        };

        // Create project config
        const projectConfig = {
          version: "2.0",
          vars: {
            project_var: "from project",
            shared_var: "project value"  // Should override global
          },
          targets: {
            hosts: {
              "project-server": {
                host: "project.example.com",
                user: "deploy"
              }
            }
          }
        };

        await fs.writeFile(path.join(globalDir, 'config.yaml'), yaml.dump(globalConfig));
        await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(projectConfig));

        const manager = new ConfigurationManager({
          projectRoot: projectDir,
          globalConfigDir: globalDir
        });

        const loaded = await manager.load();

        // Verify merging
        expect(loaded.vars?.global_var).toBe('from global');
        expect(loaded.vars?.project_var).toBe('from project');
        expect(loaded.vars?.shared_var).toBe('project value'); // Project overrides global

        // Verify targets are merged
        expect(loaded.targets?.hosts?.['global-server']).toBeDefined();
        expect(loaded.targets?.hosts?.['project-server']).toBeDefined();
      });

      it('should handle profile extends with real file writes', async () => {
        const configData = {
          version: "2.0",
          vars: {
            log_file: "${env.PWD}/app.log"
          },
          profiles: {
            base: {
              vars: {
                log_level: "info",
                debug: "false"
              }
            },
            dev: {
              extends: "base",
              vars: {
                log_level: "debug",
                debug: "true",
                dev_only: "true"
              }
            },
            staging: {
              extends: "dev",
              vars: {
                log_level: "warn",
                staging_url: "https://staging.example.com"
              }
            },
            prod: {
              extends: "base",
              vars: {
                log_level: "error",
                debug: "$unset",  // Remove debug variable
                prod_mode: "true"
              }
            }
          },
          tasks: {
            "write-config": {
              command: 'echo "LOG_LEVEL=${vars.log_level}" > config.env && echo "DEBUG=${vars.debug:false}" >> config.env'
            }
          }
        };

        await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(configData));

        // Test each profile
        const profiles = ['base', 'dev', 'staging', 'prod'];

        for (const profile of profiles) {
          const manager = new ConfigurationManager({
            projectRoot: projectDir,
            profile
          });

          const loaded = await manager.load();
          const taskManager = new TaskManager({ configManager: manager });
          await taskManager.load();

          // Execute with project directory as working directory
          await taskManager.run('write-config', {}, { cwd: projectDir });

          const configContent = await fs.readFile(
            path.join(projectDir, 'config.env'),
            'utf-8'
          );

          switch (profile) {
            case 'base':
              expect(configContent).toContain('LOG_LEVEL=info');
              expect(configContent).toContain('DEBUG=false');
              break;
            case 'dev':
              expect(configContent).toContain('LOG_LEVEL=debug');
              expect(configContent).toContain('DEBUG=true');
              expect(loaded.vars?.dev_only).toBe("true");
              break;
            case 'staging':
              expect(configContent).toContain('LOG_LEVEL=warn');
              expect(configContent).toContain('DEBUG=true'); // Inherited from dev
              expect(loaded.vars?.staging_url).toBe('https://staging.example.com');
              break;
            case 'prod':
              expect(configContent).toContain('LOG_LEVEL=error');
              expect(configContent).toContain('DEBUG=false'); // $unset + default
              expect(loaded.vars?.debug).toBeUndefined();
              expect(loaded.vars?.prod_mode).toBe("true");
              break;
          }
        }
      });
    });

    describe('Target System and Defaults', () => {
      it('should apply target defaults correctly', async () => {
        const configData = {
          version: "2.0",
          targets: {
            defaults: {
              timeout: 5000,
              shell: "/bin/bash",
              encoding: "utf8",

              ssh: {
                port: 2222,
                keepAlive: true,
                keepAliveInterval: 30000
              },

              docker: {
                tty: true,
                workdir: "/app",
                autoRemove: true
              }
            },
            hosts: {
              server1: {
                host: "server1.example.com",
                user: "deploy"
                // Should inherit port 2222 from defaults
              },
              server2: {
                host: "server2.example.com",
                user: "admin",
                port: 22,  // Override default
                timeout: 10000  // Override common default
              }
            },
            containers: {
              app: {
                image: "node:18"
                // Should inherit tty: true, workdir: /app
              },
              db: {
                image: "postgres:15",
                tty: false,  // Override default
                workdir: "/data"  // Override default
              }
            }
          }
        };

        await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(configData));

        const manager = new ConfigurationManager({ projectRoot: projectDir });
        const loaded = await manager.load();
        const resolver = new TargetResolver(loaded);

        // Test SSH defaults
        const server1 = await resolver.resolve('hosts.server1');
        expect(server1.config).toMatchObject({
          type: 'ssh',
          host: 'server1.example.com',
          user: 'deploy',
          port: 2222,  // From defaults
          keepAlive: true,  // From defaults
          timeout: 5000,  // From common defaults
          shell: '/bin/bash'  // From common defaults
        });

        const server2 = await resolver.resolve('hosts.server2');
        expect(server2.config).toMatchObject({
          type: 'ssh',
          host: 'server2.example.com',
          user: 'admin',
          port: 22,  // Override
          timeout: 10000,  // Override
          keepAlive: true  // Still from defaults
        });

        // Test Docker defaults
        const appContainer = await resolver.resolve('containers.app');
        expect(appContainer.config).toMatchObject({
          type: 'docker',
          image: 'node:18',
          tty: true,  // From defaults
          workdir: '/app',  // From defaults
          autoRemove: true,  // From defaults
          timeout: 5000  // From common defaults
        });

        const dbContainer = await resolver.resolve('containers.db');
        expect(dbContainer.config).toMatchObject({
          type: 'docker',
          image: 'postgres:15',
          tty: false,  // Override
          workdir: '/data',  // Override
          autoRemove: true  // Still from defaults
        });
      });

      it('should handle wildcard target patterns with real matching', async () => {
        const configData = {
          version: "2.0",
          targets: {
            hosts: {
              "web-prod-1": {
                host: "web1.prod.example.com",
                user: "deploy"
              },
              "web-prod-2": {
                host: "web2.prod.example.com",
                user: "deploy"
              },
              "web-staging-1": {
                host: "web1.staging.example.com",
                user: "deploy"
              },
              "api-prod-1": {
                host: "api1.prod.example.com",
                user: "deploy"
              },
              "api-prod-2": {
                host: "api2.prod.example.com",
                user: "deploy"
              },
              "db-master": {
                host: "db.example.com",
                user: "postgres"
              }
            }
          },
          tasks: {
            "list-web-servers": {
              command: 'echo "Found web servers: ${targets}"',
              targets: "web-*"
            },
            "list-prod-servers": {
              command: 'echo "Found prod servers: ${targets}"',
              targets: "*-prod-*"
            },
            "list-numbered-servers": {
              command: 'echo "Found numbered servers: ${targets}"',
              targets: "*-1"
            }
          }
        };

        await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(configData));

        const manager = new ConfigurationManager({ projectRoot: projectDir });
        const loaded = await manager.load();
        const resolver = new TargetResolver(loaded);

        // Test different patterns
        const webServers = await resolver.find('hosts.web-*');
        expect(webServers.map(t => t.name).sort()).toEqual([
          'web-prod-1',
          'web-prod-2',
          'web-staging-1'
        ]);

        const prodServers = await resolver.find('hosts.*-prod-*');
        expect(prodServers.map(t => t.name).sort()).toEqual([
          'api-prod-1',
          'api-prod-2',
          'web-prod-1',
          'web-prod-2'
        ]);

        const numberedServers = await resolver.find('hosts.*-1');
        expect(numberedServers.map(t => t.name).sort()).toEqual([
          'api-prod-1',
          'web-prod-1',
          'web-staging-1'
        ]);

        // Test brace expansion
        const selectedServers = await resolver.find('hosts.{web,api}-prod-*');
        expect(selectedServers).toHaveLength(4);

        // Test with non-matching pattern
        const noMatch = await resolver.find('hosts.nonexistent-*');
        expect(noMatch).toHaveLength(0);
      });
    });

    describe('Variable Interpolation', () => {
      it('should handle complex nested interpolation with real commands', async () => {
        const configData = {
          version: "2.0",
          vars: {
            // Basic values
            app_name: "myapp",
            env: "dev",

            // Command substitution
            user: "${cmd:whoami}",
            hostname: "${cmd:hostname}",
            timestamp: "${cmd:date +%s}",

            // Nested references
            app_dir: "/opt/${vars.app_name}",
            log_dir: "${vars.app_dir}/logs",
            config_file: "${vars.app_dir}/config/${vars.env}.json",

            // Environment with defaults
            home: "${env.HOME}",
            custom_var: "${env.CUSTOM_VAR:default_value}",
            port: "${env.PORT:3000}",

            // Complex nested object
            server: {
              host: "${vars.hostname}",
              user: "${vars.user}",
              paths: {
                app: "${vars.app_dir}",
                logs: "${vars.log_dir}",
                config: "${vars.config_file}"
              },
              url: "http://${vars.server.host}:${vars.port}"
            }
          },
          tasks: {
            "show-vars": {
              command: 'echo "App: ${vars.app_name}" && echo "User: ${vars.user}@${vars.hostname}" && echo "Config: ${vars.config_file}" && echo "URL: ${vars.server.url}"'
            }
          }
        };

        await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(configData));

        const manager = new ConfigurationManager({ projectRoot: projectDir });
        const loaded = await manager.load();

        // Verify command substitution worked
        expect(loaded.vars?.user).toBe(process.env.USER || process.env.USERNAME);
        expect(loaded.vars?.hostname).toBeTruthy();
        expect(loaded.vars?.timestamp).toMatch(/^\d+$/);

        // Verify nested interpolation
        expect(loaded.vars?.app_dir).toBe('/opt/myapp');
        expect(loaded.vars?.log_dir).toBe('/opt/myapp/logs');
        expect(loaded.vars?.config_file).toBe('/opt/myapp/config/dev.json');

        // Verify environment variables
        expect(loaded.vars?.home).toBe(process.env.HOME);
        expect(loaded.vars?.custom_var).toBe('default_value');
        expect(loaded.vars?.port).toBe('3000');

        // Verify complex nested object
        expect(loaded.vars?.server).toMatchObject({
          paths: {
            app: '/opt/myapp',
            logs: '/opt/myapp/logs',
            config: '/opt/myapp/config/dev.json'
          }
        });
        expect(loaded.vars?.server.url).toMatch(/^http:\/\/.*:3000$/);

        // Execute task to verify runtime interpolation
        const taskManager = new TaskManager({ configManager: manager });
        await taskManager.load();

        const result = await taskManager.run('show-vars', {}, { cwd: projectDir });
        expect(result.success).toBe(true);
        const output = result.output || result.steps?.[0]?.output || '';
        expect(output).toContain('App: myapp');
        expect(output).toContain(`User: ${loaded.vars?.user}@${loaded.vars?.hostname}`);
      });

      it('should detect and handle circular references', async () => {
        const configData = {
          version: "2.0",
          vars: {
            // Direct circular reference
            a: "${vars.a}",

            // Indirect circular reference
            b: "${vars.c}",
            c: "${vars.b}"
          }
        };

        await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(configData));

        const manager = new ConfigurationManager({
          projectRoot: projectDir,
          strict: false  // Don't throw, just warn
        });

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

        const loaded = await manager.load();

        // Should have warned about circular references
        const warnings = warnSpy.mock.calls.map(call => call[0]);
        expect(warnings.some(w => w.includes('Circular variable reference'))).toBe(true);

        // Circular references should remain unresolved
        expect(loaded.vars?.a).toBe('${vars.a}');
        expect(loaded.vars?.b).toBe('${vars.c}');
        expect(loaded.vars?.c).toBe('${vars.b}');

        warnSpy.mockRestore();
      });

      it('should handle valid nested references', async () => {
        const configData = {
          version: "2.0",
          vars: {
            counter: 1,
            next: "${vars.counter}",

            // Valid nested reference
            valid: {
              key: "value",
              ref: "${vars.valid.key}"
            }
          }
        };

        await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(configData));

        const manager = new ConfigurationManager({ projectRoot: projectDir });
        const loaded = await manager.load();

        // Valid references should work
        expect(loaded.vars?.next).toBe('1');
        expect(loaded.vars?.valid?.ref).toBe('value');
      });

      it('should handle special characters and escaping', async () => {
        const configData = {
          version: "2.0",
          vars: {
            // Special characters in values
            world: 'World',
            special: 'Hello ${vars.world}!',
            escaped: 'Use \\${vars.special} to reference',
            regex: '^[a-z]+$',
            subdir: 'spaces and special chars',
            path: '/path/with/${vars.subdir}/file',

            // Command with special chars
            listing: "${cmd:ls -la | head -5}"
          },
          tasks: {
            "echo-special": {
              command: 'echo "${vars.special}" && echo "${vars.escaped}" && echo "${vars.regex}"'
            }
          }
        };

        await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(configData));

        const manager = new ConfigurationManager({ projectRoot: projectDir });
        const loaded = await manager.load();

        expect(loaded.vars?.special).toBe('Hello World!');
        expect(loaded.vars?.escaped).toBe('Use \\${vars.special} to reference');
        expect(loaded.vars?.regex).toBe('^[a-z]+$');
        expect(loaded.vars?.path).toBe('/path/with/spaces and special chars/file');

        // Command substitution should work with pipes
        expect(loaded.vars?.listing).toBeTruthy();
        const listingLines = (loaded.vars?.listing as string).split('\n');
        expect(listingLines.length).toBeLessThanOrEqual(5);
      });
    });

    describe('Error Handling and Edge Cases', () => {
      it('should handle missing files gracefully', async () => {
        const configData = {
          version: "2.0",
          tasks: {
            "read-missing": {
              command: "cat /this/file/does/not/exist/at/all.txt"
            },
            "read-missing-continue": {
              steps: [
                {
                  name: "Try to read",
                  command: "cat /missing/file.txt",
                  onFailure: "continue"
                },
                {
                  name: "Recovery step",
                  command: 'echo "Recovered from error"'
                }
              ]
            }
          }
        };

        await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(configData));

        const manager = new ConfigurationManager({ projectRoot: projectDir });
        await manager.load();

        const taskManager = new TaskManager({ configManager: manager });
        await taskManager.load();

        // First task should fail
        const result1 = await taskManager.run('read-missing', {}, { cwd: projectDir });
        expect(result1.success).toBe(false);
        expect(result1.error?.message).toContain('failed');

        // Second task should continue after error
        const result2 = await taskManager.run('read-missing-continue', {}, { cwd: projectDir });
        expect(result2.success).toBe(true);
        expect(result2.steps?.[1].output).toContain('Recovered from error');
      });

      it('should handle environment variable edge cases', async () => {
        // Set some test environment variables
        process.env.TEST_VAR = 'test_value';
        process.env.EMPTY_VAR = '';
        delete process.env.UNDEFINED_VAR;

        const configData = {
          version: "2.0",
          vars: {
            // Existing env var
            test: "${env.TEST_VAR}",

            // Empty env var (should use empty string, not default)
            empty: "${env.EMPTY_VAR:default}",

            // Undefined env var (should use default)
            undefined: "${env.UNDEFINED_VAR:default}",

            // Nested env var reference
            nested: "${env.TEST_VAR:fallback}"
          },
          tasks: {
            "show-env": {
              command: 'echo "TEST=${vars.test}" && echo "EMPTY=${vars.empty}" && echo "UNDEFINED=${vars.undefined}" && echo "NESTED=${vars.nested}"'
            }
          }
        };

        await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(configData));

        const manager = new ConfigurationManager({ projectRoot: projectDir });
        const loaded = await manager.load();

        expect(loaded.vars?.test).toBe('test_value');
        expect(loaded.vars?.empty).toBe('');  // Empty string, not default
        expect(loaded.vars?.undefined).toBe('default');
        expect(loaded.vars?.nested).toBe('test_value');

        // Cleanup
        delete process.env.TEST_VAR;
        delete process.env.EMPTY_VAR;
      });

      it('should handle file operations in different directories', async () => {
        // Create a more complex directory structure
        const dirs = {
          src: path.join(projectDir, 'src'),
          dist: path.join(projectDir, 'dist'),
          config: path.join(projectDir, 'config')
        };

        for (const dir of Object.values(dirs)) {
          await fs.mkdir(dir, { recursive: true });
        }

        const configData = {
          version: "2.0",
          vars: {
            src_dir: "./src",
            dist_dir: "./dist",
            config_dir: "./config"
          },
          tasks: {
            build: {
              steps: [
                {
                  name: "Create source files",
                  command: 'echo "export const VERSION = \'1.0.0\';" > ${vars.src_dir}/version.ts && echo "console.log(\'App\');" > ${vars.src_dir}/index.ts'
                },
                {
                  name: "Copy to dist",
                  command: "cp -r ${vars.src_dir}/* ${vars.dist_dir}/"
                },
                {
                  name: "Create config",
                  command: 'echo \'{"version": "1.0.0"}\' > ${vars.config_dir}/app.json'
                },
                {
                  name: "Verify structure",
                  command: 'find . -type f -name "*.ts" -o -name "*.json" | sort'
                }
              ]
            }
          }
        };

        await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(configData));

        const manager = new ConfigurationManager({ projectRoot: projectDir });
        await manager.load();

        const taskManager = new TaskManager({ configManager: manager });
        await taskManager.load();

        // Execute in project directory
        const result = await taskManager.run('build', {}, { cwd: projectDir });
        expect(result.success).toBe(true);

        // Verify files were created
        const srcFiles = await fs.readdir(dirs.src);
        expect(srcFiles).toContain('version.ts');
        expect(srcFiles).toContain('index.ts');

        const distFiles = await fs.readdir(dirs.dist);
        expect(distFiles).toContain('version.ts');
        expect(distFiles).toContain('index.ts');

        const configFiles = await fs.readdir(dirs.config);
        expect(configFiles).toContain('app.json');

        // Verify find command output
        const output = result.steps?.[3].output || '';
        expect(output).toContain('./src/version.ts');
        expect(output).toContain('./dist/index.ts');
        expect(output).toContain('./config/app.json');
      });
    });
  });

  describe('Performance and Stress Tests', () => {
    it('should handle large configurations efficiently', async () => {
      // Generate a large configuration
      const tasks: any = {};
      const vars: any = {};

      // Create 100 tasks
      for (let i = 0; i < 100; i++) {
        tasks[`task-${i}`] = {
          command: `echo "Task ${i}"`,
          description: `Description for task ${i}`,
          params: [
            { name: 'param1', default: `default-${i}` },
            { name: 'param2', type: 'number', default: i }
          ]
        };

        vars[`var_${i}`] = `value_${i}`;
      }

      // Create nested variables with interpolation
      vars.nested = {};
      for (let i = 0; i < 50; i++) {
        vars.nested[`level_${i}`] = `\${vars.var_${i}}`;
      }

      const config = {
        version: '2.0',
        vars,
        tasks
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const start = Date.now();
      const manager = new ConfigurationManager({ projectRoot: projectDir });
      const loaded = await manager.load();
      const loadTime = Date.now() - start;

      // Should load in reasonable time
      expect(loadTime).toBeLessThan(1000); // Less than 1 second

      // Verify all tasks and vars loaded
      expect(Object.keys(loaded.tasks || {}).length).toBe(100);
      expect(Object.keys(loaded.vars || {}).length).toBeGreaterThan(50);

      // Verify interpolation worked
      expect(loaded.vars?.nested?.level_10).toBe('value_10');
    });

    it('should handle deeply nested variable interpolation', async () => {
      const configData = {
        version: "2.0",
        vars: {
          level1: "1",
          level2: "2-${vars.level1}",
          level3: "3-${vars.level2}",
          level4: "4-${vars.level3}",
          level5: "5-${vars.level4}",
          level6: "6-${vars.level5}",
          level7: "7-${vars.level6}",
          level8: "8-${vars.level7}",
          level9: "9-${vars.level8}",
          level10: "10-${vars.level9}",

          // Complex nested structure
          deep: {
            a: {
              b: {
                c: {
                  d: {
                    e: {
                      f: {
                        g: {
                          h: {
                            i: {
                              j: "${vars.level10}"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), yaml.dump(configData));

      const manager = new ConfigurationManager({ projectRoot: projectDir });
      const loaded = await manager.load();

      // Verify deep interpolation worked
      expect(loaded.vars?.level10).toBe('10-9-8-7-6-5-4-3-2-1');
      expect(loaded.vars?.deep?.a?.b?.c?.d?.e?.f?.g?.h?.i?.j).toBe('10-9-8-7-6-5-4-3-2-1');
    });
  });
});