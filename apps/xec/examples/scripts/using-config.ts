#!/usr/bin/env xec

/**
 * Example script showing how to use the CLI configuration API
 * 
 * This script demonstrates:
 * - Accessing configured hosts, containers, and pods
 * - Using command aliases
 * - Working with profiles
 * - Direct access to configuration values
 */

// The CLI API is automatically available in xec scripts
// You can access: config, hosts, containers, pods, $, and more

console.log(chalk.blue('🚀 Xec Script with Configuration Access\n'));

// 1. Access configured SSH hosts
console.log(chalk.yellow('📡 SSH Hosts:'));
for (const hostName of config.list.hosts()) {
  console.log(`  - ${hostName}`);
}

// Execute commands on configured hosts
if (config.hosts.prod) {
  console.log(chalk.yellow('\n📊 Production server status:'));
  const uptime = await hosts.prod`uptime`;
  console.log(`  Uptime: ${uptime.stdout.trim()}`);
  
  const disk = await hosts.prod`df -h / | grep -v Filesystem`;
  console.log(`  Disk usage: ${disk.stdout.trim()}`);
}

// 2. Work with Docker containers
console.log(chalk.yellow('\n🐳 Docker Containers:'));
for (const containerName of config.list.containers()) {
  console.log(`  - ${containerName}`);
}

// Check if app container is running
if (config.containers.app) {
  try {
    const appStatus = await containers.app`echo "Container is running"`;
    console.log(chalk.green('  ✓ App container is healthy'));
  } catch (error) {
    console.log(chalk.red('  ✗ App container is not running'));
  }
}

// 3. Kubernetes pods
console.log(chalk.yellow('\n☸️  Kubernetes Pods:'));
for (const podName of config.list.pods()) {
  const pod = config.pods[podName];
  console.log(`  - ${podName} (namespace: ${pod.namespace || 'default'})`);
}

// Execute in a pod
if (config.pods.web) {
  const podInfo = await pods.web`hostname && date`;
  console.log(`  Web pod info: ${podInfo.stdout.trim()}`);
}

// 4. Use command aliases
console.log(chalk.yellow('\n🔗 Command Aliases:'));
const aliases = Object.keys(config.aliases);
if (aliases.length > 0) {
  aliases.forEach(alias => {
    console.log(`  - ${alias}: ${config.aliases[alias]}`);
  });
  
  // Run an alias if 'status' exists
  if (resolveAlias('status')) {
    console.log(chalk.blue('\n  Running "status" alias...'));
    await runAlias('status');
  }
} else {
  console.log('  No aliases defined');
}

// 5. Work with profiles
console.log(chalk.yellow('\n👤 Profiles:'));
const profiles = config.list.profiles();
profiles.forEach(profile => {
  const active = profile === getCurrentProfile() ? ' (active)' : '';
  console.log(`  - ${profile}${active}`);
});

// Switch to a profile temporarily
if (profiles.includes('dev')) {
  console.log(chalk.blue('\n  Switching to dev profile...'));
  useProfile('dev');
  console.log(`  Current timeout: ${config.defaults.timeout}`);
}

// 6. Direct configuration access
console.log(chalk.yellow('\n⚙️  Configuration Details:'));
console.log(`  Default shell: ${config.get('defaults.shell') || '/bin/sh'}`);
console.log(`  Default timeout: ${config.get('defaults.timeout') || '30s'}`);

// 7. Environment-specific logic
const env = process.env['NODE_ENV'] || 'development';
console.log(chalk.yellow(`\n🌍 Environment: ${env}`));

if (env === 'production') {
  // Use production hosts
  const prodHosts = Object.keys(config.hosts).filter(h => h.includes('prod'));
  console.log(`  Production hosts: ${prodHosts.join(', ')}`);
} else {
  console.log('  Running in development mode');
}

// 8. Parallel execution across multiple hosts
if (Object.keys(config.hosts).length > 1) {
  console.log(chalk.yellow('\n🔄 Parallel execution example:'));
  
  const hostChecks = Object.keys(config.hosts).map(async (hostName) => {
    try {
      const result = await hosts[hostName]`echo "OK from $(hostname)"`;
      return { host: hostName, status: 'online', message: result.stdout.trim() };
    } catch (error) {
      return { host: hostName, status: 'offline', message: error.message };
    }
  });
  
  const results = await Promise.all(hostChecks);
  results.forEach(({ host, status, message }) => {
    const statusIcon = status === 'online' ? '✓' : '✗';
    const statusColor = status === 'online' ? chalk.green : chalk.red;
    console.log(`  ${statusColor(statusIcon)} ${host}: ${message}`);
  });
}

console.log(chalk.green('\n✨ Script completed successfully!'));