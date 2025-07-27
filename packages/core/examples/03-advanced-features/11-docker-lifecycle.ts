#!/usr/bin/env tsx
/**
 * Docker Container Lifecycle Management Example
 * 
 * This example demonstrates the enhanced Docker API for managing
 * container lifecycles, including creation, execution, monitoring,
 * and cleanup.
 */

import { $ } from '@xec-sh/core';

async function main() {
  console.log('=== Docker Container Lifecycle Examples ===\n');

  // Example 1: Basic container lifecycle
  console.log('1. Basic container lifecycle management...');
  try {
    // Create and start a container using the enhanced API
    const nginx = await $.docker({
      image: 'nginx:alpine',
      name: 'xec-nginx-demo',
      ports: { '8080': '80' }
    }).start();

    console.log(`✅ Container '${nginx.name}' started`);
    console.log(`   Access nginx at: http://localhost:8080`);

    // Execute commands in the container
    const version = await nginx.exec`nginx -v`;
    console.log(`   Nginx version: ${version.stdout.trim()}`);

    // Get container IP address
    const ip = await nginx.getIpAddress();
    console.log(`   Container IP: ${ip}`);

    // Wait a bit before stopping
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Stop and remove the container
    await nginx.stop();
    await nginx.remove();
    console.log('✅ Container stopped and removed\n');
  } catch (error) {
    console.error('❌ Failed to manage container:', error);
  }

  // Example 2: Container with volumes and environment variables
  console.log('2. Container with volumes and environment...');
  try {
    const postgres = await $.docker({
      image: 'postgres:15-alpine',
      name: 'xec-postgres-demo',
      env: {
        POSTGRES_USER: 'demo',
        POSTGRES_PASSWORD: 'secret',
        POSTGRES_DB: 'testdb'
      },
      volumes: {
        '/tmp/postgres-data': '/var/lib/postgresql/data'
      },
      ports: { '5432': '5432' }
    }).start();

    console.log(`✅ PostgreSQL container '${postgres.name}' started`);

    // Wait for database to be ready
    console.log('   Waiting for database to initialize...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Execute SQL command
    const tables = await postgres.exec`psql -U demo -d testdb -c "\\dt"`;
    console.log('   Database ready:', tables.exitCode === 0);

    // Get container stats
    const stats = await postgres.stats();
    console.log(`   Memory usage: ${Math.round(stats.memory_stats.usage / 1024 / 1024)}MB`);

    await postgres.stop();
    await postgres.remove();
    console.log('✅ PostgreSQL container stopped and removed\n');
  } catch (error) {
    console.error('❌ Failed to manage PostgreSQL:', error);
  }

  // Example 3: Container health checks
  console.log('3. Container with health checks...');
  try {
    const app = await $.docker({
      image: 'nginx:alpine',
      name: 'xec-health-demo',
      ports: { '8081': '80' },
      healthcheck: {
        test: 'wget --no-verbose --tries=1 --spider http://localhost:80 || exit 1',
        interval: '5s',
        timeout: '3s',
        retries: 3,
        startPeriod: '10s'
      }
    }).start();

    console.log(`✅ Container '${app.name}' started with health check`);
    console.log('   Waiting for container to become healthy...');

    // Wait for container to be healthy
    await app.waitForHealthy(30000);
    console.log('✅ Container is healthy!');

    // Inspect container to see health status
    const info = await app.inspect();
    console.log(`   Health status: ${info.State.Health?.Status}`);

    await app.stop();
    await app.remove();
    console.log('✅ Container stopped and removed\n');
  } catch (error) {
    console.error('❌ Failed health check example:', error);
  }

  // Example 4: Container logs streaming
  console.log('4. Container log streaming...');
  try {
    const logger = await $.docker({
      image: 'alpine',
      name: 'xec-logger-demo',
      command: 'sh -c "for i in $(seq 1 10); do echo Log entry $i; sleep 1; done"'
    }).start();

    console.log(`✅ Container '${logger.name}' started`);
    console.log('   Streaming logs:');

    // Stream logs in real-time
    await logger.follow((data) => {
      process.stdout.write(`     📝 ${data}`);
    });

    // Container should have exited by now
    await logger.remove();
    console.log('\n✅ Container removed\n');
  } catch (error) {
    console.error('❌ Failed log streaming:', error);
  }

  // Example 5: File operations with containers
  console.log('5. File operations with containers...');
  try {
    const fileOps = await $.docker({
      image: 'alpine',
      name: 'xec-fileops-demo',
      command: 'sleep 3600' // Keep container running
    }).start();

    console.log(`✅ Container '${fileOps.name}' started`);

    // Create a test file locally
    await $`echo "Hello from host!" > /tmp/test-file.txt`;

    // Copy file to container
    await fileOps.copyTo('/tmp/test-file.txt', '/tmp/container-file.txt');
    console.log('✅ File copied to container');

    // Modify file in container
    await fileOps.exec`echo "Modified in container" >> /tmp/container-file.txt`;

    // Copy file back from container
    await fileOps.copyFrom('/tmp/container-file.txt', '/tmp/modified-file.txt');
    console.log('✅ File copied from container');

    // Show the modified content
    const content = await $`cat /tmp/modified-file.txt`;
    console.log('   File content:', content.stdout);

    // Cleanup
    await fileOps.stop();
    await fileOps.remove();
    await $`rm -f /tmp/test-file.txt /tmp/modified-file.txt`;
    console.log('✅ Container and files cleaned up\n');
  } catch (error) {
    console.error('❌ Failed file operations:', error);
  }

  // Example 6: Container restart and lifecycle events
  console.log('6. Container restart example...');
  try {
    const restartable = await $.docker({
      image: 'alpine',
      name: 'xec-restart-demo',
      command: 'sh -c "echo Started at $(date); sleep 3600"',
      restart: 'unless-stopped'
    }).start();

    console.log(`✅ Container '${restartable.name}' started`);

    // Get initial logs
    const logs1 = await restartable.logs();
    console.log('   Initial logs:', logs1.trim());

    // Restart the container
    console.log('   Restarting container...');
    await restartable.restart();

    // Wait a bit and get new logs
    await new Promise(resolve => setTimeout(resolve, 2000));
    const logs2 = await restartable.logs();
    console.log('   Logs after restart:', logs2.trim());

    await restartable.stop();
    await restartable.remove();
    console.log('✅ Container stopped and removed\n');
  } catch (error) {
    console.error('❌ Failed restart example:', error);
  }

  // Example 7: Multiple containers with networking
  console.log('7. Multiple containers with custom network...');
  try {
    // Create a custom network
    await $`docker network create xec-demo-network 2>/dev/null || true`;

    // Start database container
    const db = await $.docker({
      image: 'redis:alpine',
      name: 'xec-redis-demo',
      network: 'xec-demo-network'
    }).start();

    // Start app container that connects to database
    const app = await $.docker({
      image: 'redis:alpine',
      name: 'xec-app-demo',
      network: 'xec-demo-network'
    }).start();

    console.log('✅ Containers started on custom network');

    // Test connectivity between containers
    const ping = await app.exec`redis-cli -h xec-redis-demo ping`;
    console.log(`   Redis connectivity: ${ping.stdout.trim()}`);

    // Get IP addresses
    const dbIp = await db.getIpAddress('xec-demo-network');
    const appIp = await app.getIpAddress('xec-demo-network');
    console.log(`   Database IP: ${dbIp}`);
    console.log(`   App IP: ${appIp}`);

    // Cleanup
    await app.stop();
    await app.remove();
    await db.stop();
    await db.remove();
    await $`docker network rm xec-demo-network 2>/dev/null || true`;
    console.log('✅ Containers and network cleaned up\n');
  } catch (error) {
    console.error('❌ Failed networking example:', error);
  }

  // Example 8: Using existing containers
  console.log('8. Working with existing containers...');
  try {
    // Create a container using regular docker command
    await $`docker run -d --name xec-existing-demo alpine sleep 3600`;
    console.log('✅ Created container using docker CLI');

    // Connect to it using the enhanced API
    const existing = $.docker({
      name: 'xec-existing-demo'  // Just specify the name
    });

    // Execute commands in the existing container
    const result = await existing`echo "Connected to existing container!"`;
    console.log(`   Result: ${result.stdout.trim()}`);

    // Clean up
    await $`docker stop xec-existing-demo && docker rm xec-existing-demo`;
    console.log('✅ Existing container cleaned up\n');
  } catch (error) {
    console.error('❌ Failed existing container example:', error);
  }

  // Example 9: Container with labels and privileged mode
  console.log('9. Advanced container configuration...');
  try {
    const advanced = await $.docker({
      image: 'alpine',
      name: 'xec-advanced-demo',
      labels: {
        'app': 'xec-demo',
        'version': '1.0.0',
        'environment': 'development'
      },
      user: 'nobody',
      workdir: '/app',
      privileged: true,
      command: 'sh -c "id && pwd && sleep 5"'
    }).start();

    console.log(`✅ Advanced container '${advanced.name}' started`);

    // Get logs to see user and workdir
    const logs = await advanced.logs();
    console.log('   Container output:', logs.trim());

    // Inspect to see labels
    const info = await advanced.inspect();
    console.log('   Labels:', info.Config.Labels);

    await advanced.remove(true); // Force remove
    console.log('✅ Container removed\n');
  } catch (error) {
    console.error('❌ Failed advanced configuration:', error);
  }

  console.log('=== Docker Container Lifecycle Examples Complete ===');
}

// Run the examples
main().catch(console.error);