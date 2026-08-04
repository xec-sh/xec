import { it, expect, describe, afterEach } from 'vitest';

import prism from '../src/prism/index.js';
import { settings, updateSettings } from '../src/core/utils/index.js';
import { DEFAULT_THEME, type KitTheme } from '../src/core/utils/theme.js';

/**
 * One object carries the kit's visual identity.
 *
 * Before the theme existed the palette was chosen at each call site, and had
 * drifted: prompts focused in cyan, the spinner spun in magenta, log.info
 * dotted in blue, none aware of the others. Restyling the kit meant editing
 * every component; keeping it consistent meant remembering to.
 */
describe('the theme is one switchable object', () => {
  afterEach(() => {
    updateSettings({ theme: { ...DEFAULT_THEME } });
  });

  it('names every role a component needs', () => {
    const roles: (keyof KitTheme)[] = [
      'accent', 'activity', 'success', 'warning', 'error', 'info', 'muted',
    ];

    for (const role of roles) {
      expect(typeof settings.theme[role], role).toBe('function');
    }
  });

  it('restyles one role without resetting the rest', () => {
    updateSettings({ theme: { accent: prism.yellow } });

    expect(settings.theme.accent('x')).toBe(prism.yellow('x'));
    // The six roles that were not named keep their defaults.
    expect(settings.theme.error('x')).toBe(DEFAULT_THEME.error('x'));
    expect(settings.theme.activity('x')).toBe(DEFAULT_THEME.activity('x'));
  });

  it('applies atomically to later renders', () => {
    const before = settings.theme.accent('focus');
    updateSettings({ theme: { accent: prism.red } });
    const after = settings.theme.accent('focus');

    expect(after).not.toBe(before);
    expect(after).toBe(prism.red('focus'));
  });

  it('keeps the brand pair distinct by default', () => {
    // Static focus and live activity must not collapse into one colour:
    // a spinner that looks like a settled step misreads as done.
    expect(DEFAULT_THEME.accent('x')).not.toBe(DEFAULT_THEME.activity('x'));
  });
});
