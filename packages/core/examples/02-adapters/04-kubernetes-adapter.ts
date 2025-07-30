/**
 * 04. Kubernetes Adapter - Executing Commands in Kubernetes Pods
 * 
 * Demonstrates the use of Kubernetes adapter for working with pods
 */

import { $, CommandError } from '@xec-sh/core';

// 1. Simple execution in existing pod
const $k8s = $.k8s({
  pod: 'my-app-pod',
  namespace: 'default'
});

await $k8s`hostname`;
await $k8s`ls -la /app`;

// 2. Execution in specific pod container
const $k8sContainer = $.k8s({
  pod: 'multi-container-pod',
  container: 'app',
  namespace: 'production'
});

await $k8sContainer`cat /etc/hostname`;
await $k8sContainer`ps aux`;

// 3. Execution with additional kubectl exec flags
const $k8sWithFlags = $.k8s({
  pod: 'my-app-pod',
  namespace: 'default',
  execFlags: ['-it'] // interactive mode
});

await $k8sWithFlags`sh -c "echo 'Interactive mode'"`;

// 4. Using TTY for interactive commands
const $k8sTTY = $.k8s({
  pod: 'my-pod',
  namespace: 'default',
  tty: true
});

await $k8sTTY`top -b -n 1`;

// 5. Combining with other methods
const $k8sConfigured = $.k8s({
  pod: 'my-pod',
  namespace: 'staging'
})
  .env({ ENVIRONMENT: 'staging' })
  .timeout(10000);

await $k8sConfigured`echo "Environment: $ENVIRONMENT"`;

// 6. Processing logs from pods
const deploymentPods = ['web-1', 'web-2', 'web-3'];

// Sequential log collection
for (const podName of deploymentPods) {
  const $pod = $.k8s({ 
    pod: podName, 
    namespace: 'production' 
  });
  
  console.log(`\n=== Logs from ${podName} ===`);
  const logs = await $pod`tail -n 50 /var/log/app.log`.nothrow();
  
  if (logs.ok) {
    console.log(logs.stdout);
  } else {
    console.log(`Failed to get logs: ${logs.stderr}`);
  }
}

// 7. Application health check
const $healthCheck = $.k8s({
  pod: 'app-pod',
  container: 'app',
  namespace: 'production'
});

const health = await $healthCheck`curl -s http://localhost:8080/health`.nothrow();
if (health.ok) {
  const status = JSON.parse(health.stdout);
  console.log('Application status:', status);
} else {
  console.log('Application unavailable');
}

// 8. Cleaning temporary files
const $cleaner = $.k8s({
  pod: 'cleaner-pod',
  namespace: 'maintenance'
});

await $cleaner`find /tmp -type f -mtime +7 -delete`;
await $cleaner`du -sh /tmp`;

// 9. Parallel processing of multiple pods
const pods = ['web-1', 'web-2', 'web-3'];
const logTasks = pods.map(pod => {
  const $pod = $.k8s({ pod, namespace: 'production' });
  return $pod`tail -n 100 /var/log/app.log | grep ERROR`;
});

const results = await Promise.all(logTasks);
results.forEach((result, i) => {
  console.log(`Errors in ${pods[i]}:`, result.stdout);
});

// 10. Debug commands for diagnostics
// Using existing debug pod
const $debug = $.k8s({
  pod: 'debug-pod',
  namespace: 'default'
});

// DNS check
const dnsCheck = await $debug`nslookup kubernetes.default.svc.cluster.local`.nothrow();
if (dnsCheck.ok) {
  console.log('DNS is working correctly');
}

// API access check
const apiCheck = await $debug`curl -s -o /dev/null -w "%{http_code}" https://kubernetes.default.svc.cluster.local/healthz`.nothrow();
console.log('API status:', apiCheck.stdout);

// 11. CI/CD example in Kubernetes
// Running tests in test pod
const $testPod = $.k8s({
  pod: 'test-runner',
  namespace: 'ci-cd'
});

// CI steps
const steps = ['Preparation', 'Tests', 'Report'];

for (const step of steps) {
  console.log(`\n=== ${step} ===`);
  
  switch(step) {
    case 'Preparation':
      await $testPod`cd /app && npm ci`;
      break;
    case 'Tests':
      const testResult = await $testPod`cd /app && npm test`.nothrow();
      if (!testResult.ok) {
        console.error('Tests failed!');
        process.exit(1);
      }
      break;
    case 'Report':
      await $testPod`cd /app && npm run coverage`;
      break;
  }
}

// 12. Error handling
try {
  const $failPod = $.k8s({
    pod: 'non-existent-pod',
    namespace: 'default'
  });
  await $failPod`echo "test"`;
} catch (error) {
  if (error instanceof CommandError) {
    console.log('K8s error:');
    console.log('Exit code:', error.exitCode);
    console.log('Message:', error.stderr);
  }
}
