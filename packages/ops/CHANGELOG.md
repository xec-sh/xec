# Operations changes

## Unreleased

## [0.13.2] - 2026-11-17

- Version preparation commits root and public-package changelogs with the synchronized manifests. It moves authored Unreleased entries into a dated release, maintains comparison links, rejects ambiguous history before writes, and leaves publication/resume history unchanged.

## [0.13.0] - 2026-11-15

- Dynamic commands use the shared local module graph instead of relocated temporary source. `ScriptLoader.dispose()` releases their hooks after registered actions and cleanup have settled.

- Archive validation returns its checked manifest for consumer reuse. Publication uses the same canonical validator; the redundant internal inspection wrapper is removed.

- Pipeline command objects and `releaseCommand` carry Core environment replacement without reintroducing pipeline, step or ambient variables. The default remains inherited merge; streaming, redaction and cancellation retain their contracts.

- Release preparation and independent builders share `packReleaseArtifacts`. The `prepareArchive` recipe runs before identity/export validation and hashing; acceptance and retained producers refer to those final bytes, without repacking. Its identity is included in producer reuse checks.

- Public task types no longer advertise rejected hooks, event subscriptions, cache, schedule, templates, dependencies or per-step parallelism. Condition types match the accepted boolean/number/expression contract; implemented output registration and completion handlers remain supported.

- Local direct execution preserves argv and captured stream whitespace without shell reconstruction or target discovery. Shared failure diagnostics include bounded redacted stdout/stderr previews, truncation flags, status and nested causes in text/JSON/YAML; quiet mode preserves exit codes and structured errors.

- Configuration saves resolve the explicit or discovered project source instead of creating a second config file.

- Configuration loading, editors and scaffolds share one minimal baseline; adapter and CLI defaults stay with their owners. Task validation uses TaskParser rather than a separate weaker schema.

- The unimplemented `extensions` configuration contract is rejected before provider initialization or command evaluation, including profile files. The obsolete public extension type is removed.

- Configuration merges, mutations and interpolation share an own-property path boundary. Prototype keys and circular data are rejected before mutation, including nested array entries.

- Task commands use the Core literal/data boundary. Runtime parameters, environment, secrets, command stdout and registered outputs are terminal data; only explicitly authored config variable templates recurse.

- Task pipelines inherit target, working directory, environment and command timeout. Fan-out is bounded and validates every target before starting. Unsupported option combinations are rejected instead of being ignored.

- Fail-fast stops queued ordinary steps while alwaysRun cleanup still executes; parallel cleanup waits for all started steps. Results retain source indices and skipped reasons. Explicit recovery is recorded separately and does not relabel a failed operation as success; only confirmed nonzero command exits may be retried.

- Environment overrides retain literal provenance through variable references and save/reload; they cannot inject task/profile/extension definitions. Separate profile files use the same command-substitution trust gate as project files.

- Dry-run never loads scripts or evaluates commands/providers. Configuration values requiring executable providers produce an explicit unknown-value refusal. In-process script defaults apply to `$target`, not the script process lifetime.

- Opt-in release producer retention preserves validated package archives before consumer acceptance. Retry requires matching source, declared input/policy digests and archive bytes; it repeats acceptance without rebuilding. Publication still requires the final release record, written only after acceptance and workspace cleanup succeed.
