#!/usr/bin/env node
/**
 * Multi-Server Deployment with @xec/ush
 * 
 * Real-world examples of deploying applications across multiple servers using @xec/ush.
 */

import { $ } from '@xec/ush';

// ===== Types =====
interface Server {
  name: string;
  host: string;
  user?: string;
  role: 'web' | 'api' | 'db' | 'cache' | 'lb';
  tags?: string[];
  healthCheck?: {
    endpoint?: string;
    port?: number;
    command?: string;
  };
}

interface DeploymentConfig {
  name: string;
  version: string;
  servers: Server[];
  artifacts: {
    source: string;
    destination: string;
  };
  preDeployment?: string[];
  deployment: string[];
  postDeployment?: string[];
  rollback?: string[];
  healthCheckTimeout?: number;
  parallelGroups?: boolean;
}

interface DeploymentResult {
  server: Server;
  status: 'success' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  rollbackAttempted?: boolean;
}

// ===== Deployment Manager =====
class DeploymentManager {
  private results: DeploymentResult[] = [];
  private connections = new Map<string, typeof $>();
  
  constructor(private config: DeploymentConfig) {}
  
  // Get or create SSH connection
  private getConnection(server: Server) {
    const key = `${server.user || 'root'}@${server.host}`;
    
    if (!this.connections.has(key)) {
      const $ssh = $.ssh({
        host: server.host,
        username: server.user || 'root',
        keepAliveInterval: 30000
      });
      this.connections.set(key, $ssh);
    }
    
    return this.connections.get(key)!;
  }
  
  // Execute deployment
  async deploy(options: {
    dryRun?: boolean;
    skipHealthCheck?: boolean;
    targetRoles?: string[];
    targetTags?: string[];
  } = {}) {
    console.log(`🚀 Starting deployment: ${this.config.name} v${this.config.version}\n`);
    
    // Filter servers based on options
    const targetServers = this.filterServers(options.targetRoles, options.targetTags);
    
    if (targetServers.length === 0) {
      throw new Error('No servers match the deployment criteria');
    }
    
    console.log(`Target servers: ${targetServers.length}`);
    targetServers.forEach(s => console.log(`  - ${s.name} (${s.role}): ${s.host}`));
    console.log();
    
    try {
      // Pre-deployment phase
      if (this.config.preDeployment) {
        await this.executePhase('Pre-deployment', targetServers, this.config.preDeployment, options.dryRun);
      }
      
      // Copy artifacts
      await this.copyArtifacts(targetServers, options.dryRun);
      
      // Deployment phase
      await this.executePhase('Deployment', targetServers, this.config.deployment, options.dryRun);
      
      // Health checks
      if (!options.skipHealthCheck) {
        await this.performHealthChecks(targetServers);
      }
      
      // Post-deployment phase
      if (this.config.postDeployment) {
        await this.executePhase('Post-deployment', targetServers, this.config.postDeployment, options.dryRun);
      }
      
      // Print summary
      this.printSummary();
      
    } catch (error) {
      console.error('\n❌ Deployment failed!');
      
      // Attempt rollback
      if (this.config.rollback && !options.dryRun) {
        await this.performRollback(targetServers);
      }
      
      throw error;
    } finally {
      // Close connections
      await this.closeConnections();
    }
  }
  
  // Filter servers based on roles and tags
  private filterServers(roles?: string[], tags?: string[]): Server[] {
    return this.config.servers.filter(server => {
      if (roles && !roles.includes(server.role)) {
        return false;
      }
      
      if (tags && server.tags) {
        const hasTag = tags.some(tag => server.tags!.includes(tag));
        if (!hasTag) return false;
      }
      
      return true;
    });
  }
  
  // Execute deployment phase
  private async executePhase(
    phaseName: string,
    servers: Server[],
    commands: string[],
    dryRun = false
  ) {
    console.log(`\n📋 ${phaseName} phase`);
    console.log('='.repeat(50));
    
    if (this.config.parallelGroups) {
      // Deploy by role groups
      const groups = this.groupServersByRole(servers);
      
      for (const [role, groupServers] of groups) {
        console.log(`\nDeploying to ${role} servers (${groupServers.length})...`);
        await this.executeOnServers(groupServers, commands, dryRun, true);
      }
    } else {
      // Deploy sequentially
      await this.executeOnServers(servers, commands, dryRun, false);
    }
  }
  
  // Group servers by role
  private groupServersByRole(servers: Server[]): Map<string, Server[]> {
    const groups = new Map<string, Server[]>();
    
    // Define deployment order
    const roleOrder = ['db', 'cache', 'api', 'web', 'lb'];
    
    for (const role of roleOrder) {
      const roleServers = servers.filter(s => s.role === role);
      if (roleServers.length > 0) {
        groups.set(role, roleServers);
      }
    }
    
    return groups;
  }
  
  // Execute commands on servers
  private async executeOnServers(
    servers: Server[],
    commands: string[],
    dryRun: boolean,
    parallel: boolean
  ) {
    const executeOnServer = async (server: Server) => {
      const startTime = Date.now();
      const result: DeploymentResult = {
        server,
        status: 'success',
        duration: 0
      };
      
      try {
        console.log(`\n🖥️  ${server.name}:`);
        
        if (dryRun) {
          console.log('  (DRY RUN - commands not executed)');
          commands.forEach(cmd => console.log(`  Would run: ${cmd}`));
        } else {
          const $ssh = this.getConnection(server);
          
          for (const command of commands) {
            console.log(`  ▶ ${command}`);
            const output = await $ssh`${command}`;
            
            if (output.stdout.trim()) {
              console.log(`    ${output.stdout.trim().replace(/\n/g, '\n    ')}`);
            }
          }
        }
        
        result.status = 'success';
      } catch (error: any) {
        result.status = 'failed';
        result.error = error.message;
        console.error(`  ❌ Error: ${error.message}`);
        throw error;
      } finally {
        result.duration = Date.now() - startTime;
        this.results.push(result);
      }
    };
    
    if (parallel) {
      await $.parallel(
        servers.map(server => executeOnServer(server)),
        { concurrency: 5 }
      );
    } else {
      for (const server of servers) {
        await executeOnServer(server);
      }
    }
  }
  
  // Copy artifacts to servers
  private async copyArtifacts(servers: Server[], dryRun: boolean) {
    console.log('\n📦 Copying artifacts');
    console.log('='.repeat(50));
    
    const copyToServer = async (server: Server) => {
      console.log(`\n🖥️  ${server.name}: Copying artifacts...`);
      
      if (dryRun) {
        console.log(`  Would copy: ${this.config.artifacts.source} -> ${server.host}:${this.config.artifacts.destination}`);
        return;
      }
      
      const $ssh = this.getConnection(server);
      
      // Create destination directory
      await $ssh`mkdir -p ${this.config.artifacts.destination}`;
      
      // Copy files using rsync
      await $`rsync -avz --progress ${this.config.artifacts.source}/ ${server.user || 'root'}@${server.host}:${this.config.artifacts.destination}/`;
      
      console.log(`  ✅ Artifacts copied`);
    };
    
    // Copy in parallel with limited concurrency
    await $.parallel(
      servers.map(server => copyToServer(server)),
      { concurrency: 3 }
    );
  }
  
  // Perform health checks
  private async performHealthChecks(servers: Server[]) {
    console.log('\n🏥 Health checks');
    console.log('='.repeat(50));
    
    const timeout = this.config.healthCheckTimeout || 60000;
    const startTime = Date.now();
    
    const checkServer = async (server: Server) => {
      console.log(`\n🖥️  ${server.name}: Checking health...`);
      
      const $ssh = this.getConnection(server);
      
      while (Date.now() - startTime < timeout) {
        try {
          if (server.healthCheck?.endpoint) {
            // HTTP health check
            const url = `http://${server.host}:${server.healthCheck.port || 80}${server.healthCheck.endpoint}`;
            await $ssh`curl -sf ${url}`;
            console.log(`  ✅ Health check passed (HTTP)`);
            return;
          } else if (server.healthCheck?.command) {
            // Custom command health check
            await $ssh`${server.healthCheck.command}`;
            console.log(`  ✅ Health check passed (Command)`);
            return;
          } else {
            // Default: check if service is running
            await $ssh`systemctl is-active app`;
            console.log(`  ✅ Service is active`);
            return;
          }
        } catch (error) {
          console.log(`  ⏳ Waiting for service to be ready...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
      throw new Error(`Health check timeout for ${server.name}`);
    };
    
    await $.parallel(
      servers.map(server => checkServer(server)),
      { concurrency: 10 }
    );
  }
  
  // Perform rollback
  private async performRollback(servers: Server[]) {
    console.log('\n⏪ Attempting rollback');
    console.log('='.repeat(50));
    
    if (!this.config.rollback) return;
    
    const failedServers = this.results
      .filter(r => r.status === 'failed')
      .map(r => r.server);
    
    for (const server of failedServers) {
      console.log(`\n🖥️  ${server.name}: Rolling back...`);
      
      try {
        const $ssh = this.getConnection(server);
        
        for (const command of this.config.rollback) {
          console.log(`  ▶ ${command}`);
          await $ssh`${command}`;
        }
        
        console.log(`  ✅ Rollback completed`);
        
        // Update result
        const result = this.results.find(r => r.server === server);
        if (result) {
          result.rollbackAttempted = true;
        }
      } catch (error: any) {
        console.error(`  ❌ Rollback failed: ${error.message}`);
      }
    }
  }
  
  // Close all SSH connections
  private async closeConnections() {
    console.log('\n🔌 Closing connections...');
    
    for (const [key, $ssh] of this.connections) {
      try {
        await $ssh.disconnect();
      } catch (error) {
        console.error(`Failed to close connection ${key}`);
      }
    }
    
    this.connections.clear();
  }
  
  // Print deployment summary
  private printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Deployment Summary');
    console.log('='.repeat(60));
    
    const successful = this.results.filter(r => r.status === 'success').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    
    console.log(`\nDeployment: ${this.config.name} v${this.config.version}`);
    console.log(`Total servers: ${this.results.length}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total duration: ${(totalDuration / 1000).toFixed(2)}s`);
    
    if (failed > 0) {
      console.log('\nFailed servers:');
      this.results.filter(r => r.status === 'failed').forEach(r => {
        console.log(`  - ${r.server.name}: ${r.error}`);
        if (r.rollbackAttempted) {
          console.log('    (rollback attempted)');
        }
      });
    }
    
    console.log('\n' + (failed === 0 ? '✅ Deployment completed successfully!' : '❌ Deployment failed!'));
  }
}

// ===== Blue-Green Deployment =====
class BlueGreenDeployment {
  constructor(
    private config: {
      loadBalancer: Server;
      blueServers: Server[];
      greenServers: Server[];
      healthCheckUrl: string;
      warmupTime?: number;
    }
  ) {}
  
  async deploy(artifact: string, version: string) {
    console.log('🔵🟢 Blue-Green Deployment\n');
    
    // Determine current active environment
    const activeEnv = await this.getActiveEnvironment();
    const inactiveEnv = activeEnv === 'blue' ? 'green' : 'blue';
    const inactiveServers = inactiveEnv === 'blue' ? this.config.blueServers : this.config.greenServers;
    
    console.log(`Current active: ${activeEnv}`);
    console.log(`Deploying to: ${inactiveEnv}\n`);
    
    // Deploy to inactive environment
    const deployment = new DeploymentManager({
      name: `${inactiveEnv}-deployment`,
      version,
      servers: inactiveServers,
      artifacts: {
        source: artifact,
        destination: '/opt/app'
      },
      deployment: [
        'sudo systemctl stop app',
        'sudo rm -rf /opt/app/*',
        'sudo mv /opt/app-new/* /opt/app/',
        'sudo systemctl start app'
      ],
      healthCheckTimeout: 120000
    });
    
    await deployment.deploy();
    
    // Warm up new environment
    console.log(`\n⏳ Warming up ${inactiveEnv} environment...`);
    await this.warmupEnvironment(inactiveServers);
    
    // Switch traffic
    console.log(`\n🔄 Switching traffic to ${inactiveEnv}...`);
    await this.switchTraffic(inactiveEnv);
    
    // Verify switch
    const newActive = await this.getActiveEnvironment();
    if (newActive === inactiveEnv) {
      console.log(`\n✅ Successfully switched to ${inactiveEnv}!`);
    } else {
      throw new Error('Traffic switch failed!');
    }
  }
  
  private async getActiveEnvironment(): Promise<'blue' | 'green'> {
    const $lb = $.ssh({
      host: this.config.loadBalancer.host,
      username: this.config.loadBalancer.user
    });
    
    const result = await $lb`cat /etc/nginx/sites-enabled/app.conf | grep upstream`;
    await $lb.disconnect();
    
    return result.stdout.includes('blue_upstream') ? 'blue' : 'green';
  }
  
  private async warmupEnvironment(servers: Server[]) {
    const warmupTime = this.config.warmupTime || 30000;
    const endTime = Date.now() + warmupTime;
    
    while (Date.now() < endTime) {
      await $.parallel(
        servers.map(server => 
          $`curl -s http://${server.host}${this.config.healthCheckUrl} > /dev/null`
        )
      );
      
      process.stdout.write(`\r⏳ Warming up... ${Math.round((endTime - Date.now()) / 1000)}s remaining`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    console.log('\r✅ Warmup complete!                    ');
  }
  
  private async switchTraffic(environment: 'blue' | 'green') {
    const $lb = $.ssh({
      host: this.config.loadBalancer.host,
      username: this.config.loadBalancer.user
    });
    
    const upstream = environment === 'blue' ? 'blue_upstream' : 'green_upstream';
    
    await $lb`sudo sed -i 's/upstream app.*/upstream app { include \/etc\/nginx\/${upstream}; }/' /etc/nginx/sites-enabled/app.conf`;
    await $lb`sudo nginx -t`;
    await $lb`sudo systemctl reload nginx`;
    
    await $lb.disconnect();
  }
}

// ===== Canary Deployment =====
class CanaryDeployment {
  constructor(
    private config: {
      servers: Server[];
      canaryPercentage: number;
      incrementalSteps?: number[];
      monitoringDuration?: number;
      rollbackThreshold?: {
        errorRate?: number;
        responseTime?: number;
      };
    }
  ) {}
  
  async deploy(artifact: string, version: string) {
    console.log('🐤 Canary Deployment\n');
    
    const steps = this.config.incrementalSteps || [
      this.config.canaryPercentage
    ];
    
    const totalServers = this.config.servers.length;
    let deployedServers: Server[] = [];
    
    for (const percentage of steps) {
      const targetCount = Math.ceil(totalServers * (percentage / 100));
      const newServers = this.config.servers
        .filter(s => !deployedServers.includes(s))
        .slice(0, targetCount - deployedServers.length);
      
      if (newServers.length === 0) continue;
      
      console.log(`\n📈 Deploying to ${percentage}% of servers (${targetCount}/${totalServers})...`);
      
      // Deploy to new canary servers
      const deployment = new DeploymentManager({
        name: `canary-${percentage}`,
        version,
        servers: newServers,
        artifacts: {
          source: artifact,
          destination: '/opt/app'
        },
        deployment: [
          'sudo systemctl stop app',
          'sudo rm -rf /opt/app/*',
          'sudo mv /opt/app-new/* /opt/app/',
          'sudo systemctl start app'
        ]
      });
      
      await deployment.deploy();
      deployedServers = [...deployedServers, ...newServers];
      
      // Monitor canary servers
      console.log(`\n📊 Monitoring canary servers for ${(this.config.monitoringDuration || 300000) / 1000}s...`);
      const metricsOk = await this.monitorCanary(deployedServers);
      
      if (!metricsOk) {
        console.log('\n❌ Canary metrics exceed threshold! Rolling back...');
        await this.rollbackCanary(deployedServers);
        throw new Error('Canary deployment failed');
      }
      
      console.log('✅ Canary metrics look good!');
    }
    
    // Deploy to remaining servers
    const remainingServers = this.config.servers.filter(s => !deployedServers.includes(s));
    
    if (remainingServers.length > 0) {
      console.log(`\n🚀 Deploying to remaining ${remainingServers.length} servers...`);
      
      const deployment = new DeploymentManager({
        name: 'canary-final',
        version,
        servers: remainingServers,
        artifacts: {
          source: artifact,
          destination: '/opt/app'
        },
        deployment: [
          'sudo systemctl stop app',
          'sudo rm -rf /opt/app/*',
          'sudo mv /opt/app-new/* /opt/app/',
          'sudo systemctl start app'
        ]
      });
      
      await deployment.deploy();
    }
    
    console.log('\n✅ Canary deployment completed successfully!');
  }
  
  private async monitorCanary(servers: Server[]): Promise<boolean> {
    const duration = this.config.monitoringDuration || 300000;
    const endTime = Date.now() + duration;
    
    while (Date.now() < endTime) {
      const metrics = await this.collectMetrics(servers);
      
      // Check thresholds
      if (this.config.rollbackThreshold) {
        if (this.config.rollbackThreshold.errorRate && 
            metrics.errorRate > this.config.rollbackThreshold.errorRate) {
          console.log(`\n⚠️  Error rate ${metrics.errorRate}% exceeds threshold!`);
          return false;
        }
        
        if (this.config.rollbackThreshold.responseTime && 
            metrics.avgResponseTime > this.config.rollbackThreshold.responseTime) {
          console.log(`\n⚠️  Response time ${metrics.avgResponseTime}ms exceeds threshold!`);
          return false;
        }
      }
      
      const remaining = Math.round((endTime - Date.now()) / 1000);
      process.stdout.write(`\r📊 Monitoring... ${remaining}s remaining (Errors: ${metrics.errorRate}%, Avg RT: ${metrics.avgResponseTime}ms)`);
      
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    
    console.log();
    return true;
  }
  
  private async collectMetrics(servers: Server[]): Promise<{
    errorRate: number;
    avgResponseTime: number;
  }> {
    // Simulate metric collection
    // In real implementation, this would query monitoring system
    return {
      errorRate: Math.random() * 5,
      avgResponseTime: 100 + Math.random() * 50
    };
  }
  
  private async rollbackCanary(servers: Server[]) {
    const deployment = new DeploymentManager({
      name: 'canary-rollback',
      version: 'previous',
      servers,
      artifacts: {
        source: '/opt/app-backup',
        destination: '/opt/app'
      },
      rollback: [
        'sudo systemctl stop app',
        'sudo rm -rf /opt/app/*',
        'sudo cp -r /opt/app-backup/* /opt/app/',
        'sudo systemctl start app'
      ]
    });
    
    await deployment.deploy();
  }
}

// ===== Demo Function =====
async function runDemo() {
  console.log('🚀 Multi-Server Deployment Demo\n');
  
  // Demo configuration
  const servers: Server[] = [
    // Load balancers
    { name: 'lb-1', host: 'lb1.example.com', role: 'lb' },
    
    // Web servers
    { name: 'web-1', host: 'web1.example.com', role: 'web', tags: ['production', 'blue'] },
    { name: 'web-2', host: 'web2.example.com', role: 'web', tags: ['production', 'blue'] },
    { name: 'web-3', host: 'web3.example.com', role: 'web', tags: ['production', 'green'] },
    { name: 'web-4', host: 'web4.example.com', role: 'web', tags: ['production', 'green'] },
    
    // API servers
    { name: 'api-1', host: 'api1.example.com', role: 'api', tags: ['production'] },
    { name: 'api-2', host: 'api2.example.com', role: 'api', tags: ['production'] },
    
    // Database servers
    { name: 'db-1', host: 'db1.example.com', role: 'db', tags: ['production', 'primary'] },
    { name: 'db-2', host: 'db2.example.com', role: 'db', tags: ['production', 'replica'] }
  ];
  
  // Create deployment configuration
  const deploymentConfig: DeploymentConfig = {
    name: 'my-app',
    version: '2.0.0',
    servers,
    artifacts: {
      source: '/tmp/my-app-build',
      destination: '/opt/app-new'
    },
    preDeployment: [
      'sudo mkdir -p /opt/app-backup',
      'sudo cp -r /opt/app/* /opt/app-backup/ || true'
    ],
    deployment: [
      'sudo systemctl stop app || true',
      'sudo rm -rf /opt/app/*',
      'sudo mv /opt/app-new/* /opt/app/',
      'sudo chown -R app:app /opt/app',
      'sudo systemctl start app'
    ],
    postDeployment: [
      'sudo systemctl status app',
      'curl -sf http://localhost/health || exit 1'
    ],
    rollback: [
      'sudo systemctl stop app',
      'sudo rm -rf /opt/app/*',
      'sudo cp -r /opt/app-backup/* /opt/app/',
      'sudo systemctl start app'
    ],
    healthCheckTimeout: 60000,
    parallelGroups: true
  };
  
  // Demo different deployment strategies
  console.log('Available deployment strategies:');
  console.log('1. Standard deployment (all servers)');
  console.log('2. Role-based deployment (web servers only)');
  console.log('3. Blue-Green deployment');
  console.log('4. Canary deployment\n');
  
  // For demo, we'll show configuration examples
  console.log('Example 1: Standard deployment to all servers');
  console.log('----------------------------------------');
  const manager = new DeploymentManager(deploymentConfig);
  console.log('Would deploy to all servers with:');
  console.log('- Pre-deployment: Backup current version');
  console.log('- Deployment: Install new version');
  console.log('- Post-deployment: Health checks');
  console.log('- Rollback: Restore from backup if needed\n');
  
  console.log('Example 2: Deploy to web servers only');
  console.log('----------------------------------------');
  console.log('Would deploy with targetRoles: ["web"]\n');
  
  console.log('Example 3: Blue-Green deployment');
  console.log('----------------------------------------');
  const blueGreen = new BlueGreenDeployment({
    loadBalancer: servers.find(s => s.role === 'lb')!,
    blueServers: servers.filter(s => s.tags?.includes('blue')),
    greenServers: servers.filter(s => s.tags?.includes('green')),
    healthCheckUrl: '/health',
    warmupTime: 30000
  });
  console.log('Would perform blue-green deployment:');
  console.log('- Deploy to inactive environment');
  console.log('- Warm up new servers');
  console.log('- Switch load balancer');
  console.log('- Keep old environment as backup\n');
  
  console.log('Example 4: Canary deployment');
  console.log('----------------------------------------');
  const canary = new CanaryDeployment({
    servers: servers.filter(s => s.role === 'web'),
    canaryPercentage: 25,
    incrementalSteps: [25, 50, 100],
    monitoringDuration: 300000,
    rollbackThreshold: {
      errorRate: 5,
      responseTime: 500
    }
  });
  console.log('Would perform canary deployment:');
  console.log('- Deploy to 25% of servers');
  console.log('- Monitor for 5 minutes');
  console.log('- Gradually increase to 50%, then 100%');
  console.log('- Rollback if thresholds exceeded\n');
  
  // Simulate a deployment (dry run)
  console.log('\n🎭 Simulating deployment (dry run)...\n');
  
  try {
    await manager.deploy({
      dryRun: true,
      targetRoles: ['web', 'api']
    });
  } catch (error) {
    console.log('Demo deployment simulation completed');
  }
  
  console.log('\n✅ Multi-server deployment demo completed!');
  console.log('\nIn a real deployment:');
  console.log('- Replace example.com with real server addresses');
  console.log('- Ensure SSH access is configured');
  console.log('- Test with dry-run first');
  console.log('- Monitor deployment progress');
  console.log('- Have rollback plan ready');
}

// Run demo if executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}