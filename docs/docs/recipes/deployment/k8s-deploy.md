---
title: Kubernetes Deployment
description: Deploy applications to Kubernetes clusters using Xec
keywords: [kubernetes, k8s, deployment, helm, kubectl, pods]
source_files:
  - packages/core/src/adapters/k8s-adapter.ts
  - packages/core/src/k8s/kubectl-client.ts
  - packages/core/src/k8s/pod-executor.ts
  - packages/core/src/k8s/port-forward.ts
key_functions:
  - K8sAdapter.execute()
  - KubectlClient.apply()
  - PodExecutor.exec()
  - PortForward.forward()
verification_date: 2025-01-03
---

# Kubernetes Deployment

## Problem

Deploying and managing applications in Kubernetes clusters, including handling deployments, services, ingress, config maps, secrets, and performing rolling updates with zero downtime.

## Solution

Xec provides native Kubernetes integration through its execution engine, enabling seamless deployment automation, pod management, and cluster operations using familiar TypeScript/JavaScript syntax.

## Quick Example

```typescript
// k8s-deploy.ts
import { $ } from '@xec-sh/core';

const namespace = 'production';
const image = 'registry.example.com/myapp:v1.2.3';

// Update deployment
await $`
  kubectl set image deployment/myapp \
    myapp=${image} \
    --namespace=${namespace} \
    --record
`;

// Wait for rollout
await $`
  kubectl rollout status deployment/myapp \
    --namespace=${namespace} \
    --timeout=5m
`;
```

## Complete Kubernetes Deployment Recipes

### Configuration

```yaml
# .xec/config.yaml
targets:
  k8s-dev:
    type: kubernetes
    context: dev-cluster
    namespace: development
    
  k8s-staging:
    type: kubernetes
    context: staging-cluster
    namespace: staging
    
  k8s-prod:
    type: kubernetes
    context: prod-cluster
    namespace: production
    
tasks:
  k8s-deploy:
    description: Deploy to Kubernetes
    params:
      - name: env
        required: true
        values: [dev, staging, production]
      - name: version
        required: true
      - name: replicas
        default: 3
    command: xec run scripts/k8s-deploy.ts ${params.env} ${params.version} ${params.replicas}
```

### Full Kubernetes Deployment Script

```typescript
// scripts/k8s-deploy.ts
import { $, $$ } from '@xec-sh/core';
import chalk from 'chalk';
import { readFile, writeFile } from 'fs/promises';
import * as yaml from 'js-yaml';

const environment = process.argv[2];
const version = process.argv[3];
const replicas = parseInt(process.argv[4] || '3');

// Environment configuration
const config = {
  dev: {
    namespace: 'development',
    context: 'dev-cluster',
    replicas: 1,
    resources: {
      requests: { memory: '256Mi', cpu: '100m' },
      limits: { memory: '512Mi', cpu: '500m' }
    },
    ingress: {
      host: 'dev.example.com',
      tls: false
    }
  },
  staging: {
    namespace: 'staging',
    context: 'staging-cluster',
    replicas: 2,
    resources: {
      requests: { memory: '512Mi', cpu: '250m' },
      limits: { memory: '1Gi', cpu: '1000m' }
    },
    ingress: {
      host: 'staging.example.com',
      tls: true
    }
  },
  production: {
    namespace: 'production',
    context: 'prod-cluster',
    replicas: replicas,
    resources: {
      requests: { memory: '1Gi', cpu: '500m' },
      limits: { memory: '2Gi', cpu: '2000m' }
    },
    ingress: {
      host: 'example.com',
      tls: true
    }
  }
};

const env = config[environment];
if (!env) {
  console.error(chalk.red(`Unknown environment: ${environment}`));
  process.exit(1);
}

console.log(chalk.blue(`🚀 Deploying to Kubernetes ${environment}...`));

// Switch context
await $`kubectl config use-context ${env.context}`;

// Create namespace if it doesn't exist
await $`kubectl create namespace ${env.namespace} --dry-run=client -o yaml | kubectl apply -f -`;

// Deploy application
async function deployApplication() {
  console.log(chalk.gray('Generating Kubernetes manifests...'));
  
  // 1. Create ConfigMap
  const configMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: 'myapp-config',
      namespace: env.namespace
    },
    data: {
      NODE_ENV: environment,
      API_URL: `https://api.${env.ingress.host}`,
      LOG_LEVEL: environment === 'production' ? 'info' : 'debug'
    }
  };
  
  // 2. Create Secret
  const secret = {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: 'myapp-secrets',
      namespace: env.namespace
    },
    type: 'Opaque',
    stringData: {
      DATABASE_URL: process.env[`${environment.toUpperCase()}_DATABASE_URL`],
      JWT_SECRET: process.env[`${environment.toUpperCase()}_JWT_SECRET`],
      API_KEY: process.env[`${environment.toUpperCase()}_API_KEY`]
    }
  };
  
  // 3. Create Deployment
  const deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'myapp',
      namespace: env.namespace,
      labels: {
        app: 'myapp',
        version: version,
        environment: environment
      }
    },
    spec: {
      replicas: env.replicas,
      selector: {
        matchLabels: {
          app: 'myapp'
        }
      },
      strategy: {
        type: 'RollingUpdate',
        rollingUpdate: {
          maxSurge: 1,
          maxUnavailable: 0
        }
      },
      template: {
        metadata: {
          labels: {
            app: 'myapp',
            version: version
          },
          annotations: {
            'prometheus.io/scrape': 'true',
            'prometheus.io/port': '9090',
            'prometheus.io/path': '/metrics'
          }
        },
        spec: {
          serviceAccountName: 'myapp-sa',
          containers: [{
            name: 'myapp',
            image: `registry.example.com/myapp:${version}`,
            imagePullPolicy: 'IfNotPresent',
            ports: [
              { containerPort: 3000, name: 'http' },
              { containerPort: 9090, name: 'metrics' }
            ],
            envFrom: [
              { configMapRef: { name: 'myapp-config' } },
              { secretRef: { name: 'myapp-secrets' } }
            ],
            resources: env.resources,
            livenessProbe: {
              httpGet: {
                path: '/health',
                port: 3000
              },
              initialDelaySeconds: 30,
              periodSeconds: 10,
              timeoutSeconds: 5,
              failureThreshold: 3
            },
            readinessProbe: {
              httpGet: {
                path: '/ready',
                port: 3000
              },
              initialDelaySeconds: 5,
              periodSeconds: 5,
              timeoutSeconds: 3,
              failureThreshold: 3
            },
            volumeMounts: [
              {
                name: 'config',
                mountPath: '/app/config',
                readOnly: true
              },
              {
                name: 'data',
                mountPath: '/app/data'
              }
            ]
          }],
          volumes: [
            {
              name: 'config',
              configMap: {
                name: 'myapp-config'
              }
            },
            {
              name: 'data',
              persistentVolumeClaim: {
                claimName: 'myapp-pvc'
              }
            }
          ],
          affinity: {
            podAntiAffinity: {
              preferredDuringSchedulingIgnoredDuringExecution: [{
                weight: 100,
                podAffinityTerm: {
                  labelSelector: {
                    matchExpressions: [{
                      key: 'app',
                      operator: 'In',
                      values: ['myapp']
                    }]
                  },
                  topologyKey: 'kubernetes.io/hostname'
                }
              }]
            }
          }
        }
      }
    }
  };
  
  // 4. Create Service
  const service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'myapp-service',
      namespace: env.namespace,
      labels: {
        app: 'myapp'
      }
    },
    spec: {
      type: 'ClusterIP',
      selector: {
        app: 'myapp'
      },
      ports: [
        { port: 80, targetPort: 3000, name: 'http' },
        { port: 9090, targetPort: 9090, name: 'metrics' }
      ]
    }
  };
  
  // 5. Create Ingress
  const ingress = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: 'myapp-ingress',
      namespace: env.namespace,
      annotations: {
        'kubernetes.io/ingress.class': 'nginx',
        'cert-manager.io/cluster-issuer': env.ingress.tls ? 'letsencrypt-prod' : undefined,
        'nginx.ingress.kubernetes.io/ssl-redirect': env.ingress.tls ? 'true' : 'false',
        'nginx.ingress.kubernetes.io/rate-limit': '100',
        'nginx.ingress.kubernetes.io/proxy-body-size': '10m'
      }
    },
    spec: {
      tls: env.ingress.tls ? [{
        hosts: [env.ingress.host],
        secretName: `${env.ingress.host}-tls`
      }] : undefined,
      rules: [{
        host: env.ingress.host,
        http: {
          paths: [{
            path: '/',
            pathType: 'Prefix',
            backend: {
              service: {
                name: 'myapp-service',
                port: { number: 80 }
              }
            }
          }]
        }
      }]
    }
  };
  
  // 6. Create HorizontalPodAutoscaler
  const hpa = {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: {
      name: 'myapp-hpa',
      namespace: env.namespace
    },
    spec: {
      scaleTargetRef: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        name: 'myapp'
      },
      minReplicas: env.replicas,
      maxReplicas: env.replicas * 3,
      metrics: [
        {
          type: 'Resource',
          resource: {
            name: 'cpu',
            target: {
              type: 'Utilization',
              averageUtilization: 70
            }
          }
        },
        {
          type: 'Resource',
          resource: {
            name: 'memory',
            target: {
              type: 'Utilization',
              averageUtilization: 80
            }
          }
        }
      ]
    }
  };
  
  // 7. Create PersistentVolumeClaim
  const pvc = {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: 'myapp-pvc',
      namespace: env.namespace
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      storageClassName: 'standard',
      resources: {
        requests: {
          storage: '10Gi'
        }
      }
    }
  };
  
  // Apply manifests
  console.log(chalk.gray('Applying manifests...'));
  
  const manifests = [configMap, secret, pvc, deployment, service, ingress, hpa];
  
  for (const manifest of manifests) {
    const yamlStr = yaml.dump(manifest);
    await writeFile(`/tmp/${manifest.kind.toLowerCase()}.yaml`, yamlStr);
    
    const result = await $`
      kubectl apply -f /tmp/${manifest.kind.toLowerCase()}.yaml
    `.nothrow();
    
    if (!result.ok) {
      console.error(chalk.red(`Failed to apply ${manifest.kind}: ${result.error.message}`));
      process.exit(1);
    }
    
    console.log(chalk.gray(`  ✓ ${manifest.kind} applied`));
  }
  
  // Wait for rollout
  console.log(chalk.gray('Waiting for rollout to complete...'));
  await $`
    kubectl rollout status deployment/myapp \
      --namespace=${env.namespace} \
      --timeout=5m
  `;
  
  // Verify deployment
  await verifyDeployment();
}

async function verifyDeployment() {
  console.log(chalk.gray('Verifying deployment...'));
  
  // Check pod status
  const pods = await $`
    kubectl get pods \
      --namespace=${env.namespace} \
      --selector=app=myapp \
      --output=json
  `.json();
  
  const runningPods = pods.items.filter(pod => 
    pod.status.phase === 'Running' && 
    pod.status.conditions.find(c => c.type === 'Ready' && c.status === 'True')
  );
  
  if (runningPods.length < env.replicas) {
    console.error(chalk.red(`Only ${runningPods.length}/${env.replicas} pods are running`));
    
    // Get pod logs for debugging
    for (const pod of pods.items) {
      if (pod.status.phase !== 'Running') {
        console.log(chalk.yellow(`Pod ${pod.metadata.name} logs:`));
        await $`kubectl logs ${pod.metadata.name} --namespace=${env.namespace} --tail=20`;
      }
    }
    
    process.exit(1);
  }
  
  console.log(chalk.green(`  ✓ All ${runningPods.length} pods are running`));
  
  // Test service endpoint
  if (environment !== 'production') {
    console.log(chalk.gray('Testing service endpoint...'));
    
    // Port forward to test locally
    const portForward = $$`
      kubectl port-forward \
        service/myapp-service \
        8080:80 \
        --namespace=${env.namespace}
    `;
    
    // Wait for port forward to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test endpoint
    const healthCheck = await $`curl -f http://localhost:8080/health`.nothrow();
    
    // Kill port forward
    portForward.kill();
    
    if (!healthCheck.ok) {
      console.error(chalk.red('Health check failed'));
      process.exit(1);
    }
    
    console.log(chalk.green('  ✓ Service endpoint is healthy'));
  }
}

// Execute deployment
try {
  await deployApplication();
  
  console.log(chalk.green(`\n✅ Deployment to ${environment} completed successfully!`));
  console.log(chalk.gray(`   Application URL: https://${env.ingress.host}`));
  
  // Send notification
  await $`
    curl -X POST ${process.env.SLACK_WEBHOOK} \
      -H 'Content-Type: application/json' \
      -d '{
        "text": "✅ Kubernetes deployment to '${environment}' completed",
        "attachments": [{
          "color": "good",
          "fields": [
            {"title": "Environment", "value": "'${environment}'", "short": true},
            {"title": "Version", "value": "'${version}'", "short": true},
            {"title": "Replicas", "value": "'${env.replicas}'", "short": true},
            {"title": "URL", "value": "https://'${env.ingress.host}'", "short": true}
          ]
        }]
      }'
  `.nothrow();
  
} catch (error) {
  console.error(chalk.red(`\n❌ Deployment failed: ${error.message}`));
  
  // Rollback
  console.log(chalk.yellow('Rolling back to previous version...'));
  await $`
    kubectl rollout undo deployment/myapp \
      --namespace=${env.namespace}
  `.nothrow();
  
  process.exit(1);
}
```

### Helm Deployment

```typescript
// scripts/helm-deploy.ts
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

const environment = process.argv[2];
const version = process.argv[3];

// Helm values for different environments
const helmValues = {
  dev: {
    replicaCount: 1,
    image: {
      repository: 'registry.example.com/myapp',
      tag: version,
      pullPolicy: 'Always'
    },
    ingress: {
      enabled: true,
      hostname: 'dev.example.com',
      tls: false
    },
    resources: {
      limits: { cpu: '500m', memory: '512Mi' },
      requests: { cpu: '100m', memory: '256Mi' }
    }
  },
  production: {
    replicaCount: 3,
    image: {
      repository: 'registry.example.com/myapp',
      tag: version,
      pullPolicy: 'IfNotPresent'
    },
    ingress: {
      enabled: true,
      hostname: 'example.com',
      tls: true,
      certManager: true
    },
    resources: {
      limits: { cpu: '2000m', memory: '2Gi' },
      requests: { cpu: '500m', memory: '1Gi' }
    },
    autoscaling: {
      enabled: true,
      minReplicas: 3,
      maxReplicas: 10,
      targetCPU: 70,
      targetMemory: 80
    }
  }
};

// Deploy with Helm
console.log(chalk.blue(`Deploying with Helm to ${environment}...`));

// Create values file
await $`echo '${JSON.stringify(helmValues[environment], null, 2)}' > /tmp/values.yaml`;

// Add Helm repo if needed
await $`helm repo add myapp https://charts.example.com`.nothrow();
await $`helm repo update`;

// Deploy or upgrade
const releaseName = `myapp-${environment}`;
const namespace = environment;

await $`
  helm upgrade --install ${releaseName} \
    myapp/application \
    --namespace ${namespace} \
    --create-namespace \
    --values /tmp/values.yaml \
    --timeout 5m \
    --wait \
    --atomic
`;

console.log(chalk.green(`✅ Helm deployment completed`));
```

### Canary Deployment with Flagger

```typescript
// scripts/canary-deploy.ts
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

const version = process.argv[2];

// Create Canary resource
const canary = {
  apiVersion: 'flagger.app/v1beta1',
  kind: 'Canary',
  metadata: {
    name: 'myapp',
    namespace: 'production'
  },
  spec: {
    targetRef: {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      name: 'myapp'
    },
    service: {
      port: 80,
      targetPort: 3000,
      gateways: ['public-gateway'],
      hosts: ['example.com']
    },
    analysis: {
      interval: '1m',
      threshold: 5,
      maxWeight: 50,
      stepWeight: 10,
      metrics: [
        {
          name: 'request-success-rate',
          thresholdRange: {
            min: 99
          },
          interval: '1m'
        },
        {
          name: 'request-duration',
          thresholdRange: {
            max: 500
          },
          interval: '30s'
        }
      ],
      webhooks: [
        {
          name: 'acceptance-test',
          url: 'http://flagger-loadtester.test/',
          timeout: '30s',
          metadata: {
            type: 'bash',
            cmd: 'curl -sd "test" http://myapp-canary.production:80/api/test'
          }
        }
      ]
    }
  }
};

// Apply canary configuration
await $`echo '${JSON.stringify(canary)}' | kubectl apply -f -`;

// Trigger canary deployment
await $`
  kubectl set image deployment/myapp \
    myapp=registry.example.com/myapp:${version} \
    --namespace=production
`;

// Monitor canary progress
console.log(chalk.blue('Monitoring canary deployment...'));

let canaryComplete = false;
while (!canaryComplete) {
  const status = await $`
    kubectl get canary myapp \
      --namespace=production \
      -o jsonpath='{.status.phase}'
  `.text();
  
  console.log(chalk.gray(`Canary status: ${status}`));
  
  if (status === 'Succeeded') {
    canaryComplete = true;
    console.log(chalk.green('✅ Canary deployment succeeded'));
  } else if (status === 'Failed') {
    console.error(chalk.red('❌ Canary deployment failed'));
    process.exit(1);
  }
  
  await new Promise(resolve => setTimeout(resolve, 30000));
}
```

### GitOps with ArgoCD

```typescript
// scripts/argocd-deploy.ts
import { $ } from '@xec-sh/core';

const environment = process.argv[2];
const version = process.argv[3];

// Update manifest in Git
await $`
  git clone git@github.com:example/k8s-manifests.git /tmp/manifests &&
  cd /tmp/manifests &&
  sed -i "s|image: .*|image: registry.example.com/myapp:${version}|g" ${environment}/deployment.yaml &&
  git add . &&
  git commit -m "Update ${environment} to ${version}" &&
  git push
`;

// Sync ArgoCD application
await $`
  argocd app sync myapp-${environment} \
    --force \
    --prune \
    --timeout 300
`;

// Wait for sync
await $`
  argocd app wait myapp-${environment} \
    --health \
    --timeout 600
`;
```

## Usage Examples

```bash
# Deploy to Kubernetes
xec k8s-deploy --env=production --version=v1.2.3 --replicas=5

# Deploy with Helm
xec run scripts/helm-deploy.ts production v1.2.3

# Canary deployment
xec run scripts/canary-deploy.ts v1.2.3

# GitOps deployment
xec run scripts/argocd-deploy.ts production v1.2.3

# Execute in pod
xec in k8s:myapp-pod "ls -la /app"

# Stream logs
xec logs k8s:myapp --follow

# Port forward
xec forward k8s:myapp 8080:3000
```

## Best Practices

1. **Use namespaces** to isolate environments
2. **Set resource limits** to prevent resource exhaustion
3. **Implement health checks** (liveness and readiness probes)
4. **Use ConfigMaps and Secrets** for configuration
5. **Implement pod disruption budgets** for high availability
6. **Use anti-affinity rules** to spread pods across nodes
7. **Monitor with Prometheus** and alert on issues
8. **Use GitOps** for declarative deployments

## Troubleshooting

### Pod Issues

```bash
# Get pod status
kubectl get pods -n production

# Describe pod
kubectl describe pod myapp-xxx -n production

# Get pod logs
kubectl logs myapp-xxx -n production --tail=100

# Execute in pod
kubectl exec -it myapp-xxx -n production -- /bin/sh
```

### Service Issues

```bash
# Test service
kubectl run test --rm -it --image=busybox -- wget -O- myapp-service

# Check endpoints
kubectl get endpoints myapp-service -n production
```

### Ingress Issues

```bash
# Check ingress
kubectl describe ingress myapp-ingress -n production

# Check ingress controller logs
kubectl logs -n ingress-nginx deployment/ingress-nginx-controller
```

## Related Topics

- [Docker Deployment](./docker-deploy.md)
- [AWS Integration](../integration/aws-integration.md)
- [GitOps with CI/CD](../integration/github-actions.md)