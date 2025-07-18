# Xec Standard Library Examples

This document provides practical examples of using the Xec standard library for common DevOps and infrastructure automation tasks.

## Table of Contents

1. [Web Application Deployment](#web-application-deployment)
2. [Database Setup and Management](#database-setup-and-management)
3. [SSL Certificate Management](#ssl-certificate-management)
4. [Backup and Restore](#backup-and-restore)
5. [Monitoring Setup](#monitoring-setup)
6. [Docker Container Management](#docker-container-management)
7. [Multi-Environment Deployment](#multi-environment-deployment)
8. [System Hardening](#system-hardening)
9. [Log Collection and Analysis](#log-collection-and-analysis)
10. [CI/CD Pipeline Tasks](#cicd-pipeline-tasks)

## Web Application Deployment

### Deploy Node.js Application

```typescript
import { task } from '@xec-js/core';

export const deployNodeApp = task('deploy-node-app')
  .description('Deploy Node.js application with PM2')
  .vars({
    appName: { required: true },
    repo: { required: true },
    branch: { default: 'main' },
    port: { default: 3000 }
  })
  .run(async ({ $, fs, pkg, svc, net, env, log, vars }) => {
    const appDir = `/var/apps/${vars.appName}`;
    
    // Install dependencies
    log.info('Installing system dependencies...');
    await pkg.install('git', 'nodejs', 'npm');
    
    // Install PM2 globally
    await $`npm install -g pm2`;
    
    // Clone or update repository
    if (await fs.exists(appDir)) {
      log.info('Updating existing repository...');
      await $`cd ${appDir} && git fetch && git checkout ${vars.branch} && git pull`;
    } else {
      log.info('Cloning repository...');
      await $`git clone -b ${vars.branch} ${vars.repo} ${appDir}`;
    }
    
    // Install app dependencies
    log.info('Installing application dependencies...');
    await $`cd ${appDir} && npm ci --production`;
    
    // Setup environment
    await fs.write(`${appDir}/.env`, `
NODE_ENV=production
PORT=${vars.port}
APP_NAME=${vars.appName}
`);
    
    // Start/restart with PM2
    log.info('Starting application with PM2...');
    const pm2Config = {
      name: vars.appName,
      script: 'server.js',
      cwd: appDir,
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: vars.port
      }
    };
    
    await fs.write(`${appDir}/ecosystem.config.js`, 
      `module.exports = ${JSON.stringify({ apps: [pm2Config] }, null, 2)}`);
    
    await $`cd ${appDir} && pm2 startOrRestart ecosystem.config.js`;
    
    // Wait for app to be ready
    log.info('Waiting for application to be ready...');
    await net.waitForPort('localhost', vars.port, 30000);
    
    // Save PM2 configuration
    await $`pm2 save`;
    await $`pm2 startup systemd -u ${await os.user()} --hp ${await os.home()}`;
    
    log.success(`Application ${vars.appName} deployed successfully!`);
  })
  .build();
```

### Setup Nginx Reverse Proxy

```typescript
export const setupNginxProxy = task('setup-nginx-proxy')
  .description('Configure Nginx as reverse proxy')
  .vars({
    domain: { required: true },
    upstream: { required: true },
    ssl: { default: true }
  })
  .run(async ({ $, fs, pkg, svc, log, vars }) => {
    // Install Nginx
    await pkg.install('nginx');
    
    // Create site configuration
    const siteConfig = `
server {
    listen 80;
    server_name ${vars.domain};
    
    ${vars.ssl ? `
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${vars.domain};
    
    # SSL configuration will be added by certbot
    ` : ''}
    
    # Proxy configuration
    location / {
        proxy_pass ${vars.upstream};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}`;
    
    // Write configuration
    await fs.write(`/etc/nginx/sites-available/${vars.domain}`, siteConfig);
    
    // Enable site
    await $`ln -sf /etc/nginx/sites-available/${vars.domain} /etc/nginx/sites-enabled/`;
    
    // Test configuration
    await $`nginx -t`;
    
    // Reload Nginx
    await svc.reload('nginx');
    
    // Setup SSL if requested
    if (vars.ssl) {
      await pkg.install('certbot', 'python3-certbot-nginx');
      await $`certbot --nginx -d ${vars.domain} --non-interactive --agree-tos --email admin@${vars.domain}`;
    }
    
    log.success(`Nginx proxy configured for ${vars.domain}`);
  })
  .build();
```

## Database Setup and Management

### PostgreSQL Setup

```typescript
export const setupPostgres = task('setup-postgres')
  .description('Install and configure PostgreSQL')
  .vars({
    version: { default: '14' },
    dbName: { required: true },
    dbUser: { required: true },
    dbPassword: { required: true, secret: true }
  })
  .run(async ({ $, fs, pkg, svc, log, vars }) => {
    // Install PostgreSQL
    log.info(`Installing PostgreSQL ${vars.version}...`);
    await pkg.install(`postgresql-${vars.version}`, 'postgresql-contrib');
    
    // Start and enable service
    await svc.start('postgresql');
    await svc.enable('postgresql');
    
    // Wait for PostgreSQL to be ready
    await time.sleep(2000);
    
    // Create user and database
    log.info('Creating database and user...');
    await $`sudo -u postgres psql -c "CREATE USER ${vars.dbUser} WITH PASSWORD '${vars.dbPassword}';"`;
    await $`sudo -u postgres psql -c "CREATE DATABASE ${vars.dbName} OWNER ${vars.dbUser};"`;
    await $`sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${vars.dbName} TO ${vars.dbUser};"`;
    
    // Configure PostgreSQL for remote connections
    const pgVersion = vars.version;
    const configPath = `/etc/postgresql/${pgVersion}/main`;
    
    // Update postgresql.conf
    const pgConf = await fs.read(`${configPath}/postgresql.conf`);
    const updatedConf = pgConf.replace(
      "#listen_addresses = 'localhost'",
      "listen_addresses = '*'"
    );
    await fs.write(`${configPath}/postgresql.conf`, updatedConf);
    
    // Update pg_hba.conf
    await fs.append(`${configPath}/pg_hba.conf`, `
# Allow connections from Docker network
host    all             all             172.16.0.0/12           md5
# Allow connections from private network
host    all             all             10.0.0.0/8              md5
`);
    
    // Restart PostgreSQL
    await svc.restart('postgresql');
    
    log.success('PostgreSQL setup completed!');
  })
  .build();
```

### Database Backup

```typescript
export const backupDatabase = task('backup-database')
  .description('Backup PostgreSQL database')
  .vars({
    dbName: { required: true },
    backupPath: { default: '/var/backups/postgres' },
    s3Bucket: { required: false }
  })
  .run(async ({ $, fs, time, crypto, log, vars }) => {
    // Create backup directory
    await fs.mkdir(vars.backupPath, { recursive: true });
    
    // Generate backup filename
    const timestamp = time.format(time.now(), 'YYYY-MM-DD-HHmmss');
    const backupFile = `${vars.backupPath}/${vars.dbName}-${timestamp}.sql.gz`;
    
    // Perform backup
    log.info(`Backing up database ${vars.dbName}...`);
    await $`pg_dump ${vars.dbName} | gzip > ${backupFile}`;
    
    // Calculate checksum
    const checksum = await crypto.sha256(await fs.read(backupFile));
    await fs.write(`${backupFile}.sha256`, checksum);
    
    // Upload to S3 if configured
    if (vars.s3Bucket) {
      log.info('Uploading backup to S3...');
      await $`aws s3 cp ${backupFile} s3://${vars.s3Bucket}/postgres-backups/`;
      await $`aws s3 cp ${backupFile}.sha256 s3://${vars.s3Bucket}/postgres-backups/`;
    }
    
    // Clean old local backups (keep last 7 days)
    log.info('Cleaning old backups...');
    await $`find ${vars.backupPath} -name "*.sql.gz" -mtime +7 -delete`;
    
    const size = (await fs.stat(backupFile)).size;
    log.success(`Backup completed: ${backupFile} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  })
  .build();
```

## SSL Certificate Management

### Let's Encrypt with Auto-Renewal

```typescript
export const setupLetsEncrypt = task('setup-letsencrypt')
  .description('Setup Let\'s Encrypt SSL certificates with auto-renewal')
  .vars({
    domains: { required: true, type: 'array' },
    email: { required: true },
    webroot: { default: '/var/www/html' }
  })
  .run(async ({ $, fs, pkg, time, log, vars }) => {
    // Install certbot
    await pkg.install('certbot');
    
    // Create webroot directory
    await fs.mkdir(vars.webroot, { recursive: true });
    
    // Obtain certificates
    for (const domain of vars.domains) {
      log.info(`Obtaining certificate for ${domain}...`);
      
      try {
        await $`certbot certonly \
          --webroot \
          --webroot-path ${vars.webroot} \
          --domain ${domain} \
          --non-interactive \
          --agree-tos \
          --email ${vars.email}`;
        
        log.success(`Certificate obtained for ${domain}`);
      } catch (error) {
        log.error(`Failed to obtain certificate for ${domain}: ${error.message}`);
      }
    }
    
    // Setup auto-renewal cron job
    const renewScript = `#!/bin/bash
# Renew certificates
certbot renew --quiet --no-self-upgrade

# Reload services that use certificates
systemctl reload nginx 2>/dev/null || true
systemctl reload apache2 2>/dev/null || true
systemctl reload haproxy 2>/dev/null || true
`;
    
    await fs.write('/etc/cron.daily/certbot-renew', renewScript);
    await fs.chmod('/etc/cron.daily/certbot-renew', '755');
    
    // Test renewal
    await $`certbot renew --dry-run`;
    
    log.success('Let\'s Encrypt setup completed with auto-renewal');
  })
  .build();
```

## Backup and Restore

### Full System Backup

```typescript
export const systemBackup = task('system-backup')
  .description('Perform full system backup')
  .vars({
    excludeDirs: { 
      default: ['/proc', '/sys', '/tmp', '/dev', '/mnt', '/media', '/lost+found'] 
    },
    destination: { required: true },
    compress: { default: true }
  })
  .run(async ({ $, fs, time, os, log, vars }) => {
    const hostname = await os.hostname();
    const timestamp = time.format(time.now(), 'YYYY-MM-DD-HHmmss');
    const backupName = `${hostname}-${timestamp}`;
    
    // Create exclude file
    const excludeFile = '/tmp/backup-exclude.txt';
    await fs.write(excludeFile, vars.excludeDirs.join('\n'));
    
    // Prepare backup command
    let backupCmd = `tar --exclude-from=${excludeFile}`;
    
    if (vars.compress) {
      backupCmd += ' -czf';
      vars.destination = `${vars.destination}/${backupName}.tar.gz`;
    } else {
      backupCmd += ' -cf';
      vars.destination = `${vars.destination}/${backupName}.tar`;
    }
    
    backupCmd += ` ${vars.destination} /`;
    
    // Perform backup
    log.info('Starting system backup...');
    const startTime = time.now();
    
    await $`${backupCmd}`;
    
    const duration = time.diff(startTime, time.now());
    const size = (await fs.stat(vars.destination)).size;
    
    log.success(`Backup completed in ${duration.minutes}m ${duration.seconds}s`);
    log.info(`Backup size: ${(size / 1024 / 1024 / 1024).toFixed(2)} GB`);
    
    // Create backup metadata
    const metadata = {
      hostname,
      timestamp: timestamp,
      duration: duration,
      size: size,
      compressed: vars.compress,
      excludedDirs: vars.excludeDirs
    };
    
    await json.write(`${vars.destination}.meta.json`, metadata);
  })
  .build();
```

### Application Data Sync

```typescript
export const syncAppData = task('sync-app-data')
  .description('Sync application data between environments')
  .vars({
    source: { required: true },
    destination: { required: true },
    exclude: { default: ['*.log', '*.tmp', 'node_modules', '.git'] }
  })
  .run(async ({ $, env, net, log, vars }) => {
    // Determine sync method based on environment
    const sourceEnv = env.type;
    
    if (sourceEnv === 'local') {
      // Local to remote
      log.info('Syncing from local to remote...');
      await $`rsync -avz \
        ${vars.exclude.map(e => `--exclude='${e}'`).join(' ')} \
        ${vars.source}/ \
        ${vars.destination}/`;
    } else if (sourceEnv === 'ssh') {
      // Remote to remote or remote to local
      log.info('Syncing via SSH...');
      await $`rsync -avz \
        ${vars.exclude.map(e => `--exclude='${e}'`).join(' ')} \
        ${vars.source}/ \
        ${vars.destination}/`;
    } else if (sourceEnv === 'docker') {
      // Docker volume sync
      log.info('Syncing Docker volumes...');
      await $`docker run --rm \
        -v ${vars.source}:/source:ro \
        -v ${vars.destination}:/dest \
        alpine \
        sh -c "cd /source && tar cf - . | (cd /dest && tar xf -)"`;
    }
    
    log.success('Data sync completed');
  })
  .build();
```

## Monitoring Setup

### Prometheus and Grafana Stack

```typescript
export const setupMonitoring = task('setup-monitoring')
  .description('Setup Prometheus and Grafana monitoring stack')
  .vars({
    prometheusPort: { default: 9090 },
    grafanaPort: { default: 3000 },
    nodeExporterPort: { default: 9100 }
  })
  .run(async ({ $, fs, yaml, svc, net, log, vars }) => {
    // Create monitoring directory
    const monitoringDir = '/opt/monitoring';
    await fs.mkdir(monitoringDir, { recursive: true });
    
    // Install Node Exporter
    log.info('Installing Node Exporter...');
    await $`
      wget https://github.com/prometheus/node_exporter/releases/download/v1.5.0/node_exporter-1.5.0.linux-amd64.tar.gz
      tar xzf node_exporter-1.5.0.linux-amd64.tar.gz
      cp node_exporter-1.5.0.linux-amd64/node_exporter /usr/local/bin/
      rm -rf node_exporter-1.5.0.linux-amd64*
    `;
    
    // Create Node Exporter service
    await fs.write('/etc/systemd/system/node_exporter.service', `
[Unit]
Description=Node Exporter
After=network.target

[Service]
User=prometheus
Group=prometheus
Type=simple
ExecStart=/usr/local/bin/node_exporter

[Install]
WantedBy=multi-user.target
`);
    
    // Create Prometheus configuration
    const prometheusConfig = {
      global: {
        scrape_interval: '15s',
        evaluation_interval: '15s'
      },
      scrape_configs: [
        {
          job_name: 'prometheus',
          static_configs: [{
            targets: [`localhost:${vars.prometheusPort}`]
          }]
        },
        {
          job_name: 'node',
          static_configs: [{
            targets: [`localhost:${vars.nodeExporterPort}`]
          }]
        }
      ]
    };
    
    await yaml.write(`${monitoringDir}/prometheus.yml`, prometheusConfig);
    
    // Create docker-compose for Prometheus and Grafana
    const dockerCompose = {
      version: '3.8',
      services: {
        prometheus: {
          image: 'prom/prometheus:latest',
          container_name: 'prometheus',
          volumes: [
            `${monitoringDir}/prometheus.yml:/etc/prometheus/prometheus.yml`,
            'prometheus_data:/prometheus'
          ],
          command: [
            '--config.file=/etc/prometheus/prometheus.yml',
            '--storage.tsdb.path=/prometheus',
            '--web.console.libraries=/usr/share/prometheus/console_libraries',
            '--web.console.templates=/usr/share/prometheus/consoles',
            '--web.enable-lifecycle'
          ],
          ports: [`${vars.prometheusPort}:9090`],
          restart: 'unless-stopped'
        },
        grafana: {
          image: 'grafana/grafana:latest',
          container_name: 'grafana',
          volumes: [
            'grafana_data:/var/lib/grafana',
            `${monitoringDir}/grafana/provisioning:/etc/grafana/provisioning`
          ],
          environment: {
            GF_SECURITY_ADMIN_USER: 'admin',
            GF_SECURITY_ADMIN_PASSWORD: 'admin',
            GF_INSTALL_PLUGINS: 'grafana-piechart-panel'
          },
          ports: [`${vars.grafanaPort}:3000`],
          restart: 'unless-stopped'
        }
      },
      volumes: {
        prometheus_data: {},
        grafana_data: {}
      }
    };
    
    await yaml.write(`${monitoringDir}/docker-compose.yml`, dockerCompose);
    
    // Start services
    await $`cd ${monitoringDir} && docker-compose up -d`;
    
    // Start Node Exporter
    await svc.start('node_exporter');
    await svc.enable('node_exporter');
    
    // Wait for services to be ready
    await net.waitForPort('localhost', vars.prometheusPort);
    await net.waitForPort('localhost', vars.grafanaPort);
    
    log.success('Monitoring stack setup completed!');
    log.info(`Prometheus: http://localhost:${vars.prometheusPort}`);
    log.info(`Grafana: http://localhost:${vars.grafanaPort} (admin/admin)`);
  })
  .build();
```

## Docker Container Management

### Docker Swarm Deployment

```typescript
export const deploySwarm = task('deploy-swarm')
  .description('Deploy application to Docker Swarm')
  .vars({
    stackName: { required: true },
    composePath: { required: true },
    registry: { required: false }
  })
  .run(async ({ $, fs, yaml, env, log, vars }) => {
    // Initialize Swarm if needed
    try {
      await $`docker swarm init`;
    } catch {
      log.info('Swarm already initialized');
    }
    
    // Login to registry if provided
    if (vars.registry) {
      log.info(`Logging into registry ${vars.registry}...`);
      await $`docker login ${vars.registry}`;
    }
    
    // Read and modify compose file for Swarm
    const compose = await yaml.read(vars.composePath);
    
    // Add deploy configuration for each service
    for (const [name, service] of Object.entries(compose.services)) {
      service.deploy = service.deploy || {};
      service.deploy.replicas = service.deploy.replicas || 2;
      service.deploy.update_config = {
        parallelism: 1,
        delay: '10s',
        failure_action: 'rollback'
      };
      service.deploy.restart_policy = {
        condition: 'on-failure',
        delay: '5s',
        max_attempts: 3
      };
    }
    
    // Save modified compose file
    const swarmComposePath = `/tmp/${vars.stackName}-swarm.yml`;
    await yaml.write(swarmComposePath, compose);
    
    // Deploy stack
    log.info(`Deploying stack ${vars.stackName}...`);
    await $`docker stack deploy -c ${swarmComposePath} ${vars.stackName}`;
    
    // Wait for services to be ready
    await time.sleep(5000);
    
    // Check service status
    const services = await $`docker stack services ${vars.stackName}`;
    log.info('Deployed services:');
    log.info(services);
    
    // Cleanup
    await fs.rm(swarmComposePath);
    
    log.success(`Stack ${vars.stackName} deployed successfully!`);
  })
  .build();
```

## Multi-Environment Deployment

### Progressive Deployment Pipeline

```typescript
export const progressiveDeployment = task('progressive-deployment')
  .description('Deploy application progressively across environments')
  .vars({
    app: { required: true },
    version: { required: true },
    environments: { 
      default: ['dev', 'staging', 'production'] 
    }
  })
  .run(async ({ $, env, http, time, log, vars }) => {
    const results = {};
    
    for (const targetEnv of vars.environments) {
      log.info(`Deploying to ${targetEnv}...`);
      
      try {
        // Environment-specific deployment
        switch (targetEnv) {
          case 'dev':
            await deployToDev(vars);
            break;
          
          case 'staging':
            await deployToStaging(vars);
            break;
          
          case 'production':
            // Require manual confirmation for production
            if (await confirm('Deploy to production?')) {
              await deployToProduction(vars);
            } else {
              log.warn('Production deployment cancelled');
              break;
            }
            break;
        }
        
        // Health check
        const healthUrl = getHealthUrl(targetEnv, vars.app);
        await time.sleep(10000); // Wait for deployment
        
        const health = await http.get(healthUrl, { 
          retry: 3,
          timeout: 5000 
        });
        
        if (health.status === 200) {
          results[targetEnv] = 'success';
          log.success(`${targetEnv} deployment successful`);
        } else {
          throw new Error(`Health check failed: ${health.status}`);
        }
        
      } catch (error) {
        results[targetEnv] = 'failed';
        log.error(`${targetEnv} deployment failed: ${error.message}`);
        
        // Stop pipeline on failure
        if (targetEnv !== 'dev') {
          throw new Error('Deployment pipeline halted due to failure');
        }
      }
      
      // Wait between environments
      if (targetEnv !== vars.environments[vars.environments.length - 1]) {
        log.info('Waiting before next environment...');
        await time.sleep(30000);
      }
    }
    
    // Summary
    log.info('Deployment Summary:');
    for (const [env, status] of Object.entries(results)) {
      log.info(`  ${env}: ${status}`);
    }
  })
  .build();

// Helper functions
async function deployToDev(vars) {
  await $`kubectl set image deployment/${vars.app} ${vars.app}=${vars.app}:${vars.version} -n dev`;
  await $`kubectl rollout status deployment/${vars.app} -n dev`;
}

async function deployToStaging(vars) {
  await $`kubectl set image deployment/${vars.app} ${vars.app}=${vars.app}:${vars.version} -n staging`;
  await $`kubectl rollout status deployment/${vars.app} -n staging`;
}

async function deployToProduction(vars) {
  // Blue-green deployment for production
  await $`kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: ${vars.app}-green
  namespace: production
spec:
  selector:
    app: ${vars.app}
    version: ${vars.version}
  ports:
  - port: 80
    targetPort: 8080
EOF`;
  
  await $`kubectl set image deployment/${vars.app}-green ${vars.app}=${vars.app}:${vars.version} -n production`;
  await $`kubectl rollout status deployment/${vars.app}-green -n production`;
  
  // Switch traffic
  await $`kubectl patch service ${vars.app} -n production -p '{"spec":{"selector":{"version":"${vars.version}"}}}'`;
}
```

## System Hardening

### Security Hardening Script

```typescript
export const hardenSystem = task('harden-system')
  .description('Apply security hardening to system')
  .vars({
    sshPort: { default: 22 },
    allowUsers: { type: 'array', default: [] }
  })
  .run(async ({ $, fs, pkg, svc, log, vars }) => {
    log.info('Starting system hardening...');
    
    // Update system
    await pkg.update();
    await pkg.upgrade();
    
    // Install security tools
    await pkg.install('fail2ban', 'ufw', 'unattended-upgrades');
    
    // Configure SSH
    log.info('Hardening SSH configuration...');
    const sshConfig = `
# Security hardening
Port ${vars.sshPort}
Protocol 2
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowUsers ${vars.allowUsers.join(' ')}

# Crypto hardening
Ciphers aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes192-ctr,aes128-ctr
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,hmac-sha2-512,hmac-sha2-256
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512
`;
    
    await fs.write('/etc/ssh/sshd_config.d/99-hardening.conf', sshConfig);
    
    // Configure firewall
    log.info('Configuring firewall...');
    await $`ufw default deny incoming`;
    await $`ufw default allow outgoing`;
    await $`ufw allow ${vars.sshPort}/tcp`;
    await $`ufw allow 80/tcp`;
    await $`ufw allow 443/tcp`;
    await $`echo "y" | ufw enable`;
    
    // Configure fail2ban
    log.info('Configuring fail2ban...');
    const fail2banConfig = `
[sshd]
enabled = true
port = ${vars.sshPort}
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 5
bantime = 600
`;
    
    await fs.write('/etc/fail2ban/jail.local', fail2banConfig);
    
    // Kernel hardening
    log.info('Applying kernel hardening...');
    const sysctlConfig = `
# IP Spoofing protection
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0

# Ignore send redirects
net.ipv4.conf.all.send_redirects = 0

# Disable source packet routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# Log Martians
net.ipv4.conf.all.log_martians = 1

# Ignore ICMP ping requests
net.ipv4.icmp_echo_ignore_broadcasts = 1

# Ignore Directed pings
net.ipv4.icmp_ignore_bogus_error_responses = 1

# Accept IP source route packets
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# TCP/IP stack hardening
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2
net.ipv4.tcp_syn_retries = 5
`;
    
    await fs.write('/etc/sysctl.d/99-security.conf', sysctlConfig);
    await $`sysctl -p /etc/sysctl.d/99-security.conf`;
    
    // Restart services
    await svc.restart('ssh');
    await svc.restart('fail2ban');
    
    log.success('System hardening completed!');
  })
  .build();
```

## Log Collection and Analysis

### ELK Stack Setup

```typescript
export const setupELK = task('setup-elk')
  .description('Setup Elasticsearch, Logstash, and Kibana')
  .vars({
    elasticVersion: { default: '8.11.0' },
    elasticPassword: { required: true, secret: true }
  })
  .run(async ({ $, fs, yaml, net, log, vars }) => {
    const elkDir = '/opt/elk';
    await fs.mkdir(elkDir, { recursive: true });
    
    // Create docker-compose configuration
    const dockerCompose = {
      version: '3.8',
      services: {
        elasticsearch: {
          image: `docker.elastic.co/elasticsearch/elasticsearch:${vars.elasticVersion}`,
          container_name: 'elasticsearch',
          environment: {
            'discovery.type': 'single-node',
            'xpack.security.enabled': 'true',
            'ELASTIC_PASSWORD': vars.elasticPassword,
            'ES_JAVA_OPTS': '-Xms512m -Xmx512m'
          },
          volumes: [
            'elasticsearch_data:/usr/share/elasticsearch/data'
          ],
          ports: ['9200:9200', '9300:9300'],
          networks: ['elk']
        },
        
        logstash: {
          image: `docker.elastic.co/logstash/logstash:${vars.elasticVersion}`,
          container_name: 'logstash',
          volumes: [
            `${elkDir}/logstash/pipeline:/usr/share/logstash/pipeline`,
            `${elkDir}/logstash/config/logstash.yml:/usr/share/logstash/config/logstash.yml`
          ],
          ports: ['5514:5514/udp', '5000:5000/tcp', '9600:9600'],
          environment: {
            'LS_JAVA_OPTS': '-Xms256m -Xmx256m'
          },
          networks: ['elk'],
          depends_on: ['elasticsearch']
        },
        
        kibana: {
          image: `docker.elastic.co/kibana/kibana:${vars.elasticVersion}`,
          container_name: 'kibana',
          environment: {
            'ELASTICSEARCH_HOSTS': 'http://elasticsearch:9200',
            'ELASTICSEARCH_USERNAME': 'elastic',
            'ELASTICSEARCH_PASSWORD': vars.elasticPassword
          },
          ports: ['5601:5601'],
          networks: ['elk'],
          depends_on: ['elasticsearch']
        }
      },
      
      volumes: {
        elasticsearch_data: {
          driver: 'local'
        }
      },
      
      networks: {
        elk: {
          driver: 'bridge'
        }
      }
    };
    
    await yaml.write(`${elkDir}/docker-compose.yml`, dockerCompose);
    
    // Create Logstash configuration
    await fs.mkdir(`${elkDir}/logstash/config`, { recursive: true });
    await fs.mkdir(`${elkDir}/logstash/pipeline`, { recursive: true });
    
    await fs.write(`${elkDir}/logstash/config/logstash.yml`, `
http.host: "0.0.0.0"
xpack.monitoring.elasticsearch.hosts: [ "http://elasticsearch:9200" ]
xpack.monitoring.elasticsearch.username: elastic
xpack.monitoring.elasticsearch.password: ${vars.elasticPassword}
`);
    
    // Create Logstash pipeline
    await fs.write(`${elkDir}/logstash/pipeline/logstash.conf`, `
input {
  syslog {
    port => 5514
    type => "syslog"
  }
  
  tcp {
    port => 5000
    codec => json
    type => "application"
  }
}

filter {
  if [type] == "syslog" {
    grok {
      match => { "message" => "%{SYSLOGTIMESTAMP:syslog_timestamp} %{SYSLOGHOST:syslog_hostname} %{DATA:syslog_program}(?:\\[%{POSINT:syslog_pid}\\])?: %{GREEDYDATA:syslog_message}" }
    }
    date {
      match => [ "syslog_timestamp", "MMM  d HH:mm:ss", "MMM dd HH:mm:ss" ]
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    user => "elastic"
    password => "${vars.elasticPassword}"
    index => "%{type}-%{+YYYY.MM.dd}"
  }
}
`);
    
    // Start ELK stack
    log.info('Starting ELK stack...');
    await $`cd ${elkDir} && docker-compose up -d`;
    
    // Wait for services
    await net.waitForPort('localhost', 9200, 60000);
    await net.waitForPort('localhost', 5601, 60000);
    
    log.success('ELK stack setup completed!');
    log.info('Kibana: http://localhost:5601');
    log.info(`Username: elastic, Password: ${vars.elasticPassword}`);
  })
  .build();
```

## CI/CD Pipeline Tasks

### GitHub Actions Deployment

```typescript
export const deployFromGitHub = task('deploy-from-github')
  .description('Deploy application from GitHub Actions')
  .vars({
    repository: { required: true },
    branch: { default: 'main' },
    deployKey: { required: true, secret: true }
  })
  .run(async ({ $, fs, env, time, log, vars }) => {
    // Setup deployment directory
    const deployDir = `/opt/deployments/${vars.repository.split('/')[1]}`;
    await fs.mkdir(deployDir, { recursive: true });
    
    // Save deploy key
    const keyPath = '/tmp/deploy_key';
    await fs.write(keyPath, vars.deployKey);
    await fs.chmod(keyPath, '600');
    
    // Configure SSH for GitHub
    await fs.mkdir('/root/.ssh', { recursive: true });
    await fs.write('/root/.ssh/config', `
Host github.com
  HostName github.com
  User git
  IdentityFile ${keyPath}
  StrictHostKeyChecking no
`);
    
    // Clone or update repository
    if (await fs.exists(`${deployDir}/.git`)) {
      log.info('Updating repository...');
      await $`cd ${deployDir} && git fetch origin && git checkout ${vars.branch} && git pull`;
    } else {
      log.info('Cloning repository...');
      await $`git clone -b ${vars.branch} git@github.com:${vars.repository}.git ${deployDir}`;
    }
    
    // Run deployment script if exists
    if (await fs.exists(`${deployDir}/deploy.sh`)) {
      log.info('Running deployment script...');
      await $`cd ${deployDir} && chmod +x deploy.sh && ./deploy.sh`;
    } else if (await fs.exists(`${deployDir}/package.json`)) {
      // Node.js application
      log.info('Detected Node.js application...');
      await $`cd ${deployDir} && npm ci --production`;
      await $`cd ${deployDir} && npm run build || true`;
      await $`cd ${deployDir} && pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js`;
    } else if (await fs.exists(`${deployDir}/docker-compose.yml`)) {
      // Docker Compose application
      log.info('Detected Docker Compose application...');
      await $`cd ${deployDir} && docker-compose pull`;
      await $`cd ${deployDir} && docker-compose up -d`;
    }
    
    // Cleanup
    await fs.rm(keyPath);
    
    // Create deployment record
    const deploymentInfo = {
      repository: vars.repository,
      branch: vars.branch,
      timestamp: time.now(),
      commit: await $`cd ${deployDir} && git rev-parse HEAD`,
      deployer: env.get('GITHUB_ACTOR', 'manual')
    };
    
    await json.write(`${deployDir}/.deployment.json`, deploymentInfo);
    
    log.success('Deployment completed successfully!');
  })
  .build();
```

## Conclusion

These examples demonstrate the power and flexibility of the Xec standard library. The key principles are:

1. **Environment Awareness**: Code automatically adapts to different execution contexts
2. **Minimalism**: Simple, predictable APIs that do one thing well
3. **Composability**: Small utilities that combine into powerful workflows
4. **Error Handling**: Robust error handling with meaningful messages
5. **Idempotency**: Operations are safe to run multiple times

The standard library abstracts away environment-specific details while providing full control when needed. This allows you to write infrastructure code once and run it anywhere - from local development to production Kubernetes clusters.