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

Array elements are addressed with dot-index notation (bracket syntax like `${servers[0]}` is not supported):

```yaml
vars:
  servers:
    - primary.example.com
    - secondary.example.com
  
  primaryServer: ${servers.0}
  backupServer: ${servers.1}
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
  
  # With defaults (everything after ':' is the default)
  apiUrl: ${env.API_URL:http://localhost:3000}
  logLevel: ${env.LOG_LEVEL:info}
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

### 5. Command Substitution

`${cmd:command}` runs a shell command **at configuration load time** and substitutes its trimmed stdout:

```yaml
vars:
  git_sha: ${cmd:git rev-parse --short HEAD}
  build_date: ${cmd:date +%Y-%m-%d}
  current_user: ${cmd:whoami}
```

Keep these commands fast — they execute on every configuration load. If the command fails, loading fails with a descriptive error. The resolved output is never written back to disk when the configuration is saved.

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

Tasks do not have their own `vars:` section — use task parameters with defaults for task-local values:

```yaml
tasks:
  scoped:
    params:
      - name: taskVar
        default: "only-in-this-task"
    command: echo ${params.taskVar}
```

### Step Scope

A step's output can be registered as a variable for later steps. The registered value is the step's **trimmed output as a string**:

```yaml
tasks:
  multi-step:
    steps:
      - command: echo "test"
        register: output
      
      - command: echo "Result: ${output}"
        # output only available after registration
```

## Default Values

Defaults use a plain colon — everything after the first `:` is the default value. Bash-style `:-` is **not** supported (with `${env.PORT:-8080}` the default would literally be `-8080`):

```yaml
vars:
  port: ${env.PORT:8080}
  
  # Nested defaults
  database:
    host: ${env.DB_HOST:localhost}
    port: ${env.DB_PORT:5432}
    name: ${env.DB_NAME:development}
```

A reference without a default fails configuration loading when it cannot be resolved:

```yaml
vars:
  required: ${env.REQUIRED_VAR}       # Fails if not set
  optional: ${env.OPTIONAL_VAR:default}  # Has default
```

## What Interpolation Can and Cannot Do

Interpolation is a **path lookup**, not an expression language. There are no method calls, arithmetic, or ternaries inside `${...}`:

```yaml
vars:
  name: "My App"
  servers: [web1, web2, web3]

  first: ${servers.0}              # ✅ path lookup
  greeting: "Hello ${name}"        # ✅ string composition
  # lower: ${name.toLowerCase()}   # ❌ not supported
  # port: ${base + offset}         # ❌ not supported
  # replicas: ${env == 'prod' ? 5 : 1}  # ❌ not supported
```

For computed values, run a shell command at load time with `${cmd:...}`:

```yaml
vars:
  name: "My App"
  slug: ${cmd:echo "My App" | tr ' ' '-' | tr '[:upper:]' '[:lower:]'}
  host_count: ${cmd:wc -l < hosts.txt}
```

Conditional logic belongs in task `when:` clauses (which support `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&`, `||`, `!`, and parentheses) or in script steps.

## Variable Resolution Order

Configuration sources are merged in this order — later sources override earlier ones:

1. **Built-in defaults** - Lowest priority
2. **Global configuration** - `~/.xec/config.yaml`
3. **Project configuration** - `.xec/config.yaml` (or `xec.yaml`)
4. **`XEC_CONFIG` file** - Extra file referenced by the environment variable
5. **`XEC_*` environment variables** - e.g. `XEC_VARS_PORT=9000` sets `vars.port`
6. **Active profile** - Selected via `XEC_PROFILE`; highest priority

Task parameters (`${params.name}`) are supplied per invocation and resolved in their own namespace, outside this merge.

## Escaping Variables

Only `${...}` sequences are interpolated. To output a literal `${...}`, escape it with a backslash:

```yaml
vars:
  literal: "costs \${amount} dollars"   # stays ${amount}
  price: "Price: $100"                  # no ${...}, left untouched
  command: echo $HOME                   # shell variable, untouched by Xec
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
  port: ${env.PORT:8080}
  environment: ${env.NODE_ENV:development}
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

References without defaults fail configuration loading when unresolvable, so required values surface immediately:

```yaml
vars:
  apiKey: ${secrets.api_key}       # load fails if the secret is missing
  dbHost: ${env.DB_HOST}           # load fails if DB_HOST is not set
```

```bash
# Check the configuration before running tasks
xec config validate
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
  value: ${env.MISSING:default}
```

### Type Mismatches

A variable that holds the whole value keeps its YAML type (number, boolean, object); a variable embedded in a longer string is stringified:

```yaml
vars:
  port: 8080         # Number — stays a number in ${port}
  portString: "8080" # String

tasks:
  connect:
    command: connect --port ${port}
```

## Debugging Variables

### Show Resolved Values

```bash
# Show all variables
xec config list --path vars

# Show specific variable
xec config get vars.database.host

# Debug configuration loading
XEC_DEBUG=true xec run task
```

## Next Steps

- [Environment Variables](./environment.md) - Using environment variables

## See Also

- [Configuration File](../config-file.md) - Variable definition
- [Profiles](../profiles/overview.md) - Profile-specific variables
- [Best Practices](../advanced/best-practices.md) - Variable patterns