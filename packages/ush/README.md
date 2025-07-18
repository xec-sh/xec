# @xec/ush

Universal Shell Execution Engine - A powerful, flexible, and beginner-friendly command execution library for Node.js and TypeScript. Execute commands seamlessly across different environments (local, SSH, Docker, Kubernetes) with a unified, intuitive API inspired by Google's `zx`.

## 🎯 Why @xec/ush?

Whether you're automating deployments, building CI/CD pipelines, or creating developer tools, `@xec/ush` makes shell command execution simple, safe, and portable across environments.

### Key Benefits:
- **Write Once, Run Anywhere**: Same code works locally, over SSH, in Docker containers, or Kubernetes pods
- **Type-Safe**: Full TypeScript support with excellent IDE integration
- **Beginner-Friendly**: Intuitive API that feels like writing shell scripts
- **Production-Ready**: Built-in error handling, retry logic, and connection pooling
- **Testing-First**: Mock adapter for easy unit testing

## 📚 Table of Contents

- [Installation](#installation)
- [Quick Start for Beginners](#quick-start-for-beginners)
- [Core Concepts Explained](#core-concepts-explained)
- [Complete Feature Guide](#complete-feature-guide)
  - [Basic Command Execution](#basic-command-execution)
  - [Working with Variables](#working-with-variables)
  - [Configuration and Chaining](#configuration-and-chaining)
  - [Error Handling](#error-handling)
  - [Working with Different Environments](#working-with-different-environments)
  - [Advanced Features](#advanced-features)
- [Real-World Examples](#real-world-examples)
- [Common Patterns and Best Practices](#common-patterns-and-best-practices)
- [Troubleshooting Guide](#troubleshooting-guide)
- [API Reference](#api-reference)
- [Migration from Other Tools](#migration-from-other-tools)
- [Performance Tips](#performance-tips)
- [Security Best Practices](#security-best-practices)
- [Contributing](#contributing)

## 🚀 Installation

```bash
# Using npm
npm install @xec/ush

# Using yarn
yarn add @xec/ush

# Using pnpm
pnpm add @xec/ush

# Using bun
bun add @xec/ush
```

### Requirements:
- Node.js 18+ or Bun 1.0+
- TypeScript 5.0+ (for TypeScript projects)
- SSH client (for SSH features)
- Docker (for Docker features)
- kubectl (for Kubernetes features)

## 🎓 Quick Start for Beginners

If you're new to shell scripting or command execution in Node.js, this section will get you started step by step.

### Your First Script

Create a file named `hello.ts`:

```javascript
import { $ } from '@xec/ush';

// Execute a simple command
await $`echo "Hello, World!"`;

// The $ function executes shell commands
// The backticks `` allow you to write commands like in the terminal
// The await keyword waits for the command to finish
```

Run it:
```bash
node hello.js
# Output: Hello, World!
```

### Understanding the Basics

```javascript
import { $ } from '@xec/ush';

// 1. Commands return results
const result = await $`echo "Hello"`;
console.log(result.stdout); // "Hello\n"
console.log(result.exitCode); // 0 (success)

// 2. You can use JavaScript variables
const name = "Alice";
await $`echo "Hello, ${name}!"`; // Variables are safely escaped

// 3. Chain multiple commands
await $`mkdir -p temp`;
await $`cd temp && touch file.txt`;
await $`ls temp`; // Shows: file.txt

// 4. Handle errors gracefully
try {
  await $`cat non-existent-file.txt`;
} catch (error) {
  console.log("File not found!"); // This will be printed
}
```

### Key Concepts for Beginners:

1. **The `$` function**: This is your main tool. Think of it as a way to run terminal commands from JavaScript.

2. **Template literals**: The backticks `` ` `` let you write commands naturally and embed JavaScript variables safely.

3. **Async/Await**: Shell commands take time to run. `await` tells JavaScript to wait for the command to finish.

4. **Exit codes**: Commands return 0 for success, non-zero for errors. @xec/ush throws errors for non-zero codes by default.

## 🧠 Core Concepts Explained

### What is a Shell Command?

A shell command is an instruction you type in the terminal. For example:
- `ls` - lists files
- `echo "text"` - prints text
- `mkdir folder` - creates a directory

@xec/ush lets you run these commands from JavaScript/TypeScript.

### Execution Environments

Commands can run in different places:

1. **Local** (default): On your computer
   ```javascript
   await $`ls`; // Lists files on your computer
   ```

2. **SSH**: On a remote server
   ```javascript
   const $remote = $.ssh('user@server.com');
   await $remote`ls`; // Lists files on the server
   ```

3. **Docker**: Inside a container
   ```javascript
   const $container = $.docker('my-container');
   await $container`ls`; // Lists files in the container
   ```

4. **Kubernetes**: In a pod
   ```javascript
   const $pod = $.k8s('my-pod', 'my-namespace');
   await $pod`ls`; // Lists files in the pod
   ```

### Command Interpolation and Safety

When you include JavaScript variables in commands, @xec/ush automatically escapes them to prevent injection attacks:

```javascript
// SAFE - Variable is automatically escaped
const userInput = "file; rm -rf /"; // Malicious input
await $`echo ${userInput}`; // Prints: file; rm -rf /
// The semicolon and command are treated as text, not executed

// UNSAFE - Raw string concatenation (DON'T DO THIS!)
// await $`echo ` + userInput; // Would execute rm command!

// Multiple variables
const fileName = "my file.txt"; // Note the space
const content = "Hello\nWorld";
await $`echo ${content} > ${fileName}`; // Creates "my file.txt" safely
```

## 📖 Complete Feature Guide

### Basic Command Execution

#### Simple Commands

```javascript
// Run any shell command
await $`pwd`;                     // Print working directory
await $`date`;                    // Show current date
await $`whoami`;                  // Show current user

// Commands with arguments
await $`ls -la`;                  // List files with details
await $`grep "pattern" file.txt`; // Search in file
await $`curl https://api.github.com`; // Make HTTP request
```

#### Getting Command Output

```javascript
// Capture output for processing
const files = await $`ls`;
console.log(files.stdout);        // The command's output
console.log(files.stderr);        // Any error messages
console.log(files.exitCode);      // 0 for success

// Process output line by line
const lines = files.stdout.trim().split('\n');
for (const line of lines) {
  console.log(`File: ${line}`);
}

// Parse JSON output
const data = await $`curl -s https://api.github.com/users/github`;
const user = JSON.parse(data.stdout);
console.log(`GitHub user: ${user.name}`);
```

### Working with Variables

#### Safe Variable Interpolation

```javascript
// Variables are automatically escaped
const filename = "my file.txt";  // Space in filename
await $`touch ${filename}`;       // Creates "my file.txt"

// Multiple variables
const source = "/path/to/source";
const dest = "/path/to/dest";
await $`cp -r ${source} ${dest}`;

// Arrays are joined with spaces
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
await $`rm ${files}`;             // Removes all three files

// Objects are JSON stringified
const config = { name: 'app', port: 3000 };
await $`echo ${config} > config.json`;
```

#### Raw Strings (Use with Caution!)

```javascript
// Sometimes you need unescaped strings for shell features
const pattern = '*.txt';
await $.raw`ls ${pattern}`;      // Globs all .txt files

// Pipe operations
await $.raw`ps aux | grep node`; // Pipe requires raw mode

// But be VERY careful with user input in raw mode!
// NEVER do this with untrusted input:
// await $.raw`ls ${userInput}`; // DANGEROUS!
```

### Configuration and Chaining

#### Setting Working Directory

```javascript
// Change directory for one command
await $`ls`.cwd('/tmp');

// Change directory for all subsequent commands
const $tmp = $.cd('/tmp');
await $tmp`pwd`;                  // /tmp
await $tmp`ls`;                   // Lists /tmp contents

// Relative paths work too
const $project = $.cd('./my-project');
await $project`npm install`;
await $project`npm test`;
```

#### Environment Variables

```javascript
// Set for one command
await $`node app.js`.env({ NODE_ENV: 'production' });

// Set for all subsequent commands
const $prod = $.env({ 
  NODE_ENV: 'production',
  PORT: '3000',
  API_KEY: 'secret'
});

await $prod`node server.js`;     // Runs with all env vars

// Extend existing environment
const $extended = $prod.env({ 
  DEBUG: 'true' 
}); // Keeps previous vars + adds DEBUG
```

#### Timeout Control

```javascript
// Set timeout for one command (in milliseconds)
await $`sleep 10`.timeout(5000); // Fails after 5 seconds

// Set default timeout
const $quick = $.timeout(3000);  // 3 second timeout
await $quick`curl https://slow-api.com`;

// Disable timeout
await $`long-running-task`.timeout(0); // No timeout
```

#### Shell Selection

```javascript
// Use specific shell
const $bash = $.shell('/bin/bash');
await $bash`echo $BASH_VERSION`;

const $zsh = $.shell('/bin/zsh');
await $zsh`echo $ZSH_VERSION`;

// Disable shell (direct execution)
const $direct = $.shell(false);
await $direct`/usr/bin/node --version`; // No shell interpolation
```

### Error Handling

#### Try-Catch Pattern

```javascript
try {
  await $`cat /etc/shadow`;       // Requires root
} catch (error) {
  console.error('Command failed!');
  console.error('Exit code:', error.exitCode);
  console.error('Stderr:', error.stderr);
  console.error('Command:', error.command);
}
```

#### Nothrow Mode

```javascript
// Don't throw on non-zero exit codes
const result = await $`grep "pattern" file.txt`.nothrow();

if (result.exitCode === 0) {
  console.log('Pattern found:', result.stdout);
} else if (result.exitCode === 1) {
  console.log('Pattern not found');
} else {
  console.log('Error occurred:', result.stderr);
}
```

#### Retry Logic

```javascript
// Retry failed commands automatically
const $reliable = $.retry({
  maxRetries: 3,
  initialDelay: 1000,    // Start with 1 second
  backoffMultiplier: 2,  // Double delay each time
  maxDelay: 10000        // Max 10 seconds
});

// Will retry up to 3 times if it fails
await $reliable`curl https://flaky-api.com/data`;

// Custom retry logic
const $custom = $.retry({
  maxRetries: 5,
  shouldRetry: (error, attempt) => {
    // Only retry network errors
    return error.stderr.includes('network unreachable');
  }
});
```

### Working with Different Environments

#### SSH Execution

```javascript
// Basic SSH connection
const $remote = $.ssh('user@server.com');
await $remote`uname -a`;
await $remote`df -h`;

// With SSH options
const $secure = $.ssh({
  host: 'server.com',
  username: 'admin',
  privateKey: '/home/user/.ssh/id_rsa',
  port: 2222,
  connectTimeout: 10000
});

// SSH with bastion/jump host
const $bastion = $.ssh({
  host: 'internal-server',
  username: 'user',
  proxy: {
    host: 'bastion.example.com',
    username: 'jump-user'
  }
});

// Connection pooling (automatic)
const $srv = $.ssh('user@server.com');
await $srv`echo "First command"`;  // Creates connection
await $srv`echo "Second command"`; // Reuses connection
await $srv.disconnect();           // Close when done
```

#### Docker Execution

```javascript
// Execute in running container
const $container = $.docker('my-app-container');
await $container`ps aux`;
await $container`tail -f /var/log/app.log`;

// Execute in specific image
const $node = $.docker({
  image: 'node:20-alpine',
  rm: true,                        // Remove after execution
  volumes: {
    './app': '/app'                // Mount local dir
  }
});
await $node`cd /app && npm install`;
await $node`cd /app && npm test`;

// With environment variables
const $app = $.docker({
  container: 'my-app',
  env: {
    NODE_ENV: 'production',
    API_URL: 'https://api.example.com'
  }
});
```

#### Kubernetes Execution

```javascript
// Execute in pod
const $pod = $.k8s('my-app-pod', 'production');
await $pod`cat /etc/hostname`;
await $pod`ps aux`;

// Specific container in pod
const $sidecar = $.k8s({
  pod: 'my-app-pod',
  namespace: 'production',
  container: 'sidecar-container'
});

// With kubectl context
const $staging = $.k8s({
  pod: 'test-pod',
  namespace: 'staging',
  context: 'staging-cluster'
});
```

#### Remote Docker (SSH + Docker)

```javascript
// Docker commands on remote host
const $remoteDkr = $.remoteDocker({
  ssh: 'user@docker-host.com',
  container: 'app-container'
});

await $remoteDkr`ps aux`;
await $remoteDkr`tail -f /logs/app.log`;

// Managing remote containers
const $host = $.remoteDocker({
  ssh: 'user@docker-host.com'
});
await $host`docker ps`;
await $host`docker logs my-app`;
```

### Advanced Features

#### Stream Processing

```javascript
// Process output line by line as it arrives
await $.stream`tail -f /var/log/app.log`
  .onLine((line) => {
    if (line.includes('ERROR')) {
      console.error('Error detected:', line);
    }
  })
  .onStderr((line) => {
    console.error('Stderr:', line);
  });

// Process large files efficiently
let lineCount = 0;
await $.stream`cat huge-file.txt`
  .onLine(() => lineCount++)
  .onComplete(() => console.log(`Total lines: ${lineCount}`));

// Real-time log monitoring
const controller = new AbortController();
await $.stream`tail -f /var/log/system.log`
  .onLine((line) => {
    console.log(new Date(), line);
    if (line.includes('CRITICAL')) {
      controller.abort(); // Stop monitoring
    }
  })
  .signal(controller.signal);
```

#### Parallel Execution

```javascript
// Run commands in parallel
const results = await $.parallel([
  $`curl https://api1.com`,
  $`curl https://api2.com`,
  $`curl https://api3.com`
]);

// With concurrency limit
const files = ['file1.txt', 'file2.txt', 'file3.txt', /* ... more files */];
await $.parallel(
  files.map(f => $`process-file ${f}`),
  { concurrency: 2 } // Max 2 commands at once
);

// Parallel with different configurations
await $.parallel([
  $`npm test`.cwd('./package1'),
  $`npm test`.cwd('./package2'),
  $.ssh('server1')`npm test`,
  $.docker('app')`npm test`
]);
```

#### Command Templates

```javascript
// Define reusable command templates
const gitCommit = $.template`git commit -m ${0}`;
await gitCommit('Initial commit');
await gitCommit('Add new feature');

// Templates with multiple parameters
const deploy = $.template`
  rsync -avz ${0} ${1}@${2}:${3}
  ssh ${1}@${2} "cd ${3} && npm install --production"
`;
await deploy('./dist', 'user', 'server.com', '/var/www/app');

// Validated templates
const backup = $.template`mysqldump ${0} > backup-${1}.sql`
  .validate((args) => {
    if (!args[0]) throw new Error('Database name required');
    if (!args[1]) args[1] = new Date().toISOString().split('T')[0];
    return args;
  });

await backup('mydb', '2024-01-01');
```

#### Pipe Operations

```javascript
// Unix-style pipes
const result = await $.pipe(
  $`cat data.txt`,
  $`grep "ERROR"`,
  $`wc -l`
);
console.log(`Error count: ${result.stdout.trim()}`);

// Pipe with error handling
try {
  await $.pipe(
    $`cat input.json`,
    $`jq '.users[]'`,
    $`grep "admin"`,
    $`wc -l`
  );
} catch (error) {
  console.error('Pipeline failed at:', error.command);
}

// Conditional pipes
const processData = async (file, hasHeaders) => {
  const commands = [$`cat ${file}`];
  if (hasHeaders) commands.push($`tail -n +2`); // Skip header
  commands.push($`sort`, $`uniq`);
  return await $.pipe(...commands);
};
```

#### Context Management

```javascript
// Execute multiple commands in same context
await $.within(async ($) => {
  await $`cd /tmp`;
  await $`mkdir test-dir`;
  await $`cd test-dir`;
  await $`echo "test" > file.txt`;
  const content = await $`cat file.txt`;
  console.log(content.stdout); // "test"
});

// Context with configuration
await $.within({ 
  cwd: '/tmp',
  env: { DEBUG: 'true' }
}, async ($) => {
  await $`npm install`;
  await $`npm test`;
});

// Nested contexts
await $.within({ cwd: '/app' }, async ($outer) => {
  await $outer`npm install`;
  
  await $.within({ env: { NODE_ENV: 'test' }}, async ($inner) => {
    await $inner`npm test`;
  });
  
  await $outer`npm build`; // Back to outer context
});
```

#### Progress Tracking

```javascript
// Track long-running operations
await $`npm install`.progress({
  onStart: () => console.log('Installing dependencies...'),
  onProgress: (percent) => console.log(`Progress: ${percent}%`),
  onComplete: () => console.log('Installation complete!')
});

// Custom progress parsing
await $`rsync -avz --progress source/ dest/`.progress({
  parser: (output) => {
    const match = output.match(/(\d+)%/);
    return match ? parseInt(match[1]) : null;
  },
  onProgress: (percent) => {
    process.stdout.write(`\rCopying: ${percent}%`);
  }
});

// Progress with spinner
const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let i = 0;
await $`docker build -t myapp .`.progress({
  onProgress: () => {
    process.stdout.write(`\r${spinner[i++ % spinner.length]} Building...`);
  },
  onComplete: () => console.log('\r✓ Build complete!')
});
```

#### Temporary Files and Directories

```javascript
// Auto-cleanup temporary directory
await $.withTempDir(async (tmpDir) => {
  await $`cd ${tmpDir} && git clone https://github.com/user/repo`;
  await $`cd ${tmpDir}/repo && npm install`;
  await $`cd ${tmpDir}/repo && npm test`;
  // tmpDir is automatically removed after this block
});

// Temporary file
await $.withTempFile(async (tmpFile) => {
  await $`curl https://example.com/data > ${tmpFile}`;
  await $`process-data < ${tmpFile}`;
  // tmpFile is automatically removed after this block
});

// Custom temp options
await $.withTempDir({
  prefix: 'build-',
  cleanup: false  // Keep directory for debugging
}, async (tmpDir) => {
  console.log(`Working in: ${tmpDir}`);
  await $`cd ${tmpDir} && make`;
});
```

#### Interactive Features

```javascript
// User confirmation
const proceed = await $.confirm('Deploy to production?');
if (proceed) {
  await $`npm run deploy:prod`;
}

// User input
const name = await $.prompt('Enter your name:');
await $`echo "Hello, ${name}!" > greeting.txt`;

// Password input (hidden)
const password = await $.password('Enter password:');
await $`mysql -u root -p${password} < backup.sql`.quiet();

// Selection menu
const env = await $.select('Choose environment:', [
  'development',
  'staging', 
  'production'
]);
await $`deploy-to ${env}`;
```

#### Audit Logging

```javascript
// Enable audit logging
$.configure({ 
  auditLog: {
    enabled: true,
    file: './commands.log',
    includeEnv: false,      // Don't log env vars
    includeCwd: true,
    includeTimestamp: true
  }
});

// All commands are now logged
await $`rm -rf /tmp/test`;  // Logged with timestamp

// Query audit log
const audit = $.getAuditLogger();
const recentCommands = audit.query({
  startTime: Date.now() - 3600000, // Last hour
  adapter: 'ssh',
  exitCode: 0  // Only successful
});

// Custom audit logger
class CustomAudit {
  async log(entry) {
    await fetch('https://audit.example.com/log', {
      method: 'POST',
      body: JSON.stringify(entry)
    });
  }
}

$.configure({ auditLogger: new CustomAudit() });
```

## 🌟 Real-World Examples

### Automated Deployment Script

```javascript
import { $ } from '@xec/ush';

async function deployApp(environment) {
  // Configuration for different environments
  const config = {
    development: {
      server: 'dev.example.com',
      path: '/var/www/dev',
      branch: 'develop'
    },
    production: {
      server: 'prod.example.com', 
      path: '/var/www/app',
      branch: 'main'
    }
  };

  const env = config[environment];
  if (!env) throw new Error(`Unknown environment: ${environment}`);

  console.log(`🚀 Deploying to ${environment}...`);

  // 1. Run tests locally
  console.log('📋 Running tests...');
  await $`npm test`;

  // 2. Build the application
  console.log('🔨 Building application...');
  await $`npm run build`;

  // 3. Connect to server
  const $remote = $.ssh(`deploy@${env.server}`);

  try {
    // 4. Backup current version
    console.log('💾 Backing up current version...');
    await $remote`cd ${env.path} && tar -czf ../backup-$(date +%Y%m%d-%H%M%S).tar.gz .`;

    // 5. Pull latest code
    console.log('📥 Pulling latest code...');
    await $remote`cd ${env.path} && git pull origin ${env.branch}`;

    // 6. Install dependencies
    console.log('📦 Installing dependencies...');
    await $remote`cd ${env.path} && npm ci --production`;

    // 7. Run migrations
    console.log('🗄️ Running database migrations...');
    await $remote`cd ${env.path} && npm run migrate`;

    // 8. Restart application
    console.log('🔄 Restarting application...');
    await $remote`sudo systemctl restart app`;

    // 9. Health check
    console.log('❤️ Checking application health...');
    await $.retry({ maxRetries: 5, initialDelay: 2000 })`
      curl -f http://${env.server}/health
    `;

    console.log(`✅ Successfully deployed to ${environment}!`);
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    
    // Rollback on failure
    console.log('⏪ Rolling back...');
    await $remote`cd ${env.path} && git reset --hard HEAD~1`;
    await $remote`sudo systemctl restart app`;
    
    throw error;
  } finally {
    await $remote.disconnect();
  }
}

// Usage
await deployApp('production');
```

### Log Analysis Pipeline

```javascript
import { $ } from '@xec/ush';

async function analyzeAccessLogs(date) {
  console.log(`📊 Analyzing logs for ${date}...`);

  // Setup
  const logFile = `/var/log/nginx/access.log-${date}`;
  const outputDir = `./reports/${date}`;
  await $`mkdir -p ${outputDir}`;

  // 1. Extract and decompress logs if needed
  if (await $`test -f ${logFile}.gz`.nothrow().then(r => r.exitCode === 0)) {
    console.log('📦 Decompressing log file...');
    await $`gunzip -c ${logFile}.gz > ${logFile}`;
  }

  // 2. Calculate basic statistics
  console.log('📈 Calculating statistics...');
  
  const stats = await $.parallel({
    totalRequests: $`wc -l < ${logFile}`,
    uniqueIPs: $.pipe(
      $`cat ${logFile}`,
      $`awk '{print $1}'`,
      $`sort -u`,
      $`wc -l`
    ),
    status404: $`grep " 404 " ${logFile} | wc -l`,
    status500: $`grep " 500 " ${logFile} | wc -l`
  });

  // 3. Find top URLs
  console.log('🔝 Finding top URLs...');
  const topUrls = await $.pipe(
    $`cat ${logFile}`,
    $`awk '{print $7}'`,
    $`sort`,
    $`uniq -c`,
    $`sort -rn`,
    $`head -20`
  );

  // 4. Analyze response times
  console.log('⏱️ Analyzing response times...');
  const responseTimes = await $.pipe(
    $`cat ${logFile}`,
    $`awk '{print $NF}'`,           // Last field is response time
    $`grep -E '^[0-9]+$'`,          // Only numeric values
    $`awk '{sum+=$1; count++} END {print "avg:", sum/count, "ms"}'`
  );

  // 5. Detect potential attacks
  console.log('🛡️ Checking for suspicious activity...');
  const suspicious = await $.pipe(
    $`cat ${logFile}`,
    $.raw`grep -E "(union.*select|<script|../|\.\.\\\\)" || true`,
    $`wc -l`
  );

  // 6. Generate report
  console.log('📄 Generating report...');
  const report = `
# Access Log Analysis Report
Date: ${date}

## Summary Statistics
- Total Requests: ${stats.totalRequests.stdout.trim()}
- Unique IPs: ${stats.uniqueIPs.stdout.trim()}
- 404 Errors: ${stats.status404.stdout.trim()}
- 500 Errors: ${stats.status500.stdout.trim()}
- Suspicious Requests: ${suspicious.stdout.trim()}

## Response Times
${responseTimes.stdout}

## Top 20 URLs
${topUrls.stdout}
`;

  await $`echo ${report} > ${outputDir}/report.md`;

  // 7. Create visualizations
  console.log('📊 Creating visualizations...');
  await $`
    cat ${logFile} |
    awk '{print strftime("%H", $4)}' |
    sort | uniq -c |
    gnuplot -e "
      set terminal png;
      set output '${outputDir}/requests-by-hour.png';
      set xlabel 'Hour';
      set ylabel 'Requests';
      plot '-' using 2:1 with lines title 'Requests'
    "
  `.nothrow(); // Continue if gnuplot not available

  console.log(`✅ Analysis complete! Report saved to ${outputDir}/report.md`);
}

// Usage
await analyzeAccessLogs('20240115');
```

### Database Backup Automation

```javascript
import { $ } from '@xec/ush';

class DatabaseBackup {
  constructor(config) {
    this.config = config;
    this.$ = $.env({
      MYSQL_PWD: config.password  // Secure password passing
    });
  }

  async backup(database) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${database}-${timestamp}.sql`;
    const backupPath = `${this.config.backupDir}/${filename}`;

    console.log(`🗄️ Starting backup of ${database}...`);

    try {
      // Create backup directory
      await $`mkdir -p ${this.config.backupDir}`;

      // Perform backup with progress tracking
      await this.$`
        mysqldump 
          -h ${this.config.host}
          -u ${this.config.user}
          --single-transaction
          --routines
          --triggers
          --add-drop-table
          --extended-insert
          ${database}
      `.pipe($`gzip -9 > ${backupPath}.gz`)
        .progress({
          onStart: () => console.log('📦 Dumping database...'),
          onProgress: () => process.stdout.write('.'),
          onComplete: () => console.log('\n✓ Dump complete')
        });

      // Verify backup
      const size = await $`du -h ${backupPath}.gz | cut -f1`;
      console.log(`📊 Backup size: ${size.stdout.trim()}`);

      // Upload to S3 if configured
      if (this.config.s3Bucket) {
        console.log('☁️ Uploading to S3...');
        await $`
          aws s3 cp ${backupPath}.gz 
          s3://${this.config.s3Bucket}/backups/${filename}.gz
          --storage-class GLACIER
        `;
      }

      // Clean old backups
      await this.cleanOldBackups(database);

      return `${backupPath}.gz`;
    } catch (error) {
      console.error('❌ Backup failed:', error.message);
      throw error;
    }
  }

  async cleanOldBackups(database) {
    console.log('🧹 Cleaning old backups...');
    
    const retentionDays = this.config.retentionDays || 30;
    
    // Local cleanup
    await $`
      find ${this.config.backupDir} 
        -name "${database}-*.sql.gz" 
        -mtime +${retentionDays} 
        -delete
    `;

    // S3 cleanup if configured
    if (this.config.s3Bucket) {
      await $`
        aws s3 ls s3://${this.config.s3Bucket}/backups/ |
        grep "${database}-" |
        awk '{print $4}' |
        while read file; do
          age=$(aws s3api head-object \
            --bucket ${this.config.s3Bucket} \
            --key backups/$file \
            --query "LastModified" \
            --output text)
          if [ $(date -d "$age" +%s) -lt $(date -d "${retentionDays} days ago" +%s) ]; then
            aws s3 rm s3://${this.config.s3Bucket}/backups/$file
          fi
        done
      `.nothrow(); // Don't fail on S3 errors
    }
  }

  async restore(backupFile, targetDatabase) {
    console.log(`🔄 Restoring ${targetDatabase} from ${backupFile}...`);

    // Download from S3 if needed
    if (backupFile.startsWith('s3://')) {
      const localFile = `/tmp/${backupFile.split('/').pop()}`;
      await $`aws s3 cp ${backupFile} ${localFile}`;
      backupFile = localFile;
    }

    // Create database if it doesn't exist
    await this.$`
      mysql -h ${this.config.host} -u ${this.config.user} 
      -e "CREATE DATABASE IF NOT EXISTS ${targetDatabase}"
    `;

    // Restore
    await $.pipe(
      $`zcat ${backupFile}`,
      this.$`mysql -h ${this.config.host} -u ${this.config.user} ${targetDatabase}`
    );

    console.log('✅ Restore complete!');
  }
}

// Usage
const backup = new DatabaseBackup({
  host: 'localhost',
  user: 'root',
  password: process.env.DB_PASSWORD,
  backupDir: '/backups',
  s3Bucket: 'my-backup-bucket',
  retentionDays: 30
});

// Backup all databases
const databases = await $`mysql -e "SHOW DATABASES" | tail -n +2 | grep -v "information_schema"`;
for (const db of databases.stdout.trim().split('\n')) {
  await backup.backup(db);
}
```

### Multi-Server Health Check

```javascript
import { $ } from '@xec/ush';

async function checkServerHealth(servers) {
  console.log('🏥 Starting health checks...\n');

  const results = await Promise.allSettled(
    servers.map(async (server) => {
      const $server = $.ssh(server.ssh);
      const health = { server: server.name, status: '🟢 Healthy', issues: [] };

      try {
        // CPU usage
        const cpu = await $server`top -b -n1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`;
        const cpuUsage = parseFloat(cpu.stdout);
        if (cpuUsage > 80) {
          health.status = '🟡 Warning';
          health.issues.push(`High CPU usage: ${cpuUsage}%`);
        }

        // Memory usage  
        const memory = await $server`free | grep Mem | awk '{print ($3/$2) * 100}'`;
        const memUsage = parseFloat(memory.stdout);
        if (memUsage > 90) {
          health.status = '🔴 Critical';
          health.issues.push(`High memory usage: ${memUsage.toFixed(1)}%`);
        }

        // Disk usage
        const disk = await $server`df -h / | tail -1 | awk '{print $5}' | sed 's/%//'`;
        const diskUsage = parseInt(disk.stdout);
        if (diskUsage > 85) {
          health.status = health.status === '🟢 Healthy' ? '🟡 Warning' : health.status;
          health.issues.push(`High disk usage: ${diskUsage}%`);
        }

        // Service checks
        for (const service of server.services || []) {
          const serviceCheck = await $server`systemctl is-active ${service}`.nothrow();
          if (serviceCheck.stdout.trim() !== 'active') {
            health.status = '🔴 Critical';
            health.issues.push(`Service ${service} is down`);
          }
        }

        // Custom health endpoint
        if (server.healthUrl) {
          const httpCheck = await $server`curl -sf ${server.healthUrl}`.nothrow();
          if (httpCheck.exitCode !== 0) {
            health.status = '🔴 Critical';
            health.issues.push('Health endpoint check failed');
          }
        }

        await $server.disconnect();
        return health;
      } catch (error) {
        await $server.disconnect();
        return { 
          server: server.name, 
          status: '⚫ Unreachable', 
          issues: [error.message] 
        };
      }
    })
  );

  // Generate report
  console.log('📊 Health Check Report\n' + '='.repeat(50));
  
  let hasIssues = false;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const health = result.value;
      console.log(`\n${health.status} ${health.server}`);
      if (health.issues.length > 0) {
        hasIssues = true;
        health.issues.forEach(issue => console.log(`   ⚠️  ${issue}`));
      }
    } else {
      console.log(`\n⚫ ${result.reason}`);
      hasIssues = true;
    }
  }

  // Send alerts if needed
  if (hasIssues && process.env.SLACK_WEBHOOK) {
    await $`curl -X POST ${process.env.SLACK_WEBHOOK} \
      -H "Content-Type: application/json" \
      -d '{"text": "⚠️ Server health check detected issues. Check logs for details."}'
    `.nothrow();
  }

  return results;
}

// Usage
const servers = [
  {
    name: 'Web Server 1',
    ssh: 'admin@web1.example.com',
    services: ['nginx', 'php-fpm'],
    healthUrl: 'http://localhost/health'
  },
  {
    name: 'Database Server',
    ssh: 'admin@db.example.com',
    services: ['mysql'],
  },
  {
    name: 'API Server',
    ssh: 'admin@api.example.com',
    services: ['node-api'],
    healthUrl: 'http://localhost:3000/health'
  }
];

await checkServerHealth(servers);
```

## 💡 Common Patterns and Best Practices

### Pattern: Safe User Input Handling

```javascript
// ❌ WRONG - Never concatenate user input directly
const userInput = "file.txt; rm -rf /";
await $.raw`cat ${userInput}`;  // DANGEROUS!

// ✅ CORRECT - Use template literals for automatic escaping
await $`cat ${userInput}`;       // Safe - input is escaped

// For multiple files from user input
const files = userInput.split(' ').filter(f => f.length > 0);
await $`cat ${files}`;           // Each file is safely escaped
```

### Pattern: Error Recovery

```javascript
// Fallback pattern
async function getConfig() {
  // Try primary source
  const primary = await $`cat /etc/app/config.json`.nothrow();
  if (primary.exitCode === 0) {
    return JSON.parse(primary.stdout);
  }
  
  // Fallback to secondary
  const secondary = await $`cat ~/.app/config.json`.nothrow();
  if (secondary.exitCode === 0) {
    return JSON.parse(secondary.stdout);
  }
  
  // Use defaults
  return { port: 3000, host: 'localhost' };
}

// Cleanup pattern
async function processFile(file) {
  const tempFile = `/tmp/processed-${Date.now()}`;
  
  try {
    await $`preprocess ${file} > ${tempFile}`;
    await $`validate ${tempFile}`;
    await $`mv ${tempFile} ${file}`;
  } finally {
    // Always cleanup
    await $`rm -f ${tempFile}`.nothrow();
  }
}
```

### Pattern: Cross-Platform Commands

```javascript
// Platform detection
const platform = await $`uname -s`;
const isLinux = platform.stdout.includes('Linux');
const isMac = platform.stdout.includes('Darwin');

// Platform-specific commands
async function openFile(file) {
  if (isMac) {
    await $`open ${file}`;
  } else if (isLinux) {
    await $`xdg-open ${file}`;
  } else {
    throw new Error('Unsupported platform');
  }
}

// Portable commands
const listFiles = isWindows 
  ? $`dir /b`           // Windows
  : $`ls -1`;           // Unix

// Abstract platform differences
class PackageManager {
  static async install(pkg) {
    if (await $.commandExists('apt-get')) {
      await $`sudo apt-get install -y ${pkg}`;
    } else if (await $.commandExists('brew')) {
      await $`brew install ${pkg}`;
    } else if (await $.commandExists('yum')) {
      await $`sudo yum install -y ${pkg}`;
    } else {
      throw new Error('No supported package manager found');
    }
  }
}
```

### Pattern: Resource Management

```javascript
// Connection pooling
class ServerPool {
  constructor(servers) {
    this.connections = new Map();
  }

  async getConnection(server) {
    if (!this.connections.has(server)) {
      this.connections.set(server, $.ssh(server));
    }
    return this.connections.get(server);
  }

  async execute(server, command) {
    const $conn = await this.getConnection(server);
    return await $conn`${command}`;
  }

  async closeAll() {
    for (const [server, $conn] of this.connections) {
      await $conn.disconnect();
    }
    this.connections.clear();
  }
}

// Automatic resource cleanup
class TempWorkspace {
  async use(callback) {
    const workspace = `/tmp/workspace-${Date.now()}`;
    await $`mkdir -p ${workspace}`;
    
    try {
      return await callback(workspace);
    } finally {
      await $`rm -rf ${workspace}`;
    }
  }
}

// Usage
const workspace = new TempWorkspace();
await workspace.use(async (dir) => {
  await $`cd ${dir} && git clone https://github.com/user/repo`;
  await $`cd ${dir}/repo && make build`;
});
```

### Pattern: Composable Operations

```javascript
// Command builder pattern
class CommandBuilder {
  constructor() {
    this.options = [];
  }

  verbose() {
    this.options.push('-v');
    return this;
  }

  recursive() {
    this.options.push('-r');
    return this;
  }

  force() {
    this.options.push('-f');
    return this;
  }

  build(command, ...args) {
    return [command, ...this.options, ...args].join(' ');
  }
}

// Usage
const rm = new CommandBuilder().recursive().force();
await $`${rm.build('rm', '/tmp/test')}`;

// Pipeline builder
class Pipeline {
  constructor() {
    this.steps = [];
  }

  add(step) {
    this.steps.push(step);
    return this;
  }

  async execute(input) {
    let result = input;
    for (const step of this.steps) {
      result = await step(result);
    }
    return result;
  }
}

// Usage
const imageProcessor = new Pipeline()
  .add(async (file) => {
    await $`convert ${file} -resize 800x600 ${file}`;
    return file;
  })
  .add(async (file) => {
    await $`optipng ${file}`;
    return file;
  })
  .add(async (file) => {
    const newName = file.replace(/\.\w+$/, '-optimized.png');
    await $`mv ${file} ${newName}`;
    return newName;
  });

const result = await imageProcessor.execute('input.png');
```

## 🔧 Troubleshooting Guide

### Common Issues and Solutions

#### Issue: Command not found

```javascript
// Problem
await $`node script.js`;  // Error: command not found: node

// Solution 1: Use full path
await $`/usr/local/bin/node script.js`;

// Solution 2: Set PATH
const $withPath = $.env({ 
  PATH: `/usr/local/bin:${process.env.PATH}` 
});
await $withPath`node script.js`;

// Solution 3: Check if command exists
if (await $.commandExists('node')) {
  await $`node script.js`;
} else {
  console.error('Node.js is not installed');
}
```

#### Issue: SSH connection failures

```javascript
// Problem: Connection timeout
const $remote = $.ssh('server.com'); // Hangs

// Solution: Add timeout and retry
const $remote = $.ssh({
  host: 'server.com',
  username: 'user',
  connectTimeout: 10000,  // 10 seconds
  readyTimeout: 5000,     // 5 seconds
  retries: 3
});

// Debug SSH issues
const $debug = $.ssh({
  host: 'server.com',
  debug: true  // Prints detailed SSH logs
});
```

#### Issue: Large output handling

```javascript
// Problem: Out of memory with large outputs
const result = await $`cat huge-file.log`; // Crash!

// Solution 1: Stream processing
await $.stream`cat huge-file.log`
  .onLine((line) => {
    // Process line by line
    if (line.includes('ERROR')) {
      console.log(line);
    }
  });

// Solution 2: Pipe to file
await $`cat huge-file.log > output.txt`;
// Process file separately

// Solution 3: Limit output
await $`cat huge-file.log | head -n 1000`;
```

#### Issue: Shell escaping problems

```javascript
// Problem: Special characters break commands
const filename = "my file (copy).txt";
await $.raw`rm ${filename}`;  // Error!

// Solution: Always use template literals
await $`rm ${filename}`;      // Correctly escaped

// For complex cases, use arrays
const args = ['--option=value with spaces', 'file.txt'];
await $`mycommand ${args}`;
```

### Debugging Tips

#### Enable verbose mode

```javascript
// Global verbose mode
$.configure({ verbose: true });

// Per-command verbose
await $`complex-command`.verbose();

// Custom logging
const $logged = $.pipe(
  $`some-command`,
  {
    onStdout: (data) => console.log('OUT:', data),
    onStderr: (data) => console.error('ERR:', data)
  }
);
```

#### Test with mock adapter

```javascript
// Create test double
const $mock = $.mock({
  'ls': { stdout: 'file1.txt\nfile2.txt', exitCode: 0 },
  'cat file1.txt': { stdout: 'content', exitCode: 0 },
  'rm *': { exitCode: 1, stderr: 'Permission denied' }
});

// Test your code
async function cleanupFiles() {
  const files = await $mock`ls`;
  for (const file of files.stdout.split('\n')) {
    await $mock`rm ${file}`;
  }
}

// Verify calls
const calls = $mock.getCalls();
assert(calls[0].command === 'ls');
assert(calls[1].command === 'rm file1.txt');
```

## 📚 API Reference

### Core API

#### `$` - Main execution function

```typescript
// Template literal syntax
await $`command arg1 arg2`;

// With options
await $`command`.cwd('/path').env({ KEY: 'value' });

// Raw mode (no escaping)
await $.raw`command ${variable}`;
```

#### Configuration Methods

All configuration methods return a new `$` instance with the configuration applied:

```typescript
// Working directory
$.cd(path: string): $
$.cwd(path: string): $  // Alias for cd

// Environment variables
$.env(vars: Record<string, string>): $

// Timeout (milliseconds, 0 = no timeout)
$.timeout(ms: number): $

// Shell selection
$.shell(shell: string | false): $

// Don't throw on non-zero exit
$.nothrow(): $

// Quiet mode (no output to console)
$.quiet(): $

// Verbose mode (extra logging)
$.verbose(): $

// Retry configuration
$.retry(options: RetryOptions): $
```

#### Adapter Methods

```typescript
// SSH adapter
$.ssh(options: string | SSHOptions): $

// Docker adapter  
$.docker(options: string | DockerOptions): $

// Kubernetes adapter
$.k8s(pod: string, namespace?: string): $
$.k8s(options: K8sOptions): $

// Remote Docker (SSH + Docker)
$.remoteDocker(options: RemoteDockerOptions): $

// Mock adapter (testing)
$.mock(responses: MockResponses): MockAdapter
```

#### Execution Methods

```typescript
// Parallel execution
$.parallel(
  commands: Command[], 
  options?: { concurrency?: number }
): Promise<Result[]>

// Pipeline execution
$.pipe(...commands: Command[]): Promise<Result>

// Streaming execution
$.stream(command: Command): StreamBuilder

// Context execution
$.within(
  options: Options,
  callback: ($: Engine) => Promise<T>
): Promise<T>
```

#### Utility Methods

```typescript
// Check if command exists
$.commandExists(command: string): Promise<boolean>

// Find command path
$.which(command: string): Promise<string | null>

// Template creation
$.template`command ${0} ${1}`: Template

// Configure global options
$.configure(options: GlobalOptions): void
```

### Types and Interfaces

#### Command Options

```typescript
interface CommandOptions {
  cwd?: string;              // Working directory
  env?: Record<string, string>; // Environment variables
  shell?: string | false;    // Shell to use
  timeout?: number;          // Timeout in ms
  nothrow?: boolean;         // Don't throw on error
  quiet?: boolean;           // Suppress output
  verbose?: boolean;         // Extra logging
  stdin?: string | Buffer;   // Input data
  encoding?: BufferEncoding; // Output encoding
}
```

#### Execution Result

```typescript
interface ExecutionResult {
  stdout: string;            // Standard output
  stderr: string;            // Standard error
  exitCode: number;          // Exit code (0 = success)
  signal?: string;           // Termination signal
  command: string;           // Executed command
  duration: number;          // Execution time (ms)
  killed?: boolean;          // Was process killed
}
```

#### SSH Options

```typescript
interface SSHOptions {
  host: string;              // Hostname or IP
  username?: string;         // SSH username
  password?: string;         // SSH password
  privateKey?: string | Buffer; // Private key
  port?: number;             // SSH port (default: 22)
  connectTimeout?: number;   // Connection timeout
  readyTimeout?: number;     // Ready timeout
  keepAliveInterval?: number; // Keep-alive interval
  retries?: number;          // Connection retries
  proxy?: {                  // Jump host
    host: string;
    username?: string;
    // ... same options
  };
}
```

#### Docker Options

```typescript
interface DockerOptions {
  container?: string;        // Container name/ID
  image?: string;            // Image to use
  rm?: boolean;              // Remove after execution
  volumes?: Record<string, string>; // Volume mounts
  env?: Record<string, string>; // Environment variables
  workdir?: string;          // Working directory
  user?: string;             // User to run as
  network?: string;          // Network to use
  ports?: Record<string, string>; // Port mappings
}
```

### Error Types

```typescript
// Base error class
class CommandError extends Error {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

// Timeout error
class TimeoutError extends CommandError {
  timeout: number;
}

// Connection error
class ConnectionError extends Error {
  host: string;
  port: number;
  cause?: Error;
}
```

## 🔄 Migration from Other Tools

### From Google's zx

```javascript
// zx
import { $ } from 'zx';
await $`ls -la`;

// @xec/ush - Same syntax!
import { $ } from '@xec/ush';
await $`ls -la`;

// Key differences:
// 1. Multi-environment support
await $.ssh('server')`ls -la`;     // Not available in zx
await $.docker('container')`ls -la`; // Not available in zx

// 2. Better error handling
await $`cmd`.nothrow();            // More intuitive than zx

// 3. Built-in retry
await $.retry({ maxRetries: 3 })`flaky-command`;

// 4. Connection pooling for SSH
// Automatically handled, not available in zx
```

### From child_process

```javascript
// child_process
const { exec } = require('child_process');
exec('ls -la', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error}`);
    return;
  }
  console.log(`Output: ${stdout}`);
});

// @xec/ush
import { $ } from '@xec/ush';
try {
  const result = await $`ls -la`;
  console.log(`Output: ${result.stdout}`);
} catch (error) {
  console.error(`Error: ${error}`);
}
```

### From ssh2

```javascript
// ssh2
const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('uptime', (err, stream) => {
    if (err) throw err;
    stream.on('data', (data) => {
      console.log('STDOUT: ' + data);
    });
    stream.on('close', () => {
      conn.end();
    });
  });
}).connect({
  host: 'server.com',
  username: 'user',
  privateKey: require('fs').readFileSync('/path/to/key')
});

// @xec/ush
import { $ } from '@xec/ush';
const $remote = $.ssh({
  host: 'server.com',
  username: 'user',
  privateKey: '/path/to/key'
});
const result = await $remote`uptime`;
console.log('STDOUT:', result.stdout);
await $remote.disconnect();
```

## ⚡ Performance Tips

### 1. Connection Reuse

```javascript
// ❌ Inefficient - New connection each time
for (const server of servers) {
  const result = await $.ssh(server)`uptime`;
  console.log(result.stdout);
}

// ✅ Efficient - Reuse connections
const connections = servers.map(s => $.ssh(s));
for (const $conn of connections) {
  const result = await $conn`uptime`;
  console.log(result.stdout);
}
// Cleanup
await Promise.all(connections.map(c => c.disconnect()));
```

### 2. Parallel Execution

```javascript
// ❌ Sequential - Slow
const results = [];
for (const file of files) {
  results.push(await $`process ${file}`);
}

// ✅ Parallel - Fast
const results = await $.parallel(
  files.map(f => $`process ${f}`),
  { concurrency: 4 }  // Limit concurrent processes
);
```

### 3. Streaming for Large Data

```javascript
// ❌ Load everything into memory
const data = await $`cat huge-file.json`;
const parsed = JSON.parse(data.stdout); // May crash!

// ✅ Stream processing
const results = [];
await $.stream`cat huge-file.json`
  .onLine((line) => {
    try {
      const obj = JSON.parse(line);
      results.push(obj.id);
    } catch (e) {
      // Handle malformed lines
    }
  });
```

### 4. Command Batching

```javascript
// ❌ Many small commands
await $`mkdir dir1`;
await $`mkdir dir2`;
await $`mkdir dir3`;

// ✅ Batch into one command
await $`mkdir -p dir1 dir2 dir3`;

// Or use shell features
await $.raw`mkdir -p dir{1..3}`;
```

## 🔒 Security Best Practices

### 1. Input Validation

```javascript
// Always validate user input
function validateFilename(name) {
  // Allow only alphanumeric, dash, underscore, dot
  if (!/^[\w.-]+$/.test(name)) {
    throw new Error('Invalid filename');
  }
  // Prevent directory traversal
  if (name.includes('..')) {
    throw new Error('Directory traversal detected');
  }
  return name;
}

const safeFile = validateFilename(userInput);
await $`cat ${safeFile}`;
```

### 2. Secure Credential Handling

```javascript
// ❌ Don't hardcode credentials
const $db = $.env({ MYSQL_PWD: 'secretpassword123' });

// ✅ Use environment variables
const $db = $.env({ MYSQL_PWD: process.env.DB_PASSWORD });

// ✅ Use secure credential stores
import { getSecret } from '@aws-sdk/client-secrets-manager';
const password = await getSecret('db-password');
const $db = $.env({ MYSQL_PWD: password });
```

### 3. Principle of Least Privilege

```javascript
// Run with minimal permissions
const $limited = $.docker({
  image: 'alpine',
  user: 'nobody',           // Non-root user
  readOnly: true,           // Read-only filesystem
  tmpfs: ['/tmp'],          // Writable temp only
  capabilities: {
    drop: ['ALL'],          // Drop all capabilities
    add: ['NET_BIND_SERVICE'] // Add only needed ones
  }
});
```

### 4. Audit and Logging

```javascript
// Enable comprehensive audit logging
$.configure({
  auditLog: {
    enabled: true,
    file: '/var/log/commands.log',
    includeEnv: false,      // Don't log secrets
    beforeExecute: async (cmd) => {
      // Additional validation
      if (cmd.includes('rm -rf')) {
        await notifyAdmin('Dangerous command attempted');
      }
    }
  }
});
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/example/ush.git
cd ush

# Install dependencies
npm install

# Run tests
npm test

# Run examples
npm run examples
```

## 📄 License

MIT © [Xec Contributors]

---

Made with ❤️ by the Xec team. Happy scripting! 🚀