/**
 * 04 - Select Prompt
 *
 * Single-selection from a list of options with hints, disabled items,
 * and long message wrapping.
 */
import { intro, select, isCancel, cancel, log, outro } from '../src/index.js';

async function main() {
  intro('Select Prompt Examples');

  // Basic select with hints
  const framework = await select({
    message: 'Which framework do you prefer?',
    options: [
      { value: 'next', label: 'Next.js', hint: 'React framework' },
      { value: 'nuxt', label: 'Nuxt', hint: 'Vue framework' },
      { value: 'svelte', label: 'SvelteKit', hint: 'Svelte framework' },
      { value: 'astro', label: 'Astro', hint: 'content-focused' },
    ],
  });
  if (isCancel(framework)) { cancel('Cancelled.'); process.exit(0); }

  // Select with disabled options
  const plan = await select({
    message: 'Choose your subscription plan',
    initialValue: 'pro',
    options: [
      { value: 'free', label: 'Free', hint: '$0/mo' },
      { value: 'pro', label: 'Pro', hint: '$19/mo' },
      { value: 'team', label: 'Team', hint: '$49/mo' },
      { value: 'enterprise', label: 'Enterprise', hint: 'Contact sales', disabled: true },
    ],
  });
  if (isCancel(plan)) { cancel('Cancelled.'); process.exit(0); }

  // Select with maxItems (pagination)
  const color = await select({
    message: 'Pick a color from the palette',
    maxItems: 5,
    options: [
      { value: 'red', label: 'Red' },
      { value: 'orange', label: 'Orange' },
      { value: 'yellow', label: 'Yellow' },
      { value: 'green', label: 'Green' },
      { value: 'blue', label: 'Blue' },
      { value: 'indigo', label: 'Indigo' },
      { value: 'violet', label: 'Violet' },
      { value: 'pink', label: 'Pink' },
    ],
  });
  if (isCancel(color)) { cancel('Cancelled.'); process.exit(0); }

  log.success(`Framework: ${framework}, Plan: ${plan}, Color: ${color}`);
  outro('Done!');
}

main().catch(console.error);
