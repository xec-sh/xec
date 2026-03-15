/**
 * 19 - Settings & Configuration
 *
 * Global settings: custom key aliases, withGuide toggle,
 * custom messages, and date localization.
 */
import { setTimeout } from 'node:timers/promises';

import {
  intro, outro, text, confirm, date, spinner, select,
  updateSettings, isCancel, cancel, log, note,
} from '../src/index.js';

async function main() {
  // Configure global settings
  updateSettings({
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
    },
    // Date prompt localization (Spanish example)
    date: {
      monthNames: [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
      ],
      messages: {
        invalidMonth: 'Solo hay 12 meses en un anno',
        invalidDay: (days, month) => `Solo hay ${days} dias en ${month}`,
        afterMin: (min) => `La fecha debe ser posterior al ${min.toISOString().slice(0, 10)}`,
        beforeMax: (max) => `La fecha debe ser anterior al ${max.toISOString().slice(0, 10)}`,
      },
    },
  });

  intro('Settings Demo (WASD navigation enabled)');

  const name = await text({ message: 'Your name?' });
  if (isCancel(name)) { cancel(); process.exit(0); }

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
  if (isCancel(framework)) { cancel(); process.exit(0); }

  // withGuide: false on confirm
  const proceed = await confirm({
    message: 'Continue without guide?',
    withGuide: false,
  });
  if (isCancel(proceed)) { cancel(); process.exit(0); }

  // Date with Spanish localization (configured above)
  const fecha = await date({
    message: 'Selecciona una fecha',
    format: 'DD/MM/YYYY',
  });
  if (isCancel(fecha)) { cancel(); process.exit(0); }

  // Note without guide
  note(`Framework: ${framework}\nDate: ${(fecha as Date).toISOString().slice(0, 10)}`, 'Summary');

  // Spinner uses custom error message from settings
  const s = spinner();
  s.start('Processing');
  await setTimeout(1000);
  s.stop('Done');

  outro('Settings demo complete!');
}

main().catch(console.error);
