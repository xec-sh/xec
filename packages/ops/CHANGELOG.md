# Operations changes

## Unreleased

- Opt-in release producer retention preserves validated package archives before consumer acceptance. Retry requires matching source, declared input/policy digests and archive bytes; it repeats acceptance without rebuilding. Publication still requires the final release record, written only after acceptance and workspace cleanup succeed.
