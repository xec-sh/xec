#!/usr/bin/env tsx
import { $ } from '@xec-sh/core';
async function main() {
    console.log('=== SSH Tunnel Examples ===\n');
    console.log('1. Creating SSH tunnel for remote database access...');
    const bastion = $.ssh({
        host: process.env['SSH_HOST'] || 'bastion.example.com',
        username: process.env['SSH_USER'] || 'user',
        privateKey: process.env['SSH_KEY'] || '~/.ssh/id_rsa'
    });
    try {
        const tunnel = await bastion.tunnel({
            localPort: 3306,
            remoteHost: 'database.internal',
            remotePort: 3306
        });
        console.log(`✅ Tunnel created on localhost:${tunnel.localPort} -> ${tunnel.remoteHost}:${tunnel.remotePort}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await tunnel.close();
        console.log('✅ Tunnel closed\n');
    }
    catch (error) {
        console.error('❌ Failed to create tunnel:', error);
    }
    console.log('2. Creating tunnel with dynamic port allocation...');
    try {
        const dynamicTunnel = await bastion.tunnel({
            localPort: 0,
            remoteHost: 'api.internal',
            remotePort: 8080
        });
        console.log(`✅ Dynamic tunnel created on localhost:${dynamicTunnel.localPort} -> ${dynamicTunnel.remoteHost}:${dynamicTunnel.remotePort}`);
        console.log(`   You can now access the API at: http://localhost:${dynamicTunnel.localPort}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await dynamicTunnel.close();
        console.log('✅ Dynamic tunnel closed\n');
    }
    catch (error) {
        console.error('❌ Failed to create dynamic tunnel:', error);
    }
    console.log('3. Creating multiple tunnels...');
    try {
        const tunnel1 = await bastion.tunnel({
            localPort: 5432,
            remoteHost: 'postgres.internal',
            remotePort: 5432
        });
        const tunnel2 = await bastion.tunnel({
            localPort: 6379,
            remoteHost: 'redis.internal',
            remotePort: 6379
        });
        const tunnel3 = await bastion.tunnel({
            localPort: 9200,
            remoteHost: 'elasticsearch.internal',
            remotePort: 9200
        });
        console.log('✅ Multiple tunnels created:');
        console.log(`   - PostgreSQL: localhost:${tunnel1.localPort}`);
        console.log(`   - Redis: localhost:${tunnel2.localPort}`);
        console.log(`   - Elasticsearch: localhost:${tunnel3.localPort}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await Promise.all([
            tunnel1.close(),
            tunnel2.close(),
            tunnel3.close()
        ]);
        console.log('✅ All tunnels closed\n');
    }
    catch (error) {
        console.error('❌ Failed to create multiple tunnels:', error);
    }
    console.log('4. Creating long-running tunnel...');
    try {
        const longRunningTunnel = await bastion.tunnel({
            localPort: 8000,
            remoteHost: 'webapp.internal',
            remotePort: 80
        });
        console.log(`✅ Long-running tunnel created on localhost:${longRunningTunnel.localPort}`);
        console.log('   Tunnel is ready for connections...');
        console.log(`   You can access the webapp at: http://localhost:${longRunningTunnel.localPort}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        await longRunningTunnel.close();
        console.log('✅ Long-running tunnel closed\n');
    }
    catch (error) {
        console.error('❌ Failed to create long-running tunnel:', error);
    }
    console.log('5. Executing commands through bastion host...');
    try {
        const result = await bastion `hostname && echo "Connected via SSH"`;
        console.log('✅ Command output:', result.stdout);
        const connectivity = await bastion `nc -zv database.internal 3306 2>&1`;
        console.log('✅ Database connectivity:', connectivity.stdout);
    }
    catch (error) {
        console.error('❌ Failed to execute commands:', error);
    }
    console.log('\n6. Accessing internal services through tunnel...');
    try {
        const apiTunnel = await bastion.tunnel({
            localPort: 0,
            remoteHost: 'api.internal',
            remotePort: 443
        });
        console.log(`✅ API tunnel created on localhost:${apiTunnel.localPort}`);
        console.log(`   API is accessible at: https://localhost:${apiTunnel.localPort}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await apiTunnel.close();
        console.log('✅ API tunnel closed');
    }
    catch (error) {
        console.error('❌ Failed to access internal services:', error);
    }
    console.log('\n=== SSH Tunnel Examples Complete ===');
}
main().catch(console.error);
//# sourceMappingURL=10-ssh-tunnels.js.map