---
sidebar_position: 4
title: Test Automation
description: Automate testing workflows with Xec's execution engine
---

# Test Automation

Learn how to leverage Xec to create comprehensive test automation workflows that work across different environments and testing frameworks.

## Overview

Xec transforms test automation by providing:
- **Framework agnostic** - Works with any testing framework
- **Multi-environment testing** - Run tests locally, in containers, or remote
- **Parallel execution** - Speed up test suites with concurrent testing
- **Real-time reporting** - Stream test results as they happen
- **Intelligent retry** - Automatically retry flaky tests

## Unit Testing Automation

### Basic Test Runner

```typescript
// test/run-tests.ts
import { $ } from '@xec-sh/core';

async function runTests() {
  console.log('🧪 Running test suite...');
  
  try {
    // Run tests with coverage
    const result = await $`npm test -- --coverage`;
    
    // Parse coverage results
    const coverageMatch = result.stdout.match(/Lines\s+:\s+(\d+\.?\d*)%/);
    const coverage = coverageMatch ? parseFloat(coverageMatch[1]) : 0;
    
    console.log(`📊 Coverage: ${coverage}%`);
    
    if (coverage < 80) {
      console.warn('⚠️ Coverage below 80% threshold');
      process.exit(1);
    }
    
    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('❌ Tests failed:', error.message);
    process.exit(1);
  }
}

await runTests();
```

### Test Suite Manager

```typescript
// test/test-manager.ts
import { $ } from '@xec-sh/core';
import { select, multiselect } from '@clack/prompts';

class TestSuiteManager {
  private suites = {
    unit: 'npm run test:unit',
    integration: 'npm run test:integration',
    e2e: 'npm run test:e2e',
    performance: 'npm run test:performance',
    security: 'npm run test:security'
  };
  
  async run() {
    // Select test suites to run
    const selected = await multiselect({
      message: 'Select test suites to run:',
      options: Object.keys(this.suites).map(key => ({
        value: key,
        label: key.charAt(0).toUpperCase() + key.slice(1)
      }))
    });
    
    const parallel = await select({
      message: 'Run tests in parallel?',
      options: [
        { value: true, label: 'Yes (faster)' },
        { value: false, label: 'No (sequential)' }
      ]
    });
    
    await this.executeSuites(selected as string[], parallel as boolean);
  }
  
  private async executeSuites(suites: string[], parallel: boolean) {
    console.log(`\n🧪 Running ${suites.length} test suites...`);
    
    if (parallel) {
      await this.runParallel(suites);
    } else {
      await this.runSequential(suites);
    }
  }
  
  private async runParallel(suites: string[]) {
    const results = await Promise.allSettled(
      suites.map(suite => this.runSuite(suite))
    );
    
    const failed = results.filter(r => r.status === 'rejected');
    
    if (failed.length > 0) {
      console.error(`\n❌ ${failed.length} suite(s) failed`);
      process.exit(1);
    }
    
    console.log('\n✅ All test suites passed!');
  }
  
  private async runSequential(suites: string[]) {
    for (const suite of suites) {
      await this.runSuite(suite);
    }
    
    console.log('\n✅ All test suites passed!');
  }
  
  private async runSuite(suite: string) {
    console.log(`\n📋 Running ${suite} tests...`);
    
    const startTime = Date.now();
    const command = this.suites[suite];
    
    try {
      await $`${command}`;
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ ${suite} passed (${duration}s)`);
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`❌ ${suite} failed (${duration}s)`);
      throw error;
    }
  }
}

// Usage
const manager = new TestSuiteManager();
await manager.run();
```

## Integration Testing

### API Testing

```typescript
// test/api-tests.ts
import { $ } from '@xec-sh/core';

class APITestRunner {
  constructor(
    private baseUrl: string,
    private testFiles: string[]
  ) {}
  
  async run() {
    console.log('🌐 Running API tests...');
    
    // Start test server if needed
    await this.startTestServer();
    
    try {
      // Run API tests
      for (const file of this.testFiles) {
        await this.runTestFile(file);
      }
      
      // Generate report
      await this.generateReport();
      
      console.log('✅ API tests completed!');
    } finally {
      // Cleanup
      await this.stopTestServer();
    }
  }
  
  private async startTestServer() {
    console.log('🚀 Starting test server...');
    
    // Start in background
    $.spawn`npm run start:test`;
    
    // Wait for server to be ready
    await this.waitForServer();
  }
  
  private async waitForServer() {
    const maxAttempts = 30;
    
    for (let i = 0; i < maxAttempts; i++) {
      const result = await $`curl -f ${this.baseUrl}/health`.nothrow();
      
      if (result.ok) {
        console.log('✅ Test server ready');
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Test server failed to start');
  }
  
  private async runTestFile(file: string) {
    console.log(`  📝 Testing: ${file}`);
    
    // Run with newman (Postman CLI)
    await $`newman run ${file} \
      --environment test-env.json \
      --reporters cli,json \
      --reporter-json-export results/${file}.json`;
  }
  
  private async generateReport() {
    console.log('📊 Generating test report...');
    
    // Combine all results
    const results = await $`cat results/*.json | jq -s '.' > combined-results.json`;
    
    // Generate HTML report
    await $`newman-reporter-html \
      --input combined-results.json \
      --output api-test-report.html`;
  }
  
  private async stopTestServer() {
    console.log('🛑 Stopping test server...');
    await $`pkill -f "npm run start:test"`.nothrow();
  }
}

// Usage
const apiTests = new APITestRunner('http://localhost:3000', [
  'tests/api/auth.postman.json',
  'tests/api/users.postman.json',
  'tests/api/products.postman.json'
]);

await apiTests.run();
```

### Database Testing

```typescript
// test/db-tests.ts
import { $ } from '@xec-sh/core';

class DatabaseTestRunner {
  private container?: string;
  
  async run() {
    console.log('🗄️ Running database tests...');
    
    try {
      // Start test database
      await this.startTestDatabase();
      
      // Run migrations
      await this.runMigrations();
      
      // Seed test data
      await this.seedTestData();
      
      // Run tests
      await this.runTests();
      
      // Verify data integrity
      await this.verifyDataIntegrity();
      
      console.log('✅ Database tests passed!');
    } finally {
      // Cleanup
      await this.cleanup();
    }
  }
  
  private async startTestDatabase() {
    console.log('🚀 Starting test database...');
    
    this.container = 'test-postgres';
    
    // Start PostgreSQL container
    await $`docker run -d \
      --name ${this.container} \
      -e POSTGRES_PASSWORD=testpass \
      -e POSTGRES_DB=testdb \
      -p 5432:5432 \
      postgres:14`;
    
    // Wait for database to be ready
    await this.waitForDatabase();
  }
  
  private async waitForDatabase() {
    const maxAttempts = 30;
    
    for (let i = 0; i < maxAttempts; i++) {
      const result = await $`docker exec ${this.container} \
        pg_isready -U postgres`.nothrow();
      
      if (result.ok) {
        console.log('✅ Database ready');
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Database failed to start');
  }
  
  private async runMigrations() {
    console.log('📝 Running migrations...');
    
    await $.env({
      DATABASE_URL: 'postgresql://postgres:testpass@localhost:5432/testdb'
    })`npm run migrate`;
  }
  
  private async seedTestData() {
    console.log('🌱 Seeding test data...');
    
    await $.env({
      DATABASE_URL: 'postgresql://postgres:testpass@localhost:5432/testdb'
    })`npm run seed:test`;
  }
  
  private async runTests() {
    console.log('🧪 Running database tests...');
    
    await $.env({
      DATABASE_URL: 'postgresql://postgres:testpass@localhost:5432/testdb',
      NODE_ENV: 'test'
    })`npm run test:db`;
  }
  
  private async verifyDataIntegrity() {
    console.log('🔍 Verifying data integrity...');
    
    // Run integrity checks
    const checks = [
      'SELECT COUNT(*) FROM users WHERE email IS NULL',
      'SELECT COUNT(*) FROM orders WHERE user_id NOT IN (SELECT id FROM users)',
      'SELECT COUNT(*) FROM products WHERE price < 0'
    ];
    
    for (const check of checks) {
      const result = await $`docker exec ${this.container} \
        psql -U postgres -d testdb -t -c "${check}"`;
      
      const count = parseInt(result.stdout.trim());
      
      if (count > 0) {
        throw new Error(`Data integrity check failed: ${check}`);
      }
    }
    
    console.log('✅ Data integrity verified');
  }
  
  private async cleanup() {
    if (this.container) {
      console.log('🧹 Cleaning up test database...');
      await $`docker stop ${this.container}`.nothrow();
      await $`docker rm ${this.container}`.nothrow();
    }
  }
}

// Usage
const dbTests = new DatabaseTestRunner();
await dbTests.run();
```

## End-to-End Testing

### Browser Testing with Playwright

```typescript
// test/e2e-playwright.ts
import { $ } from '@xec-sh/core';

class E2ETestRunner {
  async run() {
    console.log('🌐 Running E2E tests with Playwright...');
    
    // Install browsers if needed
    await this.ensureBrowsers();
    
    // Start application
    await this.startApplication();
    
    try {
      // Run tests on multiple browsers
      await this.runTests();
      
      // Generate reports
      await this.generateReports();
      
      console.log('✅ E2E tests completed!');
    } finally {
      await this.cleanup();
    }
  }
  
  private async ensureBrowsers() {
    console.log('🔧 Ensuring browsers are installed...');
    await $`npx playwright install`;
  }
  
  private async startApplication() {
    console.log('🚀 Starting application...');
    
    // Start in test mode
    $.spawn`npm run start:e2e`;
    
    // Wait for app to be ready
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      const result = await $`curl -f http://localhost:3000`.nothrow();
      if (result.ok) {
        console.log('✅ Application ready');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Application failed to start');
  }
  
  private async runTests() {
    const browsers = ['chromium', 'firefox', 'webkit'];
    
    console.log('🧪 Running tests on multiple browsers...');
    
    for (const browser of browsers) {
      console.log(`\n  🌐 Testing on ${browser}...`);
      
      await $`npx playwright test \
        --browser=${browser} \
        --reporter=html,json \
        --output=test-results/${browser}`;
    }
  }
  
  private async generateReports() {
    console.log('📊 Generating test reports...');
    
    // Merge results
    await $`npx playwright merge-reports \
      --reporter=html \
      test-results/*/report.json`;
    
    // Open report in browser
    const openReport = await confirm({
      message: 'Open test report in browser?'
    });
    
    if (openReport) {
      await $`npx playwright show-report`;
    }
  }
  
  private async cleanup() {
    console.log('🧹 Cleaning up...');
    await $`pkill -f "npm run start:e2e"`.nothrow();
  }
}

// Usage
const e2e = new E2ETestRunner();
await e2e.run();
```

### Mobile Testing

```typescript
// test/mobile-tests.ts
import { $ } from '@xec-sh/core';

class MobileTestRunner {
  async run() {
    console.log('📱 Running mobile tests...');
    
    // Start Appium server
    await this.startAppium();
    
    // Run tests on different devices
    await this.runIOSTests();
    await this.runAndroidTests();
    
    console.log('✅ Mobile tests completed!');
  }
  
  private async startAppium() {
    console.log('🚀 Starting Appium server...');
    
    $.spawn`appium --port 4723`;
    
    // Wait for Appium to be ready
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  private async runIOSTests() {
    console.log('🍎 Running iOS tests...');
    
    // Run on iOS simulator
    await $`npm run test:ios -- \
      --device "iPhone 14" \
      --os "16.0"`;
  }
  
  private async runAndroidTests() {
    console.log('🤖 Running Android tests...');
    
    // Start Android emulator
    await $`emulator -avd Pixel_6_API_33 -no-window &`;
    
    // Wait for emulator
    await $`adb wait-for-device`;
    
    // Run tests
    await $`npm run test:android -- \
      --device "Pixel 6" \
      --os "13.0"`;
  }
}

// Usage
const mobile = new MobileTestRunner();
await mobile.run();
```

## Performance Testing

### Load Testing

```typescript
// test/load-test.ts
import { $ } from '@xec-sh/core';

class LoadTestRunner {
  constructor(
    private config: {
      url: string;
      users: number;
      duration: number;
      rampUp: number;
    }
  ) {}
  
  async run() {
    console.log('⚡ Running load tests...');
    
    // Create test scenario
    await this.createScenario();
    
    // Run load test
    const results = await this.runLoadTest();
    
    // Analyze results
    await this.analyzeResults(results);
    
    console.log('✅ Load testing completed!');
  }
  
  private async createScenario() {
    const scenario = `
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '${this.config.rampUp}s', target: ${this.config.users} },
    { duration: '${this.config.duration}s', target: ${this.config.users} },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.1'],
  },
};

export default function() {
  const response = http.get('${this.config.url}');
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
}
`;
    
    await $`echo '${scenario}' > load-test.js`;
  }
  
  private async runLoadTest() {
    console.log(`📊 Testing with ${this.config.users} concurrent users...`);
    
    const result = await $`k6 run \
      --out json=results.json \
      --summary-export=summary.json \
      load-test.js`;
    
    return result;
  }
  
  private async analyzeResults(results: any) {
    console.log('📈 Analyzing results...');
    
    // Parse summary
    const summary = await $`cat summary.json`;
    const data = JSON.parse(summary.stdout);
    
    // Extract key metrics
    const metrics = {
      avgResponseTime: data.metrics.http_req_duration.avg,
      p95ResponseTime: data.metrics.http_req_duration['p(95)'],
      requestsPerSecond: data.metrics.http_reqs.rate,
      errorRate: data.metrics.http_req_failed.rate
    };
    
    console.log('\n📊 Test Results:');
    console.log(`  Avg Response Time: ${metrics.avgResponseTime.toFixed(2)}ms`);
    console.log(`  P95 Response Time: ${metrics.p95ResponseTime.toFixed(2)}ms`);
    console.log(`  Requests/Second: ${metrics.requestsPerSecond.toFixed(2)}`);
    console.log(`  Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
    
    // Check thresholds
    if (metrics.p95ResponseTime > 500) {
      console.warn('⚠️ P95 response time exceeds threshold');
    }
    
    if (metrics.errorRate > 0.01) {
      console.error('❌ Error rate exceeds threshold');
      process.exit(1);
    }
  }
}

// Usage
const loadTest = new LoadTestRunner({
  url: 'https://api.example.com/endpoint',
  users: 100,
  duration: 300,
  rampUp: 60
});

await loadTest.run();
```

### Stress Testing

```typescript
// test/stress-test.ts
import { $ } from '@xec-sh/core';

class StressTestRunner {
  async run() {
    console.log('💪 Running stress tests...');
    
    const stages = [
      { users: 50, duration: 60 },
      { users: 100, duration: 60 },
      { users: 200, duration: 60 },
      { users: 500, duration: 60 },
      { users: 1000, duration: 60 }
    ];
    
    for (const stage of stages) {
      console.log(`\n📈 Testing with ${stage.users} users...`);
      
      const passed = await this.testStage(stage);
      
      if (!passed) {
        console.log(`❌ System failed at ${stage.users} users`);
        break;
      }
      
      console.log(`✅ Handled ${stage.users} users successfully`);
    }
  }
  
  private async testStage(stage: { users: number; duration: number }): Promise<boolean> {
    // Run artillery test
    const result = await $`artillery run \
      --target https://api.example.com \
      --count ${stage.users} \
      --duration ${stage.duration} \
      stress-test.yml`.nothrow();
    
    if (!result.ok) {
      return false;
    }
    
    // Check system metrics
    const cpuUsage = await this.checkCPU();
    const memoryUsage = await this.checkMemory();
    const errorRate = await this.checkErrors();
    
    return cpuUsage < 80 && memoryUsage < 90 && errorRate < 0.05;
  }
  
  private async checkCPU(): Promise<number> {
    const result = await $`ssh prod.example.com "top -bn1 | grep 'Cpu(s)' | awk '{print 100 - $8}'"`;
    return parseFloat(result.stdout.trim());
  }
  
  private async checkMemory(): Promise<number> {
    const result = await $`ssh prod.example.com "free | grep Mem | awk '{print ($3/$2) * 100}'"`;
    return parseFloat(result.stdout.trim());
  }
  
  private async checkErrors(): Promise<number> {
    const result = await $`curl -s http://metrics.example.com/error-rate`;
    return parseFloat(result.stdout.trim());
  }
}

// Usage
const stressTest = new StressTestRunner();
await stressTest.run();
```

## Security Testing

### Vulnerability Scanning

```typescript
// test/security-scan.ts
import { $ } from '@xec-sh/core';

class SecurityScanner {
  async run() {
    console.log('🔒 Running security scans...');
    
    const results = {
      dependencies: await this.scanDependencies(),
      docker: await this.scanDocker(),
      code: await this.scanCode(),
      api: await this.scanAPI()
    };
    
    await this.generateReport(results);
    
    const hasVulnerabilities = Object.values(results).some(r => !r);
    
    if (hasVulnerabilities) {
      console.error('❌ Security vulnerabilities found!');
      process.exit(1);
    }
    
    console.log('✅ Security scans passed!');
  }
  
  private async scanDependencies(): Promise<boolean> {
    console.log('\n📦 Scanning dependencies...');
    
    // npm audit
    const npmAudit = await $`npm audit --json`;
    const auditData = JSON.parse(npmAudit.stdout);
    
    if (auditData.metadata.vulnerabilities.high > 0 || 
        auditData.metadata.vulnerabilities.critical > 0) {
      console.error('  ❌ High/Critical vulnerabilities found');
      return false;
    }
    
    // Snyk scan
    const snyk = await $`snyk test --severity-threshold=high`.nothrow();
    
    if (!snyk.ok) {
      console.error('  ❌ Snyk found vulnerabilities');
      return false;
    }
    
    console.log('  ✅ Dependencies secure');
    return true;
  }
  
  private async scanDocker(): Promise<boolean> {
    console.log('\n🐳 Scanning Docker images...');
    
    // Trivy scan
    const trivy = await $`trivy image \
      --severity HIGH,CRITICAL \
      --exit-code 1 \
      myapp:latest`.nothrow();
    
    if (!trivy.ok) {
      console.error('  ❌ Docker vulnerabilities found');
      return false;
    }
    
    console.log('  ✅ Docker images secure');
    return true;
  }
  
  private async scanCode(): Promise<boolean> {
    console.log('\n📝 Scanning source code...');
    
    // Semgrep scan
    const semgrep = await $`semgrep \
      --config=auto \
      --severity=ERROR \
      --json \
      .`;
    
    const results = JSON.parse(semgrep.stdout);
    
    if (results.errors.length > 0) {
      console.error('  ❌ Code vulnerabilities found');
      return false;
    }
    
    // GitLeaks scan for secrets
    const gitleaks = await $`gitleaks detect --exit-code 1`.nothrow();
    
    if (!gitleaks.ok) {
      console.error('  ❌ Secrets found in code');
      return false;
    }
    
    console.log('  ✅ Source code secure');
    return true;
  }
  
  private async scanAPI(): Promise<boolean> {
    console.log('\n🌐 Scanning API security...');
    
    // OWASP ZAP scan
    const zap = await $`docker run --rm \
      -v $(pwd):/zap/wrk:rw \
      -t owasp/zap2docker-stable zap-baseline.py \
      -t https://api.example.com \
      -J zap-report.json`.nothrow();
    
    if (!zap.ok) {
      console.error('  ❌ API vulnerabilities found');
      return false;
    }
    
    console.log('  ✅ API secure');
    return true;
  }
  
  private async generateReport(results: any) {
    console.log('\n📊 Generating security report...');
    
    const report = {
      timestamp: new Date().toISOString(),
      results,
      summary: {
        passed: Object.values(results).filter(r => r).length,
        failed: Object.values(results).filter(r => !r).length
      }
    };
    
    await $`echo '${JSON.stringify(report, null, 2)}' > security-report.json`;
  }
}

// Usage
const scanner = new SecurityScanner();
await scanner.run();
```

## Test Data Management

### Test Data Generator

```typescript
// test/data-generator.ts
import { $ } from '@xec-sh/core';

class TestDataGenerator {
  async generate(config: {
    users: number;
    products: number;
    orders: number;
  }) {
    console.log('🎲 Generating test data...');
    
    // Generate users
    await this.generateUsers(config.users);
    
    // Generate products
    await this.generateProducts(config.products);
    
    // Generate orders
    await this.generateOrders(config.orders);
    
    // Import to database
    await this.importToDatabase();
    
    console.log('✅ Test data generated!');
  }
  
  private async generateUsers(count: number) {
    console.log(`  👤 Generating ${count} users...`);
    
    const users = [];
    for (let i = 0; i < count; i++) {
      users.push({
        id: i + 1,
        email: `user${i + 1}@test.com`,
        name: `Test User ${i + 1}`,
        created_at: new Date().toISOString()
      });
    }
    
    await $`echo '${JSON.stringify(users)}' > test-data/users.json`;
  }
  
  private async generateProducts(count: number) {
    console.log(`  📦 Generating ${count} products...`);
    
    const products = [];
    for (let i = 0; i < count; i++) {
      products.push({
        id: i + 1,
        name: `Product ${i + 1}`,
        price: Math.floor(Math.random() * 1000) + 10,
        stock: Math.floor(Math.random() * 100)
      });
    }
    
    await $`echo '${JSON.stringify(products)}' > test-data/products.json`;
  }
  
  private async generateOrders(count: number) {
    console.log(`  🛒 Generating ${count} orders...`);
    
    const orders = [];
    for (let i = 0; i < count; i++) {
      orders.push({
        id: i + 1,
        user_id: Math.floor(Math.random() * 100) + 1,
        product_id: Math.floor(Math.random() * 50) + 1,
        quantity: Math.floor(Math.random() * 5) + 1,
        created_at: new Date().toISOString()
      });
    }
    
    await $`echo '${JSON.stringify(orders)}' > test-data/orders.json`;
  }
  
  private async importToDatabase() {
    console.log('  💾 Importing to database...');
    
    await $`npm run db:import test-data/`;
  }
}

// Usage
const generator = new TestDataGenerator();
await generator.generate({
  users: 1000,
  products: 500,
  orders: 5000
});
```

## Continuous Testing

### Watch Mode Testing

```typescript
// test/watch-tests.ts
import { $ } from '@xec-sh/core';

class TestWatcher {
  private testProcess?: any;
  
  async start() {
    console.log('👀 Starting test watcher...');
    
    // Watch for file changes
    this.watchFiles();
    
    // Run initial tests
    await this.runTests();
    
    // Keep process alive
    await new Promise(() => {});
  }
  
  private watchFiles() {
    $.spawn`nodemon \
      --watch src \
      --watch test \
      --ext ts,js \
      --exec "npm test"`;
  }
  
  private async runTests() {
    console.log('🧪 Running tests...');
    
    const result = await $`npm test`.nothrow();
    
    if (result.ok) {
      console.log('✅ Tests passed');
      await this.notifySuccess();
    } else {
      console.error('❌ Tests failed');
      await this.notifyFailure();
    }
  }
  
  private async notifySuccess() {
    // Desktop notification
    await $`osascript -e 'display notification "All tests passed!" with title "Test Success"'`.nothrow();
  }
  
  private async notifyFailure() {
    // Desktop notification
    await $`osascript -e 'display notification "Tests failed!" with title "Test Failure"'`.nothrow();
  }
}

// Usage
const watcher = new TestWatcher();
await watcher.start();
```

### Test Impact Analysis

```typescript
// test/impact-analysis.ts
import { $ } from '@xec-sh/core';

class TestImpactAnalyzer {
  async analyze() {
    console.log('🎯 Analyzing test impact...');
    
    // Get changed files
    const changedFiles = await this.getChangedFiles();
    
    // Map to affected tests
    const affectedTests = await this.mapToTests(changedFiles);
    
    // Run only affected tests
    await this.runAffectedTests(affectedTests);
  }
  
  private async getChangedFiles(): Promise<string[]> {
    const result = await $`git diff --name-only HEAD~1`;
    return result.stdout.split('\n').filter(f => f);
  }
  
  private async mapToTests(files: string[]): Promise<string[]> {
    const testMap = {
      'src/auth/': ['test/auth.test.ts'],
      'src/api/': ['test/api.test.ts', 'test/integration.test.ts'],
      'src/database/': ['test/db.test.ts'],
      'src/utils/': ['test/utils.test.ts']
    };
    
    const tests = new Set<string>();
    
    for (const file of files) {
      for (const [pattern, testFiles] of Object.entries(testMap)) {
        if (file.startsWith(pattern)) {
          testFiles.forEach(t => tests.add(t));
        }
      }
    }
    
    return Array.from(tests);
  }
  
  private async runAffectedTests(tests: string[]) {
    if (tests.length === 0) {
      console.log('✅ No tests affected by changes');
      return;
    }
    
    console.log(`🧪 Running ${tests.length} affected tests...`);
    
    for (const test of tests) {
      await $`npm test -- ${test}`;
    }
    
    console.log('✅ Affected tests passed!');
  }
}

// Usage
const analyzer = new TestImpactAnalyzer();
await analyzer.analyze();
```

## Test Reporting

### Comprehensive Test Reporter

```typescript
// test/reporter.ts
import { $ } from '@xec-sh/core';

class TestReporter {
  private results: any = {
    suites: [],
    metrics: {},
    timestamp: new Date().toISOString()
  };
  
  async generateReport() {
    console.log('📊 Generating test report...');
    
    // Collect results from different sources
    await this.collectJestResults();
    await this.collectCoverageResults();
    await this.collectPerformanceResults();
    
    // Generate reports in multiple formats
    await this.generateHTMLReport();
    await this.generateJSONReport();
    await this.generateMarkdownReport();
    
    // Send notifications
    await this.sendNotifications();
    
    console.log('✅ Test report generated!');
  }
  
  private async collectJestResults() {
    const result = await $`cat test-results/jest-results.json`;
    const data = JSON.parse(result.stdout);
    
    this.results.suites.push({
      name: 'Jest Tests',
      passed: data.numPassedTests,
      failed: data.numFailedTests,
      skipped: data.numPendingTests,
      duration: data.testResults.reduce((acc, r) => acc + r.perfStats.runtime, 0)
    });
  }
  
  private async collectCoverageResults() {
    const result = await $`cat coverage/coverage-summary.json`;
    const data = JSON.parse(result.stdout);
    
    this.results.metrics.coverage = {
      lines: data.total.lines.pct,
      branches: data.total.branches.pct,
      functions: data.total.functions.pct,
      statements: data.total.statements.pct
    };
  }
  
  private async collectPerformanceResults() {
    const result = await $`cat performance/lighthouse-report.json`.nothrow();
    
    if (result.ok) {
      const data = JSON.parse(result.stdout);
      
      this.results.metrics.performance = {
        score: data.categories.performance.score * 100,
        metrics: data.audits.metrics.details.items[0]
      };
    }
  }
  
  private async generateHTMLReport() {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Report - ${this.results.timestamp}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .metric { display: inline-block; margin: 10px; padding: 10px; border: 1px solid #ddd; }
    .passed { color: green; }
    .failed { color: red; }
  </style>
</head>
<body>
  <h1>Test Report</h1>
  <p>Generated: ${this.results.timestamp}</p>
  
  <h2>Test Suites</h2>
  ${this.results.suites.map(s => `
    <div class="metric">
      <h3>${s.name}</h3>
      <p class="passed">Passed: ${s.passed}</p>
      <p class="failed">Failed: ${s.failed}</p>
      <p>Duration: ${s.duration}ms</p>
    </div>
  `).join('')}
  
  <h2>Coverage</h2>
  <div class="metric">
    <p>Lines: ${this.results.metrics.coverage?.lines || 0}%</p>
    <p>Branches: ${this.results.metrics.coverage?.branches || 0}%</p>
    <p>Functions: ${this.results.metrics.coverage?.functions || 0}%</p>
  </div>
</body>
</html>
`;
    
    await $`echo '${html}' > test-report.html`;
  }
  
  private async generateJSONReport() {
    await $`echo '${JSON.stringify(this.results, null, 2)}' > test-report.json`;
  }
  
  private async generateMarkdownReport() {
    const md = `
# Test Report

Generated: ${this.results.timestamp}

## Test Suites

| Suite | Passed | Failed | Duration |
|-------|--------|--------|----------|
${this.results.suites.map(s => 
  `| ${s.name} | ${s.passed} | ${s.failed} | ${s.duration}ms |`
).join('\n')}

## Coverage

- Lines: ${this.results.metrics.coverage?.lines || 0}%
- Branches: ${this.results.metrics.coverage?.branches || 0}%
- Functions: ${this.results.metrics.coverage?.functions || 0}%

## Performance

Score: ${this.results.metrics.performance?.score || 'N/A'}
`;
    
    await $`echo '${md}' > test-report.md`;
  }
  
  private async sendNotifications() {
    // Send to Slack
    if (process.env.SLACK_WEBHOOK) {
      const message = {
        text: 'Test Report Generated',
        attachments: [{
          color: this.results.suites.some(s => s.failed > 0) ? 'danger' : 'good',
          fields: this.results.suites.map(s => ({
            title: s.name,
            value: `✅ ${s.passed} / ❌ ${s.failed}`,
            short: true
          }))
        }]
      };
      
      await $`curl -X POST ${process.env.SLACK_WEBHOOK} \
        -H 'Content-Type: application/json' \
        -d '${JSON.stringify(message)}'`;
    }
  }
}

// Usage
const reporter = new TestReporter();
await reporter.generateReport();
```

## Best Practices

### 1. Test Isolation

```typescript
async function isolatedTest() {
  // Create isolated environment
  const testId = Date.now();
  const testDir = `/tmp/test-${testId}`;
  
  await $`mkdir -p ${testDir}`;
  
  try {
    // Run tests in isolation
    await $.cwd(testDir)`npm test`;
  } finally {
    // Cleanup
    await $`rm -rf ${testDir}`;
  }
}
```

### 2. Flaky Test Management

```typescript
async function retryFlakyTest(testCommand: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const result = await $`${testCommand}`.nothrow();
    
    if (result.ok) {
      return result;
    }
    
    console.log(`Retry ${i + 1}/${maxRetries}...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Test failed after ${maxRetries} retries`);
}
```

### 3. Test Parallelization

```typescript
async function parallelTests() {
  const testSuites = [
    'test:unit',
    'test:integration',
    'test:e2e'
  ];
  
  // Run in parallel with resource limits
  const concurrency = 2;
  const results = [];
  
  for (let i = 0; i < testSuites.length; i += concurrency) {
    const batch = testSuites.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(suite => $`npm run ${suite}`)
    );
    results.push(...batchResults);
  }
  
  return results;
}
```

## Troubleshooting

### Common Issues

1. **Test Timeouts**
   ```typescript
   // Increase timeout for slow tests
   await $`npm test`.timeout(300000); // 5 minutes
   ```

2. **Port Conflicts**
   ```typescript
   // Find and kill process using port
   await $`lsof -ti:3000 | xargs kill -9`.nothrow();
   ```

3. **Database Connection Issues**
   ```typescript
   // Ensure database is ready before tests
   await $`until pg_isready; do sleep 1; done`;
   ```

## Next Steps

- Explore [server management](../infrastructure/server-management.md)
- Learn about [container orchestration](../infrastructure/container-orchestration.md)
- Implement [error handling](../advanced/error-handling.md)

## Summary

You've learned how to:
- ✅ Automate unit and integration testing
- ✅ Set up end-to-end browser testing
- ✅ Implement performance and load testing
- ✅ Configure security scanning
- ✅ Manage test data generation
- ✅ Create comprehensive test reports
- ✅ Handle flaky tests and parallelization

Continue to the [infrastructure guides](../infrastructure/server-management.md) to learn about server management and automation.