#!/usr/bin/env tsx
/**
 * SSH Tunnels Example
 * 
 * This example demonstrates how to create and manage SSH tunnels
 * for secure access to remote services.
 */

import { $ } from '@xec-sh/core';

async function main() {
  console.log('=== SSH Tunnel Examples ===\n');

  // Example 1: Basic SSH tunnel for database access
  console.log('1. Creating SSH tunnel for remote database access...');
  const bastion = $.ssh({
    host: process.env['SSH_HOST'] || 'bastion.example.com',
    username: process.env['SSH_USER'] || 'user',
    privateKey: process.env['SSH_KEY'] || '~/.ssh/id_rsa'
  });

  try {
    // Create a tunnel to access remote MySQL database
    const tunnel = await bastion.tunnel({
      localPort: 3306,  // Local port to bind to
      remoteHost: 'database.internal',  // Database host on remote network
      remotePort: 3306  // Database port
    });

    console.log(`✅ Tunnel created on localhost:${tunnel.localPort} -> ${tunnel.remoteHost}:${tunnel.remotePort}`);

    // Now you can connect to the database via localhost:3306
    // For example, using mysql client:
    // await $`mysql -h localhost -P 3306 -u dbuser -p dbname -e "SELECT 1"`;

    // Simulate some work with the tunnel
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Close the tunnel when done
    await tunnel.close();
    console.log('✅ Tunnel closed\n');
  } catch (error) {
    console.error('❌ Failed to create tunnel:', error);
  }

  // Example 2: Dynamic port allocation
  console.log('2. Creating tunnel with dynamic port allocation...');
  try {
    const dynamicTunnel = await bastion.tunnel({
      // localPort: 0 means let the system choose an available port
      localPort: 0,
      remoteHost: 'api.internal',
      remotePort: 8080
    });

    console.log(`✅ Dynamic tunnel created on localhost:${dynamicTunnel.localPort} -> ${dynamicTunnel.remoteHost}:${dynamicTunnel.remotePort}`);
    
    // Use the dynamically allocated port
    console.log(`   You can now access the API at: http://localhost:${dynamicTunnel.localPort}`);

    await new Promise(resolve => setTimeout(resolve, 2000));
    await dynamicTunnel.close();
    console.log('✅ Dynamic tunnel closed\n');
  } catch (error) {
    console.error('❌ Failed to create dynamic tunnel:', error);
  }

  // Example 3: Multiple tunnels through same SSH connection
  console.log('3. Creating multiple tunnels...');
  try {
    // All tunnels share the same SSH connection (connection pooling)
    const tunnel1 = await bastion.tunnel({
      localPort: 5432,
      remoteHost: 'postgres.internal',
      remotePort: 5432
    });

    const tunnel2 = await bastion.tunnel({
      localPort: 6379,
      remoteHost: 'redis.internal',
      remotePort: 6379
    });

    const tunnel3 = await bastion.tunnel({
      localPort: 9200,
      remoteHost: 'elasticsearch.internal',
      remotePort: 9200
    });

    console.log('✅ Multiple tunnels created:');
    console.log(`   - PostgreSQL: localhost:${tunnel1.localPort}`);
    console.log(`   - Redis: localhost:${tunnel2.localPort}`);
    console.log(`   - Elasticsearch: localhost:${tunnel3.localPort}`);

    // Work with the tunnels
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Close all tunnels
    await Promise.all([
      tunnel1.close(),
      tunnel2.close(),
      tunnel3.close()
    ]);
    console.log('✅ All tunnels closed\n');
  } catch (error) {
    console.error('❌ Failed to create multiple tunnels:', error);
  }

  // Example 4: Long-running tunnel
  console.log('4. Creating long-running tunnel...');
  try {
    const longRunningTunnel = await bastion.tunnel({
      localPort: 8000,
      remoteHost: 'webapp.internal',
      remotePort: 80
    });

    console.log(`✅ Long-running tunnel created on localhost:${longRunningTunnel.localPort}`);
    console.log('   Tunnel is ready for connections...');
    console.log(`   You can access the webapp at: http://localhost:${longRunningTunnel.localPort}`);

    // Keep tunnel open for a bit
    await new Promise(resolve => setTimeout(resolve, 5000));

    await longRunningTunnel.close();
    console.log('✅ Long-running tunnel closed\n');
  } catch (error) {
    console.error('❌ Failed to create long-running tunnel:', error);
  }

  // Example 5: Executing commands through bastion host
  console.log('5. Executing commands through bastion host...');
  try {
    // Execute commands on the bastion host itself
    const result = await bastion`hostname && echo "Connected via SSH"`;
    console.log('✅ Command output:', result.stdout);

    // Check connectivity to internal services
    const connectivity = await bastion`nc -zv database.internal 3306 2>&1`;
    console.log('✅ Database connectivity:', connectivity.stdout);
  } catch (error) {
    console.error('❌ Failed to execute commands:', error);
  }

  // Example 6: Accessing internal services through tunnel
  console.log('\n6. Accessing internal services through tunnel...');
  try {
    // Create tunnel to internal web service
    const apiTunnel = await bastion.tunnel({
      localPort: 0, // Dynamic port
      remoteHost: 'api.internal',
      remotePort: 443
    });

    console.log(`✅ API tunnel created on localhost:${apiTunnel.localPort}`);
    
    // Now you can make requests to the internal API
    // For example:
    // const response = await fetch(`https://localhost:${apiTunnel.localPort}/api/v1/status`);
    console.log(`   API is accessible at: https://localhost:${apiTunnel.localPort}`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    await apiTunnel.close();
    console.log('✅ API tunnel closed');
  } catch (error) {
    console.error('❌ Failed to access internal services:', error);
  }

  console.log('\n=== SSH Tunnel Examples Complete ===');
}

// Run the examples
main().catch(console.error);