/**
 * Enhanced Event System Examples
 * 
 * Demonstrates the flexible event system with filtering and wildcard support
 */

import { $ } from '@xec-sh/core';

// 1. Basic event listening
console.log('=== Basic Event Listening ===\n');

// Listen to specific events
$.on('command:start', (event) => {
  console.log(`Command started: ${event.command}`);
});

$.on('command:complete', (event) => {
  console.log(`Command completed: ${event.command} (exit code: ${event.exitCode})`);
});

// Execute a command to trigger events
await $`echo "Hello, events!"`;

// 2. Event filtering by adapter
console.log('\n=== Event Filtering ===\n');

// Listen only to SSH events
$.onFiltered('command:start', { adapter: 'ssh' }, (event) => {
  console.log(`SSH command: ${event.command} on ${event.adapter}`);
});

// Listen to multiple adapters
$.onFiltered('command:complete', { adapter: ['ssh', 'docker'] }, (event) => {
  console.log(`Remote command completed: ${event.command}`);
});

// Execute commands on different adapters
await $`echo "Local command"`;
await $.ssh({ host: 'example.com', username: 'user' })`echo "SSH command"`;
await $.docker({ container: 'myapp' })`echo "Docker command"`;

// 3. Wildcard event patterns
console.log('\n=== Wildcard Patterns ===\n');

// Listen to all command events
$.onFiltered('command:*', (event) => {
  console.log(`Command event: ${event.timestamp}`);
});

// Listen to all SSH events
$.onFiltered('ssh:*', (event) => {
  console.log(`SSH event: ${event.timestamp}`);
});

// Listen to all connection events
$.onFiltered('connection:*', (event) => {
  console.log(`Connection ${event.type}: ${event.host || 'local'}`);
});

// 4. Generic connection events
console.log('\n=== Connection Events ===\n');

// Listen to all connection events regardless of adapter
$.on('connection:open', (event) => {
  console.log(`Connection opened: ${event.type} to ${event.host || 'local'}`);
});

$.on('connection:close', (event) => {
  console.log(`Connection closed: ${event.type} (reason: ${event.reason})`);
});

// 5. Retry events
console.log('\n=== Retry Events ===\n');

$.on('retry:attempt', (event) => {
  console.log(`Retry attempt ${event.attempt}/${event.maxAttempts}: ${event.error}`);
});

$.on('retry:success', (event) => {
  console.log(`Retry succeeded after ${event.attempts} attempts`);
});

$.on('retry:failed', (event) => {
  console.log(`Retry failed after ${event.attempts} attempts: ${event.lastError}`);
});

// Trigger retry events with a command that might fail
await $`test -f /tmp/random-${Date.now()}.txt`.retry({
  maxRetries: 3,
  initialDelay: 100
}).nothrow();

// 6. Cache events
console.log('\n=== Cache Events ===\n');

$.on('cache:hit', (event) => {
  console.log(`Cache hit: ${event.key} (TTL: ${event.ttl}ms)`);
});

$.on('cache:miss', (event) => {
  console.log(`Cache miss: ${event.key}`);
});

$.on('cache:set', (event) => {
  console.log(`Cache set: ${event.key} (size: ${event.size} bytes)`);
});

// Execute cached commands
const cacheOptions = { key: 'date-command', ttl: 5000 };
await $`date`.cache(cacheOptions); // Cache miss + set
await $`date`.cache(cacheOptions); // Cache hit
await new Promise(resolve => setTimeout(resolve, 6000));
await $`date`.cache(cacheOptions); // Cache miss (expired)

// 7. Tunnel events
console.log('\n=== Tunnel Events ===\n');

$.on('tunnel:created', (event) => {
  console.log(`Tunnel created: localhost:${event.localPort} -> ${event.remoteHost}:${event.remotePort}`);
});

// Listen to SSH-specific tunnel events with filtering
$.onFiltered('ssh:tunnel-*', { adapter: 'ssh' }, (event) => {
  console.log(`SSH tunnel event: ${JSON.stringify(event)}`);
});

// 8. Complex filtering
console.log('\n=== Complex Event Filtering ===\n');

// Filter by multiple criteria
$.onFiltered('command:complete', { 
  adapter: 'ssh',
  exitCode: 0
}, (event) => {
  console.log(`Successful SSH command: ${event.command}`);
});

// Custom filter properties
$.onFiltered('connection:open', {
  host: 'production.example.com'
}, (event) => {
  console.log(`Connected to production server!`);
});

// 9. Event statistics
console.log('\n=== Event Statistics ===\n');

const eventCounts: Record<string, number> = {};

// Count all events
$.onFiltered('*', (event) => {
  const eventType = (event as any).type || 'unknown';
  eventCounts[eventType] = (eventCounts[eventType] || 0) + 1;
});

// Execute various commands to generate events
await $`echo "test"`;
await $`ls -la`;
await $`date`;

console.log('Event counts:', eventCounts);

// 10. Removing event listeners
console.log('\n=== Event Cleanup ===\n');

const handler = (event: any) => {
  console.log('This handler will be removed');
};

$.on('command:start', handler);
await $`echo "With handler"`;

$.off('command:start', handler);
await $`echo "Without handler"`;

// Remove filtered listeners
const filteredHandler = (event: any) => {
  console.log('Filtered handler');
};

$.onFiltered('ssh:*', { adapter: 'ssh' }, filteredHandler);
$.offFiltered('ssh:*', filteredHandler);

// 11. Real-world monitoring example
console.log('\n=== Real-world Monitoring ===\n');

// Monitor all errors across all adapters
$.onFiltered('*:error', (event) => {
  console.error(`Error in ${event.adapter}:`, event);
  // Could send to monitoring service here
});

// Monitor performance
const commandTimes = new Map<string, number>();

$.on('command:start', (event) => {
  commandTimes.set(event.command, Date.now());
});

$.on('command:complete', (event) => {
  const startTime = commandTimes.get(event.command);
  if (startTime) {
    const duration = Date.now() - startTime;
    console.log(`Performance: ${event.command} took ${duration}ms`);
    commandTimes.delete(event.command);
  }
});

// Monitor connection health
$.onFiltered('connection:*', (event) => {
  if (event.type === 'ssh' && event.host) {
    console.log(`SSH connection ${event} to ${event.host}`);
  }
});

// Monitor retry patterns
let retryCount = 0;
$.on('retry:attempt', () => retryCount++);

setInterval(() => {
  if (retryCount > 0) {
    console.log(`Retry rate: ${retryCount} retries in the last minute`);
    retryCount = 0;
  }
}, 60000);