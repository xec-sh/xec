---
title: SSL Certificate Management
description: Automate SSL certificate renewal and deployment across environments
keywords: [ssl, tls, certificates, let's encrypt, renewal, https]
source_files:
  - packages/core/src/core/execution-engine.ts
  - apps/xec/src/commands/run.ts
---

# SSL Certificate Management {#ssl-certificate-management}

## Problem {#problem}

Managing SSL/TLS certificates across multiple servers and environments requires tracking expiration dates, coordinating renewals, deploying updated certificates, and reloading services without downtime.

## Solution {#solution}

Xec automates the entire certificate lifecycle using Let's Encrypt for automated renewals, with support for wildcard certificates, multi-domain setups, and various web servers.

## Quick Example {#quick-example}

```typescript
// Certbot owns renewal and locking; the hook runs only after a successful renewal.
await $`certbot renew --quiet --deploy-hook ${'nginx -t && systemctl reload nginx'}`.timeout(600_000);
```

## Complete Certificate Management System {#complete-certificate-management-system}

### 1. Automated Let's Encrypt Setup {#1-automated-lets-encrypt-setup}

```typescript
const domain = process.env.CERT_DOMAIN;
const email = process.env.ACME_EMAIL;
const webroot = process.env.ACME_WEBROOT;
if (!domain || !/^[a-zA-Z0-9.-]+$/.test(domain) || !email || !webroot) {
  throw new Error('CERT_DOMAIN, ACME_EMAIL and ACME_WEBROOT are required');
}
// Provision the HTTP challenge route and review the ACME terms before running.
// Xec does not rewrite nginx configuration or accept credentials implicitly.
await $`certbot certonly --webroot --webroot-path ${webroot} --domain ${domain} --email ${email} --agree-tos --non-interactive`.timeout(600_000);
await $`nginx -t`;
await $`systemctl reload nginx`;
```

### 2. Automated Renewal Workflow {#2-automated-renewal-workflow}

```typescript
// scripts/renew-certificates.ts — invoke from the host's existing scheduler.
await $`certbot renew --quiet --deploy-hook ${'nginx -t && systemctl reload nginx'}`.timeout(600_000);
// A failure propagates to the scheduler. Do not catch it and report success.
// There is no second in-process cron daemon or competing renewal policy.
```

### 3. Multi-Domain Certificate Management {#3-multi-domain-certificate-management}

```typescript
import { X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const domains = ['example.com', 'api.example.com'];
const now = Date.now();
for (const domain of domains) {
  const cert = new X509Certificate(await readFile(`/etc/letsencrypt/live/${domain}/fullchain.pem`));
  const expires = Date.parse(cert.validTo);
  if (!Number.isFinite(expires)) throw new Error(`Invalid expiry for ${domain}`);
  console.log({ domain, expires: cert.validTo, daysRemaining: Math.floor((expires - now) / 86_400_000) });
  if (expires - now < 30 * 86_400_000) process.exitCode = 1;
}
```

### 4. Certificate Monitoring Dashboard {#4-certificate-monitoring-dashboard}

```typescript
// Produce a bounded observation for an existing dashboard/monitoring collector.
// Hosting a web UI and controlling access belong to that application.
import { X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const certificate = new X509Certificate(await readFile('/etc/letsencrypt/live/example.com/fullchain.pem'));
const report = { domain: 'example.com', validTo: certificate.validTo, observedAt: new Date().toISOString() };
console.log(JSON.stringify(report));
if (Date.parse(certificate.validTo) <= Date.now()) process.exitCode = 1;
```

### 5. Configuration File {#5-configuration-file}

Certbot owns certificate renewal configuration under its configured directory. Keep challenge credentials in the provider's protected credential file and use the installed Certbot scheduler. The Xec setup example reads these explicitly supplied, non-secret values:

```bash
export CERT_DOMAIN=example.com
export ACME_EMAIL=admin@example.com
export ACME_WEBROOT=/var/www/acme
xec run scripts/setup-certificate.ts
```

Provision the HTTP challenge route before setup. A wildcard certificate requires a separately configured DNS challenge plugin; changing a YAML field does not install or authorize it.

### 6. Xec Task Configuration {#6-xec-task-configuration}

```yaml
version: '1.0'
tasks:
  ssl:renew:
    description: Renew certificates through Certbot's existing policy
    command: xec run scripts/renew-certificates.ts
  ssl:check:
    description: Emit certificate expiry observations
    command: xec run scripts/check-certificates.ts
```

## Best Practices {#best-practices}

### 1. Security {#1-security}
- **Private key protection**: Keep private keys with 600 permissions
- **Secure transfer**: Use SSH/SCP for certificate distribution
- **DNS validation**: Use for wildcard certificates
- **HSTS headers**: Enable HTTP Strict Transport Security

### 2. Automation {#2-automation}
- **Regular checks**: Schedule daily certificate checks
- **Early renewal**: Renew 30 days before expiration
- **Automated deployment**: Sync certificates across servers
- **Service reload**: Gracefully reload services after renewal

### 3. Monitoring {#3-monitoring}
- **Expiration tracking**: Monitor days until expiration
- **Multi-channel alerts**: Email + Slack + PagerDuty
- **Dashboard visibility**: Central monitoring dashboard
- **Audit logging**: Track all certificate operations

## Common Patterns {#common-patterns}

### Pre/Post Renewal Hooks {#prepost-renewal-hooks}
```bash
# Prefer a webroot/DNS challenge that does not stop the serving process.
# Run a reviewed deploy hook only after successful renewal.
certbot renew --deploy-hook "nginx -t && systemctl reload nginx"
```

### Load Balancer Certificate Updates {#load-balancer-certificate-updates}
```typescript
// The application's reviewed certificate deployment script owns atomic file
// replacement, permissions and recovery. Xec verifies before reload.
await $`npm run deploy:haproxy-certificates`;
await $`haproxy -c -f /etc/haproxy/haproxy.cfg`;
await $`systemctl reload haproxy`;
```

## Troubleshooting {#troubleshooting}

### Common Issues {#common-issues}

1. **Renewal failures**: Check firewall rules for port 80/443
2. **DNS validation errors**: Verify DNS propagation
3. **Permission denied**: Ensure certbot runs as root
4. **Rate limits**: Let's Encrypt has rate limits, use staging for testing

## Related Topics {#related-topics}

- [Health Checks](./health-checks.md) - Monitor SSL endpoints
- [Backup & Restore](./backup-restore.md) - Backup certificates
- [GitHub Actions](../integration/github-actions.md) - CI/CD certificate deployment
- [Docker Deployment](../deployment/docker-deploy.md) - Containerized SSL