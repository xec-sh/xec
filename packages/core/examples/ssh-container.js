#!/usr/bin/env node

/**
 * Example: Creating SSH-enabled Docker containers using Xec Docker Fluent API
 */

import { ExecutionEngine } from '../dist/index.js';
import { SSHFluentAPI } from '../dist/adapters/docker/docker-fluent-api/index.js';

async function main() {
  const engine = new ExecutionEngine();

  console.log('🚀 Creating SSH-enabled Docker containers with Xec...\n');

  // Example 1: Quick start with defaults (Ubuntu, port 2222)
  console.log('1. Creating default SSH container (Ubuntu)...');
  const ssh1 = new SSHFluentAPI(engine);
  console.log(`   Connection: ${ssh1.getConnectionString()}`);
  console.log(`   Config:`, ssh1.getConnectionConfig());

  // Example 2: Alpine with custom port
  console.log('\n2. Creating Alpine SSH container with custom port...');
  const ssh2 = new SSHFluentAPI(engine, {
    distro: 'alpine',
    port: 2323,
    user: 'admin',
    password: 'secret123'
  });
  console.log(`   Connection: ${ssh2.getConnectionString()}`);
  console.log(`   Config:`, ssh2.getConnectionConfig());

  // Example 3: Fluent API with advanced configuration
  console.log('\n3. Creating advanced SSH container with fluent API...');
  const ssh3 = new SSHFluentAPI(engine)
    .withDistro('debian')
    .withCredentials('devuser', 'devpass')
    .withPort(2424)
    .withSudo(false) // No password required for sudo
    .withPackages('git', 'vim', 'curl', 'htop')
    .withSetupCommand('echo "Welcome to SSH container!" > /etc/motd')
    .persistent(); // Don't auto-remove

  console.log(`   Connection: ${ssh3.getConnectionString()}`);
  console.log(`   Config:`, ssh3.getConnectionConfig());

  // Example 4: Different distributions
  console.log('\n4. Supported distributions:');
  const distros = ['ubuntu', 'alpine', 'debian', 'fedora', 'centos', 'rocky', 'alma'];
  distros.forEach(distro => {
    const ssh = new SSHFluentAPI(engine, { distro, port: 2500 + distros.indexOf(distro) });
    console.log(`   - ${distro.padEnd(8)} : ${ssh.getConnectionString()}`);
  });

  // Example 5: Starting a container (commented out to avoid actual Docker operations)
  console.log('\n5. To start a container, use:');
  console.log('   const ssh = await docker.ssh().start();');
  console.log('   // Container is now running and SSH is ready');
  console.log('   ');
  console.log('   // Execute commands via SSH');
  console.log('   await ssh.ssh("ls -la");');
  console.log('   ');
  console.log('   // Copy files');
  console.log('   await ssh.scpTo("/local/file.txt", "/remote/file.txt");');
  console.log('   await ssh.scpFrom("/remote/data.txt", "/local/data.txt");');
  console.log('   ');
  console.log('   // Stop container');
  console.log('   await ssh.stop();');

  console.log('\n✅ SSH container examples completed!');
  console.log('\nNote: To actually start containers, uncomment the start() calls.');
  console.log('Make sure Docker is running and sshpass is installed for SSH operations.');
}

main().catch(console.error);