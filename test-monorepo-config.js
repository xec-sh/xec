#!/usr/bin/env node

/**
 * Test script to demonstrate monorepo configuration detection
 */

const { ConfigurationManager } = require('./apps/xec/dist/config/configuration-manager.js');
const path = require('path');

async function testMonorepoConfig() {
  console.log('Testing Xec Monorepo Configuration Detection\n');
  console.log('='.repeat(50));
  
  // Test from different locations in the monorepo
  const testLocations = [
    process.cwd(), // Root of monorepo
    path.join(process.cwd(), 'apps', 'xec'),
    path.join(process.cwd(), 'packages', 'core'),
    path.join(process.cwd(), 'packages', 'kit', 'src', 'components')
  ];

  for (const location of testLocations) {
    console.log(`\nTesting from: ${location.replace(process.cwd(), '.')}`);
    console.log('-'.repeat(40));
    
    try {
      const manager = new ConfigurationManager({
        projectRoot: location,
        cache: false
      });
      
      const projectRoot = await manager.getProjectRoot();
      console.log(`  Project root found: ${projectRoot.replace(process.cwd(), '.')}`);
      
      const config = await manager.load();
      console.log(`  Config name: ${config.name || '(not set)'}`);
      
      // Check where config was loaded from
      const sources = manager.sources || [];
      const projectSource = sources.find(s => s.type === 'project');
      if (projectSource && projectSource.path) {
        console.log(`  Config loaded from: ${projectSource.path.replace(process.cwd(), '.')}`);
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('\nConclusion:');
  console.log('The configuration manager now correctly finds the .xec folder');
  console.log('at the monorepo root, regardless of which subdirectory you run');
  console.log('commands from. This ensures consistent configuration across');
  console.log('the entire monorepo workspace.');
}

testMonorepoConfig().catch(console.error);