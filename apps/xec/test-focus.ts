#!/usr/bin/env npx tsx
/**
 * Test script to verify sidebar focus handling works correctly
 */

import { auraApp, aura, signal, effect, TextAttributes, type BoxComponent } from "@xec-sh/aura";
import { store } from "vibrancy";

// Create a test store similar to appStore
const testStore = store<{ focused: 'sidebar' | 'workspace' }>({
  focused: 'sidebar'
});

async function testFocusHandling() {
  const app = await auraApp(() => {
    // Create ref for sidebar title
    const sidebarTitleRef = signal<BoxComponent | null>(null);
    
    // Track focus changes
    effect(() => {
      const instance = sidebarTitleRef();
      if (instance) {
        if (testStore.focused === 'sidebar') {
          console.log('✅ Focusing sidebar');
          instance.focus();
        } else {
          console.log('✅ Blurring sidebar');
          instance.blur();
        }
      }
    });
    
    return aura('group', {
      width: '100%',
      height: '100%',
      flexDirection: 'row',
      children: [
        // Sidebar
        aura('box', {
          ref: sidebarTitleRef,
          width: 30,
          height: 10,
          border: ['all'],
          borderColor: 'gray',
          focusedBorderColor: 'green',
          children: [
            aura('text', {
              content: 'Sidebar - Press "s" to focus, "w" to blur',
              fg: 'cyan',
              attributes: TextAttributes.BOLD
            })
          ]
        }),
        // Workspace
        aura('box', {
          width: 30,
          height: 10,
          x: 35,
          border: ['all'],
          borderColor: 'gray',
          children: [
            aura('text', {
              content: 'Workspace',
              fg: 'yellow'
            })
          ]
        }),
        // Instructions
        aura('text', {
          content: 'Press "s" for sidebar focus, "w" for workspace, "q" to quit',
          y: 12,
          fg: 'white'
        })
      ]
    });
  }, {
    onKeyPress: (key) => {
      if (key.name === 's') {
        testStore.focused = 'sidebar';
      } else if (key.name === 'w') {
        testStore.focused = 'workspace';
      } else if (key.name === 'q') {
        app.stop().then(() => {
          console.log('✅ Test completed successfully!');
          process.exit(0);
        });
      }
    }
  });
  
  // Test automatic focus change after 2 seconds
  setTimeout(() => {
    console.log('Auto-switching focus to workspace...');
    testStore.focused = 'workspace';
  }, 2000);
  
  // Switch back after 4 seconds
  setTimeout(() => {
    console.log('Auto-switching focus back to sidebar...');
    testStore.focused = 'sidebar';
  }, 4000);
  
  return app;
}

// Run the test
testFocusHandling().catch(console.error);