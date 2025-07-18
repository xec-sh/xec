# 18. Troubleshooting Guide

## Overview

This guide will help diagnose and resolve common issues when working with Xec Core. Organized by categories for quick solution finding.

## Problem Diagnosis

### Built-in Diagnostics

```bash
# Complete system check
xec doctor

# Check specific components
xec doctor --components=node,network,permissions,state

# Detailed output
xec doctor --verbose

# Export report
xec doctor --output=report.json
```

### Collecting Diagnostic Information

```bash
# Create diagnostic archive
xec support bundle --output=xec-diagnostics.tar.gz

# What's included:
# - Configuration (without secrets)
# - Logs from last 7 days
# - System state
# - Performance metrics
# - Dependency versions
```

## Common Issues

### Installation Issues

#### Problem: npm install fails

```bash
# Symptoms
npm ERR! code EACCES
npm ERR! syscall access
npm ERR! path /usr/local/lib/node_modules

# Solution 1: Use npm prefix
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Solution 2: Fix permissions
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# Solution 3: Use nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

#### Problem: Python gyp errors

```bash
# Symptoms
gyp ERR! build error
gyp ERR! stack Error: `make` failed with exit code: 2

# Solution for Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y python3 make g++ build-essential

# Solution for macOS
xcode-select --install

# Solution for Windows
npm install --global windows-build-tools
```

### Connection Issues

#### Problem: Cannot connect to remote hosts

```bash
# SSH connection diagnostics
xec debug ssh user@host --verbose

# Check:
# 1. SSH keys
ls -la ~/.ssh/
ssh-add -l

# 2. SSH agent
eval $(ssh-agent -s)
ssh-add ~/.ssh/id_rsa

# 3. SSH configuration
cat ~/.ssh/config

# Solution: proper configuration
Host myserver
  HostName 10.0.1.100
  User deploy
  IdentityFile ~/.ssh/deploy_key
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
```

#### Problem: Timeout errors

```typescript
// Increase timeouts in configuration
const config = {
  execution: {
    timeout: 300000, // 5 minutes globally
    
    // Timeouts for specific operations
    timeouts: {
      ssh: 60000,
      http: 30000,
      command: 120000
    }
  },
  
  // Retry configuration
  retry: {
    attempts: 3,
    delay: 1000,
    backoff: 2.0,
    maxDelay: 30000
  }
};

// In tasks
task('long-running')
  .timeout(600000) // 10 minutes for this task
  .run(async ({ $ }) => {
    await $`./long-process.sh`;
  })
  .build();
```

### State Management Issues

#### Problem: State corruption

```bash
# Symptoms
Error: State checksum mismatch
Error: Cannot deserialize state

# Diagnostics
xec state verify
xec state show --raw

# Solution 1: Restore from backup
xec state restore --from=backup-20240115.json

# Solution 2: Export and clean
xec state export --output=state-corrupted.json
xec state clear --confirm
xec state import --file=state-cleaned.json --validate

# Solution 3: Manual fix
# For PostgreSQL backend
psql -d xec -c "SELECT * FROM state WHERE key = 'corrupted.key';"
psql -d xec -c "UPDATE state SET value = '{}' WHERE key = 'corrupted.key';"
```

#### Problem: State lock stuck

```bash
# Symptoms
Error: State is locked by another process
Error: Could not acquire state lock

# Check locks
xec state locks

# Force unlock (careful!)
xec state unlock --force --lock-id=abc123

# For distributed systems
xec cluster locks
xec cluster unlock deployment-lock --node=node1
```

### Performance Issues

#### Problem: Slow task execution

```bash
# Task profiling
xec run my-task --profile

# Analyze results
xec profile show --task=my-task

# Enable tracing
xec run my-task --trace --trace-output=trace.json

# Visualization (requires Chrome)
# Open chrome://tracing and load trace.json
```

```typescript
// Task optimization
// Bad: sequential execution
task('slow')
  .run(async ({ $ }) => {
    await $`command1`;
    await $`command2`;
    await $`command3`;
  });

// Good: parallel execution where possible
task('fast')
  .run(async ({ $ }) => {
    await Promise.all([
      $`command1`,
      $`command2`,
      $`command3`
    ]);
  });
```

#### Problem: High memory usage

```bash
# Memory monitoring
xec monitor memory --interval=1s

# Heap snapshot
xec debug heap-snapshot --output=heap.heapsnapshot
# Analyze in Chrome DevTools

# Memory leak detection
xec debug memory-leaks --duration=5m
```

```javascript
// Node.js configuration
// In package.json scripts
"scripts": {
  "start": "node --max-old-space-size=4096 server.js",
  "start:inspect": "node --inspect --max-old-space-size=4096 server.js"
}

// Or via environment
export NODE_OPTIONS="--max-old-space-size=4096"
```

### Integration Issues

#### Problem: Kubernetes connection fails

```bash
# Diagnostics
xec k8s test-connection

# Check kubeconfig
kubectl config current-context
kubectl cluster-info

# Solution 1: Specify kubeconfig
export KUBECONFIG=/path/to/kubeconfig
xec run deploy

# Solution 2: In configuration
integrations:
  kubernetes:
    kubeconfig: /home/user/.kube/config
    context: production-cluster
    
# Solution 3: In-cluster configuration
integrations:
  kubernetes:
    inCluster: true
```

#### Problem: AWS credentials not working

```bash
# Diagnostics
xec aws test-credentials

# Check AWS CLI
aws sts get-caller-identity

# Solution 1: Environment variables
export AWS_ACCESS_KEY_ID=xxx
export AWS_SECRET_ACCESS_KEY=yyy
export AWS_DEFAULT_REGION=us-east-1

# Solution 2: AWS Profile
export AWS_PROFILE=production
# Or in configuration
integrations:
  aws:
    profile: production
    
# Solution 3: IAM Role (for EC2/ECS)
integrations:
  aws:
    useInstanceProfile: true
```

### Logging Issues

#### Problem: Logs not appearing

```bash
# Check logging configuration
xec config get logging

# Check write permissions
ls -la /var/log/xec/
sudo chown -R xec:xec /var/log/xec/

# Check disk space
df -h /var/log/

# Solution: log rotation
# /etc/logrotate.d/xec
/var/log/xec/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 xec xec
    sharedscripts
    postrotate
        systemctl reload xec
    endscript
}
```

#### Problem: Log verbosity issues

```typescript
// Dynamically change log level
// Via API
POST /api/admin/logging
{
  "level": "debug",
  "categories": {
    "execution": "trace",
    "state": "debug",
    "http": "info"
  }
}

// Via CLI
xec admin set-log-level debug
xec admin set-log-level execution:trace,state:debug

// In code for debugging
import { logger } from '@xec-js/core';

logger.level = 'debug';
logger.child({ module: 'my-module' }).debug('Detailed info');
```

### Security Issues

#### Problem: Permission denied errors

```bash
# Permission diagnostics
xec debug permissions

# Linux checks
# 1. User and group
id
groups

# 2. File permissions
namei -l /path/to/file

# 3. SELinux (if enabled)
getenforce
ausearch -m avc -ts recent

# SELinux solutions
semanage fcontext -a -t httpd_sys_content_t "/opt/xec(/.*)?"
restorecon -Rv /opt/xec
```

#### Problem: SSL/TLS certificate errors

```bash
# Certificate diagnostics
xec debug ssl --host=api.example.com

# Check certificate
openssl s_client -connect api.example.com:443 -servername api.example.com

# Check certificate chain
openssl verify -CAfile ca.crt server.crt

# Solution 1: Ignore for development (NOT for production!)
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Solution 2: Add CA
export NODE_EXTRA_CA_CERTS=/path/to/ca.crt

# Solution 3: In configuration
http:
  tls:
    rejectUnauthorized: true
    ca: /path/to/ca.crt
```

## Advanced Debugging

### Remote Debugging

```bash
# Start with debugging
xec server --inspect=0.0.0.0:9229

# SSH tunnel for remote debugging
ssh -L 9229:localhost:9229 user@remote-server

# Connect Chrome DevTools
# Open chrome://inspect
```

### Tracing Distributed Operations

```yaml
# OpenTelemetry configuration
tracing:
  enabled: true
  exporter: jaeger
  endpoint: http://jaeger:14268/api/traces
  
  sampling:
    type: probabilistic
    param: 0.1  # 10% sampling
```

```typescript
// Adding custom spans
import { tracer } from '@xec-js/core';

const span = tracer.startSpan('custom-operation');
span.setAttributes({
  'operation.type': 'deployment',
  'deployment.version': '2.0.0'
});

try {
  // Operation
  await deployApplication();
  span.setStatus({ code: SpanStatusCode.OK });
} catch (error) {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR });
  throw error;
} finally {
  span.end();
}
```

### Core Dumps

```bash
# Enable core dumps
ulimit -c unlimited

# Configure dump path
echo '/tmp/core.%e.%p' | sudo tee /proc/sys/kernel/core_pattern

# Analyze core dump
gdb node /tmp/core.node.12345
(gdb) bt full
(gdb) info registers
```

## Recovery Procedures

### Emergency Recovery

```bash
#!/bin/bash
# emergency-recovery.sh

# 1. Stop all processes
systemctl stop xec
pkill -f xec

# 2. Backup current state
tar -czf /backup/xec-emergency-$(date +%Y%m%d-%H%M%S).tar.gz \
  /etc/xec \
  /var/lib/xec \
  /var/log/xec

# 3. Reset state
rm -rf /var/lib/xec/state/*
rm -rf /var/lib/xec/cache/*

# 4. Restore from last known good state
xec state restore --from=/backup/last-known-good.json

# 5. Verify
xec doctor
xec state verify

# 6. Gradual startup
systemctl start xec
xec health-check --wait
```

### Database Recovery

```sql
-- PostgreSQL recovery
-- 1. Check integrity
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables 
WHERE schemaname = 'xec'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 2. Vacuum and reindex
VACUUM ANALYZE;
REINDEX DATABASE xec;

-- 3. Check and fix sequences
SELECT setval('state_id_seq', (SELECT MAX(id) FROM state));
```

## Monitoring and Alerting

### Health Check Endpoints

```typescript
// Health check implementation
app.get('/health', async (req, res) => {
  const checks = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkDiskSpace(),
    checkMemory()
  ]);
  
  const healthy = checks.every(c => c.status === 'ok');
  
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: checks
  });
});

// Detailed health check
app.get('/health/detailed', authenticate, async (req, res) => {
  const report = await generateHealthReport();
  res.json(report);
});
```

### Alerting Rules

```yaml
# Prometheus alerting rules
groups:
  - name: xec-core
    rules:
      - alert: HighErrorRate
        expr: rate(xec_errors_total[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High error rate detected"
          
      - alert: StateCorruption
        expr: xec_state_corruption_detected > 0
        annotations:
          summary: "State corruption detected"
          severity: critical
          
      - alert: LongRunningTask
        expr: xec_task_duration_seconds > 3600
        annotations:
          summary: "Task running for more than 1 hour"
```

## Getting Help

### Support Channels

1. **Documentation**: https://docs.xec.io
2. **GitHub Issues**: https://github.com/xec/core/issues
3. **Discord Community**: https://discord.gg/xec
4. **Stack Overflow**: Tag `xec`
5. **Commercial Support**: support@xec.io

### Reporting Bugs

```bash
# Collect information for bug report
xec debug report --output=bug-report.json

# What to include in bug report:
# 1. Versions
xec version --detailed

# 2. Configuration (without secrets)
xec config show --sanitize

# 3. Minimal reproducible example
# 4. Full stack trace
# 5. Logs with debug level
```

### Debug Checklist

- [ ] Documentation checked
- [ ] `xec doctor` run
- [ ] Logs checked with debug level
- [ ] Tested in isolated environment
- [ ] Known issues checked on GitHub
- [ ] Diagnostic information collected

## Best Practices for Problem Prevention

1. **Regular Health Checks** - Monitor system state
2. **Proper Logging** - Log sufficient information
3. **Backup Strategy** - Regular backups of critical data
4. **Test in Staging** - Always test changes
5. **Monitor Resources** - CPU, memory, disk, network
6. **Update Regularly** - But test updates
7. **Document Issues** - Maintain internal knowledge base

## Conclusion

Most issues in Xec Core can be resolved by following this guide. If a problem persists, use the built-in diagnostic tools and reach out to the community with a detailed description of the issue and diagnostic information.
