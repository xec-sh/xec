# 09. Standard Library

## Overview

The Xec Core Standard Library provides a set of ready-to-use modules for solving common infrastructure automation tasks. All standard library modules follow unified design principles and naming conventions.

## Standard Library Architecture

### Package Structure

```
@xec/stdlib/
├── core/              # Core utilities
├── system/            # System operations
├── network/           # Network utilities
├── file/              # File operations
├── process/           # Process management
├── container/         # Docker/Podman
├── cloud/             # Cloud providers
├── database/          # Databases
├── web/               # Web servers
├── monitoring/        # Monitoring
├── security/          # Security
└── patterns/          # Deployment patterns
```

### Design Principles

1. **Consistency** - uniform API
2. **Modularity** - each module is independent
3. **Security** - secure defaults
4. **Performance** - optimized out of the box
5. **Documentation** - examples for every function

## Core Module

### @xec/stdlib-core

Core utilities and helpers.

```typescript
import { core } from '@xec/stdlib-core';

// JSON utilities
await core.json.read('/path/to/file.json');
await core.json.write('/path/to/file.json', data);
await core.json.merge('/path/to/file.json', updates);

// YAML utilities
await core.yaml.read('/path/to/file.yaml');
await core.yaml.write('/path/to/file.yaml', data);

// Templates
await core.template.render('template.j2', variables);
await core.template.renderString('Hello {{name}}', { name: 'World' });

// Cryptography
const hash = await core.crypto.hash('sha256', data);
const encrypted = await core.crypto.encrypt(data, key);
const decrypted = await core.crypto.decrypt(encrypted, key);

// Validation
const isValid = await core.validate(data, schema);
const errors = await core.validateWithErrors(data, schema);
```

## System Module

### @xec/stdlib-system

System operations and package management.

```typescript
import { system } from '@xec/stdlib-system';

// System information
const info = await system.info();
// { os: 'linux', arch: 'x64', version: '5.10.0', ... }

// Package management
await system.package.install('nginx', 'postgresql-14');
await system.package.remove('apache2');
await system.package.update();
await system.package.upgrade();

// Service management
await system.service.start('nginx');
await system.service.stop('nginx');
await system.service.restart('nginx');
await system.service.enable('nginx');
await system.service.disable('nginx');
const status = await system.service.status('nginx');

// User management
await system.user.create('deploy', {
  home: '/home/deploy',
  shell: '/bin/bash',
  groups: ['sudo', 'docker']
});
await system.user.delete('olduser');
await system.user.modify('deploy', { groups: ['docker'] });

// Group management
await system.group.create('myapp');
await system.group.addUser('myapp', 'deploy');

// Firewall
await system.firewall.allow(80, 'tcp');
await system.firewall.deny(8080);
await system.firewall.enable();

// Cron jobs
await system.cron.add('backup', '0 2 * * *', '/scripts/backup.sh');
await system.cron.remove('backup');
await system.cron.list();
```

## Network Module

### @xec/stdlib-network

Network operations and checks.

```typescript
import { network } from '@xec/stdlib-network';

// HTTP client
const response = await network.http.get('https://api.example.com/data');
const data = await network.http.post('https://api.example.com/users', {
  json: { name: 'John', email: 'john@example.com' }
});

// With retry and timeout
const result = await network.http.get('https://api.example.com/health', {
  retry: { attempts: 3, delay: 1000 },
  timeout: 5000
});

// DNS operations
const records = await network.dns.lookup('example.com');
const mx = await network.dns.resolveMx('example.com');

// Port checks
const isOpen = await network.port.check('example.com', 443);
await network.port.wait('localhost', 3000, { timeout: 30000 });

// Ping
const isAlive = await network.ping('8.8.8.8');
const latency = await network.ping('google.com', { count: 5 });

// SSL/TLS
const cert = await network.ssl.getCertificate('example.com');
const isValid = await network.ssl.verify('example.com');
const daysUntilExpiry = await network.ssl.daysUntilExpiry('example.com');

// Network interfaces
const interfaces = await network.interfaces.list();
await network.interfaces.configure('eth0', {
  address: '192.168.1.100',
  netmask: '255.255.255.0',
  gateway: '192.168.1.1'
});
```

## File Module

### @xec/stdlib-file

Advanced file operations.

```typescript
import { file } from '@xec/stdlib-file';

// Basic operations
await file.read('/path/to/file');
await file.write('/path/to/file', content);
await file.append('/path/to/file', content);
await file.copy('/source', '/dest');
await file.move('/source', '/dest');
await file.delete('/path/to/file');

// Checks
const exists = await file.exists('/path/to/file');
const isFile = await file.isFile('/path/to/file');
const isDirectory = await file.isDirectory('/path/to/dir');

// Permissions
await file.chmod('/path/to/file', '644');
await file.chown('/path/to/file', 'user', 'group');

// Directories
await file.mkdir('/path/to/dir', { recursive: true });
await file.rmdir('/path/to/dir', { recursive: true });
const files = await file.list('/path/to/dir');
const tree = await file.tree('/path/to/dir');

// Search
const found = await file.find('/path', {
  name: '*.js',
  type: 'file',
  maxDepth: 3
});

// Archives
await file.archive.create('/backup.tar.gz', ['/data', '/config']);
await file.archive.extract('/backup.tar.gz', '/restore');
const contents = await file.archive.list('/backup.tar.gz');

// Synchronization
await file.sync('/source', '/dest', {
  delete: true,
  exclude: ['*.log', 'node_modules']
});

// Watch
const watcher = await file.watch('/path', {
  events: ['create', 'change', 'delete'],
  recursive: true
});

watcher.on('change', (path) => {
  console.log(`File changed: ${path}`);
});
```

## Process Module

### @xec/stdlib-process

Process management and monitoring.

```typescript
import { process } from '@xec/stdlib-process';

// Process spawning
const proc = await process.spawn('npm', ['start'], {
  cwd: '/app',
  env: { NODE_ENV: 'production' }
});

// Lifecycle management
const managed = await process.manage('myapp', {
  command: 'node server.js',
  cwd: '/app',
  restart: 'always',
  restartDelay: 5000,
  maxRestarts: 10
});

// Process monitoring
const list = await process.list();
const info = await process.info(1234); // by PID
const tree = await process.tree(1234);

// Signals
await process.kill(1234, 'SIGTERM');
await process.killByName('node');

// PM2 integration
await process.pm2.start({
  name: 'api',
  script: 'server.js',
  instances: 4,
  exec_mode: 'cluster'
});
await process.pm2.restart('api');
await process.pm2.stop('api');
await process.pm2.delete('api');
const status = await process.pm2.status();

// Systemd integration
await process.systemd.create('myapp', {
  execStart: '/usr/bin/node /app/server.js',
  workingDirectory: '/app',
  restart: 'always',
  user: 'app'
});
```

## Container Module

### @xec/stdlib-container

Docker and container operations.

```typescript
import { container } from '@xec/stdlib-container';

// Docker operations
await container.docker.pull('nginx:latest');
await container.docker.build('.', { tag: 'myapp:latest' });
await container.docker.push('myapp:latest');

// Container management
const id = await container.docker.run('nginx:latest', {
  name: 'web',
  ports: { '80': '8080' },
  volumes: { '/data': '/usr/share/nginx/html' },
  env: { NGINX_HOST: 'example.com' }
});

await container.docker.stop('web');
await container.docker.start('web');
await container.docker.restart('web');
await container.docker.remove('web');

// Inspection
const info = await container.docker.inspect('web');
const logs = await container.docker.logs('web', { tail: 100 });
const stats = await container.docker.stats('web');

// Docker Compose
await container.compose.up({
  file: 'docker-compose.yml',
  detach: true
});
await container.compose.down();
await container.compose.restart('web');

// Image management
const images = await container.docker.images();
await container.docker.rmi('old-image:tag');
await container.docker.prune(); // Clean unused

// Networks
await container.docker.network.create('mynet');
await container.docker.network.connect('mynet', 'web');

// Volumes
await container.docker.volume.create('mydata');
const volumes = await container.docker.volume.list();
```

## Cloud Module

### @xec/stdlib-cloud

Multi-cloud operations.

```typescript
import { cloud } from '@xec/stdlib-cloud';

// AWS
const ec2 = cloud.aws.ec2;
const instances = await ec2.list({ 
  filters: { 'tag:Environment': 'production' }
});
await ec2.start('i-1234567890');
await ec2.stop('i-1234567890');
await ec2.terminate('i-1234567890');

// S3
const s3 = cloud.aws.s3;
await s3.upload('my-bucket', 'file.txt', '/local/file.txt');
await s3.download('my-bucket', 'file.txt', '/local/file.txt');
await s3.sync('/local/dir', 's3://my-bucket/prefix');
const files = await s3.list('my-bucket', { prefix: 'logs/' });

// Azure
const vm = cloud.azure.vm;
await vm.create('my-vm', {
  resourceGroup: 'my-rg',
  size: 'Standard_B2s',
  image: 'Ubuntu:20.04'
});

// GCP
const gce = cloud.gcp.compute;
await gce.createInstance('my-instance', {
  zone: 'us-central1-a',
  machineType: 'e2-medium'
});

// Generic cloud operations
await cloud.ssh('instance-name', 'ls -la');
await cloud.scp('/local/file', 'instance:/remote/file');
```

## Database Module

### @xec/stdlib-database

Database operations for various engines.

```typescript
import { database } from '@xec/stdlib-database';

// PostgreSQL
const pg = database.postgres;
await pg.install({ version: '14' });
await pg.createDatabase('myapp');
await pg.createUser('appuser', { password: 'secret' });
await pg.grant('myapp', 'appuser', ['ALL']);
await pg.backup('myapp', '/backups/myapp.sql');
await pg.restore('myapp', '/backups/myapp.sql');

// MySQL/MariaDB
const mysql = database.mysql;
await mysql.install();
await mysql.secure(); // Run mysql_secure_installation
await mysql.createDatabase('myapp', { charset: 'utf8mb4' });

// MongoDB
const mongo = database.mongodb;
await mongo.install({ version: '5.0' });
await mongo.createUser('admin', {
  password: 'secret',
  roles: ['root']
});

// Redis
const redis = database.redis;
await redis.install();
await redis.configure({
  maxmemory: '2gb',
  maxmemoryPolicy: 'allkeys-lru'
});

// Generic DB operations
await database.migrate('/migrations', {
  engine: 'postgres',
  connection: 'postgresql://localhost/myapp'
});

await database.seed('/seeds', {
  engine: 'postgres',
  connection: 'postgresql://localhost/myapp'
});
```

## Web Module

### @xec/stdlib-web

Web servers and related tools.

```typescript
import { web } from '@xec/stdlib-web';

// Nginx
const nginx = web.nginx;
await nginx.install();
await nginx.configure({
  server: {
    server_name: 'example.com',
    listen: 80,
    root: '/var/www/html',
    locations: {
      '/': { proxy_pass: 'http://localhost:3000' },
      '/api': { proxy_pass: 'http://localhost:4000' }
    }
  }
});
await nginx.enableSite('example.com');
await nginx.reload();

// SSL/TLS with Let's Encrypt
await nginx.setupSSL('example.com', {
  email: 'admin@example.com',
  webroot: '/var/www/html'
});

// Apache
const apache = web.apache;
await apache.install();
await apache.enableModule('rewrite', 'ssl', 'proxy');
await apache.createVirtualHost('example.com', {
  documentRoot: '/var/www/html',
  serverAdmin: 'admin@example.com'
});

// HAProxy
const haproxy = web.haproxy;
await haproxy.install();
await haproxy.configure({
  defaults: { timeout: { connect: '5s', client: '30s', server: '30s' } },
  frontend: {
    name: 'web',
    bind: '*:80',
    default_backend: 'servers'
  },
  backend: {
    name: 'servers',
    balance: 'roundrobin',
    servers: [
      { name: 'web1', address: '10.0.1.1:80' },
      { name: 'web2', address: '10.0.1.2:80' }
    ]
  }
});
```

## Monitoring Module

### @xec/stdlib-monitoring

Monitoring and observability tools.

```typescript
import { monitoring } from '@xec/stdlib-monitoring';

// Prometheus
const prometheus = monitoring.prometheus;
await prometheus.install();
await prometheus.configure({
  scrape_configs: [{
    job_name: 'node',
    static_configs: [{
      targets: ['localhost:9100']
    }]
  }]
});

// Grafana
const grafana = monitoring.grafana;
await grafana.install();
await grafana.addDataSource('prometheus', {
  type: 'prometheus',
  url: 'http://localhost:9090'
});
await grafana.importDashboard(1860); // Node Exporter Full

// Logging
const logging = monitoring.logging;

// Setup ELK stack
await logging.elasticsearch.install();
await logging.logstash.install();
await logging.kibana.install();

// Configure log shipping
await logging.filebeat.install();
await logging.filebeat.configure({
  inputs: [{
    type: 'log',
    paths: ['/var/log/*.log'],
    multiline: {
      pattern: '^[[:space:]]',
      negate: false,
      match: 'after'
    }
  }],
  output: {
    elasticsearch: {
      hosts: ['localhost:9200']
    }
  }
});

// Metrics collection
await monitoring.collectd.install();
await monitoring.collectd.configure({
  plugins: ['cpu', 'memory', 'disk', 'network']
});
```

## Security Module

### @xec/stdlib-security

Security tools and hardening.

```typescript
import { security } from '@xec/stdlib-security';

// System hardening
await security.harden.ssh({
  permitRootLogin: false,
  passwordAuthentication: false,
  port: 2222
});

await security.harden.kernel({
  'net.ipv4.ip_forward': 0,
  'net.ipv4.conf.all.send_redirects': 0,
  'net.ipv4.conf.all.accept_source_route': 0
});

// Firewall
await security.firewall.ufw.enable();
await security.firewall.ufw.allow(22, { from: '10.0.0.0/8' });
await security.firewall.ufw.default('deny incoming');

// Fail2ban
await security.fail2ban.install();
await security.fail2ban.configure({
  jails: {
    sshd: {
      enabled: true,
      maxretry: 3,
      bantime: 3600
    }
  }
});

// SSL/TLS
await security.ssl.generateCertificate({
  commonName: 'example.com',
  altNames: ['www.example.com'],
  keySize: 4096
});

// Secrets management
await security.secrets.store('api-key', 'secret-value', {
  encrypted: true
});
const secret = await security.secrets.retrieve('api-key');

// Security scanning
const vulnerabilities = await security.scan.system();
const openPorts = await security.scan.ports();
const weakPasswords = await security.scan.passwords();

// AppArmor/SELinux
await security.apparmor.enforce('/usr/bin/nginx');
await security.selinux.setContext('/var/www', 'httpd_sys_content_t');
```

## Patterns Module

### @xec/stdlib-patterns

Common deployment and operational patterns.

```typescript
import { patterns } from '@xec/stdlib-patterns';

// Blue-Green Deployment
const blueGreen = patterns.deployment.blueGreen({
  service: 'web-app',
  healthCheck: 'http://localhost/health',
  switchMethod: 'dns' // or 'loadbalancer', 'proxy'
});

await blueGreen.deploy({ version: '2.0.0' });
await blueGreen.validate();
await blueGreen.switch();
await blueGreen.cleanup();

// Canary Deployment
const canary = patterns.deployment.canary({
  service: 'api',
  stages: [
    { traffic: 10, duration: '5m' },
    { traffic: 50, duration: '10m' },
    { traffic: 100 }
  ],
  metrics: {
    errorRate: { threshold: 0.01 },
    latency: { p99: 200 }
  }
});

await canary.deploy({ version: '2.0.0' });
await canary.promote(); // or canary.rollback()

// Disaster Recovery
const dr = patterns.recovery.disaster({
  backup: {
    sources: ['/data', '/config'],
    destination: 's3://backups',
    schedule: '0 2 * * *'
  },
  restore: {
    source: 's3://backups',
    validation: async () => {
      // Validate restored data
    }
  }
});

await dr.backup();
await dr.restore({ timestamp: '2024-01-01' });

// High Availability
const ha = patterns.availability.activePassive({
  primary: 'server1',
  secondary: 'server2',
  vip: '10.0.1.100',
  healthCheck: async (server) => {
    // Check server health
  },
  failover: async (from, to) => {
    // Perform failover
  }
});

await ha.monitor();
await ha.failover(); // Manual failover
```

## Using the Standard Library

### Installation

```bash
# Install the entire stdlib
npm install @xec/stdlib

# Install individual modules
npm install @xec/stdlib-system
npm install @xec/stdlib-network
npm install @xec/stdlib-container
```

### Import and Usage

```typescript
// Import the entire stdlib
import stdlib from '@xec/stdlib';

// Usage
await stdlib.system.package.install('nginx');
await stdlib.network.http.get('https://example.com');

// Import individual modules
import { system } from '@xec/stdlib-system';
import { network } from '@xec/stdlib-network';

// In recipes
recipe('setup')
  .use('@xec/stdlib-system')
  .use('@xec/stdlib-network')
  .task('install', task()
    .run(async ({ stdlib }) => {
      await stdlib.system.package.update();
      await stdlib.system.package.install('nginx');
    })
  )
  .build();
```

### Configuration

```typescript
// Global stdlib configuration
const xec = new Xec({
  stdlib: {
    system: {
      packageManager: 'apt', // or 'yum', 'dnf', 'zypper'
      defaultShell: '/bin/bash'
    },
    network: {
      httpTimeout: 30000,
      retryAttempts: 3
    },
    container: {
      runtime: 'docker' // or 'podman'
    }
  }
});
```

## Extending the Standard Library

### Creating an Extension

```typescript
// my-stdlib-extension.ts
import { StdlibModule } from '@xec/stdlib-core';

export const myExtension: StdlibModule = {
  name: 'my-extension',
  namespace: 'myext',
  
  exports: {
    async customOperation(params: any) {
      // Implementation
    },
    
    nested: {
      async operation() {
        // Will be available as stdlib.myext.nested.operation()
      }
    }
  }
};

// Registration
import { extendStdlib } from '@xec/stdlib-core';

extendStdlib(myExtension);
```

## Best Practices

1. **Use the appropriate module** - don't reinvent the wheel
2. **Check return values** - many operations may fail silently
3. **Use retry for network operations** - networks are unreliable
4. **Log important operations** - for debugging and audit
5. **Test with dry-run** - before applying in production

## Roadmap

### Planned Modules

- `@xec/stdlib-kubernetes` - Kubernetes operations
- `@xec/stdlib-terraform` - Terraform integration
- `@xec/stdlib-ansible` - Ansible compatibility layer
- `@xec/stdlib-ci` - CI/CD integrations
- `@xec/stdlib-testing` - Testing utilities
- `@xec/stdlib-backup` - Backup solutions
- `@xec/stdlib-certificates` - Certificate management
- `@xec/stdlib-queue` - Message queues
- `@xec/stdlib-search` - Search engines (Elasticsearch, Solr)
- `@xec/stdlib-cache` - Caching solutions (Redis, Memcached)

The Xec Core Standard Library is constantly expanding, providing more and more ready-made solutions for infrastructure automation.