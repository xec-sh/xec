#!/usr/bin/env node
// Basic example showing simple prompt usage

import kit from '@xec-sh/kit';

async function main() {
  // Simple text input
  const name = await kit.text('What is your name?');
  kit.log.success(`Hello, ${name}!`);

  // Confirmation
  const proceed = await kit.confirm('Would you like to continue?');
  if (!proceed) {
    kit.log.info('Goodbye!');
    return;
  }

  // Single selection
  const color = await kit.select('What is your favorite color?', [
    'red',
    'blue', 
    'green',
    'yellow',
    'purple'
  ]);
  kit.log.message(`You selected: ${color}`);

  // Multiple selection
  const hobbies = await kit.multiselect('Select your hobbies:', [
    'reading',
    'gaming',
    'sports',
    'music',
    'cooking',
    'travel'
  ]);
  kit.log.message(`Your hobbies: ${hobbies.join(', ')}`);

  // Password input
  const password = await kit.password('Enter a password:', {
    showStrength: true
  });
  kit.log.success('Password saved!');

  // Summary
  kit.log.break();
  kit.log.step('Summary:');
  kit.log.message(`Name: ${name}`);
  kit.log.message(`Favorite color: ${color}`);
  kit.log.message(`Hobbies: ${hobbies.join(', ')}`);
  kit.log.message('Password: ********');
}

main().catch(error => {
  if (error.message === 'Cancelled') {
    kit.log.warning('Cancelled by user');
  } else {
    kit.log.error(`Error: ${error.message}`);
  }
  process.exit(1);
});