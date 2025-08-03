# forward

Forward ports between local system and remote targets (SSH hosts, Docker containers, Kubernetes pods).

## Synopsis

```bash
xec forward [options] <target> <port-mapping>
xec fwd [options] <target> <port-mapping>  # Alias
```

## Description

The `forward` command establishes port forwarding tunnels between your local machine and remote targets. It supports SSH port forwarding, Docker container port mapping, and Kubernetes pod port forwarding.

## Arguments

- `<target>` - Target to forward from (SSH host, Docker container, or Kubernetes pod)
- `<port-mapping>` - Port mapping specification (see Port Mapping Format below)

### Port Mapping Format

Port mappings can be specified as:
- `PORT` - Forward same port number (local:PORT → remote:PORT)
- `LOCAL:REMOTE` - Forward local port to different remote port
- `0:REMOTE` - Auto-select available local port
- `PORT1,PORT2` - Forward multiple ports (comma-separated)
- `LOCAL1:REMOTE1,LOCAL2:REMOTE2` - Multiple custom mappings

## Options

### General Options

- `-p, --profile <profile>` - Configuration profile to use
- `-i, --interactive` - Interactive mode for setting up port forwarding
- `-b, --bind <address>` - Local bind address (default: 127.0.0.1)
- `-r, --reverse` - Reverse port forwarding (remote to local) - Not yet implemented
- `--background` - Run port forwarding in background
- `-v, --verbose` - Enable verbose output
- `-q, --quiet` - Suppress output
- `--dry-run` - Preview port forwarding without establishing

## Examples

### Basic Port Forwarding

Forward common service ports:

```bash
# Forward PostgreSQL from SSH host
xec forward hosts.db 5432

# Forward MySQL from Docker container
xec forward containers.mysql 3306

# Forward Redis from Kubernetes pod
xec forward pods.redis 6379
```

### Custom Port Mapping

Map to different local ports:

```bash
# Forward remote port 80 to local port 8080
xec forward pods.webapp 8080:80

# Forward remote PostgreSQL to local port 15432
xec forward hosts.database 15432:5432

# Forward multiple services
xec forward hosts.server 8080:80,8443:443
```

### Auto Port Selection

Let Xec choose available local ports:

```bash
# Auto-select local port for remote service
xec forward hosts.api 0:3000

# Auto-select for multiple ports
xec forward containers.app 0:8080,0:9090
```

### Different Bind Addresses

Control local bind address:

```bash
# Bind to all interfaces (accessible from network)
xec forward --bind 0.0.0.0 hosts.web 8080:80

# Bind to specific interface
xec forward --bind 192.168.1.100 containers.api 3000

# Default: localhost only (127.0.0.1)
xec forward hosts.db 5432
```

### Background Mode

Run port forwarding in background:

```bash
# Start forwarding in background
xec forward --background pods.service 8080

# Multiple background forwards
xec forward --background hosts.db 5432
xec forward --background hosts.cache 6379
```

### Interactive Mode

Use interactive prompts for configuration:

```bash
# Interactive setup
xec forward -i

# Prompts for:
# - Target type (SSH/Docker/Kubernetes)
# - Specific target selection
# - Remote port
# - Local port configuration
# - Additional options
```

## Target Types

### SSH Hosts

Forward ports through SSH tunnels:

```bash
# Basic SSH forwarding
xec forward hosts.prod 3000

# Multiple SSH forwards
xec forward hosts.gateway 80,443,3306

# Custom SSH host configuration
xec forward hosts.bastion 22222:22
```

### Docker Containers

Forward ports from Docker containers:

```bash
# Forward from running container
xec forward containers.webapp 8080

# Forward multiple container ports
xec forward containers.stack 3000,3001,3002

# Uses Docker networking internally
xec forward containers.db 27017
```

### Kubernetes Pods

Forward ports from Kubernetes pods:

```bash
# Forward from pod
xec forward pods.frontend 3000

# Forward with namespace (from config)
xec forward pods.backend 8080

# Multiple pod ports
xec forward pods.monitoring 9090,9093,3000
```

## Advanced Usage

### Multiple Port Forwarding

Forward multiple ports simultaneously:

```bash
# Forward web and API ports
xec forward hosts.server 80,443,3000,8080

# Different local/remote mappings
xec forward containers.stack 8080:80,8443:443,13306:3306

# Mix auto and fixed ports
xec forward pods.services 0:9090,8080:8080,0:3000
```

### Tunnel Chains

Create complex forwarding scenarios:

```bash
# Forward through jump host (configured in SSH)
xec forward hosts.internal-db 5432

# Access container through SSH tunnel
xec forward hosts.docker-host 8080:80

# Kubernetes through bastion
xec forward hosts.k8s-bastion 6443:6443
```

### Service Discovery

Use with service discovery patterns:

```bash
# Forward all database ports
xec forward hosts.db 5432,6379,27017

# Forward monitoring stack
xec forward pods.monitoring 3000,9090,9093,8086

# Forward development services
xec forward containers.dev 3000,3001,4200,8080
```

## Configuration

Set default forward options in `.xec/config.yaml`:

```yaml
targets:
  hosts:
    database:
      type: ssh
      host: db.internal
      username: deploy
      # SSH config for tunneling
      localForward:
        - 5432:localhost:5432
        - 6379:localhost:6379

commands:
  forward:
    bind: "127.0.0.1"
    background: false
```

## Network Security

### Bind Address Security

- `127.0.0.1` (default) - Local access only
- `0.0.0.0` - Network accessible (use with caution)
- Specific IP - Bind to specific network interface

### Firewall Considerations

```bash
# Local-only (safe default)
xec forward hosts.db 5432

# Network accessible (requires firewall rules)
xec forward --bind 0.0.0.0 hosts.api 8080

# Check local port usage
netstat -an | grep LISTEN
```

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Use different local port
xec forward hosts.service 18080:8080

# Or auto-select
xec forward hosts.service 0:8080
```

**Permission denied (ports < 1024):**
```bash
# Use higher local port
xec forward hosts.web 8080:80

# Or use sudo (not recommended)
sudo xec forward hosts.web 80
```

**Connection refused:**
- Verify target service is running
- Check firewall rules
- Confirm target configuration

### Debugging

```bash
# Verbose output for debugging
xec forward -v hosts.service 3000

# Dry run to test configuration
xec forward --dry-run pods.app 8080:80

# Check active forwards
ps aux | grep "xec forward"
netstat -an | grep LISTEN
```

## Cleanup

Port forwards are automatically cleaned up when:
- Process is terminated (Ctrl+C)
- Terminal session ends
- System shutdown

For background forwards:
```bash
# Find forward processes
ps aux | grep "xec forward"

# Kill specific forward
kill <pid>

# Kill all forwards
pkill -f "xec forward"
```

## Performance Considerations

- SSH forwarding adds encryption overhead
- Docker forwarding uses socat for efficiency
- Kubernetes forwarding uses native kubectl
- Multiple ports share the same tunnel when possible

## Limitations

- Reverse forwarding (`-r`) not yet implemented
- UDP forwarding not supported
- Dynamic port forwarding (SOCKS) not available
- Maximum 65535 ports per target

## Related Commands

- [on](on.md) - Execute commands on SSH hosts
- [in](in.md) - Execute commands in containers/pods
- [copy](copy.md) - Transfer files to/from targets

## Exit Codes

- `0` - Success, forwarding established
- `1` - General error
- `2` - Invalid arguments
- `3` - Target not found
- `4` - Port binding failed
- `5` - Network error