import { it, vi, expect, describe } from 'vitest';

import { task } from '../../../src/dsl/task.js';
import { ValidationError, DependencyError } from '../../../src/core/errors.js';
import {
  recipe,
  phaseRecipe,
  simpleRecipe,
  moduleRecipe,
  RecipeBuilder
} from '../../../src/dsl/recipe.js';

import type { Module } from '../../../src/core/types.js';

describe('RecipeBuilder', () => {
  describe('create', () => {
    it('should create a new RecipeBuilder instance', () => {
      const builder = RecipeBuilder.create('test-recipe');
      expect(builder).toBeInstanceOf(RecipeBuilder);
    });

    it('should initialize with default values', () => {
      const builder = RecipeBuilder.create('test-recipe');
      const testTask = task('task1', async () => ({})).build();
      const built = builder.task(testTask).build();
      
      expect(built.id).toBe('test-recipe');
      expect(built.name).toBe('test-recipe'); // defaults to id
      expect(built.version).toBe('1.0.0'); // default version
      expect(built.tasks).toHaveLength(1);
      expect(built.modules).toEqual([]);
      expect(built.vars).toEqual({});
      expect(built.tags).toEqual([]);
      expect(built.meta).toEqual({});
      expect(built.hooks).toEqual({
        before: [],
        after: [],
        onError: [],
        finally: []
      });
    });
  });

  describe('builder methods', () => {
    it('should set name', () => {
      const built = recipe('test')
        .name('Test Recipe')
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.name).toBe('Test Recipe');
    });

    it('should set description', () => {
      const built = recipe('test')
        .description('Test recipe description')
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.description).toBe('Test recipe description');
    });

    it('should set version', () => {
      const built = recipe('test')
        .version('2.0.0')
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.version).toBe('2.0.0');
    });

    it('should set author', () => {
      const built = recipe('test')
        .author('John Doe')
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.author).toBe('John Doe');
    });

    it('should set tags', () => {
      const built = recipe('test')
        .tags('production', 'deployment')
        .tags('critical')
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.tags).toEqual(['production', 'deployment', 'critical']);
    });

    it('should set variables using vars() and var()', () => {
      const built = recipe('test')
        .vars({ env: 'prod', region: 'us-east-1' })
        .var('apiKey', 'secret')
        .var('debug', false)
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.vars).toEqual({
        env: 'prod',
        region: 'us-east-1',
        apiKey: 'secret',
        debug: false
      });
    });

    it('should merge variables', () => {
      const built = recipe('test')
        .vars({ a: 1, b: 2 })
        .vars({ b: 3, c: 4 })
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.vars).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should set required vars', () => {
      const built = recipe('test')
        .requires('API_KEY', 'API_SECRET')
        .requires('REGION')
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.requiredVars).toEqual(['API_KEY', 'API_SECRET', 'REGION']);
    });

    it('should set schema', () => {
      const schema = {
        type: 'object',
        properties: {
          apiKey: { type: 'string' }
        },
        required: ['apiKey']
      };
      
      const built = recipe('test')
        .schema(schema)
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.varsSchema).toEqual(schema);
    });

    it('should add tasks using task() method', () => {
      const task1 = task('t1', async () => ({ result: 1 })).build();
      const task2Builder = task('t2', async () => ({ result: 2 }));
      
      const built = recipe('test')
        .task(task1)
        .task(task2Builder)
        .build();
      
      expect(built.tasks).toHaveLength(2);
      expect(built.tasks[0].id).toBe('t1');
      expect(built.tasks[1].id).toBe('t2');
    });

    it('should add multiple tasks using tasks() method', () => {
      const task1 = task('t1', async () => ({})).build();
      const task2 = task('t2', async () => ({})).build();
      const task3Builder = task('t3', async () => ({}));
      
      const built = recipe('test')
        .tasks(task1, task2, task3Builder)
        .build();
      
      expect(built.tasks).toHaveLength(3);
    });

    it('should add task using addTask() method', () => {
      const built = recipe('test')
        .addTask('custom-task', builder => 
          builder
            .description('Custom task')
            .handler(async () => ({ custom: true }))
            .timeout(5000)
        )
        .build();
      
      expect(built.tasks).toHaveLength(1);
      expect(built.tasks[0].id).toBe('custom-task');
      expect(built.tasks[0].description).toBe('Custom task');
      expect(built.tasks[0].timeout).toBe(5000);
    });

    it('should add modules', () => {
      const module1: Module = {
        name: 'module1',
        exports: {}
      };
      const module2: Module = {
        name: 'module2',
        version: '1.0.0',
        exports: {}
      };
      
      const built = recipe('test')
        .module(module1)
        .modules(module2)
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.modules).toHaveLength(2);
      expect(built.modules[0].name).toBe('module1');
      expect(built.modules[1].name).toBe('module2');
    });

    it('should set hosts', () => {
      const built = recipe('test')
        .hosts('web1', 'web2')
        .hosts('db1')
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.hosts).toEqual(['web1', 'web2', 'db1']);
    });

    it('should set parallel and continueOnError flags', () => {
      const built = recipe('test')
        .parallel()
        .continueOnError()
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.parallel).toBe(true);
      expect(built.continueOnError).toBe(true);
      
      const built2 = recipe('test2')
        .parallel(false)
        .continueOnError(false)
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built2.parallel).toBe(false);
      expect(built2.continueOnError).toBe(false);
    });

    it('should set timeout', () => {
      const built = recipe('test')
        .timeout(60000)
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.timeout).toBe(60000);
    });

    it('should set hooks', () => {
      const beforeAll = vi.fn();
      const afterAll = vi.fn();
      const beforeEach = vi.fn();
      const afterEach = vi.fn();
      const onError = vi.fn();
      
      const built = recipe('test')
        .beforeAll(beforeAll)
        .afterAll(afterAll)
        .beforeEach(beforeEach)
        .afterEach(afterEach)
        .onError(onError)
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.hooks.beforeAll).toBe(beforeAll);
      expect(built.hooks.afterAll).toBe(afterAll);
      expect(built.hooks.beforeEach).toBe(beforeEach);
      expect(built.hooks.afterEach).toBe(afterEach);
      expect(built.hooks.onError).toBe(onError);
    });

    it('should set meta data', () => {
      const built = recipe('test')
        .meta('priority', 'high')
        .meta({ team: 'platform', environment: 'prod' })
        .task(task('t1', async () => ({})))
        .build();
      
      expect(built.meta).toEqual({
        priority: 'high',
        team: 'platform',
        environment: 'prod'
      });
    });
  });

  describe('validation', () => {
    it('should throw if no tasks are added', () => {
      expect(() => {
        recipe('test').build();
      }).toThrow('Recipe must have at least one task');
    });

    it('should throw if id is not set', () => {
      const builder = new RecipeBuilder('');
      expect(() => {
        builder.task(task('t1', async () => ({}))).build();
      }).toThrow('Recipe must have an id');
    });

    it('should throw for duplicate task ids', () => {
      expect(() => {
        recipe('test')
          .task(task('duplicate', async () => ({})))
          .task(task('duplicate', async () => ({})))
          .build();
      }).toThrow('Duplicate task id: duplicate');
    });

    it('should throw for duplicate module names', () => {
      const module1: Module = { name: 'dup', exports: {} };
      const module2: Module = { name: 'dup', exports: {} };
      
      expect(() => {
        recipe('test')
          .modules(module1, module2)
          .task(task('t1', async () => ({})))
          .build();
      }).toThrow('Duplicate module name: dup');
    });

    it('should throw for invalid timeout', () => {
      expect(() => {
        recipe('test')
          .timeout(0)
          .task(task('t1', async () => ({})));
      }).toThrow(ValidationError);
    });

    it('should throw if requiredVars not in schema', () => {
      const schema = {
        type: 'object',
        properties: {
          foo: { type: 'string' }
        },
        required: ['foo']
      };
      
      expect(() => {
        recipe('test')
          .schema(schema)
          .requires('foo', 'bar')
          .task(task('t1', async () => ({})))
          .build();
      }).toThrow('Required vars not defined in schema: bar');
    });
  });

  describe('dependency validation', () => {
    it('should validate task dependencies', () => {
      const task1 = task('t1', async () => ({})).build();
      const task2 = task('t2', async () => ({})).depends('t1').build();
      const task3 = task('t3', async () => ({})).depends('t2').build();
      
      expect(() => {
        recipe('test')
          .tasks(task1, task2, task3)
          .build();
      }).not.toThrow();
    });

    it('should throw for non-existent dependencies', () => {
      const task1 = task('t1', async () => ({})).depends('missing').build();
      
      expect(() => {
        recipe('test')
          .task(task1)
          .build();
      }).toThrow(DependencyError);
    });

    it('should detect circular dependencies', () => {
      const task1 = task('t1', async () => ({})).depends('t3').build();
      const task2 = task('t2', async () => ({})).depends('t1').build();
      const task3 = task('t3', async () => ({})).depends('t2').build();
      
      expect(() => {
        recipe('test')
          .tasks(task1, task2, task3)
          .build();
      }).toThrow('Circular dependency detected');
    });

    it('should detect self-dependencies', () => {
      expect(() => {
        const task1 = task('t1', async () => ({})).depends('t1').build();
      }).toThrow('Task cannot depend on itself');
    });

    it('should handle complex dependency graphs', () => {
      const t1 = task('t1', async () => ({})).build();
      const t2 = task('t2', async () => ({})).depends('t1').build();
      const t3 = task('t3', async () => ({})).depends('t1').build();
      const t4 = task('t4', async () => ({})).depends('t2', 't3').build();
      const t5 = task('t5', async () => ({})).depends('t4').build();
      
      expect(() => {
        recipe('test')
          .tasks(t1, t2, t3, t4, t5)
          .build();
      }).not.toThrow();
    });
  });
});

describe('recipe helper function', () => {
  it('should create RecipeBuilder', () => {
    const builder = recipe('test-recipe');
    expect(builder).toBeInstanceOf(RecipeBuilder);
  });
});

describe('simpleRecipe', () => {
  it('should create a simple recipe with tasks', () => {
    const task1 = task('t1', async () => ({ result: 1 }));
    const task2 = task('t2', async () => ({ result: 2 }));
    
    const built = simpleRecipe('simple', [task1, task2]);
    
    expect(built.id).toBe('simple');
    expect(built.name).toBe('simple');
    expect(built.tasks).toHaveLength(2);
  });

  it('should accept options', () => {
    const task1 = task('t1', async () => ({})).build();
    
    const built = simpleRecipe('simple', [task1], {
      name: 'Simple Recipe',
      description: 'A simple recipe',
      vars: { env: 'test' },
      parallel: true
    });
    
    expect(built.name).toBe('Simple Recipe');
    expect(built.description).toBe('A simple recipe');
    expect(built.vars).toEqual({ env: 'test' });
    expect(built.parallel).toBe(true);
  });

  it('should work with TaskBuilder instances', () => {
    const task1 = task('t1', async () => ({}));
    const task2 = task('t2', async () => ({})).build();
    
    const built = simpleRecipe('simple', [task1, task2]);
    
    expect(built.tasks).toHaveLength(2);
  });
});

describe('phaseRecipe', () => {
  it('should create a recipe with phases', () => {
    const setupTasks = [
      task('init', async () => ({})),
      task('config', async () => ({}))
    ];
    
    const deployTasks = [
      task('build', async () => ({})),
      task('deploy', async () => ({}))
    ];
    
    const built = phaseRecipe('phased', {
      setup: setupTasks,
      deploy: deployTasks
    });
    
    expect(built.id).toBe('phased');
    expect(built.tasks).toHaveLength(4);
    
    // Check phase assignments
    expect(built.tasks[0].phase).toBe('setup');
    expect(built.tasks[1].phase).toBe('setup');
    expect(built.tasks[2].phase).toBe('deploy');
    expect(built.tasks[3].phase).toBe('deploy');
  });

  it('should set dependencies between phases', () => {
    const phase1 = [
      task('t1', async () => ({})),
      task('t2', async () => ({}))
    ];
    
    const phase2 = [
      task('t3', async () => ({})),
      task('t4', async () => ({}))
    ];
    
    const phase3 = [
      task('t5', async () => ({}))
    ];
    
    const built = phaseRecipe('phased', {
      first: phase1,
      second: phase2,
      third: phase3
    });
    
    // Tasks in second phase should depend on all tasks from first phase
    expect(built.tasks[2].depends).toContain('t1');
    expect(built.tasks[2].depends).toContain('t2');
    expect(built.tasks[3].depends).toContain('t1');
    expect(built.tasks[3].depends).toContain('t2');
    
    // Tasks in third phase should depend on all tasks from second phase
    expect(built.tasks[4].depends).toContain('t3');
    expect(built.tasks[4].depends).toContain('t4');
  });

  it('should preserve existing dependencies', () => {
    const phase1 = [
      task('t1', async () => ({}))
    ];
    
    const phase2 = [
      task('external', async () => ({})),
      task('t2', async () => ({})).depends('external')
    ];
    
    const built = phaseRecipe('phased', {
      first: phase1,
      second: phase2
    });
    
    // Should have both existing and phase dependencies
    const t2Task = built.tasks.find(t => t.id === 't2');
    expect(t2Task?.depends).toContain('external');
    expect(t2Task?.depends).toContain('t1');
  });

  it('should accept options', () => {
    const phase1 = [task('t1', async () => ({}))];
    
    const built = phaseRecipe('phased', { setup: phase1 }, {
      name: 'Phased Recipe',
      description: 'Multi-phase deployment',
      vars: { region: 'us-west-2' }
    });
    
    expect(built.name).toBe('Phased Recipe');
    expect(built.description).toBe('Multi-phase deployment');
    expect(built.vars).toEqual({ region: 'us-west-2' });
  });
});

describe('moduleRecipe', () => {
  it('should create a recipe with modules', () => {
    const module1: Module = {
      name: 'aws-module',
      version: '1.0.0',
      exports: {
        tasks: {
          deploy: async () => ({ deployed: true })
        }
      }
    };
    
    const module2: Module = {
      name: 'monitoring-module',
      exports: {}
    };
    
    const built = moduleRecipe('modular', [module1, module2]);
    
    expect(built.id).toBe('modular');
    expect(built.modules).toHaveLength(2);
    expect(built.modules[0].name).toBe('aws-module');
    expect(built.modules[1].name).toBe('monitoring-module');
  });

  it('should add initialization task', () => {
    const module1: Module = { name: 'test-module', exports: {} };
    
    const built = moduleRecipe('modular', [module1]);
    
    expect(built.tasks).toHaveLength(1);
    expect(built.tasks[0].id).toBe('init-modules');
    expect(built.tasks[0].description).toBe('Initialize modules');
  });

  it('should accept options', () => {
    const module1: Module = { name: 'test', exports: {} };
    
    const built = moduleRecipe('modular', [module1], {
      name: 'Modular Recipe',
      description: 'Recipe with modules',
      vars: { debug: true }
    });
    
    expect(built.name).toBe('Modular Recipe');
    expect(built.description).toBe('Recipe with modules');
    expect(built.vars).toEqual({ debug: true });
  });
});

describe('complex recipe compositions', () => {
  it('should build a complex recipe with all features', () => {
    const beforeAllHook = vi.fn();
    const onErrorHook = vi.fn();
    
    const module1: Module = {
      name: 'custom-module',
      exports: {}
    };
    
    const complexRecipe = recipe('complex')
      .name('Complex Recipe')
      .description('A recipe with all features')
      .version('2.1.0')
      .author('Test Author')
      .tags('production', 'critical')
      .vars({ environment: 'prod', region: 'us-east-1' })
      .var('debug', false)
      .requires('API_KEY', 'DATABASE_URL')
      .schema({
        type: 'object',
        properties: {
          API_KEY: { type: 'string' },
          DATABASE_URL: { type: 'string', format: 'uri' }
        },
        required: ['API_KEY', 'DATABASE_URL']
      })
      .module(module1)
      .hosts('web1', 'web2', 'db1')
      .parallel(true)
      .continueOnError(false)
      .timeout(300000)
      .beforeAll(beforeAllHook)
      .onError(onErrorHook)
      .meta('team', 'platform')
      .meta({ priority: 'high', sla: '99.9%' })
      .addTask('setup', builder => 
        builder
          .description('Setup environment')
          .handler(async () => ({ setup: true }))
          .phase('initialization')
      )
      .addTask('deploy', builder =>
        builder
          .description('Deploy application')
          .handler(async () => ({ deployed: true }))
          .depends('setup')
          .phase('deployment')
      )
      .addTask('verify', builder =>
        builder
          .description('Verify deployment')
          .handler(async () => ({ verified: true }))
          .depends('deploy')
          .phase('verification')
      )
      .build();
    
    // Verify all properties
    expect(complexRecipe.id).toBe('complex');
    expect(complexRecipe.name).toBe('Complex Recipe');
    expect(complexRecipe.description).toBe('A recipe with all features');
    expect(complexRecipe.version).toBe('2.1.0');
    expect(complexRecipe.author).toBe('Test Author');
    expect(complexRecipe.tags).toEqual(['production', 'critical']);
    expect(complexRecipe.vars).toEqual({
      environment: 'prod',
      region: 'us-east-1',
      debug: false
    });
    expect(complexRecipe.requiredVars).toEqual(['API_KEY', 'DATABASE_URL']);
    expect(complexRecipe.varsSchema).toBeDefined();
    expect(complexRecipe.modules).toHaveLength(1);
    expect(complexRecipe.hosts).toEqual(['web1', 'web2', 'db1']);
    expect(complexRecipe.parallel).toBe(true);
    expect(complexRecipe.continueOnError).toBe(false);
    expect(complexRecipe.timeout).toBe(300000);
    expect(complexRecipe.hooks.beforeAll).toBe(beforeAllHook);
    expect(complexRecipe.hooks.onError).toBe(onErrorHook);
    expect(complexRecipe.meta).toEqual({
      team: 'platform',
      priority: 'high',
      sla: '99.9%'
    });
    expect(complexRecipe.tasks).toHaveLength(3);
    
    // Verify task order and dependencies
    expect(complexRecipe.tasks[0].id).toBe('setup');
    expect(complexRecipe.tasks[1].id).toBe('deploy');
    expect(complexRecipe.tasks[1].depends).toContain('setup');
    expect(complexRecipe.tasks[2].id).toBe('verify');
    expect(complexRecipe.tasks[2].depends).toContain('deploy');
  });
});