#!/usr/bin/env bun
/**
 * Type inference test - Verifying that all component types work correctly
 */

import { aura } from "../src/app/aura.js";
import { auraApp } from "../src/app/application.js";
import { RGBA, TextAttributes } from "../src/types.js";

async function main() {
  // Test mixed component types in array
  const app = await auraApp(
    [
      aura('text', {
        content: 'Text Component Test',
        position: 'absolute',
        left: 2,
        top: 0,
        fg: 'green',
        attributes: TextAttributes.BOLD
      }),

      // Box component
      aura('box', {
        position: 'absolute',
        left: 2,
        top: 2,
        width: "100%",
        height: 5,
        title: 'Box Component',
        titleAlignment: 'center',
        borderStyle: 'rounded',
        backgroundColor: RGBA.fromValues(0.1, 0.1, 0.2, 1),
        children: [
          aura('text', {
            content: 'Text inside box',
            left: 1,
            top: 1,
            fg: 'yellow'
          })
        ]
      }),

      // Input component
      aura('input', {
        position: 'absolute',
        left: 2,
        top: 10,
        width: 30,
        placeholder: 'Type here...',
        textColor: 'white',
        backgroundColor: RGBA.fromValues(0.1, 0.1, 0.1, 1)
      }),

      // Select component
      aura('select', {
        position: 'absolute',
        left: 2,
        top: 12,
        width: 30,
        options: [{ name: 'Option 1', description: '' }, { name: 'Option 2', description: '' }, { name: 'Option 3', description: '' }],
        textColor: 'cyan'
      }),

      // Group component with children
      aura('group', {
        position: 'absolute',
        left: 35,
        top: 2,
        children: [
          aura('text', {
            content: 'Group Item 1',
            position: 'absolute',
            top: 0
          }),
          aura('text', {
            content: 'Group Item 2',
            position: 'absolute',
            top: 1
          })
        ]
      }),

      // Instructions
      aura('text', {
        content: 'Type Inference Test - All components working! Press Ctrl+C to exit',
        position: 'absolute',
        left: 2,
        top: 15,
        fg: '#888888'
      })
    ]
  );

  // Test updating children after creation
  setTimeout(() => {
    app.updateChildren([
      aura('text', {
        content: 'Updated content after 2 seconds!',
        position: 'absolute',
        left: 2,
        top: 2,
        fg: 'magenta',
        attributes: TextAttributes.BOLD
      }),
      aura('text', {
        content: 'Press Ctrl+C to exit',
        position: 'absolute',
        left: 2,
        top: 4,
        fg: '#666666'
      })
    ]);
  }, 50000);
}

main().catch(console.error);