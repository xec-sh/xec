---
sidebar_position: 9
sidebar_label: Secrets
title: Secret Management
description: Encrypted secret storage and the SecretManager API
---

# Secret Management

Encrypted secret storage with multiple provider backends.

## Usage

```typescript
import { SecretManager } from '@xec-sh/ops';

const secrets = new SecretManager({
  type: 'local',
  config: { dir: '/path/to/secrets' },
});

// Store a secret
await secrets.set('db_password', 'my-secret-value');

// Retrieve a secret
const password = await secrets.get('db_password');

// Delete a secret
await secrets.delete('db_password');
```

## Providers

| Provider | Description |
|----------|-------------|
| `local` | Encrypted file storage (AES-256-GCM) |
| `env` | Environment variables |
| `dotenv` | .env file |
| `vault` | HashiCorp Vault |
| `aws-secrets` | AWS Secrets Manager |
| `1password` | 1Password |

## Configuration

```typescript
import { ConfigurationManager } from '@xec-sh/ops';

const config = new ConfigurationManager({
  secretProvider: {
    type: 'local',
    config: { dir: '/var/secrets/myapp' },
  },
  secretsDir: '/var/secrets/myapp',
});
```

## In Config Files

Reference secrets in YAML configuration:

```yaml
targets:
  production:
    type: ssh
    host: prod.example.com
    password: "${secret:ssh_password}"
```

The `${secret:name}` syntax is resolved by the `VariableInterpolator` during config loading.

## Encryption

The `local` provider encrypts with **AES-256-GCM**, deriving the key with
**scrypt** from a per-secret random salt. Files are written owner-only
(`0600`) into an owner-only directory (`0700`).

### What the key is made of, and what that protects

By default the key material is a machine identifier — the hardware UUID on
macOS, `/etc/machine-id` on Linux. That is enough to make the stored file
useless somewhere else: a backup, a synced folder, a repository it should
never have entered, a stolen disk.

It is **not** a defence against someone who can already read the file on
that machine. The identifier is not a secret — `/etc/machine-id` is
world-readable — so anyone with the ciphertext *and* local access has both
halves. The file mode is what stops them, and encryption is the second
layer behind it.

Add a passphrase when you need the key to depend on something the machine
does not hold:

```typescript
const secrets = new SecretManager({
  type: 'local',
  config: { dir: '/var/secrets/myapp', passphrase: process.env.XEC_SECRETS_PASSPHRASE },
});
```

The passphrase is combined with the machine identifier, so both are needed
to decrypt. `changePassphrase()` re-encrypts every secret; it writes all of
them or none, so a wrong passphrase part-way through cannot leave the store
split between two keys.

For secrets that must survive the loss of the machine, or be shared by more
than one person, use a provider built for that — `vault`, `aws-secrets` or
`1password`.
