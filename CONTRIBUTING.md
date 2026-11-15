# Contributing to Xec

Xec provides typed execution and operation orchestration across local, SSH,
Docker and Kubernetes targets. Contributions must preserve the result, target,
cancellation and resource-ownership contracts across those environments.
[AGENTS.md](./AGENTS.md) defines the engineering requirements for people and agents;
[Architecture](./website/docs/introduction/architecture.md) explains their owners.

## Getting started

Use the Node version supported by the CLI (`apps/xec/package.json`) and the pnpm
version pinned by the root `packageManager`. Docker and Kubernetes are needed
only for the integration suites that use them.

```bash
git clone https://github.com/xec-sh/xec.git
cd xec
pnpm install --frozen-lockfile
pnpm exec xec --version
pnpm exec xec inspect tasks
```

The root dependencies pin the **published** CLI, Ops and Kit independently of the
workspace packages. This driver manages the checkout before the candidate CLI
has been built. Do not replace it with `apps/xec/bin/xec` to bootstrap repository
operations; that entry point is the product under test.

## Project structure

| Path | Responsibility |
| --- | --- |
| `packages/core` | Execution engine, adapters, streams and resource lifecycle |
| `packages/ops` | Configuration, tasks, pipelines, deployment and release operations |
| `packages/kit` | Terminal interactions and presentation |
| `packages/loader` | Script loading and module resolution |
| `packages/testing` | Shared disposable fixtures and test helpers |
| `apps/xec` | CLI parser, routing and integration of the package APIs |
| `.xec/commands` | Native repository commands, including release and documentation checks |
| `.xec/lib` | Shared implementation for repository commands |
| `.xec/config.yaml` | Project tasks that invoke the owning tools and APIs |
| `turbo.json` | Workspace task dependencies, inputs and cache |
| `website` | Lumen/Prism documentation, examples and browser acceptance |
| `scripts` | Remaining package/compiler helpers and native test fixtures |

Xec owns workflows; Turbo owns the package DAG and cache. Keep new project
operations in native `.xec` commands or tasks. Reuse package APIs and migrate
an existing helper with its callers when changing that workflow; do not add
forwarders, a second argument parser or another build scheduler.

## Development workflow

Inspect the working tree and preserve other contributors' changes. Follow the
branch or shared-checkout arrangement for the task. Make one coherent change,
reproduce the defect through the public entry point, then run the checks that
cover its contract.

```bash
pnpm build       # Candidate CLI and its dependency graph
pnpm build:full  # Every workspace, when that scope is required
pnpm typecheck   # Workspace types and native project commands
pnpm lint        # Source, project commands and website components
```

These root scripts delegate to `xec run <task>`. Package compilation and
incremental caching remain with Turbo. A cached build does not establish native
adapter behavior or release acceptance.

Do not rebuild shared `dist` or replace dependencies while applications use them.
Build an isolated checkout for those checks. On the development Mac, use mounted
`/Volumes/AGI-Dev` for large checkouts, fixtures and caches as described in
[AGENTS.md](./AGENTS.md).

## Coding standards

Use strict TypeScript and explicit public exports. Validate external values as
`unknown`, preserve error causes and follow the repository formatter/linter.
Keep behavior in its owning package instead of duplicating it in CLI handlers.

Commands normally reject with an execution error. `.nothrow()` lets a caller
inspect a completed command's exit status; it does not prove that retrying an
uncertain remote effect is safe. Do not invent a second `Result<T>` contract.
See [error handling](./website/docs/core/execution-engine/features/error-handling.md).

Use the declared argv or template-escaping contract for input values. Preserve
exact API payloads and redact diagnostic output. Resource cleanup must act only
on verified ownership and report incomplete termination. Never turn an
unsupported operation, lost acknowledgement or failed cleanup into success.

## Testing guidelines

Tests use Vitest; repository verifier contracts also use Node's test runner.
Select the owning package and actual test file:

```bash
pnpm --filter @xec-sh/core exec vitest run test/unit/PATH.test.ts
pnpm --filter @xec-sh/ops test test/release/release.test.ts
pnpm --filter @xec-sh/cli test test/direct-argv.test.ts
pnpm --filter @xec-sh/core typecheck
pnpm exec eslint PATH --max-warnings 0
```

Replace `PATH` with the changed file. Start with a failing public-contract probe
and cover the relevant failure, cancellation, concurrency or tampering path.
Run native adapter checks when that boundary changes; mocks and skipped fixtures
do not qualify the real environment. CI defines the broader Linux/Windows and
integration matrix in [.github/workflows](./.github/workflows).

Use `pnpm test` for the complete workspace suite when needed. Do not repeat it
for unrelated prose edits or each publication upload. Record the exact scope,
results and skipped prerequisites; do not claim unexecuted checks passed.

## Documentation

Public guides live in `website/docs`, package introductions in their README,
and API comments beside the implementation. Read the whole affected page,
integrate changes in the relevant section and keep related links at the end.
Document inputs, outputs, failure behavior and limitations; distinguish the
published release from unreleased source.

Check one page through the native repository command:

```bash
pnpm exec xec docs check --file website/docs/introduction/architecture.md --strict
pnpm exec xec docs check --help
```

The checker compiles TypeScript, JavaScript and JSX fences against the **built
workspace public declarations**; build those declarations in an isolated checkout
when source API changes require it. It does not execute examples or invent API
stubs. Deliberately incomplete fragments need a nearby
`<!-- doc-check: skip — explanation -->` comment. Syntax errors are failures.
`--report <file>` writes JSON diagnostics, and `--only <substring>` filters paths.
Temporary consumers follow `TMPDIR` and are removed after the check.

`pnpm docs:check` runs verifier contracts and checks the corpus.
`pnpm docs:build` builds the Lumen site; `pnpm --dir website test:browser` exercises
the generated pages. Run the relevant level: a command example, link/anchor
change and visual control have different acceptance requirements.

## Commit guidelines

Use a concrete [Conventional Commit](https://www.conventionalcommits.org/) subject,
for example `fix(core): preserve child exit status after cancellation`.
Stage explicit paths and inspect the staged diff. Describe the behavior change,
relevant validation and any remaining limit in the commit or review description.
Do not commit generated archives, credentials, transient audit reports or
copies of superseded implementations.

## Release process

Releases are explicit operator actions. The native recipe lives in
`.xec/commands/release.ts` and uses the pinned published `@xec-sh/ops/release` API.
Start with a clean checkout and frozen dependencies. Substitute the intended
next version in these commands:

```bash
pnpm release VERSION --dry-run
pnpm release VERSION --prepare
```

Preparation builds an isolated committed snapshot, validates exports and
packages, and checks the packed SSH runtime. It does not publish or push.
After candidate acceptance, the release operator runs
`pnpm release VERSION --resume` to publish the exact saved archives.

Read [Verified package releases](./website/docs/ops/release.md) for authentication,
partial publication, GitHub-only recovery and tag handling. Inspect and resume
an interrupted release; do not delete published versions, replace historical
tags or rerun the build during publication.

## Troubleshooting

Read the first concrete failure and its cause before changing state. Check the
installed runtime, pinned manager and declared dependency exports. Use
`pnpm exec xec --verbose <command>` for CLI diagnostics without exposing secrets.

For an API or command defect, include the smallest reproduction, platform,
version, exact entry point and expected/actual outcome in a
[GitHub issue](https://github.com/xec-sh/xec/issues). Preserve useful failure
artifacts; do not clear caches or delete dependencies as a default repair.
