/**
 * Configuration Validator tests
 */

import { it, expect, describe, beforeEach } from '@jest/globals';

import { ConfigValidator } from '../../src/config/config-validator.js';

import type { Configuration } from '../../src/config/types.js';

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator();
  });

  describe('version validation', () => {
    it('should accept valid version formats', async () => {
      const config: Configuration = {
        version: '2.0'
      };

      const errors = await validator.validate(config);
      expect(errors).toHaveLength(0);
    });

    it('should reject missing version', async () => {
      const config: any = {};

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'version',
        message: 'Version is required',
        rule: 'error'
      });
    });

    it('should reject invalid version format', async () => {
      const config: Configuration = {
        version: '2'
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'version',
        message: 'Invalid version format: 2. Expected: major.minor (e.g., 1.0)',
        rule: 'error'
      });
    });

    // it('should reject old versions', async () => {
    //   const config: Configuration = {
    //     version: '1.0'
    //   };

    //   const errors = await validator.validate(config);
    //   expect(errors).toContainEqual({
    //     path: 'version',
    //     message: 'Version 1.0 is not supported. Minimum version: 2.0',
    //     rule: 'error'
    //   });
    // });
  });

  describe('vars validation', () => {
    it('should accept valid variables', async () => {
      const config: Configuration = {
        version: '2.0',
        vars: {
          appName: 'myapp',
          version: '1.0.0',
          nested: {
            key: 'value'
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toHaveLength(0);
    });

    it('should reject reserved variable names', async () => {
      const config: Configuration = {
        version: '2.0',
        vars: {
          env: 'production',
          params: {},
          cmd: 'value',
          secret: 'value'
        }
      };

      const errors = await validator.validate(config);

      expect(errors).toContainEqual({
        path: 'vars.env',
        message: "Variable name 'env' is reserved",
        rule: 'error'
      });

      expect(errors).toContainEqual({
        path: 'vars.params',
        message: "Variable name 'params' is reserved",
        rule: 'error'
      });
    });

    it('should detect circular references', async () => {
      const config: Configuration = {
        version: '2.0',
        vars: {
          self: '${vars.self}',
          a: '${vars.b}',
          b: '${vars.a}'
        }
      };

      const errors = await validator.validate(config);

      expect(errors).toContainEqual({
        path: 'vars.self',
        message: 'Circular reference detected',
        rule: 'error'
      });
    });
  });

  describe('targets validation', () => {
    describe('SSH hosts', () => {
      it('should accept valid SSH host configuration', async () => {
        const config: Configuration = {
          version: '2.0',
          targets: {
            hosts: {
              'web-1': {
                host: 'web1.example.com',
                user: 'deploy',
                port: 22,
                privateKey: '~/.ssh/id_rsa'
              }
            }
          }
        };

        const errors = await validator.validate(config);
        expect(errors).toHaveLength(0);
      });

      it('should require host for SSH targets', async () => {
        const config: Configuration = {
          version: '2.0',
          targets: {
            hosts: {
              'web-1': {
                user: 'deploy'
              } as any
            }
          }
        };

        const errors = await validator.validate(config);
        expect(errors).toContainEqual({
          path: 'targets.hosts.web-1',
          message: 'Host is required for SSH target',
          rule: 'error'
        });
      });

      it('should validate port range', async () => {
        const config: Configuration = {
          version: '2.0',
          targets: {
            hosts: {
              'web-1': {
                host: 'example.com',
                port: 70000
              }
            }
          }
        };

        const errors = await validator.validate(config);
        expect(errors).toContainEqual({
          path: 'targets.hosts.web-1.port',
          message: 'Port must be a number between 1 and 65535',
          rule: 'error'
        });
      });

      it('should warn about both privateKey and password', async () => {
        const config: Configuration = {
          version: '2.0',
          targets: {
            hosts: {
              'web-1': {
                host: 'example.com',
                privateKey: '~/.ssh/id_rsa',
                password: 'password'
              }
            }
          }
        };

        const errors = await validator.validate(config);
        expect(errors).toContainEqual({
          path: 'targets.hosts.web-1',
          message: 'Both privateKey and password specified. privateKey will take precedence',
          rule: 'warning'
        });
      });
    });

    describe('Docker containers', () => {
      it('should accept valid container configuration', async () => {
        const config: Configuration = {
          version: '2.0',
          targets: {
            containers: {
              app: {
                image: 'node:18',
                volumes: ['./:/app'],
                ports: ['3000:3000']
              }
            }
          }
        };

        const errors = await validator.validate(config);
        expect(errors).toHaveLength(0);
      });

      it('should require either image or container', async () => {
        const config: Configuration = {
          version: '2.0',
          targets: {
            containers: {
              app: {} as any
            }
          }
        };

        const errors = await validator.validate(config);
        expect(errors).toContainEqual({
          path: 'targets.containers.app',
          message: 'Either image or container must be specified',
          rule: 'error'
        });
      });

      it('should validate volumes and ports are arrays', async () => {
        const config: Configuration = {
          version: '2.0',
          targets: {
            containers: {
              app: {
                image: 'node:18',
                volumes: 'not-array' as any,
                ports: 'not-array' as any
              }
            }
          }
        };

        const errors = await validator.validate(config);
        expect(errors).toContainEqual({
          path: 'targets.containers.app.volumes',
          message: 'Volumes must be an array',
          rule: 'error'
        });
        expect(errors).toContainEqual({
          path: 'targets.containers.app.ports',
          message: 'Ports must be an array',
          rule: 'error'
        });
      });
    });

    describe('Kubernetes pods', () => {
      it('should accept valid pod configuration', async () => {
        const config: Configuration = {
          version: '2.0',
          targets: {
            pods: {
              api: {
                pod: 'api-deployment-xyz',
                namespace: 'production',
                container: 'main'
              }
            }
          }
        };

        const errors = await validator.validate(config);
        expect(errors).toHaveLength(0);
      });

      it('should require either pod or selector', async () => {
        const config: Configuration = {
          version: '2.0',
          targets: {
            pods: {
              api: {
                namespace: 'default'
              } as any
            }
          }
        };

        const errors = await validator.validate(config);
        expect(errors).toContainEqual({
          path: 'targets.pods.api',
          message: 'Either pod or selector must be specified',
          rule: 'error'
        });
      });

      it('should warn about both pod and selector', async () => {
        const config: Configuration = {
          version: '2.0',
          targets: {
            pods: {
              api: {
                pod: 'api-pod',
                selector: 'app=api'
              }
            }
          }
        };

        const errors = await validator.validate(config);
        expect(errors).toContainEqual({
          path: 'targets.pods.api',
          message: 'Both pod and selector specified. pod will take precedence',
          rule: 'warning'
        });
      });
    });
  });

  describe('tasks validation', () => {
    it('should accept simple command tasks', async () => {
      const config: Configuration = {
        version: '2.0',
        tasks: {
          test: 'npm test',
          build: 'npm run build'
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toHaveLength(0);
    });

    it('should accept complex task definitions', async () => {
      const config: Configuration = {
        version: '2.0',
        tasks: {
          deploy: {
            command: 'deploy.sh',
            target: 'hosts.web-1',
            timeout: '5m',
            description: 'Deploy application'
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toHaveLength(0);
    });

    it('should require command, steps, or script', async () => {
      const config: Configuration = {
        version: '2.0',
        tasks: {
          invalid: {
            description: 'No command'
          } as any
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'tasks.invalid',
        message: 'Task must have either command, steps, or script',
        rule: 'error'
      });
    });

    it('should reject both command and steps', async () => {
      const config: Configuration = {
        version: '2.0',
        tasks: {
          invalid: {
            command: 'echo test',
            steps: [{ command: 'echo step' }]
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'tasks.invalid',
        message: 'Task cannot have both command and steps',
        rule: 'error'
      });
    });

    it('should validate task parameters', async () => {
      const config: Configuration = {
        version: '2.0',
        tasks: {
          deploy: {
            command: 'deploy ${params.version}',
            params: [
              {
                name: 'version',
                type: 'string',
                required: true,
                pattern: '^v\\d+\\.\\d+\\.\\d+$'
              },
              {
                name: 'env',
                type: 'enum',
                values: ['dev', 'prod']
              },
              {
                name: 'version' // Duplicate
              }
            ]
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'tasks.deploy.params[2]',
        message: 'Duplicate parameter name: version',
        rule: 'error'
      });
    });

    it('should validate parameter types', async () => {
      const config: Configuration = {
        version: '2.0',
        tasks: {
          test: {
            command: 'test',
            params: [
              {
                name: 'param1',
                type: 'invalid' as any
              },
              {
                name: 'param2',
                type: 'enum'
                // Missing values for enum
              }
            ]
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'tasks.test.params[0].type',
        message: 'Invalid parameter type: invalid',
        rule: 'error'
      });
      expect(errors).toContainEqual({
        path: 'tasks.test.params[1]',
        message: 'Enum parameter must have values',
        rule: 'error'
      });
    });

    it('should validate parameter constraints', async () => {
      const config: Configuration = {
        version: '2.0',
        tasks: {
          test: {
            command: 'test',
            params: [
              {
                name: 'count',
                type: 'number',
                min: 10,
                max: 5 // min > max
              },
              {
                name: 'pattern_param',
                type: 'string',
                pattern: '[invalid regex' // Invalid regex
              },
              {
                // Missing name
                type: 'string'
              } as any
            ]
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'tasks.test.params[0]',
        message: 'min cannot be greater than max',
        rule: 'error'
      });
      expect(errors).toContainEqual({
        path: 'tasks.test.params[1].pattern',
        message: 'Invalid regular expression',
        rule: 'error'
      });
      expect(errors).toContainEqual({
        path: 'tasks.test.params[2].name',
        message: 'Parameter name is required',
        rule: 'error'
      });
    });

    it('should validate task steps', async () => {
      const config: Configuration = {
        version: '2.0',
        tasks: {
          test: 'npm test',
          pipeline: {
            steps: [
              {
                name: 'Valid step',
                command: 'echo test'
              },
              {
                name: 'Invalid step'
                // No command, task, or script
              },
              {
                name: 'Reference non-existent task',
                task: 'nonexistent'
              },
              {
                name: 'Step with target',
                command: 'echo test',
                target: 'hosts.web-1'
              },
              {
                name: 'Step with targets array',
                command: 'echo test',
                targets: ['hosts.web-1', 'hosts.web-2']
              }
            ]
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'tasks.pipeline.steps[1]',
        message: 'Step must have either command, task, or script',
        rule: 'error'
      });
      expect(errors).toContainEqual({
        path: 'tasks.pipeline.steps[2].task',
        message: "Task 'nonexistent' not found",
        rule: 'error'
      });
    });

    it('should validate timeout format', async () => {
      const config: Configuration = {
        version: '2.0',
        tasks: {
          valid1: {
            command: 'test',
            timeout: 5000
          },
          valid2: {
            command: 'test',
            timeout: '30s'
          },
          valid3: {
            command: 'test',
            timeout: '5m'
          },
          invalid1: {
            command: 'test',
            timeout: -1000
          },
          invalid2: {
            command: 'test',
            timeout: 'invalid'
          }
        }
      };

      const errors = await validator.validate(config);

      expect(errors).toContainEqual(expect.objectContaining({
        path: 'tasks.invalid1.timeout',
        message: 'Timeout must be positive',
        rule: 'error'
      }));

      expect(errors).toContainEqual(expect.objectContaining({
        path: 'tasks.invalid2.timeout',
        message: 'Invalid timeout format. Use number (ms) or duration string (e.g., 30s, 5m, 1h)',
        rule: 'error'
      }));

      // Valid timeouts should not produce errors
      const timeoutErrors = errors.filter(e =>
        e.path.includes('tasks.valid1') ||
        e.path.includes('tasks.valid2') ||
        e.path.includes('tasks.valid3')
      );
      expect(timeoutErrors).toHaveLength(0);
    });

    it('should validate task dependencies and templates', async () => {
      const config: Configuration = {
        version: '2.0',
        tasks: {
          base: 'echo base',
          deploy: {
            command: 'deploy',
            dependsOn: ['build', 'test', 'nonexistent']
          },
          test: 'npm test',
          templated: {
            template: 'missing-template',
            params: []
          },
          withTargets: {
            command: 'deploy',
            targets: ['hosts.web-1', 'hosts.web-2', 'invalid-target']
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'tasks.deploy.dependsOn',
        message: "Dependency task 'build' not found",
        rule: 'error'
      });
      expect(errors).toContainEqual({
        path: 'tasks.deploy.dependsOn',
        message: "Dependency task 'nonexistent' not found",
        rule: 'error'
      });
      expect(errors).toContainEqual({
        path: 'tasks.templated.template',
        message: "Template task 'missing-template' not found",
        rule: 'error'
      });
    });

    it('should validate target references', async () => {
      const config: Configuration = {
        version: '2.0',
        tasks: {
          deploy: {
            command: 'deploy',
            target: 'invalid-target'
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'tasks.deploy.target',
        message: "Target reference 'invalid-target' may not be valid. Expected format: hosts.name, containers.name, pods.name, or local",
        rule: 'warning'
      });
    });
  });

  describe('profiles validation', () => {
    it('should accept valid profiles', async () => {
      const config: Configuration = {
        version: '2.0',
        profiles: {
          dev: {
            vars: {
              environment: 'development'
            }
          },
          prod: {
            vars: {
              environment: 'production'
            }
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toHaveLength(0);
    });

    it('should validate profile inheritance', async () => {
      const config: Configuration = {
        version: '2.0',
        profiles: {
          base: {
            vars: { base: true }
          },
          extended: {
            extends: 'nonexistent',
            vars: { extended: true }
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'profiles.extended.extends',
        message: "Extended profile 'nonexistent' not found",
        rule: 'error'
      });
    });

    it('should detect circular profile inheritance', async () => {
      const config: Configuration = {
        version: '2.0',
        profiles: {
          a: {
            extends: 'b',
            vars: {}
          },
          b: {
            extends: 'c',
            vars: {}
          },
          c: {
            extends: 'a',
            vars: {}
          }
        }
      };

      const errors = await validator.validate(config);

      // At least one profile should have circular inheritance error
      const circularErrors = errors.filter(e =>
        e.message === 'Circular profile inheritance detected'
      );
      expect(circularErrors.length).toBeGreaterThan(0);
    });

    it('should validate profile targets', async () => {
      const config: Configuration = {
        version: '2.0',
        profiles: {
          production: {
            vars: {
              environment: 'prod'
            },
            targets: {
              hosts: {
                'web-prod': {
                  host: 'prod.example.com'
                }
              }
            }
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toHaveLength(0);
    });
  });

  describe('scripts validation', () => {
    it('should validate scripts sandbox configuration', async () => {
      const config: Configuration = {
        version: '2.0',
        scripts: {
          sandbox: {
            restrictions: ['network', 'filesystem'],
            memoryLimit: '512MB',
            timeout: '30s'
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid scripts sandbox restrictions', async () => {
      const config: Configuration = {
        version: '2.0',
        scripts: {
          sandbox: {
            restrictions: 'not-array' as any
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'scripts.sandbox.restrictions',
        message: 'Restrictions must be an array',
        rule: 'error'
      });
    });

    it('should reject invalid memory limit format', async () => {
      const config: Configuration = {
        version: '2.0',
        scripts: {
          sandbox: {
            memoryLimit: 'invalid'
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'scripts.sandbox.memoryLimit',
        message: 'Invalid memory limit format',
        rule: 'error'
      });
    });

    it('should accept valid memory limit formats', async () => {
      const validFormats = ['128K', '256KB', '512M', '1G', '2GB'];

      for (const format of validFormats) {
        const config: Configuration = {
          version: '2.0',
          scripts: {
            sandbox: {
              memoryLimit: format
            }
          }
        };

        const errors = await validator.validate(config);
        const memoryErrors = errors.filter(e => e.path.includes('memoryLimit'));
        expect(memoryErrors).toHaveLength(0);
      }
    });
  });

  describe('other validations', () => {
    it('should validate secrets configuration', async () => {
      const config: Configuration = {
        version: '2.0',
        secrets: {
          provider: 'invalid' as any
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'secrets.provider',
        message: 'Invalid provider: invalid. Valid options: local, vault, 1password, aws-secrets, env, dotenv',
        rule: 'error'
      });
    });

    it('should reject missing secrets provider', async () => {
      const config: Configuration = {
        version: '2.0',
        secrets: {} as any
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'secrets.provider',
        message: 'Provider is required',
        rule: 'error'
      });
    });

    it('should validate extensions', async () => {
      const config: Configuration = {
        version: '2.0',
        extensions: [
          {
            source: '@xec/plugin'
          },
          {} as any, // Missing source
          {
            source: 'plugin',
            tasks: 'not-array' as any
          }
        ]
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'extensions[1].source',
        message: 'Extension source is required',
        rule: 'error'
      });
      expect(errors).toContainEqual({
        path: 'extensions[2].tasks',
        message: 'Tasks must be an array',
        rule: 'error'
      });
    });

    it('should validate command defaults', async () => {
      const config: Configuration = {
        version: '2.0',
        commands: {
          in: {
            defaultTimeout: 'invalid'
          },
          watch: {
            interval: -1
          }
        }
      };

      const errors = await validator.validate(config);
      expect(errors).toContainEqual({
        path: 'commands.in.defaultTimeout',
        message: 'Invalid timeout format. Use number (ms) or duration string (e.g., 30s, 5m, 1h)',
        rule: 'error'
      });
      expect(errors).toContainEqual({
        path: 'commands.watch.interval',
        message: 'Interval must be a positive number',
        rule: 'error'
      });
    });
  });
});