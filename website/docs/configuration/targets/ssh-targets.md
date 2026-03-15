---
title: SSH Targets
description: Configuring SSH host targets for remote execution
---

# SSH Targets

SSH targets enable command execution on remote servers through secure shell connections. Xec provides advanced SSH features including connection pooling, tunneling, and automatic retry mechanisms.

## Basic Configuration

Define SSH hosts in the `targets.hosts` section:

```yaml
targets:
  hosts:
    web-server:
      host: web.example.com
      username: deploy
      privateKey: ~/.ssh/id_rsa
```

## Connection Properties

### Essential Properties

```yaml
targets:
  hosts:
    server:
      # Required
      host: server.example.com      # Hostname or IP address
      
      # Authentication (at least one required)
      username: deploy               # SSH username
      privateKey: ~/.ssh/id_rsa     # Path to private key
      password: ${secrets.password}  # Password (use secrets!)
      
      # Optional
      port: 22                      # SSH port (default: 22)
      passphrase: ${secrets.phrase} # Key passphrase
```

### Advanced Properties

```yaml
targets:
  hosts:
    advanced:
      host: server.example.com
      username: admin
      
      # Connection settings
      keepAlive: true              # Keep connection alive
      keepAliveInterval: 30000     # Keep-alive interval (ms)
      timeout: 60000               # Connection timeout (ms)
      
      # Execution settings
      shell: /bin/bash             # Shell to use
      encoding: utf8               # Output encoding
      maxBuffer: 10485760          # Max output buffer (bytes)
      throwOnNonZeroExit: true     # Throw on non-zero exit
      
      # Working directory
      workdir: /var/www/app        # Default directory
      cwd: /var/www/app           # Alias for workdir
      
      # Environment
      env:
        NODE_ENV: production
        PATH: /usr/local/bin:$PATH
```

## Authentication Methods

### Private Key Authentication

Most secure and recommended method:

```yaml
targets:
  hosts:
    secure:
      host: secure.example.com
      username: deploy
      privateKey: ~/.ssh/deploy_key
      passphrase: ${secrets.key_passphrase}  # If key is encrypted
```

### Multiple Key Attempts

```yaml
targets:
  hosts:
    multi-key:
      host: server.example.com
      username: admin
      privateKey: |
        ~/.ssh/id_rsa
        ~/.ssh/id_ed25519
        ~/.ssh/deploy_key
```

### Password Authentication

Less secure, use only when necessary:

```yaml
targets:
  hosts:
    legacy:
      host: old-server.example.com
      username: admin
      password: ${secrets.legacy_password}  # Never hardcode!
```

### SSH Agent

Use SSH agent for key management:

```yaml
targets:
  hosts:
    agent:
      host: server.example.com
      username: deploy
      # No privateKey specified - uses SSH agent
```

## Connection Pooling

Optimize performance with connection reuse:

```yaml
targets:
  hosts:
    pooled:
      host: busy-server.example.com
      connectionPool:
        enabled: true        # Enable pooling
        min: 2              # Minimum connections
        max: 10             # Maximum connections
        idleTimeout: 300000 # Idle timeout (5 min)
        acquireTimeout: 30000 # Acquire timeout
```

### Pool Configuration Examples

```yaml
# High-traffic server
targets:
  hosts:
    api:
      host: api.example.com
      connectionPool:
        min: 5
        max: 20
        idleTimeout: 600000  # 10 minutes

# Low-traffic server
targets:
  hosts:
    backup:
      host: backup.example.com
      connectionPool:
        min: 0
        max: 2
        idleTimeout: 60000  # 1 minute
```

## Proxy Connections

Connect through jump hosts:

```yaml
targets:
  hosts:
    # Simple proxy
    behind-firewall:
      host: internal.example.com
      proxy: bastion.example.com
      username: deploy
    
    # Proxy with authentication
    secured:
      host: secure-internal.example.com
      proxy: user@jump.example.com:2222
      privateKey: ~/.ssh/internal_key
```

### Multi-Hop Proxy

```yaml
targets:
  hosts:
    deep-internal:
      host: deep.internal.example.com
      proxy: bastion1.example.com,bastion2.example.com
      username: deploy
```

## Sudo Execution

Execute commands with elevated privileges:

```yaml
targets:
  hosts:
    admin-server:
      host: server.example.com
      username: admin
      sudo:
        enabled: true
        method: sudo        # or 'su'
        password: ${secrets.sudo_password}
```

### Sudo Patterns

```yaml
# Passwordless sudo
targets:
  hosts:
    trusted:
      host: trusted.example.com
      sudo:
        enabled: true
        # No password needed

# Custom sudo command
targets:
  hosts:
    custom:
      host: custom.example.com
      sudo:
        enabled: true
        method: "doas"  # BSD systems
```

## SFTP Configuration

Configure secure file transfer:

```yaml
targets:
  hosts:
    file-server:
      host: files.example.com
      sftp:
        enabled: true
        concurrency: 5      # Parallel transfers
        chunkSize: 32768   # Transfer chunk size
        fastGet: true      # Enable fast download
        fastPut: true      # Enable fast upload
```

## Environment Variables

Set environment for all commands:

```yaml
targets:
  hosts:
    app-server:
      host: app.example.com
      env:
        # Application settings
        NODE_ENV: production
        API_URL: https://api.example.com
        
        # Path modifications
        PATH: /opt/app/bin:$PATH
        LD_LIBRARY_PATH: /opt/app/lib
        
        # Locale settings
        LANG: en_US.UTF-8
        LC_ALL: en_US.UTF-8
```

## Working Directory

Control command execution location:

```yaml
targets:
  hosts:
    project:
      host: dev.example.com
      workdir: /home/deploy/project
      
      # All commands run in workdir
      # xec in hosts.project "ls" → runs in /home/deploy/project
```

## Shell Configuration

Customize shell behavior:

```yaml
targets:
  hosts:
    # Use specific shell
    zsh-server:
      host: modern.example.com
      shell: /bin/zsh
    
    # No shell (direct execution)
    direct:
      host: minimal.example.com
      shell: false
    
    # Custom shell command
    custom-shell:
      host: special.example.com
      shell: "/bin/bash --noprofile"
```

## Timeout Configuration

Prevent hanging connections:

```yaml
targets:
  hosts:
    slow-server:
      host: slow.example.com
      timeout: 300000       # 5 minute timeout
      
    fast-server:
      host: fast.example.com
      timeout: 5000        # 5 second timeout
```

## Error Handling

Configure error behavior:

```yaml
targets:
  hosts:
    strict:
      host: critical.example.com
      throwOnNonZeroExit: true  # Fail on any error
      
    lenient:
      host: test.example.com
      throwOnNonZeroExit: false # Continue on error
```

## Host Groups

Organize related hosts:

```yaml
targets:
  hosts:
    # Web servers
    web-1:
      host: web1.example.com
      username: deploy
    web-2:
      host: web2.example.com
      username: deploy
    web-3:
      host: web3.example.com
      username: deploy
    
    # Database servers
    db-primary:
      host: db1.example.com
      username: dba
    db-replica:
      host: db2.example.com
      username: dba
```

## Dynamic Host Discovery

Discover hosts at runtime:

```yaml
targets:
  hosts:
    # From environment variable
    $env: SSH_HOSTS
    
    # From command output
    $command: "terraform output -json servers | jq -r '.[]'"
    
    # From file
    $file: ./hosts.txt
```

## Real-World Examples

### Production Web Server

```yaml
targets:
  hosts:
    production-web:
      host: prod-web.example.com
      username: deploy
      privateKey: ~/.ssh/prod_deploy_key
      port: 22
      
      # Performance optimization
      keepAlive: true
      keepAliveInterval: 30000
      connectionPool:
        min: 2
        max: 10
        idleTimeout: 300000
      
      # Environment
      workdir: /var/www/app
      env:
        NODE_ENV: production
        PORT: 3000
      
      # Reliability
      timeout: 60000
      throwOnNonZeroExit: true
```

### Development Server

```yaml
targets:
  hosts:
    dev-server:
      host: dev.example.com
      username: developer
      privateKey: ~/.ssh/id_rsa
      
      # Convenience settings
      workdir: ~/projects
      env:
        NODE_ENV: development
        DEBUG: "*"
      
      # Lenient error handling
      throwOnNonZeroExit: false
```

### Bastion Access

```yaml
targets:
  hosts:
    internal-api:
      host: 10.0.1.50
      username: api-user
      privateKey: ~/.ssh/internal_key
      proxy: bastion.example.com
      
      # Security
      sudo:
        enabled: false
      
      # Restricted environment
      env:
        PATH: /usr/local/bin:/usr/bin:/bin
```

## Troubleshooting

### Connection Debugging

```bash
# Test connection
xec test hosts.production

# Verbose SSH output
xec --verbose in hosts.production "echo test"

# Check SSH configuration
xec config show --target hosts.production
```

### Common Issues

#### Permission Denied

```yaml
# Check authentication
targets:
  hosts:
    fixed:
      host: server.example.com
      username: correct_username  # Verify username
      privateKey: ~/.ssh/correct_key  # Verify key path
      # Check key permissions: chmod 600 ~/.ssh/correct_key
```

#### Connection Timeout

```yaml
# Increase timeout
targets:
  hosts:
    slow:
      host: slow.example.com
      timeout: 120000  # 2 minutes
      keepAlive: true
      keepAliveInterval: 10000
```

#### Proxy Issues

```yaml
# Debug proxy connection
targets:
  hosts:
    debug-proxy:
      host: internal.example.com
      proxy: -v bastion.example.com  # Add -v for verbose
```

## Security Best Practices

### 1. Use Key Authentication

```yaml
# Good - key authentication
targets:
  hosts:
    secure:
      privateKey: ~/.ssh/deploy_key
      
# Avoid - password authentication
targets:
  hosts:
    insecure:
      password: "plaintext"  # Never do this!
```

### 2. Secure Key Storage

```bash
# Set proper permissions
chmod 600 ~/.ssh/deploy_key
chmod 700 ~/.ssh
```

### 3. Use Secrets Management

```yaml
targets:
  hosts:
    managed:
      host: server.example.com
      passphrase: ${secrets.ssh_passphrase}
      sudo:
        password: ${secrets.sudo_password}
```

### 4. Limit Environment Exposure

```yaml
targets:
  hosts:
    limited:
      host: server.example.com
      env:
        # Only necessary variables
        APP_ENV: production
        # Avoid sensitive data in env
```

### 5. Use Connection Pooling

```yaml
# Reuse connections securely
targets:
  hosts:
    pooled:
      connectionPool:
        max: 5  # Limit concurrent connections
        idleTimeout: 300000  # Close idle connections
```

## Next Steps

- [Docker Targets](./docker-targets.md) - Container configuration
- [Kubernetes Targets](./kubernetes-targets.md) - Pod configuration

## See Also

- [SSH Command](../../commands/built-in/on.md) - SSH-specific commands
- [File Transfer](../../commands/built-in/copy.md) - Copying files via SSH
- [Port Forwarding](../../commands/built-in/forward.md) - SSH tunneling