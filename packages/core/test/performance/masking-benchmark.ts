#!/usr/bin/env node

import { createOptimizedMasker as createOptimizedMaskerNew } from '../../src/utils/optimized-masker.js';
import { createOptimizedMasker as createOptimizedMaskerOld } from '../../src/utils/masking-optimizer.js';

// Default sensitive data patterns
const defaultPatterns = [
  // JSON string values for sensitive keys
  /"(api[_-]?key|apikey|password|token|secret|client[_-]?secret)":\s*"([^"]+)"/gi,
  // API keys and tokens - capture the value part
  /\b(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|authentication[_-]?token|private[_-]?key|secret[_-]?key)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
  // Authorization headers - preserve "Bearer" or "Basic" prefix
  /(Authorization:\s*)(Bearer|Basic)(\s+)([a-zA-Z0-9_\-/.+=]+)/gi,
  // AWS credentials
  /\b(aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
  // GitHub tokens with pattern - direct matches
  /\b(gh[ps]_[a-zA-Z0-9]{16,})/gi,
  // GitHub token assignments
  /\b(github[_-]?token)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
  // Generic tokens (including slack xoxb-, etc)
  /\b(token)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
  // Generic passwords - handle quoted and unquoted values (including template variables)
  /\b(password|passwd|pwd)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^\s]+))/gi,
  // Command line password arguments
  /(--password)(\s+)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
  // Command line secret arguments
  /(--client[_-]?secret|--secret)(\s+)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
  // SSH private keys (full replacement)
  /-----BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----[\s\S]+?-----END\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/gi,
  // Environment variable assignments with secrets (including template variables)
  /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD|PASSWD|PWD|APIKEY|API_KEY)[A-Z0-9_]*)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^\s]+))/gi,
  // Generic secret patterns
  /\b(secret|client[_-]?secret)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
  // Standalone Bearer tokens
  /\b(Bearer)(\s+)([a-zA-Z0-9_\-/.]+)/gi
];

// Generate test data
function generateTestData(lines: number): string {
  const data: string[] = [];
  
  for (let i = 0; i < lines; i++) {
    if (i % 10 === 0) {
      data.push(`{"api_key": "sk-1234567890abcdef${i}", "data": "normal content"}`);
    } else if (i % 10 === 1) {
      data.push(`Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${i}`);
    } else if (i % 10 === 2) {
      data.push(`password=MySecretPass${i}word123`);
    } else if (i % 10 === 3) {
      data.push(`AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY${i}`);
    } else if (i % 10 === 4) {
      data.push(`github_token="ghp_1234567890abcdef${i}"`);
    } else if (i % 10 === 5) {
      data.push(`--client-secret 'super-secret-${i}'`);
    } else if (i % 10 === 6) {
      data.push(`DATABASE_PASSWORD=${i}MyDatabasePassword123`);
    } else if (i % 10 === 7) {
      data.push(`token: xoxb-123456789012-1234567890123-${i}`);
    } else if (i % 10 === 8) {
      data.push(`Normal log line without any sensitive data ${i}`);
    } else {
      data.push(`{"secret": "confidential-data-${i}", "public": "visible"}`);
    }
  }
  
  return data.join('\n');
}

// Benchmark function
function benchmark(name: string, fn: (text: string) => string, text: string, iterations: number): number {
  const start = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    fn(text);
  }
  
  const duration = performance.now() - start;
  return duration;
}

// Main benchmark
function main() {
  console.log('=== Sensitive Data Masking Performance Benchmark ===\n');
  
  const maskerOld = createOptimizedMaskerOld(defaultPatterns, '[REDACTED]');
  const maskerNew = createOptimizedMaskerNew(defaultPatterns, '[REDACTED]');
  
  // Warm up
  const warmupData = generateTestData(100);
  maskerOld(warmupData);
  maskerNew(warmupData);
  
  // Test different data sizes
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
    
    // Verify both produce the same output
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