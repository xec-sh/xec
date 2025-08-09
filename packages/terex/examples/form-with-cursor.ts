#!/usr/bin/env tsx

/**
 * Advanced form example with cursor customization
 */

import tx from '../src/instant.js';

async function main() {
  console.log('User Registration Form\n');
  console.log('Fill out the form below. Notice how the cursor changes for different fields.\n');

  // Username with bar cursor
  const username = await tx.text('Username:')
    .placeholder('johndoe')
    .minLength(3)
    .maxLength(20)
    .cursorStyle('bar')
    .pattern(/^[a-zA-Z0-9_]+$/)
    .validate(value => {
      if (!/^[a-zA-Z0-9_]+$/.test(value)) {
        return 'Username can only contain letters, numbers, and underscores';
      }
      return undefined;
    })
    .prompt();

  if (!username) {
    console.log('Registration cancelled');
    return;
  }

  // Email with underline cursor
  const email = await tx.text('Email:')
    .placeholder('user@example.com')
    .cursorStyle('underline')
    .validate(value => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return 'Please enter a valid email address';
      }
      return undefined;
    })
    .prompt();

  if (!email) {
    console.log('Registration cancelled');
    return;
  }

  // Password with hidden cursor for security
  const password = await tx.text('Password:')
    .mask('*')
    .minLength(8)
    .showCursor(false)  // Hide cursor for password fields
    .validate(value => {
      if (value.length < 8) return 'Password must be at least 8 characters';
      if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter';
      if (!/[a-z]/.test(value)) return 'Password must contain at least one lowercase letter';
      if (!/[0-9]/.test(value)) return 'Password must contain at least one number';
      return undefined;
    })
    .prompt();

  if (!password) {
    console.log('Registration cancelled');
    return;
  }

  // Confirm password with hidden cursor
  const confirmPassword = await tx.text('Confirm Password:')
    .mask('*')
    .showCursor(false)
    .validate(value => {
      if (value !== password) {
        return 'Passwords do not match';
      }
      return undefined;
    })
    .prompt();

  if (!confirmPassword) {
    console.log('Registration cancelled');
    return;
  }

  // Age with block cursor (default)
  const age = await tx.number('Age:')
    .min(13)
    .max(120)
    .validate(value => {
      if (value < 13) return 'You must be at least 13 years old';
      return undefined;
    })
    .prompt();

  if (age === null) {
    console.log('Registration cancelled');
    return;
  }

  // Phone with underline cursor
  const phone = await tx.text('Phone Number (optional):')
    .placeholder('555-123-4567')
    .cursorStyle('underline')
    .pattern(/^\d{3}-\d{3}-\d{4}$/)
    .validate(value => {
      if (value && !/^\d{3}-\d{3}-\d{4}$/.test(value)) {
        return 'Please use format: 555-123-4567';
      }
      return undefined;
    })
    .prompt();

  // Terms acceptance
  const acceptTerms = await tx.confirm('I accept the terms and conditions')
    .defaultValue(false)
    .prompt();

  if (!acceptTerms) {
    console.log('You must accept the terms to continue');
    return;
  }

  // Summary
  console.log('\n✅ Registration Successful!\n');
  console.log('User Details:');
  console.log(`  Username: ${username}`);
  console.log(`  Email: ${email}`);
  console.log(`  Age: ${age}`);
  if (phone) {
    console.log(`  Phone: ${phone}`);
  }
  console.log('\nThank you for registering!');
}

main().catch(console.error);