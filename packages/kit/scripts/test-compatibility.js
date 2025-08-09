#!/usr/bin/env node
import { join } from 'path';
import { execSync } from 'child_process';
import { rmSync, readFileSync, writeFileSync } from 'fs';
async function testCompatibility() {
    console.log('\n🔧 Runtime Compatibility Test\n');
    console.log('='.repeat(60));
    const results = [];
    const testDir = join(process.cwd(), '.compatibility-test');
    try {
        rmSync(testDir, { recursive: true, force: true });
    }
    catch { }
    execSync(`mkdir -p ${testDir}`);
    const testScript = `
    const start = process.hrtime.bigint();
    
    // Test dynamic import
    import('@xec-sh/kit').then(async (kit) => {
      const importTime = Number(process.hrtime.bigint() - start) / 1000000;
      
      // Test basic functionality
      const features = {
        'default-export': !!kit.default,
        'named-exports': !!(kit.text && kit.select && kit.confirm),
        'async-functions': typeof kit.text === 'function',
        'promises': kit.text('test').constructor.name === 'Promise',
        'unicode': '✅❌🎯'.length === 3,
        'ansi-support': !!process.stdout.isTTY
      };
      
      console.log(JSON.stringify({
        success: true,
        importTime,
        features,
        version: process.version
      }));
    }).catch(error => {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        version: process.version
      }));
    });
  `;
    const currentVersion = process.version;
    console.log(`Current Node.js: ${currentVersion}\n`);
    try {
        const testFile = join(testDir, 'test.mjs');
        writeFileSync(testFile, testScript);
        const output = execSync(`node ${testFile}`, {
            cwd: process.cwd(),
            encoding: 'utf-8'
        });
        const result = JSON.parse(output.trim());
        results.push({
            runtime: 'Node.js',
            version: currentVersion,
            status: result.success ? 'pass' : 'fail',
            error: result.error,
            importTime: result.importTime,
            features: result.features
        });
    }
    catch (error) {
        results.push({
            runtime: 'Node.js',
            version: currentVersion,
            status: 'fail',
            error: error.message
        });
    }
    const cjsTestScript = `
    const start = process.hrtime.bigint();
    
    try {
      const kit = require('@xec-sh/kit');
      const importTime = Number(process.hrtime.bigint() - start) / 1000000;
      
      const features = {
        'default-export': !!kit.default,
        'named-exports': !!(kit.text && kit.select && kit.confirm),
        'cjs-interop': true
      };
      
      console.log(JSON.stringify({
        success: true,
        importTime,
        features,
        version: process.version
      }));
    } catch (error) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        version: process.version
      }));
    }
  `;
    try {
        const cjsTestFile = join(testDir, 'test.cjs');
        writeFileSync(cjsTestFile, cjsTestScript);
        const output = execSync(`node ${cjsTestFile}`, {
            cwd: process.cwd(),
            encoding: 'utf-8'
        });
        const result = JSON.parse(output.trim());
        results.push({
            runtime: 'Node.js (CJS)',
            version: currentVersion,
            status: result.success ? 'pass' : 'fail',
            error: result.error,
            importTime: result.importTime,
            features: result.features
        });
    }
    catch (error) {
        results.push({
            runtime: 'Node.js (CJS)',
            version: currentVersion,
            status: 'fail',
            error: error.message
        });
    }
    const runtimes = [
        { command: 'bun --version', runtime: 'Bun', testCommand: 'bun' },
        { command: 'deno --version', runtime: 'Deno', testCommand: 'deno run --allow-read --allow-env' }
    ];
    for (const { command, runtime, testCommand } of runtimes) {
        try {
            const version = execSync(command, { encoding: 'utf-8' }).trim().split('\n')[0];
            if (runtime === 'Deno') {
                const denoTestScript = `
          const start = performance.now();
          
          try {
            const kit = await import('file://${process.cwd()}/dist/index.js');
            const importTime = performance.now() - start;
            
            const features = {
              'default-export': !!kit.default,
              'named-exports': !!(kit.text && kit.select && kit.confirm),
              'deno-compat': true
            };
            
            console.log(JSON.stringify({
              success: true,
              importTime,
              features,
              version: '${version}'
            }));
          } catch (error) {
            console.log(JSON.stringify({
              success: false,
              error: error.message,
              version: '${version}'
            }));
          }
        `;
                const denoTestFile = join(testDir, 'test-deno.mjs');
                writeFileSync(denoTestFile, denoTestScript);
                const output = execSync(`${testCommand} ${denoTestFile}`, {
                    cwd: process.cwd(),
                    encoding: 'utf-8'
                });
                const result = JSON.parse(output.trim());
                results.push({
                    runtime,
                    version,
                    status: result.success ? 'pass' : 'fail',
                    error: result.error,
                    importTime: result.importTime,
                    features: result.features
                });
            }
            else {
                const testFile = join(testDir, 'test.mjs');
                const output = execSync(`${testCommand} ${testFile}`, {
                    cwd: process.cwd(),
                    encoding: 'utf-8'
                });
                const result = JSON.parse(output.trim());
                results.push({
                    runtime,
                    version,
                    status: result.success ? 'pass' : 'fail',
                    error: result.error,
                    importTime: result.importTime,
                    features: result.features
                });
            }
        }
        catch (error) {
            results.push({
                runtime,
                version: 'Not installed',
                status: 'skipped'
            });
        }
    }
    rmSync(testDir, { recursive: true, force: true });
    console.log('📊 Compatibility Results:');
    console.log('-'.repeat(60));
    console.log('Runtime'.padEnd(20) + 'Version'.padEnd(20) + 'Status'.padEnd(10) + 'Import Time');
    console.log('-'.repeat(60));
    results.forEach(result => {
        const status = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⏭️';
        const importTime = result.importTime ? `${result.importTime.toFixed(2)}ms` : '-';
        console.log(result.runtime.padEnd(20) +
            result.version.padEnd(20) +
            status.padEnd(10) +
            importTime);
        if (result.error) {
            console.log(`  Error: ${result.error}`);
        }
    });
    console.log('\n🎯 Feature Support Matrix:');
    console.log('-'.repeat(60));
    const allFeatures = new Set();
    results.forEach(r => {
        if (r.features) {
            Object.keys(r.features).forEach(f => allFeatures.add(f));
        }
    });
    if (allFeatures.size > 0) {
        console.log('Feature'.padEnd(25) + results.map(r => r.runtime.substring(0, 10)).join(' '));
        console.log('-'.repeat(60));
        allFeatures.forEach(feature => {
            const row = feature.padEnd(25);
            const support = results.map(r => {
                if (r.features && r.features[feature] !== undefined) {
                    return r.features[feature] ? '   ✅    ' : '   ❌    ';
                }
                return '   -     ';
            }).join(' ');
            console.log(row + support);
        });
    }
    console.log('\n📋 Node.js Version Requirements:');
    console.log('-'.repeat(60));
    const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
    const requiredVersion = packageJson.engines?.node || 'Not specified';
    console.log(`Required: ${requiredVersion}`);
    console.log(`Current:  ${currentVersion}`);
    if (requiredVersion && requiredVersion !== 'Not specified') {
        const current = currentVersion.replace('v', '');
        const required = requiredVersion.replace('>=', '').replace('^', '').replace('~', '');
        const meetsRequirement = compareVersions(current, required) >= 0;
        console.log(`Status:   ${meetsRequirement ? '✅ Compatible' : '❌ Incompatible'}`);
    }
}
function compareVersions(a, b) {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const partA = partsA[i] || 0;
        const partB = partsB[i] || 0;
        if (partA > partB)
            return 1;
        if (partA < partB)
            return -1;
    }
    return 0;
}
testCompatibility().catch(console.error);
//# sourceMappingURL=test-compatibility.js.map