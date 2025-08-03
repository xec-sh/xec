---
sidebar_position: 2
title: Local Development Environments
description: Setting up and managing local development environments with Xec
---

# Local Development Environments

## Problem

Development teams need consistent, reproducible local environments that match production. Manual setup leads to "works on my machine" issues, configuration drift, and wasted time onboarding new developers.

## Prerequisites

- Xec CLI installed (`npm install -g @xec-sh/cli`)
- Docker installed (for container-based environments)
- Basic understanding of Xec configuration

## Solution

### Step 1: Initialize Your Development Environment

Create a `.xec/config.yaml` file to define your development environment:

```yaml
name: my-app-dev
description: Local development environment

targets:
  local:
    type: local
    env:
      NODE_ENV: development
      DEBUG: "app:*"
  
  containers:
    database:
      type: docker
      image: postgres:15
      ports:
        - "5432:5432"
      env:
        POSTGRES_USER: dev
        POSTGRES_PASSWORD: dev
        POSTGRES_DB: myapp
      volumes:
        - ./data/postgres:/var/lib/postgresql/data
    
    redis:
      type: docker
      image: redis:7-alpine
      ports:
        - "6379:6379"

tasks:
  setup:
    description: Setup development environment
    steps:
      - name: Install dependencies
        command: npm install
      
      - name: Start services
        task: start-services
      
      - name: Run migrations
        command: npm run migrate
      
      - name: Seed database
        command: npm run seed
  
  start-services:
    description: Start all development services
    steps:
      - name: Start database
        command: docker start myapp-postgres || docker run -d --name myapp-postgres -p 5432:5432 -e POSTGRES_USER=dev -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=myapp postgres:15
      
      - name: Start Redis
        command: docker start myapp-redis || docker run -d --name myapp-redis -p 6379:6379 redis:7-alpine
      
      - name: Wait for services
        command: |
          echo "Waiting for services to be ready..."
          while ! nc -z localhost 5432; do sleep 1; done
          while ! nc -z localhost 6379; do sleep 1; done
          echo "All services ready!"
  
  dev:
    description: Start development server
    steps:
      - name: Ensure services running
        task: start-services
      
      - name: Start dev server
        command: npm run dev
        interactive: true
```

### Step 2: Create Environment-Specific Scripts

Create development scripts in `.xec/scripts/dev-setup.js`:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

// Check required tools
async function checkRequirements() {
  const checks = [
    { cmd: 'node --version', name: 'Node.js', min: '18.0.0' },
    { cmd: 'npm --version', name: 'npm', min: '8.0.0' },
    { cmd: 'docker --version', name: 'Docker' }
  ];

  for (const check of checks) {
    try {
      const result = await $`${check.cmd}`;
      console.log(`✓ ${check.name}: ${result.stdout.trim()}`);
    } catch (error) {
      console.error(`✗ ${check.name} not found`);
      process.exit(1);
    }
  }
}

// Setup environment variables
async function setupEnv() {
  const envFile = '.env.local';
  
  if (!await $.exists(envFile)) {
    console.log('Creating .env.local from template...');
    await $`cp .env.example ${envFile}`;
    
    // Generate secrets
    const secret = await $`openssl rand -hex 32`;
    await $`sed -i '' 's/JWT_SECRET=.*/JWT_SECRET=${secret.stdout.trim()}/' ${envFile}`;
  }
}

// Main setup
async function main() {
  console.log('🚀 Setting up development environment...\n');
  
  await checkRequirements();
  await setupEnv();
  
  // Run setup task
  await $`xec run setup`;
  
  console.log('\n✅ Development environment ready!');
  console.log('Run "xec run dev" to start the development server');
}

main().catch(console.error);
```

### Step 3: Manage Multiple Environments

Create profiles for different development scenarios:

```yaml
# .xec/config.yaml
profiles:
  default:
    env:
      NODE_ENV: development
      API_URL: http://localhost:3000
  
  testing:
    env:
      NODE_ENV: test
      DATABASE_URL: postgres://test:test@localhost:5432/test
  
  staging:
    env:
      NODE_ENV: staging
      API_URL: https://staging.example.com

commands:
  env:
    switch:
      description: Switch environment profile
      options:
        - name: profile
          type: string
          required: true
          choices: [default, testing, staging]
      action: |
        echo "Switching to ${profile} environment..."
        xec config set profile ${profile}
        xec run setup
```

### Step 4: Container-Based Development

For fully containerized development:

```yaml
# docker-compose.xec.yaml
version: '3.8'

services:
  app:
    build: .
    volumes:
      - .:/app
      - /app/node_modules
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
    command: npm run dev
    depends_on:
      - postgres
      - redis
  
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: myapp
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine

volumes:
  postgres_data:
```

Use with Xec:

```javascript
// .xec/scripts/docker-dev.js
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

const compose = $.docker.compose({
  file: 'docker-compose.xec.yaml',
  project: 'myapp-dev'
});

// Start development environment
await compose`up -d`;

// Follow logs
await compose`logs -f app`;
```

### Step 5: Hot Reload and File Watching

Set up automatic reload on file changes:

```javascript
// .xec/scripts/watch.js
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';
import { watch } from 'fs/promises';

const watchers = [
  {
    path: './src',
    pattern: '**/*.{js,ts,jsx,tsx}',
    command: 'npm run lint',
    debounce: 1000
  },
  {
    path: './tests',
    pattern: '**/*.test.{js,ts}',
    command: 'npm test',
    debounce: 2000
  }
];

for (const watcher of watchers) {
  $.watch(watcher.path, watcher.pattern, async (event, filename) => {
    console.log(`File changed: ${filename}`);
    await $`${watcher.command}`.nothrow();
  }, { debounce: watcher.debounce });
}

console.log('Watching for changes... Press Ctrl+C to stop');
```

## Best Practices

1. **Version Control Your Environment**
   - Always commit `.xec/config.yaml`
   - Use `.env.example` templates
   - Document environment-specific requirements

2. **Isolate Dependencies**
   - Use containers for services
   - Avoid global installations
   - Pin versions explicitly

3. **Automate Everything**
   - One-command setup
   - Automated health checks
   - Self-documenting scripts

4. **Environment Parity**
   - Match production versions
   - Use same configuration structure
   - Test with production-like data

5. **Fast Feedback Loops**
   - Hot reload for code changes
   - Automatic test runs
   - Instant error notifications

## Common Pitfalls

1. **Hardcoded Paths**
   - ❌ `/Users/john/projects/myapp`
   - ✅ Use relative paths or `${XEC_PROJECT_ROOT}`

2. **Missing Health Checks**
   - ❌ Assuming services are ready immediately
   - ✅ Always wait for services to be healthy

3. **Uncommitted Environment Files**
   - ❌ Forgetting to update `.env.example`
   - ✅ Use git hooks to check for updates

4. **Resource Conflicts**
   - ❌ Fixed ports without checking availability
   - ✅ Use dynamic ports or check before binding

## Troubleshooting

### Issue: Port Already in Use
```bash
# Find process using port
lsof -i :3000

# Kill process or use different port
xec config set ports.app 3001
```

### Issue: Container Permissions
```yaml
# Fix volume permissions
services:
  app:
    user: "${UID}:${GID}"
    volumes:
      - .:/app:delegated
```

### Issue: Slow File Syncing
```yaml
# Optimize Docker volume performance
volumes:
  - .:/app:cached  # For read-heavy workloads
  - ./src:/app/src:delegated  # For write-heavy workloads
```

### Issue: Environment Variables Not Loading
```javascript
// Check environment loading
await $`xec run env:check`;

// Debug specific variable
console.log(process.env.MY_VAR);
```

## Related Guides

- [Debugging](./debugging.md) - Debugging Xec scripts
- [Container Orchestration](../infrastructure/container-orchestration.md) - Advanced Docker workflows