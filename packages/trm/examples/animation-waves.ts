#!/usr/bin/env tsx
/**
 * Wave Physics Animation Example
 * Demonstrates water simulation, sine waves, and interference patterns
 */

import { ColorSystem } from '../src/core/color.js';
import { x, y, ColorDepth } from '../src/types.js';
import { TerminalImpl } from '../src/core/terminal.js';
import { BufferManagerImpl } from '../src/core/buffer.js';
import { requestAnimationFrame } from '../src/core/browser-api.js';
import {
  Easing,
  animate,
  type Animation,
  createAnimationEngine
} from '../src/advanced/animation.js';

import type { KeyEvent } from '../src/types.js';

interface WavePoint {
  height: number;
  velocity: number;
  targetHeight: number;
}

interface WaveSource {
  x: number;
  amplitude: number;
  frequency: number;
  phase: number;
  color: number; // HSL hue
  animation?: Animation<{ phase: number }>;
}

class WavePhysicsApp {
  private terminal: TerminalImpl;
  private bufferManager: BufferManagerImpl;
  private colors: ColorSystem;
  private animationEngine = createAnimationEngine();

  private width: number;
  private height: number;
  private running = true;
  private frameCount = 0;

  // Wave systems
  private waterSurface: WavePoint[] = [];
  private waveSources: WaveSource[] = [];
  private ripples: Array<{ x: number, y: number, radius: number, strength: number }> = [];

  // Physics parameters
  private tension = 0.025;
  private dampening = 0.025;
  private spread = 0.25;

  // Display modes
  private mode: 'water' | 'sine' | 'interference' | 'spring' = 'water';
  private showGrid = false;

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

    // Initialize water surface
    this.initWaterSurface();

    // Initialize wave sources for interference patterns
    this.initWaveSources();
  }

  private initWaterSurface() {
    this.waterSurface = [];
    for (let i = 0; i < this.width; i++) {
      this.waterSurface.push({
        height: 0,
        velocity: 0,
        targetHeight: 0
      });
    }
  }

  private initWaveSources() {
    this.waveSources = [
      {
        x: this.width * 0.3,
        amplitude: 5,
        frequency: 0.1,
        phase: 0,
        color: 200 // Blue
      },
      {
        x: this.width * 0.7,
        amplitude: 4,
        frequency: 0.15,
        phase: Math.PI / 2,
        color: 120 // Green
      },
      {
        x: this.width * 0.5,
        amplitude: 3,
        frequency: 0.08,
        phase: Math.PI,
        color: 280 // Purple
      }
    ];

    // Add wave animations to sources
    this.waveSources.forEach((source, index) => {
      // Create an animation for continuously changing phase
      const phaseAnim = animate({
        from: source.phase,
        to: source.phase + Math.PI * 2,
        duration: 3000 / source.frequency,
        easing: Easing.linear,
        repeat: 'infinite'
      });

      phaseAnim.onUpdate((value) => {
        source.phase = value;
      });

      phaseAnim.start();
      source.animation = phaseAnim as any;
    });
  }

  private createRipple(xPos: number) {
    this.ripples.push({
      x: xPos,
      y: Math.floor(this.height / 2),
      radius: 0,
      strength: 10
    });

    // Also create a disturbance in the water
    if (this.mode === 'water' && xPos >= 0 && xPos < this.waterSurface.length) {
      this.waterSurface[Math.floor(xPos)].velocity = 50;
    }
  }

  private updateWaterPhysics(deltaTime: number) {
    // Update water surface with spring physics
    for (let i = 0; i < this.waterSurface.length; i++) {
      const point = this.waterSurface[i];

      // Hooke's law
      const x = point.height - point.targetHeight;
      const acceleration = -this.tension * x - this.dampening * point.velocity;

      point.velocity += acceleration;
      point.height += point.velocity * deltaTime;
    }

    // Spread waves to neighbors
    const leftDeltas = new Array(this.waterSurface.length).fill(0);
    const rightDeltas = new Array(this.waterSurface.length).fill(0);

    for (let j = 0; j < 8; j++) { // Multiple passes for smoother propagation
      for (let i = 0; i < this.waterSurface.length; i++) {
        if (i > 0) {
          leftDeltas[i] = this.spread * (this.waterSurface[i].height - this.waterSurface[i - 1].height);
          this.waterSurface[i - 1].velocity += leftDeltas[i];
        }

        if (i < this.waterSurface.length - 1) {
          rightDeltas[i] = this.spread * (this.waterSurface[i].height - this.waterSurface[i + 1].height);
          this.waterSurface[i + 1].velocity += rightDeltas[i];
        }
      }

      // Apply deltas
      for (let i = 0; i < this.waterSurface.length; i++) {
        if (i > 0) {
          this.waterSurface[i - 1].height += leftDeltas[i];
        }
        if (i < this.waterSurface.length - 1) {
          this.waterSurface[i + 1].height += rightDeltas[i];
        }
      }
    }
  }

  private calculateInterference(xPos: number, yPos: number, time: number): number {
    let totalAmplitude = 0;

    this.waveSources.forEach(source => {
      const distance = Math.sqrt(
        Math.pow(xPos - source.x, 2) +
        Math.pow(yPos - this.height / 2, 2)
      );

      const wave = source.amplitude * Math.sin(
        source.frequency * distance - time * 0.1 + source.phase
      );

      totalAmplitude += wave;
    });

    return totalAmplitude;
  }

  private updateRipples(deltaTime: number) {
    this.ripples = this.ripples.filter(ripple => {
      ripple.radius += 30 * deltaTime;
      ripple.strength *= 0.95;
      return ripple.strength > 0.1 && ripple.radius < Math.max(this.width, this.height);
    });
  }

  private render() {
    const buffer = this.bufferManager.backBuffer;

    // Clear background
    buffer.clear({ bg: this.colors.rgb(10, 10, 20) });

    switch (this.mode) {
      case 'water':
        this.renderWaterSurface(buffer);
        break;
      case 'sine':
        this.renderSineWaves(buffer);
        break;
      case 'interference':
        this.renderInterferencePattern(buffer);
        break;
      case 'spring':
        this.renderSpringSystem(buffer);
        break;
    }

    // Render ripples overlay
    this.renderRipples(buffer);

    // UI overlay
    this.renderUI(buffer);

    // Flip buffers and render
    this.bufferManager.flip();
    this.bufferManager.render(this.bufferManager.frontBuffer);
  }

  private renderWaterSurface(buffer: any) {
    const waterLevel = Math.floor(this.height * 0.6);

    // Render water
    for (let col = 0; col < this.width; col++) {
      const point = this.waterSurface[col];
      const waveHeight = Math.floor(point.height);

      // Water column
      for (let row = waterLevel - waveHeight; row < this.height - 2; row++) {
        if (row < 0 || row >= this.height) continue;

        // Calculate depth-based color
        const depth = (row - waterLevel + waveHeight) / (this.height - waterLevel);
        const brightness = 60 - depth * 40;
        const saturation = 80 - depth * 20;

        // Add some variation based on wave motion
        const hue = 200 + Math.sin(this.frameCount * 0.05 + col * 0.1) * 10;

        const color = this.colors.hsl(hue, saturation, brightness);

        // Different characters for different depths
        let char = '~';
        if (row === waterLevel - waveHeight) {
          char = point.velocity > 0 ? '╱' : '╲';
        } else if (depth < 0.3) {
          char = '≈';
        } else if (depth < 0.6) {
          char = '~';
        } else {
          char = '=';
        }

        buffer.setCell(x(col), y(row), char, { fg: color });
      }

      // Surface foam
      if (Math.abs(point.velocity) > 2) {
        const foamY = waterLevel - waveHeight - 1;
        if (foamY >= 0 && foamY < this.height) {
          buffer.setCell(x(col), y(foamY), '°', {
            fg: this.colors.rgb(200, 200, 255)
          });
        }
      }
    }
  }

  private renderSineWaves(buffer: any) {
    // Render multiple sine waves with different parameters
    const waves = [
      { amp: 8, freq: 0.05, phase: 0, color: this.colors.red },
      { amp: 6, freq: 0.08, phase: Math.PI / 3, color: this.colors.green },
      { amp: 4, freq: 0.12, phase: Math.PI * 2 / 3, color: this.colors.blue },
      { amp: 10, freq: 0.03, phase: Math.PI, color: this.colors.yellow }
    ];

    waves.forEach((wave, waveIndex) => {
      for (let col = 0; col < this.width; col++) {
        const yPos = Math.floor(
          this.height / 2 +
          wave.amp * Math.sin(wave.freq * col + this.frameCount * 0.05 + wave.phase)
        );

        if (yPos >= 0 && yPos < this.height - 2) {
          const char = waveIndex === 0 ? '●' : waveIndex === 1 ? '◆' : waveIndex === 2 ? '▲' : '■';
          buffer.setCell(x(col), y(yPos), char, { fg: wave.color });
        }
      }
    });

    // Add combined wave
    for (let col = 0; col < this.width; col++) {
      let combinedY = this.height / 2;
      waves.forEach(wave => {
        combinedY += wave.amp * Math.sin(wave.freq * col + this.frameCount * 0.05 + wave.phase) * 0.3;
      });

      const yPos = Math.floor(combinedY);
      if (yPos >= 0 && yPos < this.height - 2) {
        buffer.setCell(x(col), y(yPos), '█', {
          fg: this.colors.hsl(280, 100, 70),
          bold: true
        });
      }
    }
  }

  private renderInterferencePattern(buffer: any) {
    // Render 2D interference pattern
    for (let row = 3; row < this.height - 3; row += 2) {
      for (let col = 0; col < this.width; col += 2) {
        const amplitude = this.calculateInterference(col, row, this.frameCount);

        // Map amplitude to brightness
        const normalizedAmp = (amplitude + 15) / 30; // Normalize to 0-1
        const brightness = Math.max(0, Math.min(100, normalizedAmp * 100));

        // Color based on amplitude
        const hue = (amplitude + 15) * 12; // Creates rainbow effect
        const color = this.colors.hsl(hue, 80, brightness);

        // Choose character based on amplitude
        let char = ' ';
        if (brightness > 80) char = '█';
        else if (brightness > 60) char = '▓';
        else if (brightness > 40) char = '▒';
        else if (brightness > 20) char = '░';

        buffer.setCell(x(col), y(row), char, { fg: color });
        if (col + 1 < this.width) {
          buffer.setCell(x(col + 1), y(row), char, { fg: color });
        }
      }
    }

    // Draw wave sources
    this.waveSources.forEach(source => {
      const sourceX = Math.floor(source.x);
      const sourceY = Math.floor(this.height / 2);

      if (sourceX >= 0 && sourceX < this.width && sourceY >= 0 && sourceY < this.height) {
        buffer.setCell(x(sourceX), y(sourceY), '◉', {
          fg: this.colors.hsl(source.color, 100, 90),
          bold: true
        });
      }
    });
  }

  private renderSpringSystem(buffer: any) {
    // Render vertical springs
    const springCount = 20;
    const spacing = Math.floor(this.width / springCount);

    for (let i = 0; i < springCount; i++) {
      const springX = i * spacing + spacing / 2;

      // Animate spring compression
      const compression = Math.sin(this.frameCount * 0.1 + i * 0.3) * 5;
      const springLength = 15 + compression;

      // Draw spring
      for (let j = 0; j < springLength; j++) {
        const springY = 5 + j;
        if (springY < this.height - 5) {
          const char = j % 2 === 0 ? '╱' : '╲';
          const brightness = 50 + (j / springLength) * 50;
          const color = this.colors.hsl(120 + i * 10, 60, brightness);

          buffer.setCell(x(springX), y(springY), char, { fg: color });
        }
      }

      // Draw mass at the end
      const massY = Math.floor(5 + springLength);
      if (massY < this.height - 5) {
        buffer.setCell(x(springX), y(massY), '◉', {
          fg: this.colors.hsl(30, 100, 70),
          bold: true
        });
      }
    }
  }

  private renderRipples(buffer: any) {
    this.ripples.forEach(ripple => {
      const radius = Math.floor(ripple.radius);

      // Draw ripple circle
      for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
        const rx = Math.floor(ripple.x + Math.cos(angle) * radius);
        const ry = Math.floor(ripple.y + Math.sin(angle) * radius / 2); // Elliptical for terminal aspect ratio

        if (rx >= 0 && rx < this.width && ry >= 0 && ry < this.height - 2) {
          const alpha = ripple.strength / 10;
          const color = this.colors.hsl(200, 100, 50 + alpha * 50);
          buffer.setCell(x(rx), y(ry), '·', { fg: color });
        }
      }
    });
  }

  private renderUI(buffer: any) {
    // Title
    const title = '🌊 Wave Physics Simulation 🌊';
    buffer.writeText(
      x(Math.floor((this.width - title.length) / 2)),
      y(0),
      title,
      { fg: this.colors.cyan, bold: true }
    );

    // Mode indicator
    const modes = {
      water: '💧 Water Surface',
      sine: '∿ Sine Waves',
      interference: '◈ Interference',
      spring: '⚡ Springs'
    };

    const modeText = `Mode: ${modes[this.mode]}`;
    buffer.writeText(x(2), y(this.height - 2), modeText, {
      fg: this.colors.yellow
    });

    // Physics parameters (for water mode)
    if (this.mode === 'water') {
      const params = [
        `Tension: ${this.tension.toFixed(3)}`,
        `Damping: ${this.dampening.toFixed(3)}`,
        `Spread: ${this.spread.toFixed(3)}`
      ];

      params.forEach((text, i) => {
        buffer.writeText(x(this.width - 20), y(2 + i), text, {
          fg: this.colors.gray
        });
      });
    }

    // Help
    const help = '[1-4]: Mode | [Space]: Ripple | [↑↓]: Tension | [Q]: Quit';
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
        this.mode = 'water';
        this.initWaterSurface();
        break;
      case '2':
        this.mode = 'sine';
        break;
      case '3':
        this.mode = 'interference';
        break;
      case '4':
        this.mode = 'spring';
        break;
      case ' ':
        this.createRipple(Math.random() * this.width);
        break;
      case 'ArrowUp':
        this.tension = Math.min(0.1, this.tension + 0.005);
        break;
      case 'ArrowDown':
        this.tension = Math.max(0.005, this.tension - 0.005);
        break;
      case 'ArrowLeft':
        this.dampening = Math.max(0.001, this.dampening - 0.005);
        break;
      case 'ArrowRight':
        this.dampening = Math.min(0.1, this.dampening + 0.005);
        break;
    }

    if (event.ctrl && event.key === 'c') {
      this.running = false;
    }
  }

  async run() {
    // Set up keyboard input
    this.terminal.events.on('key', (event: KeyEvent) => {
      this.handleKeyEvent(event);
    });

    // Create initial ripples
    setTimeout(() => this.createRipple(this.width * 0.3), 500);
    setTimeout(() => this.createRipple(this.width * 0.7), 1000);

    // Use requestAnimationFrame for smooth rendering
    let lastRenderTime = 0;
    const targetFrameTime = 1000 / 60; // 60 FPS
    let lastTime = performance.now();

    const animateLoop = (timestamp: number) => {
      if (!this.running) return;

      const deltaTime = Math.min((timestamp - lastTime) / 100, 0.16);
      lastTime = timestamp;

      this.frameCount++;

      // Update physics
      if (this.mode === 'water') {
        this.updateWaterPhysics(deltaTime);

        // Add random disturbances occasionally
        if (Math.random() < 0.01) {
          const idx = Math.floor(Math.random() * this.waterSurface.length);
          this.waterSurface[idx].velocity = (Math.random() - 0.5) * 20;
        }
      }

      this.updateRipples(deltaTime);

      // Throttle rendering to target FPS
      if (timestamp - lastRenderTime >= targetFrameTime) {
        this.render();
        lastRenderTime = timestamp;
      }

      // Continue loop
      requestAnimationFrame(animateLoop);
    };

    // Start animation loop
    requestAnimationFrame(animateLoop);

    // Keep process alive
    while (this.running) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async cleanup() {
    // Stop all wave source animations
    this.waveSources.forEach(source => {
      if (source.animation) {
        source.animation.stop();
      }
    });

    this.terminal.cursor.show();
    this.terminal.screen.clear();
    await this.terminal.close();
  }
}

// Main
async function main() {
  const app = new WavePhysicsApp();

  try {
    await app.init();
    await app.run();
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await app.cleanup();
    console.log('\nWave physics demo ended');
  }
}

main().catch(console.error);