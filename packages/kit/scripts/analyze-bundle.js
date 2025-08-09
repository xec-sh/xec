#!/usr/bin/env node
import { join } from 'path';
import { gzipSync } from 'zlib';
import { readdirSync, readFileSync } from 'fs';
const distDir = join(process.cwd(), 'dist');
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const decimals = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}
function analyzeFile(filePath) {
    const content = readFileSync(filePath);
    const gzipped = gzipSync(content);
    return {
        name: filePath.replace(distDir + '/', ''),
        size: content.length,
        gzipSize: gzipped.length,
    };
}
function analyzeBundle() {
    console.log('\n📊 Bundle Size Analysis\n');
    console.log('='.repeat(60));
    const files = readdirSync(distDir)
        .filter(file => file.endsWith('.js') || file.endsWith('.cjs'))
        .filter(file => !file.includes('.map'))
        .map(file => analyzeFile(join(distDir, file)))
        .sort((a, b) => b.size - a.size);
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const totalGzipSize = files.reduce((sum, file) => sum + file.gzipSize, 0);
    const mainESM = files.find(f => f.name === 'index.js');
    const mainCJS = files.find(f => f.name === 'index.cjs');
    if (mainESM || mainCJS) {
        console.log('🎯 Main Bundles:');
        console.log('-'.repeat(60));
        if (mainESM) {
            console.log(`ESM:  ${formatBytes(mainESM.size).padEnd(10)} (gzip: ${formatBytes(mainESM.gzipSize)})`);
        }
        if (mainCJS) {
            console.log(`CJS:  ${formatBytes(mainCJS.size).padEnd(10)} (gzip: ${formatBytes(mainCJS.gzipSize)})`);
        }
        console.log('');
    }
    const chunks = files.filter(f => f.name.includes('chunk-'));
    if (chunks.length > 0) {
        console.log('📦 Code-Split Chunks:');
        console.log('-'.repeat(60));
        chunks.forEach(chunk => {
            console.log(`${chunk.name.padEnd(30)} ${formatBytes(chunk.size).padEnd(10)} (gzip: ${formatBytes(chunk.gzipSize)})`);
        });
        console.log('');
    }
    const components = files.filter(f => !f.name.includes('chunk-') && !f.name.includes('index.'));
    if (components.length > 0) {
        console.log('🧩 Component Bundles:');
        console.log('-'.repeat(60));
        components.forEach(comp => {
            console.log(`${comp.name.padEnd(30)} ${formatBytes(comp.size).padEnd(10)} (gzip: ${formatBytes(comp.gzipSize)})`);
        });
        console.log('');
    }
    console.log('📈 Total Bundle Size:');
    console.log('-'.repeat(60));
    console.log(`Raw:   ${formatBytes(totalSize)}`);
    console.log(`Gzip:  ${formatBytes(totalGzipSize)} ${totalGzipSize < 100 * 1024 ? '✅' : '⚠️'}`);
    console.log('');
    const targetSize = 100 * 1024;
    console.log('🎯 Target Comparison:');
    console.log('-'.repeat(60));
    console.log(`Target: ${formatBytes(targetSize)}`);
    console.log(`Status: ${totalGzipSize <= targetSize ? '✅ Under target!' : `❌ Over by ${formatBytes(totalGzipSize - targetSize)}`}`);
    if (totalGzipSize > targetSize) {
        console.log('\n💡 Recommendations:');
        console.log('-'.repeat(60));
        console.log('• Consider lazy loading more components');
        console.log('• Review dependencies for tree-shaking opportunities');
        console.log('• Check for duplicate code across chunks');
        console.log('• Consider extracting large utility functions');
    }
}
analyzeBundle();
//# sourceMappingURL=analyze-bundle.js.map