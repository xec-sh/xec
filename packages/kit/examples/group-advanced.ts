#!/usr/bin/env tsx
/**
 * Advanced Group Component Features
 *
 * This example showcases advanced group patterns:
 * - Recursive groups (groups within groups)
 * - Error recovery and retry logic
 * - Progress tracking across multiple steps
 * - Data transformation pipelines
 * - Async data fetching within prompts
 */

import { text ,
  note,
  prism,
  group,
  select,
  confirm,
  spinner,
  isCancel,
  multiselect,
} from '../src/index.js';


const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Simulate API calls
const mockAPI = {
  checkUsername: async (username: string): Promise<boolean> => {
    await sleep(500);
    // Simulate some usernames being taken
    return ['admin', 'user', 'test'].includes(username.toLowerCase());
  },

  fetchCountries: async (): Promise<{ code: string; name: string }[]> => {
    await sleep(300);
    return [
      { code: 'US', name: 'United States' },
      { code: 'UK', name: 'United Kingdom' },
      { code: 'CA', name: 'Canada' },
      { code: 'AU', name: 'Australia' },
      { code: 'DE', name: 'Germany' },
      { code: 'FR', name: 'France' },
      { code: 'JP', name: 'Japan' },
      { code: 'CN', name: 'China' },
    ];
  },

  fetchCities: async (countryCode: string): Promise<string[]> => {
    await sleep(300);
    const cities: Record<string, string[]> = {
      US: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'],
      UK: ['London', 'Birmingham', 'Manchester', 'Glasgow', 'Liverpool'],
      CA: ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa'],
      AU: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide'],
      DE: ['Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt'],
      FR: ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice'],
      JP: ['Tokyo', 'Osaka', 'Kyoto', 'Yokohama', 'Nagoya'],
      CN: ['Beijing', 'Shanghai', 'Guangzhou', 'Shenzhen', 'Chengdu'],
    };
    return cities[countryCode] || [];
  },

  validateCreditCard: async (number: string): Promise<{ valid: boolean; type?: string }> => {
    await sleep(400);
    // Simple validation
    const cleaned = number.replace(/\s/g, '');
    if (cleaned.length !== 16) return { valid: false };
    if (cleaned.startsWith('4')) return { valid: true, type: 'Visa' };
    if (cleaned.startsWith('5')) return { valid: true, type: 'Mastercard' };
    if (cleaned.startsWith('3')) return { valid: true, type: 'Amex' };
    return { valid: false };
  },
};

async function main() {
  console.clear();
  console.log(prism.cyan('⚡ Advanced Group Component Features'));
  console.log(prism.gray('─'.repeat(50)));
  console.log();

  // Example 1: Multi-step form with async validation
  console.log(prism.yellow('🌐 Example 1: Async Validation & Data Fetching'));
  console.log();

  const userProfile = await group(
    {
      // Username with async availability check
      username: async () => {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
          const username = await text({
            message:
              attempts === 0
                ? 'Choose a username'
                : `Username taken. Try again (${maxAttempts - attempts} attempts left)`,
            placeholder: 'johndoe',
            validate: (value) => {
              if (!value || value.length < 3) {
                return 'Username must be at least 3 characters';
              }
              // Note: Async validation not supported in sync validate function
              // Will use separate validation in the while loop below
              return undefined;
            },
          });

          if (username && typeof username === 'string') {
            const s = spinner();
            s.start('Checking availability...');
            const isTaken = await mockAPI.checkUsername(username);
            s.stop('');

            if (!isTaken) {
              return username;
            }
          }

          attempts++;
        }

        throw new Error('Max attempts reached for username selection');
      },

      // Fetch and select country
      country: async () => {
        const s = spinner();
        s.start('Fetching countries...');

        const countries = await mockAPI.fetchCountries();

        s.stop('');

        return select({
          message: 'Select your country',
          options: countries.map((c) => ({
            value: c.code,
            label: c.name,
          })),
        });
      },

      // Fetch cities based on selected country
      city: async ({ results }) => {
        if (!results.country) return;

        const s = spinner();
        s.start('Fetching cities...');

        const cities = await mockAPI.fetchCities(results.country);

        s.stop('');

        if (cities.length === 0) {
          return text({
            message: 'Enter your city',
            placeholder: 'City name',
          });
        }

        return select({
          message: 'Select your city',
          options: cities.map((city) => ({
            value: city,
            label: city,
          })),
        });
      },

      // Preferences with nested group
      preferences: async () => {
        console.log();
        console.log(prism.gray('Configure your preferences...'));

        return group({
          theme: () =>
            select({
              message: 'Choose a theme',
              options: [
                { value: 'light', label: '☀️ Light' },
                { value: 'dark', label: '🌙 Dark' },
                { value: 'auto', label: '🌄 Auto' },
              ],
            }),

          notifications: () =>
            multiselect({
              message: 'Enable notifications for',
              options: [
                { value: 'email', label: '📧 Email' },
                { value: 'sms', label: '📱 SMS' },
                { value: 'push', label: '🔔 Push' },
                { value: 'browser', label: '🌐 Browser' },
              ],
              // instructions: 'Select all that apply' // Remove unsupported property
            }),

          language: () =>
            select({
              message: 'Preferred language',
              options: [
                { value: 'en', label: 'English' },
                { value: 'es', label: 'Español' },
                { value: 'fr', label: 'Français' },
                { value: 'de', label: 'Deutsch' },
                { value: 'ja', label: '日本語' },
                { value: 'zh', label: '中文' },
              ],
            }),
        });
      },
    },
    {
      onCancel: ({ results }) => {
        console.log();
        console.log(prism.red('✗ Profile setup cancelled'));
        console.log(prism.gray('Progress: ' + Object.keys(results).length + ' fields completed'));
      },
    }
  );

  if (userProfile.username) {
    console.log();
    console.log(prism.green('✓ Profile created successfully!'));
    console.log(prism.gray('Summary:'));
    console.log(`  Username: @${userProfile.username}`);
    console.log(`  Location: ${userProfile.city}, ${userProfile.country}`);
    if (userProfile.preferences) {
      console.log(`  Theme: ${userProfile.preferences.theme}`);
      console.log(
        `  Notifications: ${userProfile.preferences.notifications?.join(', ') || 'None'}`
      );
      console.log(`  Language: ${userProfile.preferences.language}`);
    }
  }

  console.log();
  console.log(prism.gray('─'.repeat(50)));
  console.log();

  // Example 2: Payment flow with validation and retry
  console.log(prism.yellow('💳 Example 2: Payment Flow with Validation'));
  console.log();

  const paymentFlow = await group({
    // Payment method selection
    paymentMethod: () =>
      select({
        message: 'Select payment method',
        options: [
          { value: 'card', label: '💳 Credit/Debit Card' },
          { value: 'paypal', label: '💵 PayPal' },
          { value: 'bank', label: '🏦 Bank Transfer' },
          { value: 'crypto', label: '🪙 Cryptocurrency' },
        ],
      }),

    // Card details (conditional)
    cardDetails: async ({ results }) => {
      if (results.paymentMethod !== 'card') return;

      return group({
        number: async () => {
          let isValid = false;
          let cardNumber = '';

          while (!isValid) {
            cardNumber = (await text({
              message: 'Card number',
              placeholder: '1234 5678 9012 3456',
              validate: (value) => {
                if (!value) {
                  return 'Card number is required';
                }
                const cleaned = value.replace(/\s/g, '');
                if (!/^\d{16}$/.test(cleaned)) {
                  return 'Card number must be 16 digits';
                }
                // Note: Async validation moved to while loop below
                return undefined;
              },
            })) as string;

            const validation = await mockAPI.validateCreditCard(cardNumber);
            isValid = validation.valid;

            if (isValid && validation.type) {
              console.log(prism.green(`  ✓ ${validation.type} card detected`));
            }
          }

          return cardNumber;
        },

        expiry: () =>
          text({
            message: 'Expiry date',
            placeholder: 'MM/YY',
            validate: (value) => {
              if (!value || !/^\d{2}\/\d{2}$/.test(value)) {
                return 'Format must be MM/YY';
              }
              const parts = value.split('/');
              const month = Number(parts[0]);
              const year = Number(parts[1]);
              if (month < 1 || month > 12) {
                return 'Invalid month';
              }
              const currentYear = new Date().getFullYear() % 100;
              if (year < currentYear) {
                return 'Card is expired';
              }
              return undefined;
            },
          }),

        cvv: () =>
          text({
            message: 'CVV',
            placeholder: '123',
            validate: (value) => {
              if (!value || !/^\d{3,4}$/.test(value)) {
                return 'CVV must be 3 or 4 digits';
              }
              return undefined;
            },
          }),

        saveCard: () =>
          confirm({
            message: 'Save card for future purchases?',
            // initial: false // Remove unsupported property
          }),
      });
    },

    // PayPal email (conditional)
    paypalEmail: ({ results }) => {
      if (results.paymentMethod !== 'paypal') return;

      return text({
        message: 'PayPal email',
        placeholder: 'user@example.com',
        validate: (value) => {
          if (!value || !value.includes('@')) {
            return 'Please enter a valid email';
          }
          return undefined;
        },
      });
    },

    // Bank details (conditional)
    bankDetails: ({ results }) => {
      if (results.paymentMethod !== 'bank') return;

      return group({
        accountName: () =>
          text({
            message: 'Account holder name',
            placeholder: 'John Doe',
          }),

        accountNumber: () =>
          text({
            message: 'Account number',
            placeholder: '12345678',
            validate: (value) => {
              if (!value || !/^\d{8,12}$/.test(value)) {
                return 'Account number must be 8-12 digits';
              }
              return undefined;
            },
          }),

        routingNumber: () =>
          text({
            message: 'Routing number',
            placeholder: '123456789',
            validate: (value) => {
              if (!value || !/^\d{9}$/.test(value)) {
                return 'Routing number must be 9 digits';
              }
              return undefined;
            },
          }),
      });
    },

    // Crypto selection (conditional)
    cryptoDetails: ({ results }) => {
      if (results.paymentMethod !== 'crypto') return;

      return group({
        currency: () =>
          select({
            message: 'Select cryptocurrency',
            options: [
              { value: 'btc', label: '₿ Bitcoin' },
              { value: 'eth', label: 'Ξ Ethereum' },
              { value: 'usdt', label: '₮ Tether (USDT)' },
              { value: 'usdc', label: '💵 USD Coin' },
            ],
          }),

        walletAddress: ({ results: cryptoResults }) =>
          text({
            message: `Enter your ${cryptoResults.currency?.toUpperCase()} wallet address`,
            placeholder: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb81',
            validate: (value) => {
              if (!value) {
                return 'Wallet address is required';
              }
              if (cryptoResults.currency === 'eth' && !value.startsWith('0x')) {
                return 'Ethereum addresses must start with 0x';
              }
              if (value.length < 26) {
                return 'Invalid wallet address';
              }
              return undefined;
            },
          }),
      });
    },

    // Billing address
    billingAddress: () =>
      confirm({
        message: 'Use shipping address for billing?',
        // initial: true // Remove unsupported property
      }),

    // Custom billing address (conditional)
    customBillingAddress: ({ results }) => {
      if (results.billingAddress !== false) return;

      return group({
        street: () =>
          text({
            message: 'Street address',
            placeholder: '123 Main St',
          }),

        city: () =>
          text({
            message: 'City',
            placeholder: 'New York',
          }),

        state: () =>
          text({
            message: 'State/Province',
            placeholder: 'NY',
          }),

        zip: () =>
          text({
            message: 'ZIP/Postal code',
            placeholder: '10001',
          }),
      });
    },

    // Final confirmation
    confirmPayment: ({ results }) => {
      let paymentSummary = `Payment Method: ${results.paymentMethod}`;

      if (results.paymentMethod === 'card' && results.cardDetails) {
        const cardDetails = results.cardDetails as any;
        const lastFour = cardDetails.number?.slice(-4);
        paymentSummary += `\n  Card: ****${lastFour}`;
      } else if (results.paymentMethod === 'paypal') {
        paymentSummary += `\n  Email: ${results.paypalEmail}`;
      } else if (results.paymentMethod === 'crypto' && results.cryptoDetails) {
        const cryptoDetails = results.cryptoDetails as any;
        paymentSummary += `\n  Currency: ${cryptoDetails.currency?.toUpperCase()}`;
      }

      return confirm({
        message: `Confirm payment?\n\n${paymentSummary}\n`,
      });
    },
  });

  if (paymentFlow.confirmPayment) {
    const s = spinner();
    s.start('Processing payment...');
    await sleep(2000);
    s.stop(prism.green('✓ Payment successful!'));
  }

  console.log();
  console.log(prism.gray('─'.repeat(50)));
  console.log();

  // Example 3: Data transformation pipeline
  console.log(prism.yellow('🔄 Example 3: Data Transformation Pipeline'));
  console.log();

  const dataPipeline = await group({
    // Input data
    inputData: () =>
      text({
        message: 'Enter comma-separated numbers',
        placeholder: '1,2,3,4,5',
        validate: (value) => {
          if (!value) {
            return 'Input is required';
          }
          const parts = value.split(',');
          for (const part of parts) {
            if (isNaN(Number(part.trim()))) {
              return 'All values must be numbers';
            }
          }
          return undefined;
        },
      }),

    // Parse and transform
    parsedData: ({ results }) => {
      if (!results.inputData) return;

      const numbers = results.inputData
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => !isNaN(n));

      return Promise.resolve(numbers);
    },

    // Select operation
    operation: ({ results }) => {
      const parsedData = results.parsedData as number[] | undefined;
      if (!parsedData || parsedData.length === 0) return;

      return select({
        message: `Select operation for [${parsedData.join(', ')}]`,
        options: [
          { value: 'sum', label: 'Sum' },
          { value: 'average', label: 'Average' },
          { value: 'min', label: 'Minimum' },
          { value: 'max', label: 'Maximum' },
          { value: 'sort', label: 'Sort' },
          { value: 'reverse', label: 'Reverse' },
          { value: 'unique', label: 'Remove duplicates' },
        ],
      });
    },

    // Apply operation
    result: ({ results }) => {
      const parsedData = results.parsedData as number[] | undefined;
      if (!parsedData || !results.operation) return;

      const data = parsedData;
      let result: number | number[];

      switch (results.operation) {
        case 'sum':
          result = data.reduce((a, b) => a + b, 0);
          break;
        case 'average':
          result = data.reduce((a, b) => a + b, 0) / data.length;
          break;
        case 'min':
          result = Math.min(...data);
          break;
        case 'max':
          result = Math.max(...data);
          break;
        case 'sort':
          result = [...data].sort((a, b) => a - b);
          break;
        case 'reverse':
          result = [...data].reverse();
          break;
        case 'unique':
          result = Array.from(new Set(data));
          break;
        default:
          result = data;
      }

      return Promise.resolve(result);
    },

    // Format output
    outputFormat: ({ results }) => {
      if (results.result === undefined) return;

      return select({
        message: 'Output format',
        options: [
          { value: 'plain', label: 'Plain text' },
          { value: 'json', label: 'JSON' },
          { value: 'csv', label: 'CSV' },
          { value: 'table', label: 'Table' },
        ],
      });
    },

    // Display result
    display: ({ results }) => {
      if (!results.result || !results.outputFormat) return;

      let output = '';
      const data = results.result;

      switch (results.outputFormat) {
        case 'plain':
          output = Array.isArray(data) ? data.join(', ') : String(data);
          break;
        case 'json':
          output = JSON.stringify(data, null, 2);
          break;
        case 'csv':
          output = Array.isArray(data) ? data.join(',') : String(data);
          break;
        case 'table':
          if (Array.isArray(data)) {
            output = '┌──────────┐\n';
            data.forEach((val, i) => {
              output += `│ ${String(val).padEnd(8)} │\n`;
              if (i < data.length - 1) {
                output += '├──────────┤\n';
              }
            });
            output += '└──────────┘';
          } else {
            output = String(data);
          }
          break;
      }

      console.log();
      note(output, `Result (${results.operation})`);

      return Promise.resolve(true);
    },
  });

  console.log();
  console.log(prism.cyan('🎆 Advanced examples completed!'));
  console.log();
}

// Run the demo
main().catch((error) => {
  if (isCancel(error)) {
    console.log();
    console.log(prism.yellow('⚠ Demo cancelled'));
  } else {
    console.error(prism.red('Error:'), error);
  }
  process.exit(1);
});
