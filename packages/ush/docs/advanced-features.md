# Advanced Features

## Stream Processing

Process command output in real-time as it arrives:

### Basic Stream Processing

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
```

### Real-time Log Monitoring

```javascript
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

### Advanced Stream Patterns

```javascript
// Parse structured logs
await $.stream`tail -f app.log`
  .onLine((line) => {
    try {
      const log = JSON.parse(line);
      if (log.level === 'error') {
        console.error(`[${log.timestamp}] ${log.message}`);
      }
    } catch (e) {
      // Handle non-JSON lines
    }
  });

// Aggregate data from stream
const stats = { errors: 0, warnings: 0, info: 0 };
await $.stream`cat logs/*.log`
  .onLine((line) => {
    if (line.includes('[ERROR]')) stats.errors++;
    else if (line.includes('[WARN]')) stats.warnings++;
    else if (line.includes('[INFO]')) stats.info++;
  })
  .onComplete(() => console.log('Log stats:', stats));
```

## Parallel Execution

Execute multiple commands concurrently:

### Basic Parallel Execution

```javascript
// Run commands in parallel
const results = await $.parallel([
  $`curl https://api1.com`,
  $`curl https://api2.com`,
  $`curl https://api3.com`
]);
```

### Concurrency Control

```javascript
// With concurrency limit
const files = ['file1.txt', 'file2.txt', 'file3.txt', /* ... more files */];
await $.parallel(
  files.map(f => $`process-file ${f}`),
  { concurrency: 2 } // Max 2 commands at once
);
```

### Mixed Environment Parallel Execution

```javascript
// Parallel with different configurations
await $.parallel([
  $`npm test`.cwd('./package1'),
  $`npm test`.cwd('./package2'),
  $.ssh('server1')`npm test`,
  $.docker('app')`npm test`
]);
```

### Parallel with Error Handling

```javascript
// Handle partial failures
const results = await $.parallel(
  servers.map(server => 
    $.ssh(server)`health-check`.nothrow()
  )
);

const healthy = results.filter(r => r.exitCode === 0);
const unhealthy = results.filter(r => r.exitCode !== 0);

console.log(`Healthy servers: ${healthy.length}`);
console.log(`Unhealthy servers: ${unhealthy.length}`);
```

## Command Templates

Create reusable, parameterized commands:

### Basic Templates

```javascript
// Define reusable command templates
const gitCommit = $.template`git commit -m ${0}`;
await gitCommit('Initial commit');
await gitCommit('Add new feature');
```

### Multi-parameter Templates

```javascript
// Templates with multiple parameters
const deploy = $.template`
  rsync -avz ${0} ${1}@${2}:${3}
  ssh ${1}@${2} "cd ${3} && npm install --production"
`;
await deploy('./dist', 'user', 'server.com', '/var/www/app');
```

### Validated Templates

```javascript
// Validated templates
const backup = $.template`mysqldump ${0} > backup-${1}.sql`
  .validate((args) => {
    if (!args[0]) throw new Error('Database name required');
    if (!args[1]) args[1] = new Date().toISOString().split('T')[0];
    return args;
  });

await backup('mydb', '2024-01-01');
```

### Dynamic Templates

```javascript
// Build commands dynamically
function createDeployTemplate(env) {
  const config = getConfig(env);
  return $.template`
    docker build -t ${config.image}:${0} .
    docker push ${config.image}:${0}
    kubectl set image deployment/${config.app} app=${config.image}:${0}
  `;
}

const deployProd = createDeployTemplate('production');
await deployProd('v1.2.3');
```

## Pipe Operations

Chain commands Unix-style:

### Basic Pipes

```javascript
// Unix-style pipes
const result = await $.pipe(
  $`cat data.txt`,
  $`grep "ERROR"`,
  $`wc -l`
);
console.log(`Error count: ${result.stdout.trim()}`);
```

### Error Handling in Pipes

```javascript
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
```

### Conditional Pipes

```javascript
// Conditional pipes
const processData = async (file, hasHeaders) => {
  const commands = [$`cat ${file}`];
  if (hasHeaders) commands.push($`tail -n +2`); // Skip header
  commands.push($`sort`, $`uniq`);
  return await $.pipe(...commands);
};
```

## Context Management

Execute multiple commands in the same context:

### Basic Context

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
```

### Context with Configuration

```javascript
// Context with configuration
await $.within({ 
  cwd: '/tmp',
  env: { DEBUG: 'true' }
}, async ($) => {
  await $`npm install`;
  await $`npm test`;
});
```

### Nested Contexts

```javascript
// Nested contexts
await $.within({ cwd: '/app' }, async ($outer) => {
  await $outer`npm install`;
  
  await $.within({ env: { NODE_ENV: 'test' }}, async ($inner) => {
    await $inner`npm test`;
  });
  
  await $outer`npm build`; // Back to outer context
});
```

## Progress Tracking

Monitor long-running operations:

### Basic Progress

```javascript
// Track long-running operations
await $`npm install`.progress({
  onStart: () => console.log('Installing dependencies...'),
  onProgress: (percent) => console.log(`Progress: ${percent}%`),
  onComplete: () => console.log('Installation complete!')
});
```

### Custom Progress Parsing

```javascript
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
```

### Spinner Progress

```javascript
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

## Temporary Files and Directories

Work with auto-cleanup temporary resources:

### Temporary Directories

```javascript
// Auto-cleanup temporary directory
await $.withTempDir(async (tmpDir) => {
  await $`cd ${tmpDir} && git clone https://github.com/user/repo`;
  await $`cd ${tmpDir}/repo && npm install`;
  await $`cd ${tmpDir}/repo && npm test`;
  // tmpDir is automatically removed after this block
});
```

### Temporary Files

```javascript
// Temporary file
await $.withTempFile(async (tmpFile) => {
  await $`curl https://example.com/data > ${tmpFile}`;
  await $`process-data < ${tmpFile}`;
  // tmpFile is automatically removed after this block
});
```

### Custom Temp Options

```javascript
// Custom temp options
await $.withTempDir({
  prefix: 'build-',
  cleanup: false  // Keep directory for debugging
}, async (tmpDir) => {
  console.log(`Working in: ${tmpDir}`);
  await $`cd ${tmpDir} && make`;
});
```

## Interactive Features

Build interactive CLI tools:

### User Confirmation

```javascript
// User confirmation
const proceed = await $.confirm('Deploy to production?');
if (proceed) {
  await $`npm run deploy:prod`;
}
```

### User Input

```javascript
// User input
const name = await $.prompt('Enter your name:');
await $`echo "Hello, ${name}!" > greeting.txt`;

// Password input (hidden)
const password = await $.password('Enter password:');
await $`mysql -u root -p${password} < backup.sql`.quiet();
```

### Selection Menu

```javascript
// Selection menu
const env = await $.select('Choose environment:', [
  'development',
  'staging', 
  'production'
]);
await $`deploy-to ${env}`;
```

## Audit Logging

Track all executed commands:

### Basic Audit Configuration

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
```

### Query Audit Log

```javascript
// Query audit log
const audit = $.getAuditLogger();
const recentCommands = audit.query({
  startTime: Date.now() - 3600000, // Last hour
  adapter: 'ssh',
  exitCode: 0  // Only successful
});
```

### Custom Audit Logger

```javascript
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

## Advanced Patterns

### Command Builder Pattern

```javascript
class CommandBuilder {
  constructor() {
    this.commands = [];
  }
  
  add(cmd) {
    this.commands.push(cmd);
    return this;
  }
  
  addIf(condition, cmd) {
    if (condition) this.commands.push(cmd);
    return this;
  }
  
  async execute() {
    for (const cmd of this.commands) {
      await $`${cmd}`;
    }
  }
}

const builder = new CommandBuilder()
  .add('npm install')
  .addIf(process.env.CI, 'npm audit')
  .add('npm test')
  .addIf(process.env.DEPLOY, 'npm run deploy');

await builder.execute();
```

### Resource Pool Pattern

```javascript
class SSHPool {
  constructor(servers) {
    this.connections = servers.map(s => $.ssh(s));
    this.index = 0;
  }
  
  getNext() {
    const conn = this.connections[this.index];
    this.index = (this.index + 1) % this.connections.length;
    return conn;
  }
  
  async execute(command) {
    const conn = this.getNext();
    return await conn`${command}`;
  }
  
  async cleanup() {
    await Promise.all(
      this.connections.map(c => c.disconnect())
    );
  }
}

const pool = new SSHPool(['server1', 'server2', 'server3']);
// Load balanced execution
await pool.execute('process-job-1');
await pool.execute('process-job-2');
await pool.cleanup();
```

## Next Steps

- Explore [Real-world Examples](./examples.md)
- Read [Best Practices](./best-practices.md)
- See [API Reference](./api-reference.md)