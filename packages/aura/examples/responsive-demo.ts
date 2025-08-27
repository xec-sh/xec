#!/usr/bin/env bun
/**
 * Aura Responsive Demo - Using reactive screen dimensions
 * Demonstrates how to use screenWidth() and screenHeight() signals
 * to create responsive terminal layouts
 */

import { 
  aura, 
  auraApp, 
  screenWidth, 
  screenHeight,
  computed,
  effect,
  TextAttributes 
} from "../src/index.js";

async function main() {
  const app = await auraApp(() => {
    // Get reactive screen dimensions
    const width = screenWidth();
    const height = screenHeight();
    
    // Create computed values based on screen size
    const isSmallScreen = computed(() => width() < 80);
    const halfWidth = computed(() => Math.floor(width() / 2));
    const quarterHeight = computed(() => Math.floor(height() / 4));
    
    // Log dimension changes (for debugging)
    effect(() => {
      console.log(`Terminal resized to: ${width()}x${height()}`);
    });
    
    return [
      // Main container that adapts to screen size
      aura('box', {
        width: width,
        height: height,
        borderStyle: 'rounded',
        border: true,
        borderColor: '#00ff00',
        children: [
          // Header showing current dimensions
          aura('text', {
            content: computed(() => `Terminal Size: ${width()}x${height()} | ${isSmallScreen() ? 'Small' : 'Normal'} Screen`),
            position: 'absolute',
            left: 2,
            top: 1,
            fg: 'cyan',
            attributes: TextAttributes.BOLD
          }),
          
          // Left panel - adapts width based on screen size
          aura('box', {
            position: 'absolute',
            left: 2,
            top: 3,
            width: computed(() => isSmallScreen() ? width() - 4 : halfWidth() - 2),
            height: computed(() => height() - 6),
            border: true,
            borderStyle: 'single',
            borderColor: '#ffff00',
            children: [
              aura('text', {
                content: 'Left Panel',
                position: 'absolute',
                left: 1,
                top: 0,
                fg: 'yellow'
              }),
              aura('text', {
                content: computed(() => `Width: ${isSmallScreen() ? width() - 4 : halfWidth() - 2}`),
                position: 'absolute',
                left: 1,
                top: 2,
                fg: '#888888'
              })
            ]
          }),
          
          // Right panel - only visible on larger screens
          ...(!isSmallScreen() ? [aura('box', {
            position: 'absolute',
            left: computed(() => halfWidth() + 1),
            top: 3,
            width: computed(() => halfWidth() - 3),
            height: computed(() => height() - 6),
            border: true,
            borderStyle: 'single',
            borderColor: '#00ffff',
            children: [
              aura('text', {
                content: 'Right Panel',
                position: 'absolute',
                left: 1,
                top: 0,
                fg: 'cyan'
              }),
              aura('text', {
                content: computed(() => `Width: ${halfWidth() - 3}`),
                position: 'absolute',
                left: 1,
                top: 2,
                fg: '#888888'
              })
            ]
          })] : []),
          
          // Status bar at bottom
          aura('text', {
            content: 'Press Ctrl+C to exit | Try resizing your terminal!',
            position: 'absolute',
            left: 2,
            top: computed(() => height() - 2),
            fg: '#666666',
            attributes: TextAttributes.ITALIC
          })
        ]
      })
    ];
  }, {
    renderer: {
      useAlternateScreen: true,
    }
  });
  
  return app;
}

// Run the demo
if (import.meta.main) {
  main().catch(console.error);
}