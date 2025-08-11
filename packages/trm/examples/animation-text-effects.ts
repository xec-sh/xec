#!/usr/bin/env tsx
/**
 * Text Effects and Transitions Animation Example
 * Demonstrates typewriter, matrix rain, glitch effects, and smooth text transitions
 */

import { TerminalImpl } from '../src/core/terminal.js';
import { BufferManagerImpl } from '../src/core/buffer.js';
import { ColorSystem } from '../src/core/color.js';
import { requestAnimationFrame } from '../src/core/browser-api.js';
import { 
  animate, 
  spring, 
  physics,
  morph as morphAnimation,
  Easing, 
  parallel, 
  sequence,
  createAnimationEngine,
  type Animation,
  type PhysicsBody
} from '../src/advanced/animation.js';
import { x, y, cols, rows, ColorDepth } from '../src/types.js';
import type { Style, KeyEvent } from '../src/types.js';

interface TextParticle extends PhysicsBody {
  char: string;
  targetX: number;
  targetY: number;
  color: number;
  opacity: number;
  scale: number;
  rotation: number;
  animation?: Animation<TextParticle>;
}

interface MatrixColumn {
  x: number;
  y: number;
  speed: number;
  length: number;
  chars: string[];
}

class TextEffectsApp {
  private terminal: TerminalImpl;
  private bufferManager: BufferManagerImpl;
  private colors: ColorSystem;
  private animationEngine = createAnimationEngine();
  
  private width: number;
  private height: number;
  private running = true;
  private frameCount = 0;
  
  // Text effects state
  private currentEffect: 'typewriter' | 'matrix' | 'glitch' | 'morph' | 'explode' = 'matrix';
  private textParticles: TextParticle[] = [];
  private matrixColumns: MatrixColumn[] = [];
  
  // Animation state
  private typewriterIndex = 0;
  private typewriterText = '';
  private glitchIntensity = 0;
  private morphProgress = 0;
  
  // Sample texts
  private sampleTexts = [
    'Welcome to the Terminal Animation Demo!',
    'Text can flow like water...',
    'Or explode into particles!',
    'The Matrix has you...',
    'Follow the white rabbit 🐰'
  ];
  private currentTextIndex = 0;
  
  // Animations
  private currentAnimation?: Animation<any>;
  
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
    
    // Initialize effects
    this.initMatrixRain();
    this.typewriterText = this.sampleTexts[0];
  }
  
  private initMatrixRain() {
    this.matrixColumns = [];
    const columnCount = Math.floor(this.width / 2);
    
    for (let i = 0; i < columnCount; i++) {
      this.matrixColumns.push({
        x: i * 2 + Math.floor(Math.random() * 2),
        y: Math.floor(Math.random() * this.height),
        speed: 0.3 + Math.random() * 0.7,
        length: 5 + Math.floor(Math.random() * 15),
        chars: this.generateMatrixChars(20)
      });
    }
  }
  
  private generateMatrixChars(count: number): string[] {
    const matrixChars = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const chars: string[] = [];
    
    for (let i = 0; i < count; i++) {
      chars.push(matrixChars[Math.floor(Math.random() * matrixChars.length)]);
    }
    
    return chars;
  }
  
  private createTextParticles(text: string, centerX: number, centerY: number) {
    this.textParticles = [];
    const charWidth = 2;
    const startX = centerX - (text.length * charWidth) / 2;
    
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ') continue;
      
      this.textParticles.push({
        char: text[i],
        x: startX + i * charWidth,
        y: centerY,
        targetX: startX + i * charWidth,
        targetY: centerY,
        vx: 0,
        vy: 0,
        mass: 1,
        elasticity: 0.6,
        color: Math.random() * 360,
        opacity: 1,
        scale: 1,
        rotation: 0
      });
    }
  }
  
  private async animateTypewriter() {
    const text = this.sampleTexts[this.currentTextIndex];
    this.typewriterText = '';
    this.typewriterIndex = 0;
    
    // Create typewriter animation
    this.currentAnimation = animate({
      from: 0,
      to: text.length,
      duration: text.length * 50,
      easing: Easing.linear
    });
    
    this.currentAnimation.onUpdate((value) => {
      this.typewriterIndex = Math.floor(value);
      this.typewriterText = text.substring(0, this.typewriterIndex);
    });
    
    await this.currentAnimation.start();
  }
  
  private async animateGlitch() {
    // Create glitch intensity animation
    const glitchIn = animate({
      from: 0,
      to: 1,
      duration: 200,
      easing: Easing.easeInOutQuad
    });
    
    const glitchOut = animate({
      from: 1,
      to: 0,
      duration: 200,
      easing: Easing.easeInOutQuad
    });
    
    glitchIn.onUpdate((value) => {
      this.glitchIntensity = value;
    });
    
    glitchOut.onUpdate((value) => {
      this.glitchIntensity = value;
    });
    
    this.currentAnimation = sequence([glitchIn, glitchOut]);
    await this.currentAnimation.start();
  }
  
  private async animateExplode() {
    const text = this.sampleTexts[this.currentTextIndex];
    const centerX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    
    this.createTextParticles(text, centerX, centerY);
    
    // Explode particles
    this.textParticles.forEach(particle => {
      const angle = Math.random() * Math.PI * 2;
      const force = 10 + Math.random() * 20;
      
      particle.vx = Math.cos(angle) * force;
      particle.vy = Math.sin(angle) * force;
      particle.mass = 1;
      particle.elasticity = 0.6;
    });
    
    // Animate particles back with spring physics
    const animations = this.textParticles.map(particle => {
      return parallel([
        spring({
          from: { x: particle.x, y: particle.y },
          to: { x: particle.targetX, y: particle.targetY },
          stiffness: 50,
          damping: 10,
          mass: 1
        }),
        animate({
          from: 0,
          to: 360,
          duration: 2000,
          easing: Easing.easeInOutQuad
        })
      ]);
    });
    
    this.currentAnimation = parallel(animations);
  }
  
  private async animateMorph() {
    const fromText = this.sampleTexts[this.currentTextIndex];
    const toText = this.sampleTexts[(this.currentTextIndex + 1) % this.sampleTexts.length];
    
    // Create morph animation
    this.currentAnimation = animate({
      from: 0,
      to: 1,
      duration: 2000,
      easing: Easing.easeInOutCubic
    });
    
    this.currentAnimation.onUpdate((value) => {
      this.morphProgress = value;
    });
    
    await this.currentAnimation.start();
    this.currentTextIndex = (this.currentTextIndex + 1) % this.sampleTexts.length;
  }
  
  private updateEffects(deltaTime: number) {
    // Update matrix rain
    if (this.currentEffect === 'matrix') {
      this.matrixColumns.forEach(column => {
        column.y += column.speed;
        
        // Reset column when it goes off screen
        if (column.y > this.height + column.length) {
          column.y = -column.length;
          column.x = Math.floor(Math.random() * this.width);
          column.chars = this.generateMatrixChars(column.length);
        }
        
        // Randomly change characters
        if (Math.random() < 0.05) {
          const idx = Math.floor(Math.random() * column.chars.length);
          column.chars[idx] = this.generateMatrixChars(1)[0];
        }
      });
    }
    
    // Update exploding particles
    if (this.currentEffect === 'explode') {
      this.textParticles.forEach(particle => {
        // Apply physics
        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;
        
        // Apply gravity
        particle.vy += 9.8 * deltaTime;
        
        // Apply drag
        particle.vx *= 0.98;
        particle.vy *= 0.98;
        
        // Update rotation
        particle.rotation += deltaTime * 5;
        
        // Update color
        particle.color = (particle.color + deltaTime * 100) % 360;
      });
    }
  }
  
  private render() {
    const buffer = this.bufferManager.backBuffer;
    
    // Clear background
    buffer.clear({ bg: this.colors.rgb(5, 5, 10) });
    
    switch (this.currentEffect) {
      case 'typewriter':
        this.renderTypewriter(buffer);
        break;
      case 'matrix':
        this.renderMatrixRain(buffer);
        break;
      case 'glitch':
        this.renderGlitchEffect(buffer);
        break;
      case 'morph':
        this.renderMorphEffect(buffer);
        break;
      case 'explode':
        this.renderExplodeEffect(buffer);
        break;
    }
    
    // UI overlay
    this.renderUI(buffer);
    
    // Flip buffers and render
    this.bufferManager.flip();
    this.bufferManager.render(this.bufferManager.frontBuffer);
  }
  
  private renderTypewriter(buffer: any) {
    const centerX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    
    // Calculate text position
    const textX = centerX - Math.floor(this.typewriterText.length / 2);
    
    // Render typed text
    for (let i = 0; i < this.typewriterText.length; i++) {
      const char = this.typewriterText[i];
      const charX = textX + i;
      
      if (charX >= 0 && charX < this.width) {
        // Fade in effect for new characters
        const age = (this.typewriterIndex - i) / 5;
        const brightness = Math.min(100, 30 + age * 70);
        const color = this.colors.hsl(120, 80, brightness);
        
        buffer.setCell(x(charX), y(centerY), char, {
          fg: color,
          bold: i === this.typewriterIndex - 1
        });
      }
    }
    
    // Render cursor
    if (this.frameCount % 30 < 15) {
      const cursorX = textX + this.typewriterText.length;
      if (cursorX >= 0 && cursorX < this.width) {
        buffer.setCell(x(cursorX), y(centerY), '▊', {
          fg: this.colors.green
        });
      }
    }
  }
  
  private renderMatrixRain(buffer: any) {
    this.matrixColumns.forEach(column => {
      for (let i = 0; i < column.length; i++) {
        const charY = Math.floor(column.y - i);
        
        if (charY >= 0 && charY < this.height - 2 && column.x >= 0 && column.x < this.width) {
          const char = column.chars[i % column.chars.length];
          
          // Calculate brightness based on position in trail
          const brightness = i === 0 ? 100 : Math.max(20, 100 - (i / column.length) * 80);
          const saturation = i === 0 ? 100 : 60;
          
          const color = this.colors.hsl(120, saturation, brightness);
          
          buffer.setCell(x(column.x), y(charY), char, {
            fg: color,
            bold: i === 0
          });
        }
      }
    });
    
    // Add digital rain title
    const title = '[ THE MATRIX HAS YOU ]';
    const titleX = Math.floor((this.width - title.length) / 2);
    const titleY = Math.floor(this.height / 2);
    
    buffer.writeText(x(titleX), y(titleY), title, {
      fg: this.colors.hsl(120, 100, 90),
      bold: true
    });
  }
  
  private renderGlitchEffect(buffer: any) {
    const text = this.sampleTexts[this.currentTextIndex];
    const centerX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    const textX = centerX - Math.floor(text.length / 2);
    
    // Render text with glitch effects
    for (let i = 0; i < text.length; i++) {
      let char = text[i];
      let charX = textX + i;
      let charY = centerY;
      
      // Apply glitch transformations
      if (this.glitchIntensity > 0) {
        // Random character substitution
        if (Math.random() < this.glitchIntensity * 0.1) {
          char = String.fromCharCode(33 + Math.floor(Math.random() * 94));
        }
        
        // Position offset
        if (Math.random() < this.glitchIntensity * 0.2) {
          charX += Math.floor((Math.random() - 0.5) * 4);
          charY += Math.floor((Math.random() - 0.5) * 2);
        }
      }
      
      if (charX >= 0 && charX < this.width && charY >= 0 && charY < this.height - 2) {
        // Color channels with glitch
        const r = Math.random() < this.glitchIntensity ? 255 : 200;
        const g = Math.random() < this.glitchIntensity * 0.5 ? 0 : 200;
        const b = Math.random() < this.glitchIntensity * 0.3 ? 255 : 200;
        
        buffer.setCell(x(charX), y(charY), char, {
          fg: this.colors.rgb(r, g, b)
        });
        
        // Duplicate/ghost effect
        if (this.glitchIntensity > 0.5 && Math.random() < 0.3) {
          const ghostX = charX + Math.floor((Math.random() - 0.5) * 10);
          const ghostY = charY + Math.floor((Math.random() - 0.5) * 4);
          
          if (ghostX >= 0 && ghostX < this.width && ghostY >= 0 && ghostY < this.height - 2) {
            buffer.setCell(x(ghostX), y(ghostY), char, {
              fg: this.colors.rgb(r * 0.5, g * 0.5, b * 0.5)
            });
          }
        }
      }
    }
    
    // Scanlines effect
    if (this.glitchIntensity > 0.3) {
      for (let row = 0; row < this.height; row++) {
        if (Math.random() < this.glitchIntensity * 0.1) {
          for (let col = 0; col < this.width; col++) {
            if (Math.random() < 0.1) {
              buffer.setCell(x(col), y(row), '█', {
                fg: this.colors.rgb(
                  Math.floor(Math.random() * 255),
                  Math.floor(Math.random() * 255),
                  Math.floor(Math.random() * 255)
                )
              });
            }
          }
        }
      }
    }
  }
  
  private renderMorphEffect(buffer: any) {
    const fromText = this.sampleTexts[this.currentTextIndex];
    const toText = this.sampleTexts[(this.currentTextIndex + 1) % this.sampleTexts.length];
    
    const centerX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    
    const maxLength = Math.max(fromText.length, toText.length);
    const textX = centerX - Math.floor(maxLength / 2);
    
    // Render morphing text
    for (let i = 0; i < maxLength; i++) {
      const fromChar = i < fromText.length ? fromText[i] : ' ';
      const toChar = i < toText.length ? toText[i] : ' ';
      
      let displayChar: string;
      
      // Morph between characters
      if (this.morphProgress < 0.3) {
        displayChar = fromChar;
      } else if (this.morphProgress > 0.7) {
        displayChar = toChar;
      } else {
        // Scramble in between
        if (Math.random() < 0.7) {
          displayChar = String.fromCharCode(33 + Math.floor(Math.random() * 94));
        } else {
          displayChar = Math.random() < 0.5 ? fromChar : toChar;
        }
      }
      
      const charX = textX + i;
      
      if (charX >= 0 && charX < this.width) {
        // Calculate color transition
        const hue = 200 + this.morphProgress * 160; // Blue to yellow
        const saturation = 80;
        const brightness = 50 + Math.sin(this.morphProgress * Math.PI) * 50;
        
        buffer.setCell(x(charX), y(centerY), displayChar, {
          fg: this.colors.hsl(hue, saturation, brightness),
          bold: this.morphProgress > 0.3 && this.morphProgress < 0.7
        });
      }
    }
  }
  
  private renderExplodeEffect(buffer: any) {
    // Render text particles
    this.textParticles.forEach(particle => {
      const px = Math.floor(particle.x);
      const py = Math.floor(particle.y);
      
      if (px >= 0 && px < this.width && py >= 0 && py < this.height - 2) {
        const color = this.colors.hsl(particle.color, 100, 70);
        
        buffer.setCell(x(px), y(py), particle.char, {
          fg: color,
          bold: Math.abs(particle.vx) + Math.abs(particle.vy) > 5
        });
        
        // Trail effect
        if (Math.abs(particle.vx) + Math.abs(particle.vy) > 2) {
          const trailX = Math.floor(particle.x - particle.vx * 0.1);
          const trailY = Math.floor(particle.y - particle.vy * 0.1);
          
          if (trailX >= 0 && trailX < this.width && trailY >= 0 && trailY < this.height - 2) {
            buffer.setCell(x(trailX), y(trailY), '·', {
              fg: this.colors.hsl(particle.color, 60, 40)
            });
          }
        }
      }
    });
  }
  
  private renderUI(buffer: any) {
    // Title
    const title = '✨ Text Effects & Transitions ✨';
    buffer.writeText(
      x(Math.floor((this.width - title.length) / 2)),
      y(0),
      title,
      { fg: this.colors.magenta, bold: true }
    );
    
    // Effect indicator
    const effects = {
      typewriter: '⌨️  Typewriter',
      matrix: '💊 Matrix Rain',
      glitch: '⚡ Glitch',
      morph: '🔄 Morph',
      explode: '💥 Explode'
    };
    
    const effectText = `Effect: ${effects[this.currentEffect]}`;
    buffer.writeText(x(2), y(this.height - 2), effectText, {
      fg: this.colors.yellow
    });
    
    // Current text index
    buffer.writeText(
      x(this.width - 15),
      y(this.height - 2),
      `Text: ${this.currentTextIndex + 1}/${this.sampleTexts.length}`,
      { fg: this.colors.gray }
    );
    
    // Help
    const help = '[1-5]: Effects | [Space]: Trigger | [N]: Next Text | [Q]: Quit';
    buffer.writeText(
      x(Math.floor((this.width - help.length) / 2)),
      y(this.height - 1),
      help,
      { fg: this.colors.gray }
    );
  }
  
  private async handleKeyEvent(event: KeyEvent) {
    switch (event.key) {
      case 'q':
      case 'Q':
        this.running = false;
        break;
      case '1':
        this.currentEffect = 'typewriter';
        await this.animateTypewriter();
        break;
      case '2':
        this.currentEffect = 'matrix';
        this.initMatrixRain();
        break;
      case '3':
        this.currentEffect = 'glitch';
        await this.animateGlitch();
        break;
      case '4':
        this.currentEffect = 'morph';
        await this.animateMorph();
        break;
      case '5':
        this.currentEffect = 'explode';
        await this.animateExplode();
        break;
      case ' ':
        // Trigger current effect
        switch (this.currentEffect) {
          case 'typewriter':
            await this.animateTypewriter();
            break;
          case 'glitch':
            await this.animateGlitch();
            break;
          case 'morph':
            await this.animateMorph();
            break;
          case 'explode':
            await this.animateExplode();
            break;
        }
        break;
      case 'n':
      case 'N':
        this.currentTextIndex = (this.currentTextIndex + 1) % this.sampleTexts.length;
        this.typewriterText = this.sampleTexts[this.currentTextIndex];
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
    
    // Start with matrix effect
    this.currentEffect = 'matrix';
    
    // Use requestAnimationFrame for smooth rendering
    let lastRenderTime = 0;
    const targetFrameTime = 1000 / 60; // 60 FPS
    let lastTime = performance.now();
    
    const animateLoop = (timestamp: number) => {
      if (!this.running) return;
      
      const deltaTime = Math.min((timestamp - lastTime) / 100, 0.16);
      lastTime = timestamp;
      
      this.frameCount++;
      this.updateEffects(deltaTime);
      
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
    if (this.currentAnimation) {
      this.currentAnimation.stop();
    }
    
    this.terminal.cursor.show();
    this.terminal.screen.clear();
    await this.terminal.close();
  }
}

// Main
async function main() {
  const app = new TextEffectsApp();
  
  try {
    await app.init();
    await app.run();
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await app.cleanup();
    console.log('\nText effects demo ended');
  }
}

main().catch(console.error);