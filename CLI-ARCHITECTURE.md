# The CLI, and what it should become

Written 2026-08-05, after a full audit of `apps/xec` against the built
artifact and a survey of what the best command-line tools shipped in
2024–2026. It states where the CLI stands, what is wrong with it at the
level of structure rather than of flags, and the shortest path from here to
a tool that is genuinely better than the alternatives rather than merely
different.

## 1. What the CLI is

Seventeen thousand lines under `apps/xec/src`, of which four files hold
half: `new` (2423), `config` (2413), `docker` (1932), `inspect` (1712).
Twelve built-in commands, a manifest that lets `--help` list them without
loading them, dynamic commands discovered from `.xec/commands`, and a root
dispatcher that routes anything unrecognised to the shell.

Its one idea is worth restating, because everything below serves it: **the
target changes and the command does not**. `xec on hosts.web-1 'uptime'`,
`xec in containers.api 'uptime'`, `xec in pods.api 'uptime'` — one grammar,
four environments. No competitor in the JavaScript ecosystem crosses the
machine boundary at all: zx, execa, dax and Bun Shell are local-only. The
tools that do cross it — ssh loops, pdsh, ansible ad-hoc, kubectl exec —
each speak a different language and none of them is pleasant.

## 2. The four faults

The audit produced roughly forty findings. They are not forty problems.
They are four, wearing forty coats.

### 2.1 A hand-written dispatcher racing a real parser

`main.ts` inspects `process.argv` by hand before commander sees it, to
support the shorthands (`xec script.ts`, `xec -e`, `xec <task>`, `xec echo
hi`). Hand-parsing argv is a thing you can do correctly exactly once, and
only if you do it whole. Doing it partially produces exactly what was
found: a global flag before a command word kills the routing (`xec -q echo
hi` → "Unknown command"), `-e` is claimed anywhere in argv including after
`--`, `--cwd` applies on one path and not the others, and a command's own
`-e` is unreachable because the root took it.

The fix is not more special cases. It is one pass that splits argv into
`[root flags] [command word] [rest]` and never looks past the command word
again.

### 2.2 Options declared, never wired

`-o/--output json|yaml|csv` is advertised by ten commands and implemented
by none; `inspect` has a private `--format` that works, `logs` a private
`--json` that works. `--env` and `--pattern` are declared without an
accumulator, so the first use fails validation. `-c/--config` is parsed
under one name and read under another. `--runtime`, `--no-universal`,
`--force`, `--poll` are read nowhere.

This is the repo's signature defect — the type system and the help text
both approve, and only a probe with a distinctive value finds it. The
countermeasure is structural: options belong to a declaration that produces
both the parser entry and the reader, so a flag that nothing reads cannot
be declared.

### 2.3 Human output where a machine is listening

Spinner frames, cursor codes, box borders and colour go to stdout whether
or not stdout is a terminal. `VAL=$(xec config get key)` returns a value
wrapped in a box. CI logs fill with `[?25l`. `logs -f` delivers nothing
into a pipe.

A tool that executes commands on production hosts will be called from
scripts more often than from keyboards. Non-TTY is not a degraded mode; it
is the other half of the product.

### 2.4 Nothing owns the process lifecycle

Commands finish their work and leave the process to whatever is still
holding the loop — pools, watchers, streams. Where that is wrong it is very
wrong (a CLI that does not exit cannot be scripted), and the symptom moves
around as adapters change, which is how it survived this long.

## 3. What the best tools do that we do not

From the survey, ranked by what it would buy us:

| Pattern | Best implementor | Why it matters here |
|---|---|---|
| `--json` with named fields, plus built-in `--jq`/`--template` | `gh` | A fleet command's result is a table of hosts; without a machine contract every user writes a parser |
| Dynamic completions | cobra tools, carapace | We can complete *targets from the config*, live containers, task names — nobody else can |
| A real `doctor` | mise, atuin (JSON for bug reports) | Our failure modes are environmental: agent, daemon, kubeconfig, key permissions |
| Stable error codes + a catalogue page | rustc/cargo | The engine already carries suggestions; giving them codes makes them linkable |
| Fleet output discipline | GNU parallel `--tag`/`--group`, turbo 2.0 panels | Interleaved output from twenty hosts is unreadable; prefixing is cheap and transformative |
| Partial-failure ergonomics | ansible (`--limit @retry`, `serial`, `max_fail_percentage`) — but only inside YAML | As *flags* on an ad-hoc command, this is new |
| Output coalescing | `dshbak -c` (pdsh, HPC, 20 years old, forgotten) | "22 hosts said X; web-07 said Y" is the answer people actually want |
| Secret references | `op run`, `doppler run` — local only | Ours would cross the machine boundary: never in argv, masked in every stream |

## 4. The old problems worth solving newly

These are the ones where the current state of the art is genuinely
unsatisfying, and where "one `$`" is not a slogan but an advantage.

**Ad-hoc fleets.** pssh is archived, pdsh is an HPC relic, ansible needs an
inventory and Python on the far side, and everyone else writes a bash loop
that discards exit codes. We already fan out. What we lack is the report:
per-host exit codes as JSON, identical outputs coalesced, a failure summary
you can act on, and `--retry-failed` so the second attempt costs one flag
rather than a rewritten command.

**`kubectl exec` on more than one pod.** The request has been open since
2015 (kubernetes#8876). `kubectl logs` takes a selector; `exec` does not.
Ours can, because a target is already a set.

**Secrets into remote commands.** Locally solved (`op run`, `doppler run`);
remotely still done by pasting into argv, where `ps` and shell history
find it. A `secret://` reference resolved client-side and delivered only
through environment or stdin closes a real hole.

**Long commands and closing laptops.** mosh and Eternal Terminal solve the
interactive case beautifully and the batch case not at all. `--detach` with
a spooled log and `xec jobs attach` is a smaller idea that fits the way
people actually lose `pg_dump` runs.

## 5. The route

**Now — the four faults.** Dispatcher unified; every declared option wired
or removed; one output contract with a clean stdout; the process exits when
the work is done. In progress as of this writing, across four fronts.

**Next — the cheap distinctive wins.** Completions that read the config;
`xec doctor` with `--json`; fleet output with host prefixes and a summary;
`--retry-failed` and `--max-failures`; error codes with a catalogue page.
Each is small, each is visible in the first five minutes of use.

**Then — the differentiators.** `secret://` references; identical-output
coalescing; selector-wide exec on pods; detached jobs; one-way `sync
--watch`. These are the features that make the tool the answer to a
question nobody else is answering.

**Never.** A current-context mutable global (`kubectl config use-context`
is a class of production incident, and its absence is a feature we should
say out loud). Two-way file sync — mutagen spent years on conflict
semantics and we would spend them again. Telemetry: the tool runs commands
on other people's infrastructure, and "no telemetry, ever" is worth more
than any dashboard.

## 6. How we will know it worked

- A script can drive every command: `--json` parses, exit codes classify,
  stdout carries data only.
- `xec on 'hosts.*' 'systemctl status app'` on twenty hosts produces an
  answer a human reads in five seconds.
- A new user reaches a successful remote command without reading the docs.
- Nothing in `--help` is untrue. The audit that finds nothing is the one
  that ships.
