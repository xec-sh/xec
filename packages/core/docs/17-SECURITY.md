# 17. Security Guide

## Overview

Security is a critical aspect of Xec Core. This guide covers best practices, built-in security mechanisms, and recommendations for protecting your automation infrastructure.

## Security Principles

### Defense in Depth

Xec Core follows the principle of layered defense:

1. **Network Security** - Firewall, VPN, network segmentation
2. **Application Security** - Authentication, authorization, input validation
3. **Data Security** - Encryption at rest and in transit
4. **Operational Security** - Logging, monitoring, incident response

### Least Privilege

All components operate with minimal necessary privileges:

```yaml
# Example configuration with restricted permissions
execution:
  user: xec-runner
  group: xec
  capabilities:
    - CAP_NET_BIND_SERVICE
  seccomp: true
  apparmor: xec-profile
```

## Authentication and Authorization

### API Authentication

```typescript
// JWT configuration
const authConfig = {
  jwt: {
    secret: process.env.JWT_SECRET,
    algorithm: 'RS256',
    expiresIn: '1h',
    issuer: 'xec-core',
    audience: 'xec-api'
  },
  
  // Support for multiple auth methods
  methods: ['jwt', 'apiKey', 'oauth2'],
  
  // API Key configuration
  apiKey: {
    header: 'X-API-Key',
    queryParam: 'api_key',
    prefix: 'xec_'
  }
};

// Middleware for protecting endpoints
app.use('/api', authenticate(authConfig));
```

### RBAC (Role-Based Access Control)

```yaml
# roles.yaml
roles:
  admin:
    description: Full system access
    permissions:
      - '*'
      
  operator:
    description: Execute recipes and tasks
    permissions:
      - recipe:execute
      - task:run
      - state:read
      - log:read
      
  viewer:
    description: Read-only access
    permissions:
      - state:read
      - log:read
      - metrics:read
      
  deployer:
    description: Deployment operations
    permissions:
      - recipe:execute:deploy-*
      - state:write:deployment.*
      - integration:use:kubernetes
      - integration:use:aws
```

```typescript
// Applying RBAC
@requiresRole('operator')
async executeRecipe(name: string, params: any) {
  // Check additional permissions
  if (name.startsWith('production-')) {
    this.requirePermission('recipe:execute:production');
  }
  
  return await this.recipeRunner.execute(name, params);
}
```

### OAuth2 Integration

```typescript
// OAuth2 configuration
const oauth2Config = {
  providers: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      scope: ['read:user', 'read:org'],
      
      // Mapping GitHub teams to Xec roles
      teamMapping: {
        'myorg/devops': 'operator',
        'myorg/sre': 'admin',
        'myorg/developers': 'viewer'
      }
    },
    
    okta: {
      domain: 'mycompany.okta.com',
      clientId: process.env.OKTA_CLIENT_ID,
      clientSecret: process.env.OKTA_CLIENT_SECRET,
      
      // Attribute mapping
      attributeMapping: {
        roles: 'xec_roles',
        department: 'department'
      }
    }
  }
};
```

## Encryption

### Encryption at Rest

```typescript
// Data encryption configuration
const encryptionConfig = {
  algorithm: 'aes-256-gcm',
  
  // Key management
  keyManagement: {
    provider: 'aws-kms',
    keyId: 'arn:aws:kms:region:account:key/key-id',
    
    // Or local key management
    // provider: 'local',
    // keyDerivation: {
    //   algorithm: 'pbkdf2',
    //   iterations: 100000,
    //   salt: process.env.ENCRYPTION_SALT
    // }
  },
  
  // What to encrypt
  targets: {
    secrets: true,
    state: ['secrets.*', 'credentials.*'],
    logs: ['*.password', '*.token'],
    database: {
      tables: ['secrets', 'credentials'],
      columns: ['value', 'data']
    }
  }
};
```

### Encryption in Transit

```yaml
# TLS configuration
tls:
  enabled: true
  minVersion: TLS1.2
  ciphers:
    - ECDHE-RSA-AES128-GCM-SHA256
    - ECDHE-RSA-AES256-GCM-SHA384
    - ECDHE-RSA-CHACHA20-POLY1305
  
  # Certificate management
  certificates:
    server:
      cert: /etc/xec/certs/server.crt
      key: /etc/xec/certs/server.key
      ca: /etc/xec/certs/ca.crt
    
    client:
      verify: true
      ca: /etc/xec/certs/client-ca.crt
      
  # Automatic certificate rotation
  rotation:
    enabled: true
    provider: cert-manager
    renewBefore: 30d
```

### Secrets Management

```typescript
// HashiCorp Vault integration
const vaultConfig = {
  address: 'https://vault.internal:8200',
  token: process.env.VAULT_TOKEN,
  
  // Or AppRole auth
  auth: {
    method: 'approle',
    roleId: process.env.VAULT_ROLE_ID,
    secretId: process.env.VAULT_SECRET_ID
  },
  
  // KV v2 secrets engine
  mount: 'secret',
  prefix: 'xec/'
};

// Usage
const secrets = new VaultSecretProvider(vaultConfig);

// Get secret
const dbPassword = await secrets.get('database/password');

// Dynamic credentials
const awsCreds = await secrets.getDynamic('aws/creds/deploy-role');
// Credentials automatically refresh before expiration
```

## Secure Coding Practices

### Input Validation

```typescript
import { z } from 'zod';

// Schema validation for all inputs
const deploySchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  environment: z.enum(['development', 'staging', 'production']),
  servers: z.array(z.string().ip()),
  config: z.record(z.string(), z.any()).strict()
});

@validate(deploySchema)
async deploy(params: DeployParams) {
  // Params already validated
  return this.executor.deploy(params);
}

// Command injection protection
const sanitizeCommand = (cmd: string): string => {
  // Whitelist approach
  const allowedChars = /^[a-zA-Z0-9\s\-_\.\/]+$/;
  if (!allowedChars.test(cmd)) {
    throw new SecurityError('Invalid characters in command');
  }
  return cmd;
};
```

### SQL Injection Prevention

```typescript
// Always use parameterized queries
const getDeployment = async (id: string) => {
  // Correct
  const result = await db.query(
    'SELECT * FROM deployments WHERE id = $1',
    [id]
  );
  
  // Incorrect - vulnerable to SQL injection
  // const result = await db.query(
  //   `SELECT * FROM deployments WHERE id = '${id}'`
  // );
  
  return result.rows[0];
};

// ORM with built-in protection
const deployment = await Deployment.findOne({
  where: { id },
  attributes: ['id', 'version', 'status']
});
```

### Path Traversal Prevention

```typescript
const safeFileAccess = (userPath: string, baseDir: string): string => {
  // Normalize and validate path
  const normalizedPath = path.normalize(userPath);
  const resolvedPath = path.resolve(baseDir, normalizedPath);
  
  // Ensure path is within baseDir
  if (!resolvedPath.startsWith(path.resolve(baseDir))) {
    throw new SecurityError('Path traversal attempt detected');
  }
  
  return resolvedPath;
};

// Usage
const filePath = safeFileAccess(req.params.file, '/var/lib/xec/files');
```

## Network Security

### Firewall Rules

```bash
#!/bin/bash
# iptables rules for Xec Core

# Reset rules
iptables -F
iptables -X

# Default policies
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Loopback
iptables -A INPUT -i lo -j ACCEPT

# Established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# SSH (restricted by IP)
iptables -A INPUT -p tcp --dport 22 -s 10.0.0.0/8 -j ACCEPT

# HTTPS API
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Metrics (internal network only)
iptables -A INPUT -p tcp --dport 9090 -s 10.0.0.0/8 -j ACCEPT

# Rate limiting
iptables -A INPUT -p tcp --dport 443 -m limit --limit 100/minute --limit-burst 200 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j DROP

# DDoS protection
iptables -A INPUT -p tcp --tcp-flags ALL NONE -j DROP
iptables -A INPUT -p tcp --tcp-flags ALL ALL -j DROP
iptables -A INPUT -p tcp --tcp-flags SYN,FIN SYN,FIN -j DROP

# Save rules
iptables-save > /etc/iptables/rules.v4
```

### VPN Access

```yaml
# WireGuard VPN configuration
vpn:
  type: wireguard
  interface: wg0
  port: 51820
  
  server:
    privateKey: ${VPN_PRIVATE_KEY}
    address: 10.100.0.1/24
    
  peers:
    - name: admin-laptop
      publicKey: ${ADMIN_PUBLIC_KEY}
      allowedIPs: 10.100.0.2/32
      
    - name: ci-server
      publicKey: ${CI_PUBLIC_KEY}
      allowedIPs: 10.100.0.3/32
      presharedKey: ${CI_PRESHARED_KEY}
```

## Audit Logging

### Comprehensive Audit Trail

```typescript
// Audit logger configuration
const auditConfig = {
  // What to log
  events: [
    'auth.login',
    'auth.logout',
    'auth.failed',
    'recipe.execute',
    'state.modify',
    'secret.access',
    'config.change',
    'user.create',
    'user.modify',
    'role.assign'
  ],
  
  // Log format
  format: {
    timestamp: true,
    user: true,
    ip: true,
    userAgent: true,
    action: true,
    resource: true,
    result: true,
    duration: true
  },
  
  // Storage
  storage: {
    type: 'elasticsearch',
    index: 'xec-audit',
    retention: '90d'
  },
  
  // Tampering protection
  integrity: {
    sign: true,
    algorithm: 'sha256',
    key: process.env.AUDIT_SIGNING_KEY
  }
};

// Usage
@audit('recipe.execute')
async executeRecipe(name: string, params: any) {
  const startTime = Date.now();
  
  try {
    const result = await this.runner.execute(name, params);
    
    // Success automatically logged
    return result;
  } catch (error) {
    // Error automatically logged
    throw error;
  }
}
```

### SIEM Integration

```yaml
# Splunk forwarder configuration
splunk:
  forwarder:
    server: splunk.internal:9997
    
  inputs:
    - path: /var/log/xec/audit.log
      sourcetype: xec:audit
      index: security
      
    - path: /var/log/xec/access.log
      sourcetype: xec:access
      index: security
      
  alerts:
    - name: multiple_failed_logins
      search: |
        index=security sourcetype=xec:audit 
        action="auth.failed" 
        | stats count by user 
        | where count > 5
      
    - name: privilege_escalation
      search: |
        index=security sourcetype=xec:audit
        action="role.assign"
        role="admin"
```

## Vulnerability Management

### Dependency Scanning

```yaml
# GitHub Actions security scanning
name: Security Scan
on: [push, pull_request]

jobs:
  dependencies:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
          
      - name: NPM Audit
        run: npm audit --production
        
      - name: License Check
        run: npx license-checker --onlyAllow 'MIT;Apache-2.0;BSD'

  code-analysis:
    runs-on: ubuntu-latest
    steps:
      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          
      - name: CodeQL Analysis
        uses: github/codeql-action/analyze@v2
```

### Container Scanning

```dockerfile
# Multi-stage build for security
FROM node:18-alpine AS builder

# Non-root user for build
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Minimal runtime image
FROM gcr.io/distroless/nodejs18-debian11

# Copy only necessary files
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/
COPY dist/ /app/dist/

# Non-root execution
USER 1001
EXPOSE 3000

CMD ["/app/dist/server.js"]
```

```bash
# Image scanning
trivy image xec-core:latest
grype xec-core:latest
```

## Incident Response

### Security Playbooks

```yaml
# incident-response.yaml
playbooks:
  compromised-credentials:
    steps:
      - name: revoke-access
        action: |
          xec user disable {{ user }}
          xec token revoke --user {{ user }}
          
      - name: force-password-reset
        action: |
          xec user reset-password {{ user }} --force
          
      - name: audit-activity
        action: |
          xec audit search --user {{ user }} --days 30
          
      - name: notify
        action: |
          xec notify security-team --priority high
          
  data-breach:
    steps:
      - name: isolate
        action: |
          xec cluster isolate {{ node }}
          
      - name: snapshot
        action: |
          xec forensics snapshot {{ node }} --full
          
      - name: analyze
        action: |
          xec forensics analyze --snapshot {{ snapshot_id }}
```

### Automated Response

```typescript
// Security event handler
class SecurityEventHandler {
  @on('security.anomaly_detected')
  async handleAnomaly(event: SecurityEvent) {
    const severity = this.assessSeverity(event);
    
    switch (severity) {
      case 'critical':
        // Immediate action
        await this.isolateSystem(event.source);
        await this.notifySecurityTeam(event, 'immediate');
        await this.createForensicSnapshot(event);
        break;
        
      case 'high':
        // Automated investigation
        const analysis = await this.runSecurityAnalysis(event);
        if (analysis.confirmed) {
          await this.executePlaybook('investigate-threat', event);
        }
        break;
        
      case 'medium':
        // Log and monitor
        await this.enhancedMonitoring(event.source);
        await this.notifySecurityTeam(event, 'normal');
        break;
    }
  }
}
```

## Compliance

### Compliance Frameworks

```yaml
# Compliance configuration
compliance:
  frameworks:
    - type: pci-dss
      version: 4.0
      controls:
        - id: 2.2.1
          description: "Change default passwords"
          implementation: "automatic-password-rotation"
          
        - id: 8.2.4
          description: "Change passwords every 90 days"
          implementation: "password-policy-enforcement"
          
    - type: hipaa
      controls:
        - id: 164.312(a)(1)
          description: "Access control"
          implementation: "rbac-with-audit"
          
    - type: soc2
      controls:
        - id: CC6.1
          description: "Logical access controls"
          implementation: "multi-factor-auth"
```

### Compliance Reporting

```typescript
// Generate compliance reports
const complianceReporter = new ComplianceReporter();

const report = await complianceReporter.generate({
  framework: 'pci-dss',
  period: { start: '2024-01-01', end: '2024-03-31' },
  
  include: [
    'access-controls',
    'encryption-status',
    'vulnerability-scans',
    'security-patches',
    'audit-logs'
  ]
});

// Automatic compliance checking
const violations = await complianceReporter.check();
if (violations.length > 0) {
  await notifyCompliance(violations);
}
```

## Security Monitoring

### Real-time Threat Detection

```typescript
// Threat detection rules
const threatRules = [
  {
    name: 'brute-force-attack',
    condition: 'failed_login_count > 10 within 5m from same_ip',
    action: 'block_ip'
  },
  {
    name: 'privilege-escalation',
    condition: 'user.role changed to admin without approval',
    action: 'revert_and_alert'
  },
  {
    name: 'data-exfiltration',
    condition: 'data_transfer > 1GB to external_ip',
    action: 'throttle_and_investigate'
  }
];

// Monitoring service
const monitor = new SecurityMonitor(threatRules);
monitor.on('threat-detected', async (threat) => {
  await executeSecurityResponse(threat);
});
```

### Security Metrics

```yaml
# Prometheus security metrics
metrics:
  - name: xec_auth_failures_total
    type: counter
    help: Total number of authentication failures
    
  - name: xec_rbac_violations_total
    type: counter
    help: Total number of RBAC violations
    
  - name: xec_encryption_operations_total
    type: counter
    help: Total encryption operations
    labels: [operation, algorithm]
    
  - name: xec_security_alerts_total
    type: counter
    help: Total security alerts
    labels: [severity, type]
```

## Security Checklist

### Pre-deployment

- [ ] All dependencies scanned and updated
- [ ] Security patches applied
- [ ] Secrets rotated
- [ ] SSL certificates valid
- [ ] Firewall rules configured
- [ ] Audit logging enabled
- [ ] Backup encryption verified

### Post-deployment

- [ ] Security scan completed
- [ ] Penetration test passed
- [ ] Compliance check passed
- [ ] Monitoring alerts configured
- [ ] Incident response tested
- [ ] Documentation updated

## Best Practices

1. **Never store secrets in code** - Use secret management
2. **Always encrypt sensitive data** - Both at rest and in transit
3. **Implement least privilege** - Minimal necessary access
4. **Regular security updates** - Automate patching
5. **Monitor and alert** - Real-time threat detection
6. **Test incident response** - Regular drills
7. **Document security procedures** - Keep updated

## Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [Security Reporting](mailto:security@xec.io)

## Conclusion

Security in Xec Core is not a one-time setup but a continuous process. Regular updates, monitoring, auditing, and process improvement ensure reliable protection of your automation infrastructure.
