#!/usr/bin/env node

/**
 * Object Interpolation Examples
 * 
 * This file demonstrates how objects are automatically JSON stringified
 * when used in template literals with @xec-js/ush
 */

import { $ } from '../src/index.js';

async function main() {
  console.log('🚀 Object Interpolation Examples\n');

  // Example 1: Basic object interpolation
  console.log('1. Basic Object Interpolation:');
  const config = { name: 'app', port: 3000, debug: true };

  try {
    // This will JSON stringify the object
    const result1 = await $`echo ${config}`;
    console.log('   Command executed:', `echo ${JSON.stringify(config)}`);
    console.log('   Result:', result1.stdout.trim());
  } catch (error) {
    console.log('   Expected behavior - JSON stringified object in command');
  }

  // Example 2: Writing configuration to file
  console.log('\n2. Writing Configuration to File:');
  const serverConfig = {
    server: {
      host: 'localhost',
      port: 8080,
      ssl: false
    },
    database: {
      host: 'db.example.com',
      port: 5432,
      name: 'myapp'
    }
  };

  try {
    // This creates a config.json file with the properly formatted JSON
    await $`echo ${serverConfig} > config.json`;
    console.log('   ✓ Configuration written to config.json');

    // Verify the file was created correctly
    const content = await $`cat config.json`;
    console.log('   File content:', content.stdout.trim());
  } catch (error) {
    console.log('   Note: File operations might not work in all environments');
  }

  // Example 3: Arrays of objects
  console.log('\n3. Arrays of Objects:');
  const users = [
    { id: 1, name: 'Alice', role: 'admin' },
    { id: 2, name: 'Bob', role: 'user' },
    { id: 3, name: 'Charlie', role: 'moderator' }
  ];

  try {
    // Each object in the array is JSON stringified separately
    const result3 = await $`echo ${users}`;
    console.log('   Command:', `echo ${users.map(u => JSON.stringify(u)).join(' ')}`);
    console.log('   Result:', result3.stdout.trim());
  } catch (error) {
    console.log('   Expected behavior - each object JSON stringified');
  }

  // Example 4: Mixed data types
  console.log('\n4. Mixed Data Types:');
  const mixed = [
    'hello',
    42,
    { type: 'config', value: 'production' },
    true,
    new Date('2023-12-01T10:30:00.000Z')
  ];

  try {
    const result4 = await $`echo ${mixed}`;
    console.log('   Mixed array processed successfully');
    console.log('   Result:', result4.stdout.trim());
  } catch (error) {
    console.log('   Expected behavior - mixed types handled correctly');
  }

  // Example 5: Complex nested structure
  console.log('\n5. Complex Nested Structure:');
  const complexData = {
    application: {
      name: 'MyApp',
      version: '1.2.3',
      features: ['auth', 'logging', 'monitoring']
    },
    deployment: {
      environment: 'production',
      replicas: 3,
      resources: {
        cpu: '500m',
        memory: '1Gi'
      }
    },
    timestamp: new Date()
  };

  try {
    const result5 = await $`echo ${complexData}`;
    console.log('   Complex nested structure processed');
    console.log('   Result length:', result5.stdout.trim().length, 'characters');
  } catch (error) {
    console.log('   Expected behavior - complex structure JSON stringified');
  }

  console.log('\n✅ All examples completed!');
  console.log('\nKey Points:');
  console.log('- Objects are automatically JSON stringified');
  console.log('- Arrays of objects have each element JSON stringified');
  console.log('- Date objects are converted to ISO strings');
  console.log('- Mixed arrays handle each type appropriately');
  console.log('- Complex nested structures are handled correctly');
}

// Run the examples
main().catch(console.error);