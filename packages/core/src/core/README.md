# src/core

The engine internals: everything between the `$` template literal and an
adapter call. Contributor notes — the public API is documented in the package
[README](../../README.md) and on [xec.sh](https://xec.sh).

## Files

| File | Responsibility |
|------|----------------|
| `execution-engine.ts` | `ExecutionEngine`: adapter selection and registration, the chainable configuration methods (`cd`, `env`, `timeout`, `retry`, `ssh`, `docker`, `k8s`, ...), the `templates` registry, engine events, `dispose()` |
| `process-context.ts` | `ProcessContext` and `ProcessPromiseBuilder`: the state behind a `ProcessPromise`, its chain methods, and lazy execution |
| `pipe-implementation.ts` | `executePipe` and `pipeUtils` — everything `.pipe(...)` accepts |
| `result.ts` | `ExecutionResultImpl`: the result every adapter returns |
| `process-output.ts` | `ProcessOutput`, a zx-compatible result view (internal; not exported from the package index) |
| `error.ts` | Error classes: `ExecutionError` (base, with `code` and `details`), `CommandError`, `ConnectionError`, `TimeoutError`, `MaxBufferExceededError`, `DockerError`, `KubernetesError`, `AdapterError` |
| `failure-kind.ts` | `classifyFailure` / `FailureKind`: typed classification of why a command failed |

## Behaviour that tests pin down

- **Lazy execution.** `` $`cmd` `` builds a `ProcessPromise`; nothing spawns
  until `.then()`/`await`. Chain methods (`timeout`, `nothrow`, `quiet`,
  `cache`, `signal`, `interactive`, `pipe`, `kill`, `text`, `json`, `lines`,
  `buffer`) return new promises; state lives in `ProcessContext`.
- **Results.** `ok` is `exitCode === 0` and no signal; a signalled process
  reports `exitCode` as 128+signum and is never `ok`. `cause` says why.
  `stdout`/`stderr`/`stdall` (interleaved), `toString()` returns trimmed
  stdout so results interpolate like `$(...)` in a shell. `throwIfFailed()`
  raises the same `CommandError` a throwing await would.
- **Pipe targets.** Template literal, command string, `Command` object,
  another `ProcessPromise`, a `Transform`/`Writable` stream, or a per-line
  function. `pipeUtils` ships `grep`, `replace`, `toUpperCase`, `tee`.
- **Errors.** `CommandError` carries command, exit code, signal, stdout,
  stderr head and duration; messages pass the same masking as command echoes.
- **Templates.** `engine.template(str, options)` compiles a reusable command;
  `engine.templates` adds `register`/`get`/`render`/`create`/`parse`.
- **Cleanup.** No global process handlers are installed at import time;
  `installCleanupHandlers()` (package index) is the explicit opt-in.

## Performance

Measured on the built `dist` (2026-08-04, see the repository `CLAUDE.md` for
the method): command creation ~6µs, pipe setup ~12µs, execution overhead
<5ms per spawned process. Creation cost is dominated by call-site capture for
error diagnostics (`captureCallSite: false` removes ~3µs of it).

## Editing rules

- New chain methods must work identically on every adapter, or fail loudly
  where unsupported — nothing may be accepted and silently dropped.
- Anything user-visible added here needs: unit tests beside it in
  `test/unit/core/`, a JSDoc block, and a documentation update in the same
  change.
