# Aura Custom Components Specification

## Table of Contents
1. [Introduction](#introduction)
2. [Component Types](#component-types)
3. [Creating Composition Components](#creating-composition-components)
4. [Creating Native Components](#creating-native-components)
5. [Rendering System](#rendering-system)
6. [Reactive Integration](#reactive-integration)
7. [Animation and Effects](#animation-and-effects)
8. [Advanced Features](#advanced-features)
9. [Best Practices](#best-practices)
10. [Complete Examples](#complete-examples)

## Introduction

Aura provides multiple approaches for creating custom components, from simple compositions of existing elements to fully custom native components with direct buffer rendering. This specification covers all approaches with practical examples.

### Core Concepts

```typescript
// Three levels of component creation:
1. Composition Components - Combine existing Aura elements
2. Hybrid Components - Mix composition with custom rendering
3. Native Components - Full control over rendering and behavior
```

## Component Types

### Level 1: Composition Components
**Use when:** You need to combine existing Aura elements with custom logic
**Complexity:** Low
**Performance:** Good

```typescript
// Simple card component using composition
function Card({ title, content, onClose }: CardProps) {
  const [isExpanded, setExpanded] = signal(false);
  
  return aura('box', {
    border: true,
    borderStyle: 'rounded',
    padding: 1,
    children: [
      aura('box', {
        flexDirection: 'row',
        justifyContent: 'space-between',
        children: [
          aura('text', {
            content: title,
            fg: 'accent',
            attributes: TextAttributes.BOLD
          }),
          aura('text', {
            content: '✕',
            fg: 'muted',
            onClick: onClose
          })
        ]
      }),
      aura('text', {
        content: computed(() => isExpanded() ? content : content.slice(0, 50) + '...'),
        fg: 'foreground'
      })
    ]
  });
}
```

### Level 2: Hybrid Components
**Use when:** You need custom behavior with some custom rendering
**Complexity:** Medium
**Performance:** Very Good

```typescript
// Progress bar with custom rendering
class ProgressBar extends Component {
  private _value: number = 0;
  private _max: number = 100;
  
  constructor(ctx: RenderContext, props: ProgressBarProps) {
    super(ctx, props);
    this._value = props.value || 0;
    this._max = props.max || 100;
  }
  
  protected renderSelf(buffer: OptimizedBuffer): void {
    const percentage = this._value / this._max;
    const filled = Math.floor(this.width * percentage);
    
    // Custom progress bar rendering
    for (let x = 0; x < this.width; x++) {
      const char = x < filled ? '█' : '░';
      const color = x < filled ? this.ctx.theme.colors.primary : this.ctx.theme.colors.muted;
      buffer.drawText(char, this.x + x, this.y, color);
    }
    
    // Percentage text
    const text = `${Math.round(percentage * 100)}%`;
    buffer.drawText(text, this.x + Math.floor(this.width / 2) - 2, this.y, this.ctx.theme.colors.foreground);
  }
}
```

### Level 3: Native Components
**Use when:** You need full control over rendering, animations, and behavior
**Complexity:** High
**Performance:** Optimal

```typescript
// Fully custom animated spectrum analyzer
class SpectrumAnalyzer extends Component {
  private frameBuffer: FrameBuffer;
  private animationId: number;
  private bars: Float32Array;
  
  constructor(ctx: RenderContext, props: SpectrumAnalyzerProps) {
    super(ctx, { ...props, buffered: true });
    this.frameBuffer = new FrameBuffer(this.width, this.height);
    this.bars = new Float32Array(props.barCount || 32);
    this.startAnimation();
  }
  
  private startAnimation(): void {
    this.animationId = this.ctx.requestAnimationFrame(this.animate.bind(this));
  }
  
  private animate(deltaTime: number): void {
    // Update bar heights with smooth animation
    for (let i = 0; i < this.bars.length; i++) {
      const target = Math.random() * this.height;
      this.bars[i] += (target - this.bars[i]) * 0.1;
    }
    this.needsUpdate();
    this.animationId = this.ctx.requestAnimationFrame(this.animate.bind(this));
  }
  
  protected renderSelf(buffer: OptimizedBuffer): void {
    // Clear frame buffer
    this.frameBuffer.clear();
    
    // Render spectrum bars
    const barWidth = this.width / this.bars.length;
    for (let i = 0; i < this.bars.length; i++) {
      const height = Math.floor(this.bars[i]);
      const hue = (i / this.bars.length) * 360;
      const color = RGBA.fromHSL(hue, 100, 50);
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < barWidth - 1; x++) {
          this.frameBuffer.setPixel(
            Math.floor(i * barWidth + x),
            this.height - y - 1,
            '█',
            color
          );
        }
      }
    }
    
    // Draw frame buffer to main buffer
    buffer.drawFrameBuffer(this.frameBuffer, this.x, this.y);
  }
  
  protected destroySelf(): void {
    cancelAnimationFrame(this.animationId);
    this.frameBuffer.destroy();
    super.destroySelf();
  }
}
```

## Creating Composition Components

### Step 1: Define Component Props

```typescript
interface CustomButtonProps {
  label: string | Signal<string>;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean | Signal<boolean>;
  onClick?: () => void;
  icon?: string;
  loading?: boolean | Signal<boolean>;
}
```

### Step 2: Create Component Function

```typescript
function CustomButton(props: CustomButtonProps): AuraElement {
  // Extract reactive values
  const label = getValue(props.label);
  const disabled = getValue(props.disabled);
  const loading = getValue(props.loading);
  
  // Compute derived state
  const backgroundColor = computed(() => {
    if (disabled()) return 'disabled';
    switch (props.variant) {
      case 'primary': return 'primary';
      case 'secondary': return 'secondary';
      case 'danger': return 'error';
      default: return 'primary';
    }
  });
  
  // Return composition
  return aura('box', {
    padding: [0, 2],
    backgroundColor,
    border: true,
    borderStyle: 'rounded',
    focusable: !disabled(),
    onClick: props.onClick,
    children: [
      aura('text', {
        content: computed(() => {
          if (loading()) return '⟳ Loading...';
          return props.icon ? `${props.icon} ${label()}` : label();
        }),
        fg: disabled() ? 'muted' : 'foreground',
        attributes: TextAttributes.BOLD
      })
    ]
  });
}
```

### Step 3: Use in Application

```typescript
const app = auraApp(() => {
  const [count, setCount] = signal(0);
  const [loading, setLoading] = signal(false);
  
  return [
    CustomButton({
      label: computed(() => `Clicked ${count()} times`),
      variant: 'primary',
      loading,
      onClick: async () => {
        setLoading(true);
        await delay(1000);
        setCount(count() + 1);
        setLoading(false);
      }
    })
  ];
});
```

## Creating Native Components

### Step 1: Define Component Class

```typescript
export interface WaveformProps extends ComponentProps {
  data: Float32Array | Signal<Float32Array>;
  color?: Color;
  backgroundColor?: Color;
  animated?: boolean;
  waveStyle?: 'line' | 'bars' | 'filled';
}

export class WaveformComponent extends Component {
  private _data: Float32Array;
  private _color: RGBA;
  private _backgroundColor: RGBA;
  private _animated: boolean;
  private _waveStyle: 'line' | 'bars' | 'filled';
  private _phase: number = 0;
  private _animationId?: number;
  
  constructor(ctx: RenderContext, props: WaveformProps) {
    super(ctx, props);
    
    // Initialize theme colors
    const theme = useTheme();
    this._color = resolveColorValue(props.color, theme.colors.primary);
    this._backgroundColor = resolveColorValue(props.backgroundColor, theme.colors.background);
    
    // Initialize properties
    this._data = getValue(props.data) || new Float32Array(64);
    this._animated = props.animated ?? false;
    this._waveStyle = props.waveStyle || 'line';
    
    // Start animation if enabled
    if (this._animated) {
      this.startAnimation();
    }
  }
  
  private startAnimation(): void {
    const animate = (deltaTime: number) => {
      this._phase += deltaTime * 0.001; // Animate phase
      this.needsUpdate();
      this._animationId = this.ctx.requestAnimationFrame(animate);
    };
    this._animationId = this.ctx.requestAnimationFrame(animate);
  }
  
  protected renderSelf(buffer: OptimizedBuffer, deltaTime: number): void {
    // Clear background
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        buffer.setCell(this.x + x, this.y + y, ' ', this._backgroundColor, this._backgroundColor);
      }
    }
    
    // Render waveform based on style
    switch (this._waveStyle) {
      case 'line':
        this.renderLineWave(buffer);
        break;
      case 'bars':
        this.renderBarsWave(buffer);
        break;
      case 'filled':
        this.renderFilledWave(buffer);
        break;
    }
  }
  
  private renderLineWave(buffer: OptimizedBuffer): void {
    const step = this._data.length / this.width;
    let prevY = 0;
    
    for (let x = 0; x < this.width; x++) {
      const dataIndex = Math.floor(x * step);
      const value = this._data[dataIndex];
      const y = Math.floor((1 - value) * this.height / 2 + Math.sin(this._phase + x * 0.1) * 2);
      
      // Draw line between points
      if (x > 0) {
        const steps = Math.abs(y - prevY);
        const yStep = y > prevY ? 1 : -1;
        for (let i = 0; i <= steps; i++) {
          const lineY = prevY + i * yStep;
          if (lineY >= 0 && lineY < this.height) {
            buffer.drawText('▬', this.x + x, this.y + lineY, this._color);
          }
        }
      }
      
      prevY = y;
    }
  }
  
  private renderBarsWave(buffer: OptimizedBuffer): void {
    const barWidth = Math.max(1, Math.floor(this.width / this._data.length));
    
    for (let i = 0; i < this._data.length; i++) {
      const value = this._data[i];
      const barHeight = Math.floor(value * this.height);
      const x = i * barWidth;
      
      for (let y = 0; y < barHeight; y++) {
        for (let bx = 0; bx < barWidth - 1; bx++) {
          if (x + bx < this.width) {
            const intensity = y / barHeight;
            const color = this._color.lighter(intensity * 0.5);
            buffer.drawText('█', this.x + x + bx, this.y + this.height - y - 1, color);
          }
        }
      }
    }
  }
  
  private renderFilledWave(buffer: OptimizedBuffer): void {
    const step = this._data.length / this.width;
    
    for (let x = 0; x < this.width; x++) {
      const dataIndex = Math.floor(x * step);
      const value = this._data[dataIndex];
      const waveHeight = Math.floor(value * this.height / 2);
      const centerY = Math.floor(this.height / 2);
      
      // Fill from center
      for (let y = -waveHeight; y <= waveHeight; y++) {
        const actualY = centerY + y;
        if (actualY >= 0 && actualY < this.height) {
          const intensity = 1 - Math.abs(y) / waveHeight;
          const color = this._color.withAlpha(intensity);
          buffer.drawText('▓', this.x + x, this.y + actualY, color);
        }
      }
    }
  }
  
  // Property setters for reactive updates
  set data(value: Float32Array) {
    this._data = value;
    this.needsUpdate();
  }
  
  set waveStyle(style: 'line' | 'bars' | 'filled') {
    this._waveStyle = style;
    this.needsUpdate();
  }
  
  protected destroySelf(): void {
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
    }
    super.destroySelf();
  }
}
```

### Step 2: Register Component

```typescript
// In packages/aura/src/app/types.ts
export type ComponentType = 
  | 'box' 
  | 'text' 
  | 'input'
  | 'waveform'  // Add new type
  | ...;

// In packages/aura/src/app/types.ts
export interface ComponentPropsMap {
  box: BoxProps;
  text: TextProps;
  waveform: WaveformProps;  // Add props mapping
  ...
}

// In packages/aura/src/app/reactive-bridge.ts
export function createComponentInstance<T extends ComponentType>(
  element: AuraElement<T>,
  ctx: RenderContext
): ComponentInstance<T> {
  switch (element.type) {
    case 'waveform':
      instance = new WaveformComponent(ctx, unwrappedProps);
      break;
    // ... other cases
  }
}
```

### Step 3: Use Native Component

```typescript
const app = auraApp(() => {
  const audioData = signal(new Float32Array(64).fill(0));
  
  // Simulate audio data
  effect(() => {
    const interval = setInterval(() => {
      const newData = new Float32Array(64);
      for (let i = 0; i < 64; i++) {
        newData[i] = Math.random();
      }
      audioData.set(newData);
    }, 100);
    
    onCleanup(() => clearInterval(interval));
  });
  
  return [
    aura('waveform', {
      data: audioData,
      color: 'primary',
      waveStyle: 'filled',
      animated: true,
      width: 80,
      height: 20
    })
  ];
});
```

## Rendering System

### Understanding the Buffer System

```typescript
// OptimizedBuffer provides these key methods:
class OptimizedBuffer {
  // Basic drawing
  drawText(text: string, x: number, y: number, fg: RGBA, bg?: RGBA): void;
  setCell(x: number, y: number, char: string, fg: RGBA, bg: RGBA): void;
  
  // Advanced drawing
  drawBox(x: number, y: number, width: number, height: number, style: BorderStyle): void;
  drawLine(x1: number, y1: number, x2: number, y2: number, char: string, color: RGBA): void;
  
  // Frame buffer integration
  drawFrameBuffer(fb: FrameBuffer, x: number, y: number): void;
  drawTextBuffer(tb: TextBuffer, x: number, y: number, clip: Rect): void;
  
  // Clipping
  setClipRect(rect: Rect): void;
  clearClipRect(): void;
}
```

### Frame Buffer for Complex Graphics

```typescript
class ParticleSystem extends Component {
  private frameBuffer: FrameBuffer;
  private particles: Particle[] = [];
  
  constructor(ctx: RenderContext, props: ParticleSystemProps) {
    super(ctx, { ...props, buffered: true });
    this.frameBuffer = new FrameBuffer(this.width, this.height);
    this.initParticles();
  }
  
  private initParticles(): void {
    for (let i = 0; i < 100; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        life: 1.0,
        color: RGBA.fromHSL(Math.random() * 360, 100, 50)
      });
    }
  }
  
  protected renderSelf(buffer: OptimizedBuffer, deltaTime: number): void {
    // Clear frame buffer with transparency
    this.frameBuffer.clear(RGBA.fromValues(0, 0, 0, 0));
    
    // Update and render particles
    for (const particle of this.particles) {
      // Physics update
      particle.x += particle.vx * deltaTime * 0.01;
      particle.y += particle.vy * deltaTime * 0.01;
      particle.life -= deltaTime * 0.0001;
      
      // Wrap around screen
      if (particle.x < 0) particle.x = this.width;
      if (particle.x >= this.width) particle.x = 0;
      if (particle.y < 0) particle.y = this.height;
      if (particle.y >= this.height) particle.y = 0;
      
      // Reset dead particles
      if (particle.life <= 0) {
        particle.life = 1.0;
        particle.x = this.width / 2;
        particle.y = this.height / 2;
      }
      
      // Render particle with alpha based on life
      const color = particle.color.withAlpha(particle.life);
      this.frameBuffer.setPixel(
        Math.floor(particle.x),
        Math.floor(particle.y),
        '●',
        color
      );
    }
    
    // Composite frame buffer onto main buffer
    buffer.drawFrameBuffer(this.frameBuffer, this.x, this.y);
  }
}
```

## Reactive Integration

### Making Components Reactive

```typescript
// Step 1: Define reactive props
interface ReactiveChartProps extends ComponentProps {
  data: Signal<number[]>;          // Reactive data
  title: string | Signal<string>;  // Can be static or reactive
  updateInterval?: number;
  onDataPoint?: (value: number) => void;
}

// Step 2: Create reactive component
function ReactiveChart(props: ReactiveChartProps) {
  // Create internal state
  const [max, setMax] = signal(100);
  const [hoveredIndex, setHoveredIndex] = signal<number | null>(null);
  
  // Compute derived values
  const normalizedData = computed(() => {
    const data = props.data();
    const maxValue = Math.max(...data, max());
    return data.map(v => v / maxValue);
  });
  
  // Side effects
  effect(() => {
    const data = props.data();
    if (data.length > 0) {
      const newMax = Math.max(...data);
      if (newMax > max()) {
        setMax(newMax * 1.1); // Add 10% headroom
      }
    }
  });
  
  // Return reactive component tree
  return aura('box', {
    border: true,
    children: [
      // Title bar
      aura('text', {
        content: computed(() => {
          const title = getValue(props.title);
          const hovered = hoveredIndex();
          if (hovered !== null) {
            return `${title} - Value: ${props.data()[hovered]}`;
          }
          return title;
        }),
        fg: 'accent',
        attributes: TextAttributes.BOLD
      }),
      
      // Chart area
      aura('custom-chart', {
        data: normalizedData,
        onMouseMove: (x: number) => {
          const index = Math.floor(x / width * props.data().length);
          setHoveredIndex(index);
          props.onDataPoint?.(props.data()[index]);
        },
        onMouseLeave: () => setHoveredIndex(null)
      })
    ]
  });
}
```

### Reactive Property Binding in Native Components

```typescript
class ReactiveGauge extends Component {
  private _value: number = 0;
  private _min: number = 0;
  private _max: number = 100;
  private _label: string = '';
  
  // Reactive setters automatically created by reactive-bridge
  set value(val: number) {
    this._value = val;
    this.animateToValue(val);
  }
  
  set label(val: string) {
    this._label = val;
    this.needsUpdate();
  }
  
  private animateToValue(target: number): void {
    const timeline = new Timeline();
    timeline.add({
      target: this,
      property: '_displayValue',
      from: this._displayValue,
      to: target,
      duration: 500,
      easing: 'easeOutCubic'
    });
    timeline.play();
  }
}

// Usage with signals
const cpuUsage = signal(0);
const gauge = aura('gauge', {
  value: cpuUsage,  // Automatically updates when signal changes
  label: computed(() => `CPU: ${Math.round(cpuUsage())}%`),
  min: 0,
  max: 100
});
```

## Animation and Effects

### Timeline-Based Animation

```typescript
class AnimatedLogo extends Component {
  private timeline: Timeline;
  private letters: { x: number; y: number; rotation: number; scale: number }[] = [];
  
  constructor(ctx: RenderContext, props: AnimatedLogoProps) {
    super(ctx, props);
    this.initLetters();
    this.createAnimation();
  }
  
  private createAnimation(): void {
    this.timeline = new Timeline({ loop: true });
    
    // Staggered letter animation
    this.letters.forEach((letter, i) => {
      this.timeline.add({
        target: letter,
        property: 'y',
        from: -5,
        to: 0,
        duration: 1000,
        delay: i * 100,
        easing: 'easeOutBounce'
      });
      
      this.timeline.add({
        target: letter,
        property: 'rotation',
        from: 0,
        to: 360,
        duration: 2000,
        delay: i * 100,
        easing: 'linear'
      });
    });
    
    this.timeline.play();
  }
  
  protected renderSelf(buffer: OptimizedBuffer, deltaTime: number): void {
    this.timeline.update(deltaTime);
    
    const text = 'AURA';
    this.letters.forEach((letter, i) => {
      const char = text[i];
      const x = this.x + i * 10 + letter.x;
      const y = this.y + letter.y;
      
      // Apply rotation transformation (simplified)
      const rotated = this.rotateChar(char, letter.rotation);
      const color = RGBA.fromHSL(letter.rotation, 100, 50);
      
      buffer.drawText(rotated, x, y, color);
    });
  }
}
```

### Particle Effects

```typescript
class FireEffect extends Component {
  private particles: FireParticle[] = [];
  private readonly particleChars = ['▲', '▼', '◆', '●', '○'];
  private readonly fireColors = [
    RGBA.fromHex('#FF0000'),  // Red
    RGBA.fromHex('#FF6600'),  // Orange  
    RGBA.fromHex('#FFAA00'),  // Yellow
    RGBA.fromHex('#FFFF00'),  // Bright yellow
    RGBA.fromHex('#FFFFFF'),  // White (hottest)
  ];
  
  protected renderSelf(buffer: OptimizedBuffer, deltaTime: number): void {
    // Spawn new particles at bottom
    if (Math.random() < 0.8) {
      this.particles.push({
        x: this.x + Math.random() * this.width,
        y: this.y + this.height - 1,
        vy: -Math.random() * 0.05 - 0.02,
        life: 1.0,
        heat: Math.random()
      });
    }
    
    // Update and render particles
    this.particles = this.particles.filter(p => {
      // Physics
      p.y += p.vy * deltaTime;
      p.x += (Math.random() - 0.5) * 0.1;
      p.life -= deltaTime * 0.001;
      p.vy *= 0.98; // Air resistance
      
      // Remove dead particles
      if (p.life <= 0 || p.y < this.y) return false;
      
      // Render
      const colorIndex = Math.floor(p.heat * (this.fireColors.length - 1));
      const color = this.fireColors[colorIndex].withAlpha(p.life);
      const char = this.particleChars[Math.floor(Math.random() * this.particleChars.length)];
      
      buffer.drawText(char, Math.floor(p.x), Math.floor(p.y), color);
      return true;
    });
  }
}
```

## Advanced Features

### Mouse Interaction

```typescript
class InteractiveCanvas extends Component {
  private points: { x: number; y: number; color: RGBA }[] = [];
  private isDrawing = false;
  private currentColor = RGBA.fromHex('#00FF00');
  
  protected onMouseEvent(event: MouseEvent): void {
    const relX = event.x - this.x;
    const relY = event.y - this.y;
    
    switch (event.type) {
      case MouseEventType.MOUSE_DOWN:
        this.isDrawing = true;
        this.points.push({ x: relX, y: relY, color: this.currentColor });
        this.needsUpdate();
        break;
        
      case MouseEventType.MOUSE_MOVE:
        if (this.isDrawing) {
          this.points.push({ x: relX, y: relY, color: this.currentColor });
          this.needsUpdate();
        }
        break;
        
      case MouseEventType.MOUSE_UP:
        this.isDrawing = false;
        break;
        
      case MouseEventType.WHEEL:
        // Change color with wheel
        const hue = (Date.now() / 10) % 360;
        this.currentColor = RGBA.fromHSL(hue, 100, 50);
        break;
    }
  }
  
  protected renderSelf(buffer: OptimizedBuffer): void {
    // Draw all points
    for (const point of this.points) {
      buffer.drawText('●', this.x + point.x, this.y + point.y, point.color);
    }
    
    // Draw cursor
    if (this.isDrawing) {
      const lastPoint = this.points[this.points.length - 1];
      buffer.drawText('✓', this.x + lastPoint.x, this.y + lastPoint.y, this.currentColor);
    }
  }
  
  public handleKeyPress(key: ParsedKey): boolean {
    if (key.name === 'c' && key.ctrl) {
      this.points = []; // Clear canvas
      this.needsUpdate();
      return true;
    }
    return false;
  }
}
```

### Custom Layout Integration

```typescript
class FlowLayout extends Component {
  private itemWidth = 10;
  private itemHeight = 3;
  private gap = 1;
  
  protected beforeRender(): void {
    // Custom layout logic
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    
    for (const child of this.children) {
      // Check if item fits in current row
      if (x + this.itemWidth > this.width) {
        x = 0;
        y += rowHeight + this.gap;
        rowHeight = 0;
      }
      
      // Position child
      child.layoutNode.yogaNode.setPosition(Edge.Left, x);
      child.layoutNode.yogaNode.setPosition(Edge.Top, y);
      child.layoutNode.yogaNode.setWidth(this.itemWidth);
      child.layoutNode.yogaNode.setHeight(this.itemHeight);
      
      // Update for next item
      x += this.itemWidth + this.gap;
      rowHeight = Math.max(rowHeight, this.itemHeight);
    }
    
    // Call parent implementation
    super.beforeRender();
  }
}
```

### Performance Optimization

```typescript
class OptimizedList extends Component {
  private visibleRange = { start: 0, end: 0 };
  private itemHeight = 1;
  private items: any[] = [];
  
  protected beforeRender(): void {
    // Virtual scrolling - only render visible items
    this.visibleRange.start = Math.floor(this.scrollTop / this.itemHeight);
    this.visibleRange.end = Math.min(
      this.items.length,
      this.visibleRange.start + Math.ceil(this.height / this.itemHeight)
    );
    
    // Remove non-visible children
    this.children = this.children.filter(child => {
      const index = this.items.indexOf(child.data);
      return index >= this.visibleRange.start && index < this.visibleRange.end;
    });
    
    // Add newly visible children
    for (let i = this.visibleRange.start; i < this.visibleRange.end; i++) {
      if (!this.children.find(c => c.data === this.items[i])) {
        const child = this.createItemComponent(this.items[i], i);
        this.add(child);
      }
    }
  }
  
  private createItemComponent(item: any, index: number): Component {
    // Create component with object pooling for performance
    const component = this.componentPool.get() || new ListItem(this.ctx, {});
    component.data = item;
    component.y = index * this.itemHeight;
    return component;
  }
}
```

## Best Practices

### 1. Component Design Principles

```typescript
// ✅ GOOD: Single responsibility
class ProgressBar extends Component {
  // Only handles progress display
}

// ❌ BAD: Multiple responsibilities
class ProgressBarWithLabelAndAnimation extends Component {
  // Too many concerns in one component
}

// ✅ GOOD: Composition
function LabeledProgressBar(props) {
  return aura('box', {
    children: [
      aura('text', { content: props.label }),
      aura('progress-bar', { value: props.value })
    ]
  });
}
```

### 2. Performance Guidelines

```typescript
// ✅ GOOD: Cleanup resources
class AnimatedComponent extends Component {
  private animationId?: number;
  
  protected destroySelf(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    super.destroySelf();
  }
}

// ✅ GOOD: Use buffered rendering for complex components
constructor(ctx: RenderContext, props: Props) {
  super(ctx, { ...props, buffered: true });
}

// ✅ GOOD: Optimize render calls
protected renderSelf(buffer: OptimizedBuffer): void {
  // Skip rendering if not visible
  if (!this.visible || this.width === 0 || this.height === 0) {
    return;
  }
  // Render logic
}
```

### 3. Reactive Best Practices

```typescript
// ✅ GOOD: Use computed for derived state
const displayText = computed(() => {
  const value = data();
  const format = formatter();
  return format(value);
});

// ✅ GOOD: Clean up effects
effect(() => {
  const timer = setInterval(update, 1000);
  onCleanup(() => clearInterval(timer));
});

// ✅ GOOD: Batch updates
batch(() => {
  setValue1(newValue1);
  setValue2(newValue2);
  setValue3(newValue3);
});
```

### 4. Theme Integration

```typescript
// ✅ GOOD: Always support theming
class ThemedComponent extends Component {
  constructor(ctx: RenderContext, props: Props) {
    super(ctx, props);
    
    const theme = useTheme();
    this._color = resolveColorValue(
      props.color,
      theme.colors.primary
    );
  }
}

// ✅ GOOD: Support color tokens
function resolveColorValue(
  value: Color | undefined,
  fallback: RGBA
): RGBA {
  if (!value) return fallback;
  
  try {
    // Try as theme token first
    const theme = useTheme();
    return theme.resolveColor(value);
  } catch {
    // Fall back to direct color
    return parseColor(value);
  }
}
```

## Complete Examples

### Example 1: Dashboard Widget System

```typescript
// Dashboard that composes multiple widget types
function Dashboard() {
  const cpuData = useSystemMetrics('cpu');
  const memData = useSystemMetrics('memory');
  const diskData = useSystemMetrics('disk');
  
  return aura('box', {
    flexDirection: 'column',
    gap: 1,
    children: [
      // Header
      aura('text', {
        content: 'System Dashboard',
        fg: 'accent',
        attributes: TextAttributes.BOLD
      }),
      
      // Metrics row
      aura('box', {
        flexDirection: 'row',
        gap: 2,
        children: [
          MetricWidget({
            title: 'CPU',
            value: cpuData,
            format: v => `${v.toFixed(1)}%`,
            color: 'primary'
          }),
          MetricWidget({
            title: 'Memory',
            value: memData,
            format: v => `${(v / 1024).toFixed(1)} GB`,
            color: 'secondary'
          }),
          MetricWidget({
            title: 'Disk',
            value: diskData,
            format: v => `${v.toFixed(0)} GB`,
            color: 'accent'
          })
        ]
      }),
      
      // Chart
      aura('waveform', {
        data: computed(() => cpuData.history),
        waveStyle: 'filled',
        animated: true,
        height: 10
      })
    ]
  });
}

// Reusable metric widget
function MetricWidget({ title, value, format, color }: MetricWidgetProps) {
  const displayValue = computed(() => format(value()));
  const isHigh = computed(() => value() > 80);
  
  return aura('box', {
    border: true,
    borderColor: computed(() => isHigh() ? 'error' : 'border'),
    padding: 1,
    minWidth: 20,
    children: [
      aura('text', {
        content: title,
        fg: 'muted',
        attributes: TextAttributes.DIM
      }),
      aura('text', {
        content: displayValue,
        fg: computed(() => isHigh() ? 'error' : color),
        attributes: TextAttributes.BOLD
      }),
      aura('progress-bar', {
        value: value,
        max: 100,
        color: computed(() => isHigh() ? 'error' : color)
      })
    ]
  });
}
```

### Example 2: Terminal Game Component

```typescript
// Snake game as a native component
class SnakeGame extends Component {
  private snake: { x: number; y: number }[] = [];
  private food: { x: number; y: number };
  private direction = { x: 1, y: 0 };
  private gameLoop?: number;
  private score = 0;
  
  constructor(ctx: RenderContext, props: SnakeGameProps) {
    super(ctx, props);
    this.initGame();
    this.startGameLoop();
  }
  
  private initGame(): void {
    // Initialize snake in center
    const centerX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    this.snake = [
      { x: centerX, y: centerY },
      { x: centerX - 1, y: centerY },
      { x: centerX - 2, y: centerY }
    ];
    this.spawnFood();
  }
  
  private spawnFood(): void {
    do {
      this.food = {
        x: Math.floor(Math.random() * this.width),
        y: Math.floor(Math.random() * this.height)
      };
    } while (this.snake.some(s => s.x === this.food.x && s.y === this.food.y));
  }
  
  private startGameLoop(): void {
    const tick = () => {
      this.updateGame();
      this.needsUpdate();
      this.gameLoop = setTimeout(tick, 100);
    };
    tick();
  }
  
  private updateGame(): void {
    // Move snake
    const head = { ...this.snake[0] };
    head.x += this.direction.x;
    head.y += this.direction.y;
    
    // Wrap around
    if (head.x < 0) head.x = this.width - 1;
    if (head.x >= this.width) head.x = 0;
    if (head.y < 0) head.y = this.height - 1;
    if (head.y >= this.height) head.y = 0;
    
    // Check self collision
    if (this.snake.some(s => s.x === head.x && s.y === head.y)) {
      this.gameOver();
      return;
    }
    
    this.snake.unshift(head);
    
    // Check food collision
    if (head.x === this.food.x && head.y === this.food.y) {
      this.score += 10;
      this.spawnFood();
    } else {
      this.snake.pop();
    }
  }
  
  public handleKeyPress(key: ParsedKey): boolean {
    switch (key.name) {
      case 'up':
        if (this.direction.y === 0) {
          this.direction = { x: 0, y: -1 };
        }
        return true;
      case 'down':
        if (this.direction.y === 0) {
          this.direction = { x: 0, y: 1 };
        }
        return true;
      case 'left':
        if (this.direction.x === 0) {
          this.direction = { x: -1, y: 0 };
        }
        return true;
      case 'right':
        if (this.direction.x === 0) {
          this.direction = { x: 1, y: 0 };
        }
        return true;
    }
    return false;
  }
  
  protected renderSelf(buffer: OptimizedBuffer): void {
    // Clear game area
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        buffer.drawText(' ', this.x + x, this.y + y, this.ctx.theme.colors.background);
      }
    }
    
    // Draw snake
    this.snake.forEach((segment, i) => {
      const char = i === 0 ? '◆' : '●';
      const color = i === 0 ? this.ctx.theme.colors.primary : this.ctx.theme.colors.secondary;
      buffer.drawText(char, this.x + segment.x, this.y + segment.y, color);
    });
    
    // Draw food
    buffer.drawText('✦', this.x + this.food.x, this.y + this.food.y, this.ctx.theme.colors.accent);
    
    // Draw score
    const scoreText = `Score: ${this.score}`;
    buffer.drawText(scoreText, this.x, this.y - 1, this.ctx.theme.colors.foreground);
  }
  
  private gameOver(): void {
    clearTimeout(this.gameLoop);
    this.emit('gameover', this.score);
  }
  
  protected destroySelf(): void {
    if (this.gameLoop) {
      clearTimeout(this.gameLoop);
    }
    super.destroySelf();
  }
}

// Usage
const app = auraApp(() => {
  const [gameState, setGameState] = signal<'menu' | 'playing' | 'gameover'>('menu');
  const [highScore, setHighScore] = signal(0);
  
  return [
    aura('box', {
      width: 40,
      height: 25,
      border: true,
      children: [
        gameState() === 'menu' && MenuScreen({
          onStart: () => setGameState('playing')
        }),
        
        gameState() === 'playing' && aura('snake-game', {
          width: 38,
          height: 23,
          onGameover: (score: number) => {
            if (score > highScore()) {
              setHighScore(score);
            }
            setGameState('gameover');
          }
        }),
        
        gameState() === 'gameover' && GameOverScreen({
          score: highScore(),
          onRestart: () => setGameState('playing'),
          onMenu: () => setGameState('menu')
        })
      ]
    })
  ];
});
```

## Summary

The Aura component system provides three levels of component creation:

1. **Composition Components**: Simple, declarative components using existing Aura elements
2. **Hybrid Components**: Mix composition with custom rendering for specific needs
3. **Native Components**: Full control over rendering, animation, and behavior

Key capabilities include:
- Full reactive integration with signals and computed values
- Rich rendering system with frame buffers and direct buffer access
- Complete event handling (mouse, keyboard, focus)
- Built-in animation system with timelines and easing
- Theme integration with state-based styling
- Performance optimizations (virtual scrolling, buffering, pooling)
- Yoga flexbox layout system integration

This architecture enables creating anything from simple UI widgets to complex animated visualizations and even terminal games, all while maintaining excellent performance and developer experience.