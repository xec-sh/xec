---
title: doctor
description: Check the environment xec runs in
---

# doctor

Report on the machine and project xec is about to run in.

## Synopsis

```bash
xec doctor [options]
```

## Description

Everything this command reports has caused a confusing failure somewhere
else: a docker daemon that is not running, a Node too old for the type
stripping `.ts` tasks rely on, a directory with no project in it, a secret
store the surrounding repository is about to commit. Each of those
produces an error at the moment of use, phrased in terms of whatever
operation happened to hit it first — a timeout, a spawn failure, a parse
error a long way from the cause.

Asking directly is cheaper than working backwards from a stack trace. For
an agent, which cannot look at the machine, it is the only way to find out
what is available before choosing how to do something.

## Options

- `--deep` - Also contact the docker daemon and read the current
  Kubernetes context. Left out by default because both can hang on a bad
  configuration, while finding a binary and asking its version cannot.
- `-o, --output <format>` - `text` (default), `json`, `yaml`, `csv`

## Examples

```bash
# Report on this machine and project
xec doctor

# The same report as data
xec doctor -o json

# Use as a precondition
xec doctor && ./deploy.sh
```

## Output

```console
$ xec doctor
✓ Node: 22.18.0 on darwin/arm64
✓ Output: interactive
✓ docker: Docker version 27.4.0, build bde2b89
! kubectl: not found
  Install it if you need it — needed for kubernetes targets.
✓ ssh: OpenSSH_9.8p1, LibreSSL 3.3.6
✓ git: git version 2.49.0
✓ Project: /srv/app/.xec/config.yaml (48 lines)
✓ Secrets: /srv/app/.xec/secrets, excluded from git
```

Each check carries a **stable id** — `runtime.node`, `tool.docker`,
`project`, `secrets` — which is what a script should match on. The names
are for people and may be reworded.

```json
{
  "ok": true,
  "failed": 0,
  "warnings": 1,
  "checks": [
    { "id": "runtime.node", "name": "Node", "status": "ok", "detail": "22.18.0 on darwin/arm64" },
    { "id": "tool.kubectl", "name": "kubectl", "status": "warn", "detail": "not found",
      "fix": "Install it if you need it — needed for kubernetes targets." }
  ]
}
```

The report is the answer, so it goes to stdout; the closing tally goes to
stderr with the rest of the narration.

Nothing here names a secret or prints one. A diagnostic you have to redact
before pasting into an issue is not a diagnostic.

## Exit Codes

- `0` - No check failed. Warnings do not fail: they describe something
  absent that is not always needed, so a missing `kubectl` does not block
  `xec doctor && ./deploy.sh` on a machine with no clusters.
- `1` - At least one check failed.

## Related Commands

- [new](new.md) - Create the project `doctor` reports as missing
- [secrets](secrets.md) - The store `doctor` checks is excluded from git
