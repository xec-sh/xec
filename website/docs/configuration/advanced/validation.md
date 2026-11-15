---
title: Configuration Validation
description: Check configuration, understand the result, and add explicit preflight checks without executing a deployment.
---

# Configuration Validation {#configuration-validation}

Check configuration before running an operation. Separate three questions:
is the document loadable, is its configuration supported, and can the intended
target perform the operation? A successful configuration check answers only the
checks it actually ran; it is not a deployment receipt.

:::warning Xec 0.13.0 limitation
The CLI can report a valid default configuration after a malformed YAML file was
skipped by the non-strict loader. Do not use `xec config validate` alone as a
fail-closed admission check for an untrusted or newly edited file. The explicit
strict library check below rejects load failures. This limitation remains in
0.13.0; it is not fixed by updating the documentation.
:::

## What is checked {#validation-levels}

| Layer | Checks | Does not establish |
| --- | --- | --- |
| Loading | YAML parsing, source selection, profile resolution and value interpolation | That every expected file was loaded by a non-strict caller |
| Configuration | Version syntax, target fields, task definitions, profile inheritance, supported secret providers and CLI command defaults | Remote connectivity or application readiness |
| Operation preflight | Checks explicitly implemented by your task or application | Automatic rollback, exactly-once execution or authorization to mutate a target |

Validation may load configuration. An authored `${cmd:...}` is executable code,
and secret providers may read external state. Use `evaluateCommands: false` for
a library check that must refuse those evaluations. A refusal means that the
value could not be established under that policy.

### Schema validation {#1-schema-validation}
The validator checks supported configuration fields. It does not promise a
complete JSON Schema check of every arbitrary value under `vars`.

### Semantic validation {#2-semantic-validation}
Task parsing, profile inheritance and command-default schemas provide different
checks. Missing runtime values or target resolution may fail later at execution.

### Runtime validation {#3-runtime-validation}
Run explicit, bounded probes against the intended target. Configuration
validation itself does not execute a remote readiness test.

## Configuration shape {#configuration-schema}

### Structure {#schema-structure}
A configuration has a `version` and optional `vars`, `targets`, `tasks`,
`profiles`, `scripts`, `commands` and `secrets`. See the
[configuration reference](../config-file.md) for each supported contract.

### Types {#type-validation}
Keep numbers and booleans typed in YAML. Environment overrides are strings;
validate application-specific conversions rather than assuming coercion.

## Inspect a configuration {#validation-commands}

### Basic validation {#basic-validation}

Run these commands in a project with a reviewed configuration:

```bash
pnpm exec xec config validate
pnpm exec xec config --output json validate
pnpm exec xec config --config .xec/config.yaml --profile staging validate
pnpm exec xec config tasks validate
```

`--config` selects the file and `--profile` selects the environment. `tasks
validate` checks task definitions; it does not run them. `config validate` has no
`--runtime`, `--strict`, `--targets`, `--errors-only` or `--report` option. Use
`xec config --help` and subcommand help for the installed command schema.

### Detailed validation {#detailed-validation}
The JSON result separates errors and warnings. It is the same validation path
as human-readable output, with the same limits.

Inspect the resolved values separately:

```bash
pnpm exec xec config list --path targets
pnpm exec xec config get vars.region
pnpm exec xec config --profile staging view
pnpm exec xec inspect tasks check --explain
```

Resolved configuration can contain sensitive values. Avoid collecting a whole
configuration in a shared CI log; select only the fields needed for diagnosis.

### Selective validation {#selective-validation}
`config tasks validate` checks task definitions. For another section, select it
with `config list --path` and add the owning application's typed check; there is
no generic `--targets` or `--variables` validation switch.

## Reject load failures explicitly {#custom-validation}

### Validation scripts {#validation-scripts}

Install `@xec-sh/ops` as a pinned project dependency. Save this as
`.xec/check-config.ts` and run `pnpm exec xec run .xec/check-config.ts`:

```typescript
import { ConfigurationManager } from '@xec-sh/ops';

const manager = new ConfigurationManager({
  projectRoot: process.cwd(),
  configFilePath: '.xec/config.yaml',
  strict: true,
  evaluateCommands: false,
});

await manager.load();
const diagnostics = await manager.validate();
if (diagnostics.length > 0) {
  throw new Error(diagnostics.map(item => `${item.path}: ${item.message}`).join('\n'));
}
console.log('Configuration loaded and validated');
```

A missing or malformed selected file rejects. Strict loading rejects validation
warnings as well as errors. This Ops check does not replace the CLI's validation
of built-in command options; use both when the configuration declares `commands`.
If validation needs a secret or executable provider, decide its allowed scope
explicitly instead of substituting an empty value.

### Pre-execution validation {#pre-execution-validation}

A YAML script task references that file; it does not contain inline JavaScript:

```yaml
version: "1.0"
tasks:
  check-config:
    script: .xec/check-config.ts
  check:
    steps:
      - task: check-config
      - command: pnpm typecheck
```

### Application rules {#validation-rules}

Use an explicit first step for preflight. Task `hooks`, `dependsOn`, `schedule`
and arbitrary `validation` rules are not implemented. For dependency graphs,
use the [Pipeline API](../../ops/pipeline.md); for application-specific rules,
write a typed function called by the task.

## Diagnose a rejected configuration {#common-validation-errors}

| Diagnostic | Check |
| --- | --- |
| YAML load failure | Syntax and the exact file selected by `--config` or `configFilePath` |
| Missing or invalid version | A configuration `version` such as `"1.0"`; this is separate from the Xec package version |
| Invalid SSH port | A number between 1 and 65535 |
| Missing container or pod reference | The `container`/`image` or `pod`/`selector` target fields |
| Invalid task | Exactly one of `command`, `script` or `steps`, plus supported task fields |
| Profile inheritance error | The named base profile exists and inheritance is acyclic |
| Unsupported secret provider | An implemented provider: `local`, `env` or `git` |
| Invalid command default | The option's name and type in that command's actual CLI schema |

### Missing required fields {#missing-required-fields}
Validate the effective configuration and confirm the intended source was loaded.
Defaults can supply values; their presence does not prove the file declared them.

### Invalid references {#invalid-references}
Check the target or nested task identifier against the intended configuration.
A valid shape alone does not prove that a remote resource exists.

### Circular dependencies {#circular-dependencies}
Remove cycles in profile inheritance and nested task calls. For a dependency
DAG, use the Pipeline API rather than unsupported task-step `dependsOn` fields.

### Type mismatches {#type-mismatches}
Use the declared task parameter type and convert external input explicitly.
A string such as `"8080"` is not automatically an application-level port value.

Variables are data, not a schema declaration: defining `vars.port` does not
establish a minimum, maximum or business rule. Declare task parameter types
where applicable and validate domain constraints in code. For undefined values,
use a deliberate default only when it has a valid operational meaning.

## Variables {#variable-validation}

### Undefined variables {#undefined-variables}
Supply required values explicitly. A default should represent a valid choice,
not hide a missing credential, target or release identity.

### Resolution {#variable-resolution}
Use `config get vars.NAME` for a selected value. Task parameters resolve in the
invocation context; inspecting a definition does not supply its runtime inputs.

### Circular references {#circular-references}
Keep authored variable references acyclic. The validator's direct self-reference
check is not a proof that every possible interpolation graph will resolve.

## Targets {#target-validation}

### Connectivity {#connectivity-testing}
Choose a read-only probe and a deadline explicitly. A successful probe proves
only the capability and target observed at that time.

### SSH {#ssh-target-validation}
The schema checks the host and port. Authentication, host-key trust and command
permissions are established by the SSH operation, not by YAML validation.

### Docker {#docker-target-validation}
Declare a container or image and correctly typed volume/port lists. The Docker
adapter owns inventory, daemon errors and readiness; validation does not pull images.

### Kubernetes {#kubernetes-target-validation}
Declare a pod or selector and the intended namespace/context. The Kubernetes
operation establishes cluster access, resource selection and permissions.

## Tasks {#task-validation}

### Execution form {#task-structure}
Each task selects one form: a command, a script path or a list of steps.
Unsupported executable fields are rejected instead of treated as capabilities.

### Step dependencies {#step-dependencies}
Use ordered steps or the task's bounded parallel mode. A YAML step has no
`dependsOn` DAG contract; the separate Pipeline API does.

### Parameters {#parameter-validation}
Declare `required`, `type` and applicable constraints such as enum `values` or
numeric `min`/`max`. Check cross-field business rules in the owning function.

## Profiles {#profile-validation}

### Inheritance {#inheritance-chain}
Keep the base profile defined and the `extends` chain acyclic. Validate the
profile actually selected by the operator, including separate profile files.

### Merging {#profile-merging}
Use `config --profile staging view` to inspect the selected effective view.
Profiles override project and environment-derived configuration in this loader;
see [source precedence](../../ops/config.md#config-sources-priority-order).

## Check the intended environment {#environment-validation}

### Environment checks {#environment-checks}

Configuration validation does not connect to SSH servers, pull Docker images,
query Kubernetes, or inspect application health. Add read-only checks using the
same explicit target that will perform the operation. For example, after
reviewing and recording the SSH host key:

```typescript
import { $, dispose } from '@xec-sh/core';

try {
  const server = $.ssh({ host: 'build.example.com', username: 'deploy' });
  const result = await server`node --version`.timeout('10s');
  console.log(result.stdout.trim());
} finally {
  await dispose();
}
```

This standalone script releases its default engine in `finally`. In a shared
application, the owner of that engine controls its disposal. Probe only the
capabilities the operation needs. A reachable server does not imply available
disk space, sufficient permissions or a healthy service; establish those through
the owning application API. A failed probe must not fall back to local execution.

### Resource checks {#resource-validation}
Measure required disk, memory or service capacity through the target's ordinary
API. Do not use the local machine's capacity as evidence for a remote target.

## Automation and reports {#continuous-validation}

### Pre-commit feedback {#pre-commit-hooks}
A pre-commit check can shorten feedback after an edit. Keep it scoped to changed
inputs; its success does not authorize a later deployment.

### CI integration {#cicd-integration}

Run the explicit strict check and affected project checks before a mutation.
Pin the CLI and libraries in the lockfile, install frozen dependencies, and reuse
successful results only for the exact inputs they checked. A pre-commit check
is useful feedback; the deployment path still owns its admission decision.

### Operation acceptance {#automated-testing}
Check failure paths as well as success: missing files, malformed YAML, unsupported
task fields, refused trust and unavailable targets. Use disposable fixtures;
configuration tests must not deploy to production as a side effect.

### Structured CLI result {#validation-reports}

#### Save a report {#generate-reports}

```bash
pnpm exec xec config --output json validate > validation.json
```

#### Result fields {#report-format}

The result has this shape:

```json
{
  "valid": true,
  "errors": [],
  "warnings": []
}
```

The CLI sets a nonzero exit code for reported errors. Warnings are separate from
errors. Preserve the exit status and diagnostics; never infer success from the
existence of the output file. The 0.13.0 loader limitation above also applies to
this JSON result. There is no built-in HTML report or implicit connectivity test.

## Validation policy {#best-practices}

### Validate at the input boundary {#1-validate-early-and-often}
Reject invalid inputs before starting an effect, then carry the validated values
to the operation instead of reparsing different data later.

### Use an explicit strict loader {#2-use-strict-mode}
For 0.13.0, use the library check above when a skipped file must be a hard failure.
There is no CLI `config validate --strict` equivalent.

### Keep checks reproducible {#3-automate-validation}
Pin the toolchain and dependencies. Bind reusable acceptance results to the
actual configuration and artifact identities, not just a timestamp.

### Explain each rule {#4-document-validation-rules}
Describe the failure and corrective action beside the owning task or API.
Do not declare arbitrary `vars.validation` data as an executable policy.

### Separate static and live checks {#5-progressive-validation}
Run static checks during preparation. Check changing target state close to the
operation that depends on it, without repeating unchanged builds or tests.

## Troubleshooting {#troubleshooting}

### Locate the failure {#validation-failures}

First confirm the installed version, selected file and active profile. Reduce a
failure to the owning layer: YAML loading, configuration validation, target
resolution, then operation execution. A preview does not run the operation and
cannot prove its runtime outcome. Keep secrets out of diagnostic attachments.

### Correct the owning input {#common-solutions}
Fix the selected document, target or parameter. Do not retry a mutation to test
whether a configuration error disappeared, and do not silence load warnings.

## Apply the result {#next-steps}
Proceed only when the required inputs and target observations are established.
Keep an explicit recovery decision for unknown operation outcomes; successful
validation cannot turn an unconfirmed deployment into a known failure.

## See Also {#see-also}

- [Configuration sources and fields](../config-file.md)
- [CLI configuration commands](../../commands/built-in/config.md)
- [Tasks and their execution limits](../tasks/overview.md)
- [Environment values](../variables/environment.md)
- [Configuration troubleshooting](./troubleshooting.md)
