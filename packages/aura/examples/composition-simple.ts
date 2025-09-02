#!/usr/bin/env tsx
/**
 * Simple Composition Example
 * Shows how to use the enhanced aura() function with composition helpers
 */

import { auraApp, aura, Box, Text, VStack, HStack, Center } from '../src/index.js';

async function main() {
  const app = await auraApp(() => {
    // Using the enhanced aura() function with children as rest parameters
    return aura('box', { 
      padding: 2,
      flexDirection: 'column',
      gap: 1 
    },
      // Title using composition helper
      Center({ width: '100%' },
        Text({ 
          value: '🎨 Aura Composition Example',
          bold: true,
          color: 'primary'
        })
      ),
      
      // Using VStack helper (vertical stack)
      VStack({ gap: 1, padding: 1, borderStyle: 'single' },
        Text({ value: '✓ Enhanced aura() function' }),
        Text({ value: '✓ Composition helpers (VStack, HStack, Center)' }),
        Text({ value: '✓ Children as rest parameters' }),
        Text({ value: '✓ Clean, declarative API' })
      ),
      
      // Using HStack helper (horizontal stack)
      HStack({ gap: 2, justifyContent: 'center', marginTop: 1 },
        Box({ 
          padding: 1, 
          borderStyle: 'rounded',
          backgroundColor: 'primary'
        },
          Text({ value: 'Card 1', color: 'white' })
        ),
        Box({ 
          padding: 1, 
          borderStyle: 'rounded',
          backgroundColor: 'secondary'
        },
          Text({ value: 'Card 2', color: 'white' })
        ),
        Box({ 
          padding: 1, 
          borderStyle: 'rounded',
          backgroundColor: 'accent'
        },
          Text({ value: 'Card 3', color: 'white' })
        )
      ),
      
      // Direct children without array wrapping
      aura('text', { 
        value: 'Press Q to quit',
        color: 'muted',
        marginTop: 2,
        align: 'center'
      })
    );
  }, {
    onKeyPress(key) {
      if (key.name === 'q') {
        process.exit(0);
      }
    }
  });
}

main().catch(console.error);