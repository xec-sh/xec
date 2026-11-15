# Changelog

## Unreleased

- Remove external runtime dependencies: native IEEE-P1363 signatures replace ASN.1 conversion, and bounded owned OpenSSH bcrypt key derivation uses native SHA512 with preserved attribution.

- Introduce the standalone SSH owner for Xec 0.13.0: connections, trust, leases,
  channels, SFTP and forwarding.
- Replace optional compiled transport cryptography with capability-checked native
  AES-GCM and, where available, OpenSSH ChaCha20-Poly1305.
- Bound protocol credit, rekeying, key decoding, agent messages, pending operations
  and directory traversal. Preserve unknown remote outcomes and exact API data.
- Recheck host trust on reuse; protect first-use writes, revoked keys and bounded
  host-pattern matching.
- Stage downloaded files before replacement and reject unsafe destinations.
- Remove the public transport escape hatch, legacy algorithms, compression,
  Pageant/Cygwin helpers and compatibility aliases.

See [the comparison and migration guide](../../website/docs/ssh/comparison.md).
