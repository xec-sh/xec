---
title: SSL Certificate Management
description: Automate SSL certificate renewal and deployment across environments
keywords: [ssl, tls, certificates, let's encrypt, renewal, https]
source_files:
  - packages/core/src/adapters/ssh-adapter.ts
  - packages/core/src/operations/file.ts
  - packages/core/src/utils/retry.ts
  - apps/xec/src/commands/on.ts
  - apps/xec/src/commands/copy.ts
key_functions:
  - SSHAdapter.execute()
  - FileOperations.copy()
  - retry()
  - on()
  - copy()
verification_date: 2025-08-03
---

# SSL Certificate Management

## Problem

Managing SSL/TLS certificates across multiple servers and environments requires tracking expiration dates, coordinating renewals, deploying updated certificates, and reloading services without downtime.

## Solution

Xec automates the entire certificate lifecycle using Let's Encrypt for automated renewals, with support for wildcard certificates, multi-domain setups, and various web servers.

## Quick Example

```typescript
// renew-certs.ts
import { $ } from '@xec-sh/core';

// Renew certificates on all web servers
await $.ssh('web-*')`
  certbot renew --quiet --no-self-upgrade &&
  nginx -s reload
`;

console.log('✅ Certificates renewed and services reloaded');
```

## Complete Certificate Management System

### 1. Automated Let's Encrypt Setup

```typescript
// cert-manager.ts
import { $, on } from '@xec-sh/core';
import { parallel } from '@xec-sh/core/utils';

class CertificateManager {
  constructor(
    private email: string,
    private domains: string[],
    private webroot: string = '/var/www/html'
  ) {}

  // Initial Certbot setup
  async setupCertbot(target: string) {
    console.log(`📦 Setting up Certbot on ${target}...`);
    
    // Install Certbot
    await on(target)`
      if ! command -v certbot &> /dev/null; then
        if [ -f /etc/debian_version ]; then
          apt-get update && apt-get install -y certbot python3-certbot-nginx
        elif [ -f /etc/redhat-release ]; then
          yum install -y certbot python3-certbot-nginx
        else
          echo "Unsupported OS" && exit 1
        fi
      fi
    `;
    
    console.log(`✅ Certbot installed on ${target}`);
  }

  // Generate new certificate
  async generateCertificate(target: string, domain: string) {
    console.log(`🔐 Generating certificate for ${domain} on ${target}...`);
    
    // Use webroot method for verification
    const result = await on(target)`
      certbot certonly \
        --webroot \
        --webroot-path ${this.webroot} \
        --email ${this.email} \
        --agree-tos \
        --no-eff-email \
        --domain ${domain} \
        --non-interactive \
        --quiet
    `;
    
    if (result.exitCode === 0) {
      console.log(`✅ Certificate generated for ${domain}`);
      return true;
    } else {
      console.error(`❌ Failed to generate certificate for ${domain}`);
      return false;
    }
  }

  // Generate wildcard certificate using DNS challenge
  async generateWildcardCertificate(target: string, domain: string, dnsProvider: string) {
    console.log(`🔐 Generating wildcard certificate for *.${domain}...`);
    
    // Configure DNS plugin based on provider
    const dnsPlugin = this.getDnsPlugin(dnsProvider);
    
    await on(target)`
      certbot certonly \
        --dns-${dnsPlugin} \
        --dns-${dnsPlugin}-credentials /root/.secrets/${dnsProvider}.ini \
        --email ${this.email} \
        --agree-tos \
        --no-eff-email \
        --domain "*.${domain}" \
        --domain ${domain} \
        --non-interactive \
        --quiet
    `;
    
    console.log(`✅ Wildcard certificate generated for *.${domain}`);
  }

  // Check certificate expiration
  async checkExpiration(target: string): Promise<CertStatus[]> {
    const result = await on(target)`
      certbot certificates --no-color 2>/dev/null | \
      grep -E "(Certificate Name:|Expiry Date:|Domains:)" | \
      paste -d ',' - - - | \
      sed 's/Certificate Name://g; s/Domains://g; s/Expiry Date://g'
    `;
    
    const certificates: CertStatus[] = [];
    const lines = result.stdout.trim().split('\n').filter(l => l);
    
    for (const line of lines) {
      const [name, domains, expiry] = line.split(',').map(s => s.trim());
      const expiryDate = new Date(expiry.replace('(VALID:', '').replace(')', ''));
      const daysLeft = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      
      certificates.push({
        name,
        domains: domains.split(' '),
        expiryDate,
        daysLeft,
        needsRenewal: daysLeft <= 30
      });
    }
    
    return certificates;
  }

  // Renew certificates
  async renewCertificates(target: string, force: boolean = false) {
    console.log(`🔄 Renewing certificates on ${target}...`);
    
    const forceFlag = force ? '--force-renewal' : '';
    
    const result = await on(target)`
      certbot renew ${forceFlag} \
        --quiet \
        --no-self-upgrade \
        --deploy-hook "systemctl reload nginx"
    `;
    
    if (result.exitCode === 0) {
      console.log(`✅ Certificates renewed on ${target}`);
      return true;
    } else {
      console.error(`❌ Certificate renewal failed on ${target}`);
      return false;
    }
  }

  // Deploy certificate to other servers
  async deployCertificate(source: string, targets: string[], domain: string) {
    console.log(`📤 Deploying certificate for ${domain} to ${targets.length} servers...`);
    
    const certPath = `/etc/letsencrypt/live/${domain}`;
    
    // Copy certificates to all targets
    const deployments = targets.map(async target => {
      // Create directory
      await on(target)`mkdir -p ${certPath}`;
      
      // Copy certificate files
      await $.copy(`${source}:${certPath}/fullchain.pem`, `${target}:${certPath}/fullchain.pem`);
      await $.copy(`${source}:${certPath}/privkey.pem`, `${target}:${certPath}/privkey.pem`);
      await $.copy(`${source}:${certPath}/cert.pem`, `${target}:${certPath}/cert.pem`);
      await $.copy(`${source}:${certPath}/chain.pem`, `${target}:${certPath}/chain.pem`);
      
      // Set permissions
      await on(target)`
        chmod 600 ${certPath}/privkey.pem &&
        chmod 644 ${certPath}/fullchain.pem ${certPath}/cert.pem ${certPath}/chain.pem
      `;
      
      console.log(`✅ Certificate deployed to ${target}`);
    });
    
    await Promise.all(deployments);
  }

  // Configure web server
  async configureNginx(target: string, domain: string) {
    const config = `
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domain};

    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # OCSP stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/letsencrypt/live/${domain}/chain.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    return 301 https://$server_name$request_uri;
}
`;
    
    // Write configuration
    await on(target)`
      echo '${config}' > /etc/nginx/sites-available/${domain} &&
      ln -sf /etc/nginx/sites-available/${domain} /etc/nginx/sites-enabled/ &&
      nginx -t &&
      systemctl reload nginx
    `;
    
    console.log(`✅ Nginx configured for ${domain} on ${target}`);
  }

  // Get DNS plugin name for provider
  private getDnsPlugin(provider: string): string {
    const plugins: Record<string, string> = {
      cloudflare: 'cloudflare',
      route53: 'route53',
      digitalocean: 'digitalocean',
      google: 'google',
      azure: 'azure'
    };
    return plugins[provider] || provider;
  }
}

interface CertStatus {
  name: string;
  domains: string[];
  expiryDate: Date;
  daysLeft: number;
  needsRenewal: boolean;
}

// Usage
const certManager = new CertificateManager(
  'admin@example.com',
  ['example.com', 'www.example.com'],
  '/var/www/html'
);

// Setup and generate certificates
await certManager.setupCertbot('web-1');
await certManager.generateCertificate('web-1', 'example.com');
await certManager.configureNginx('web-1', 'example.com');
```

### 2. Automated Renewal Workflow

```typescript
// auto-renew.ts
import { $, on } from '@xec-sh/core';
import { schedule } from 'node-cron';

class AutoRenewal {
  private jobs: Map<string, any> = new Map();
  
  // Schedule daily renewal checks
  scheduleRenewal(target: string, time: string = '0 2 * * *') {
    const job = schedule(time, async () => {
      await this.checkAndRenew(target);
    });
    
    this.jobs.set(target, job);
    console.log(`📅 Scheduled renewal checks for ${target} at ${time}`);
  }
  
  // Check and renew if needed
  async checkAndRenew(target: string) {
    console.log(`🔍 Checking certificates on ${target}...`);
    
    // Check expiration
    const result = await on(target)`
      certbot certificates 2>/dev/null | grep "INVALID\\|Expiry" || echo "CHECK_NEEDED"
    `;
    
    if (result.stdout.includes('CHECK_NEEDED') || result.stdout.includes('INVALID')) {
      console.log(`⚠️ Certificate renewal needed on ${target}`);
      
      // Attempt renewal
      const renewResult = await on(target)`
        certbot renew --quiet --no-self-upgrade
      `;
      
      if (renewResult.exitCode === 0) {
        console.log(`✅ Certificates renewed on ${target}`);
        
        // Reload services
        await this.reloadServices(target);
        
        // Send notification
        await this.notifyRenewal(target, 'success');
      } else {
        console.error(`❌ Renewal failed on ${target}`);
        await this.notifyRenewal(target, 'failure', renewResult.stderr);
      }
    } else {
      console.log(`✅ Certificates valid on ${target}`);
    }
  }
  
  // Reload web services
  async reloadServices(target: string) {
    const services = ['nginx', 'apache2', 'httpd'];
    
    for (const service of services) {
      const checkResult = await on(target)`
        systemctl is-active ${service} 2>/dev/null || echo "inactive"
      `;
      
      if (!checkResult.stdout.includes('inactive')) {
        await on(target)`systemctl reload ${service}`;
        console.log(`🔄 Reloaded ${service} on ${target}`);
      }
    }
  }
  
  // Send renewal notifications
  async notifyRenewal(target: string, status: 'success' | 'failure', error?: string) {
    const message = status === 'success'
      ? `✅ SSL certificates renewed successfully on ${target}`
      : `❌ SSL certificate renewal failed on ${target}: ${error}`;
    
    // Send email notification
    if (process.env.SMTP_HOST) {
      await on('localhost')`
        echo "${message}" | \
        mail -s "SSL Certificate Renewal - ${status}" \
        -r "ssl-monitor@example.com" \
        ops@example.com
      `;
    }
    
    // Send Slack notification
    if (process.env.SLACK_WEBHOOK) {
      await fetch(process.env.SLACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          color: status === 'success' ? 'good' : 'danger'
        })
      });
    }
  }
  
  // Stop all scheduled jobs
  stopAll() {
    for (const [target, job] of this.jobs) {
      job.stop();
      console.log(`🛑 Stopped renewal checks for ${target}`);
    }
    this.jobs.clear();
  }
}

// Setup auto-renewal for all servers
const autoRenew = new AutoRenewal();
const servers = ['web-1', 'web-2', 'api-1', 'api-2'];

for (const server of servers) {
  autoRenew.scheduleRenewal(server, '0 2 * * *'); // 2 AM daily
}
```

### 3. Multi-Domain Certificate Management

```typescript
// multi-domain-certs.ts
import { $ } from '@xec-sh/core';

interface DomainConfig {
  primary: string;
  aliases: string[];
  webroot: string;
  servers: string[];
}

class MultiDomainCertManager {
  async setupMultiDomain(config: DomainConfig) {
    const domains = [config.primary, ...config.aliases].join(',');
    
    // Generate multi-domain certificate
    const result = await $.ssh(config.servers[0])`
      certbot certonly \
        --webroot \
        --webroot-path ${config.webroot} \
        --email admin@${config.primary} \
        --agree-tos \
        --no-eff-email \
        --domains ${domains} \
        --cert-name ${config.primary} \
        --non-interactive
    `;
    
    if (result.exitCode === 0) {
      // Deploy to all servers
      for (let i = 1; i < config.servers.length; i++) {
        await this.syncCertificate(
          config.servers[0],
          config.servers[i],
          config.primary
        );
      }
      
      // Configure all domains
      for (const server of config.servers) {
        for (const domain of [config.primary, ...config.aliases]) {
          await this.configureVirtualHost(server, domain, config.primary);
        }
      }
    }
  }
  
  async syncCertificate(source: string, target: string, certName: string) {
    // Sync certificate files
    await $.copy(
      `${source}:/etc/letsencrypt/archive/${certName}`,
      `${target}:/etc/letsencrypt/archive/${certName}`
    );
    
    await $.copy(
      `${source}:/etc/letsencrypt/live/${certName}`,
      `${target}:/etc/letsencrypt/live/${certName}`
    );
    
    await $.copy(
      `${source}:/etc/letsencrypt/renewal/${certName}.conf`,
      `${target}:/etc/letsencrypt/renewal/${certName}.conf`
    );
  }
  
  async configureVirtualHost(server: string, domain: string, certName: string) {
    const config = `
server {
    listen 443 ssl http2;
    server_name ${domain};
    
    ssl_certificate /etc/letsencrypt/live/${certName}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${certName}/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
    }
}
`;
    
    await $.ssh(server)`
      echo '${config}' > /etc/nginx/sites-available/${domain} &&
      ln -sf /etc/nginx/sites-available/${domain} /etc/nginx/sites-enabled/
    `;
  }
}

// Example usage
const multiDomain = new MultiDomainCertManager();
await multiDomain.setupMultiDomain({
  primary: 'example.com',
  aliases: ['www.example.com', 'api.example.com', 'admin.example.com'],
  webroot: '/var/www/html',
  servers: ['web-1', 'web-2', 'web-3']
});
```

### 4. Certificate Monitoring Dashboard

```typescript
// cert-monitor.ts
import { $ } from '@xec-sh/core';
import express from 'express';

class CertificateMonitor {
  private app = express();
  
  async startDashboard(port: number = 3001) {
    // API endpoint for certificate status
    this.app.get('/api/certificates', async (req, res) => {
      const certificates = await this.getAllCertificates();
      res.json(certificates);
    });
    
    // HTML dashboard
    this.app.get('/', (req, res) => {
      res.send(this.getDashboardHTML());
    });
    
    this.app.listen(port, () => {
      console.log(`📊 Certificate dashboard running on http://localhost:${port}`);
    });
  }
  
  async getAllCertificates() {
    const servers = ['web-1', 'web-2', 'api-1'];
    const allCerts = [];
    
    for (const server of servers) {
      const certs = await this.getServerCertificates(server);
      allCerts.push(...certs.map(c => ({ ...c, server })));
    }
    
    return allCerts;
  }
  
  async getServerCertificates(server: string) {
    const result = await $.ssh(server)`
      echo "[]" | openssl s_client -servername localhost -connect localhost:443 2>/dev/null | \
      openssl x509 -noout -dates -subject -issuer 2>/dev/null || echo "NO_CERT"
    `;
    
    if (result.stdout.includes('NO_CERT')) {
      return [];
    }
    
    // Parse certificate details
    const lines = result.stdout.split('\n');
    const notBefore = lines.find(l => l.startsWith('notBefore='))?.split('=')[1];
    const notAfter = lines.find(l => l.startsWith('notAfter='))?.split('=')[1];
    const subject = lines.find(l => l.startsWith('subject='))?.split('=').slice(1).join('=');
    
    const expiryDate = new Date(notAfter);
    const daysLeft = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    return [{
      subject,
      notBefore: new Date(notBefore),
      notAfter: expiryDate,
      daysLeft,
      status: daysLeft > 30 ? 'valid' : daysLeft > 7 ? 'warning' : 'critical'
    }];
  }
  
  getDashboardHTML() {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Certificate Monitor</title>
    <style>
        body { font-family: Arial; margin: 20px; }
        .certificate { border: 1px solid #ddd; padding: 10px; margin: 10px 0; }
        .valid { border-left: 5px solid green; }
        .warning { border-left: 5px solid orange; }
        .critical { border-left: 5px solid red; }
    </style>
</head>
<body>
    <h1>SSL Certificate Status</h1>
    <div id="certificates"></div>
    <script>
        async function loadCertificates() {
            const response = await fetch('/api/certificates');
            const certificates = await response.json();
            
            const html = certificates.map(cert => \`
                <div class="certificate \${cert.status}">
                    <h3>\${cert.server}</h3>
                    <p>Subject: \${cert.subject}</p>
                    <p>Expires: \${new Date(cert.notAfter).toLocaleDateString()}</p>
                    <p>Days Left: \${cert.daysLeft}</p>
                    <p>Status: \${cert.status.toUpperCase()}</p>
                </div>
            \`).join('');
            
            document.getElementById('certificates').innerHTML = html;
        }
        
        loadCertificates();
        setInterval(loadCertificates, 60000); // Refresh every minute
    </script>
</body>
</html>
    `;
  }
}

// Start monitoring dashboard
const monitor = new CertificateMonitor();
await monitor.startDashboard(3001);
```

### 5. Configuration File

```yaml
# .xec/ssl-config.yaml
ssl:
  email: admin@example.com
  provider: letsencrypt
  
  domains:
    - name: example.com
      type: standard
      aliases:
        - www.example.com
      servers:
        - web-1
        - web-2
      webroot: /var/www/html
      
    - name: "*.api.example.com"
      type: wildcard
      dns_provider: cloudflare
      servers:
        - api-1
        - api-2
        
  renewal:
    schedule: "0 2 * * *"  # 2 AM daily
    days_before_expiry: 30
    retry_attempts: 3
    
  notifications:
    email:
      to: ops@example.com
      from: ssl-monitor@example.com
    slack:
      webhook: ${SLACK_WEBHOOK}
      channel: "#ops"
      
  monitoring:
    enabled: true
    port: 3001
    check_interval: 3600  # 1 hour
```

### 6. Xec Task Configuration

```yaml
# .xec/config.yaml
tasks:
  ssl:setup:
    description: Initial SSL setup for a domain
    params:
      - name: domain
        required: true
      - name: server
        required: true
    command: |
      xec run scripts/cert-manager.ts setup \
        --domain=${params.domain} \
        --server=${params.server}
        
  ssl:renew:
    description: Manually renew certificates
    params:
      - name: force
        default: false
    command: |
      xec run scripts/cert-manager.ts renew \
        --force=${params.force}
        
  ssl:monitor:
    description: Start certificate monitoring dashboard
    command: xec run scripts/cert-monitor.ts
    daemon: true
    
  ssl:check:
    description: Check certificate expiration
    command: |
      xec on "web-*,api-*" "certbot certificates"
```

## Best Practices

### 1. Security
- **Private key protection**: Keep private keys with 600 permissions
- **Secure transfer**: Use SSH/SCP for certificate distribution
- **DNS validation**: Use for wildcard certificates
- **HSTS headers**: Enable HTTP Strict Transport Security

### 2. Automation
- **Regular checks**: Schedule daily certificate checks
- **Early renewal**: Renew 30 days before expiration
- **Automated deployment**: Sync certificates across servers
- **Service reload**: Gracefully reload services after renewal

### 3. Monitoring
- **Expiration tracking**: Monitor days until expiration
- **Multi-channel alerts**: Email + Slack + PagerDuty
- **Dashboard visibility**: Central monitoring dashboard
- **Audit logging**: Track all certificate operations

## Common Patterns

### Pre/Post Renewal Hooks
```bash
# Pre-renewal hook
certbot renew --pre-hook "service nginx stop" \
              --post-hook "service nginx start"

# Deploy hook for certificate distribution
certbot renew --deploy-hook "/usr/local/bin/deploy-cert.sh"
```

### Load Balancer Certificate Updates
```typescript
// Update load balancer certificates
async function updateLoadBalancer() {
  // HAProxy
  await $`cat /etc/letsencrypt/live/example.com/fullchain.pem \
            /etc/letsencrypt/live/example.com/privkey.pem > \
            /etc/haproxy/certs/example.com.pem`;
  
  await $`systemctl reload haproxy`;
}
```

## Troubleshooting

### Common Issues

1. **Renewal failures**: Check firewall rules for port 80/443
2. **DNS validation errors**: Verify DNS propagation
3. **Permission denied**: Ensure certbot runs as root
4. **Rate limits**: Let's Encrypt has rate limits, use staging for testing

## Related Topics

- [Health Checks](./health-checks.md) - Monitor SSL endpoints
- [Backup & Restore](./backup-restore.md) - Backup certificates
- [GitHub Actions](../integration/github-actions.md) - CI/CD certificate deployment
- [Docker Deployment](../deployment/docker-deploy.md) - Containerized SSL