---
title: Hot Reload Development Workflows  
description: Implement hot reload and live development workflows using Xec
keywords: [development, hot reload, watch, live reload, dev server]
source_files:
  - apps/xec/src/commands/watch.ts
  - packages/core/src/adapters/local-adapter.ts
  - packages/core/src/utils/stream.ts
key_functions:
  - WatchCommand.execute()
  - LocalAdapter.execute()
  - createWatcher()
verification_date: 2025-01-03
---

# Hot Reload Development Workflows

## Problem

Setting up efficient development workflows with automatic rebuilding, hot module replacement, and synchronized browser reload across multiple services and environments.

## Solution

Xec provides integrated file watching and command execution capabilities, enabling sophisticated hot reload workflows for frontend, backend, and full-stack development.

## Quick Example

```typescript
// dev-server.ts
import { $, $$ } from '@xec-sh/core';

// Watch and rebuild on changes
$$`xec watch "src/**/*.ts" "npm run build"`;

// Run dev server with hot reload
$$`npm run dev`;

// Open browser
await $`open http://localhost:3000`;
```

## Complete Hot Reload Recipes

### Configuration

```yaml
# .xec/config.yaml
development:
  watch:
    debounce: 300
    ignore:
      - node_modules
      - .git
      - dist
      - coverage
  servers:
    frontend:
      port: 3000
      command: npm run dev:frontend
    backend:
      port: 5000
      command: npm run dev:backend
    database:
      port: 5432
      command: docker-compose up postgres

tasks:
  dev:
    description: Start development environment
    command: xec run scripts/dev-server.ts
  watch:
    description: Watch and rebuild
    command: xec watch "src/**/*" "npm run build"
```

### Full-Stack Development Server

```typescript
// scripts/dev-server.ts
import { $, $$ } from '@xec-sh/core';
import chalk from 'chalk';
import chokidar from 'chokidar';
import WebSocket from 'ws';
import { createServer } from 'http';
import path from 'path';

console.log(chalk.blue('🚀 Starting development environment...'));

// Configuration
const config = {
  frontend: {
    port: 3000,
    src: './frontend/src',
    dist: './frontend/dist',
    build: 'npm run build:frontend',
    serve: 'npm run serve:frontend'
  },
  backend: {
    port: 5000,
    src: './backend/src',
    build: 'npm run build:backend',
    serve: 'npm run serve:backend',
    restart: true
  },
  database: {
    port: 5432,
    container: 'postgres-dev'
  },
  proxy: {
    port: 8080,
    targets: {
      '/api': 'http://localhost:5000',
      '/': 'http://localhost:3000'
    }
  }
};

// Process management
const processes = new Map();
const sockets = new Set();

// WebSocket server for hot reload
const wss = new WebSocket.Server({ port: 35729 });
wss.on('connection', (ws) => {
  sockets.add(ws);
  ws.on('close', () => sockets.delete(ws));
});

// Notify browsers to reload
function notifyReload(type: string = 'reload') {
  const message = JSON.stringify({ type, timestamp: Date.now() });
  sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

// Frontend development with hot module replacement
async function startFrontend() {
  console.log(chalk.gray('Starting frontend development server...'));
  
  // Use Vite for frontend
  const viteConfig = `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: ${config.frontend.port},
    hmr: {
      port: 35730
    },
    proxy: {
      '/api': {
        target: 'http://localhost:${config.backend.port}',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '${config.frontend.dist}',
    sourcemap: true
  }
});
`;
  
  await $`echo '${viteConfig}' > frontend/vite.config.ts`;
  
  // Start Vite dev server
  const frontend = $$`cd frontend && npm run dev`;
  processes.set('frontend', frontend);
  
  // Watch for changes
  const watcher = chokidar.watch(config.frontend.src, {
    ignored: /node_modules/,
    persistent: true
  });
  
  watcher.on('change', async (filePath) => {
    console.log(chalk.gray(`Frontend change detected: ${filePath}`));
    
    // Vite handles HMR automatically
    if (filePath.endsWith('.css') || filePath.endsWith('.scss')) {
      notifyReload('style');
    } else if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      notifyReload('hmr');
    }
  });
  
  console.log(chalk.green(`  ✓ Frontend running on http://localhost:${config.frontend.port}`));
}

// Backend development with auto-restart
async function startBackend() {
  console.log(chalk.gray('Starting backend development server...'));
  
  // Use nodemon for backend
  const nodemonConfig = {
    watch: [config.backend.src],
    ext: 'ts,js,json',
    exec: 'ts-node',
    env: {
      NODE_ENV: 'development',
      PORT: config.backend.port
    }
  };
  
  await $`echo '${JSON.stringify(nodemonConfig, null, 2)}' > backend/nodemon.json`;
  
  // Start backend with nodemon
  const backend = $$`cd backend && npx nodemon src/index.ts`;
  processes.set('backend', backend);
  
  // Watch for backend changes
  const watcher = chokidar.watch(config.backend.src, {
    ignored: /node_modules/,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  });
  
  let restartTimeout;
  watcher.on('change', async (filePath) => {
    console.log(chalk.gray(`Backend change detected: ${filePath}`));
    
    // Debounce restarts
    clearTimeout(restartTimeout);
    restartTimeout = setTimeout(() => {
      console.log(chalk.yellow('  Restarting backend...'));
      notifyReload('backend-restart');
    }, 500);
  });
  
  // Wait for backend to be ready
  let backendReady = false;
  for (let i = 0; i < 30; i++) {
    const health = await $`curl -f http://localhost:${config.backend.port}/health`.nothrow();
    if (health.ok) {
      backendReady = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (backendReady) {
    console.log(chalk.green(`  ✓ Backend running on http://localhost:${config.backend.port}`));
  } else {
    console.error(chalk.red('  ✗ Backend failed to start'));
  }
}

// Database setup
async function startDatabase() {
  console.log(chalk.gray('Starting database...'));
  
  // Check if container exists
  const exists = await $`docker ps -a --filter name=${config.database.container} -q`.text();
  
  if (!exists) {
    // Create new container
    await $`
      docker run -d \
        --name ${config.database.container} \
        -e POSTGRES_USER=dev \
        -e POSTGRES_PASSWORD=dev \
        -e POSTGRES_DB=devdb \
        -p ${config.database.port}:5432 \
        -v postgres-dev-data:/var/lib/postgresql/data \
        postgres:15-alpine
    `;
  } else {
    // Start existing container
    await $`docker start ${config.database.container}`;
  }
  
  // Wait for database to be ready
  let dbReady = false;
  for (let i = 0; i < 30; i++) {
    const result = await $`
      docker exec ${config.database.container} \
      pg_isready -U dev
    `.nothrow();
    
    if (result.ok) {
      dbReady = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (dbReady) {
    console.log(chalk.green(`  ✓ Database running on port ${config.database.port}`));
    
    // Run migrations
    await $`cd backend && npm run migrate:dev`.nothrow();
  } else {
    console.error(chalk.red('  ✗ Database failed to start'));
  }
}

// Proxy server for unified access
async function startProxy() {
  console.log(chalk.gray('Starting proxy server...'));
  
  const proxyConfig = `
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Proxy API requests to backend
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:${config.backend.port}',
  changeOrigin: true,
  ws: true
}));

// Proxy WebSocket for hot reload
app.use('/ws', createProxyMiddleware({
  target: 'ws://localhost:35729',
  ws: true,
  changeOrigin: true
}));

// Proxy everything else to frontend
app.use('/', createProxyMiddleware({
  target: 'http://localhost:${config.frontend.port}',
  changeOrigin: true,
  ws: true
}));

app.listen(${config.proxy.port}, () => {
  console.log('Proxy server running on port ${config.proxy.port}');
});
`;
  
  await $`echo '${proxyConfig}' > proxy-server.js`;
  
  const proxy = $$`node proxy-server.js`;
  processes.set('proxy', proxy);
  
  console.log(chalk.green(`  ✓ Proxy running on http://localhost:${config.proxy.port}`));
}

// Browser sync for multi-device testing
async function startBrowserSync() {
  console.log(chalk.gray('Starting browser sync...'));
  
  const bsConfig = {
    proxy: `localhost:${config.proxy.port}`,
    port: 3001,
    ui: { port: 3002 },
    files: [
      `${config.frontend.dist}/**/*`,
      `${config.frontend.src}/**/*.css`
    ],
    ghostMode: {
      clicks: true,
      forms: true,
      scroll: true
    },
    open: false
  };
  
  await $`echo '${JSON.stringify(bsConfig, null, 2)}' > bs-config.json`;
  
  const browserSync = $$`npx browser-sync start --config bs-config.json`;
  processes.set('browser-sync', browserSync);
  
  console.log(chalk.green('  ✓ Browser Sync UI on http://localhost:3002'));
}

// TypeScript watch compilation
async function startTypeScriptWatch() {
  console.log(chalk.gray('Starting TypeScript watch mode...'));
  
  // Frontend TypeScript watch
  const tscFrontend = $$`cd frontend && npx tsc --watch --noEmit`;
  processes.set('tsc-frontend', tscFrontend);
  
  // Backend TypeScript watch
  const tscBackend = $$`cd backend && npx tsc --watch --noEmit`;
  processes.set('tsc-backend', tscBackend);
  
  console.log(chalk.green('  ✓ TypeScript watch mode active'));
}

// Test runner in watch mode
async function startTestRunner() {
  console.log(chalk.gray('Starting test runner...'));
  
  // Frontend tests
  const testFrontend = $$`cd frontend && npm run test:watch`;
  processes.set('test-frontend', testFrontend);
  
  // Backend tests
  const testBackend = $$`cd backend && npm run test:watch`;
  processes.set('test-backend', testBackend);
  
  console.log(chalk.green('  ✓ Test runners active'));
}

// Cleanup function
function cleanup() {
  console.log(chalk.yellow('\n📦 Shutting down development environment...'));
  
  // Kill all processes
  processes.forEach((process, name) => {
    console.log(chalk.gray(`  Stopping ${name}...`));
    process.kill();
  });
  
  // Close WebSocket connections
  sockets.forEach(ws => ws.close());
  wss.close();
  
  // Stop database
  $$`docker stop ${config.database.container}`.nothrow();
  
  process.exit(0);
}

// Handle shutdown
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Main execution
async function startDevelopment() {
  try {
    // Start services in order
    await startDatabase();
    await startBackend();
    await startFrontend();
    await startProxy();
    await startBrowserSync();
    await startTypeScriptWatch();
    await startTestRunner();
    
    console.log(chalk.green('\n✅ Development environment ready!'));
    console.log(chalk.cyan('  Main URL: http://localhost:8080'));
    console.log(chalk.cyan('  Frontend: http://localhost:3000'));
    console.log(chalk.cyan('  Backend: http://localhost:5000'));
    console.log(chalk.cyan('  BrowserSync: http://localhost:3002'));
    console.log(chalk.gray('\n  Press Ctrl+C to stop all services'));
    
    // Open browser
    await $`open http://localhost:8080`;
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Failed to start development environment: ${error.message}`));
    cleanup();
  }
}

// Start everything
await startDevelopment();
```

### Mobile Development Hot Reload

```typescript
// scripts/mobile-dev.ts
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

// React Native development
async function startReactNative() {
  // Start Metro bundler
  const metro = $$`npx react-native start --reset-cache`;
  
  // Start iOS simulator
  await $`open -a Simulator`;
  await $`npx react-native run-ios --simulator="iPhone 14"`;
  
  // Start Android emulator
  await $`emulator -avd Pixel_6_API_33 -no-snapshot-load`;
  await $`npx react-native run-android`;
  
  // Enable hot reload
  await $`
    adb shell input keyevent 82 &&
    adb shell input keyevent 20 &&
    adb shell input keyevent 66
  `;
}

// Flutter development
async function startFlutter() {
  // Run on all devices
  await $`flutter run -d all --hot`;
  
  // Watch for changes
  $$`flutter analyze --watch`;
}
```

## Usage Examples

```bash
# Start full development environment
xec dev

# Watch specific files
xec watch "src/**/*.ts" "npm run build"

# Start with specific services
xec run scripts/dev-server.ts --only=frontend,backend

# Mobile development
xec run scripts/mobile-dev.ts react-native
```

## Best Practices

1. **Use file watching efficiently** with proper ignore patterns
2. **Debounce rapid changes** to avoid excessive rebuilds
3. **Implement graceful shutdown** for all processes
4. **Use hot module replacement** when possible
5. **Separate build and serve** processes
6. **Monitor memory usage** during long dev sessions
7. **Cache dependencies** for faster rebuilds

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 xec dev
```

### Hot Reload Not Working

```bash
# Clear caches
rm -rf node_modules/.cache
rm -rf .next .nuxt dist

# Restart with clean state
xec dev --clean
```

## Related Topics

- [Database Setup](database-setup.md)
- [API Mocking](api-mocking.md)
- [Test Data Generation](test-data.md)
- [Docker Development](../deployment/docker-deploy.md)