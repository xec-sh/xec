# Changelog

## Unreleased

## [0.13.0] - 2026-11-15

- Local TypeScript commands and deferred imports keep their authored paths through the shared Loader graph. CLI cleanup releases graph hooks after command actions and resource cleanup, without changing root-help laziness.

- A requested project command that cannot load fails with its loading cause, including `command --help`. Root help and unrelated commands remain lazy and do not evaluate the broken module. Extra command paths use the platform path-list delimiter, preserving Windows drive letters.

- Explicit `xec -- <executable> [args]` bypasses project discovery and always executes local argv. It never guesses Docker, Kubernetes or SSH targets; use explicit `on`/`in` commands. Failed command output and exit codes survive ordinary and quiet diagnostics.

- Command configuration defaults use the native option schema and Commander provenance: explicit CLI values win, configured values override parser defaults, and unknown/invocation-only keys are rejected. `config doctor` validates its proposed document before writing.

- Project/task/profile scaffolds use the execution configuration contract and preserve existing named definitions unless `--force` is explicit. Nonfunctional extensions and unused scaffold flags are removed; unsupported previews or machine output fail before filesystem effects. Confirmed Git initialization no longer stages or commits unrelated project files.

- `run --dry-run` previews tasks, script files, inline evaluation and REPL without executing them. Executable configuration and secret-provider values fail explicitly during preview; provider initialization is skipped. CLI output distinguishes a preview from completed execution.

- PostgreSQL service restore ignores `.psqlrc`, stops on SQL errors and uses a
  single transaction for ordinary plain dumps. Inherited `nothrow` and retries
  cannot hide or repeat a failed restore. Errors retain their cause and require
  destination inspection before a retry when completion was not confirmed.
  Scripts that control transactions/connections or change `ON_ERROR_STOP` remain
  unsupported; arbitrary SQL is not guaranteed to be atomic.
