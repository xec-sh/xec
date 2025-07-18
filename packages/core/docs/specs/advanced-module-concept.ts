/**
 * Xec Core Module System - Advanced Environment-Aware Module Specification
 * 
 * This file presents an enhanced concept for Xec modules that seamlessly work
 * across different execution environments (local, SSH, Docker, Kubernetes, etc.)
 */

/**
 * CURRENT STATE ANALYSIS
 * 
 * The current module system:
 * - Defines modules as environment-agnostic units of functionality
 * - Uses adapters to execute commands in different environments
 * - Lacks clear documentation on environment-specific behavior
 * - Doesn't provide explicit environment-aware APIs
 */

/**
 * ENHANCED MODULE SYSTEM SPECIFICATION
 */

// ============================================================================
// 1. ENVIRONMENT-AWARE MODULE INTERFACE
// ============================================================================

interface EnvironmentAwareModule {
  metadata: {
    name: string;
    version: string;
    description?: string;
    
    // New: Explicitly declare supported environments
    environments: {
      local?: boolean;
      ssh?: boolean;
      docker?: boolean;
      kubernetes?: boolean;
      cloud?: {
        aws?: boolean;
        azure?: boolean;
        gcp?: boolean;
      };
    };
    
    // New: Environment-specific requirements
    requirements?: {
      local?: {
        commands?: string[];      // Required commands: ['git', 'npm']
        packages?: string[];      // Required system packages
        minNodeVersion?: string;  // Minimum Node.js version
      };
      ssh?: {
        minProtocolVersion?: number;
        requiredAuth?: ('password' | 'key' | 'agent')[];
      };
      docker?: {
        minApiVersion?: string;
        requiredFeatures?: string[]; // ['buildkit', 'compose']
      };
      kubernetes?: {
        minVersion?: string;
        requiredApis?: string[];     // ['apps/v1', 'batch/v1']
      };
    };
  };
  
  // Environment-aware task definitions
  tasks: {
    [taskName: string]: EnvironmentAwareTask;
  };
  
  // New: Environment-specific helpers
  helpers?: {
    [helperName: string]: EnvironmentAwareHelper;
  };
  
  // New: Environment adapters for custom behavior
  adapters?: {
    local?: LocalAdapter;
    ssh?: SSHAdapter;
    docker?: DockerAdapter;
    kubernetes?: K8sAdapter;
  };
}

// ============================================================================
// 2. ENVIRONMENT-AWARE TASK DEFINITION
// ============================================================================

interface EnvironmentAwareTask {
  name: string;
  description?: string;
  
  // Environment-specific implementations
  handlers: {
    // Default handler (fallback)
    default?: TaskHandler;
    
    // Environment-specific handlers
    local?: TaskHandler;
    ssh?: TaskHandler;
    docker?: TaskHandler;
    kubernetes?: TaskHandler;
  };
  
  // New: Environment-specific parameter schemas
  parameters?: {
    default?: ParameterSchema;
    local?: ParameterSchema;
    ssh?: ParameterSchema;
    docker?: ParameterSchema;
    kubernetes?: ParameterSchema;
  };
  
  // New: Environment capabilities check
  canExecute?: (env: ExecutionEnvironment) => boolean | Promise<boolean>;
  
  // New: Pre/post execution hooks per environment
  hooks?: {
    beforeExecute?: {
      [env: string]: (context: TaskContext) => Promise<void>;
    };
    afterExecute?: {
      [env: string]: (context: TaskContext, result: any) => Promise<void>;
    };
  };
}

type TaskHandler = (params: any, context: TaskContext) => Promise<any>;

interface TaskContext {
  environment: ExecutionEnvironment;
  logger: Logger;
  stdlib: StandardLibrary;
  env: EnvironmentVariables;
  secrets: SecretManager;
  
  // New: Environment-specific utilities
  utils: EnvironmentUtils;
}

// ============================================================================
// 3. EXECUTION ENVIRONMENT ABSTRACTION
// ============================================================================

interface ExecutionEnvironment {
  type: 'local' | 'ssh' | 'docker' | 'kubernetes' | 'aws' | 'azure' | 'gcp';
  
  // Connection details
  connection?: {
    // SSH
    host?: string;
    port?: number;
    username?: string;
    privateKey?: string;
    
    // Docker
    dockerHost?: string;
    dockerCertPath?: string;
    
    // Kubernetes
    kubeconfig?: string;
    namespace?: string;
    context?: string;
    
    // Cloud
    region?: string;
    credentials?: any;
  };
  
  // Environment capabilities
  capabilities: {
    shell: boolean;
    fileTransfer: boolean;
    portForwarding: boolean;
    volumeMounting: boolean;
    networking: boolean;
    persistence: boolean;
  };
  
  // Resource constraints
  resources?: {
    cpu?: string;        // '2 cores', '1000m'
    memory?: string;     // '4Gi', '4096Mi'
    storage?: string;    // '10Gi'
    network?: string;    // 'host', 'bridge', 'custom'
  };
  
  // Platform-specific options
  options?: {
    // Docker options
    image?: string;
    dockerfile?: string;
    buildArgs?: Record<string, string>;
    
    // Kubernetes options
    serviceAccount?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    
    // SSH options
    strictHostKeyChecking?: boolean;
    compression?: boolean;
  };
}

// ============================================================================
// 4. ENVIRONMENT-SPECIFIC UTILITIES
// ============================================================================

interface EnvironmentUtils {
  // File operations adapted to environment
  file: {
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    copy(source: string, dest: string): Promise<void>;
    // Environment-specific: In Docker/K8s, might use volumes
    mount?(localPath: string, remotePath: string): Promise<void>;
  };
  
  // Command execution adapted to environment
  exec: {
    run(command: string, options?: ExecOptions): Promise<ExecResult>;
    runScript(script: string, options?: ExecOptions): Promise<ExecResult>;
    // Environment-specific: In K8s, might use Jobs
    runJob?(spec: JobSpec): Promise<JobResult>;
  };
  
  // Network operations adapted to environment
  network: {
    fetch(url: string, options?: FetchOptions): Promise<Response>;
    checkPort(host: string, port: number): Promise<boolean>;
    // Environment-specific: In Docker, might use container networking
    expose?(port: number, options?: ExposeOptions): Promise<void>;
  };
  
  // Secret management adapted to environment
  secrets: {
    get(key: string): Promise<string>;
    set(key: string, value: string): Promise<void>;
    // Environment-specific: In K8s, might use Secrets API
    mountSecret?(secretName: string, mountPath: string): Promise<void>;
  };
}

// ============================================================================
// 5. PRACTICAL USAGE EXAMPLES
// ============================================================================

// Example 1: File System Module with Environment Awareness
const fileSystemModule: EnvironmentAwareModule = {
  metadata: {
    name: '@xec/stdlib-file',
    version: '2.0.0',
    environments: {
      local: true,
      ssh: true,
      docker: true,
      kubernetes: true,
    },
    requirements: {
      local: {
        commands: ['find', 'rsync'],
      },
      docker: {
        minApiVersion: '1.41',
      },
    },
  },
  
  tasks: {
    sync: {
      name: 'sync',
      description: 'Synchronize files between source and destination',
      
      handlers: {
        // Local execution using rsync
        local: async (params, context) => {
          const { source, dest, options = {} } = params;
          const flags = options.delete ? '--delete' : '';
          
          await context.utils.exec.run(
            `rsync -av ${flags} ${source} ${dest}`
          );
        },
        
        // SSH execution with remote rsync
        ssh: async (params, context) => {
          const { source, dest, options = {} } = params;
          const { host, username } = context.environment.connection!;
          
          if (source.startsWith('/') && dest.startsWith('/')) {
            // Both paths are remote
            await context.utils.exec.run(
              `rsync -av ${source} ${dest}`
            );
          } else if (source.startsWith('/')) {
            // Download from remote
            await context.utils.exec.run(
              `rsync -av ${username}@${host}:${source} ${dest}`,
              { local: true }  // Run on local machine
            );
          } else {
            // Upload to remote
            await context.utils.exec.run(
              `rsync -av ${source} ${username}@${host}:${dest}`,
              { local: true }  // Run on local machine
            );
          }
        },
        
        // Docker execution using volumes
        docker: async (params, context) => {
          const { source, dest } = params;
          const { connection } = context.environment;
          
          // Create a temporary container with volumes
          await context.utils.exec.run(`
            docker run --rm \
              -v ${source}:/source:ro \
              -v ${dest}:/dest \
              alpine sh -c "cp -av /source/* /dest/"
          `);
        },
        
        // Kubernetes execution using Jobs and PVCs
        kubernetes: async (params, context) => {
          const { source, dest } = params;
          
          // Create a Job that mounts PVCs and copies data
          await context.utils.exec.runJob({
            name: 'file-sync-job',
            image: 'alpine',
            command: ['sh', '-c', `cp -av ${source}/* ${dest}/`],
            volumes: [
              { name: 'source', path: source, readOnly: true },
              { name: 'dest', path: dest },
            ],
          });
        },
      },
      
      parameters: {
        default: {
          source: { type: 'string', required: true },
          dest: { type: 'string', required: true },
          options: {
            type: 'object',
            properties: {
              delete: { type: 'boolean' },
              exclude: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        kubernetes: {
          source: { 
            type: 'string', 
            required: true,
            description: 'PVC name or path within PVC',
          },
          dest: { 
            type: 'string', 
            required: true,
            description: 'PVC name or path within PVC',
          },
        },
      },
    },
  },
};

// Example 2: System Package Module with Environment Awareness
const systemPackageModule: EnvironmentAwareModule = {
  metadata: {
    name: '@xec/stdlib-system',
    version: '2.0.0',
    environments: {
      local: true,
      ssh: true,
      docker: true,
      kubernetes: false,  // Package management doesn't make sense in K8s
    },
  },
  
  tasks: {
    installPackage: {
      name: 'installPackage',
      description: 'Install system packages',
      
      handlers: {
        // Default handler that detects package manager
        default: async (params, context) => {
          const { packages } = params;
          const os = await context.utils.exec.run('uname -s');
          
          let command: string;
          if (os.includes('Darwin')) {
            command = `brew install ${packages.join(' ')}`;
          } else if (await context.utils.file.exists('/etc/debian_version')) {
            command = `apt-get update && apt-get install -y ${packages.join(' ')}`;
          } else if (await context.utils.file.exists('/etc/redhat-release')) {
            command = `yum install -y ${packages.join(' ')}`;
          } else {
            throw new Error('Unsupported operating system');
          }
          
          await context.utils.exec.run(command);
        },
        
        // Docker: Install in container or build new image
        docker: async (params, context) => {
          const { packages, persistent = false } = params;
          const { connection } = context.environment;
          
          if (persistent) {
            // Build a new image with packages installed
            const dockerfile = `
              FROM ${connection?.options?.image || 'ubuntu:latest'}
              RUN apt-get update && apt-get install -y ${packages.join(' ')}
            `;
            
            await context.utils.file.write('/tmp/Dockerfile', dockerfile);
            await context.utils.exec.run('docker build -t myimage /tmp/');
            
            // Update environment to use new image
            context.environment.options!.image = 'myimage';
          } else {
            // Install in running container (temporary)
            await context.utils.exec.run(
              `apt-get update && apt-get install -y ${packages.join(' ')}`
            );
          }
        },
      },
      
      canExecute: async (env) => 
        // Cannot install packages in Kubernetes pods
         env.type !== 'kubernetes'
      ,
    },
  },
};

// Example 3: Using Modules in Different Environments
async function demonstrateUsage() {
  // Initialize Xec with environment configuration
  const xec = new Xec({
    environments: {
      local: {
        type: 'local',
        capabilities: {
          shell: true,
          fileTransfer: true,
          portForwarding: true,
          volumeMounting: true,
          networking: true,
          persistence: true,
        },
      },
      
      staging: {
        type: 'ssh',
        connection: {
          host: 'staging.example.com',
          username: 'deploy',
          privateKey: '~/.ssh/id_rsa',
        },
        capabilities: {
          shell: true,
          fileTransfer: true,
          portForwarding: true,
          volumeMounting: false,
          networking: true,
          persistence: true,
        },
      },
      
      production: {
        type: 'kubernetes',
        connection: {
          kubeconfig: '~/.kube/config',
          context: 'production',
          namespace: 'default',
        },
        capabilities: {
          shell: true,
          fileTransfer: false,
          portForwarding: true,
          volumeMounting: true,
          networking: true,
          persistence: true,
        },
        resources: {
          cpu: '2',
          memory: '4Gi',
        },
      },
    },
  });
  
  // Register modules
  await xec.modules.register(fileSystemModule);
  await xec.modules.register(systemPackageModule);
  
  // Use module in local environment
  await xec.run('local', async (ctx) => {
    await ctx.stdlib.file.sync({
      source: './src',
      dest: './dist',
    });
  });
  
  // Use same module in SSH environment
  await xec.run('staging', async (ctx) => {
    await ctx.stdlib.file.sync({
      source: './dist',
      dest: '/var/www/app',
    });
  });
  
  // Use module in Kubernetes (with different implementation)
  await xec.run('production', async (ctx) => {
    await ctx.stdlib.file.sync({
      source: 'app-data-pvc:/current',
      dest: 'app-data-pvc:/backup',
    });
  });
}

// ============================================================================
// 6. ADVANCED FEATURES
// ============================================================================

// Feature 1: Environment Transitions
interface EnvironmentTransition {
  from: ExecutionEnvironment;
  to: ExecutionEnvironment;
  
  // Transfer data between environments
  transfer: {
    files?: Array<{ source: string; dest: string }>;
    env?: string[];
    secrets?: string[];
  };
  
  // Maintain state across environments
  state?: {
    preserve: boolean;
    storage: 'memory' | 'file' | 'redis' | 'etcd';
  };
}

// Feature 2: Multi-Environment Pipelines
interface MultiEnvironmentPipeline {
  name: string;
  stages: Array<{
    name: string;
    environment: string;
    tasks: string[];
    
    // Conditions for stage execution
    when?: {
      success?: boolean;
      failure?: boolean;
      expression?: string;
    };
    
    // Data to pass to next stage
    outputs?: string[];
  }>;
}

// Example: Multi-environment deployment pipeline
const deploymentPipeline: MultiEnvironmentPipeline = {
  name: 'full-deployment',
  stages: [
    {
      name: 'build',
      environment: 'local',
      tasks: ['compile', 'test', 'package'],
      outputs: ['dist/', 'artifacts/'],
    },
    {
      name: 'staging-deploy',
      environment: 'staging',
      tasks: ['upload', 'install', 'configure', 'healthcheck'],
      when: { success: true },
    },
    {
      name: 'production-deploy',
      environment: 'production',
      tasks: ['k8s:deploy', 'k8s:wait', 'k8s:verify'],
      when: { success: true, expression: 'manual_approval == true' },
    },
  ],
};

// Feature 3: Environment Discovery and Auto-Configuration
interface EnvironmentDiscovery {
  // Automatically detect available environments
  discover(): Promise<ExecutionEnvironment[]>;
  
  // Test environment connectivity
  test(env: ExecutionEnvironment): Promise<{
    reachable: boolean;
    latency?: number;
    capabilities?: EnvironmentCapabilities;
  }>;
  
  // Auto-configure optimal environment
  selectOptimal(requirements: EnvironmentRequirements): Promise<ExecutionEnvironment>;
}

// Feature 4: Environment-Aware Caching
interface EnvironmentCache {
  // Cache task results per environment
  get(env: string, key: string): Promise<any>;
  set(env: string, key: string, value: any, ttl?: number): Promise<void>;
  
  // Sync cache between environments
  sync(from: string, to: string, keys?: string[]): Promise<void>;
}

// ============================================================================
// 7. MIGRATION PATH FROM CURRENT IMPLEMENTATION
// ============================================================================

/**
 * To upgrade the current module system to this specification:
 * 
 * 1. Extend Module interface with environment declarations
 * 2. Add environment-specific task handlers
 * 3. Create EnvironmentUtils adapters for each environment type
 * 4. Update ModuleRegistry to handle environment routing
 * 5. Enhance TaskExecutor with environment awareness
 * 6. Add environment capability detection
 * 7. Implement cross-environment data transfer
 * 8. Update stdlib modules with environment-specific implementations
 * 
 * Backward Compatibility:
 * - Modules without environment handlers use the default handler
 * - Current adapter system continues to work as fallback
 * - Gradual migration path for existing modules
 */

// ============================================================================
// 8. BENEFITS OF THIS APPROACH
// ============================================================================

/**
 * 1. **Clear Environment Support**: Modules explicitly declare supported environments
 * 2. **Optimal Implementations**: Each environment gets optimized implementations
 * 3. **Better Error Messages**: Know upfront if a module supports an environment
 * 4. **Resource Awareness**: Modules can adapt to environment constraints
 * 5. **Unified API**: Same module API works across all environments
 * 6. **Progressive Enhancement**: Basic functionality with environment-specific optimizations
 * 7. **Testing**: Easy to test modules across different environments
 * 8. **Documentation**: Self-documenting environment requirements
 */

// Type definitions for referenced interfaces
interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

interface StandardLibrary {
  [moduleName: string]: any;
}

interface EnvironmentVariables {
  [key: string]: string | undefined;
}

interface SecretManager {
  get(key: string): Promise<string>;
  set(key: string, value: string): Promise<void>;
}

interface ParameterSchema {
  [paramName: string]: {
    type: string;
    required?: boolean;
    default?: any;
    description?: string;
  };
}

interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  stdin?: string;
  local?: boolean;  // For SSH: run locally instead of remotely
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface JobSpec {
  name: string;
  image: string;
  command: string[];
  volumes?: Array<{ name: string; path: string; readOnly?: boolean }>;
  env?: Record<string, string>;
}

interface JobResult {
  name: string;
  status: 'succeeded' | 'failed';
  logs: string;
}

interface FetchOptions extends RequestInit {
  timeout?: number;
  retry?: number;
}

interface ExposeOptions {
  protocol?: 'tcp' | 'udp';
  host?: string;
}

interface LocalAdapter {
  // Custom local execution logic
}

interface SSHAdapter {
  // Custom SSH execution logic
}

interface DockerAdapter {
  // Custom Docker execution logic
}

interface K8sAdapter {
  // Custom Kubernetes execution logic
}

interface EnvironmentCapabilities {
  [capability: string]: boolean | string | number;
}

interface EnvironmentRequirements {
  capabilities?: string[];
  resources?: {
    minCpu?: string;
    minMemory?: string;
    minStorage?: string;
  };
  location?: {
    regions?: string[];
    zones?: string[];
  };
}

// Export main types
export {
  TaskContext,
  EnvironmentUtils,
  EnvironmentAwareTask,
  ExecutionEnvironment,
  EnvironmentTransition,
  EnvironmentAwareModule,
  MultiEnvironmentPipeline,
};