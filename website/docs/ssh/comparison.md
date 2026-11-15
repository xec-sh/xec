---
title: Compared with ssh2
description: An evidence-based comparison of @xec-sh/ssh and ssh2 1.17.0, including security fixes, API changes and intentional limits.
---

# Compared with ssh2 {#compared-with-ssh2}

`@xec-sh/ssh` derives its private wire implementation from
[ssh2 1.17.0](https://github.com/mscdex/ssh2/tree/v1.17.0).
It combines that protocol lineage with the connection, trust, streaming and
ownership mechanisms previously maintained inside Xec Core. The high-level client also
retains the MIT attribution for its [node-ssh lineage](https://github.com/steelbrain/node-ssh).

The comparison below concerns that pinned upstream release and Xec's developing
0.13.0 source. It does not assert that upstream is abandoned, that every later
upstream commit has the same defects, or that Xec is a drop-in replacement.
[PROVENANCE.json](https://github.com/xec-sh/xec/blob/main/packages/ssh/PROVENANCE.json)
records the source and reviewed patch lineage; upstream notices remain in the package.

## Architectural differences {#architectural-differences}

| Concern | ssh2 1.17.0 | @xec-sh/ssh |
| --- | --- | --- |
| Scope | Client, server and helper agents | Client connections, channels, SFTP, pooling and forwarding |
| Public API | Event/callback transport API; external TypeScript declarations | ESM, owned TypeScript contracts, Promise operations and typed streams |
| Host trust | Caller supplies verification policy | Strict `known_hosts` by default; explicit pin or custom verifier |
| Connections | Caller manages reuse and retirement | Leases, capacity reservations, current trust and key identity |
| Remote effects | Application interprets transport events | Explicit unknown outcomes; no automatic command replay |
| Crypto distribution | Optional native bindings and JavaScript paths | Runtime cryptography; owned OpenSSH key derivation; no addon or install build |
| Algorithms | Includes compatibility algorithms and compression | Narrow capability-checked policy; see [negotiation](./security.md#negotiation) |
| Integration | Consumers construct their own ownership layer | Core delegates SSH mechanics to the same standalone package |

Upstream already provides real SSH multiplexing, PTYs, SFTP, forwarding and
backpressure. Those capabilities are inherited and adapted, not inventions of
this fork. The change is their ownership, supported policy, public contract and
qualification. See upstream's [API](https://github.com/mscdex/ssh2/tree/v1.17.0#api)
and [cryptographic implementation](https://github.com/mscdex/ssh2/blob/v1.17.0/lib/protocol/crypto.js).

## Concrete fixes and checks {#concrete-fixes-and-checks}

The following cases have specific regression oracles. An upstream report is
context; a passing check must exercise the candidate's actual implementation.

| Boundary | Failure being addressed | Required behavior |
| --- | --- | --- |
| Channel opening | Zero packet size can prevent send progress ([1504](https://github.com/mscdex/ssh2/issues/1504)) | Reject the peer's invalid channel parameters |
| Receive credit | Excess data can drive a window negative ([1505](https://github.com/mscdex/ssh2/issues/1505)) | Refuse excess bytes before delivery; preserve valid credit |
| Send credit | Window adjustment can overflow the protocol range | Reject overflow; do not inflate usable credit |
| Parked writes | Closing a channel can leave a queued writer unresolved ([1509](https://github.com/mscdex/ssh2/pull/1509)) | Settle owned writes on terminal closure |
| Packet encryption | Nested writes can reuse mutable nonce state ([1523](https://github.com/mscdex/ssh2/pull/1523)) | Reserve nonce/counter state before callbacks |
| SFTP closure | Server-initiated close can lack acknowledgement ([1522](https://github.com/mscdex/ssh2/issues/1522)) | Reply once and settle pending operations |
| SFTP streams | Pending OPEN/CLOSE and cancellation can leave handles unresolved | Preserve acknowledgement and cleanup ownership |
| Host trust | Cached decisions, revoked entries and first-use races | Observe current revocation; serialize and confirm first-use writes |
| Host patterns | Backtracking regular expressions can monopolize CPU | Bounded wildcard matching |
| Key decoding | PEM-shaped text can be mistaken for a valid key | Decode and validate actual key material |
| Agent signing | Oversized frames or mismatched returned algorithms | Bound input and validate the signature contract |
| Dispatch | Lost completion can be mistaken for safe failure | Report unknown outcome and prohibit blind replay |

Not all rows are upstream defects. Host trust, connection leases, key-file access
and outcome classification also correct or consolidate Xec's former wrapper.
This distinction matters when assessing both provenance and impact.

## Intentional compatibility changes {#intentional-compatibility-changes}

The package has no public `Server`, `HTTPAgent`, `HTTPSAgent`, Pageant bridge or
Cygwin bridge. It does not retain old Node compatibility branches, PuTTY PPK,
SHA1 signatures, DSA, CBC/RC4 or compression. There is no public import path into
the wire engine.

Some upstream private protocol files remain JavaScript; public API declarations
are maintained in TypeScript. The package is not described as a complete
TypeScript rewrite. It has no external npm runtime dependencies. Native
IEEE-P1363 signatures remove the ASN.1 dependency; the narrow, attributed OpenSSH
bcrypt implementation uses native SHA512 instead of TweetNaCl. Inherited source
remains documented in the license and provenance files.

A server that requires a removed algorithm fails negotiation. Fix that server's
policy or select another explicitly approved client; there is no silent
compatibility fallback.

## Migrating an application {#migrating-an-application}

| Previous use | Current API |
| --- | --- |
| `new ssh2.Client()` and `ready` callback | `await new SSHClient().connect(config)` |
| Xec `NodeSSH` from `@xec-sh/core/ssh` | `SSHClient` from `@xec-sh/ssh` |
| `execCommand(command)` | `exec(command, options)` |
| Low-level `cwd` or argv concatenation | Core `$.ssh(target).cd(path)` and tagged templates |
| Raw transport handle | Typed channel/subsystem/forwarding methods |
| Per-application connection map | `SSHConnectionPool` and explicit leases |
| Root-only pnpm patch | Owned source and the normal published SSH archive |
| Inferred success after disconnect | Inspect outcome, reconcile remote state, then decide |

Custom host verifiers receive raw key bytes and return a boolean or Promise.
Hash selection and transport callback overloads are removed. Do not port
`hostVerifier: () => true` as a convenience: provision known hosts or an
independently verified pin.

No throughput or startup superiority is asserted without comparable
measurements. Fewer ownership layers and no native installation build are
structural changes; actual latency depends on the runtime, server and workload.

## Verification boundaries {#verification-boundaries}

The source includes native crypto/key/agent/protocol tests, an independent ssh2
server fixture, connection and cancellation regressions, and a packed-consumer
gate. The latter must install the exact Core and SSH archives being released,
rather than repack an unqualified variant.

Runtime interoperability checks and source tests do not replace Linux/Windows
CI or installed-artifact acceptance. A successful release gate qualifies those
exact bytes and scenarios, not every possible peer or a production fleet.

## See also {#see-also}

- [SSH library](./overview.md)
- [Trust and cryptography](./security.md)
- [Channels and files](./channels-and-files.md)
- [Verified releases](../ops/release.md)
