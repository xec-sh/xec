---
title: Verified package releases
description: Prepare immutable package archives, publish with registry confirmation, and resume partial npm or GitHub releases.
---

# Verified package releases

`@xec-sh/ops/release` provides optional release automation for pnpm workspaces.
It discovers public packages, builds an exact Git snapshot, checks the packed
entry points and records immutable archives before publication. Other Ops imports
do not load release automation. This API is part of the next source release;
install that release before using the new subpath in another repository.

## Release Xec

Use Node.js, the pnpm version in `packageManager`, Git, npm, and `tar`. Xec's
build also needs Bun. GitHub publication additionally needs an authenticated
`gh` CLI. Run from a clean, committed checkout on the intended release branch.
The examples use `0.12.0`; choose your actual next version.

```bash
pnpm release 0.12.0 --dry-run
pnpm release 0.12.0 --prepare
```

The first command reads local evidence only. It reports package inventory,
source commit and blockers, with a nonzero exit code for a dirty tree or a
conflicting release. It does not run hooks, create a lockfile, build, tag, push,
or contact a registry. Remote readiness is checked during execution.

`--prepare` commits only the synchronized public package versions, preserving
`workspace:` dependency declarations in source. Normal Git commit hooks still
apply. It installs the frozen lockfile without install scripts in a new temporary
snapshot, builds every public workspace, and packs in dependency order. The SSH
core recipe includes the reviewed private transport and its license/checksums.
The working checkout's `dist` and `node_modules` are never replaced.

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
release command flags. Interactive OTP prompts are bounded and redacted from
command errors; publication receipts contain package identities and checksums,
not credentials. Commands have finite timeouts and output bounds through Xec's
existing process API.

## Use the library in another workspace

Add `.release-artifacts/` to that repository's `.gitignore`. The release module
uses pnpm's workspace discovery and never parses workspace globs itself. Public
package dependency cycles and packages outside the checkout are rejected.

```typescript
import {
  acquireReleaseLock, commitReleaseVersion, ensureReleaseTag,
  prepareReleaseArtifacts, preflightPreparedRelease, pushReleaseRefs,
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
  await preflightPreparedRelease(root, version);
  await pushReleaseRefs(root, version);
  await publishPreparedRelease(root, version, { progress: console.log });
} finally {
  await unlock();
}
```

For a plan, call `planRelease(root, version)` before acquiring the writer lock.
It returns `blockers`, inventory, source commit and npm lane without mutating the
repository. For resume, use `loadPreparedRelease`; never call a custom rebuild as
an error fallback. Hold the same writer lock across preparation and publication.

`preparePackage` is an optional per-package recipe, called only inside the
isolated snapshot. It returns a package directory and `npm` or `pnpm` packer.
The returned archive still goes through the shared checks. Repository-specific
packaging belongs here; version, Git, registry and recovery logic remain shared.

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
