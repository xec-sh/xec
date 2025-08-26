#!/usr/bin/env bun
/**
 * Aura Next Demo 1 - Basic Text Component
 * Demonstrates the simplest use of Aura framework
 */

import { aura } from "../src/app/aura.js";
import { TextAttributes } from "../src/types.js";
import { auraApp } from "../src/app/application.js";

async function main() {
  // Create a simple app with text components
  const app = await auraApp(
    [
      // Simple text with green color
      aura('text', {
        content: 'Hello, Aura Next!',
        position: 'absolute',
        left: 2,
        top: 2,
        fg: 'green',
        attributes: TextAttributes.BOLD
      }),

      // Regular text
      aura('text', {
        content: 'This is a simple demo of the Aura framework',
        position: 'absolute',
        left: 2,
        top: 4,
        fg: '#888888'
      }),

      // Text with background color
      aura('text', {
        content: 'Text with background',
        position: 'absolute',
        left: 2,
        top: 6,
        fg: 'white',
        bg: 'blue'
      }),

      // Underlined text
      aura('text', {
        content: 'Underlined text',
        position: 'absolute',
        left: 2,
        top: 8,
        fg: 'yellow',
        attributes: TextAttributes.UNDERLINE
      }),

      // Italic text
      aura('text', {
        content: 'Italic text style',
        position: 'absolute',
        left: 2,
        top: 10,
        fg: 'cyan',
        attributes: TextAttributes.ITALIC
      }),

      // Combined attributes (bold + underline)
      aura('text', {
        content: 'Bold and Underlined',
        position: 'absolute',
        left: 2,
        top: 12,
        fg: 'magenta',
        attributes: TextAttributes.BOLD | TextAttributes.UNDERLINE
      }),

      // Dim text
      aura('text', {
        content: 'This text is dimmed',
        position: 'absolute',
        left: 2,
        top: 14,
        fg: 'white',
        attributes: TextAttributes.DIM
      }),

      // Instructions
      aura('text', {
        content: 'Press Ctrl+C to exit',
        position: 'absolute',
        left: 2,
        top: 16,
        fg: '#666666',
        attributes: TextAttributes.ITALIC | TextAttributes.BLINK
      })
    ],
    {
      renderer: {
        useAlternateScreen: true,
      }
    }
  );

  // The app will handle the event loop and cleanup automatically
  // No need for additional code here
}

main().catch(console.error);