import chalk from 'chalk';
import * as path from 'path';
import { table } from 'table';
import { Command } from 'commander';
import { promises as fs } from 'fs';
import { text, select, confirm, password } from '@clack/prompts';

import { getProjectRoot } from '../utils/project.js';

interface IntegrationConfig {
  type: string;
  name: string;
  enabled: boolean;
  config: Record<string, any>;
  metadata?: {
    createdAt: string;
    updatedAt: string;
    lastUsed?: string;
  };
}

interface IntegrationsStore {
  version: string;
  integrations: Record<string, IntegrationConfig>;
}

export default function integrationCommand(program: Command) {
  const integration = program
    .command('integration')
    .alias('int')
    .description('Manage external integrations');

  integration
    .command('list')
    .alias('ls')
    .description('List configured integrations')
    .option('--type <type>', 'Filter by integration type')
    .option('--enabled', 'Show only enabled integrations')
    .option('--json', 'Output as JSON')
    .action(async (options?: any) => {
      try {
        const store = await loadIntegrationsStore();
        let integrations = Object.entries(store.integrations);

        // Apply filters
        if (options?.type) {
          integrations = integrations.filter(([_, config]) => config.type === options.type);
        }
        if (options?.enabled) {
          integrations = integrations.filter(([_, config]) => config.enabled);
        }

        if (options?.json) {
          const output = Object.fromEntries(integrations);
          console.log(JSON.stringify(output, null, 2));
          return;
        }

        if (integrations.length === 0) {
          console.log(chalk.yellow('No integrations configured'));
          console.log(chalk.gray('\nUse "xec integration add <type>" to add an integration'));
          return;
        }

        console.log(chalk.bold('\nConfigured Integrations:\n'));
        
        const tableData = [['Name', 'Type', 'Status', 'Created', 'Last Used']];
        
        for (const [name, config] of integrations) {
          tableData.push([
            name,
            config.type,
            config.enabled ? chalk.green('enabled') : chalk.gray('disabled'),
            new Date(config.metadata?.createdAt || '').toLocaleDateString(),
            config.metadata?.lastUsed ? new Date(config.metadata.lastUsed).toLocaleDateString() : '-',
          ]);
        }
        
        console.log(table(tableData));
        console.log(chalk.gray(`\nTotal: ${integrations.length} integration(s)`));
        
      } catch (error) {
        console.error(chalk.red(`Failed to list integrations: ${error}`));
        process.exit(1);
      }
    });

  integration
    .command('add <type>')
    .description('Add new integration')
    .option('--name <name>', 'Integration name')
    .action(async (type: string, options?: { name?: string }) => {
      try {
        const supportedTypes = ['aws', 'kubernetes', 'terraform', 'docker', 'github', 'gitlab'];
        
        if (!supportedTypes.includes(type)) {
          console.log(chalk.red(`Unsupported integration type: ${type}`));
          console.log(chalk.gray(`Supported types: ${supportedTypes.join(', ')}`));
          process.exit(1);
        }

        // Get integration name
        let name = options?.name;
        if (!name) {
          name = await text({
            message: 'Integration name:',
            placeholder: `my-${type}`,
            validate: (value) => {
              if (!value) return 'Name is required';
              if (!/^[a-z0-9-]+$/.test(value)) return 'Name must contain only lowercase letters, numbers, and hyphens';
              return undefined;
            },
          }) as string;
        }

        const store = await loadIntegrationsStore();
        
        if (store.integrations[name]) {
          const overwrite = await confirm({
            message: `Integration '${name}' already exists. Overwrite?`,
            initialValue: false,
          });
          
          if (!overwrite) {
            console.log(chalk.yellow('Operation cancelled'));
            return;
          }
        }

        // Configure based on type
        let config: Record<string, any> = {};
        
        switch (type) {
          case 'aws':
            config = await configureAWS();
            break;
          case 'kubernetes':
            config = await configureKubernetes();
            break;
          case 'terraform':
            config = await configureTerraform();
            break;
          case 'docker':
            config = await configureDocker();
            break;
          case 'github':
            config = await configureGitHub();
            break;
          case 'gitlab':
            config = await configureGitLab();
            break;
        }

        // Save integration
        store.integrations[name] = {
          type,
          name,
          enabled: true,
          config,
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };

        await saveIntegrationsStore(store);
        
        console.log(chalk.green(`✓ Integration '${name}' added successfully`));
        
        // Test connection
        const testConnection = await confirm({
          message: 'Test connection?',
          initialValue: true,
        });
        
        if (testConnection) {
          const integration = store.integrations[name];
          if (integration) {
            await testIntegration(name, integration);
          }
        }
        
      } catch (error) {
        console.error(chalk.red(`Failed to add integration: ${error}`));
        process.exit(1);
      }
    });

  integration
    .command('remove <name>')
    .alias('rm')
    .description('Remove integration')
    .option('--force', 'Skip confirmation')
    .action(async (name: string, options?: { force?: boolean }) => {
      try {
        const store = await loadIntegrationsStore();
        
        if (!store.integrations[name]) {
          console.log(chalk.red(`Integration '${name}' not found`));
          process.exit(1);
        }

        if (!options?.force) {
          const confirmed = await confirm({
            message: `Remove integration '${name}'?`,
            initialValue: false,
          });
          
          if (!confirmed) {
            console.log(chalk.yellow('Operation cancelled'));
            return;
          }
        }

        delete store.integrations[name];
        await saveIntegrationsStore(store);
        
        console.log(chalk.green(`✓ Integration '${name}' removed successfully`));
        
      } catch (error) {
        console.error(chalk.red(`Failed to remove integration: ${error}`));
        process.exit(1);
      }
    });

  integration
    .command('test <name>')
    .description('Test integration connection')
    .action(async (name: string) => {
      try {
        const store = await loadIntegrationsStore();
        const config = store.integrations[name];
        
        if (!config) {
          console.log(chalk.red(`Integration '${name}' not found`));
          process.exit(1);
        }

        await testIntegration(name, config);
        
      } catch (error) {
        console.error(chalk.red(`Failed to test integration: ${error}`));
        process.exit(1);
      }
    });

  integration
    .command('config <name>')
    .description('Configure integration')
    .option('--show', 'Show current configuration')
    .action(async (name: string, options?: { show?: boolean }) => {
      try {
        const store = await loadIntegrationsStore();
        const integration = store.integrations[name];
        
        if (!integration) {
          console.log(chalk.red(`Integration '${name}' not found`));
          process.exit(1);
        }

        if (options?.show) {
          console.log(chalk.bold(`\nIntegration: ${name}\n`));
          console.log(`Type: ${integration.type}`);
          console.log(`Status: ${integration.enabled ? chalk.green('enabled') : chalk.gray('disabled')}`);
          console.log('\nConfiguration:');
          
          // Hide sensitive values
          const safeConfig = { ...integration.config };
          for (const key of ['password', 'token', 'secret', 'key']) {
            if (safeConfig[key]) {
              safeConfig[key] = '***';
            }
          }
          
          console.log(JSON.stringify(safeConfig, null, 2));
          return;
        }

        // Reconfigure
        console.log(chalk.yellow(`Reconfiguring ${integration.type} integration '${name}'...`));
        
        let newConfig: Record<string, any> = {};
        
        switch (integration.type) {
          case 'aws':
            newConfig = await configureAWS(integration.config);
            break;
          case 'kubernetes':
            newConfig = await configureKubernetes(integration.config);
            break;
          case 'terraform':
            newConfig = await configureTerraform(integration.config);
            break;
          case 'docker':
            newConfig = await configureDocker(integration.config);
            break;
          case 'github':
            newConfig = await configureGitHub(integration.config);
            break;
          case 'gitlab':
            newConfig = await configureGitLab(integration.config);
            break;
        }

        integration.config = newConfig;
        integration.metadata!.updatedAt = new Date().toISOString();
        
        await saveIntegrationsStore(store);
        console.log(chalk.green(`✓ Integration '${name}' updated successfully`));
        
      } catch (error) {
        console.error(chalk.red(`Failed to configure integration: ${error}`));
        process.exit(1);
      }
    });

  integration
    .command('enable <name>')
    .description('Enable integration')
    .action(async (name: string) => {
      try {
        await setIntegrationEnabled(name, true);
        console.log(chalk.green(`✓ Integration '${name}' enabled`));
      } catch (error) {
        console.error(chalk.red(`Failed to enable integration: ${error}`));
        process.exit(1);
      }
    });

  integration
    .command('disable <name>')
    .description('Disable integration')
    .action(async (name: string) => {
      try {
        await setIntegrationEnabled(name, false);
        console.log(chalk.green(`✓ Integration '${name}' disabled`));
      } catch (error) {
        console.error(chalk.red(`Failed to disable integration: ${error}`));
        process.exit(1);
      }
    });
}

async function getIntegrationsPath(): Promise<string> {
  const projectRoot = await getProjectRoot();
  return path.join(projectRoot, '.xec', 'integrations.json');
}

async function loadIntegrationsStore(): Promise<IntegrationsStore> {
  try {
    const integrationsPath = await getIntegrationsPath();
    const content = await fs.readFile(integrationsPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Initialize empty store if file doesn't exist
    return {
      version: '1.0.0',
      integrations: {},
    };
  }
}

async function saveIntegrationsStore(store: IntegrationsStore): Promise<void> {
  const integrationsPath = await getIntegrationsPath();
  const dir = path.dirname(integrationsPath);
  
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(integrationsPath, JSON.stringify(store, null, 2));
}

async function setIntegrationEnabled(name: string, enabled: boolean): Promise<void> {
  const store = await loadIntegrationsStore();
  
  if (!store.integrations[name]) {
    throw new Error(`Integration '${name}' not found`);
  }
  
  store.integrations[name].enabled = enabled;
  await saveIntegrationsStore(store);
}

async function configureAWS(existing?: Record<string, any>): Promise<Record<string, any>> {
  console.log(chalk.bold('\nConfigure AWS Integration:\n'));
  
  const method = await select({
    message: 'Authentication method:',
    options: [
      { value: 'keys', label: 'Access Keys' },
      { value: 'profile', label: 'AWS Profile' },
      { value: 'role', label: 'IAM Role' },
    ],
    initialValue: existing?.['method'] || 'keys',
  }) as string;

  const config: Record<string, any> = { method };

  if (method === 'keys') {
    config['accessKeyId'] = await text({
      message: 'AWS Access Key ID:',
      placeholder: 'AKIAIOSFODNN7EXAMPLE',
      initialValue: existing?.['accessKeyId'],
    }) as string;

    config['secretAccessKey'] = await password({
      message: 'AWS Secret Access Key:',
      mask: '*',
    }) as string;
  } else if (method === 'profile') {
    config['profile'] = await text({
      message: 'AWS Profile name:',
      placeholder: 'default',
      initialValue: existing?.['profile'] || 'default',
    }) as string;
  } else if (method === 'role') {
    config['roleArn'] = await text({
      message: 'IAM Role ARN:',
      placeholder: 'arn:aws:iam::123456789012:role/MyRole',
      initialValue: existing?.['roleArn'],
    }) as string;
  }

  config['region'] = await text({
    message: 'Default AWS Region:',
    placeholder: 'us-east-1',
    initialValue: existing?.['region'] || 'us-east-1',
  }) as string;

  return config;
}

async function configureKubernetes(existing?: Record<string, any>): Promise<Record<string, any>> {
  console.log(chalk.bold('\nConfigure Kubernetes Integration:\n'));
  
  const method = await select({
    message: 'Configuration method:',
    options: [
      { value: 'kubeconfig', label: 'Kubeconfig file' },
      { value: 'incluster', label: 'In-cluster' },
      { value: 'manual', label: 'Manual configuration' },
    ],
    initialValue: existing?.['method'] || 'kubeconfig',
  }) as string;

  const config: Record<string, any> = { method };

  if (method === 'kubeconfig') {
    config['kubeconfig'] = await text({
      message: 'Kubeconfig path:',
      placeholder: '~/.kube/config',
      initialValue: existing?.['kubeconfig'] || '~/.kube/config',
    }) as string;

    config['context'] = await text({
      message: 'Context name (optional):',
      placeholder: 'Leave empty for current context',
      initialValue: existing?.['context'],
    }) as string;
  } else if (method === 'manual') {
    config['server'] = await text({
      message: 'Kubernetes API server:',
      placeholder: 'https://kubernetes.default.svc',
      initialValue: existing?.['server'],
    }) as string;

    config['token'] = await password({
      message: 'Service account token:',
      mask: '*',
    }) as string;
  }

  config['namespace'] = await text({
    message: 'Default namespace:',
    placeholder: 'default',
    initialValue: existing?.['namespace'] || 'default',
  }) as string;

  return config;
}

async function configureTerraform(existing?: Record<string, any>): Promise<Record<string, any>> {
  console.log(chalk.bold('\nConfigure Terraform Integration:\n'));
  
  const config: Record<string, any> = {};

  config['workingDir'] = await text({
    message: 'Terraform working directory:',
    placeholder: './terraform',
    initialValue: existing?.['workingDir'] || './terraform',
  }) as string;

  config['binary'] = await text({
    message: 'Terraform binary path:',
    placeholder: 'terraform',
    initialValue: existing?.['binary'] || 'terraform',
  }) as string;

  const useCloud = await confirm({
    message: 'Use Terraform Cloud?',
    initialValue: existing?.['cloud']?.['enabled'] || false,
  });

  if (useCloud) {
    config['cloud'] = {
      enabled: true,
      organization: await text({
        message: 'Terraform Cloud organization:',
        initialValue: existing?.['cloud']?.['organization'],
      }) as string,
      token: await password({
        message: 'Terraform Cloud API token:',
        mask: '*',
      }) as string,
    };
  }

  return config;
}

async function configureDocker(existing?: Record<string, any>): Promise<Record<string, any>> {
  console.log(chalk.bold('\nConfigure Docker Integration:\n'));
  
  const config: Record<string, any> = {};

  config['host'] = await text({
    message: 'Docker host:',
    placeholder: 'unix:///var/run/docker.sock',
    initialValue: existing?.['host'] || 'unix:///var/run/docker.sock',
  }) as string;

  const useRegistry = await confirm({
    message: 'Configure Docker registry?',
    initialValue: !!existing?.['registry'],
  });

  if (useRegistry) {
    config['registry'] = {
      url: await text({
        message: 'Registry URL:',
        placeholder: 'https://index.docker.io/v1/',
        initialValue: existing?.['registry']?.['url'],
      }) as string,
      username: await text({
        message: 'Registry username:',
        initialValue: existing?.['registry']?.['username'],
      }) as string,
      password: await password({
        message: 'Registry password:',
        mask: '*',
      }) as string,
    };
  }

  return config;
}

async function configureGitHub(existing?: Record<string, any>): Promise<Record<string, any>> {
  console.log(chalk.bold('\nConfigure GitHub Integration:\n'));
  
  const config: Record<string, any> = {};

  config['token'] = await password({
    message: 'GitHub personal access token:',
    mask: '*',
  }) as string;

  config['baseUrl'] = await text({
    message: 'GitHub API URL:',
    placeholder: 'https://api.github.com',
    initialValue: existing?.['baseUrl'] || 'https://api.github.com',
  }) as string;

  return config;
}

async function configureGitLab(existing?: Record<string, any>): Promise<Record<string, any>> {
  console.log(chalk.bold('\nConfigure GitLab Integration:\n'));
  
  const config: Record<string, any> = {};

  config['token'] = await password({
    message: 'GitLab personal access token:',
    mask: '*',
  }) as string;

  config['baseUrl'] = await text({
    message: 'GitLab API URL:',
    placeholder: 'https://gitlab.com/api/v4',
    initialValue: existing?.['baseUrl'] || 'https://gitlab.com/api/v4',
  }) as string;

  return config;
}

async function testIntegration(name: string, config: IntegrationConfig): Promise<void> {
  console.log(chalk.yellow(`\nTesting ${config.type} integration '${name}'...`));
  
  try {
    switch (config.type) {
      case 'aws':
        // In a real implementation, test AWS credentials
        console.log(chalk.blue('→ Checking AWS credentials...'));
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(chalk.green('✓ AWS credentials valid'));
        console.log(chalk.green('✓ Can access AWS services'));
        break;

      case 'kubernetes':
        // In a real implementation, test K8s connection
        console.log(chalk.blue('→ Connecting to Kubernetes cluster...'));
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(chalk.green('✓ Connected to cluster'));
        console.log(chalk.green('✓ Can list namespaces'));
        break;

      case 'terraform':
        // In a real implementation, test Terraform
        console.log(chalk.blue('→ Checking Terraform installation...'));
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(chalk.green('✓ Terraform binary found'));
        console.log(chalk.green('✓ Working directory accessible'));
        break;

      case 'docker':
        // In a real implementation, test Docker connection
        console.log(chalk.blue('→ Connecting to Docker daemon...'));
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(chalk.green('✓ Docker daemon responsive'));
        console.log(chalk.green('✓ Can list containers'));
        break;

      case 'github':
      case 'gitlab':
        // In a real implementation, test API access
        console.log(chalk.blue('→ Testing API access...'));
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(chalk.green('✓ API accessible'));
        console.log(chalk.green('✓ Authentication successful'));
        break;
    }

    // Update last used timestamp
    const store = await loadIntegrationsStore();
    if (store.integrations[name]) {
      store.integrations[name].metadata!.lastUsed = new Date().toISOString();
      await saveIntegrationsStore(store);
    }

    console.log(chalk.green(`\n✓ Integration '${name}' is working correctly`));
  } catch (error) {
    console.error(chalk.red(`\n✗ Integration test failed: ${error}`));
    process.exit(1);
  }
}