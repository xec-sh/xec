---
title: Installation
description: Install a reproducible project CLI or use Xec libraries directly
keywords: [install, setup, npm, pnpm, global, local]
---

# Installation {#installation}

For a shared repository, install the CLI as an exact development dependency and
commit the package-manager lockfile. Engineers, CI and agents then use the same
published release. A global installation is useful for ad hoc terminal work.

## System requirements {#system-requirements}

- The **CLI requires Node.js 22.18.0 or later**. Core, Ops, Loader and Kit declare
  Node.js 20 or later; importing a library does not lower the CLI requirement.
- Linux, macOS and Windows are supported targets. The current main unit-test
  workflow runs on Linux and Windows; that is not a claim that every native
  target is tested on every OS in each CI run.
- Use npm or pnpm. A contributing checkout uses the version in `packageManager`.
- SSH needs a reachable server, credentials and a host-key policy. Xec bundles
  its `ssh2` transport; an external OpenSSH client is not required for execution.
- Docker operations need a reachable Docker daemon and Docker CLI. Kubernetes
  operations need `kubectl`, a context and suitable cluster permissions.

The CLI loads TypeScript; running it does not require a global `tsx` or
`ts-node` installation. Execution is not type checking: use your project's
TypeScript check separately.

## Project installation {#project-installation}

In an existing Node.js project:

```bash
npm install --save-dev --save-exact @xec-sh/cli
npx xec --version
npx xec --help
```

With pnpm:

```bash
pnpm add --save-dev --save-exact @xec-sh/cli
pnpm exec xec --version
```

If the project does not yet have a `package.json`, create it with `npm init -y`
first. Commit the manifest and lockfile. Use `npm ci` or
`pnpm install --frozen-lockfile` when reproducing that installation.

Inside package scripts, the local executable is already on `PATH`:

```json
{
  "scripts": {
    "inspect-project": "xec run .xec/scripts/inspect.ts"
  }
}
```

Create the referenced script before running `npm run inspect-project`.
`build`, `test`, `deploy` and `release` are project-defined tasks or commands,
not universal built-ins.

## Library installation {#package-overview}

Install the package that owns the capability you need:

| Package | Responsibility |
| --- | --- |
| `@xec-sh/core` | Local, SSH, Docker and Kubernetes command execution |
| `@xec-sh/ops` | Configuration, tasks, pipelines, workflows and releases |
| `@xec-sh/loader` | Script/module loading and runtime utilities |
| `@xec-sh/kit` | Terminal prompts, progress and formatting |
| `@xec-sh/testing` | Disposable fixtures and Vitest integration |
| `@xec-sh/cli` | The `xec` executable and project command discovery |

```bash
npm install --save-exact @xec-sh/core
```

For an ESM project (`"type": "module"` in `package.json`), create `inspect.js`:

```javascript
import { $ } from '@xec-sh/core';

console.log(await $`node --version`.text());
```

```bash
node inspect.js
```

The library does not inject CLI script globals. Import the APIs used by your
application. Testing helpers require a compatible Vitest installation; consult
that package's declared peer dependencies before adding it.

## Global installation {#global-installation-recommended}

```bash
npm install --global @xec-sh/cli
xec --version
```

A globally installed CLI can differ from a project's pinned CLI. Use
`npm exec -- xec` or `pnpm exec xec` inside a project when reproducibility matters.

## Platform behavior {#platform-specific-setup}

Shell syntax is not portable merely because the execution API is shared.
For example, Windows `cmd.exe` supports `&&` but uses `%NAME%` rather than POSIX
`$NAME` expansion. POSIX utilities are not automatically installed on Windows.
Use Node.js APIs for portable file operations or select a shell explicitly when
its presence is part of your environment contract. See
[portable scripts](./portable-scripts.md).

## Container installation {#docker-installation}

Use a Node image meeting the CLI requirement. This example assumes a project
lockfile that already pins `@xec-sh/cli` and an `inspect.ts` file:

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npm", "exec", "--", "xec", "run", "inspect.ts"]
```

A container does not gain Docker-daemon or cluster access automatically. Grant
those capabilities only when the workflow requires them.

## Contributing installation {#development-installation}

```bash
git clone https://github.com/xec-sh/xec.git
cd xec
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

The development repository pins a published Xec for its own `.xec` project
commands. Building candidate packages tests the product being developed; it is
not a prerequisite for the published CLI to manage the repository. Follow the
repository's current [contribution guide](https://github.com/xec-sh/xec/blob/main/CONTRIBUTING.md)
for focused checks.

## Verify and troubleshoot {#verifying-installation}

```bash
node --version
npx xec --version
npx xec run -e "console.log('Xec is ready')"
```

If startup fails, check the Node version, the resolved executable and whether
the local dependencies were installed from the lockfile. A missing project
module should be installed in that project; clearing every cache or adding a
global transpiler does not repair its dependency declaration.

If a global install requires elevated privileges, prefer a project installation
or a Node version manager with a user-owned installation directory.

## Updating and uninstalling {#updating-xec}

Update deliberately, review the lockfile and run the affected project checks:

```bash
npm install --save-dev --save-exact @xec-sh/cli@VERSION
npm install --save-exact @xec-sh/core@VERSION
```

Replace `VERSION` with the release you intend to adopt. Only update packages your
project actually uses. To uninstall, use `npm uninstall @xec-sh/cli` or
`npm uninstall --global @xec-sh/cli`; keep project configuration and operational
data unless you independently intend to remove them.

## See also {#see-also}

- [Quick start](./quick-start.md): a complete first workflow.
- [Package ecosystem](./ecosystem.md): package boundaries and entry points.
- [Configuration troubleshooting](../configuration/advanced/troubleshooting.md).
