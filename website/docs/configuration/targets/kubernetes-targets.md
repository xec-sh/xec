---
title: Kubernetes Targets
description: Configuring Kubernetes pod targets for cloud-native execution
---

# Kubernetes Targets

Kubernetes targets enable command execution within pods running in Kubernetes clusters. Xec provides native Kubernetes integration with support for multiple clusters, namespaces, port forwarding, and pod selection strategies.

## Basic Configuration

Define Kubernetes pods in the `targets.pods` section:

```yaml
targets:
  pods:
    frontend:
      namespace: production
      selector: app=frontend
      container: nginx
```

## Pod Properties

### Essential Properties

```yaml
targets:
  pods:
    basic:
      # Pod selection (one required)
      pod: my-pod-name           # Specific pod name
      selector: app=myapp        # OR label selector
      
      # Context
      namespace: default         # Kubernetes namespace
      container: app            # Container name (if multiple)
```

### Advanced Properties

```yaml
targets:
  pods:
    advanced:
      # Cluster configuration
      context: production-cluster  # kubectl context
      kubeconfig: ~/.kube/prod    # Custom kubeconfig
      namespace: my-namespace
      
      # Pod selection
      selector: "app=web,tier=frontend"
      container: nginx
      
      # Execution options
      tty: true                   # Allocate TTY
      stdin: true                 # Keep stdin open
      timeout: 60000              # Command timeout (ms)
      
      # Command execution
      shell: /bin/bash            # Shell to use
      workdir: /app              # Working directory
      
      # Additional flags
      execFlags:                  # Extra kubectl exec flags
        - --pod-running-timeout=1m
        - --preserve-whitespace
```

## Pod Selection Strategies

### By Pod Name

```yaml
targets:
  pods:
    specific:
      pod: nginx-deployment-7848d4b86f-vp7wq
      namespace: production
      container: nginx
```

### By Label Selector

```yaml
targets:
  pods:
    by-label:
      selector: app=backend
      namespace: production
      
    # Multiple labels
    multi-label:
      selector: "app=web,environment=prod,version=v2"
      
    # Label expressions
    expression:
      selector: "environment in (production, staging)"
```

### By Field Selector

```yaml
targets:
  pods:
    by-field:
      fieldSelector: "status.phase=Running"
      selector: app=worker
```

### Dynamic Selection

```yaml
targets:
  pods:
    # Select first matching pod
    first-match:
      selector: app=web
      strategy: first  # Default
    
    # Select random pod
    random:
      selector: app=web
      strategy: random
    
    # Select newest pod
    newest:
      selector: app=web
      strategy: newest
```

## Namespace Configuration

```yaml
targets:
  # Global Kubernetes settings
  kubernetes:
    $namespace: production  # Default namespace
    $context: prod-cluster # Default context
  
  pods:
    # Inherits global namespace
    web:
      selector: app=web
    
    # Override namespace
    database:
      namespace: data-tier
      selector: app=postgres
```

## Context Management

### Multiple Clusters

```yaml
targets:
  pods:
    # Production cluster
    prod-app:
      context: production-aws
      namespace: production
      selector: app=api
    
    # Staging cluster
    staging-app:
      context: staging-gcp
      namespace: staging
      selector: app=api
    
    # Development cluster
    dev-app:
      context: minikube
      namespace: development
      selector: app=api
```

### Custom Kubeconfig

```yaml
targets:
  pods:
    custom-cluster:
      kubeconfig: /path/to/custom/kubeconfig
      context: my-context
      namespace: my-namespace
      selector: app=myapp
```

## Container Selection

### Single Container Pods

```yaml
targets:
  pods:
    simple:
      selector: app=nginx
      # Container automatically selected if only one
```

### Multi-Container Pods

```yaml
targets:
  pods:
    # Specify container
    sidecar:
      selector: app=web
      container: nginx  # Main container
    
    # Different container
    logs:
      selector: app=web
      container: fluent-bit  # Sidecar container
```

## Execution Options

### Interactive Sessions

```yaml
targets:
  pods:
    interactive:
      selector: app=debug
      tty: true        # TTY for interactive commands
      stdin: true      # Keep stdin open
      shell: /bin/bash
```

### Command Execution

```yaml
targets:
  pods:
    execute:
      selector: app=web
      
      # Direct command
      shell: false     # No shell wrapping
      
      # With shell
      shell: /bin/sh   # Wrap in shell
      
      # Custom shell
      shell: /bin/bash
```

## Working Directory

```yaml
targets:
  pods:
    workspace:
      selector: app=builder
      workdir: /workspace
      # Commands execute in /workspace
```

## Environment Variables

```yaml
targets:
  pods:
    configured:
      selector: app=worker
      env:
        WORKER_ID: ${env.HOSTNAME}
        QUEUE_URL: https://sqs.amazonaws.com/queue
        DEBUG: "true"
```

## Port Forwarding

```yaml
targets:
  pods:
    forwarded:
      selector: app=web
      portForward:
        - 8080:80     # Local:Pod
        - 9229:9229   # Debugger
        - 5432:5432   # Database
```

## Service Account

```yaml
targets:
  pods:
    privileged:
      selector: app=admin
      serviceAccount: admin-sa
      namespace: kube-system
```

## Resource Requirements

```yaml
targets:
  pods:
    # Target pods with specific resources
    high-memory:
      selector: "app=analytics,resources.memory>=4Gi"
    
    low-cpu:
      selector: "app=background,resources.cpu<500m"
```

## Pod Annotations

```yaml
targets:
  pods:
    annotated:
      selector: app=web
      annotations:
        "prometheus.io/scrape": "true"
        "prometheus.io/port": "9090"
```

## Init Containers

```yaml
targets:
  pods:
    # Execute in init container
    init:
      selector: app=database
      container: init-schema
      initContainer: true
```

## Ephemeral Containers

```yaml
targets:
  pods:
    debug:
      selector: app=production
      ephemeralContainer:
        name: debugger
        image: busybox
        command: ["/bin/sh"]
```

## Real-World Examples

### Production API Pod

```yaml
targets:
  pods:
    api:
      context: production-cluster
      namespace: production
      selector: "app=api,version=stable"
      container: api
      workdir: /app
      env:
        API_ENV: production
      timeout: 30000
```

### Database Migration

```yaml
targets:
  pods:
    migrate:
      namespace: data
      selector: app=postgres
      container: postgres
      workdir: /migrations
      env:
        PGUSER: postgres
        PGDATABASE: production
```

### Debug Session

```yaml
targets:
  pods:
    debug:
      namespace: development
      selector: app=problematic
      container: app
      tty: true
      stdin: true
      shell: /bin/bash
```

### Batch Job

```yaml
targets:
  pods:
    job:
      namespace: jobs
      selector: "job-name=data-processor"
      container: processor
      timeout: 3600000  # 1 hour
```

## Cluster Operations

### Node Selection

```yaml
targets:
  pods:
    gpu-pod:
      selector: app=ml-training
      nodeSelector:
        "kubernetes.io/gpu": "true"
    
    zone-specific:
      selector: app=regional
      nodeSelector:
        "topology.kubernetes.io/zone": "us-east-1a"
```

### Deployment Strategies

```yaml
targets:
  pods:
    # Rolling update target
    rolling:
      selector: "app=web,deployment=rolling"
      strategy: newest  # Target newest pods
    
    # Canary deployment
    canary:
      selector: "app=web,version=canary"
      maxPods: 1  # Limit to one pod
```

## Security

### RBAC Configuration

```yaml
targets:
  pods:
    restricted:
      namespace: secure
      selector: app=sensitive
      serviceAccount: restricted-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
```

### Network Policies

```yaml
targets:
  pods:
    isolated:
      namespace: isolated
      selector: app=backend
      networkPolicy: deny-all
```

## Monitoring and Logging

### Metrics Collection

```yaml
targets:
  pods:
    metrics:
      selector: app=monitored
      metrics:
        enabled: true
        port: 9090
        path: /metrics
```

### Log Streaming

```yaml
targets:
  pods:
    logs:
      selector: app=verbose
      container: app
      logOptions:
        follow: true
        timestamps: true
        tail: 100
```

## Troubleshooting

### Pod Discovery

```bash
# List available pods
kubectl get pods -n production

# Check pod selection
xec test pods.frontend

# Debug selector
kubectl get pods -l app=frontend -n production
```

### Common Issues

#### No Pods Found

```yaml
# Check selector and namespace
targets:
  pods:
    fixed:
      namespace: correct-namespace  # Verify namespace
      selector: "app=correct-label"  # Verify labels
```

#### Container Not Found

```yaml
# List containers in pod
kubectl get pod <pod-name> -o jsonpath='{.spec.containers[*].name}'

targets:
  pods:
    fixed:
      container: correct-container-name
```

#### Permission Denied

```yaml
# Check RBAC permissions
kubectl auth can-i exec pods -n production

# Use correct service account
targets:
  pods:
    authorized:
      serviceAccount: exec-sa
```

#### Connection Issues

```yaml
# Check cluster connectivity
kubectl cluster-info

# Verify context
kubectl config current-context

targets:
  pods:
    connected:
      context: correct-context
      kubeconfig: ~/.kube/config
```

## Best Practices

### 1. Use Selectors Over Pod Names

```yaml
# Good - selector (flexible)
selector: app=web

# Avoid - specific pod (fragile)
pod: web-7f8b9c5d4-x2kp9
```

### 2. Specify Container Names

```yaml
# Good - explicit container
container: nginx

# May fail - ambiguous with multiple containers
# No container specified
```

### 3. Set Appropriate Timeouts

```yaml
targets:
  pods:
    batch:
      timeout: 3600000  # Long-running jobs
    
    health:
      timeout: 5000     # Quick checks
```

### 4. Use Namespaces

```yaml
# Good - organized by namespace
namespace: production

# Avoid - everything in default
namespace: default
```

### 5. Handle Pod Lifecycle

```yaml
targets:
  pods:
    resilient:
      selector: app=web
      waitReady: true      # Wait for pod ready
      maxRetries: 3        # Retry on failure
```

## Advanced Features

### Custom Resources

```yaml
targets:
  pods:
    operator:
      crd: myapp.example.com/v1
      resource: myapp-instance
      namespace: operators
```

### Helm Integration

```yaml
targets:
  pods:
    helm:
      $helm:
        release: my-release
        chart: stable/nginx
```

### Istio Service Mesh

```yaml
targets:
  pods:
    mesh:
      selector: app=web
      istio:
        virtualService: web-vs
        destinationRule: web-dr
```

## Next Steps

- [Kubernetes Commands](../../commands/built-in/in.md) - K8s-specific commands

## See Also

- [kubectl Reference](https://kubernetes.io/docs/reference/kubectl/)
- [Pod Logs](../../commands/built-in/logs.md) - Viewing pod logs
- [Port Forwarding](../../commands/built-in/forward.md) - Kubernetes port forwarding