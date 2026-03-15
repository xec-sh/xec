/**
 * 01 - Text Input
 *
 * The simplest prompt: single-line text input with placeholder,
 * default value, and validation.
 */
import { intro, text, isCancel, cancel, outro, log } from '../src/index.js';

async function main() {
  intro('Text Input Examples');

  // Basic text input with placeholder
  const name = await text({
    message: 'What is your name?',
    placeholder: 'John Doe',
  });
  if (isCancel(name)) { cancel('Cancelled.'); process.exit(0); }

  // Text with default value (used if user presses Enter immediately)
  const greeting = await text({
    message: 'How should we greet you?',
    defaultValue: `Hello, ${name}!`,
  });
  if (isCancel(greeting)) { cancel('Cancelled.'); process.exit(0); }

  // Text with validation
  const email = await text({
    message: 'Enter your email',
    placeholder: 'you@example.com',
    validate: (value) => {
      if (!value) return 'Email is required.';
      if (!value.includes('@')) return 'Please enter a valid email.';
      return undefined;
    },
  });
  if (isCancel(email)) { cancel('Cancelled.'); process.exit(0); }

  log.success(`Welcome, ${name}! (${email})`);
  outro(greeting as string);
}

main().catch(console.error);
