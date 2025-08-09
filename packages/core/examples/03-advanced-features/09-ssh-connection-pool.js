import { $ } from '@xec-sh/core';
const sshConfig = {
    host: 'example.com',
    username: 'user',
    privateKey: '/path/to/your/key'
};
console.log('=== SSH Connection Pool Example ===\n');
if (sshConfig.host === 'example.com') {
    console.log('⚠️  Please update the SSH configuration with your server details.');
    console.log('   This example demonstrates connection pooling features.\n');
    console.log('Connection Pool Features:');
    console.log('1. Connection reuse - subsequent commands use the same connection');
    console.log('2. Keep-alive - connections stay active with periodic heartbeats');
    console.log('3. Metrics - track connection usage and performance');
    console.log('4. Auto-reconnect - automatically reconnect dropped connections');
    process.exit(0);
}
console.log('1. Basic connection pooling:');
console.time('First SSH command');
const result1 = await $.ssh(sshConfig) `echo "First command"`;
console.timeEnd('First SSH command');
console.time('Second SSH command (reused connection)');
const result2 = await $.ssh(sshConfig) `echo "Second command"`;
console.timeEnd('Second SSH command (reused connection)');
console.log('Connection was reused for better performance');
const customPoolConfig = {
    ...sshConfig,
    connectionPool: {
        enabled: true,
        maxConnections: 5,
        idleTimeout: 600000,
        keepAlive: true,
        keepAliveInterval: 30000,
        autoReconnect: true,
        maxReconnectAttempts: 3,
        reconnectDelay: 1000
    }
};
const sshEngine = $.ssh(customPoolConfig);
console.log('\n2. Multiple commands with connection reuse:');
const commands = [
    'hostname',
    'uptime',
    'date',
    'pwd',
    'whoami'
];
console.time('Execute 5 commands');
const results = await Promise.all(commands.map(cmd => sshEngine `${cmd}`));
console.timeEnd('Execute 5 commands');
results.forEach((result, i) => {
    console.log(`${commands[i]}: ${result.stdout.trim()}`);
});
console.log('\n3. Connection pool metrics:');
$.on('ssh:pool-metrics', (event) => {
    console.log('Pool Metrics:', {
        active: event.metrics.activeConnections,
        idle: event.metrics.idleConnections,
        total: event.metrics.totalConnections,
        created: event.metrics.connectionsCreated,
        reused: event.metrics.reuseCount
    });
});
await sshEngine `echo "Triggering metrics update"`;
console.log('\n4. Keep-alive mechanism:');
console.log('Connections are kept alive with periodic heartbeats...');
await sshEngine `echo "Command 1"`;
console.log('Waiting 5 seconds...');
await new Promise(resolve => setTimeout(resolve, 5000));
console.time('Command after wait (still connected)');
await sshEngine `echo "Command 2 - connection still alive"`;
console.timeEnd('Command after wait (still connected)');
console.log('\n5. Connection lifecycle events:');
$.on('ssh:connect', (event) => {
    console.log(`✓ Connected to ${event.host}:${event.port}`);
});
$.on('ssh:disconnect', (event) => {
    console.log(`✗ Disconnected from ${event.host}: ${event.reason}`);
});
$.on('ssh:reconnect', (event) => {
    console.log(`↻ Reconnected to ${event.host} (attempt ${event.attempts})`);
});
$.on('ssh:pool-cleanup', (event) => {
    console.log(`🧹 Pool cleanup: removed ${event.cleaned} idle connections`);
});
console.log('\n6. Parallel operations with connection pooling:');
const parallelCommands = Array(10).fill(null).map((_, i) => sshEngine `echo "Parallel command ${i}" && sleep 0.5`);
console.time('10 parallel SSH commands');
const parallelResults = await Promise.all(parallelCommands);
console.timeEnd('10 parallel SSH commands');
console.log(`Completed ${parallelResults.length} parallel commands efficiently`);
console.log('\n7. Connection pooling with multiple hosts:');
const hosts = [
    { host: 'server1.example.com', username: 'user', privateKey: '/path/to/key' },
    { host: 'server2.example.com', username: 'user', privateKey: '/path/to/key' },
    { host: 'server3.example.com', username: 'user', privateKey: '/path/to/key' }
];
console.log('Each unique host maintains its own pooled connection');
console.log('Connection key format: user@host:port');
console.log('\n8. Auto-reconnect on connection failure:');
try {
    const longRunning = await sshEngine `
    echo "Starting long operation..." &&
    sleep 60 &&
    echo "Operation completed"
  `.timeout(70000);
    console.log('Long operation completed successfully');
}
catch (error) {
    console.log('Operation failed, but connection will auto-reconnect for next command');
}
console.log('\n9. Graceful cleanup:');
const sshAdapter = $.ssh(sshConfig);
if ('getConnectionPoolMetrics' in sshAdapter) {
    const metrics = sshAdapter.getConnectionPoolMetrics();
    console.log('Final pool metrics:', metrics);
}
await $.dispose();
console.log('All SSH connections closed gracefully');
console.log('\n10. SSH Connection Pool Best Practices:');
console.log('✓ Use connection pooling for multiple commands to the same host');
console.log('✓ Configure appropriate idle timeouts based on usage patterns');
console.log('✓ Enable keep-alive for long-lived connections');
console.log('✓ Monitor pool metrics to optimize settings');
console.log('✓ Set reasonable max connection limits');
console.log('✓ Enable auto-reconnect for resilient operations');
console.log('✓ Dispose connections when done to free resources');
console.log('\n11. Performance Benefits:');
console.log('Without pooling: ~500-2000ms per SSH command (new connection each time)');
console.log('With pooling: ~50-200ms per SSH command (reused connection)');
console.log('Improvement: 10-20x faster for subsequent commands!');
console.log('\n=== SSH Connection Pool Example Complete ===');
//# sourceMappingURL=09-ssh-connection-pool.js.map