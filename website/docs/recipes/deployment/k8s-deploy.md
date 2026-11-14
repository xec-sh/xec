---
title: Kubernetes Deployment
description: Deploy Kubernetes manifests with explicit cluster identity and rollout acceptance
source_files:
  - packages/core/src/core/execution-engine.ts
  - packages/ops/src/deploy/index.ts
  - packages/ops/src/config/target-resolver.ts
---

# Kubernetes Deployment {#kubernetes-deployment}

## Problem {#problem}

Apply a known release to the intended cluster and namespace, then distinguish API acceptance, rollout readiness and application health.

## Solution {#solution}

Keep workload declarations in the application’s manifests or chart. Xec executes the selected provider commands with explicit context and namespace and awaits their outcomes. It does not synthesize an unreviewed cluster, secret or load-balancer policy.

## Quick Example {#quick-example}

```typescript
const context = process.env.KUBE_CONTEXT;
const namespace = process.env.KUBE_NAMESPACE;
if (!context || !namespace) throw new Error('KUBE_CONTEXT and KUBE_NAMESPACE are required');
await $`kubectl --context ${context} --namespace ${namespace} apply -k deploy/overlays/staging`;
await $`kubectl --context ${context} --namespace ${namespace} rollout status deployment/myapp --timeout=180s`.timeout(200_000);
```

The overlay must already declare the accepted image digest and the correct namespace. A successful rollout still needs application acceptance.

## Complete Kubernetes Deployment Recipes {#complete-kubernetes-deployment-recipes}

### Configuration {#configuration}

```yaml
version: '1.0'
targets:
  pods:
    api:
      type: kubernetes
      context: staging-cluster
      namespace: myapp-staging
      selector: app=myapp
tasks:
  deploy:k8s:
    command: xec run scripts/deploy-k8s.ts
```

Configured pod targets are useful for diagnostics; applying manifests remains a cluster API operation, not a command run inside a pod.

### Full Kubernetes Deployment Script {#full-kubernetes-deployment-script}

```typescript
// scripts/deploy-k8s.ts
import { HealthChecker } from '@xec-sh/ops';
const context = process.env.KUBE_CONTEXT;
const namespace = process.env.KUBE_NAMESPACE;
const expectedImage = process.env.APP_IMAGE;
const healthURL = process.env.APP_HEALTH_URL;
if (!context || !namespace || !expectedImage || !healthURL || !/@sha256:[a-f0-9]{64}$/.test(expectedImage)) {
  throw new Error('Select context, namespace, pinned APP_IMAGE and APP_HEALTH_URL');
}
// Project-owned verification checks the rendered overlay and migration contract.
await $`npm run verify:k8s-manifests -- ${context} ${namespace} ${expectedImage}`;
await $`kubectl --context ${context} --namespace ${namespace} apply -k deploy/overlays/staging`;
await $`kubectl --context ${context} --namespace ${namespace} rollout status deployment/myapp --timeout=180s`.timeout(200_000);
const servingImage = (await $`kubectl --context ${context} --namespace ${namespace} get deployment myapp -o ${'jsonpath={.spec.template.spec.containers[?(@.name=="app")].image}'}`.text()).trim();
if (servingImage !== expectedImage) throw new Error('Deployment image differs from the accepted artifact');
await HealthChecker.create().http(healthURL, { status: 200, timeout: 3000 })
  .waitUntilHealthy({ timeout: 30_000, interval: 1000 });
await $`npm run verify:deployed-app -- ${context} ${namespace} ${expectedImage}`;
```

The named project checks must be implemented before using this script. Persist the previous accepted manifest/chart revision and assess schema compatibility before apply. On failure, report the observed rollout and use the reviewed recovery procedure; do not blindly retry or roll back to an unspecified revision.

### Helm Deployment {#helm-deployment}

Pin the Helm CLI and chart used by the project. This example passes explicit release, context and namespace and waits for the declared resources:

```typescript
const context = process.env.KUBE_CONTEXT;
const namespace = process.env.KUBE_NAMESPACE;
if (!context || !namespace) throw new Error('Select the cluster and namespace');
await $`helm upgrade --install myapp ./deploy/chart --kube-context ${context} --namespace ${namespace} --values deploy/values.staging.yaml --wait --timeout 5m`.timeout(330_000);
await $`helm test myapp --kube-context ${context} --namespace ${namespace} --timeout 2m`.timeout(150_000);
```

Chart tests must actually exist for `helm test` to establish an application check. Recovery flags differ between Helm versions; use the [reference for the pinned CLI](https://helm.sh/docs/helm/helm_upgrade/) and record the accepted release revision before the update.

### Canary Deployment with Flagger {#canary-deployment-with-flagger}

Flagger owns canary progression, metrics and traffic policy. Install and validate its CRDs/controller separately and keep the Canary resource in the application’s reviewed manifests. Xec applies that declaration and invokes the project’s acceptance check:

```typescript
const context = process.env.KUBE_CONTEXT;
const namespace = process.env.KUBE_NAMESPACE;
if (!context || !namespace) throw new Error('Select cluster and namespace');
await $`kubectl --context ${context} --namespace ${namespace} apply -f deploy/canary.yaml`;
await $`npm run verify:canary -- ${context} ${namespace}`.timeout(900_000);
```

The acceptance command must fail if analysis is rejected or still incomplete. A created Canary object is not a successful canary rollout.

### GitOps with ArgoCD {#gitops-with-argocd}

When ArgoCD owns the installation, update the reviewed GitOps source through its normal review path. Do not also `kubectl apply` the same resources from a parallel deployment mechanism.

```typescript
const application = process.env.ARGO_APPLICATION;
if (!application) throw new Error('Select ARGO_APPLICATION');
await $`argocd app sync ${application}`.timeout(300_000);
await $`argocd app wait ${application} --sync --health --timeout 180`.timeout(200_000);
```

Configure and authenticate the exact ArgoCD server beforehand. Verify the expected source revision and application behavior after synchronization.

## Usage Examples {#usage-examples}

```bash
KUBE_CONTEXT=staging-cluster KUBE_NAMESPACE=myapp-staging xec run scripts/deploy-k8s.ts
```

Also supply the accepted `APP_IMAGE` digest and the application health URL required by the full script. A missing input fails before apply.

## Best Practices {#best-practices}

Use exact cluster identity, least-privilege credentials, immutable images and reviewed manifests. Separate workload readiness from data migration and business-level acceptance. Keep provider-specific policy in its declarative source.

## Troubleshooting {#troubleshooting}

### Pod Issues {#pod-issues}

```bash
kubectl --context staging-cluster --namespace myapp-staging get pods
kubectl --context staging-cluster --namespace myapp-staging describe deployment myapp
xec logs pods.api --tail 100
```

Inspect failed scheduling, image pulls, exits and readiness separately.

### Service Issues {#service-issues}

```bash
kubectl --context staging-cluster --namespace myapp-staging get service myapp
kubectl --context staging-cluster --namespace myapp-staging get endpointslices -l kubernetes.io/service-name=myapp
```

### Ingress Issues {#ingress-issues}

```bash
kubectl --context staging-cluster --namespace myapp-staging get ingress
```

Verify the selected controller, host, TLS secret and actual external response. Do not disable TLS checking to hide a routing or certificate error.

## Related Topics {#related-topics}

- [Kubernetes Targets](../../targets/kubernetes/overview.md)
- [Docker Deployment](docker-deploy.md)
- [Health Checks](../maintenance/health-checks.md)
