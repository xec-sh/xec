import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { TaskParser, TaskManager, TaskExecutor, TargetResolver, ConfigValidator, ConfigurationManager, VariableInterpolator } from '../../src/config/index';
describe('Configuration System Edge Cases', () => {
    let tempDir;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-edge-test-'));
        await fs.mkdir(path.join(tempDir, '.xec'), { recursive: true });
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    describe('ConfigurationManager Edge Cases', () => {
        it('should handle missing config files gracefully', async () => {
            const manager = new ConfigurationManager({
                projectRoot: tempDir
            });
            const loaded = await manager.load();
            expect(loaded.version).toBe('1.0');
            expect(loaded.targets?.local?.type).toBe('local');
        });
        it('should handle corrupted YAML files', async () => {
            const corruptedYaml = `
version: "1.0"
tasks:
  test: npm test
  build:
    [invalid yaml structure
`;
            await fs.writeFile(path.join(tempDir, '.xec', 'config.yaml'), corruptedYaml);
            const manager = new ConfigurationManager({
                projectRoot: tempDir,
                strict: true
            });
            await expect(manager.load()).rejects.toThrow();
        });
        it('should handle profile inheritance cycles', async () => {
            const config = `
version: "1.0"
profiles:
  a:
    extends: b
  b:
    extends: c
  c:
    extends: a
`;
            await fs.writeFile(path.join(tempDir, '.xec', 'config.yaml'), config);
            const manager = new ConfigurationManager({
                projectRoot: tempDir,
                profile: 'a',
                strict: false
            });
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
            await manager.load();
            const warnings = warnSpy.mock.calls.map(call => call[0]);
            expect(warnings.some(w => w.includes('Circular profile inheritance'))).toBe(true);
            warnSpy.mockRestore();
        });
        it('should handle environment variable overrides', async () => {
            process.env.XEC_VARS_TEST = 'env_override';
            process.env.XEC_TASKS_CUSTOM = 'echo from env';
            const config = `
version: "1.0"
vars:
  test: original
tasks:
  custom: echo original
`;
            await fs.writeFile(path.join(tempDir, '.xec', 'config.yaml'), config);
            const manager = new ConfigurationManager({
                projectRoot: tempDir,
                envPrefix: 'XEC_'
            });
            const loaded = await manager.load();
            expect(loaded.vars?.test).toBe('env_override');
            expect(loaded.tasks?.custom).toBe('echo from env');
            delete process.env.XEC_VARS_TEST;
            delete process.env.XEC_TASKS_CUSTOM;
        });
    });
    describe('VariableInterpolator Edge Cases', () => {
        it('should handle maximum interpolation depth', async () => {
            const interpolator = new VariableInterpolator();
            const context = {
                vars: {
                    a: '${vars.b}',
                    b: '${vars.c}',
                    c: '${vars.d}',
                    d: '${vars.e}',
                    e: '${vars.f}',
                    f: '${vars.g}',
                    g: '${vars.h}',
                    h: '${vars.i}',
                    i: '${vars.j}',
                    j: '${vars.k}',
                    k: '${vars.l}',
                    l: 'final'
                }
            };
            expect(() => interpolator.interpolate('${vars.a}', context))
                .toThrow('Maximum variable interpolation depth (10) exceeded');
        });
        it('should handle command substitution errors', async () => {
            const interpolator = new VariableInterpolator();
            const context = {
                vars: {}
            };
            const result = await interpolator.interpolateAsync('${cmd:this-command-does-not-exist-99999}', context);
            expect(result).toBe('');
        });
        it('should handle malformed variable references', async () => {
            const interpolator = new VariableInterpolator();
            const context = {
                vars: { test: 'value' }
            };
            const cases = [
                '${vars.}',
                '${vars..test}',
                '${vars.test.}',
                '${:command}',
                '${vars}',
                '${vars.test:}',
            ];
            for (const testCase of cases) {
                const result = interpolator.interpolate(testCase, context);
                expect(result).toBeDefined();
            }
        });
    });
    describe('TargetResolver Edge Cases', () => {
        it('should handle auto-detection failures gracefully', async () => {
            const config = {
                version: '1.0',
                targets: {}
            };
            const resolver = new TargetResolver(config);
            jest.spyOn(resolver, 'isDockerContainer').mockResolvedValue(false);
            jest.spyOn(resolver, 'isKubernetesPod').mockResolvedValue(false);
            jest.spyOn(resolver, 'getSSHHost').mockResolvedValue(undefined);
            await expect(resolver.resolve('unknown-target'))
                .rejects.toThrow("Target 'unknown-target' not found");
            const target = await resolver.resolve('unknown.example.com');
            expect(target.type).toBe('ssh');
            expect(target.source).toBe('detected');
        });
        it('should handle invalid target references', async () => {
            const config = {
                version: '1.0',
                targets: {
                    hosts: {
                        'valid-host': {
                            host: 'example.com',
                            user: 'test'
                        }
                    }
                }
            };
            const resolver = new TargetResolver(config);
            jest.spyOn(resolver, 'isDockerContainer').mockResolvedValue(false);
            jest.spyOn(resolver, 'isKubernetesPod').mockResolvedValue(false);
            jest.spyOn(resolver, 'getSSHHost').mockResolvedValue(undefined);
            const invalidTarget = await resolver.resolve('invalid.target');
            expect(invalidTarget.type).toBe('ssh');
            expect(invalidTarget.source).toBe('detected');
            await expect(resolver.resolve('hosts.nonexistent'))
                .rejects.toThrow(/Target 'nonexistent' not found/);
        });
        it('should handle pattern matching edge cases', async () => {
            const config = {
                version: '1.0',
                targets: {
                    hosts: {
                        'test-1': { host: 'test1.com', user: 'test' },
                        'test-2': { host: 'test2.com', user: 'test' },
                        'prod-1': { host: 'prod1.com', user: 'test' },
                        'special!char': { host: 'special.com', user: 'test' },
                        'with.dot': { host: 'withdot.com', user: 'test' }
                    }
                }
            };
            const resolver = new TargetResolver(config);
            const empty = await resolver.find('hosts.');
            expect(empty).toHaveLength(0);
            const special = await resolver.find('hosts.*!*');
            expect(special).toHaveLength(1);
            expect(special[0].name).toBe('special!char');
            const dots = await resolver.find('hosts.*.dot');
            expect(dots).toHaveLength(1);
            expect(dots[0].name).toBe('with.dot');
        });
    });
    describe('TaskExecutor Edge Cases', () => {
        it('should handle script execution errors', async () => {
            const config = {
                version: '1.0',
                tasks: {
                    'script-task': {
                        script: path.join(tempDir, 'nonexistent.js')
                    }
                }
            };
            const interpolator = new VariableInterpolator();
            const resolver = new TargetResolver(config);
            const executor = new TaskExecutor({
                interpolator,
                targetResolver: resolver
            });
            const result = await executor.execute('script-task', config.tasks['script-task'], {});
            expect(result.success).toBe(false);
            expect(result.error?.message).toContain('Script file not found');
        });
        it('should handle parallel execution with failures', async () => {
            const config = {
                version: '1.0',
                tasks: {
                    'parallel-task': {
                        parallel: true,
                        failFast: true,
                        steps: [
                            { name: 'Success 1', command: 'echo "OK 1"' },
                            { name: 'Failure', command: 'exit 1' },
                            { name: 'Success 2', command: 'echo "OK 2"' },
                            { name: 'Success 3', command: 'echo "OK 3"' }
                        ]
                    }
                }
            };
            const interpolator = new VariableInterpolator();
            const resolver = new TargetResolver(config);
            const executor = new TaskExecutor({
                interpolator,
                targetResolver: resolver
            });
            const result = await executor.execute('parallel-task', config.tasks['parallel-task'], {});
            expect(result.success).toBe(false);
            expect(result.steps?.filter(s => s.success).length).toBeGreaterThanOrEqual(1);
        });
        it('should handle timeout errors', async () => {
            const config = {
                version: '1.0',
                tasks: {
                    'timeout-task': {
                        command: 'sleep 5',
                        timeout: 100
                    }
                }
            };
            const interpolator = new VariableInterpolator();
            const resolver = new TargetResolver(config);
            const executor = new TaskExecutor({
                interpolator,
                targetResolver: resolver,
                defaultTimeout: 50000
            });
            const result = await executor.execute('timeout-task', config.tasks['timeout-task'], {});
            expect(result.success).toBe(false);
            expect(result.error?.message || result.error?.toString()).toBeDefined();
        });
        it('should handle error handlers', async () => {
            const config = {
                version: '1.0',
                tasks: {
                    'error-handler': {
                        steps: [
                            {
                                name: 'Failing step',
                                command: 'exit 1',
                                onFailure: {
                                    retry: 2,
                                    delay: '100ms'
                                }
                            }
                        ]
                    }
                }
            };
            const interpolator = new VariableInterpolator();
            const resolver = new TargetResolver(config);
            const executor = new TaskExecutor({
                interpolator,
                targetResolver: resolver
            });
            const startTime = Date.now();
            const result = await executor.execute('error-handler', config.tasks['error-handler'], {});
            const duration = Date.now() - startTime;
            expect(result.success).toBe(false);
            expect(duration).toBeGreaterThanOrEqual(200);
        });
    });
    describe('TaskParser Edge Cases', () => {
        it('should handle invalid parameter types', async () => {
            const validator = new ConfigValidator();
            const config = {
                version: '1.0',
                tasks: {
                    'test-task': {
                        params: [
                            { name: 'test', type: 'invalid' }
                        ],
                        command: 'echo ${params.test}'
                    }
                }
            };
            const errors = await validator.validate(config);
            expect(errors.some(e => e.message.includes('Invalid parameter type'))).toBe(true);
        });
        it('should handle missing required parameters', () => {
            const parser = new TaskParser();
            const task = {
                params: [
                    { name: 'required', required: true },
                    { name: 'optional', required: false, default: 'default' }
                ],
                command: 'echo ${params.required}'
            };
            const errors = parser.validateParams(task, {});
            expect(errors).toHaveLength(1);
            expect(errors[0]).toContain("Required parameter 'required' is missing");
        });
        it('should coerce parameter types correctly', () => {
            const parser = new TaskParser();
            const task = {
                params: [
                    { name: 'num', type: 'number' },
                    { name: 'bool', type: 'boolean' },
                    { name: 'arr', type: 'array' }
                ],
                command: 'echo test'
            };
            const params = parser.parseParams(task, {
                num: '42',
                bool: 'true',
                arr: 'item1,item2,item3'
            });
            expect(params.num).toBe(42);
            expect(params.bool).toBe(true);
            expect(params.arr).toEqual(['item1', 'item2', 'item3']);
        });
    });
    describe('Memory and Resource Management', () => {
        it('should not leak memory with large variable contexts', async () => {
            const interpolator = new VariableInterpolator();
            const largeContext = {
                vars: {},
                env: process.env
            };
            for (let i = 0; i < 1000; i++) {
                largeContext.vars[`var_${i}`] = `value_${i}`;
            }
            const initialMemory = process.memoryUsage().heapUsed;
            for (let i = 0; i < 100; i++) {
                interpolator.interpolate('${vars.var_500}', largeContext);
            }
            if (global.gc) {
                global.gc();
            }
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;
            expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
        });
        it('should handle concurrent task execution', async () => {
            const config = `
version: "1.0"
tasks:
  task1:
    command: echo "Task 1" && sleep 0.1
  task2:
    command: echo "Task 2" && sleep 0.1
  task3:
    command: echo "Task 3" && sleep 0.1
`;
            await fs.writeFile(path.join(tempDir, '.xec', 'config.yaml'), config);
            const manager = new ConfigurationManager({
                projectRoot: tempDir
            });
            const taskManager = new TaskManager({ configManager: manager });
            await taskManager.load();
            const startTime = Date.now();
            const results = await Promise.all([
                taskManager.run('task1'),
                taskManager.run('task2'),
                taskManager.run('task3')
            ]);
            const duration = Date.now() - startTime;
            expect(results.every(r => r.success)).toBe(true);
            expect(duration).toBeLessThan(300);
        });
    });
});
//# sourceMappingURL=edge-cases.test.js.map