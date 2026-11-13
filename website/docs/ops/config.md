---
sidebar_position: 8
sidebar_label: Configuration
title: Configuration Management
description: Loading, validating and interpolating .xec configuration
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
import { ConfigurationManager } from '@xec-sh/ops';

const manager = new ConfigurationManager({
  // Where to look
  projectRoot: '/my/project',
  globalHomeDir: '/etc/myapp',

  // Config directory and file names
  configDirName: '.myapp',                         // Default: '.xec'
  configFileNames: ['config.yaml', 'config.yml'], // Default: ['config.yaml', 'config.yml']
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
4. **Global config** (e.g., `/etc/myapp/config.yaml`)
5. **Built-in defaults**

Higher priority sources override lower ones. Nested objects are deep-merged. Project discovery loads the first matching config file, including the root file names when no earlier candidate exists.

## Variable Interpolation

```yaml
# config.yaml
vars:
  app_name: myapp
  version: "1.0.0"

targets:
  hosts:
    production:
      host: "${env.PROD_HOST}"
      username: "${env.PROD_USER}"

tasks:
  deploy:
    command: "docker pull ${app_name}:${version}"
```

## Secret Resolution

```yaml
# config.yaml
targets:
  hosts:
    production:
      host: prod.example.com
      password: "${secret:ssh_password}"    # Resolved from secret manager
```

## Saving Configuration

```typescript
import { ConfigurationManager } from '@xec-sh/ops';

const manager = new ConfigurationManager({ projectRoot: process.cwd() });
await manager.load();
manager.set('vars.app_name', 'myapp');
await manager.save();
await manager.save('/custom/path/config.yaml');
```
