#!/usr/bin/env node
/**
 * Test script for CDN module loading via @xec-sh/loader
 * Tests various CDN providers and module types
 */

// Test 1: Load lodash from npm via esm.sh
console.log('Test 1: Loading lodash from npm...');
const lodash = await use('npm:lodash@4.17.21');
console.log('✓ Lodash loaded:', typeof lodash.chunk);
console.log('  chunk([1,2,3,4], 2) =', lodash.chunk([1, 2, 3, 4], 2));

// Test 2: Load date-fns from esm.sh
console.log('\nTest 2: Loading date-fns...');
const dateFns = await use('npm:date-fns@3.0.0');
console.log('✓ date-fns loaded:', typeof dateFns.format);
console.log('  Today formatted:', dateFns.format(new Date(), 'yyyy-MM-dd'));

// Test 3: Load zod for validation
console.log('\nTest 3: Loading zod...');
const { z } = await use('npm:zod@3.22.4');
console.log('✓ Zod loaded:', typeof z.string);

const UserSchema = z.object({
  name: z.string(),
  age: z.number().min(0),
});

const validUser = UserSchema.parse({ name: 'Alice', age: 30 });
console.log('  Valid user:', validUser);

try {
  UserSchema.parse({ name: 'Bob', age: -5 });
} catch (error) {
  console.log('  ✓ Validation works (caught invalid age)');
}

// Test 4: Test x() alias
console.log('\nTest 4: Testing x() alias...');
const camelcase = await x('npm:camelcase@8.0.0');
console.log('✓ camelcase loaded via x():', typeof camelcase.default);
console.log('  camelcase("hello world") =', camelcase.default('hello world'));

console.log('\n✅ All CDN module loading tests passed!');
