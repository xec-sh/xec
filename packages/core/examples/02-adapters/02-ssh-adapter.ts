/**
 * 02. SSH Adapter - Remote Command Execution via SSH
 * 
 * Shows usage of SSH adapter for remote execution
 */

import { $, CommandError, ConnectionError } from '@xec-sh/core';

// 1. Simple SSH connection
const $ssh = $.ssh({
  host: 'example.com',
  username: 'user',
  privateKey: '/path/to/id_rsa'
});

await $ssh`whoami`;
await $ssh`hostname`;
await $ssh`pwd`;

// 2. SSH with password
const $sshPassword = $.ssh({
  host: 'example.com',
  username: 'user',
  password: 'secret'
});

await $sshPassword`ls -la`;

// 3. SSH with non-standard port
const $sshCustomPort = $.ssh({
  host: 'example.com',
  port: 2222,
  username: 'user',
  privateKey: process.env['SSH_KEY_PATH']
});

await $sshCustomPort`echo "Connected on port 2222"`;

// 4. Key from environment variable
const $sshEnvKey = $.ssh({
  host: 'example.com',
  username: 'user',
  privateKey: process.env['SSH_KEY_PATH'] || '/path/to/id_rsa'
});

await $sshEnvKey`uname -a`;

// 5. SSH with sudo
const $sshSudo = $.ssh({
  host: 'example.com',
  username: 'user',
  privateKey: '/path/to/id_rsa',
  sudo: {
    enabled: true
  }
});

await $sshSudo`apt update`; // Will execute with sudo

// 6. SSH with sudo password
const $sshSudoPassword = $.ssh({
  host: 'example.com',
  username: 'user',
  privateKey: '/path/to/id_rsa',
  sudo: {
    enabled: true,
    password: 'sudo-password'
  }
});

await $sshSudoPassword`systemctl status nginx`;

// 7. File copying via SSH
// You can use scp or rsync via SSH

// Upload file to server
await $`scp /local/file.txt user@example.com:/remote/file.txt`;

// Download file from server
await $`scp user@example.com:/remote/file.txt /local/file.txt`;

// 8. Complex commands with pipe
const logAnalysis = await $ssh`
  tail -n 1000 /var/log/nginx/access.log |
  grep "404" |
  wc -l
`;
console.log('404 errors:', logAnalysis.stdout.trim());

// 9. Working with environment and directories
const $sshConfigured = $ssh
  .cd('/var/www')
  .env({ NODE_ENV: 'production' });

await $sshConfigured`npm install`;
await $sshConfigured`npm run build`;

// 10. Connection error handling
try {
  const $unreachable = $.ssh({
    host: 'unreachable.example.com',
    username: 'user',
    privateKey: '/path/to/id_rsa'
  }).timeout(5000); // Timeout for command
  
  await $unreachable`echo "test"`;
} catch (error) {
  if (error instanceof ConnectionError) {
    console.log('Connection error:', error.message);
  } else if (error instanceof CommandError) {
    console.log('Command error:', error.message);
  }
}

// 11. Parallel execution on multiple servers
const servers = ['server1.com', 'server2.com', 'server3.com'];
const tasks = servers.map(host => {
  const $server = $.ssh({ host, username: 'user', privateKey: '/path/to/key' });
  return $server`df -h`;
});

const results = await Promise.all(tasks);
results.forEach((result, i) => {
  console.log(`Server ${servers[i]}:`);
  console.log(result.stdout);
});

// 12. Multiple commands via SSH
// SSH adapter automatically reuses connections
try {
  // Multiple commands through single connection
  await $ssh`mkdir -p /tmp/test`;
  await $ssh`cd /tmp/test && touch file1.txt file2.txt`;
  await $ssh`ls -la /tmp/test`;
  // Cleanup
  await $ssh`rm -rf /tmp/test`;
} catch (error) {
  console.error('Execution error:', error);
}
