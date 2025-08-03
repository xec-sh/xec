---
title: Docker Container Deployment
description: Deploy containerized applications using Docker and Docker Compose with Xec
keywords: [docker, container, deployment, compose, swarm, registry]
source_files:
  - packages/core/src/adapters/docker-adapter.ts
  - packages/core/src/docker/docker-client.ts
  - packages/core/src/docker/compose.ts
  - apps/xec/src/commands/in.ts
key_functions:
  - DockerAdapter.execute()
  - DockerClient.run()
  - ComposeOperations.up()
  - DockerClient.build()
verification_date: 2025-01-03
---

# Docker Container Deployment

## Problem

Managing Docker container deployments across development, staging, and production environments, including building images, managing registries, orchestrating multi-container applications, and handling rolling updates.

## Solution

Xec provides comprehensive Docker integration through its execution engine, enabling seamless container management, deployment automation, and orchestration across environments.

## Quick Example

```typescript
// docker-deploy.ts
import { $ } from '@xec-sh/core';

const tag = `myapp:${Date.now()}`;

// Build and push image
await $`docker build -t ${tag} .`;
await $`docker tag ${tag} registry.example.com/${tag}`;
await $`docker push registry.example.com/${tag}`;

// Deploy to production
await $.ssh('prod-server')`
  docker pull registry.example.com/${tag} &&
  docker stop myapp || true &&
  docker run -d --name myapp --rm -p 80:3000 registry.example.com/${tag}
`;
```

## Complete Docker Deployment Recipes

### Configuration

```yaml
# .xec/config.yaml
targets:
  docker-host:
    type: ssh
    host: docker.example.com
    user: deploy
    
  swarm-manager:
    type: ssh
    host: swarm.example.com
    user: deploy
    
  registry:
    type: docker
    host: registry.example.com
    
tasks:
  docker-build:
    description: Build Docker image
    command: xec run scripts/docker-build.ts
    
  docker-deploy:
    description: Deploy Docker containers
    params:
      - name: env
        required: true
        values: [dev, staging, production]
      - name: version
        default: latest
    command: xec run scripts/docker-deploy.ts ${params.env} ${params.version}
```

### Multi-Stage Docker Build and Deploy

```typescript
// scripts/docker-deploy.ts
import { $, $$ } from '@xec-sh/core';
import chalk from 'chalk';
import { readFile } from 'fs/promises';
import crypto from 'crypto';

const environment = process.argv[2] || 'staging';
const version = process.argv[3] || 'latest';

// Configuration
const config = {
  dev: {
    registry: 'localhost:5000',
    host: 'localhost',
    replicas: 1,
    resources: { memory: '512m', cpus: '0.5' }
  },
  staging: {
    registry: 'registry.example.com',
    host: 'staging.example.com',
    replicas: 2,
    resources: { memory: '1g', cpus: '1' }
  },
  production: {
    registry: 'registry.example.com',
    host: 'prod.example.com',
    replicas: 4,
    resources: { memory: '2g', cpus: '2' }
  }
};

const env = config[environment];
if (!env) {
  console.error(chalk.red(`Unknown environment: ${environment}`));
  process.exit(1);
}

console.log(chalk.blue(`🚀 Docker deployment to ${environment}...`));

// 1. Build Docker image with multi-stage Dockerfile
console.log(chalk.gray('Building Docker image...'));

const dockerfile = `
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Development dependencies for build
COPY . .
RUN npm ci && npm run build

# Production stage
FROM node:18-alpine
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
`;

await $`echo '${dockerfile}' > Dockerfile.production`;

// Generate build args
const buildArgs = [
  `BUILD_DATE=${new Date().toISOString()}`,
  `VERSION=${version}`,
  `ENVIRONMENT=${environment}`
];

const imageName = `myapp:${version}-${environment}`;
const fullImageName = `${env.registry}/${imageName}`;

// Build image
const buildResult = await $`
  docker build \
    -f Dockerfile.production \
    ${buildArgs.map(arg => `--build-arg ${arg}`).join(' ')} \
    --cache-from ${env.registry}/myapp:latest \
    --tag ${imageName} \
    --tag ${fullImageName} \
    .
`.nothrow();

if (!buildResult.ok) {
  console.error(chalk.red('❌ Docker build failed'));
  process.exit(1);
}

// 2. Run security scan
console.log(chalk.gray('Running security scan...'));
const scanResult = await $`
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
    aquasec/trivy image ${imageName} \
    --severity HIGH,CRITICAL \
    --exit-code 1
`.nothrow();

if (!scanResult.ok) {
  console.warn(chalk.yellow('⚠️  Security vulnerabilities found'));
  // In production, you might want to exit here
}

// 3. Run tests in container
console.log(chalk.gray('Running tests in container...'));
const testResult = await $`
  docker run --rm ${imageName} npm test
`.nothrow();

if (!testResult.ok) {
  console.error(chalk.red('❌ Tests failed'));
  process.exit(1);
}

// 4. Push to registry
console.log(chalk.gray('Pushing to registry...'));
await $`docker push ${fullImageName}`;

// Tag as latest for this environment
await $`
  docker tag ${fullImageName} ${env.registry}/myapp:${environment}-latest &&
  docker push ${env.registry}/myapp:${environment}-latest
`;

// 5. Deploy to target environment
console.log(chalk.gray(`Deploying to ${environment}...`));

if (environment === 'production') {
  // Deploy to Docker Swarm
  await deployToSwarm(fullImageName, env);
} else {
  // Deploy with Docker Compose
  await deployWithCompose(fullImageName, env);
}

console.log(chalk.green(`✅ Docker deployment to ${environment} completed!`));

// Deployment functions
async function deployToSwarm(image: string, config: any) {
  console.log(chalk.gray('Deploying to Docker Swarm...'));
  
  const serviceName = 'myapp-production';
  
  // Check if service exists
  const serviceExists = await $.ssh('swarm-manager')`
    docker service ls --filter name=${serviceName} --format "{{.Name}}"
  `.text();
  
  if (serviceExists.trim() === serviceName) {
    // Update existing service (rolling update)
    await $.ssh('swarm-manager')`
      docker service update \
        --image ${image} \
        --update-parallelism 2 \
        --update-delay 30s \
        --update-failure-action rollback \
        --update-monitor 30s \
        --rollback-parallelism 1 \
        --rollback-delay 10s \
        ${serviceName}
    `;
  } else {
    // Create new service
    await $.ssh('swarm-manager')`
      docker service create \
        --name ${serviceName} \
        --replicas ${config.replicas} \
        --publish published=80,target=3000 \
        --limit-memory ${config.resources.memory} \
        --limit-cpu ${config.resources.cpus} \
        --restart-condition any \
        --restart-delay 5s \
        --restart-max-attempts 3 \
        --rollback-config delay=10s \
        --health-cmd "curl -f http://localhost:3000/health || exit 1" \
        --health-interval 30s \
        --health-retries 3 \
        --health-timeout 10s \
        --health-start-period 40s \
        ${image}
    `;
  }
  
  // Wait for service to be ready
  console.log(chalk.gray('Waiting for service to be ready...'));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const status = await $.ssh('swarm-manager')`
      docker service ps ${serviceName} \
        --filter "desired-state=running" \
        --format "{{.CurrentState}}"
    `.text();
    
    if (status.includes('Running')) {
      ready = true;
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  if (!ready) {
    throw new Error('Service failed to start');
  }
}

async function deployWithCompose(image: string, config: any) {
  console.log(chalk.gray('Deploying with Docker Compose...'));
  
  // Generate docker-compose.yml
  const composeConfig = `
version: '3.8'

services:
  app:
    image: ${image}
    container_name: myapp-${environment}
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=${environment}
      - PORT=3000
    volumes:
      - ./config:/app/config:ro
      - app-data:/app/data
    networks:
      - app-network
    deploy:
      replicas: ${config.replicas}
      resources:
        limits:
          memory: ${config.resources.memory}
          cpus: '${config.resources.cpus}'
        reservations:
          memory: 256m
          cpus: '0.25'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  nginx:
    image: nginx:alpine
    container_name: nginx-${environment}
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    networks:
      - app-network

  redis:
    image: redis:alpine
    container_name: redis-${environment}
    restart: unless-stopped
    volumes:
      - redis-data:/data
    networks:
      - app-network
    command: redis-server --appendonly yes

volumes:
  app-data:
  redis-data:

networks:
  app-network:
    driver: bridge
`;
  
  // Copy compose file to server
  await $.ssh(config.host)`
    mkdir -p /opt/myapp &&
    cat > /opt/myapp/docker-compose.yml << 'EOF'
${composeConfig}
EOF
  `;
  
  // Deploy with compose
  await $.ssh(config.host)`
    cd /opt/myapp &&
    docker-compose pull &&
    docker-compose up -d --remove-orphans
  `;
  
  // Wait for health check
  console.log(chalk.gray('Waiting for containers to be healthy...'));
  await $.ssh(config.host)`
    docker-compose ps
  `;
}
```

### Blue-Green Deployment

```typescript
// scripts/blue-green-deploy.ts
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

const newVersion = process.argv[2];
const currentColor = await getCurrentColor();
const newColor = currentColor === 'blue' ? 'green' : 'blue';

console.log(chalk.blue(`Starting blue-green deployment...`));
console.log(chalk.gray(`Current: ${currentColor}, New: ${newColor}`));

// 1. Deploy new version to inactive color
await $`
  docker run -d \
    --name myapp-${newColor} \
    --network app-network \
    -e COLOR=${newColor} \
    registry.example.com/myapp:${newVersion}
`;

// 2. Wait for health check
await waitForHealth(`myapp-${newColor}`);

// 3. Run smoke tests
const smokeTests = await $`
  docker run --rm \
    --network app-network \
    test-runner \
    http://myapp-${newColor}:3000
`.nothrow();

if (!smokeTests.ok) {
  console.error(chalk.red('Smoke tests failed, rolling back...'));
  await $`docker stop myapp-${newColor} && docker rm myapp-${newColor}`;
  process.exit(1);
}

// 4. Update load balancer
await $`
  docker exec nginx sed -i \
    's/myapp-${currentColor}/myapp-${newColor}/g' \
    /etc/nginx/nginx.conf &&
  docker exec nginx nginx -s reload
`;

console.log(chalk.green('Traffic switched to new version'));

// 5. Monitor for errors
await new Promise(resolve => setTimeout(resolve, 60000));

// 6. Remove old version
await $`
  docker stop myapp-${currentColor} &&
  docker rm myapp-${currentColor}
`;

// 7. Update color marker
await $`echo ${newColor} > /opt/myapp/current-color`;

console.log(chalk.green(`✅ Blue-green deployment completed`));

async function getCurrentColor(): Promise<string> {
  const result = await $`cat /opt/myapp/current-color 2>/dev/null || echo blue`.text();
  return result.trim();
}

async function waitForHealth(container: string) {
  for (let i = 0; i < 30; i++) {
    const health = await $`
      docker inspect --format='{{.State.Health.Status}}' ${container}
    `.text();
    
    if (health.trim() === 'healthy') {
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error(`Container ${container} failed health check`);
}
```

### Docker Registry Management

```typescript
// scripts/registry-management.ts
import { $ } from '@xec-sh/core';

// Setup local registry
async function setupLocalRegistry() {
  // Run registry with authentication
  await $`
    docker run -d \
      --restart=always \
      --name registry \
      -v registry-data:/var/lib/registry \
      -v registry-auth:/auth \
      -e REGISTRY_AUTH=htpasswd \
      -e REGISTRY_AUTH_HTPASSWD_REALM="Registry Realm" \
      -e REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd \
      -p 5000:5000 \
      registry:2
  `;
  
  // Create user
  await $`
    docker run --rm \
      -v registry-auth:/auth \
      httpd:2 \
      htpasswd -Bbn admin secretpassword > /auth/htpasswd
  `;
  
  // Configure garbage collection
  await $`
    docker exec registry \
      registry garbage-collect /etc/docker/registry/config.yml
  `;
}

// Clean up old images
async function cleanupImages() {
  // Get all tags
  const images = await $`
    curl -s -u admin:secretpassword \
      http://localhost:5000/v2/_catalog
  `.json();
  
  for (const repo of images.repositories) {
    const tags = await $`
      curl -s -u admin:secretpassword \
        http://localhost:5000/v2/${repo}/tags/list
    `.json();
    
    // Keep only last 5 tags
    const sortedTags = tags.tags.sort().reverse();
    const toDelete = sortedTags.slice(5);
    
    for (const tag of toDelete) {
      const manifest = await $`
        curl -s -u admin:secretpassword \
          -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
          http://localhost:5000/v2/${repo}/manifests/${tag}
      `.text();
      
      const digest = manifest.match(/Docker-Content-Digest: (.+)/)?.[1];
      
      if (digest) {
        await $`
          curl -X DELETE -u admin:secretpassword \
            http://localhost:5000/v2/${repo}/manifests/${digest}
        `;
      }
    }
  }
  
  // Run garbage collection
  await $`
    docker exec registry \
      registry garbage-collect /etc/docker/registry/config.yml
  `;
}
```

### Container Monitoring and Logging

```typescript
// scripts/docker-monitoring.ts
import { $ } from '@xec-sh/core';

// Setup monitoring stack
async function setupMonitoring() {
  const composeConfig = `
version: '3.8'

services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    
  grafana:
    image: grafana/grafana
    volumes:
      - grafana-data:/var/lib/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      
  cadvisor:
    image: gcr.io/cadvisor/cadvisor
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    ports:
      - "8080:8080"
      
  loki:
    image: grafana/loki
    ports:
      - "3100:3100"
    volumes:
      - loki-data:/loki
      
  promtail:
    image: grafana/promtail
    volumes:
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - ./promtail-config.yml:/etc/promtail/config.yml
    command: -config.file=/etc/promtail/config.yml

volumes:
  prometheus-data:
  grafana-data:
  loki-data:
`;
  
  await $`echo '${composeConfig}' > monitoring-stack.yml`;
  await $`docker-compose -f monitoring-stack.yml up -d`;
}

// Get container metrics
async function getContainerMetrics(container: string) {
  const stats = await $`
    docker stats ${container} --no-stream --format json
  `.json();
  
  console.log(`Container: ${container}`);
  console.log(`CPU: ${stats.CPUPerc}`);
  console.log(`Memory: ${stats.MemUsage}`);
  console.log(`Network I/O: ${stats.NetIO}`);
  console.log(`Block I/O: ${stats.BlockIO}`);
}

// Stream logs to centralized logging
async function streamLogs(container: string) {
  // Setup Fluentd
  await $`
    docker run -d \
      --name fluentd \
      -v ./fluent.conf:/fluentd/etc/fluent.conf \
      -p 24224:24224 \
      fluent/fluentd
  `;
  
  // Configure container to use Fluentd logging driver
  await $`
    docker run -d \
      --log-driver=fluentd \
      --log-opt fluentd-address=localhost:24224 \
      --log-opt tag="docker.{{.Name}}" \
      ${container}
  `;
}
```

## Usage Examples

```bash
# Build and deploy
xec docker-deploy --env=production --version=v1.2.3

# Blue-green deployment
xec run scripts/blue-green-deploy.ts v1.2.3

# Setup local registry
xec run scripts/registry-management.ts setup

# Monitor containers
xec run scripts/docker-monitoring.ts metrics myapp

# Cleanup old images
xec run scripts/registry-management.ts cleanup
```

## Best Practices

1. **Use multi-stage builds** to minimize image size
2. **Run as non-root user** for security
3. **Implement health checks** in containers
4. **Use specific tags** instead of latest
5. **Scan images for vulnerabilities** before deployment
6. **Implement proper logging** and monitoring
7. **Use secrets management** for sensitive data
8. **Implement graceful shutdown** handling

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs myapp --tail 100

# Inspect container
docker inspect myapp

# Check events
docker events --since 10m
```

### High Memory Usage

```bash
# Check memory limits
docker stats --no-stream

# Update memory limits
docker update --memory="1g" --memory-swap="2g" myapp
```

### Network Issues

```bash
# Inspect network
docker network inspect app-network

# Test connectivity
docker exec myapp ping other-container
```

## Related Topics

- [Kubernetes Deployment](k8s-deploy.md)
- [Node.js Deployment](node-app-deploy.md)
- [CI/CD Integration](../integration/github-actions.md)
- [Container Monitoring](../maintenance/health-checks.md)