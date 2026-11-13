/**
 * 19 - Settings & Configuration
 *
 * Global settings: custom key aliases, withGuide toggle,
 * custom messages, and date localization.
 */
import { setTimeout } from 'node:timers/promises';

import {
  log,
  text,
  date,
  note,
  intro,
  outro,
  prism,
  select,
  cancel,
  confirm,
  spinner,
  isCancel,
  settings,
  DEFAULT_THEME,
  updateSettings,
} from '../src/index.js';

async function main() {
  // Configure global settings
  updateSettings({
    // All components share semantic colour roles. Partial overrides preserve other roles.
    theme: { accent: prism.hex('#22d3ee'), activity: prism.hex('#6d3bf5') },
    // Add WASD aliases for navigation
    aliases: {
      w: 'up',
      s: 'down',
      a: 'left',
      d: 'right',
    },
    // Custom cancellation/error messages
    messages: {
      cancel: 'Operation aborted by user',
      error: 'An unexpected error occurred',
      validating: 'Checking the input…',
    },
    // Date prompt localization (Spanish example)
    date: {
      monthNames: [
        'enero',
        'febrero',
        'marzo',
        'abril',
        'mayo',
        'junio',
        'julio',
        'agosto',
        'septiembre',
        'octubre',
        'noviembre',
        'diciembre',
      ],
      messages: {
        invalidMonth: 'Solo hay 12 meses en un año',
        invalidDay: (days, month) => `Solo hay ${days} dias en ${month}`,
        afterMin: (min) => `La fecha debe ser posterior al ${min.toISOString().slice(0, 10)}`,
        beforeMax: (max) => `La fecha debe ser anterior al ${max.toISOString().slice(0, 10)}`,
      },
    },
  });

  intro('Settings Demo (WASD navigation enabled)');

  const name = await text({ message: 'Your name?' });
  if (isCancel(name)) {
    cancel(settings.messages.cancel);
    return;
  }

  // withGuide: false - renders without the guide border
  const framework = await select({
    message: 'Pick a framework',
    withGuide: false,
    options: [
      { value: 'react', label: 'React' },
      { value: 'vue', label: 'Vue' },
      { value: 'svelte', label: 'Svelte' },
    ],
  });
  if (isCancel(framework)) {
    cancel(settings.messages.cancel);
    return;
  }

  // withGuide: false on confirm
  const proceed = await confirm({
    message: 'Continue without guide?',
    withGuide: false,
  });
  if (isCancel(proceed)) {
    cancel(settings.messages.cancel);
    return;
  }

  // Date with Spanish localization (configured above)
  const fecha = await date({
    message: 'Selecciona una fecha',
    initialValue: new Date(),
    format: 'DD/MM/YYYY',
  });
  if (isCancel(fecha)) {
    cancel(settings.messages.cancel);
    return;
  }

  // Note without guide
  note(`Framework: ${framework}\nDate: ${fecha.toISOString().slice(0, 10)}`, 'Summary');

  // Spinner shares the configured activity colour
  const s = spinner();
  s.start('Processing');
  await setTimeout(250);
  s.stop('Done');

  log.info('Plain output can be selected per call, independently of the theme.', {
    accessible: true,
    withGuide: false,
    spacing: 0,
  });
  updateSettings({ theme: DEFAULT_THEME });
  outro('Settings demo complete!');
}

await main();
