import { z } from 'zod';
/**
 * 01 - Text Input
 *
 * The simplest prompt: single-line text input with placeholder,
 * default value, asynchronous validation, and a Standard Schema validator.
 */
import { setTimeout } from 'node:timers/promises';

import { log, text, intro, outro, cancel, isCancel } from '../src/index.js';

async function main() {
  intro('Text Input Examples');

  // Basic text input with placeholder
  const name = await text({
    message: 'What is your name?',
    placeholder: 'Alex',
    validate: async (value) => {
      // Replace this local check with your own awaited validation if needed.
      await setTimeout(80);
      return (value?.trim().length ?? 0) < 2 ? 'Use at least two characters.' : undefined;
    },
  });
  if (isCancel(name)) {
    cancel('Cancelled.');
    return;
  }

  // Text with default value (used if user presses Enter immediately)
  const greeting = await text({
    message: 'How should we greet you?',
    defaultValue: `Hello, ${name}!`,
  });
  if (isCancel(greeting)) {
    cancel('Cancelled.');
    return;
  }

  // Zod implements Standard Schema; no adapter or custom wrapper is needed.
  const email = await text({
    message: 'Enter your email',
    placeholder: 'you@example.com',
    validate: z.email('Please enter a valid email.'),
  });
  if (isCancel(email)) {
    cancel('Cancelled.');
    return;
  }

  log.success(`Welcome, ${name}! (${email})`);
  outro(greeting);
}

await main();
