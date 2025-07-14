# 08. Module System

## Overview

Xec Core's module system provides extensibility, code reuse, and integration with the npm ecosystem. Modules allow encapsulating related functionality and distributing it as independent packages.

## Module System Concepts

### 1. What is a Module?

A module in Xec Core is a collection of related components:
- **Tasks** - reusable tasks
- **Recipes** - ready-made recipes
- **Helpers** - utility functions
- **Patterns** - deployment patterns
- **Integrations** - integrations with external systems

### 2. Module Benefits

- **Encapsulation** - grouping related functionality
- **Reuse** - write once, use everywhere
- **Versioning** - semantic versioning through npm
- **Distribution** - publish to npm registry
- **Isolation** - modules don't conflict with each other

## Module Structure

### Basic Structure

```typescript
interface Module {
  // Metadata
  name: string;                    // Unique module name
  version: string;                 // Version (semver)
  description?: string;            // Module description
  author?: string;                 // Author
  license?: string;                // License
  
  // Exports
  exports: ModuleExports;          // Exported components
  
  // Dependencies
  dependencies?: string[];         // Dependencies on other modules
  peerDependencies?: string[];     // Peer dependencies
  
  // Lifecycle hooks
  setup?: SetupFunction;           // Module initialization
  teardown?: TeardownFunction;     // Resource cleanup
  
  // Configuration
  config?: ModuleConfig;           // Configuration schema
  defaults?: any;                  // Default values
}

interface ModuleExports {
  tasks?: Record<string, Task>;
  recipes?: Record<string, Recipe>;
  helpers?: Record<string, Helper>;
  patterns?: Record<string, Pattern>;
  integrations?: Record<string, Integration>;
}
```

### File Structure

```
my-xec-module/
├── package.json           # npm metadata
├── README.md             # Documentation
├── LICENSE               # License
├── src/
│   ├── index.ts         # Main export
│   ├── tasks/           # Task definitions
│   ├── recipes/         # Recipes
│   ├── helpers/         # Utility functions
│   ├── patterns/        # Patterns
│   └── integrations/    # Integrations
├── test/                # Tests
├── examples/            # Usage examples
└── docs/                # Additional documentation
```

## Creating a Module

### 1. Simple Module

```typescript
// src/index.ts
import { Module, task, recipe } from '@xec/core';

export const nginxModule: Module = {
  name: 'nginx',
  version: '1.0.0',
  description: 'Nginx management module for Xec',
  
  exports: {
    tasks: {
      install: task('nginx-install')
        .description('Install Nginx web server')
        .run(async ({ $ }) => {
          await $`apt-get update`;
          await $`apt-get install -y nginx`;
        })
        .build(),
        
      start: task('nginx-start')
        .description('Start Nginx service')
        .run(async ({ $ }) => {
          await $`systemctl start nginx`;
          await $`systemctl enable nginx`;
        })
        .build(),
        
      stop: task('nginx-stop')
        .description('Stop Nginx service')
        .run(async ({ $ }) => {
          await $`systemctl stop nginx`;
        })
        .build(),
        
      configure: task('nginx-configure')
        .description('Configure Nginx')
        .vars({
          config: { type: 'object', required: true }
        })
        .run(async ({ $, vars, template }) => {
          const configContent = await template('nginx.conf.j2', vars.config);
          await $`echo '${configContent}' > /etc/nginx/nginx.conf`;
          await $`nginx -t`;
          await $`systemctl reload nginx`;
        })
        .build()
    },
    
    recipes: {
      setup: recipe('nginx-setup')
        .description('Complete Nginx setup')
        .task('install', 'nginx.install')
        .task('configure', 'nginx.configure')
        .task('start', 'nginx.start')
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
      },
      
      getVersion: async () => {
        const result = await $`nginx -v 2>&1`;
        return result.stderr.match(/nginx\/([\d.]+)/)?.[1];
      }
    }
  }
};

export default nginxModule;
```

### 2. Module with Configuration

```typescript
export const databaseModule: Module = {
  name: 'database',
  version: '2.0.0',
  description: 'Database management module',
  
  // Configuration schema
  config: {
    type: 'object',
    properties: {
      engine: {
        type: 'string',
        enum: ['postgres', 'mysql', 'mongodb'],
        default: 'postgres'
      },
      version: {
        type: 'string',
        default: 'latest'
      },
      port: {
        type: 'number',
        default: 5432
      },
      dataDir: {
        type: 'string',
        default: '/var/lib/postgresql/data'
      }
    }
  },
  
  // Default values
  defaults: {
    engine: 'postgres',
    version: '14',
    port: 5432
  },
  
  // Module initialization
  setup: async (ctx) => {
    const config = ctx.config || {};
    
    // Configuration validation
    if (!['postgres', 'mysql', 'mongodb'].includes(config.engine)) {
      throw new Error(`Unsupported database engine: ${config.engine}`);
    }
    
    // Register global helpers
    registerHelper('db', {
      connect: () => createConnection(config),
      query: (sql: string) => executeQuery(sql)
    });
    
    ctx.logger.info(`Database module initialized with ${config.engine}`);
  },
  
  exports: {
    tasks: {
      install: task('db-install')
        .description('Install database server')
        .run(async ({ $ }, config) => {
          switch (config.engine) {
            case 'postgres':
              await $`apt-get install -y postgresql-${config.version}`;
              break;
            case 'mysql':
              await $`apt-get install -y mysql-server-${config.version}`;
              break;
            case 'mongodb':
              await $`apt-get install -y mongodb-org=${config.version}`;
              break;
          }
        })
        .build(),
        
      createDatabase: task('db-create')
        .vars({
          name: { type: 'string', required: true },
          owner: { type: 'string' }
        })
        .run(async ({ $, vars }, config) => {
          switch (config.engine) {
            case 'postgres':
              await $`sudo -u postgres createdb ${vars.name}`;
              if (vars.owner) {
                await $`sudo -u postgres psql -c "ALTER DATABASE ${vars.name} OWNER TO ${vars.owner}"`;
              }
              break;
            // ... other engines
          }
        })
        .build()
    }
  }
};
```

### 3. Module with Dependencies

```typescript
export const appModule: Module = {
  name: 'app-deployment',
  version: '1.0.0',
  
  // Dependencies on other modules
  dependencies: [
    'nginx@^1.0.0',
    'database@^2.0.0',
    'monitoring@^1.2.0'
  ],
  
  // Peer dependencies (must be installed by the user)
  peerDependencies: [
    '@xec/core@^2.0.0'
  ],
  
  exports: {
    recipes: {
      deploy: recipe('app-deploy')
        .description('Deploy application with dependencies')
        
        // Use tasks from dependent modules
        .task('setup-nginx', 'nginx.setup')
        .task('setup-db', 'database.setup')
        .task('setup-monitoring', 'monitoring.setup')
        
        // Own tasks
        .task('deploy-app', task()
          .run(async ({ $ }) => {
            await $`git pull`;
            await $`npm install`;
            await $`npm run build`;
            await $`pm2 restart app`;
          })
        )
        .build()
    }
  }
};
```

### 4. Module with Patterns

```typescript
export const deploymentPatternsModule: Module = {
  name: 'deployment-patterns',
  version: '1.0.0',
  
  exports: {
    patterns: {
      blueGreen: {
        name: 'blue-green',
        description: 'Blue-Green deployment pattern',
        
        create: (options: BlueGreenOptions) => {
          return new BlueGreenPattern({
            ...options,
            beforeSwitch: async ({ from, to }) => {
              console.log(`Switching from ${from} to ${to}`);
              await validateHealthChecks(to);
            }
          });
        }
      },
      
      canary: {
        name: 'canary',
        description: 'Canary deployment pattern',
        
        create: (options: CanaryOptions) => {
          return new CanaryPattern({
            ...options,
            stages: options.stages || [
              { traffic: 10, duration: 300000 },
              { traffic: 50, duration: 600000 },
              { traffic: 100 }
            ]
          });
        }
      }
    }
  }
};
```

## Using Modules

### 1. Installing a Module

```bash
# From npm registry
npm install @xec-community/nginx

# From git repository
npm install git+https://github.com/user/xec-nginx-module.git

# Local module
npm install file:../my-local-module
```

### 2. Registering a Module

```typescript
import { Xec } from '@xec/core';
import nginxModule from '@xec-community/nginx';
import dbModule from '@xec-community/database';

// When creating Xec instance
const xec = new Xec({
  modules: [nginxModule, dbModule]
});

// Or dynamically
xec.registerModule(nginxModule);

// With configuration
xec.registerModule(dbModule, {
  engine: 'postgres',
  version: '14',
  port: 5432
});
```

### 3. Using in Recipes

```typescript
// Direct use of tasks from a module
recipe('setup')
  .use(nginxModule) // Connect module
  .task('install-nginx', 'nginx.install')
  .task('configure-nginx', 'nginx.configure')
  .build();

// Using through namespace
recipe('advanced')
  .use(nginxModule)
  .task('custom', task()
    .run(async ({ modules }) => {
      // Access to module's helpers
      const installed = await modules.nginx.helpers.isInstalled();
      if (!installed) {
        await modules.nginx.tasks.install.run();
      }
      
      // Using tasks
      await modules.nginx.tasks.configure.run({
        vars: { 
          config: { server_name: 'example.com' }
        }
      });
    })
  )
  .build();
```

### 4. Overriding Module Components

```typescript
const xec = new Xec();

// Register module
xec.registerModule(nginxModule);

// Override task
xec.override('nginx', 'install', task()
  .description('Custom Nginx installation')
  .run(async ({ $ }) => {
    // Add additional repository
    await $`add-apt-repository ppa:nginx/stable`;
    await $`apt-get update`;
    await $`apt-get install -y nginx`;
  })
  .build()
);
```

## Module Registry

### 1. Local Registry

```typescript
class ModuleRegistry {
  private modules = new Map<string, Module>();
  private configs = new Map<string, any>();
  
  register(module: Module, config?: any): void {
    // Validate module
    this.validate(module);
    
    // Check dependencies
    this.checkDependencies(module);
    
    // Register
    this.modules.set(module.name, module);
    
    // Save configuration
    if (config) {
      this.configs.set(module.name, config);
    }
    
    // Initialization
    if (module.setup) {
      module.setup({
        config,
        logger: this.logger,
        registry: this
      });
    }
  }
  
  get(name: string): Module | undefined {
    return this.modules.get(name);
  }
  
  resolve(path: string): any {
    // Parse path: module.type.name
    const [moduleName, type, ...rest] = path.split('.');
    const module = this.get(moduleName);
    
    if (!module) {
      throw new Error(`Module not found: ${moduleName}`);
    }
    
    // Navigate exports
    let current: any = module.exports;
    for (const segment of [type, ...rest]) {
      current = current?.[segment];
    }
    
    return current;
  }
}
```

### 2. Remote Registry

```typescript
// Configuration for using remote registry
const xec = new Xec({
  registry: {
    url: 'https://registry.xec.dev',
    auth: {
      token: process.env.XEC_REGISTRY_TOKEN
    }
  }
});

// Automatic module loading
await xec.loadModule('@xec/nginx', { version: '^1.0.0' });

// Searching modules
const modules = await xec.searchModules({
  query: 'database',
  tags: ['postgres', 'production-ready']
});
```

## Creating an npm Package for a Module

### 1. package.json

```json
{
  "name": "@xec-community/my-module",
  "version": "1.0.0",
  "description": "My Xec module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist",
    "templates"
  ],
  "keywords": [
    "xec",
    "xec-module",
    "automation",
    "devops"
  ],
  "peerDependencies": {
    "@xec/core": "^2.0.0"
  },
  "devDependencies": {
    "@xec/core": "^2.0.0",
    "typescript": "^5.0.0"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "prepublishOnly": "npm run build"
  },
  "author": "Your Name",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/username/xec-my-module.git"
  }
}
```

### 2. TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

### 3. Export Structure

```typescript
// src/index.ts
import { Module } from '@xec/core';
import * as tasks from './tasks';
import * as recipes from './recipes';
import * as helpers from './helpers';
import * as patterns from './patterns';

const myModule: Module = {
  name: 'my-module',
  version: '1.0.0',
  description: 'My awesome Xec module',
  
  exports: {
    tasks,
    recipes,
    helpers,
    patterns
  }
};

// Default export for convenience
export default myModule;

// Named exports for direct access
export { tasks, recipes, helpers, patterns };

// Re-export types
export * from './types.js';
```

## Testing Modules

### 1. Unit Tests

```typescript
// test/tasks.test.ts
import { describe, it, expect } from 'vitest';
import { mockContext } from '@xec/core/testing';
import nginxModule from '../src';

describe('Nginx Module Tasks', () => {
  it('should install nginx', async () => {
    const ctx = mockContext({
      mockCommands: {
        'apt-get update': { exitCode: 0 },
        'apt-get install -y nginx': { exitCode: 0 }
      }
    });
    
    const result = await nginxModule.exports.tasks.install.run(ctx);
    
    expect(ctx.executedCommands).toContain('apt-get install -y nginx');
    expect(result).toBeTruthy();
  });
  
  it('should check if nginx is installed', async () => {
    const ctx = mockContext({
      mockCommands: {
        'which nginx': { exitCode: 0, stdout: '/usr/sbin/nginx' }
      }
    });
    
    const installed = await nginxModule.exports.helpers.isInstalled();
    expect(installed).toBe(true);
  });
});
```

### 2. Integration Tests

```typescript
// test/integration.test.ts
import { describe, it, expect } from 'vitest';
import { Xec } from '@xec/core';
import nginxModule from '../src';

describe('Nginx Module Integration', () => {
  it('should work with Xec', async () => {
    const xec = new Xec({
      modules: [nginxModule],
      dryRun: true
    });
    
    const recipe = xec.recipe('test')
      .task('setup', 'nginx.setup')
      .build();
    
    const result = await recipe.execute();
    
    expect(result.success).toBe(true);
    expect(result.tasks).toHaveProperty('setup');
  });
});
```

## Best Practices

### 1. Module Naming

```typescript
// Good: descriptive names with prefix
'@xec-community/nginx'
'@xec-community/aws-s3'
'@company/xec-internal-tools'

// Bad: general or conflicting names
'nginx'          // May conflict with npm package
'my-module'      // Non-descriptive
'tools'          // Too general
```

### 2. Versioning

- Follow Semantic Versioning
- Document breaking changes
- Maintain CHANGELOG.md

### 3. Documentation

```markdown
# My Xec Module

## Installation
\`\`\`bash
npm install @xec-community/my-module
\`\`\`

## Usage
\`\`\`typescript
import myModule from '@xec-community/my-module';

const xec = new Xec({
  modules: [myModule]
});
\`\`\`

## Tasks
- `my-module.task1` - Description
- `my-module.task2` - Description

## Configuration
\`\`\`typescript
xec.registerModule(myModule, {
  option1: 'value1',
  option2: 'value2'
});
\`\`\`
```

### 4. Backward Compatibility

```typescript
// Support for old API via aliases
export const myModule: Module = {
  name: 'my-module',
  version: '2.0.0',
  
  exports: {
    tasks: {
      // New name
      deployApplication: deployTask,
      
      // Old name for compatibility
      deploy: deployTask // @deprecated Use deployApplication
    }
  }
};
```

### 5. Security

- Validate all input data
- Use parameterized commands
- Do not store secrets in code
- Document required permissions

## Example Modules

### 1. Cloud Provider Module

```typescript
export const awsModule: Module = {
  name: 'aws',
  version: '1.0.0',
  
  config: {
    type: 'object',
    properties: {
      region: { type: 'string', default: 'us-east-1' },
      profile: { type: 'string' }
    }
  },
  
  exports: {
    tasks: {
      s3Upload: task('s3-upload')
        .vars({
          bucket: { required: true },
          key: { required: true },
          file: { required: true }
        })
        .run(async ({ $, vars }) => {
          await $`aws s3 cp ${vars.file} s3://${vars.bucket}/${vars.key}`;
        })
        .build(),
        
      ec2List: task('ec2-list')
        .run(async ({ $ }, config) => {
          const result = await $`aws ec2 describe-instances --region ${config.region}`;
          return JSON.parse(result.stdout);
        })
        .build()
    },
    
    helpers: {
      getAccountId: async () => {
        const result = await $`aws sts get-caller-identity --query Account --output text`;
        return result.stdout.trim();
      }
    }
  }
};
```

### 2. Monitoring Module

```typescript
export const monitoringModule: Module = {
  name: 'monitoring',
  version: '1.0.0',
  
  exports: {
    integrations: {
      prometheus: {
        name: 'prometheus',
        
        async query(query: string): Promise<any> {
          const response = await fetch(`${this.endpoint}/api/v1/query`, {
            method: 'POST',
            body: new URLSearchParams({ query })
          });
          return response.json();
        },
        
        async checkAlert(alert: string): Promise<boolean> {
          const result = await this.query(`ALERTS{alertname="${alert}"}`);
          return result.data.result.length > 0;
        }
      }
    },
    
    patterns: {
      healthCheck: {
        create: (options: HealthCheckOptions) => {
          return task('health-check')
            .retry({ attempts: options.retries || 3 })
            .timeout(options.timeout || 30000)
            .run(async ({ http }) => {
              const endpoints = options.endpoints;
              const results = await Promise.all(
                endpoints.map(async (url) => {
                  try {
                    const res = await http.get(url);
                    return { url, status: res.status, ok: res.status === 200 };
                  } catch (error) {
                    return { url, status: 0, ok: false, error };
                  }
                })
              );
              
              const healthy = results.every(r => r.ok);
              if (!healthy && options.notifyOnFailure) {
                await notify('Health check failed', results);
              }
              
              return { healthy, results };
            })
            .build();
        }
      }
    }
  }
};
```

The Xec Core module system provides a powerful mechanism for extending functionality, allowing you to create and share reusable components through the standard npm ecosystem.