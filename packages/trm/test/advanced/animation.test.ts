/**
 * Animation Module Tests with Real Implementations
 * Uses actual timers and performance APIs for accurate testing
 */

import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import {
  wave,
  orbit,
  morph,
  Easing,
  animate,
  physics,
  sequence,
  parallel,
  type Animation,
  type PhysicsBody,
  type AnimationEngine,
  createAnimationEngine
} from '../../src/advanced/animation.js';

describe('Animation Module - Real Implementation', () => {
  let engine: AnimationEngine;
  
  beforeEach(() => {
    engine = createAnimationEngine();
  });
  
  afterEach(() => {
    // Clean up any running animations
    if (engine) {
      engine.stop();
    }
  });
  
  describe('Easing Functions', () => {
    it('should have correct linear easing', () => {
      expect(Easing.linear(0)).toBe(0);
      expect(Easing.linear(0.5)).toBe(0.5);
      expect(Easing.linear(1)).toBe(1);
    });
    
    it('should have correct quadratic easing', () => {
      // Ease In Quad
      expect(Easing.easeInQuad(0)).toBe(0);
      expect(Easing.easeInQuad(0.5)).toBe(0.25);
      expect(Easing.easeInQuad(1)).toBe(1);
      
      // Ease Out Quad
      expect(Easing.easeOutQuad(0)).toBe(0);
      expect(Easing.easeOutQuad(0.5)).toBe(0.75);
      expect(Easing.easeOutQuad(1)).toBe(1);
      
      // Ease In Out Quad
      expect(Easing.easeInOutQuad(0)).toBe(0);
      expect(Easing.easeInOutQuad(0.25)).toBe(0.125);
      expect(Easing.easeInOutQuad(0.5)).toBe(0.5);
      expect(Easing.easeInOutQuad(0.75)).toBe(0.875);
      expect(Easing.easeInOutQuad(1)).toBe(1);
    });
    
    it('should have correct cubic easing', () => {
      // Ease In Cubic
      expect(Easing.easeInCubic(0)).toBe(0);
      expect(Easing.easeInCubic(0.5)).toBe(0.125);
      expect(Easing.easeInCubic(1)).toBe(1);
      
      // Ease Out Cubic
      expect(Easing.easeOutCubic(0)).toBe(0);
      expect(Easing.easeOutCubic(0.5)).toBe(0.875);
      expect(Easing.easeOutCubic(1)).toBe(1);
    });
    
    it('should have correct sine easing', () => {
      expect(Easing.easeInSine(0)).toBeCloseTo(0, 10);
      expect(Easing.easeInSine(1)).toBeCloseTo(1, 10);
      expect(Easing.easeOutSine(0)).toBeCloseTo(0, 10);
      expect(Easing.easeOutSine(1)).toBeCloseTo(1, 10);
      expect(Easing.easeInOutSine(0)).toBeCloseTo(0, 10);
      expect(Easing.easeInOutSine(0.5)).toBeCloseTo(0.5, 10);
      expect(Easing.easeInOutSine(1)).toBeCloseTo(1, 10);
    });
    
    it('should have correct exponential easing', () => {
      expect(Easing.easeInExpo(0)).toBe(0);
      expect(Easing.easeInExpo(1)).toBe(1);
      expect(Easing.easeOutExpo(0)).toBe(0);
      expect(Easing.easeOutExpo(1)).toBe(1);
    });
    
    it('should have correct elastic easing', () => {
      expect(Easing.easeInElastic(0)).toBe(0);
      expect(Easing.easeInElastic(1)).toBe(1);
      expect(Easing.easeOutElastic(0)).toBe(0);
      expect(Easing.easeOutElastic(1)).toBe(1);
      expect(Easing.easeInOutElastic(0)).toBe(0);
      expect(Easing.easeInOutElastic(1)).toBe(1);
    });
    
    it('should have correct back easing', () => {
      expect(Easing.easeInBack(0)).toBeCloseTo(0, 10);
      expect(Easing.easeInBack(1)).toBeCloseTo(1, 10);
      // Back easing overshoots
      expect(Easing.easeInBack(0.5)).toBeLessThan(0);
      
      expect(Easing.easeOutBack(0)).toBeCloseTo(0, 10);
      expect(Easing.easeOutBack(1)).toBeCloseTo(1, 10);
      // Back easing overshoots
      expect(Easing.easeOutBack(0.5)).toBeGreaterThan(0.5);
    });
    
    it('should have correct bounce easing', () => {
      expect(Easing.easeInBounce(0)).toBe(0);
      expect(Easing.easeInBounce(1)).toBe(1);
      expect(Easing.easeOutBounce(0)).toBe(0);
      expect(Easing.easeOutBounce(1)).toBe(1);
    });
  });
  
  describe('Basic Animation with Real Timing', () => {
    it('should animate numeric values', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 100,
        easing: Easing.linear
      });
      
      const values: number[] = [];
      animation.onUpdate(value => values.push(value));
      
      animation.start();
      
      // Wait for animation to complete
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(animation.running.value).toBe(false);
      expect(values.length).toBeGreaterThan(0);
      expect(values[values.length - 1]).toBeCloseTo(100, 1);
    });
    
    it('should animate arrays', async () => {
      const animation = animate<number[]>({
        from: [0, 0, 0],
        to: [100, 200, 300],
        duration: 100
      });
      
      let lastValue: number[] = [];
      animation.onUpdate(value => lastValue = value);
      
      animation.start();
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(lastValue[0]).toBeCloseTo(100, 1);
      expect(lastValue[1]).toBeCloseTo(200, 1);
      expect(lastValue[2]).toBeCloseTo(300, 1);
    });
    
    it('should animate objects', async () => {
      const animation = animate<{ x: number; y: number }>({
        from: { x: 0, y: 0 },
        to: { x: 100, y: 200 },
        duration: 100
      });
      
      let lastValue = { x: 0, y: 0 };
      animation.onUpdate(value => lastValue = value);
      
      animation.start();
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(lastValue.x).toBeCloseTo(100, 1);
      expect(lastValue.y).toBeCloseTo(200, 1);
    });
    
    it('should support delay', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 50,
        delay: 50
      });
      
      let hasStarted = false;
      animation.onUpdate(() => hasStarted = true);
      
      animation.start();
      
      // Check it hasn't started immediately
      await new Promise(resolve => setTimeout(resolve, 25));
      expect(hasStarted).toBe(false);
      
      // Check it has started after delay
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(hasStarted).toBe(true);
      
      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(animation.running.value).toBe(false);
    });
    
    it('should support repeat', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 50,
        repeat: 2
      });
      
      let updateCount = 0;
      let maxValue = 0;
      animation.onUpdate(value => {
        updateCount++;
        maxValue = Math.max(maxValue, value);
      });
      
      animation.start();
      
      // Wait for all repeats to complete (3 iterations total: initial + 2 repeats)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(animation.running.value).toBe(false);
      expect(updateCount).toBeGreaterThan(3); // Should have multiple updates
      expect(maxValue).toBeCloseTo(100, 1);
    });
    
    it('should support yoyo', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 50,
        repeat: 1,
        yoyo: true
      });
      
      const values: number[] = [];
      animation.onUpdate(value => values.push(value));
      
      animation.start();
      
      // Wait for animation with yoyo
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should have gone from 0 to 100 and back to 0
      const maxValue = Math.max(...values);
      const finalValue = values[values.length - 1];
      
      expect(maxValue).toBeCloseTo(100, 1);
      expect(finalValue).toBeCloseTo(0, 1);
    });
    
    it('should support infinite repeat', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 30,
        repeat: Infinity
      });
      
      let updateCount = 0;
      animation.onUpdate(() => updateCount++);
      
      animation.start();
      expect(animation.running.value).toBe(true);
      
      // Let it run for a while
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should still be running
      expect(animation.running.value).toBe(true);
      expect(updateCount).toBeGreaterThan(3);
      
      // Stop it
      animation.stop();
      expect(animation.running.value).toBe(false);
    });
    
    it('should pause and resume', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 100
      });
      
      let valueAtPause = 0;
      animation.onUpdate(value => valueAtPause = value);
      
      animation.start();
      
      // Let it run for a bit
      await new Promise(resolve => setTimeout(resolve, 30));
      
      animation.pause();
      const pausedValue = valueAtPause;
      
      // Wait while paused
      await new Promise(resolve => setTimeout(resolve, 30));
      
      // Value shouldn't change while paused
      expect(valueAtPause).toBe(pausedValue);
      
      animation.resume();
      
      // Let it complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(animation.running.value).toBe(false);
      expect(valueAtPause).toBeCloseTo(100, 1);
    });
    
    it('should reverse animation', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 100
      });
      
      let currentValue = 0;
      animation.onUpdate(value => currentValue = value);
      
      animation.start();
      
      // Let it run forward
      await new Promise(resolve => setTimeout(resolve, 50));
      const midValue = currentValue;
      
      // Reverse it
      animation.reverse();
      
      // Let it run backward
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(currentValue).toBeLessThan(midValue);
      expect(animation.running.value).toBe(false);
    });
  });
  
  describe('Animation Engine', () => {
    it('should add and remove animations', () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 100
      });
      
      engine.add(animation);
      expect(engine.animations.size).toBe(1);
      
      engine.remove(animation);
      expect(engine.animations.size).toBe(0);
    });
    
    it('should start and stop engine', () => {
      expect(engine.running).toBe(false);
      
      engine.start();
      expect(engine.running).toBe(true);
      
      engine.stop();
      expect(engine.running).toBe(false);
    });
    
    it('should pause and resume all animations', async () => {
      const animation1 = animate<number>({
        from: 0,
        to: 100,
        duration: 100
      });
      
      const animation2 = animate<number>({
        from: 0,
        to: 200,
        duration: 100
      });
      
      engine.add(animation1);
      engine.add(animation2);
      
      animation1.start();
      animation2.start();
      
      await new Promise(resolve => setTimeout(resolve, 30));
      
      engine.pause();
      
      expect(animation1.paused.value).toBe(true);
      expect(animation2.paused.value).toBe(true);
      
      engine.resume();
      
      expect(animation1.paused.value).toBe(false);
      expect(animation2.paused.value).toBe(false);
      
      // Clean up
      animation1.stop();
      animation2.stop();
    });
    
    it('should stop all animations', async () => {
      const animation1 = animate<number>({
        from: 0,
        to: 100,
        duration: 100
      });
      
      const animation2 = animate<number>({
        from: 0,
        to: 200,
        duration: 100
      });
      
      engine.add(animation1);
      engine.add(animation2);
      
      animation1.start();
      animation2.start();
      
      await new Promise(resolve => setTimeout(resolve, 30));
      
      engine.stop();
      
      expect(animation1.running.value).toBe(false);
      expect(animation2.running.value).toBe(false);
    });
  });
  
  describe('Physics Animation', () => {
    it('should simulate gravity', async () => {
      const body: PhysicsBody = {
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        acceleration: { x: 0, y: 9.8 },
        mass: 1,
        friction: 0,
        restitution: 1
      };
      
      const animation = physics(body, {
        duration: 100
      });
      
      let lastPosition = { x: 0, y: 0 };
      animation.onUpdate(updatedBody => {
        lastPosition = updatedBody.position;
      });
      
      animation.start();
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should have moved due to gravity
      expect(lastPosition.y).toBeGreaterThan(0);
    });
    
    it('should simulate friction', async () => {
      const body: PhysicsBody = {
        position: { x: 0, y: 0 },
        velocity: { x: 100, y: 0 },
        acceleration: { x: 0, y: 0 },
        mass: 1,
        friction: 0.5,
        restitution: 1
      };
      
      const animation = physics(body, {
        duration: 200
      });
      
      const velocities: number[] = [];
      animation.onUpdate(updatedBody => {
        velocities.push(updatedBody.velocity.x);
      });
      
      animation.start();
      
      await new Promise(resolve => setTimeout(resolve, 250));
      
      // Velocity should decrease due to friction
      if (velocities.length > 2) {
        expect(velocities[velocities.length - 1]).toBeLessThan(velocities[0]);
      }
    });
  });
  
  describe('Specialized Animations', () => {
    it('should create orbital animation', async () => {
      const animation = orbit({
        center: { x: 50, y: 50 },
        radius: 30,
        speed: 2,
        duration: 100
      });
      
      const positions: Array<{ x: number; y: number }> = [];
      animation.onUpdate(pos => positions.push(pos));
      
      animation.start();
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(positions.length).toBeGreaterThan(0);
      
      // Check that positions form a circular path
      if (positions.length > 1) {
        const firstPos = positions[0];
        const lastPos = positions[positions.length - 1];
        
        // Distance from center should be approximately the radius
        const firstDist = Math.sqrt(
          Math.pow(firstPos.x - 50, 2) + Math.pow(firstPos.y - 50, 2)
        );
        const lastDist = Math.sqrt(
          Math.pow(lastPos.x - 50, 2) + Math.pow(lastPos.y - 50, 2)
        );
        
        expect(firstDist).toBeCloseTo(30, 1);
        expect(lastDist).toBeCloseTo(30, 1);
      }
    });
    
    it('should create wave animation', async () => {
      const animation = wave({
        amplitude: 50,
        frequency: 2,
        phase: 0,
        duration: 100
      });
      
      const values: number[] = [];
      animation.onUpdate(val => values.push(val));
      
      animation.start();
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(values.length).toBeGreaterThan(0);
      
      // Should oscillate between -amplitude and +amplitude
      const maxValue = Math.max(...values);
      const minValue = Math.min(...values);
      
      expect(maxValue).toBeLessThanOrEqual(50);
      expect(minValue).toBeGreaterThanOrEqual(-50);
    });
    
    it('should create morph animation', async () => {
      const from = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 }
      ];
      
      const to = [
        { x: 20, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 30 }
      ];
      
      const animation = morph(from, to, {
        duration: 100
      });
      
      let lastValue: Array<{ x: number; y: number }> = [];
      animation.onUpdate(val => lastValue = val);
      
      animation.start();
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(lastValue[0].x).toBeCloseTo(20, 1);
      expect(lastValue[0].y).toBeCloseTo(20, 1);
      expect(lastValue[1].x).toBeCloseTo(30, 1);
      expect(lastValue[1].y).toBeCloseTo(20, 1);
    });
  });
  
  describe('Composition', () => {
    it('should run animations in sequence', async () => {
      const results: number[] = [];
      
      const anim1 = animate<number>({
        from: 0,
        to: 50,
        duration: 50
      });
      anim1.onComplete(() => results.push(1));
      
      const anim2 = animate<number>({
        from: 50,
        to: 100,
        duration: 50
      });
      anim2.onComplete(() => results.push(2));
      
      const seq = sequence([anim1, anim2]);
      seq.start();
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(results).toEqual([1, 2]);
    });
    
    it('should run animations in parallel', async () => {
      const values1: number[] = [];
      const values2: number[] = [];
      
      const anim1 = animate<number>({
        from: 0,
        to: 100,
        duration: 100
      });
      anim1.onUpdate(val => values1.push(val));
      
      const anim2 = animate<number>({
        from: 0,
        to: 200,
        duration: 100
      });
      anim2.onUpdate(val => values2.push(val));
      
      const par = parallel([anim1, anim2]);
      par.start();
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Both should have values
      expect(values1.length).toBeGreaterThan(0);
      expect(values2.length).toBeGreaterThan(0);
      
      // Both should have completed
      expect(values1[values1.length - 1]).toBeCloseTo(100, 1);
      expect(values2[values2.length - 1]).toBeCloseTo(200, 1);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle zero duration', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 0
      });
      
      let finalValue = 0;
      animation.onUpdate(val => finalValue = val);
      
      animation.start();
      
      // Should complete immediately
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(finalValue).toBe(100);
      expect(animation.running.value).toBe(false);
    });
    
    it('should handle negative delay', () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 100,
        delay: -50
      });
      
      // Should treat negative delay as 0
      animation.start();
      expect(animation.running.value).toBe(true);
      
      animation.stop();
    });
    
    it('should handle from === to', async () => {
      const animation = animate<number>({
        from: 100,
        to: 100,
        duration: 100
      });
      
      const values: number[] = [];
      animation.onUpdate(val => values.push(val));
      
      animation.start();
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // All values should be 100
      values.forEach(val => {
        expect(val).toBe(100);
      });
    });
    
    it('should handle empty sequence', async () => {
      const seq = sequence([]);
      
      let completed = false;
      seq.onComplete(() => completed = true);
      
      seq.start();
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(completed).toBe(true);
    });
    
    it('should handle empty parallel', async () => {
      const par = parallel([]);
      
      let completed = false;
      par.onComplete(() => completed = true);
      
      par.start();
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(completed).toBe(true);
    });
    
    it('should not start if already running', () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 100
      });
      
      animation.start();
      expect(animation.running.value).toBe(true);
      
      // Try to start again
      animation.start();
      
      // Should still be running (not restarted)
      expect(animation.running.value).toBe(true);
      
      animation.stop();
    });
    
    it('should handle disposal correctly', () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 100
      });
      
      const disposer = animation.onUpdate(() => {});
      
      animation.start();
      disposer.dispose();
      animation.stop();
      
      // Should not throw
      expect(animation.running.value).toBe(false);
    });
  });
  
  describe('Performance', () => {
    it('should handle many simultaneous animations', async () => {
      const animations: Animation<number>[] = [];
      
      for (let i = 0; i < 10; i++) {
        const anim = animate<number>({
          from: 0,
          to: 100,
          duration: 100
        });
        animations.push(anim);
        engine.add(anim);
      }
      
      const startTime = performance.now();
      
      animations.forEach(anim => anim.start());
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const endTime = performance.now();
      const elapsed = endTime - startTime;
      
      // Should complete in reasonable time
      expect(elapsed).toBeLessThan(500);
      
      // All should be completed
      animations.forEach(anim => {
        expect(anim.running.value).toBe(false);
      });
    });
    
    it('should handle rapid start/stop cycles', () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 100
      });
      
      for (let i = 0; i < 10; i++) {
        animation.start();
        animation.stop();
      }
      
      // Should not throw and be stopped
      expect(animation.running.value).toBe(false);
    });
  });
});