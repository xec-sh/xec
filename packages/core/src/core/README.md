# Execution core

The boundary between command composition and target adapters. Public usage belongs in the [package overview](../../README.md) and [API reference](https://xec.sh/docs/api/execution-engine).

## Responsibilities

| Module | Responsibility |
| --- | --- |
| `execution-engine.ts` | Configuration, adapter selection, execution, and disposal |
| `process-context.ts` | Lazy commands, chaining, cancellation ownership, and line iteration |
| `pipe-implementation.ts` | Pipe targets and output transformations |
| `result.ts` | Captured output, status, parsing, and result errors |
| `error.ts` / `failure-kind.ts` | Diagnostic errors and machine-readable failure classification |

## Invariants

- Command construction is lazy. Chaining creates derived configuration; execution owns its mutable lifetime.
- An adapter must implement an option or reject it explicitly.
- Completion includes output delivery and owned resource cleanup. A cancelled or signalled result is not successful.
- Iteration applies backpressure and joins cleanup on early return. Read errors, failed commands, and unconfirmed termination remain visible.
- Raw payloads and diagnostics have separate contracts: returned bytes can be exact while errors and events remain redacted.
- Importing Core installs no global process handlers. Process-wide cleanup is an explicit application choice.

Changes to these contracts require public-path regression tests in `test/unit/core` or the relevant native integration suite, plus an update to the API documentation.
