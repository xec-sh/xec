# 04. Xec Core Core Concepts

## Overview

Xec Core is built on several key concepts that work together to create a powerful and flexible automation system. Understanding these concepts is critical for effective use of the framework.

## 1. Task

### Definition
**Task** is an atomic unit of work in Xec. Each task represents a single action or a set of related actions.

### Structure
```typescript
interface Task {
  id: string;
  name: string;
  description?: string;
  handler: TaskHandler;
  options: TaskOptions;
  dependencies: string[];
  tags: string[];
}

type TaskHandler = (context: TaskContext) => Promise<any>;
```

### Creating Tasks
```typescript
// Simple task
const simpleTask = task('install-nginx')
  .description('Install Nginx web server')
  .run(async ({ $ }) => {
    await $`apt-get update`;
    await $`apt-get install -y nginx`;
  })
  .build();

// Task with options
const complexTask = task('deploy-app')
  .description('Deploy application')
  .vars({
    version: { type: 'string', required: true }
  })
  .retry({ attempts: 3, delay: 5000 })
  .timeout(300000) // 5 minutes
  .when(ctx => ctx.vars.environment === 'production')
  .run(async ({ $, vars }) => {
    await $`docker pull myapp:${vars.version}`;
    await $`docker stop myapp || true`;
    await $`docker run -d --name myapp myapp:${vars.version}`;
  })
  .build();
```

### Task Lifecycle
1. **Validation** - input parameter validation
2. **Condition Check** - execution condition check
3. **Execution** - handler execution
4. **Retry** - retry attempts on error
5. **Completion** - completion and result saving

## 2. Recipe

### Definition
**Recipe** is a collection of tasks organized to achieve a specific goal. Recipes can include dependencies, phases, and hooks.

### Structure
```typescript
interface Recipe {
  id: string;
  name: string;
  description?: string;
  version: string;
  tasks: Map<string, Task>;
  phases: Map<string, Phase>;
  vars: Variables;
  hooks: RecipeHooks;
}
```

### Creating Recipes
```typescript
// Simple recipe
const deployRecipe = recipe('deploy')
  .description('Deploy application to production')
  .version('1.0.0')
  .vars({
    app: { type: 'string', required: true },
    version: { type: 'string', required: true }
  })
  .task('backup', backupTask)
  .task('deploy', deployTask)
  .task('verify', verifyTask)
  .build();

// Recipe with phases
const complexRecipe = recipe('full-deployment')
  .phase('prepare', phase()
    .description('Preparation phase')
    .parallel()
    .task('check-deps', checkDependencies)
    .task('backup-db', backupDatabase)
  )
  .phase('deploy', phase()
    .description('Deployment phase')
    .sequential()
    .task('stop-services', stopServices)
    .task('update-code', updateCode)
    .task('start-services', startServices)
  )
  .phase('verify', phase()
    .description('Verification phase')
    .task('health-check', healthCheck)
    .task('smoke-tests', smokeTests)
  )
  .build();
```

### Recipe Hooks
```typescript
recipe('monitored-deploy')
  .before(async (ctx) => {
    await notifySlack('Deployment starting...');
  })
  .after(async (ctx, result) => {
    await notifySlack(`Deployment completed: ${result.status}`);
  })
  .onError(async (ctx, error) => {
    await notifySlack(`Deployment failed: ${error.message}`);
    await createIncident(error);
  })
  .finally(async (ctx) => {
    await cleanupTempFiles();
  });
```

## 3. Context

### Definition
**Context** provides the execution environment for tasks, including variables, hosts, logging, and other services.

### Context Types

#### TaskContext
Basic context for task execution:
```typescript
interface TaskContext {
  taskId: string;
  vars: Record<string, any>;    // Local variables
  host?: Host;                  // Current host
  logger: Logger;                // Logger
  attempt: number;               // Attempt number
  $: ExecutionEngine;           // Command execution engine
}
```

#### ExecutionContext
Extended context for recipes:
```typescript
interface ExecutionContext extends TaskContext {
  recipeId: string;
  runId: string;
  globalVars: Record<string, any>;
  secrets: Record<string, any>;
  state: StateManager;
  dryRun: boolean;
  verbose: boolean;
}
```

### Using Context
```typescript
task('example')
  .run(async (ctx) => {
    // Access variables
    const appName = ctx.vars.app_name;
    
    // Logging
    ctx.logger.info(`Deploying ${appName}`);
    
    // Execute commands
    await ctx.$`docker pull ${appName}:latest`;
    
    // Work with state (via global functions)
    setState('last_deploy', Date.now());
    const lastDeploy = getState('last_deploy');
    
    // Conditional execution
    if (isDryRun()) {
      ctx.logger.info('DRY RUN: Would deploy here');
      return;
    }
  });
```

## 4. Module

### Definition
**Module** is a collection of related tasks, patterns, and utilities packaged for reuse.

### Module Structure
```typescript
interface Module {
  name: string;
  version: string;
  description?: string;
  exports: ModuleExports;
  dependencies?: string[];
  setup?: (ctx: SetupContext) => Promise<void>;
  teardown?: (ctx: TeardownContext) => Promise<void>;
}

interface ModuleExports {
  tasks?: Record<string, Task>;
  recipes?: Record<string, Recipe>;
  helpers?: Record<string, Helper>;
  patterns?: Record<string, Pattern>;
}
```

### Creating Modules
```typescript
// Module definition
export const nginxModule: Module = {
  name: 'nginx',
  version: '1.0.0',
  description: 'Nginx management module',
  
  exports: {
    tasks: {
      install: task('nginx-install')
        .run(async ({ $ }) => {
          await $`apt-get update`;
          await $`apt-get install -y nginx`;
        })
        .build(),
        
      configure: task('nginx-configure')
        .vars({
          config: { type: 'object', required: true }
        })
        .run(async ({ $, vars }) => {
          const config = generateNginxConfig(vars.config);
          await $`echo '${config}' > /etc/nginx/sites-available/default`;
          await $`nginx -t`;
          await $`systemctl reload nginx`;
        })
        .build(),
    },
    
    recipes: {
      setup: recipe('nginx-setup')
        .task('install', 'nginx.install')
        .task('configure', 'nginx.configure')
        .task('start', task()
          .run(async ({ $ }) => {
            await $`systemctl start nginx`;
            await $`systemctl enable nginx`;
          })
        )
        .build()
    },
    
    helpers: {
      isInstalled: async () => {
        try {
          await $`which nginx`;
          return true;
        } catch {
          return false;
        }
      }
    }
  }
};

// Using the module
const xec = new Xec();
xec.registerModule(nginxModule);

await xec.runTask('nginx.install');
await xec.runRecipe('nginx.setup', {
  vars: {
    config: { server_name: 'example.com' }
  }
});
```

## 5. Pattern

### Definition
**Pattern** is a high-level abstraction for implementing common deployment strategies and workflows.

### Built-in Patterns

#### Blue-Green Deployment
```typescript
const blueGreen = new BlueGreenPattern({
  service: 'web-app',
  
  deploy: async ({ color, hosts }) => {
    // Deploy to specified color
    await deployToHosts(hosts, { tag: color });
  },
  
  healthCheck: async ({ color, hosts }) => {
    // Health check
    for (const host of hosts) {
      const ok = await checkHealth(host);
      if (!ok) return false;
    }
    return true;
  },
  
  switch: async ({ from, to }) => {
    // Traffic switching
    await updateLoadBalancer({ active: to });
  }
});

await blueGreen.execute();
```

#### Canary Deployment
```typescript
const canary = new CanaryPattern({
  service: 'api',
  version: '2.0.0',
  
  stages: [
    { traffic: 10, duration: '5m' },
    { traffic: 50, duration: '10m' },
    { traffic: 100 }
  ],
  
  deploy: async ({ version, replicas }) => {
    await scaleDeployment(`api-${version}`, replicas);
  },
  
  adjustTraffic: async ({ percentage }) => {
    await setTrafficWeight('api-canary', percentage);
  },
  
  validate: async ({ metrics }) => {
    return metrics.errorRate < 0.01 && metrics.latency < 200;
  }
});

await canary.execute();
```

## 6. State Management

### Definition
The state management system provides a way to save and retrieve data between task executions.

### Local State
```typescript
// Within recipe execution
task('save-state')
  .run(async (ctx) => {
    setState('deployment_id', generateId());
    setState('start_time', Date.now());
  });

task('use-state')
  .run(async (ctx) => {
    const deploymentId = getState('deployment_id');
    const duration = Date.now() - getState('start_time');
    ctx.logger.info(`Deployment ${deploymentId} took ${duration}ms`);
  });
```

### Persistent State
```typescript
// State persisted between runs
const stateManager = new StateManager({
  backend: 'sqlite',
  path: './xec.state.db'
});

await stateManager.set('last_successful_deploy', {
  version: '2.0.0',
  timestamp: Date.now(),
  commit: 'abc123'
});

const lastDeploy = await stateManager.get('last_successful_deploy');
```

## 7. Host Management

### Definition
The host management system allows defining and grouping target machines for task execution.

### Inventory
```typescript
interface Host {
  id: string;
  name: string;
  address: string;
  port?: number;
  username?: string;
  privateKey?: string;
  tags: string[];
  vars: Record<string, any>;
}

// Static definition
const inventory = new Inventory([
  {
    name: 'web1',
    address: '10.0.1.1',
    tags: ['web', 'prod'],
    vars: { datacenter: 'us-east' }
  },
  {
    name: 'web2', 
    address: '10.0.1.2',
    tags: ['web', 'prod'],
    vars: { datacenter: 'us-west' }
  }
]);

// Dynamic discovery
const awsInventory = new AWSInventoryProvider({
  region: 'us-east-1',
  filters: {
    'tag:Environment': 'production',
    'instance-state': 'running'
  }
});

inventory.addProvider(awsInventory);
```

### Host Selectors
```typescript
// Execute on specific host
recipe('deploy')
  .task('web1-only', task()
    .host('web1')
    .run(async ({ $ }) => {
      await $`systemctl restart nginx`;
    })
  );

// Execute on host group
recipe('deploy')
  .task('all-web', task()
    .hosts(host => host.tags.includes('web'))
    .parallel()
    .run(async ({ $, host }) => {
      ctx.logger.info(`Deploying to ${host.name}`);
      await $`docker pull myapp:latest`;
    })
  );
```

## 8. Execution Engine

### Definition
**Execution Engine** (based on ush) provides a unified interface for executing commands locally, via SSH, or in containers.

### Capabilities
```typescript
// Local execution
await $`ls -la`;

// SSH execution
const ssh = $.ssh({
  host: '10.0.1.1',
  username: 'deploy'
});
await ssh`ls -la`;

// Docker execution
const docker = $.docker({
  container: 'myapp'
});
await docker`ps aux`;

// Stream processing
const logs = await $`tail -f /var/log/app.log`;
logs.stdout.on('data', (chunk) => {
  console.log(chunk.toString());
});

// Pipes
await $`cat file.txt | grep ERROR | wc -l`;

// Interactive mode
const name = await $.question('Enter your name:');
const proceed = await $.confirm('Continue?');
```

## 9. Variables and Templating

### Variables
Variables can be defined at different levels:

```typescript
// Global variables
const xec = new Xec({
  vars: {
    environment: 'production',
    region: 'us-east-1'
  }
});

// Recipe variables
recipe('deploy')
  .vars({
    version: { type: 'string', required: true },
    replicas: { type: 'number', default: 3 }
  });

// Task variables
task('example')
  .vars({
    timeout: { type: 'number', default: 30 }
  });

// Runtime variables
await recipe.execute({
  vars: {
    version: '2.0.0',
    replicas: 5
  }
});
```

### Templating
```typescript
// In commands
await $`echo "Deploying {{app_name}} version {{version}}"`;

// In files
task('configure')
  .run(async ({ template }) => {
    await template.render('nginx.conf.j2', '/etc/nginx/nginx.conf', {
      server_name: 'example.com',
      port: 8080
    });
  });
```

## 10. Error Handling

### Error Handling Strategies
```typescript
// Retry strategy
task('flaky-task')
  .retry({
    attempts: 3,
    delay: 1000,
    backoff: 'exponential'
  });

// Ignore errors
task('optional-task')
  .ignoreErrors();

// Custom error handling
task('critical-task')
  .onError(async (error, ctx) => {
    await notifyOncall(error);
    if (error.code === 'CRITICAL') {
      throw error; // Re-throw to stop execution
    }
    // Otherwise continue
  });

// Try-catch in handler
task('safe-task')
  .run(async ({ $ }) => {
    try {
      await $`risky-command`;
    } catch (error) {
      ctx.logger.warn(`Command failed: ${error.message}`);
      // Fallback logic
      await $`safe-alternative`;
    }
  });
```

## Conclusion

These core concepts form the foundation of Xec Core. Understanding how they work and interact with each other will allow you to create powerful and reliable automations.

Key takeaways:
- **Tasks** - basic building blocks
- **Recipes** - organize tasks into logical groups
- **Context** - provides execution environment
- **Modules** - enable reuse
- **Patterns** - implement high-level strategies
- **State** - persists data between executions
- **Hosts** - define execution targets
- **Engine** - abstracts command execution

Next, it's recommended to study the [Technical Specification](05-TECHNICAL-SPECIFICATION.md) for a deep understanding of the architecture.