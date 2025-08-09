import { it, expect, describe, beforeEach } from '@jest/globals';
import { TaskParser, TaskParseError } from '../../src/config/task-parser';
describe('TaskParser', () => {
    let parser;
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
            const config = {
                command: 'npm run build',
                description: 'Build the project',
            };
            const result = parser.parseTask('build', config);
            expect(result).toEqual(config);
        });
        it('should parse task with steps', () => {
            const config = {
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
            const config = {
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
            const config = {
                description: 'Invalid task',
            };
            const result = parser.parseTask('invalid', config);
            expect(result).toBeNull();
            const errors = parser.getErrors();
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('must have either command, steps, or script');
        });
        it('should reject task with both command and steps', () => {
            const config = {
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
            const config = {
                command: 'echo test',
                params: [
                    {
                        name: 'param1',
                        type: 'invalid',
                    },
                ],
            };
            parser.parseTask('test', config);
            const errors = parser.getErrors();
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('Invalid type');
        });
        it('should validate enum parameters', () => {
            const config = {
                command: 'echo ${params.env}',
                params: [
                    {
                        name: 'env',
                        type: 'enum',
                    },
                ],
            };
            parser.parseTask('test', config);
            const errors = parser.getErrors();
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('Enum type requires values array');
        });
        it('should validate parameter default values', () => {
            const config = {
                command: 'echo test',
                params: [
                    {
                        name: 'count',
                        type: 'number',
                        default: 'not a number',
                    },
                ],
            };
            parser.parseTask('test', config);
            const errors = parser.getErrors();
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('Default must be a number');
        });
        it('should detect duplicate parameter names', () => {
            const config = {
                command: 'echo test',
                params: [
                    { name: 'param', type: 'string' },
                    { name: 'param', type: 'number' },
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
            const config = {
                steps: [
                    { name: 'Invalid step' },
                ],
            };
            parser.parseTask('test', config);
            const errors = parser.getErrors();
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('Step must have command, task, or script');
        });
        it('should validate step has only one execution method', () => {
            const config = {
                steps: [
                    {
                        command: 'echo test',
                        task: 'other-task',
                    },
                ],
            };
            parser.parseTask('test', config);
            const errors = parser.getErrors();
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('Step can only have one of');
        });
        it('should validate step error handling', () => {
            const config = {
                steps: [
                    {
                        command: 'echo test',
                        onFailure: {
                            retry: -1,
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
            const config = {
                steps: [
                    {
                        command: 'echo test',
                        target: 'host1',
                        targets: ['host1', 'host2'],
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
            const tasks = {
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
            const tasks = {
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
                { timeout: 1000, expected: true },
                { timeout: '1000ms', expected: true },
                { timeout: '10s', expected: true },
                { timeout: '5m', expected: true },
                { timeout: '1h', expected: true },
                { timeout: 'invalid', expected: false },
            ];
            configs.forEach(({ timeout, expected }) => {
                const config = {
                    command: 'echo test',
                    timeout,
                };
                const result = parser.parseTask('test', config);
                if (expected) {
                    expect(result).not.toBeNull();
                }
                else {
                    expect(result).toBeNull();
                    const errors = parser.getErrors();
                    expect(errors[0].message).toContain('Timeout must be positive');
                }
            });
        });
    });
    describe('cache validation', () => {
        it('should validate cache configuration', () => {
            const config = {
                command: 'echo test',
                cache: {
                    key: '',
                    ttl: -100,
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
            const config = {
                steps: [{ command: 'echo 1' }, { command: 'echo 2' }],
                parallel: true,
                maxConcurrent: 0,
            };
            parser.parseTask('test', config);
            const errors = parser.getErrors();
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('Must be at least 1');
        });
    });
});
//# sourceMappingURL=task-parser.test.js.map