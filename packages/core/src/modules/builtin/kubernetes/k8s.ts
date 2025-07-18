import type { XecModule, EnvironmentTaskContext } from '../../../types/environment-types.js';

const k8sModule: XecModule = {
  name: 'k8s',
  version: '1.0.0',
  description: 'Kubernetes orchestration and management',
  
  
  exports: {
    tasks: {
    deploy: {
      name: 'deploy',
      description: 'Deploy applications to Kubernetes',
      
      async handler({ $, fs, template, yaml, log, params }: EnvironmentTaskContext) {
        const {
          name,
          image,
          replicas = 1,
          namespace = 'default',
          port = 80,
          env: envVars = {},
          resources = {},
          configMaps = {},
          secrets = {},
          manifests
        } = params;
        
        log.info(`Deploying ${name} to Kubernetes...`);
        
        if (manifests) {
          // Deploy from manifest files
          if (Array.isArray(manifests)) {
            for (const manifest of manifests) {
              await $`kubectl apply -f ${manifest} -n ${namespace}`;
            }
          } else {
            await $`kubectl apply -f ${manifests} -n ${namespace}`;
          }
        } else {
          // Generate deployment manifest
          if (!name || !image) {
            throw new Error('name and image are required for deployment');
          }
          
          const deployment = {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name,
              namespace,
              labels: { app: name }
            },
            spec: {
              replicas,
              selector: {
                matchLabels: { app: name }
              },
              template: {
                metadata: {
                  labels: { app: name }
                },
                spec: {
                  containers: [{
                    name,
                    image,
                    ports: [{ containerPort: port }],
                    env: Object.entries(envVars).map(([key, value]) => ({
                      name: key,
                      value: String(value)
                    })),
                    resources: {
                      limits: resources.limits || {},
                      requests: resources.requests || {}
                    }
                  }]
                }
              }
            }
          };
          
          // Create service
          const service = {
            apiVersion: 'v1',
            kind: 'Service',
            metadata: {
              name,
              namespace
            },
            spec: {
              selector: { app: name },
              ports: [{
                protocol: 'TCP',
                port,
                targetPort: port
              }]
            }
          };
          
          // Create temporary manifest file
          const manifestPath = await fs.temp({ prefix: 'k8s-deploy-', suffix: '.yaml' });
          if (!yaml) throw new Error('YAML utility not available');
          const manifestContent = `${yaml.stringify(deployment)}
---
${yaml.stringify(service)}`;
          
          await fs.write(manifestPath, manifestContent);
          
          // Apply manifest
          await $`kubectl apply -f ${manifestPath}`;
          
          // Clean up
          await fs.rm(manifestPath);
        }
        
        log.info(`Deployment ${name} created/updated`);
        
        // Wait for rollout if requested
        if (params['wait']) {
          log.info('Waiting for rollout to complete...');
          await $`kubectl rollout status deployment/${name} -n ${namespace}`;
          log.info('Rollout completed successfully');
        }
      }
    },
    
    scale: {
      name: 'scale',
      description: 'Scale Kubernetes deployments',
      
      async handler({ $, log, params }: EnvironmentTaskContext) {
        const { 
          name,
          replicas,
          namespace = 'default',
          resourceType = 'deployment'
        } = params;
        
        if (!name || replicas === undefined) {
          throw new Error('name and replicas are required');
        }
        
        log.info(`Scaling ${resourceType}/${name} to ${replicas} replicas...`);
        
        await $`kubectl scale ${resourceType}/${name} --replicas=${replicas} -n ${namespace}`;
        
        log.info(`Scaled ${resourceType}/${name} to ${replicas} replicas`);
      }
    },
    
    rollback: {
      name: 'rollback',
      description: 'Rollback Kubernetes deployments',
      
      async handler({ $, log, params }: EnvironmentTaskContext) {
        const {
          name,
          namespace = 'default',
          revision
        } = params;
        
        if (!name) {
          throw new Error('deployment name is required');
        }
        
        log.info(`Rolling back deployment ${name}...`);
        
        if (revision) {
          await $`kubectl rollout undo deployment/${name} --to-revision=${revision} -n ${namespace}`;
        } else {
          await $`kubectl rollout undo deployment/${name} -n ${namespace}`;
        }
        
        log.info(`Rollback initiated for ${name}`);
        
        if (params['wait']) {
          await $`kubectl rollout status deployment/${name} -n ${namespace}`;
          log.info('Rollback completed');
        }
      }
    },
    
    exec: {
      name: 'exec',
      description: 'Execute commands in Kubernetes pods',
      
      async handler({ $, log, params }: EnvironmentTaskContext) {
        const {
          pod,
          command,
          namespace = 'default',
          container,
          selector
        } = params;
        
        if (!command) {
          throw new Error('command is required');
        }
        
        let podName = pod;
        
        // If selector is provided, find the pod
        if (!podName && selector) {
          const result = await $`kubectl get pods -l ${selector} -n ${namespace} -o jsonpath='{.items[0].metadata.name}'`;
          podName = result.stdout.trim();
          
          if (!podName) {
            throw new Error(`No pods found with selector: ${selector}`);
          }
        }
        
        if (!podName) {
          throw new Error('Either pod name or selector is required');
        }
        
        log.info(`Executing command in pod ${podName}...`);
        
        const containerFlag = container ? `-c ${container}` : '';
        const result = await $`kubectl exec ${podName} ${containerFlag} -n ${namespace} -- ${command}`;
        
        return result.stdout;
      }
    },
    
    logs: {
      name: 'logs',
      description: 'Get logs from Kubernetes pods',
      
      async handler({ $, log, params }: EnvironmentTaskContext) {
        const {
          name,
          namespace = 'default',
          container,
          follow = false,
          tail = 100,
          selector,
          previous = false
        } = params;
        
        const nameOrSelector = selector ? `-l ${selector}` : name;
        if (!nameOrSelector) {
          throw new Error('Either name or selector is required');
        }
        
        log.info(`Fetching logs...`);
        
        const flags = [
          container ? `-c ${container}` : '',
          follow ? '-f' : '',
          tail ? `--tail=${tail}` : '',
          previous ? '--previous' : ''
        ].filter(Boolean).join(' ');
        
        const result = await $`kubectl logs ${nameOrSelector} ${flags} -n ${namespace}`;
        
        return result.stdout;
      }
    },
    
    configMap: {
      name: 'configMap',
      description: 'Manage Kubernetes ConfigMaps',
      
      async handler({ $, fs, log, params }: EnvironmentTaskContext) {
        const {
          action = 'create',
          name,
          namespace = 'default',
          data = {},
          fromFile,
          fromEnvFile
        } = params;
        
        if (!name) {
          throw new Error('ConfigMap name is required');
        }
        
        switch (action) {
          case 'create':
          case 'update':
            log.info(`${action === 'create' ? 'Creating' : 'Updating'} ConfigMap ${name}...`);
            
            let command = `kubectl create configmap ${name} -n ${namespace}`;
            
            if (fromFile) {
              command += ` --from-file=${fromFile}`;
            } else if (fromEnvFile) {
              command += ` --from-env-file=${fromEnvFile}`;
            } else {
              // Create from data
              const dataFlags = Object.entries(data)
                .map(([key, value]) => `--from-literal=${key}=${value}`)
                .join(' ');
              command += ` ${dataFlags}`;
            }
            
            if (action === 'update') {
              command += ' --dry-run=client -o yaml | kubectl apply -f -';
            }
            
            await $`${command}`;
            log.info(`ConfigMap ${name} ${action}d`);
            break;
            
          case 'delete':
            log.info(`Deleting ConfigMap ${name}...`);
            await $`kubectl delete configmap ${name} -n ${namespace}`;
            log.info(`ConfigMap ${name} deleted`);
            break;
            
          case 'get':
            const result = await $`kubectl get configmap ${name} -n ${namespace} -o json`;
            return JSON.parse(result.stdout);
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }
    },
    
    secret: {
      name: 'secret',
      description: 'Manage Kubernetes Secrets',
      
      async handler({ $, log, params }: EnvironmentTaskContext) {
        const {
          action = 'create',
          name,
          namespace = 'default',
          type = 'generic',
          data = {},
          fromFile
        } = params;
        
        if (!name) {
          throw new Error('Secret name is required');
        }
        
        switch (action) {
          case 'create':
          case 'update':
            log.info(`${action === 'create' ? 'Creating' : 'Updating'} Secret ${name}...`);
            
            let command = `kubectl create secret ${type} ${name} -n ${namespace}`;
            
            if (fromFile) {
              command += ` --from-file=${fromFile}`;
            } else {
              const dataFlags = Object.entries(data)
                .map(([key, value]) => `--from-literal=${key}=${value}`)
                .join(' ');
              command += ` ${dataFlags}`;
            }
            
            if (action === 'update') {
              command += ' --dry-run=client -o yaml | kubectl apply -f -';
            }
            
            await $`${command}`;
            log.info(`Secret ${name} ${action}d`);
            break;
            
          case 'delete':
            log.info(`Deleting Secret ${name}...`);
            await $`kubectl delete secret ${name} -n ${namespace}`;
            log.info(`Secret ${name} deleted`);
            break;
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }
    },
    
    ingress: {
      name: 'ingress',
      description: 'Configure Kubernetes Ingress',
      
      async handler({ $, yaml, fs, log, params }: EnvironmentTaskContext) {
        const {
          name,
          namespace = 'default',
          host,
          serviceName,
          servicePort = 80,
          tlsSecret,
          annotations = {}
        } = params;
        
        if (!name || !host || !serviceName) {
          throw new Error('name, host, and serviceName are required');
        }
        
        log.info(`Creating Ingress ${name}...`);
        
        const ingress = {
          apiVersion: 'networking.k8s.io/v1',
          kind: 'Ingress',
          metadata: {
            name,
            namespace,
            annotations
          },
          spec: {
            rules: [{
              host,
              http: {
                paths: [{
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: serviceName,
                      port: {
                        number: servicePort
                      }
                    }
                  }
                }]
              }
            }]
          }
        };
        
        if (tlsSecret) {
          (ingress.spec as any).tls = [{
            hosts: [host],
            secretName: tlsSecret
          }];
        }
        
        const manifestPath = await fs.temp({ prefix: 'k8s-ingress-', suffix: '.yaml' });
        if (yaml) {
          await fs.write(manifestPath, yaml.stringify(ingress));
        } else {
          throw new Error('YAML utility not available');
        }
        
        await $`kubectl apply -f ${manifestPath}`;
        await fs.rm(manifestPath);
        
        log.info(`Ingress ${name} created`);
      }
    },
    
    helm: {
      name: 'helm',
      description: 'Deploy Helm charts',
      
      async handler({ $, log, params }: EnvironmentTaskContext) {
        const {
          action = 'install',
          release,
          chart,
          namespace = 'default',
          values = {},
          valueFiles = [],
          version,
          repo,
          wait = false,
          timeout = '5m'
        } = params;
        
        if (!release || !chart) {
          throw new Error('release and chart are required');
        }
        
        switch (action) {
          case 'install':
          case 'upgrade':
            log.info(`${action === 'install' ? 'Installing' : 'Upgrading'} Helm chart ${chart}...`);
            
            // Add repo if specified
            if (repo) {
              const [repoName, repoUrl] = repo.split('=');
              await $`helm repo add ${repoName} ${repoUrl}`;
              await $`helm repo update`;
            }
            
            // Build command
            let command = `helm ${action} ${release} ${chart} -n ${namespace}`;
            
            if (action === 'upgrade') {
              command += ' --install'; // Install if not exists
            }
            
            if (version) {
              command += ` --version ${version}`;
            }
            
            if (wait) {
              command += ` --wait --timeout ${timeout}`;
            }
            
            // Add value files
            for (const file of valueFiles) {
              command += ` -f ${file}`;
            }
            
            // Add inline values
            for (const [key, value] of Object.entries(values)) {
              command += ` --set ${key}=${value}`;
            }
            
            await $`${command}`;
            log.info(`Helm release ${release} ${action}d`);
            break;
            
          case 'uninstall':
            log.info(`Uninstalling Helm release ${release}...`);
            await $`helm uninstall ${release} -n ${namespace}`;
            log.info(`Helm release ${release} uninstalled`);
            break;
            
          case 'rollback':
            const { revision = 0 } = params;
            log.info(`Rolling back Helm release ${release}...`);
            await $`helm rollback ${release} ${revision} -n ${namespace}`;
            log.info(`Helm release ${release} rolled back`);
            break;
            
          case 'status':
            const result = await $`helm status ${release} -n ${namespace} -o json`;
            return JSON.parse(result.stdout);
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }
    }
  },
  
  helpers: {
    getPods: async (context) => {
      const { $, params } = context;
      if (!$) throw new Error('Execution engine not available');
      const { namespace = 'default', selector } = params || {};
      const selectorFlag = selector ? `-l ${selector}` : '';
      
      const result = await $`kubectl get pods ${selectorFlag} -n ${namespace} -o json`;
      return JSON.parse(result.stdout).items;
    },
    
    getServices: async (context) => {
      const { $, params } = context;
      if (!$) throw new Error('Execution engine not available');
      const { namespace = 'default' } = params || {};
      const result = await $`kubectl get services -n ${namespace} -o json`;
      return JSON.parse(result.stdout).items;
    },
    
    getDeployments: async (context) => {
      const { $, params } = context;
      if (!$) throw new Error('Execution engine not available');
      const { namespace = 'default' } = params || {};
      const result = await $`kubectl get deployments -n ${namespace} -o json`;
      return JSON.parse(result.stdout).items;
    },
    
    getNodes: async (context) => {
      const { $ } = context;
      if (!$) throw new Error('Execution engine not available');
      const result = await $`kubectl get nodes -o json`;
      return JSON.parse(result.stdout).items;
    },
    
    getNamespaces: async (context) => {
      const { $ } = context;
      if (!$) throw new Error('Execution engine not available');
      const result = await $`kubectl get namespaces -o json`;
      return JSON.parse(result.stdout).items.map((ns: any) => ns.metadata.name);
    },
    
    getEvents: async (context) => {
      const { $, params } = context;
      if (!$) throw new Error('Execution engine not available');
      const { namespace = 'default', name } = params || {};
      const fieldSelector = name ? `--field-selector involvedObject.name=${name}` : '';
      
      const result = await $`kubectl get events ${fieldSelector} -n ${namespace} -o json`;
      return JSON.parse(result.stdout).items;
    },
    
    waitForPod: async (context) => {
      const { $, params } = context;
      if (!$) throw new Error('Execution engine not available');
      const { name, namespace = 'default', condition = 'Ready', timeout = '300s' } = params || {};
      
      if (!name) {
        throw new Error('Pod name is required');
      }
      
      await $`kubectl wait --for=condition=${condition} pod/${name} -n ${namespace} --timeout=${timeout}`;
    },
    
    portForward: async (context) => {
      const { $, params } = context;
      if (!$) throw new Error('Execution engine not available');
      const { name, namespace = 'default', localPort, remotePort } = params || {};
      
      if (!name || !localPort || !remotePort) {
        throw new Error('name, localPort, and remotePort are required');
      }
      
      // This returns a process that needs to be managed
      return $`kubectl port-forward ${name} ${localPort}:${remotePort} -n ${namespace}`;
    }
  },
  
  patterns: {
    microservices: {
      name: 'microservices',
      description: 'Deploy a microservices architecture',
      
      template: async (context: EnvironmentTaskContext) => {
        const { params, log } = context;
        const {
          services = [],
          namespace = 'microservices',
          enableIstio = false,
          enableMonitoring = true
        } = params;
        
        log.info('Deploying microservices architecture...');
        
        // Create namespace
        await context.$`kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -`;
        
        // Deploy each service
        for (const service of services) {
          await k8sModule.exports?.tasks?.['deploy']?.handler({
            ...context,
            params: {
              ...service,
              namespace
            }
          });
        }
        
        // Set up service mesh if enabled
        if (enableIstio) {
          log.info('Installing Istio service mesh...');
          await k8sModule.exports?.tasks?.['helm']?.handler({
            ...context,
            params: {
              action: 'install',
              release: 'istio-base',
              chart: 'istio/base',
              namespace: 'istio-system',
              repo: 'istio=https://istio-release.storage.googleapis.com/charts'
            }
          });
        }
        
        // Set up monitoring if enabled
        if (enableMonitoring) {
          log.info('Setting up monitoring stack...');
          await k8sModule.exports?.tasks?.['helm']?.handler({
            ...context,
            params: {
              action: 'install',
              release: 'prometheus',
              chart: 'prometheus-community/kube-prometheus-stack',
              namespace,
              repo: 'prometheus-community=https://prometheus-community.github.io/helm-charts'
            }
          });
        }
        
        log.info('Microservices architecture deployed');
      }
    },
    
    blueGreenDeployment: {
      name: 'blueGreenDeployment',
      description: 'Perform blue-green deployment',
      
      template: async (context: EnvironmentTaskContext) => {
        const { params, log } = context;
        const {
          name,
          newImage,
          namespace = 'default',
          testCommand
        } = params;
        
        if (!name || !newImage) {
          throw new Error('name and newImage are required');
        }
        
        log.info(`Starting blue-green deployment for ${name}...`);
        
        // Get current deployment
        const currentDeployment = await context.$`kubectl get deployment ${name} -n ${namespace} -o json`;
        const deployment = JSON.parse(currentDeployment.stdout);
        
        // Create green deployment
        const greenDeployment = {
          ...deployment,
          metadata: {
            ...deployment.metadata,
            name: `${name}-green`
          },
          spec: {
            ...deployment.spec,
            template: {
              ...deployment.spec.template,
              spec: {
                ...deployment.spec.template.spec,
                containers: deployment.spec.template.spec.containers.map((c: any) => ({
                  ...c,
                  image: c.name === name ? newImage : c.image
                }))
              }
            }
          }
        };
        
        // Deploy green version
        const greenManifest = await context.fs.temp({ prefix: 'green-deploy-', suffix: '.json' });
        await context.fs.write(greenManifest, JSON.stringify(greenDeployment));
        await context.$`kubectl apply -f ${greenManifest}`;
        
        // Wait for green deployment
        await context.$`kubectl rollout status deployment/${name}-green -n ${namespace}`;
        
        // Run tests if provided
        if (testCommand) {
          log.info('Running tests on green deployment...');
          const greenPod = await context.$`kubectl get pods -l app=${name}-green -n ${namespace} -o jsonpath='{.items[0].metadata.name}'`;
          await context.$`kubectl exec ${greenPod.stdout.trim()} -n ${namespace} -- ${testCommand}`;
        }
        
        // Switch service to green
        await context.$`kubectl patch service ${name} -n ${namespace} -p '{"spec":{"selector":{"version":"green"}}}'`;
        
        log.info('Blue-green deployment completed');
        
        // Clean up
        await context.fs.rm(greenManifest);
      }
    },
    
    canaryDeployment: {
      name: 'canaryDeployment',
      description: 'Perform canary deployment',
      
      template: async (context: EnvironmentTaskContext) => {
        const { params, log } = context;
        const {
          name,
          newImage,
          namespace = 'default',
          canaryPercentage = 10,
          incrementalSteps = [10, 25, 50, 100],
          stepDuration = 300 // seconds
        } = params;
        
        log.info(`Starting canary deployment for ${name}...`);
        
        // Create canary deployment
        const canaryName = `${name}-canary`;
        await k8sModule.exports?.tasks?.['deploy']?.handler({
          ...context,
          params: {
            name: canaryName,
            image: newImage,
            namespace,
            replicas: 1
          }
        });
        
        // Gradually increase traffic
        for (const percentage of incrementalSteps) {
          log.info(`Routing ${percentage}% traffic to canary...`);
          
          // Update ingress or service mesh rules here
          // This is a simplified example
          
          // Monitor for issues
          if (context.time) {
            await context.time.sleep(stepDuration * 1000);
          } else {
            await new Promise(resolve => setTimeout(resolve, stepDuration * 1000));
          }
          
          // Check metrics
          const getPodsHelper = k8sModule.exports?.helpers?.['getPods'];
          const canaryPods = getPodsHelper ? await getPodsHelper({ 
            $: context.$, 
            params: { namespace, selector: `app=${canaryName}` }
          }) : [];
          
          // Simple health check
          const unhealthyPods = canaryPods.filter((pod: any) => 
            pod.status.phase !== 'Running' || 
            pod.status.conditions.some((c: any) => c.type === 'Ready' && c.status !== 'True')
          );
          
          if (unhealthyPods.length > 0) {
            log.error('Canary deployment failed health checks, rolling back...');
            await context.$`kubectl delete deployment ${canaryName} -n ${namespace}`;
            throw new Error('Canary deployment failed');
          }
        }
        
        // Full promotion
        log.info('Canary deployment successful, promoting to production...');
        await k8sModule.exports?.tasks?.['deploy']?.handler({
          ...context,
          params: {
            name,
            image: newImage,
            namespace
          }
        });
        
        // Clean up canary
        await context.$`kubectl delete deployment ${canaryName} -n ${namespace}`;
        
        log.info('Canary deployment completed successfully');
      }
    }
  }
  }
};

export default k8sModule;