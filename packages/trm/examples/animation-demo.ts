#!/usr/bin/env tsx
/**
 * TRM Animation Demo
 * Demonstrates the advanced animation capabilities of TRM
 */

import { ColorSystem } from '../src/core/color.js';
import { x, y, ColorDepth } from '../src/types.js';
import { TerminalImpl } from '../src/core/terminal.js';
import { BufferManagerImpl } from '../src/core/buffer.js';
import { requestAnimationFrame } from '../src/core/browser-api.js';
import {
  spring,
  Easing,
  animate,
  sequence,
  parallel,
  type Animation,
  createAnimationEngine
} from '../src/advanced/animation.js';

import type { KeyEvent } from '../src/types.js';

interface AnimatedObject {
  x: number;
  y: number;
  color: number;
  size: number;
  rotation: number;
  opacity: number;
  char: string;
}

class AnimationDemo {
  private terminal: TerminalImpl;
  private bufferManager: BufferManagerImpl;
  private colors: ColorSystem;
  private animationEngine = createAnimationEngine();

  private width: number;
  private height: number;
  private running = true;
  private frameCount = 0;

  // Animation examples
  private bouncingBall: AnimatedObject;
  private springBox: AnimatedObject;
  private orbitingDots: AnimatedObject[] = [];
  private morphingShape: AnimatedObject;
  private particles: AnimatedObject[] = [];

  // Active animations
  private animations: Animation<any>[] = [];
  private currentDemo = 0;
  private demos = [
    'Easing Functions',
    'Spring Physics',
    'Sequence & Parallel',
    'Particle System',
    'Complex Choreography'
  ];

  constructor() {
    this.terminal = new TerminalImpl({
      mode: 'fullscreen',
      alternateBuffer: true,
      rawMode: true,
      keyboard: true,
      cursorHidden: true
    });

    this.colors = new ColorSystem(ColorDepth.TrueColor);
    this.width = 0;
    this.height = 0;

    // Initialize animated objects
    this.bouncingBall = {
      x: 10,
      y: 5,
      color: 0,
      size: 1,
      rotation: 0,
      opacity: 1,
      char: '●'
    };

    this.springBox = {
      x: 30,
      y: 10,
      color: 120,
      size: 3,
      rotation: 0,
      opacity: 1,
      char: '■'
    };

    this.morphingShape = {
      x: 50,
      y: 15,
      color: 240,
      size: 5,
      rotation: 0,
      opacity: 1,
      char: '◆'
    };
  }

  async init() {
    await this.terminal.init();

    this.width = this.terminal.stream.cols;
    this.height = this.terminal.stream.rows;

    this.bufferManager = new BufferManagerImpl(this.terminal.stream);
    this.terminal.cursor.hide();
    this.terminal.screen.clear();

    // Initialize orbiting dots
    for (let i = 0; i < 8; i++) {
      this.orbitingDots.push({
        x: this.width / 2,
        y: this.height / 2,
        color: i * 45,
        size: 1,
        rotation: (i / 8) * Math.PI * 2,
        opacity: 1,
        char: '○'
      });
    }

    // Start the first demo
    this.startDemo(0);
  }

  private stopAllAnimations() {
    this.animations.forEach(anim => anim.stop());
    this.animations = [];
  }

  private startDemo(index: number) {
    this.stopAllAnimations();
    this.currentDemo = index;

    // eslint-disable-next-line default-case
    switch (index) {
      case 0:
        this.startEasingDemo();
        break;
      case 1:
        this.startSpringDemo();
        break;
      case 2:
        this.startSequenceDemo();
        break;
      case 3:
        this.startParticleDemo();
        break;
      case 4:
        this.startChoreographyDemo();
        break;
    }
  }

  private startEasingDemo() {
    // Demonstrate different easing functions
    const easingFunctions = [
      { name: 'linear', easing: Easing.linear },
      { name: 'easeInOutQuad', easing: Easing.easeInOutQuad },
      { name: 'easeInOutCubic', easing: Easing.easeInOutCubic },
      { name: 'easeInOutElastic', easing: Easing.easeInOutElastic },
      { name: 'easeOutBounce', easing: Easing.easeOutBounce }
    ];

    easingFunctions.forEach((func, index) => {
      const ball = {
        x: 5,
        y: 5 + index * 3,
        color: index * 60,
        size: 1,
        rotation: 0,
        opacity: 1,
        char: '●'
      };

      const anim = animate({
        from: { x: 5 },
        to: { x: this.width - 10 },
        duration: 3000,
        easing: func.easing,
        repeat: 'infinite',
        yoyo: true
      });

      anim.onUpdate((value) => {
        ball.x = value.x;
      });

      anim.start();
      this.animations.push(anim);

      // Store ball for rendering
      if (!this.particles[index]) {
        this.particles[index] = ball;
      }
    });
  }

  private startSpringDemo() {
    // Spring physics animations
    const springConfigs = [
      { stiffness: 200, damping: 10 },  // Tight spring
      { stiffness: 50, damping: 5 },    // Loose spring
      { stiffness: 100, damping: 20 },  // Overdamped
      { stiffness: 150, damping: 2 }    // Underdamped
    ];

    springConfigs.forEach((config, index) => {
      const box = {
        x: 10 + index * 15,
        y: this.height / 2,
        color: 120 + index * 30,
        size: 2,
        rotation: 0,
        opacity: 1,
        char: '◼'
      };

      const anim = spring({
        from: { y: 5 },
        to: { y: this.height - 5 },
        stiffness: config.stiffness,
        damping: config.damping,
        mass: 1,
        velocity: 0
      });

      anim.onUpdate((value) => {
        box.y = value.y;
      });

      anim.start();
      this.animations.push(anim);

      // Store box for rendering
      if (!this.particles[index]) {
        this.particles[index] = box;
      }

      // Restart animation when complete
      anim.onComplete(() => {
        setTimeout(() => {
          anim.reverse();
          anim.start();
        }, 500);
      });
    });
  }

  private startSequenceDemo() {
    // Create a sequence of animations
    const sequenceTarget = {
      x: 10,
      y: 10,
      color: 0,
      size: 3,
      rotation: 0,
      opacity: 1,
      char: '★'
    };

    this.particles[0] = sequenceTarget;

    const moveRight = animate({
      from: { x: 10 },
      to: { x: this.width - 10 },
      duration: 1000,
      easing: Easing.easeInOutQuad
    });

    const moveDown = animate({
      from: { y: 10 },
      to: { y: this.height - 5 },
      duration: 1000,
      easing: Easing.easeInOutQuad
    });

    const changeColor = animate({
      from: { color: 0 },
      to: { color: 360 },
      duration: 2000,
      easing: Easing.linear
    });

    const grow = animate({
      from: { size: 3 },
      to: { size: 8 },
      duration: 500,
      easing: Easing.easeOutElastic
    });

    const shrink = animate({
      from: { size: 8 },
      to: { size: 3 },
      duration: 500,
      easing: Easing.easeInElastic
    });

    // Update handlers
    moveRight.onUpdate((value) => {
      sequenceTarget.x = value.x;
    });

    moveDown.onUpdate((value) => {
      sequenceTarget.y = value.y;
    });

    changeColor.onUpdate((value) => {
      sequenceTarget.color = value.color;
    });

    grow.onUpdate((value) => {
      sequenceTarget.size = value.size;
    });

    shrink.onUpdate((value) => {
      sequenceTarget.size = value.size;
    });

    // Create sequence
    const seq = sequence([moveRight, moveDown, grow, shrink]);

    // Also run color change in parallel
    const combined = parallel([seq, changeColor]);

    combined.onComplete(() => {
      // Restart
      setTimeout(() => {
        sequenceTarget.x = 10;
        sequenceTarget.y = 10;
        sequenceTarget.color = 0;
        this.startSequenceDemo();
      }, 1000);
    });

    combined.start();
    this.animations.push(combined);
  }

  private startParticleDemo() {
    // Create particle system with various animations
    this.particles = [];

    for (let i = 0; i < 20; i++) {
      const particle = {
        x: this.width / 2,
        y: this.height / 2,
        color: Math.random() * 360,
        size: 1,
        rotation: 0,
        opacity: 1,
        char: ['✦', '✧', '✨', '✩', '✪'][Math.floor(Math.random() * 5)]
      };

      this.particles.push(particle);

      // Random target position
      const targetX = Math.random() * (this.width - 10) + 5;
      const targetY = Math.random() * (this.height - 5) + 3;

      // Animate to target with spring physics
      const moveAnim = spring({
        from: { x: particle.x, y: particle.y },
        to: { x: targetX, y: targetY },
        stiffness: 50 + Math.random() * 150,
        damping: 5 + Math.random() * 15,
        mass: 0.5 + Math.random() * 2
      });

      const colorAnim = animate({
        from: { color: particle.color },
        to: { color: (particle.color + 180) % 360 },
        duration: 2000 + Math.random() * 3000,
        easing: Easing.easeInOutSine,
        repeat: 'infinite',
        yoyo: true
      });

      moveAnim.onUpdate((value) => {
        particle.x = value.x;
        particle.y = value.y;
      });

      colorAnim.onUpdate((value) => {
        particle.color = value.color;
      });

      moveAnim.start();
      colorAnim.start();

      this.animations.push(moveAnim);
      this.animations.push(colorAnim);

      // Respawn particle when spring settles
      moveAnim.onComplete(() => {
        setTimeout(() => {
          particle.x = this.width / 2;
          particle.y = this.height / 2;
          this.startParticleAnimation(particle);
        }, Math.random() * 2000);
      });
    }
  }

  private startParticleAnimation(particle: AnimatedObject) {
    const targetX = Math.random() * (this.width - 10) + 5;
    const targetY = Math.random() * (this.height - 5) + 3;

    const moveAnim = spring({
      from: { x: particle.x, y: particle.y },
      to: { x: targetX, y: targetY },
      stiffness: 50 + Math.random() * 150,
      damping: 5 + Math.random() * 15,
      mass: 0.5 + Math.random() * 2
    });

    moveAnim.onUpdate((value) => {
      particle.x = value.x;
      particle.y = value.y;
    });

    moveAnim.onComplete(() => {
      setTimeout(() => {
        particle.x = this.width / 2;
        particle.y = this.height / 2;
        this.startParticleAnimation(particle);
      }, Math.random() * 2000);
    });

    moveAnim.start();
    this.animations.push(moveAnim);
  }

  private startChoreographyDemo() {
    // Complex choreographed animation
    this.particles = [];

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const radius = Math.min(this.width, this.height) / 3;

    // Create circle of objects
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const particle = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius / 2,
        color: i * 30,
        size: 2,
        rotation: angle,
        opacity: 1,
        char: '◆'
      };

      this.particles.push(particle);

      // Orbital animation
      const orbitAnim = animate({
        from: { rotation: angle },
        to: { rotation: angle + Math.PI * 2 },
        duration: 5000,
        easing: Easing.linear,
        repeat: 'infinite'
      });

      // Pulse animation
      const pulseAnim = animate({
        from: { size: 2 },
        to: { size: 4 },
        duration: 1000,
        easing: Easing.easeInOutSine,
        repeat: 'infinite',
        yoyo: true
      });

      // Color cycle
      const colorAnim = animate({
        from: { color: i * 30 },
        to: { color: (i * 30 + 360) },
        duration: 3000,
        easing: Easing.linear,
        repeat: 'infinite'
      });

      orbitAnim.onUpdate((value) => {
        particle.rotation = value.rotation;
        particle.x = centerX + Math.cos(value.rotation) * radius;
        particle.y = centerY + Math.sin(value.rotation) * radius / 2;
      });

      pulseAnim.onUpdate((value) => {
        particle.size = value.size;
      });

      colorAnim.onUpdate((value) => {
        particle.color = value.color % 360;
      });

      // Start with delay for wave effect
      setTimeout(() => {
        orbitAnim.start();
        pulseAnim.start();
        colorAnim.start();

        this.animations.push(orbitAnim);
        this.animations.push(pulseAnim);
        this.animations.push(colorAnim);
      }, i * 100);
    }
  }

  private render() {
    const buffer = this.bufferManager.backBuffer;

    // Clear with stable background (no random stars)
    buffer.clear({ bg: this.colors.rgb(10, 10, 20) });

    // Draw UI
    this.drawUI(buffer);

    // Render particles
    this.particles.forEach(particle => {
      if (!particle) return;

      const px = Math.floor(particle.x);
      const py = Math.floor(particle.y);

      if (px >= 0 && px < this.width && py >= 0 && py < this.height - 2) {
        // Draw based on size
        const size = Math.floor(particle.size);

        if (size <= 1) {
          buffer.setCell(x(px), y(py), particle.char, {
            fg: this.colors.hsl(particle.color, 100, 70),
            bold: true
          });
        } else {
          // Draw larger object
          for (let dx = -Math.floor(size / 2); dx <= Math.floor(size / 2); dx++) {
            for (let dy = -Math.floor(size / 4); dy <= Math.floor(size / 4); dy++) {
              const cx = px + dx;
              const cy = py + dy;

              if (cx >= 0 && cx < this.width && cy >= 0 && cy < this.height - 2) {
                buffer.setCell(x(cx), y(cy), particle.char, {
                  fg: this.colors.hsl(particle.color, 100, 70 - Math.abs(dx) * 10),
                  bold: dx === 0 && dy === 0
                });
              }
            }
          }
        }
      }
    });

    // Render frame counter
    this.frameCount++;

    // Use double buffering properly
    this.bufferManager.flip();
    this.bufferManager.render(this.bufferManager.frontBuffer);
  }

  private drawUI(buffer: any) {
    // Title
    const title = `✨ TRM Advanced Animation Demo ✨`;
    buffer.writeText(
      x(Math.floor((this.width - title.length) / 2)),
      y(0),
      title,
      { fg: this.colors.yellow, bold: true }
    );

    // Current demo
    const demoText = `Demo: ${this.demos[this.currentDemo]}`;
    buffer.writeText(x(2), y(1), demoText, {
      fg: this.colors.cyan
    });

    // Active animations
    buffer.writeText(x(this.width - 25), y(1), `Active: ${this.animations.length} animations`, {
      fg: this.colors.white
    });

    // Help
    const help = '[1-5]: Switch Demo | [Space]: Restart | [Q]: Quit';
    buffer.writeText(
      x(Math.floor((this.width - help.length) / 2)),
      y(this.height - 1),
      help,
      { fg: this.colors.gray }
    );

    // Demo descriptions
    const descriptions = [
      'Various easing functions with horizontal movement',
      'Spring physics with different stiffness and damping',
      'Sequential and parallel animation composition',
      'Particle system with spring-based movement',
      'Complex choreographed orbital animations'
    ];

    buffer.writeText(x(2), y(2), descriptions[this.currentDemo], {
      fg: this.colors.gray,
      italic: true
    });
  }

  private handleKeyEvent(event: KeyEvent) {
    switch (event.key) {
      case 'q':
      case 'Q':
        this.running = false;
        break;
      case '1':
        this.startDemo(0);
        break;
      case '2':
        this.startDemo(1);
        break;
      case '3':
        this.startDemo(2);
        break;
      case '4':
        this.startDemo(3);
        break;
      case '5':
        this.startDemo(4);
        break;
      case ' ':
        // Restart current demo
        this.startDemo(this.currentDemo);
        break;
    }

    if (event.ctrl && event.key === 'c') {
      this.running = false;
    }
  }

  async run() {
    // Use requestAnimationFrame for smooth rendering
    let lastRenderTime = 0;
    const targetFrameTime = 1000 / 60; // 60 FPS

    // Set up input handlers
    this.terminal.events.on('key', (event: KeyEvent) => {
      this.handleKeyEvent(event);
    });

    // Animation loop
    const animate = (timestamp: number) => {
      if (!this.running) return;

      // Throttle rendering to target FPS
      if (timestamp - lastRenderTime >= targetFrameTime) {
        this.render();
        lastRenderTime = timestamp;
      }

      // Continue loop
      requestAnimationFrame(animate);
    };

    // Start animation loop
    requestAnimationFrame(animate);

    // Keep process alive
    while (this.running) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async cleanup() {
    this.stopAllAnimations();
    this.terminal.cursor.show();
    this.terminal.screen.clear();
    await this.terminal.close();
  }
}

// Main
async function main() {
  const app = new AnimationDemo();

  try {
    await app.init();
    await app.run();
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await app.cleanup();
    console.log('\nAnimation demo ended');
  }
}

main().catch(console.error);