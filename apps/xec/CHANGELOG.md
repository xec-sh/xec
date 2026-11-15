# Changelog

## Unreleased

- PostgreSQL service restore ignores `.psqlrc`, stops on SQL errors and uses a
  single transaction for ordinary plain dumps. Inherited `nothrow` and retries
  cannot hide or repeat a failed restore. Errors retain their cause and require
  destination inspection before a retry when completion was not confirmed.
  Scripts that control transactions/connections or change `ON_ERROR_STOP` remain
  unsupported; arbitrary SQL is not guaranteed to be atomic.
