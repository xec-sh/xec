#!/usr/bin/env tsx
/**
 * Enhanced Aura Demo
 * Demonstrates the improved composition API with reactive features
 */

import { 
  auraApp, 
  Box, 
  Text, 
  VStack, 
  HStack, 
  Center,
  ScrollBox,
  Table,
  signal,
  computed,
  For
} from '../src/index.js';

// Create reactive state
const count = signal(0);
const items = signal([
  { id: 1, name: 'Item 1', value: 100 },
  { id: 2, name: 'Item 2', value: 200 },
  { id: 3, name: 'Item 3', value: 300 },
]);

// Computed values
const total = computed(() => 
  items().reduce((sum, item) => sum + item.value, 0)
);

const countMessage = computed(() => `Count: ${count()}`);

async function main() {
  const app = await auraApp(() => {
    return VStack({ padding: 1, gap: 1 },
      // Header
      Center({ 
        backgroundColor: 'primary',
        padding: 1,
        borderStyle: 'rounded'
      },
        Text({ 
          value: '✨ Enhanced Aura Demo',
          bold: true,
          color: 'white'
        })
      ),
      
      // Counter section
      Box({ 
        title: 'Reactive Counter',
        borderStyle: 'single',
        padding: 1
      },
        HStack({ gap: 2 },
          Text({ value: countMessage }),
          Text({ 
            value: computed(() => count() > 5 ? '🔥 Hot!' : '❄️ Cold'),
            color: computed(() => count() > 5 ? 'error' : 'info')
          })
        )
      ),
      
      // Items table
      Box({ 
        title: 'Dynamic Table',
        borderStyle: 'single',
        padding: 1,
        height: 10
      },
        ScrollBox({ width: '100%', height: '100%' },
          Table({
            columns: [
              { key: 'id', title: 'ID', width: 10 },
              { key: 'name', title: 'Name', width: 20 },
              { key: 'value', title: 'Value', width: 15, align: 'right' }
            ],
            rows: computed(() => items()),
            footerRows: [
              { id: 'total', name: 'Total', value: total() }
            ],
            showBorder: true,
            showHeader: true,
            showRowDividers: true
          })
        )
      ),
      
      // Status bar
      HStack({ 
        backgroundColor: 'muted',
        padding: 1,
        justifyContent: 'space-between'
      },
        Text({ 
          value: `Items: ${computed(() => items().length)}`,
          color: 'mutedForeground'
        }),
        Text({ 
          value: `Total: ${total}`,
          color: 'mutedForeground',
          bold: true
        })
      )
    );
  }, {
    onKeyPress(key) {
      if (key.name === 'up') {
        count.set(count() + 1);
      } else if (key.name === 'down') {
        count.set(Math.max(0, count() - 1));
      } else if (key.name === 'a') {
        items.set([
          ...items(),
          { 
            id: items().length + 1, 
            name: `Item ${items().length + 1}`, 
            value: Math.floor(Math.random() * 500) 
          }
        ]);
      } else if (key.name === 'd' && items().length > 0) {
        items.set(items().slice(0, -1));
      } else if (key.name === 'q') {
        process.exit(0);
      }
    },
    renderer: {
      useAlternateScreen: true
    }
  });
  
  // Start a timer to auto-increment
  setInterval(() => {
    count.set(count() + 1);
  }, 2000);
  
  console.log('Press ↑/↓ to change counter, A to add item, D to delete item, Q to quit');
}

main().catch(console.error);