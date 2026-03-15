---
title: Variables Overview
description: Understanding the variable system in Xec configuration
---

# Variables Overview

Variables provide dynamic configuration values that can be reused throughout your Xec configuration. They enable flexible, DRY (Don't Repeat Yourself) configurations that adapt to different environments and contexts.

## Variable Types

### Simple Variables

```yaml
vars:
  # Strings
  appName: myapp
  environment: production
  
  # Numbers
  port: 8080
  replicas: 3
  timeout: 30000
  
  # Booleans
  debug: false
  enableCache: true
```

### Complex Variables

```yaml
vars:
  # Objects
  database:
    host: db.example.com
    port: 5432
    name: production_db
    credentials:
      username: dbuser
      password: ${secrets.db_password}
  
  # Arrays
  servers:
    - web1.example.com
    - web2.example.com
    - web3.example.com
  
  # Mixed structures
  config:
    features:
      - name: feature-a
        enabled: true
      - name: feature-b
        enabled: false
    settings:
      maxConnections: 100
      timeout: 30s
```

## Variable Interpolation

### Basic Interpolation

```yaml
vars:
  name: myapp
  version: "1.2.3"
  tag: "${name}:${version}"  # Result: myapp:1.2.3

tasks:
  deploy:
    command: docker run ${tag}
```

### Nested Variables

```yaml
vars:
  env: production
  region: us-east-1
  endpoint: "https://api.${region}.example.com/${env}"
  
  database:
    host: db.example.com
    port: 5432
    url: "postgres://${database.host}:${database.port}/mydb"
```

### Array Access

```yaml
vars:
  servers:
    - primary.example.com
    - secondary.example.com
  
  primaryServer: ${servers[0]}
  backupServer: ${servers[1]}
```

## Variable Sources

### 1. Configuration Variables

Defined in `vars` section:

```yaml
vars:
  appName: myapp
  version: "2.0.0"
```

### 2. Environment Variables

Access system environment:

```yaml
vars:
  home: ${env.HOME}
  user: ${env.USER}
  customPath: ${env.CUSTOM_PATH}
  
  # With defaults
  apiUrl: ${env.API_URL:-http://localhost:3000}
  logLevel: ${env.LOG_LEVEL:-info}
```

### 3. Secrets

Access secure values:

```yaml
vars:
  apiKey: ${secrets.api_key}
  dbPassword: ${secrets.database_password}
  sshKey: ${secrets.deploy_key}
```

### 4. Task Parameters

Access task parameters:

```yaml
tasks:
  deploy:
    params:
      - name: version
        required: true
    command: |
      docker pull myapp:${params.version}
      docker run myapp:${params.version}
```

### 5. Runtime Variables

Dynamic values during execution:

```yaml
tasks:
  info:
    command: |
      echo "Profile: ${profile}"
      echo "Target: ${target.name}"
      echo "Task: ${task.name}"
      echo "Date: ${runtime.date}"
```

## Variable Scope

### Global Scope

Available everywhere:

```yaml
vars:
  globalVar: "available-everywhere"

tasks:
  use-global:
    command: echo ${globalVar}

profiles:
  prod:
    vars:
      url: "https://${globalVar}.example.com"
```

### Profile Scope

Override global variables:

```yaml
vars:
  environment: development

profiles:
  production:
    vars:
      environment: production  # Overrides global

tasks:
  show-env:
    command: echo ${environment}  # Uses profile value
```

### Task Scope

Task-specific variables:

```yaml
tasks:
  scoped:
    vars:
      taskVar: "only-in-this-task"
    command: echo ${taskVar}
  
  other:
    command: echo ${taskVar}  # Error: not defined
```

### Step Scope

Step-level variables:

```yaml
tasks:
  multi-step:
    steps:
      - command: echo "test"
        register: output
      
      - command: echo "Result: ${output.stdout}"
        # output only available after registration
```

## Default Values

### Using Defaults

```yaml
vars:
  # With pipe operator
  port: ${env.PORT:-8080}
  
  # Nested defaults
  database:
    host: ${env.DB_HOST:-localhost}
    port: ${env.DB_PORT:-5432}
    name: ${env.DB_NAME:-development}
```

### Conditional Defaults

```yaml
vars:
  environment: ${env.ENV:-development}
  
  # Different defaults per environment
  apiUrl: |
    ${environment == 'production' 
      ? 'https://api.example.com' 
      : 'http://localhost:3000'}
```

## Variable Functions

### String Functions

```yaml
vars:
  name: "My App"
  
  # String manipulation
  lower: ${name.toLowerCase()}        # my app
  upper: ${name.toUpperCase()}        # MY APP
  slug: ${name.replace(' ', '-')}     # My-App
```

### Array Functions

```yaml
vars:
  servers:
    - web1
    - web2
    - web3
  
  serverCount: ${servers.length}      # 3
  firstServer: ${servers[0]}          # web1
  lastServer: ${servers[-1]}          # web3
  serverList: ${servers.join(',')}    # web1,web2,web3
```

### Object Functions

```yaml
vars:
  config:
    host: localhost
    port: 8080
  
  configKeys: ${Object.keys(config)}      # ['host', 'port']
  configValues: ${Object.values(config)}  # ['localhost', 8080]
```

## Computed Variables

### Simple Computation

```yaml
vars:
  base: 8080
  offset: 100
  port: ${base + offset}  # 8180
  
  replicas: 3
  totalReplicas: ${replicas * 2}  # 6
```

### Complex Computation

```yaml
vars:
  environment: production
  region: us-east-1
  
  # Computed URL
  apiEndpoint: |
    https://api-${environment}.${region}.example.com
  
  # Conditional computation
  replicas: |
    ${environment === 'production' ? 5 : 1}
```

## Variable Validation

### Type Validation

```yaml
vars:
  port: ${env.PORT}  # Must be number
  
tasks:
  validate:
    script: |
      if (typeof port !== 'number') {
        throw new Error('Port must be a number');
      }
```

### Required Variables

```yaml
vars:
  required: ${env.REQUIRED_VAR}  # Fails if not set
  optional: ${env.OPTIONAL_VAR:-default}  # Has default
```

## Variable Resolution Order

Variables are resolved in this precedence:

1. **Command-line** - Highest priority
2. **Environment variables** - `XEC_VARS_*`
3. **Profile variables** - Active profile
4. **Task parameters** - Task-specific
5. **Global variables** - Config vars
6. **Defaults** - Lowest priority

## Advanced Patterns

### Variable Templates

```yaml
vars:
  template:
    url: "https://${service}.${environment}.example.com"
  
  services:
    api: ${template.url.replace('${service}', 'api')}
    web: ${template.url.replace('${service}', 'web')}
```

### Dynamic Variable Loading

```yaml
tasks:
  load-config:
    script: |
      const config = await loadExternalConfig();
      xec.setVars({
        dynamicVar: config.value,
        computedVar: config.computed
      });
```

### Variable Inheritance

```yaml
vars:
  base:
    timeout: 30000
    retries: 3
  
  extended:
    $merge: [base]
    timeout: 60000  # Override
    newProp: value   # Add new
```

## Escaping Variables

### Literal Dollar Signs

```yaml
vars:
  # Escape with backslash
  literal: "Price: \$100"
  
  # Or use single quotes
  command: 'echo $HOME'  # Not interpolated
```

### Preventing Interpolation

```yaml
tasks:
  no-interpolation:
    command: |
      # Use $$ for literal $
      echo "$$HOME"
      
      # Or disable interpolation
      $raw: true
      command: echo $HOME ${var}
```

## Best Practices

### 1. Use Descriptive Names

```yaml
# Good
vars:
  apiEndpoint: https://api.example.com
  maxRetries: 3

# Bad
vars:
  url: https://api.example.com
  n: 3
```

### 2. Group Related Variables

```yaml
vars:
  database:
    host: db.example.com
    port: 5432
    name: myapp
  
  cache:
    host: cache.example.com
    port: 6379
```

### 3. Provide Defaults

```yaml
vars:
  # Always provide sensible defaults
  port: ${env.PORT:-8080}
  environment: ${env.NODE_ENV:-development}
```

### 4. Document Variables

```yaml
vars:
  # Maximum number of retry attempts for API calls
  maxRetries: 3
  
  # API endpoint URL (must include protocol)
  apiUrl: https://api.example.com
```

### 5. Validate Early

```yaml
tasks:
  validate-config:
    script: |
      // Validate required variables
      const required = ['apiKey', 'dbPassword'];
      for (const key of required) {
        if (!vars[key]) {
          throw new Error(`Missing required variable: ${key}`);
        }
      }
```

## Common Issues

### Circular References

```yaml
# This causes infinite loop
vars:
  a: ${b}
  b: ${a}  # Error: circular reference
```

### Undefined Variables

```yaml
vars:
  # This fails if MISSING is not defined
  value: ${env.MISSING}
  
  # Use default to prevent failure
  value: ${env.MISSING:-default}
```

### Type Mismatches

```yaml
vars:
  port: "8080"  # String
  
tasks:
  connect:
    # May fail if expecting number
    command: connect --port ${port}
    
    # Better: ensure correct type
    command: connect --port ${parseInt(port)}
```

## Debugging Variables

### Show Resolved Values

```bash
# Show all variables
xec config show --vars

# Show specific variable
xec config get vars.database.host

# Debug interpolation
xec --debug run task
```

### Trace Resolution

```yaml
tasks:
  debug-vars:
    script: |
      console.log('All vars:', vars);
      console.log('Environment:', env);
      console.log('Profile:', profile);
```

## Next Steps

- [Environment Variables](./environment.md) - Using environment variables

## See Also

- [Configuration File](../config-file.md) - Variable definition
- [Profiles](../profiles/overview.md) - Profile-specific variables
- [Best Practices](../advanced/best-practices.md) - Variable patterns