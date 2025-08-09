#!/usr/bin/env tsx

/**
 * Demonstration of cursor functionality in text and number inputs
 */

import tx from '../src/instant.js';

async function main() {
  console.log('Cursor Functionality Demo\n');
  console.log('This demo shows different cursor styles and options for text input.\n');

  // Example 1: Default cursor (block style, shown)
  console.log('1. Default cursor (block style):');
  const name = await tx.text('Enter your name:')
    .placeholder('John Doe')
    .prompt();
  
  if (name) {
    console.log(`Hello, ${name}!\n`);
  }

  // Example 2: Underline cursor
  console.log('2. Underline cursor style:');
  const email = await tx.text('Enter your email:')
    .placeholder('user@example.com')
    .cursorStyle('underline')
    .validate(value => {
      if (!value.includes('@')) return 'Please enter a valid email';
      return undefined;
    })
    .prompt();
  
  if (email) {
    console.log(`Email: ${email}\n`);
  }

  // Example 3: Bar cursor
  console.log('3. Bar cursor style:');
  const username = await tx.text('Choose a username:')
    .cursorStyle('bar')
    .minLength(3)
    .maxLength(20)
    .prompt();
  
  if (username) {
    console.log(`Username: ${username}\n`);
  }

  // Example 4: Hidden cursor (for special cases)
  console.log('4. Hidden cursor (no cursor shown):');
  const secret = await tx.text('Enter secret code:')
    .showCursor(false)
    .mask('*')
    .prompt();
  
  if (secret) {
    console.log(`Secret entered: ${secret}\n`);
  }

  // Example 5: Number input with cursor
  console.log('5. Number input with block cursor:');
  const age = await tx.number('Enter your age:')
    .min(0)
    .max(150)
    .cursorStyle('block')
    .prompt();
  
  if (age !== null) {
    console.log(`Age: ${age}\n`);
  }

  // Example 6: Number input with underline cursor
  console.log('6. Price input with underline cursor:');
  const price = await tx.number('Enter price:')
    .min(0)
    .decimals(2)
    .cursorStyle('underline')
    .format(value => `$${value.toFixed(2)}`)
    .prompt();
  
  if (price !== null) {
    console.log(`Price: $${price.toFixed(2)}\n`);
  }

  console.log('Demo completed!');
}

main().catch(console.error);