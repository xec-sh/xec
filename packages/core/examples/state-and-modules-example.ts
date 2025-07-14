import {
  task,
  Event,
  Module,
  
  // Core
  recipe,
  // State Management
  StateManager,
  EventMetadata,
  OperationType,
  
  // Module System
  ModuleRegistry,
  TaskDefinition,
  // Integrations
  TerraformAdapter,
  
  PatternDefinition,
  KubernetesAdapter,
  IntegrationDefinition,
} from '../src';

// Example: Infrastructure Management with State Tracking

async function main() {
  // 1. Initialize State Management
  const stateManager = new StateManager({
    storage: { type: 'memory', config: {} },
    snapshotInterval: 10,
    compressionEnabled: true,
  });
  
  await stateManager.initialize();
  
  // 2. Initialize Module Registry
  const moduleRegistry = new ModuleRegistry();
  
  // 3. Create a custom infrastructure module
  const infrastructureModule: Module = {
    metadata: {
      name: 'infrastructure',
      version: '1.0.0',
      description: 'Infrastructure management module',
      tags: ['terraform', 'kubernetes', 'cloud'],
      capabilities: ['provision', 'deploy', 'scale'],
    },
    
    // Define tasks
    tasks: {
      provisionVpc: {
        name: 'provisionVpc',
        description: 'Provision VPC using Terraform',
        handler: async (params: { region: string; cidr: string }) => {
          console.log(`Provisioning VPC in ${params.region} with CIDR ${params.cidr}`);
          
          // Track state change
          const event: Event = {
            id: '',
            type: 'VpcProvisioned',
            timestamp: Date.now(),
            actor: 'infrastructure-module',
            payload: {
              region: params.region,
              cidr: params.cidr,
              vpcId: `vpc-${Math.random().toString(36).substring(7)}`,
            },
            metadata: {
              correlationId: 'infra-001',
              causationId: 'infra-001',
              version: 1,
              tags: new Map([
                ['resourceId', 'vpc-main'],
                ['resourceType', 'vpc'],
                ['region', params.region],
              ]),
            } as EventMetadata,
          };
          
          await stateManager.applyEvent(event);
          
          return { vpcId: event.payload.vpcId };
        },
      },
      
      deployApp: {
        name: 'deployApp',
        description: 'Deploy application to Kubernetes',
        handler: async (params: { app: string; replicas: number }) => {
          console.log(`Deploying ${params.app} with ${params.replicas} replicas`);
          
          // Track deployment
          const event: Event = {
            id: '',
            type: 'AppDeployed',
            timestamp: Date.now(),
            actor: 'infrastructure-module',
            payload: {
              app: params.app,
              replicas: params.replicas,
              deploymentId: `deploy-${Math.random().toString(36).substring(7)}`,
            },
            metadata: {
              correlationId: 'app-001',
              causationId: 'app-001',
              version: 1,
              tags: new Map([
                ['resourceId', `app-${params.app}`],
                ['resourceType', 'deployment'],
                ['app', params.app],
              ]),
            } as EventMetadata,
          };
          
          await stateManager.applyEvent(event);
          
          return { deploymentId: event.payload.deploymentId };
        },
      },
    } as Record<string, TaskDefinition>,
    
    // Define patterns
    patterns: {
      blueGreen: {
        name: 'blueGreen',
        type: 'deployment',
        description: 'Blue-green deployment pattern',
        template: async (params: { app: string; version: string }) => recipe(`blue-green-${params.app}`)
            .description(`Blue-green deployment for ${params.app}`)
            .vars({
              app: params.app,
              version: params.version,
            })
            .phase('prepare', phase => phase
              .task(task('prepare-green')
                .run(async (ctx) => {
                  console.log(`Preparing green environment for ${ctx.vars.app}`);
                })
              )
            )
            .phase('deploy', phase => phase
              .task(task('deploy-green')
                .run(async (ctx) => {
                  console.log(`Deploying ${ctx.vars.app} v${ctx.vars.version} to green`);
                })
              )
            )
            .phase('switch', phase => phase
              .task(task('switch-traffic')
                .run(async (ctx) => {
                  console.log(`Switching traffic to green for ${ctx.vars.app}`);
                })
              )
            )
            .phase('cleanup', phase => phase
              .task(task('cleanup-blue')
                .run(async (ctx) => {
                  console.log(`Cleaning up blue environment for ${ctx.vars.app}`);
                })
              )
            )
            .build(),
      },
    } as Record<string, PatternDefinition>,
    
    // Define integrations
    integrations: {
      terraform: {
        name: 'terraform',
        type: 'iac',
        description: 'Terraform integration',
        connect: async (config) => {
          const adapter = new TerraformAdapter(config);
          await adapter.connect();
          return adapter;
        },
        disconnect: async () => {
          console.log('Disconnecting from Terraform');
        },
        healthCheck: async () => true,
      },
      kubernetes: {
        name: 'kubernetes',
        type: 'orchestration',
        description: 'Kubernetes integration',
        connect: async (config) => {
          const adapter = new KubernetesAdapter(config);
          await adapter.connect();
          return adapter;
        },
      },
    } as Record<string, IntegrationDefinition>,
    
    // Lifecycle hooks
    onInstall: async () => {
      console.log('Infrastructure module installed');
    },
    
    onEnable: async () => {
      console.log('Infrastructure module enabled');
    },
    
    onHealthCheck: async () => ({
        status: 'healthy',
        timestamp: Date.now(),
      }),
  };
  
  // 4. Register the module
  await moduleRegistry.register(infrastructureModule);
  
  // 5. Use the module's tasks
  const taskRegistry = moduleRegistry.getTaskRegistry();
  
  // Provision VPC
  const vpcResult = await taskRegistry.execute('infrastructure:provisionVpc', {
    region: 'us-west-2',
    cidr: '10.0.0.0/16',
  });
  
  console.log('VPC provisioned:', vpcResult);
  
  // Deploy application
  const deployResult = await taskRegistry.execute('infrastructure:deployApp', {
    app: 'web-frontend',
    replicas: 3,
  });
  
  console.log('App deployed:', deployResult);
  
  // 6. Query state history
  const vpcState = await stateManager.getCurrentState('vpc-main');
  console.log('Current VPC state:', vpcState);
  
  const appHistory = await stateManager.getHistory('app-web-frontend');
  console.log('App deployment history:', appHistory);
  
  // 7. Use patterns
  const patternRegistry = moduleRegistry.getPatternRegistry();
  const blueGreenRecipe = await patternRegistry.instantiate('infrastructure:blueGreen', {
    app: 'api-backend',
    version: '2.0.0',
  });
  
  console.log('Blue-green deployment recipe created:', blueGreenRecipe);
  
  // 8. Create a transaction for multiple state changes
  const transaction = await stateManager.beginTransaction();
  
  transaction.operations.push({
    type: OperationType.UPDATE,
    resource: {
      type: 'deployment',
      id: 'app-web-frontend',
    },
    data: {
      replicas: 5,
      version: '1.2.0',
    },
  });
  
  transaction.operations.push({
    type: OperationType.CREATE,
    resource: {
      type: 'service',
      id: 'svc-web-frontend',
    },
    data: {
      type: 'LoadBalancer',
      port: 80,
      targetPort: 8080,
    },
  });
  
  await stateManager.commitTransaction(transaction.id);
  console.log('Transaction committed');
  
  // 9. Create a snapshot for backup
  const snapshot = await stateManager.createSnapshot('vpc-main');
  console.log('Snapshot created:', snapshot);
  
  // 10. Demonstrate ledger verification
  const ledger = (stateManager as any).ledger;
  const entries = await ledger.getEntries({ limit: 10 });
  
  console.log('\nLedger entries:');
  for (const entry of entries) {
    console.log(`- ${entry.operation} ${entry.resource.type}/${entry.resource.id} at ${new Date(entry.timestamp).toISOString()}`);
    
    // Verify entry integrity
    const isValid = await ledger.verify(entry.id);
    console.log(`  Integrity: ${isValid ? 'VALID' : 'INVALID'}`);
  }
  
  // Verify entire chain
  const chainValid = await ledger.verifyChain();
  console.log(`\nChain integrity: ${chainValid ? 'VALID' : 'INVALID'}`);
}

// Helper function to demonstrate state time travel
async function demonstrateTimeTravel(stateManager: StateManager) {
  console.log('\n=== Time Travel Demo ===');
  
  const resourceId = 'app-web-frontend';
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  
  // Get state at different points in time
  const currentState = await stateManager.getCurrentState(resourceId);
  const pastState = await stateManager.getStateAt(resourceId, oneHourAgo);
  
  console.log('Current state:', currentState);
  console.log('State 1 hour ago:', pastState);
  
  // Get full history
  const history = await stateManager.getHistory(resourceId, {
    timeRange: { from: oneHourAgo, to: now },
    includeEvents: true,
  });
  
  console.log('\nState changes in the last hour:');
  for (const change of history) {
    console.log(`- ${change.operation} at ${new Date(change.timestamp).toISOString()}`);
    console.log(`  Actor: ${change.actor}`);
    console.log(`  Version: ${change.version}`);
  }
}

// Run the example
main().catch(console.error);