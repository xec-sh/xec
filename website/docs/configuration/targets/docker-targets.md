---
title: Docker Targets
description: Configuring Docker container targets for containerized execution
---

# Docker Targets

Docker targets enable command execution within containerized environments. Xec provides comprehensive Docker integration with support for container lifecycle management, volume mounting, networking, and Docker Compose.

## Basic Configuration

Define Docker containers in the `targets.containers` section:

```yaml
targets:
  containers:
    app:
      image: node:18
      workdir: /app
      volumes:
        - ./src:/app
```

## Container Properties

### Essential Properties

```yaml
targets:
  containers:
    basic:
      # Container identification (one required)
      image: ubuntu:22.04          # Docker image to use
      container: existing-container # OR existing container name/ID
      
      # Common settings
      workdir: /workspace          # Working directory
      user: "1000:1000"           # User ID or name
```

### Advanced Properties

```yaml
targets:
  containers:
    advanced:
      image: node:18-alpine
      
      # Volumes
      volumes:
        - ./src:/app:rw           # Read-write mount
        - ./config:/config:ro     # Read-only mount
        - data:/data             # Named volume
        - /tmp:/host-tmp         # Absolute path
      
      # Networking
      ports:
        - "3000:3000"           # Host:Container
        - "8080:80"
      network: my-network        # Network name
      
      # Container settings
      restart: unless-stopped    # Restart policy
      privileged: false         # Privileged mode
      tty: true                # Allocate TTY
      autoRemove: true         # Remove after exit
      
      # Resource limits
      memory: 512m              # Memory limit
      cpus: "0.5"              # CPU limit
      
      # Health check
      healthcheck:
        test: ["CMD", "curl", "-f", "http://localhost/health"]
        interval: 30s
        timeout: 10s
        retries: 3
        startPeriod: 40s
```

## Execution Modes

### Run Mode (Default)

Creates new container for each command:

```yaml
targets:
  containers:
    ephemeral:
      image: alpine:latest
      runMode: run  # Default
      autoRemove: true
      
      # Each command creates new container
      # xec in containers.ephemeral "echo test"
```

### Exec Mode

Executes in existing container:

```yaml
targets:
  containers:
    persistent:
      container: my-app-container  # Existing container
      runMode: exec
      
      # Commands run in existing container
      # xec in containers.persistent "ps aux"
```

### Hybrid Mode

```yaml
targets:
  containers:
    smart:
      image: postgres:15
      container: db-container
      # Automatically uses exec if container exists,
      # otherwise creates with run
```

## Volume Management

### Volume Types

```yaml
targets:
  containers:
    volumes-demo:
      image: ubuntu:22.04
      volumes:
        # Bind mount (relative path)
        - ./app:/app
        
        # Bind mount (absolute path)
        - /var/log:/logs:ro
        
        # Named volume
        - mydata:/data
        
        # Anonymous volume
        - /tmp
        
        # With options
        - type: bind
          source: ./config
          target: /config
          readonly: true
```

### Volume Permissions

```yaml
targets:
  containers:
    permissions:
      image: node:18
      volumes:
        - ./src:/app:rw      # Read-write (default)
        - ./config:/config:ro # Read-only
        - ./cache:/cache:rw,z # With SELinux label
      
      # Run as specific user
      user: "1000:1000"
```

## Networking

### Port Mapping

```yaml
targets:
  containers:
    web:
      image: nginx:alpine
      ports:
        - "80:80"        # HTTP
        - "443:443"      # HTTPS
        - "127.0.0.1:8080:8080"  # Bind to localhost only
        - "3000-3005:3000-3005"  # Port range
```

### Network Modes

```yaml
targets:
  containers:
    # Default bridge network
    bridge:
      image: alpine
      network: bridge
    
    # Custom network
    custom:
      image: alpine
      network: my-app-network
    
    # Host network
    host:
      image: alpine
      network: host
    
    # No network
    isolated:
      image: alpine
      network: none
```

### Container Linking

```yaml
targets:
  containers:
    database:
      image: postgres:15
      network: app-network
      
    app:
      image: node:18
      network: app-network
      env:
        DB_HOST: database  # Can reference by name
```

## Environment Variables

```yaml
targets:
  containers:
    configured:
      image: node:18
      env:
        # Simple values
        NODE_ENV: production
        PORT: "3000"
        
        # From secrets
        API_KEY: ${secrets.api_key}
        DB_PASSWORD: ${secrets.db_password}
        
        # Complex values
        DATABASE_URL: "postgres://user:pass@db:5432/mydb"
        
        # From host environment
        HOME: ${env.HOME}
        USER: ${env.USER}
```

### Environment Files

```yaml
targets:
  containers:
    from-file:
      image: node:18
      envFile:
        - .env
        - .env.production
```

## Container Lifecycle

### Restart Policies

```yaml
targets:
  containers:
    # Always restart
    critical:
      image: redis:alpine
      restart: always
    
    # Restart on failure
    resilient:
      image: app:latest
      restart: on-failure
      restartMaxRetries: 5
    
    # Don't restart
    oneshot:
      image: alpine
      restart: "no"
```

### Auto-removal

```yaml
targets:
  containers:
    # Remove after execution
    temporary:
      image: alpine
      autoRemove: true
      
    # Keep container
    persistent:
      image: postgres:15
      autoRemove: false
```

## Health Checks

```yaml
targets:
  containers:
    healthy:
      image: nginx:alpine
      healthcheck:
        # Command-based check
        test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/"]
        
        # Or shell command
        # test: "curl -f http://localhost/ || exit 1"
        
        # Timing configuration
        interval: 30s      # Check interval
        timeout: 10s       # Check timeout
        retries: 3        # Failure retries
        startPeriod: 40s  # Grace period
```

## Labels and Metadata

```yaml
targets:
  containers:
    labeled:
      image: app:latest
      labels:
        app: myapp
        environment: production
        version: "1.2.3"
        "com.example.team": backend
        "com.example.git-commit": ${env.GIT_COMMIT}
```

## Docker Compose Integration

```yaml
targets:
  # Global compose configuration
  $compose:
    file: docker-compose.yml
    project: myproject
  
  containers:
    # Reference compose service
    web:
      $service: web
      
    # Override compose settings
    db:
      $service: database
      env:
        POSTGRES_PASSWORD: ${secrets.db_password}
```

## Resource Limits

```yaml
targets:
  containers:
    limited:
      image: node:18
      
      # Memory limits
      memory: 512m           # Memory limit
      memorySwap: 1g        # Memory + swap limit
      memoryReservation: 256m # Soft limit
      
      # CPU limits
      cpus: "0.5"           # Number of CPUs
      cpuShares: 512        # CPU shares (relative)
      cpusetCpus: "0,1"     # CPU cores to use
      
      # Other limits
      pidsLimit: 100        # Process limit
      ulimits:
        nofile:
          soft: 65535
          hard: 65535
```

## Security Configuration

### User and Groups

```yaml
targets:
  containers:
    secure:
      image: node:18
      
      # Run as specific user
      user: "1000:1000"     # UID:GID
      # OR
      user: appuser         # Username
      
      # Additional groups
      groupAdd:
        - docker
        - video
```

### Capabilities

```yaml
targets:
  containers:
    capabilities:
      image: alpine
      
      # Add capabilities
      capAdd:
        - SYS_ADMIN
        - NET_ADMIN
      
      # Drop capabilities
      capDrop:
        - ALL
      
      # Privileged mode (all capabilities)
      privileged: false
```

### Security Options

```yaml
targets:
  containers:
    hardened:
      image: alpine
      securityOpt:
        - no-new-privileges
        - seccomp=unconfined
        - apparmor=docker-default
      readonlyRootfs: true
```

## Docker Socket Access

```yaml
targets:
  containers:
    docker-in-docker:
      image: docker:dind
      privileged: true
      volumes:
        - /var/run/docker.sock:/var/run/docker.sock
```

## Custom Docker Configuration

### Docker Host

```yaml
targets:
  containers:
    remote:
      image: alpine
      dockerHost: tcp://remote-docker:2376
      dockerCertPath: ~/.docker/certs
```

### Registry Authentication

```yaml
targets:
  containers:
    private:
      image: registry.example.com/app:latest
      registryAuth:
        username: ${secrets.registry_user}
        password: ${secrets.registry_password}
```

## Real-World Examples

### Development Environment

```yaml
targets:
  containers:
    dev:
      image: node:18
      workdir: /app
      volumes:
        - .:/app
        - node_modules:/app/node_modules
      ports:
        - "3000:3000"
        - "9229:9229"  # Debugger
      env:
        NODE_ENV: development
        DEBUG: "*"
      tty: true
      stdin: true
```

### Production Database

```yaml
targets:
  containers:
    postgres:
      image: postgres:15-alpine
      restart: unless-stopped
      volumes:
        - postgres_data:/var/lib/postgresql/data
        - ./backup:/backup
      env:
        POSTGRES_DB: production
        POSTGRES_USER: appuser
        POSTGRES_PASSWORD: ${secrets.db_password}
      ports:
        - "127.0.0.1:5432:5432"
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U appuser"]
        interval: 10s
        timeout: 5s
        retries: 5
```

### Build Environment

```yaml
targets:
  containers:
    builder:
      image: node:18
      workdir: /build
      volumes:
        - .:/build:ro
        - build_cache:/build/.cache
        - dist:/build/dist
      env:
        CI: true
        NPM_TOKEN: ${secrets.npm_token}
      user: "1000:1000"
      autoRemove: true
```

## Troubleshooting

### Container Debugging

```bash
# Check container status
docker ps -a

# View container logs
xec logs containers.app

# Execute debug commands
xec in containers.app "ps aux"
xec in containers.app "env | sort"
```

### Common Issues

#### Image Not Found

```yaml
# Ensure image exists
targets:
  containers:
    app:
      image: node:18  # Use official images
      # OR pull explicitly
      imagePullPolicy: always
```

#### Permission Denied

```yaml
# Fix volume permissions
targets:
  containers:
    fixed:
      image: node:18
      user: "$(id -u):$(id -g)"  # Match host user
      volumes:
        - .:/app:rw,z  # SELinux label if needed
```

#### Port Already in Use

```yaml
# Use different ports
targets:
  containers:
    app:
      ports:
        - "3001:3000"  # Map to different host port
```

## Best Practices

### 1. Use Specific Tags

```yaml
# Good - specific version
image: node:18.17.1-alpine

# Bad - latest tag
image: node:latest
```

### 2. Minimize Layers

```yaml
# Combine related operations
targets:
  containers:
    efficient:
      image: alpine
      command: sh -c "apk add --no-cache git && git clone repo"
```

### 3. Use .dockerignore

```bash
# .dockerignore
node_modules
.git
*.log
.env
```

### 4. Security First

```yaml
targets:
  containers:
    secure:
      image: alpine
      user: nobody        # Non-root user
      readonlyRootfs: true  # Read-only filesystem
      capDrop: [ALL]      # Drop all capabilities
```

### 5. Resource Limits

```yaml
targets:
  containers:
    limited:
      image: node:18
      memory: 512m      # Always set limits
      cpus: "0.5"
```

## Next Steps

- [Kubernetes Targets](./kubernetes-targets.md) - Kubernetes pod configuration

## See Also

- [Docker Commands](../../commands/built-in/in.md) - Docker-specific commands
- [Container Logs](../../commands/built-in/logs.md) - Viewing container logs