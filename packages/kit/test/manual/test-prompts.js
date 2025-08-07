#!/usr/bin/env node
// Manual test script to verify kit functionality

import kit from '../../dist/index.js';

async function testKit() {
  console.log('Testing @xec-sh/kit components...\n');

  try {
    // Test text input
    const name = await kit.text('What is your name?', {
      placeholder: 'John Doe',
      validate: (value) => {
        if (!value || value.length < 2) {
          return 'Name must be at least 2 characters';
        }
      }
    });
    console.log(`Hello, ${name}!\n`);

    // Test confirm
    const confirmed = await kit.confirm('Do you want to continue?', { 
      default: true 
    });
    
    if (!confirmed) {
      console.log('Test cancelled by user');
      return;
    }

    // Test select
    const color = await kit.select('Pick a color:', [
      { value: 'red', label: 'Red', hint: 'Like roses' },
      { value: 'blue', label: 'Blue', hint: 'Like the sky' },
      { value: 'green', label: 'Green', hint: 'Like grass' }
    ]);
    console.log(`You picked: ${color}\n`);

    // Test multiselect
    const hobbies = await kit.multiselect('Select your hobbies:', [
      'Reading',
      'Gaming', 
      'Sports',
      'Music',
      'Cooking'
    ]);
    console.log(`Your hobbies: ${hobbies.join(', ')}\n`);

    // Test password
    const password = await kit.password('Create a password:', {
      showStrength: true
    });
    console.log('Password created successfully!\n');

    // Test logging
    kit.log.success('All tests completed successfully!');
    kit.log.info('This is an info message');
    kit.log.warning('This is a warning');
    kit.log.error('This is an error (but not a real one)');

  } catch (error) {
    if (error.message === 'Cancelled') {
      kit.log.warning('Test cancelled by user');
    } else {
      kit.log.error(`Test failed: ${error.message}`);
      console.error(error.stack);
    }
  }
}

// Run the test
testKit();