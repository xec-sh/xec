#!/usr/bin/env tsx
/**
 * Basic animation test to verify functionality
 */

import {
  animate,
  spring,
  Easing,
  createAnimationEngine,
  physics,
  type PhysicsBody
} from '../src/advanced/animation.js';

async function testBasicAnimation() {
  console.log('Testing Basic Animation Module\n');
  
  // Test 1: Linear animation
  console.log('1. Testing linear animation (0 to 100 in 1 second)...');
  const linearAnim = animate({
    from: 0,
    to: 100,
    duration: 1000,
    easing: Easing.linear
  });
  
  linearAnim.onUpdate(value => {
    process.stdout.write(`\rValue: ${value.toFixed(2)}`);
  });
  
  linearAnim.onComplete(() => {
    console.log('\n✓ Linear animation completed!\n');
  });
  
  await linearAnim.start();
  
  // Test 2: Bounce animation
  console.log('2. Testing bounce animation...');
  const bounceAnim = animate({
    from: 0,
    to: 100,
    duration: 1000,
    easing: Easing.easeOutBounce
  });
  
  bounceAnim.onUpdate(value => {
    process.stdout.write(`\rValue: ${value.toFixed(2)}`);
  });
  
  bounceAnim.onComplete(() => {
    console.log('\n✓ Bounce animation completed!\n');
  });
  
  await bounceAnim.start();
  
  // Test 3: Spring animation
  console.log('3. Testing spring animation...');
  const springAnim = spring({
    from: 0,
    to: 100,
    stiffness: 100,
    damping: 10,
    mass: 1
  });
  
  let maxValue = 0;
  springAnim.onUpdate(value => {
    maxValue = Math.max(maxValue, value);
    process.stdout.write(`\rValue: ${value.toFixed(2)} (max: ${maxValue.toFixed(2)})`);
  });
  
  springAnim.onComplete(() => {
    console.log('\n✓ Spring animation completed!');
    console.log(`  Spring overshoot: ${(maxValue - 100).toFixed(2)}\n`);
  });
  
  await springAnim.start();
  
  // Test 4: Object animation
  console.log('4. Testing object animation...');
  const objectAnim = animate({
    from: { x: 0, y: 0 },
    to: { x: 100, y: 50 },
    duration: 1000,
    easing: Easing.easeInOutQuad
  });
  
  objectAnim.onUpdate(value => {
    process.stdout.write(`\rPosition: x=${value.x.toFixed(1)}, y=${value.y.toFixed(1)}`);
  });
  
  objectAnim.onComplete(() => {
    console.log('\n✓ Object animation completed!\n');
  });
  
  await objectAnim.start();
  
  // Test 5: Physics animation
  console.log('5. Testing physics animation with gravity...');
  const body: PhysicsBody = {
    x: 50,
    y: 0,
    vx: 5,
    vy: 0
  };
  
  const physicsAnim = physics(body, {
    gravity: 0.5,
    friction: 0.99,
    bounds: { x: 0, y: 0, width: 100, height: 100 }
  });
  
  let frameCount = 0;
  const maxFrames = 100;
  
  physicsAnim.onUpdate(value => {
    frameCount++;
    process.stdout.write(`\rFrame ${frameCount}: x=${value.x.toFixed(1)}, y=${value.y.toFixed(1)}, vx=${value.vx.toFixed(1)}, vy=${value.vy.toFixed(1)}`);
    
    if (frameCount >= maxFrames) {
      physicsAnim.stop();
    }
  });
  
  await new Promise<void>(resolve => {
    physicsAnim.onComplete(() => {
      console.log('\n✓ Physics animation stopped!\n');
      resolve();
    });
    
    physicsAnim.start();
  });
  
  // Test 6: Animation with repeat and yoyo
  console.log('6. Testing animation with repeat and yoyo...');
  const yoyoAnim = animate({
    from: 0,
    to: 100,
    duration: 500,
    repeat: 2,
    yoyo: true,
    easing: Easing.easeInOutSine
  });
  
  let direction = 'forward';
  let lastValue = 0;
  yoyoAnim.onUpdate(value => {
    const newDirection = value > lastValue ? 'forward' : 'backward';
    if (newDirection !== direction) {
      direction = newDirection;
      console.log(`\n  Direction changed to: ${direction}`);
    }
    process.stdout.write(`\rValue: ${value.toFixed(2)}`);
    lastValue = value;
  });
  
  yoyoAnim.onComplete(() => {
    console.log('\n✓ Yoyo animation completed!\n');
  });
  
  await yoyoAnim.start();
  
  // Test 7: Parallel animations with engine
  console.log('7. Testing animation engine with parallel animations...');
  const engine = createAnimationEngine();
  
  const anim1 = engine.animate({
    from: 0,
    to: 100,
    duration: 1000
  });
  
  const anim2 = engine.animate({
    from: 100,
    to: 0,
    duration: 1000
  });
  
  let completed = 0;
  
  anim1.onComplete(() => {
    console.log('  Animation 1 completed');
    completed++;
  });
  
  anim2.onComplete(() => {
    console.log('  Animation 2 completed');
    completed++;
  });
  
  anim1.start();
  anim2.start();
  
  // Wait for both to complete
  await new Promise(resolve => {
    const checkComplete = setInterval(() => {
      if (completed === 2) {
        clearInterval(checkComplete);
        resolve(null);
      }
    }, 100);
  });
  
  console.log('✓ Parallel animations completed!\n');
  
  console.log('All tests completed successfully!');
}

// Run tests
testBasicAnimation().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});