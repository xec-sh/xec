# Xec Core and CLI Audit Report

## Executive Summary

This audit analyzes the consistency between the Xec core package (`@xec-sh/core`) and CLI package (`@xec-sh/cli`) with the goal of identifying opportunities to improve user experience. The analysis reveals that while the core library is powerful and well-architected, the CLI interface could be significantly simplified to provide a more intuitive experience for end users.

## Current State Analysis

### Core Package Strengths
1. **Powerful API**: Template literal syntax (`$`command``) is elegant and intuitive
2. **Multi-environment support**: SSH, Docker, Kubernetes adapters work well
3. **Enhanced APIs**: Recent additions (SSH tunnels, K8s port forwarding, Docker compose) are excellent
4. **Good abstractions**: Clean separation between execution engine and adapters

### CLI Package Strengths
1. **Comprehensive commands**: Good coverage of common operations
2. **Script execution**: Direct `.js/.ts` file execution is convenient
3. **Extensibility**: Custom commands and dynamic loading
4. **Rich templates**: `xec new` command provides good starting points

## Key Inconsistencies and Pain Points

### 1. API Mismatch Between Core and CLI

**Issue**: The CLI doesn't expose the full power of the core API in an intuitive way.

**Examples**:
- Core: `$.ssh({ host: 'server' })`echo hello``
- CLI: `xec exec -a ssh -h server "echo hello"` (verbose and non-intuitive)

- Core: `$.k8s().pod('my-pod').portForward(8080, 80)`
- CLI: No direct equivalent, must use `xec k8s port-forward` with limited options

### 2. Configuration Complexity

**Issue**: Multiple configuration formats and locations create confusion.

**Current state**:
- Core uses TypeScript config objects
- CLI uses both JSON and YAML
- SSH hosts configuration in CLI doesn't match core's SSH options structure
- Environment-specific configs are not intuitive

### 3. Command Verbosity

**Issue**: Common operations require too many flags and options.

**Examples**:
```bash
# Current (verbose)
xec exec -a docker --container myapp -e NODE_ENV=production -t 60s "npm test"

# Could be
xec in myapp npm test --env NODE_ENV=production --timeout 60s
```

### 4. Inconsistent Error Handling

**Issue**: Error messages vary significantly between direct core usage and CLI usage.
- Core provides detailed error objects with context
- CLI sometimes swallows important error details
- No consistent way to get debug information

### 5. Missing Direct Access to Enhanced Features

**Issue**: New core features aren't easily accessible from CLI.
- No direct access to SSH tunnels
- Limited access to Docker compose features
- K8s port forwarding not integrated with other commands
- No streaming logs interface in CLI

### 6. Script Context Limitations

**Issue**: Scripts executed via CLI don't have full access to CLI configuration and utilities.
- Configuration loaded by CLI isn't automatically available to scripts
- No standard way to access CLI-defined SSH hosts or profiles
- Script utilities are limited compared to what CLI has internally

## User Experience Pain Points

### 1. Learning Curve
- Too many ways to do the same thing
- Unclear when to use `xec exec` vs `xec ssh` vs `xec docker`
- Documentation doesn't clearly explain the mental model

### 2. Common Tasks Are Verbose
- Simple SSH commands require multiple flags
- Docker operations need container names repeated
- No shortcuts for common patterns

### 3. Context Switching
- Different syntax between script files and CLI commands
- Configuration format differs from core API
- No unified way to work across environments

### 4. Discovery Issues
- Hard to discover available features
- Help text is overwhelming
- No interactive mode for building complex commands

## Improvement Recommendations

### 1. Simplify Primary Commands

**Implement intuitive shortcuts for common operations:**

```bash
# SSH operations
xec on server1 "uptime"                    # Runs on SSH host
xec on server1,server2 "uptime" --parallel # Multiple hosts

# Docker operations  
xec in mycontainer "npm test"              # Runs in container
xec in mycontainer                         # Interactive shell

# Kubernetes operations
xec in pod:mypod "date"                    # Runs in pod
xec in pod:mypod -n production "date"      # With namespace

# Local operations (default)
xec "ls -la"                                # Local execution
xec ls -la                                  # Direct passthrough
```

### 2. Unify Configuration

**Single configuration format (YAML) with clear structure:**

```yaml
# ~/.xec/config.yaml
defaults:
  timeout: 30s
  shell: /bin/bash

# Define hosts with all SSH options
hosts:
  prod:
    host: production.example.com
    username: deploy
    privateKey: ~/.ssh/id_rsa_prod
    
  staging:
    host: staging.example.com
    username: ubuntu
    
# Define common containers
containers:
  app:
    name: myapp-production
    
  db:
    name: postgres-main

# Define common pods
pods:
  web:
    name: web-deployment-*
    namespace: production
    
# Aliases for complex commands
aliases:
  deploy: "xec on prod ./deploy.sh"
  logs: "xec in app npm run logs"
```

### 3. Enhance Script Integration

**Make CLI configuration available to scripts:**

```javascript
// In script files
import { $, config } from '@xec-sh/cli';

// Access CLI-defined hosts
const $prod = $.ssh(config.hosts.prod);
await $prod`uptime`;

// Use CLI aliases
await $.run(config.aliases.deploy);

// Access all CLI utilities
const hosts = config.listHosts();
const containers = config.listContainers();
```

### 4. Add Interactive Mode

**For complex operations, provide an interactive builder:**

```bash
xec interactive
# or
xec -i

? What do you want to do? › 
  ❯ Execute a command
    Copy files
    Set up port forwarding
    View logs
    
? Where do you want to run it? ›
  ❯ Local machine
    SSH host
    Docker container
    Kubernetes pod
    
? Select SSH host › 
  ❯ prod (production.example.com)
    staging (staging.example.com)
    [Enter custom host...]
```

### 5. Improve Error Messages

**Provide consistent, helpful error messages:**

```bash
# Current
Error: Command failed with exit code 1

# Improved
Error: Command failed on 'production.example.com'
  Command: npm test
  Exit code: 1
  Error output: 
    Test suite failed: 2 tests failed
    See logs above for details
    
  Suggestions:
    • Check if npm packages are installed
    • Run with --verbose for more details
    • Try: xec on prod "npm install && npm test"
```

### 6. Streamline Common Workflows

**Add workflow-specific commands:**

```bash
# File operations
xec copy ./file.txt prod:/tmp/          # Upload to SSH
xec copy prod:/logs/*.log ./logs/       # Download from SSH
xec copy app:/data ./backup/            # From container
xec copy pod:web:/logs ./              # From Kubernetes

# Port forwarding
xec forward prod:3306 to 3307          # SSH tunnel
xec forward pod:web:80 to 8080         # K8s port forward
xec forward app:5432                   # Docker, auto-assign local port

# Log streaming
xec logs app --follow                  # Docker logs
xec logs pod:web --tail 100            # K8s logs
xec logs prod:/var/log/app.log         # SSH tail -f
```

### 7. Add Smart Defaults

**Reduce required configuration through intelligent defaults:**

```bash
# Auto-detect execution context
xec myapp npm test     # If 'myapp' is a known container, run there
xec prod uptime        # If 'prod' is a known host, run there
xec web-pod date       # If matches a pod pattern, run there

# Smart command routing
xec compose up         # Automatically uses docker compose
xec kubectl get pods   # Passes through to kubectl
xec git status         # Runs locally by default
```

## Implementation Plan

### Phase 1: Core Enhancements (Week 1-2)
1. ✅ Already completed: SSH tunnels, K8s enhancements, Docker compose
2. Add unified configuration loader that works for both core and CLI
3. Enhance error objects with suggestions and context
4. Add convenience methods to core for common patterns

### Phase 2: CLI Command Simplification (Week 3-4)
1. Implement `xec on` command for SSH operations
2. Implement `xec in` command for container/pod operations
3. Add direct command passthrough for local operations
4. Simplify flag handling with smart defaults

### Phase 3: Configuration Unification (Week 5)
1. Migrate to single YAML configuration format
2. Add configuration migration tool for existing users
3. Implement host/container/pod registry
4. Make configuration available to scripts

### Phase 4: Enhanced Features (Week 6-7)
1. Add `xec copy` unified file operations
2. Add `xec forward` unified port forwarding
3. Add `xec logs` unified log streaming
4. Implement interactive mode

### Phase 5: Polish and Documentation (Week 8)
1. Improve all error messages with context and suggestions
2. Add command suggestions ("did you mean...")
3. Update all documentation with new patterns
4. Create migration guide for existing users

## Success Metrics

1. **Reduced command length**: Average command should be 50% shorter
2. **Improved discoverability**: Users find features without documentation
3. **Faster task completion**: Common tasks take fewer steps
4. **Better error recovery**: Users can fix issues without external help
5. **Consistency**: Same mental model works everywhere

## Backwards Compatibility

All improvements will maintain backwards compatibility:
- Existing commands continue to work with deprecation warnings
- Old configuration formats are auto-migrated
- Scripts using current API remain functional
- Gradual migration path for users

## Conclusion

The Xec core library provides a solid foundation, but the CLI interface creates unnecessary friction for users. By simplifying commands, unifying configuration, and focusing on common workflows, we can dramatically improve the user experience without adding new abstractions. The proposed changes make Xec more intuitive while preserving its power and flexibility.

The key insight is that users think in terms of **where** they want to run commands and **what** they want to do, not in terms of adapters and options. By aligning the CLI with this mental model, we can create a tool that feels natural and effortless to use.