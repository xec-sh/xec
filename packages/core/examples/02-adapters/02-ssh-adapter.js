import { $, CommandError, ConnectionError } from '@xec-sh/core';
const $ssh = $.ssh({
    host: 'example.com',
    username: 'user',
    privateKey: '/path/to/id_rsa'
});
await $ssh `whoami`;
await $ssh `hostname`;
await $ssh `pwd`;
const $sshPassword = $.ssh({
    host: 'example.com',
    username: 'user',
    password: 'secret'
});
await $sshPassword `ls -la`;
const $sshCustomPort = $.ssh({
    host: 'example.com',
    port: 2222,
    username: 'user',
    privateKey: process.env['SSH_KEY_PATH']
});
await $sshCustomPort `echo "Connected on port 2222"`;
const $sshEnvKey = $.ssh({
    host: 'example.com',
    username: 'user',
    privateKey: process.env['SSH_KEY_PATH'] || '/path/to/id_rsa'
});
await $sshEnvKey `uname -a`;
const $sshSudo = $.ssh({
    host: 'example.com',
    username: 'user',
    privateKey: '/path/to/id_rsa',
    sudo: {
        enabled: true
    }
});
await $sshSudo `apt update`;
const $sshSudoPassword = $.ssh({
    host: 'example.com',
    username: 'user',
    privateKey: '/path/to/id_rsa',
    sudo: {
        enabled: true,
        password: 'sudo-password'
    }
});
await $sshSudoPassword `systemctl status nginx`;
await $ `scp /local/file.txt user@example.com:/remote/file.txt`;
await $ `scp user@example.com:/remote/file.txt /local/file.txt`;
const logAnalysis = await $ssh `
  tail -n 1000 /var/log/nginx/access.log |
  grep "404" |
  wc -l
`;
console.log('404 errors:', logAnalysis.stdout.trim());
const $sshConfigured = $ssh
    .cd('/var/www')
    .env({ NODE_ENV: 'production' });
await $sshConfigured `npm install`;
await $sshConfigured `npm run build`;
try {
    const $unreachable = $.ssh({
        host: 'unreachable.example.com',
        username: 'user',
        privateKey: '/path/to/id_rsa'
    }).timeout(5000);
    await $unreachable `echo "test"`;
}
catch (error) {
    if (error instanceof ConnectionError) {
        console.log('Connection error:', error.message);
    }
    else if (error instanceof CommandError) {
        console.log('Command error:', error.message);
    }
}
const servers = ['server1.com', 'server2.com', 'server3.com'];
const tasks = servers.map(host => {
    const $server = $.ssh({ host, username: 'user', privateKey: '/path/to/key' });
    return $server `df -h`;
});
const results = await Promise.all(tasks);
results.forEach((result, i) => {
    console.log(`Server ${servers[i]}:`);
    console.log(result.stdout);
});
try {
    await $ssh `mkdir -p /tmp/test`;
    await $ssh `cd /tmp/test && touch file1.txt file2.txt`;
    await $ssh `ls -la /tmp/test`;
    await $ssh `rm -rf /tmp/test`;
}
catch (error) {
    console.error('Execution error:', error);
}
//# sourceMappingURL=02-ssh-adapter.js.map