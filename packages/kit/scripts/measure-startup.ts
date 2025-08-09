#!/usr/bin/env node
import { join } from 'path';
import { execSync } from 'child_process';
import { rmSync, readFileSync, writeFileSync } from 'fs';

const testDir = join(process.cwd(), '.startup-test');

function measureStartupTime() {
  console.log('\n⏱️  Startup Time Analysis\n');
  console.log('=' .repeat(60));

  // Create test directory
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {}
  execSync(`mkdir -p ${testDir}`);

  // Test cases
  const testCases = [
    {
      name: 'Minimal import (just kit)',
      code: `
        const start = process.hrtime.bigint();
        import('@xec-sh/kit').then(() => {
          const end = process.hrtime.bigint();
          console.log(Number(end - start) / 1000000);
        });
      `
    },
    {
      name: 'Single component import',
      code: `
        const start = process.hrtime.bigint();
        import('@xec-sh/kit').then(({ text }) => {
          const end = process.hrtime.bigint();
          console.log(Number(end - start) / 1000000);
        });
      `
    },
    {
      name: 'Multiple component import',
      code: `
        const start = process.hrtime.bigint();
        import('@xec-sh/kit').then(({ text, select, confirm, spinner, progress }) => {
          const end = process.hrtime.bigint();
          console.log(Number(end - start) / 1000000);
        });
      `
    },
    {
      name: 'Full kit usage',
      code: `
        const start = process.hrtime.bigint();
        import('@xec-sh/kit').then((kit) => {
          const k = kit.default || kit;
          // Access various parts to trigger any lazy loading
          k.text && k.select && k.confirm && k.spinner && k.progress;
          const end = process.hrtime.bigint();
          console.log(Number(end - start) / 1000000);
        });
      `
    }
  ];

  const results = [];

  // Run each test multiple times for accuracy
  const runs = 5;
  
  for (const testCase of testCases) {
    const testFile = join(testDir, 'test.mjs');
    writeFileSync(testFile, testCase.code);

    const times = [];
    
    // Warm up run
    try {
      execSync(`node ${testFile}`, { cwd: process.cwd() });
    } catch {}

    // Measured runs
    for (let i = 0; i < runs; i++) {
      try {
        const output = execSync(`node ${testFile}`, { 
          cwd: process.cwd(),
          encoding: 'utf-8'
        });
        const time = parseFloat(output.trim());
        if (!isNaN(time)) {
          times.push(time);
        }
      } catch (error) {
        console.error(`Error in ${testCase.name}:`, error.message);
      }
    }

    if (times.length > 0) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      
      results.push({
        name: testCase.name,
        avg,
        min,
        max,
        times
      });
    }
  }

  // Clean up
  rmSync(testDir, { recursive: true, force: true });

  // Display results
  console.log('\n📊 Startup Time Results:');
  console.log('-'.repeat(60));
  console.log('Test Case'.padEnd(35) + 'Avg (ms)'.padEnd(10) + 'Min'.padEnd(10) + 'Max');
  console.log('-'.repeat(60));

  results.forEach(result => {
    console.log(
      result.name.padEnd(35) +
      result.avg.toFixed(2).padEnd(10) +
      result.min.toFixed(2).padEnd(10) +
      result.max.toFixed(2)
    );
  });

  // Analysis
  const minimal = results.find(r => r.name.includes('Minimal'));
  const full = results.find(r => r.name.includes('Full kit'));

  if (minimal && full) {
    console.log('\n🎯 Performance Analysis:');
    console.log('-'.repeat(60));
    console.log(`Minimal import:  ${minimal.avg.toFixed(2)}ms`);
    console.log(`Full kit usage:  ${full.avg.toFixed(2)}ms`);
    console.log(`Overhead:        ${(full.avg - minimal.avg).toFixed(2)}ms`);
    console.log(`Target:          <100ms`);
    console.log(`Status:          ${full.avg < 100 ? '✅ Under target!' : '❌ Needs optimization'}`);
  }

  // Optimization suggestions
  if (results.some(r => r.avg > 100)) {
    console.log('\n💡 Optimization Suggestions:');
    console.log('-'.repeat(60));
    console.log('• Consider lazy loading heavy dependencies');
    console.log('• Use dynamic imports for optional features');
    console.log('• Minimize top-level code execution');
    console.log('• Cache parsed configurations');
    console.log('• Defer non-critical initializations');
  }

  // Check for lazy loading opportunities
  console.log('\n🔍 Module Analysis:');
  console.log('-'.repeat(60));
  
  // Check main bundle
  const mainBundle = readFileSync(join(process.cwd(), 'dist/index.js'), 'utf-8');
  const dynamicImports = (mainBundle.match(/import\(/g) || []).length;
  const staticImports = (mainBundle.match(/import .* from/g) || []).length;
  
  console.log(`Static imports:  ${staticImports}`);
  console.log(`Dynamic imports: ${dynamicImports}`);
  console.log(`Lazy loading:    ${dynamicImports > 0 ? '✅ Enabled' : '❌ Not used'}`);
}

measureStartupTime();