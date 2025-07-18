import { task, recipe, parallel } from '@xec-js/core';
import { k8sModule, awsModule, dockerModule, monitoringModule } from '@xec-js/core/modules/builtin';

/**
 * Complete microservices deployment pattern
 * 
 * This example demonstrates how to deploy a full microservices
 * architecture with proper infrastructure, monitoring, and scaling.
 */

export const microservicesDeployment = recipe('microservices-deployment')
  .description('Deploy a complete microservices architecture')
  .variables({
    appName: 'myapp',
    environment: 'production',
    domain: 'myapp.example.com',
    services: [
      { name: 'api-gateway', image: 'myapp/gateway:latest', replicas: 3, port: 8080 },
      { name: 'auth-service', image: 'myapp/auth:latest', replicas: 2, port: 3000 },
      { name: 'user-service', image: 'myapp/users:latest', replicas: 2, port: 3001 },
      { name: 'order-service', image: 'myapp/orders:latest', replicas: 3, port: 3002 },
      { name: 'notification-service', image: 'myapp/notifications:latest', replicas: 2, port: 3003 }
    ],
    enableMonitoring: true,
    enableAutoScaling: true,
    enableServiceMesh: false
  })

  // Phase 1: Infrastructure Setup
  .phase('infrastructure', phase => phase
    .description('Set up cloud infrastructure')

    // Create VPC and networking
    .task(task('create-network', async ({ vars, log }) => {
      log.info('Creating VPC and network infrastructure...');

      await awsModule.tasks.cloudformation.run({
        vars,
        log,
        params: {
          stackName: `${vars.appName}-network`,
          templateBody: {
            AWSTemplateFormatVersion: '2010-09-09',
            Resources: {
              VPC: {
                Type: 'AWS::EC2::VPC',
                Properties: {
                  CidrBlock: '10.0.0.0/16',
                  EnableDnsHostnames: true,
                  Tags: [{ Key: 'Name', Value: `${vars.appName}-vpc` }]
                }
              },
              PublicSubnet1: {
                Type: 'AWS::EC2::Subnet',
                Properties: {
                  VpcId: { Ref: 'VPC' },
                  CidrBlock: '10.0.1.0/24',
                  AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] }
                }
              },
              PublicSubnet2: {
                Type: 'AWS::EC2::Subnet',
                Properties: {
                  VpcId: { Ref: 'VPC' },
                  CidrBlock: '10.0.2.0/24',
                  AvailabilityZone: { 'Fn::Select': [1, { 'Fn::GetAZs': '' }] }
                }
              },
              PrivateSubnet1: {
                Type: 'AWS::EC2::Subnet',
                Properties: {
                  VpcId: { Ref: 'VPC' },
                  CidrBlock: '10.0.10.0/24',
                  AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] }
                }
              },
              PrivateSubnet2: {
                Type: 'AWS::EC2::Subnet',
                Properties: {
                  VpcId: { Ref: 'VPC' },
                  CidrBlock: '10.0.11.0/24',
                  AvailabilityZone: { 'Fn::Select': [1, { 'Fn::GetAZs': '' }] }
                }
              }
            }
          },
          wait: true
        }
      });
    }))

    // Create EKS cluster
    .task(task('create-eks-cluster', async ({ vars, log }) => {
      log.info('Creating EKS cluster...');

      await awsModule.tasks.cloudformation.run({
        vars,
        log,
        params: {
          stackName: `${vars.appName}-eks`,
          templateBody: {
            AWSTemplateFormatVersion: '2010-09-09',
            Resources: {
              EKSCluster: {
                Type: 'AWS::EKS::Cluster',
                Properties: {
                  Name: `${vars.appName}-cluster`,
                  RoleArn: { 'Fn::GetAtt': ['EKSServiceRole', 'Arn'] },
                  ResourcesVpcConfig: {
                    SubnetIds: [
                      { Ref: 'PrivateSubnet1' },
                      { Ref: 'PrivateSubnet2' }
                    ]
                  }
                }
              },
              EKSServiceRole: {
                Type: 'AWS::IAM::Role',
                Properties: {
                  AssumeRolePolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [{
                      Effect: 'Allow',
                      Principal: { Service: 'eks.amazonaws.com' },
                      Action: 'sts:AssumeRole'
                    }]
                  },
                  ManagedPolicyArns: [
                    'arn:aws:iam::aws:policy/AmazonEKSClusterPolicy'
                  ]
                }
              }
            }
          },
          wait: true
        }
      });
    }))

    // Set up RDS for persistent storage
    .task(task('create-databases', async ({ vars, log }) => {
      log.info('Creating RDS instances...');

      await parallel(
        awsModule.tasks.rds.run({
          vars,
          log,
          params: {
            dbInstanceIdentifier: `${vars.appName}-primary`,
            engine: 'postgres',
            instanceClass: 'db.r5.large',
            allocatedStorage: 100,
            masterPassword: vars.dbPassword || 'ChangeMeNow123!'
          }
        }),
        awsModule.tasks.rds.run({
          vars,
          log,
          params: {
            dbInstanceIdentifier: `${vars.appName}-analytics`,
            engine: 'postgres',
            instanceClass: 'db.t3.medium',
            allocatedStorage: 50,
            masterPassword: vars.dbPassword || 'ChangeMeNow123!'
          }
        })
      );
    }))
  )

  // Phase 2: Kubernetes Setup
  .phase('kubernetes', phase => phase
    .description('Configure Kubernetes cluster')
    .dependsOn('infrastructure')

    // Create namespaces
    .task(task('create-namespaces', async ({ vars, $ }) => {
      const namespaces = [vars.appName, `${vars.appName}-monitoring`, `${vars.appName}-ingress`];

      for (const ns of namespaces) {
        await $`kubectl create namespace ${ns} --dry-run=client -o yaml | kubectl apply -f -`;
      }
    }))

    // Deploy ingress controller
    .task(task('deploy-ingress', async ({ vars }) => {
      await k8sModule.tasks.helm.run({
        vars,
        params: {
          release: 'nginx-ingress',
          chart: 'ingress-nginx/ingress-nginx',
          namespace: `${vars.appName}-ingress`,
          repo: 'ingress-nginx=https://kubernetes.github.io/ingress-nginx',
          values: {
            'controller.service.type': 'LoadBalancer',
            'controller.metrics.enabled': true
          }
        }
      });
    }))

    // Set up service mesh if enabled
    .task(task('deploy-service-mesh', async ({ vars, skip }) => {
      if (!vars.enableServiceMesh) {
        skip('Service mesh not enabled');
      }

      await k8sModule.tasks.helm.run({
        vars,
        params: {
          release: 'istio-base',
          chart: 'istio/base',
          namespace: 'istio-system',
          repo: 'istio=https://istio-release.storage.googleapis.com/charts'
        }
      });
    }))
  )

  // Phase 3: Application Deployment
  .phase('deployment', phase => phase
    .description('Deploy microservices')
    .dependsOn('kubernetes')

    // Deploy all services
    .task(task('deploy-services', async ({ vars, log }) => {
      log.info('Deploying microservices...');

      await parallel(
        ...vars.services.map(service =>
          k8sModule.tasks.deploy.run({
            vars,
            log,
            params: {
              name: service.name,
              image: service.image,
              replicas: service.replicas,
              namespace: vars.appName,
              port: service.port,
              env: {
                ENVIRONMENT: vars.environment,
                DB_HOST: `${vars.appName}-primary.rds.amazonaws.com`,
                REDIS_HOST: `${vars.appName}-redis`
              },
              resources: {
                requests: { cpu: '100m', memory: '128Mi' },
                limits: { cpu: '500m', memory: '512Mi' }
              }
            }
          })
        )
      );
    }))

    // Configure ingress rules
    .task(task('configure-ingress', async ({ vars }) => {
      await k8sModule.tasks.ingress.run({
        vars,
        params: {
          name: `${vars.appName}-ingress`,
          namespace: vars.appName,
          host: vars.domain,
          serviceName: 'api-gateway',
          servicePort: 8080,
          annotations: {
            'kubernetes.io/ingress.class': 'nginx',
            'cert-manager.io/cluster-issuer': 'letsencrypt-prod',
            'nginx.ingress.kubernetes.io/rate-limit': '100'
          },
          tlsSecret: `${vars.appName}-tls`
        }
      });
    }))

    // Set up horizontal pod autoscaling
    .task(task('configure-autoscaling', async ({ vars, $, skip }) => {
      if (!vars.enableAutoScaling) {
        skip('Auto-scaling not enabled');
      }

      for (const service of vars.services) {
        await $`kubectl autoscale deployment ${service.name} \
          --namespace ${vars.appName} \
          --cpu-percent=70 \
          --min=${service.replicas} \
          --max=${service.replicas * 3}`;
      }
    }))
  )

  // Phase 4: Monitoring Setup
  .phase('monitoring', phase => phase
    .description('Set up monitoring and observability')
    .dependsOn('deployment')
    .condition(vars => vars.enableMonitoring)

    // Deploy monitoring stack
    .task(task('deploy-monitoring', async ({ vars }) => {
      await monitoringModule.patterns.fullStackMonitoring.template({
        vars,
        params: {
          namespace: `${vars.appName}-monitoring`,
          includeLogging: true,
          includeTracing: true,
          includeAlerts: true
        }
      });
    }))

    // Configure service monitoring
    .task(task('configure-service-monitoring', async ({ vars }) => {
      // Create service-specific dashboards
      for (const service of vars.services) {
        await monitoringModule.tasks.grafana.run({
          vars,
          params: {
            action: 'import-dashboard',
            dashboardJson: {
              title: `${service.name} Monitoring`,
              panels: [
                {
                  title: 'Request Rate',
                  query: `rate(http_requests_total{service="${service.name}"}[5m])`
                },
                {
                  title: 'Error Rate',
                  query: `rate(http_requests_total{service="${service.name}",status=~"5.."}[5m])`
                },
                {
                  title: 'Response Time (p95)',
                  query: `histogram_quantile(0.95, http_request_duration_seconds_bucket{service="${service.name}"})`
                },
                {
                  title: 'Pod CPU Usage',
                  query: `rate(container_cpu_usage_seconds_total{pod=~"${service.name}.*"}[5m])`
                }
              ]
            }
          }
        });
      }
    }))

    // Set up alerts
    .task(task('configure-alerts', async ({ vars }) => {
      await monitoringModule.tasks.alerts.run({
        vars,
        params: {
          action: 'create-rules',
          rules: [
            {
              name: 'ServiceDown',
              expression: 'up{job="kubernetes-pods"} == 0',
              duration: '2m',
              summary: 'Service {{ $labels.pod }} is down',
              labels: { severity: 'critical' }
            },
            {
              name: 'HighErrorRate',
              expression: 'rate(http_requests_total{status=~"5.."}[5m]) > 0.05',
              duration: '5m',
              summary: 'High error rate for {{ $labels.service }}',
              labels: { severity: 'warning' }
            },
            {
              name: 'HighResponseTime',
              expression: 'histogram_quantile(0.95, http_request_duration_seconds_bucket) > 1',
              duration: '10m',
              summary: 'High response time for {{ $labels.service }}',
              labels: { severity: 'warning' }
            }
          ]
        }
      });
    }))
  )

  // Phase 5: Testing & Validation
  .phase('validation', phase => phase
    .description('Validate deployment')
    .dependsOn('monitoring')

    // Run health checks
    .task(task('health-checks', async ({ vars, log, http }) => {
      log.info('Running health checks...');

      const healthEndpoints = vars.services.map(s => ({
        name: s.name,
        url: `http://${vars.domain}/${s.name}/health`
      }));

      const results = await parallel(
        ...healthEndpoints.map(async endpoint => {
          try {
            const response = await http.get(endpoint.url, { timeout: 5000 });
            return { service: endpoint.name, status: response.status, healthy: response.status === 200 };
          } catch (error) {
            return { service: endpoint.name, status: 0, healthy: false, error };
          }
        })
      );

      const unhealthy = results.filter(r => !r.healthy);
      if (unhealthy.length > 0) {
        throw new Error(`Unhealthy services: ${unhealthy.map(s => s.service).join(', ')}`);
      }

      log.info('All services are healthy');
      return results;
    }))

    // Run smoke tests
    .task(task('smoke-tests', async ({ vars, log, $ }) => {
      log.info('Running smoke tests...');

      // Run test suite
      const testImage = `${vars.appName}/tests:latest`;
      await dockerModule.tasks.run.run({
        vars,
        log,
        $,
        params: {
          image: testImage,
          rm: true,
          env: {
            API_URL: `https://${vars.domain}`,
            ENVIRONMENT: vars.environment
          },
          command: 'npm test -- --suite=smoke'
        }
      });
    }))

    // Generate deployment report
    .task(task('deployment-report', async ({ vars, log, fs }) => {
      log.info('Generating deployment report...');

      const report = {
        deployment: {
          name: vars.appName,
          environment: vars.environment,
          timestamp: new Date().toISOString(),
          domain: vars.domain
        },
        services: vars.services.map(s => ({
          name: s.name,
          image: s.image,
          replicas: s.replicas,
          status: 'deployed'
        })),
        infrastructure: {
          cluster: `${vars.appName}-cluster`,
          region: vars.region || 'us-east-1',
          monitoring: vars.enableMonitoring,
          autoScaling: vars.enableAutoScaling,
          serviceMesh: vars.enableServiceMesh
        },
        endpoints: {
          application: `https://${vars.domain}`,
          monitoring: vars.enableMonitoring ? `https://grafana.${vars.domain}` : null,
          logs: vars.enableMonitoring ? `https://logs.${vars.domain}` : null
        }
      };

      await fs.write(`deployment-report-${Date.now()}.json`, JSON.stringify(report, null, 2));

      log.info('Deployment completed successfully!');
      return report;
    }))
  )

  .build();

// Canary deployment variant
export const canaryDeployment = recipe('canary-deployment')
  .description('Perform canary deployment of microservices')
  .extends(microservicesDeployment)

  .phase('canary', phase => phase
    .description('Canary deployment')
    .after('deployment')
    .before('validation')

    .task(task('deploy-canary', async ({ vars, log }) => {
      log.info('Starting canary deployment...');

      // Deploy canary versions
      for (const service of vars.services) {
        await k8sModule.patterns.canaryDeployment.template({
          vars,
          log,
          params: {
            name: service.name,
            newImage: service.image.replace(':latest', ':canary'),
            namespace: vars.appName,
            canaryPercentage: 10,
            incrementalSteps: [10, 25, 50, 100],
            stepDuration: 300 // 5 minutes per step
          }
        });
      }
    }))
  )

  .build();

// Blue-green deployment variant
export const blueGreenDeployment = recipe('blue-green-deployment')
  .description('Perform blue-green deployment of microservices')
  .extends(microservicesDeployment)

  .phase('blue-green', phase => phase
    .description('Blue-green deployment')
    .replaces('deployment')

    .task(task('deploy-green', async ({ vars, log }) => {
      log.info('Deploying green environment...');

      // Deploy all services with -green suffix
      const greenServices = vars.services.map(s => ({
        ...s,
        name: `${s.name}-green`
      }));

      await parallel(
        ...greenServices.map(service =>
          k8sModule.tasks.deploy.run({
            vars,
            log,
            params: {
              name: service.name,
              image: service.image,
              replicas: service.replicas,
              namespace: vars.appName,
              port: service.port
            }
          })
        )
      );
    }))

    .task(task('test-green', async ({ vars, log }) => {
      log.info('Testing green environment...');

      // Run tests against green environment
      await dockerModule.tasks.run.run({
        vars,
        log,
        params: {
          image: `${vars.appName}/tests:latest`,
          rm: true,
          env: {
            API_URL: `http://api-gateway-green:8080`,
            ENVIRONMENT: 'green'
          },
          command: 'npm test'
        }
      });
    }))

    .task(task('switch-traffic', async ({ vars, log, $ }) => {
      log.info('Switching traffic to green environment...');

      // Update service selectors to point to green
      for (const service of vars.services) {
        await $`kubectl patch service ${service.name} \
          -n ${vars.appName} \
          -p '{"spec":{"selector":{"version":"green"}}}'`;
      }

      log.info('Traffic switched to green environment');
    }))

    .task(task('cleanup-blue', async ({ vars, log, $ }) => {
      log.info('Cleaning up blue environment...');

      // Delete old blue deployments
      for (const service of vars.services) {
        await $`kubectl delete deployment ${service.name}-blue \
          -n ${vars.appName} --ignore-not-found`;
      }
    }))
  )

  .build();