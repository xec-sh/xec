#!/usr/bin/env node
import { join } from 'path';
import { execSync } from 'child_process';
import { rmSync, writeFileSync } from 'fs';
const testDir = join(process.cwd(), '.memory-test');
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
async function profileMemory() {
    console.log('\n💾 Memory Usage Profiling\n');
    console.log('='.repeat(60));
    try {
        rmSync(testDir, { recursive: true, force: true });
    }
    catch { }
    execSync(`mkdir -p ${testDir}`);
    const scenarios = [
        {
            name: 'Baseline (empty script)',
            code: `
        if (global.gc) global.gc();
        const baseline = process.memoryUsage();
        console.log(JSON.stringify(baseline));
      `
        },
        {
            name: 'Kit import only',
            code: `
        if (global.gc) global.gc();
        const before = process.memoryUsage();
        
        import('@xec-sh/kit').then(() => {
          if (global.gc) global.gc();
          const after = process.memoryUsage();
          console.log(JSON.stringify({
            before,
            after,
            delta: {
              heapUsed: after.heapUsed - before.heapUsed,
              external: after.external - before.external,
              rss: after.rss - before.rss
            }
          }));
        });
      `
        },
        {
            name: 'Simple prompt usage',
            code: `
        import('@xec-sh/kit').then(async (kit) => {
          if (global.gc) global.gc();
          const before = process.memoryUsage();
          
          // Create a simple prompt without showing it
          const { text } = kit;
          const prompt = () => text('Enter name:');
          
          if (global.gc) global.gc();
          const after = process.memoryUsage();
          console.log(JSON.stringify({
            before,
            after,
            delta: {
              heapUsed: after.heapUsed - before.heapUsed,
              external: after.external - before.external,
              rss: after.rss - before.rss
            }
          }));
        });
      `
        },
        {
            name: 'Multiple components loaded',
            code: `
        import('@xec-sh/kit').then(async (kit) => {
          if (global.gc) global.gc();
          const before = process.memoryUsage();
          
          // Load multiple components
          const { text, select, confirm, spinner, progress, taskList, table, form } = kit;
          
          // Create instances without running
          const instances = [
            () => text('Name?'),
            () => select('Choice?', ['a', 'b']),
            () => confirm('Sure?'),
            () => spinner('Loading...'),
            () => progress({ title: 'Progress', total: 100 }),
            () => taskList([{ title: 'Task', task: () => {} }]),
            () => table({ columns: [], data: [] }),
            () => form({ fields: [] })
          ];
          
          if (global.gc) global.gc();
          const after = process.memoryUsage();
          console.log(JSON.stringify({
            before,
            after,
            delta: {
              heapUsed: after.heapUsed - before.heapUsed,
              external: after.external - before.external,
              rss: after.rss - before.rss
            }
          }));
        });
      `
        },
        {
            name: 'Large data handling (10k items)',
            code: `
        import('@xec-sh/kit').then(async (kit) => {
          if (global.gc) global.gc();
          const before = process.memoryUsage();
          
          // Create large dataset
          const { select, table } = kit;
          const items = Array.from({ length: 10000 }, (_, i) => ({
            value: \`item-\${i}\`,
            label: \`Item \${i}\`,
            description: \`This is a description for item \${i}\`
          }));
          
          // Create components with large data
          const components = [
            () => select('Choose item', items),
            () => table({
              columns: [
                { key: 'value', label: 'Value' },
                { key: 'label', label: 'Label' },
                { key: 'description', label: 'Description' }
              ],
              data: items
            })
          ];
          
          if (global.gc) global.gc();
          const after = process.memoryUsage();
          console.log(JSON.stringify({
            before,
            after,
            delta: {
              heapUsed: after.heapUsed - before.heapUsed,
              external: after.external - before.external,
              rss: after.rss - before.rss
            }
          }));
        });
      `
        }
    ];
    const results = [];
    for (const scenario of scenarios) {
        const testFile = join(testDir, 'test.mjs');
        writeFileSync(testFile, scenario.code);
        try {
            const output = execSync(`node --expose-gc ${testFile}`, {
                cwd: process.cwd(),
                encoding: 'utf-8'
            });
            const data = JSON.parse(output.trim());
            results.push({
                name: scenario.name,
                ...data
            });
        }
        catch (error) {
            console.error(`Error in ${scenario.name}:`, error.message);
        }
    }
    rmSync(testDir, { recursive: true, force: true });
    console.log('\n📊 Memory Usage Results:');
    console.log('-'.repeat(60));
    console.log('Scenario'.padEnd(35) + 'Heap Used'.padEnd(12) + 'RSS'.padEnd(12) + 'External');
    console.log('-'.repeat(60));
    const baseline = results.find(r => r.name.includes('Baseline'));
    results.forEach(result => {
        if (result.delta) {
            console.log(result.name.padEnd(35) +
                formatBytes(result.delta.heapUsed).padEnd(12) +
                formatBytes(result.delta.rss).padEnd(12) +
                formatBytes(result.delta.external));
        }
        else if (baseline) {
            console.log(result.name.padEnd(35) +
                formatBytes(result.heapUsed).padEnd(12) +
                formatBytes(result.rss).padEnd(12) +
                formatBytes(result.external));
        }
    });
    const kitImport = results.find(r => r.name.includes('Kit import'));
    const largeData = results.find(r => r.name.includes('10k items'));
    if (kitImport && largeData) {
        console.log('\n🎯 Memory Analysis:');
        console.log('-'.repeat(60));
        console.log(`Kit import overhead: ${formatBytes(kitImport.delta.heapUsed)}`);
        console.log(`Large data (10k):    ${formatBytes(largeData.delta.heapUsed)}`);
        console.log(`Target (idle):       <30MB`);
        console.log(`Target (10k items):  <50MB`);
        const idleOk = kitImport.delta.heapUsed < 30 * 1024 * 1024;
        const largeOk = largeData.delta.heapUsed < 50 * 1024 * 1024;
        console.log(`\nStatus:`);
        console.log(`  Idle memory:  ${idleOk ? '✅' : '❌'} ${idleOk ? 'Under target!' : 'Needs optimization'}`);
        console.log(`  Large data:   ${largeOk ? '✅' : '❌'} ${largeOk ? 'Under target!' : 'Needs optimization'}`);
    }
    console.log('\n🔍 Memory Leak Check:');
    console.log('-'.repeat(60));
    const leakTestCode = `
    import('@xec-sh/kit').then(async (kit) => {
      const { text } = kit;
      const measurements = [];
      
      // Create and destroy prompts multiple times
      for (let i = 0; i < 5; i++) {
        if (global.gc) global.gc();
        const before = process.memoryUsage().heapUsed;
        
        // Create 100 prompts
        for (let j = 0; j < 100; j++) {
          const prompt = text(\`Question \${j}\`);
        }
        
        if (global.gc) global.gc();
        const after = process.memoryUsage().heapUsed;
        measurements.push(after - before);
      }
      
      console.log(JSON.stringify(measurements));
    });
  `;
    const leakTestFile = join(testDir, 'leak-test.mjs');
    writeFileSync(leakTestFile, leakTestCode);
    try {
        const output = execSync(`node --expose-gc ${leakTestFile}`, {
            cwd: process.cwd(),
            encoding: 'utf-8'
        });
        const measurements = JSON.parse(output.trim());
        const avgGrowth = measurements.slice(1).reduce((acc, val, i) => acc + (val - measurements[i]) / (measurements.length - 1), 0);
        console.log(`Average memory growth: ${formatBytes(avgGrowth)} per iteration`);
        console.log(`Leak detected: ${avgGrowth > 1024 * 1024 ? '❌ Possible leak' : '✅ No significant leak'}`);
    }
    catch (error) {
        console.error('Leak test error:', error.message);
    }
    rmSync(testDir, { recursive: true, force: true });
}
profileMemory().catch(console.error);
//# sourceMappingURL=profile-memory.js.map