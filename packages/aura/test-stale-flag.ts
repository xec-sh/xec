import { signal, computed, effect, createRoot } from './dist/index.js';

console.log('=== Testing Stale Flag ===\n');

createRoot(d => {
  const b = signal(2);
  
  let ab_stale_checks = 0;
  let bc_stale_checks = 0;
  
  const ab = computed(() => {
    const result = 1 + b();
    console.log(`ab computing: 1 + ${b()} = ${result}`);
    return result;
  });
  
  const bc = computed(() => {
    const result = b() * 2;
    console.log(`bc computing: ${b()} * 2 = ${result}`);
    return result;
  });
  
  // Monkey-patch to see when they check isStale
  const original_ab_get = ab.constructor.prototype.get;
  const original_bc_get = bc.constructor.prototype.get;
  
  const ab_internal = (ab as any).__internal;
  const bc_internal = (bc as any).__internal;
  
  if (ab_internal && bc_internal) {
    const original_ab_computeValue = ab_internal.computeValue;
    const original_bc_computeValue = bc_internal.computeValue;
    
    ab_internal.computeValue = function() {
      console.log('  [ab] computeValue called, isStale:', this.isStale);
      return original_ab_computeValue.call(this);
    };
    
    bc_internal.computeValue = function() {
      console.log('  [bc] computeValue called, isStale:', this.isStale);
      return original_bc_computeValue.call(this);
    };
    
    const original_ab_markStale = ab_internal.markStale;
    const original_bc_markStale = bc_internal.markStale;
    
    ab_internal.markStale = function() {
      console.log('  [ab] markStale called');
      return original_ab_markStale.call(this);
    };
    
    bc_internal.markStale = function() {
      console.log('  [bc] markStale called');
      return original_bc_markStale.call(this);
    };
  }
  
  const sum = computed(() => {
    console.log('sum computing...');
    const ab_val = ab();
    console.log(`  after ab(): ${ab_val}`);
    const bc_val = bc();
    console.log(`  after bc(): ${bc_val}`);
    return ab_val + bc_val;
  });
  
  effect(() => {
    console.log('Effect: sum() =', sum());
  });
  
  console.log('\n=== Update b to 3 ===');
  b.set(3);
  
  console.log('\n=== Direct bc() call ===');
  console.log('bc():', bc());
  
  d();
});