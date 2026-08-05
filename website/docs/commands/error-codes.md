---
title: Error codes
description: The codes a failure can be identified by
---

# Error codes

Every failure carries a `code`. It is the part a script or an agent should
match on: the message is written for a person and will be reworded; the
code is a promise.

```bash
xec on hosts.web-1 "systemctl restart nginx" -o json
```

```json
{
  "error": true,
  "code": "CONNECTION_FAILED",
  "message": "…",
  "type": "EnhancedConnectionError"
}
```

The error document goes to **stderr**, and stdout stays empty on failure,
so a caller that redirects stdout to a file never finds half a diagnostic
in it.

## Why words and not numbers

`XE0417` would need this page open in another window to mean anything.
`CONNECTION_FAILED` does not. Codes are read far more often than they are
looked up, and renaming the readable ones to numbers would break every
matcher already written against them in exchange for nothing.

System error numbers — `ENOENT`, `EACCES`, `ECONNREFUSED`, `ETIMEDOUT` —
are passed through unchanged rather than translated. They are already a
vocabulary every operator and every language knows.

## The codes

| Code | Meaning |
|---|---|
| `USER_ERROR` | The command was asked to do something it cannot; the message is the whole story. |
| `VALIDATION_ERROR` | An option or argument was not of the shape the command accepts. |
| `CONFIG_ERROR` | The project configuration is missing, unreadable, or describes something impossible. |
| `RESOURCE_NOT_FOUND` | A named target, task or file does not exist. |
| `COMMAND_FAILED` | The command ran on the target and exited non-zero. |
| `TIMEOUT_ERROR` | The command was still running when its time ran out. |
| `MAX_BUFFER_EXCEEDED` | The command produced more output than the buffer allows; stream it instead. |
| `OPERATION_FAILED` | An operation this tool performs itself — a copy, a transfer — did not complete. |
| `CONNECTION_FAILED` | The target could not be reached, or refused the connection. |
| `ADAPTER_ERROR` | The adapter for this kind of target could not carry out the request. |
| `DOCKER_ERROR` | Docker refused the operation, or the daemon is not reachable. |
| `KUBERNETES_ERROR` | The cluster refused the operation, or kubectl could not reach it. |
| `NETWORK_ERROR` | A network operation failed for a reason the adapter could not classify. |
| `CONTEXT_ERROR` | The target names a cluster context or kubeconfig that does not exist. |
| `TASK_ERROR` | A configured task failed, or is defined in a way that cannot run. |
| `RECIPE_ERROR` | A recipe failed, or is defined in a way that cannot run. |
| `MODULE_ERROR` | A script or module could not be loaded. |
| `FILESYSTEM_ERROR` | A file operation failed for a reason with no more specific code. |
| `SECRET_NOT_FOUND` | No secret is stored under that name. |
| `GET_ERROR` | The secret exists but could not be read from the store. |
| `SET_ERROR` | The secret could not be written to the store. |
| `DELETE_ERROR` | The secret could not be removed from the store. |
| `LIST_ERROR` | The store could not be enumerated. |
| `DECRYPTION_FAILED` | The record was found but could not be decrypted; the passphrase or the machine differs. |
| `STORAGE_ACCESS_ERROR` | The secret store directory cannot be read or written. |
| `GIT_OPERATION_FAILED` | The git secret provider could not complete a git operation. |
| `TEAM_MEMBER_NOT_FOUND` | No team member is registered under that name. |
| `UNKNOWN_ERROR` | The failure was not recognised; the message and, with --verbose, the stack are all there is. |
## Exit codes

The code identifies *what* failed; the exit status says only whether
something did. They are separate on purpose — a shell can act on one and
a program on the other.

- `0` — success
- The command's own exit code, when exactly one target ran and exited
  non-zero, so `xec on web-1 "test -f /etc/nginx.conf"` works in an `if`
- `2` — the arguments were not valid
- `1` — everything else

## Adding a code

A code is a promise, so the list is pinned: `error-codes.test.ts` fails if
one is removed, if two codes describe the same idea, or if the source
emits a code the catalogue does not describe. A code a caller can see is
one they may match on.
