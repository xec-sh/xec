# Real-World Examples

## Automated Deployment Script

Complete deployment pipeline with rollback capability:

```javascript
import { $ } from '@xec/ush';

async function deployApp(environment) {
  // Configuration for different environments
  const config = {
    development: {
      server: 'dev.example.com',
      path: '/var/www/dev',
      branch: 'develop'
    },
    production: {
      server: 'prod.example.com', 
      path: '/var/www/app',
      branch: 'main'
    }
  };

  const env = config[environment];
  if (!env) throw new Error(`Unknown environment: ${environment}`);

  console.log(`🚀 Deploying to ${environment}...`);

  // 1. Run tests locally
  console.log('📋 Running tests...');
  await $`npm test`;

  // 2. Build the application
  console.log('🔨 Building application...');
  await $`npm run build`;

  // 3. Connect to server
  const $remote = $.ssh(`deploy@${env.server}`);

  try {
    // 4. Backup current version
    console.log('💾 Backing up current version...');
    await $remote`cd ${env.path} && tar -czf ../backup-$(date +%Y%m%d-%H%M%S).tar.gz .`;

    // 5. Pull latest code
    console.log('📥 Pulling latest code...');
    await $remote`cd ${env.path} && git pull origin ${env.branch}`;

    // 6. Install dependencies
    console.log('📦 Installing dependencies...');
    await $remote`cd ${env.path} && npm ci --production`;

    // 7. Run migrations
    console.log('🗄️ Running database migrations...');
    await $remote`cd ${env.path} && npm run migrate`;

    // 8. Restart application
    console.log('🔄 Restarting application...');
    await $remote`sudo systemctl restart app`;

    // 9. Health check
    console.log('❤️ Checking application health...');
    await $.retry({ maxRetries: 5, initialDelay: 2000 })`
      curl -f http://${env.server}/health
    `;

    console.log(`✅ Successfully deployed to ${environment}!`);
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    
    // Rollback on failure
    console.log('⏪ Rolling back...');
    await $remote`cd ${env.path} && git reset --hard HEAD~1`;
    await $remote`sudo systemctl restart app`;
    
    throw error;
  } finally {
    await $remote.disconnect();
  }
}

// Usage
await deployApp('production');
```

## Log Analysis Pipeline

Comprehensive log analysis with reporting:

```javascript
import { $ } from '@xec/ush';

async function analyzeAccessLogs(date) {
  console.log(`📊 Analyzing logs for ${date}...`);

  // Setup
  const logFile = `/var/log/nginx/access.log-${date}`;
  const outputDir = `./reports/${date}`;
  await $`mkdir -p ${outputDir}`;

  // 1. Extract and decompress logs if needed
  if (await $`test -f ${logFile}.gz`.nothrow().then(r => r.exitCode === 0)) {
    console.log('📦 Decompressing log file...');
    await $`gunzip -c ${logFile}.gz > ${logFile}`;
  }

  // 2. Calculate basic statistics
  console.log('📈 Calculating statistics...');
  
  const stats = await $.parallel({
    totalRequests: $`wc -l < ${logFile}`,
    uniqueIPs: $.pipe(
      $`cat ${logFile}`,
      $`awk '{print $1}'`,
      $`sort -u`,
      $`wc -l`
    ),
    status404: $`grep " 404 " ${logFile} | wc -l`,
    status500: $`grep " 500 " ${logFile} | wc -l`
  });

  // 3. Find top URLs
  console.log('🔝 Finding top URLs...');
  const topUrls = await $.pipe(
    $`cat ${logFile}`,
    $`awk '{print $7}'`,
    $`sort`,
    $`uniq -c`,
    $`sort -rn`,
    $`head -20`
  );

  // 4. Analyze response times
  console.log('⏱️ Analyzing response times...');
  const responseTimes = await $.pipe(
    $`cat ${logFile}`,
    $`awk '{print $NF}'`,           // Last field is response time
    $`grep -E '^[0-9]+$'`,          // Only numeric values
    $`awk '{sum+=$1; count++} END {print "avg:", sum/count, "ms"}'`
  );

  // 5. Detect potential attacks
  console.log('🛡️ Checking for suspicious activity...');
  const suspicious = await $.pipe(
    $`cat ${logFile}`,
    $.raw`grep -E "(union.*select|<script|../|\.\.\\\\)" || true`,
    $`wc -l`
  );

  // 6. Generate report
  console.log('📄 Generating report...');
  const report = `# Access Log Analysis Report
Date: ${date}

## Summary Statistics
- Total Requests: ${stats.totalRequests.stdout.trim()}
- Unique IPs: ${stats.uniqueIPs.stdout.trim()}
- 404 Errors: ${stats.status404.stdout.trim()}
- 500 Errors: ${stats.status500.stdout.trim()}
- Suspicious Requests: ${suspicious.stdout.trim()}

## Response Times
${responseTimes.stdout}

## Top 20 URLs
${topUrls.stdout}
`;

  await $`echo ${report} > ${outputDir}/report.md`;
  console.log(`✅ Analysis complete! Report saved to ${outputDir}/report.md`);
}

// Usage
await analyzeAccessLogs('20240115');
```

## Database Backup Automation

Full database backup solution with S3 storage:

```javascript
import { $ } from '@xec/ush';

class DatabaseBackup {
  constructor(config) {
    this.config = config;
    this.$ = $.env({
      MYSQL_PWD: config.password  // Secure password passing
    });
  }

  async backup(database) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${database}-${timestamp}.sql`;
    const backupPath = `${this.config.backupDir}/${filename}`;

    console.log(`🗄️ Starting backup of ${database}...`);

    try {
      // Create backup directory
      await $`mkdir -p ${this.config.backupDir}`;

      // Perform backup with progress tracking
      await this.$`
        mysqldump 
          -h ${this.config.host}
          -u ${this.config.user}
          --single-transaction
          --routines
          --triggers
          --add-drop-table
          --extended-insert
          ${database}
      `.pipe($`gzip -9 > ${backupPath}.gz`)
        .progress({
          onStart: () => console.log('📦 Dumping database...'),
          onProgress: () => process.stdout.write('.'),
          onComplete: () => console.log('\n✓ Dump complete')
        });

      // Verify backup
      const size = await $`du -h ${backupPath}.gz | cut -f1`;
      console.log(`📊 Backup size: ${size.stdout.trim()}`);

      // Upload to S3 if configured
      if (this.config.s3Bucket) {
        console.log('☁️ Uploading to S3...');
        await $`
          aws s3 cp ${backupPath}.gz 
          s3://${this.config.s3Bucket}/backups/${filename}.gz
          --storage-class GLACIER
        `;
      }

      // Clean old backups
      await this.cleanOldBackups(database);

      return `${backupPath}.gz`;
    } catch (error) {
      console.error('❌ Backup failed:', error.message);
      throw error;
    }
  }

  async cleanOldBackups(database) {
    console.log('🧹 Cleaning old backups...');
    
    const retentionDays = this.config.retentionDays || 30;
    
    // Local cleanup
    await $`
      find ${this.config.backupDir} 
        -name "${database}-*.sql.gz" 
        -mtime +${retentionDays} 
        -delete
    `;

    // S3 cleanup if configured
    if (this.config.s3Bucket) {
      await $`
        aws s3 ls s3://${this.config.s3Bucket}/backups/ |
        grep "${database}-" |
        awk '{print $4}' |
        while read file; do
          age=$(aws s3api head-object \
            --bucket ${this.config.s3Bucket} \
            --key backups/$file \
            --query "LastModified" \
            --output text)
          if [ $(date -d "$age" +%s) -lt $(date -d "${retentionDays} days ago" +%s) ]; then
            aws s3 rm s3://${this.config.s3Bucket}/backups/$file
          fi
        done
      `.nothrow(); // Don't fail on S3 errors
    }
  }

  async restore(backupFile, targetDatabase) {
    console.log(`🔄 Restoring ${targetDatabase} from ${backupFile}...`);

    // Download from S3 if needed
    if (backupFile.startsWith('s3://')) {
      const localFile = `/tmp/${backupFile.split('/').pop()}`;
      await $`aws s3 cp ${backupFile} ${localFile}`;
      backupFile = localFile;
    }

    // Create database if it doesn't exist
    await this.$`
      mysql -h ${this.config.host} -u ${this.config.user} 
        -e "CREATE DATABASE IF NOT EXISTS ${targetDatabase}"
    `.nothrow();

    // Restore
    await $.pipe(
      $`gunzip -c ${backupFile}`,
      this.$`mysql -h ${this.config.host} -u ${this.config.user} ${targetDatabase}`
    );

    console.log('✅ Restore complete!');
  }
}

// Usage
const backup = new DatabaseBackup({
  host: 'localhost',
  user: 'root',
  password: process.env.DB_PASSWORD,
  backupDir: '/backups',
  s3Bucket: 'my-backups',
  retentionDays: 30
});

await backup.backup('production_db');
```

## Multi-Server Health Check

Monitor multiple servers in parallel:

```javascript
import { $ } from '@xec/ush';

async function healthCheckCluster(servers) {
  console.log('🏥 Starting cluster health check...\n');

  const results = await Promise.all(
    servers.map(async (server) => {
      const $remote = $.ssh(server);
      
      try {
        // Collect various metrics
        const [uptime, load, memory, disk, services] = await Promise.all([
          $remote`uptime -p`,
          $remote`uptime | awk -F'load average:' '{print $2}'`,
          $remote`free -h | grep Mem | awk '{print $3 "/" $2}'`,
          $remote`df -h / | tail -1 | awk '{print $5}'`,
          $remote`systemctl is-failed nginx postgresql redis`.nothrow()
        ]);

        return {
          server,
          status: 'healthy',
          metrics: {
            uptime: uptime.stdout.trim(),
            load: load.stdout.trim(),
            memory: memory.stdout.trim(),
            diskUsage: disk.stdout.trim(),
            servicesHealthy: services.exitCode === 1 // is-failed returns 1 if services are OK
          }
        };
      } catch (error) {
        return {
          server,
          status: 'unreachable',
          error: error.message
        };
      } finally {
        await $remote.disconnect();
      }
    })
  );

  // Generate report
  console.log('📊 Health Check Report\n' + '='.repeat(50));
  
  for (const result of results) {
    if (result.status === 'healthy') {
      console.log(`\n✅ ${result.server}`);
      console.log(`   Uptime: ${result.metrics.uptime}`);
      console.log(`   Load: ${result.metrics.load}`);
      console.log(`   Memory: ${result.metrics.memory}`);
      console.log(`   Disk: ${result.metrics.diskUsage}`);
      console.log(`   Services: ${result.metrics.servicesHealthy ? 'All OK' : 'Some failed'}`);
    } else {
      console.log(`\n❌ ${result.server}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Error: ${result.error}`);
    }
  }

  // Send alerts if needed
  const unhealthy = results.filter(r => r.status !== 'healthy');
  if (unhealthy.length > 0) {
    await sendAlert(unhealthy);
  }
}

async function sendAlert(unhealthyServers) {
  const message = `
⚠️ ALERT: ${unhealthyServers.length} servers are unhealthy!

${unhealthyServers.map(s => `- ${s.server}: ${s.error || 'Failed services'}`).join('\n')}
  `.trim();

  // Send via Slack webhook
  await $`
    curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
      -H 'Content-type: application/json' \
      --data ${JSON.stringify({ text: message })}
  `.nothrow();
}

// Usage
await healthCheckCluster([
  'web1.example.com',
  'web2.example.com',
  'db1.example.com',
  'cache1.example.com'
]);
```

## Docker Compose Deployment

Deploy multi-container applications:

```javascript
import { $ } from '@xec/ush';

class DockerComposeDeployment {
  constructor(projectName, composePath) {
    this.projectName = projectName;
    this.composePath = composePath;
    this.$ = $.env({ 
      COMPOSE_PROJECT_NAME: projectName 
    });
  }

  async deploy() {
    console.log(`🐳 Deploying ${this.projectName}...`);

    try {
      // 1. Validate compose file
      await this.validate();

      // 2. Pull latest images
      await this.pullImages();

      // 3. Stop current containers
      await this.stop();

      // 4. Start new containers
      await this.start();

      // 5. Health check
      await this.healthCheck();

      // 6. Cleanup
      await this.cleanup();

      console.log('✅ Deployment successful!');
    } catch (error) {
      console.error('❌ Deployment failed:', error.message);
      await this.rollback();
      throw error;
    }
  }

  async validate() {
    console.log('🔍 Validating compose file...');
    await this.$`docker-compose -f ${this.composePath} config`;
  }

  async pullImages() {
    console.log('📥 Pulling latest images...');
    await this.$`docker-compose -f ${this.composePath} pull`
      .progress({
        onProgress: () => process.stdout.write('.'),
        onComplete: () => console.log('\n✓ Images updated')
      });
  }

  async stop() {
    console.log('🛑 Stopping current containers...');
    await this.$`docker-compose -f ${this.composePath} down`.nothrow();
  }

  async start() {
    console.log('🚀 Starting new containers...');
    await this.$`docker-compose -f ${this.composePath} up -d`;

    // Show running containers
    const ps = await this.$`docker-compose -f ${this.composePath} ps`;
    console.log(ps.stdout);
  }

  async healthCheck() {
    console.log('❤️ Running health checks...');
    
    const services = await this.$`
      docker-compose -f ${this.composePath} config --services
    `;

    for (const service of services.stdout.trim().split('\n')) {
      const healthy = await $.retry({
        maxRetries: 30,
        initialDelay: 1000,
        isRetryable: (result) => result.exitCode !== 0
      })`docker-compose -f ${this.composePath} exec -T ${service} healthcheck`.nothrow();

      if (healthy.exitCode === 0) {
        console.log(`  ✅ ${service} is healthy`);
      } else {
        throw new Error(`Service ${service} failed health check`);
      }
    }
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');
    await $`docker system prune -f`;
  }

  async rollback() {
    console.log('⏪ Rolling back...');
    await this.$`docker-compose -f ${this.composePath}.backup up -d`.nothrow();
  }

  async logs(service, lines = 100) {
    await this.$`docker-compose -f ${this.composePath} logs -f --tail=${lines} ${service}`;
  }
}

// Usage
const deployment = new DockerComposeDeployment('myapp', './docker-compose.yml');
await deployment.deploy();
```

## CI/CD Pipeline

Complete CI/CD pipeline example:

```javascript
import { $ } from '@xec/ush';

class CIPipeline {
  constructor(config) {
    this.config = config;
    this.buildId = Date.now().toString();
  }

  async run() {
    const startTime = Date.now();
    console.log(`🚀 Starting CI/CD Pipeline (Build #${this.buildId})\n`);

    const stages = [
      { name: 'Checkout', fn: () => this.checkout() },
      { name: 'Install', fn: () => this.install() },
      { name: 'Lint', fn: () => this.lint() },
      { name: 'Test', fn: () => this.test() },
      { name: 'Build', fn: () => this.build() },
      { name: 'Deploy', fn: () => this.deploy() },
      { name: 'Smoke Test', fn: () => this.smokeTest() }
    ];

    for (const stage of stages) {
      console.log(`\n📍 Stage: ${stage.name}`);
      console.log('─'.repeat(40));
      
      try {
        const stageStart = Date.now();
        await stage.fn();
        const duration = ((Date.now() - stageStart) / 1000).toFixed(1);
        console.log(`✅ ${stage.name} completed in ${duration}s`);
      } catch (error) {
        console.error(`❌ ${stage.name} failed:`, error.message);
        await this.notifyFailure(stage.name, error);
        throw error;
      }
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n🎉 Pipeline completed successfully in ${totalDuration}s!`);
    await this.notifySuccess(totalDuration);
  }

  async checkout() {
    await $`git fetch origin`;
    await $`git checkout ${this.config.branch}`;
    await $`git pull origin ${this.config.branch}`;
    
    const commit = await $`git rev-parse HEAD`;
    console.log(`📌 Commit: ${commit.stdout.trim()}`);
  }

  async install() {
    await $`npm ci`.progress();
  }

  async lint() {
    await $.parallel([
      $`npm run lint:js`,
      $`npm run lint:css`,
      $`npm run lint:types`
    ]);
  }

  async test() {
    // Run tests with coverage
    await $`npm run test:coverage`;
    
    // Check coverage thresholds
    const coverage = await $`nyc report --reporter=json-summary`;
    const summary = JSON.parse(
      await $`cat coverage/coverage-summary.json`
    );
    
    const total = summary.total;
    console.log(`📊 Coverage: ${total.lines.pct}% lines, ${total.functions.pct}% functions`);
    
    if (total.lines.pct < this.config.coverageThreshold) {
      throw new Error(`Coverage ${total.lines.pct}% is below threshold ${this.config.coverageThreshold}%`);
    }
  }

  async build() {
    await $`npm run build`.progress();
    
    // Create build artifact
    await $`tar -czf build-${this.buildId}.tar.gz dist/`;
    
    // Upload to artifact storage
    await $`
      aws s3 cp build-${this.buildId}.tar.gz 
      s3://${this.config.artifactBucket}/builds/
    `;
  }

  async deploy() {
    const servers = this.config.servers[this.config.environment];
    
    await Promise.all(
      servers.map(server => this.deployToServer(server))
    );
  }

  async deployToServer(server) {
    const $remote = $.ssh(server);
    
    try {
      // Download artifact
      await $remote`
        aws s3 cp s3://${this.config.artifactBucket}/builds/build-${this.buildId}.tar.gz /tmp/
      `;
      
      // Extract and deploy
      await $remote`
        cd ${this.config.deployPath} &&
        tar -xzf /tmp/build-${this.buildId}.tar.gz &&
        npm run migrate &&
        pm2 reload app
      `;
    } finally {
      await $remote.disconnect();
    }
  }

  async smokeTest() {
    const testUrls = [
      `${this.config.appUrl}/health`,
      `${this.config.appUrl}/api/status`
    ];
    
    await Promise.all(
      testUrls.map(url => 
        $.retry({ maxRetries: 5 })`curl -f ${url}`
      )
    );
  }

  async notifySuccess(duration) {
    // Send success notification
    await this.sendNotification({
      color: 'good',
      title: 'Build Successful',
      text: `Build #${this.buildId} completed in ${duration}s`
    });
  }

  async notifyFailure(stage, error) {
    // Send failure notification
    await this.sendNotification({
      color: 'danger',
      title: `Build Failed at ${stage}`,
      text: `Build #${this.buildId}: ${error.message}`
    });
  }

  async sendNotification(payload) {
    // Implement your notification logic (Slack, email, etc.)
  }
}

// Usage
const pipeline = new CIPipeline({
  branch: 'main',
  environment: 'production',
  servers: {
    production: ['prod1.example.com', 'prod2.example.com']
  },
  artifactBucket: 'my-artifacts',
  deployPath: '/var/www/app',
  appUrl: 'https://app.example.com',
  coverageThreshold: 80
});

await pipeline.run();
```

## Next Steps

- Explore [Advanced Features](./advanced-features.md)
- Read [Best Practices](./best-practices.md)
- See [Troubleshooting Guide](./troubleshooting.md)