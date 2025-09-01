#!/usr/bin/env tsx
/**
 * Group Component Error Handling Example
 *
 * Demonstrates error handling and recovery in groups:
 * - Validation with retry logic
 * - Error recovery strategies
 * - Partial results handling
 * - Graceful degradation
 */

import picocolors from 'picocolors';

import { text, note, group, confirm, spinner, password, isCancel } from '../src/index.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Simulated services that can fail
class MockService {
  private failureRate = 0.3; // 30% failure rate
  private attempts = new Map<string, number>();

  async checkEmail(email: string): Promise<{ exists: boolean; suggestion?: string }> {
    const attempt = (this.attempts.get('email') || 0) + 1;
    this.attempts.set('email', attempt);

    // Simulate network delay
    await sleep(500);

    // Simulate random failures on first attempts
    if (attempt === 1 && Math.random() < this.failureRate) {
      throw new Error('Network timeout - please try again');
    }

    // Check if email exists
    const existingEmails = ['admin@example.com', 'test@example.com', 'user@example.com'];
    const exists = existingEmails.includes(email.toLowerCase());

    if (exists) {
      const username = email.split('@')[0];
      const domain = email.split('@')[1];
      return {
        exists: true,
        suggestion: `${username}${Math.floor(Math.random() * 100)}@${domain}`,
      };
    }

    return { exists: false };
  }

  async validatePassword(password: string): Promise<{
    strong: boolean;
    score: number;
    suggestions: string[];
  }> {
    await sleep(300);

    const suggestions: string[] = [];
    let score = 0;

    // Length check
    if (password.length >= 8) score += 25;
    else suggestions.push('Use at least 8 characters');

    // Uppercase check
    if (/[A-Z]/.test(password)) score += 25;
    else suggestions.push('Include uppercase letters');

    // Number check
    if (/\d/.test(password)) score += 25;
    else suggestions.push('Include numbers');

    // Special character check
    if (/[!@#$%^&*]/.test(password)) score += 25;
    else suggestions.push('Include special characters');

    return {
      strong: score >= 75,
      score,
      suggestions,
    };
  }

  async createAccount(data: any): Promise<{ success: boolean; id?: string; error?: string }> {
    const attempt = (this.attempts.get('create') || 0) + 1;
    this.attempts.set('create', attempt);

    await sleep(1000);

    // Simulate failure on first attempt
    if (attempt === 1 && Math.random() < 0.5) {
      return {
        success: false,
        error: 'Server error - unable to create account. Please try again.',
      };
    }

    return {
      success: true,
      id: `user_${Math.random().toString(36).substr(2, 9)}`,
    };
  }
}

const service = new MockService();

async function main() {
  console.clear();
  console.log(picocolors.cyan('🔥 Group Component - Error Handling & Recovery'));
  console.log(picocolors.gray('─'.repeat(50)));
  console.log();

  const accountCreation = await group(
    {
      // Step 1: Email with retry on network failure
      email: async () => {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
          try {
            const email = await text({
              message:
                attempts === 0
                  ? 'Enter your email address'
                  : `Enter your email (attempt ${attempts + 1}/${maxAttempts})`,
              placeholder: 'user@example.com',
              validate: (value) => {
                if (!value || !value.includes('@')) {
                  return 'Please enter a valid email address';
                }
                const [local, domain] = value.split('@');
                if (!local || local.length < 1 || !domain || domain.length < 3) {
                  return 'Invalid email format';
                }
                return undefined;
              },
            });

            if (!email || typeof email !== 'string') {
              throw new Error('Email input cancelled');
            }

            // Check if email exists (may fail)
            const s = spinner();
            s.start('Checking email availability...');

            try {
              const result = await service.checkEmail(email);
              s.stop('');

              if (result.exists) {
                console.log(picocolors.yellow(`  ⚠ Email already exists`));
                if (result.suggestion) {
                  const useSuggestion = await confirm({
                    message: `Try ${result.suggestion} instead?`,
                  });
                  if (useSuggestion) {
                    return result.suggestion;
                  }
                }
                attempts++;
                continue;
              }

              console.log(picocolors.green(`  ✓ Email available`));
              return email;
            } catch (error) {
              s.stop(picocolors.red(`  ✗ ${error instanceof Error ? error.message : String(error)}`));
              attempts++;

              if (attempts < maxAttempts) {
                const retry = await confirm({
                  message: 'Retry?',
                  initialValue: true,
                });
                if (!retry) {
                  throw new Error('Email validation cancelled');
                }
              }
            }
          } catch (error) {
            if (attempts >= maxAttempts - 1) {
              // On final attempt, allow to proceed without validation
              const proceed = await confirm({
                message: 'Continue without email validation?',
              });
              if (proceed) {
                return await text({
                  message: 'Enter email (unvalidated)',
                  placeholder: 'user@example.com',
                });
              }
              throw error;
            }
            attempts++;
          }
        }

        throw new Error('Max attempts exceeded for email');
      },

      // Step 2: Username
      username: ({ results }) => {
        if (!results.email) return;

        // Suggest username based on email
        const suggestion = results.email.split('@')[0];

        return text({
          message: 'Choose a username',
          placeholder: suggestion,
          initialValue: suggestion,
          validate: (value) => {
            if (!value || value.length < 3) {
              return 'Username must be at least 3 characters';
            }
            if (!value || !/^[a-zA-Z0-9_-]+$/.test(value)) {
              return 'Username can only contain letters, numbers, hyphens, and underscores';
            }
            return undefined;
          },
        });
      },

      // Step 3: Password with strength validation
      password: async () => {
        let password: string | undefined;
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
          password = (await text({
            message:
              attempts === 0
                ? 'Create a password'
                : `Create a stronger password (attempt ${attempts + 1}/${maxAttempts})`,
            placeholder: 'Enter password',
            validate: (value) => {
              if (!value || value.length < 6) {
                return 'Password must be at least 6 characters';
              }
              return undefined;
            },
          })) as string;

          if (!password) break;

          // Check password strength
          const s = spinner();
          s.start('Checking password strength...');
          const validation = await service.validatePassword(password);
          s.stop('');

          if (validation.strong) {
            console.log(picocolors.green(`  ✓ Strong password (score: ${validation.score}/100)`));
            return password;
          } else {
            console.log(picocolors.yellow(`  ⚠ Weak password (score: ${validation.score}/100)`));
            if (validation.suggestions.length > 0) {
              console.log(picocolors.gray('  Suggestions:'));
              validation.suggestions.forEach((s) => {
                console.log(picocolors.gray(`    • ${s}`));
              });
            }

            const proceed = await confirm({
              message: 'Use this password anyway?',
              initialValue: false,
            });

            if (proceed) {
              return password;
            }
          }

          attempts++;
        }

        throw new Error('Password creation failed');
      },

      // Step 4: Password confirmation
      passwordConfirm: ({ results }) => {
        if (!results.password) return;

        return password({
          message: 'Confirm password',
          validate: (value) => {
            if (!value || value !== results.password) {
              return 'Passwords do not match';
            }
            return undefined;
          },
        });
      },

      // Step 5: Terms acceptance
      acceptTerms: () =>
        confirm({
          message: 'Accept terms and conditions?',
          initialValue: false,
        }),

      // Step 6: Create account with retry logic
      createAccount: async ({ results }) => {
        if (!results.acceptTerms) {
          console.log(picocolors.yellow('  ⚠ Terms must be accepted to continue'));
          return;
        }

        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
          const s = spinner();
          s.start(
            `Creating account${attempts > 0 ? ` (attempt ${attempts + 1}/${maxAttempts})` : ''}...`
          );

          const result = await service.createAccount({
            email: results.email,
            username: results.username,
            password: results.password,
          });

          if (result.success) {
            s.stop(picocolors.green(`✓ Account created successfully!`));
            return result.id;
          } else {
            s.stop(picocolors.red(`✗ ${result.error}`));
            attempts++;

            if (attempts < maxAttempts) {
              const retry = await confirm({
                message: 'Retry account creation?',
                initialValue: true,
              });

              if (!retry) {
                break;
              }
            }
          }
        }

        // Fallback: save data locally
        const saveLocal = await confirm({
          message: 'Save registration data locally for later?',
          initialValue: true,
        });

        if (saveLocal) {
          console.log(picocolors.blue('  💾 Data saved locally'));
          return 'local_save';
        }

        return null;
      },
    },
    {
      onCancel: ({ results }) => {
        console.log();
        console.log(picocolors.yellow('⚠ Registration cancelled'));

        if (Object.keys(results).length > 0) {
          console.log(picocolors.gray('\nPartial data collected:'));

          const safeResults = { ...results };
          // Mask sensitive data
          if (safeResults.password) safeResults.password = '******';
          if (safeResults.passwordConfirm) safeResults.passwordConfirm = '******';

          Object.entries(safeResults).forEach(([key, value]) => {
            if (value !== 'canceled' && value !== undefined) {
              console.log(picocolors.gray(`  ${key}: ${value}`));
            }
          });

          // Offer to save partial data
          confirm({
            message: 'Save partial data for later?',
          }).then((save) => {
            if (save) {
              console.log(picocolors.blue('\n💾 Partial data saved'));
            }
            process.exit(0);
          });
        } else {
          process.exit(0);
        }
      },
    }
  );

  // Display final results
  if (accountCreation.createAccount) {
    console.log();

    if (accountCreation.createAccount === 'local_save') {
      note(
        `Registration data has been saved locally.\n\n` +
          `You can complete the registration later when\n` +
          `the service is available.\n\n` +
          `Email: ${accountCreation.email}\n` +
          `Username: ${accountCreation.username}`,
        picocolors.blue('Saved Locally')
      );
    } else {
      note(
        `Welcome, ${accountCreation.username}!\n\n` +
          `Your account has been created successfully.\n\n` +
          `Account ID: ${accountCreation.createAccount}\n` +
          `Email: ${accountCreation.email}\n\n` +
          `You can now log in with your credentials.`,
        picocolors.green('Account Created')
      );
    }
  } else {
    console.log();
    console.log(picocolors.red('✗ Account creation failed'));
    console.log(picocolors.gray('Please try again later or contact support.'));
  }

  console.log();
}

// Run the example with error handling
main().catch((error) => {
  console.error();
  if (isCancel(error)) {
    console.log(picocolors.yellow('Process cancelled by user'));
  } else {
    console.error(picocolors.red('Unexpected error:'), error.message);
    console.log(picocolors.gray('\nPlease try again or contact support if the issue persists.'));
  }
  process.exit(1);
});
