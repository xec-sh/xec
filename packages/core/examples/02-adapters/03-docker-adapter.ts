/**
 * 03. Docker Adapter - Executing Commands in Docker Containers
 * 
 * Demonstrates the use of Docker adapter for working with containers
 */

import { $, CommandError } from '@xec-sh/core';

// 1. Simple execution in existing container
// Docker adapter works with already running containers
const $docker = $.docker({ container: 'my-app-container' });
await $docker`echo "Hello from Docker!"`;
await $docker`cat /etc/os-release`;

// 2. Execution with user specification
const $asUser = $.docker({ 
  container: 'my-running-container',
  user: 'www-data' 
});
await $asUser`whoami`; // www-data
await $asUser`id`;

// 3. Container with working directory
const $withWorkdir = $.docker({
  container: 'node-app',
  workdir: '/app'
});

await $withWorkdir`pwd`; // /app
await $withWorkdir`ls -la`;
await $withWorkdir`npm install`;

// 4. Container with TTY
const $interactive = $.docker({
  container: 'my-app',
  tty: true
});

// TTY allows using colors and interactive applications
await $interactive`ls --color=auto`;
await $interactive`top -b -n 1`;

// 5. Combining Docker with other methods
const $dockerConfigured = $.docker({
  container: 'my-app',
  workdir: '/app'
})
  .env({ NODE_ENV: 'production' })
  .timeout(30000);

await $dockerConfigured`npm run build`;
await $dockerConfigured`npm test`;

// 6. Working with multiple containers
const containers = ['app-1', 'app-2', 'app-3'];

// Running commands in all containers
for (const container of containers) {
  const $container = $.docker({ container });
  await $container`service nginx reload`;
}

// 7. Checking container status
const $app = $.docker({ container: 'my-app' });

// Health check
const healthCheck = await $app`curl -f http://localhost:3000/health || exit 1`.nothrow();
if (healthCheck.ok) {
  console.log('Application is running normally');
} else {
  console.log('Application is not responding');
}

// 8. Cleaning logs in container
const $logger = $.docker({ 
  container: 'logger-app',
  workdir: '/var/log/app'
});

await $logger`find . -name "*.log" -mtime +7 -delete`;
await $logger`du -sh .`;

// 9. Using Docker for testing
// First create a test container
await $`docker run -d --name test-db postgres:14`;

// Wait for readiness
await $`sleep 5`;

// Run tests
const $testDb = $.docker({ container: 'test-db', user: 'postgres' });
await $testDb`psql -c "CREATE DATABASE testdb;"`;

// Clean up
await $`docker rm -f test-db`;

// 10. Error handling

// 11. CI/CD pipeline example
// Building and testing in Docker
const $build = $.docker({ 
  container: 'build-env',
  workdir: '/workspace'
});

// CI steps
const steps = [
  'Installing dependencies',
  'Linting',
  'Tests',
  'Build'
];

for (const step of steps) {
  console.log(`\n=== ${step} ===`);
  
  switch(step) {
    case 'Installing dependencies':
      await $build`npm ci`;
      break;
    case 'Linting':
      await $build`npm run lint`;
      break;
    case 'Tests':
      await $build`npm test`;
      break;
    case 'Build':
      await $build`npm run build`;
      break;
  }
}

try {
  const $badContainer = $.docker({ container: 'nonexistent-container' });
  await $badContainer`echo "test"`;
} catch (error) {
  if (error instanceof CommandError) {
    console.log('Docker error:');
    console.log('Exit code:', error.exitCode);
    console.log('Message:', error.stderr);
  }
}
