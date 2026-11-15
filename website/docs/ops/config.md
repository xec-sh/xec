---
sidebar_position: 8
sidebar_label: Configuration
title: Configuration Management
description: Loading, validating and interpolating .xec configuration
---

# Configuration Management {#configuration-management}

Fully customizable multi-source configuration with profiles, variable interpolation, and secret resolution.

## Basic Usage {#basic-usage}

```typescript
import { ConfigurationManager } from '@xec-sh/ops';

const manager = new ConfigurationManager({
  projectRoot: process.cwd(),
});

const config = await manager.load();
console.log(config.targets);
console.log(config.tasks);
```

## Full Customization {#full-customization}

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
    version: '1.0',
    commands: { run: { defaultTimeout: '60s' } },
  },

  // Environment variable prefix
  envPrefix: 'MYAPP_',                              // Default: 'XEC_'

  // Secrets
  secretProvider: {
    type: 'env',
  },
});
```

## Config Sources (Priority Order) {#config-sources-priority-order}

1. **Active profile** (e.g., `.myapp/environments/staging.yaml`)
2. **Environment overrides** (`MYAPP_*` or `XEC_*`)
3. **File selected by the prefixed `CONFIG` environment variable**
4. **Project config** (e.g., `.myapp/config.yaml`)
5. **Global config** (e.g., `/etc/myapp/config.yaml`)
6. **Built-in and caller-supplied defaults**

Higher priority sources override lower ones. Nested objects are deep-merged. Project discovery loads the first matching config file, including the root file names when no earlier candidate exists.

## Variable Interpolation {#variable-interpolation}

```yaml
# config.yaml
vars:
  app_name: myapp
  version: "1.0.0"

targets:
  hosts:
    production:
      host: "${env.PROD_HOST}"
      user: "${env.PROD_USER}"

tasks:
  deploy:
    command: "docker image inspect ${vars.app_name}:${vars.version}"
```

## Secret Resolution {#secret-resolution}

```yaml
# config.yaml
targets:
  hosts:
    production:
      host: prod.example.com
      password: "${secrets.ssh_password}"   # Resolved from the configured provider
```

Implemented secret providers are `local`, `env` and `git`. A provider name in a
type union is not an implementation: Vault, AWS Secrets Manager and 1Password
are not available through this manager. Do not substitute a missing secret with
an empty value. See [secret storage](./secrets.md).

Use `strict: true` with an explicit `configFilePath` for admission checks. The
0.13.0 non-strict loader can skip malformed YAML and continue with defaults;
see [validation](../configuration/advanced/validation.md).

## Saving Configuration {#saving-configuration}

```typescript
import { ConfigurationManager } from '@xec-sh/ops';

const manager = new ConfigurationManager({ projectRoot: process.cwd() });
await manager.load();
manager.set('vars.app_name', 'myapp');
await manager.save();
await manager.save('/custom/path/config.yaml');
```
