---
title: Kubernetes Targets
description: Configuring Kubernetes pod targets for cluster execution
---

# Kubernetes Targets

Kubernetes targets run commands inside pods via `kubectl exec`. Declare them under `targets.pods` in `.xec/config.yaml`; reference them as `pods.<name>`.

## Basic Configuration

```yaml
targets:
  pods:
    api:
      namespace: production
      pod: api-server-7d9c5b4f8-x2n4l
      container: app
```

```bash
xec in pods.api "ps aux"
```

`kubectl` must be installed and authenticated against the cluster.

## Reference

Fields the CLI forwards to the Kubernetes adapter:

```yaml
targets:
  pods:
    example:
      # Pod identification
      pod: api-server-abc123        # pod name, or a label selector: "-l app=api"
      namespace: production          # default: "default"
      container: app                 # container within the pod (default: first)

      # Cluster selection
      context: prod-cluster          # kubectl context; default: current-context
      kubeconfig: ~/.kube/prod       # kubeconfig file; default: ambient

      # Exec behaviour
      tty: true                      # allocate a TTY
      stdin: true                    # keep stdin open
      execFlags: ["--request-timeout=30s"]  # extra flags passed to kubectl exec

      # Environment for every command on this target
      env:
        DEPLOY_ENV: production
```

A `pod` value that starts with `-l` is resolved to the first pod matching the label selector before the exec call runs:

```yaml
targets:
  pods:
    frontend:
      namespace: production
      pod: "-l app=frontend"
```

Other keys under a pod entry (`selector`, `timeout`, `shell`, per-target buffer limits) are accepted by the parser but are not forwarded to the connection.

## Naming a Cluster Explicitly

Without `context`, a target belongs to whatever `kubectl config current-context` happens to be — a target that says `production` can silently run against staging. Production targets should name their cluster:

```yaml
targets:
  pods:
    prod-api:
      context: prod-cluster
      namespace: production
      pod: "-l app=api"
```

## Environment Variables

`env` is applied to every command executed on the target:

```yaml
targets:
  pods:
    worker:
      namespace: jobs
      pod: "-l app=worker"
      env:
        QUEUE: high-priority
```

## Examples

### Database Migration

```yaml
targets:
  pods:
    db-migrate:
      context: prod-cluster
      namespace: production
      pod: "-l app=api"
      container: app
```

```bash
xec in pods.db-migrate "npm run migrate"
```

### Debugging a Specific Pod

```yaml
targets:
  pods:
    debug:
      namespace: staging
      pod: api-server-7d9c5b4f8-x2n4l
      tty: true
      stdin: true
```

## Troubleshooting

```bash
# Test the target
xec in pods.api "echo ok"

# Verbose output
xec --verbose in pods.api "echo ok"

# Show the resolved target configuration
xec config get targets.pods.api

# Check what kubectl itself sees
kubectl --context prod-cluster -n production get pods
```

Common failures:

- **Pod not found** — the pod name is stale (pods are replaced on every deploy) or the selector matches nothing. Prefer `-l` selectors over literal pod names.
- **Wrong cluster** — no `context` set and `current-context` points elsewhere.
- **Container not found** — the pod has several containers and `container:` names none of them. List them with `kubectl get pod <name> -o jsonpath='{.spec.containers[*].name}'`.

## Next Steps

- [SSH Targets](./ssh-targets.md) - Remote host configuration
- [Docker Targets](./docker-targets.md) - Container configuration

## See Also

- [Kubernetes Execution](../../targets/kubernetes/overview.md) - The Kubernetes adapter and pod API
- [in Command](../../commands/built-in/in.md) - Running commands in pods
- [forward Command](../../commands/built-in/forward.md) - Port forwarding
- [logs Command](../../commands/built-in/logs.md) - Log streaming
