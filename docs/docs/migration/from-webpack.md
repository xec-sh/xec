---
title: Migrating from Webpack Build Scripts
description: Guide for migrating webpack build automation to Xec
keywords: [migration, webpack, build, bundling, automation]
source_files:
  - apps/xec/src/commands/watch.ts
  - apps/xec/src/script-runner.ts
  - packages/core/src/core/execution-engine.ts
verification_date: 2025-08-03
---

# Migrating from Webpack Build Scripts to Xec

## Overview

This guide helps you migrate webpack-based build automation to Xec. While webpack excels at bundling, teams often wrap it with complex Node.js scripts for deployment, environment management, and multi-stage builds. Xec simplifies this orchestration while keeping webpack for what it does best.

## Why Use Xec with Webpack?

### Traditional Webpack Setup

```javascript
// scripts/build.js - Complex build orchestration
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const { merge } = require('webpack-merge');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

async function clean() {
  console.log('Cleaning build directory...');
  await fs.remove('dist');
}

async function buildApp(env) {
  const configBase = require('../webpack.config.base');
  const configEnv = require(`../webpack.config.${env}`);
  const config = merge(configBase, configEnv);
  
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) return reject(err);
      
      if (stats.hasErrors()) {
        console.error(stats.toString('errors-only'));
        return reject(new Error('Build failed'));
      }
      
      console.log(stats.toString({
        colors: true,
        modules: false,
        children: false
      }));
      
      resolve(stats);
    });
  });
}

async function optimizeAssets() {
  console.log('Optimizing assets...');
  await execAsync('imagemin dist/images/* --out-dir=dist/images');
  await execAsync('terser dist/js/*.js -o dist/js/');
}

async function deployToServer(env) {
  const servers = {
    staging: ['staging.example.com'],
    production: ['prod1.example.com', 'prod2.example.com']
  };
  
  for (const server of servers[env]) {
    console.log(`Deploying to ${server}...`);
    await execAsync(`rsync -avz dist/ ${server}:/var/www/`);
    await execAsync(`ssh ${server} "systemctl restart nginx"`);
  }
}

// Main build pipeline
async function build() {
  const env = process.argv[2] || 'development';
  
  try {
    await clean();
    await buildApp(env);
    
    if (env === 'production') {
      await optimizeAssets();
    }
    
    if (env !== 'development') {
      await deployToServer(env);
    }
    
    console.log('Build complete!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
```

**Problems:**
- Complex orchestration code
- Poor error handling
- No parallelization
- Platform-specific commands
- Difficult testing
- Limited reusability

### Xec + Webpack Solution

```typescript
// scripts/build.ts - Clean orchestration with Xec
import { $, on, glob } from '@xec-sh/core';
import { rm } from 'fs/promises';

const env = process.argv[2] || 'development';

// Clean build directory
await rm('dist', { recursive: true, force: true });

// Run webpack with appropriate config
await $`webpack --mode ${env} --config webpack.config.${env}.js`;

// Production optimizations in parallel
if (env === 'production') {
  await Promise.all([
    $`imagemin dist/images/* --out-dir=dist/images`,
    $`terser dist/js/*.js -o dist/js/`,
    $`postcss dist/css/*.css --use cssnano -d dist/css/`
  ]);
}

// Deploy to appropriate servers
if (env !== 'development') {
  const servers = env === 'production' 
    ? ['prod1', 'prod2'] 
    : ['staging'];
  
  await Promise.all(
    servers.map(server => 
      on(server, 'mkdir -p /var/www && systemctl restart nginx')
    )
  );
  
  await $`xec copy dist/ ${servers.map(s => `${s}:/var/www/`).join(' ')}`;
}

console.log('✅ Build complete!');
```

**Benefits:**
- Cleaner orchestration code
- Built-in parallelization
- Cross-platform compatibility
- Better error handling
- Multi-environment support
- TypeScript type safety

## Core Integration Patterns

### 1. Webpack as a Tool, Not the Orchestrator

**Before:** Webpack plugins handle everything
```javascript
// webpack.config.js
const CopyPlugin = require('copy-webpack-plugin');
const HtmlPlugin = require('html-webpack-plugin');
const CleanPlugin = require('clean-webpack-plugin');
const S3Plugin = require('webpack-s3-plugin');

module.exports = {
  plugins: [
    new CleanPlugin(),
    new CopyPlugin({ patterns: [...] }),
    new HtmlPlugin({ template: '...' }),
    new S3Plugin({ s3Options: {...} })
  ]
};
```

**After:** Webpack focuses on bundling, Xec handles orchestration
```yaml
# .xec/config.yaml
tasks:
  build:
    steps:
      - name: Clean
        command: rm -rf dist
      - name: Bundle
        command: webpack --mode production
      - name: Copy assets
        command: xec copy public/ dist/
      - name: Generate HTML
        script: scripts/generate-html.ts
      - name: Deploy to S3
        command: aws s3 sync dist/ s3://my-bucket/
```

### 2. Environment Management

**Traditional Webpack Approach:**
```javascript
// Multiple config files
// webpack.config.dev.js
// webpack.config.staging.js  
// webpack.config.prod.js

const config = require(`./webpack.config.${process.env.NODE_ENV}`);
```

**Xec Approach:**
```typescript
// scripts/build.ts
import { $ } from '@xec-sh/core';

interface BuildConfig {
  mode: 'development' | 'production';
  sourceMaps: boolean;
  minify: boolean;
  apiUrl: string;
  cdnUrl?: string;
}

const configs: Record<string, BuildConfig> = {
  development: {
    mode: 'development',
    sourceMaps: true,
    minify: false,
    apiUrl: 'http://localhost:3000'
  },
  staging: {
    mode: 'production',
    sourceMaps: true,
    minify: true,
    apiUrl: 'https://api-staging.example.com',
    cdnUrl: 'https://cdn-staging.example.com'
  },
  production: {
    mode: 'production',
    sourceMaps: false,
    minify: true,
    apiUrl: 'https://api.example.com',
    cdnUrl: 'https://cdn.example.com'
  }
};

const env = process.argv[2] || 'development';
const config = configs[env];

// Set environment variables for webpack
process.env.NODE_ENV = config.mode;
process.env.API_URL = config.apiUrl;
if (config.cdnUrl) process.env.CDN_URL = config.cdnUrl;

// Run webpack with dynamic configuration
await $`webpack \
  --mode ${config.mode} \
  ${config.sourceMaps ? '--devtool source-map' : ''} \
  ${config.minify ? '--optimization-minimize' : ''}`;
```

## Common Webpack Tasks Migration

### 1. Development Server

**Webpack Dev Server:**
```javascript
// scripts/dev-server.js
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const config = require('../webpack.config.dev');

const compiler = webpack(config);
const server = new WebpackDevServer({
  hot: true,
  open: true,
  proxy: {
    '/api': 'http://localhost:3000'
  }
}, compiler);

server.start(8080);
```

**Xec with Webpack:**
```typescript
// scripts/dev.ts
import { $, watch } from '@xec-sh/core';

// Start backend and frontend in parallel
await Promise.all([
  // Backend API server
  $`nodemon server.js`,
  
  // Webpack dev server
  $`webpack serve --config webpack.config.dev.js --port 8080`,
  
  // Additional watchers
  watch({
    'src/styles/**/*.scss': async () => {
      await $`sass src/styles:dist/css`;
    },
    'docs/**/*.md': async () => {
      await $`markdown-pdf docs/*.md`;
    }
  })
]);
```

### 2. Multi-Configuration Builds

**Complex Webpack Setup:**
```javascript
// build-all.js
const configs = [
  require('./webpack.config.app'),
  require('./webpack.config.vendor'),
  require('./webpack.config.workers')
];

async function buildAll() {
  for (const config of configs) {
    await new Promise((resolve, reject) => {
      webpack(config, (err, stats) => {
        if (err || stats.hasErrors()) reject(err);
        else resolve(stats);
      });
    });
  }
}
```

**Xec Approach:**
```typescript
// scripts/build-all.ts
import { $ } from '@xec-sh/core';

const builds = [
  { name: 'app', entry: 'src/index.js', output: 'dist/app.js' },
  { name: 'vendor', entry: 'src/vendor.js', output: 'dist/vendor.js' },
  { name: 'workers', entry: 'src/workers/', output: 'dist/workers/' }
];

// Build in parallel with progress tracking
const results = await Promise.all(
  builds.map(async ({ name, entry, output }) => {
    console.log(`📦 Building ${name}...`);
    
    const result = await $`webpack \
      --entry ${entry} \
      --output-path ${output} \
      --mode production`.nothrow();
    
    if (result.ok) {
      console.log(`✅ ${name} built successfully`);
    } else {
      console.error(`❌ ${name} build failed`);
    }
    
    return result;
  })
);

// Check if any builds failed
const failed = results.filter(r => !r.ok);
if (failed.length > 0) {
  throw new Error(`${failed.length} builds failed`);
}
```

### 3. Asset Optimization

**Webpack Plugin Approach:**
```javascript
// webpack.config.js
const ImageMinimizerPlugin = require('image-minimizer-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  optimization: {
    minimizer: [
      new TerserPlugin(),
      new CssMinimizerPlugin(),
      new ImageMinimizerPlugin({
        minimizer: {
          implementation: ImageMinimizerPlugin.imageminMinify,
          options: { plugins: [...] }
        }
      })
    ]
  }
};
```

**Xec Post-Processing:**
```typescript
// scripts/optimize.ts
import { $, glob } from '@xec-sh/core';

// Run webpack first
await $`webpack --mode production`;

// Post-process assets in parallel
console.log('🎨 Optimizing assets...');

const [images, styles, scripts] = await Promise.all([
  // Optimize images
  glob('dist/**/*.{jpg,png,gif,svg}').then(files => 
    Promise.all(files.map(file => 
      $`imagemin ${file} --out-dir=${path.dirname(file)}`
    ))
  ),
  
  // Optimize CSS
  glob('dist/**/*.css').then(files =>
    Promise.all(files.map(file =>
      $`postcss ${file} --use cssnano -o ${file}`
    ))
  ),
  
  // Optimize JS (if not done by webpack)
  glob('dist/**/*.js').then(files =>
    Promise.all(files.map(file =>
      $`terser ${file} -o ${file} --compress --mangle`
    ))
  )
]);

console.log(`✅ Optimized ${images.length} images, ${styles.length} styles, ${scripts.length} scripts`);
```

### 4. Bundle Analysis

**Traditional Approach:**
```javascript
// analyze.js
const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const config = require('./webpack.config');

config.plugins.push(new BundleAnalyzerPlugin());
webpack(config);
```

**Xec Approach:**
```typescript
// scripts/analyze.ts
import { $, fs } from '@xec-sh/core';

// Build with stats
await $`webpack --mode production --json > stats.json`;

// Analyze bundle size
const stats = JSON.parse(await fs.readFile('stats.json', 'utf-8'));

// Custom analysis
const assets = stats.assets.sort((a, b) => b.size - a.size);

console.log('📊 Bundle Analysis:');
console.log('==================');

assets.slice(0, 10).forEach(asset => {
  const sizeKB = (asset.size / 1024).toFixed(2);
  console.log(`${asset.name.padEnd(40)} ${sizeKB} KB`);
});

// Generate visual report
await $`webpack-bundle-analyzer stats.json dist -m static -r report.html`;

// Check size limits
const totalSize = assets.reduce((sum, a) => sum + a.size, 0);
const maxSize = 500 * 1024; // 500KB

if (totalSize > maxSize) {
  console.error(`❌ Bundle too large: ${(totalSize / 1024).toFixed(2)}KB > ${maxSize / 1024}KB`);
  process.exit(1);
}
```

## Advanced Webpack + Xec Patterns

### 1. Micro-Frontend Builds

```typescript
// scripts/build-microfrontends.ts
import { $, glob } from '@xec-sh/core';

interface MicroFrontend {
  name: string;
  path: string;
  port: number;
  publicPath: string;
}

const apps: MicroFrontend[] = [
  { name: 'shell', path: 'apps/shell', port: 3000, publicPath: '/' },
  { name: 'auth', path: 'apps/auth', port: 3001, publicPath: '/auth' },
  { name: 'dashboard', path: 'apps/dashboard', port: 3002, publicPath: '/dashboard' }
];

// Build all micro-frontends
async function buildAll(mode: string) {
  const builds = apps.map(async (app) => {
    console.log(`🏗️ Building ${app.name}...`);
    
    process.chdir(app.path);
    
    await $`webpack \
      --mode ${mode} \
      --output-public-path ${app.publicPath} \
      --define process.env.PORT=${app.port}`;
    
    process.chdir('../..');
    
    return app.name;
  });
  
  const completed = await Promise.all(builds);
  console.log(`✅ Built: ${completed.join(', ')}`);
}

// Development mode - start all dev servers
async function startDev() {
  const servers = apps.map(app => 
    $`cd ${app.path} && webpack serve --port ${app.port}`
  );
  
  await Promise.all(servers);
}

// Production build and deploy
async function deploy() {
  await buildAll('production');
  
  // Deploy each app to its CDN path
  await Promise.all(
    apps.map(app => 
      $`aws s3 sync ${app.path}/dist s3://cdn-bucket${app.publicPath}`
    )
  );
}

const command = process.argv[2];

switch (command) {
  case 'dev':
    await startDev();
    break;
  case 'build':
    await buildAll('production');
    break;
  case 'deploy':
    await deploy();
    break;
}
```

### 2. Dynamic Import Testing

```typescript
// scripts/test-chunks.ts
import { $, glob, fs } from '@xec-sh/core';

// Build with code splitting
await $`webpack --mode production`;

// Analyze chunk loading
const chunks = await glob('dist/js/*.chunk.js');

console.log('🧩 Testing dynamic chunks...');

for (const chunk of chunks) {
  const size = (await fs.stat(chunk)).size;
  
  // Ensure chunks are reasonably sized
  if (size > 50 * 1024) { // 50KB
    console.warn(`⚠️ Large chunk: ${chunk} (${(size / 1024).toFixed(2)}KB)`);
  }
  
  // Test chunk loading in headless browser
  await $`npx playwright test --grep "${path.basename(chunk)}"`;
}
```

### 3. Progressive Web App Build

```typescript
// scripts/build-pwa.ts
import { $, fs } from '@xec-sh/core';

// Build the app
await $`webpack --mode production`;

// Generate service worker
await $`workbox generateSW workbox-config.js`;

// Generate manifest
const manifest = {
  name: 'My PWA',
  short_name: 'PWA',
  icons: await generateIcons(),
  start_url: '/',
  display: 'standalone',
  theme_color: '#000000',
  background_color: '#ffffff'
};

await fs.writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2));

// Test PWA compliance
const result = await $`lighthouse https://localhost:8080 \
  --only-categories=pwa \
  --output=json \
  --output-path=pwa-report.json`.nothrow();

if (result.ok) {
  const report = JSON.parse(await fs.readFile('pwa-report.json', 'utf-8'));
  const score = report.categories.pwa.score * 100;
  
  console.log(`📱 PWA Score: ${score}%`);
  
  if (score < 90) {
    console.error('❌ PWA score too low');
    process.exit(1);
  }
}

async function generateIcons() {
  const sizes = [192, 512];
  const icons = [];
  
  for (const size of sizes) {
    await $`sharp icon.png --resize ${size} --output dist/icon-${size}.png`;
    icons.push({
      src: `/icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: 'image/png'
    });
  }
  
  return icons;
}
```

## Webpack Configuration Management

### Dynamic Configuration with Xec

```typescript
// scripts/webpack-config.ts
import { $ } from '@xec-sh/core';
import { writeFile } from 'fs/promises';

interface WebpackEnv {
  mode: 'development' | 'production';
  target: 'web' | 'node' | 'electron';
  features: {
    pwa?: boolean;
    ssr?: boolean;
    splitChunks?: boolean;
    analyzer?: boolean;
  };
}

function generateWebpackConfig(env: WebpackEnv) {
  return {
    mode: env.mode,
    target: env.target,
    entry: './src/index.js',
    output: {
      path: '/dist',
      filename: env.mode === 'production' ? '[name].[chunkhash].js' : '[name].js'
    },
    optimization: {
      splitChunks: env.features.splitChunks ? {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /node_modules/,
            priority: 10
          }
        }
      } : false
    },
    plugins: [
      env.features.pwa && 'WorkboxWebpackPlugin',
      env.features.analyzer && 'BundleAnalyzerPlugin',
      env.features.ssr && 'SSRPlugin'
    ].filter(Boolean)
  };
}

// Generate config based on environment
const env = process.argv[2] || 'development';
const config = generateWebpackConfig({
  mode: env as any,
  target: 'web',
  features: {
    pwa: env === 'production',
    splitChunks: true,
    analyzer: process.argv.includes('--analyze')
  }
});

// Write config and build
await writeFile('webpack.config.generated.js', 
  `module.exports = ${JSON.stringify(config, null, 2)}`
);

await $`webpack --config webpack.config.generated.js`;
```

## CI/CD Integration

### GitHub Actions with Webpack and Xec

```yaml
# .github/workflows/build.yml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Install Xec
      run: npm install -g @xec-sh/cli
    
    - name: Build application
      run: xec build:production
    
    - name: Run tests
      run: xec test:e2e
    
    - name: Deploy
      run: xec deploy:staging
      env:
        AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
        AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

### Xec Task Configuration

```yaml
# .xec/config.yaml
tasks:
  build:production:
    description: Production build with webpack
    steps:
      - name: Clean
        command: rm -rf dist
      - name: Build
        command: webpack --mode production
      - name: Optimize
        script: scripts/optimize.ts
      - name: Generate reports
        parallel: true
        steps:
          - command: webpack-bundle-analyzer stats.json -m static
          - command: lighthouse http://localhost:8080 --output=json
  
  test:e2e:
    description: End-to-end tests
    needs: [build:production]
    command: playwright test
  
  deploy:staging:
    description: Deploy to staging
    needs: [test:e2e]
    steps:
      - name: Upload to S3
        command: aws s3 sync dist/ s3://staging-bucket/
      - name: Invalidate CloudFront
        command: aws cloudfront create-invalidation --distribution-id $DIST_ID
```

## Migration Strategy

### Phase 1: Keep Webpack, Add Xec
1. Install Xec alongside webpack
2. Move build orchestration to Xec
3. Keep webpack.config.js unchanged
4. Replace npm scripts with Xec tasks

### Phase 2: Simplify Webpack Config
1. Remove orchestration plugins
2. Move environment logic to Xec
3. Simplify to single webpack config
4. Use Xec for environment variations

### Phase 3: Enhance with Xec Features
1. Add multi-environment deployment
2. Implement parallel builds
3. Add remote execution for CI/CD
4. Integrate monitoring and reporting

## Best Practices

### 1. Separation of Concerns

```typescript
// webpack handles bundling
await $`webpack --mode production`;

// Xec handles everything else
await Promise.all([
  optimizeAssets(),
  generateReports(),
  deployToServers()
]);
```

### 2. Configuration as Code

```typescript
// Type-safe configuration
interface BuildPipeline {
  steps: Array<{
    name: string;
    command: string;
    when?: string;
  }>;
}

const pipeline: BuildPipeline = {
  steps: [
    { name: 'Lint', command: 'eslint src/' },
    { name: 'Test', command: 'jest' },
    { name: 'Build', command: 'webpack' },
    { name: 'Deploy', command: 'xec deploy', when: 'production' }
  ]
};
```

### 3. Error Recovery

```typescript
// Graceful degradation
const result = await $`webpack --mode production`.nothrow();

if (!result.ok) {
  console.warn('Production build failed, trying development mode');
  await $`webpack --mode development`;
}
```

## Summary

Using Xec with Webpack provides:
- ✅ Cleaner build orchestration
- ✅ Multi-environment deployment
- ✅ Parallel task execution
- ✅ TypeScript type safety
- ✅ Cross-platform compatibility
- ✅ Better error handling

Keep webpack for bundling, use Xec for everything else - orchestration, deployment, optimization, and automation!