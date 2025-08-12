/**
 * Advanced Modules
 * High-level functionality built on top of core terminal primitives
 */


import {
  batch,
  untrack,
  createMemo,
  createStore,
  createSignal,
  createEffect,
  createResource
} from './state.js';

export {
  batch,
  untrack,
  onMount,
  cleanup,
  onCleanup,

  type Store,
  createMemo,
  // Types
  type Signal,
  createStore,
  // Functions
  createSignal,
  createEffect,
  type Computed,
  type Resource,
  createResource,
  type WritableSignal
} from './state.js';


import { animationEngine } from './animation.js';

export {
  patchConsole,
  type LogLevel,
  type PatchOptions,
  consoleInterceptor,
  type ConsoleMessage,
  type ConsoleMethods,

  type MessageHandler,
  createConsoleMessage,
  // Types
  type ConsoleInterceptor,
  // Functions
  createConsoleInterceptor
} from './console.js';

import { layoutEngine } from './layout.js';

export {
  // Constants
  Easing,
  spring,
  animate,
  sequence,
  parallel,

  type Animation,

  animationEngine,
  type SpringOptions,
  type EasingFunction,
  // Types
  type AnimationEngine,
  type AnimationOptions,
  // Functions
  createAnimationEngine
} from './animation.js';

import { renderEngine } from './rendering.js';

export {
  // Enums
  BlendMode,
  type Scene,
  type Layer,
  blendColors,
  renderEngine,
  type Drawable,
  // Classes
  SimpleDrawable,
  createDrawable,
  type DrawContext,
  type ScreenPatch,

  // Types
  type RenderEngine,

  type BatchContext,

  type RenderMetrics,
  type FrameCallback,
  // Functions
  createRenderEngine,
  type RenderOperation
} from './rendering.js';

import { consoleInterceptor } from './console.js';

export {
  measure,
  // Utilities
  formatBytes,
  type Metrics,
  type CPUInfo,
  measureAsync,
  type Profiler,
  startProfiling,
  formatDuration,
  calculateStats,
  type MetricData,
  type MemoryInfo,
  type ProfileData,
  type ProfileMark,

  type CallTreeNode,
  performanceMonitor,
  type ProfileMeasure,
  type ThresholdEvent,
  type ThresholdConfig,

  type ThresholdHandler,
  // Types
  type PerformanceMonitor,
  // Functions
  createPerformanceMonitor
} from './performance.js';

import { performanceMonitor } from './performance.js';

export {
  type Size,
  // Enums
  LayoutType,
  type Layout,
  type Spacing,
  layoutEngine,
  type Position,
  type GridTrack,
  type FlexLayout,
  type GridLayout,
  type AlignItems,
  type LayoutItem,
  // Classes
  SimpleLayoutItem,
  createFlexLayout,
  createGridLayout,
  createDockLayout,
  createWrapLayout,
  // Types
  type LayoutEngine,

  type GridAutoFlow,

  type DockPosition,

  createStackLayout,
  type LayoutOptions,
  type FlexDirection,
  type GridPlacement,
  // Functions
  createLayoutEngine,
  type JustifyContent,
  createAbsoluteLayout,
  type LayoutConstraints
} from './layout.js';

/**
 * Create a complete advanced terminal application context
 */
export function createAdvancedContext() {
  return {
    // State
    state: {
      createSignal,
      createMemo,
      createEffect,
      createResource,
      createStore,
      untrack,
      batch
    },

    // Animation
    animation: animationEngine,

    // Layout
    layout: layoutEngine,

    // Rendering
    render: renderEngine,

    // Console
    console: consoleInterceptor,

    // Performance
    performance: performanceMonitor
  };
}

/**
 * Advanced terminal features type
 */
export interface AdvancedTerminalFeatures {
  readonly state: {
    createSignal: typeof createSignal;
    createMemo: typeof createMemo;
    createEffect: typeof createEffect;
    createResource: typeof createResource;
    createStore: typeof createStore;
    untrack: typeof untrack;
    batch: typeof batch;
  };
  readonly animation: typeof animationEngine;
  readonly layout: typeof layoutEngine;
  readonly render: typeof renderEngine;
  readonly console: typeof consoleInterceptor;
  readonly performance: typeof performanceMonitor;
}