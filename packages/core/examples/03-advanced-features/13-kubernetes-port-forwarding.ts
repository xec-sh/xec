/**
 * 13. Kubernetes Port Forwarding and Enhanced Features
 * 
 * Demonstrates port forwarding, streaming logs, and enhanced pod operations
 */

import { $ } from '@xec-sh/core';

async function portForwardingExample() {
  console.log('=== Kubernetes Port Forwarding ===\n');

  // 1. Basic port forwarding
  console.log('1. Basic port forwarding:');
  const k8s = $.k8s({ namespace: 'default' });
  const webPod = k8s.pod('web-app-pod');
  
  // Forward local port 8080 to pod port 80
  const forward = await webPod.portForward(8080, 80);
  console.log(`   Port forward established: localhost:${forward.localPort} -> pod:80`);
  
  // Use the forwarded port
  try {
    const response = await $`curl -s http://localhost:8080/health`;
    console.log(`   Health check response: ${response.stdout}`);
  } finally {
    // Always close the port forward
    await forward.close();
    console.log('   Port forward closed\n');
  }

  // 2. Dynamic local port
  console.log('2. Dynamic local port allocation:');
  const dynamicForward = await webPod.portForwardDynamic(3000);
  console.log(`   Dynamic port allocated: localhost:${dynamicForward.localPort} -> pod:3000`);
  
  // Use the dynamic port
  const apiUrl = `http://localhost:${dynamicForward.localPort}/api/status`;
  console.log(`   Accessing API at: ${apiUrl}`);
  
  await dynamicForward.close();
  console.log();

  // 3. Multiple port forwards
  console.log('3. Multiple concurrent port forwards:');
  const dbPod = k8s.pod('database-pod');
  const appPod = k8s.pod('app-pod');
  
  const dbForward = await dbPod.portForward(5432, 5432);
  const appForward = await appPod.portForward(3000, 3000);
  
  console.log(`   Database: localhost:${dbForward.localPort} -> database-pod:5432`);
  console.log(`   Application: localhost:${appForward.localPort} -> app-pod:3000`);
  
  // Clean up all forwards
  await Promise.all([dbForward.close(), appForward.close()]);
  console.log('   All port forwards closed\n');
}

async function streamingLogsExample() {
  console.log('=== Kubernetes Streaming Logs ===\n');

  const k8s = $.k8s({ namespace: 'production' });
  const appPod = k8s.pod('app-server');

  // 1. Stream logs with tail
  console.log('1. Streaming last 10 lines:');
  const tailStream = await appPod.streamLogs(
    (line) => console.log(`   LOG: ${line.trim()}`),
    { tail: 10 }
  );
  
  // Let it run for a bit
  await new Promise(resolve => setTimeout(resolve, 2000));
  tailStream.stop();
  console.log();

  // 2. Follow logs in real-time
  console.log('2. Following logs in real-time:');
  const followStream = await appPod.follow(
    (line) => {
      // Parse structured logs
      try {
        const log = JSON.parse(line);
        console.log(`   [${log.level}] ${log.message}`);
      } catch {
        console.log(`   RAW: ${line.trim()}`);
      }
    },
    { tail: 5, timestamps: true }
  );
  
  // Follow for 5 seconds
  await new Promise(resolve => setTimeout(resolve, 5000));
  followStream.stop();
  console.log();

  // 3. Stream logs from specific container
  console.log('3. Streaming from specific container:');
  const multiPod = k8s.pod('multi-container-pod');
  
  const nginxLogs = await multiPod.streamLogs(
    (line) => console.log(`   [nginx] ${line.trim()}`),
    { container: 'nginx', follow: true, tail: 20 }
  );
  
  const appLogs = await multiPod.streamLogs(
    (line) => console.log(`   [app] ${line.trim()}`),
    { container: 'app', follow: true, tail: 20 }
  );
  
  // Stream both for a while
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  nginxLogs.stop();
  appLogs.stop();
  console.log();
}

async function enhancedPodOperationsExample() {
  console.log('=== Enhanced Pod Operations ===\n');

  const k8s = $.k8s({ namespace: 'default' });
  const pod = k8s.pod('worker-pod');

  // 1. Copy files to/from pod
  console.log('1. File operations:');
  
  // Copy local file to pod
  await pod.copyTo('./config.json', '/app/config.json');
  console.log('   Copied config.json to pod');
  
  // Copy from pod to local
  await pod.copyFrom('/app/logs/app.log', './app-backup.log');
  console.log('   Downloaded app.log from pod');
  
  // Copy with specific container
  await pod.copyTo('./nginx.conf', '/etc/nginx/nginx.conf', 'nginx');
  console.log('   Copied nginx.conf to nginx container\n');

  // 2. Get logs (non-streaming)
  console.log('2. Get recent logs:');
  const recentLogs = await pod.logs({ tail: 50, timestamps: true });
  const logLines = recentLogs.split('\n').slice(0, 5);
  logLines.forEach(line => console.log(`   ${line}`));
  console.log(`   ... (${recentLogs.split('\n').length} total lines)\n`);

  // 3. Execute commands in the pod
  console.log('3. Execute commands:');
  const hostname = await pod.exec`hostname`;
  console.log(`   Hostname: ${hostname.stdout.trim()}`);
  
  const processes = await pod.exec`ps aux | grep node | wc -l`;
  console.log(`   Node processes: ${processes.stdout.trim()}`);
  
  // Raw command execution
  const raw = await pod.raw`echo $PATH | tr ':' '\n' | head -3`;
  console.log('   First 3 PATH entries:');
  raw.stdout.trim().split('\n').forEach(p => console.log(`     ${p}`));
}

async function monitoringExample() {
  console.log('\n=== Monitoring Multiple Pods ===\n');

  const k8s = $.k8s({ namespace: 'production' });
  const podNames = ['web-1', 'web-2', 'web-3'];
  
  console.log('Setting up log aggregation for web pods...\n');
  
  const streams: Array<{ pod: string; stream: { stop: () => void } }> = [];
  
  // Set up streaming for each pod
  for (const podName of podNames) {
    const pod = k8s.pod(podName);
    const stream = await pod.follow(
      (line) => {
        // Add pod identifier to each line
        console.log(`[${podName}] ${line.trim()}`);
      },
      { tail: 0 } // Only new logs
    );
    
    streams.push({ pod: podName, stream });
  }
  
  console.log('\nStreaming logs from all pods (press Ctrl+C to stop)...\n');
  
  // Monitor for 10 seconds
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Clean up all streams
  console.log('\nStopping log streams...');
  streams.forEach(({ pod, stream }) => {
    stream.stop();
    console.log(`   Stopped streaming from ${pod}`);
  });
}

async function debuggingExample() {
  console.log('\n=== Debugging with Port Forwarding ===\n');

  const k8s = $.k8s({ namespace: 'staging' });
  const debugPod = k8s.pod('app-debug');
  
  console.log('Setting up debugging session...');
  
  // 1. Forward debug port
  const debugForward = await debugPod.portForward(9229, 9229);
  console.log(`   Debug port forwarded: localhost:${debugForward.localPort}`);
  
  // 2. Forward application port
  const appForward = await debugPod.portForwardDynamic(3000);
  console.log(`   App port forwarded: localhost:${appForward.localPort}`);
  
  // 3. Stream logs while debugging
  console.log('\nStreaming debug logs:');
  const logStream = await debugPod.follow(
    (line) => {
      if (line.includes('DEBUG') || line.includes('ERROR')) {
        console.log(`   🔍 ${line.trim()}`);
      }
    },
    { container: 'app' }
  );
  
  console.log('\nDebug session ready!');
  console.log(`   Chrome DevTools: chrome://inspect -> localhost:${debugForward.localPort}`);
  console.log(`   Application: http://localhost:${appForward.localPort}`);
  console.log('\nPress Ctrl+C to end session...');
  
  // Keep session alive
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Cleanup
  console.log('\nCleaning up debug session...');
  logStream.stop();
  await debugForward.close();
  await appForward.close();
  console.log('Debug session ended.');
}

// Main execution
(async () => {
  try {
    await portForwardingExample();
    await streamingLogsExample();
    await enhancedPodOperationsExample();
    await monitoringExample();
    await debuggingExample();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();