---
title: Environment Variables
description: Configuration inputs, child-process environments and secrets without implicit authority
---

# Environment Variables {#environment-variables}

Use environment variables for values supplied by a workstation, CI runner or
service manager. Keep operation definitions, target selection and validation in
reviewed project configuration. A value is not permission to execute a command.

Three environments are distinct: the process running Xec, the configuration
resolved by Xec, and the child process or remote target. Setting a configuration
variable does not automatically export it to a child or to a remote host.

:::note Version scope
Literal treatment of runtime inputs, safe task interpolation, command-free
previews and `envMode: 'replace'` describe the 0.13.0 implementation.
Do not assume these guarantees in published Xec 0.12.0. Keep untrusted values out
of executable configuration on that release; upgrade before relying on these
boundaries. The examples that only read ordinary environment values do not need
replacement mode.
:::

## Environment Variable Types {#environment-variable-types}

### Xec settings {#1-xec-system-variables}

| Variable | Purpose |
| --- | --- |
| `XEC_CONFIG` | Additional configuration file, merged over project configuration |
| `XEC_PROFILE` | Profile selected when the caller has not explicitly selected one |
| `XEC_HOME_DIR` | Global configuration directory; defaults to `~/.xec` |
| `XEC_COMMANDS_PATH` | Additional project-command directories |
| `XEC_DEBUG` | Enables diagnostic output; unset it for normal operation |
| `NO_COLOR` | Requests uncolored terminal output |

Command paths use the platform path-list delimiter in development: `:` on POSIX,
`;` on Windows. Xec 0.12.0 splits this setting on `:`, which is unsuitable for a
Windows drive-letter path. Command directories contain executable code; only add
trusted directories. `XEC_NO_INTERACTIVE` is consumed by scaffolding; it is **not**
a universal guarantee that every command will avoid prompts. Use each command's
explicit noninteractive options and documented CI behavior.

### Configuration variables {#2-configuration-variables}

Use `XEC_VARS_` for configuration data. Each underscore becomes a path separator,
and values remain strings:

```bash
XEC_VARS_DATABASE_HOST=db.example.com pnpm exec xec config get vars.database.host
```

This overrides `vars.database.host`, not `vars.database_host`. For a key containing
an underscore, declare the key in YAML and reference an ordinary environment
variable with `${env.NAME}`. Do not use arbitrary `XEC_` names for application
settings. The loader maps prefixed names to configuration paths; unsupported paths
can fail validation. Development rejects attempts to define `tasks` or `profiles`
through environment overrides.

### Secrets {#3-secret-variables}

The `env` secret provider reads `SECRET_` by default. For example,
`${secrets.api-key}` reads `SECRET_API_KEY`: the key is uppercased and dots/hyphens
become underscores. Supply the value through the environment of the Xec process,
not a committed file or command-line argument. See [secret management](#secret-management).

### Application variables {#4-user-environment-variables}

Names such as `APP_API_URL`, `NODE_ENV` and `PATH` belong to the application or
host. Xec reads them through `${env.NAME}` in configuration or `process.env.NAME`
in a local script. Use an application prefix rather than the reserved `XEC_`
prefix. Preserve host variables such as `HOME` and `PATH` unless the operation
explicitly needs a different value.

## Using Environment Variables {#using-environment-variables}

### Configuration values {#in-configuration-files}

```yaml
version: '1.0'
vars:
  apiUrl: ${env.APP_API_URL:http://localhost:3000}
  mode: ${env.NODE_ENV:development}
```

An unset value without a default is an error. An empty string is a supplied value;
it does not activate the default. The development interpolator accepts both
`${env.NAME:default}` and `${env.NAME:-default}` with the same **unset-only**
semantics; this is not the shell's empty-or-unset `:-` operator.

Environment values, task parameters, secret results and command output stay
literal in development, even when their text contains `${cmd:...}`. Reviewed
configuration templates can reference other variables; runtime data cannot
recursively become executable template text. This does not make a configuration
file a sandbox: authored `${cmd:...}` expressions are executable code and require
[configuration trust](../../commands/built-in/config.md).

### Command tasks {#in-tasks}

```yaml
version: '1.0'
tasks:
  show-mode:
    command: node -e 'console.log(process.env.NODE_ENV)'
    env:
      NODE_ENV: ${env.APP_MODE:development}
```

Run `pnpm exec xec run show-mode`. The task's `env` supplies child-process values;
it does not replace the local inherited environment. For a multi-step task,
step values override task values, and explicit execution options override both.
Target defaults are applied before task/execution values. A remote target receives
its declared values; do not assume your entire local environment is forwarded.

For interpolated command arguments, let Xec own escaping. In development,
`${params.name}` is data, including inside ordinary POSIX/PowerShell quoted
words. References after shell escapes, in comments or ambiguous nested shell
programs are rejected; argument arrays cannot appear inside quotes. Prefer
unquoted interpolation and explicit argv when possible. Do not construct shell
command text from untrusted strings.

### Scripts {#in-scripts}

A task's `script` is a file path, not an inline JavaScript body. This script checks
presence without printing credentials:

```ts
// verify-environment.ts
const required = ['APP_API_URL', 'SECRET_API_KEY'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(`Missing environment variables: ${missing.join(', ')}`);
}
console.log('Required environment variables are present');
```

Run `pnpm exec xec run ./verify-environment.ts`. Scripts execute locally in the Xec
process. Task/target environment defaults apply to their `$target` command engine;
they do not rewrite `process.env`, relocate the script to a remote machine or
isolate its imports. Use a command task for a separately owned child process.

## Environment Variable Precedence {#environment-variable-precedence}

Configuration sources merge from lowest to highest priority:

1. Built-in defaults.
2. Global configuration in `XEC_HOME_DIR` (normally `~/.xec`).
3. Project configuration.
4. The file selected by `XEC_CONFIG`.
5. Prefixed environment overrides such as `XEC_VARS_PORT`.
6. The active profile's variable and target overrides.

Profile values can therefore override `XEC_VARS_PORT`. This is configuration
precedence, separate from child-process environment merging. For a nonsecret
value, inspect the result with `pnpm exec xec config get vars.port`; do not dump
resolved configuration containing credentials into CI logs.

## Setting Environment Variables {#setting-environment-variables}

### Current invocation or shell {#shell-export}

On POSIX shells, prefix one invocation:

```bash
APP_MODE=development pnpm exec xec run show-mode
```

In PowerShell, set the process environment before invoking the same command:

```powershell
$env:APP_MODE = 'development'
pnpm exec xec run show-mode
```

These examples assume the `show-mode` task above. They do not create a persistent
host setting or deploy an application.

### `.env` files {#env-files}

Xec does not automatically load `.env` files, and `dotenv` is not an implemented
secret provider. Use your CI/service manager's environment injection or an
explicit, trusted environment-file loader before starting Xec. Shell `source`
executes a file as code; it is not a safe dotenv parser. Avoid `export $(cat .env |
xargs)`, which loses quoting and can expose values. Keep real `.env` files outside
version control; an `.env.example` should contain names and harmless defaults.

### CI jobs {#cicd-systems}

Provide secrets using the CI system's protected environment, scoped to the step
that needs them. Install pinned project dependencies before `pnpm exec xec run
<task>`. Review which workflow revisions and untrusted contributions can access
those values. Xec does not configure CI permissions, provision secrets or make a
repeated deployment safe merely because it is a task.

### GitHub Actions {#github-actions}

Set nonsecret inputs in the job/step `env` map and inject credentials from the
repository or environment secret store. Restrict deployment environments and
permissions independently of Xec. A checkout, dependency installation and an
explicit `run` step are required; an `env` block alone is not a workflow.

### GitLab CI {#gitlab-ci}

Use protected CI variables scoped to the intended environment and job. Masking
logs does not stop a job from reading its environment; review the job's code and
runner trust before supplying credentials.

### Jenkins {#jenkins}

Bind credentials inside the relevant pipeline stage. Invoke the same pinned Xec
project command there; do not put credential values into shell command strings or
persist them in generated project configuration.

## Profile Selection via Environment {#profile-selection-via-environment}

### Session default {#default-profile}

`XEC_PROFILE` selects a declared profile for commands that load project
configuration. It does not affect an independent script merely by being set.
Use an explicit environment or reviewed CI job rather than guessing a production
profile from the username, branch name or the presence of `CI`.

### One invocation {#override-profile}

```bash
XEC_PROFILE=staging pnpm exec xec run show-mode
```

This assumes a `staging` profile exists. An explicit profile passed by an API
caller takes precedence over `XEC_PROFILE`. See [profiles](../profiles/overview.md)
for declarations and inheritance.

### Explicit selection in automation {#dynamic-profile-selection}

A CI job can choose a reviewed profile from its declared environment input.
Validate that choice before invoking Xec and reject unknown values; do not use
production as a fallback for an unrecognized branch or user.

## Secret Management {#secret-management}

### Environment provider {#environment-based-secrets}

```yaml
version: '1.0'
secrets:
  provider: env
  config:
    prefix: SECRET_
vars:
  apiKey: ${secrets.api-key}
```

Supply `SECRET_API_KEY` before loading this configuration. An empty provider value
is treated as missing; do not use an empty secret as a sentinel. The implemented
providers are `local`, `env` and `git`; Vault, AWS Secrets Manager, 1Password and
dotenv are not implemented. Secret lookup also has a `SECRET_` environment
fallback; a custom provider prefix is not an isolation boundary.

Provider writes to `env` change only the current process. They do not persist
across invocations or update a CI secret store. Do not put secrets in `vars` unless
a consumer needs that resolved value, and never print the entire result.

## Debugging Environment Variables {#debugging-environment-variables}

### Trace a nonsecret input {#trace-variable-resolution}

Follow the named input through its host environment, configuration reference and
child-process `env` assignment. Inspect presence at each boundary rather than
printing all environment or configuration values. The [precedence list](#environment-variable-precedence)
explains which authored profile can override it.

### Test an override {#test-variable-override}

```bash
XEC_VARS_PORT=3000 pnpm exec xec config get vars.port
```

Use a harmless value and the project's intended profile. This verifies resolution,
not whether the application accepts that port or whether a remote process received it.

## Common Patterns {#common-patterns}

### Development {#development-environment}

Keep local API addresses and modes in a development profile or nonsecret defaults.
Require credentials explicitly. Avoid a blanket `DEBUG=*` in examples that may
be copied into shared environments.

### Production {#production-environment}

Let the service manager or protected CI environment supply runtime secrets.
Select the deployment target and profile explicitly. Do not save a resolved
configuration containing credentials as a reusable release artifact.

### Docker {#docker-environment}

Declare container environment through the Docker target or its owning deployment
configuration. Do not bake secrets into Dockerfile `ENV` instructions or image
layers. Local `process.env` is not the container's environment.

### Kubernetes {#kubernetes-environment}

Use the workload's reviewed environment/Secret references and Kubernetes access
controls. Passing values to a `kubectl exec` command does not update a Deployment
or rotate its pods. Xec does not provide those lifecycle effects implicitly.

## Security Best Practices {#security-best-practices}

### Keep credentials out of source {#1-never-commit-secrets}

Keep credentials, real environment files and resolved configuration out of Git.
Ignoring a file after committing it does not remove its history; rotate exposed
credentials through their owner. Use [secret providers](#secret-management) to
supply data without embedding it in command text.

### Choose the secret owner {#2-use-secret-management}

Use the provider that owns the credential, with access scoped to the operation.
An environment variable is transport for a value, not encrypted storage or a
persistent secret-management service.

### Validate before effects {#3-validate-required-variables}

Check required names, value formats and the selected target before starting a
mutation. A task dependency or an explicit script check can own this validation;
there is no `hooks.before` task contract. A dry-run is a preview, not permission
to skip validation or proof that a deployment will succeed.

### Limit output {#4-sanitize-output}

Report missing variable names, not their values. Diagnostic redaction is a
backstop, not a guarantee that every application-specific secret is recognized.
Raw API stdout/stderr are intentionally available to the caller; sanitize what
you publish to logs or reports.

### Limit child inputs {#5-use-minimal-exposure}

An `env` map normally **merges** with inherited local variables. It is not an
allowlist. Development Core supports explicit local `envMode: 'replace'`, also
forwarded by Pipeline and release operations. That mode passes only the supplied
map, including an explicit `PATH` when required; an omitted map means an empty
environment. Remote adapters reject replacement mode before execution. See
[Pipeline environments](../../ops/pipeline.md) and [release inputs](../../ops/release.md).

Replacement mode limits process inputs; it does not sandbox filesystem, network
or kernel access. YAML task `env` does not enable it. Choose the appropriate
execution API and least-privilege process/container identity for the operation.

## Troubleshooting {#troubleshooting}

### Missing values {#variable-not-found}

Check presence without exposing a value:

```bash
pnpm exec xec -e 'console.log("APP_API_URL present:", process.env.APP_API_URL !== undefined)'
```

If configuration loading fails, verify the variable is exported to the Xec
process and the case matches. A value in a parent shell file or remote service is
not automatically available locally. Inspect only known nonsecret configuration
keys.

### Unexpected precedence {#variable-not-overriding}

Check the active profile and configuration source order above. `XEC_VARS_APP_NAME`
means `vars.app.name`, not `vars.app_name`. Environment overrides are strings;
validate/coerce numeric or boolean application inputs at their owning boundary.
Unset `XEC_DEBUG` after diagnosis, and review any debug log before sharing it.

### Special characters {#special-characters}

Quote values according to the host shell before Xec starts. For example, POSIX
single quotes preserve `$`, backticks and spaces literally:

```bash
APP_LABEL='release $candidate with spaces' pnpm exec xec -e 'console.log(process.env.APP_LABEL)'
```

Xec interpolation and shell parsing are different stages. Avoid a second shell
parse of runtime data; use template arguments or explicit argv through Core.

## Platform-Specific Notes {#platform-specific-notes}

### Linux and macOS {#linuxmacos}

Exports affect the current shell and its descendants. A service manager may use
a different environment from an interactive shell. Do not assume editing a shell
startup file updates an already running service.

### Windows {#windows}

PowerShell `$env:NAME` and CMD `set NAME=value` affect the current process tree.
Persistent user/machine settings affect future processes, not a running Xec
instance. Use `;` for command-directory lists with the development CLI.

### WSL {#wsl}

Windows and WSL processes have distinct environment and path conventions. Forward
only the named values you need; do not share an entire secret-bearing environment
or mix Windows command paths with Linux ones.

## Maintainable Configuration {#best-practices}

### Document required names {#1-document-required-variables}

For each input, document its owner, expected format, whether it is required and
whether it may appear in logs. A list in a README is documentation, not executable
validation; the task or application must perform the check.

### Provide harmless examples {#2-provide-example-configuration}

An `.env.example` may list nonsecret local defaults and empty placeholders for
required credentials. Explain how the chosen runtime loads it; Xec does not
implicitly load files merely because they have that name.

### Keep namespaces clear {#4-use-consistent-naming}

Reserve `XEC_` for Xec settings and overrides. Use a stable application prefix for
ordinary values and the configured secret-provider prefix for credentials.

### Group configuration deliberately {#5-group-related-variables}

Use nested `vars` objects for related settings and validate them together. Remember
that `XEC_VARS_DATABASE_HOST` addresses a nested path; underscores are separators,
not literal characters in that override syntax.

## See Also {#see-also}

- [Variables](./overview.md): references and interpolation.
- [Profiles](../profiles/overview.md): reviewed environment-specific configuration.
- [Configuration commands](../../commands/built-in/config.md): inspection and trust.
- [Tasks](../tasks/overview.md): executable operations and dependencies.
