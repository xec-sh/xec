# @xec-sh/ops

Operations library on top of [@xec-sh/core](../core): deployments, pipelines,
workflows, health checks, target discovery, configuration and secrets. This is
the layer the `xec` CLI is built on; everything it does is available
programmatically.

```bash
npm install @xec-sh/ops
```

Status: alpha. The API may change between minor versions until 1.0.

## Deployments

```typescript
import { Deployer } from '@xec-sh/ops';

const deployer = Deployer.create({
  name: 'web',
  strategy: 'rolling',            // 'rolling' | 'blue-green' | 'canary' | 'all-at-once'
  targets: ['web-1', 'web-2', 'web-3'],
  healthCheck: { url: 'http://localhost:8080/health', retries: 5, interval: 5000 },
  hooks: {
    deploy: async (ctx) => {
      await ctx.exec`./deploy.sh ${ctx.target} ${ctx.version}`;
    },
    verify: async (ctx) => ctx.healthCheck(),
    rollback: async (ctx) => {
      await ctx.exec`./rollback.sh ${ctx.target} ${ctx.previousVersion}`;
    },
  },
});

const result = await deployer.deploy('v1.4.2');
// result.success, result.targets per host, result.summary
```

## Pipelines and workflows

```typescript
import { Pipeline, Workflow } from '@xec-sh/ops';

// DAG pipeline: dependencies, retry, matrix, conditions
const pipeline = Pipeline.create('ci')
  .step('lint', { run: 'npm run lint' })
  .step('test', { run: 'npm test', dependsOn: ['lint'], retry: { maxAttempts: 2 } })
  .step('build', {
    run: 'npm run build',
    dependsOn: ['test'],
    matrix: { node: ['20', '22'] },
    condition: (ctx) => ctx.env.CI === 'true',
  });
const { success, steps, summary } = await pipeline.run();

// Workflow: tasks passing data through a shared context
const workflow = Workflow.create('etl')
  .task('fetch', async (ctx) => fetchData())
  .task('process', async (ctx) => {
    return transform(ctx.taskOutput('fetch'));
  }, { dependsOn: ['fetch'], continueOnError: true })
  .onFailure(async (ctx, error) => ctx.log(`failed: ${error.message}`));
await workflow.run();
```

## Discovery, configuration, secrets

```typescript
import { Discovery, ConfigurationManager, SecretManager } from '@xec-sh/ops';

// Find targets: Docker containers, K8s pods, SSH hosts, custom sources
const discovery = Discovery.create()
  .docker({ label: 'app=web', status: 'running' })
  .kubernetes({ namespace: 'production', label: 'app=web' });
const targets = await discovery.scan();
// [{ id: 'docker:web-1', type: 'docker', container: 'web-1', ... }, ...]

// Configuration from .xec/config.yaml with profiles and interpolation
const config = new ConfigurationManager();
await config.load();
const host = config.get('database.host');

// Secrets, encrypted at rest (AES-256-GCM) by the default local provider
const secrets = new SecretManager();
await secrets.set('API_KEY', 'secret-value');
const key = await secrets.get('API_KEY');
```

## Exports

| Export | Description |
|--------|-------------|
| `Deployer` | Rolling, blue-green, canary, and all-at-once deployments |
| `Pipeline` | DAG-based pipeline with matrix builds and conditions |
| `Workflow` | Task workflow with data passing and failure handlers |
| `HealthChecker` | HTTP, TCP, command, and custom checks with `waitUntilHealthy` |
| `Discovery` | Target discovery from Docker, K8s, SSH, and custom sources |
| `RetryPolicy` / `retry` | Exponential, linear, and fixed backoff with jitter |
| `ConfigurationManager` | Config files, profiles, variable interpolation |
| `ConfigValidator` / `VariableInterpolator` | Validation and interpolation used by the above |
| `TaskManager` / `TaskExecutor` | Task definitions and execution |
| `TargetResolver` | Resolve target references (`hosts.web-1`, `containers.app`, wildcards) |
| `SecretManager` | Secret storage with pluggable providers |
| `generateSecret` / `encrypt` / `decrypt` | Cryptographic utilities |
| `generateCompletion` | Shell completion generator (bash/zsh/fish) |
| `OutputFormatter` / `FileHelpers` | CLI output and file selection helpers |
| `executeScript` / `evaluateCode` / `startRepl` | Script execution wrappers around @xec-sh/loader |

Script-facing re-exports for code run by the CLI: `$`, `cd`, `pwd`, `env`,
`echo`, `sleep`, `glob`, `fs`, `os`, `path`, `yaml`, `csv`, `diff`, `template`,
`parseArgs`, `loadEnv`, `ps`, `which`, `fetch`, `quote`, `within`, `tmpdir`,
`tmpfile`, `kit`, `log`, `prism`, `spinner`.

## Dependencies

`@xec-sh/core`, `@xec-sh/kit`, `@xec-sh/loader`, plus `dotenv`, `fs-extra`,
`glob`, `js-yaml`, `zod`.

## License

MIT
