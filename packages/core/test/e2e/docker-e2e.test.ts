import { join } from 'path';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import { it, expect, describe, afterAll, beforeAll } from '@jest/globals';

// Set up PATH with Docker location before importing $
if (!process.env['PATH']?.includes('/usr/local/bin')) {
  process.env['PATH'] = `/usr/local/bin:${process.env['PATH']}`;
}

import { $ } from '../../src/index.js';

// Helper to wait for condition with timeout
async function waitFor(
  condition: () => Promise<boolean>, 
  options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
  const { timeout = 30000, interval = 1000, message = 'Condition not met' } = options;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Timeout waiting for condition: ${message}`);
}

// Check if Docker is available
const DOCKER_AVAILABLE = await (async () => {
  try {
    const result = await $`docker --version`.nothrow();
    if (result.exitCode !== 0) {
      console.log('Docker not found in PATH');
      console.log('PATH:', process.env['PATH']);
      return false;
    }
    
    // Check Docker daemon is running
    const infoResult = await $`docker info`.nothrow();
    if (infoResult.exitCode !== 0) {
      console.log('Docker daemon is not running');
      return false;
    }
    
    return true;
  } catch (error) {
    console.log('Error checking Docker availability:', error);
    return false;
  }
})();

const describeIfDocker = DOCKER_AVAILABLE ? describe : describe.skip;

describeIfDocker('Docker E2E Real-World Scenarios', () => {
  const TEST_PREFIX = `ush-e2e-${Date.now()}`;
  const workDir = join(tmpdir(), TEST_PREFIX);
  
  // Track created resources for cleanup
  const createdContainers = new Set<string>();
  const createdNetworks = new Set<string>();
  const createdVolumes = new Set<string>();
  const createdImages = new Set<string>();

  beforeAll(async () => {
    await fs.mkdir(workDir, { recursive: true });
    console.log(`Docker E2E tests starting in ${workDir}...`);
  });

  afterAll(async () => {
    console.log('Cleaning up Docker E2E test resources...');
    
    // Clean containers
    if (createdContainers.size > 0) {
      const containers = Array.from(createdContainers).join(' ');
      await $`docker rm -f ${containers}`.nothrow();
    }
    
    // Clean networks
    if (createdNetworks.size > 0) {
      const networks = Array.from(createdNetworks).join(' ');
      await $`docker network rm ${networks}`.nothrow();
    }
    
    // Clean volumes
    if (createdVolumes.size > 0) {
      const volumes = Array.from(createdVolumes).join(' ');
      await $`docker volume rm ${volumes}`.nothrow();
    }
    
    // Clean images
    if (createdImages.size > 0) {
      const images = Array.from(createdImages).join(' ');
      await $`docker rmi ${images}`.nothrow();
    }
    
    // Also do pattern-based cleanup as backup
    await $`docker ps -a --filter "name=${TEST_PREFIX}" --format "{{.Names}}" | xargs -r docker rm -f`.nothrow();
    await $`docker network ls --filter "name=${TEST_PREFIX}" --format "{{.Name}}" | xargs -r docker network rm`.nothrow();
    await $`docker volume ls --filter "name=${TEST_PREFIX}" --format "{{.Name}}" | xargs -r docker volume rm`.nothrow();
    
    // Clean work directory
    await fs.rm(workDir, { recursive: true, force: true });
  });

  describe('Node.js Application Development', () => {
    it('should build and test a Node.js application', async () => {
      const appDir = join(workDir, 'node-app');
      await fs.mkdir(appDir, { recursive: true });

      // Create a simple Node.js app
      await fs.writeFile(join(appDir, 'package.json'), JSON.stringify({
        name: 'test-app',
        version: '1.0.0',
        scripts: {
          test: 'node test.js',
          start: 'node index.js'
        }
      }, null, 2));

      await fs.writeFile(join(appDir, 'index.js'), `
        console.log('Hello from Node.js app!');
        console.log('Node version:', process.version);
        console.log('Platform:', process.platform);
      `);

      await fs.writeFile(join(appDir, 'test.js'), `
        console.log('Running tests...');
        console.log('Test 1: Basic functionality - PASS');
        console.log('Test 2: Error handling - PASS');
        console.log('All tests passed!');
        process.exit(0);
      `);

      // Build and run in Docker
      const containerName = `${TEST_PREFIX}-node-app`;
      createdContainers.add(containerName);

      // Create container with app mounted
      await $`docker run -d --name ${containerName} -v ${appDir}:/app -w /app node:18-alpine sleep 300`;

      try {
        // Install dependencies (none in this case, but simulating the workflow)
        const npmResult = await $`docker exec ${containerName} npm install`;
        expect(npmResult.exitCode).toBe(0);

        // Run tests
        const testResult = await $`docker exec ${containerName} npm test`;
        expect(testResult.exitCode).toBe(0);
        expect(testResult.stdout).toContain('All tests passed!');
        expect(testResult.stdout).toContain('Test 1: Basic functionality - PASS');

        // Run the app
        const appResult = await $`docker exec ${containerName} npm start`;
        expect(appResult.exitCode).toBe(0);
        expect(appResult.stdout).toContain('Hello from Node.js app!');
        expect(appResult.stdout).toMatch(/Node version: v18\.\d+\.\d+/);
      } finally {
        await $`docker rm -f ${containerName}`.nothrow();
        createdContainers.delete(containerName);
      }
    }, 60000); // 60 second timeout
  });

  describe('Database Integration', () => {
    it('should set up and interact with PostgreSQL', async () => {
      const dbName = `${TEST_PREFIX}-postgres`;
      const network = `${TEST_PREFIX}-db-network`;
      
      createdContainers.add(dbName);
      createdNetworks.add(network);

      // Create network
      await $`docker network create ${network}`;

      // Start PostgreSQL with health check
      await $`docker run -d --name ${dbName} --network ${network} \
        -e POSTGRES_PASSWORD=testpass \
        -e POSTGRES_USER=testuser \
        -e POSTGRES_DB=testdb \
        --health-cmd="pg_isready -U testuser" \
        --health-interval=1s \
        --health-timeout=5s \
        --health-retries=30 \
        postgres:15-alpine`;

      // Wait for PostgreSQL to be healthy
      await waitFor(
        async () => {
          const result = await $`docker inspect ${dbName} --format='{{.State.Health.Status}}'`.nothrow();
          return result.stdout.trim() === 'healthy';
        },
        { timeout: 30000, message: 'PostgreSQL failed to become healthy' }
      );

      try {
        // Create table
        const createResult = await $`docker exec ${dbName} psql -U testuser -d testdb -c "CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100), created_at TIMESTAMP DEFAULT NOW());"`;
        expect(createResult.exitCode).toBe(0);

        // Insert data
        const insertResult = await $`docker exec ${dbName} psql -U testuser -d testdb -c "INSERT INTO users (name) VALUES ('Alice'), ('Bob'), ('Charlie');"`;
        expect(insertResult.exitCode).toBe(0);

        // Query data
        const queryResult = await $`docker exec ${dbName} psql -U testuser -d testdb -t -c "SELECT name FROM users ORDER BY name;"`;
        expect(queryResult.exitCode).toBe(0);
        expect(queryResult.stdout).toContain('Alice');
        expect(queryResult.stdout).toContain('Bob');
        expect(queryResult.stdout).toContain('Charlie');
        
        // Count records
        const countResult = await $`docker exec ${dbName} psql -U testuser -d testdb -t -c "SELECT COUNT(*) FROM users;"`;
        expect(countResult.exitCode).toBe(0);
        expect(countResult.stdout.trim()).toBe('3');
      } finally {
        await $`docker rm -f ${dbName}`.nothrow();
        await $`docker network rm ${network}`.nothrow();
        createdContainers.delete(dbName);
        createdNetworks.delete(network);
      }
    }, 60000);

    it('should handle Redis operations', async () => {
      const redisName = `${TEST_PREFIX}-redis`;
      createdContainers.add(redisName);

      // Start Redis with health check
      await $`docker run -d --name ${redisName} \
        --health-cmd="redis-cli ping" \
        --health-interval=1s \
        --health-timeout=3s \
        --health-retries=30 \
        redis:7-alpine`;

      // Wait for Redis to be healthy
      await waitFor(
        async () => {
          const result = await $`docker inspect ${redisName} --format='{{.State.Health.Status}}'`.nothrow();
          return result.stdout.trim() === 'healthy';
        },
        { timeout: 30000, message: 'Redis failed to become healthy' }
      );

      try {
        // Basic operations
        const setResult = await $`docker exec ${redisName} redis-cli SET mykey "Hello from Redis"`;
        expect(setResult.exitCode).toBe(0);
        expect(setResult.stdout.trim()).toBe('OK');

        const getResult = await $`docker exec ${redisName} redis-cli GET mykey`;
        expect(getResult.exitCode).toBe(0);
        expect(getResult.stdout.trim()).toBe('Hello from Redis');

        // List operations
        await $`docker exec ${redisName} redis-cli LPUSH mylist "item1" "item2" "item3"`;
        const listResult = await $`docker exec ${redisName} redis-cli LRANGE mylist 0 -1`;
        expect(listResult.exitCode).toBe(0);
        const items = listResult.stdout.trim().split('\n');
        expect(items).toContain('item3');
        expect(items).toContain('item2');
        expect(items).toContain('item1');
        
        // Hash operations
        await $`docker exec ${redisName} redis-cli HSET user:1 name "John" age "30" city "NYC"`;
        const hashResult = await $`docker exec ${redisName} redis-cli HGETALL user:1`;
        expect(hashResult.exitCode).toBe(0);
        expect(hashResult.stdout).toContain('name');
        expect(hashResult.stdout).toContain('John');
        expect(hashResult.stdout).toContain('age');
        expect(hashResult.stdout).toContain('30');
      } finally {
        await $`docker rm -f ${redisName}`.nothrow();
        createdContainers.delete(redisName);
      }
    }, 60000);
  });

  describe('Web Application Stack', () => {
    it('should deploy a multi-container web application', async () => {
      const network = `${TEST_PREFIX}-web-network`;
      const nginxName = `${TEST_PREFIX}-nginx`;
      const appName = `${TEST_PREFIX}-webapp`;
      
      createdNetworks.add(network);
      createdContainers.add(nginxName);
      createdContainers.add(appName);

      // Create network
      await $`docker network create ${network}`;

      // Create web app content
      const webDir = join(workDir, 'webapp');
      await fs.mkdir(webDir, { recursive: true });

      await fs.writeFile(join(webDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
    <title>Test App</title>
    <meta charset="UTF-8">
</head>
<body>
    <h1>Hello from Docker E2E Test!</h1>
    <div id="content">Loading...</div>
    <script>
        fetch('/api')
            .then(res => res.json())
            .then(data => {
                document.getElementById('content').innerHTML = 
                    '<p>Message: ' + data.message + '</p>' +
                    '<p>Time: ' + data.timestamp + '</p>';
            });
    </script>
</body>
</html>`);

      await fs.writeFile(join(webDir, 'app.js'), `const http = require('http');
const server = http.createServer((req, res) => {
    console.log('Request received:', req.url);
    res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ 
        message: 'Hello from backend!', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    }));
});
server.listen(3000, () => console.log('Backend server running on port 3000'));`);

      // Nginx config
      await fs.writeFile(join(webDir, 'nginx.conf'), `server {
    listen 80;
    server_name localhost;
    
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://${appName}:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`);

      try {
        // Start backend app
        await $`docker run -d --name ${appName} --network ${network} \
          -v ${webDir}:/app -w /app \
          node:18-alpine node app.js`;

        // Start Nginx
        await $`docker run -d --name ${nginxName} --network ${network} \
          -p 8080:80 \
          -v ${webDir}/index.html:/usr/share/nginx/html/index.html:ro \
          -v ${webDir}/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
          nginx:alpine`;

        // Wait for services to be ready
        await waitFor(
          async () => {
            const appLogs = await $`docker logs ${appName}`.nothrow();
            return appLogs.stdout.includes('Backend server running');
          },
          { timeout: 10000, message: 'Backend failed to start' }
        );

        // Wait for nginx to be ready
        await waitFor(
          async () => {
            const nginxStatus = await $`docker ps --filter "name=${nginxName}" --format "{{.Status}}"`.nothrow();
            return nginxStatus.stdout.includes('Up');
          },
          { timeout: 10000, message: 'Nginx failed to start' }
        );

        // Test the stack
        // Add small delay to ensure nginx is fully ready
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test static content (nginx:alpine doesn't have wget, use curl)
        const staticResult = await $`docker exec ${nginxName} sh -c "apk add --no-cache curl > /dev/null 2>&1 && curl -s http://localhost/"`.nothrow();
        if (staticResult.exitCode !== 0) {
          console.log('Static content test failed:', staticResult.stderr);
          // Debug what's wrong
          const debugResult = await $`docker exec ${nginxName} sh -c "ls -la /usr/share/nginx/html/ && cat /etc/nginx/conf.d/default.conf"`.nothrow();
          console.log('Debug info:', debugResult.stdout);
          throw new Error(`Failed to fetch static content: ${staticResult.stderr}`);
        }
        expect(staticResult.stdout).toContain('Hello from Docker E2E Test!');
        expect(staticResult.stdout).toContain('<div id="content">');

        // Test API endpoint (use curl since wget might not be available)
        const apiResult = await $`docker exec ${nginxName} sh -c "curl -s http://localhost/api"`.nothrow();
        expect(apiResult.exitCode).toBe(0);
        const apiResponse = JSON.parse(apiResult.stdout);
        expect(apiResponse.message).toBe('Hello from backend!');
        expect(apiResponse.version).toBe('1.0.0');
        expect(apiResponse.timestamp).toBeTruthy();
        
        // Test via host port (if running in CI this might not work)
        if (process.env['CI'] !== 'true') {
          const hostResult = await $`curl -s http://localhost:8080/api`.nothrow();
          if (hostResult.exitCode === 0) {
            const hostResponse = JSON.parse(hostResult.stdout);
            expect(hostResponse.message).toBe('Hello from backend!');
          }
        }
      } finally {
        await $`docker rm -f ${nginxName} ${appName}`.nothrow();
        await $`docker network rm ${network}`.nothrow();
        createdContainers.delete(nginxName);
        createdContainers.delete(appName);
        createdNetworks.delete(network);
      }
    }, 60000);
  });

  describe('Build and CI/CD Scenarios', () => {
    it('should build application from Dockerfile', async () => {
      const buildDir = join(workDir, 'docker-build');
      await fs.mkdir(buildDir, { recursive: true });

      // Create Dockerfile
      await fs.writeFile(join(buildDir, 'Dockerfile'), `FROM alpine:latest
RUN apk add --no-cache python3 py3-pip
WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt
COPY . .
CMD ["python3", "app.py"]`);

      // Create requirements.txt
      await fs.writeFile(join(buildDir, 'requirements.txt'), ``);

      // Create app
      await fs.writeFile(join(buildDir, 'app.py'), `import sys
import platform

print("Hello from Dockerized Python app!")
print(f"Python version: {sys.version}")
print(f"Platform: {platform.platform()}")
print("Application started successfully!")`);

      const imageName = `${TEST_PREFIX}-build-test:latest`;
      const containerName = `${TEST_PREFIX}-built-app`;
      
      createdImages.add(imageName);
      createdContainers.add(containerName);

      try {
        // Build image
        console.log('Building Docker image from:', buildDir);
        
        // Check if directory and files exist
        const dirContents = await fs.readdir(buildDir);
        console.log('Build directory contents:', dirContents);
        
        // Try a simpler approach to capture all output
        let buildSucceeded = false;
        let buildOutput = '';
        let buildError = '';
        
        try {
          const buildResult = await $`docker build -t ${imageName} ${buildDir}`;
          buildSucceeded = true;
          buildOutput = buildResult.stdout;
        } catch (error: any) {
          buildSucceeded = false;
          buildError = error.message || String(error);
          
          // Extract any output from the error
          if (error.stdout) buildOutput = error.stdout;
          if (error.stderr) buildError = error.stderr;
          
          console.log('Docker build failed with error:', buildError);
          console.log('Build output:', buildOutput);
          
          // List what's in the build directory
          const files = await fs.readdir(buildDir);
          for (const file of files) {
            const content = await fs.readFile(join(buildDir, file), 'utf8');
            console.log(`${file}:`, content.substring(0, 100));
          }
        }
        
        expect(buildSucceeded).toBe(true);
        if (buildOutput) {
          expect(buildOutput).toContain('Successfully built');
        }

        // Run container from built image
        const runResult = await $`docker run --name ${containerName} ${imageName}`;
        expect(runResult.exitCode).toBe(0);
        expect(runResult.stdout).toContain('Hello from Dockerized Python app!');
        expect(runResult.stdout).toContain('Python version:');
        expect(runResult.stdout).toContain('Application started successfully!');
        
        // Verify image exists
        const imagesResult = await $`docker images ${imageName} --format "{{.Repository}}:{{.Tag}}"`;
        expect(imagesResult.stdout.trim()).toBe(imageName);
      } finally {
        await $`docker rm -f ${containerName}`.nothrow();
        await $`docker rmi ${imageName}`.nothrow();
        createdContainers.delete(containerName);
        createdImages.delete(imageName);
      }
    }, 120000); // 2 minute timeout for build

    it('should simulate CI pipeline with test stages', async () => {
      const pipelineDir = join(workDir, 'ci-pipeline');
      await fs.mkdir(pipelineDir, { recursive: true });

      // Create test project
      await fs.writeFile(join(pipelineDir, 'requirements.txt'), `pytest==7.4.0
coverage==7.3.0
flake8==6.1.0`);

      await fs.writeFile(join(pipelineDir, 'app.py'), `"""Simple calculator module for CI pipeline demo."""


def add(a: float, b: float) -> float:
    """Add two numbers."""
    return a + b


def multiply(a: float, b: float) -> float:
    """Multiply two numbers."""
    return a * b


def divide(a: float, b: float) -> float:
    """Divide two numbers."""
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b
`);

      await fs.writeFile(join(pipelineDir, 'test_app.py'), `"""Tests for the calculator module."""

import pytest
from app import add, multiply, divide


def test_add():
    """Test addition function."""
    assert add(2, 3) == 5
    assert add(-1, 1) == 0
    assert add(0.1, 0.2) == pytest.approx(0.3)


def test_multiply():
    """Test multiplication function."""
    assert multiply(3, 4) == 12
    assert multiply(0, 5) == 0
    assert multiply(-2, -3) == 6


def test_divide():
    """Test division function."""
    assert divide(10, 2) == 5
    assert divide(7, 2) == 3.5

    with pytest.raises(ValueError):
        divide(5, 0)
`);

      const containerName = `${TEST_PREFIX}-ci-pipeline`;
      createdContainers.add(containerName);

      try {
        // Create CI container
        console.log('🚀 Stage 1: Setup CI environment');
        await $`docker run -d --name ${containerName} \
          -v ${pipelineDir}:/workspace -w /workspace \
          python:3.11-slim sleep 600`;

        console.log('📦 Stage 2: Install dependencies');
        const installResult = await $`docker exec ${containerName} pip install --break-system-packages -r requirements.txt`;
        expect(installResult.exitCode).toBe(0);

        console.log('🧪 Stage 3: Run linting');
        const lintResult = await $`docker exec ${containerName} sh -c "flake8 app.py test_app.py --max-line-length=100 2>&1 || true"`;
        if (lintResult.stdout.trim()) {
          console.log('Flake8 output:', lintResult.stdout);
          throw new Error(`Flake8 found issues: ${lintResult.stdout}`);
        }

        console.log('✅ Stage 4: Run tests');
        const testResult = await $`docker exec ${containerName} pytest -v test_app.py`;
        expect(testResult.exitCode).toBe(0);
        expect(testResult.stdout).toContain('3 passed');

        console.log('📊 Stage 5: Generate coverage report');
        const coverageResult = await $`docker exec ${containerName} sh -c "coverage run -m pytest test_app.py && coverage report"`;
        expect(coverageResult.exitCode).toBe(0);
        expect(coverageResult.stdout).toContain('100%');

        console.log('📈 Stage 6: Generate coverage HTML');
        await $`docker exec ${containerName} coverage html`;
        const htmlExists = await $`docker exec ${containerName} sh -c "test -d htmlcov && echo exists"`;
        expect(htmlExists.stdout.trim()).toBe('exists');

        console.log('✨ CI pipeline completed successfully!');
      } finally {
        await $`docker rm -f ${containerName}`.nothrow();
        createdContainers.delete(containerName);
      }
    }, 120000);
  });

  describe('Data Processing Pipeline', () => {
    it('should process data through multiple containers', async () => {
      const dataDir = join(workDir, 'data-pipeline');
      await fs.mkdir(dataDir, { recursive: true });

      // Create sample data
      const inputData = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        value: Math.floor(Math.random() * 100),
        timestamp: new Date().toISOString(),
        category: Math.random() > 0.5 ? 'A' : 'B'
      }));

      await fs.writeFile(
        join(dataDir, 'input.json'),
        JSON.stringify(inputData, null, 2)
      );

      const network = `${TEST_PREFIX}-pipeline-net`;
      createdNetworks.add(network);
      await $`docker network create ${network}`;

      // Container names
      const validator = `${TEST_PREFIX}-validator`;
      const transformer = `${TEST_PREFIX}-transformer`;
      const aggregator = `${TEST_PREFIX}-aggregator`;
      
      createdContainers.add(validator);
      createdContainers.add(transformer);
      createdContainers.add(aggregator);

      try {
        // Stage 1: Data validation
        console.log('📋 Stage 1: Validating data...');
        await $`docker run -d --name ${validator} --network ${network} \
          -v ${dataDir}:/data -w /data \
          node:18-alpine sleep 300`;

        const validationResult = await $`docker exec ${validator} node -e "
          const fs = require('fs');
          const data = JSON.parse(fs.readFileSync('./input.json', 'utf8'));
          console.log('Validating', data.length, 'records...');
          
          let errors = [];
          data.forEach((record, index) => {
            if (!record.id || typeof record.id !== 'number') {
              errors.push(\`Record \${index}: Invalid ID\`);
            }
            if (record.value < 0 || record.value > 100) {
              errors.push(\`Record \${index}: Value out of range\`);
            }
            if (!record.timestamp || !Date.parse(record.timestamp)) {
              errors.push(\`Record \${index}: Invalid timestamp\`);
            }
            if (!['A', 'B'].includes(record.category)) {
              errors.push(\`Record \${index}: Invalid category\`);
            }
          });
          
          if (errors.length > 0) {
            console.error('Validation errors:', errors);
            process.exit(1);
          }
          
          console.log('✓ All records valid!');
          fs.writeFileSync('./validation-report.json', JSON.stringify({
            status: 'passed',
            recordCount: data.length,
            timestamp: new Date().toISOString()
          }, null, 2));
        "`;
        
        expect(validationResult.exitCode).toBe(0);

        // Stage 2: Data transformation
        console.log('🔄 Stage 2: Transforming data...');
        // Create transform script
        await fs.writeFile(join(dataDir, 'transform.py'), `
import json
import statistics

# Read input data
with open('input.json') as f:
    data = json.load(f)

# Transform data
transformed = []
values_by_category = {'A': [], 'B': []}

for record in data:
    # Calculate derived fields
    value_squared = record['value'] ** 2
    value_category = 'high' if record['value'] > 50 else 'low'
    
    # Track for statistics
    values_by_category[record['category']].append(record['value'])
    
    transformed.append({
        'id': record['id'],
        'original_value': record['value'],
        'value_squared': value_squared,
        'value_category': value_category,
        'category': record['category'],
        'timestamp': record['timestamp'],
        'processed_at': '2025-01-01T00:00:00.000Z'
    })

# Calculate statistics
stats = {
    'category_A_mean': statistics.mean(values_by_category['A']) if values_by_category['A'] else 0,
    'category_B_mean': statistics.mean(values_by_category['B']) if values_by_category['B'] else 0,
    'category_A_count': len(values_by_category['A']),
    'category_B_count': len(values_by_category['B'])
}

# Save results
with open('transformed.json', 'w') as f:
    json.dump(transformed, f, indent=2)

with open('transform-stats.json', 'w') as f:
    json.dump(stats, f, indent=2)

print(f'✓ Transformed {len(transformed)} records')
print(f'  Category A: {stats["category_A_count"]} records, mean: {stats["category_A_mean"]:.2f}')
print(f'  Category B: {stats["category_B_count"]} records, mean: {stats["category_B_mean"]:.2f}')
`);

        await $`docker run -d --name ${transformer} --network ${network} \
          -v ${dataDir}:/data -w /data \
          python:3.11-slim sleep 300`;

        const transformResult = await $`docker exec ${transformer} python3 transform.py`.nothrow();
        
        if (transformResult.exitCode !== 0) {
          console.log('Transform error:', transformResult.stderr || transformResult.stdout);
        }
        expect(transformResult.exitCode).toBe(0);

        // Stage 3: Data aggregation
        console.log('📊 Stage 3: Aggregating results...');
        await $`docker run -d --name ${aggregator} --network ${network} \
          -v ${dataDir}:/data -w /data \
          node:18-alpine sleep 300`;

        const aggResult = await $`docker exec ${aggregator} node -e "
          const fs = require('fs');
          
          // Read all data files
          const validation = JSON.parse(fs.readFileSync('./validation-report.json', 'utf8'));
          const transformed = JSON.parse(fs.readFileSync('./transformed.json', 'utf8'));
          const transformStats = JSON.parse(fs.readFileSync('./transform-stats.json', 'utf8'));
          
          // Aggregate statistics
          const stats = {
            pipeline: {
              status: 'completed',
              stages: ['validation', 'transformation', 'aggregation'],
              timestamp: new Date().toISOString()
            },
            validation: validation,
            data: {
              total_records: transformed.length,
              high_value_count: transformed.filter(d => d.value_category === 'high').length,
              low_value_count: transformed.filter(d => d.value_category === 'low').length,
              category_distribution: transformStats,
              value_stats: {
                min: Math.min(...transformed.map(d => d.original_value)),
                max: Math.max(...transformed.map(d => d.original_value)),
                mean: transformed.reduce((sum, d) => sum + d.original_value, 0) / transformed.length
              }
            }
          };
          
          console.log('📊 Pipeline Statistics:');
          console.log(JSON.stringify(stats, null, 2));
          
          // Save final report
          fs.writeFileSync('pipeline-report.json', JSON.stringify(stats, null, 2));
          
          console.log('\\n✓ Pipeline completed successfully!');
        "`;

        expect(aggResult.exitCode).toBe(0);

        // Verify final output
        const report = JSON.parse(await fs.readFile(join(dataDir, 'pipeline-report.json'), 'utf8'));
        expect(report.pipeline.status).toBe('completed');
        expect(report.data.total_records).toBe(100);
        expect(report.data.high_value_count + report.data.low_value_count).toBe(100);
        expect(report.data.value_stats.min).toBeGreaterThanOrEqual(0);
        expect(report.data.value_stats.max).toBeLessThanOrEqual(100);

      } finally {
        await $`docker rm -f ${validator} ${transformer} ${aggregator}`.nothrow();
        await $`docker network rm ${network}`.nothrow();
        createdContainers.delete(validator);
        createdContainers.delete(transformer);
        createdContainers.delete(aggregator);
        createdNetworks.delete(network);
      }
    }, 120000);
  });

  describe('Container Management', () => {
    it('should manage container dependencies and lifecycle', async () => {
      const network = `${TEST_PREFIX}-orch-network`;
      createdNetworks.add(network);
      await $`docker network create ${network}`;

      // Container names
      const registry = `${TEST_PREFIX}-registry`;
      const coordinator = `${TEST_PREFIX}-coordinator`;
      const workers: string[] = [];
      
      createdContainers.add(registry);
      createdContainers.add(coordinator);

      try {
        // Start service registry (Redis)
        console.log('🗄️  Starting service registry...');
        await $`docker run -d --name ${registry} --network ${network} \
          --health-cmd="redis-cli ping" \
          --health-interval=1s \
          --health-timeout=3s \
          --health-retries=30 \
          redis:7-alpine`;

        // Wait for registry to be healthy
        await waitFor(
          async () => {
            const result = await $`docker inspect ${registry} --format='{{.State.Health.Status}}'`.nothrow();
            return result.stdout.trim() === 'healthy';
          },
          { timeout: 30000, message: 'Registry failed to become healthy' }
        );

        // Start worker services
        console.log('👷 Starting worker services...');
        for (let i = 1; i <= 3; i++) {
          const workerName = `${TEST_PREFIX}-worker-${i}`;
          workers.push(workerName);
          createdContainers.add(workerName);

          await $`docker run -d --name ${workerName} --network ${network} \
            -e WORKER_ID=${i} \
            -e REGISTRY_HOST=${registry} \
            alpine:latest sh -c "
              apk add --no-cache redis >/dev/null 2>&1;
              echo 'Worker ${i} starting...';
              
              # Register worker
              redis-cli -h ${registry} SET worker:${i}:status starting;
              redis-cli -h ${registry} SET worker:${i}:start_time \"\$(date +%Y-%m-%dT%H:%M:%S)\";
              
              # Simulate initialization
              sleep 2;
              
              # Mark as ready
              redis-cli -h ${registry} SET worker:${i}:status ready;
              echo 'Worker ${i} ready!';
              
              # Work loop
              while true; do
                # Check for work
                TASK=\$(redis-cli -h ${registry} RPOP work:queue 2>/dev/null);
                if [ -n \"\$TASK\" ]; then
                  echo \"Worker ${i} processing task: \$TASK\";
                  redis-cli -h ${registry} SET worker:${i}:status busy;
                  redis-cli -h ${registry} SET worker:${i}:current_task \"\$TASK\";
                  
                  # Simulate work
                  sleep 1;
                  
                  # Mark task complete
                  redis-cli -h ${registry} LPUSH work:completed \"\$TASK:worker${i}:\$(date +%Y-%m-%dT%H:%M:%S)\";
                  redis-cli -h ${registry} SET worker:${i}:status ready;
                  redis-cli -h ${registry} DEL worker:${i}:current_task;
                  echo \"Worker ${i} completed task: \$TASK\";
                fi
                sleep 0.5;
              done
            "`;
        }

        // Start coordinator
        console.log('🎯 Starting coordinator...');
        await $`docker run -d --name ${coordinator} --network ${network} \
          -e REGISTRY_HOST=${registry} \
          alpine:latest sh -c "apk add --no-cache redis && sleep 600"`;

        // Wait for all workers to be ready
        console.log('⏳ Waiting for workers to be ready...');
        
        await waitFor(
          async () => {
            const statusResult = await $`docker exec ${coordinator} sh -c "redis-cli -h ${registry} MGET worker:1:status worker:2:status worker:3:status"`.nothrow();
            if (statusResult.exitCode !== 0) {
              console.log('Redis error:', statusResult.stderr);
              return false;
            }
            const readyCount = statusResult.stdout.split('\n').filter(line => line.trim() === 'ready').length;
            return readyCount === 3;
          },
          { timeout: 30000, message: 'Workers failed to become ready' }
        );

        // Verify all workers registered
        const workersResult = await $`docker exec ${coordinator} sh -c "redis-cli -h ${registry} KEYS 'worker:*:status' | sort"`;
        const workerKeys = workersResult.stdout.trim().split('\n');
        expect(workerKeys).toHaveLength(3);
        expect(workerKeys).toContain('worker:1:status');
        expect(workerKeys).toContain('worker:2:status');
        expect(workerKeys).toContain('worker:3:status');

        // Submit tasks
        console.log('📋 Submitting tasks...');
        const taskCount = 10;
        for (let i = 1; i <= taskCount; i++) {
          await $`docker exec ${coordinator} redis-cli -h ${registry} LPUSH work:queue "task-${i}"`;
        }

        // Verify queue
        const queueLen = await $`docker exec ${coordinator} redis-cli -h ${registry} LLEN work:queue`;
        expect(parseInt(queueLen.stdout.trim())).toBe(taskCount);

        // Wait for tasks to be processed
        console.log('⏳ Waiting for task completion...');
        await waitFor(
          async () => {
            const completed = await $`docker exec ${coordinator} redis-cli -h ${registry} LLEN work:completed`.nothrow();
            return parseInt(completed.stdout.trim()) === taskCount;
          },
          { timeout: 20000, message: 'Tasks were not completed in time' }
        );

        // Verify all tasks completed
        const completedTasks = await $`docker exec ${coordinator} redis-cli -h ${registry} LRANGE work:completed 0 -1`;
        const completedList = completedTasks.stdout.trim().split('\n');
        expect(completedList).toHaveLength(taskCount);
        
        // Check task distribution
        const workerStats = {
          worker1: completedList.filter(t => t.includes('worker1')).length,
          worker2: completedList.filter(t => t.includes('worker2')).length,
          worker3: completedList.filter(t => t.includes('worker3')).length
        };
        
        console.log('📊 Task distribution:', workerStats);
        expect(workerStats.worker1 + workerStats.worker2 + workerStats.worker3).toBe(taskCount);
        
        // Each worker should have processed at least one task
        expect(workerStats.worker1).toBeGreaterThan(0);
        expect(workerStats.worker2).toBeGreaterThan(0);
        expect(workerStats.worker3).toBeGreaterThan(0);

        console.log('✅ Container management test completed successfully!');

      } finally {
        // Cleanup all containers
        const allContainers = [coordinator, registry, ...workers];
        await $`docker rm -f ${allContainers.join(' ')}`.nothrow();
        await $`docker network rm ${network}`.nothrow();
        
        // Clean from tracking
        createdContainers.delete(coordinator);
        createdContainers.delete(registry);
        workers.forEach(w => createdContainers.delete(w));
        createdNetworks.delete(network);
      }
    }, 120000);
  });
});