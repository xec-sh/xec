#!/usr/bin/env node
// Test script to ensure process exits cleanly without hanging
import { $ } from '../dist/index.js';

const a1 = $`echo foo`;
const a2 = new Promise((resolve) => setTimeout(resolve, 20, ['bar', 'baz']));

const result = await $`echo ${a1} ${a2}`;
console.log('Output:', result.stdout.trim());
console.log('Exit code:', result.exitCode);

// If this script exits within a reasonable time, the fix is working