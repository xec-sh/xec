/**
 * 06 - Select Key Prompt
 *
 * Instant selection via keyboard shortcuts. Each option is triggered
 * by its explicit single-character key. Supports caseSensitive mode.
 */
import { log, intro, outro, cancel, isCancel, selectKey } from '../src/index.js';

async function main() {
  intro('Select Key Prompt Examples');

  // Basic selectKey - press a single key to select
  const action = await selectKey({
    message: 'What would you like to do?',
    options: [
      { value: 'c', label: 'Create a new project' },
      { value: 'd', label: 'Delete a project' },
      { value: 'u', label: 'Update a project' },
      { value: 'q', label: 'Quit' },
    ],
  });
  if (isCancel(action)) {
    cancel('Cancelled.');
    return;
  }

  // Case-sensitive keys (Shift+key = uppercase)
  const severity = await selectKey({
    message: 'Set log level (case-sensitive)',
    caseSensitive: true,
    options: [
      { value: 'D', label: 'Debug - verbose output', hint: 'Shift+D' },
      { value: 'i', label: 'Info - general messages', hint: 'i' },
      { value: 'w', label: 'Warn - warnings only', hint: 'w' },
      { value: 'E', label: 'Error - errors only', hint: 'Shift+E' },
    ],
  });
  if (isCancel(severity)) {
    cancel('Cancelled.');
    return;
  }

  log.info(`Selected action key: ${action}, Log-level key: ${severity}`);
  outro('Done!');
}

await main();
