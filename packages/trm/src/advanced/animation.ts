/**
 * Animation Module
 * High-performance animation engine with easing and spring physics
 */

import { type Signal, createSignal, type WritableSignal } from './state.js';
import { cancelAnimationFrame, requestAnimationFrame } from '../core/browser-api.js';

import type { Disposable } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface AnimationEngine {
  // Animation creation
  animate<T>(options: AnimationOptions<T>): Animation<T>;
  spring<T>(options: SpringOptions<T>): Animation<T>;
  sequence(animations: Animation<any>[]): Animation<void>;
  parallel(animations: Animation<any>[]): Animation<void>;

  // Global control
  pauseAll(): void;
  resumeAll(): void;
  stopAll(): void;

  // Time control
  readonly timeScale: number;
  setTimeScale(scale: number): void;
}

export interface Animation<T> {
  readonly value: Signal<T>;
  readonly progress: Signal<number>;
  readonly running: Signal<boolean>;

  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  reverse(): void;

  onUpdate(fn: (value: T) => void): Disposable;
  onComplete(fn: () => void): Disposable;
}

export interface AnimationOptions<T> {
  from: T;
  to: T;
  duration: number;
  easing?: EasingFunction;
  delay?: number;
  repeat?: number | 'infinite';
  yoyo?: boolean;
}

export interface SpringOptions<T> {
  from: T;
  to: T;
  stiffness?: number;  // Spring constant (default: 100)
  damping?: number;     // Damping ratio (default: 10)
  mass?: number;        // Mass (default: 1)
  velocity?: number;    // Initial velocity (default: 0)
  precision?: number;   // Stop threshold (default: 0.01)
}

export type EasingFunction = (t: number) => number;

// ============================================================================
// Easing Functions
// ============================================================================

export const Easing = {
  // Linear
  linear: (t: number) => t,

  // Quadratic
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

  // Cubic
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => (--t) * t * t + 1,
  easeInOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,

  // Quartic
  easeInQuart: (t: number) => t * t * t * t,
  easeOutQuart: (t: number) => 1 - (--t) * t * t * t,
  easeInOutQuart: (t: number) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,

  // Quintic
  easeInQuint: (t: number) => t * t * t * t * t,
  easeOutQuint: (t: number) => 1 + (--t) * t * t * t * t,
  easeInOutQuint: (t: number) => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t,

  // Sine
  easeInSine: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t: number) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,

  // Exponential
  easeInExpo: (t: number) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo: (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: (t: number) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },

  // Circular
  easeInCirc: (t: number) => 1 - Math.sqrt(1 - Math.pow(t, 2)),
  easeOutCirc: (t: number) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  easeInOutCirc: (t: number) => t < 0.5
    ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
    : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,

  // Elastic
  easeInElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  },
  easeOutElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  easeInOutElastic: (t: number) => {
    const c5 = (2 * Math.PI) / 4.5;
    return t === 0 ? 0 : t === 1 ? 1
      : t < 0.5
        ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
        : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
  },

  // Back
  easeInBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  easeOutBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeInOutBack: (t: number) => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },

  // Bounce
  easeInBounce: (t: number) => 1 - Easing.easeOutBounce(1 - t),
  easeOutBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;

    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  },
  easeInOutBounce: (t: number) => t < 0.5
    ? (1 - Easing.easeOutBounce(1 - 2 * t)) / 2
    : (1 + Easing.easeOutBounce(2 * t - 1)) / 2
} as const;

// ============================================================================
// Interpolation Helpers
// ============================================================================

function interpolateNumber(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function interpolateArray(from: number[], to: number[], t: number): number[] {
  const result: number[] = [];
  const len = Math.min(from.length, to.length);
  for (let i = 0; i < len; i++) {
    result[i] = interpolateNumber(from[i], to[i], t);
  }
  return result;
}

function interpolateObject(from: any, to: any, t: number): any {
  const result: any = {};
  for (const key in from) {
    if (key in to) {
      const fromVal = from[key];
      const toVal = to[key];
      if (typeof fromVal === 'number' && typeof toVal === 'number') {
        result[key] = interpolateNumber(fromVal, toVal, t);
      } else if (Array.isArray(fromVal) && Array.isArray(toVal)) {
        result[key] = interpolateArray(fromVal, toVal, t);
      } else {
        result[key] = t < 0.5 ? fromVal : toVal;
      }
    }
  }
  return result;
}

function interpolate<T>(from: T, to: T, t: number): T {
  if (typeof from === 'number' && typeof to === 'number') {
    return interpolateNumber(from, to, t) as T;
  }
  if (Array.isArray(from) && Array.isArray(to)) {
    return interpolateArray(from, to, t) as T;
  }
  if (typeof from === 'object' && typeof to === 'object') {
    return interpolateObject(from, to, t) as T;
  }
  return (t < 0.5 ? from : to) as T;
}

// ============================================================================
// Animation Implementation
// ============================================================================

class AnimationImpl<T> implements Animation<T> {
  readonly value: WritableSignal<T>;
  readonly progress: WritableSignal<number>;
  readonly running: WritableSignal<boolean>;

  get currentValue(): T {
    return this.value.value;
  }

  get isRunning(): boolean {
    return this.running.value;
  }

  private from: T;
  private to: T;
  private duration: number;
  private easing: EasingFunction;
  private delay: number;
  private repeat: number | 'infinite';
  private yoyo: boolean;

  private startTime: number = 0;
  private pauseTime: number = 0;
  private currentRepeat: number = 0;
  private direction: 1 | -1 = 1;
  private animationFrame?: number;
  private resolve?: () => void;

  private updateHandlers = new Set<(value: T) => void>();
  private completeHandlers = new Set<() => void>();

  constructor(options: AnimationOptions<T>, private engine: AnimationEngineImpl) {
    this.from = options.from;
    this.to = options.to;
    this.duration = options.duration;
    this.easing = options.easing || Easing.linear;
    this.delay = options.delay || 0;
    this.repeat = options.repeat || 0;
    this.yoyo = options.yoyo || false;

    const [valueSignal, setValue] = createSignal(this.from);
    const [progressSignal, setProgress] = createSignal(0);
    const [runningSignal, setRunning] = createSignal(false);

    // Create WritableSignal by combining getter and setter
    this.value = Object.assign(valueSignal, { set: setValue }) as WritableSignal<T>;
    this.progress = Object.assign(progressSignal, { set: setProgress }) as WritableSignal<number>;
    this.running = Object.assign(runningSignal, { set: setRunning }) as WritableSignal<boolean>;
  }

  async start(): Promise<void> {
    if (this.running.value) return Promise.resolve();

    this.running.set(true);
    this.startTime = performance.now() + this.delay;
    this.currentRepeat = 0;
    this.direction = 1;

    // Register with engine
    this.engine.register(this);

    return new Promise(resolve => {
      this.resolve = resolve;
      this.tick();
    });
  }

  pause(): void {
    if (!this.running.value) return;

    this.pauseTime = performance.now();
    this.running.set(false);

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
  }

  resume(): void {
    if (this.running.value || this.pauseTime === 0) return;

    const pauseDuration = performance.now() - this.pauseTime;
    this.startTime += pauseDuration;
    this.pauseTime = 0;
    this.running.set(true);

    this.tick();
  }

  stop(): void {
    this.running.set(false);
    this.value.set(this.from);
    this.progress.set(0);

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }

    // Unregister from engine
    this.engine.unregister(this);

    if (this.resolve) {
      this.resolve();
      this.resolve = undefined;
    }
  }

  reverse(): void {
    this.direction *= -1;
    const temp = this.from;
    this.from = this.to;
    this.to = temp;
  }

  onUpdate(fn: (value: T) => void): Disposable {
    this.updateHandlers.add(fn);
    let disposed = false;
    return {
      get disposed() { return disposed; },
      dispose: () => {
        this.updateHandlers.delete(fn);
        disposed = true;
      }
    };
  }

  onComplete(fn: () => void): Disposable {
    this.completeHandlers.add(fn);
    let disposed = false;
    return {
      get disposed() { return disposed; },
      dispose: () => {
        this.completeHandlers.delete(fn);
        disposed = true;
      }
    };
  }

  private tick = (): void => {
    if (!this.running.value) return;

    const now = performance.now();
    const elapsed = Math.max(0, now - this.startTime);

    if (elapsed < 0) {
      // Still in delay
      this.animationFrame = requestAnimationFrame(this.tick);
      return;
    }

    const progress = Math.min(1, elapsed / this.duration);

    // Apply easing
    const easedProgress = this.easing(progress);

    // Calculate value
    const value = interpolate(this.from, this.to, easedProgress);

    // Update signals
    this.value.set(value);
    this.progress.set(progress);

    // Notify handlers
    this.updateHandlers.forEach(fn => fn(value));

    if (progress >= 1) {
      // Animation complete for this iteration
      if (this.repeat === 'infinite' || this.currentRepeat < this.repeat) {
        this.currentRepeat++;

        if (this.yoyo) {
          this.reverse();
        }

        this.startTime = now;
        this.animationFrame = requestAnimationFrame(this.tick);
      } else {
        // Animation fully complete
        this.running.set(false);
        this.completeHandlers.forEach(fn => fn());

        // Unregister from engine
        this.engine.unregister(this);

        if (this.resolve) {
          this.resolve();
          this.resolve = undefined;
        }
      }
    } else {
      this.animationFrame = requestAnimationFrame(this.tick);
    }
  };
}

// ============================================================================
// Spring Animation Implementation
// ============================================================================

class SpringAnimationImpl<T> implements Animation<T> {
  readonly value: WritableSignal<T>;
  readonly progress: WritableSignal<number>;
  readonly running: WritableSignal<boolean>;

  get currentValue(): T {
    return this.value.value;
  }

  get isRunning(): boolean {
    return this.running.value;
  }

  private from: T;
  private to: T;
  private stiffness: number;
  private damping: number;
  private mass: number;
  private velocity: number;
  private precision: number;

  private position: number = 0;
  private lastTime: number = 0;
  private animationFrame?: number;
  private resolve?: () => void;

  private updateHandlers = new Set<(value: T) => void>();
  private completeHandlers = new Set<() => void>();

  constructor(options: SpringOptions<T>, private engine: AnimationEngineImpl) {
    this.from = options.from;
    this.to = options.to;
    this.stiffness = options.stiffness ?? 100;
    this.damping = options.damping ?? 10;
    this.mass = options.mass ?? 1;
    this.velocity = options.velocity ?? 0;
    this.precision = options.precision ?? 0.01;

    const [valueSignal, setValue] = createSignal(this.from);
    const [progressSignal, setProgress] = createSignal(0);
    const [runningSignal, setRunning] = createSignal(false);

    // Create WritableSignal by combining getter and setter
    this.value = Object.assign(valueSignal, { set: setValue }) as WritableSignal<T>;
    this.progress = Object.assign(progressSignal, { set: setProgress }) as WritableSignal<number>;
    this.running = Object.assign(runningSignal, { set: setRunning }) as WritableSignal<boolean>;
  }

  async start(): Promise<void> {
    if (this.running.value) return Promise.resolve();

    this.running.set(true);
    this.position = 0;
    // Keep initial velocity from constructor
    this.lastTime = performance.now();

    // Register with engine
    this.engine.register(this);

    return new Promise(resolve => {
      this.resolve = resolve;
      this.tick();
    });
  }

  pause(): void {
    if (!this.running.value) return;

    this.running.set(false);

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
  }

  resume(): void {
    if (this.running.value) return;

    this.running.set(true);
    this.lastTime = performance.now();
    this.tick();
  }

  stop(): void {
    this.running.set(false);
    this.value.set(this.from);
    this.progress.set(0);

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }

    // Unregister from engine
    this.engine.unregister(this);

    if (this.resolve) {
      this.resolve();
      this.resolve = undefined;
    }
  }

  reverse(): void {
    const temp = this.from;
    this.from = this.to;
    this.to = temp;
    this.position = 1 - this.position;
    this.velocity = -this.velocity;
  }

  onUpdate(fn: (value: T) => void): Disposable {
    this.updateHandlers.add(fn);
    let disposed = false;
    return {
      get disposed() { return disposed; },
      dispose: () => {
        this.updateHandlers.delete(fn);
        disposed = true;
      }
    };
  }

  onComplete(fn: () => void): Disposable {
    this.completeHandlers.add(fn);
    let disposed = false;
    return {
      get disposed() { return disposed; },
      dispose: () => {
        this.completeHandlers.delete(fn);
        disposed = true;
      }
    };
  }

  private tick = (): void => {
    if (!this.running.value) return;

    const now = performance.now();
    const deltaTime = (now - this.lastTime) / 1000; // Convert to seconds
    this.lastTime = now;

    // Spring physics calculation
    const springForce = -this.stiffness * (this.position - 1);
    const dampingForce = -this.damping * this.velocity;
    const acceleration = (springForce + dampingForce) / this.mass;

    this.velocity += acceleration * deltaTime;
    this.position += this.velocity * deltaTime;

    // Calculate value
    const value = interpolate(this.from, this.to, this.position);

    // Update signals
    this.value.set(value);
    this.progress.set(Math.min(1, Math.max(0, this.position)));

    // Notify handlers
    this.updateHandlers.forEach(fn => fn(value));

    // Check if animation should stop
    const isComplete = Math.abs(1 - this.position) < this.precision &&
      Math.abs(this.velocity) < this.precision;

    if (isComplete) {
      // Snap to final value
      this.value.set(this.to);
      this.progress.set(1);
      this.running.set(false);

      this.completeHandlers.forEach(fn => fn());

      // Unregister from engine
      this.engine.unregister(this);

      if (this.resolve) {
        this.resolve();
        this.resolve = undefined;
      }
    } else {
      this.animationFrame = requestAnimationFrame(this.tick);
    }
  };
}

// ============================================================================
// Sequence Animation Implementation
// ============================================================================

class SequenceAnimationImpl implements Animation<void> {
  readonly value: WritableSignal<void>;
  readonly progress: WritableSignal<number>;
  readonly running: WritableSignal<boolean>;

  get currentValue(): void {
    return this.value.value;
  }

  get isRunning(): boolean {
    return this.running.value;
  }

  private animations: Animation<any>[];
  private currentIndex: number = 0;
  private resolve?: () => void;

  private updateHandlers = new Set<(value: void) => void>();
  private completeHandlers = new Set<() => void>();

  constructor(animations: Animation<any>[]) {
    this.animations = animations;

    const [valueSignal, setValue] = createSignal(undefined as void);
    const [progressSignal, setProgress] = createSignal(0);
    const [runningSignal, setRunning] = createSignal(false);

    // Create WritableSignal by combining getter and setter
    this.value = Object.assign(valueSignal, { set: setValue }) as WritableSignal<void>;
    this.progress = Object.assign(progressSignal, { set: setProgress }) as WritableSignal<number>;
    this.running = Object.assign(runningSignal, { set: setRunning }) as WritableSignal<boolean>;
  }

  async start(): Promise<void> {
    if (this.running.value || this.animations.length === 0) return Promise.resolve();

    this.running.set(true);
    this.currentIndex = 0;

    return new Promise(resolve => {
      this.resolve = resolve;
      this.runNext();
    });
  }

  private async runNext(): Promise<void> {
    if (this.currentIndex >= this.animations.length) {
      this.complete();
      return;
    }

    const animation = this.animations[this.currentIndex];

    // Update progress
    const overallProgress = this.currentIndex / this.animations.length;
    this.progress.set(overallProgress);

    await animation.start();

    this.currentIndex++;
    this.runNext();
  }

  pause(): void {
    if (!this.running.value) return;

    if (this.currentIndex < this.animations.length) {
      this.animations[this.currentIndex].pause();
    }
    this.running.set(false);
  }

  resume(): void {
    if (this.running.value) return;

    if (this.currentIndex < this.animations.length) {
      this.animations[this.currentIndex].resume();
    }
    this.running.set(true);
  }

  stop(): void {
    this.animations.forEach(anim => anim.stop());
    this.running.set(false);
    this.progress.set(0);
    this.currentIndex = 0;

    if (this.resolve) {
      this.resolve();
      this.resolve = undefined;
    }
  }

  reverse(): void {
    this.animations.forEach(anim => anim.reverse());
    this.animations.reverse();
    this.currentIndex = 0;
  }

  onUpdate(fn: (value: void) => void): Disposable {
    this.updateHandlers.add(fn);
    return {
      disposed: false,
      dispose: () => {
        this.updateHandlers.delete(fn);
        (this as any).disposed = true;
      }
    };
  }

  onComplete(fn: () => void): Disposable {
    this.completeHandlers.add(fn);
    let disposed = false;
    return {
      get disposed() { return disposed; },
      dispose: () => {
        this.completeHandlers.delete(fn);
        disposed = true;
      }
    };
  }

  private complete(): void {
    this.running.set(false);
    this.progress.set(1);
    this.completeHandlers.forEach(fn => fn());

    if (this.resolve) {
      this.resolve();
      this.resolve = undefined;
    }
  }
}

// ============================================================================
// Parallel Animation Implementation
// ============================================================================

class ParallelAnimationImpl implements Animation<void> {
  readonly value: WritableSignal<void>;
  readonly progress: WritableSignal<number>;
  readonly running: WritableSignal<boolean>;

  get currentValue(): void {
    return this.value.value;
  }

  get isRunning(): boolean {
    return this.running.value;
  }

  private animations: Animation<any>[];
  private completedCount: number = 0;
  private resolve?: () => void;

  private updateHandlers = new Set<(value: void) => void>();
  private completeHandlers = new Set<() => void>();

  constructor(animations: Animation<any>[]) {
    this.animations = animations;

    const [valueSignal, setValue] = createSignal(undefined as void);
    const [progressSignal, setProgress] = createSignal(0);
    const [runningSignal, setRunning] = createSignal(false);

    // Create WritableSignal by combining getter and setter
    this.value = Object.assign(valueSignal, { set: setValue }) as WritableSignal<void>;
    this.progress = Object.assign(progressSignal, { set: setProgress }) as WritableSignal<number>;
    this.running = Object.assign(runningSignal, { set: setRunning }) as WritableSignal<boolean>;
  }

  async start(): Promise<void> {
    if (this.running.value || this.animations.length === 0) return Promise.resolve();

    this.running.set(true);
    this.completedCount = 0;

    return new Promise(resolve => {
      this.resolve = resolve;

      // Start all animations
      const promises = this.animations.map(anim => {
        anim.onComplete(() => {
          this.completedCount++;
          this.progress.set(this.completedCount / this.animations.length);

          if (this.completedCount === this.animations.length) {
            this.complete();
          }
        });

        return anim.start();
      });

      Promise.all(promises);
    });
  }

  pause(): void {
    if (!this.running.value) return;

    this.animations.forEach(anim => anim.pause());
    this.running.set(false);
  }

  resume(): void {
    if (this.running.value) return;

    this.animations.forEach(anim => anim.resume());
    this.running.set(true);
  }

  stop(): void {
    this.animations.forEach(anim => anim.stop());
    this.running.set(false);
    this.progress.set(0);
    this.completedCount = 0;

    if (this.resolve) {
      this.resolve();
      this.resolve = undefined;
    }
  }

  reverse(): void {
    this.animations.forEach(anim => anim.reverse());
  }

  onUpdate(fn: (value: void) => void): Disposable {
    this.updateHandlers.add(fn);
    return {
      disposed: false,
      dispose: () => {
        this.updateHandlers.delete(fn);
        (this as any).disposed = true;
      }
    };
  }

  onComplete(fn: () => void): Disposable {
    this.completeHandlers.add(fn);
    let disposed = false;
    return {
      get disposed() { return disposed; },
      dispose: () => {
        this.completeHandlers.delete(fn);
        disposed = true;
      }
    };
  }

  private complete(): void {
    this.running.set(false);
    this.progress.set(1);
    this.completeHandlers.forEach(fn => fn());

    if (this.resolve) {
      this.resolve();
      this.resolve = undefined;
    }
  }
}

// ============================================================================
// Animation Engine Implementation
// ============================================================================

class AnimationEngineImpl implements AnimationEngine {
  private animations = new Set<Animation<any>>();
  private _timeScale: number = 1;
  private _frameRate: number = 60;
  private _isRunning: boolean = false;
  private animationFrame?: number;

  get timeScale(): number {
    return this._timeScale;
  }

  setTimeScale(scale: number): void {
    this._timeScale = Math.max(0, scale);
  }

  get frameRate(): number {
    return this._frameRate;
  }

  setFrameRate(fps: number): void {
    this._frameRate = Math.max(1, Math.min(120, fps));
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this.tick();
  }

  stop(): void {
    this._isRunning = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
  }

  private tick = (): void => {
    if (!this._isRunning) return;
    // Process animations
    this.animations.forEach(() => {
      // Animation processing handled by individual animations
    });
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  animate<T>(options: AnimationOptions<T>): Animation<T> {
    // Apply time scale to duration
    const scaledOptions = {
      ...options,
      duration: options.duration / this._timeScale
    };
    return new AnimationImpl(scaledOptions, this);
  }

  spring<T>(options: SpringOptions<T>): Animation<T> {
    return new SpringAnimationImpl(options, this);
  }

  sequence(animations: Animation<any>[]): Animation<void> {
    return new SequenceAnimationImpl(animations);
  }

  parallel(animations: Animation<any>[]): Animation<void> {
    return new ParallelAnimationImpl(animations);
  }

  pauseAll(): void {
    this.animations.forEach(anim => anim.pause());
  }

  resumeAll(): void {
    this.animations.forEach(anim => anim.resume());
  }

  stopAll(): void {
    this.animations.forEach(anim => anim.stop());
    this.stop();
  }

  register(animation: Animation<any>): void {
    this.animations.add(animation);
  }

  unregister(animation: Animation<any>): void {
    this.animations.delete(animation);
  }
}

// ============================================================================
// Physics Helpers
// ============================================================================

export interface PhysicsBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass?: number;
  elasticity?: number;
}

export interface PhysicsOptions {
  gravity?: number;
  friction?: number;
  bounds?: { x: number, y: number, width: number, height: number };
  collisions?: boolean;
}

/**
 * Apply physics simulation to an object
 */
export function physics<T extends PhysicsBody>(
  body: T,
  options: PhysicsOptions = {}
): Animation<T> {
  const gravity = options.gravity ?? 0;
  const friction = options.friction ?? 1;
  const bounds = options.bounds;

  let animationFrame: number | undefined;
  let running = false;
  const updateHandlers = new Set<(value: T) => void>();
  const completeHandlers = new Set<() => void>();

  const [valueSignal, setValue] = createSignal(body);
  const [progressSignal, setProgress] = createSignal(0);
  const [runningSignal, setRunning] = createSignal(false);

  const value = Object.assign(valueSignal, { set: setValue }) as WritableSignal<T>;
  const progress = Object.assign(progressSignal, { set: setProgress }) as WritableSignal<number>;
  const runningState = Object.assign(runningSignal, { set: setRunning }) as WritableSignal<boolean>;

  const tick = () => {
    if (!running) return;

    // Apply gravity
    body.vy += gravity;

    // Apply friction
    body.vx *= friction;
    body.vy *= friction;

    // Update position
    body.x += body.vx;
    body.y += body.vy;

    // Handle bounds collision
    if (bounds) {
      const elasticity = body.elasticity ?? 0.8;

      if (body.x <= bounds.x || body.x >= bounds.x + bounds.width) {
        body.vx *= -elasticity;
        body.x = body.x <= bounds.x ? bounds.x : bounds.x + bounds.width;
      }

      if (body.y <= bounds.y || body.y >= bounds.y + bounds.height) {
        body.vy *= -elasticity;
        body.y = body.y <= bounds.y ? bounds.y : bounds.y + bounds.height;
      }
    }

    // Update signal
    value.set({ ...body });

    // Notify handlers
    updateHandlers.forEach(fn => fn(body));

    // Continue animation
    animationFrame = requestAnimationFrame(tick);
  };

  return {
    value,
    progress,
    running: runningState,

    start: async () => {
      running = true;
      runningState.set(true);
      tick();
      return new Promise(() => {
        // Physics animations run indefinitely unless stopped
      });
    },

    pause: () => {
      running = false;
      runningState.set(false);
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = undefined;
      }
    },

    resume: () => {
      running = true;
      runningState.set(true);
      tick();
    },

    stop: () => {
      running = false;
      runningState.set(false);
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = undefined;
      }
      completeHandlers.forEach(fn => fn());
    },

    reverse: () => {
      body.vx *= -1;
      body.vy *= -1;
    },

    onUpdate: (fn: (value: T) => void) => {
      updateHandlers.add(fn);
      let disposed = false;
      return {
        get disposed() { return disposed; },
        dispose: () => {
          updateHandlers.delete(fn);
          disposed = true;
        }
      };
    },

    onComplete: (fn: () => void) => {
      completeHandlers.add(fn);
      let disposed = false;
      return {
        get disposed() { return disposed; },
        dispose: () => {
          completeHandlers.delete(fn);
          disposed = true;
        }
      };
    }
  };
}

/**
 * Create an orbital animation
 */
export function orbit(options: {
  centerX: number;
  centerY: number;
  radius: number;
  angle?: number;
  speed?: number;
  elliptical?: boolean;
}): Animation<{ x: number, y: number, angle: number }> {
  const startAngle = options.angle ?? 0;
  const speed = options.speed ?? 1;
  const radiusY = options.elliptical ? options.radius / 2 : options.radius;

  return animate({
    from: { angle: startAngle },
    to: { angle: startAngle + Math.PI * 2 },
    duration: (Math.PI * 2) / speed * 1000,
    easing: Easing.linear,
    repeat: 'infinite'
  }).onUpdate((value) => {
    const x = options.centerX + Math.cos(value.angle) * options.radius;
    const y = options.centerY + Math.sin(value.angle) * radiusY;
    return { x, y, angle: value.angle };
  }) as any;
}

/**
 * Create a wave animation
 */
export function wave(options: {
  amplitude: number;
  frequency: number;
  phase?: number;
  speed?: number;
}): Animation<number> {
  const phase = options.phase ?? 0;
  const speed = options.speed ?? 1;

  return animate({
    from: phase,
    to: phase + Math.PI * 2,
    duration: (Math.PI * 2) / (options.frequency * speed) * 1000,
    easing: Easing.linear,
    repeat: 'infinite'
  }).onUpdate((value) => Math.sin(value) * options.amplitude) as any;
}

/**
 * Create a morph animation between shapes
 */
export function morph<T>(options: {
  shapes: T[];
  duration: number;
  easing?: EasingFunction;
}): Animation<T> {
  const animations: Animation<T>[] = [];

  for (let i = 0; i < options.shapes.length; i++) {
    const nextIndex = (i + 1) % options.shapes.length;
    animations.push(
      animate({
        from: options.shapes[i],
        to: options.shapes[nextIndex],
        duration: options.duration / options.shapes.length,
        easing: options.easing ?? Easing.easeInOutQuad
      })
    );
  }

  return sequence(animations) as any;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a new animation engine
 */
export function createAnimationEngine(): AnimationEngine {
  return new AnimationEngineImpl();
}

/**
 * Global animation engine instance
 */
export const animationEngine = createAnimationEngine();

/**
 * Create a standard animation
 */
export function animate<T>(options: AnimationOptions<T>): Animation<T> {
  return animationEngine.animate(options);
}

/**
 * Create a spring animation
 */
export function spring<T>(options: SpringOptions<T>): Animation<T> {
  return animationEngine.spring(options);
}

/**
 * Create a sequence of animations
 */
export function sequence(animations: Animation<any>[]): Animation<void> {
  return animationEngine.sequence(animations);
}

/**
 * Create parallel animations
 */
export function parallel(animations: Animation<any>[]): Animation<void> {
  return animationEngine.parallel(animations);
}