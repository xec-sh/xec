/**
 * Tests for TaskParser
 */

import { it, expect, describe, beforeEach } from '@jest/globals';

import { TaskParser, TaskParseError } from '../../src/config/task-parser';

import type { TaskConfig, TaskDefinition } from '../../src/config/types';

describe('TaskParser', () => {
  let parser: TaskParser;

  beforeEach(() => {
    parser = new TaskParser();
  });

  describe('parseTask', () => {
    it('should parse simple string command', () => {
      const result = parser.parseTask('test', 'npm test');

      expect(result).toEqual({
        command: 'npm test',
        description: 'Execute: npm test',
      });
    });

    it('should parse task with command', () => {
      const config: TaskDefinition = {
        command: 'npm run build',
        description: 'Build the project',
      };

      const result = parser.parseTask('build', config);
      expect(result).toEqual(config);
    });

    it('should parse task with steps', () => {
      const config: TaskDefinition = {
        description: 'Deploy application',
        steps: [
          { name: 'Build', command: 'npm run build' },
          { name: 'Test', command: 'npm test' },
          { name: 'Deploy', command: './deploy.sh' },
        ],
      };

      const result = parser.parseTask('deploy', config);
      expect(result).toEqual(config);
    });

    it('should parse task with parameters', () => {
      const config: TaskDefinition = {
        command: 'echo ${params.message}',
        params: [
          {
            name: 'message',
            type: 'string',
            default: 'Hello',
            description: 'Message to display',
          },
        ],
      };

      const result = parser.parseTask('greet', config);
      expect(result).toEqual(config);
    });

    it('should reject task without execution method', () => {
      const config: TaskDefinition = {
        description: 'Invalid task',
      };

      const result = parser.parseTask('invalid', config);
      expect(result).toBeNull();

      const errors = parser.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('must have either command, steps, or script');
    });

    it('should reject task with both command and steps', () => {
      const config: TaskDefinition = {
        command: 'echo test',
        steps: [{ command: 'echo step' }],
      };

      const result = parser.parseTask('invalid', config);
      expect(result).toBeNull();

      const errors = parser.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('cannot have both command and steps');
    });
  });

  describe('parameter validation', () => {
    it('should validate parameter types', () => {
      const config: TaskDefinition = {
        command: 'echo test',
        params: [
          {
            name: 'param1',
            type: 'invalid' as any,
          },
        ],
      };

      parser.parseTask('test', config);
      const errors = parser.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Invalid type');
    });

    it('should validate enum parameters', () => {
      const config: TaskDefinition = {
        command: 'echo ${params.env}',
        params: [
          {
            name: 'env',
            type: 'enum',
            // Missing values array
          },
        ],
      };

      parser.parseTask('test', config);
      const errors = parser.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Enum type requires values array');
    });

    it('should validate parameter default values', () => {
      const config: TaskDefinition = {
        command: 'echo test',
        params: [
          {
            name: 'count',
            type: 'number',
            default: 'not a number', // Invalid default
          },
        ],
      };

      parser.parseTask('test', config);
      const errors = parser.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Default must be a number');
    });

    it('should detect duplicate parameter names', () => {
      const config: TaskDefinition = {
        command: 'echo test',
        params: [
          { name: 'param', type: 'string' },
          { name: 'param', type: 'number' }, // Duplicate
        ],
      };

      parser.parseTask('test', config);
      const errors = parser.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Duplicate parameter name');
    });
  });

  describe('step validation', () => {
    it('should validate step has execution method', () => {
      const config: TaskDefinition = {
        steps: [
          { name: 'Invalid step' }, // No command, task, or script
        ],
      };

      parser.parseTask('test', config);
      const errors = parser.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Step must have command, task, or script');
    });

    it('should validate step has only one execution method', () => {
      const config: TaskDefinition = {
        steps: [
          {
            command: 'echo test',
            task: 'other-task', // Can't have both
          },
        ],
      };

      parser.parseTask('test', config);
      const errors = parser.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Step can only have one of');
    });

    it('should validate step error handling', () => {
      const config: TaskDefinition = {
        steps: [
          {
            command: 'echo test',
            onFailure: {
              retry: -1, // Invalid
            },
          },
        ],
      };

      parser.parseTask('test', config);
      const errors = parser.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Retry count must be positive');
    });

    it('should validate step targets', () => {
      const config: TaskDefinition = {
        steps: [
          {
            command: 'echo test',
            target: 'host1',
            targets: ['host1', 'host2'], // Can't have both
          },
        ],
      };

      parser.parseTask('test', config);
      const errors = parser.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('cannot have both target and targets');
    });
  });

  describe('parseTasks', () => {
    it('should parse multiple tasks', () => {
      const tasks: Record<string, TaskConfig> = {
        test: 'npm test',
        build: {
          command: 'npm run build',
          description: 'Build project',
        },
        deploy: {
          steps: [
            { task: 'build' },
            { command: './deploy.sh' },
          ],
        },
      };

      const result = parser.parseTasks(tasks);

      expect(Object.keys(result)).toHaveLength(3);
      expect(result.test.command).toBe('npm test');
      expect(result.build.description).toBe('Build project');
      expect(result.deploy.steps).toHaveLength(2);
    });

    it('should throw on parse errors', () => {
      const tasks: Record<string, TaskConfig> = {
        valid: 'echo valid',
        invalid: {
          description: 'No execution method',
        },
      };

      expect(() => parser.parseTasks(tasks)).toThrow(TaskParseError);
    });
  });

  describe('timeout parsing', () => {
    it('should parse timeout values', () => {
      const configs = [
        { timeout: 1000, expected: true }, // Number
        { timeout: '1000ms', expected: true },
        { timeout: '10s', expected: true },
        { timeout: '5m', expected: true },
        { timeout: '1h', expected: true },
        { timeout: 'invalid', expected: false },
      ];

      configs.forEach(({ timeout, expected }) => {
        const config: TaskDefinition = {
          command: 'echo test',
          timeout,
        };

        const result = parser.parseTask('test', config);

        if (expected) {
          expect(result).not.toBeNull();
        } else {
          expect(result).toBeNull();
          const errors = parser.getErrors();
          expect(errors[0].message).toContain('Timeout must be positive');
        }
      });
    });
  });

  describe('cache validation', () => {
    it('should validate cache configuration', () => {
      const config: TaskDefinition = {
        command: 'echo test',
        cache: {
          key: '', // Empty key
          ttl: -100, // Negative TTL
        },
      };

      parser.parseTask('test', config);
      const errors = parser.getErrors();
      expect(errors).toHaveLength(2);
      expect(errors[0].message).toContain('Cache key is required');
      expect(errors[1].message).toContain('TTL must be positive');
    });
  });

  describe('parallel execution validation', () => {
    it('should validate maxConcurrent', () => {
      const config: TaskDefinition = {
        steps: [{ command: 'echo 1' }, { command: 'echo 2' }],
        parallel: true,
        maxConcurrent: 0, // Invalid
      };

      parser.parseTask('test', config);
      const errors = parser.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Must be at least 1');
    });
  });
});