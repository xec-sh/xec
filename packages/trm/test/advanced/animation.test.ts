/**
 * Animation Module Tests
 * Comprehensive test suite for animation functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  animate,
  spring,
  sequence,
  parallel,
  createAnimationEngine,
  Easing,
  physics,
  orbit,
  wave,
  morph,
  type Animation,
  type AnimationEngine,
  type AnimationOptions,
  type SpringOptions,
  type PhysicsBody
} from '../../src/advanced/animation.js';

// Mock performance.now for consistent timing
vi.mock('../../src/core/browser-api.js', () => ({
  requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 16)),
  cancelAnimationFrame: vi.fn((id) => clearTimeout(id))
}));

describe('Animation Module', () => {
  let engine: AnimationEngine;
  let currentTime = 0;
  
  beforeEach(() => {
    vi.useFakeTimers();
    engine = createAnimationEngine();
    currentTime = 0;
    
    // Mock performance.now for predictable timing
    vi.spyOn(performance, 'now').mockImplementation(() => {
      return currentTime;
    });
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
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
      expect(Easing.easeInSine(0)).toBe(0);
      expect(Easing.easeInSine(1)).toBeCloseTo(1, 10);
      expect(Easing.easeOutSine(0)).toBe(0);
      expect(Easing.easeOutSine(1)).toBeCloseTo(1, 10);
      expect(Easing.easeInOutSine(0)).toBe(0);
      expect(Easing.easeInOutSine(0.5)).toBe(0.5);
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
      expect(Easing.easeInBack(0)).toBe(0);
      expect(Easing.easeInBack(1)).toBeCloseTo(1, 10);
      // Back easing overshoots
      expect(Easing.easeInBack(0.5)).toBeLessThan(0);
      
      expect(Easing.easeOutBack(0)).toBe(0);
      expect(Easing.easeOutBack(1)).toBeCloseTo(1, 10);
      // Back easing overshoots
      expect(Easing.easeOutBack(0.5)).toBeGreaterThan(0.5);
    });
    
    it('should have correct bounce easing', () => {
      expect(Easing.easeInBounce(0)).toBe(0);
      expect(Easing.easeInBounce(1)).toBe(1);
      expect(Easing.easeOutBounce(0)).toBe(0);
      expect(Easing.easeOutBounce(1)).toBe(1);
      expect(Easing.easeInOutBounce(0)).toBe(0);
      expect(Easing.easeInOutBounce(1)).toBe(1);
    });
  });
  
  describe('Basic Animation', () => {
    it('should animate numeric values', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 1000,
        easing: Easing.linear
      });
      
      const values: number[] = [];
      animation.onUpdate(value => values.push(value));
      
      expect(animation.running.value).toBe(false);
      expect(animation.value.value).toBe(0);
      
      const promise = animation.start();
      expect(animation.running.value).toBe(true);
      
      // Simulate time passing
      currentTime = 500; // Half way
      await vi.advanceTimersByTimeAsync(500);
      
      expect(animation.progress.value).toBeCloseTo(0.5, 1);
      expect(animation.value.value).toBeCloseTo(50, 1);
      
      currentTime = 1000; // Complete
      await vi.advanceTimersByTimeAsync(500);
      
      await promise;
      
      expect(animation.running.value).toBe(false);
      expect(animation.progress.value).toBe(1);
      expect(animation.value.value).toBe(100);
    });
    
    it('should animate arrays', async () => {
      const animation = animate<number[]>({
        from: [0, 0, 0],
        to: [100, 200, 300],
        duration: 1000,
        easing: Easing.linear
      });
      
      animation.start();
      
      currentTime = 500;
      await vi.advanceTimersByTimeAsync(500);
      
      expect(animation.value.value).toEqual([50, 100, 150]);
      
      currentTime = 1000;
      await vi.advanceTimersByTimeAsync(500);
      
      expect(animation.value.value).toEqual([100, 200, 300]);
    });
    
    it('should animate objects', async () => {
      const animation = animate<{ x: number; y: number }>({
        from: { x: 0, y: 0 },
        to: { x: 100, y: 200 },
        duration: 1000,
        easing: Easing.linear
      });
      
      animation.start();
      
      currentTime = 500;
      await vi.advanceTimersByTimeAsync(500);
      
      expect(animation.value.value).toEqual({ x: 50, y: 100 });
      
      currentTime = 1000;
      await vi.advanceTimersByTimeAsync(500);
      
      expect(animation.value.value).toEqual({ x: 100, y: 200 });
    });
    
    it('should support delay', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 1000,
        delay: 500
      });
      
      animation.start();
      
      currentTime = 250;
      await vi.advanceTimersByTimeAsync(250);
      
      // Still at start value during delay
      expect(animation.value.value).toBe(0);
      
      currentTime = 1000; // 500ms delay + 500ms animation
      await vi.advanceTimersByTimeAsync(750);
      
      expect(animation.value.value).toBeCloseTo(50, 1);
      
      currentTime = 1500; // Complete
      await vi.advanceTimersByTimeAsync(500);
      
      expect(animation.value.value).toBe(100);
    });
    
    it('should support repeat', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 100,
        repeat: 2
      });
      
      const values: number[] = [];
      animation.onUpdate(value => values.push(value));
      
      animation.start();
      
      // First iteration
      currentTime = 100;
      await vi.advanceTimersByTimeAsync(100);
      
      expect(animation.value.value).toBe(100);
      
      // Second iteration
      currentTime = 200;
      await vi.advanceTimersByTimeAsync(100);
      
      expect(animation.value.value).toBe(100);
      
      // Third iteration
      currentTime = 300;
      await vi.advanceTimersByTimeAsync(100);
      
      expect(animation.value.value).toBe(100);
      expect(animation.running.value).toBe(false);
    });
    
    it('should support yoyo', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 100,
        repeat: 1,
        yoyo: true
      });
      
      animation.start();
      
      // First iteration (forward)
      currentTime = 100;
      await vi.advanceTimersByTimeAsync(100);
      
      expect(animation.value.value).toBe(100);
      
      // Second iteration (reverse due to yoyo)
      currentTime = 200;
      await vi.advanceTimersByTimeAsync(100);
      
      expect(animation.value.value).toBe(0);
      expect(animation.running.value).toBe(false);
    });
    
    it('should support infinite repeat', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 100,
        repeat: 'infinite'
      });
      
      animation.start();
      
      // Multiple iterations
      for (let i = 0; i < 5; i++) {
        currentTime = (i + 1) * 100;
        await vi.advanceTimersByTimeAsync(100);
        expect(animation.value.value).toBe(100);
        expect(animation.running.value).toBe(true);
      }
      
      // Should still be running
      expect(animation.running.value).toBe(true);
      
      animation.stop();
      expect(animation.running.value).toBe(false);
    });
    
    it('should pause and resume', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 1000
      });
      
      animation.start();
      
      currentTime = 500;
      await vi.advanceTimersByTimeAsync(500);
      
      expect(animation.value.value).toBeCloseTo(50, 1);
      
      animation.pause();
      expect(animation.running.value).toBe(false);
      
      // Time passes but animation doesn't progress
      currentTime = 700;
      await vi.advanceTimersByTimeAsync(200);
      
      expect(animation.value.value).toBeCloseTo(50, 1);
      
      animation.resume();
      expect(animation.running.value).toBe(true);
      
      currentTime = 1200; // 500ms more animation time
      await vi.advanceTimersByTimeAsync(500);
      
      expect(animation.value.value).toBe(100);
    });
    
    it('should reverse animation', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 1000
      });
      
      animation.start();
      
      currentTime = 500;
      await vi.advanceTimersByTimeAsync(500);
      
      expect(animation.value.value).toBeCloseTo(50, 1);
      
      animation.reverse();
      
      currentTime = 1000;
      await vi.advanceTimersByTimeAsync(500);
      
      // After reverse, animating from 100 to 0
      expect(animation.value.value).toBeCloseTo(50, 1);
      
      currentTime = 1500;
      await vi.advanceTimersByTimeAsync(500);
      
      expect(animation.value.value).toBe(0);
    });
    
    it('should stop animation', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 1000
      });
      
      animation.start();
      
      currentTime = 500;
      await vi.advanceTimersByTimeAsync(500);
      
      animation.stop();
      
      expect(animation.running.value).toBe(false);
      expect(animation.value.value).toBe(0); // Reset to from value
      expect(animation.progress.value).toBe(0);
    });
    
    it('should handle callbacks', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 100
      });
      
      const updateValues: number[] = [];
      let completed = false;
      
      const updateDisposable = animation.onUpdate(value => {
        updateValues.push(value);
      });
      
      const completeDisposable = animation.onComplete(() => {
        completed = true;
      });
      
      animation.start();
      
      currentTime = 100;
      await vi.advanceTimersByTimeAsync(100);
      
      expect(updateValues.length).toBeGreaterThan(0);
      expect(completed).toBe(true);
      
      // Dispose handlers
      updateDisposable.dispose();
      completeDisposable.dispose();
      
      expect(updateDisposable.disposed).toBe(true);
      expect(completeDisposable.disposed).toBe(true);
    });
  });
  
  describe('Spring Animation', () => {
    it('should animate with spring physics', async () => {
      const animation = spring<number>({
        from: 0,
        to: 100,
        stiffness: 100,
        damping: 10,
        mass: 1
      });
      
      const values: number[] = [];
      animation.onUpdate(value => values.push(value));
      
      animation.start();
      
      // Spring animation doesn't have fixed duration
      // Simulate multiple frames
      for (let i = 0; i < 100; i++) {
        currentTime = i * 16; // 60 FPS
        await vi.advanceTimersByTimeAsync(16);
        
        if (!animation.running.value) break;
      }
      
      expect(animation.running.value).toBe(false);
      expect(animation.value.value).toBeCloseTo(100, 0);
      
      // Spring should overshoot and oscillate
      const maxValue = Math.max(...values);
      expect(maxValue).toBeGreaterThan(100);
    });
    
    it('should support different spring configurations', async () => {
      // Stiff spring (fast)
      const stiffSpring = spring<number>({
        from: 0,
        to: 100,
        stiffness: 500,
        damping: 20
      });
      
      // Loose spring (slow)
      const looseSpring = spring<number>({
        from: 0,
        to: 100,
        stiffness: 50,
        damping: 5
      });
      
      stiffSpring.start();
      looseSpring.start();
      
      // Simulate frames
      for (let i = 0; i < 50; i++) {
        currentTime = i * 16;
        await vi.advanceTimersByTimeAsync(16);
        
        if (!stiffSpring.running.value && !looseSpring.running.value) break;
      }
      
      // Stiff spring should settle faster
      expect(stiffSpring.running.value).toBe(false);
      // Loose spring might still be running
      expect(stiffSpring.value.value).toBeCloseTo(100, 0);
    });
    
    it('should support initial velocity', async () => {
      const animation = spring<number>({
        from: 0,
        to: 100,
        velocity: 500,
        stiffness: 100,
        damping: 10
      });
      
      const values: number[] = [];
      animation.onUpdate(value => values.push(value));
      
      animation.start();
      
      // Simulate frames
      for (let i = 0; i < 100; i++) {
        currentTime = i * 16;
        await vi.advanceTimersByTimeAsync(16);
        
        if (!animation.running.value) break;
      }
      
      // With initial velocity, should overshoot more
      const maxValue = Math.max(...values);
      expect(maxValue).toBeGreaterThan(100);
    });
  });
  
  describe('Sequence Animation', () => {
    it('should run animations in sequence', async () => {
      const results: string[] = [];
      
      const anim1 = animate<number>({
        from: 0,
        to: 100,
        duration: 100
      });
      anim1.onComplete(() => results.push('anim1'));
      
      const anim2 = animate<number>({
        from: 100,
        to: 200,
        duration: 100
      });
      anim2.onComplete(() => results.push('anim2'));
      
      const anim3 = animate<number>({
        from: 200,
        to: 300,
        duration: 100
      });
      anim3.onComplete(() => results.push('anim3'));
      
      const seq = sequence([anim1, anim2, anim3]);
      seq.onComplete(() => results.push('sequence'));
      
      seq.start();
      
      expect(seq.running.value).toBe(true);
      
      // First animation
      currentTime = 100;
      await vi.advanceTimersByTimeAsync(100);
      expect(results).toContain('anim1');
      
      // Second animation
      currentTime = 200;
      await vi.advanceTimersByTimeAsync(100);
      expect(results).toContain('anim2');
      
      // Third animation
      currentTime = 300;
      await vi.advanceTimersByTimeAsync(100);
      expect(results).toContain('anim3');
      expect(results).toContain('sequence');
      
      expect(seq.running.value).toBe(false);
      expect(seq.progress.value).toBe(1);
    });
    
    it('should pause and resume sequence', async () => {
      const anim1 = animate<number>({
        from: 0,
        to: 100,
        duration: 100
      });
      
      const anim2 = animate<number>({
        from: 100,
        to: 200,
        duration: 100
      });
      
      const seq = sequence([anim1, anim2]);
      
      seq.start();
      
      currentTime = 50;
      await vi.advanceTimersByTimeAsync(50);
      
      seq.pause();
      expect(seq.running.value).toBe(false);
      
      currentTime = 150; // Time passes
      await vi.advanceTimersByTimeAsync(100);
      
      // Should not progress
      expect(seq.progress.value).toBeLessThan(0.5);
      
      seq.resume();
      expect(seq.running.value).toBe(true);
      
      currentTime = 250;
      await vi.advanceTimersByTimeAsync(100);
      
      currentTime = 350;
      await vi.advanceTimersByTimeAsync(100);
      
      expect(seq.running.value).toBe(false);
    });
  });
  
  describe('Parallel Animation', () => {
    it('should run animations in parallel', async () => {
      const results: string[] = [];
      
      const anim1 = animate<number>({
        from: 0,
        to: 100,
        duration: 100
      });
      anim1.onComplete(() => results.push('anim1'));
      
      const anim2 = animate<number>({
        from: 0,
        to: 200,
        duration: 200
      });
      anim2.onComplete(() => results.push('anim2'));
      
      const anim3 = animate<number>({
        from: 0,
        to: 300,
        duration: 300
      });
      anim3.onComplete(() => results.push('anim3'));
      
      const par = parallel([anim1, anim2, anim3]);
      par.onComplete(() => results.push('parallel'));
      
      par.start();
      
      expect(par.running.value).toBe(true);
      
      // First animation completes
      currentTime = 100;
      await vi.advanceTimersByTimeAsync(100);
      expect(results).toContain('anim1');
      expect(par.progress.value).toBeCloseTo(1/3, 1);
      
      // Second animation completes
      currentTime = 200;
      await vi.advanceTimersByTimeAsync(100);
      expect(results).toContain('anim2');
      expect(par.progress.value).toBeCloseTo(2/3, 1);
      
      // Third animation completes
      currentTime = 300;
      await vi.advanceTimersByTimeAsync(100);
      expect(results).toContain('anim3');
      expect(results).toContain('parallel');
      
      expect(par.running.value).toBe(false);
      expect(par.progress.value).toBe(1);
    });
  });
  
  describe('Animation Engine', () => {
    it('should scale time', () => {
      expect(engine.timeScale).toBe(1);
      
      engine.setTimeScale(2);
      expect(engine.timeScale).toBe(2);
      
      const animation = engine.animate({
        from: 0,
        to: 100,
        duration: 1000 // Will be 500ms with 2x time scale
      });
      
      // Duration should be scaled
      expect((animation as any).duration).toBe(500);
    });
    
    it('should pause all animations', () => {
      const anim1 = engine.animate({
        from: 0,
        to: 100,
        duration: 1000
      });
      
      const anim2 = engine.animate({
        from: 0,
        to: 200,
        duration: 1000
      });
      
      anim1.start();
      anim2.start();
      
      expect(anim1.running.value).toBe(true);
      expect(anim2.running.value).toBe(true);
      
      engine.pauseAll();
      
      expect(anim1.running.value).toBe(false);
      expect(anim2.running.value).toBe(false);
    });
    
    it('should resume all animations', () => {
      const anim1 = engine.animate({
        from: 0,
        to: 100,
        duration: 1000
      });
      
      const anim2 = engine.animate({
        from: 0,
        to: 200,
        duration: 1000
      });
      
      anim1.start();
      anim2.start();
      
      engine.pauseAll();
      engine.resumeAll();
      
      expect(anim1.running.value).toBe(true);
      expect(anim2.running.value).toBe(true);
    });
    
    it('should stop all animations', () => {
      const anim1 = engine.animate({
        from: 0,
        to: 100,
        duration: 1000
      });
      
      const anim2 = engine.animate({
        from: 0,
        to: 200,
        duration: 1000
      });
      
      anim1.start();
      anim2.start();
      
      engine.stopAll();
      
      expect(anim1.running.value).toBe(false);
      expect(anim2.running.value).toBe(false);
    });
  });
  
  describe('Physics Animation', () => {
    it('should simulate gravity', async () => {
      const body: PhysicsBody = {
        x: 100,
        y: 100,
        vx: 0,
        vy: 0
      };
      
      const animation = physics(body, {
        gravity: 0.5
      });
      
      animation.start();
      
      // Simulate multiple frames
      const positions: number[] = [];
      for (let i = 0; i < 10; i++) {
        currentTime = i * 16;
        await vi.advanceTimersByTimeAsync(16);
        positions.push(animation.value.value.y);
      }
      
      // Y position should increase (falling)
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]).toBeGreaterThan(positions[i - 1]);
      }
      
      animation.stop();
    });
    
    it('should simulate friction', async () => {
      const body: PhysicsBody = {
        x: 100,
        y: 100,
        vx: 10,
        vy: 0
      };
      
      const animation = physics(body, {
        friction: 0.9
      });
      
      animation.start();
      
      // Simulate multiple frames
      const velocities: number[] = [];
      for (let i = 0; i < 10; i++) {
        currentTime = i * 16;
        await vi.advanceTimersByTimeAsync(16);
        velocities.push(animation.value.value.vx);
      }
      
      // Velocity should decrease due to friction
      for (let i = 1; i < velocities.length; i++) {
        expect(Math.abs(velocities[i])).toBeLessThan(Math.abs(velocities[i - 1]));
      }
      
      animation.stop();
    });
    
    it('should handle bounds collision', async () => {
      const body: PhysicsBody = {
        x: 50,
        y: 50,
        vx: -10,
        vy: 0,
        elasticity: 0.8
      };
      
      const animation = physics(body, {
        bounds: { x: 0, y: 0, width: 100, height: 100 }
      });
      
      animation.start();
      
      // Move left until hitting bound
      for (let i = 0; i < 10; i++) {
        currentTime = i * 16;
        await vi.advanceTimersByTimeAsync(16);
        
        if (animation.value.value.x <= 0) {
          // Should bounce back
          expect(animation.value.value.vx).toBeGreaterThan(0);
          break;
        }
      }
      
      animation.stop();
    });
  });
  
  describe('Specialized Animations', () => {
    it('should create orbital animation', () => {
      const animation = orbit({
        centerX: 100,
        centerY: 100,
        radius: 50,
        speed: 1
      });
      
      expect(animation).toBeDefined();
      expect(animation.value).toBeDefined();
    });
    
    it('should create wave animation', () => {
      const animation = wave({
        amplitude: 10,
        frequency: 2,
        speed: 1
      });
      
      expect(animation).toBeDefined();
      expect(animation.value).toBeDefined();
    });
    
    it('should create morph animation', () => {
      const shapes = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ];
      
      const animation = morph({
        shapes,
        duration: 1000
      });
      
      expect(animation).toBeDefined();
      expect(animation.value).toBeDefined();
    });
  });
  
  describe('Interpolation', () => {
    it('should interpolate between numbers correctly', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 1000,
        easing: Easing.linear
      });
      
      animation.start();
      
      currentTime = 250;
      await vi.advanceTimersByTimeAsync(250);
      expect(animation.value.value).toBeCloseTo(25, 1);
      
      currentTime = 750;
      await vi.advanceTimersByTimeAsync(500);
      expect(animation.value.value).toBeCloseTo(75, 1);
    });
    
    it('should interpolate between arrays correctly', async () => {
      const animation = animate<number[]>({
        from: [0, 10, 20],
        to: [100, 110, 120],
        duration: 1000,
        easing: Easing.linear
      });
      
      animation.start();
      
      currentTime = 500;
      await vi.advanceTimersByTimeAsync(500);
      
      const value = animation.value.value;
      expect(value[0]).toBeCloseTo(50, 1);
      expect(value[1]).toBeCloseTo(60, 1);
      expect(value[2]).toBeCloseTo(70, 1);
    });
    
    it('should interpolate between objects correctly', async () => {
      const animation = animate<{ x: number; y: number; z: number }>({
        from: { x: 0, y: 10, z: 20 },
        to: { x: 100, y: 110, z: 120 },
        duration: 1000,
        easing: Easing.linear
      });
      
      animation.start();
      
      currentTime = 500;
      await vi.advanceTimersByTimeAsync(500);
      
      const value = animation.value.value;
      expect(value.x).toBeCloseTo(50, 1);
      expect(value.y).toBeCloseTo(60, 1);
      expect(value.z).toBeCloseTo(70, 1);
    });
    
    it('should handle non-numeric properties in objects', async () => {
      const animation = animate<{ x: number; label: string }>({
        from: { x: 0, label: 'start' },
        to: { x: 100, label: 'end' },
        duration: 1000,
        easing: Easing.linear
      });
      
      animation.start();
      
      currentTime = 400;
      await vi.advanceTimersByTimeAsync(400);
      
      // Non-numeric values switch at 50%
      expect(animation.value.value.label).toBe('start');
      
      currentTime = 600;
      await vi.advanceTimersByTimeAsync(200);
      
      expect(animation.value.value.label).toBe('end');
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle zero duration', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 0
      });
      
      animation.start();
      await vi.advanceTimersByTimeAsync(0);
      
      expect(animation.value.value).toBe(100);
      expect(animation.running.value).toBe(false);
    });
    
    it('should handle negative delay', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 1000,
        delay: -500 // Should be treated as 0
      });
      
      animation.start();
      
      currentTime = 0;
      await vi.advanceTimersByTimeAsync(0);
      
      // Should start immediately
      expect(animation.running.value).toBe(true);
    });
    
    it('should handle from === to', async () => {
      const animation = animate<number>({
        from: 100,
        to: 100,
        duration: 1000
      });
      
      animation.start();
      
      currentTime = 500;
      await vi.advanceTimersByTimeAsync(500);
      
      expect(animation.value.value).toBe(100);
      
      currentTime = 1000;
      await vi.advanceTimersByTimeAsync(500);
      
      expect(animation.value.value).toBe(100);
    });
    
    it('should handle empty sequence', async () => {
      const seq = sequence([]);
      
      seq.start();
      await vi.advanceTimersByTimeAsync(0);
      
      expect(seq.running.value).toBe(false);
      expect(seq.progress.value).toBe(0);
    });
    
    it('should handle empty parallel', async () => {
      const par = parallel([]);
      
      par.start();
      await vi.advanceTimersByTimeAsync(0);
      
      expect(par.running.value).toBe(false);
      expect(par.progress.value).toBe(0);
    });
    
    it('should not start if already running', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 1000
      });
      
      const promise1 = animation.start();
      const promise2 = animation.start(); // Should return immediately
      
      expect(promise1).toBe(promise2);
    });
    
    it('should handle disposal correctly', () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 1000
      });
      
      const updateDisposable = animation.onUpdate(() => {});
      const completeDisposable = animation.onComplete(() => {});
      
      expect(updateDisposable.disposed).toBe(false);
      expect(completeDisposable.disposed).toBe(false);
      
      updateDisposable.dispose();
      completeDisposable.dispose();
      
      expect(updateDisposable.disposed).toBe(true);
      expect(completeDisposable.disposed).toBe(true);
      
      // Should not throw when disposing again
      updateDisposable.dispose();
      completeDisposable.dispose();
    });
  });
  
  describe('Performance', () => {
    it('should handle many simultaneous animations', () => {
      const animations: Animation<number>[] = [];
      
      for (let i = 0; i < 100; i++) {
        animations.push(
          animate({
            from: 0,
            to: i * 10,
            duration: 1000
          })
        );
      }
      
      animations.forEach(anim => anim.start());
      
      expect(animations.every(anim => anim.running.value)).toBe(true);
      
      engine.stopAll();
      
      expect(animations.every(anim => !anim.running.value)).toBe(true);
    });
    
    it('should handle rapid start/stop cycles', async () => {
      const animation = animate<number>({
        from: 0,
        to: 100,
        duration: 1000
      });
      
      for (let i = 0; i < 10; i++) {
        animation.start();
        await vi.advanceTimersByTimeAsync(10);
        animation.stop();
      }
      
      expect(animation.running.value).toBe(false);
      expect(animation.value.value).toBe(0);
    });
  });
});