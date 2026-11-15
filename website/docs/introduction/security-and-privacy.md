---
title: Security and privacy
description: Xec's responsibility for execution, data, dependencies and failure handling.
---

# Security and privacy {#security-and-privacy}

Xec is built for engineers and agents operating systems where a wrong target,
leaked credential or ambiguous retry can have real consequences. Security and
privacy belong to its execution contract, package architecture and release
process.

Xec is responsible for its own code, distributed artifacts and behavior. This
includes network destinations it selects, code it loads, data it writes or emits,
authority it exercises and the outcomes it reports. Calling an external program
does not excuse losing its result or misrepresenting its effects.

## Control over execution and data {#control-over-execution-and-data}

| Boundary | Xec's responsibility |
| --- | --- |
| Targets | Execute on the selected adapter and target; never substitute local execution after a remote failure. |
| Host identity | Verify SSH hosts by default and surface changed or unknown identities. |
| Module loading | Keep local resolution local. Developing 0.13.0 rejects missing bare packages without a CDN fallback. |
| Network operations | Make remote targets, module sources, registries and release destinations explicit in the invoked operation. |
| Credentials | Keep diagnostic redaction separate from application payloads; preserve the exact payload where the API promises it. |
| Outcomes | Distinguish completed results from lost acknowledgements, failed cleanup and unknown remote effects. |
| Releases | Publish the accepted archive bytes; resuming publication must not rebuild them. |

The source has no Xec-operated telemetry collector or automatic usage-reporting
service. Engine events are application-facing hooks: subscribers, scripts,
plugins and invoked tools can transmit data, and run with the caller's authority.
The documentation website and a user's own commands have separate deployment
and data boundaries.

## Dependencies are part of the product {#dependencies-are-part-of-the-product}

The architectural target is **no third-party npm runtime dependencies in
distributed Xec packages**. Moving a dependency into a bundle does not meet that
target. Development and qualification tools are tracked separately; they must
not be omitted from the release's supply-chain review.

That target is not yet fully implemented. The developing source still declares
external runtime packages:

| Owner | Remaining external runtime packages |
| --- | --- |
| SSH | ASN.1 conversion and OpenSSH bcrypt key derivation |
| Loader | TypeScript/JavaScript transformation |
| Ops | Environment parsing, filesystem helpers, globbing, YAML, semantic versions and schema validation |
| CLI | Command parsing, filesystem helpers, globbing, YAML and schema validation |

Kit now has no external runtime dependencies; terminal controls live in its shared
ANSI module. Core depends on the owned SSH package. Testing also declares its test-runner
peer; it is not a production execution component. Package manifests and the
prepared archive dependency graph are authoritative. This table describes areas
of work, not an exemption or a claim that dependency removal is already complete.

Use runtime primitives where they provide the required contract. Where owned
implementation is necessary, retain source provenance and licenses, narrow its
scope, and qualify its failure boundaries. Merely copying or renaming a library
does not establish ownership quality. Cryptographic formats must remain
interoperable and must not acquire weaker fallback algorithms.

## Agent and operator guarantees {#agent-and-operator-guarantees}

An agent's generated command is untrusted input until the application authorizes
the operation. A typed value, successful SSH login or repository instruction does
not grant extra authority. Constrain the target, arguments, artifacts and
credentials before dispatch.

A deadline or disconnected socket does not prove a remote write was undone.
Xec must preserve that uncertainty. In developing 0.13.0, `.nothrow()` permits
inspection of a real completed command result; it does not fabricate an exit
code for transport or ownership failures. Reconcile uncertain effects before
deciding whether a retry is safe.

Xec scripts and plugins execute with the host process's privileges. They are
not an isolation boundary for hostile code. Deployments requiring confinement
must supply an account, container or OS policy with the intended authority.

## Evidence and limits {#evidence-and-limits}

An enforceable guarantee identifies its scope, default, failure behavior and
test. For SSH, this includes hostile-peer tests, trust changes, bounded parsing,
cancellation and checks of the exact installed Core/SSH archive pair. Published
claims must describe the qualified release, not an unfinished source change.

The runtime, OS and operator-selected programs are outside Xec's implementation.
Their required capabilities are explicit preconditions. Within its own boundary,
Xec remains responsible for validating those capabilities and reporting failures
without hiding them.

## See also {#see-also}

- [Security practices and credential handling](../guides/advanced/security.md)
- [SSH trust and cryptography](../ssh/security.md)
- [SSH compared with ssh2](../ssh/comparison.md)
- [Remote module integrity](../scripting/basics/typescript-setup.md#remote-module-integrity)
- [Verified releases](../ops/release.md)
