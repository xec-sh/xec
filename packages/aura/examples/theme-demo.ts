#!/usr/bin/env -S npx tsx --env-file=../.env.local
/**
 * Aura Terminal Theming System Demo
 * Showcases Phase 1, 2, and 3 of the theming specification
 * 
 * Features demonstrated:
 * - Theme creation and configuration (Phase 1)
 * - Component theming with semantic tokens (Phase 2)
 * - State-based color application: focused, selected, disabled (Phase 3)
 * - Theme switching at runtime
 * - Preset themes
 */

import { signal, computed } from "vibrancy";
import { aura, auraApp } from "../src/app/index.js";
import { createTheme, themes } from "../src/theme/index.js";
import { RGBA } from "../src/lib/colors.js";
import { TextAttributes } from "../src/types.js";

// Create a custom Tokyo Night theme
const tokyoNightTheme = createTheme({
  colors: {
    background: RGBA.fromHex('#1a1b26'),
    foreground: RGBA.fromHex('#c0caf5'),
    primary: RGBA.fromHex('#7aa2f7'),
    secondary: RGBA.fromHex('#bb9af7'),
    accent: RGBA.fromHex('#7dcfff'),
    muted: RGBA.fromHex('#414868'),
    
    // Semantic colors
    success: RGBA.fromHex('#9ece6a'),
    warning: RGBA.fromHex('#e0af68'),
    error: RGBA.fromHex('#f7768e'),
    info: RGBA.fromHex('#7aa2f7'),
    
    // Interactive states
    focus: RGBA.fromHex('#7aa2f7'),
    selected: RGBA.fromHex('#364a82'),
    disabled: RGBA.fromHex('#565f89'),
    
    // UI elements
    border: RGBA.fromHex('#414868'),
    selection: RGBA.fromHex('#283457'),
    placeholder: RGBA.fromHex('#565f89'),
    cursor: RGBA.fromHex('#c0caf5'),
    description: RGBA.fromHex('#9699a8')
  },
  borders: {
    default: 'rounded',
    focused: 'double'
  },
  textAttributes: {
    bold: true,
    italic: true,
    underline: true
  }
});

// State management
const currentThemeIndex = signal(0);
const availableThemes = [
  { name: 'Tokyo Night', theme: tokyoNightTheme },
  { name: 'Dark', theme: themes.dark },
  { name: 'Light', theme: themes.light },
  { name: 'High Contrast', theme: themes.highContrast }
];

const disabledStates = signal({
  box: false,
  select: false,
  input: false,
  tabs: false
});

const selectedComponent = signal(0);

// Create the demo application
function DemoApp() {
  return aura('box', {
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    padding: 1,
    children: [
      // Header
      aura('box', {
        height: 3,
        border: true,
        title: ' 🎨 Aura Terminal Theming - Phase 3 Demo ',
        theme: {
          background: 'background',
          border: 'primary',
          states: {
            focused: { border: 'accent' }
          }
        },
        children: [
          aura('text', {
            content: 'Theme System with State Management (focused, selected, disabled)',
            fg: 'foreground',
            attributes: TextAttributes.BOLD
          })
        ]
      }),
      
      // Theme selector
      aura('box', {
        height: 5,
        marginTop: 1,
        border: true,
        title: ' Theme Selection ',
        theme: {
          background: 'background',
          border: 'border'
        },
        children: [
          aura('tabs', {
            id: 'theme-tabs',
            theme: {
              background: 'background',
              foreground: 'foreground',
              states: {
                hover: {
                  background: 'muted',
                  foreground: 'foreground'
                },
                active: {
                  background: 'selected',
                  foreground: 'accent'
                }
              }
            },
            options: availableThemes.map((t, i) => ({
              name: t.name,
              description: 'Press Enter to apply',
              value: i
            })),
            onKeyDown: (key) => {
              if (typeof key !== 'string' && key.name === 'enter') {
                const nextIndex = (currentThemeIndex() + 1) % availableThemes.length;
                currentThemeIndex.set(nextIndex);
              }
            }
          })
        ]
      }),
      
      // Main content
      aura('box', {
        flexGrow: 1,
        flexDirection: 'row',
        marginTop: 1,
        children: [
          // Control panel
          aura('box', {
            width: 35,
            border: true,
            title: ' State Controls ',
            theme: {
              background: 'background',
              border: 'border',
              states: {
                focused: { border: 'focus' }
              }
            },
            children: [
              aura('text', {
                content: 'Toggle disabled states:',
                fg: 'description',
                marginBottom: 1
              }),
              aura('select', {
                id: 'state-control',
                theme: {
                  background: 'background',
                  text: 'foreground',
                  states: {
                    focused: {
                      background: 'muted'
                    },
                    selected: {
                      background: 'selected',
                      foreground: 'accent'
                    }
                  },
                  elements: {
                    description: {
                      text: 'description',
                      selectedText: 'foreground'
                    }
                  }
                },
                options: computed(() => [
                  { 
                    name: 'Box Component', 
                    description: disabledStates().box ? '❌ Disabled' : '✅ Enabled' 
                  },
                  { 
                    name: 'Select Component', 
                    description: disabledStates().select ? '❌ Disabled' : '✅ Enabled' 
                  },
                  { 
                    name: 'Input Component', 
                    description: disabledStates().input ? '❌ Disabled' : '✅ Enabled' 
                  },
                  { 
                    name: 'Tabs Component', 
                    description: disabledStates().tabs ? '❌ Disabled' : '✅ Enabled' 
                  }
                ]),
                showDescription: true,
                indicator: '▶',
                onKeyDown: (key) => {
                  if (typeof key !== 'string' && key.name === 'enter') {
                    const keys = Object.keys(disabledStates()) as Array<keyof ReturnType<typeof disabledStates>>;
                    const idx = selectedComponent();
                    if (idx < keys.length) {
                      disabledStates.set({
                        ...disabledStates(),
                        [keys[idx]]: !disabledStates()[keys[idx]]
                      });
                    }
                  }
                }
              })
            ]
          }),
          
          // Component showcase
          aura('box', {
            flexGrow: 1,
            flexDirection: 'column',
            children: [
              // Box demo
              aura('box', {
                height: 6,
                border: true,
                title: ' Box Component Demo ',
                disabled: computed(() => disabledStates().box),
                theme: {
                  background: 'background',
                  border: 'border',
                  states: {
                    focused: {
                      border: 'primary'
                    },
                    disabled: {
                      background: 'muted',
                      border: 'disabled'
                    }
                  }
                },
                children: [
                  aura('text', {
                    content: computed(() => 
                      disabledStates().box
                        ? '⚠️  Box is disabled - colors and focus are affected'
                        : '✨ Box is enabled - Tab to focus and see border change'
                    ),
                    fg: computed(() => disabledStates().box ? 'disabled' : 'foreground')
                  })
                ]
              }),
              
              // Select demo
              aura('box', {
                height: 8,
                border: true,
                title: ' Select Component Demo ',
                children: [
                  aura('select', {
                    disabled: computed(() => disabledStates().select),
                    theme: {
                      background: 'background',
                      text: 'foreground',
                      states: {
                        focused: {
                          background: 'muted'
                        },
                        selected: {
                          background: 'selected',
                          foreground: 'accent'
                        },
                        disabled: {
                          background: 'muted',
                          foreground: 'disabled'
                        }
                      }
                    },
                    options: [
                      { name: 'Item 1', description: 'First item' },
                      { name: 'Item 2', description: 'Second item' },
                      { name: 'Item 3', description: 'Third item' }
                    ],
                    showDescription: true,
                    indicator: computed(() => disabledStates().select ? '○' : '●')
                  })
                ]
              }),
              
              // Input demo
              aura('box', {
                height: 4,
                border: true,
                title: ' Input Component Demo ',
                children: [
                  aura('input', {
                    disabled: computed(() => disabledStates().input),
                    placeholder: computed(() => 
                      disabledStates().input 
                        ? 'Input is disabled...' 
                        : 'Type here...'
                    ),
                    theme: {
                      background: 'background',
                      foreground: 'foreground',
                      placeholder: 'placeholder',
                      cursor: 'cursor',
                      states: {
                        focused: {
                          background: 'muted'
                        },
                        disabled: {
                          background: 'muted',
                          foreground: 'disabled'
                        }
                      }
                    }
                  })
                ]
              }),
              
              // Tabs demo
              aura('box', {
                height: 5,
                border: true,
                title: ' Tabs Component Demo ',
                children: [
                  aura('tabs', {
                    disabled: computed(() => disabledStates().tabs),
                    theme: {
                      background: 'background',
                      foreground: 'foreground',
                      states: {
                        hover: {
                          background: 'muted'
                        },
                        active: {
                          background: 'selected',
                          foreground: 'accent'
                        },
                        disabled: {
                          background: 'muted',
                          foreground: 'disabled'
                        }
                      }
                    },
                    options: [
                      { name: 'Tab A', description: 'Alpha' },
                      { name: 'Tab B', description: 'Beta' },
                      { name: 'Tab C', description: 'Gamma' }
                    ]
                  })
                ]
              })
            ]
          })
        ]
      }),
      
      // Footer
      aura('box', {
        height: 3,
        border: true,
        theme: {
          background: 'muted',
          border: 'border'
        },
        children: [
          aura('text', {
            content: '💡 Tab: Navigate | Enter: Toggle states/themes | ↑↓: Select items | Ctrl+C: Exit',
            fg: 'description'
          })
        ]
      })
    ]
  });
}

// Run the application
async function main() {
  const app = await auraApp(
    DemoApp,
    {
      theme: tokyoNightTheme,
      exitOnCtrlC: true,
      onUpdate: () => {
        // Apply theme changes
        const currentTheme = availableThemes[currentThemeIndex()];
        app.setTheme(currentTheme.theme);
      }
    }
  );
  
  console.log('🎨 Theme demo started. Press Ctrl+C to exit.');
}

main().catch(console.error);