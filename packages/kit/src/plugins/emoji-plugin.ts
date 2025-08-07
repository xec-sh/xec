/**
 * @module plugins/emoji-plugin
 * Emoji plugin for Kit - adds emoji support and emoji picker component
 */

import { Prompt } from '../core/prompt.js';

import type { KitPlugin } from './plugin.js';
import type { Key, PromptConfig } from '../core/types.js';

/**
 * Emoji map for common emoji names
 */
const emojiMap: Record<string, string> = {
  // Smileys
  smile: '😊',
  laugh: '😂',
  wink: '😉',
  heart: '❤️',
  love: '😍',
  cool: '😎',
  sad: '😢',
  angry: '😡',
  think: '🤔',

  // Status
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  question: '❓',
  exclamation: '❗',

  // Actions
  wave: '👋',
  clap: '👏',
  thumbsup: '👍',
  thumbsdown: '👎',
  point: '👉',
  ok: '👌',

  // Objects
  fire: '🔥',
  star: '⭐',
  rocket: '🚀',
  clock: '🕐',
  bell: '🔔',
  lock: '🔒',
  key: '🔑',
  mail: '✉️',

  // Tech
  computer: '💻',
  phone: '📱',
  folder: '📁',
  file: '📄',
  package: '📦',
  bug: '🐛',
  gear: '⚙️',
  tool: '🔧',
};

/**
 * Emoji categories
 */
const emojiCategories = {
  smileys: ['smile', 'laugh', 'wink', 'heart', 'love', 'cool', 'sad', 'angry', 'think'],
  status: ['success', 'error', 'warning', 'info', 'question', 'exclamation'],
  actions: ['wave', 'clap', 'thumbsup', 'thumbsdown', 'point', 'ok'],
  objects: ['fire', 'star', 'rocket', 'clock', 'bell', 'lock', 'key', 'mail'],
  tech: ['computer', 'phone', 'folder', 'file', 'package', 'bug', 'gear', 'tool'],
};

/**
 * Options for emoji picker
 */
interface EmojiPickerOptions {
  categories?: (keyof typeof emojiCategories)[];
  showNames?: boolean;
  columns?: number;
}

/**
 * Emoji picker prompt
 */
class EmojiPickerPrompt extends Prompt<string, EmojiPickerOptions> {
  private categories: (keyof typeof emojiCategories)[];
  private allEmojis: Array<{ name: string; emoji: string }> = [];
  private selectedIndex = 0;
  private selectedCategory = 0;
  private showNames: boolean;
  private columns: number;

  constructor(config: PromptConfig<string, EmojiPickerOptions> & EmojiPickerOptions) {
    super(config);

    this.categories = config.categories || Object.keys(emojiCategories) as (keyof typeof emojiCategories)[];
    this.showNames = config.showNames ?? true;
    this.columns = config.columns || 6;

    // Build emoji list
    for (const category of this.categories) {
      const names = emojiCategories[category];
      for (const name of names) {
        this.allEmojis.push({ name, emoji: emojiMap[name] || '❓' });
      }
    }
  }

  render(): string {
    const ctx = this.getRenderContext();
    const { message } = this.config;
    const { status } = this.state.getState();

    let output = '';

    // Message
    output += ctx.theme.formatters.highlight(message) + '\n\n';

    if (status === 'submitted') {
      const selected = this.allEmojis[this.selectedIndex];
      if (selected) {
        output += selected.emoji + ' ' + ctx.theme.formatters.muted(selected.name);
      }
      return output;
    }

    // Render emoji grid
    const rows = Math.ceil(this.allEmojis.length / this.columns);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < this.columns; col++) {
        const index = row * this.columns + col;
        if (index >= this.allEmojis.length) break;

        const emoji = this.allEmojis[index];
        const isSelected = index === this.selectedIndex;

        if (emoji) {
          if (isSelected) {
            output += ctx.theme.formatters.highlight(`[${emoji.emoji}]`);
          } else {
            output += ` ${emoji.emoji} `;
          }
        }

        output += ' ';
      }
      output += '\n';
    }

    if (this.showNames && status === 'active') {
      const selected = this.allEmojis[this.selectedIndex];
      if (selected) {
        output += '\n' + ctx.theme.formatters.muted(`Name: ${selected.name}`);
      }
    }

    // Help text
    output += '\n\n' + ctx.theme.formatters.muted('Use arrow keys to navigate, Enter to select');

    return output;
  }

  handleInput(key: Key): void {
    if (key.name === 'enter' || key.name === 'return') {
      const selected = this.allEmojis[this.selectedIndex];
      if (selected) {
        this.state.setState((s: any) => ({
          ...s,
          value: selected.emoji,
          status: 'submitted'
        }));
      }
    } else if (key.name === 'up') {
      const newIndex = this.selectedIndex - this.columns;
      if (newIndex >= 0) {
        this.selectedIndex = newIndex;
      }
    } else if (key.name === 'down') {
      const newIndex = this.selectedIndex + this.columns;
      if (newIndex < this.allEmojis.length) {
        this.selectedIndex = newIndex;
      }
    } else if (key.name === 'left') {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
      }
    } else if (key.name === 'right') {
      if (this.selectedIndex < this.allEmojis.length - 1) {
        this.selectedIndex++;
      }
    }
  }

}

/**
 * Emoji plugin implementation
 */
export const emojiPlugin: KitPlugin = {
  name: 'emoji',
  version: '1.0.0',
  description: 'Adds emoji support and emoji picker component',
  author: 'Kit Team',

  components: {
    emojiPicker: {
      name: 'emojiPicker',
      create: (options) => new EmojiPickerPrompt(options),
      factory: async (message, options) => {
        const prompt = new EmojiPickerPrompt({ message, ...options });
        return await prompt.prompt();
      },
    },
  },

  theme: {
    symbols: {
      question: '❓',
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      bullet: '•',
      arrow: '→',
      pointer: '👉',
      checkbox: {
        checked: '☑',
        unchecked: '☐',
        cursor: '❯'
      },
      radio: {
        active: '◉',
        inactive: '◯',
        cursor: '❯'
      },
      spinner: {
        frames: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'],
        interval: 100
      }
    },
  },

  enhance: (kit: any) => {
    /**
     * Get emoji by name
     * @param {string} name - Emoji name
     * @returns {string} Emoji character or name if not found
     */
    kit.emoji = (name: string): string => emojiMap[name] || name;

    /**
     * Check if unicode/emoji is supported
     * @returns {boolean} True if emoji is supported
     */
    kit.hasEmojiSupport = (): boolean => process.platform !== 'win32' || process.env['WT_SESSION'] !== undefined;

    /**
     * Get all available emojis
     * @returns {Record<string, string>} Map of emoji names to characters
     */
    kit.getEmojis = (): Record<string, string> => ({ ...emojiMap });
  },

  hooks: {
    onRegister: () => {
      console.log('Emoji plugin registered! 🎉');
    },

    onActivate: () => {
      console.log('Emoji plugin activated! 🚀');
    },
  },
};