---
sidebar_position: 1
title: Server Management
description: Manage multiple servers efficiently with Xec's SSH capabilities
---

# Server Management

Master server management at scale using Xec's powerful SSH adapter with connection pooling, parallel execution, and intelligent retry mechanisms.

## Overview

Xec transforms server management by providing:
- **Connection pooling** for efficient SSH connections
- **Parallel execution** across multiple servers
- **Automatic retry** with exponential backoff
- **Secure credential management**
- **Session persistence** and reuse

## Basic Server Operations

### Single Server Management

```typescript
// server/single-server.ts
import { $ } from '@xec-sh/core';

async function manageServer() {
  const server = $.ssh({
    host: 'server.example.com',
    username: 'admin',
    privateKey: '~/.ssh/id_rsa'
  });
  
  console.log('📊 Checking server status...');
  
  // System information
  const info = await server`uname -a`;
  console.log(`System: ${info.stdout}`);
  
  // Disk usage
  const disk = await server`df -h /`;
  console.log(`Disk usage:\n${disk.stdout}`);
  
  // Memory usage
  const memory = await server`free -h`;
  console.log(`Memory:\n${memory.stdout}`);
  
  // Running processes
  const processes = await server`ps aux | head -10`;
  console.log(`Top processes:\n${processes.stdout}`);
  
  // Service status
  const nginx = await server`systemctl status nginx`.nothrow();
  console.log(`Nginx: ${nginx.ok ? 'Running' : 'Stopped'}`);
}

await manageServer();
```

### Multiple Server Management

```typescript
// server/multi-server.ts
import { $ } from '@xec-sh/core';

class ServerFleet {
  private servers: Map<string, any> = new Map();
  
  constructor(private hosts: string[]) {
    // Initialize connections
    for (const host of hosts) {
      this.servers.set(host, $.ssh({
        host,
        username: 'admin',
        privateKey: '~/.ssh/id_rsa'
      }));
    }
  }
  
  async executeOnAll(command: string) {
    console.log(`🚀 Executing on ${this.hosts.length} servers: ${command}`);
    
    const results = await Promise.allSettled(
      Array.from(this.servers.entries()).map(async ([host, server]) => {
        const result = await server`${command}`;
        return { host, result };
      })
    );
    
    // Process results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { host, result: cmdResult } = result.value;
        console.log(`✅ ${host}: ${cmdResult.stdout.trim()}`);
      } else {
        console.error(`❌ Failed: ${result.reason}`);
      }
    }
  }
  
  async healthCheck() {
    console.log('🏥 Running health checks...');
    
    const checks = [
      { name: 'CPU Load', cmd: 'uptime | awk -F"load average:" \'{print $2}\'' },
      { name: 'Memory', cmd: 'free -h | grep Mem | awk \'{print $3"/"$2}\'' },
      { name: 'Disk', cmd: 'df -h / | tail -1 | awk \'{print $5}\'' },
      { name: 'Network', cmd: 'ping -c 1 google.com > /dev/null && echo "OK" || echo "FAIL"' }
    ];
    
    for (const check of checks) {
      console.log(`\n📊 ${check.name}:`);
      await this.executeOnAll(check.cmd);
    }
  }
  
  async updateAll() {
    console.log('🔄 Updating all servers...');
    
    // Update package lists
    await this.executeOnAll('sudo apt update');
    
    // Upgrade packages
    await this.executeOnAll('sudo apt upgrade -y');
    
    // Clean up
    await this.executeOnAll('sudo apt autoremove -y');
    
    console.log('✅ All servers updated!');
  }
}

// Usage
const fleet = new ServerFleet([
  'web1.example.com',
  'web2.example.com',
  'db1.example.com',
  'cache1.example.com'
]);

await fleet.healthCheck();
await fleet.updateAll();
```

## Connection Management

### Connection Pooling

```typescript
// server/connection-pool.ts
import { $ } from '@xec-sh/core';

class ConnectionPool {
  private connections: Map<string, any> = new Map();
  private lastUsed: Map<string, number> = new Map();
  private maxIdleTime = 300000; // 5 minutes
  
  async getConnection(config: any) {
    const key = `${config.host}:${config.username}`;
    
    // Check if connection exists and is still valid
    if (this.connections.has(key)) {
      const lastUsedTime = this.lastUsed.get(key) || 0;
      
      if (Date.now() - lastUsedTime < this.maxIdleTime) {
        console.log(`♻️ Reusing connection to ${config.host}`);
        this.lastUsed.set(key, Date.now());
        return this.connections.get(key);
      } else {
        console.log(`🔄 Connection expired, reconnecting to ${config.host}`);
        this.connections.delete(key);
      }
    }
    
    // Create new connection
    console.log(`🔗 Creating new connection to ${config.host}`);
    const connection = $.ssh(config);
    
    this.connections.set(key, connection);
    this.lastUsed.set(key, Date.now());
    
    return connection;
  }
  
  async closeAll() {
    console.log('🔌 Closing all connections...');
    
    for (const [key, connection] of this.connections) {
      await connection.close?.();
      this.connections.delete(key);
    }
  }
  
  async cleanup() {
    const now = Date.now();
    
    for (const [key, lastTime] of this.lastUsed) {
      if (now - lastTime > this.maxIdleTime) {
        console.log(`🧹 Cleaning up idle connection: ${key}`);
        const connection = this.connections.get(key);
        await connection.close?.();
        this.connections.delete(key);
        this.lastUsed.delete(key);
      }
    }
  }
}

// Usage
const pool = new ConnectionPool();

// Connection reuse example
async function performOperations() {
  const config = {
    host: 'server.example.com',
    username: 'admin',
    privateKey: '~/.ssh/id_rsa'
  };
  
  // First operation - creates connection
  const conn1 = await pool.getConnection(config);
  await conn1`ls -la`;
  
  // Second operation - reuses connection
  const conn2 = await pool.getConnection(config);
  await conn2`ps aux`;
  
  // Cleanup idle connections periodically
  setInterval(() => pool.cleanup(), 60000);
}

await performOperations();
```

### SSH Tunneling

```typescript
// server/ssh-tunnel.ts
import { $ } from '@xec-sh/core';

class SSHTunnelManager {
  private tunnels: Map<string, any> = new Map();
  
  async createTunnel(config: {
    jumpHost: string;
    targetHost: string;
    localPort: number;
    remotePort: number;
  }) {
    const key = `${config.localPort}:${config.targetHost}:${config.remotePort}`;
    
    if (this.tunnels.has(key)) {
      console.log(`♻️ Tunnel already exists: ${key}`);
      return this.tunnels.get(key);
    }
    
    console.log(`🚇 Creating SSH tunnel: ${key}`);
    
    // Create tunnel through jump host
    const tunnel = $.spawn`ssh -N -L ${config.localPort}:${config.targetHost}:${config.remotePort} ${config.jumpHost}`;
    
    this.tunnels.set(key, tunnel);
    
    // Wait for tunnel to be ready
    await this.waitForTunnel(config.localPort);
    
    return tunnel;
  }
  
  private async waitForTunnel(port: number) {
    const maxAttempts = 30;
    
    for (let i = 0; i < maxAttempts; i++) {
      const result = await $`nc -z localhost ${port}`.nothrow();
      
      if (result.ok) {
        console.log(`✅ Tunnel ready on port ${port}`);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Tunnel failed to start on port ${port}`);
  }
  
  async accessThroughTunnel() {
    // Create tunnel to access database through bastion
    await this.createTunnel({
      jumpHost: 'bastion.example.com',
      targetHost: 'database.internal',
      localPort: 5432,
      remotePort: 5432
    });
    
    // Now access database through localhost
    const result = await $`psql -h localhost -p 5432 -U dbuser -c "SELECT version()"`;
    console.log(`Database version: ${result.stdout}`);
  }
  
  async closeAll() {
    for (const [key, tunnel] of this.tunnels) {
      console.log(`🔌 Closing tunnel: ${key}`);
      tunnel.kill();
      this.tunnels.delete(key);
    }
  }
}

// Usage
const tunnelManager = new SSHTunnelManager();
await tunnelManager.accessThroughTunnel();
```

## Server Provisioning

### Automated Server Setup

```typescript
// server/provision.ts
import { $ } from '@xec-sh/core';
import { confirm, select } from '@clack/prompts';

class ServerProvisioner {
  constructor(private host: string) {}
  
  async provision() {
    console.log(`🚀 Provisioning server: ${this.host}`);
    
    const server = $.ssh({
      host: this.host,
      username: 'root',
      privateKey: '~/.ssh/id_rsa'
    });
    
    // Run provisioning steps
    await this.setupSystem(server);
    await this.installDependencies(server);
    await this.configureFirewall(server);
    await this.setupUsers(server);
    await this.installApplications(server);
    await this.configureServices(server);
    
    console.log('✅ Server provisioned successfully!');
  }
  
  private async setupSystem(server: any) {
    console.log('🔧 Setting up system...');
    
    // Update system
    await server`apt update && apt upgrade -y`;
    
    // Set timezone
    await server`timedatectl set-timezone UTC`;
    
    // Configure hostname
    await server`hostnamectl set-hostname ${this.host}`;
    
    // Install essential packages
    await server`apt install -y \
      curl \
      wget \
      git \
      vim \
      htop \
      build-essential \
      software-properties-common`;
  }
  
  private async installDependencies(server: any) {
    console.log('📦 Installing dependencies...');
    
    // Install Node.js
    await server`curl -fsSL https://deb.nodesource.com/setup_18.x | bash -`;
    await server`apt install -y nodejs`;
    
    // Install Docker
    await server`curl -fsSL https://get.docker.com | sh`;
    await server`systemctl enable docker`;
    await server`systemctl start docker`;
    
    // Install nginx
    await server`apt install -y nginx`;
  }
  
  private async configureFirewall(server: any) {
    console.log('🔒 Configuring firewall...');
    
    // Setup UFW
    await server`apt install -y ufw`;
    
    // Configure rules
    await server`ufw default deny incoming`;
    await server`ufw default allow outgoing`;
    await server`ufw allow ssh`;
    await server`ufw allow http`;
    await server`ufw allow https`;
    
    // Enable firewall
    await server`echo "y" | ufw enable`;
  }
  
  private async setupUsers(server: any) {
    console.log('👤 Setting up users...');
    
    // Create deploy user
    await server`useradd -m -s /bin/bash deploy`;
    await server`usermod -aG sudo,docker deploy`;
    
    // Setup SSH for deploy user
    await server`mkdir -p /home/deploy/.ssh`;
    await server`cp /root/.ssh/authorized_keys /home/deploy/.ssh/`;
    await server`chown -R deploy:deploy /home/deploy/.ssh`;
    await server`chmod 700 /home/deploy/.ssh`;
    await server`chmod 600 /home/deploy/.ssh/authorized_keys`;
    
    // Configure sudoers
    await server`echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy`;
  }
  
  private async installApplications(server: any) {
    console.log('🎯 Installing applications...');
    
    // Create application directories
    await server`mkdir -p /app/{releases,shared,current}`;
    await server`chown -R deploy:deploy /app`;
    
    // Install PM2
    await server`npm install -g pm2`;
    await server`pm2 startup systemd -u deploy --hp /home/deploy`;
  }
  
  private async configureServices(server: any) {
    console.log('⚙️ Configuring services...');
    
    // Configure nginx
    const nginxConfig = `
server {
    listen 80;
    server_name ${this.host};
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\$host;
        proxy_cache_bypass \\$http_upgrade;
    }
}`;
    
    await server`echo '${nginxConfig}' > /etc/nginx/sites-available/app`;
    await server`ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/`;
    await server`rm -f /etc/nginx/sites-enabled/default`;
    await server`nginx -t`;
    await server`systemctl reload nginx`;
  }
}

// Usage
const provisioner = new ServerProvisioner('new-server.example.com');
await provisioner.provision();
```

## Monitoring and Maintenance

### Health Monitoring

```typescript
// server/health-monitor.ts
import { $ } from '@xec-sh/core';

class HealthMonitor {
  private servers: string[];
  private alerts: any[] = [];
  
  constructor(servers: string[]) {
    this.servers = servers;
  }
  
  async monitor() {
    console.log('🏥 Starting health monitoring...');
    
    while (true) {
      await this.checkAllServers();
      await this.sendAlerts();
      
      // Check every 5 minutes
      await new Promise(resolve => setTimeout(resolve, 300000));
    }
  }
  
  private async checkAllServers() {
    const checks = await Promise.allSettled(
      this.servers.map(host => this.checkServer(host))
    );
    
    // Process results
    checks.forEach((result, index) => {
      const host = this.servers[index];
      
      if (result.status === 'rejected') {
        this.addAlert({
          host,
          level: 'critical',
          message: 'Server unreachable',
          timestamp: new Date()
        });
      }
    });
  }
  
  private async checkServer(host: string) {
    const server = $.ssh({
      host,
      username: 'monitor',
      privateKey: '~/.ssh/monitor_key'
    });
    
    const checks = {
      cpu: await this.checkCPU(server, host),
      memory: await this.checkMemory(server, host),
      disk: await this.checkDisk(server, host),
      services: await this.checkServices(server, host)
    };
    
    return checks;
  }
  
  private async checkCPU(server: any, host: string) {
    const result = await server`top -bn1 | grep "Cpu(s)" | awk '{print 100 - $8}'`;
    const usage = parseFloat(result.stdout.trim());
    
    if (usage > 80) {
      this.addAlert({
        host,
        level: 'warning',
        metric: 'CPU',
        value: usage,
        threshold: 80
      });
    }
    
    return usage;
  }
  
  private async checkMemory(server: any, host: string) {
    const result = await server`free | grep Mem | awk '{print ($3/$2) * 100}'`;
    const usage = parseFloat(result.stdout.trim());
    
    if (usage > 90) {
      this.addAlert({
        host,
        level: 'critical',
        metric: 'Memory',
        value: usage,
        threshold: 90
      });
    }
    
    return usage;
  }
  
  private async checkDisk(server: any, host: string) {
    const result = await server`df -h / | tail -1 | awk '{print $5}' | sed 's/%//'`;
    const usage = parseFloat(result.stdout.trim());
    
    if (usage > 85) {
      this.addAlert({
        host,
        level: 'warning',
        metric: 'Disk',
        value: usage,
        threshold: 85
      });
    }
    
    return usage;
  }
  
  private async checkServices(server: any, host: string) {
    const services = ['nginx', 'mysql', 'redis'];
    const failed = [];
    
    for (const service of services) {
      const result = await server`systemctl is-active ${service}`.nothrow();
      
      if (!result.ok || result.stdout.trim() !== 'active') {
        failed.push(service);
      }
    }
    
    if (failed.length > 0) {
      this.addAlert({
        host,
        level: 'critical',
        message: `Services down: ${failed.join(', ')}`
      });
    }
    
    return failed;
  }
  
  private addAlert(alert: any) {
    this.alerts.push(alert);
    console.log(`🚨 Alert: ${JSON.stringify(alert)}`);
  }
  
  private async sendAlerts() {
    if (this.alerts.length === 0) return;
    
    // Send to monitoring service
    if (process.env.ALERT_WEBHOOK) {
      await $`curl -X POST ${process.env.ALERT_WEBHOOK} \
        -H "Content-Type: application/json" \
        -d '${JSON.stringify({ alerts: this.alerts })}'`;
    }
    
    // Clear sent alerts
    this.alerts = [];
  }
}

// Usage
const monitor = new HealthMonitor([
  'web1.example.com',
  'web2.example.com',
  'db1.example.com'
]);

await monitor.monitor();
```

### Log Management

```typescript
// server/log-manager.ts
import { $ } from '@xec-sh/core';

class LogManager {
  constructor(private servers: string[]) {}
  
  async collectLogs(pattern: string, since?: string) {
    console.log('📝 Collecting logs from all servers...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = `logs-${timestamp}`;
    
    await $`mkdir -p ${outputDir}`;
    
    for (const host of this.servers) {
      await this.collectServerLogs(host, pattern, outputDir, since);
    }
    
    // Create archive
    await $`tar -czf ${outputDir}.tar.gz ${outputDir}`;
    await $`rm -rf ${outputDir}`;
    
    console.log(`✅ Logs collected: ${outputDir}.tar.gz`);
  }
  
  private async collectServerLogs(
    host: string,
    pattern: string,
    outputDir: string,
    since?: string
  ) {
    console.log(`  📥 Collecting from ${host}...`);
    
    const server = $.ssh({
      host,
      username: 'admin',
      privateKey: '~/.ssh/id_rsa'
    });
    
    // Get matching log files
    const files = await server`find /var/log -name "${pattern}" 2>/dev/null`;
    const logFiles = files.stdout.split('\n').filter(f => f);
    
    for (const file of logFiles) {
      const filename = file.replace(/\//g, '_');
      const outputFile = `${outputDir}/${host}_${filename}`;
      
      if (since) {
        // Filter by date
        await server`journalctl --since="${since}" > /tmp/filtered.log`;
        await $`scp admin@${host}:/tmp/filtered.log ${outputFile}`;
      } else {
        // Copy entire file
        await $`scp admin@${host}:${file} ${outputFile}`;
      }
    }
  }
  
  async searchLogs(query: string) {
    console.log(`🔍 Searching for: ${query}`);
    
    const results = await Promise.all(
      this.servers.map(async host => {
        const server = $.ssh({
          host,
          username: 'admin',
          privateKey: '~/.ssh/id_rsa'
        });
        
        const result = await server`grep -r "${query}" /var/log 2>/dev/null | head -20`;
        
        return {
          host,
          matches: result.stdout.split('\n').filter(l => l)
        };
      })
    );
    
    // Display results
    for (const { host, matches } of results) {
      if (matches.length > 0) {
        console.log(`\n📍 ${host}:`);
        matches.forEach(match => console.log(`  ${match}`));
      }
    }
  }
  
  async tailLogs(service: string) {
    console.log(`👀 Tailing logs for ${service}...`);
    
    // Create parallel tail sessions
    const sessions = this.servers.map(host => {
      const server = $.ssh({
        host,
        username: 'admin',
        privateKey: '~/.ssh/id_rsa'
      });
      
      return {
        host,
        process: $.spawn(server`journalctl -u ${service} -f`)
      };
    });
    
    // Prefix output with hostname
    for (const { host, process } of sessions) {
      process.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
          if (line) console.log(`[${host}] ${line}`);
        });
      });
    }
    
    // Wait for interrupt
    process.on('SIGINT', () => {
      sessions.forEach(s => s.process.kill());
      process.exit(0);
    });
  }
}

// Usage
const logManager = new LogManager([
  'web1.example.com',
  'web2.example.com'
]);

// Collect nginx logs from last 24 hours
await logManager.collectLogs('nginx*.log', '24 hours ago');

// Search for errors
await logManager.searchLogs('ERROR');

// Tail application logs
await logManager.tailLogs('myapp');
```

## Batch Operations

### Parallel Command Execution

```typescript
// server/batch-ops.ts
import { $ } from '@xec-sh/core';

class BatchOperator {
  constructor(private servers: string[]) {}
  
  async execute(commands: string[], options?: {
    parallel?: boolean;
    continueOnError?: boolean;
    timeout?: number;
  }) {
    const opts = {
      parallel: true,
      continueOnError: false,
      timeout: 30000,
      ...options
    };
    
    console.log(`🚀 Executing ${commands.length} commands on ${this.servers.length} servers`);
    
    if (opts.parallel) {
      await this.executeParallel(commands, opts);
    } else {
      await this.executeSequential(commands, opts);
    }
  }
  
  private async executeParallel(commands: string[], options: any) {
    const tasks = [];
    
    for (const host of this.servers) {
      for (const command of commands) {
        tasks.push(this.executeOnServer(host, command, options));
      }
    }
    
    const results = await Promise.allSettled(tasks);
    
    // Report results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`\n📊 Results: ${successful} successful, ${failed} failed`);
    
    if (failed > 0 && !options.continueOnError) {
      throw new Error(`${failed} commands failed`);
    }
  }
  
  private async executeSequential(commands: string[], options: any) {
    for (const host of this.servers) {
      console.log(`\n🖥️ Server: ${host}`);
      
      for (const command of commands) {
        try {
          await this.executeOnServer(host, command, options);
        } catch (error) {
          if (!options.continueOnError) {
            throw error;
          }
          console.error(`❌ Failed: ${error.message}`);
        }
      }
    }
  }
  
  private async executeOnServer(host: string, command: string, options: any) {
    const server = $.ssh({
      host,
      username: 'admin',
      privateKey: '~/.ssh/id_rsa'
    });
    
    console.log(`  [${host}] $ ${command}`);
    
    const result = await server`${command}`.timeout(options.timeout);
    
    if (result.stdout) {
      console.log(`  [${host}] ${result.stdout.trim()}`);
    }
    
    return result;
  }
}

// Usage
const batch = new BatchOperator([
  'web1.example.com',
  'web2.example.com',
  'web3.example.com'
]);

// Update all servers
await batch.execute([
  'sudo apt update',
  'sudo apt upgrade -y',
  'sudo systemctl restart nginx'
], {
  parallel: false,  // Sequential for safety
  continueOnError: true,
  timeout: 300000  // 5 minutes
});
```

### File Distribution

```typescript
// server/file-distribution.ts
import { $ } from '@xec-sh/core';

class FileDistributor {
  constructor(private servers: string[]) {}
  
  async distribute(localPath: string, remotePath: string) {
    console.log(`📤 Distributing ${localPath} to ${this.servers.length} servers...`);
    
    // Compress if directory
    const isDirectory = await $`test -d ${localPath} && echo "true" || echo "false"`;
    let sourceFile = localPath;
    
    if (isDirectory.stdout.trim() === 'true') {
      console.log('📦 Compressing directory...');
      sourceFile = `/tmp/dist-${Date.now()}.tar.gz`;
      await $`tar -czf ${sourceFile} -C ${localPath} .`;
    }
    
    // Distribute to all servers
    const results = await Promise.allSettled(
      this.servers.map(host => this.copyToServer(host, sourceFile, remotePath, isDirectory.stdout.trim() === 'true'))
    );
    
    // Cleanup temp file
    if (sourceFile !== localPath) {
      await $`rm ${sourceFile}`;
    }
    
    // Report results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    console.log(`✅ Distributed to ${successful}/${this.servers.length} servers`);
  }
  
  private async copyToServer(
    host: string,
    source: string,
    destination: string,
    isCompressed: boolean
  ) {
    console.log(`  📤 Copying to ${host}...`);
    
    const server = $.ssh({
      host,
      username: 'admin',
      privateKey: '~/.ssh/id_rsa'
    });
    
    // Create destination directory
    await server`mkdir -p $(dirname ${destination})`;
    
    if (isCompressed) {
      // Copy and extract
      const tempFile = `/tmp/dist-${Date.now()}.tar.gz`;
      await $`scp ${source} admin@${host}:${tempFile}`;
      await server`mkdir -p ${destination}`;
      await server`tar -xzf ${tempFile} -C ${destination}`;
      await server`rm ${tempFile}`;
    } else {
      // Direct copy
      await $`scp ${source} admin@${host}:${destination}`;
    }
    
    console.log(`  ✅ ${host} complete`);
  }
  
  async collect(remotePath: string, localDir: string) {
    console.log(`📥 Collecting ${remotePath} from ${this.servers.length} servers...`);
    
    await $`mkdir -p ${localDir}`;
    
    const results = await Promise.allSettled(
      this.servers.map(host => this.collectFromServer(host, remotePath, localDir))
    );
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    console.log(`✅ Collected from ${successful}/${this.servers.length} servers`);
  }
  
  private async collectFromServer(host: string, remotePath: string, localDir: string) {
    console.log(`  📥 Collecting from ${host}...`);
    
    const localPath = `${localDir}/${host}_$(basename ${remotePath})`;
    await $`scp admin@${host}:${remotePath} ${localPath}`;
    
    console.log(`  ✅ Saved to ${localPath}`);
  }
}

// Usage
const distributor = new FileDistributor([
  'web1.example.com',
  'web2.example.com',
  'web3.example.com'
]);

// Distribute configuration files
await distributor.distribute('./configs', '/etc/myapp');

// Collect logs
await distributor.collect('/var/log/myapp.log', './collected-logs');
```

## Security Management

### Security Hardening

```typescript
// server/security-hardening.ts
import { $ } from '@xec-sh/core';

class SecurityHardener {
  async harden(host: string) {
    console.log(`🔒 Hardening server: ${host}`);
    
    const server = $.ssh({
      host,
      username: 'root',
      privateKey: '~/.ssh/id_rsa'
    });
    
    await this.configureSSH(server);
    await this.setupFirewall(server);
    await this.installSecurityTools(server);
    await this.configureKernel(server);
    await this.setupAudit(server);
    
    console.log('✅ Server hardened successfully!');
  }
  
  private async configureSSH(server: any) {
    console.log('🔐 Configuring SSH...');
    
    const sshConfig = `
# Security hardening
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowUsers admin deploy
Protocol 2
`;
    
    await server`cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup`;
    await server`echo '${sshConfig}' >> /etc/ssh/sshd_config`;
    await server`sshd -t`;  // Test configuration
    await server`systemctl restart sshd`;
  }
  
  private async setupFirewall(server: any) {
    console.log('🛡️ Setting up firewall...');
    
    // Install and configure fail2ban
    await server`apt install -y fail2ban`;
    
    const fail2banConfig = `
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
`;
    
    await server`echo '${fail2banConfig}' > /etc/fail2ban/jail.local`;
    await server`systemctl enable fail2ban`;
    await server`systemctl restart fail2ban`;
  }
  
  private async installSecurityTools(server: any) {
    console.log('🛠️ Installing security tools...');
    
    await server`apt install -y \
      unattended-upgrades \
      aide \
      rkhunter \
      clamav \
      lynis`;
    
    // Configure automatic updates
    await server`dpkg-reconfigure -plow unattended-upgrades`;
    
    // Initialize AIDE
    await server`aideinit`;
  }
  
  private async configureKernel(server: any) {
    console.log('🔧 Configuring kernel parameters...');
    
    const sysctlConfig = `
# Network security
net.ipv4.tcp_syncookies = 1
net.ipv4.ip_forward = 0
net.ipv6.conf.all.forwarding = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1

# File system security
fs.suid_dumpable = 0
kernel.exec-shield = 1
kernel.randomize_va_space = 2
`;
    
    await server`echo '${sysctlConfig}' >> /etc/sysctl.d/99-security.conf`;
    await server`sysctl -p /etc/sysctl.d/99-security.conf`;
  }
  
  private async setupAudit(server: any) {
    console.log('📝 Setting up audit logging...');
    
    await server`apt install -y auditd`;
    
    // Configure audit rules
    const auditRules = `
# Monitor user/group changes
-w /etc/passwd -p wa -k passwd_changes
-w /etc/group -p wa -k group_changes
-w /etc/shadow -p wa -k shadow_changes

# Monitor sudo usage
-w /etc/sudoers -p wa -k sudoers_changes
-w /var/log/sudo.log -p wa -k sudo_usage

# Monitor SSH configuration
-w /etc/ssh/sshd_config -p wa -k sshd_config
`;
    
    await server`echo '${auditRules}' >> /etc/audit/rules.d/audit.rules`;
    await server`systemctl enable auditd`;
    await server`systemctl restart auditd`;
  }
}

// Usage
const hardener = new SecurityHardener();
await hardener.harden('new-server.example.com');
```

## Disaster Recovery

### Backup Management

```typescript
// server/backup-manager.ts
import { $ } from '@xec-sh/core';

class BackupManager {
  constructor(
    private servers: string[],
    private backupLocation: string
  ) {}
  
  async createBackup(tag?: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${tag || timestamp}`;
    
    console.log(`💾 Creating backup: ${backupName}`);
    
    for (const host of this.servers) {
      await this.backupServer(host, backupName);
    }
    
    console.log('✅ All backups completed!');
  }
  
  private async backupServer(host: string, backupName: string) {
    console.log(`  📦 Backing up ${host}...`);
    
    const server = $.ssh({
      host,
      username: 'admin',
      privateKey: '~/.ssh/id_rsa'
    });
    
    // Create backup on server
    const backupPath = `/tmp/${backupName}-${host}.tar.gz`;
    
    await server`tar -czf ${backupPath} \
      --exclude=/proc \
      --exclude=/sys \
      --exclude=/dev \
      --exclude=/tmp \
      --exclude=/var/cache \
      /etc /home /var/www /app 2>/dev/null || true`;
    
    // Transfer to backup location
    await $`scp admin@${host}:${backupPath} ${this.backupLocation}/`;
    
    // Cleanup
    await server`rm ${backupPath}`;
    
    console.log(`  ✅ ${host} backed up`);
  }
  
  async restore(host: string, backupFile: string) {
    console.log(`🔄 Restoring ${host} from ${backupFile}...`);
    
    const server = $.ssh({
      host,
      username: 'admin',
      privateKey: '~/.ssh/id_rsa'
    });
    
    // Transfer backup to server
    const tempPath = `/tmp/restore-${Date.now()}.tar.gz`;
    await $`scp ${backupFile} admin@${host}:${tempPath}`;
    
    // Extract backup
    await server`tar -xzf ${tempPath} -C /`;
    
    // Cleanup
    await server`rm ${tempPath}`;
    
    console.log('✅ Restore completed!');
  }
  
  async listBackups() {
    const backups = await $`ls -la ${this.backupLocation}/*.tar.gz`;
    console.log('📋 Available backups:');
    console.log(backups.stdout);
  }
}

// Usage
const backupManager = new BackupManager(
  ['web1.example.com', 'db1.example.com'],
  '/backup/servers'
);

await backupManager.createBackup('daily');
await backupManager.listBackups();
```

## Best Practices

### 1. Connection Management

```typescript
// Always reuse connections
const connectionCache = new Map();

function getServerConnection(host: string) {
  if (!connectionCache.has(host)) {
    connectionCache.set(host, $.ssh({
      host,
      username: 'admin',
      privateKey: '~/.ssh/id_rsa'
    }));
  }
  return connectionCache.get(host);
}
```

### 2. Error Handling

```typescript
async function safeServerOperation(host: string, operation: () => Promise<any>) {
  const maxRetries = 3;
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.log(`Retry ${i + 1}/${maxRetries} for ${host}`);
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
  
  throw lastError;
}
```

### 3. Parallel Execution

```typescript
async function executeOnServers(servers: string[], command: string) {
  // Limit concurrency to avoid overwhelming network
  const concurrency = 5;
  const results = [];
  
  for (let i = 0; i < servers.length; i += concurrency) {
    const batch = servers.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(host => executeCommand(host, command))
    );
    results.push(...batchResults);
  }
  
  return results;
}
```

## Troubleshooting

### Common Issues

1. **Connection Timeout**
   ```typescript
   // Increase timeout for slow connections
   const server = $.ssh({
     host: 'server.example.com',
     username: 'admin',
     privateKey: '~/.ssh/id_rsa',
     connectTimeout: 30000
   });
   ```

2. **Permission Denied**
   ```typescript
   // Ensure proper key permissions
   await $`chmod 600 ~/.ssh/id_rsa`;
   await $`chmod 700 ~/.ssh`;
   ```

3. **Too Many Connections**
   ```typescript
   // Implement connection limiting
   const pool = new ConnectionPool({ maxConnections: 10 });
   ```

## Next Steps

- Learn about [container orchestration](./container-orchestration.md)

## Summary

You've learned how to:
- ✅ Manage single and multiple servers efficiently
- ✅ Implement connection pooling and SSH tunneling
- ✅ Automate server provisioning and setup
- ✅ Monitor server health and collect logs
- ✅ Execute batch operations across server fleets
- ✅ Implement security hardening
- ✅ Handle backup and disaster recovery

Continue to [container orchestration](./container-orchestration.md) to learn about managing containerized applications.