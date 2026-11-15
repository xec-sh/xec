# Changelog

## Unreleased

- `run --dry-run` previews tasks, script files, inline evaluation and REPL without executing them. Executable configuration and secret-provider values fail explicitly during preview; provider initialization is skipped. CLI output distinguishes a preview from completed execution.

- PostgreSQL service restore ignores `.psqlrc`, stops on SQL errors and uses a
  single transaction for ordinary plain dumps. Inherited `nothrow` and retries
  cannot hide or repeat a failed restore. Errors retain their cause and require
  destination inspection before a retry when completion was not confirmed.
  Scripts that control transactions/connections or change `ON_ERROR_STOP` remain
  unsupported; arbitrary SQL is not guaranteed to be atomic.
