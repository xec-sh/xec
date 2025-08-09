#!/usr/bin/env node
import { createOptimizedMasker as createOptimizedMaskerNew } from '../../src/utils/optimized-masker.js';
import { createOptimizedMasker as createOptimizedMaskerOld } from '../../src/utils/masking-optimizer.js';
const defaultPatterns = [
    /"(api[_-]?key|apikey|password|token|secret|client[_-]?secret)":\s*"([^"]+)"/gi,
    /\b(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|authentication[_-]?token|private[_-]?key|secret[_-]?key)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
    /(Authorization:\s*)(Bearer|Basic)(\s+)([a-zA-Z0-9_\-/.+=]+)/gi,
    /\b(aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
    /\b(gh[ps]_[a-zA-Z0-9]{16,})/gi,
    /\b(github[_-]?token)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
    /\b(token)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
    /\b(password|passwd|pwd)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^\s]+))/gi,
    /(--password)(\s+)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
    /(--client[_-]?secret|--secret)(\s+)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
    /-----BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----[\s\S]+?-----END\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/gi,
    /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD|PASSWD|PWD|APIKEY|API_KEY)[A-Z0-9_]*)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^\s]+))/gi,
    /\b(secret|client[_-]?secret)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
    /\b(Bearer)(\s+)([a-zA-Z0-9_\-/.]+)/gi
];
function generateTestData(lines) {
    const data = [];
    for (let i = 0; i < lines; i++) {
        if (i % 10 === 0) {
            data.push(`{"api_key": "sk-1234567890abcdef${i}", "data": "normal content"}`);
        }
        else if (i % 10 === 1) {
            data.push(`Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${i}`);
        }
        else if (i % 10 === 2) {
            data.push(`password=MySecretPass${i}word123`);
        }
        else if (i % 10 === 3) {
            data.push(`AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY${i}`);
        }
        else if (i % 10 === 4) {
            data.push(`github_token="ghp_1234567890abcdef${i}"`);
        }
        else if (i % 10 === 5) {
            data.push(`--client-secret 'super-secret-${i}'`);
        }
        else if (i % 10 === 6) {
            data.push(`DATABASE_PASSWORD=${i}MyDatabasePassword123`);
        }
        else if (i % 10 === 7) {
            data.push(`token: xoxb-123456789012-1234567890123-${i}`);
        }
        else if (i % 10 === 8) {
            data.push(`Normal log line without any sensitive data ${i}`);
        }
        else {
            data.push(`{"secret": "confidential-data-${i}", "public": "visible"}`);
        }
    }
    return data.join('\n');
}
function benchmark(name, fn, text, iterations) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        fn(text);
    }
    const duration = performance.now() - start;
    return duration;
}
function main() {
    console.log('=== Sensitive Data Masking Performance Benchmark ===\n');
    const maskerOld = createOptimizedMaskerOld(defaultPatterns, '[REDACTED]');
    const maskerNew = createOptimizedMaskerNew(defaultPatterns, '[REDACTED]');
    const warmupData = generateTestData(100);
    maskerOld(warmupData);
    maskerNew(warmupData);
    const testCases = [
        { lines: 100, iterations: 100 },
        { lines: 1000, iterations: 50 },
        { lines: 10000, iterations: 10 },
    ];
    for (const { lines, iterations } of testCases) {
        const testData = generateTestData(lines);
        console.log(`\n--- Test: ${lines} lines, ${iterations} iterations ---`);
        console.log(`Data size: ${(testData.length / 1024).toFixed(2)} KB`);
        const timeOld = benchmark('Original', maskerOld, testData, iterations);
        const timeNew = benchmark('Optimized', maskerNew, testData, iterations);
        console.log(`Original:  ${timeOld.toFixed(2)}ms (${(timeOld / iterations).toFixed(2)}ms per run)`);
        console.log(`Optimized: ${timeNew.toFixed(2)}ms (${(timeNew / iterations).toFixed(2)}ms per run)`);
        console.log(`Speed-up:  ${(timeOld / timeNew).toFixed(2)}x`);
        console.log(`Improvement: ${((timeOld - timeNew) / timeOld * 100).toFixed(1)}%`);
        const resultOld = maskerOld(testData);
        const resultNew = maskerNew(testData);
        if (resultOld !== resultNew) {
            console.error('\n❌ ERROR: Results do not match!');
            process.exit(1);
        }
    }
    console.log('\n✅ All tests passed - both implementations produce identical results');
}
main();
//# sourceMappingURL=masking-benchmark.js.map