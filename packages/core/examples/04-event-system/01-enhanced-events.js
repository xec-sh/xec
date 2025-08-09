import { $ } from '@xec-sh/core';
console.log('=== Basic Event Listening ===\n');
$.on('command:start', (event) => {
    console.log(`Command started: ${event.command}`);
});
$.on('command:complete', (event) => {
    console.log(`Command completed: ${event.command} (exit code: ${event.exitCode})`);
});
await $ `echo "Hello, events!"`;
console.log('\n=== Event Filtering ===\n');
$.onFiltered('command:start', { adapter: 'ssh' }, (event) => {
    console.log(`SSH command: ${event.command} on ${event.adapter}`);
});
$.onFiltered('command:complete', { adapter: ['ssh', 'docker'] }, (event) => {
    console.log(`Remote command completed: ${event.command}`);
});
await $ `echo "Local command"`;
await $.ssh({ host: 'example.com', username: 'user' }) `echo "SSH command"`;
await $.docker({ container: 'myapp' }) `echo "Docker command"`;
console.log('\n=== Wildcard Patterns ===\n');
$.onFiltered('command:*', (event) => {
    console.log(`Command event: ${event.timestamp}`);
});
$.onFiltered('ssh:*', (event) => {
    console.log(`SSH event: ${event.timestamp}`);
});
$.onFiltered('connection:*', (event) => {
    console.log(`Connection ${event.type}: ${event.host || 'local'}`);
});
console.log('\n=== Connection Events ===\n');
$.on('connection:open', (event) => {
    console.log(`Connection opened: ${event.type} to ${event.host || 'local'}`);
});
$.on('connection:close', (event) => {
    console.log(`Connection closed: ${event.type} (reason: ${event.reason})`);
});
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
await $ `test -f /tmp/random-${Date.now()}.txt`.retry({
    maxRetries: 3,
    initialDelay: 100
}).nothrow();
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
const cacheOptions = { key: 'date-command', ttl: 5000 };
await $ `date`.cache(cacheOptions);
await $ `date`.cache(cacheOptions);
await new Promise(resolve => setTimeout(resolve, 6000));
await $ `date`.cache(cacheOptions);
console.log('\n=== Tunnel Events ===\n');
$.on('tunnel:created', (event) => {
    console.log(`Tunnel created: localhost:${event.localPort} -> ${event.remoteHost}:${event.remotePort}`);
});
$.onFiltered('ssh:tunnel-*', { adapter: 'ssh' }, (event) => {
    console.log(`SSH tunnel event: ${JSON.stringify(event)}`);
});
console.log('\n=== Complex Event Filtering ===\n');
$.onFiltered('command:complete', {
    adapter: 'ssh',
    exitCode: 0
}, (event) => {
    console.log(`Successful SSH command: ${event.command}`);
});
$.onFiltered('connection:open', {
    host: 'production.example.com'
}, (event) => {
    console.log(`Connected to production server!`);
});
console.log('\n=== Event Statistics ===\n');
const eventCounts = {};
$.onFiltered('*', (event) => {
    const eventType = event.type || 'unknown';
    eventCounts[eventType] = (eventCounts[eventType] || 0) + 1;
});
await $ `echo "test"`;
await $ `ls -la`;
await $ `date`;
console.log('Event counts:', eventCounts);
console.log('\n=== Event Cleanup ===\n');
const handler = (event) => {
    console.log('This handler will be removed');
};
$.on('command:start', handler);
await $ `echo "With handler"`;
$.off('command:start', handler);
await $ `echo "Without handler"`;
const filteredHandler = (event) => {
    console.log('Filtered handler');
};
$.onFiltered('ssh:*', { adapter: 'ssh' }, filteredHandler);
$.offFiltered('ssh:*', filteredHandler);
console.log('\n=== Real-world Monitoring ===\n');
$.onFiltered('*:error', (event) => {
    console.error(`Error in ${event.adapter}:`, event);
});
const commandTimes = new Map();
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
$.onFiltered('connection:*', (event) => {
    if (event.type === 'ssh' && event.host) {
        console.log(`SSH connection ${event} to ${event.host}`);
    }
});
let retryCount = 0;
$.on('retry:attempt', () => retryCount++);
setInterval(() => {
    if (retryCount > 0) {
        console.log(`Retry rate: ${retryCount} retries in the last minute`);
        retryCount = 0;
    }
}, 60000);
//# sourceMappingURL=01-enhanced-events.js.map