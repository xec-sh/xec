#!/usr/bin/env node

/**
 * Simple test application without alternate buffer
 */

const { createTerminal } = require('../../dist/index.cjs');

async function main() {
  // Simple output for testing
  console.log('Simple Test Running');
  console.log('Test completed successfully');
  
  // Exit quickly for tests
  setTimeout(() => {
    process.exit(0);
  }, 100);
}

main().catch(console.error);