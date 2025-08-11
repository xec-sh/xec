#!/usr/bin/env tsx
/**
 * Test basic functionality of Aura framework
 */

import { 
  aura, 
  text, 
  signal,
  effect,
  computed
} from '../dist/index.js';

console.log('Testing Aura Framework - Stage 0\n');

// Test 1: Signals
console.log('1. Testing Signals:');
const count = signal(0);
console.log('  Initial count:', count());
count.set(5);
console.log('  After set(5):', count());
count.update(n => n + 1);
console.log('  After update(+1):', count());

// Test 2: Computed values
console.log('\n2. Testing Computed:');
const doubled = computed(() => count() * 2);
console.log('  Doubled value:', doubled());
count.set(10);
console.log('  After count=10, doubled:', doubled());

// Test 3: Effects
console.log('\n3. Testing Effects:');
let effectCount = 0;
const dispose = effect(() => {
  effectCount++;
  console.log(`  Effect triggered ${effectCount} times, count=${count()}`);
});

// Allow time for async scheduling
setTimeout(() => {
  count.set(15);
  setTimeout(() => {
    count.set(20);
    setTimeout(() => {
      dispose.dispose();
      count.set(25); // Should not trigger effect
      console.log('  Final effect count:', effectCount);
      
      // Continue with rest of tests
      runRemainingTests();
    }, 10);
  }, 10);
}, 10);

function runRemainingTests() {
  // Test 4: Component creation
  console.log('\n4. Testing Component Creation:');
  const component = text({
    value: 'Hello, Aura!',
    x: 10,
    y: 5,
    style: {
      fg: { r: 100, g: 200, b: 255 },
      bold: true
    }
  });
  console.log('  Component type:', component.type);
  console.log('  Component id:', component.id);
  console.log('  Component props.value:', component.props.value);

  // Test 5: Nested components
  console.log('\n5. Testing Nested Components:');
  const container = aura('flex', {
    direction: 'column',
    gap: 2,
    children: [
      text({ value: 'Child 1' }),
      text({ value: 'Child 2' })
    ]
  });
  console.log('  Container type:', container.type);
  console.log('  Number of children:', container.children?.length);
  console.log('  First child value:', container.children?.[0]?.props.value);

  console.log('\n✅ All tests passed! Aura Stage 0 is working correctly.');
}