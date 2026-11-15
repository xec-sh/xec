---
title: Template Literals API
sidebar_label: Template Literals
description: Keep trusted command syntax separate from argument data, with explicit shell and argv contracts
---

# Template Literals API {#template-literals-api}

A tagged template separates the command you wrote from values received at runtime.
The literal parts are trusted program syntax; substituted values are arguments.
Keep that boundary when values come from a user, configuration, a file, an API or
another command.

```typescript
import { $ } from '@xec-sh/core';

const file = 'README.md';
const result = await $`wc -c -- ${file}`;
console.log(result.stdout);
```

This example uses POSIX tools. Choose tools available on the execution target;
safe interpolation does not make shell syntax or programs portable.

## Basic Usage {#basic-usage}

A template is a shell program. Operators in its literal text, such as `|`, `&&`
and `>`, are interpreted by the selected shell. Operators inside an interpolated
value remain data.

```typescript
import { $ } from '@xec-sh/core';

const value = 'text; with $(shell syntax)';
const result = await $`printf '%s\n' ${value}`;
console.log(result.stdout);
```

Use an explicit `--` separator where the called program supports one. Escaping
prevents a value from becoming shell source; it cannot stop a program from treating
an argument such as `--delete` as an option.

## Automatic Escaping {#automatic-escaping}

Quoting follows the target shell: POSIX single-quoted words, PowerShell literal
strings, or the supported `cmd.exe` encoding. The shell is selected through the
engine or target configuration, not inferred from the argument itself.

**Release boundary:** surrounding-quote handling and the fail-closed rules below
are fixes in **unreleased `main`**, not published 0.12.0. On 0.12.0, place scalar
substitutions outside literal quotes; use explicit `shell: false` argument arrays
when exact arbitrary data is required.

In hardened `main`, normal POSIX and PowerShell quoted scalar values are also
supported. Do not add quotes merely to escape an argument; Xec already does that.

```typescript
import { $ } from '@xec-sh/core';

const name = 'Engineer';
await $`printf '%s\n' ${name}`;
```

Complex shell expansions, here-documents, ANSI-C quoted literals and interpolation
following an escape or inside a comment are rejected when a template contains
values. Quoted arrays are rejected because one quoted word cannot represent
several arguments. Resolve an operation separately or use a script with explicit
argument arrays; do not bypass the refusal with `.raw` for untrusted input.

`cmd.exe` percent expansion, delayed expansion and line breaks cannot be reliably
neutralized by caret quoting across invocation modes. Hardened `main` refuses
those interpolated values, and interpolation inside literal cmd quotes. Direct
argv execution is the appropriate path. NUL bytes are rejected because operating
system argument strings cannot contain them.

## Direct arguments without a shell {#direct-arguments-without-a-shell}

Use the public command object when you have an executable and an argument array:

```typescript
import { $ } from '@xec-sh/core';

const values = ['a b', '%PATH%', '$(not executed)', 'line1\nline2'];
const result = await $.execute({
  command: process.execPath,
  args: ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', '--', ...values],
  shell: false,
});
console.log(result.stdout);
```

This preserves argument boundaries without a shell parser. The called program
still interprets its own options and input; validate those semantics separately.
A remote adapter may need to encode argv for its transport, so consult its target
contract rather than assuming every remote protocol offers native argv.

## Data Types and Their Handling {#data-types-and-their-handling}

| Value | Representation |
| --- | --- |
| String | One escaped argument |
| Number or boolean | Its textual value |
| Array | Separate escaped arguments; an empty array contributes none |
| Plain object | JSON text as one argument |
| `null` or `undefined` | One empty argument, preserving its position |
| Promise/thenable | Awaited before rendering |
| Execution result | Its trimmed text output |

Call a function to use its return value; interpolating a function reference does
not invoke it. Avoid non-serializable objects as command input: circular objects
can fall back to their string representation, which is not a useful data contract.

```typescript
import { $ } from '@xec-sh/core';

const files = ['README.md', 'package.json'];
await $`wc -c -- ${files}`;

const flags = process.env['VERBOSE'] === '1' ? ['--verbose'] : [];
await $`git status ${flags}`;
```

Do not use `undefined` to omit a flag: it contributes an empty argument. Build an
array of the arguments actually needed.

## Promises and Async Values {#promises-and-async-values}

A returned command result remains data in the next operation:

```typescript
import { $ } from '@xec-sh/core';

const revision = await $`git rev-parse --short HEAD`.text();
await $`printf 'Revision: %s\n' ${revision}`;
```

Promise values are awaited before the command starts. Creating an input Promise
may itself start work, so a template's laziness is not a no-effect preview of all
code used to construct its inputs.

## Raw Mode - Without Escaping {#raw-mode---without-escaping}

`$.exec(command)` accepts a trusted complete command string. `$.raw` is a tagged
template that inserts values verbatim. Both deliberately give their input shell
program authority.

```typescript
import { $ } from '@xec-sh/core';

// Static program source owned by this script.
const command = 'git status --short';
const result = await $.exec(command);
console.log(result.stdout);
```

Do not build these strings with user parameters, API responses, secrets or command
stdout. A local configuration file is not automatically trusted merely because
it is on disk. YAML task commands in hardened `main` use the same Core literal/data
boundary; they do not turn every resolved value into `.raw` source.

## Working with Environment {#working-with-environment}

Pass explicit environment through the command API:

```typescript
import { $ } from '@xec-sh/core';

const result = await $`node --version`.env({ NODE_ENV: 'test' });
console.log(result.stdout);
```

Use the target's environment/stdin contract for credentials and register secrets
for diagnostic redaction. Escaping is not redaction: putting a secret in an
argument can expose it through process metadata even if the shell cannot execute
it as code.

## Error Handling in Template Literals {#error-handling-in-template-literals}

Commands reject on failure by default. `.nothrow()` lets you inspect a completed
command result; check `ok` or `exitCode`. It does not turn transport loss or
unconfirmed cancellation into success.

```typescript
import { $ } from '@xec-sh/core';

const result = await $`git diff --quiet`.nothrow();
if (result.exitCode === 1) console.log('Working tree has changes');
else if (!result.ok) throw new Error(`git diff failed: ${result.exitCode}`);
```

Await the command whose completion matters. A lost acknowledgement is not evidence
that a remote operation did nothing, and repeating a command requires an
operation-specific decision.

## Debugging Template Literals {#debugging-template-literals}

Verbose mode and `command:start` events describe execution. They are not dry-run
APIs. `ProcessPromise.toString()` does not expose a resolved command plan. For
reviewable automation, separate pure input/plan validation from execution and
keep side-effecting providers out of preview paths.

## See Also {#see-also}

- [Local shell configuration](../../targets/local/shell-config.md)
- [Portable scripts](../../introduction/portable-scripts.md)
- [Task value and preview contract](../../configuration/tasks/overview.md)
- [Execution errors](./features/error-handling.md)
