# 13. Deployment and Operational Patterns

## Overview

Xec Core provides a set of ready-made patterns for typical deployment and operational scenarios. These patterns encapsulate best practices and allow quick implementation of complex deployment strategies.

## Built-in Deployment Patterns

### Blue-Green Deployment

Blue-Green deployment minimizes downtime and risks during updates.

```typescript
import { patterns } from '@xec-js/core';

// Blue-Green configuration
const blueGreenConfig = {
  service: 'web-app',
  environments: {
    blue: {
      servers: ['blue-1', 'blue-2', 'blue-3'],
      healthEndpoint: 'http://blue-lb:8080/health'
    },
    green: {
      servers: ['green-1', 'green-2', 'green-3'],
      healthEndpoint: 'http://green-lb:8080/health'
    }
  },
  loadBalancer: {
    type: 'nginx',
    config: '/etc/nginx/sites-available/app'
  },
  validation: {
    healthCheck: {
      interval: 5000,
      timeout: 30000,
      retries: 3
    },
    smokeTests: ['./tests/smoke.js']
  }
};

// Creating pattern
const blueGreen = patterns.deployment.blueGreen(blueGreenConfig);

// Executing deployment
async function deploy() {
  // 1. Determine inactive environment
  const target = await blueGreen.getInactiveEnvironment();
  console.log(`Deploying to ${target} environment`);
  
  // 2. Deploy new version
  await blueGreen.deploy(target, {
    version: '2.0.0',
    artifact: 's3://releases/app-2.0.0.tar.gz'
  });
  
  // 3. Warm up servers
  await blueGreen.warmup(target);
  
  // 4. Validation
  const validationResult = await blueGreen.validate(target);
  if (!validationResult.success) {
    throw new Error(`Validation failed: ${validationResult.errors}`);
  }
  
  // 5. Traffic switching
  await blueGreen.switch(target);
  
  // 6. Post-switch monitoring
  await blueGreen.monitor({
    duration: 300000, // 5 minutes
    metrics: ['error_rate', 'response_time']
  });
  
  // 7. Cleanup old version (optional)
  await blueGreen.cleanup();
}
```

### Canary Deployment

Gradual deployment with metric control.

```typescript
const canaryConfig = {
  service: 'api-service',
  stages: [
    { percentage: 5, duration: '10m', name: 'canary' },
    { percentage: 25, duration: '30m', name: 'early-adopters' },
    { percentage: 50, duration: '1h', name: 'half-traffic' },
    { percentage: 100, duration: null, name: 'full-rollout' }
  ],
  metrics: {
    sources: {
      prometheus: {
        url: 'http://prometheus:9090',
        queries: {
          errorRate: 'rate(http_requests_total{status=~"5.."}[5m])',
          latencyP99: 'histogram_quantile(0.99, http_request_duration_seconds)',
          cpuUsage: 'avg(rate(container_cpu_usage_seconds_total[5m]))'
        }
      }
    },
    thresholds: {
      errorRate: { max: 0.01 }, // 1%
      latencyP99: { max: 200 }, // 200ms
      cpuUsage: { max: 0.8 }    // 80%
    }
  },
  rollback: {
    automatic: true,
    conditions: ['threshold_breach', 'health_check_failure']
  }
};

const canary = patterns.deployment.canary(canaryConfig);

// Executing canary deployment
async function deployCanary() {
  const deployment = await canary.start({
    version: '2.0.0',
    baseline: '1.9.0'
  });
  
  // Tracking progress
  deployment.on('stage:complete', (stage) => {
    console.log(`Stage ${stage.name} completed successfully`);
  });
  
  deployment.on('metrics:update', (metrics) => {
    console.log('Current metrics:', metrics);
  });
  
  deployment.on('rollback:initiated', (reason) => {
    console.error(`Rollback initiated: ${reason}`);
  });
  
  // Waiting for completion
  const result = await deployment.wait();
  
  if (result.status === 'completed') {
    console.log('Canary deployment successful!');
  } else {
    console.error('Canary deployment failed:', result.reason);
  }
}
```

### Rolling Update

Sequential server updates.

```typescript
const rollingUpdateConfig = {
  service: 'backend-api',
  servers: ['api-1', 'api-2', 'api-3', 'api-4'],
  strategy: {
    maxUnavailable: 1,      // Maximum unavailable servers
    maxSurge: 1,           // Maximum additional servers
    pauseBetweenBatches: 30000, // 30 seconds between batches
  },
  healthCheck: {
    endpoint: '/health',
    interval: 5000,
    timeout: 10000,
    successThreshold: 3
  },
  drainTimeout: 60000 // Time for graceful shutdown
};

const rollingUpdate = patterns.deployment.rollingUpdate(rollingUpdateConfig);

async function performRollingUpdate() {
  await rollingUpdate.execute({
    version: '2.0.0',
    preUpdate: async (server) => {
      // Remove server from load balancer
      await loadBalancer.remove(server);
      // Wait for active requests to complete
      await rollingUpdate.drain(server);
    },
    update: async (server) => {
      // Update application
      await ssh(server, 'sudo systemctl stop app');
      await ssh(server, 'sudo deploy-app 2.0.0');
      await ssh(server, 'sudo systemctl start app');
    },
    postUpdate: async (server) => {
      // Check health
      await rollingUpdate.waitForHealthy(server);
      // Add back to load balancer
      await loadBalancer.add(server);
    },
    onFailure: async (server, error) => {
      // Rollback server
      await ssh(server, 'sudo deploy-app 1.9.0');
      throw error; // Stop rolling update
    }
  });
}
```

### A/B Testing Deployment

Deployment for A/B testing.

```typescript
const abTestingConfig = {
  service: 'frontend',
  variants: {
    control: {
      version: '1.9.0',
      servers: ['fe-1', 'fe-2'],
      weight: 50
    },
    treatment: {
      version: '2.0.0',
      servers: ['fe-3', 'fe-4'],
      weight: 50
    }
  },
  routing: {
    type: 'cookie', // or 'header', 'ip', 'random'
    cookieName: 'ab_variant',
    sticky: true
  },
  analytics: {
    provider: 'google-analytics',
    experiments: {
      conversionRate: {
        goal: 'purchase_completed',
        minimumSampleSize: 1000,
        confidenceLevel: 0.95
      }
    }
  }
};

const abTest = patterns.deployment.abTesting(abTestingConfig);

// Starting A/B test
const experiment = await abTest.start({
  duration: '7d',
  autoStop: {
    winnerThreshold: 0.95, // 95% statistical significance
    minimumDuration: '3d'
  }
});

// Monitoring results
experiment.on('metrics:hourly', (metrics) => {
  console.log('A/B Test Metrics:', {
    control: metrics.control,
    treatment: metrics.treatment,
    winner: metrics.winner,
    confidence: metrics.confidence
  });
});

// Completing experiment
const results = await experiment.complete();
if (results.winner) {
  await abTest.promoteWinner(results.winner);
}
```

## High Availability Patterns

### Active-Passive Failover

```typescript
const activePassiveConfig = {
  primary: {
    servers: ['primary-1', 'primary-2'],
    datacenter: 'us-east-1'
  },
  secondary: {
    servers: ['secondary-1', 'secondary-2'],
    datacenter: 'us-west-1'
  },
  healthCheck: {
    interval: 5000,
    timeout: 3000,
    failureThreshold: 3
  },
  replication: {
    type: 'async',
    lag: { max: 5000 } // max lag 5 seconds
  },
  dns: {
    provider: 'route53',
    ttl: 60
  }
};

const failover = patterns.availability.activePassive(activePassiveConfig);

// Monitoring and automatic failover
failover.monitor({
  onFailure: async (primary) => {
    console.log('Primary failure detected, initiating failover');
    
    // 1. Check replication status
    const replicationLag = await failover.checkReplication();
    if (replicationLag > 5000) {
      console.warn(`High replication lag: ${replicationLag}ms`);
    }
    
    // 2. Promote secondary
    await failover.promote('secondary');
    
    // 3. Update DNS
    await failover.updateDNS('secondary');
    
    // 4. Notifications
    await notify('ops-team', 'Failover completed to secondary');
  }
});

// Manual failover
await failover.switchover({
  planned: true,
  reason: 'Maintenance'
});
```

### Active-Active Multi-Region

```typescript
const activeActiveConfig = {
  regions: {
    'us-east-1': {
      servers: ['use1-1', 'use1-2', 'use1-3'],
      weight: 40
    },
    'eu-west-1': {
      servers: ['euw1-1', 'euw1-2', 'euw1-3'],
      weight: 30
    },
    'ap-south-1': {
      servers: ['aps1-1', 'aps1-2', 'aps1-3'],
      weight: 30
    }
  },
  loadBalancing: {
    type: 'geo-proximity',
    healthCheck: {
      path: '/health',
      interval: 10000
    }
  },
  dataSync: {
    type: 'eventual-consistency',
    conflictResolution: 'last-write-wins'
  }
};

const multiRegion = patterns.availability.activeActive(activeActiveConfig);

// Managing regions
await multiRegion.scaleRegion('us-east-1', {
  servers: 5,
  reason: 'Increased traffic'
});

await multiRegion.evacuateRegion('eu-west-1', {
  reason: 'Planned maintenance',
  redistributeTraffic: true
});
```

## Operational Patterns

### Disaster Recovery

```typescript
const drConfig = {
  backup: {
    schedule: '0 2 * * *', // 2 AM daily
    retention: {
      daily: 7,
      weekly: 4,
      monthly: 12
    },
    targets: [
      { type: 's3', bucket: 'backups-primary' },
      { type: 's3', bucket: 'backups-dr', region: 'us-west-2' }
    ]
  },
  data: {
    databases: ['postgres-main', 'redis-cache'],
    filesystems: ['/data', '/uploads'],
    configs: ['/etc/app', '/opt/app/config']
  },
  recovery: {
    rto: 3600,    // Recovery Time Objective: 1 hour
    rpo: 86400,   // Recovery Point Objective: 24 hours
    testSchedule: '0 0 1 * *' // Monthly testing
  }
};

const dr = patterns.operations.disasterRecovery(drConfig);

// Executing backup
const backupJob = await dr.backup({
  type: 'scheduled',
  incremental: true
});

// Testing recovery
const drTest = await dr.testRecovery({
  environment: 'dr-test',
  pointInTime: '2024-01-01T00:00:00Z'
});

// Real recovery
await dr.recover({
  target: 'production',
  pointInTime: 'latest',
  verify: true
});
```

### Chaos Engineering

```typescript
const chaosConfig = {
  experiments: [
    {
      name: 'network-latency',
      target: { tag: 'service:api' },
      action: 'network.delay',
      parameters: { delay: 100, jitter: 50 },
      duration: '5m'
    },
    {
      name: 'cpu-stress',
      target: { random: 1 }, // Random server
      action: 'resource.cpu',
      parameters: { usage: 80 },
      duration: '10m'
    },
    {
      name: 'kill-instance',
      target: { tag: 'expendable:true' },
      action: 'instance.terminate',
      schedule: 'random'
    }
  ],
  safety: {
    enableKillSwitch: true,
    monitoring: {
      errorRateThreshold: 0.05,
      latencyThreshold: 1000
    }
  }
};

const chaos = patterns.operations.chaosEngineering(chaosConfig);

// Starting chaos experiments
const session = await chaos.startSession({
  experiments: ['network-latency', 'cpu-stress'],
  duration: '1h',
  report: true
});

session.on('experiment:start', (exp) => {
  console.log(`Starting chaos experiment: ${exp.name}`);
});

session.on('safety:triggered', async (reason) => {
  console.error(`Safety triggered: ${reason}`);
  await session.stop();
});
```

### Auto-Scaling

```typescript
const autoScaleConfig = {
  service: 'api-service',
  min: 2,
  max: 10,
  metrics: {
    cpu: {
      target: 70,
      scaleUp: { threshold: 80, duration: '2m' },
      scaleDown: { threshold: 60, duration: '10m' }
    },
    memory: {
      target: 80,
      scaleUp: { threshold: 85, duration: '2m' }
    },
    requestRate: {
      target: 1000, // requests per second per instance
      scaleUp: { threshold: 1200, duration: '1m' }
    }
  },
  cooldown: {
    scaleUp: 180,   // 3 minutes
    scaleDown: 300  // 5 minutes
  },
  predictive: {
    enabled: true,
    model: 'time-series',
    lookback: '7d'
  }
};

const autoScale = patterns.operations.autoScaling(autoScaleConfig);

// Enabling auto-scaling
await autoScale.enable();

// Monitoring scaling events
autoScale.on('scale:up', (event) => {
  console.log(`Scaling up: ${event.from} -> ${event.to} instances`);
});

autoScale.on('scale:predicted', (prediction) => {
  console.log(`Predicted scaling needed at ${prediction.time}`);
});

// Manual control
await autoScale.setDesiredCapacity(5);
await autoScale.suspend(['cpu', 'memory']); // Suspend metrics
```

## Security Patterns

### Zero-Downtime Maintenance

```typescript
const maintenanceConfig = {
  preChecks: [
    { name: 'backup-verify', critical: true },
    { name: 'replica-lag', maxLag: 1000 },
    { name: 'active-connections', maxWait: 300000 }
  ],
  steps: [
    {
      name: 'enable-maintenance-mode',
      action: async () => {
        await setFlag('maintenance_mode', true);
        await displayMessage('System maintenance in progress');
      }
    },
    {
      name: 'drain-connections',
      action: async () => {
        await loadBalancer.drain({ timeout: 60000 });
      }
    },
    {
      name: 'perform-maintenance',
      action: async () => {
        await database.upgrade();
        await application.migrate();
      }
    },
    {
      name: 'verify-health',
      action: async () => {
        await healthCheck.verify({ 
          services: ['database', 'cache', 'api'] 
        });
      }
    }
  ],
  rollback: {
    automatic: true,
    steps: ['restore-backup', 'restart-services']
  }
};

const maintenance = patterns.operations.zeroDowntime(maintenanceConfig);

// Executing maintenance
const result = await maintenance.execute({
  reason: 'Database upgrade',
  notifyUsers: true,
  dryRun: false
});
```

## Custom Patterns

### Creating Your Own Pattern

```typescript
class CustomDeploymentPattern extends DeploymentPattern {
  constructor(config: CustomConfig) {
    super(config);
  }
  
  async validate(): Promise<ValidationResult> {
    // Configuration validation
    return { valid: true };
  }
  
  async execute(params: DeployParams): Promise<DeployResult> {
    // 1. Preparation
    await this.emit('deploy:preparing', params);
    
    // 2. Execute custom logic
    const result = await this.customLogic(params);
    
    // 3. Verification
    if (await this.verify(result)) {
      await this.emit('deploy:completed', result);
      return { success: true, ...result };
    } else {
      await this.rollback(params);
      return { success: false, error: 'Verification failed' };
    }
  }
  
  private async customLogic(params: DeployParams): Promise<any> {
    // Custom logic implementation
  }
}

// Registering pattern
patterns.register('custom-deploy', CustomDeploymentPattern);

// Usage
const customDeploy = patterns.deployment.custom(myConfig);
await customDeploy.execute({ version: '2.0.0' });
```

## Best Practices

1. **Always test patterns** in staging environment
2. **Monitor metrics** during pattern execution
3. **Have a rollback plan** for each pattern
4. **Document custom patterns** for the team
5. **Version pattern configurations**
6. **Use dry-run** before production deployment

## Conclusion

Patterns in Xec Core provide proven solutions for complex deployment and operational scenarios. Using these patterns, you can quickly implement reliable and scalable deployment strategies, following industry best practices.