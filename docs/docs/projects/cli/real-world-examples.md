---
sidebar_position: 5
---

# Real-World Examples & Use Cases

Practical examples demonstrating Xec CLI in production scenarios.

## DevOps & Infrastructure

### Blue-Green Deployment

Complete blue-green deployment with zero downtime:

```javascript
// blue-green-deploy.js
import { $ } from '@xec-sh/core';
import { spinner, confirm } from '@xec-sh/cli';

const config = {
  production: {
    loadBalancer: 'lb.example.com',
    blue: { host: 'blue.example.com', healthUrl: 'http://blue.example.com/health' },
    green: { host: 'green.example.com', healthUrl: 'http://green.example.com/health' }
  }
};

async function getActiveEnvironment() {
  const lb = $.ssh({ host: config.production.loadBalancer });
  const active = await lb`cat /etc/nginx/active-env.txt`;
  return active.stdout.trim();
}

async function deployToEnvironment(env, version) {
  const spin = spinner(`Deploying ${version} to ${env} environment...`);
  const server = $.ssh({ host: config.production[env].host });
  
  try {
    // Pull new version
    await server`cd /app && git fetch --tags`;
    await server`cd /app && git checkout ${version}`;
    
    // Install dependencies and build
    await server`cd /app && npm ci --production`;
    await server`cd /app && npm run build`;
    
    // Run migrations
    await server`cd /app && npm run migrate`;
    
    // Restart application
    await server`pm2 restart app`;
    
    // Wait for health check
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      const health = await $`curl -s -o /dev/null -w "%{http_code}" ${config.production[env].healthUrl}`.nothrow();
      if (health.stdout.trim() === '200') {
        healthy = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    if (!healthy) {
      throw new Error('Health check failed');
    }
    
    spin.succeed(`${env} environment deployed successfully`);
    return true;
  } catch (error) {
    spin.fail(`Deployment to ${env} failed: ${error.message}`);
    return false;
  }
}

async function switchLoadBalancer(targetEnv) {
  const lb = $.ssh({ host: config.production.loadBalancer });
  
  // Update nginx configuration
  await lb`echo "${targetEnv}" > /etc/nginx/active-env.txt`;
  await lb`nginx -t`;
  await lb`nginx -s reload`;
  
  console.log(`✅ Load balancer switched to ${targetEnv}`);
}

// Main deployment flow
async function main() {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: xec blue-green-deploy.js <version>');
    process.exit(1);
  }
  
  // Determine current active environment
  const currentActive = await getActiveEnvironment();
  const targetEnv = currentActive === 'blue' ? 'green' : 'blue';
  
  console.log(`Current active: ${currentActive}`);
  console.log(`Will deploy to: ${targetEnv}`);
  
  // Deploy to inactive environment
  const success = await deployToEnvironment(targetEnv, version);
  
  if (!success) {
    console.error('❌ Deployment failed');
    process.exit(1);
  }
  
  // Confirm before switching
  if (await confirm(`Switch traffic from ${currentActive} to ${targetEnv}?`)) {
    await switchLoadBalancer(targetEnv);
    console.log('✅ Deployment complete');
    
    // Optional: Keep old environment for quick rollback
    console.log(`💡 ${currentActive} environment kept for rollback`);
    console.log(`   To rollback: xec blue-green-rollback.js`);
  }
}

main().catch(console.error);
```

### Database Backup Automation

Automated database backup across multiple environments:

```javascript
// db-backup.js
import { $ } from '@xec-sh/core';
import { format } from 'date-fns';

const databases = [
  {
    name: 'production',
    ssh: { host: 'prod-db.example.com', username: 'backup' },
    db: { host: 'localhost', port: 5432, name: 'myapp', user: 'postgres' }
  },
  {
    name: 'staging',
    ssh: { host: 'staging-db.example.com', username: 'backup' },
    db: { host: 'localhost', port: 5432, name: 'myapp_staging', user: 'postgres' }
  }
];

const s3Bucket = 's3://mycompany-backups/databases';

async function backupDatabase(config) {
  const timestamp = format(new Date(), 'yyyy-MM-dd-HHmmss');
  const filename = `${config.name}-${config.db.name}-${timestamp}.sql.gz`;
  
  console.log(`📦 Backing up ${config.name} database...`);
  
  // Create SSH tunnel to database
  const ssh = $.ssh(config.ssh);
  const tunnel = await ssh.tunnel({
    localPort: 0,
    remoteHost: config.db.host,
    remotePort: config.db.port
  });
  
  try {
    // Dump database through tunnel
    await $`PGPASSWORD=${process.env.DB_PASSWORD} pg_dump \
      -h localhost \
      -p ${tunnel.localPort} \
      -U ${config.db.user} \
      -d ${config.db.name} \
      --no-owner \
      --no-acl \
      | gzip > /tmp/${filename}`;
    
    // Calculate checksum
    const checksum = await $`sha256sum /tmp/${filename} | cut -d' ' -f1`;
    
    // Upload to S3
    await $`aws s3 cp /tmp/${filename} ${s3Bucket}/${config.name}/${filename}`;
    
    // Upload checksum
    await $`echo "${checksum.stdout.trim()}" | aws s3 cp - ${s3Bucket}/${config.name}/${filename}.sha256`;
    
    // Verify upload
    const size = await $`aws s3 ls ${s3Bucket}/${config.name}/${filename} | awk '{print $3}'`;
    
    // Clean up local file
    await $`rm -f /tmp/${filename}`;
    
    // Log success
    console.log(`✅ ${config.name}: ${filename} (${parseInt(size.stdout) / 1024 / 1024}MB)`);
    
    return {
      environment: config.name,
      filename,
      size: parseInt(size.stdout),
      checksum: checksum.stdout.trim(),
      timestamp: new Date()
    };
  } finally {
    await tunnel.close();
  }
}

async function cleanupOldBackups(environment, retentionDays = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  console.log(`🧹 Cleaning up ${environment} backups older than ${retentionDays} days...`);
  
  // List old backups
  const oldBackups = await $`aws s3 ls ${s3Bucket}/${environment}/ \
    | awk '$1 < "${format(cutoffDate, 'yyyy-MM-dd')}" {print $4}'`;
  
  const files = oldBackups.stdout.trim().split('\n').filter(f => f);
  
  if (files.length > 0) {
    // Delete old files
    for (const file of files) {
      await $`aws s3 rm ${s3Bucket}/${environment}/${file}`;
      await $`aws s3 rm ${s3Bucket}/${environment}/${file}.sha256`.nothrow();
    }
    console.log(`  Deleted ${files.length} old backups`);
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting database backup job...\n');
  
  const results = [];
  
  // Backup all databases
  for (const db of databases) {
    try {
      const result = await backupDatabase(db);
      results.push(result);
    } catch (error) {
      console.error(`❌ Failed to backup ${db.name}: ${error.message}`);
      results.push({
        environment: db.name,
        error: error.message,
        timestamp: new Date()
      });
    }
  }
  
  // Cleanup old backups
  for (const db of databases) {
    await cleanupOldBackups(db.name);
  }
  
  // Send summary notification
  const successful = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;
  
  const summary = {
    timestamp: new Date().toISOString(),
    successful,
    failed,
    totalSize: results.reduce((sum, r) => sum + (r.size || 0), 0),
    details: results
  };
  
  // Send to Slack
  await $`curl -X POST ${process.env.SLACK_WEBHOOK} \
    -H "Content-Type: application/json" \
    -d '${JSON.stringify({
      text: `Database Backup: ${successful} successful, ${failed} failed`,
      attachments: [{
        color: failed > 0 ? 'danger' : 'good',
        fields: results.map(r => ({
          title: r.environment,
          value: r.error || `${r.filename} (${(r.size / 1024 / 1024).toFixed(1)}MB)`,
          short: true
        }))
      }]
    })}'`;
  
  console.log('\n📊 Backup Summary:');
  console.log(`  Successful: ${successful}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total Size: ${(summary.totalSize / 1024 / 1024).toFixed(1)}MB`);
}

main().catch(console.error);
```

### Multi-Cloud Deployment

Deploy applications across AWS, GCP, and Azure:

```javascript
// multi-cloud-deploy.js
import { $ } from '@xec-sh/core';
import { select, multiselect, spinner } from '@xec-sh/cli';

const clouds = {
  aws: {
    deploy: async (app, version) => {
      // Update ECS service
      await $`aws ecs update-service \
        --cluster production \
        --service ${app} \
        --force-new-deployment \
        --task-definition ${app}:${version}`;
      
      // Wait for deployment
      await $`aws ecs wait services-stable \
        --cluster production \
        --services ${app}`;
    },
    regions: ['us-east-1', 'eu-west-1', 'ap-southeast-1']
  },
  
  gcp: {
    deploy: async (app, version) => {
      // Deploy to Cloud Run
      await $`gcloud run deploy ${app} \
        --image gcr.io/myproject/${app}:${version} \
        --platform managed \
        --region us-central1`;
    },
    regions: ['us-central1', 'europe-west1', 'asia-east1']
  },
  
  azure: {
    deploy: async (app, version) => {
      // Deploy to App Service
      await $`az webapp config container set \
        --resource-group production \
        --name ${app} \
        --docker-custom-image-name myregistry.azurecr.io/${app}:${version}`;
      
      await $`az webapp restart \
        --resource-group production \
        --name ${app}`;
    },
    regions: ['eastus', 'westeurope', 'southeastasia']
  }
};

async function deployToCloud(provider, app, version, regions) {
  const spin = spinner(`Deploying to ${provider}...`);
  
  try {
    // Deploy to each region
    for (const region of regions) {
      spin.text = `Deploying to ${provider} - ${region}...`;
      
      if (provider === 'aws') {
        process.env.AWS_DEFAULT_REGION = region;
      } else if (provider === 'gcp') {
        await $`gcloud config set compute/region ${region}`;
      }
      
      await clouds[provider].deploy(app, version);
    }
    
    spin.succeed(`${provider} deployment complete`);
    return { provider, status: 'success', regions };
  } catch (error) {
    spin.fail(`${provider} deployment failed`);
    return { provider, status: 'failed', error: error.message };
  }
}

async function verifyDeployment(provider, app, region) {
  const healthChecks = {
    aws: async () => {
      const tasks = await $`aws ecs list-tasks \
        --cluster production \
        --service-name ${app} \
        --desired-status RUNNING \
        --region ${region}`;
      return JSON.parse(tasks.stdout).taskArns.length > 0;
    },
    
    gcp: async () => {
      const service = await $`gcloud run services describe ${app} \
        --platform managed \
        --region ${region} \
        --format json`;
      const data = JSON.parse(service.stdout);
      return data.status.conditions.some(c => c.type === 'Ready' && c.status === 'True');
    },
    
    azure: async () => {
      const health = await $`az webapp show \
        --resource-group production \
        --name ${app} \
        --query state \
        --output tsv`;
      return health.stdout.trim() === 'Running';
    }
  };
  
  return healthChecks[provider]();
}

// Main deployment workflow
async function main() {
  const app = await select('Select application:', [
    'web-frontend',
    'api-service',
    'worker-service'
  ]);
  
  const version = process.argv[2] || 'latest';
  
  const providers = await multiselect('Select cloud providers:', [
    'aws',
    'gcp',
    'azure'
  ]);
  
  console.log(`\n🚀 Deploying ${app}:${version} to ${providers.join(', ')}\n`);
  
  // Deploy to all selected clouds in parallel
  const deployments = await Promise.all(
    providers.map(provider => 
      deployToCloud(provider, app, version, clouds[provider].regions)
    )
  );
  
  // Verify deployments
  console.log('\n🔍 Verifying deployments...\n');
  
  for (const deployment of deployments) {
    if (deployment.status === 'success') {
      const verifications = await Promise.all(
        deployment.regions.map(async region => {
          const healthy = await verifyDeployment(deployment.provider, app, region);
          return { region, healthy };
        })
      );
      
      console.log(`${deployment.provider}:`);
      verifications.forEach(({ region, healthy }) => {
        console.log(`  ${region}: ${healthy ? '✅' : '❌'}`);
      });
    }
  }
  
  // Summary
  const successful = deployments.filter(d => d.status === 'success').length;
  const failed = deployments.filter(d => d.status === 'failed').length;
  
  console.log(`\n📊 Deployment Summary:`);
  console.log(`  Successful: ${successful}/${providers.length}`);
  if (failed > 0) {
    console.log(`  Failed: ${failed}`);
    deployments
      .filter(d => d.status === 'failed')
      .forEach(d => console.log(`    ${d.provider}: ${d.error}`));
  }
}

main().catch(console.error);
```

## Monitoring & Observability

### Distributed Log Aggregation

Collect and analyze logs from multiple sources:

```javascript
// log-aggregator.js
import { $ } from '@xec-sh/core';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

class LogAggregator {
  constructor() {
    this.sources = [];
    this.streams = [];
    this.outputStream = null;
  }
  
  addSource(source) {
    this.sources.push(source);
  }
  
  async start(outputFile) {
    this.outputStream = createWriteStream(outputFile);
    
    // Start streaming from all sources
    for (const source of this.sources) {
      const stream = await this.createStream(source);
      this.streams.push(stream);
    }
    
    console.log(`📊 Aggregating logs from ${this.sources.length} sources...`);
  }
  
  async createStream(source) {
    switch (source.type) {
      case 'ssh':
        return this.streamSSHLogs(source);
      
      case 'docker':
        return this.streamDockerLogs(source);
      
      case 'kubernetes':
        return this.streamK8sLogs(source);
      
      case 's3':
        return this.streamS3Logs(source);
    }
  }
  
  async streamSSHLogs(source) {
    const ssh = $.ssh(source.connection);
    const command = `tail -f ${source.path} | while read line; do echo "[${source.name}] $(date -u +%Y-%m-%dT%H:%M:%S.%3NZ) $line"; done`;
    
    const proc = ssh.raw`${command}`;
    proc.stdout.pipe(this.outputStream, { end: false });
    
    return {
      type: 'ssh',
      name: source.name,
      stop: () => proc.kill()
    };
  }
  
  async streamDockerLogs(source) {
    const container = await $.docker({ name: source.container }).start();
    
    await container.streamLogs((log) => {
      const formatted = `[${source.name}] ${new Date().toISOString()} ${log}`;
      this.outputStream.write(formatted);
    }, { follow: true, timestamps: false });
    
    return {
      type: 'docker',
      name: source.name,
      stop: () => container.stop()
    };
  }
  
  async streamK8sLogs(source) {
    const k8s = $.k8s({ namespace: source.namespace });
    const pod = k8s.pod(source.pod);
    
    const stream = await pod.streamLogs((log) => {
      const formatted = `[${source.name}] ${new Date().toISOString()} ${log}`;
      this.outputStream.write(formatted);
    }, {
      container: source.container,
      follow: true,
      timestamps: false
    });
    
    return {
      type: 'kubernetes',
      name: source.name,
      stop: () => stream.stop()
    };
  }
  
  async streamS3Logs(source) {
    // Poll S3 for new log files
    const pollInterval = setInterval(async () => {
      const files = await $`aws s3 ls ${source.bucket}/${source.prefix} --recursive | tail -10`;
      
      for (const file of files.stdout.trim().split('\n')) {
        const filename = file.split(' ').pop();
        if (!this.processedFiles.has(filename)) {
          const content = await $`aws s3 cp s3://${source.bucket}/${filename} -`;
          
          content.stdout.split('\n').forEach(line => {
            if (line.trim()) {
              const formatted = `[${source.name}] ${line}`;
              this.outputStream.write(formatted + '\n');
            }
          });
          
          this.processedFiles.add(filename);
        }
      }
    }, source.pollInterval || 60000);
    
    return {
      type: 's3',
      name: source.name,
      stop: () => clearInterval(pollInterval)
    };
  }
  
  async stop() {
    // Stop all streams
    for (const stream of this.streams) {
      await stream.stop();
    }
    
    // Close output
    this.outputStream.end();
  }
  
  processedFiles = new Set();
}

// Usage example
async function main() {
  const aggregator = new LogAggregator();
  
  // Add various log sources
  aggregator.addSource({
    type: 'ssh',
    name: 'web-server-1',
    connection: { host: 'web1.example.com' },
    path: '/var/log/nginx/access.log'
  });
  
  aggregator.addSource({
    type: 'docker',
    name: 'api-service',
    container: 'api-prod'
  });
  
  aggregator.addSource({
    type: 'kubernetes',
    name: 'worker-service',
    namespace: 'production',
    pod: 'worker-7f8b9d-x2j4k',
    container: 'worker'
  });
  
  aggregator.addSource({
    type: 's3',
    name: 'cloudfront-logs',
    bucket: 'my-cloudfront-logs',
    prefix: 'cdn/2024-01-15/',
    pollInterval: 30000
  });
  
  // Start aggregation
  await aggregator.start('./aggregated-logs.jsonl');
  
  // Run analysis periodically
  setInterval(async () => {
    const errorCount = await $`grep -c ERROR ./aggregated-logs.jsonl || echo 0`;
    const requestCount = await $`wc -l < ./aggregated-logs.jsonl`;
    
    console.log(`📈 Stats - Requests: ${requestCount.stdout.trim()}, Errors: ${errorCount.stdout.trim()}`);
  }, 60000);
  
  // Stop on signal
  process.on('SIGINT', async () => {
    console.log('\n📛 Stopping log aggregation...');
    await aggregator.stop();
    process.exit(0);
  });
}

main().catch(console.error);
```

### Health Check Dashboard

Real-time health monitoring across services:

```javascript
// health-dashboard.js
import { $ } from '@xec-sh/core';
import blessed from 'blessed';

class HealthDashboard {
  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Service Health Dashboard'
    });
    
    this.services = new Map();
    this.setupUI();
  }
  
  setupUI() {
    // Header
    this.header = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}Service Health Dashboard{/center}',
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue'
      }
    });
    
    // Service list
    this.serviceList = blessed.list({
      top: 3,
      left: 0,
      width: '50%',
      height: '50%-3',
      label: ' Services ',
      border: { type: 'line' },
      style: {
        selected: { bg: 'blue' }
      }
    });
    
    // Details panel
    this.details = blessed.box({
      top: 3,
      left: '50%',
      width: '50%',
      height: '50%-3',
      label: ' Details ',
      border: { type: 'line' },
      scrollable: true,
      alwaysScroll: true,
      tags: true
    });
    
    // Logs panel
    this.logs = blessed.log({
      bottom: 0,
      left: 0,
      width: '100%',
      height: '50%',
      label: ' Recent Events ',
      border: { type: 'line' },
      scrollable: true,
      alwaysScroll: true
    });
    
    // Add to screen
    this.screen.append(this.header);
    this.screen.append(this.serviceList);
    this.screen.append(this.details);
    this.screen.append(this.logs);
    
    // Key bindings
    this.screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
    this.serviceList.key(['up', 'down'], () => this.updateDetails());
    
    this.screen.render();
  }
  
  addService(name, checkFn) {
    this.services.set(name, {
      name,
      checkFn,
      status: 'unknown',
      lastCheck: null,
      lastError: null,
      metrics: {}
    });
  }
  
  async checkService(name) {
    const service = this.services.get(name);
    
    try {
      const start = Date.now();
      const result = await service.checkFn();
      const duration = Date.now() - start;
      
      service.status = 'healthy';
      service.lastCheck = new Date();
      service.lastError = null;
      service.metrics = {
        ...result.metrics,
        responseTime: duration
      };
      
      this.log(`✅ ${name} - Healthy (${duration}ms)`);
    } catch (error) {
      service.status = 'unhealthy';
      service.lastCheck = new Date();
      service.lastError = error.message;
      
      this.log(`❌ ${name} - Error: ${error.message}`);
    }
    
    this.updateServiceList();
  }
  
  updateServiceList() {
    const items = Array.from(this.services.values()).map(service => {
      const icon = {
        healthy: '{green-fg}●{/green-fg}',
        unhealthy: '{red-fg}●{/red-fg}',
        unknown: '{yellow-fg}●{/yellow-fg}'
      }[service.status];
      
      return `${icon} ${service.name}`;
    });
    
    this.serviceList.setItems(items);
    this.screen.render();
  }
  
  updateDetails() {
    const selected = this.serviceList.selected;
    const service = Array.from(this.services.values())[selected];
    
    if (!service) return;
    
    let content = `{bold}${service.name}{/bold}\n\n`;
    content += `Status: ${this.getStatusTag(service.status)}\n`;
    content += `Last Check: ${service.lastCheck ? service.lastCheck.toLocaleString() : 'Never'}\n`;
    
    if (service.metrics) {
      content += '\n{bold}Metrics:{/bold}\n';
      Object.entries(service.metrics).forEach(([key, value]) => {
        content += `  ${key}: ${value}\n`;
      });
    }
    
    if (service.lastError) {
      content += `\n{red-fg}Error: ${service.lastError}{/red-fg}\n`;
    }
    
    this.details.setContent(content);
    this.screen.render();
  }
  
  getStatusTag(status) {
    const tags = {
      healthy: '{green-fg}Healthy{/green-fg}',
      unhealthy: '{red-fg}Unhealthy{/red-fg}',
      unknown: '{yellow-fg}Unknown{/yellow-fg}'
    };
    return tags[status];
  }
  
  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    this.logs.log(`[${timestamp}] ${message}`);
  }
  
  async start() {
    // Check all services periodically
    setInterval(() => {
      this.services.forEach((_, name) => this.checkService(name));
    }, 10000);
    
    // Initial check
    this.services.forEach((_, name) => this.checkService(name));
  }
}

// Define service checks
const serviceChecks = {
  'Web Frontend': async () => {
    const response = await $`curl -s -o /dev/null -w "%{http_code}" https://example.com`;
    const code = parseInt(response.stdout);
    
    if (code !== 200) {
      throw new Error(`HTTP ${code}`);
    }
    
    return {
      metrics: {
        statusCode: code
      }
    };
  },
  
  'API Service': async () => {
    const start = Date.now();
    const health = await $`curl -s https://api.example.com/health`;
    const data = JSON.parse(health.stdout);
    
    if (data.status !== 'ok') {
      throw new Error(data.error || 'Health check failed');
    }
    
    return {
      metrics: {
        version: data.version,
        uptime: data.uptime,
        memory: `${Math.round(data.memory / 1024 / 1024)}MB`
      }
    };
  },
  
  'Database (Primary)': async () => {
    const ssh = $.ssh({ host: 'db-primary.example.com' });
    const result = await ssh`pg_isready -U postgres`;
    
    const status = await ssh`psql -U postgres -t -c "SELECT count(*) FROM pg_stat_replication"`;
    const replicas = parseInt(status.stdout);
    
    return {
      metrics: {
        replicas,
        status: 'accepting connections'
      }
    };
  },
  
  'Redis Cache': async () => {
    const info = await $`redis-cli -h redis.example.com INFO server`;
    const lines = info.stdout.split('\n');
    const version = lines.find(l => l.startsWith('redis_version:'))?.split(':')[1];
    
    const memory = await $`redis-cli -h redis.example.com INFO memory | grep used_memory_human`;
    const memUsage = memory.stdout.split(':')[1]?.trim();
    
    return {
      metrics: {
        version,
        memory: memUsage
      }
    };
  },
  
  'Kubernetes Cluster': async () => {
    const nodes = await $`kubectl get nodes -o json`;
    const nodeData = JSON.parse(nodes.stdout);
    
    const ready = nodeData.items.filter(n => 
      n.status.conditions.some(c => c.type === 'Ready' && c.status === 'True')
    ).length;
    
    if (ready < nodeData.items.length) {
      throw new Error(`Only ${ready}/${nodeData.items.length} nodes ready`);
    }
    
    return {
      metrics: {
        nodes: nodeData.items.length,
        ready
      }
    };
  },
  
  'Message Queue': async () => {
    const stats = await $`rabbitmqctl -q status`;
    
    const queues = await $`rabbitmqctl list_queues -q | wc -l`;
    const messages = await $`rabbitmqctl list_queues -q messages | awk '{sum += $2} END {print sum}'`;
    
    return {
      metrics: {
        queues: parseInt(queues.stdout),
        messages: parseInt(messages.stdout) || 0
      }
    };
  }
};

// Start dashboard
async function main() {
  const dashboard = new HealthDashboard();
  
  // Add all services
  Object.entries(serviceChecks).forEach(([name, check]) => {
    dashboard.addService(name, check);
  });
  
  // Start monitoring
  await dashboard.start();
}

main().catch(console.error);
```

## Development Workflows

### Automated Testing Pipeline

Comprehensive testing across environments:

```javascript
// test-pipeline.js
import { $ } from '@xec-sh/core';
import { spinner, table } from '@xec-sh/cli';
import chalk from 'chalk';

class TestPipeline {
  constructor() {
    this.stages = [];
    this.results = [];
  }
  
  addStage(name, tests) {
    this.stages.push({ name, tests });
  }
  
  async runStage(stage) {
    console.log(chalk.bold(`\n🧪 ${stage.name}`));
    const stageResults = [];
    
    for (const test of stage.tests) {
      const spin = spinner(`Running ${test.name}...`);
      const start = Date.now();
      
      try {
        await test.run();
        const duration = Date.now() - start;
        
        spin.succeed(`${test.name} (${duration}ms)`);
        stageResults.push({
          test: test.name,
          status: 'passed',
          duration
        });
      } catch (error) {
        const duration = Date.now() - start;
        
        spin.fail(`${test.name} (${duration}ms)`);
        stageResults.push({
          test: test.name,
          status: 'failed',
          duration,
          error: error.message
        });
        
        if (test.required) {
          throw new Error(`Required test failed: ${test.name}`);
        }
      }
    }
    
    return stageResults;
  }
  
  async run() {
    console.log(chalk.bold.blue('🚀 Starting Test Pipeline\n'));
    const startTime = Date.now();
    
    for (const stage of this.stages) {
      try {
        const results = await this.runStage(stage);
        this.results.push({ stage: stage.name, results });
      } catch (error) {
        console.error(chalk.red(`\n❌ Pipeline failed: ${error.message}`));
        break;
      }
    }
    
    const totalTime = Date.now() - startTime;
    this.printSummary(totalTime);
  }
  
  printSummary(totalTime) {
    console.log(chalk.bold('\n📊 Test Summary\n'));
    
    const allTests = this.results.flatMap(r => 
      r.results.map(test => ({ ...test, stage: r.stage }))
    );
    
    const passed = allTests.filter(t => t.status === 'passed').length;
    const failed = allTests.filter(t => t.status === 'failed').length;
    
    // Summary table
    console.log(table([
      ['Stage', 'Passed', 'Failed', 'Total'],
      ...this.results.map(r => [
        r.stage,
        r.results.filter(t => t.status === 'passed').length,
        r.results.filter(t => t.status === 'failed').length,
        r.results.length
      ])
    ]));
    
    console.log(`\nTotal: ${passed} passed, ${failed} failed`);
    console.log(`Duration: ${(totalTime / 1000).toFixed(1)}s`);
    
    // Failed tests details
    if (failed > 0) {
      console.log(chalk.red('\nFailed Tests:'));
      allTests
        .filter(t => t.status === 'failed')
        .forEach(t => {
          console.log(`  ${t.stage} > ${t.test}: ${t.error}`);
        });
    }
  }
}

// Define test stages
const pipeline = new TestPipeline();

// Stage 1: Unit Tests
pipeline.addStage('Unit Tests', [
  {
    name: 'Core Library Tests',
    required: true,
    run: async () => {
      await $`npm test -- --testMatch="**/unit/**/*.test.js"`;
    }
  },
  {
    name: 'API Tests',
    required: true,
    run: async () => {
      await $`npm test -- --testMatch="**/api/**/*.test.js"`;
    }
  }
]);

// Stage 2: Integration Tests
pipeline.addStage('Integration Tests', [
  {
    name: 'Database Integration',
    run: async () => {
      // Start test database
      const db = await $.docker({
        image: 'postgres:15',
        name: 'test-db',
        env: { POSTGRES_PASSWORD: 'test' },
        ports: { 5432: 5432 }
      }).start();
      
      try {
        await db.waitForHealthy();
        await $`npm test -- --testMatch="**/integration/db/**/*.test.js"`;
      } finally {
        await db.remove(true);
      }
    }
  },
  {
    name: 'Redis Integration',
    run: async () => {
      const redis = await $.docker({
        image: 'redis:7',
        name: 'test-redis',
        ports: { 6379: 6379 }
      }).start();
      
      try {
        await $`npm test -- --testMatch="**/integration/redis/**/*.test.js"`;
      } finally {
        await redis.remove(true);
      }
    }
  }
]);

// Stage 3: E2E Tests
pipeline.addStage('E2E Tests', [
  {
    name: 'Chrome E2E',
    run: async () => {
      await $`npm run test:e2e -- --browser=chrome`;
    }
  },
  {
    name: 'Firefox E2E',
    run: async () => {
      await $`npm run test:e2e -- --browser=firefox`;
    }
  }
]);

// Stage 4: Performance Tests
pipeline.addStage('Performance Tests', [
  {
    name: 'Load Testing',
    run: async () => {
      // Start application
      const app = await $.docker({
        image: 'myapp:test',
        name: 'perf-test-app',
        ports: { 3000: 3000 }
      }).start();
      
      try {
        await app.waitForHealthy();
        
        // Run k6 load test
        await $`k6 run --vus 100 --duration 30s ./tests/performance/load.js`;
      } finally {
        await app.remove(true);
      }
    }
  },
  {
    name: 'Memory Leak Detection',
    run: async () => {
      const result = await $`npm run test:memory -- --max-old-space-size=512`;
      
      // Check for memory leaks
      const memoryUsage = await $`cat memory-report.json | jq '.heap.used'`;
      const leaked = parseInt(memoryUsage.stdout) > 400 * 1024 * 1024;
      
      if (leaked) {
        throw new Error('Possible memory leak detected');
      }
    }
  }
]);

// Stage 5: Security Tests
pipeline.addStage('Security Tests', [
  {
    name: 'Dependency Audit',
    required: true,
    run: async () => {
      const audit = await $`npm audit --json`;
      const report = JSON.parse(audit.stdout);
      
      if (report.metadata.vulnerabilities.high > 0 || report.metadata.vulnerabilities.critical > 0) {
        throw new Error(`Found ${report.metadata.vulnerabilities.high} high and ${report.metadata.vulnerabilities.critical} critical vulnerabilities`);
      }
    }
  },
  {
    name: 'OWASP ZAP Scan',
    run: async () => {
      // Start application
      const app = await $.docker({
        image: 'myapp:test',
        name: 'security-test-app',
        ports: { 3000: 3000 }
      }).start();
      
      try {
        await app.waitForHealthy();
        
        // Run OWASP ZAP
        await $`docker run --rm -t owasp/zap2docker-stable zap-baseline.py \
          -t http://host.docker.internal:3000 \
          -r zap-report.html`;
      } finally {
        await app.remove(true);
      }
    }
  }
]);

// Run pipeline
pipeline.run().catch(error => {
  console.error(error);
  process.exit(1);
});
```

### Microservices Development

Local development environment for microservices:

```javascript
// dev-environment.js
import { $ } from '@xec-sh/core';
import { select, confirm, spinner } from '@xec-sh/cli';
import chokidar from 'chokidar';

class MicroservicesDevEnv {
  constructor() {
    this.services = new Map();
    this.networks = new Map();
    this.volumes = new Map();
    this.watchers = new Map();
  }
  
  async init() {
    // Create shared network
    await $`docker network create microservices-dev || true`;
    this.networks.set('default', 'microservices-dev');
    
    // Create shared volumes
    await $`docker volume create postgres-data || true`;
    await $`docker volume create redis-data || true`;
    
    // Start infrastructure services
    await this.startInfrastructure();
  }
  
  async startInfrastructure() {
    console.log('🏗️  Starting infrastructure services...\n');
    
    // PostgreSQL
    const postgres = await $.docker({
      image: 'postgres:15',
      name: 'dev-postgres',
      env: {
        POSTGRES_PASSWORD: 'dev',
        POSTGRES_DB: 'microservices'
      },
      ports: { 5432: 5432 },
      volumes: { 'postgres-data': '/var/lib/postgresql/data' },
      network: 'microservices-dev'
    }).start();
    
    this.services.set('postgres', postgres);
    
    // Redis
    const redis = await $.docker({
      image: 'redis:7-alpine',
      name: 'dev-redis',
      ports: { 6379: 6379 },
      volumes: { 'redis-data': '/data' },
      network: 'microservices-dev'
    }).start();
    
    this.services.set('redis', redis);
    
    // RabbitMQ
    const rabbitmq = await $.docker({
      image: 'rabbitmq:3-management',
      name: 'dev-rabbitmq',
      env: {
        RABBITMQ_DEFAULT_USER: 'dev',
        RABBITMQ_DEFAULT_PASS: 'dev'
      },
      ports: {
        5672: 5672,
        15672: 15672
      },
      network: 'microservices-dev'
    }).start();
    
    this.services.set('rabbitmq', rabbitmq);
    
    // Wait for all to be healthy
    await Promise.all([
      postgres.waitForHealthy(),
      redis.waitForHealthy(),
      rabbitmq.waitForHealthy()
    ]);
    
    console.log('✅ Infrastructure ready\n');
  }
  
  async startService(name, config) {
    const spin = spinner(`Starting ${name}...`);
    
    try {
      // Build service
      await $`docker build -t ${name}:dev ${config.path}`;
      
      // Start container
      const container = await $.docker({
        image: `${name}:dev`,
        name: `dev-${name}`,
        env: {
          NODE_ENV: 'development',
          DATABASE_URL: 'postgres://postgres:dev@dev-postgres:5432/microservices',
          REDIS_URL: 'redis://dev-redis:6379',
          RABBITMQ_URL: 'amqp://dev:dev@dev-rabbitmq:5672',
          ...config.env
        },
        ports: config.ports,
        volumes: {
          [`${config.path}/src`]: '/app/src',
          [`${config.path}/public`]: '/app/public'
        },
        network: 'microservices-dev',
        command: config.command || 'npm run dev'
      }).start();
      
      this.services.set(name, container);
      
      // Set up file watcher for auto-reload
      if (config.watch) {
        const watcher = chokidar.watch(config.watch, {
          ignored: /node_modules/,
          persistent: true
        });
        
        watcher.on('change', async (path) => {
          console.log(`📝 ${name}: ${path} changed, reloading...`);
          await container.exec`${config.reload || 'npm run reload'}`;
        });
        
        this.watchers.set(name, watcher);
      }
      
      spin.succeed(`${name} started on port ${Object.keys(config.ports)[0]}`);
    } catch (error) {
      spin.fail(`Failed to start ${name}: ${error.message}`);
      throw error;
    }
  }
  
  async stopService(name) {
    const container = this.services.get(name);
    if (container) {
      await container.stop();
      await container.remove();
      this.services.delete(name);
    }
    
    const watcher = this.watchers.get(name);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(name);
    }
  }
  
  async logs(service) {
    const container = this.services.get(service);
    if (!container) {
      console.error(`Service ${service} not running`);
      return;
    }
    
    await container.follow((log) => {
      console.log(`[${service}] ${log.trim()}`);
    });
  }
  
  async status() {
    console.log('\n📊 Service Status:\n');
    
    for (const [name, container] of this.services) {
      try {
        const info = await container.inspect();
        const status = info.State.Status;
        const health = info.State.Health?.Status || 'none';
        
        console.log(`${name}:`);
        console.log(`  Status: ${status}`);
        console.log(`  Health: ${health}`);
        
        if (container.ports) {
          console.log(`  Ports: ${Object.entries(container.ports).map(([k, v]) => `${v}:${k}`).join(', ')}`);
        }
      } catch (error) {
        console.log(`${name}: ❌ Error`);
      }
    }
  }
  
  async cleanup() {
    console.log('\n🧹 Cleaning up development environment...\n');
    
    // Stop all services
    for (const [name, container] of this.services) {
      await container.stop();
      await container.remove();
    }
    
    // Close watchers
    for (const watcher of this.watchers.values()) {
      await watcher.close();
    }
    
    // Remove network (optional)
    if (await confirm('Remove Docker network and volumes?')) {
      await $`docker network rm microservices-dev`;
      await $`docker volume rm postgres-data redis-data`;
    }
  }
}

// Service configurations
const serviceConfigs = {
  'api-gateway': {
    path: './services/api-gateway',
    ports: { 3000: 3000 },
    env: { PORT: '3000' },
    watch: './services/api-gateway/src/**/*.js'
  },
  'auth-service': {
    path: './services/auth',
    ports: { 3001: 3001 },
    env: { PORT: '3001', JWT_SECRET: 'dev-secret' },
    watch: './services/auth/src/**/*.js'
  },
  'user-service': {
    path: './services/users',
    ports: { 3002: 3002 },
    env: { PORT: '3002' },
    watch: './services/users/src/**/*.js'
  },
  'order-service': {
    path: './services/orders',
    ports: { 3003: 3003 },
    env: { PORT: '3003' },
    watch: './services/orders/src/**/*.js'
  },
  'notification-service': {
    path: './services/notifications',
    ports: { 3004: 3004 },
    env: { PORT: '3004' },
    watch: './services/notifications/src/**/*.js',
    command: 'npm run dev:worker'
  }
};

// Interactive CLI
async function main() {
  const env = new MicroservicesDevEnv();
  
  // Initialize infrastructure
  await env.init();
  
  // Interactive menu
  while (true) {
    const action = await select('\nWhat would you like to do?', [
      'Start service',
      'Stop service',
      'View logs',
      'Service status',
      'Start all services',
      'Stop all services',
      'Exit'
    ]);
    
    switch (action) {
      case 'Start service':
        const toStart = await select('Select service:', Object.keys(serviceConfigs));
        await env.startService(toStart, serviceConfigs[toStart]);
        break;
      
      case 'Stop service':
        const running = Array.from(env.services.keys()).filter(s => !['postgres', 'redis', 'rabbitmq'].includes(s));
        if (running.length === 0) {
          console.log('No services running');
          break;
        }
        const toStop = await select('Select service:', running);
        await env.stopService(toStop);
        break;
      
      case 'View logs':
        const forLogs = Array.from(env.services.keys());
        const service = await select('Select service:', forLogs);
        console.log(`\nStreaming logs for ${service} (Ctrl+C to stop)...\n`);
        await env.logs(service);
        break;
      
      case 'Service status':
        await env.status();
        break;
      
      case 'Start all services':
        for (const [name, config] of Object.entries(serviceConfigs)) {
          await env.startService(name, config);
        }
        break;
      
      case 'Stop all services':
        for (const name of Object.keys(serviceConfigs)) {
          await env.stopService(name);
        }
        break;
      
      case 'Exit':
        await env.cleanup();
        process.exit(0);
    }
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\nReceived interrupt signal...');
  await env.cleanup();
  process.exit(0);
});

main().catch(console.error);
```

## Data Processing

### ETL Pipeline

Extract, Transform, Load pipeline across environments:

```javascript
// etl-pipeline.js
import { $ } from '@xec-sh/core';
import { Transform } from 'stream';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import csvParser from 'csv-parser';
import { format } from 'date-fns';

class ETLPipeline {
  constructor(config) {
    this.config = config;
    this.stats = {
      extracted: 0,
      transformed: 0,
      loaded: 0,
      errors: 0
    };
  }
  
  // Extract data from various sources
  async extract() {
    console.log('📥 Extracting data...\n');
    const extractors = [];
    
    // MySQL extraction
    if (this.config.sources.mysql) {
      extractors.push(this.extractMySQL());
    }
    
    // S3 extraction
    if (this.config.sources.s3) {
      extractors.push(this.extractS3());
    }
    
    // API extraction
    if (this.config.sources.api) {
      extractors.push(this.extractAPI());
    }
    
    // MongoDB extraction
    if (this.config.sources.mongodb) {
      extractors.push(this.extractMongoDB());
    }
    
    const results = await Promise.all(extractors);
    return results.flat();
  }
  
  async extractMySQL() {
    const { host, database, table, query } = this.config.sources.mysql;
    
    // Create SSH tunnel if needed
    let tunnel;
    if (host.includes('@')) {
      const [user, hostname] = host.split('@');
      const ssh = $.ssh({ host: hostname, username: user });
      tunnel = await ssh.tunnel({
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 3306
      });
    }
    
    try {
      const port = tunnel ? tunnel.localPort : 3306;
      const actualQuery = query || `SELECT * FROM ${table}`;
      
      // Export to CSV
      const filename = `/tmp/mysql-export-${Date.now()}.csv`;
      await $`mysql -h localhost -P ${port} -u ${this.config.sources.mysql.user} \
        -p${this.config.sources.mysql.password} ${database} \
        -e "${actualQuery}" \
        --batch --raw > ${filename}`;
      
      // Convert to JSON
      const records = [];
      await pipeline(
        createReadStream(filename),
        csvParser({ separator: '\t' }),
        new Transform({
          objectMode: true,
          transform(record, encoding, callback) {
            records.push(record);
            callback();
          }
        })
      );
      
      this.stats.extracted += records.length;
      console.log(`  MySQL: Extracted ${records.length} records`);
      
      // Cleanup
      await $`rm ${filename}`;
      
      return records;
    } finally {
      if (tunnel) await tunnel.close();
    }
  }
  
  async extractS3() {
    const { bucket, prefix, pattern } = this.config.sources.s3;
    const records = [];
    
    // List files
    const files = await $`aws s3 ls s3://${bucket}/${prefix} --recursive | grep "${pattern}" | awk '{print $4}'`;
    const fileList = files.stdout.trim().split('\n').filter(f => f);
    
    console.log(`  S3: Processing ${fileList.length} files`);
    
    for (const file of fileList) {
      // Download and parse each file
      const content = await $`aws s3 cp s3://${bucket}/${file} -`;
      
      if (file.endsWith('.json')) {
        const data = JSON.parse(content.stdout);
        records.push(...(Array.isArray(data) ? data : [data]));
      } else if (file.endsWith('.csv')) {
        // Parse CSV
        const lines = content.stdout.trim().split('\n');
        const headers = lines[0].split(',');
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          const record = {};
          headers.forEach((h, idx) => {
            record[h] = values[idx];
          });
          records.push(record);
        }
      }
    }
    
    this.stats.extracted += records.length;
    return records;
  }
  
  async extractAPI() {
    const { endpoint, headers, pagination } = this.config.sources.api;
    const records = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const url = pagination ? `${endpoint}?page=${page}&limit=1000` : endpoint;
      
      const response = await $`curl -s -H "${headers}" "${url}"`;
      const data = JSON.parse(response.stdout);
      
      if (pagination) {
        records.push(...data.items);
        hasMore = data.hasMore;
        page++;
      } else {
        records.push(...(Array.isArray(data) ? data : [data]));
        hasMore = false;
      }
    }
    
    console.log(`  API: Extracted ${records.length} records`);
    this.stats.extracted += records.length;
    return records;
  }
  
  async extractMongoDB() {
    const { uri, database, collection, query } = this.config.sources.mongodb;
    
    // Export from MongoDB
    const filename = `/tmp/mongo-export-${Date.now()}.json`;
    await $`mongoexport --uri="${uri}" \
      --db="${database}" \
      --collection="${collection}" \
      --query='${query || "{}"}' \
      --out="${filename}"`;
    
    // Read exported data
    const content = await $`cat ${filename}`;
    const records = content.stdout
      .trim()
      .split('\n')
      .filter(line => line)
      .map(line => JSON.parse(line));
    
    console.log(`  MongoDB: Extracted ${records.length} records`);
    this.stats.extracted += records.length;
    
    // Cleanup
    await $`rm ${filename}`;
    
    return records;
  }
  
  // Transform data
  async transform(records) {
    console.log('\n🔄 Transforming data...\n');
    
    const transformed = [];
    
    for (const record of records) {
      try {
        let result = record;
        
        // Apply transformations
        for (const transform of this.config.transformations) {
          result = await this.applyTransformation(result, transform);
        }
        
        // Validate
        if (this.validateRecord(result)) {
          transformed.push(result);
          this.stats.transformed++;
        } else {
          this.stats.errors++;
        }
      } catch (error) {
        console.error(`  Transform error: ${error.message}`);
        this.stats.errors++;
      }
    }
    
    console.log(`  Transformed: ${this.stats.transformed}, Errors: ${this.stats.errors}`);
    return transformed;
  }
  
  applyTransformation(record, transform) {
    switch (transform.type) {
      case 'rename':
        const newRecord = {};
        for (const [oldKey, newKey] of Object.entries(transform.mapping)) {
          if (record[oldKey] !== undefined) {
            newRecord[newKey] = record[oldKey];
          }
        }
        return newRecord;
      
      case 'calculate':
        return {
          ...record,
          [transform.field]: transform.formula(record)
        };
      
      case 'filter':
        return transform.condition(record) ? record : null;
      
      case 'enrich':
        return {
          ...record,
          ...transform.data
        };
      
      case 'format':
        const formatted = { ...record };
        for (const [field, format] of Object.entries(transform.fields)) {
          if (formatted[field]) {
            formatted[field] = this.formatField(formatted[field], format);
          }
        }
        return formatted;
      
      default:
        return record;
    }
  }
  
  formatField(value, format) {
    switch (format) {
      case 'date':
        return format(new Date(value), 'yyyy-MM-dd');
      case 'datetime':
        return format(new Date(value), 'yyyy-MM-dd HH:mm:ss');
      case 'uppercase':
        return String(value).toUpperCase();
      case 'lowercase':
        return String(value).toLowerCase();
      case 'number':
        return parseFloat(value);
      default:
        return value;
    }
  }
  
  validateRecord(record) {
    if (!record) return false;
    
    // Check required fields
    if (this.config.validation?.required) {
      for (const field of this.config.validation.required) {
        if (!record[field]) return false;
      }
    }
    
    // Check data types
    if (this.config.validation?.types) {
      for (const [field, type] of Object.entries(this.config.validation.types)) {
        if (record[field] && typeof record[field] !== type) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  // Load data to destinations
  async load(records) {
    console.log('\n📤 Loading data...\n');
    
    const loaders = [];
    
    if (this.config.destinations.postgresql) {
      loaders.push(this.loadPostgreSQL(records));
    }
    
    if (this.config.destinations.elasticsearch) {
      loaders.push(this.loadElasticsearch(records));
    }
    
    if (this.config.destinations.s3) {
      loaders.push(this.loadS3(records));
    }
    
    if (this.config.destinations.bigquery) {
      loaders.push(this.loadBigQuery(records));
    }
    
    await Promise.all(loaders);
  }
  
  async loadPostgreSQL(records) {
    const { host, database, table } = this.config.destinations.postgresql;
    
    // Create temporary CSV
    const filename = `/tmp/postgres-load-${Date.now()}.csv`;
    const headers = Object.keys(records[0]);
    
    const csvContent = [
      headers.join(','),
      ...records.map(r => headers.map(h => r[h] || '').join(','))
    ].join('\n');
    
    await $`echo ${csvContent} > ${filename}`;
    
    // Create SSH tunnel if needed
    let tunnel;
    if (host.includes('@')) {
      const [user, hostname] = host.split('@');
      const ssh = $.ssh({ host: hostname, username: user });
      tunnel = await ssh.tunnel({
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 5432
      });
    }
    
    try {
      const port = tunnel ? tunnel.localPort : 5432;
      
      // Load data
      await $`PGPASSWORD=${this.config.destinations.postgresql.password} psql \
        -h localhost \
        -p ${port} \
        -U ${this.config.destinations.postgresql.user} \
        -d ${database} \
        -c "\\COPY ${table} (${headers.join(',')}) FROM '${filename}' WITH CSV HEADER"`;
      
      this.stats.loaded += records.length;
      console.log(`  PostgreSQL: Loaded ${records.length} records`);
    } finally {
      if (tunnel) await tunnel.close();
      await $`rm ${filename}`;
    }
  }
  
  async loadElasticsearch(records) {
    const { host, index } = this.config.destinations.elasticsearch;
    
    // Prepare bulk request
    const bulkData = [];
    for (const record of records) {
      bulkData.push({ index: { _index: index } });
      bulkData.push(record);
    }
    
    const bulkFile = `/tmp/es-bulk-${Date.now()}.json`;
    await $`echo ${bulkData.map(d => JSON.stringify(d)).join('\n')} > ${bulkFile}`;
    
    // Load to Elasticsearch
    await $`curl -X POST "${host}/_bulk" \
      -H "Content-Type: application/x-ndjson" \
      --data-binary "@${bulkFile}"`;
    
    this.stats.loaded += records.length;
    console.log(`  Elasticsearch: Loaded ${records.length} records`);
    
    await $`rm ${bulkFile}`;
  }
  
  async loadS3(records) {
    const { bucket, prefix, format } = this.config.destinations.s3;
    const timestamp = format(new Date(), 'yyyy-MM-dd-HHmmss');
    
    let filename, content;
    
    if (format === 'json') {
      filename = `${prefix}/data-${timestamp}.json`;
      content = JSON.stringify(records, null, 2);
    } else if (format === 'jsonl') {
      filename = `${prefix}/data-${timestamp}.jsonl`;
      content = records.map(r => JSON.stringify(r)).join('\n');
    } else if (format === 'csv') {
      filename = `${prefix}/data-${timestamp}.csv`;
      const headers = Object.keys(records[0]);
      content = [
        headers.join(','),
        ...records.map(r => headers.map(h => r[h] || '').join(','))
      ].join('\n');
    }
    
    // Upload to S3
    const tempFile = `/tmp/s3-upload-${Date.now()}`;
    await $`echo ${content} > ${tempFile}`;
    await $`aws s3 cp ${tempFile} s3://${bucket}/${filename}`;
    
    this.stats.loaded += records.length;
    console.log(`  S3: Uploaded ${records.length} records to ${filename}`);
    
    await $`rm ${tempFile}`;
  }
  
  async loadBigQuery(records) {
    const { project, dataset, table } = this.config.destinations.bigquery;
    
    // Create newline-delimited JSON
    const filename = `/tmp/bigquery-load-${Date.now()}.jsonl`;
    const content = records.map(r => JSON.stringify(r)).join('\n');
    await $`echo ${content} > ${filename}`;
    
    // Load to BigQuery
    await $`bq load --source_format=NEWLINE_DELIMITED_JSON \
      --autodetect \
      ${project}:${dataset}.${table} \
      ${filename}`;
    
    this.stats.loaded += records.length;
    console.log(`  BigQuery: Loaded ${records.length} records`);
    
    await $`rm ${filename}`;
  }
  
  // Run the complete pipeline
  async run() {
    const startTime = Date.now();
    console.log('🚀 Starting ETL Pipeline\n');
    
    try {
      // Extract
      const extracted = await this.extract();
      
      // Transform
      const transformed = await this.transform(extracted);
      
      // Load
      await this.load(transformed);
      
      // Summary
      const duration = (Date.now() - startTime) / 1000;
      console.log('\n✅ Pipeline completed successfully');
      console.log(`  Duration: ${duration.toFixed(1)}s`);
      console.log(`  Extracted: ${this.stats.extracted}`);
      console.log(`  Transformed: ${this.stats.transformed}`);
      console.log(`  Loaded: ${this.stats.loaded}`);
      console.log(`  Errors: ${this.stats.errors}`);
      
      // Send notification
      if (this.config.notifications?.slack) {
        await $`curl -X POST ${this.config.notifications.slack} \
          -H "Content-Type: application/json" \
          -d '${JSON.stringify({
            text: `ETL Pipeline completed: ${this.stats.loaded} records processed in ${duration.toFixed(1)}s`
          })}'`;
      }
    } catch (error) {
      console.error('\n❌ Pipeline failed:', error.message);
      throw error;
    }
  }
}

// Example configuration
const config = {
  sources: {
    mysql: {
      host: 'user@db.example.com',
      database: 'production',
      table: 'orders',
      user: 'readonly',
      password: process.env.MYSQL_PASSWORD,
      query: 'SELECT * FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)'
    },
    s3: {
      bucket: 'data-lake',
      prefix: 'raw/events/',
      pattern: '.*.json'
    },
    api: {
      endpoint: 'https://api.example.com/v1/users',
      headers: `Authorization: Bearer ${process.env.API_TOKEN}`,
      pagination: true
    }
  },
  
  transformations: [
    {
      type: 'rename',
      mapping: {
        'user_id': 'userId',
        'created_at': 'createdAt',
        'updated_at': 'updatedAt'
      }
    },
    {
      type: 'calculate',
      field: 'daysSinceCreated',
      formula: (record) => {
        const created = new Date(record.createdAt);
        const now = new Date();
        return Math.floor((now - created) / (1000 * 60 * 60 * 24));
      }
    },
    {
      type: 'enrich',
      data: {
        source: 'etl-pipeline',
        processedAt: new Date().toISOString()
      }
    },
    {
      type: 'format',
      fields: {
        email: 'lowercase',
        country: 'uppercase',
        createdAt: 'datetime'
      }
    }
  ],
  
  validation: {
    required: ['userId', 'email'],
    types: {
      userId: 'number',
      email: 'string',
      createdAt: 'string'
    }
  },
  
  destinations: {
    postgresql: {
      host: 'analytics@warehouse.example.com',
      database: 'analytics',
      table: 'users_enriched',
      user: 'etl_user',
      password: process.env.PG_PASSWORD
    },
    elasticsearch: {
      host: 'https://es.example.com:9200',
      index: 'users-2024-01'
    },
    s3: {
      bucket: 'processed-data',
      prefix: 'users',
      format: 'jsonl'
    }
  },
  
  notifications: {
    slack: process.env.SLACK_WEBHOOK
  }
};

// Run the pipeline
const pipeline = new ETLPipeline(config);
pipeline.run().catch(console.error);
```

## Next Steps

- Learn about [performance optimization](./performance-optimization)
- Explore [secure password handling](./secure-password-handling)
- Review [troubleshooting guide](./troubleshooting)
- Check out [custom commands](./custom-commands)