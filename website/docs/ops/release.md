---
title: Verified package releases
description: Prepare immutable package archives, publish with registry confirmation, and resume partial npm or GitHub releases.
---

# Verified package releases {#verified-package-releases}

`@xec-sh/ops/release` provides optional release automation for pnpm workspaces.
It discovers public packages, builds an exact Git snapshot, checks the packed
entry points and records immutable archives before publication. Other Ops imports
do not load release automation. Install the published Ops package before using this subpath in another repository.

## Release Xec {#release-xec}

`release` is this repository's dynamic command in `.xec/commands/release.ts`,
not a global built-in. `pnpm release` and `xec release` invoke the same recipe
when run in this checkout. Other projects register their own recipe using the
shared Ops API.

The recipe declares arguments and options through Xec's project command API.
Run `xec release --help` for generated usage and defaults. Unknown options,
extra arguments and mutually exclusive modes are rejected before release work
begins; the recipe does not maintain a second command-line parser.

Use Node.js, the pnpm version in `packageManager`, Git, npm, and `tar`. Xec's
build also needs Bun. GitHub publication additionally needs an authenticated
`gh` CLI. Run from a clean, committed checkout on the intended release branch.
For an interactive public npm release, the publisher checks the current npm identity before pushing the release refs when archives still need uploading. If the session expired, run `npm login --auth-type=web --registry=https://registry.npmjs.org/` and `npm whoami --registry=https://registry.npmjs.org/`. An authenticated account still needs write access to each destination package or scope.

Install the frozen dependencies in a separate checkout when the current installation serves applications. The root manifest pins published Xec CLI, Ops and Kit with explicit npm dependencies. Those installed packages run the project recipe; the candidate CLI is built only as a release artifact. No local CLI build is required to start. The examples use `0.12.0`; choose your actual next version.

```bash
pnpm install --frozen-lockfile
pnpm release 0.12.0 --dry-run
pnpm release 0.12.0 --prepare
```

The dry run reads local evidence only. It reports package inventory,
source commit and blockers, with a nonzero exit code for a dirty tree or a
conflicting release. It does not run hooks, create a lockfile, build, tag, push,
or contact a registry. Remote readiness is checked during execution.

`--prepare` commits only the synchronized public package versions, preserving
`workspace:` dependency declarations in source. Normal Git commit hooks still
apply. It installs the frozen lockfile without install scripts in a new temporary
snapshot, builds every public workspace, and packs in dependency order. The SSH
core recipe includes the reviewed private transport and its license/checksums.
Before sealing it, Xec installs the actual tarball in a clean offline consumer
and runs the hostile-peer, ChaCha and SFTP failure checks. Resume verifies the
identity and SHA-512 of those sealed bytes. Preparation builds the packages and
runs the configured archive acceptance checks. The full repository tests, lint
and documentation checks belong to qualification/CI, not each npm upload.
The version change refreshes pnpm's workspace metadata from the frozen lockfile with lifecycle scripts disabled. Package compilation takes place in the temporary checkout. If a previous preparation ended with `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`, run `pnpm install --frozen-lockfile` in the tagged checkout, then resume the same version. The saved archives are verified again.

All archives must pass identity, dependency and exported-entry checks before the
sealed record is written. Local artifacts live at:

```text
.release-artifacts/<version>/<source-commit>/
  release.json           # accepted archive identities
  %40scope%2Fpackage.tgz
  publication.jsonl       # appears during publication
```

Keep this directory backed up until publication and recovery are complete.
Archives are read-only and checked by SHA-512 on every resume. A different
archive for an already published version is a conflict, even if its source
looks equivalent. Rebuilding a missing archive is not proof of equivalence.

After reviewing the candidate and its required tests, the operator can publish:

```bash
pnpm release 0.12.0 --resume
```

This pushes only the exact release commit and selected annotated tag, atomically,
without force or `--tags`. Divergent historical tags do not participate. An
already advanced remote branch is preserved on resume. npm uses the prepared
archives; GitHub release notes use the committed changes and package inventory.

If pushing separately, push the reviewed commit and tag, then use
`--resume --no-push`. `--github-only` requires the exact version and a clean
checkout of its release commit; it completes GitHub without republishing npm.
`--notes-from <full-commit>` selects the published ancestor used as the release
notes baseline. Xec verifies that it is a full commit and an ancestor; the caller
is responsible for choosing the published baseline. Without it, notes explicitly
cover committed history, not a guessed release delta. The pinned 0.12.0 driver
does not bound long GitHub notes: use an explicit verified baseline for this
repository's next release. The development API limits generated notes to complete
commit entries within GitHub's body limit, preserves source and package identity,
and links to the full history. It also rejects oversized supplied notes before
remote writes; those improvements become active when the published API pin is
updated.
`--skip-npm` and `--skip-github` are explicit stage selections. `--offline` makes
the isolated dependency installation use the existing pnpm store. `--yes` accepts
the displayed execution plan in noninteractive use; it bypasses no checks.

## Published driver and development capabilities {#published-driver}

The project currently pins Xec **0.12.0**. Its `verifyArtifact` callback runs the
mandatory packed SSH check before archive acceptance. The recipe does not pass
new options to an older API or import the candidate Ops sources to obtain them.
A rejected archive stops preparation; it cannot be published by this recipe.

The published API does not retain a complete producer after consumer rejection.
It also writes its accepted archive record before deleting the temporary build
workspace. Cleanup failure is reported as a failure: inspect and resolve it
before resuming, even if `release.json` exists. The next API addresses both
limitations; a source improvement is not a capability of an installed package.

The development Ops API adds `RELEASE_PRODUCER_PROTOCOL === 1` and the optional
`retainProducer` contract. It saves validated, read-only archives and a
`producer.json` receipt before acceptance. The final `release.json` appears only
after acceptance **and** temporary workspace cleanup succeed. A producer receipt
alone cannot authorize publication.

A retry checks the exact source, package inventory, runtime, build argv,
callback identity, declared policy/input digests and every archive's SHA-512.
It repeats acceptance in a fresh source-only checkout, skipping the isolated
producer's dependency installation, build and packing. No successful consumer
result is cached. A changed input or archive causes refusal; it never causes an
implicit rebuild or replacement of an existing batch. An interrupted partial
producer still needs inspection.

This development API is qualified separately. The repository recipe will adopt
it only after a published driver/API supports it and the pinned dependencies
are updated. Until then, `--prepare` uses published 0.12.0 acceptance, and
publication `--resume` requires its already accepted archives. Do not select a
self-built CLI as a recovery shortcut.

## Failure and recovery {#failure-and-recovery}

The first `SIGINT` or `SIGTERM` cancels execution and waits for the command's
`finally` blocks, temporary workspace cleanup and resource disposal. Xec reports
elapsed cleanup time instead of imposing a separate wall-clock cutoff; individual
operations retain their own timeouts. A second termination signal explicitly
forces exit and reports incomplete cleanup. Exit codes preserve the first signal
(`130` for `SIGINT`, `143` for `SIGTERM`). After cooperative cleanup, the writer
lock is released and the same preparation can be retried. After a forced exit or
crash, inspect the remaining lock and archives before recovery.

| Evidence | Behavior and operator action |
| --- | --- |
| npm already contains matching SHA-512 | Record confirmation; do not publish again. |
| Publish command fails after the registry stored the archive | Read the registry before retrying; matching bytes confirm success. |
| Network or authorization prevents reading registry state | Stop with an unknown outcome. Restore connectivity/access and resume. |
| A later package fails after earlier packages succeeded | Preserve every archive, version commit and tag. Resume the same batch; confirmed packages are skipped. |
| Existing version has different bytes | Stop before publishing the batch. Recover the original archives or prepare a new version. Never unpublish as rollback. |
| GitHub create response is lost | Read back the exact release. A matching published release confirms completion. |
| Existing GitHub draft or release kind differs | Leave it unchanged and report the mismatch for review. |
| Source, archive or tag changed | Refuse to continue until the original clean release checkout and artifacts are restored. |
| Complete `producer.json`, no `release.json` | Retry `--prepare` with the same source, toolchain and declared inputs. Recheck retained archives and rerun acceptance; do not publish. |
| Incomplete artifact directory or writer lock remains after a crash | Inspect the prior process and evidence. The tool never steals a lock or silently repacks an incomplete batch. |

Stable versions use `latest`. Named prereleases use their lane, such as `rc` or
`beta`; numeric, reserved `latest`, and semver-like lane names use `next`.
Publication verifies the lane independently of archive integrity. It refuses an
observed channel downgrade and preserves a newer channel when resuming a version
that is already present. A missing or older lane for an existing archive requires
explicit operator review; the tool does not silently retag it.

npm does not provide a multi-package transaction or compare-and-set for mutable
dist-tags. Serialize publishers for the same package family in CI or through one
release operator. The local writer lock protects one checkout only; it is not a
distributed lock. Consumers may observe a partially published batch until recovery
finishes. Unknown outcomes are never reported as a complete release.

Use npm/gh login or supported environment credentials. Tokens are not accepted as
release command flags. The retired `.xec-release.json` hook/skip configuration
is no longer used; repository-specific validation belongs in the preparation
recipe. In an interactive terminal, an npm authentication challenge opens the native
npm flow. When npm offers to remember the current IP and token for five minutes,
select that option in the browser to authorize subsequent uploads during the window.
Xec asks npm to authenticate again if the registry challenges a later upload.
A numeric OTP supplied through the programmatic callback stays in memory for this
batch and is refreshed on rejection. Receipts contain package identities and checksums.
[npm browser authorization](https://github.blog/changelog/2022-07-26-general-availability-of-improved-2fa-experience-in-npm/).

### An upload is still awaiting the registry {#an-upload-is-still-awaiting-the-registry}

npm scans new uploads before they become public. An accepted upload or HTTP
409 can precede a successful read by minutes. Xec records each accepted upload and
immediately submits the next archive in dependency order. Registry scans can run
at the same time. After submission, Xec polls the outstanding batch for up to
30 minutes. An unverified version reservation or an older receipt with an ambiguous
outcome is checked before any further submission. Resume reconciles recorded uploads.
A matching SHA-512 and release channel
are required before a package is confirmed. The publisher downloads by exact
package name and version from a fresh npm cache. If the version metadata is
visible but that download reports `ETARGET`, the progress line shows
`npm version index`. Xec waits for consumers to be able to resolve the version
and continues with the original upload receipt.

Use `npm stage list <package>` with npm 11.15 or later to inspect a maintainer
approval queue. When an entry is visible, inspect its version and tag and compare
the downloaded tarball with the sealed archive before approving that stage with
2FA. An empty list can also accompany publish-time scanning. Confirmation requires the exact-version metadata, a fresh download with the sealed
SHA-512 and the expected channel or a newer release on that channel.

An updated checkout of the release tool can resume an older tagged checkout
with `pnpm release <version> --resume --workspace <tagged-checkout>`. The selected
checkout supplies the immutable tag, prepared archives and publication receipts.
The release tool verifies them before dispatch. Use `--no-push` when the release
tag already exists on the remote. With GitHub publication enabled, the selected
checkout's `origin` identifies the repository for the release notes.
[Registry scanning](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/)

### Resume when GitHub rejects the SSH key {#resume-when-github-rejects-the-ssh-key}

Run `git ls-remote --heads origin` in the tagged checkout. If it also returns
`Permission denied (publickey)`, check the SSH identity assigned to this
repository. An existing GitHub CLI login with a configured Git credential
helper can alternatively use HTTPS just for the release command. Check the
login's repository permission with `gh api repos/xec-sh/xec --jq .permissions.push`.
For an origin beginning with `git@github.com:`, run the following from the
checkout holding the prepared archives.

```sh
(
  export GIT_CONFIG_COUNT=1
  export GIT_CONFIG_KEY_0='url.https://github.com/.insteadOf'
  export GIT_CONFIG_VALUE_0='git@github.com:'
  pnpm release 0.12.0 --resume
)
```

Use the version on the prepared tag. The temporary Git settings apply to this
one shell and its children.

## Use the library in another workspace {#use-the-library-in-another-workspace}

Add `.release-artifacts/` to that repository's `.gitignore`. The release module
uses pnpm's workspace discovery and never parses workspace globs itself. Public
package dependency cycles and packages outside the checkout are rejected.

```typescript
import {
  acquireReleaseLock, commitReleaseVersion, ensureReleaseTag,
  prepareReleaseArtifacts, pushReleaseRefs,
  publishPreparedRelease,
} from '@xec-sh/ops/release';

const root = process.cwd();
const version = '1.2.0';
const unlock = await acquireReleaseLock(root);
try {
  await commitReleaseVersion(root, version);
  await prepareReleaseArtifacts(root, version, {
    build: { executable: 'pnpm', args: ['--recursive', 'run', 'build'] },
    progress: console.log,
  });
  await ensureReleaseTag(root, version);
  await publishPreparedRelease(root, version, {
    beforeUpload: () => pushReleaseRefs(root, version),
    progress: console.log,
  });
} finally {
  await unlock();
}
```

For a plan, call `planRelease(root, version)` before acquiring the writer lock.
It returns `blockers`, inventory, source commit and npm lane without mutating the
repository. For resume, use `loadPreparedRelease`; never call a custom rebuild as
an error fallback. Hold the same writer lock across preparation and publication.

`publishPreparedRelease` validates the batch and the destination once before calling `beforeUpload`. A failed callback stops publication before the first registry write. Use `preflightPreparedRelease` on its own for a read-only check.

`preparePackage` is an optional per-package recipe, called only inside the
isolated snapshot. It returns a package directory and `npm` or `pnpm` packer.
The returned archive still goes through the shared checks. Repository-specific
packaging belongs here; version, Git, registry and recovery logic remain shared. `verifyArtifact` can
run acceptance against each packed archive before sealing; rejection or a change
to those bytes prevents preparation from completing.

The development `validatePackedPackage` API returns the checked package manifest,
so consumers can use the validated metadata without reading it again.

The development API also exports `packReleaseArtifacts(workspace, temporary,
packages, options)` for independent builders and archive-only CI checks. It
uses the same per-package producer as `prepareReleaseArtifacts`; callers own the
private temporary directory and await its cleanup. `prepareArchive` may normalize
an archive or add source provenance before identity/export validation and hashing.
Acceptance receives these final bytes. Do not repack them for a consumer or
publication. Changes to the archive hook invalidate retained producer identity.

For the development producer API described above, pass
`retainProducer: { policy, inputs, verify }` instead of `verifyArtifact`. `policy` is a SHA-256 digest of the owner's verification
policy; each named `inputs` value is a SHA-256 digest of an actual external
build, packaging or verifier input. Committed inputs are already bound by the
source commit. The owner must include toolchain configuration, inherited
configuration and imported verifier/fixture revisions outside that snapshot.
Function text is additionally bound; it cannot reveal arbitrary JavaScript
closures. Changing a closure without updating its declared input is a broken
recipe contract, not something the library can infer.

`verify({ source, artifacts, run, signal })` receives a fresh committed source
snapshot with **no** producer `dist` or `node_modules`, both initially and on
retry. It must exercise the immutable archives and await all security-relevant
resource cleanup before returning. Archive bytes and the producer receipt are
checked again afterward. Keep consumer checks outside the opaque `build`
command: a failure inside that command precedes producer retention. The
`verifyArtifact` callback receives its built workspace and cannot be
combined with `retainProducer`.

Hold `acquireReleaseLock` over the whole operation as in the example. Retention
uses the existing release ownership interval and portable filesystem operations;
it adds no generic Pipeline checkpoint, distributed lock or automatic stale-lock
recovery. Inspect a forced-exit writer lock using the existing recovery procedure.

`releaseNotes` and `createGithubRelease` provide the independent GitHub stage.
`ReleaseCommand` can inject a transport for tests or a controlled execution
context. Its default implementation uses Xec; adapters must preserve exit codes,
finite deadlines and credential redaction.

In the **development API, not published 0.12.0**, pass
`releaseCommand(cwd, executable, args, { envMode: 'replace', env })` when a build
must receive only declared variables. Omitted `env` then means an empty map;
process, engine and adapter defaults are excluded. Set `PATH` explicitly when
resolving tools by name, or pass an absolute executable path. Default `merge`
behavior remains unchanged. This local process-input contract preserves output,
redaction and cancellation; it is not a sandbox or a way to clear a remote
session's environment. Bind the chosen environment and toolchain to the
producer's declared inputs before reusing it.

Build verification does not replace the owning project's lint, security,
interoperability and application acceptance tests. Xec's CI runs the release
failure suite and its packaged SSH security gate. A source change is not a
published package and does not activate a running daemon or application.

## Run the recipe through Xec {#run-the-recipe-through-xec}

`pnpm release` is an alias for the pinned published `xec release` command.
The complete project policy lives in `.xec/commands/release.ts`; there is no
forwarding release script or dependency on the candidate CLI's `dist` directory.
The project also declares build, test, types and documentation tasks in
`.xec/config.yaml`. Xec executes those tasks; Turbo retains ownership of the
package build graph and cache.

```sh
pnpm install --frozen-lockfile
pnpm exec xec inspect tasks
pnpm exec xec release --list-packages
pnpm exec xec run build
```

Consumer repositories register their own `.xec/commands/release.ts` and compose
the published release functions with their qualification policy. Keep
project-specific build/CI decisions in that command and use the shared release
API for locking, version commits, exact refs, archive sealing and registry
reconciliation. A project command should not introduce another process
launcher, SSH client or release state machine.

## See also {#see-also}

- [Configuration tasks](/docs/configuration/tasks/overview)
- [Pipeline](/docs/ops/pipeline)
- [npm dist-tags](https://docs.npmjs.com/adding-dist-tags-to-packages/)
- [GitHub verified-tag publication](https://cli.github.com/manual/gh_release_create)
