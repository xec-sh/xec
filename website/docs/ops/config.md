---
sidebar_position: 8
sidebar_label: Configuration
title: Configuration Management
---

# Configuration Management

Fully customizable multi-source configuration with profiles, variable interpolation, and secret resolution.

## Basic Usage

```typescript
import { ConfigurationManager } from '@xec-sh/ops';

const manager = new ConfigurationManager({
  projectRoot: process.cwd(),
});

const config = await manager.load();
console.log(config.targets);
console.log(config.tasks);
```

## Full Customization

Every aspect of configuration loading is customizable:

```typescript
const manager = new ConfigurationManager({
  // Where to look
  projectRoot: '/my/project',
  globalHomeDir: '/etc/myapp',

  // Config directory and file names
  configDirName: '.myapp',                         // Default: '.xec'
  configFileNames: ['config.yaml', 'config.toml'], // Default: ['config.yaml', 'config.yml']
  rootConfigFileNames: ['myapp.yaml'],              // Default: ['xec.yaml', 'xec.yml']

  // Profiles
  profile: 'staging',
  profilesDirName: 'environments',                  // Default: 'profiles'

  // Storage paths
  secretsDir: '/var/secrets/myapp',
  moduleCacheDir: '/tmp/myapp-cache',

  // Additional config search paths
  extraConfigPaths: ['/etc/myapp/global.yaml'],

  // Custom defaults
  defaults: {
    version: '2.0',
    commands: { run: { defaultTimeout: '60s' } },
  },

  // Environment variable prefix
  envPrefix: 'MYAPP_',                              // Default: 'XEC_'

  // Secrets
  secretProvider: {
    type: 'vault',
    config: { addr: 'https://vault.example.com' },
  },
});
```

## Config Sources (Priority Order)

1. **Environment variables** (`MYAPP_*` or `XEC_*`)
2. **Active profile** (e.g., `.myapp/environments/staging.yaml`)
3. **Project config** (e.g., `.myapp/config.yaml`)
4. **Root config** (e.g., `myapp.yaml`)
5. **Global config** (e.g., `/etc/myapp/config.yaml`)
6. **Built-in defaults**

Higher priority sources override lower ones. Deep merge is used for nested objects.

## Variable Interpolation

```yaml
# config.yaml
vars:
  app_name: myapp
  version: "1.0.0"

targets:
  production:
    type: ssh
    host: "${PROD_HOST}"
    username: "${PROD_USER}"

tasks:
  deploy:
    command: "docker pull ${app_name}:${version}"
```

## Secret Resolution

```yaml
# config.yaml
targets:
  production:
    type: ssh
    host: prod.example.com
    password: "${secret:ssh_password}"    # Resolved from secret manager
```

## Saving Configuration

```typescript
await manager.save({ version: '2.0' });
await manager.save({ version: '2.0' }, '/custom/path/config.yaml');
```
