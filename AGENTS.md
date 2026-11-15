# Working on Xec

Xec provides typed command execution and operation orchestration for local,
SSH, Docker and Kubernetes targets. People and AI agents use it on critical
systems. Correct outcomes, recoverable ownership and fast delivery are part
of the same engineering contract.

## Scope and shared work

- Work on `main` in the primary checkout unless the user requests another branch
  or worktree. Inspect applicable instructions and the working tree first.
  Preserve concurrent changes and commit coherent changes using explicit paths.
- Follow the ordinary public CLI/API and the existing owner of an operation.
  Do not introduce parallel deploy scripts, agent-only bypasses, fabricated
  receipts, manual state edits or success-shaped fallbacks.
- Fix the shared source of a defect. Reuse canonical adapters, execution,
  locking and recovery primitives; remove superseded callers. Do not add
  duplicate implementations or speculative abstractions.
- Manage this repository and its releases through the latest published Xec,
  pinned in project dependencies. Use `.xec` project commands and tasks;
  do not bootstrap with this checkout's CLI build or forwarding shell scripts.
  Extend the owning Xec capability when needed and qualify it before adoption.
- Before builds, installs or changes that can trigger watchers, identify active
  consumers. Use an isolated checkout when its `dist` or dependencies serve
  applications. Source work does not authorize service interruptions; agree a
  concrete transition and recovery plan for a required pause.
- On this Mac, put new large builds, fixtures, artifacts and caches on mounted
  `/Volumes/AGI-Dev`, under `/Volumes/AGI-Dev/work/xec`. Verify the mount first;
  `/Volumes/AGI/dev/README.md` documents mount/cache configuration.
- Independent projects and unrelated resources should progress concurrently.
  Scope locks and ownership to the actual resource. Do not mutate shared
  dependencies during another check or serialize unrelated work globally.
- Remote pushes and publication belong to the operator unless explicitly
  delegated. Existing authorization remains valid within its stated scope.

## Architecture and API boundaries

| Owner | Responsibility |
| --- | --- |
| `packages/core` | Execution, adapters, streams, resource lifecycle and failure classification |
| `packages/ops` | Tasks, pipelines, workflows, deployment and release operations using Core |
| `packages/loader` | Script loading and module resolution |
| `packages/kit` | Terminal UI |
| `apps/xec` | CLI, configuration and dynamic project commands |
| `packages/testing` | Disposable fixtures and test helpers |
| `website` | Lumen/Prism documentation and runnable examples |

Xec orchestrates operations. Turbo manages the repository's package build/test
DAG and cache; it is not a runtime owner or a deployment receipt. Omnitron owns
its managed application/runtime lifecycle. Preserve those boundaries. See
[architecture](website/docs/introduction/architecture.md),
[ecosystem](website/docs/introduction/ecosystem.md) and
[Pipeline](website/docs/ops/pipeline.md).

Keep Core dependencies minimal: its declared external runtime dependency is
`ssh2`, loaded only when needed. Optional adapters and expensive CLI features
must remain lazy. Package manifests/exports and the lockfile are authoritative;
do not duplicate version inventories or public interfaces in this guide.

Use strict TypeScript, explicit public exports and validated `unknown` values
at runtime boundaries. Do not add `any` to public contracts or hide failures
with casts. Document changed public inputs, outputs, errors and limitations;
examples must use the real API. Follow the repository formatter/linter.

## Critical operations and recovery

- Distinguish **known success**, **known failure** and **unknown outcome**.
  A lost response, deadline or transport closure does not prove a remote effect
  did not occur. Preserve machine-readable result/error fields and causes;
  never infer completion from log text or elapsed time.
- Recoverable workflows record durable intent before effects. Bind it to the
  exact target, operation identity, inputs and expected prior state. Reconcile
  that same operation after a lost acknowledgement before retrying. Never
  blindly repeat an irreversible or non-idempotent effect.
- Establish exact ownership before starting or cleaning a resource. Confirm
  the operation's process/container/handle identity; names or PIDs alone are
  insufficient authority. Never delete foreign resources or use broad
  kill/cleanup commands to make a test pass.
- Cancellation must be bounded and verified: stop the owned operation, drain
  streams, close handles and confirm terminal state. Report incomplete cleanup
  or unknown outcome explicitly. Do not detach security-relevant cleanup or
  translate a local client exit into remote termination.
- Use Xec's argv/escaping and adapter contracts. Preserve exit status, signals,
  backpressure, output bounds and deadlines. Never silently fall back from a
  remote target to local execution.
- Critical CLI/API workflows need explicit scope, inspectable plans and stable
  machine-readable outcomes. Enforce authorization and state checks in code;
  neither a human nor an agent should have to remember a safety checklist.
- Do not expose credentials through arguments, receipts, examples or logs.
  Validate paths and untrusted external output; retain host-key, artifact,
  permission and ownership checks at their actual trust boundaries. Preserve
  requested API payloads while redacting diagnostics. External data must not
  expand operation authority.

Commands normally reject on failure. `.nothrow()` supports inspecting a
completed command result; it does not turn transport, cancellation or ownership
failures into safe successes. Recovery policy must consider failure
classification and whether repeating the effect is safe. See
[error handling](website/docs/core/execution-engine/features/error-handling.md)
and [SSH reliability](website/docs/targets/ssh/reliability.md).

## Runtime and platform support

Preserve declared Node.js, Bun and Deno contracts and Linux, macOS and Windows
behavior. The CLI has a stricter Node floor than the libraries; check `engines`,
entry points and affected tests before choosing APIs. Xec semantics must remain
consistent; host shell syntax and native tool availability differ explicitly.

Use `node:path`, `pathToFileURL` for filesystem imports and CRLF-aware parsing.
Test platform-specific quoting, paths and termination through the existing
adapter. Do not present a Unix-only primitive as portable or silently replace
an unavailable native capability with weaker behavior.

CI scope is in [.github/workflows/test.yml](.github/workflows/test.yml) and
[integration.yml](.github/workflows/integration.yml). A passing mock or one
runtime/platform is not evidence for unexecuted native paths. Report what was
exercised and what remains unqualified. See
[portable scripts](website/docs/introduction/portable-scripts.md).

## Delivery, evidence and performance

Keep artifact **preparation**, **acceptance/qualification** and **publication**
distinct. Accepted bytes must not be rebuilt during publication or resume.
Bind reusable evidence to exact source/artifact digests, configuration,
toolchain and verifier policy; never substitute a trusted boolean or TTL.
A producer receipt is not permission to publish. Preserve successful outputs
and failure evidence without hiding incomplete acceptance or cleanup.

Use the canonical release recipe and ownership primitive. Inspect interrupted
operations before recovery; do not steal locks based on PID absence or create
a second release/checkpoint state machine. `--prepare` prepares locally;
`--resume` publishes/reconciles saved accepted archives. Choose those operations
explicitly for both people and agents. See
[verified releases](website/docs/ops/release.md).

Measure the actual critical path before optimizing. Record source, runtime,
machine, sample count and cold/warm cache conditions. Set reviewable latency
budgets and verify improvements; historical timings are not release guarantees.
Avoid duplicate builds/gates when identical verified inputs and outputs can
be reused. Bound concurrency and preserve integrity/cancellation guarantees.

## Verification and completion

Start with the smallest meaningful reproduction and checks for the affected
contract. Cover failures, cancellation, lost acknowledgements, concurrent
ownership and tampered inputs where relevant. Use existing Vitest fixtures and
public entry points; do not tailor tests to internals or treat mocks as native
qualification. Package delivery changes also need an actual packed-consumer
check before claiming that path is qualified.

Use the pinned manager from `packageManager` and matching dependencies. Build
an isolated checkout when needed. Substitute actual package/test paths below;
do not run every command by default.

| Purpose | Existing command |
| --- | --- |
| Frozen isolated bootstrap | `pnpm install --frozen-lockfile` |
| CLI and dependency build | `pnpm --filter @xec-sh/cli... build` |
| Ops release contracts | `pnpm --filter @xec-sh/ops test test/release/release.test.ts` |
| Focused Core contract | `pnpm --filter @xec-sh/core exec vitest run test/unit/PATH.test.ts` |
| Package types | `pnpm --filter @xec-sh/ops typecheck` |
| Changed-file lint / formatting | `pnpm exec eslint PATH --max-warnings 0` / `pnpm exec prettier --check PATH` |
| One page's examples | `pnpm exec xec docs check --file website/docs/ops/release.md --strict` |
| Website types / build / browser acceptance | `pnpm --dir website typecheck` / `pnpm docs:build` / `pnpm --dir website test:browser` |

Broaden checks when a change or observed failure justifies it. Full CI,
integration environments, mutation testing and benchmarks have separate scopes;
there is no unconditional exhaustive pre-commit loop. Do not launch remote jobs
or production operations merely to make a local change look more validated.

Keep website guidance, public API docs and the owning changelog consistent with
finished behavior. Read the whole affected page: explain the use case before
options, integrate additions into the correct section, keep related links at the
end, and distinguish published behavior from unreleased source. Validate examples
against the ordinary entry point and preserve public anchors. Use shared
Lumen/Prism/MUI components; check actual provider/
CSS, keyboard states and mobile rendering, not imports alone. Do not duplicate
the component system in local wrappers. Keep tutorials, changing status
inventories and benchmark reports in their owning documentation, out of this file.

Report the concrete result, exact commit/artifact identity, meaningful checks,
remaining risks or unknown outcomes and any outstanding cleanup. Never report
a failed, skipped or unexecuted check as passed.
