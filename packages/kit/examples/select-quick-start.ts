#!/usr/bin/env tsx
/**
 * Select Component Quick Start
 *
 * Simple examples showing common use cases for the select prompt
 */

import { note , intro, outro, select, isCancel, prism as color } from '../src/index.js';


async function main() {
  console.clear();
  intro(color.bgBlue(color.white(' Quick Select Examples ')));

  // Simple selection
  const animal = await select({
    message: 'Pick your favorite animal',
    options: [
      { value: 'dog', label: '🐕 Dog' },
      { value: 'cat', label: '🐱 Cat' },
      { value: 'bird', label: '🦜 Bird' },
      { value: 'fish', label: '🐠 Fish' },
    ],
  });

  if (isCancel(animal)) {
    outro(color.red('Cancelled'));
    process.exit(0);
  }

  console.log(`You selected: ${animal}\n`);

  // Selection with hints
  const transport = await select({
    message: 'How do you commute?',
    options: [
      { value: 'car', label: '🚗 Car', hint: 'Personal vehicle' },
      { value: 'bike', label: '🚴 Bicycle', hint: 'Eco-friendly' },
      { value: 'bus', label: '🚌 Bus', hint: 'Public transport' },
      { value: 'train', label: '🚂 Train', hint: 'Fast & comfortable' },
      { value: 'walk', label: '🚶 Walk', hint: 'Healthy choice' },
    ],
    initialValue: 'bus', // Default selection
  });

  if (!isCancel(transport)) {
    note(`You commute by: ${transport}`, 'Transport Mode');
  }

  // Numeric values with custom formatting
  const rating = await select({
    message: 'Rate your experience',
    options: [
      { value: 5, label: '⭐⭐⭐⭐⭐ Excellent' },
      { value: 4, label: '⭐⭐⭐⭐ Good' },
      { value: 3, label: '⭐⭐⭐ Average' },
      { value: 2, label: '⭐⭐ Poor' },
      { value: 1, label: '⭐ Terrible' },
    ],
  });

  if (!isCancel(rating)) {
    const message =
      rating >= 4
        ? 'Thank you for the positive feedback!'
        : rating === 3
          ? "We'll work to improve!"
          : "We're sorry to hear that. We'll do better!";
    note(message, `Rating: ${rating}/5`);
  }

  outro(color.green('✨ Thanks for trying the select component!'));
}

main().catch(console.error);
