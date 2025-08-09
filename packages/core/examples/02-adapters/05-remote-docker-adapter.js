import { $, CommandError, ConnectionError } from '@xec-sh/core';
const $remoteDocker = $.remoteDocker({
    ssh: {
        host: 'docker-host.example.com',
        username: 'user',
        privateKey: '/path/to/id_rsa'
    },
    docker: {
        container: 'my-alpine-container'
    }
});
await $remoteDocker `echo "Running in Docker on remote host"`;
await $remoteDocker `hostname`;
const $existingRemote = $.remoteDocker({
    ssh: {
        host: 'docker-host.example.com',
        username: 'user',
        privateKey: '/path/to/id_rsa'
    },
    docker: {
        container: 'my-app',
        user: 'appuser'
    }
});
await $existingRemote `ps aux`;
await $existingRemote `cat /var/log/app.log`;
const $withWorkdir = $.remoteDocker({
    ssh: {
        host: 'docker-host.example.com',
        username: 'user',
        privateKey: '/path/to/id_rsa'
    },
    docker: {
        container: 'node-app',
        workdir: '/app'
    }
});
await $withWorkdir `pwd`;
await $withWorkdir `ls -la`;
const $sudoDocker = $.remoteDocker({
    ssh: {
        host: 'docker-host.example.com',
        username: 'user',
        privateKey: '/path/to/id_rsa',
        sudo: {
            enabled: true
        }
    },
    docker: {
        container: 'ubuntu-container'
    }
});
await $sudoDocker `whoami`;
const $customPort = $.remoteDocker({
    ssh: {
        host: 'docker-host.example.com',
        port: 2222,
        username: 'user',
        privateKey: '/path/to/id_rsa'
    },
    docker: {
        container: 'redis-container'
    }
});
await $customPort `redis-cli ping`;
const $complex = $.remoteDocker({
    ssh: {
        host: 'docker-host.example.com',
        username: 'deploy',
        privateKey: process.env['DEPLOY_KEY'] || '/path/to/deploy.key'
    },
    docker: {
        container: 'myapp-production',
        workdir: '/app'
    }
})
    .env({
    NODE_ENV: 'production',
    API_URL: 'https://api.example.com'
});
await $complex `echo "Environment: $NODE_ENV"`;
await $complex `npm start`;
const $interactive = $.remoteDocker({
    ssh: {
        host: 'docker-host.example.com',
        username: 'user',
        privateKey: '/path/to/id_rsa'
    },
    docker: {
        container: 'app-container',
        tty: true
    }
});
await $interactive `top -b -n 1`;
await $interactive `ls --color=auto`;
await $ `scp /local/data.csv user@docker-host.example.com:/tmp/data.csv`;
const $sshForCopy = $.ssh({
    host: 'docker-host.example.com',
    username: 'user',
    privateKey: '/path/to/id_rsa'
});
await $sshForCopy `docker cp /tmp/data.csv my-container:/container/data.csv`;
await $remoteDocker `python process_data.py /container/data.csv`;
await $sshForCopy `docker cp my-container:/container/results.csv /tmp/results.csv`;
await $ `scp user@docker-host.example.com:/tmp/results.csv /local/results.csv`;
const hosts = ['host1.example.com', 'host2.example.com', 'host3.example.com'];
const deployTasks = hosts.map(host => {
    const $host = $.remoteDocker({
        ssh: {
            host,
            username: 'deploy',
            privateKey: '/path/to/deploy.key'
        },
        docker: {
            container: 'myapp-container'
        }
    });
    return $host `./deploy.sh`.nothrow();
});
const deployResults = await Promise.all(deployTasks);
deployResults.forEach((result, i) => {
    console.log(`Deploy on ${hosts[i]}: ${result.ok ? 'SUCCESS' : 'FAILED'}`);
});
const $sshForAdmin = $.ssh({
    host: 'docker-host.example.com',
    username: 'admin',
    privateKey: '/path/to/admin.key',
    sudo: {
        enabled: true
    }
});
await $sshForAdmin `docker container prune -f`;
await $sshForAdmin `docker image prune -f`;
const $healthCheck = $.remoteDocker({
    ssh: {
        host: 'docker-host.example.com',
        username: 'monitor',
        privateKey: '/path/to/monitor.key'
    },
    docker: {
        container: 'web-app'
    }
});
const health = await $healthCheck `curl -f http://localhost/health || exit 1`.nothrow();
if (!health.ok) {
    console.log('Application unavailable!');
    console.log('Error:', health.stderr);
}
try {
    const $fail = $.remoteDocker({
        ssh: {
            host: 'unreachable.example.com',
            username: 'user',
            privateKey: '/path/to/key'
        },
        docker: {
            container: 'test-container'
        }
    }).timeout(5000);
    await $fail `echo "test"`;
}
catch (error) {
    if (error instanceof ConnectionError) {
        console.log('SSH connection error:', error.message);
    }
    else if (error instanceof CommandError) {
        console.log('Command execution error:', error.message);
        console.log('Exit code:', error.exitCode);
    }
    else {
        console.log('Unknown error:', error instanceof Error ? error.message : String(error));
    }
}
//# sourceMappingURL=05-remote-docker-adapter.js.map