---
title: TypeScript Setup
description: TypeScript configuration, public types and validation for Xec scripts
---

# TypeScript Configuration for Xec Scripts

Xec loads TypeScript scripts directly. Transpilation makes the script executable;
`tsc --noEmit` separately validates types before execution.

## Zero-Configuration TypeScript

```bash
xec run script.js
xec run script.ts
```

The script loader supports `.ts`, `.mts` and JavaScript extensions. Scripts are
not a JSX rendering environment.

## Built-in Type Definitions

Use the package's public types instead of reproducing interfaces locally:

```typescript
import { $, type ProcessPromise, type ExecutionResult } from '@xec-sh/core';

const pending: ProcessPromise = $`node --version`;
const result: ExecutionResult = await pending;
console.log(result.stdout);
```

## Creating a TypeScript Project

### Basic Setup

Declare directly imported packages in the script project. A globally installed
CLI does not make its TypeScript declarations available to an unrelated project.

```bash
npm init -y
npm pkg set type=module
npm install @xec-sh/core @xec-sh/ops
npm install --save-dev @xec-sh/cli typescript @types/node
```

Use ESM-aware resolution in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["scripts/**/*.ts", "xec-env.d.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Create `xec-env.d.ts` with the import in the next section, then validate and run:

```bash
npx tsc --noEmit
npx xec run scripts/inspect.ts
```

## Type Definitions for Global Context

```typescript
import '@xec-sh/cli/globals';
```

This loads the same declarations checked against the real CLI in Xec's tests:

- `$`: the local callable Core engine.
- `$target`: the selected engine for `xec run`, `xec on` or `xec in`.
- `$targetInfo`: the Loader `TargetInfo` metadata; `name` and `type` are required.
- `args` and `argv`: script arguments and invocation context.
- `use` and `x`: dynamic module-loading helpers.
- Ops utilities including `fs`, `path`, `glob`, `which`, `sleep`, `retry`, `within`,
  `parseArgs`, `log`, `prism` and `kit`.
- The `Xec` type namespace and its public Core/configuration types.

`__filename` and `__dirname` are injected at runtime and declared by Node's types.
`fetch` is provided by the runtime. `$config`, `chalk`, `_` and `dayjs` are not Xec
globals. Import application dependencies explicitly. Do not maintain a second
`declare global` list alongside the package's declarations.

```typescript
import '@xec-sh/cli/globals';
import type { TargetInfo } from '@xec-sh/loader';

const target: TargetInfo = $targetInfo;
console.log(target.type, target.name);
await $target`node --version`;
```

These declarations describe scripts executed by Xec. Importing a declaration file
does not inject globals into plain `node` execution.

## Advanced Type Patterns

### Custom Command Builders

Use the existing configured engine instead of introducing another command-builder
class. Each configuration call returns an execution context:

```typescript
import { $, type CallableExecutionEngine } from '@xec-sh/core';

const build: CallableExecutionEngine = $.cd('/app')
  .env({ NODE_ENV: 'production' })
  .timeout(30_000);
await build`npm run build`;
```

### Result Type Guards

The real result already carries its status. `ok` requires both a successful exit
and no terminating signal:

```typescript
import { $, type ExecutionResult } from '@xec-sh/core';

function report(result: ExecutionResult): void {
  if (result.ok) console.log(result.stdout);
  else console.error(result.exitCode, result.signal, result.cause, result.stderr);
}
report(await $`npm test`.nothrow());
```

### Generic Command Wrappers

The shared retry helper takes a factory and retains its inferred result type.
A repeated `await` of an existing ProcessPromise does not repeat execution.

```typescript
import { $ } from '@xec-sh/core';
import { retry } from '@xec-sh/ops';

const result = await retry(
  () => $`curl --fail https://api.example.com/health`,
  { maxAttempts: 3, initialDelay: 1000 },
);
console.log(result.stdout);
```

Retry only operations whose repeated effects are acceptable. Unknown completion
of a remote mutation requires reconciliation, not an automatic replay.

## Module Imports and NPM Packages

### Dynamic Imports with Types

A normal dynamic import retains the package's exported types:

```typescript
const { join } = await import('node:path');
const output = join(process.cwd(), 'dist');
console.log(output);
```

`use()` can resolve local or remote modules at runtime. It cannot manufacture
compile-time declarations for an undeclared remote package. Install and pin the
package when the script needs static type checking; avoid invented ambient
interfaces that merely assume the remote API.

### Remote Module Integrity

Fetched modules execute with the process's privileges. The loader verifies remote
bytes before execution and records their digests in its module lockfile. This
integrity check does not sandbox module behavior.

| Mode | Behavior |
| --- | --- |
| `lockfile` | Record a digest on first fetch and require later bytes to match. |
| `strict` | Require a previously recorded URL/digest. |
| `off` | Disable verification; unsuitable for trusted build or deployment inputs. |

```typescript
import { ModuleLoader } from '@xec-sh/loader';

const options: ConstructorParameters<typeof ModuleLoader>[0] = {
  cacheDir: '.xec/module-cache',
  integrity: {
    mode: 'strict',
    allowedHosts: ['esm.sh'],
    lockfilePath: './module-lock.json',
  },
};
const loader = new ModuleLoader(options);
```

After a mismatch, verify the intended upstream source and new bytes before
reviewing a lockfile change. Do not remove the integrity record merely to silence
the failure. Keep the reviewed lockfile with the release inputs.

### NPM Package Types

Use the platform's `fetch` and validate external data at runtime. A type assertion
alone does not validate JSON:

```typescript
interface ApiResponse { id: number; name: string }

function isApiResponse(value: unknown): value is ApiResponse {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && typeof value.id === 'number'
    && 'name' in value && typeof value.name === 'string';
}

async function fetchData(): Promise<ApiResponse> {
  const response = await fetch('https://api.example.com/data');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const value: unknown = await response.json();
  if (!isApiResponse(value)) throw new Error('Invalid API response');
  return value;
}
```

## Configuration Types

### Typed Configuration Access

Load the public configuration API explicitly and use its actual configuration type:

```typescript
import { config, type Configuration } from '@xec-sh/ops';

await config.load();
const targets = config.get<Configuration['targets']>('targets');
const production = targets?.hosts?.production;
if (production) console.log(production.host);
```

Named targets are grouped under `hosts`, `containers` and `pods`. They are not a
flat map, and `$targetInfo.config` is only the selected target's configuration.

## Error Handling with Types

### Custom Error Types

Preserve the original cause when adding application context:

```typescript
import { $, CommandError } from '@xec-sh/core';

class DeploymentError extends Error {
  constructor(readonly stage: string, cause: unknown) {
    super(`Deployment failed during ${stage}`, { cause });
    this.name = 'DeploymentError';
  }
}

async function build(): Promise<void> {
  try { await $`npm run build`; }
  catch (error) { throw new DeploymentError('build', error); }
}

try { await build(); }
catch (error) {
  if (error instanceof DeploymentError && error.cause instanceof CommandError) {
    console.error(error.stage, error.cause.exitCode);
  }
  throw error;
}
```

## IDE Integration

### VS Code Setup

Use the project's installed TypeScript and the same `tsconfig.json` as CI. For the
standard TypeScript package, the workspace SDK is `node_modules/typescript/lib`.
If using a compiler alias or the native compiler, configure the SDK supported by
your editor rather than assuming that path exists.

A local CLI installation can be debugged without shell-wrapper indirection:

```json
{
  "version": "0.2.0",
  "configurations": [{
    "type": "node",
    "request": "launch",
    "name": "Debug Xec Script",
    "program": "${workspaceFolder}/node_modules/@xec-sh/cli/bin/xec",
    "args": ["run", "${file}"],
    "skipFiles": ["<node_internals>/**"],
    "console": "integratedTerminal"
  }]
}
```

## Testing TypeScript Scripts

### Unit Testing {#unit-testing-with-jest}

The same application functions can be tested in a chosen runner. Xec's published
fixture helpers require **Vitest**, so the examples here use that runner:

```typescript
import { expect, it } from 'vitest';
import { validateShellName } from '@xec-sh/testing';

it('rejects unsafe fixture names', () => {
  expect(() => validateShellName('fixture; exit 0', 'container')).toThrow();
});
```

### Integration Testing

Test the real execution API without fabricating a ProcessPromise:

```typescript
import { expect, it } from 'vitest';
import { $ } from '@xec-sh/core';

it('reports a real child exit code', async () => {
  const result = await $`${process.execPath} -e ${'process.exitCode = 7'}`.nothrow();
  expect(result.exitCode).toBe(7);
  expect(result.ok).toBe(false);
});
```

See [Command Testing](../../commands/custom/command-testing.md) for CLI-boundary and
isolated SSH tests. Keep integration skip reasons visible.

## Best Practices

1. Validate types before executing scripts with side effects.
2. Import public types instead of maintaining copies or broad `any` declarations.
3. Validate user input and external JSON before narrowing their types.
4. Await operations and resource cleanup; preserve cancellation and error causes.
5. Keep deployment, release and retry logic in the existing shared APIs.

## Complete TypeScript Example

A release inspection script can use the same public planner as the repository's
release recipe, without publishing or modifying the checkout:

```typescript
// scripts/plan-release.ts
import '@xec-sh/cli/globals';
import { planRelease } from '@xec-sh/ops/release';

const version = args[0];
if (!version) throw new Error('Usage: xec run scripts/plan-release.ts VERSION');
const plan = await planRelease(process.cwd(), version);
console.log(JSON.stringify(plan, null, 2));
if (plan.blockers.length) process.exitCode = 1;
```

The [verified release workflow](../../ops/release.md) owns version commits,
prepared archives, registry verification and resume. Do not duplicate it with
ad-hoc `npm publish`, guessed tags or `git push --tags` inside a new example.
