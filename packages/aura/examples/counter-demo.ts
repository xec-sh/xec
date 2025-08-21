#!/usr/bin/env bun
/**
 * Counter Demo - Reactive Component Example
 * 
 * Demonstrates:
 * - Creating a custom counter component
 * - Using reactive signals for state management
 * - Using aura('text') for display
 * - Keyboard interaction for incrementing/decrementing
 * - Computed values for derived state
 */

import { signal, effect, computed } from 'vibrancy';

import { aura } from '../src/app/aura.js';
import { auraApp } from '../src/app/application.js';
import { RGBA, ParsedKey, getKeyHandler, TextAttributes } from '../src/index.js';

import type { AnyAuraElement } from '../src/app/types.js';

/**
 * Custom Counter Component
 * 
 * This component demonstrates:
 * - Internal reactive state (counter signal)
 * - Computed values (display text, statistics)
 * - Side effects (history tracking)
 * - Component composition using aura('text')
 */
function Counter(props?: {
  initialValue?: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}): AnyAuraElement {
  // Props with defaults
  const initialValue = props?.initialValue ?? 0;
  const min = props?.min ?? -100;
  const max = props?.max ?? 100;
  const step = props?.step ?? 1;
  const label = props?.label ?? 'Counter';

  // Reactive state
  const counter = signal(initialValue);
  const history = signal<number[]>([initialValue]);
  const lastOperation = signal<'increment' | 'decrement' | 'reset' | null>(null);

  // Computed values
  const displayValue = computed(() => {
    const value = counter();
    return value.toString().padStart(4, ' ');
  });

  const percentage = computed(() => {
    const value = counter();
    const range = max - min;
    const percent = ((value - min) / range) * 100;
    return Math.round(percent);
  });

  const progressBar = computed(() => {
    const percent = percentage();
    const width = 20;
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  });

  const statistics = computed(() => {
    const hist = history();
    if (hist.length === 0) return { avg: 0, min: 0, max: 0, changes: 0 };

    const sum = hist.reduce((a, b) => a + b, 0);
    const avg = sum / hist.length;
    const minVal = Math.min(...hist);
    const maxVal = Math.max(...hist);

    return {
      avg: avg.toFixed(1),
      min: minVal,
      max: maxVal,
      changes: hist.length - 1
    };
  });

  const statusText = computed(() => {
    const op = lastOperation();
    if (!op) return 'Ready';
    switch (op) {
      case 'increment': return '↑ Incremented';
      case 'decrement': return '↓ Decremented';
      case 'reset': return '↺ Reset';
      default: return 'Ready';
    }
  });

  // Track history
  effect(() => {
    const value = counter();
    const hist = history();
    if (hist[hist.length - 1] !== value) {
      history.set([...hist, value]);
    }
  });

  // Public methods for external control
  const increment = () => {
    const current = counter();
    if (current < max) {
      counter.set(Math.min(current + step, max));
      lastOperation.set('increment');
    }
  };

  const decrement = () => {
    const current = counter();
    if (current > min) {
      counter.set(Math.max(current - step, min));
      lastOperation.set('decrement');
    }
  };

  const reset = () => {
    counter.set(initialValue);
    lastOperation.set('reset');
  };

  const onKeyPress = (key: ParsedKey) => {
    switch (key.name) {
      case 'up':
        // case '=': // Handle both with and without shift
        increment();
        break;
      case 'down':
        decrement();
        break;
      case 'r':
      case 'R':
        reset();
        break;
      default:
        break;
    }
  };

  getKeyHandler().on('keypress', onKeyPress);

  // Build component tree using aura() factory
  return aura('box', {
    // position: 'absolute',
    // left: 2,
    // top: 2,
    width: 'auto',
    height: 20,
    title: label,
    borderStyle: 'rounded',
    borderColor: computed(() => {
      const value = counter();
      if (value === max) return RGBA.fromValues(1, 0, 0, 1); // Red at max
      if (value === min) return RGBA.fromValues(0, 0, 1, 1); // Blue at min
      return RGBA.fromValues(0, 1, 0, 1); // Green normally
    }),
    backgroundColor: RGBA.fromValues(0.05, 0.05, 0.1, 0.9),
    children: [
      // Main counter display
      aura('text', {
        content: computed(() => `Value: ${displayValue()}`),
        fg: RGBA.fromValues(1, 1, 1, 1),
        attributes: TextAttributes.BOLD,
      }),

      // Progress bar
      aura('text', {
        content: computed(() => `Progress: [${progressBar()}] ${percentage()}%`),
        fg: computed(() => {
          const percent = percentage();
          if (percent >= 80) return RGBA.fromValues(1, 0.5, 0, 1); // Orange
          if (percent >= 50) return RGBA.fromValues(1, 1, 0, 1);   // Yellow
          return RGBA.fromValues(0, 1, 0, 1);                       // Green
        })
      }),

      // Range indicator
      aura('text', {
        content: `Range: ${min} to ${max} (step: ${step})`,
        fg: RGBA.fromValues(0.6, 0.6, 0.6, 1)
      }),

      // Status
      aura('text', {
        content: computed(() => `Status: ${statusText()}`),
        fg: computed(() => {
          const op = lastOperation();
          if (op === 'increment') return RGBA.fromValues(0, 1, 0, 1);
          if (op === 'decrement') return RGBA.fromValues(1, 0.5, 0, 1);
          if (op === 'reset') return RGBA.fromValues(0, 0.5, 1, 1);
          return RGBA.fromValues(0.7, 0.7, 0.7, 1);
        })
      }),

      // Statistics
      aura('text', {
        content: 'Statistics:',
        fg: RGBA.fromValues(0.8, 0.8, 0.8, 1),
        attributes: TextAttributes.BOLD,
      }),

      aura('text', {
        content: computed(() => {
          const stats = statistics();
          return `  Average: ${stats.avg}`;
        }),
        fg: RGBA.fromValues(0.6, 0.6, 0.6, 1)
      }),

      aura('text', {
        content: computed(() => {
          const stats = statistics();
          return `  Min: ${stats.min}, Max: ${stats.max}`;
        }),
        fg: RGBA.fromValues(0.6, 0.6, 0.6, 1)
      }),

      aura('text', {
        content: computed(() => {
          const stats = statistics();
          return `  Changes: ${stats.changes}`;
        }),
        fg: RGBA.fromValues(0.6, 0.6, 0.6, 1)
      }),

      // Instructions
      aura('text', {
        content: 'Controls:',
        fg: RGBA.fromValues(0.8, 0.8, 0.8, 1),
        attributes: TextAttributes.BOLD,
      }),

      aura('text', {
        content: '  [+] Increment  [-] Decrement  [r] Reset  [Ctrl+C] Quit',
        fg: RGBA.fromValues(0.5, 0.5, 0.5, 1)
      })
    ]
  });
}

// Main application
async function main() {
  // Create the app with keyboard handlers
  const app = await auraApp(
    Counter({
      initialValue: 0,
      min: -50,
      max: 50,
      step: 1,
      // label: '🔢 Reactive Counter Demo'
      label: 'Reactive Counter Demo'
    }),
    {
      onMount: () => {
        // console.clear();
      },
      onKeyPress: (key: ParsedKey) => {
        if (key.name === "`") {
          app.renderer.console.toggle()
        } else if (key.name === "t") {
          app.renderer.toggleDebugOverlay()
        }
      },
      exitOnCtrlC: true,
      renderer: {
        useConsole: true,
      }
    }
  );
}

// Run the demo
main().catch((error) => {
  console.error('Error running counter demo:', error);
  process.exit(1);
});