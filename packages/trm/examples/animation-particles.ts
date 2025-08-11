#!/usr/bin/env tsx
/**
 * Particle System Animation Example
 * Demonstrates complex particle physics with gravity, collision, and trails
 */

import { ColorSystem } from '../src/core/color.js';
import { x, y, ColorDepth } from '../src/types.js';
import { TerminalImpl } from '../src/core/terminal.js';
import { BufferManagerImpl } from '../src/core/buffer.js';
import { requestAnimationFrame } from '../src/core/browser-api.js';
import { 
  spring, 
  physics, 
  type Animation,
  type PhysicsBody,
  createAnimationEngine 
} from '../src/advanced/animation.js';

import type { KeyEvent } from '../src/types.js';

// Particle system types
interface Particle extends PhysicsBody {
  life: number;
  maxLife: number;
  color: number; // HSL hue
  size: number;
  trail: Array<{x: number, y: number, alpha: number}>;
  animation?: Animation<Particle>;
}

interface FireworkParticle extends Particle {
  generation: number;
  exploded: boolean;
}

class ParticleSystemApp {
  private terminal: TerminalImpl;
  private bufferManager: BufferManagerImpl;
  private colors: ColorSystem;
  private animationEngine = createAnimationEngine();
  
  private width: number;
  private height: number;
  private running = true;
  private frameCount = 0;
  
  // Particle systems
  private rainParticles: Particle[] = [];
  private starParticles: Particle[] = [];
  private fireworkParticles: FireworkParticle[] = [];
  private smokeParticles: Particle[] = [];
  
  // Animation modes
  private mode: 'rain' | 'stars' | 'fireworks' | 'smoke' = 'fireworks';
  
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
  }
  
  async init() {
    await this.terminal.init();
    
    this.width = this.terminal.stream.cols;
    this.height = this.terminal.stream.rows;
    
    this.bufferManager = new BufferManagerImpl(this.terminal.stream);
    this.terminal.cursor.hide();
    this.terminal.screen.clear();
    
    // Initialize particle systems
    this.initStars();
  }
  
  private initStars() {
    // Create static stars
    for (let i = 0; i < 50; i++) {
      this.starParticles.push({
        x: Math.random() * this.width,
        y: Math.random() * (this.height - 5),
        vx: 0,
        vy: 0,
        life: 1,
        maxLife: 1,
        color: 60, // Yellow-ish
        size: Math.random() > 0.8 ? 2 : 1,
        trail: []
      });
    }
  }
  
  private createRainDrop() {
    const drop: Particle = {
      x: Math.random() * this.width,
      y: 0,
      vx: (Math.random() - 0.5) * 0.5,
      vy: 5 + Math.random() * 3,
      life: 1,
      maxLife: 1,
      color: 200, // Blue
      size: 1,
      trail: [],
      mass: 0.1,
      elasticity: 0.2
    };
    
    // Create physics animation for rain drop
    drop.animation = physics(drop, {
      gravity: 0.3,
      friction: 0.999,
      bounds: { x: 0, y: 0, width: this.width, height: this.height }
    });
    
    drop.animation.onUpdate((updated) => {
      Object.assign(drop, updated);
    });
    
    drop.animation.start();
    this.rainParticles.push(drop);
  }
  
  private createFirework() {
    // Launch firework from bottom
    const startX = 10 + Math.random() * (this.width - 20);
    
    const firework: FireworkParticle = {
      x: startX,
      y: this.height - 2,
      vx: (Math.random() - 0.5) * 2,
      vy: -12 - Math.random() * 5,
      life: 1,
      maxLife: 1,
      color: Math.random() * 360,
      size: 2,
      trail: [],
      generation: 0,
      exploded: false,
      mass: 1,
      elasticity: 0.5
    };
    
    // Create upward animation
    const launchAnim = spring({
      from: { y: firework.y },
      to: { y: Math.random() * (this.height / 2) + 5 },
      stiffness: 50,
      damping: 8,
      velocity: -20
    });
    
    launchAnim.onUpdate((value) => {
      firework.y = value.y;
      
      // Add trail point
      if (firework.trail.length < 10) {
        firework.trail.push({ x: firework.x, y: firework.y, alpha: 1 });
      }
    });
    
    launchAnim.onComplete(() => {
      if (!firework.exploded) {
        this.explodeFirework(firework);
        firework.exploded = true;
      }
    });
    
    launchAnim.start();
    firework.animation = launchAnim as any;
    
    this.fireworkParticles.push(firework);
  }
  
  private explodeFirework(parent: FireworkParticle) {
    const particleCount = 30 + Math.floor(Math.random() * 20);
    const baseHue = parent.color;
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const speed = 3 + Math.random() * 4;
      const hueVariation = (Math.random() - 0.5) * 30;
      
      this.fireworkParticles.push({
        x: parent.x,
        y: parent.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        color: (baseHue + hueVariation + 360) % 360,
        size: 1,
        trail: [],
        generation: parent.generation + 1,
        exploded: true
      });
    }
  }
  
  private createSmoke(x: number, y: number) {
    for (let i = 0; i < 3; i++) {
      this.smokeParticles.push({
        x: x + (Math.random() - 0.5) * 2,
        y,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -0.5 - Math.random() * 0.5,
        life: 1,
        maxLife: 1,
        color: 0, // Gray scale
        size: 2,
        trail: []
      });
    }
  }
  
  private updateParticles(deltaTime: number) {
    // Update rain
    if (this.mode === 'rain') {
      // Create new rain drops
      if (Math.random() < 0.8) {
        this.createRainDrop();
      }
      
      // Update rain particles
      this.rainParticles = this.rainParticles.filter(p => {
        p.y += p.vy * deltaTime;
        p.x += p.vx * deltaTime;
        p.vy += 0.3; // Gravity
        
        // Create splash when hitting ground
        if (p.y >= this.height - 2) {
          this.createSmoke(p.x, p.y);
          return false;
        }
        
        return p.y < this.height && p.x >= 0 && p.x < this.width;
      });
    }
    
    // Update fireworks
    if (this.mode === 'fireworks') {
      // Launch new firework occasionally
      if (Math.random() < 0.02) {
        this.createFirework();
      }
      
      // Update firework particles
      this.fireworkParticles = this.fireworkParticles.filter(p => {
        // Add trail point
        if (p.trail.length < 10) {
          p.trail.push({ x: p.x, y: p.y, alpha: 1 });
        }
        
        // Update trail
        p.trail = p.trail.map(t => ({ ...t, alpha: t.alpha * 0.9 }))
                        .filter(t => t.alpha > 0.1);
        
        // Update position
        p.x += p.vx * deltaTime;
        p.y += p.vy * deltaTime;
        
        // Apply gravity
        p.vy += 0.4;
        
        // Apply air resistance
        p.vx *= 0.99;
        p.vy *= 0.99;
        
        // Explode at apex (generation 0 only)
        if (p.generation === 0 && !p.exploded && p.vy > 0) {
          this.explodeFirework(p);
          p.exploded = true;
          return false;
        }
        
        // Fade out exploded particles
        if (p.generation > 0) {
          p.life -= 0.02;
        }
        
        return p.life > 0 && p.y < this.height && p.x >= 0 && p.x < this.width;
      });
    }
    
    // Update smoke
    this.smokeParticles = this.smokeParticles.filter(p => {
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.life -= 0.02;
      p.size = Math.max(1, p.size * 1.02); // Expand
      
      return p.life > 0 && p.y > 0;
    });
    
    // Twinkle stars
    this.starParticles.forEach(star => {
      star.life = 0.5 + Math.sin(this.frameCount * 0.05 + star.x * 0.1) * 0.5;
    });
  }
  
  private render() {
    const buffer = this.bufferManager.backBuffer;
    
    // Clear with gradient background (night sky)
    for (let row = 0; row < this.height; row++) {
      const brightness = Math.max(0, 20 - row * 0.5);
      const bgColor = this.colors.rgb(0, 0, brightness);
      
      for (let col = 0; col < this.width; col++) {
        buffer.setCell(x(col), y(row), ' ', { bg: bgColor });
      }
    }
    
    // Render stars (background layer)
    this.starParticles.forEach(star => {
      const char = star.size > 1 ? '✦' : '·';
      const alpha = star.life;
      const color = this.colors.hsl(star.color, 20, 50 + alpha * 50);
      
      if (star.x >= 0 && star.x < this.width && star.y >= 0 && star.y < this.height) {
        buffer.setCell(
          x(Math.floor(star.x)),
          y(Math.floor(star.y)),
          char,
          { fg: color }
        );
      }
    });
    
    // Render rain
    this.rainParticles.forEach(drop => {
      const color = this.colors.hsl(drop.color, 80, 60);
      
      if (drop.x >= 0 && drop.x < this.width && drop.y >= 0 && drop.y < this.height) {
        buffer.setCell(
          x(Math.floor(drop.x)),
          y(Math.floor(drop.y)),
          '│',
          { fg: color }
        );
      }
    });
    
    // Render fireworks with trails
    this.fireworkParticles.forEach(fw => {
      // Render trail
      fw.trail.forEach(point => {
        if (point.x >= 0 && point.x < this.width && 
            point.y >= 0 && point.y < this.height) {
          const trailColor = this.colors.hsl(fw.color, 50, 30 * point.alpha);
          buffer.setCell(
            x(Math.floor(point.x)),
            y(Math.floor(point.y)),
            '·',
            { fg: trailColor }
          );
        }
      });
      
      // Render particle
      if (fw.x >= 0 && fw.x < this.width && fw.y >= 0 && fw.y < this.height) {
        const char = fw.generation === 0 ? '◉' : '✦';
        const brightness = 50 + fw.life * 50;
        const saturation = fw.generation === 0 ? 100 : 80;
        const color = this.colors.hsl(fw.color, saturation, brightness);
        
        buffer.setCell(
          x(Math.floor(fw.x)),
          y(Math.floor(fw.y)),
          char,
          { fg: color, bold: fw.generation === 0 }
        );
      }
    });
    
    // Render smoke
    this.smokeParticles.forEach(smoke => {
      if (smoke.x >= 0 && smoke.x < this.width && 
          smoke.y >= 0 && smoke.y < this.height) {
        const gray = Math.floor(30 * smoke.life);
        const color = this.colors.rgb(gray, gray, gray);
        const chars = ['◦', '○', '◯'];
        const char = chars[Math.min(2, Math.floor(smoke.size))];
        
        buffer.setCell(
          x(Math.floor(smoke.x)),
          y(Math.floor(smoke.y)),
          char,
          { fg: color }
        );
      }
    });
    
    // UI overlay
    this.renderUI(buffer);
    
    // Flip buffers and render
    this.bufferManager.flip();
    this.bufferManager.render(this.bufferManager.frontBuffer);
  }
  
  private renderUI(buffer: any) {
    // Title
    const title = '✨ Particle System Animation ✨';
    buffer.writeText(
      x(Math.floor((this.width - title.length) / 2)),
      y(1),
      title,
      { fg: this.colors.yellow, bold: true }
    );
    
    // Mode indicator
    const modeText = `Mode: ${this.mode.toUpperCase()}`;
    buffer.writeText(x(2), y(this.height - 3), modeText, {
      fg: this.colors.cyan
    });
    
    // Particle counts
    const counts = [
      `Fireworks: ${this.fireworkParticles.length}`,
      `Rain: ${this.rainParticles.length}`,
      `Smoke: ${this.smokeParticles.length}`,
      `FPS: ${Math.round(1000 / 16)}`
    ];
    
    counts.forEach((text, i) => {
      buffer.writeText(x(this.width - 20), y(2 + i), text, {
        fg: this.colors.gray
      });
    });
    
    // Help
    const help = '[1-4]: Change Mode | [Space]: Clear | [Q]: Quit';
    buffer.writeText(
      x(Math.floor((this.width - help.length) / 2)),
      y(this.height - 1),
      help,
      { fg: this.colors.gray }
    );
  }
  
  private handleKeyEvent(event: KeyEvent) {
    switch (event.key) {
      case 'q':
      case 'Q':
        this.running = false;
        break;
      case '1':
        this.mode = 'rain';
        this.clearParticles();
        break;
      case '2':
        this.mode = 'stars';
        this.clearParticles();
        break;
      case '3':
        this.mode = 'fireworks';
        this.clearParticles();
        break;
      case '4':
        this.mode = 'smoke';
        this.clearParticles();
        break;
      case ' ':
        this.clearParticles();
        break;
    }
    
    if (event.ctrl && event.key === 'c') {
      this.running = false;
    }
  }
  
  private clearParticles() {
    this.rainParticles = [];
    this.fireworkParticles = [];
    this.smokeParticles = [];
  }
  
  async run() {
    // Set up keyboard input
    this.terminal.events.on('key', (event: KeyEvent) => {
      this.handleKeyEvent(event);
    });
    
    // Use requestAnimationFrame for smooth rendering
    let lastRenderTime = 0;
    const targetFrameTime = 1000 / 60; // 60 FPS
    let lastTime = performance.now();
    
    const animate = (timestamp: number) => {
      if (!this.running) return;
      
      const deltaTime = Math.min((timestamp - lastTime) / 100, 0.16);
      lastTime = timestamp;
      
      this.frameCount++;
      this.updateParticles(deltaTime);
      
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
    // Stop all particle animations
    [...this.rainParticles, ...this.fireworkParticles, ...this.smokeParticles].forEach(p => {
      if (p.animation) {
        p.animation.stop();
      }
    });
    
    this.terminal.cursor.show();
    this.terminal.screen.clear();
    await this.terminal.close();
  }
}

// Main
async function main() {
  const app = new ParticleSystemApp();
  
  try {
    await app.init();
    await app.run();
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await app.cleanup();
    console.log('\nParticle animation demo ended');
  }
}

main().catch(console.error);