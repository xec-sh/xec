# @xec-sh/ops

DevOps operations library for deployments, pipelines, health checks, discovery, and configuration management.

## Install

```bash
pnpm add @xec-sh/ops
```

## Quick Start

```typescript
import { Deployer, HealthChecker, Pipeline } from '@xec-sh/ops';

// Rolling deployment with health checks
const deployer = new Deployer({
  strategy: 'rolling',
  targets: ['web-1', 'web-2', 'web-3'],
  healthCheck: { type: 'http', url: '/health', interval: 5000 },
  hooks: {
    beforeDeploy: async (ctx) => console.log(`Deploying to ${ctx.target}`),
    afterDeploy: async (ctx) => console.log(`Done: ${ctx.target}`),
  },
});
const result = await deployer.deploy();
```

```typescript
// Pipeline with DAG dependencies and matrix builds
const pipeline = new Pipeline({
  steps: [
    { name: 'lint', command: 'npm run lint' },
    { name: 'test', command: 'npm test', dependsOn: ['lint'], retry: 2 },
    { name: 'build', command: 'npm run build', dependsOn: ['test'],
      matrix: { node: ['18', '20'] },
      condition: () => process.env.CI === 'true',
      continueOnError: false },
  ],
});
const pipelineResult = await pipeline.run();
```

```typescript
import { Workflow, Discovery, ConfigurationManager, SecretManager } from '@xec-sh/ops';

// Workflow with data passing between tasks
const workflow = new Workflow();
workflow.task('fetch', async (ctx) => {
  ctx.set('data', await fetchData());
});
workflow.task('process', async (ctx) => {
  const data = ctx.get('data');
  return transform(data);
}, { dependsOn: ['fetch'], onFailure: 'skip' });
await workflow.run();

// Service discovery across Docker, K8s, and SSH
const discovery = new Discovery();
const targets = await discovery.discover({ source: 'docker', filter: { label: 'app=web' } });

// Configuration with profiles and variable interpolation
const config = new ConfigurationManager({ paths: ['.xec/config.yaml'] });
const value = config.get('database.host');

// Secret management
const secrets = new SecretManager();
await secrets.set('API_KEY', 'secret-value');
const key = await secrets.get('API_KEY');
```

## API

| Export | Description |
|--------|-------------|
| `Deployer` | Rolling, blue-green, canary, and all-at-once deployments |
| `Pipeline` | DAG-based pipeline with matrix builds and conditions |
| `Workflow` | Task workflow with data passing and failure handlers |
| `HealthChecker` | HTTP, TCP, command, and custom health checks |
| `Discovery` | Target discovery from Docker, K8s, SSH, custom sources |
| `RetryPolicy` / `retry` | Exponential, linear, and fixed backoff with jitter |
| `ConfigurationManager` | Config files, profiles, variable interpolation |
| `ConfigValidator` | Configuration validation |
| `VariableInterpolator` | Variable interpolation in config values |
| `TaskManager` / `TaskExecutor` | Task definitions and execution |
| `TargetResolver` | Resolve target configurations |
| `SecretManager` | Secret storage and retrieval |
| `generateSecret` / `encrypt` / `decrypt` | Cryptographic utilities |
| `generateCompletion` | Shell completion generator (bash/zsh/fish) |
| `OutputFormatter` | Formatted CLI output |
| `FileHelpers` | File selection and discovery utilities |
| `executeScript` / `evaluateCode` / `startRepl` | Script execution wrappers |

## Features

- Deployer with rolling, blue-green, canary, and all-at-once strategies
- Deploy hooks (before/after), health checks, and automatic rollback
- Pipeline with DAG dependencies, matrix builds, conditions, retry, and continueOnError
- Workflow with data passing between tasks, parallel execution, and failure handlers
- HealthChecker supporting HTTP, TCP, command, and custom checks with `waitUntilHealthy`
- Discovery of targets from Docker, Kubernetes, SSH, and custom sources
- RetryPolicy with exponential, linear, and fixed backoff plus jitter
- ConfigurationManager with customizable paths, profiles, variable interpolation, and secrets
- SecretManager for secure secret storage
- Shell completion generator for bash, zsh, and fish
- Script utilities: `$`, `cd`, `pwd`, `env`, `echo`, `sleep`, `glob`, `fs`, `os`, `path`, `yaml`, `csv`, `diff`, `template`, `parseArgs`, `loadEnv`, `ps`, `which`, `fetch`, `quote`, `within`, `tmpdir`, `tmpfile`, `kit`, `log`, `prism`, `spinner`

## License

MIT
