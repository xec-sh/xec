# Changelog

## Unreleased

- Local commands support explicit `envMode: 'replace'`: only the selected environment reaches spawn, without process, engine, adapter, scope defaults or preferLocal PATH additions. Merge remains the default; remote adapters reject replacement before execution. Lazy execution uses the same provenance resolver and cache keys distinguish environment policies.

- `within` adopts returned lazy commands inside its async scope, preserving environment and cancellation without requiring callers to add an extra `await`.

- Tagged-template interpolation now follows surrounding POSIX/PowerShell quote context and preserves argument data inside normal quotes. NUL bytes, escaped/comment positions, complex shell expansions/here-documents and quoted arrays fail closed. Use explicit `shell: false` argument arrays for arbitrary data or complex programs.
- `cmd.exe` interpolation refuses percent/delayed expansion and line breaks, which caret quoting cannot safely neutralize across invocation modes. Raw execution remains an explicit trusted-source API.

- Caller-journalled `operationId` UUIDs cannot use automatic retries. Awaited `onResource` persists daemon identity before create and full container ID before start.
- Generic `ExecutionOutcomeUnknownError` preserves typed ownership evidence. `inspectExecution` and `terminateExecution` verify daemon ID, operation label and full ID. Absence on another daemon never acknowledges cleanup.
- Docker target selection is pinned per adapter; explicit context, host and socket settings are honored.
- Docker run accepts explicit `never`/`missing`/`always` pull policy and CPU, memory-byte and PID limits; exec refuses these creation-only controls.

- Docker run-mode commands now create and own one immutable container ID before attaching. `ProcessHandle.resource` exposes that identity.
- Timeout, cancellation, `kill()` and adapter disposal await remote state verification. A failed verification remains an error with `nothrow`; a successful local transport exit alone cannot acknowledge completion.
- A reserved per-operation label supports bounded recovery after a lost create response. Cleanup verifies the label and full ID, refuses foreign/adopted resources, and reports uncertainty when creation cannot be reconciled.
- The original command timeout includes creation and execution. Cleanup shares a bounded management deadline and addresses only the owned container. `autoRemove: false` retains a confirmed stopped container; interrupted unstarted containers are removed.
- Docker exec and Kubernetes exec still own only their transports, not the existing containers. Their cancellation does not guarantee that the remote process stopped.
