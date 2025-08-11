#!/usr/bin/env tsx
/**
 * Game-like Animation Example
 * Demonstrates bouncing balls, collision detection, gravity, and game physics
 */

import { ColorSystem } from '../src/core/color.js';
import { x, y, ColorDepth } from '../src/types.js';
import { TerminalImpl } from '../src/core/terminal.js';
import { BufferManagerImpl } from '../src/core/buffer.js';
import { requestAnimationFrame } from '../src/core/browser-api.js';
import {
  animate,
  spring,
  physics,
  Easing,
  createAnimationEngine,
  type Animation,
  type PhysicsBody
} from '../src/advanced/animation.js';

import type { KeyEvent, MouseEvent } from '../src/types.js';
import { MouseAction, MouseButton } from '../src/types.js';

interface Ball extends PhysicsBody {
  id: number;
  radius: number;
  color: number;
  trail: Array<{ x: number, y: number }>;
  glowing: boolean;
  animation?: Animation<Ball>;
}

interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
  velocity: number;
}

interface PowerUp {
  x: number;
  y: number;
  type: 'gravity' | 'speed' | 'split' | 'grow';
  active: boolean;
  lifetime: number;
}

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  health: number;
  color: number;
}

class GameAnimationApp {
  private terminal: TerminalImpl;
  private bufferManager: BufferManagerImpl;
  private colors: ColorSystem;
  private animationEngine = createAnimationEngine();

  private width: number;
  private height: number;
  private running = true;
  private frameCount = 0;
  private score = 0;

  // Game entities
  private balls: Ball[] = [];
  private paddle: Paddle;
  private powerUps: PowerUp[] = [];
  private bricks: Brick[] = [];

  // Physics settings
  private gravity = 0.3;
  private friction = 0.999;
  private maxSpeed = 15;

  // Game modes
  private mode: 'bounce' | 'breakout' | 'gravity' | 'chain' = 'bounce';
  private mouseEnabled = false;

  // Effects
  private screenShake = 0;
  private explosions: Array<{ x: number, y: number, radius: number, life: number }> = [];

  constructor() {
    this.terminal = new TerminalImpl({
      mode: 'fullscreen',
      alternateBuffer: true,
      rawMode: true,
      keyboard: true,
      mouse: true,
      cursorHidden: true
    });

    this.colors = new ColorSystem(ColorDepth.TrueColor);
    this.width = 0;
    this.height = 0;

    // Initialize paddle
    this.paddle = {
      x: 0,
      y: 0,
      width: 12,
      height: 2,
      velocity: 0
    };
  }

  async init() {
    await this.terminal.init();

    this.width = this.terminal.stream.cols;
    this.height = this.terminal.stream.rows;

    this.bufferManager = new BufferManagerImpl(this.terminal.stream);
    this.terminal.cursor.hide();
    this.terminal.screen.clear();

    // Position paddle
    this.paddle.x = Math.floor(this.width / 2 - this.paddle.width / 2);
    this.paddle.y = this.height - 5;

    // Initialize game
    this.initBounce();
  }

  private initBounce() {
    this.balls = [];
    this.bricks = [];

    // Create initial balls
    for (let i = 0; i < 5; i++) {
      this.createBall(
        Math.random() * (this.width - 10) + 5,
        Math.random() * (this.height / 2) + 5
      );
    }
  }

  private initBreakout() {
    this.balls = [];
    this.bricks = [];

    // Create single ball
    this.createBall(this.width / 2, this.height - 10);
    this.balls[0].vx = (Math.random() - 0.5) * 5;
    this.balls[0].vy = -8;

    // Create brick layout
    const brickRows = 5;
    const brickCols = 10;
    const brickWidth = Math.floor(this.width / brickCols) - 1;
    const brickHeight = 2;

    for (let row = 0; row < brickRows; row++) {
      for (let col = 0; col < brickCols; col++) {
        this.bricks.push({
          x: col * (brickWidth + 1) + 1,
          y: row * (brickHeight + 1) + 3,
          width: brickWidth,
          height: brickHeight,
          health: brickRows - row, // Top rows are stronger
          color: row * 60 // Different colors per row
        });
      }
    }
  }

  private initGravityWell() {
    this.balls = [];
    this.bricks = [];

    // Create orbiting balls
    const centerX = this.width / 2;
    const centerY = this.height / 2;

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 20;
      const ball = this.createBall(
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius
      );

      // Set orbital velocity
      const speed = 3;
      ball.vx = -Math.sin(angle) * speed;
      ball.vy = Math.cos(angle) * speed;
    }
  }

  private createBall(xPos: number, yPos: number): Ball {
    const ball: Ball = {
      id: Date.now() + Math.random(),
      x: xPos,
      y: yPos,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      radius: 1 + Math.random() * 2,
      mass: 1,
      color: Math.random() * 360,
      trail: [],
      elasticity: 0.8 + Math.random() * 0.2,
      glowing: false
    };

    // Create physics animation for the ball
    if (this.mode === 'bounce' || this.mode === 'breakout') {
      ball.animation = physics(ball, {
        gravity: this.gravity,
        friction: this.friction,
        bounds: { x: 0, y: 0, width: this.width, height: this.height - 2 }
      });
      
      ball.animation.onUpdate((updated) => {
        // Update trail
        const speed = Math.sqrt(updated.vx * updated.vx + updated.vy * updated.vy);
        if (speed > 2) {
          ball.trail.push({ x: updated.x, y: updated.y });
          if (ball.trail.length > 10) {
            ball.trail.shift();
          }
        }
      });
      
      ball.animation.start();
    }

    this.balls.push(ball);
    return ball;
  }

  private createPowerUp(xPos: number, yPos: number) {
    const types: PowerUp['type'][] = ['gravity', 'speed', 'split', 'grow'];

    this.powerUps.push({
      x: xPos,
      y: yPos,
      type: types[Math.floor(Math.random() * types.length)],
      active: true,
      lifetime: 300
    });
  }

  private createExplosion(xPos: number, yPos: number) {
    this.explosions.push({
      x: xPos,
      y: yPos,
      radius: 0,
      life: 1
    });

    // Reduced screen shake intensity
    this.screenShake = Math.min(this.screenShake + 3, 6);
  }

  private updatePhysics(deltaTime: number) {
    // Update balls
    this.balls.forEach(ball => {
      // Apply gravity
      if (this.mode === 'bounce' || this.mode === 'breakout') {
        ball.vy += this.gravity;
      }

      // Gravity well effect
      if (this.mode === 'gravity') {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const dx = centerX - ball.x;
        const dy = centerY - ball.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 3) {
          const force = 50 / (distance * distance);
          ball.vx += (dx / distance) * force;
          ball.vy += (dy / distance) * force;
        }
      }

      // Apply friction
      ball.vx *= this.friction;
      ball.vy *= this.friction;

      // Limit speed
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (speed > this.maxSpeed) {
        ball.vx = (ball.vx / speed) * this.maxSpeed;
        ball.vy = (ball.vy / speed) * this.maxSpeed;
      }

      // Update position
      ball.x += ball.vx * deltaTime;
      ball.y += ball.vy * deltaTime;

      // Update trail
      if (speed > 2) {
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 10) {
          ball.trail.shift();
        }
      }

      // Wall collisions
      if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= this.width) {
        ball.vx *= -ball.elasticity;
        ball.x = ball.x - ball.radius <= 0 ? ball.radius : this.width - ball.radius;
        this.createExplosion(ball.x, ball.y);
      }

      if (ball.y - ball.radius <= 0) {
        ball.vy *= -ball.elasticity;
        ball.y = ball.radius;
      }

      // Floor collision (lose ball in breakout mode)
      if (ball.y + ball.radius >= this.height - 2) {
        if (this.mode === 'breakout') {
          // Remove ball
          const index = this.balls.indexOf(ball);
          if (index > -1) {
            this.balls.splice(index, 1);
            this.score -= 100;
          }
        } else {
          ball.vy *= -ball.elasticity;
          ball.y = this.height - 2 - ball.radius;
        }
      }
    });

    // Ball-to-ball collisions
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const ball1 = this.balls[i];
        const ball2 = this.balls[j];

        const dx = ball2.x - ball1.x;
        const dy = ball2.y - ball1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = ball1.radius + ball2.radius;

        if (distance < minDistance) {
          // Collision detected
          const nx = dx / distance;
          const ny = dy / distance;

          // Separate balls
          const overlap = minDistance - distance;
          ball1.x -= nx * overlap * 0.5;
          ball1.y -= ny * overlap * 0.5;
          ball2.x += nx * overlap * 0.5;
          ball2.y += ny * overlap * 0.5;

          // Calculate relative velocity
          const dvx = ball2.vx - ball1.vx;
          const dvy = ball2.vy - ball1.vy;
          const dotProduct = dvx * nx + dvy * ny;

          // Don't resolve if velocities are separating
          if (dotProduct > 0) {
            const impulse = 2 * dotProduct / (ball1.mass + ball2.mass);

            ball1.vx += impulse * ball2.mass * nx * ball1.elasticity;
            ball1.vy += impulse * ball2.mass * ny * ball1.elasticity;
            ball2.vx -= impulse * ball1.mass * nx * ball2.elasticity;
            ball2.vy -= impulse * ball1.mass * ny * ball2.elasticity;

            // Visual effect
            ball1.glowing = true;
            ball2.glowing = true;

            if (this.mode === 'chain') {
              this.createExplosion(
                (ball1.x + ball2.x) / 2,
                (ball1.y + ball2.y) / 2
              );
            }
          }
        }
      }
    }

    // Paddle collisions
    this.balls.forEach(ball => {
      if (ball.x >= this.paddle.x &&
        ball.x <= this.paddle.x + this.paddle.width &&
        ball.y + ball.radius >= this.paddle.y &&
        ball.y - ball.radius <= this.paddle.y + this.paddle.height) {

        // Bounce off paddle
        ball.vy = -Math.abs(ball.vy) * 1.1; // Add some energy

        // Add horizontal spin based on paddle position
        const paddleCenter = this.paddle.x + this.paddle.width / 2;
        const hitPosition = (ball.x - paddleCenter) / (this.paddle.width / 2);
        ball.vx += hitPosition * 5;

        // Add paddle velocity to ball
        ball.vx += this.paddle.velocity * 0.3;

        this.score += 10;
      }
    });

    // Brick collisions
    this.balls.forEach(ball => {
      this.bricks = this.bricks.filter(brick => {
        if (ball.x >= brick.x &&
          ball.x <= brick.x + brick.width &&
          ball.y >= brick.y &&
          ball.y <= brick.y + brick.height) {

          // Hit brick
          brick.health--;
          ball.vy *= -1;

          if (brick.health <= 0) {
            // Destroy brick
            this.createExplosion(
              brick.x + brick.width / 2,
              brick.y + brick.height / 2
            );
            this.score += 50;

            // Chance to spawn power-up
            if (Math.random() < 0.2) {
              this.createPowerUp(
                brick.x + brick.width / 2,
                brick.y + brick.height / 2
              );
            }

            return false; // Remove brick
          }
        }
        return true; // Keep brick
      });
    });

    // Power-up collisions
    this.powerUps = this.powerUps.filter(powerUp => {
      powerUp.y += 2 * deltaTime;
      powerUp.lifetime--;

      // Check paddle collision
      if (powerUp.x >= this.paddle.x &&
        powerUp.x <= this.paddle.x + this.paddle.width &&
        powerUp.y >= this.paddle.y &&
        powerUp.y <= this.paddle.y + this.paddle.height) {

        // Apply power-up effect
        this.applyPowerUp(powerUp);
        return false;
      }

      return powerUp.lifetime > 0 && powerUp.y < this.height;
    });

    // Update explosions
    this.explosions = this.explosions.filter(explosion => {
      explosion.radius += 50 * deltaTime;
      explosion.life -= deltaTime * 2;
      return explosion.life > 0;
    });

    // Update screen shake
    if (this.screenShake > 0) {
      this.screenShake *= 0.9;
    }

    // Fade glow effect
    this.balls.forEach(ball => {
      if (ball.glowing) {
        ball.glowing = Math.random() < 0.9;
      }
    });
  }

  private applyPowerUp(powerUp: PowerUp) {
    // eslint-disable-next-line default-case
    switch (powerUp.type) {
      case 'gravity':
        this.gravity *= -1;
        setTimeout(() => this.gravity *= -1, 5000);
        break;
      case 'speed':
        this.balls.forEach(ball => {
          ball.vx *= 1.5;
          ball.vy *= 1.5;
        });
        break;
      case 'split':
        {
          const ballsToSplit = [...this.balls];
          ballsToSplit.forEach(ball => {
            const newBall = this.createBall(ball.x, ball.y);
            newBall.vx = -ball.vx;
            newBall.vy = ball.vy;
          });
          break;
        }
      case 'grow':
        this.paddle.width = Math.min(30, this.paddle.width + 5);
        setTimeout(() => {
          this.paddle.width = Math.max(12, this.paddle.width - 5);
        }, 5000);
        break;
    }

    this.score += 100;
  }

  private render() {
    const buffer = this.bufferManager.backBuffer;

    // Apply screen shake (reduced intensity)
    const shakeX = this.screenShake > 1 ? Math.floor((Math.random() - 0.5) * Math.min(this.screenShake, 4)) : 0;
    const shakeY = this.screenShake > 1 ? Math.floor((Math.random() - 0.5) * Math.min(this.screenShake / 2, 2)) : 0;

    // Clear background with stable color (no random starfield)
    buffer.clear({ bg: this.colors.rgb(5, 5, 15) });
    
    // Add static stars at fixed positions (computed once based on coordinates)
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        // Use deterministic pattern for stars
        if (((col * 31 + row * 17) % 1000) < 2) {
          buffer.setCell(x(col), y(row), '·', {
            fg: this.colors.gray
          });
        }
      }
    }

    // Render bricks
    this.bricks.forEach(brick => {
      for (let bx = 0; bx < brick.width; bx++) {
        for (let by = 0; by < brick.height; by++) {
          const px = brick.x + bx + shakeX;
          const py = brick.y + by + shakeY;

          if (px >= 0 && px < this.width && py >= 0 && py < this.height - 2) {
            const brightness = 30 + brick.health * 20;
            const char = brick.health > 2 ? '█' : brick.health > 1 ? '▓' : '▒';

            buffer.setCell(x(px), y(py), char, {
              fg: this.colors.hsl(brick.color, 80, brightness)
            });
          }
        }
      }
    });

    // Render explosions
    this.explosions.forEach(explosion => {
      const radius = Math.floor(explosion.radius);

      for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
        const ex = Math.floor(explosion.x + Math.cos(angle) * radius) + shakeX;
        const ey = Math.floor(explosion.y + Math.sin(angle) * radius / 2) + shakeY;

        if (ex >= 0 && ex < this.width && ey >= 0 && ey < this.height - 2) {
          const brightness = explosion.life * 100;
          const char = explosion.life > 0.5 ? '✦' : '*';

          buffer.setCell(x(ex), y(ey), char, {
            fg: this.colors.hsl(30, 100, brightness)
          });
        }
      }
    });

    // Render balls with trails
    this.balls.forEach(ball => {
      // Render trail
      ball.trail.forEach((point, i) => {
        const tx = Math.floor(point.x) + shakeX;
        const ty = Math.floor(point.y) + shakeY;

        if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height - 2) {
          const alpha = i / ball.trail.length;
          const brightness = 20 + alpha * 30;

          buffer.setCell(x(tx), y(ty), '·', {
            fg: this.colors.hsl(ball.color, 60, brightness)
          });
        }
      });

      // Render ball
      const ballX = Math.floor(ball.x) + shakeX;
      const ballY = Math.floor(ball.y) + shakeY;

      if (ballX >= 0 && ballX < this.width && ballY >= 0 && ballY < this.height - 2) {
        const char = ball.radius > 1.5 ? '●' : '○';
        const brightness = ball.glowing ? 100 : 70;

        buffer.setCell(x(ballX), y(ballY), char, {
          fg: this.colors.hsl(ball.color, 100, brightness),
          bold: ball.glowing
        });
      }
    });

    // Render power-ups
    this.powerUps.forEach(powerUp => {
      const px = Math.floor(powerUp.x) + shakeX;
      const py = Math.floor(powerUp.y) + shakeY;

      if (px >= 0 && px < this.width && py >= 0 && py < this.height - 2) {
        const icons = {
          gravity: '⬆',
          speed: '⚡',
          split: '◈',
          grow: '◢'
        };

        const pulse = Math.sin(this.frameCount * 0.2) * 30 + 70;

        buffer.setCell(x(px), y(py), icons[powerUp.type], {
          fg: this.colors.hsl(120, 100, pulse),
          bold: true
        });
      }
    });

    // Render paddle
    for (let px = 0; px < this.paddle.width; px++) {
      for (let py = 0; py < this.paddle.height; py++) {
        const paddleX = this.paddle.x + px + shakeX;
        const paddleY = this.paddle.y + py + shakeY;

        if (paddleX >= 0 && paddleX < this.width && paddleY >= 0 && paddleY < this.height - 2) {
          buffer.setCell(x(paddleX), y(paddleY), '█', {
            fg: this.colors.cyan
          });
        }
      }
    }

    // UI overlay
    this.renderUI(buffer);

    // Flip buffers and render
    this.bufferManager.flip();
    this.bufferManager.render(this.bufferManager.frontBuffer);
  }

  private renderUI(buffer: any) {
    // Title
    const title = '🎮 Game Physics Animation 🎮';
    buffer.writeText(
      x(Math.floor((this.width - title.length) / 2)),
      y(0),
      title,
      { fg: this.colors.yellow, bold: true }
    );

    // Score
    buffer.writeText(x(2), y(1), `Score: ${this.score}`, {
      fg: this.colors.white
    });

    // Ball count
    buffer.writeText(x(20), y(1), `Balls: ${this.balls.length}`, {
      fg: this.colors.white
    });

    // Mode
    const modes = {
      bounce: '⚪ Bounce',
      breakout: '🧱 Breakout',
      gravity: '🌀 Gravity Well',
      chain: '💥 Chain Reaction'
    };

    buffer.writeText(x(this.width - 20), y(1), modes[this.mode], {
      fg: this.colors.cyan
    });

    // Help
    const help = '[1-4]: Mode | [←→]: Move | [Space]: Add Ball | [M]: Mouse | [Q]: Quit';
    buffer.writeText(
      x(Math.floor((this.width - help.length) / 2)),
      y(this.height - 1),
      help,
      { fg: this.colors.gray }
    );
  }

  private handleKeyEvent(event: KeyEvent) {
    // eslint-disable-next-line default-case
    switch (event.key) {
      case 'q':
      case 'Q':
        this.running = false;
        break;
      case '1':
        this.mode = 'bounce';
        this.initBounce();
        break;
      case '2':
        this.mode = 'breakout';
        this.initBreakout();
        break;
      case '3':
        this.mode = 'gravity';
        this.initGravityWell();
        break;
      case '4':
        this.mode = 'chain';
        this.initBounce();
        break;
      case ' ':
        this.createBall(
          Math.random() * (this.width - 10) + 5,
          Math.random() * (this.height / 2) + 5
        );
        break;
      case 'ArrowLeft':
        this.paddle.velocity = -5;
        this.paddle.x = Math.max(0, this.paddle.x - 3);
        break;
      case 'ArrowRight':
        this.paddle.velocity = 5;
        this.paddle.x = Math.min(this.width - this.paddle.width, this.paddle.x + 3);
        break;
      case 'm':
      case 'M':
        this.mouseEnabled = !this.mouseEnabled;
        if (this.mouseEnabled) {
          this.terminal.input.enableMouse();
        } else {
          this.terminal.input.disableMouse();
        }
        break;
    }

    if (event.ctrl && event.key === 'c') {
      this.running = false;
    }
  }

  private handleMouseEvent(event: MouseEvent) {
    if (!this.mouseEnabled) return;

    // Move paddle with mouse
    this.paddle.x = Math.max(0,
      Math.min(this.width - this.paddle.width, event.x - this.paddle.width / 2)
    );

    // Click to create ball
    if (event.action === MouseAction.Press && event.button === MouseButton.Left) {
      this.createBall(event.x, event.y);
    }
  }

  async run() {
    // Set up input handlers
    this.terminal.events.on('key', (event: KeyEvent) => {
      this.handleKeyEvent(event);
    });

    this.terminal.events.on('mouse', (event: MouseEvent) => {
      this.handleMouseEvent(event);
    });

    // Use requestAnimationFrame for smooth rendering
    let lastRenderTime = 0;
    const targetFrameTime = 1000 / 60; // 60 FPS
    let lastTime = performance.now();
    
    const gameLoop = (timestamp: number) => {
      if (!this.running) return;
      
      const deltaTime = (timestamp - lastTime) / 1000; // Convert to seconds
      lastTime = timestamp;
      
      // Fixed timestep for physics
      const fixedDeltaTime = Math.min(deltaTime, 0.016); // Cap at 60 FPS
      
      this.frameCount++;
      
      // Decay paddle velocity
      this.paddle.velocity *= 0.8;
      
      // Update physics
      this.updatePhysics(fixedDeltaTime);
      
      // Throttle rendering to target FPS
      if (timestamp - lastRenderTime >= targetFrameTime) {
        this.render();
        lastRenderTime = timestamp;
      }
      
      // Check win/lose conditions
      if (this.mode === 'breakout') {
        if (this.balls.length === 0) {
          // Game over
          this.score = 0;
          this.initBreakout();
        } else if (this.bricks.length === 0) {
          // Win - create new level
          this.score += 1000;
          this.initBreakout();
        }
      }
      
      // Continue loop
      requestAnimationFrame(gameLoop);
    };
    
    // Start animation loop
    requestAnimationFrame(gameLoop);
    
    // Keep process alive
    while (this.running) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async cleanup() {
    // Stop all ball animations
    this.balls.forEach(ball => {
      if (ball.animation) {
        ball.animation.stop();
      }
    });
    
    if (this.mouseEnabled) {
      this.terminal.input.disableMouse();
    }

    this.terminal.cursor.show();
    this.terminal.screen.clear();
    await this.terminal.close();
  }
}

// Main
async function main() {
  const app = new GameAnimationApp();

  try {
    await app.init();
    await app.run();
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await app.cleanup();
    console.log('\nGame animation demo ended');
    console.log(`Final score: ${(app as any).score}`);
  }
}

main().catch(console.error);