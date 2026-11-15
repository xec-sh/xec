/** Optional release automation: immutable artifacts, exact refs and registry reconciliation. */
export { planRelease } from './plan.js';
export type { ReleasePlan } from './plan.js';
export type { ReleasePackage } from './packages.js';
export { commitReleaseVersion } from './version.js';
export type { ReleaseNotesOptions } from './github.js';
export type { PublishReleaseOptions } from './publish.js';
export { releaseNotes, createGithubRelease } from './github.js';
export { releaseCommand, ReleaseCommandError } from './command.js';
export { releaseTag, distributionTag, discoverReleasePackages } from './packages.js';
export type { ReleaseCommand, ReleaseCommandEvent, ReleaseCommandOptions } from './command.js';
export type { ReleaseArtifact, PreparedRelease, PackReleaseOptions, PrepareReleaseOptions } from './artifacts.js';
export { registryAddress, publishPreparedRelease, registryReleaseChannel, registryArtifactMatches, preflightPreparedRelease } from './publish.js';

export { pushReleaseRefs, ensureReleaseTag, assertReleaseHead, assertReleaseNotesBase, assertCleanReleaseTree, verifyRemoteReleaseTag } from './git.js';
export { artifactIntegrity, acquireReleaseLock, loadPreparedRelease, packReleaseArtifacts, verifyReleaseArtifact, validatePackedPackage, prepareReleaseArtifacts, RELEASE_PRODUCER_PROTOCOL } from './artifacts.js';
