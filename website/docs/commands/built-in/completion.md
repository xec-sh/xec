---
title: completion
description: Print a shell completion script
---

# completion

Tab completion, including the names only your project knows.

## Synopsis

```bash
xec completion <bash|zsh|fish>
```

## Description

A static list of subcommands is the easy half of completion and the less
useful one — twelve names anyone learns in a week. What an operator
actually cannot remember is the host in `xec on hosts.<tab>`, which lives
in their configuration, changes when they edit it, and no generated script
can contain.

So the emitted script is thin: on every tab it asks
`xec completion --complete` for candidates. That costs one process per
completion, which is the trade every modern CLI has settled on — a list
baked in at install time is stale the first time you add a host.

## Installation

```bash
# bash
xec completion bash >> ~/.bashrc

# zsh — anywhere on $fpath
xec completion zsh > ~/.zfunc/_xec

# fish
xec completion fish > ~/.config/fish/completions/xec.fish
```

## What it completes

| After | Candidates |
|---|---|
| `xec ` | command names |
| `xec on `, `in`, `copy`, `logs`, `watch`, `forward` | configured targets, and `local` |
| `xec run ` | configured tasks |

```console
$ xec on <tab>
containers.api   hosts.db-master   hosts.web-1   local

$ xec run <tab>
deploy   migrate
```

Outside a project, or with a configuration that does not parse,
completion offers nothing rather than reporting an error: a tab that
prints a stack trace into the command line is worse than a tab that does
nothing.

## Related Commands

- [config](config.md) - Where the completed target and task names come from
