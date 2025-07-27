#!/usr/bin/env tsx
/**
 * Docker Streaming Logs Example
 * 
 * This example demonstrates real-time log streaming from Docker containers,
 * including following logs, filtering, and handling multiple containers.
 */

import { $ } from '@xec-sh/core';

async function main() {
  console.log('=== Docker Streaming Logs Examples ===\n');

  // Example 1: Basic log streaming
  console.log('1. Basic log streaming from a container...');
  try {
    const counter = await $.docker({
      image: 'alpine',
      name: 'xec-counter-demo',
      command: 'sh -c "for i in $(seq 1 20); do echo Counter: $i; sleep 0.5; done"'
    }).start();

    console.log(`✅ Container '${counter.name}' started`);
    console.log('   Streaming logs in real-time:\n');

    // Stream logs as they are generated
    await counter.streamLogs((data) => {
      process.stdout.write(`     📊 ${data}`);
    });

    await counter.remove();
    console.log('\n✅ Container removed\n');
  } catch (error) {
    console.error('❌ Failed basic streaming:', error);
  }

  // Example 2: Following logs with timestamps
  console.log('2. Following logs with timestamps...');
  try {
    const timestamped = await $.docker({
      image: 'alpine',
      name: 'xec-timestamp-demo',
      command: 'sh -c "while true; do echo [$(date +%H:%M:%S)] System is running...; sleep 2; done"'
    }).start();

    console.log(`✅ Container '${timestamped.name}' started`);
    console.log('   Following logs with timestamps (press Ctrl+C to stop):\n');

    // Set up a timeout to stop following after 10 seconds
    const followPromise = timestamped.follow((data) => {
      process.stdout.write(`     ${data}`);
    }, { timestamps: true });

    // Stop after 10 seconds
    setTimeout(async () => {
      await timestamped.stop();
      console.log('\n\n✅ Container stopped');
    }, 10000);

    try {
      await followPromise;
    } catch (error) {
      // Expected when container stops
    }

    await timestamped.remove();
    console.log('✅ Container removed\n');
  } catch (error) {
    console.error('❌ Failed timestamp example:', error);
  }

  // Example 3: Filtering logs by stream (stdout vs stderr)
  console.log('3. Filtering logs by stream type...');
  try {
    const mixed = await $.docker({
      image: 'alpine',
      name: 'xec-mixed-demo',
      command: 'sh -c "for i in $(seq 1 5); do echo stdout: message $i; echo stderr: error $i >&2; sleep 1; done"'
    }).start();

    console.log(`✅ Container '${mixed.name}' started`);
    
    // Get only stdout
    console.log('\n   📤 STDOUT only:');
    const stdout = await mixed.logs({ stdout: true, stderr: false });
    console.log(stdout);

    // Get only stderr
    console.log('   📥 STDERR only:');
    const stderr = await mixed.logs({ stdout: false, stderr: true });
    console.log(stderr);

    await mixed.remove();
    console.log('✅ Container removed\n');
  } catch (error) {
    console.error('❌ Failed stream filtering:', error);
  }

  // Example 4: Tail logs (last N lines)
  console.log('4. Tailing logs from a long-running container...');
  try {
    const longRunner = await $.docker({
      image: 'alpine',
      name: 'xec-tail-demo',
      command: 'sh -c "for i in $(seq 1 100); do echo Log line $i; done; sleep 3600"'
    }).start();

    console.log(`✅ Container '${longRunner.name}' started`);
    
    // Wait for logs to be generated
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get last 10 lines
    console.log('\n   Last 10 lines:');
    const tail10 = await longRunner.logs({ tail: 10 });
    console.log(tail10);

    // Get logs since specific time
    console.log('\n   Logs from last 1 second:');
    const recent = await longRunner.logs({ since: '1s' });
    console.log(recent);

    await longRunner.stop();
    await longRunner.remove();
    console.log('✅ Container removed\n');
  } catch (error) {
    console.error('❌ Failed tail example:', error);
  }

  // Example 5: Multiple container log aggregation
  console.log('5. Aggregating logs from multiple containers...');
  try {
    // Start multiple containers
    const containers = await Promise.all([
      $.docker({
        image: 'alpine',
        name: 'xec-web-demo',
        command: 'sh -c "while true; do echo [WEB] Request received; sleep 3; done"'
      }).start(),
      $.docker({
        image: 'alpine', 
        name: 'xec-api-demo',
        command: 'sh -c "while true; do echo [API] Processing request; sleep 2; done"'
      }).start(),
      $.docker({
        image: 'alpine',
        name: 'xec-db-demo',
        command: 'sh -c "while true; do echo [DB] Query executed; sleep 4; done"'
      }).start()
    ]);

    console.log('✅ Multiple containers started');
    console.log('   Aggregating logs from all containers:\n');

    // Stream logs from all containers with prefixes
    const streams = containers.map((container, index) => {
      const prefix = ['WEB', 'API', 'DB'][index];
      return container.streamLogs((data) => {
        // Add color codes for different services
        const colors = ['\x1b[34m', '\x1b[32m', '\x1b[33m']; // blue, green, yellow
        const reset = '\x1b[0m';
        process.stdout.write(`     ${colors[index]}[${prefix}]${reset} ${data}`);
      }, { follow: true });
    });

    // Let them run for 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Stop all containers
    console.log('\n\n   Stopping all containers...');
    await Promise.all(containers.map(c => c.stop()));
    await Promise.all(containers.map(c => c.remove()));
    console.log('✅ All containers removed\n');
  } catch (error) {
    console.error('❌ Failed multi-container example:', error);
  }

  // Example 6: Log processing and analysis
  console.log('6. Processing logs for analysis...');
  try {
    const app = await $.docker({
      image: 'alpine',
      name: 'xec-analysis-demo',
      command: `sh -c "
        echo 'INFO: Application starting...';
        echo 'INFO: Database connected';
        echo 'WARN: Cache miss for key user:123';
        echo 'ERROR: Failed to connect to external API';
        echo 'INFO: Request processed in 245ms';
        echo 'WARN: Memory usage above 80%';
        echo 'INFO: Application ready';
        sleep 5
      "`
    }).start();

    console.log(`✅ Container '${app.name}' started`);
    
    // Collect and analyze logs
    const logs = await app.logs();
    const lines = logs.trim().split('\n');
    
    // Count log levels
    const counts = {
      INFO: 0,
      WARN: 0,
      ERROR: 0
    };

    lines.forEach(line => {
      if (line.includes('INFO:')) counts.INFO++;
      else if (line.includes('WARN:')) counts.WARN++;
      else if (line.includes('ERROR:')) counts.ERROR++;
    });

    console.log('\n   Log Analysis:');
    console.log(`     ℹ️  INFO messages: ${counts.INFO}`);
    console.log(`     ⚠️  WARN messages: ${counts.WARN}`);
    console.log(`     ❌ ERROR messages: ${counts.ERROR}`);

    // Extract specific information
    const errorLines = lines.filter(line => line.includes('ERROR:'));
    if (errorLines.length > 0) {
      console.log('\n   Errors found:');
      errorLines.forEach(error => console.log(`     🚨 ${error}`));
    }

    await app.remove();
    console.log('\n✅ Container removed\n');
  } catch (error) {
    console.error('❌ Failed analysis example:', error);
  }

  // Example 7: Custom log formatting
  console.log('7. Custom log formatting and filtering...');
  try {
    const json = await $.docker({
      image: 'alpine',
      name: 'xec-json-demo',
      command: `sh -c "
        echo '{\"time\":\"2024-01-01T10:00:00Z\",\"level\":\"info\",\"msg\":\"Server started\"}';
        echo '{\"time\":\"2024-01-01T10:00:01Z\",\"level\":\"debug\",\"msg\":\"Connection accepted\"}';
        echo '{\"time\":\"2024-01-01T10:00:02Z\",\"level\":\"error\",\"msg\":\"Database timeout\"}';
        echo '{\"time\":\"2024-01-01T10:00:03Z\",\"level\":\"info\",\"msg\":\"Request completed\"}';
        sleep 2
      "`
    }).start();

    console.log(`✅ Container '${json.name}' started`);
    console.log('   Parsing JSON logs:\n');

    // Stream and parse JSON logs
    await json.streamLogs((data) => {
      try {
        const log = JSON.parse(data.trim());
        const levelEmoji = {
          'info': 'ℹ️ ',
          'debug': '🔍',
          'error': '❌'
        };
        console.log(`     ${levelEmoji[log.level] || '📝'} [${log.time}] ${log.msg}`);
      } catch (e) {
        // Not JSON, print as-is
        if (data.trim()) {
          console.log(`     📝 ${data}`);
        }
      }
    });

    await json.remove();
    console.log('\n✅ Container removed\n');
  } catch (error) {
    console.error('❌ Failed JSON formatting:', error);
  }

  console.log('=== Docker Streaming Logs Examples Complete ===');
}

// Run the examples
main().catch(console.error);