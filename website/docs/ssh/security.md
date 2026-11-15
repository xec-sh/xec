---
title: SSH trust and cryptography
description: Understand host authentication, native algorithms, bounded key decoding and the limits of local cleanup.
---

# SSH trust and cryptography {#ssh-trust-and-cryptography}

SSH encryption authenticates a server only when its key is checked against a
trusted source. The client defaults to strict host verification; connecting to
an unknown server is an error.

This page describes the published 0.13.0 implementation. It is a technical
contract and review guide, not a claim of independent security certification.

## Host trust {#host-trust}

| Policy | Behavior |
| --- | --- |
| `strict`, the default | Require an existing matching trusted key |
| `accept-new` | Record a previously unknown key; refuse a changed or revoked key |
| `off` | Explicitly disable host authentication |
| `expectedHostFingerprint` | Require an independently verified SHA256 pin |
| `hostVerifier` | Delegate the decision to an explicit boolean/Promise verifier |

A pin and custom verifier cannot be combined. Either one replaces the
`known_hosts` decision for that connection; it does not also consult that file
for revocation. A custom verifier must return exactly `true` to accept the key. Treat `accept-new` as first-use
trust, not independent verification. Neither a successful connection nor
`SSHClient.probeHostKey` establishes the authenticity of an observed fingerprint.
`off` is appropriate only for an intentionally unauthenticated disposable fixture.

The default trust file is `~/.ssh/known_hosts`; set `knownHostsPath` to use an
application-owned file. Plain and hashed OpenSSH host entries, hostname patterns,
negation and `@revoked` entries are recognized. Revocation wins over an otherwise
matching allow entry. DNS hostnames are compared without case distinctions.
Host certificates and `@cert-authority` are not implicitly trusted.

Every verification reads the current file. A pool revalidates a connection
before a new lease. Changing trust does not remotely terminate existing
operations; the application must decide how to retire already active sessions.

### First-use writes {#first-use-writes}

An `accept-new` writer owns `<knownHostsPath>.xec-lock`, rereads the trust file,
appends its decision and synchronizes the file. Other verifiers refuse trust
while that update is active or unresolved. A lost write, sync or close result
retains the lock and reports `EHOSTKEYSTORE`; no TTL or PID heuristic steals it.

Preserve the unresolved file and lock as evidence. A safe recovery route is to
prepare a separate trust file with independently verified keys, then explicitly
select it with `knownHostsPath`. Reusing the original file requires establishing
that its writer has stopped and reconciling the uncertain entry before releasing
that exact lock. The library has no automatic unlock or reconciliation API. Other software writing
the same file must be coordinated separately; Xec's lock is not a filesystem-wide
transaction.

## Keys and signing {#keys-and-signing}

Private keys are decoded, not accepted because their text resembles PEM.
PEM asymmetric parsing, signing and verification use native `KeyObject`
cryptography. Public inputs accept unencrypted PEM, OpenSSH private-key containers, OpenSSH
public-key lines and binary SSH public-key blobs; arbitrary DER input is not a
supported key format. OpenSSH containers have bounded field lengths and one private key;
their public and private parts must agree.

Encrypted PKCS8 and legacy encrypted PEM are rejected before native key parsing:
their embedded KDF work is not bounded by the runtime API. Use an encrypted
OpenSSH container within the limits below, or an SSH agent that owns key
unlocking. PEM accepts one matching public/private-key envelope and never
forwards a passphrase to native parsing. Relabelling encrypted data does not
enable native decryption. The same policy applies to validation, key files and
authentication, including custom authentication handlers.

Supported keys are Ed25519, RSA with 2048–8192 bits, and ECDSA P-256/P-384/P-521.
Key input is limited to 1 MiB. Encrypted OpenSSH containers additionally bound
passphrases, salt and bcrypt work: 1024 bytes, 16–64 bytes and at most 64 rounds,
respectively. Keys outside these limits fail explicitly. OpenSSH bcrypt key
derivation uses an owned, attributed implementation with native SHA512 and
published test vectors: native runtime crypto does not expose that container
primitive. No external crypto package or JavaScript SHA implementation is loaded.

ECDSA signing and verification use native IEEE-P1363 signatures. A parsed key's
`sign`/`verify` methods use fixed-width `r || s`: 64, 96 or 132 bytes for
P-256, P-384 or P-521. The protocol converts this once to/from canonical SSH
integers. Agent responses use the declared SSH wire format; the client does not
guess the format from the signature's first byte.

Agent sockets and the typed `SSHAgent` contract support external signing. The
built-in socket client limits frames to 1 MiB, identities to 256 and each socket
request to ten seconds; its returned signature algorithm must match the request.
`SSHAgent` is a callback interface implemented by the application, not a public
constructor. Custom signers own their callbacks and requested hash policy; agent
forwarding additionally requires their optional `getStream` implementation. Pageant/Cygwin bridges and PuTTY PPK parsing are not part
of this client. A Windows POSIX-mode check cannot prove ACL safety;
`checkKeyFilePermissions` reports that limitation.

## Negotiation {#negotiation}

| Layer | Policy |
| --- | --- |
| Key exchange | Curve25519-SHA256; ECDH P-256/P-384/P-521; fixed DH group14-SHA256/group16-SHA512 when available |
| Host signatures | Ed25519, ECDSA and RSA-SHA256/SHA512 |
| Packet encryption | AES-128-GCM and AES-256-GCM |
| Optional packet encryption | OpenSSH ChaCha20-Poly1305 only after a native capability and known-answer check |
| Compression | `none` |

The client does not offer SHA1 signatures, DSA, CBC, RC4, negotiated AES-CTR or
zlib compression. AES-CTR may still be used to decode an encrypted key container;
it is not offered as a transport cipher. Hashed OpenSSH `known_hosts` entries use
their specified HMAC-SHA1 format for local hostname lookup, not a network signature.

OpenSSH ChaCha20-Poly1305 has different framing and nonce rules from IETF
ChaCha20-Poly1305. The implementation requires native raw ChaCha20 and Poly1305;
it does not substitute the IETF AEAD API or a JavaScript crypto fallback.
Availability therefore varies by runtime. AES-GCM remains the common path.

Packets are authenticated before delivery. Counters are reserved before callbacks
can cause nested writes. Receive windows, channel packet sizes and rekey queues
are bounded. The client performs lifetime-based rekeying and terminates an
unacknowledged rekey within its deadline.

## Scope of the guarantees {#scope-of-the-guarantees}

Encryption does not make remote output trustworthy or authorize its use as a
command, path or deployment decision. Enforce authorization in the consuming
application. SFTP acknowledgements do not provide a multi-file transaction.
Transport loss does not prove that a command or write was rolled back.

Native protocol regressions and independent-peer tests exercise the supported
paths. They do not prove every peer, FIPS provider, operating system or hostile
input safe. The [comparison](./comparison.md) separates inherited functionality,
new policies, removed compatibility and concrete regression checks.

## See also {#see-also}

- [Connections and failures](./connections.md)
- [Comparison with ssh2](./comparison.md)
- [Node.js cryptography](https://nodejs.org/api/crypto.html)
- [OpenSSH protocol extensions](https://www.openssh.com/specs.html)
