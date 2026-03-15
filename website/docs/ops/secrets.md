---
sidebar_position: 9
sidebar_label: Secrets
title: Secret Management
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

Local provider uses:
- **AES-256-GCM** for encryption
- **Machine-specific key** derived from hardware ID
- **Per-secret salt** for key derivation
