# Operations changes

## Unreleased

- Task commands use the Core literal/data boundary. Runtime parameters, environment, secrets, command stdout and registered outputs are terminal data; only explicitly authored config variable templates recurse.
- Task pipelines inherit target, working directory, environment and command timeout. Fan-out is bounded and validates every target before starting. Unsupported option combinations are rejected instead of being ignored.
- Fail-fast stops queued ordinary steps while alwaysRun cleanup still executes; parallel cleanup waits for all started steps. Results retain source indices and skipped reasons. Explicit recovery is recorded separately and does not relabel a failed operation as success; only confirmed nonzero command exits may be retried.
- Environment overrides retain literal provenance through variable references and save/reload; they cannot inject task/profile/extension definitions. Separate profile files use the same command-substitution trust gate as project files.
- Dry-run never loads scripts or evaluates commands/providers. Configuration values requiring executable providers produce an explicit unknown-value refusal. In-process script defaults apply to `$target`, not the script process lifetime.

- Opt-in release producer retention preserves validated package archives before consumer acceptance. Retry requires matching source, declared input/policy digests and archive bytes; it repeats acceptance without rebuilding. Publication still requires the final release record, written only after acceptance and workspace cleanup succeed.
