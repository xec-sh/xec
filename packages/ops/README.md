# @xec-sh/ops

Operations library on top of [@xec-sh/core](../core): deployments, pipelines,
workflows, health checks, target discovery, configuration and secrets. This is
the layer the `xec` CLI is built on; everything it does is available
programmatically.

```bash
npm install @xec-sh/ops
```

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

// DAG pipeline: dependencies, retry, conditions
const pipeline = Pipeline.create('ci')
  .step('lint', { run: 'npm run lint' })
  .step('test', { run: 'npm test', dependsOn: ['lint'], retry: { maxAttempts: 2 } })
  .step('build', {
    run: 'npm run build',
    dependsOn: ['test'],
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

## Workspace build orchestration

Xec can manage the complete developer workflow while delegating package builds
to a specialized workspace runner such as Turborepo. Full Xec integration does
not require replacing that runner.

Use one owner for each responsibility:

- The workspace runner owns package/task dependencies, affected-package selection,
  and build artifact caching. Keep these declarations in its configuration.
- Xec owns the surrounding workflow: environment preparation, verification,
  local and remote commands, release preparation, progress, and cancellation.
- An infrastructure controller owns deployed state, permissions, rollout locks,
  reconciliation, and recovery. Xec should call that controller's API instead of
  maintaining a second deployment state machine.

For a workspace that declares `build`, `test`, and `typecheck` in `turbo.json`,
execute that graph as one Xec pipeline stage:

```typescript
import { Pipeline } from '@xec-sh/ops/pipeline';

const result = await Pipeline.create('workspace-checks')
  .step('workspace', {
    run: {
      command: 'pnpm',
      args: ['exec', 'turbo', 'run', 'build', 'test', 'typecheck'],
      shell: false,
    },
    timeout: 30 * 60_000,
  })
  .run();

if (!result.success) {
  throw new Error(result.steps.filter(step => !step.success)
    .map(step => `${step.name}: ${step.error ?? step.exitCode}`).join('\n'));
}
```

Add infrastructure and release stages around this stage when needed; do not
recreate each package's dependencies or a second cache in the outer pipeline.
A cache hit is a build optimization, not authorization to publish or deploy.
Release identity, validation evidence, and deployment permissions still need
independent verification.

Turborepo exposes a machine-readable plan with `--dry=json` and a completed-run
report with `--summarize`; its remote cache can also be self-hosted. See the
[Turborepo run reference](https://turborepo.dev/docs/reference/run) and
[remote cache documentation](https://turborepo.dev/docs/core-concepts/remote-caching).
A completed-run report is not a live event stream.

`Pipeline` matrix values expand environment variables for each variant. They do
not install or select a Node runtime: a runtime matrix must invoke the selected,
provisioned executable explicitly. `Pipeline` currently schedules execution; its
reserved `cache` field does not implement artifact caching.

## Release notes and registry confirmation

`releaseNotes(root, version, repository, { from, run })` accepts an explicit full
commit ID as `from`. The caller selects that commit from its verified publication
history. Xec checks that it is an available commit and an ancestor of the selected
source; it does not infer publication from local or remote tags and does not fetch
or rewrite Git refs. The CLI exposes the same input as `--notes-from <full-commit>`
and validates it during the read-only plan, before preparation or publication.
Repeat it when resuming a release; `--prepare` includes it in the suggested resume
command.

Without `from`, notes are labelled as the complete committed history, not a delta
from a preceding release. Every commit in the selected range is included. The
GitHub repository argument supplies commit links; selecting a baseline does not
require the GitHub API or a GitHub-hosted publication record.

A registry confirmation timeout reports the exact package and missing visibility
stage, a supported read-only `npm view` command, and the saved upload journal.
Resume the same prepared version, archives and registry. Recorded accepted or
reserved uploads are checked again without another PUT; do not repeat a manual
`npm publish` to investigate a visibility delay.

`createGithubRelease` confirms an existing release without replacing its body.
For an intentional notes correction, generate and review notes from the exact
published source checkout, then use the hosting service's explicit edit operation
(for GitHub, `gh release edit <tag> --repo <owner/repository> --notes-file <file>`).
That edit does not require npm publication, a new build or changed source refs.

## Release progress and cancellation

Release helpers are exported from `@xec-sh/ops/release`. `releaseCommand` accepts
an `AbortSignal` and an optional asynchronous event observer:

```typescript
import { once } from 'node:events';
import { releaseCommand, prepareReleaseArtifacts } from '@xec-sh/ops/release';
import type { ReleaseCommandEvent } from '@xec-sh/ops/release';

const controller = new AbortController();
const onEvent = async (event: ReleaseCommandEvent) => {
  if (event.type === 'command-output') {
    const stream = process[event.stream];
    if (!stream.write(event.text)) await once(stream, 'drain');
  } else {
    console.log(event);
  }
};

await releaseCommand(process.cwd(), 'pnpm', ['run', 'build'], {
  signal: controller.signal,
  onEvent,
  outputLimit: 256 * 1024,
  redact: ['example-session-value'],
});
```

The observer receives `command-start`, `command-output`, and `command-complete`.
Events contain the executable and timestamps; output events add `stream` and
`text`, and completion adds `status`, `durationMs`, `cancelled`, and
`outputTruncated`. Arguments and environment variables are not event fields.
Observer calls are awaited with backpressure; an observer failure aborts the
owned process. Observers must settle their promises.

Without `onEvent` or `outputLimit`, the existing capture contract remains:
trimmed stdout is returned, and exceeding the 8 MiB capture cap fails the command.
Either option selects bounded output tails, defaulting to 8 MiB per stream.
Streaming observers receive all redacted output while only the tail is retained
for the return value and errors; truncation does not fail the command. Choose a
limit large enough for any machine-readable stdout that callers need to parse.
`redact` matches explicit, case-sensitive literal values across writes, including
multiline values. It does not infer which child output is sensitive.

With `interactive: true`, the real terminal descriptors remain inherited. Only
start/completion events are emitted: terminal output is raw, unredacted, and not
captured, and `outputLimit` does not bound what the terminal displays.

`prepareReleaseArtifacts` accepts `signal`, `onEvent`, and `outputLimit`.
Cancellation reaches every command. Progress events and output tails apply to
installation, build, packing, and commands invoked through a callback's `run`.
Internal Git identity checks, workspace inventory, and archive verification keep
complete stdout for their parsers, independent of the selected log limit.
Set `build.timeoutMs` to choose the build budget; its existing default remains
600,000 ms:

```typescript
await prepareReleaseArtifacts(root, version, {
  signal: controller.signal,
  onEvent,
  build: { executable: 'pnpm', args: ['run', 'build'], timeoutMs: 70 * 60_000 },
  async verifyArtifact({ workspace, artifact, run, signal }) {
    signal?.throwIfAborted();
    await run(workspace, process.execPath, ['scripts/verify-package.mjs', artifact.file]);
  },
});
```

Both `preparePackage` and `verifyArtifact` receive the inherited `run` and
`signal`. A per-command signal is combined with preparation cancellation.
Callbacks and injected runners must cooperate with the signal; cancellation
cannot interrupt arbitrary JavaScript. Preparation checks cancellation around
commands, after callbacks, and before sealing archives. The existing `progress`
callback also reports the start and completion of isolated-workspace cleanup.
A cleanup observer failure still removes the workspace; if preparation already
failed, both errors are preserved in an `AggregateError` whose cause is the
original preparation failure.

### CLI shutdown and cleanup

The CLI runs actions inside a core `within` cancellation scope. The first
SIGINT or SIGTERM cancels Xec commands, release operations, pipelines, retry
backoff and script `sleep`, then waits for the action's `finally` blocks. It
preserves exit 130 or 143. Explicit operation signals combine with the CLI
signal; commands admitted after cancellation are refused.

Cleanup that needs to execute a command uses the same explicit core boundary:

```typescript
import { withoutCancellation } from '@xec-sh/core';
import { acquireReleaseLock, releaseCommand } from '@xec-sh/ops/release';

const unlock = await acquireReleaseLock(process.cwd());
try {
  await releaseCommand(process.cwd(), 'pnpm', ['build']);
} finally {
  await withoutCancellation(async () => {
    try {
      await releaseCommand(process.cwd(), process.execPath, ['scripts/cleanup.mjs'], {
        signal: AbortSignal.timeout(2000),
      });
    } finally { await unlock(); }
  });
}
```

The CLI allows ten seconds for action cleanup and up to two seconds for final
engine disposal, within the remaining cancellation grace. A second termination
signal or an expired deadline forces exit and reports that cleanup is incomplete.
The cleanup scope does not extend that application deadline. Without cancellation,
normal completed commands still dispose engine resources before exiting.

This contract covers awaited CLI actions, Xec-managed commands and cooperative
callbacks. Built-in watch, follow-logs and foreground forwarding release their
owned sessions through the same action lifetime. The native REPL returns from
its startup before later evaluations; their completion is not covered by this
grace guarantee. Node's existing REPL interruption behavior is unchanged.
Arbitrary
JavaScript, independently spawned processes, `process.exit()` and SIGKILL cannot
be made to finish their cleanup by this mechanism.

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
