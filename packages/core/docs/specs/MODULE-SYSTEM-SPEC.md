# Xec Module System Specification v2.0

## Overview

The Xec module system provides a powerful, environment-aware mechanism for extending functionality across different execution contexts (local, SSH, Docker, Kubernetes, cloud providers). This specification defines a minimalist yet flexible architecture that seamlessly adapts to various environments while maintaining a consistent API.

## Core Concepts

### 1. Module Definition

A module is a self-contained unit of functionality that can operate across different environments.

```typescript
interface XecModule {
  // Module metadata
  name: string;              // Unique identifier (e.g., 'nginx', 'postgres')
  version: string;           // Semantic version
  description?: string;      // Human-readable description
  
  // Module exports
  tasks?: TaskCollection;    // Executable tasks
  helpers?: HelperCollection; // Utility functions
  patterns?: PatternCollection; // Reusable patterns
  
  // Optional lifecycle hooks
  setup?: SetupHook;         // Module initialization
  teardown?: TeardownHook;   // Cleanup
}
```

### 2. Environment-Aware Tasks

Tasks automatically adapt their behavior based on the execution environment:

```typescript
interface Task {
  name: string;
  description?: string;
  
  // Single handler that adapts to environment
  run: TaskHandler;
  
  // Optional environment hints
  hints?: {
    preferredEnvironments?: Environment[];
    unsupportedEnvironments?: Environment[];
  };
}

type TaskHandler = (context: TaskContext) => Promise<any>;

interface TaskContext {
  // Universal command execution
  $: CommandExecutor;         // From @xec/ush
  
  // Environment info
  env: EnvironmentInfo;       // Current environment details
  
  // Standard utilities
  fs: FileSystem;            // File operations
  http: HttpClient;          // Network operations
  template: TemplateEngine;  // Template rendering
  
  // Task parameters
  params: Record<string, any>;
  
  // Logging
  log: Logger;
}
```

### 3. Automatic Environment Detection

The system automatically detects and adapts to the current environment:

```typescript
interface EnvironmentInfo {
  type: 'local' | 'ssh' | 'docker' | 'kubernetes' | 'aws' | 'azure' | 'gcp';
  
  // Connection details (when applicable)
  connection?: {
    host?: string;
    user?: string;
    // ... other connection params
  };
  
  // Available capabilities
  capabilities: {
    shell: boolean;
    sudo: boolean;
    docker: boolean;
    systemd: boolean;
    // ... other capabilities
  };
  
  // Platform details
  platform: {
    os: 'linux' | 'darwin' | 'windows';
    arch: 'x64' | 'arm64' | 'arm';
    distro?: string;  // For Linux
  };
}
```

## Module Implementation

### 1. Simple Module Example

```typescript
// modules/nginx/index.ts
export default {
  name: 'nginx',
  version: '1.0.0',
  description: 'Nginx web server management',
  
  tasks: {
    install: {
      name: 'install',
      description: 'Install Nginx',
      
      async run({ $, env, log }) {
        log.info('Installing Nginx...');
        
        // Automatic adaptation based on environment
        if (env.platform.os === 'darwin') {
          await $`brew install nginx`;
        } else if (env.platform.distro === 'ubuntu') {
          await $`apt-get update && apt-get install -y nginx`;
        } else if (env.platform.distro === 'centos') {
          await $`yum install -y nginx`;
        } else if (env.type === 'docker') {
          // In Docker, might need to handle differently
          await $`apt-get update && apt-get install -y nginx`;
        }
      }
    },
    
    configure: {
      name: 'configure',
      description: 'Configure Nginx',
      
      async run({ $, fs, template, params }) {
        const config = await template.render('nginx.conf.j2', params);
        await fs.write('/etc/nginx/nginx.conf', config);
        await $`nginx -t`;  // Test configuration
        await $`systemctl reload nginx`;
      }
    }
  },
  
  helpers: {
    isInstalled: async ({ $ }) => {
      try {
        await $`which nginx`;
        return true;
      } catch {
        return false;
      }
    },
    
    getVersion: async ({ $ }) => {
      const result = await $`nginx -v 2>&1`;
      return result.match(/nginx\/([\d.]+)/)?.[1];
    }
  }
};
```

### 2. Advanced Module with Environment Optimization

```typescript
export default {
  name: 'deploy',
  version: '2.0.0',
  
  tasks: {
    uploadFiles: {
      name: 'uploadFiles',
      description: 'Upload application files',
      
      async run({ $, env, fs, params }) {
        const { source, destination } = params;
        
        // Optimize based on environment
        switch (env.type) {
          case 'local':
            // Simple copy
            await $`cp -r ${source} ${destination}`;
            break;
            
          case 'ssh':
            // Use rsync for efficiency
            await $`rsync -avz ${source} ${env.connection.user}@${env.connection.host}:${destination}`;
            break;
            
          case 'docker':
            // Use docker cp
            await $`docker cp ${source} ${env.connection.container}:${destination}`;
            break;
            
          case 'kubernetes':
            // Use kubectl cp
            await $`kubectl cp ${source} ${env.connection.pod}:${destination} -n ${env.connection.namespace}`;
            break;
            
          default:
            // Fallback to standard copy
            await fs.copy(source, destination);
        }
      }
    }
  }
};
```

### 3. Module with External Environment Support

```typescript
// For environments not in core (kubernetes, aws, etc.)
export default {
  name: 'k8s-deploy',
  version: '1.0.0',
  
  // Declare required environment package
  requires: ['@xec/env-kubernetes'],
  
  tasks: {
    deploy: {
      name: 'deploy',
      description: 'Deploy to Kubernetes',
      hints: {
        preferredEnvironments: ['kubernetes']
      },
      
      async run({ $, env, params }) {
        if (env.type !== 'kubernetes') {
          throw new Error('This task requires Kubernetes environment');
        }
        
        // Kubernetes-specific operations
        await $`kubectl apply -f ${params.manifest}`;
        await $`kubectl rollout status deployment/${params.name}`;
      }
    }
  }
};
```

## Module Registration and Discovery

### 1. Module Registration

```typescript
// Automatic registration via package.json
{
  "name": "@myorg/xec-nginx",
  "keywords": ["xec-module"],
  "xec": {
    "module": "./dist/index.js"
  }
}

// Or manual registration
import { xec } from '@xec/core';
import nginxModule from './modules/nginx';

xec.modules.register(nginxModule);
```

### 2. Module Discovery

```typescript
// Automatically discover installed modules
const modules = await xec.modules.discover();

// Search for modules
const webServers = await xec.modules.search({
  tags: ['web-server'],
  capabilities: ['ssl']
});
```

## Module Composition

### 1. Using Multiple Modules

```typescript
import { recipe } from '@xec/core';

export default recipe('full-stack-deploy')
  .description('Deploy full application stack')
  
  // Use multiple modules
  .use('nginx')      // By name (from registry)
  .use(customModule) // Direct import
  
  // Define tasks using module functions
  .task('setup-web', async ({ modules }) => {
    await modules.nginx.tasks.install();
    await modules.nginx.tasks.configure({
      server_name: 'app.example.com',
      proxy_pass: 'http://localhost:3000'
    });
  })
  
  .task('setup-db', async ({ modules }) => {
    await modules.postgres.tasks.install();
    await modules.postgres.tasks.createDatabase({
      name: 'myapp',
      owner: 'appuser'
    });
  })
  
  .build();
```

### 2. Module Dependencies

```typescript
export default {
  name: 'app',
  version: '1.0.0',
  
  // Declare dependencies
  dependencies: {
    'nginx': '^1.0.0',
    'postgres': '^2.0.0'
  },
  
  tasks: {
    deploy: {
      async run({ modules }) {
        // Dependencies are automatically available
        await modules.nginx.tasks.install();
        await modules.postgres.tasks.install();
      }
    }
  }
};
```

## Environment Extension

### 1. Adding New Environment Support

External packages can add support for new environments:

```typescript
// @xec/env-kubernetes/index.ts
export default {
  name: 'kubernetes',
  
  // Environment detector
  detect: async () => {
    try {
      await $`kubectl version --client`;
      return {
        type: 'kubernetes',
        connection: {
          context: await $`kubectl config current-context`,
          namespace: 'default'
        },
        capabilities: {
          shell: true,
          volumes: true,
          networking: true
        }
      };
    } catch {
      return null;
    }
  },
  
  // Command executor adapter
  createExecutor: (connection) => {
    return createKubernetesExecutor(connection);
  }
};
```

### 2. Environment-Specific Utilities

```typescript
// Environments can provide specialized utilities
export default {
  name: 'aws',
  
  utilities: {
    s3: {
      upload: async (bucket, key, file) => {
        await $`aws s3 cp ${file} s3://${bucket}/${key}`;
      },
      download: async (bucket, key, file) => {
        await $`aws s3 cp s3://${bucket}/${key} ${file}`;
      }
    },
    
    ec2: {
      listInstances: async () => {
        const result = await $`aws ec2 describe-instances --output json`;
        return JSON.parse(result);
      }
    }
  }
};
```

## Module Packaging and Distribution

### 1. Module Structure

```
my-xec-module/
├── package.json
├── README.md
├── src/
│   ├── index.ts        # Module definition
│   ├── tasks/          # Task implementations
│   ├── helpers/        # Helper functions
│   └── templates/      # Template files
├── test/
│   └── module.test.ts
└── examples/
    └── usage.ts
```

### 2. Publishing

```bash
# Publish to npm
npm publish --access public

# Users install via npm
npm install @myorg/xec-nginx

# Module is automatically discovered
xec modules list
```

## Best Practices

### 1. Environment Adaptation

- Use environment detection to optimize behavior
- Provide fallbacks for unsupported environments
- Document environment-specific behavior

### 2. Minimal Dependencies

- Prefer built-in utilities over external packages
- Use peer dependencies for optional features
- Keep modules focused and lightweight

### 3. Error Handling

```typescript
async run({ $, env, log }) {
  try {
    await $`some-command`;
  } catch (error) {
    // Provide helpful error messages
    if (env.type === 'docker') {
      log.error('Command failed in Docker. Ensure the image has required tools installed.');
    }
    throw error;
  }
}
```

### 4. Testing

```typescript
import { test } from '@xec/testing';

test('nginx install', async (t) => {
  const { nginx } = t.modules;
  
  // Test in different environments
  await t.runInEnvironment('local', async () => {
    await nginx.tasks.install();
    t.assert(await nginx.helpers.isInstalled());
  });
  
  await t.runInEnvironment('docker', async () => {
    await nginx.tasks.install();
    t.assert(await nginx.helpers.isInstalled());
  });
});
```

## Migration from v1

Existing modules continue to work with automatic adaptation:

```typescript
// Old module
export default {
  name: 'old-module',
  exports: {
    tasks: {
      oldTask: task()
        .run(async ({ $ }) => {
          await $`echo "Still works!"`;
        })
        .build()
    }
  }
};

// Automatically wrapped to new format
// Can be used immediately without changes
```