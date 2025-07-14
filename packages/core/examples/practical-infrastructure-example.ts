import {
  task,
  Event,
  Module,
  recipe,
  parallel,
  UshAdapter,
  StateManager,
  OperationType,
  ModuleRegistry,
  TerraformAdapter,
  KubernetesAdapter,
} from '../src';

/**
 * Practical example: Managing a real cloud infrastructure
 * This example shows how to:
 * 1. Provision AWS infrastructure with Terraform
 * 2. Deploy applications to Kubernetes
 * 3. Track all changes in the state ledger
 * 4. Handle rollbacks and disaster recovery
 */

// Configuration
const config = {
  aws: {
    region: 'us-west-2',
    accountId: '123456789012',
  },
  terraform: {
    workingDirectory: './infrastructure/terraform',
    backendConfig: {
      bucket: 'my-terraform-state',
      key: 'prod/terraform.tfstate',
      region: 'us-west-2',
    },
  },
  kubernetes: {
    context: 'prod-cluster',
    namespace: 'default',
  },
};

// Infrastructure Module with real-world patterns
const createInfrastructureModule = (stateManager: StateManager): Module => ({
  metadata: {
    name: 'aws-infrastructure',
    version: '2.0.0',
    description: 'AWS infrastructure management with state tracking',
    dependencies: {
      terraform: '^1.5.0',
      kubectl: '^1.28.0',
    },
    requiredPermissions: [
      'state:write',
      'integration:connect',
    ],
  },

  tasks: {
    // VPC and networking setup
    setupNetworking: {
      name: 'setupNetworking',
      description: 'Create VPC, subnets, and networking resources',
      handler: async (params: { environment: string }) => {
        const terraform = new TerraformAdapter({
          ...config.terraform,
          variables: {
            environment: params.environment,
            vpc_cidr: '10.0.0.0/16',
            availability_zones: ['us-west-2a', 'us-west-2b'],
          },
        });

        await terraform.connect();

        try {
          // Plan the changes
          const planResult = await terraform.plan({ out: 'networking.tfplan' });

          if (planResult.success) {
            // Apply the plan
            const applyResult = await terraform.apply({ planFile: 'networking.tfplan' });

            if (applyResult.success) {
              // Get outputs
              const outputs = await terraform.output(undefined, { json: true });
              const outputData = JSON.parse(outputs.output || '{}');

              // Record state change
              await stateManager.applyEvent({
                id: '',
                type: 'NetworkingCreated',
                timestamp: Date.now(),
                actor: 'terraform',
                payload: {
                  vpcId: outputData.vpc_id?.value,
                  subnetIds: outputData.subnet_ids?.value,
                  environment: params.environment,
                },
                metadata: {
                  correlationId: `networking-${params.environment}`,
                  causationId: 'setup-networking',
                  version: 1,
                  tags: new Map([
                    ['resourceId', `vpc-${params.environment}`],
                    ['resourceType', 'networking'],
                    ['environment', params.environment],
                  ]),
                },
              } as Event);

              return outputData;
            }
          }

          throw new Error('Terraform apply failed');
        } finally {
          await terraform.disconnect();
        }
      },
      timeout: 600000, // 10 minutes
      retries: 2,
    },

    // EKS cluster setup
    createEksCluster: {
      name: 'createEksCluster',
      description: 'Create EKS cluster with node groups',
      handler: async (params: {
        environment: string;
        nodeCount: number;
        instanceType: string;
      }) => {
        const terraform = new TerraformAdapter({
          ...config.terraform,
          workingDirectory: './infrastructure/terraform/eks',
          variables: {
            environment: params.environment,
            node_count: params.nodeCount,
            instance_type: params.instanceType,
          },
        });

        await terraform.connect();

        try {
          await terraform.init();
          const applyResult = await terraform.apply();

          if (applyResult.success) {
            const outputs = await terraform.output(undefined, { json: true });
            const outputData = JSON.parse(outputs.output || '{}');

            // Update kubeconfig
            const ush = new UshAdapter({});
            await ush.connect();

            await ush.execute(
              `aws eks update-kubeconfig --name ${outputData.cluster_name?.value} --region ${config.aws.region}`
            );

            // Record state
            await stateManager.applyEvent({
              id: '',
              type: 'EksClusterCreated',
              timestamp: Date.now(),
              actor: 'terraform',
              payload: {
                clusterName: outputData.cluster_name?.value,
                endpoint: outputData.cluster_endpoint?.value,
                nodeCount: params.nodeCount,
                instanceType: params.instanceType,
              },
              metadata: {
                correlationId: `eks-${params.environment}`,
                causationId: 'create-eks',
                version: 1,
                tags: new Map([
                  ['resourceId', `eks-${params.environment}`],
                  ['resourceType', 'eks-cluster'],
                  ['environment', params.environment],
                ]),
              },
            } as Event);

            return outputData;
          }

          throw new Error('EKS cluster creation failed');
        } finally {
          await terraform.disconnect();
        }
      },
      timeout: 1800000, // 30 minutes
    },

    // Deploy application
    deployApplication: {
      name: 'deployApplication',
      description: 'Deploy application to Kubernetes',
      handler: async (params: {
        app: string;
        version: string;
        replicas: number;
        environment: string;
      }) => {
        const k8s = new KubernetesAdapter({
          ...config.kubernetes,
          namespace: params.environment,
        });

        await k8s.connect();

        try {
          // Create namespace if needed
          await k8s.createNamespace(params.environment).catch(() => { });

          // Deploy application
          const deployment = {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: params.app,
              namespace: params.environment,
              labels: {
                app: params.app,
                version: params.version,
                environment: params.environment,
              },
            },
            spec: {
              replicas: params.replicas,
              selector: {
                matchLabels: {
                  app: params.app,
                },
              },
              template: {
                metadata: {
                  labels: {
                    app: params.app,
                    version: params.version,
                  },
                },
                spec: {
                  containers: [{
                    name: params.app,
                    image: `myregistry/${params.app}:${params.version}`,
                    ports: [{
                      containerPort: 8080,
                    }],
                    resources: {
                      requests: {
                        memory: '256Mi',
                        cpu: '100m',
                      },
                      limits: {
                        memory: '512Mi',
                        cpu: '500m',
                      },
                    },
                    livenessProbe: {
                      httpGet: {
                        path: '/health',
                        port: 8080,
                      },
                      initialDelaySeconds: 30,
                      periodSeconds: 10,
                    },
                    readinessProbe: {
                      httpGet: {
                        path: '/ready',
                        port: 8080,
                      },
                      initialDelaySeconds: 5,
                      periodSeconds: 5,
                    },
                  }],
                },
              },
            },
          };

          const applyResult = await k8s.apply(deployment);

          if (applyResult.success) {
            // Wait for deployment to be ready
            await k8s.wait(
              `deployment/${params.app}`,
              'condition=available',
              { timeout: '5m' }
            );

            // Create service
            const service = {
              apiVersion: 'v1',
              kind: 'Service',
              metadata: {
                name: params.app,
                namespace: params.environment,
              },
              spec: {
                selector: {
                  app: params.app,
                },
                ports: [{
                  port: 80,
                  targetPort: 8080,
                }],
                type: 'LoadBalancer',
              },
            };

            await k8s.apply(service);

            // Record deployment
            await stateManager.applyEvent({
              id: '',
              type: 'ApplicationDeployed',
              timestamp: Date.now(),
              actor: 'kubernetes',
              payload: {
                app: params.app,
                version: params.version,
                replicas: params.replicas,
                environment: params.environment,
              },
              metadata: {
                correlationId: `deploy-${params.app}-${params.version}`,
                causationId: 'deploy-application',
                version: 1,
                tags: new Map([
                  ['resourceId', `app-${params.app}-${params.environment}`],
                  ['resourceType', 'deployment'],
                  ['app', params.app],
                  ['environment', params.environment],
                ]),
              },
            } as Event);

            return {
              deployment: params.app,
              version: params.version,
              status: 'deployed',
            };
          }

          throw new Error('Deployment failed');
        } finally {
          await k8s.disconnect();
        }
      },
    },

    // Rollback application
    rollbackApplication: {
      name: 'rollbackApplication',
      description: 'Rollback application to previous version',
      handler: async (params: { app: string; environment: string }) => {
        // Get deployment history from state
        const resourceId = `app-${params.app}-${params.environment}`;
        const history = await stateManager.getHistory(resourceId, {
          limit: 10,
          orderDirection: 'desc',
        });

        // Find the previous successful deployment
        const previousDeployment = history.find(
          (change, index) =>
            index > 0 &&
            change.operation === OperationType.UPDATE &&
            change.newValue?.status === 'deployed'
        );

        if (!previousDeployment) {
          throw new Error('No previous deployment found');
        }

        // Rollback using Kubernetes
        const k8s = new KubernetesAdapter({
          ...config.kubernetes,
          namespace: params.environment,
        });

        await k8s.connect();

        try {
          await k8s.rollout('undo', `deployment/${params.app}`);

          // Wait for rollback to complete
          await k8s.wait(
            `deployment/${params.app}`,
            'condition=progressing',
            { timeout: '5m' }
          );

          // Record rollback
          await stateManager.applyEvent({
            id: '',
            type: 'ApplicationRolledBack',
            timestamp: Date.now(),
            actor: 'kubernetes',
            payload: {
              app: params.app,
              rolledBackTo: previousDeployment.newValue?.version,
              environment: params.environment,
            },
            metadata: {
              correlationId: `rollback-${params.app}`,
              causationId: 'rollback-application',
              version: 1,
              tags: new Map([
                ['resourceId', resourceId],
                ['resourceType', 'deployment'],
                ['app', params.app],
                ['environment', params.environment],
              ]),
            },
          } as Event);

          return {
            app: params.app,
            rolledBackTo: previousDeployment.newValue?.version,
            status: 'rolled-back',
          };
        } finally {
          await k8s.disconnect();
        }
      },
    },

    // Health check
    healthCheck: {
      name: 'healthCheck',
      description: 'Check infrastructure health',
      handler: async (params: { environment: string }) => {
        const results = {
          networking: 'unknown',
          cluster: 'unknown',
          applications: {} as Record<string, string>,
        };

        // Check VPC
        const vpcState = await stateManager.getCurrentState(`vpc-${params.environment}`);
        results.networking = vpcState ? 'healthy' : 'not-found';

        // Check EKS cluster
        const k8s = new KubernetesAdapter({
          ...config.kubernetes,
        });

        try {
          await k8s.connect();
          const clusterInfo = await k8s.execute('cluster-info');
          results.cluster = clusterInfo.success ? 'healthy' : 'unhealthy';

          // Check deployments
          const deployments = await k8s.get('deployments', undefined, {
            output: 'json',
            allNamespaces: true,
          });

          if (deployments.success) {
            const data = JSON.parse(deployments.output || '{}');
            for (const deployment of data.items || []) {
              const name = deployment.metadata.name;
              const ready = deployment.status.readyReplicas || 0;
              const desired = deployment.spec.replicas || 0;
              results.applications[name] = ready === desired ? 'healthy' : 'degraded';
            }
          }
        } catch (error) {
          results.cluster = 'error';
        } finally {
          await k8s.disconnect();
        }

        return results;
      },
    },
  },

  patterns: {
    // Blue-green deployment pattern
    blueGreenDeployment: {
      name: 'blueGreenDeployment',
      type: 'deployment',
      description: 'Blue-green deployment with automatic rollback',
      template: async (params: {
        app: string;
        version: string;
        environment: string;
      }) => recipe(`blue-green-${params.app}`)
        .description(`Blue-green deployment of ${params.app} v${params.version}`)
        .vars(params)

        .phase('validate', phase => phase
          .task(task('validate-image')
            .description('Validate Docker image exists')
            .run(async (ctx) => {
              const ush = new UshAdapter({});
              await ush.connect();

              const result = await ush.execute(
                `docker manifest inspect myregistry/${ctx.vars.app}:${ctx.vars.version}`
              );

              if (!result.success) {
                throw new Error(`Image ${ctx.vars.app}:${ctx.vars.version} not found`);
              }
            })
          )
        )

        .phase('prepare', phase => phase
          .task(task('create-green-deployment')
            .description('Create green deployment')
            .run(async (ctx) => {
              const k8s = new KubernetesAdapter({
                ...config.kubernetes,
                namespace: ctx.vars.environment,
              });

              await k8s.connect();

              // Clone existing deployment as green
              const existing = await k8s.get(
                'deployment',
                ctx.vars.app,
                { output: 'json' }
              );

              const deployment = JSON.parse(existing.output || '{}');
              deployment.metadata.name = `${ctx.vars.app}-green`;
              deployment.spec.template.spec.containers[0].image =
                `myregistry/${ctx.vars.app}:${ctx.vars.version}`;

              await k8s.apply(deployment);
              await k8s.disconnect();
            })
          )
        )

        .phase('test', phase => phase
          .task(task('smoke-test-green')
            .description('Run smoke tests on green deployment')
            .run(async (ctx) => {
              // Run tests against green deployment
              const ush = new UshAdapter({});
              await ush.connect();

              const result = await ush.execute(
                `./scripts/smoke-test.sh ${ctx.vars.app}-green ${ctx.vars.environment}`
              );

              if (!result.success) {
                throw new Error('Smoke tests failed');
              }
            })
            .retry(3)
          )
        )

        .phase('switch', phase => phase
          .task(task('switch-traffic')
            .description('Switch traffic to green deployment')
            .run(async (ctx) => {
              const k8s = new KubernetesAdapter({
                ...config.kubernetes,
                namespace: ctx.vars.environment,
              });

              await k8s.connect();

              // Update service selector to point to green
              await k8s.patch(
                'service',
                ctx.vars.app,
                {
                  spec: {
                    selector: {
                      app: ctx.vars.app,
                      deployment: 'green',
                    },
                  },
                },
                { type: 'merge' }
              );

              await k8s.disconnect();
            })
          )

          .task(task('monitor-metrics')
            .description('Monitor application metrics')
            .run(async (ctx) => {
              // Wait and check metrics
              await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute

              // Check error rate, latency, etc.
              // If metrics are bad, throw error to trigger rollback
            })
          )
        )

        .phase('cleanup', phase => phase
          .task(task('remove-blue-deployment')
            .description('Remove old blue deployment')
            .run(async (ctx) => {
              const k8s = new KubernetesAdapter({
                ...config.kubernetes,
                namespace: ctx.vars.environment,
              });

              await k8s.connect();

              // Delete old deployment
              await k8s.delete('deployment', ctx.vars.app);

              // Rename green to normal name
              const green = await k8s.get(
                'deployment',
                `${ctx.vars.app}-green`,
                { output: 'json' }
              );

              const deployment = JSON.parse(green.output || '{}');
              deployment.metadata.name = ctx.vars.app;
              delete deployment.metadata.resourceVersion;

              await k8s.apply(deployment);
              await k8s.delete('deployment', `${ctx.vars.app}-green`);

              await k8s.disconnect();
            })
          )
        )

        .onError(async (error, ctx) => {
          console.error('Deployment failed, rolling back...', error);

          // Rollback by switching traffic back to blue
          const k8s = new KubernetesAdapter({
            ...config.kubernetes,
            namespace: ctx.vars.environment,
          });

          await k8s.connect();

          await k8s.patch(
            'service',
            ctx.vars.app,
            {
              spec: {
                selector: {
                  app: ctx.vars.app,
                  deployment: 'blue',
                },
              },
            },
            { type: 'merge' }
          );

          // Clean up green deployment
          await k8s.delete('deployment', `${ctx.vars.app}-green`);
          await k8s.disconnect();
        })

        .build(),
    },

    // Disaster recovery pattern
    disasterRecovery: {
      name: 'disasterRecovery',
      type: 'custom',
      description: 'Disaster recovery from state snapshots',
      template: async (params: { environment: string; snapshotId?: string }) => recipe('disaster-recovery')
        .description(`Recover ${params.environment} environment from snapshot`)
        .vars(params)

        .phase('backup', phase => phase
          .task(task('create-backup')
            .description('Create current state backup')
            .run(async (ctx) => {
              // Create snapshots of all resources
              const resources = [
                `vpc-${ctx.vars.environment}`,
                `eks-${ctx.vars.environment}`,
              ];

              for (const resourceId of resources) {
                await stateManager.createSnapshot(resourceId);
              }
            })
          )
        )

        .phase('restore', phase => phase
          .task(task('restore-infrastructure')
            .description('Restore infrastructure from state')
            .run(async (ctx) => {
              if (ctx.vars.snapshotId) {
                await stateManager.restoreFromSnapshot(ctx.vars.snapshotId);
              } else {
                // Find latest snapshot
                const vpcState = await stateManager.getCurrentState(`vpc-${ctx.vars.environment}`);
                if (!vpcState) {
                  throw new Error('No state found to restore from');
                }
              }

              // Re-apply terraform with state
              const terraform = new TerraformAdapter(config.terraform);
              await terraform.connect();

              await terraform.init({ reconfigure: true });
              await terraform.apply();

              await terraform.disconnect();
            })
          )
        )

        .phase('verify', phase => phase
          .task(task('verify-recovery')
            .description('Verify infrastructure is recovered')
            .run(async (ctx) => {
              const health = await moduleRegistry
                .getTaskRegistry()
                .execute('aws-infrastructure:healthCheck', {
                  environment: ctx.vars.environment,
                });

              console.log('Health check results:', health);

              if (health.cluster !== 'healthy') {
                throw new Error('Cluster recovery failed');
              }
            })
          )
        )

        .build(),
    },
  },

  // Module lifecycle
  onInstall: async () => {
    console.log('AWS Infrastructure module installed');

    // Verify required tools
    const ush = new UshAdapter({});
    await ush.connect();

    const checks = await parallel([
      ush.which('terraform'),
      ush.which('kubectl'),
      ush.which('aws'),
    ]);

    if (checks.some(path => !path)) {
      throw new Error('Required tools not found');
    }
  },

  onHealthCheck: async () => {
    // Check integrations
    const terraform = new TerraformAdapter(config.terraform);
    const k8s = new KubernetesAdapter(config.kubernetes);

    try {
      await terraform.connect();
      await k8s.connect();

      return {
        status: 'healthy',
        timestamp: Date.now(),
        details: {
          terraform: 'connected',
          kubernetes: 'connected',
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: Date.now(),
        message: error.message,
      };
    } finally {
      await terraform.disconnect();
      await k8s.disconnect();
    }
  },
});

// Main execution
async function main() {
  // Initialize state management
  const stateManager = new StateManager({
    storage: {
      type: 'memory', // In production, use postgres or s3
      config: {},
    },
    snapshotInterval: 10,
    snapshotRetention: 5,
    compressionEnabled: true,
    encryptionEnabled: false, // Enable in production
  });

  await stateManager.initialize();

  // Initialize module registry
  const moduleRegistry = new ModuleRegistry();

  // Register infrastructure module
  const infraModule = createInfrastructureModule(stateManager);
  await moduleRegistry.register(infraModule);

  // Example: Full infrastructure deployment
  const deploymentRecipe = recipe('full-deployment')
    .description('Deploy complete infrastructure')
    .vars({
      environment: 'production',
      appVersion: '1.5.0',
    })

    .phase('infrastructure', phase => phase
      .task(task('setup-networking')
        .description('Setup VPC and networking')
        .run(async (ctx) => {
          await moduleRegistry.getTaskRegistry().execute(
            'aws-infrastructure:setupNetworking',
            { environment: ctx.vars.environment }
          );
        })
      )

      .task(task('create-cluster')
        .description('Create EKS cluster')
        .run(async (ctx) => {
          await moduleRegistry.getTaskRegistry().execute(
            'aws-infrastructure:createEksCluster',
            {
              environment: ctx.vars.environment,
              nodeCount: 3,
              instanceType: 't3.medium',
            }
          );
        })
      )
    )

    .phase('applications', phase => phase
      .task(task('deploy-apps')
        .description('Deploy all applications')
        .run(async (ctx) => {
          const apps = ['frontend', 'api', 'worker'];

          await parallel(
            apps.map(app =>
              moduleRegistry.getTaskRegistry().execute(
                'aws-infrastructure:deployApplication',
                {
                  app,
                  version: ctx.vars.appVersion,
                  replicas: 3,
                  environment: ctx.vars.environment,
                }
              )
            )
          );
        })
      )
    )

    .phase('verification', phase => phase
      .task(task('health-check')
        .description('Verify deployment health')
        .run(async (ctx) => {
          const health = await moduleRegistry.getTaskRegistry().execute(
            'aws-infrastructure:healthCheck',
            { environment: ctx.vars.environment }
          );

          console.log('Deployment health:', JSON.stringify(health, null, 2));
        })
      )
    )

    .build();

  // Execute deployment
  console.log('Starting infrastructure deployment...');
  // await deploymentRecipe.execute();

  // Example: Use blue-green pattern
  const blueGreenPattern = await moduleRegistry
    .getPatternRegistry()
    .instantiate('aws-infrastructure:blueGreenDeployment', {
      app: 'frontend',
      version: '1.6.0',
      environment: 'production',
    });

  console.log('Blue-green deployment created');
  // await blueGreenPattern.execute();

  // Show state history and ledger
  console.log('\n=== State History ===');
  const history = await stateManager.getHistory('app-frontend-production', {
    limit: 5,
    includeEvents: true,
  });

  for (const change of history) {
    console.log(`${change.operation} at ${new Date(change.timestamp).toISOString()}`);
    console.log(`  Version: ${change.version}`);
    console.log(`  Actor: ${change.actor}`);
  }

  // Verify ledger integrity
  console.log('\n=== Ledger Verification ===');
  const ledger = (stateManager as any).ledger;
  const chainValid = await ledger.verifyChain();
  console.log(`Ledger chain integrity: ${chainValid ? 'VALID ✓' : 'INVALID ✗'}`);
}

// Error handling and cleanup
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { main, createInfrastructureModule };