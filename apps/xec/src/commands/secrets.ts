import chalk from 'chalk';
import { kit } from '@xec-sh/kit';

import { SecretManager } from '../secrets/index.js';
import { ConfigurationManager } from '../config/configuration-manager.js';

/**
 * Enhanced secret management using @xec-sh/kit
 * This module provides advanced secret management features when kit is enabled
 */

interface SecretMetadata {
  name: string;
  created: Date;
  modified: Date;
  targets?: string[];
  type: 'password' | 'token' | 'key' | 'certificate' | 'other';
  expiresAt?: Date;
  rotateAfter?: number; // days
}

/**
 * Enhanced secret management with command palette
 */
export async function manageSecretsWithPalette() {
  const manager = await getSecretManager();

  const action = await kit.commandPalette({
    commands: [
      {
        id: 'add',
        title: 'Add Secret',
        icon: '🔐',
        shortcut: 'a',
        action: async () => {
          await addSecretWizard(manager);
        }
      },
      {
        id: 'list',
        title: 'List Secrets',
        icon: '📋',
        shortcut: 'l',
        action: async () => {
          await listSecretsWithTable(manager);
        }
      },
      {
        id: 'get',
        title: 'Get Secret Value',
        icon: '🔓',
        shortcut: 'g',
        action: async () => {
          await getSecretInteractive(manager);
        }
      },
      {
        id: 'rotate',
        title: 'Rotate Secrets',
        icon: '🔄',
        shortcut: 'r',
        action: async () => {
          await rotateSecretsWizard(manager);
        }
      },
      {
        id: 'audit',
        title: 'Security Audit',
        icon: '🔍',
        shortcut: 'u',
        action: async () => {
          await auditSecrets(manager);
        }
      },
      {
        id: 'backup',
        title: 'Backup Secrets',
        icon: '💾',
        shortcut: 'b',
        action: async () => {
          await backupSecrets(manager);
        }
      },
      {
        id: 'restore',
        title: 'Restore Secrets',
        icon: '📥',
        shortcut: 'R',
        action: async () => {
          await restoreSecrets(manager);
        }
      },
      {
        id: 'generate',
        title: 'Generate Secret',
        icon: '🎲',
        shortcut: 'G',
        action: async () => {
          await generateSecretWizard(manager);
        }
      },
      {
        id: 'delete',
        title: 'Delete Secret',
        icon: '🗑️',
        shortcut: 'd',
        action: async () => {
          await deleteSecretInteractive(manager);
        }
      }
    ],
    placeholder: 'Search secret operations...',
    recent: getRecentSecretCommands(),
  });

  if (action) {
    trackSecretCommand(action.id);
  }
}

/**
 * Add secret wizard with enhanced validation
 */
async function addSecretWizard(manager: SecretManager) {
  const result: any = await kit.wizard({
    title: '🔐 Add New Secret',
    steps: [
      {
        id: 'type',
        title: 'Secret Type',
        component: async () => await kit.select({
          message: 'What type of secret is this?',
          options: [
            { value: 'password', label: '🔑 Password', hint: 'User authentication' },
            { value: 'token', label: '🎫 API Token', hint: 'Service authentication' },
            { value: 'key', label: '🔐 Private Key', hint: 'SSH/SSL key' },
            { value: 'certificate', label: '📜 Certificate', hint: 'SSL/TLS certificate' },
            { value: 'other', label: '📝 Other', hint: 'Custom secret type' }
          ],
          preview: (option) => {
            const previews: Record<string, string> = {
              password: 'Passwords should be:\n• At least 12 characters\n• Include mixed case, numbers, symbols\n• Unique per service\n• Rotated regularly',
              token: 'API Tokens should be:\n• Kept confidential\n• Scoped to minimum permissions\n• Rotated on schedule\n• Revoked when unused',
              key: 'Private Keys should be:\n• Protected with passphrase\n• Stored securely\n• Never committed to git\n• Backed up safely',
              certificate: 'Certificates should be:\n• Valid and not expired\n• From trusted CA\n• Match the domain\n• Renewed before expiry',
              other: 'Custom secrets should follow security best practices'
            };
            return previews[option.value] || '';
          }
        })
      },
      {
        id: 'details',
        title: 'Secret Details',
        component: async (context) => await kit.form({
          fields: [
            {
              name: 'name',
              type: 'text',
              message: 'Secret name',
              placeholder: 'MY_SECRET_KEY',
              validate: (v: string) => {
                if (!v) return 'Name is required';
                if (!/^[A-Z][A-Z0-9_]*$/.test(v)) {
                  return 'Use UPPER_SNAKE_CASE format';
                }
                return undefined;
              },
              transform: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '_')
            },
            {
              name: 'description',
              type: 'text',
              message: 'Description (optional)',
              placeholder: 'What is this secret used for?'
            },
            {
              name: 'targets',
              type: 'multiselect',
              message: 'Available for targets',
              options: await getAvailableTargets(),
              default: ['all'],
              description: 'Select which targets can access this secret'
            },
            {
              name: 'expiresIn',
              type: 'select',
              message: 'Expiration',
              options: [
                { value: 0, label: 'Never expires' },
                { value: 30, label: '30 days' },
                { value: 90, label: '90 days' },
                { value: 180, label: '6 months' },
                { value: 365, label: '1 year' }
              ],
              default: 0,
              when: () => context['type'] !== 'certificate'
            },
            {
              name: 'rotateAfter',
              type: 'number',
              message: 'Rotate after (days)',
              default: context['type'] === 'password' ? 90 : 0,
              min: 0,
              max: 365,
              description: 'Set to 0 to disable rotation reminders'
            }
          ]
        })
      },
      {
        id: 'value',
        title: 'Secret Value',
        component: async (context) => {
          const { type, details } = context;

          if (type === 'password') {
            const generatePassword = await kit.confirm({
              message: 'Generate a secure password?',
              default: true
            });

            if (generatePassword) {
              return await generateSecurePassword();
            }
          }

          if (type === 'key' || type === 'certificate') {
            const importFile = await kit.confirm({
              message: 'Import from file?',
              default: true
            });

            if (importFile) {
              const filepath = await kit.text({
                message: 'Enter file path',
                placeholder: '/path/to/key.pem'
              });

              if (filepath) {
                const fs = await import('fs-extra');
                if (await fs.pathExists(filepath)) {
                  return await fs.readFile(filepath, 'utf-8');
                }
              }
            }
          }

          // Manual entry with strength indicator for passwords
          return await kit.password({
            message: 'Enter secret value',
            mask: '•',
            showStrength: type === 'password',
            validate: (v) => {
              if (!v) return 'Value is required';
              if (type === 'password' && v.length < 12) {
                return 'Password must be at least 12 characters';
              }
              if (type === 'token' && !/^[a-zA-Z0-9_.-]+$/.test(v)) {
                return 'Token contains invalid characters';
              }
              return undefined;
            }
          });
        }
      },
      {
        id: 'confirm',
        title: 'Review & Confirm',
        component: async (context) => {
          const { type, details, value } = context;

          // Show summary
          kit.log.info('Secret Configuration:');
          console.log(chalk.gray('─'.repeat(40)));
          console.log(`Type: ${chalk.cyan(type)}`);
          console.log(`Name: ${chalk.green(details.name)}`);
          if (details.description) {
            console.log(`Description: ${details.description}`);
          }
          console.log(`Targets: ${details.targets.join(', ')}`);
          if (details.expiresIn > 0) {
            console.log(`Expires in: ${chalk.yellow(details.expiresIn + ' days')}`);
          }
          if (details.rotateAfter > 0) {
            console.log(`Rotate after: ${chalk.yellow(details.rotateAfter + ' days')}`);
          }
          console.log(`Value: ${chalk.gray('[REDACTED - ' + value.length + ' characters]')}`);

          // Security check
          if (type === 'password') {
            const strength = calculatePasswordStrength(value);
            console.log(`\nPassword Strength: ${getStrengthLabel(strength)}`);
            if (strength < 3) {
              kit.log.warning('⚠️  This password is weak. Consider using a stronger password.');
            }
          }

          return await kit.confirm({
            message: 'Save this secret?',
            default: true
          });
        }
      }
    ],
    onStepComplete: async (step, value, context) => {
      // Save progress for recovery
      await kit.saveState('.xec-secret-wizard', { step, context });
    },
    allowBack: true,
    showProgress: true
  });

  if (result !== null && result?.['confirm'] === true) {
    const spinner = kit.spinner('Saving secret...');
    try {
      await manager.set(result['details']['name'], result['value']);

      // Save metadata
      const metadata: SecretMetadata = {
        name: result['details']['name'],
        created: new Date(),
        modified: new Date(),
        targets: result['details']['targets'],
        type: result['type'],
        expiresAt: result['details']['expiresIn'] > 0
          ? new Date(Date.now() + result['details']['expiresIn'] * 24 * 60 * 60 * 1000)
          : undefined,
        rotateAfter: result['details']['rotateAfter']
      };

      await saveSecretMetadata(result['details']['name'], metadata);

      spinner.success(`Secret '${result['details']['name']}' saved securely`);

      // Show next steps
      kit.log.info('\n📚 Next steps:');
      kit.log.step(`Use in scripts: process.env['${result['details']['name']}']`);
      kit.log.step(`Reference in config: $secret:${result['details']['name']}`);
      if (result['details']['rotateAfter'] > 0) {
        kit.log.step(`Set rotation reminder for ${result['details']['rotateAfter']} days`);
      }
    } catch (error) {
      spinner.error('Failed to save secret');
      throw error;
    }
  }
}

/**
 * List secrets with table view
 */
async function listSecretsWithTable(manager: SecretManager) {
  const secrets = await manager.list();
  const metadata = await loadAllSecretMetadata();

  const secretData = secrets.map(name => {
    const meta = metadata[name];
    return {
      name,
      type: meta?.type || 'unknown',
      created: meta?.created ? formatDate(meta.created) : 'Unknown',
      expires: meta?.expiresAt ? formatDate(meta.expiresAt) : 'Never',
      targets: meta?.targets?.join(', ') || 'all',
      status: getSecretStatus(meta)
    };
  });

  await kit.table({
    message: '🔐 Configured Secrets',
    data: secretData,
    columns: [
      { key: 'name', label: 'Name', width: 25 },
      { key: 'type', label: 'Type', width: 15 },
      { key: 'created', label: 'Created', width: 15 },
      { key: 'expires', label: 'Expires', width: 15 },
      { key: 'targets', label: 'Targets', width: 20 },
      { key: 'status', label: 'Status', width: 10 }
    ],
    onSelect: async (secret) => {
      await manageSecretActions(secret.name, manager);
    }
  });
}

/**
 * Manage actions for a specific secret
 */
async function manageSecretActions(name: string, manager: SecretManager) {
  const action = await kit.select({
    message: `Actions for ${name}`,
    options: [
      { value: 'view', label: '👁️  View value' },
      { value: 'edit', label: '✏️  Edit value' },
      { value: 'rotate', label: '🔄 Rotate secret' },
      { value: 'copy', label: '📋 Copy to clipboard' },
      { value: 'delete', label: '🗑️  Delete' },
      { value: 'audit', label: '🔍 View audit log' },
      { value: 'cancel', label: '❌ Cancel' }
    ]
  });

  // eslint-disable-next-line default-case
  switch (action) {
    case 'view':
      {
        const value = await manager.get(name);
        if (value) {
          kit.log.info(`${name}: ${chalk.gray('[REDACTED]')}`);
          const show = await kit.confirm({
            message: 'Show actual value? (Warning: will be visible on screen)',
            default: false
          });
          if (show) {
            console.log(chalk.yellow(value));
          }
        }
        break;
      }

    case 'edit':
      {
        const newValue = await kit.password({
          message: 'Enter new value',
          mask: '•',
          validate: (v) => v ? undefined : 'Value is required'
        });
        if (newValue) {
          await manager.set(name, newValue);
          kit.log.success(`Secret '${name}' updated`);
        }
        break;
      }

    case 'rotate':
      await rotateSecret(name, manager);
      break;

    case 'copy':
      {
        const secretValue = await manager.get(name);
        if (secretValue) {
          // Use clipboard API if available
          const { execSync } = await import('child_process');
          try {
            if (process.platform === 'darwin') {
              execSync('pbcopy', { input: secretValue });
            } else if (process.platform === 'linux') {
              execSync('xclip -selection clipboard', { input: secretValue });
            }
            kit.log.success('Secret copied to clipboard');
          } catch {
            kit.log.error('Failed to copy to clipboard');
          }
        }
        break;
      }

    case 'delete':
      {
        const confirm = await kit.confirm({
          message: `Delete secret '${name}'? This cannot be undone.`,
          default: false
        });
        if (confirm) {
          await manager.delete(name);
          kit.log.success(`Secret '${name}' deleted`);
        }
        break;
      }

    case 'audit':
      await showAuditLog(name);
      break;
  }
}

/**
 * Rotate secrets wizard
 */
async function rotateSecretsWizard(manager: SecretManager) {
  const secrets = await manager.list();
  const metadata = await loadAllSecretMetadata();

  // Find secrets that need rotation
  const needsRotation = secrets.filter(name => {
    const meta = metadata[name];
    if (!meta?.rotateAfter) return false;

    const daysSinceModified = Math.floor(
      (Date.now() - new Date(meta.modified).getTime()) / (24 * 60 * 60 * 1000)
    );
    return daysSinceModified >= meta.rotateAfter;
  });

  if (needsRotation.length === 0) {
    kit.log.info('No secrets need rotation at this time');
    return;
  }

  kit.log.warning(`${needsRotation.length} secrets need rotation:`);
  needsRotation.forEach(name => {
    const meta = metadata[name];
    const daysSinceModified = meta ? Math.floor(
      (Date.now() - new Date(meta.modified).getTime()) / (24 * 60 * 60 * 1000)
    ) : 0;
    console.log(`  • ${name} (${daysSinceModified} days old)`);
  });

  const selected = await kit.multiselect({
    message: 'Select secrets to rotate',
    options: needsRotation.map(name => ({
      value: name,
      label: name,
      hint: metadata[name]?.type || 'unknown'
    })),
    showSelectAll: true
  });

  if (selected && selected.length > 0) {
    for (const name of selected) {
      await rotateSecret(name, manager);
    }
  }
}

/**
 * Rotate a single secret
 */
async function rotateSecret(name: string, manager: SecretManager) {
  const metadata = await loadSecretMetadata(name);

  kit.log.info(`Rotating secret: ${name}`);

  let newValue: string;
  if (metadata?.type === 'password') {
    const generate = await kit.confirm({
      message: 'Generate new password?',
      default: true
    });

    if (generate) {
      newValue = await generateSecurePassword();
    } else {
      newValue = await kit.password({
        message: 'Enter new value',
        mask: '•',
        showStrength: true,
        validate: (v) => v ? undefined : 'Value is required'
      });
    }
  } else {
    newValue = await kit.password({
      message: 'Enter new value',
      mask: '•',
      validate: (v) => v ? undefined : 'Value is required'
    });
  }

  if (newValue) {
    // Save old value for rollback
    const oldValue = await manager.get(name);

    try {
      await manager.set(name, newValue);

      // Update metadata
      if (metadata) {
        metadata.modified = new Date();
        await saveSecretMetadata(name, metadata);
      }

      kit.log.success(`Secret '${name}' rotated successfully`);

      // Offer to test the new secret
      const test = await kit.confirm({
        message: 'Test the new secret?',
        default: true
      });

      if (test) {
        // Implementation would depend on secret type
        kit.log.info('Testing functionality would be implemented based on secret type');
      }
    } catch (error) {
      // Rollback on error
      if (oldValue) {
        await manager.set(name, oldValue);
      }
      throw error;
    }
  }
}

/**
 * Security audit for secrets
 */
async function auditSecrets(manager: SecretManager) {
  const secrets = await manager.list();
  const metadata = await loadAllSecretMetadata();

  const report = {
    total: secrets.length,
    expired: 0,
    needsRotation: 0,
    weak: 0,
    noMetadata: 0,
    issues: [] as string[]
  };

  const spinner = kit.spinner('Auditing secrets...');

  for (const name of secrets) {
    const meta = metadata[name];

    if (!meta) {
      report.noMetadata++;
      report.issues.push(`${name}: No metadata found`);
      continue;
    }

    // Check expiration
    if (meta.expiresAt && new Date(meta.expiresAt) < new Date()) {
      report.expired++;
      report.issues.push(`${name}: Expired on ${formatDate(meta.expiresAt)}`);
    }

    // Check rotation
    if (meta.rotateAfter) {
      const daysSinceModified = Math.floor(
        (Date.now() - new Date(meta.modified).getTime()) / (24 * 60 * 60 * 1000)
      );
      if (daysSinceModified >= meta.rotateAfter) {
        report.needsRotation++;
        report.issues.push(`${name}: Needs rotation (${daysSinceModified} days old)`);
      }
    }

    // Check password strength (if we can)
    if (meta.type === 'password') {
      // We can't check actual strength without the value, but we can check age
      const age = Math.floor(
        (Date.now() - new Date(meta.modified).getTime()) / (24 * 60 * 60 * 1000)
      );
      if (age > 180) {
        report.weak++;
        report.issues.push(`${name}: Password is ${age} days old`);
      }
    }
  }

  spinner.success('Audit complete');

  // Display report
  console.log('\n' + chalk.bold('🔍 Security Audit Report'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(`Total Secrets: ${report.total}`);
  console.log(`Expired: ${report.expired > 0 ? chalk.red(report.expired) : chalk.green('0')}`);
  console.log(`Needs Rotation: ${report.needsRotation > 0 ? chalk.yellow(report.needsRotation) : chalk.green('0')}`);
  console.log(`Potentially Weak: ${report.weak > 0 ? chalk.yellow(report.weak) : chalk.green('0')}`);
  console.log(`Missing Metadata: ${report.noMetadata > 0 ? chalk.gray(report.noMetadata) : '0'}`);

  if (report.issues.length > 0) {
    console.log('\n' + chalk.bold('Issues Found:'));
    report.issues.forEach(issue => {
      console.log(`  • ${issue}`);
    });

    const fix = await kit.confirm({
      message: 'Would you like to address these issues now?',
      default: true
    });

    if (fix) {
      await rotateSecretsWizard(manager);
    }
  } else {
    console.log('\n' + chalk.green('✓ No security issues found'));
  }
}

// Helper functions

async function getSecretManager(): Promise<SecretManager> {
  const manager = new SecretManager({ type: 'local' });
  return manager;
}

async function getAvailableTargets(): Promise<Array<{ value: string; label: string }>> {
  const configManager = new ConfigurationManager();
  const config = await configManager.load();

  const targets = [{ value: 'all', label: 'All targets' }];

  if (config.targets) {
    Object.entries(config.targets).forEach(([type, typeTargets]) => {
      if (typeTargets && typeof typeTargets === 'object') {
        Object.keys(typeTargets).forEach(name => {
          targets.push({
            value: `${type}:${name}`,
            label: `${name} (${type})`
          });
        });
      }
    });
  }

  return targets;
}

async function generateSecurePassword(): Promise<string> {
  const options = await kit.form({
    title: 'Password Generation Options',
    fields: [
      {
        name: 'length',
        type: 'number',
        message: 'Length',
        default: 20,
        min: 12,
        max: 128
      },
      {
        name: 'uppercase',
        type: 'confirm',
        message: 'Include uppercase letters',
        default: true
      },
      {
        name: 'lowercase',
        type: 'confirm',
        message: 'Include lowercase letters',
        default: true
      },
      {
        name: 'numbers',
        type: 'confirm',
        message: 'Include numbers',
        default: true
      },
      {
        name: 'symbols',
        type: 'confirm',
        message: 'Include symbols',
        default: true
      },
      {
        name: 'excludeAmbiguous',
        type: 'confirm',
        message: 'Exclude ambiguous characters (0, O, l, I)',
        default: true
      }
    ]
  });

  let charset = '';
  if (options['uppercase']) charset += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  if (options['lowercase']) charset += 'abcdefghijkmnopqrstuvwxyz';
  if (options['numbers']) charset += options['excludeAmbiguous'] ? '123456789' : '0123456789';
  if (options['symbols']) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (options['excludeAmbiguous']) {
    charset = charset.replace(/[0OlI]/g, '');
  }

  const crypto = await import('crypto');
  let password = '';

  for (let i = 0; i < options['length']; i++) {
    const randomIndex = crypto.randomInt(0, charset.length);
    password += charset[randomIndex];
  }

  // Show the generated password with option to regenerate
  console.log(`\nGenerated password: ${chalk.yellow(password)}`);
  const strength = calculatePasswordStrength(password);
  console.log(`Strength: ${getStrengthLabel(strength)}`);

  const accept = await kit.confirm({
    message: 'Use this password?',
    default: true
  });

  if (!accept) {
    return generateSecurePassword(); // Regenerate
  }

  return password;
}

function calculatePasswordStrength(password: string): number {
  let strength = 0;

  // Length
  if (password.length >= 12) strength++;
  if (password.length >= 16) strength++;
  if (password.length >= 20) strength++;

  // Character types
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;

  // Complexity
  if (!/(.)\1{2,}/.test(password)) strength++; // No repeated characters

  return Math.min(5, Math.floor(strength * 5 / 8));
}

function getStrengthLabel(strength: number): string {
  const labels = [
    chalk.red('Very Weak'),
    chalk.red('Weak'),
    chalk.yellow('Fair'),
    chalk.yellow('Good'),
    chalk.green('Strong'),
    chalk.green('Very Strong')
  ];
  return labels[strength] ?? labels[0]!;
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString();
}

function getSecretStatus(meta?: SecretMetadata): string {
  if (!meta) return chalk.gray('Unknown');

  if (meta.expiresAt && new Date(meta.expiresAt) < new Date()) {
    return chalk.red('Expired');
  }

  if (meta.rotateAfter) {
    const daysSinceModified = Math.floor(
      (Date.now() - new Date(meta.modified).getTime()) / (24 * 60 * 60 * 1000)
    );
    if (daysSinceModified >= meta.rotateAfter) {
      return chalk.yellow('Rotate');
    }
  }

  return chalk.green('Active');
}

// Metadata persistence (simple JSON file for now)
const METADATA_FILE = '.xec/secret-metadata.json';

async function saveSecretMetadata(name: string, metadata: SecretMetadata) {
  const fs = await import('fs-extra');
  const path = await import('path');

  const file = path.resolve(METADATA_FILE);
  let allMetadata: Record<string, SecretMetadata> = {};

  if (await fs.pathExists(file)) {
    allMetadata = await fs.readJson(file);
  }

  allMetadata[name] = metadata;
  await fs.writeJson(file, allMetadata, { spaces: 2 });
}

async function loadSecretMetadata(name: string): Promise<SecretMetadata | undefined> {
  const metadata = await loadAllSecretMetadata();
  return metadata[name];
}

async function loadAllSecretMetadata(): Promise<Record<string, SecretMetadata>> {
  const fs = await import('fs-extra');
  const path = await import('path');

  const file = path.resolve(METADATA_FILE);

  if (await fs.pathExists(file)) {
    return await fs.readJson(file);
  }

  return {};
}

// Command tracking for recent commands
let recentCommands: string[] = [];

function getRecentSecretCommands(): string[] {
  return recentCommands;
}

function trackSecretCommand(commandId: string) {
  recentCommands = recentCommands.filter(id => id !== commandId);
  recentCommands.unshift(commandId);
  recentCommands = recentCommands.slice(0, 5);
}

// Backup and restore functions
async function backupSecrets(manager: SecretManager) {
  const filename = await kit.text({
    message: 'Backup filename',
    placeholder: 'secrets-backup.enc',
    default: `secrets-backup-${new Date().toISOString().split('T')[0]}.enc`
  });

  if (!filename) return;

  const password = await kit.password({
    message: 'Encryption password',
    mask: '•',
    showStrength: true,
    validate: (v) => {
      if (!v) return 'Password is required';
      if (v.length < 12) return 'Password must be at least 12 characters';
      return undefined;
    }
  });

  if (!password) return;

  const confirmPassword = await kit.password({
    message: 'Confirm password',
    mask: '•',
    validate: (v) => v === password ? undefined : 'Passwords do not match'
  });

  if (!confirmPassword) return;

  const spinner = kit.spinner('Creating encrypted backup...');

  try {
    // Get all secrets
    const secrets = await manager.list();
    const backup: Record<string, string> = {};

    for (const name of secrets) {
      const value = await manager.get(name);
      if (value) {
        backup[name] = value;
      }
    }

    // Encrypt the backup
    const crypto = await import('crypto');
    const fs = await import('fs-extra');

    const algorithm = 'aes-256-gcm';
    const salt = crypto.randomBytes(32);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(backup), 'utf8'),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    // Save encrypted backup
    const backupData = {
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      data: encrypted.toString('hex'),
      created: new Date().toISOString(),
      version: '1.0'
    };

    await fs.writeJson(filename, backupData, { spaces: 2 });

    spinner.success(`Backup saved to ${filename}`);
    kit.log.info(`Backed up ${secrets.length} secrets`);
    kit.log.warning('⚠️  Keep this backup and password safe!');
  } catch (error) {
    spinner.error('Backup failed');
    throw error;
  }
}

async function restoreSecrets(manager: SecretManager) {
  const filename = await kit.text({
    message: 'Enter backup file path',
    placeholder: 'secrets-backup.enc'
  });
  const files = filename ? [filename] : [];

  if (!files || files.length === 0) return;

  const password = await kit.password({
    message: 'Decryption password',
    mask: '•'
  });

  if (!password) return;

  const spinner = kit.spinner('Restoring from backup...');

  try {
    const fs = await import('fs-extra');
    const crypto = await import('crypto');

    const backupData: any = await fs.readJson(files[0]!);

    // Decrypt the backup
    const algorithm = 'aes-256-gcm';
    const salt = Buffer.from(backupData['salt'], 'hex');
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = Buffer.from(backupData['iv'], 'hex');
    const authTag = Buffer.from(backupData['authTag'], 'hex');

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(backupData['data'], 'hex')),
      decipher.final()
    ]);

    const secrets = JSON.parse(decrypted.toString('utf8'));

    // Confirm restoration
    const secretNames = Object.keys(secrets);
    console.log(`\nFound ${secretNames.length} secrets in backup:`);
    secretNames.forEach(name => console.log(`  • ${name}`));

    const confirm = await kit.confirm({
      message: 'Restore these secrets? (will overwrite existing)',
      default: false
    });

    if (confirm) {
      for (const [name, value] of Object.entries(secrets)) {
        await manager.set(name, value as string);
      }

      spinner.success(`Restored ${secretNames.length} secrets`);
    } else {
      spinner.stop('Restoration cancelled');
    }
  } catch (error) {
    spinner.error('Restoration failed - check password');
    throw error;
  }
}

async function deleteSecretInteractive(manager: SecretManager) {
  const secrets = await manager.list();

  if (secrets.length === 0) {
    kit.log.info('No secrets to delete');
    return;
  }

  const selected = await kit.multiselect({
    message: 'Select secrets to delete',
    options: secrets.map(name => ({
      value: name,
      label: name
    })),
    required: true
  });

  if (selected && selected.length > 0) {
    const confirm = await kit.confirm({
      message: `Delete ${selected.length} secret(s)? This cannot be undone.`,
      default: false
    });

    if (confirm) {
      for (const name of selected) {
        await manager.delete(name);
        kit.log.success(`Deleted: ${name}`);
      }
    }
  }
}

async function getSecretInteractive(manager: SecretManager) {
  const secrets = await manager.list();

  if (secrets.length === 0) {
    kit.log.info('No secrets available');
    return;
  }

  const selected = await kit.select({
    message: 'Select secret to view',
    options: secrets.map(name => ({
      value: name,
      label: name
    })),
    search: true
  });

  if (selected) {
    const value = await manager.get(selected);
    if (value) {
      const show = await kit.confirm({
        message: 'Show actual value? (will be visible on screen)',
        default: false
      });

      if (show) {
        console.log(`${selected}: ${chalk.yellow(value)}`);
      } else {
        console.log(`${selected}: ${chalk.gray('[REDACTED - ' + value.length + ' characters]')}`);
      }
    }
  }
}

async function generateSecretWizard(manager: SecretManager) {
  const name = await kit.text({
    message: 'Secret name',
    placeholder: 'MY_API_KEY',
    validate: (v) => {
      if (!v) return 'Name is required';
      if (!/^[A-Z][A-Z0-9_]*$/.test(v)) {
        return 'Use UPPER_SNAKE_CASE format';
      }
      return undefined;
    },
    transform: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  });

  if (!name) return;

  const type = await kit.select({
    message: 'Generation type',
    options: [
      { value: 'password', label: '🔑 Password' },
      { value: 'token', label: '🎫 API Token' },
      { value: 'uuid', label: '🆔 UUID' },
      { value: 'hex', label: '🔢 Hex String' }
    ]
  });

  let value: string = '';

  switch (type) {
    case 'password':
      value = await generateSecurePassword();
      break;

    case 'token':
      {
        const length = await kit.number({
          message: 'Token length',
          default: 32,
          min: 16,
          max: 256
        });
        const crypto = await import('crypto');
        value = crypto.randomBytes(length).toString('base64url');
        break;
      }

    case 'uuid':
      {
        const { randomUUID } = await import('crypto');
        value = randomUUID();
        break;
      }

    case 'hex':
      {
        const hexLength = await kit.number({
          message: 'Hex string length (bytes)',
          default: 32,
          min: 8,
          max: 256
        });
        const cryptoHex = await import('crypto');
        value = cryptoHex.randomBytes(hexLength).toString('hex');
        break;
      }

    default:
      return;
  }

  console.log(`\nGenerated ${type}: ${chalk.yellow(value)}`);

  const save = await kit.confirm({
    message: `Save as '${name}'?`,
    default: true
  });

  if (save) {
    await manager.set(name, value);
    kit.log.success(`Secret '${name}' saved`);
  }
}

async function showAuditLog(name: string) {
  // This would integrate with actual audit logging
  kit.log.info(`Audit log for ${name}:`);
  console.log(chalk.gray('Feature not yet implemented'));
  console.log('Would show:');
  console.log('  • Creation date and user');
  console.log('  • Access history');
  console.log('  • Modification history');
  console.log('  • Rotation history');
}

/**
 * Register the secrets command with Commander
 */
export default function command(program: import('commander').Command): void {
  program
    .command('secrets')
    .description('Manage secrets and credentials')
    .option('-l, --list', 'List all secrets')
    .option('-g, --get <name>', 'Get secret value')
    .option('-s, --set <name>', 'Set secret value')
    .option('-d, --delete <name>', 'Delete secret')
    .option('-r, --rotate', 'Rotate secrets')
    .option('--generate', 'Generate new secret')
    .option('--import', 'Import secrets')
    .option('--export', 'Export secrets')
    .option('--validate', 'Validate secrets')
    .option('--interactive', 'Use interactive mode')
    .action(async (options) => {
      // Handle specific options
      if (options.list) {
        const manager = await getSecretManager();
        await listSecretsWithTable(manager);
        return;
      }
      
      if (options.get) {
        const manager = await getSecretManager();
        const value = await manager.get(options.get);
        if (value) {
          console.log(value);
        } else {
          console.error(`Secret '${options.get}' not found`);
          process.exit(1);
        }
        return;
      }
      
      if (options.set) {
        const manager = await getSecretManager();
        const value = await kit.password({
          message: `Enter value for '${options.set}'`,
          mask: '•'
        });
        await manager.set(options.set, value);
        kit.log.success(`Secret '${options.set}' saved`);
        return;
      }
      
      if (options.delete) {
        const manager = await getSecretManager();
        const confirm = await kit.confirm({
          message: `Delete secret '${options.delete}'?`,
          default: false
        });
        if (confirm) {
          await manager.delete(options.delete);
          kit.log.success(`Secret '${options.delete}' deleted`);
        }
        return;
      }
      
      if (options.rotate) {
        const manager = await getSecretManager();
        await rotateSecretsWizard(manager);
        return;
      }
      
      if (options.generate) {
        const manager = await getSecretManager();
        await generateSecretWizard(manager);
        return;
      }
      
      if (options.import) {
        const manager = await getSecretManager();
        await restoreSecrets(manager);
        return;
      }
      
      if (options.export) {
        const manager = await getSecretManager();
        await backupSecrets(manager);
        return;
      }
      
      if (options.validate) {
        const manager = await getSecretManager();
        await auditSecrets(manager);
        return;
      }
      
      // Default to interactive mode
      await manageSecretsWithPalette();
    });
}