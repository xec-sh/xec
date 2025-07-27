// Global Jest setup for all packages
import { execSync } from 'child_process';

// Cleanup function for Docker containers
async function cleanupDockerContainers() {
  try {
    // Get all test Redis containers
    const containers = execSync('docker ps -a --format "{{.Names}}" | grep "redis-test-" || true', {
      encoding: 'utf8'
    }).trim().split('\n').filter(Boolean);
    
    if (containers.length > 0) {
      console.log(`\nCleaning up ${containers.length} test Redis containers...`);
      for (const container of containers) {
        try {
          execSync(`docker stop ${container} && docker rm ${container}`, { stdio: 'pipe' });
        } catch {
          // Ignore errors
        }
      }
    }
  } catch {
    // Ignore if Docker is not available
  }
}

// Register cleanup on process exit
if (typeof process !== 'undefined') {
  process.on('exit', () => {
    cleanupDockerContainers();
  });
  
  process.on('SIGINT', () => {
    cleanupDockerContainers();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    cleanupDockerContainers();
    process.exit(0);
  });
}

// Also register with Jest's afterAll if available
if (typeof afterAll !== 'undefined') {
  afterAll(async () => {
    await cleanupDockerContainers();
  }, 30000);
}

export {};