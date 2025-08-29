# Aura Terminal Theming System Specification

## Executive Summary

The Aura theming system provides a unified approach to terminal component styling that respects the constraints of terminal environments. It focuses on color management, border styles, and text attributes - the core capabilities available in modern terminal emulators.

## Core Principles

1. **Terminal-First**: Designed specifically for terminal constraints and capabilities
2. **Color-Centric**: Focus on color tokens as the primary theming mechanism
3. **State-Based**: Support for interactive states (focused, selected, disabled)
4. **Semantic**: Use meaningful names instead of raw color values
5. **Type-safe**: Full TypeScript support with autocomplete
6. **Performance**: Minimal overhead for theme application

## Architecture Overview

### 1. Theme Object Structure

```typescript
interface AuraTheme {
  // Semantic color tokens
  colors: {
    // Base colors
    background: Color;       // Default background
    foreground: Color;       // Default text
    primary: Color;          // Primary brand color
    secondary: Color;        // Secondary brand color
    accent: Color;           // Accent/highlight color
    muted: Color;            // Subdued elements
    
    // Semantic colors
    success: Color;          // Success states
    warning: Color;          // Warning states
    error: Color;            // Error states
    info: Color;             // Informational
    
    // Interactive states
    focus: Color;            // Focused element border/highlight
    selected: Color;         // Selected item background
    disabled: Color;         // Disabled element color
    
    // UI elements
    border: Color;           // Default border color
    selection: Color;        // Text selection background
    placeholder: Color;      // Input placeholder text
    cursor: Color;           // Text cursor color
    description: Color;      // Secondary/description text
  };
  
  // Text attributes (terminal capabilities)
  textAttributes: {
    bold?: boolean;          // Bold text support
    italic?: boolean;        // Italic text support
    underline?: boolean;     // Underline support
    strikethrough?: boolean; // Strikethrough support
  };
  
  // Border styles (box-drawing characters)
  borders: {
    default: BorderStyle;    // 'single' | 'double' | 'bold' | 'rounded' | 'none'
    focused?: BorderStyle;   // Style when focused
  };
  
  // Component-specific overrides (optional)
  components?: {
    box?: Partial<BoxTheme>;
    select?: Partial<SelectTheme>;
    input?: Partial<InputTheme>;
    tabs?: Partial<TabsTheme>;
    text?: Partial<TextTheme>;
  };
}
```

### 2. Component Theme Structure

Each component has a simplified theme interface that maps semantic tokens to component states:

```typescript
interface SelectTheme {
  // Base styling
  background: ColorToken;
  text: ColorToken;
  border?: ColorToken;
  
  // State variants
  states: {
    focused?: {
      background?: ColorToken;
      text?: ColorToken;
      border?: ColorToken;
    };
    selected?: {
      background?: ColorToken;
      text?: ColorToken;
    };
    disabled?: {
      background?: ColorToken;
      text?: ColorToken;
    };
  };
  
  // Sub-element styling
  elements?: {
    description?: {
      text: ColorToken;
      selectedText?: ColorToken;
    };
    indicator?: {
      text: ColorToken;
      symbol?: string;
    };
    scrollbar?: {
      track?: ColorToken;
      thumb?: ColorToken;
    };
  };
}
```

### 3. Theme Application

#### Global Theme Provider

```typescript
// Create a theme
const darkTheme = createTheme({
  colors: {
    background: '#1a1a1a',
    foreground: '#ffffff',
    primary: '#00aaff',
    secondary: '#ff6b6b',
    accent: '#4ecdc4',
    border: '#333333',
    selection: '#334455',
    focus: '#00aaff',
    selected: '#334455',
    disabled: '#666666',
    placeholder: '#888888',
    cursor: '#ffffff',
    description: '#aaaaaa'
  },
  textAttributes: {
    bold: true,
    italic: true,
    underline: true
  },
  borders: {
    default: 'single',
    focused: 'double'
  }
});

// Apply theme to application
const app = await auraApp(
  () => App(),
  { 
    theme: darkTheme,
    renderer: { ... }
  }
);
```

#### Component-level Theme Override

```typescript
// Using theme tokens
aura('select', {
  theme: {
    background: 'surface',     // Use theme token
    text: 'foreground',
    states: {
      focused: {
        border: 'primary'       // Semantic token
      },
      selected: {
        background: 'selection',
        text: 'accent'
      }
    }
  },
  // Other props...
});

// Direct color override (escape hatch)
aura('select', {
  theme: {
    background: RGBA.fromHex('#2a2a2a'), // Direct color
    text: 'foreground'  // Mix direct and tokens
  }
});
```

### 4. Context-based Theming

Themes cascade through the component tree using React-like context:

```typescript
// Theme provider component
aura('theme-provider', {
  theme: customTheme,
  children: [
    // All children inherit this theme
    aura('box', { theme: 'surface' }), // Uses customTheme.surface
    
    // Nested theme provider
    aura('theme-provider', {
      theme: { colors: { primary: '#ff0000' } }, // Partial override
      children: [
        aura('button', { theme: 'primary' }) // Uses red primary
      ]
    })
  ]
});
```

### 5. State-Based Theming

Components automatically apply theme colors based on their state:

```typescript
interface StateBasedColors {
  default: {
    background: ColorToken;
    foreground: ColorToken;
    border?: ColorToken;
  };
  focused?: {
    background?: ColorToken;
    foreground?: ColorToken;
    border?: ColorToken;
  };
  selected?: {
    background?: ColorToken;
    foreground?: ColorToken;
  };
  disabled?: {
    background?: ColorToken;
    foreground?: ColorToken;
  };
}

// Usage
aura('select', {
  theme: {
    default: {
      background: 'background',
      foreground: 'foreground',
      border: 'border'
    },
    focused: {
      border: 'focus'
    },
    selected: {
      background: 'selected',
      foreground: 'accent'
    }
  }
});
```

### 6. Terminal-Specific Features

#### Border Styles

Terminals support various box-drawing character sets:

```typescript
type BorderStyle = 
  | 'single'   // ┌─┐│└┘
  | 'double'   // ╔═╗║╚╝
  | 'rounded'  // ╭─╮│╰╯
  | 'bold'     // ┏━┓┃┗┛
  | 'ascii'    // +-+|++
  | 'none';    // No border

// Custom border characters
interface BorderCharacters {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
  // Optional connectors
  horizontalDown?: string;
  horizontalUp?: string;
  verticalLeft?: string;
  verticalRight?: string;
  cross?: string;
}
```

#### Text Attributes

Terminal text styling capabilities:

```typescript
interface TextAttributes {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  dim?: boolean;
  inverse?: boolean;
  hidden?: boolean;
  blink?: boolean;
}

// Usage
aura('text', {
  content: 'Important',
  attributes: {
    bold: true,
    underline: true
  },
  fg: 'error'
});
```

## Implementation Plan

### Phase 1: Core Theme System
1. Create theme object structure with terminal-appropriate properties
2. Implement `createTheme()` function with color validation
3. Add theme context to Application class
4. Create theme access utilities

### Phase 2: Component Migration
1. Update components to use semantic color tokens:
   - BoxComponent: backgroundColor, borderColor, focusedBorderColor
   - SelectComponent: item states (normal, focused, selected)
   - InputComponent: placeholder, cursor, focused states
   - TabsComponent: tab states, scroll indicators
   - TextComponent: foreground, background, selection
2. Maintain backward compatibility during transition
3. Standardize color prop names across components

### Phase 3: State Management
1. Implement automatic state-based color application
2. Add focus management with theme integration
3. Create disabled state rendering
4. Handle selection states consistently

### Phase 4: Terminal Capabilities
1. Detect terminal capabilities (RGB support, Unicode)
2. Implement fallbacks for limited terminals
3. Add ASCII-only border style fallbacks
4. Create color quantization for 256-color terminals

## Migration Strategy

### Current Component Color Props

Existing components use individual color props that will be migrated to theme tokens:

```typescript
// Current API (will be maintained for compatibility)
aura('select', {
  backgroundColor: '#1a1a1a',
  textColor: '#ffffff',
  focusedBackgroundColor: '#2a2a2a',
  focusedTextColor: '#ffffff',
  selectedBackgroundColor: '#334455',
  selectedTextColor: '#ffff00',
  descriptionColor: '#888888',
  selectedDescriptionColor: '#cccccc'
});

// Future themed API
aura('select', {
  theme: {
    default: {
      background: 'background',
      foreground: 'foreground',
      description: 'description'
    },
    focused: {
      background: 'muted',
      foreground: 'foreground'
    },
    selected: {
      background: 'selected',
      foreground: 'accent',
      description: 'foreground'
    }
  }
});
```

### Progressive Enhancement

1. **Stage 1**: Add theme support alongside existing props
2. **Stage 2**: Deprecate individual color props with warnings
3. **Stage 3**: Remove deprecated props in major version

## Usage Examples

### Example 1: Terminal Color Theme

```typescript
// Define a terminal-optimized theme
const terminalTheme = createTheme({
  colors: {
    // Base colors
    background: RGBA.fromHex('#0a0a0a'),
    foreground: RGBA.fromHex('#e0e0e0'),
    
    // Brand colors
    primary: RGBA.fromHex('#00aaff'),
    secondary: RGBA.fromHex('#ff6b6b'),
    accent: RGBA.fromHex('#4ecdc4'),
    
    // UI elements
    border: RGBA.fromHex('#333333'),
    focus: RGBA.fromHex('#00aaff'),
    selected: RGBA.fromHex('#1e3a5f'),
    disabled: RGBA.fromHex('#666666'),
    
    // Semantic
    error: RGBA.fromHex('#ff4444'),
    warning: RGBA.fromHex('#ffaa00'),
    success: RGBA.fromHex('#00ff88'),
    info: RGBA.fromHex('#00aaff'),
    
    // Text
    placeholder: RGBA.fromHex('#888888'),
    description: RGBA.fromHex('#aaaaaa'),
    cursor: RGBA.fromHex('#ffffff')
  },
  borders: {
    default: 'single',
    focused: 'double'
  }
});
```

### Example 2: State-Based Component Theming

```typescript
// Box component with focus state
aura('box', {
  title: 'Settings',
  backgroundColor: theme.colors.background,
  borderColor: theme.colors.border,
  focusedBorderColor: theme.colors.focus,
  borderStyle: 'single',
  border: true
});

// Select with comprehensive theming
aura('select', {
  backgroundColor: theme.colors.background,
  textColor: theme.colors.foreground,
  focusedBackgroundColor: theme.colors.muted,
  selectedBackgroundColor: theme.colors.selected,
  selectedTextColor: theme.colors.accent,
  descriptionColor: theme.colors.description,
  options: items
});

// Input with cursor theming
aura('input', {
  backgroundColor: 'transparent',
  textColor: theme.colors.foreground,
  placeholderColor: theme.colors.placeholder,
  cursorColor: theme.colors.cursor,
  focusedBackgroundColor: theme.colors.muted
});
```

### Example 3: ASCII Art Fonts with Theming

```typescript
// ASCII font component with gradient colors
aura('ascii-font', {
  text: 'AURA',
  font: 'block',
  fg: [
    theme.colors.primary,
    theme.colors.accent,
    theme.colors.secondary
  ],
  bg: 'transparent'
});

// Text component with selection colors
aura('text', {
  content: 'Selectable text content',
  fg: theme.colors.foreground,
  bg: theme.colors.background,
  selectionBg: theme.colors.selection,
  selectionFg: theme.colors.foreground,
  selectable: true,
  attributes: {
    bold: true
  }
});
```

## Benefits

1. **Terminal Optimization**: Designed specifically for terminal constraints
2. **Color Consistency**: Unified color management across all components
3. **State Management**: Automatic handling of focus, selection, and disabled states
4. **Maintainability**: Single source of truth for application colors
5. **Type Safety**: Full TypeScript support with proper types
6. **Performance**: Minimal overhead, respects terminal rendering capabilities

## Preset Themes

### Terminal-Optimized Themes

```typescript
// Built-in terminal themes
const themes = {
  // Dark themes
  dark: createTheme({
    colors: {
      background: '#1a1a1a',
      foreground: '#e0e0e0',
      primary: '#00aaff',
      // ...
    },
    borders: { default: 'single' }
  }),
  
  // Light theme (for terminals with light backgrounds)
  light: createTheme({
    colors: {
      background: '#ffffff',
      foreground: '#2a2a2a',
      primary: '#0066cc',
      // ...
    },
    borders: { default: 'single' }
  }),
  
  // High contrast for accessibility
  highContrast: createTheme({
    colors: {
      background: '#000000',
      foreground: '#ffffff',
      primary: '#ffff00',
      border: '#ffffff',
      // ...
    },
    borders: { default: 'double' }
  }),
  
  // Popular terminal themes
  dracula: createTheme({ /* Dracula colors */ }),
  nord: createTheme({ /* Nord colors */ }),
  solarized: createTheme({ /* Solarized colors */ })
};
```

## Terminal Constraints & Considerations

### What Terminals Can't Do
1. **Typography**: No font family, size, or line-height changes
2. **Border Radius**: Only straight lines with box-drawing characters
3. **Shadows**: No drop shadows or elevation effects
4. **Gradients**: Limited to ASCII art character-based effects
5. **Animations**: Limited to character/color changes, no smooth transitions
6. **Spacing**: Fixed character grid, no sub-character positioning

### What Terminals Can Do Well
1. **Colors**: Full RGB support in modern terminals
2. **Box Drawing**: Rich set of border and line characters
3. **Text Attributes**: Bold, italic, underline, etc.
4. **Unicode**: Emoji and special characters (terminal-dependent)
5. **Cursor Control**: Multiple cursor styles and colors
6. **Alt Screen**: Separate screen buffer for full-screen apps

## Future Enhancements

1. **Terminal Detection**: Auto-detect capabilities and adjust theme
2. **Color Schemes**: Import from popular terminal themes (Dracula, Nord, etc.)
3. **Contrast Modes**: High contrast variants for accessibility
4. **ASCII Fallbacks**: Automatic degradation for limited terminals
5. **Theme Testing**: Validate themes across different terminal emulators
6. **Performance Monitoring**: Track render performance with different themes

## Conclusion

The Aura theming system is purpose-built for terminal applications, respecting both the constraints and unique capabilities of terminal environments. By focusing on what terminals do well - colors, text attributes, and box-drawing characters - the system provides a practical and efficient theming solution.

Rather than trying to emulate web or GUI theming systems, this specification embraces the terminal medium, providing developers with tools that work reliably across different terminal emulators while maintaining excellent performance and visual consistency.

The system makes it simple to create cohesive terminal UIs with consistent colors and styles, while the semantic token approach ensures that theme changes can be applied globally without touching component code.