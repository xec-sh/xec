#!/usr/bin/env node

/**
 * Redis Cluster Example
 *
 * This example demonstrates how to create and use a Redis cluster
 * for testing purposes using xec's Docker fluent API.
 */

import { $ } from '@xec-sh/core';

async function main() {
  console.log('🚀 Redis Cluster Example\n');

  // Create a Redis cluster with 3 masters and 1 replica each (6 nodes total)
  const cluster = $.docker().redisCluster({
    masters: 3,
    replicas: 1,
    basePort: 7001,
    containerPrefix: 'demo-redis',
    network: 'demo-redis-net'
  });

  try {
    // Start the cluster
    console.log('📦 Starting Redis cluster...');
    await cluster.start();

    console.log('✅ Cluster is running!\n');

    // Get cluster information
    console.log('📊 Cluster Info:');
    const info = await cluster.info();
    console.log(info);

    // Show cluster nodes
    console.log('\n🔗 Cluster Nodes:');
    const nodes = await cluster.nodes();
    const nodeLines = nodes.split('\n').slice(0, 3); // Show first 3 nodes
    nodeLines.forEach(line => console.log(line));
    console.log('...\n');

    // Connection string for clients
    console.log('🔌 Connection String:', cluster.getConnectionString());
    console.log();

    // Test the cluster with some operations
    console.log('🧪 Testing cluster operations...');

    // Set multiple keys (they'll be distributed across shards)
    for (let i = 0; i < 10; i++) {
      const key = `test:key:${i}`;
      const value = `value-${i}`;
      await cluster.exec(`SET ${key} ${value}`);
      console.log(`  ✓ SET ${key} = ${value}`);
    }

    console.log();

    // Get keys back
    console.log('📖 Reading keys back...');
    for (let i = 0; i < 5; i++) {
      const key = `test:key:${i}`;
      const result = await cluster.exec(`GET ${key}`);
      console.log(`  ✓ GET ${key} = ${result.stdout.trim()}`);
    }

    console.log();

    // Keep cluster running for manual testing
    console.log('💡 Cluster is running. You can connect with:');
    console.log(`   redis-cli -c -p 7001`);
    console.log();
    console.log('Press Ctrl+C to stop and clean up...');

    // Wait for interrupt
    await new Promise((resolve) => {
      process.on('SIGINT', resolve);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Clean up
    console.log('\n🧹 Cleaning up...');
    await cluster.remove();
    console.log('✅ Cluster removed');
  }
}

// Advanced example with persistent data
async function advancedExample() {
  console.log('🚀 Advanced Redis Cluster Example\n');

  // Create a cluster with persistence and custom configuration
  const cluster = $.docker().redisCluster({
    masters: 3,
    replicas: 1,
    basePort: 8001,
    image: 'redis:7.2-alpine',
    containerPrefix: 'prod-redis',
    persistent: true,
    dataPath: '/tmp/redis-cluster-data',
    redisConfig: {
      'maxmemory': '256mb',
      'maxmemory-policy': 'allkeys-lru',
      'save': '60 1000', // Save snapshot every 60s if 1000+ keys changed
      'appendfsync': 'everysec'
    }
  });

  await cluster.start();

  // Your application code here...

  // Data will persist even after container restart
  await cluster.stop();
  await cluster.start();

  // Clean up when done
  await cluster.remove();
}

// Minimal example for quick testing
async function minimalExample() {
  // Simplest possible cluster - 3 masters, no replicas
  const cluster = $.docker().redisCluster({
    masters: 3,
    replicas: 0
  });

  await cluster.start();

  // Use the cluster
  await cluster.exec('SET hello world');
  const result = await cluster.exec('GET hello');
  console.log(result.stdout); // "world"

  await cluster.remove();
}

// Run the main example
// To run: npx tsx examples/redis-cluster.ts
main().catch(console.error);