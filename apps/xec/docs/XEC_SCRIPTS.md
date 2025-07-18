# Xec Scripts Documentation

Xec Scripts are powerful JavaScript/TypeScript files that leverage the full capabilities of `@xec-js/ush` for automation and infrastructure management. They are inspired by Google's zx but designed specifically for DevOps workflows.

## Table of Contents
- [Introduction](#introduction)
- [Getting Started](#getting-started)
- [Script Basics](#script-basics)
- [Available Utilities](#available-utilities)
- [Integration with Xec Core](#integration-with-xec-core)
- [Dynamic CLI Commands](#dynamic-cli-commands)
- [Advanced Features](#advanced-features)
- [Examples](#examples)

## Introduction

Xec Scripts provide:
- Full JavaScript/TypeScript support with top-level await
- Enhanced command execution via `@xec-js/ush`
- Integration with Xec recipes and tasks
- Dynamic CLI command registration
- Built-in utilities for common DevOps tasks
- REPL mode for interactive scripting

## Getting Started

### Running Scripts

```bash
# Run a script file
xec deploy.js

# Evaluate inline code
xec -e "console.log('Hello, Xec!')"

# Start interactive REPL
xec --repl

# Watch mode (auto-reload on changes)
xec deploy.js --watch

# Pass arguments to script
xec deploy.js -- --env production --version 1.2.3
```

### Script File Extensions

Xec recognizes these file extensions:
- `.js` - JavaScript files
- `.mjs` - ES modules (recommended for top-level await)
- `.ts` - TypeScript files (transpiled automatically)
- `.md` - Markdown files with embedded code blocks

### Shebang Support

Make scripts executable by adding a shebang:

```javascript
#!/usr/bin/env xec

// Your script code here
await $`echo "Hello from Xec!"`
```

## Script Basics

### Command Execution

The `$` function from `@xec-js/ush` is available globally:

```javascript
// Simple command
const result = await $`ls -la`
console.log(result.stdout)

// With options
const files = await $`find . -name "*.js"`.quiet()

// Error handling
try {
  await $`exit 1`
} catch (error) {
  console.error('Command failed:', error.message)
}
```

### File System Operations

```javascript
// Read file
const content = await fs.readFile('config.json', 'utf-8')

// Write file
await fs.writeFile('output.txt', 'Hello, World!')

// Check existence
if (await fs.exists('data.json')) {
  // Process file
}

// Glob patterns
const jsFiles = await glob('src/**/*.js')
```

### Working Directory

```javascript
// Get current directory
console.log(pwd())

// Change directory
cd('src')

// Scoped directory change
await within({ cwd: '/tmp' }, async () => {
  // Commands run in /tmp
  await $`ls`
})
```

## Available Utilities

### Core Utilities

```javascript
// Sleep
await sleep(1000) // 1 second

// Environment variables
const apiKey = env('API_KEY', 'default-key')
setEnv('NODE_ENV', 'production')

// Exit
exit(0) // Success
exit(1) // Error

// Logging
log.info('Information message')
log.success('Operation completed')
log.warning('Warning message')
log.error('Error occurred')

// Colors
echo(chalk.blue('Blue text'))
echo(chalk.green.bold('Bold green'))
```

### Interactive Prompts

```javascript
// Text input
const name = await question({
  message: 'What is your name?',
  placeholder: 'John Doe'
})

// Confirmation
const proceed = await confirm({
  message: 'Continue deployment?'
})

// Selection
const env = await select({
  message: 'Select environment:',
  options: [
    { value: 'dev', label: 'Development' },
    { value: 'prod', label: 'Production' }
  ]
})

// Multi-select
const features = await multiselect({
  message: 'Select features:',
  options: [
    { value: 'auth', label: 'Authentication' },
    { value: 'api', label: 'API Gateway' },
    { value: 'db', label: 'Database' }
  ]
})

// Password
const secret = await password({
  message: 'Enter password:'
})
```

### Spinner

```javascript
const spinner = spinner('Processing...')
spinner.start()

try {
  await someAsyncOperation()
  spinner.stop('Done!')
} catch (error) {
  spinner.stop('Failed!')
  throw error
}
```

### Retry Logic

```javascript
const result = await retry(
  async () => {
    return await $`curl https://api.example.com/health`
  },
  {
    retries: 3,
    delay: 1000,
    backoff: 2,
    onRetry: (error, attempt) => {
      console.log(`Retry ${attempt}: ${error.message}`)
    }
  }
)
```

### HTTP Requests

```javascript
const response = await fetch('https://api.github.com/user/repos')
const repos = await response.json()
```

### Process Management

```javascript
// List processes
const processes = await ps()

// Kill process
kill(1234, 'SIGTERM')

// Which command
const gitPath = await which('git')
```

## Integration with Xec Core

### Running Recipes

```javascript
// Run a recipe from .xec/recipes
const result = await runRecipe('deploy', {
  environment: 'production',
  version: '1.2.3'
})

if (result.success) {
  log.success('Deployment completed!')
}
```

### Script as Task

Scripts can be used as tasks in recipes:

```javascript
// In your recipe file
import { recipe, scriptTask } from '@xec-js/core'

export default recipe('deploy')
  .task(scriptTask('pre-deploy', {
    path: '.xec/scripts/pre-deploy.js'
  }))
  .task(scriptTask('validate', {
    code: `
      const files = await glob('dist/**/*.js')
      if (files.length === 0) {
        throw new Error('No build files found')
      }
    `
  }))
  .build()
```

### Script Metadata

Define metadata for better integration:

```javascript
// Define script metadata
const script = defineScript()
  .name('deploy-helper')
  .description('Deployment automation script')
  .version('1.0.0')
  .tags('deployment', 'automation')
  .requires('docker', 'kubectl')

// Export tasks for use in recipes
script.task('validate', task('validate')
  .handler(async (ctx) => {
    // Validation logic
  })
)

// Export recipes
script.recipe('quick-deploy', recipe('quick-deploy')
  .task(/* ... */)
  .build()
)

export default script.build()
```

## Dynamic CLI Commands

Scripts can extend the Xec CLI with custom commands:

```javascript
// .xec/commands/custom.js
export function command(program) {
  program
    .command('deploy:status')
    .description('Check deployment status')
    .option('-e, --env <environment>', 'Target environment')
    .action(async (options) => {
      const env = options.env || 'development'
      console.log(`Checking ${env} deployment status...`)
      
      // Your logic here
      const result = await $`kubectl get pods -n ${env}`
      console.log(result.stdout)
    })
}
```

After creating this file, the command is immediately available:

```bash
xec deploy:status --env production
```

## Advanced Features

### TypeScript Support

TypeScript files are automatically transpiled:

```typescript
// deploy.ts
interface DeployConfig {
  environment: string
  version: string
  replicas: number
}

async function deploy(config: DeployConfig): Promise<void> {
  await $`kubectl set image deployment/app app=myapp:${config.version}`
  await $`kubectl scale deployment/app --replicas=${config.replicas}`
}

await deploy({
  environment: 'production',
  version: '1.2.3',
  replicas: 3
})
```

### Markdown Scripts

Write scripts in Markdown for documentation:

````markdown
# Deployment Script

This script handles production deployment.

```javascript
const version = await question({
  message: 'Version to deploy:'
})

await $`docker build -t myapp:${version} .`
await $`docker push myapp:${version}`
```

Additional deployment steps...

```javascript
await $`kubectl apply -f k8s/`
```
````

### Template Strings

```javascript
const config = template`
server {
  listen ${port};
  server_name ${domain};
  root ${path};
}
`

await fs.writeFile('/etc/nginx/sites-available/app', config)
```

### YAML/JSON Utilities

```javascript
// YAML
const { parse, stringify } = await yaml()
const config = parse(await fs.readFile('config.yaml', 'utf-8'))
config.version = '2.0'
await fs.writeFile('config.yaml', stringify(config))

// JSON
const pkg = await fs.readJSON('package.json')
pkg.version = '1.2.3'
await fs.writeJSON('package.json', pkg, { spaces: 2 })
```

### CSV Processing

```javascript
const { parse, stringify } = await csv()
const data = parse(await fs.readFile('data.csv', 'utf-8'))
// Process data
const output = stringify(data)
```

### Diff Comparison

```javascript
const oldContent = await fs.readFile('old.txt', 'utf-8')
const newContent = await fs.readFile('new.txt', 'utf-8')
const changes = await diff(oldContent, newContent)
```

## Examples

### Deployment Script

```javascript
#!/usr/bin/env xec

// Load environment
await loadEnv('.env.production')

// Get deployment parameters
const version = argv[0] || await question({
  message: 'Version to deploy:',
  placeholder: 'latest'
})

const environment = await select({
  message: 'Target environment:',
  options: [
    { value: 'staging', label: 'Staging' },
    { value: 'production', label: 'Production' }
  ]
})

// Confirmation
const confirmed = await confirm({
  message: `Deploy ${version} to ${environment}?`
})

if (!confirmed) {
  exit(0)
}

// Build and push
const buildSpinner = spinner('Building Docker image...')
buildSpinner.start()

try {
  await $`docker build -t myapp:${version} .`
  await $`docker push myapp:${version}`
  buildSpinner.stop('Build completed')
} catch (error) {
  buildSpinner.stop('Build failed')
  throw error
}

// Deploy
const deploySpinner = spinner('Deploying to Kubernetes...')
deploySpinner.start()

try {
  cd('k8s')
  await $`kubectl set image deployment/app app=myapp:${version} -n ${environment}`
  await $`kubectl rollout status deployment/app -n ${environment}`
  deploySpinner.stop('Deployment completed')
} catch (error) {
  deploySpinner.stop('Deployment failed')
  log.error('Rolling back...')
  await $`kubectl rollout undo deployment/app -n ${environment}`
  throw error
}

log.success(`Successfully deployed ${version} to ${environment}`)
```

### Backup Script

```javascript
#!/usr/bin/env xec

const date = new Date().toISOString().split('T')[0]
const backupDir = `/backups/${date}`

// Create backup directory
await fs.ensureDir(backupDir)

// Backup database
log.info('Backing up database...')
await $`pg_dump -h localhost -U postgres mydb > ${backupDir}/database.sql`

// Backup files
log.info('Backing up files...')
await $`tar -czf ${backupDir}/files.tar.gz /var/www/uploads`

// Upload to S3
log.info('Uploading to S3...')
await $`aws s3 sync ${backupDir} s3://my-backups/${date}/`

// Clean old backups (keep last 7 days)
const oldBackups = await glob('/backups/*')
for (const backup of oldBackups) {
  const backupDate = path.basename(backup)
  const age = Date.now() - new Date(backupDate).getTime()
  if (age > 7 * 24 * 60 * 60 * 1000) {
    await fs.remove(backup)
    log.info(`Removed old backup: ${backup}`)
  }
}

log.success('Backup completed successfully')
```

### Health Check Script

```javascript
#!/usr/bin/env xec

const services = [
  { name: 'API', url: 'https://api.example.com/health' },
  { name: 'Web', url: 'https://www.example.com' },
  { name: 'Database', check: async () => {
    await $`pg_isready -h localhost -p 5432`
  }}
]

const results = []

for (const service of services) {
  const spinner = spinner(`Checking ${service.name}...`)
  spinner.start()
  
  try {
    if (service.url) {
      const response = await fetch(service.url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    } else if (service.check) {
      await service.check()
    }
    
    spinner.stop(`${service.name}: ${chalk.green('✓ Healthy')}`)
    results.push({ service: service.name, status: 'healthy' })
  } catch (error) {
    spinner.stop(`${service.name}: ${chalk.red('✗ Unhealthy')}`)
    results.push({ service: service.name, status: 'unhealthy', error: error.message })
  }
}

// Summary
const healthy = results.filter(r => r.status === 'healthy').length
const total = results.length

if (healthy === total) {
  log.success(`All services are healthy (${healthy}/${total})`)
  exit(0)
} else {
  log.error(`Some services are unhealthy (${healthy}/${total})`)
  exit(1)
}
```

## Best Practices

1. **Use shebang** for executable scripts
2. **Handle errors** with try-catch blocks
3. **Use spinners** for long-running operations
4. **Validate input** before processing
5. **Log progress** for better visibility
6. **Use environment variables** for configuration
7. **Implement retry logic** for network operations
8. **Clean up resources** in finally blocks
9. **Document scripts** with comments or Markdown
10. **Test scripts** in dry-run mode when possible

## Troubleshooting

### Common Issues

1. **Module not found**: Ensure dependencies are installed
2. **Permission denied**: Check file permissions or use sudo
3. **Command not found**: Verify PATH or use full paths
4. **Syntax errors**: Check for async/await usage
5. **TypeScript errors**: Ensure types are properly defined

### Debug Mode

Enable debug output:

```bash
XEC_DEBUG=1 xec deploy.js
```

### REPL Exploration

Use REPL to test commands:

```bash
xec --repl
xec> await $`ls`
xec> const files = await glob('*.js')
xec> .exit
```