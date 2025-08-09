#!/usr/bin/env node
import { join } from 'path';
import { build } from 'esbuild';
import { gzipSync } from 'zlib';
import { rmSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const testDir = join(process.cwd(), '.tree-shaking-test');

async function testTreeShaking() {
  console.log('\n🌳 Tree-Shaking Verification\n');
  console.log('=' .repeat(60));

  // Create test directory
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {}
  mkdirSync(testDir, { recursive: true });
  
  // Test cases
  const testCases = [
    {
      name: 'Single Component Import (text)',
      code: `
        import { text } from '@xec-sh/kit';
        text('Enter name:');
      `
    },
    {
      name: 'Multiple Component Import',
      code: `
        import { text, select, confirm } from '@xec-sh/kit';
        text('Name?');
        select('Choice?', ['a', 'b']);
        confirm('Continue?');
      `
    },
    {
      name: 'Default Import (should include all)',
      code: `
        import kit from '@xec-sh/kit';
        kit.text('Name?');
      `
    },
    {
      name: 'Specific Utils Import',
      code: `
        import { createTheme } from '@xec-sh/kit';
        createTheme({ colors: {} });
      `
    },
    {
      name: 'Plugin System Only',
      code: `
        import { PluginRegistry } from '@xec-sh/kit';
        new PluginRegistry();
      `
    }
  ];

  const results = [];

  for (const testCase of testCases) {
    const testFile = join(testDir, 'test.js');
    writeFileSync(testFile, testCase.code);

    try {
      const result = await build({
        entryPoints: [testFile],
        bundle: true,
        minify: true,
        treeShaking: true,
        write: false,
        format: 'esm',
        platform: 'node',
        external: ['picocolors', 'sisteransi'],
        alias: {
          '@xec-sh/kit': join(process.cwd(), 'dist/index.js')
        }
      });

      const output = result.outputFiles[0];
      const gzipped = gzipSync(output.contents);

      results.push({
        name: testCase.name,
        size: output.contents.length,
        gzipSize: gzipped.length
      });

    } catch (error) {
      results.push({
        name: testCase.name,
        size: 0,
        gzipSize: 0,
        error: error.message
      });
    }
  }

  // Clean up
  rmSync(testDir, { recursive: true, force: true });

  // Display results
  console.log('\n📊 Tree-Shaking Results:');
  console.log('-'.repeat(60));
  console.log('Test Case'.padEnd(40) + 'Size'.padEnd(10) + 'Gzip');
  console.log('-'.repeat(60));

  results.forEach(result => {
    const size = result.size ? formatBytes(result.size) : 'ERROR';
    const gzip = result.gzipSize ? formatBytes(result.gzipSize) : 'ERROR';
    console.log(
      result.name.padEnd(40) +
      size.padEnd(10) +
      gzip
    );
    if (result.error) {
      console.log(`  ⚠️  ${result.error}`);
    }
  });

  // Analysis
  const singleImport = results.find(r => r.name.includes('Single Component'));
  const defaultImport = results.find(r => r.name.includes('Default Import'));

  if (singleImport && defaultImport) {
    const savings = defaultImport.gzipSize - singleImport.gzipSize;
    const percentage = ((savings / defaultImport.gzipSize) * 100).toFixed(1);
    
    console.log('\n🎯 Tree-Shaking Effectiveness:');
    console.log('-'.repeat(60));
    console.log(`Single import size:  ${formatBytes(singleImport.gzipSize)}`);
    console.log(`Default import size: ${formatBytes(defaultImport.gzipSize)}`);
    console.log(`Savings:            ${formatBytes(savings)} (${percentage}%)`);
    console.log(`Status:             ${savings > 0 ? '✅ Tree-shaking is working!' : '❌ Tree-shaking needs improvement'}`);
  }

  // Check for common issues
  console.log('\n🔍 Common Issues Check:');
  console.log('-'.repeat(60));
  
  // Check for side effects
  const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
  console.log(`✓ sideEffects: ${packageJson.sideEffects === false ? '✅ false (good)' : '⚠️  not set to false'}`);
  
  // Check for proper exports
  console.log(`✓ ESM exports: ${packageJson.exports ? '✅ configured' : '❌ missing'}`);
  console.log(`✓ Module entry: ${packageJson.module ? '✅ configured' : '❌ missing'}`);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

testTreeShaking().catch(console.error);