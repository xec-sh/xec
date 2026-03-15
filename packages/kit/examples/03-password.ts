/**
 * 03 - Password Input
 *
 * Masked input for sensitive data with validation and clearOnError.
 */
import { intro, password, isCancel, cancel, log, outro } from '../src/index.js';

async function main() {
  intro('Password Input Examples');

  // Basic password
  const secret = await password({
    message: 'Enter your API key',
  });
  if (isCancel(secret)) { cancel('Cancelled.'); process.exit(0); }

  // Password with validation and clearOnError (clears input on validation failure)
  const strongPassword = await password({
    message: 'Create a strong password',
    clearOnError: true,
    validate: (value) => {
      if (!value) return 'Password is required.';
      if (value.length < 8) return 'At least 8 characters.';
      if (!/[A-Z]/.test(value)) return 'Must contain an uppercase letter.';
      if (!/[0-9]/.test(value)) return 'Must contain a number.';
      return undefined;
    },
  });
  if (isCancel(strongPassword)) { cancel('Cancelled.'); process.exit(0); }

  log.success('Credentials saved securely.');
  outro('Done!');
}

main().catch(console.error);
