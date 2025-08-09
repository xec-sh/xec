import { $, CommandError } from '@xec-sh/core';
const $docker = $.docker({ container: 'my-app-container' });
await $docker `echo "Hello from Docker!"`;
await $docker `cat /etc/os-release`;
const $asUser = $.docker({
    container: 'my-running-container',
    user: 'www-data'
});
await $asUser `whoami`;
await $asUser `id`;
const $withWorkdir = $.docker({
    container: 'node-app',
    workdir: '/app'
});
await $withWorkdir `pwd`;
await $withWorkdir `ls -la`;
await $withWorkdir `npm install`;
const $interactive = $.docker({
    container: 'my-app',
    tty: true
});
await $interactive `ls --color=auto`;
await $interactive `top -b -n 1`;
const $dockerConfigured = $.docker({
    container: 'my-app',
    workdir: '/app'
})
    .env({ NODE_ENV: 'production' })
    .timeout(30000);
await $dockerConfigured `npm run build`;
await $dockerConfigured `npm test`;
const containers = ['app-1', 'app-2', 'app-3'];
for (const container of containers) {
    const $container = $.docker({ container });
    await $container `service nginx reload`;
}
const $app = $.docker({ container: 'my-app' });
const healthCheck = await $app `curl -f http://localhost:3000/health || exit 1`.nothrow();
if (healthCheck.ok) {
    console.log('Application is running normally');
}
else {
    console.log('Application is not responding');
}
const $logger = $.docker({
    container: 'logger-app',
    workdir: '/var/log/app'
});
await $logger `find . -name "*.log" -mtime +7 -delete`;
await $logger `du -sh .`;
await $ `docker run -d --name test-db postgres:14`;
await $ `sleep 5`;
const $testDb = $.docker({ container: 'test-db', user: 'postgres' });
await $testDb `psql -c "CREATE DATABASE testdb;"`;
await $ `docker rm -f test-db`;
const $build = $.docker({
    container: 'build-env',
    workdir: '/workspace'
});
const steps = [
    'Installing dependencies',
    'Linting',
    'Tests',
    'Build'
];
for (const step of steps) {
    console.log(`\n=== ${step} ===`);
    switch (step) {
        case 'Installing dependencies':
            await $build `npm ci`;
            break;
        case 'Linting':
            await $build `npm run lint`;
            break;
        case 'Tests':
            await $build `npm test`;
            break;
        case 'Build':
            await $build `npm run build`;
            break;
    }
}
try {
    const $badContainer = $.docker({ container: 'nonexistent-container' });
    await $badContainer `echo "test"`;
}
catch (error) {
    if (error instanceof CommandError) {
        console.log('Docker error:');
        console.log('Exit code:', error.exitCode);
        console.log('Message:', error.stderr);
    }
}
//# sourceMappingURL=03-docker-adapter.js.map