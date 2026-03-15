# secrets

Securely manage secrets and sensitive configuration data.

## Synopsis

```bash
xec secrets [subcommand] [args...] [options]
xec secret [subcommand] [args...] [options]  # Alias
xec s [subcommand] [args...] [options]       # Short alias
```

## Description

The `secrets` command provides secure storage and management of sensitive data like passwords, API keys, tokens, and certificates. Secrets are encrypted at rest and can be referenced in configuration files and scripts.

## Subcommands

### set

Set a secret value.

```bash
xec secrets set <key> [options]
```

**Options:**
- `-v, --value <value>` - Secret value (prompts securely if not provided)

**Examples:**
```bash
# Interactive mode (recommended - secure prompt)
xec secrets set DATABASE_PASSWORD

# Set with value (not recommended - visible in shell history)
xec secrets set API_KEY -v "sk-1234567890abcdef"

# Set complex secret
xec secrets set JWT_PRIVATE_KEY -v "$(cat private.key)"
```

### get

Retrieve a secret value.

```bash
xec secrets get <key>
```

**Examples:**
```bash
# Get secret value (outputs to stdout)
xec secrets get DATABASE_PASSWORD

# Use in scripts
DB_PASS=$(xec secrets get DATABASE_PASSWORD)

# Use in other commands
curl -H "Authorization: Bearer $(xec secrets get API_TOKEN)" https://api.example.com
```

### list

List all secret keys (values are never shown).

```bash
xec secrets list
xec secrets ls  # Alias
```

**Examples:**
```bash
# List all secrets
xec secrets list

# Output:
# Found 3 secrets:
#   • DATABASE_PASSWORD
#   • API_KEY  
#   • JWT_PRIVATE_KEY
```

### delete

Delete a secret.

```bash
xec secrets delete <key> [options]
xec secrets rm <key> [options]  # Alias
```

**Options:**
- `-f, --force` - Skip confirmation prompt

**Examples:**
```bash
# Delete with confirmation
xec secrets delete OLD_API_KEY

# Force delete without confirmation
xec secrets delete OLD_API_KEY --force
```

### generate

Generate a random secret.

```bash
xec secrets generate <key> [options]
```

**Options:**
- `-l, --length <length>` - Secret length (default: 32)
- `-f, --force` - Overwrite existing secret without confirmation

**Examples:**
```bash
# Generate 32-character secret
xec secrets generate SESSION_SECRET

# Generate custom length
xec secrets generate API_SECRET -l 64

# Force overwrite existing
xec secrets generate TEMP_TOKEN -l 16 --force
```

### export

Export secrets (WARNING: outputs plain text).

```bash
xec secrets export [options]
```

**Options:**
- `-f, --format <format>` - Output format: json, env (default: json)
- `--force` - Skip confirmation warning

**Examples:**
```bash
# Export as JSON (with warning prompt)
xec secrets export

# Export as environment variables
xec secrets export -f env

# Skip confirmation (dangerous!)
xec secrets export --force
```

### import

Import secrets from file or stdin.

```bash
xec secrets import [options]
```

**Options:**
- `-f, --file <file>` - Input file (uses stdin if not provided)
- `--format <format>` - Input format: json, env (default: json)

**Examples:**
```bash
# Import from JSON file
xec secrets import -f secrets.json

# Import from environment format
xec secrets import -f .env --format env

# Import from stdin
cat secrets.json | xec secrets import

# Import environment variables from stdin
echo "SECRET_API_KEY=value123" | xec secrets import --format env
```

## Interactive Mode

When called without arguments, the secrets command enters interactive mode:

```bash
xec secrets
```

Interactive mode provides a menu-driven interface for all secret operations with enhanced security prompts and validation.

## Secret Storage

### Encryption

Secrets are encrypted using industry-standard encryption:

- **Algorithm**: AES-256-GCM
- **Key derivation**: PBKDF2 with 100,000 iterations
- **Salt**: Unique per secret store
- **IV**: Unique per secret

### Storage Location

Secrets are stored in the user's home directory:

```
~/.xec/secrets/
├── keyring.enc      # Encrypted secret store
├── salt             # Cryptographic salt
└── config           # Storage configuration
```

### Provider Support

The secrets system supports multiple storage providers:

- **File** (default): Encrypted files in `~/.xec/secrets/`
- **System Keyring**: OS-native keyring (macOS Keychain, Windows Credential Store, Linux Secret Service)
- **External**: HashiCorp Vault, AWS Secrets Manager, etc.

## Using Secrets in Configuration

### Variable Interpolation

Reference secrets in configuration files:

```yaml
# .xec/config.yaml
vars:
  DATABASE_URL: "postgresql://user:${secret:DATABASE_PASSWORD}@localhost/myapp"
  API_ENDPOINT: "https://api.example.com"
  
targets:
  hosts:
    production:
      host: prod.example.com
      username: deployer
      privateKey: ~/.ssh/id_rsa
      passphrase: "${secret:SSH_PASSPHRASE}"
```

### Task Parameters

Use secrets in task definitions:

```yaml
tasks:
  deploy:
    description: Deploy to production
    steps:
      - name: Deploy
        command: |
          docker run --rm \
            -e DATABASE_PASSWORD="${secret:DATABASE_PASSWORD}" \
            -e API_KEY="${secret:API_KEY}" \
            myapp:latest
```

### Script Access

Access secrets in scripts:

```javascript
// JavaScript/TypeScript scripts
const dbPassword = await secrets.get('DATABASE_PASSWORD');
const apiKey = await secrets.get('API_KEY');

// Connection string with secret
const connectionString = `postgresql://user:${dbPassword}@localhost/myapp`;

// HTTP request with secret
const response = await fetch('https://api.example.com/data', {
  headers: {
    'Authorization': `Bearer ${apiKey}`
  }
});
```

## Secret Validation

### Key Format

Secret keys must follow specific rules:

- Start with a letter (A-Z, a-z)
- Contain only letters, numbers, hyphens, dots, and underscores
- Examples: `API_KEY`, `database.password`, `jwt-secret`

### Value Constraints

- Minimum length: 1 character
- Maximum length: 64KB
- Support for binary data (base64 encoded)
- UTF-8 text encoding

## Export Formats

### JSON Format

```json
{
  "DATABASE_PASSWORD": "secret123",
  "API_KEY": "sk-1234567890abcdef",
  "JWT_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----\n..."
}
```

### Environment Format

```bash
export SECRET_DATABASE_PASSWORD="secret123"
export SECRET_API_KEY="sk-1234567890abcdef"
export SECRET_JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
..."
```

Note: Environment format prefixes keys with `SECRET_` and converts to uppercase with underscores.

## Import Formats

### JSON Import

```bash
# Create secrets.json
{
  "database-password": "secret123",
  "api.key": "sk-1234567890abcdef"
}

# Import
xec secrets import -f secrets.json
```

### Environment Import

```bash
# Create .env file
SECRET_DATABASE_PASSWORD=secret123
SECRET_API_KEY=sk-1234567890abcdef

# Import (strips SECRET_ prefix)
xec secrets import -f .env --format env
```

## Security Best Practices

### Secret Creation

1. **Use interactive mode** for secret input (avoids shell history)
2. **Generate random secrets** when possible
3. **Use meaningful names** that indicate purpose
4. **Rotate secrets regularly**

```bash
# Good: Interactive input
xec secrets set DATABASE_PASSWORD

# Bad: Visible in shell history
xec secrets set DATABASE_PASSWORD -v "secret123"
```

### Secret Usage

1. **Never log secret values**
2. **Use environment variables** in processes
3. **Limit secret scope** to necessary components
4. **Audit secret access**

### Storage Security

1. **Regular backups** of encrypted secret store
2. **Secure backup storage**
3. **Key rotation** for long-lived secrets
4. **Access monitoring**

## Backup and Recovery

### Manual Backup

```bash
# Backup encrypted secrets
cp -r ~/.xec/secrets/ ~/backups/xec-secrets-$(date +%Y%m%d)

# Export for migration (WARNING: plain text)
xec secrets export > secrets-backup.json
```

### Recovery

```bash
# Restore from backup
cp -r ~/backups/xec-secrets-20231201/ ~/.xec/secrets/

# Import from export
xec secrets import -f secrets-backup.json
```

## Migration Between Systems

### Export from Source

```bash
# On source system
xec secrets export -f json > secrets.json
```

### Import to Target

```bash
# On target system
xec secrets import -f secrets.json

# Or via stdin
cat secrets.json | xec secrets import
```

## Troubleshooting

### Common Issues

**"Permission denied" errors:**
```bash
# Fix permissions
chmod 700 ~/.xec/secrets/
chmod 600 ~/.xec/secrets/*
```

**"Secret not found" errors:**
```bash
# List available secrets
xec secrets list

# Check secret name spelling
xec secrets list | grep -i "partial_name"
```

**"Decryption failed" errors:**
- Indicates corrupted secret store or wrong encryption key
- Restore from backup if available
- Re-create secrets if necessary

### Debug Mode

```bash
# Enable debug logging
export XEC_DEBUG=secrets
xec secrets list
```

## Performance Considerations

- **Caching**: Secrets are not cached by default for security
- **Batch operations**: Import/export for multiple secrets
- **Network storage**: Avoid network filesystems for secret storage
- **Key derivation**: First access may be slower due to PBKDF2

## Related Commands

- [config](config.md) - Manage configuration with secret references
- [run](run.md) - Execute scripts with secret access
- [inspect](inspect.md) - Inspect configuration (secrets are masked)

## Configuration

Secret behavior can be configured in `.xec/config.yaml`:

```yaml
secrets:
  provider: file  # file, keyring, vault
  
  # File provider settings
  file:
    directory: ~/.xec/secrets
    
  # Keyring provider settings
  keyring:
    service: xec
    
  # Vault provider settings
  vault:
    address: https://vault.example.com
    path: secret/xec
```

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - Secret not found
- `4` - Encryption/decryption error
- `5` - Permission error