---
title: Verified package releases
description: Prepare immutable package archives, publish with registry confirmation, and resume partial npm or GitHub releases.
---

# Verified package releases

`@xec-sh/ops/release` provides optional release automation for pnpm workspaces.
It discovers public packages, builds an exact Git snapshot, checks the packed
entry points and records immutable archives before publication. Other Ops imports
do not load release automation. Install the published Ops package before using this subpath in another repository.

## Release Xec

Use Node.js, the pnpm version in `packageManager`, Git, npm, and `tar`. Xec's
build also needs Bun. GitHub publication additionally needs an authenticated
`gh` CLI. Run from a clean, committed checkout on the intended release branch.
For an interactive public npm release, the publisher checks the current npm identity before pushing the release refs when archives still need uploading. If the session expired, run `npm login --auth-type=web --registry=https://registry.npmjs.org/` and `npm whoami --registry=https://registry.npmjs.org/`. An authenticated account still needs write access to each destination package or scope.

Install the frozen dependencies and build the repository CLI in a separate checkout when an existing installation serves applications. This bootstrap supplies the Xec engine used by the release recipe; preparation independently rebuilds the package archives from the exact release commit. The examples use `0.12.0`; choose your actual next version.

```bash
pnpm install --frozen-lockfile
pnpm --filter @xec-sh/cli... build
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
identity and SHA-512 of those sealed bytes. Builds and test suites run during preparation.
The version change refreshes pnpm's workspace metadata from the frozen lockfile with lifecycle scripts disabled. Package compilation takes place in the temporary checkout. If a previous preparation ended with `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`, run `pnpm install --frozen-lockfile` in the tagged checkout, then resume the same version. The saved archives are verified again.

All archives must pass identity, dependency and exported-entry checks before the
sealed record is written. Local artifacts live at:

```text
.release-artifacts/<version>/<source-commit>/
  release.json
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
`--skip-npm` and `--skip-github` are explicit stage selections. `--offline` makes
the isolated dependency installation use the existing pnpm store. `--yes` accepts
the displayed execution plan in noninteractive use; it bypasses no checks.

## Failure and recovery

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

### An upload is still awaiting the registry

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

### Resume when GitHub rejects the SSH key

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

## Use the library in another workspace

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

`releaseNotes` and `createGithubRelease` provide the independent GitHub stage.
`ReleaseCommand` can inject a transport for tests or a controlled execution
context. Its default implementation uses Xec; adapters must preserve exit codes,
finite deadlines and credential redaction.

Build verification does not replace the owning project's lint, security,
interoperability and application acceptance tests. Xec's CI runs the release
failure suite and its packaged SSH security gate. A source change is not a
published package and does not activate a running daemon or application.

See [npm dist-tags](https://docs.npmjs.com/adding-dist-tags-to-packages/) and
[GitHub's verified-tag publication](https://cli.github.com/manual/gh_release_create)
for the underlying registry and hosting behavior.

## Run the recipe through Xec

The repository's `pnpm release` invokes its built Xec CLI. The dynamic command
imports the recipe in the scripting runtime and calls the built
`@xec-sh/ops/release` package directly. It does not spawn a separate `tsx` process
or reach into an operations package's TypeScript source tree. Run
`pnpm install --frozen-lockfile` and `pnpm build` when preparing a fresh checkout.

Consumer repositories can register `.xec/commands/release.mjs` and compose the
release functions with `Pipeline` for their own qualification policy. Keep
project-specific build/CI decisions in that recipe and use the existing shared
release API for locking, version commits, exact refs, archive sealing and npm
reconciliation. A project recipe is executable configuration for the Xec engine;
it should not introduce another process launcher, SSH client or release state machine.
